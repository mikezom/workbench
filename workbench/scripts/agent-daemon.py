#!/usr/bin/env python3
from __future__ import annotations

"""
Agent polling daemon (Module B).

Polls SQLite for pending agent tasks, acquires a global lock,
executes them (stub for now — Phase 5e replaces with real Claude Code),
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
from agent_executor import CancelledError as ExecutorCancelledError

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
# Cancellation exception
# ---------------------------------------------------------------------------


class CancelledError(Exception):
    pass


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
                            conn, task_id, "waiting_for_review", completed_at=now
                        )
                        log.info("Task %d status -> waiting_for_review", task_id)
                    except (CancelledError, ExecutorCancelledError):
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
