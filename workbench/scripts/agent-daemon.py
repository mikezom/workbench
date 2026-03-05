#!/usr/bin/env python3
from __future__ import annotations

"""
Agent polling daemon (Module B).

Polls SQLite for pending agent tasks, acquires a global lock,
executes them via agent_executor.py (Module C),
and handles cancellation.

Run directly:  python3 scripts/agent-daemon.py
Or via launchd: launchctl load ~/Library/LaunchAgents/com.workbench.agent-daemon.plist
"""

import logging
import os
import signal
import sqlite3
import sys
import time
import traceback
from datetime import datetime, timedelta, timezone

from agent_executor import execute_task as run_task_pipeline
from agent_executor import resume_task as run_resume_pipeline
from agent_executor import (
    execute_decompose_task as run_decompose_pipeline,
    resume_decompose_task as run_decompose_resume_pipeline,
    retry_decompose_breakdown as run_decompose_retry_pipeline,
    execute_decompose_reflection as run_decompose_reflection_pipeline,
)
from agent_executor import CancelledError, QuestionsAsked

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

POLL_INTERVAL = 5  # seconds between polls
STALE_LOCK_MINUTES = 30
DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "workbench.db",
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("agent-daemon")

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn


def is_locked(conn: sqlite3.Connection) -> bool:
    row = conn.execute("SELECT locked FROM agent_lock WHERE id = 1").fetchone()
    return bool(row and row["locked"])


