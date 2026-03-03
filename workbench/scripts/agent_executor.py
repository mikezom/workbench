from __future__ import annotations

"""
Agent task executor (Module C).

Imported by agent-daemon.py to execute agent tasks.  Manages git worktrees,
invokes the Claude CLI, validates builds, and handles conflict resolution.

Key entry point: execute_task(conn, task)
"""

import json
import logging
import os
import re
import shutil
import sqlite3
import subprocess
import time
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

log = logging.getLogger("agent-executor")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_CONFLICT_ATTEMPTS = 3
MAX_BUILD_FIX_ATTEMPTS = 3
CANCEL_CHECK_INTERVAL = 5  # seconds between cancellation checks
BUILD_TIMEOUT = 300  # seconds

# scripts/ lives inside workbench/ (Next.js root) which lives inside the git
# repo root.  Three levels up: scripts/ → workbench/ → repo-root/.
REPO_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)

# ---------------------------------------------------------------------------
# Executable discovery
# ---------------------------------------------------------------------------


def _find_executable(name: str) -> str:
    """Locate an executable by name.

    The daemon runs via launchd with a minimal PATH, so shutil.which() may
    not find node-installed binaries.  As a fallback we scan all nvm node
    version bin directories, preferring the latest version (reverse sorted).
    """
    # Fast path — already on PATH
    path = shutil.which(name)
    if path:
        return path

    # Fallback — scan nvm installations
    nvm_base = os.path.expanduser("~/.nvm/versions/node")
    if os.path.isdir(nvm_base):
        versions = sorted(os.listdir(nvm_base), reverse=True)
        for version in versions:
            candidate = os.path.join(nvm_base, version, "bin", name)
            if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
                return candidate

    raise FileNotFoundError(
        f"Could not find '{name}' on PATH or under ~/.nvm/versions/node/*/bin/. "
        f"Ensure {name} is installed and accessible."
    )


CLAUDE_BIN = _find_executable("claude")
NPM_BIN = _find_executable("npm")

log.info("Resolved CLAUDE_BIN = %s", CLAUDE_BIN)
log.info("Resolved NPM_BIN   = %s", NPM_BIN)

# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class CancelledError(Exception):
    """Raised when a task is cancelled mid-execution."""


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------


def slugify(title: str) -> str:
    """Convert a title into a URL/branch-safe slug.

    Lowercase, replace non-alphanumeric runs with a single hyphen, strip
    leading/trailing hyphens, and truncate to 50 characters.
    """
    slug = title.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug[:50] or "untitled"


def check_cancelled(conn: sqlite3.Connection, task_id: int) -> bool:
    """Re-read task status from DB. Returns True if 'cancelled'."""
    row = conn.execute(
        "SELECT status FROM agent_tasks WHERE id = ?", (task_id,)
    ).fetchone()
    return row is not None and row["status"] == "cancelled"


def append_output(
    conn: sqlite3.Connection,
    task_id: int,
    output_type: str,
    content: str,
) -> None:
    """Insert a row into agent_task_output and commit."""
    conn.execute(
        "INSERT INTO agent_task_output (task_id, type, content) VALUES (?, ?, ?)",
        (task_id, output_type, content),
    )
    conn.commit()


def _run_git(args: list[str], cwd: str) -> subprocess.CompletedProcess:
    """Run a git command and return the result (caller checks returncode)."""
    cmd = ["git"] + args
    log.debug("git %s  (cwd=%s)", " ".join(args), cwd)
    return subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
    )


# ---------------------------------------------------------------------------
# Worktree management
# ---------------------------------------------------------------------------


def create_worktree(
    repo_root: str, task_id: int, title: str
) -> tuple[str, str]:
    """Create a git worktree for the given task.

    Creates `.worktrees/task-<id>` branching from main as `task/<slug>`.

    Returns:
        (worktree_path, branch_name)
    """
    slug = slugify(title)
    branch_name = f"task/{slug}"
    worktree_dir = os.path.join(repo_root, ".worktrees", f"task-{task_id}")

    log.info(
        "Creating worktree: path=%s branch=%s", worktree_dir, branch_name
    )

    result = _run_git(
        ["worktree", "add", worktree_dir, "-b", branch_name, "main"],
        cwd=repo_root,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Failed to create worktree: {result.stderr.strip()}"
        )

    return worktree_dir, branch_name


