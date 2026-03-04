# Agent Execution Pipeline (Phase 5e) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the stub executor in the agent daemon with a real execution pipeline that creates git worktrees, invokes Claude Code CLI, streams output to the DB, rebases onto main, and validates the build.

**Architecture:** A new `scripts/agent-executor.py` module implements the full task lifecycle. The daemon imports `execute_task()` from it, replacing the stub. Claude Code CLI runs in isolated worktrees with `--output-format stream-json` for structured output parsing. Build validation uses `npm run build`. Conflict resolution and build fixes each get 3 Claude retries.

**Tech Stack:** Python 3.9+ (system Python), sqlite3, subprocess, Claude Code CLI (`claude`), git worktrees, npm

---

## Context

- Repo root: `/Users/ccnas/DEVELOPMENT/workbench/`
- Next.js project: `/Users/ccnas/DEVELOPMENT/workbench/workbench/`
- DB: `/Users/ccnas/DEVELOPMENT/workbench/workbench/data/workbench.db`
- Daemon: `scripts/agent-daemon.py` (has stub `execute_task()` at line 215)
- Worktrees go in: `.worktrees/task-<id>/` (already gitignored)
- Claude CLI: `/Users/ccnas/.nvm/versions/node/v24.14.0/bin/claude` (v2.1.63)
- npm: `/Users/ccnas/.nvm/versions/node/v24.14.0/bin/npm`
- Python: `/usr/bin/python3` (3.9.6 — use `from __future__ import annotations`)
- No test framework — validation is `npm run build`
- The daemon runs via launchd with minimal PATH — executor must find executables

## Important Notes

- Worktree structure mirrors the repo: `.worktrees/task-1/workbench/`, `.worktrees/task-1/scripts/`, etc.
- Claude should run in the worktree root (not `workbench/`), same as a developer would
- `npm run build` runs in `<worktree>/workbench/`
- launchd environment has no nvm — use absolute paths or discover executables
- Unset `CLAUDECODE` env var before invoking `claude` to prevent nested-session error
- Python 3.9: use `from __future__ import annotations`, no `X | Y` syntax without it

---

### Task 1: Create agent-executor.py — scaffolding and worktree management

**Files:**
- Create: `scripts/agent-executor.py`

**Step 1: Create the file with imports, constants, and utility functions**