def acquire_lock(conn: sqlite3.Connection, task_id: int) -> bool:
    """Atomically acquire the global lock. Returns True on success."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    cur = conn.execute(
        "UPDATE agent_lock SET locked = 1, task_id = ?, locked_at = ? "
        "WHERE id = 1 AND locked = 0",
        (task_id, now),
    )
    conn.commit()
    return cur.rowcount > 0


def release_lock(conn: sqlite3.Connection) -> None:
    conn.execute(
        "UPDATE agent_lock SET locked = 0, task_id = NULL, locked_at = NULL "
        "WHERE id = 1"
    )
    conn.commit()


def get_next_pending_task(conn: sqlite3.Connection) -> dict | None:
    """Return the oldest task with status 'waiting_for_dev', or None."""
    row = conn.execute(
        "SELECT * FROM agent_tasks WHERE status = 'waiting_for_dev' "
        "ORDER BY created_at ASC LIMIT 1"
    ).fetchone()
    if row is None:
        return None
    return dict(row)


def get_task_ready_to_resume(conn: sqlite3.Connection) -> dict | None:
    """Return the oldest task with status 'waiting_for_review' where all questions are answered."""
    row = conn.execute(
        """SELECT t.* FROM agent_tasks t
           WHERE t.status = 'waiting_for_review'
           AND NOT EXISTS (
             SELECT 1 FROM agent_task_questions q
             WHERE q.task_id = t.id AND q.answer IS NULL
           )
           AND EXISTS (
             SELECT 1 FROM agent_task_questions q2
             WHERE q2.task_id = t.id
           )
           ORDER BY t.created_at ASC LIMIT 1"""
    ).fetchone()
    if row is None:
        return None
    return dict(row)


def get_decompose_task_to_start(conn: sqlite3.Connection) -> dict | None:
    """Return the oldest decompose task with status 'decompose_understanding'."""
    row = conn.execute(
        """SELECT * FROM agent_tasks
           WHERE task_type = 'decompose'
           AND status = 'decompose_understanding'
           ORDER BY created_at ASC LIMIT 1"""
    ).fetchone()
    if row is None:
        return None
    return dict(row)


def get_decompose_task_ready_to_resume(conn: sqlite3.Connection) -> dict | None:
    """Return decompose task with answered questions."""
    row = conn.execute(
        """SELECT t.* FROM agent_tasks t
           WHERE t.task_type = 'decompose'
           AND t.status = 'decompose_waiting_for_answers'
           AND NOT EXISTS (
             SELECT 1 FROM agent_task_questions q
             WHERE q.task_id = t.id AND q.answer IS NULL
           )
           AND EXISTS (
             SELECT 1 FROM agent_task_questions q2
             WHERE q2.task_id = t.id
           )
           ORDER BY t.created_at ASC LIMIT 1"""
    ).fetchone()
    if row is None:
        return None
    return dict(row)


def get_decompose_task_to_retry(conn: sqlite3.Connection) -> dict | None:
    """Return decompose task rejected by user (has decompose_user_comment)."""
    row = conn.execute(
        """SELECT * FROM agent_tasks
           WHERE task_type = 'decompose'
           AND status = 'decompose_breaking_down'
           AND decompose_user_comment IS NOT NULL
           ORDER BY created_at ASC LIMIT 1"""
    ).fetchone()
    if row is None:
        return None
    return dict(row)


def get_decompose_task_ready_for_reflection(conn: sqlite3.Connection) -> dict | None:
    """Return decompose task where all sub-tasks are completed and commented."""
    row = conn.execute(
        """SELECT t.* FROM agent_tasks t
           WHERE t.task_type = 'decompose'
           AND t.status = 'decompose_waiting_for_completion'
           AND NOT EXISTS (
             SELECT 1 FROM agent_tasks sub
             WHERE sub.parent_task_id = t.id
             AND sub.status NOT IN ('finished', 'failed', 'cancelled')
           )
           AND NOT EXISTS (
             SELECT 1 FROM agent_tasks sub2
             WHERE sub2.parent_task_id = t.id
             AND sub2.user_task_comment IS NULL
             AND sub2.status IN ('finished', 'failed')
           )
           ORDER BY t.created_at ASC LIMIT 1"""
    ).fetchone()
    if row is None:
        return None
    return dict(row)


def update_task_status(
    conn: sqlite3.Connection,
    task_id: int,
    status: str,
    *,
    started_at: str | None = None,
    completed_at: str | None = None,
    error_message: str | None = None,
) -> None:
    sets = ["status = ?"]
    values: list = [status]

    if started_at is not None:
        sets.append("started_at = ?")
        values.append(started_at)
    if completed_at is not None:
        sets.append("completed_at = ?")
        values.append(completed_at)
    if error_message is not None:
        sets.append("error_message = ?")
        values.append(error_message)

    values.append(task_id)
    conn.execute(
        f"UPDATE agent_tasks SET {', '.join(sets)} WHERE id = ?",
        values,
    )
    conn.commit()


def append_output(
    conn: sqlite3.Connection,
    task_id: int,
    output_type: str,
    content: str,
) -> None:
    conn.execute(
        "INSERT INTO agent_task_output (task_id, type, content) VALUES (?, ?, ?)",
        (task_id, output_type, content),
    )
    conn.commit()


def check_cancelled(conn: sqlite3.Connection, task_id: int) -> bool:
    """Re-read task status from DB. Returns True if 'cancelled'."""
    row = conn.execute(
        "SELECT status FROM agent_tasks WHERE id = ?", (task_id,)
    ).fetchone()
    return row is not None and row["status"] == "cancelled"


# ---------------------------------------------------------------------------
# Stale lock recovery
# ---------------------------------------------------------------------------


def recover_stale_lock(conn: sqlite3.Connection) -> None:
    """On startup, release any lock older than STALE_LOCK_MINUTES."""
    row = conn.execute(
        "SELECT locked, task_id, locked_at FROM agent_lock WHERE id = 1"
    ).fetchone()
    if not row or not row["locked"]:
        return

    locked_at_str = row["locked_at"]
    if locked_at_str is None:
        log.warning("Lock held with no locked_at timestamp — force-releasing")
        release_lock(conn)
        return

    try:
        locked_at = datetime.strptime(locked_at_str, "%Y-%m-%d %H:%M:%S").replace(
            tzinfo=timezone.utc
        )
    except ValueError:
        log.warning("Lock held with unparseable locked_at '%s' — force-releasing", locked_at_str)
        release_lock(conn)
        return

    age = datetime.now(timezone.utc) - locked_at
    if age > timedelta(minutes=STALE_LOCK_MINUTES):
        log.warning(
            "Stale lock detected (task_id=%s, locked %s ago) — force-releasing",
            row["task_id"],
            age,
        )
        # Also mark the stale task as failed if it's still 'developing'
        if row["task_id"]:
            stale_task = conn.execute(
                "SELECT status FROM agent_tasks WHERE id = ?", (row["task_id"],)
            ).fetchone()
            if stale_task and stale_task["status"] == "developing":
                now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                update_task_status(
                    conn,
                    row["task_id"],
                    "failed",
                    completed_at=now,
                    error_message="Daemon crashed while executing this task (stale lock recovered)",
                )
                log.warning("Marked stale task %s as failed", row["task_id"])
        release_lock(conn)


# ---------------------------------------------------------------------------
# Signal handling
# ---------------------------------------------------------------------------

running = True


def handle_signal(signum: int, _frame) -> None:
    global running
    sig_name = signal.Signals(signum).name
    log.info("Received %s — shutting down gracefully", sig_name)
    running = False


signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------


def main() -> None:
    global running

    log.info("Agent daemon starting (pid=%d)", os.getpid())
    log.info("DB path: %s", DB_PATH)
    log.info("Poll interval: %ds", POLL_INTERVAL)

    if not os.path.exists(DB_PATH):
        log.error("Database not found at %s — exiting", DB_PATH)
        sys.exit(1)

    conn = get_connection()
    recover_stale_lock(conn)

    log.info("Agent daemon ready — entering poll loop")

    while running:
        try:
            # Check for stale locks on each poll cycle
            recover_stale_lock(conn)

            if not is_locked(conn):
                task = get_next_pending_task(conn)
                if task:
                    task_id = task["id"]
                    log.info("Found pending task %d: %s", task_id, task["title"])

                    if not acquire_lock(conn, task_id):
                        log.warning("Failed to acquire lock for task %d — skipping", task_id)
                        time.sleep(POLL_INTERVAL)
                        continue

                    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                    update_task_status(conn, task_id, "developing", started_at=now)
                    log.info("Task %d status -> developing", task_id)

                    try:
                        run_task_pipeline(conn, task)
                        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                        update_task_status(
                            conn, task_id, "finished", completed_at=now
                        )
                        log.info("Task %d status -> finished", task_id)
                    except QuestionsAsked:
                        update_task_status(conn, task_id, "waiting_for_review")
                        log.info("Task %d status -> waiting_for_review (questions)", task_id)
                    except CancelledError:
                        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                        update_task_status(
                            conn, task_id, "cancelled", completed_at=now
                        )
                        log.info("Task %d status -> cancelled", task_id)
                    except Exception:
                        tb = traceback.format_exc()
                        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                        update_task_status(
                            conn,
                            task_id,
                            "failed",
                            completed_at=now,
                            error_message=tb,
                        )
                        log.error("Task %d failed:\n%s", task_id, tb)
                        append_output(conn, task_id, "system", f"Task failed: {tb}")
                    finally:
                        release_lock(conn)
                        log.info("Lock released")
                else:
                    # No new tasks — check for resumable tasks
                    resume = get_task_ready_to_resume(conn)
                    if resume:
                        resume_id = resume["id"]
                        log.info("Found resumable task %d: %s", resume_id, resume["title"])

                        if not acquire_lock(conn, resume_id):
                            log.warning("Failed to acquire lock for resume task %d", resume_id)
                            time.sleep(POLL_INTERVAL)
                            continue

                        update_task_status(conn, resume_id, "developing")
                        log.info("Task %d status -> developing (resume)", resume_id)

                        try:
                            run_resume_pipeline(conn, resume)
                            now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                            update_task_status(
                                conn, resume_id, "finished", completed_at=now
                            )
                            log.info("Resumed task %d status -> finished", resume_id)
                        except QuestionsAsked:
                            update_task_status(conn, resume_id, "waiting_for_review")
                            log.info("Resumed task %d -> waiting_for_review (more questions)", resume_id)
                        except CancelledError:
                            now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                            update_task_status(
                                conn, resume_id, "cancelled", completed_at=now
                            )
                            log.info("Resumed task %d -> cancelled", resume_id)
                        except Exception:
                            tb = traceback.format_exc()
                            now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                            update_task_status(
                                conn, resume_id, "failed",
                                completed_at=now, error_message=tb,
                            )
                            log.error("Resumed task %d failed:\n%s", resume_id, tb)
                            append_output(conn, resume_id, "system", f"Resume failed: {tb}")
                        finally:
                            release_lock(conn)
                            log.info("Lock released (resume)")

                    # No worker tasks — check for decompose tasks
                    if not resume:
                        decompose = get_decompose_task_to_start(conn)
                        if decompose:
                            decompose_id = decompose["id"]
                            log.info("Found decompose task %d: %s", decompose_id, decompose["title"])

                            if not acquire_lock(conn, decompose_id):
                                log.warning("Failed to acquire lock for decompose task %d", decompose_id)
                                time.sleep(POLL_INTERVAL)
                                continue

                            now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                            update_task_status(conn, decompose_id, "decompose_understanding", started_at=now)
                            log.info("Decompose task %d status -> decompose_understanding", decompose_id)

                            try:
                                run_decompose_pipeline(conn, decompose)
                                update_task_status(conn, decompose_id, "decompose_waiting_for_approval")
                                log.info("Decompose task %d status -> decompose_waiting_for_approval", decompose_id)
                            except QuestionsAsked:
                                update_task_status(conn, decompose_id, "decompose_waiting_for_answers")
                                log.info("Decompose task %d status -> decompose_waiting_for_answers", decompose_id)
                            except CancelledError:
                                now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                                update_task_status(conn, decompose_id, "cancelled", completed_at=now)
                                log.info("Decompose task %d status -> cancelled", decompose_id)
                            except Exception:
                                tb = traceback.format_exc()
                                now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                                update_task_status(
                                    conn, decompose_id, "failed",
                                    completed_at=now, error_message=tb,
                                )
                                log.error("Decompose task %d failed:\n%s", decompose_id, tb)
                                append_output(conn, decompose_id, "system", f"Decompose failed: {tb}")
                            finally:
                                release_lock(conn)
                                log.info("Lock released (decompose)")

                        # Check for decompose tasks ready to resume
                        if not decompose:
                            decompose_resume = get_decompose_task_ready_to_resume(conn)
                            if decompose_resume:
                                resume_id = decompose_resume["id"]
                                log.info("Found decompose task to resume %d", resume_id)

                                if not acquire_lock(conn, resume_id):
                                    log.warning("Failed to acquire lock for decompose resume %d", resume_id)
                                    time.sleep(POLL_INTERVAL)
                                    continue

                                update_task_status(conn, resume_id, "decompose_breaking_down")
                                log.info("Decompose task %d status -> decompose_breaking_down (resume)", resume_id)

                                try:
                                    run_decompose_resume_pipeline(conn, decompose_resume)
                                    update_task_status(conn, resume_id, "decompose_waiting_for_approval")
                                    log.info("Decompose task %d status -> decompose_waiting_for_approval", resume_id)
                                except QuestionsAsked:
                                    update_task_status(conn, resume_id, "decompose_waiting_for_answers")
                                    log.info("Decompose task %d -> decompose_waiting_for_answers (more questions)", resume_id)
                                except CancelledError:
                                    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                                    update_task_status(conn, resume_id, "cancelled", completed_at=now)
                                    log.info("Decompose task %d -> cancelled", resume_id)
                                except Exception:
                                    tb = traceback.format_exc()
                                    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                                    update_task_status(
                                        conn, resume_id, "failed",
                                        completed_at=now, error_message=tb,
                                    )
                                    log.error("Decompose resume %d failed:\n%s", resume_id, tb)
                                    append_output(conn, resume_id, "system", f"Decompose resume failed: {tb}")
                                finally:
                                    release_lock(conn)
                                    log.info("Lock released (decompose resume)")

                            # Check for decompose tasks to retry (user rejected breakdown)
                            if not decompose_resume:
                                decompose_retry = get_decompose_task_to_retry(conn)
                                if decompose_retry:
                                    retry_id = decompose_retry["id"]
                                    log.info("Found decompose task to retry %d", retry_id)

                                    if not acquire_lock(conn, retry_id):
                                        log.warning("Failed to acquire lock for decompose retry %d", retry_id)
                                        time.sleep(POLL_INTERVAL)
                                        continue

                                    log.info("Decompose task %d retrying breakdown", retry_id)

                                    try:
                                        user_comment = decompose_retry["decompose_user_comment"]
                                        run_decompose_retry_pipeline(conn, decompose_retry, user_comment)
                                        update_task_status(conn, retry_id, "decompose_waiting_for_approval")
                                        log.info("Decompose task %d status -> decompose_waiting_for_approval (retry)", retry_id)
                                    except CancelledError:
                                        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                                        update_task_status(conn, retry_id, "cancelled", completed_at=now)
                                        log.info("Decompose task %d -> cancelled", retry_id)
                                    except Exception:
                                        tb = traceback.format_exc()
                                        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                                        update_task_status(
                                            conn, retry_id, "failed",
                                            completed_at=now, error_message=tb,
                                        )
                                        log.error("Decompose retry %d failed:\n%s", retry_id, tb)
                                        append_output(conn, retry_id, "system", f"Decompose retry failed: {tb}")
                                    finally:
                                        release_lock(conn)
                                        log.info("Lock released (decompose retry)")

                                # Check for decompose tasks ready for reflection
                                if not decompose_retry:
                                    decompose_reflect = get_decompose_task_ready_for_reflection(conn)
                                    if decompose_reflect:
                                        reflect_id = decompose_reflect["id"]
                                        log.info("Found decompose task ready for reflection %d", reflect_id)

                                        if not acquire_lock(conn, reflect_id):
                                            log.warning("Failed to acquire lock for decompose reflection %d", reflect_id)
                                            time.sleep(POLL_INTERVAL)
                                            continue

                                        update_task_status(conn, reflect_id, "decompose_reflecting")
                                        log.info("Decompose task %d status -> decompose_reflecting", reflect_id)

                                        try:
                                            run_decompose_reflection_pipeline(conn, decompose_reflect)
                                            # Check if reflection wants to retry or complete
                                            task_after = conn.execute(
                                                "SELECT decompose_user_comment FROM agent_tasks WHERE id = ?",
                                                (reflect_id,)
                                            ).fetchone()
                                            if task_after and task_after["decompose_user_comment"]:
                                                # Retry needed - loop back to understanding
                                                update_task_status(conn, reflect_id, "decompose_understanding")
                                                log.info("Decompose task %d -> decompose_understanding (retry from reflection)", reflect_id)
                                            else:
                                                # Complete
                                                now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                                                update_task_status(conn, reflect_id, "decompose_complete", completed_at=now)
                                                log.info("Decompose task %d status -> decompose_complete", reflect_id)
                                        except CancelledError:
                                            now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                                            update_task_status(conn, reflect_id, "cancelled", completed_at=now)
                                            log.info("Decompose task %d -> cancelled", reflect_id)
                                        except Exception:
                                            tb = traceback.format_exc()
                                            now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                                            update_task_status(
                                                conn, reflect_id, "failed",
                                                completed_at=now, error_message=tb,
                                            )
                                            log.error("Decompose reflection %d failed:\n%s", reflect_id, tb)
                                            append_output(conn, reflect_id, "system", f"Decompose reflection failed: {tb}")
                                        finally:
                                            release_lock(conn)
                                            log.info("Lock released (decompose reflection)")

        except Exception:
            log.error("Unexpected error in poll loop:\n%s", traceback.format_exc())

        # Sleep in short intervals so we can respond to signals quickly
        for _ in range(POLL_INTERVAL):
            if not running:
                break
            time.sleep(1)

    # Clean shutdown
    conn.close()
    log.info("Agent daemon stopped")


if __name__ == "__main__":
    main()