def cleanup_worktree(
    repo_root: str, worktree_path: str, branch_name: str
) -> None:
    """Best-effort cleanup of a worktree and its branch.

    Never raises — all errors are logged and swallowed so that cleanup
    failures don't mask the real task outcome.
    """
    # 1. Try to remove the worktree via git
    try:
        _run_git(
            ["worktree", "remove", "--force", worktree_path],
            cwd=repo_root,
        )
    except Exception:
        log.warning(
            "git worktree remove failed for %s — falling back to shutil",
            worktree_path,
            exc_info=True,
        )
        # Fallback: remove the directory and prune
        try:
            if os.path.isdir(worktree_path):
                shutil.rmtree(worktree_path)
            _run_git(["worktree", "prune"], cwd=repo_root)
        except Exception:
            log.warning(
                "Fallback worktree cleanup also failed for %s",
                worktree_path,
                exc_info=True,
            )

    # 2. Delete the branch
    try:
        _run_git(["branch", "-D", branch_name], cwd=repo_root)
    except Exception:
        log.warning(
            "Failed to delete branch %s", branch_name, exc_info=True
        )


# ---------------------------------------------------------------------------
# Claude Code CLI invocation
# ---------------------------------------------------------------------------


def _kill_process(proc: subprocess.Popen) -> None:
    """Terminate a subprocess, escalating to kill if needed.

    Sends SIGTERM first, waits up to 5 seconds, then sends SIGKILL if the
    process is still alive.  Never raises.
    """
    try:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            log.warning("Process %d did not terminate in 5s — killing", proc.pid)
            proc.kill()
            proc.wait()
    except Exception:
        log.warning("Error while killing process", exc_info=True)


def _store_event(
    conn: sqlite3.Connection, task_id: int, event: dict
) -> None:
    """Categorize a stream-json event and store it in the task output table."""
    etype = event.get("type", "")

    if etype == "assistant":
        # event["message"]["content"] may be a list of blocks or a string
        content = event.get("message", {}).get("content", "")
        if isinstance(content, list):
            parts = []
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    parts.append(block.get("text", ""))
            content = "\n".join(parts)
        if content:
            append_output(conn, task_id, "assistant", content)

    elif etype == "result":
        result_text = event.get("result", "")
        if result_text:
            append_output(conn, task_id, "assistant", result_text)
        # Also store cost/duration metadata as a system message
        cost = event.get("cost_usd")
        duration = event.get("duration_ms")
        if cost is not None or duration is not None:
            meta = {}
            if cost is not None:
                meta["cost_usd"] = cost
            if duration is not None:
                meta["duration_ms"] = duration
            append_output(conn, task_id, "system", json.dumps(meta))

    elif etype == "tool_use":
        name = event.get("name", event.get("tool", "unknown"))
        raw_input = json.dumps(event.get("input", ""))
        truncated = raw_input[:500]
        append_output(conn, task_id, "tool", f"[tool: {name}] {truncated}")

    elif etype == "tool_result":
        content = event.get("content", "")
        if isinstance(content, list):
            parts = []
            for block in content:
                if isinstance(block, dict):
                    parts.append(block.get("text", block.get("content", "")))
                else:
                    parts.append(str(block))
            content = "\n".join(parts)
        if not isinstance(content, str):
            content = json.dumps(content)
        append_output(conn, task_id, "tool", content[:2000])

    elif etype == "system":
        text = event.get("message", event.get("content", ""))
        if not text:
            text = json.dumps(event)
        append_output(conn, task_id, "system", text)

    else:
        # Unknown event type — store raw JSON as system
        append_output(conn, task_id, "system", json.dumps(event))