```python
#!/usr/bin/env python3
from __future__ import annotations

"""
Agent execution pipeline (Module C).

Creates git worktrees, invokes Claude Code CLI, streams output to DB,
rebases onto main, and validates the build.

Imported by agent-daemon.py — not run directly.
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

log = logging.getLogger("agent-executor")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_CONFLICT_ATTEMPTS = 3
MAX_BUILD_FIX_ATTEMPTS = 3
CANCEL_CHECK_INTERVAL = 5  # seconds between cancellation checks during streaming
BUILD_TIMEOUT = 300  # 5 minutes

# ---------------------------------------------------------------------------
# Executable discovery
# ---------------------------------------------------------------------------

# launchd has minimal PATH — find executables at known locations
_NVM_BIN = os.path.expanduser("~/.nvm/versions/node")


def _find_executable(name: str) -> str:
    """Find an executable by name, checking nvm paths and system PATH."""
    # Check if already on PATH
    from shutil import which
    found = which(name)
    if found:
        return found

    # Check nvm installations (use the latest version directory)
    if os.path.isdir(_NVM_BIN):
        versions = sorted(os.listdir(_NVM_BIN), reverse=True)
        for ver in versions:
            candidate = os.path.join(_NVM_BIN, ver, "bin", name)
            if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
                return candidate

    raise FileNotFoundError(
        f"Cannot find '{name}' on PATH or in nvm. "
        f"PATH={os.environ.get('PATH', '')}"
    )


# Resolve once at import time
CLAUDE_BIN = _find_executable("claude")
NPM_BIN = _find_executable("npm")


class CancelledError(Exception):
    pass


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------


def slugify(title: str) -> str:
    """Convert a task title to a git-branch-safe slug."""
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return slug[:50]


def check_cancelled(conn: sqlite3.Connection, task_id: int) -> bool:
    """Check if a task has been cancelled in the DB."""
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
    """Write an output line to the agent_task_output table."""
    conn.execute(
        "INSERT INTO agent_task_output (task_id, type, content) VALUES (?, ?, ?)",
        (task_id, output_type, content),
    )
    conn.commit()


def _run_git(args: list[str], cwd: str) -> subprocess.CompletedProcess:
    """Run a git command and return the result."""
    return subprocess.run(
        ["git"] + args,
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
    """Create a git worktree and branch for a task.

    Returns (worktree_path, branch_name).
    """
    slug = slugify(title)
    branch_name = f"task/{slug}"
    worktree_path = os.path.join(repo_root, ".worktrees", f"task-{task_id}")

    # Ensure .worktrees directory exists
    os.makedirs(os.path.join(repo_root, ".worktrees"), exist_ok=True)

    result = _run_git(
        ["worktree", "add", worktree_path, "-b", branch_name, "main"],
        cwd=repo_root,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Failed to create worktree: {result.stderr.strip()}"
        )

    log.info("Created worktree at %s on branch %s", worktree_path, branch_name)
    return worktree_path, branch_name


def cleanup_worktree(
    repo_root: str, worktree_path: str, branch_name: str
) -> None:
    """Remove a worktree and delete its branch. Best-effort, never raises."""
    # Remove the worktree
    try:
        result = _run_git(
            ["worktree", "remove", worktree_path, "--force"],
            cwd=repo_root,
        )
        if result.returncode != 0:
            log.warning("git worktree remove failed: %s", result.stderr.strip())
            # Manual cleanup fallback
            if os.path.exists(worktree_path):
                shutil.rmtree(worktree_path, ignore_errors=True)
            _run_git(["worktree", "prune"], cwd=repo_root)
    except Exception as e:
        log.warning("Worktree cleanup error: %s", e)

    # Delete the branch
    try:
        _run_git(["branch", "-D", branch_name], cwd=repo_root)
    except Exception as e:
        log.warning("Branch delete error: %s", e)

    log.info("Cleaned up worktree %s and branch %s", worktree_path, branch_name)
```

**Step 2: Verify syntax**

Run: `python3 -c "import ast; ast.parse(open('scripts/agent-executor.py').read()); print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add scripts/agent-executor.py
git commit -m "feat(agent): add agent-executor scaffolding with worktree management"
```

---

### Task 2: Add invoke_claude() — Claude Code CLI invocation with output streaming

**Files:**
- Modify: `scripts/agent-executor.py` (append after cleanup_worktree)

**Step 1: Add the invoke_claude function**

Append this after the worktree management section:

```python
# ---------------------------------------------------------------------------
# Claude Code invocation
# ---------------------------------------------------------------------------


def invoke_claude(
    cwd: str,
    prompt: str,
    conn: sqlite3.Connection,
    task_id: int,
) -> None:
    """Run Claude Code CLI with stream-json output.

    Parses each JSON event line and stores it in agent_task_output.
    Periodically checks for task cancellation.
    Raises CancelledError if cancelled, RuntimeError if Claude exits non-zero.
    """
    cmd = [
        CLAUDE_BIN,
        "-p", prompt,
        "--dangerously-skip-permissions",
        "--output-format", "stream-json",
        "--verbose",
    ]

    # Unset CLAUDECODE to prevent nested-session error
    env = os.environ.copy()
    env.pop("CLAUDECODE", None)

    log.info("Invoking Claude in %s", cwd)
    append_output(conn, task_id, "system", f"Invoking Claude Code CLI...")

    proc = subprocess.Popen(
        cmd,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
    )

    try:
        last_cancel_check = time.time()

        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue

            # Parse the JSON event
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                append_output(conn, task_id, "stderr", line)
                continue

            _store_event(conn, task_id, event)

            # Periodic cancellation check
            now = time.time()
            if now - last_cancel_check >= CANCEL_CHECK_INTERVAL:
                last_cancel_check = now
                if check_cancelled(conn, task_id):
                    _kill_process(proc)
                    raise CancelledError(f"Task {task_id} cancelled")

        proc.wait()

        # Capture any remaining stderr
        stderr = proc.stderr.read()
        if stderr:
            append_output(conn, task_id, "stderr", stderr.strip())

        if proc.returncode != 0:
            raise RuntimeError(
                f"Claude exited with code {proc.returncode}"
            )

        log.info("Claude invocation complete (exit 0)")

    except CancelledError:
        raise
    except Exception:
        _kill_process(proc)
        raise


def _store_event(
    conn: sqlite3.Connection, task_id: int, event: dict
) -> None:
    """Categorize a stream-json event and store it in the DB."""
    event_type = event.get("type", "")

    if event_type == "assistant":
        # Complete assistant message
        message = event.get("message", {})
        content = message.get("content", "")
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    append_output(conn, task_id, "assistant", block["text"])
        elif isinstance(content, str) and content:
            append_output(conn, task_id, "assistant", content)

    elif event_type == "result":
        # Final result
        result_text = event.get("result", "")
        if result_text:
            append_output(conn, task_id, "assistant", result_text)
        cost = event.get("cost_usd")
        duration = event.get("duration_ms")
        if cost is not None or duration is not None:
            meta = f"Cost: ${cost:.4f}" if cost else ""
            if duration:
                meta += f" Duration: {duration/1000:.1f}s"
            append_output(conn, task_id, "system", meta.strip())

    elif event_type == "tool_use":
        # Tool invocation
        tool_name = event.get("tool", "unknown")
        tool_input = event.get("input", "")
        summary = f"[tool: {tool_name}]"
        if isinstance(tool_input, dict):
            # Truncate large inputs
            input_str = json.dumps(tool_input)
            if len(input_str) > 500:
                input_str = input_str[:500] + "..."
            summary += f" {input_str}"
        append_output(conn, task_id, "tool", summary)

    elif event_type == "tool_result":
        # Tool output — can be large, truncate
        content = event.get("content", "")
        if isinstance(content, str) and content:
            if len(content) > 2000:
                content = content[:2000] + "\n... (truncated)"
            append_output(conn, task_id, "tool", content)

    elif event_type == "system":
        # System messages (init, etc.)
        msg = event.get("message", "") or event.get("content", "")
        if msg:
            append_output(conn, task_id, "system", msg)
        else:
            append_output(conn, task_id, "system", json.dumps(event))

    else:
        # Unknown type — store raw
        append_output(conn, task_id, "system", json.dumps(event))


def _kill_process(proc: subprocess.Popen) -> None:
    """Terminate a subprocess, escalating to kill if needed."""
    try:
        proc.terminate()
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)
    except Exception:
        pass
```

**Step 2: Verify syntax**

Run: `python3 -c "import ast; ast.parse(open('scripts/agent-executor.py').read()); print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add scripts/agent-executor.py
git commit -m "feat(agent): add Claude Code CLI invocation with stream-json parsing"
```

---

### Task 3: Add rebase_onto_main() — rebase with iterative conflict resolution

**Files:**
- Modify: `scripts/agent-executor.py` (append after Claude invocation section)

**Step 1: Add the rebase function**

Append after the `_kill_process` function:

```python
# ---------------------------------------------------------------------------
# Rebase onto main
# ---------------------------------------------------------------------------


def _is_rebase_in_progress(worktree_path: str) -> bool:
    """Check if a rebase is in progress in the given worktree."""
    # In a worktree, .git is a file pointing to the real git dir.
    # Use `git status` to detect rebase state reliably.
    result = _run_git(["status"], cwd=worktree_path)
    output = result.stdout.lower()
    return "rebase in progress" in output or "interactive rebase in progress" in output


def rebase_onto_main(
    repo_root: str,
    worktree_path: str,
    branch_name: str,
    conn: sqlite3.Connection,
    task_id: int,
) -> None:
    """Rebase the task branch onto main. Resolve conflicts with Claude (max 3 attempts).

    Raises RuntimeError if conflicts cannot be resolved.
    Raises CancelledError if task is cancelled.
    """
    # Fetch latest main
    _run_git(["fetch", "origin"], cwd=repo_root)

    # Pull main in the main working tree (or just use fetch)
    # The worktree's "main" ref is shared, so fetch is enough.

    # Attempt rebase
    append_output(conn, task_id, "system", "Rebasing onto main...")
    result = _run_git(["rebase", "main"], cwd=worktree_path)

    if result.returncode == 0:
        append_output(conn, task_id, "system", "Rebase succeeded (no conflicts)")
        log.info("Rebase succeeded with no conflicts")
        return

    append_output(
        conn, task_id, "system",
        f"Rebase conflicts detected:\n{result.stderr.strip()}"
    )

    # Iterative conflict resolution
    for attempt in range(1, MAX_CONFLICT_ATTEMPTS + 1):
        if check_cancelled(conn, task_id):
            _run_git(["rebase", "--abort"], cwd=worktree_path)
            raise CancelledError(f"Task {task_id} cancelled during rebase")

        append_output(
            conn, task_id, "system",
            f"Conflict resolution attempt {attempt}/{MAX_CONFLICT_ATTEMPTS}"
        )
        log.info("Conflict resolution attempt %d/%d", attempt, MAX_CONFLICT_ATTEMPTS)

        # Get conflict details
        status = _run_git(["status"], cwd=worktree_path)
        diff = _run_git(["diff"], cwd=worktree_path)

        conflict_prompt = (
            "There are git rebase conflicts that need resolving.\n\n"
            f"## git status\n```\n{status.stdout}\n```\n\n"
            f"## git diff (showing conflict markers)\n```\n{diff.stdout[:5000]}\n```\n\n"
            "Please resolve ALL conflicts:\n"
            "1. Read each conflicted file\n"
            "2. Edit to resolve the conflict (remove conflict markers)\n"
            "3. `git add` each resolved file\n"
            "4. Run `git rebase --continue`\n"
        )

        try:
            invoke_claude(worktree_path, conflict_prompt, conn, task_id)
        except RuntimeError:
            # Claude might fail — check if rebase was resolved anyway
            pass

        if not _is_rebase_in_progress(worktree_path):
            append_output(conn, task_id, "system", "Rebase completed successfully")
            log.info("Rebase completed after %d conflict resolution attempt(s)", attempt)
            return

    # Exhausted attempts — abort rebase
    _run_git(["rebase", "--abort"], cwd=worktree_path)
    raise RuntimeError(
        f"Failed to resolve rebase conflicts after {MAX_CONFLICT_ATTEMPTS} attempts"
    )
```

**Step 2: Verify syntax**

Run: `python3 -c "import ast; ast.parse(open('scripts/agent-executor.py').read()); print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add scripts/agent-executor.py
git commit -m "feat(agent): add rebase-onto-main with iterative conflict resolution"
```

---

### Task 4: Add run_build() — build validation with iterative fix loop

**Files:**
- Modify: `scripts/agent-executor.py` (append after rebase section)

**Step 1: Add the build function**

Append after `rebase_onto_main`:

```python
# ---------------------------------------------------------------------------
# Build validation
# ---------------------------------------------------------------------------


def run_build(
    worktree_path: str,
    conn: sqlite3.Connection,
    task_id: int,
) -> None:
    """Run `npm run build` in the worktree. On failure, invoke Claude to fix (max 3 attempts).

    Raises RuntimeError if build cannot be fixed.
    Raises CancelledError if task is cancelled.
    """
    workbench_dir = os.path.join(worktree_path, "workbench")

    for attempt in range(1, MAX_BUILD_FIX_ATTEMPTS + 1):
        if check_cancelled(conn, task_id):
            raise CancelledError(f"Task {task_id} cancelled during build")

        append_output(
            conn, task_id, "system",
            f"Build attempt {attempt}/{MAX_BUILD_FIX_ATTEMPTS}"
        )
        log.info("Build attempt %d/%d", attempt, MAX_BUILD_FIX_ATTEMPTS)

        try:
            result = subprocess.run(
                [NPM_BIN, "run", "build"],
                cwd=workbench_dir,
                capture_output=True,
                text=True,
                timeout=BUILD_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            append_output(conn, task_id, "system", "Build timed out after 5 minutes")
            if attempt >= MAX_BUILD_FIX_ATTEMPTS:
                raise RuntimeError("Build timed out repeatedly")
            continue

        if result.returncode == 0:
            append_output(conn, task_id, "system", "Build succeeded")
            log.info("Build passed on attempt %d", attempt)
            return

        # Build failed
        build_output = (result.stdout + "\n" + result.stderr).strip()
        # Truncate very long build output
        if len(build_output) > 5000:
            build_output = build_output[:5000] + "\n... (truncated)"

        append_output(
            conn, task_id, "system",
            f"Build failed:\n{build_output}"
        )

        if attempt >= MAX_BUILD_FIX_ATTEMPTS:
            break

        # Ask Claude to fix the build errors
        fix_prompt = (
            "The Next.js build (`npm run build`) failed with these errors:\n\n"
            f"```\n{build_output}\n```\n\n"
            "Please fix the build errors. Focus only on fixing the errors — "
            "do not refactor or add features. After fixing, run `git add` on "
            "changed files and commit with a descriptive message."
        )

        invoke_claude(worktree_path, fix_prompt, conn, task_id)

    raise RuntimeError(
        f"Build failed after {MAX_BUILD_FIX_ATTEMPTS} attempts"
    )
```

**Step 2: Verify syntax**

Run: `python3 -c "import ast; ast.parse(open('scripts/agent-executor.py').read()); print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add scripts/agent-executor.py
git commit -m "feat(agent): add build validation with iterative fix loop"
```

---

### Task 5: Add execute_task() — the full orchestrator

**Files:**
- Modify: `scripts/agent-executor.py` (append at end)

**Step 1: Add the orchestrator function**

Append at the end of the file:

```python
# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------


def execute_task(conn: sqlite3.Connection, task: dict) -> None:
    """Execute a full task lifecycle: worktree → Claude → rebase → build.

    This function replaces the stub in agent-daemon.py.

    On success: status stays 'developing' (caller sets 'waiting_for_review').
    On cancel: cleans up worktree, raises CancelledError.
    On failure: preserves worktree for debugging, raises RuntimeError.
    """
    task_id = task["id"]
    title = task["title"]
    prompt = task["prompt"]
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    worktree_path = None
    branch_name = None

    try:
        # Step 1: Create worktree
        append_output(conn, task_id, "system", "Creating git worktree...")
        worktree_path, branch_name = create_worktree(repo_root, task_id, title)

        # Update task with worktree info
        conn.execute(
            "UPDATE agent_tasks SET branch_name = ?, worktree_path = ? WHERE id = ?",
            (branch_name, worktree_path, task_id),
        )
        conn.commit()

        append_output(
            conn, task_id, "system",
            f"Worktree: {worktree_path}  Branch: {branch_name}"
        )

        # Step 2: Invoke Claude Code
        invoke_claude(worktree_path, prompt, conn, task_id)

        # Step 3: Rebase onto main
        rebase_onto_main(repo_root, worktree_path, branch_name, conn, task_id)

        # Step 4: Run build
        run_build(worktree_path, conn, task_id)

        append_output(
            conn, task_id, "system",
            "Execution complete — task ready for review"
        )
        log.info("Task %d execution complete", task_id)

    except CancelledError:
        append_output(conn, task_id, "system", "Task cancelled — cleaning up")
        if worktree_path and branch_name:
            cleanup_worktree(repo_root, worktree_path, branch_name)
        raise

    except Exception:
        # Preserve worktree on failure for debugging
        if worktree_path:
            append_output(
                conn, task_id, "system",
                f"Task failed — worktree preserved at {worktree_path} for debugging"
            )
        raise
```