def invoke_claude(
    cwd: str,
    prompt: str,
    conn: sqlite3.Connection,
    task_id: int,
) -> None:
    """Invoke the Claude Code CLI and stream-parse its output.

    Launches ``claude -p <prompt>`` with stream-json output, reads events
    line-by-line, and stores each one via :func:`_store_event`.  Periodically
    checks for task cancellation and kills the subprocess if cancelled.

    Raises:
        CancelledError: If the task is cancelled during execution.
        RuntimeError: If the CLI exits with a non-zero return code.
    """
    cmd = [
        CLAUDE_BIN,
        "-p",
        prompt,
        "--dangerously-skip-permissions",
        "--output-format",
        "stream-json",
        "--verbose",
        "--max-turns",
        "50",
    ]

    # Remove CLAUDECODE from env to prevent nested-session errors
    env = os.environ.copy()
    env.pop("CLAUDECODE", None)

    log.info("Invoking Claude CLI: cwd=%s prompt_len=%d", cwd, len(prompt))
    append_output(conn, task_id, "system", "Invoking Claude Code CLI...")

    proc = subprocess.Popen(
        cmd,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
    )

    last_cancel_check = time.monotonic()

    try:
        for line in proc.stdout:  # type: ignore[union-attr]
            line = line.strip()
            if not line:
                continue

            try:
                event = json.loads(line)
                _store_event(conn, task_id, event)
            except json.JSONDecodeError:
                append_output(conn, task_id, "stderr", line)

            # Periodic cancellation check
            now = time.monotonic()
            if now - last_cancel_check >= CANCEL_CHECK_INTERVAL:
                last_cancel_check = now
                if check_cancelled(conn, task_id):
                    log.info("Task %d cancelled — killing Claude CLI", task_id)
                    _kill_process(proc)
                    raise CancelledError(f"Task {task_id} was cancelled")

        # Wait for process to finish
        proc.wait()

        # Capture any remaining stderr
        stderr_tail = proc.stderr.read() if proc.stderr else ""  # type: ignore[union-attr]
        if stderr_tail and stderr_tail.strip():
            append_output(conn, task_id, "stderr", stderr_tail.strip())

        if proc.returncode != 0:
            raise RuntimeError(
                f"Claude CLI exited with code {proc.returncode}"
            )

    except CancelledError:
        raise
    except Exception:
        _kill_process(proc)
        raise


# ---------------------------------------------------------------------------
# Rebase onto main
# ---------------------------------------------------------------------------


def _is_rebase_in_progress(worktree_path: str) -> bool:
    """Check whether a rebase is currently in progress in the worktree."""
    result = _run_git(["status"], cwd=worktree_path)
    return bool(re.search(r"rebase in progress", result.stdout, re.IGNORECASE))


def rebase_onto_main(
    repo_root: str,
    worktree_path: str,
    branch_name: str,
    conn: sqlite3.Connection,
    task_id: int,
) -> None:
    """Rebase the worktree branch onto main with iterative conflict resolution.

    Fetches the latest refs, then attempts ``git rebase main``.  If conflicts
    arise, invokes Claude up to :data:`MAX_CONFLICT_ATTEMPTS` times to resolve
    them.  If all attempts are exhausted the rebase is aborted and a
    :class:`RuntimeError` is raised.

    Raises:
        CancelledError: If the task is cancelled during conflict resolution.
        RuntimeError: If conflict resolution fails after all attempts.
    """
    # Fetch latest refs
    append_output(conn, task_id, "system", "Fetching latest refs from origin…")
    _run_git(["fetch", "origin"], cwd=repo_root)

    # Attempt rebase
    append_output(conn, task_id, "system", f"Rebasing {branch_name} onto main…")
    result = _run_git(["rebase", "main"], cwd=worktree_path)

    if result.returncode == 0:
        append_output(conn, task_id, "system", "Rebase completed cleanly.")
        log.info("Rebase of %s onto main succeeded without conflicts", branch_name)
        return

    # Conflicts detected — enter resolution loop
    log.warning(
        "Rebase of %s onto main hit conflicts (rc=%d), entering resolution loop",
        branch_name,
        result.returncode,
    )
    append_output(
        conn,
        task_id,
        "system",
        f"Rebase conflicts detected. Attempting resolution (max {MAX_CONFLICT_ATTEMPTS} attempts)…",
    )

    for attempt in range(1, MAX_CONFLICT_ATTEMPTS + 1):
        # Check cancellation
        if check_cancelled(conn, task_id):
            log.info("Task %d cancelled during rebase conflict resolution", task_id)
            _run_git(["rebase", "--abort"], cwd=worktree_path)
            raise CancelledError(f"Task {task_id} was cancelled")

        # Gather context for Claude
        status_result = _run_git(["status"], cwd=worktree_path)
        diff_result = _run_git(["diff"], cwd=worktree_path)

        diff_text = diff_result.stdout[:5000]
        if len(diff_result.stdout) > 5000:
            diff_text += "\n\n… (truncated)"

        conflict_prompt = (
            f"A `git rebase main` on branch `{branch_name}` has produced merge "
            f"conflicts (attempt {attempt}/{MAX_CONFLICT_ATTEMPTS}).\n\n"
            f"## git status\n```\n{status_result.stdout}\n```\n\n"
            f"## git diff\n```\n{diff_text}\n```\n\n"
            "Please resolve ALL conflicts in the listed files:\n"
            "1. Edit each conflicted file to pick the correct resolution.\n"
            "2. `git add` each resolved file.\n"
            "3. Run `git rebase --continue` to proceed.\n\n"
            "Do NOT run `git rebase --abort`."
        )

        append_output(
            conn,
            task_id,
            "system",
            f"Conflict resolution attempt {attempt}/{MAX_CONFLICT_ATTEMPTS}…",
        )

        try:
            invoke_claude(worktree_path, conflict_prompt, conn, task_id)
        except RuntimeError:
            # Claude may exit non-zero even if it resolved the conflicts and
            # ran `git rebase --continue` successfully.  Check the actual
            # rebase state before giving up.
            log.warning(
                "invoke_claude raised RuntimeError during conflict resolution "
                "attempt %d — checking if rebase was resolved anyway",
                attempt,
            )

        # Check if the rebase is still in progress
        if not _is_rebase_in_progress(worktree_path):
            append_output(
                conn,
                task_id,
                "system",
                f"Rebase conflicts resolved on attempt {attempt}.",
            )
            log.info(
                "Rebase conflicts resolved after %d attempt(s)", attempt
            )
            return

    # All attempts exhausted — abort and raise
    log.error(
        "Failed to resolve rebase conflicts after %d attempts — aborting rebase",
        MAX_CONFLICT_ATTEMPTS,
    )
    _run_git(["rebase", "--abort"], cwd=worktree_path)
    append_output(
        conn,
        task_id,
        "system",
        f"Rebase aborted after {MAX_CONFLICT_ATTEMPTS} failed conflict resolution attempts.",
    )
    raise RuntimeError(
        f"Rebase conflict resolution failed after {MAX_CONFLICT_ATTEMPTS} attempts"
    )


# ---------------------------------------------------------------------------
# Build validation
# ---------------------------------------------------------------------------