**Step 2: Verify syntax**

Run: `python3 -c "import ast; ast.parse(open('scripts/agent-executor.py').read()); print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add scripts/agent-executor.py
git commit -m "feat(agent): add execute_task orchestrator for full pipeline lifecycle"
```

---

### Task 6: Update agent-daemon.py — use the real executor

**Files:**
- Modify: `scripts/agent-daemon.py:1-30` (imports/config), `scripts/agent-daemon.py:210-237` (replace stub)

**Step 1: Add import for agent_executor**

At the top of `agent-daemon.py`, after existing imports (line 22), add:

```python
from agent_executor import execute_task as run_task_pipeline
from agent_executor import CancelledError as ExecutorCancelledError
```

**Step 2: Remove the stub executor function**

Delete the entire stub section (lines 210–237):

```python
# OLD — DELETE THIS:
def execute_task(conn: sqlite3.Connection, task: dict) -> None:
    """Stub executor: sleeps in 1s intervals, checks for cancellation."""
    ...
```

**Step 3: Update the main loop to use the real executor**

In the `main()` function, replace the call to `execute_task(conn, task)` (line 295) with:

```python
run_task_pipeline(conn, task)
```

Also update the `except CancelledError:` to catch both:

```python
except (CancelledError, ExecutorCancelledError):
```

**Step 4: Remove STUB_DURATION_SECONDS config**

Delete line 29:
```python
STUB_DURATION_SECONDS = int(os.environ.get("STUB_DURATION_SECONDS", "10"))
```

And remove it from the startup log message (line 266):
```python
# Change from:
log.info("Poll interval: %ds, Stub duration: %ds", POLL_INTERVAL, STUB_DURATION_SECONDS)
# To:
log.info("Poll interval: %ds", POLL_INTERVAL)
```

**Step 5: Verify syntax of both files**

Run: `python3 -c "import ast; ast.parse(open('scripts/agent-daemon.py').read()); print('OK')"`
Expected: `OK`

**Step 6: Commit**

```bash
git add scripts/agent-daemon.py
git commit -m "feat(agent): wire daemon to real execution pipeline, remove stub"
```

---

### Task 7: Integration smoke test

**Step 1: Verify the daemon can import the executor**

Run from the repo root:
```bash
cd /Users/ccnas/DEVELOPMENT/workbench && python3 -c "
import sys; sys.path.insert(0, 'scripts')
from agent_executor import execute_task, CLAUDE_BIN, NPM_BIN
print('Claude:', CLAUDE_BIN)
print('npm:', NPM_BIN)
print('Import OK')
"
```

Expected: Prints paths to `claude` and `npm`, then `Import OK`.

**Step 2: Test worktree creation and cleanup**

```bash
cd /Users/ccnas/DEVELOPMENT/workbench && python3 -c "
import sys; sys.path.insert(0, 'scripts')
from agent_executor import create_worktree, cleanup_worktree
import os

repo = os.getcwd()
path, branch = create_worktree(repo, 9999, 'smoke test worktree')
print('Created:', path, branch)
assert os.path.isdir(path), 'Worktree not created'

cleanup_worktree(repo, path, branch)
print('Cleaned up')
assert not os.path.isdir(path), 'Worktree not removed'
print('All OK')
"
```

Expected: Creates and cleans up a worktree without errors.

**Step 3: Verify daemon syntax**

```bash
python3 -c "import ast; ast.parse(open('scripts/agent-daemon.py').read()); print('OK')"
```

Expected: `OK`

**Step 4: Commit (if any fixes were needed)**

Only commit if changes were required during testing.