def run_build(
    worktree_path: str, conn: sqlite3.Connection, task_id: int
) -> None:
    """Run ``npm run build`` and attempt to fix errors iteratively.

    The Next.js project lives in ``<worktree_path>/workbench/``, so the build
    command runs there.  If the build fails, Claude is invoked (in the worktree
    root) with the error output and asked to fix the issues.  Up to
    ``MAX_BUILD_FIX_ATTEMPTS`` rounds are attempted before giving up.
    """
    workbench_dir = os.path.join(worktree_path, "workbench")

    for attempt in range(1, MAX_BUILD_FIX_ATTEMPTS + 1):
        # Check cancellation before each attempt
        if check_cancelled(conn, task_id):
            log.info("Task %d cancelled during build validation", task_id)
            raise CancelledError(f"Task {task_id} was cancelled")

        last_attempt = attempt == MAX_BUILD_FIX_ATTEMPTS

        append_output(
            conn,
            task_id,
            "system",
            f"Running build (attempt {attempt}/{MAX_BUILD_FIX_ATTEMPTS})…",
        )

        try:
            result = subprocess.run(
                [NPM_BIN, "run", "build"],
                cwd=workbench_dir,
                capture_output=True,
                text=True,
                timeout=BUILD_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            log.warning(
                "Build timed out on attempt %d/%d",
                attempt,
                MAX_BUILD_FIX_ATTEMPTS,
            )
            append_output(
                conn,
                task_id,
                "system",
                f"Build timed out after {BUILD_TIMEOUT}s (attempt {attempt}/{MAX_BUILD_FIX_ATTEMPTS}).",
            )
            if last_attempt:
                raise RuntimeError(
                    f"Build timed out after {MAX_BUILD_FIX_ATTEMPTS} attempts"
                )
            continue

        if result.returncode == 0:
            log.info("Build succeeded on attempt %d", attempt)
            append_output(conn, task_id, "system", "Build succeeded.")
            return

        # Build failed — capture output for diagnosis
        error_output = (result.stdout + "\n" + result.stderr).strip()
        if len(error_output) > 5000:
            error_output = error_output[:5000] + "\n\n… (truncated)"

        log.warning(
            "Build failed on attempt %d/%d (rc=%d)",
            attempt,
            MAX_BUILD_FIX_ATTEMPTS,
            result.returncode,
        )
        append_output(
            conn,
            task_id,
            "system",
            f"Build failed (attempt {attempt}/{MAX_BUILD_FIX_ATTEMPTS}):\n{error_output}",
        )

        if not last_attempt:
            fix_prompt = (
                f"The `npm run build` command failed (attempt {attempt}/{MAX_BUILD_FIX_ATTEMPTS}).\n\n"
                f"## Build output\n```\n{error_output}\n```\n\n"
                "Please fix the build errors in the source files.\n"
                "- Focus ONLY on fixing the errors shown above.\n"
                "- Do NOT refactor or change unrelated code.\n"
                "- Do NOT modify configuration files unless the error specifically requires it."
            )
            invoke_claude(worktree_path, fix_prompt, conn, task_id)

    # All attempts exhausted
    raise RuntimeError(
        f"Build failed after {MAX_BUILD_FIX_ATTEMPTS} attempts"
    )


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------


def execute_task(conn: sqlite3.Connection, task: dict) -> None:
    """Execute a full task lifecycle: worktree → Claude → rebase → build.

    On success: returns normally (caller sets status to 'waiting_for_review').
    On cancel: cleans up worktree, raises CancelledError.
    On failure: preserves worktree for debugging, raises the original exception.
    """
    task_id = task["id"]
    prompt = task["prompt"]

    worktree_path = None
    branch_name = None

    try:
        # Step 1: Create worktree
        append_output(conn, task_id, "system", "Creating git worktree...")
        worktree_path, branch_name = create_worktree(REPO_ROOT, task_id, task["title"])

        # Update task record with worktree info
        conn.execute(
            "UPDATE agent_tasks SET branch_name = ?, worktree_path = ? WHERE id = ?",
            (branch_name, worktree_path, task_id),
        )
        conn.commit()
        append_output(conn, task_id, "system",
            f"Worktree: {worktree_path}  Branch: {branch_name}")

        # Step 2: Invoke Claude Code
        invoke_claude(worktree_path, prompt, conn, task_id)

        # Step 3: Rebase onto main
        rebase_onto_main(REPO_ROOT, worktree_path, branch_name, conn, task_id)

        # Step 4: Run build validation
        run_build(worktree_path, conn, task_id)

        append_output(conn, task_id, "system",
            "Execution complete — task ready for review")
        log.info("Task %d execution complete", task_id)

    except CancelledError:
        append_output(conn, task_id, "system", "Task cancelled — cleaning up")
        if worktree_path and branch_name:
            cleanup_worktree(REPO_ROOT, worktree_path, branch_name)
        raise

    except Exception:
        # Preserve worktree on failure for debugging
        if worktree_path:
            append_output(conn, task_id, "system",
                f"Task failed — worktree preserved at {worktree_path} for debugging")
        raise
