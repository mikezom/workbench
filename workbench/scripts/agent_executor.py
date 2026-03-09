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


class QuestionsAsked(Exception):
    """Raised when the agent wrote questions.json and needs user input."""


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


def commit_uncommitted_changes(
    worktree_path: str,
    conn: sqlite3.Connection,
    task_id: int,
) -> bool:
    """Commit any uncommitted changes left by the agent.

    After Claude CLI finishes, it may have edited files without committing.
    This function checks for staged or unstaged changes and commits them
    so they aren't lost during rebase/merge.

    Returns True if a commit was created, False if the working tree was clean.
    """
    # Check for any changes (staged or unstaged, including untracked)
    status = _run_git(["status", "--porcelain"], cwd=worktree_path)
    if status.returncode != 0:
        log.warning("git status failed in %s: %s", worktree_path, status.stderr)
        return False

    # Filter out CLAUDE.md (injected by us, not part of agent work)
    lines = [
        l for l in status.stdout.strip().splitlines()
        if l and not l.strip().endswith("CLAUDE.md")
    ]
    if not lines:
        return False

    log.warning(
        "Agent left %d uncommitted change(s) — auto-committing", len(lines)
    )
    append_output(
        conn, task_id, "system",
        f"Agent left uncommitted changes — auto-committing {len(lines)} file(s)",
    )

    # Stage all changes (except CLAUDE.md)
    _run_git(["add", "--all"], cwd=worktree_path)
    # Unstage CLAUDE.md if it got added
    _run_git(["reset", "HEAD", "CLAUDE.md"], cwd=worktree_path)

    # Commit
    result = _run_git(
        ["commit", "-m", "agent: auto-commit uncommitted changes"],
        cwd=worktree_path,
    )
    if result.returncode != 0:
        log.error("Auto-commit failed: %s", result.stderr.strip())
        append_output(conn, task_id, "system",
            f"Auto-commit failed: {result.stderr.strip()}")
        return False

    log.info("Auto-committed uncommitted changes in %s", worktree_path)
    return True


# ---------------------------------------------------------------------------
# Worktree management
# ---------------------------------------------------------------------------


def create_worktree(
    repo_root: str, task_id: int, title: str
) -> tuple[str, str]:
    """Create a git worktree for the given task.

    Creates `.worktrees/task-<id>` branching from main as `task/<slug>`.
    If the branch name already exists, appends the task ID to make it unique.

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

    # If branch already exists, try with task ID suffix
    if result.returncode != 0 and "already exists" in result.stderr.lower():
        log.warning(
            "Branch %s already exists, retrying with task ID suffix", branch_name
        )
        branch_name = f"task/{slug}-{task_id}"
        log.info("Retrying with branch name: %s", branch_name)

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


def symlink_node_modules(repo_root: str, worktree_path: str) -> None:
    """Symlink node_modules from the main checkout into the worktree.

    Avoids a full ``npm install`` in every worktree by reusing the
    already-installed modules from the main workbench/ directory.
    """
    src = os.path.join(repo_root, "workbench", "node_modules")
    dst = os.path.join(worktree_path, "workbench", "node_modules")

    if not os.path.isdir(src):
        log.warning("Main node_modules not found at %s — skipping symlink", src)
        return

    # Remove existing node_modules in the worktree (if any) before linking
    if os.path.isdir(dst) and not os.path.islink(dst):
        shutil.rmtree(dst)
        log.info("Removed existing node_modules dir at %s", dst)
    elif os.path.islink(dst):
        os.remove(dst)

    os.symlink(src, dst)
    log.info("Symlinked node_modules: %s -> %s", dst, src)


def inject_claude_md(worktree_path: str, agent_name: str) -> None:
    """Inject an agent's CLAUDE.md into a worktree root.

    Claude Code auto-discovers CLAUDE.md files in the working directory.
    This function reads the agent's persona from the agent section
    (shared-data/agent/<name>/CLAUDE.md) and writes it to the worktree root.

    Args:
        worktree_path: Path to the worktree root.
        agent_name: Name of the agent (e.g., "worker", "decompose").
    """
    from agent_model import read_agent_persona

    persona_content = read_agent_persona(agent_name)
    dst = os.path.join(worktree_path, "CLAUDE.md")

    with open(dst, "w", encoding="utf-8") as f:
        f.write(persona_content)

    log.info("Injected agent '%s' CLAUDE.md into worktree at %s", agent_name, dst)


def inject_agent_context(worktree_path: str, agent_name: str) -> None:
    """Inject complete agent context: CLAUDE.md, memory, and skills.

    Creates the .claude directory structure in the worktree and copies:
    - CLAUDE.md to worktree root
    - REFLECTION.md to .claude/projects/-worktree-path/memory/MEMORY.md
    - skills/ to .claude/skills/

    This gives the agent access to its persona, memory, and capabilities.

    Args:
        worktree_path: Path to the worktree root.
        agent_name: Name of the agent (e.g., "interactive-study").
    """
    from agent_model import (
        read_agent_persona,
        read_agent_memory,
        get_agent_dir,
        get_agent_skills_dir,
    )

    # 1. Inject CLAUDE.md to worktree root
    persona_content = read_agent_persona(agent_name)
    claude_md_path = os.path.join(worktree_path, "CLAUDE.md")
    with open(claude_md_path, "w", encoding="utf-8") as f:
        f.write(persona_content)
    log.info("Injected CLAUDE.md for agent '%s'", agent_name)

    # 2. Inject memory (REFLECTION.md) to .claude/projects/.../memory/MEMORY.md
    memory_content = read_agent_memory(agent_name)
    if memory_content:
        # Create project-specific memory directory
        # Claude Code expects memory at .claude/projects/<project-path>/memory/
        project_slug = worktree_path.replace("/", "-").lstrip("-")
        memory_dir = os.path.join(
            worktree_path, ".claude", "projects", project_slug, "memory"
        )
        os.makedirs(memory_dir, exist_ok=True)

        memory_file = os.path.join(memory_dir, "MEMORY.md")
        with open(memory_file, "w", encoding="utf-8") as f:
            f.write(memory_content)
        log.info("Injected memory for agent '%s' to %s", agent_name, memory_file)

    # 3. Copy skills directory to .claude/skills/
    agent_skills_dir = get_agent_skills_dir(agent_name)
    if os.path.isdir(agent_skills_dir):
        worktree_skills_dir = os.path.join(worktree_path, ".claude", "skills")

        # Remove existing skills directory if present
        if os.path.exists(worktree_skills_dir):
            shutil.rmtree(worktree_skills_dir)

        # Copy entire skills directory
        shutil.copytree(agent_skills_dir, worktree_skills_dir)
        log.info("Copied skills for agent '%s' to %s", agent_name, worktree_skills_dir)
    else:
        log.info("No skills directory found for agent '%s'", agent_name)


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
        # NOTE: Don't store result_text as 'assistant' — the 'assistant' event
        # already captured the same content during streaming. Storing it again
        # causes duplicate messages in interactive-study chat.
        # Only store cost/duration metadata as a system message.
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
# Merge into main
# ---------------------------------------------------------------------------


def merge_into_main(
    repo_root: str,
    worktree_path: str,
    branch_name: str,
    conn: sqlite3.Connection,
    task_id: int,
) -> str | None:
    """Merge the task branch into main and clean up.

    Returns the merge commit SHA on success, or None if merge fails.
    Cleans up the worktree and branch after merging.
    """
    append_output(conn, task_id, "system", f"Merging {branch_name} into main...")

    # Record HEAD before merge so we can detect no-op merges
    pre_merge = _run_git(["rev-parse", "HEAD"], cwd=repo_root)
    pre_merge_sha = pre_merge.stdout.strip() if pre_merge.returncode == 0 else ""

    # Checkout main in the repo root
    result = _run_git(["checkout", "main"], cwd=repo_root)
    if result.returncode != 0:
        log.error("Failed to checkout main: %s", result.stderr.strip())
        append_output(conn, task_id, "system",
            f"Failed to checkout main: {result.stderr.strip()}")
        return None

    # Merge the task branch
    result = _run_git(["merge", branch_name], cwd=repo_root)
    if result.returncode != 0:
        log.error("Failed to merge %s into main: %s", branch_name, result.stderr.strip())
        append_output(conn, task_id, "system",
            f"Merge failed: {result.stderr.strip()}")
        _run_git(["merge", "--abort"], cwd=repo_root)
        return None

    # Get the merge commit SHA
    result = _run_git(["rev-parse", "HEAD"], cwd=repo_root)
    commit_sha = result.stdout.strip() if result.returncode == 0 else None

    # Detect no-op merge (HEAD unchanged = "Already up to date")
    if commit_sha and commit_sha == pre_merge_sha:
        log.error(
            "Merge was a no-op — branch %s has no new commits relative to main",
            branch_name,
        )
        append_output(conn, task_id, "system",
            f"Merge was a no-op — {branch_name} has no new commits. "
            "The agent likely failed to commit its changes.")
        return None

    append_output(conn, task_id, "system",
        f"Merged into main (commit: {commit_sha[:7] if commit_sha else 'unknown'})")

    # Clean up worktree and branch
    cleanup_worktree(repo_root, worktree_path, branch_name)
    append_output(conn, task_id, "system", "Cleaned up worktree and branch.")

    return commit_sha


# ---------------------------------------------------------------------------
# Questions detection
# ---------------------------------------------------------------------------

QUESTIONS_FILE = "questions.json"


def check_questions(worktree_path: str) -> list[dict] | None:
    """Check for a questions.json file in the worktree root.

    Returns parsed questions list if found and valid, None otherwise.
    Validates that each question has id, question, and options (2-4 items).
    """
    qpath = os.path.join(worktree_path, QUESTIONS_FILE)
    if not os.path.isfile(qpath):
        return None

    try:
        with open(qpath) as f:
            questions = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        log.warning("Failed to parse %s: %s", qpath, e)
        return None

    if not isinstance(questions, list) or len(questions) == 0:
        log.warning("questions.json is empty or not a list")
        return None

    # Validate structure
    validated = []
    for i, q in enumerate(questions):
        if not isinstance(q, dict):
            log.warning("Question %d is not a dict — skipping", i)
            continue
        qid = q.get("id", f"q{i+1}")
        question = q.get("question", "")
        options = q.get("options", [])
        if not question or not isinstance(options, list) or len(options) < 2:
            log.warning("Question %d has invalid structure — skipping", i)
            continue
        validated.append({"id": str(qid), "question": question, "options": options})

    return validated if validated else None


def save_questions_to_db(
    conn: sqlite3.Connection, task_id: int, questions: list[dict]
) -> None:
    """Store parsed questions in the agent_task_questions table."""
    for q in questions:
        conn.execute(
            "INSERT INTO agent_task_questions (task_id, question_id, question, options) "
            "VALUES (?, ?, ?, ?)",
            (task_id, q["id"], q["question"], json.dumps(q["options"])),
        )
    conn.commit()
    log.info("Saved %d questions for task %d", len(questions), task_id)


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------


def execute_task(conn: sqlite3.Connection, task: dict) -> None:
    """Execute a full task lifecycle: worktree -> Claude -> rebase -> build -> merge.

    On success: merges into main, cleans up, returns normally.
    On questions: stores questions, raises QuestionsAsked (worktree preserved).
    On cancel: cleans up worktree, raises CancelledError.
    On failure: preserves worktree for debugging, raises the original exception.
    """
    task_id = task["id"]

    # Guard: only worker tasks should use this pipeline
    task_type = task.get("task_type") or "worker"
    if task_type != "worker":
        raise RuntimeError(
            f"execute_task called for task_type='{task_type}' — "
            f"only 'worker' tasks are supported by this pipeline"
        )

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

        # Step 1b: Inject working agent CLAUDE.md
        inject_claude_md(worktree_path, "worker")

        # Step 1c: Symlink node_modules from main checkout
        symlink_node_modules(REPO_ROOT, worktree_path)

        # Step 2: Invoke Claude Code
        invoke_claude(worktree_path, prompt, conn, task_id)

        # Step 2b: Auto-commit any uncommitted changes left by the agent
        commit_uncommitted_changes(worktree_path, conn, task_id)

        # Step 2c: Check for clarification questions
        questions = check_questions(worktree_path)
        if questions:
            append_output(conn, task_id, "system",
                f"Agent asked {len(questions)} clarification question(s) — awaiting user answers")
            save_questions_to_db(conn, task_id, questions)
            raise QuestionsAsked(f"Task {task_id} has {len(questions)} questions")

        # Step 3: Rebase onto main
        rebase_onto_main(REPO_ROOT, worktree_path, branch_name, conn, task_id)

        # Step 4: Run build validation
        run_build(worktree_path, conn, task_id)

        # Step 5: Merge into main and clean up
        commit_sha = merge_into_main(
            REPO_ROOT, worktree_path, branch_name, conn, task_id
        )
        if not commit_sha:
            raise RuntimeError(
                "Merge produced no changes — agent may have failed to modify any files"
            )
        conn.execute(
            "UPDATE agent_tasks SET commit_id = ? WHERE id = ?",
            (commit_sha, task_id),
        )
        conn.commit()

        append_output(conn, task_id, "system",
            "Execution complete — task merged and finished")
        log.info("Task %d execution complete, merged into main", task_id)

    except CancelledError:
        append_output(conn, task_id, "system", "Task cancelled — cleaning up")
        if worktree_path and branch_name:
            cleanup_worktree(REPO_ROOT, worktree_path, branch_name)
        raise

    except QuestionsAsked:
        # Preserve worktree, don't clean up — will resume after answers
        raise

    except Exception:
        # Preserve worktree on failure for debugging
        if worktree_path:
            append_output(conn, task_id, "system",
                f"Task failed — worktree preserved at {worktree_path} for debugging")
        raise


def resume_task(conn: sqlite3.Connection, task: dict) -> None:
    """Resume a task after the user answered clarification questions.

    Reads answered questions from DB, formats them as context, re-invokes
    Claude CLI, then continues the pipeline (rebase -> build -> merge).
    Can raise QuestionsAsked again if Claude asks more questions.
    """
    task_id = task["id"]
    worktree_path = task["worktree_path"]
    branch_name = task["branch_name"]

    if not worktree_path or not branch_name:
        raise RuntimeError(
            f"Task {task_id} has no worktree_path or branch_name — cannot resume"
        )

    if not os.path.isdir(worktree_path):
        raise RuntimeError(
            f"Worktree {worktree_path} does not exist — cannot resume"
        )

    try:
        # Step 1: Read answered questions
        rows = conn.execute(
            "SELECT question_id, question, answer FROM agent_task_questions "
            "WHERE task_id = ? ORDER BY id ASC",
            (task_id,),
        ).fetchall()

        qa_lines = []
        for row in rows:
            qa_lines.append(f"Q: {row['question']}\nA: {row['answer']}")
        qa_context = "\n\n".join(qa_lines)

        # Step 2: Delete questions.json from worktree
        qpath = os.path.join(worktree_path, QUESTIONS_FILE)
        if os.path.isfile(qpath):
            os.remove(qpath)

        # Step 3: Build resumed prompt
        original_prompt = task["prompt"]
        resumed_prompt = (
            f"{original_prompt}\n\n"
            f"---\n\n"
            f"## Previous Clarification Q&A\n\n"
            f"You previously asked clarification questions. Here are the user's answers:\n\n"
            f"{qa_context}\n\n"
            f"Continue with the task using these answers. Do not ask the same questions again."
        )

        append_output(conn, task_id, "system",
            f"Resuming task with {len(rows)} answered question(s)...")

        # Step 4: Re-inject CLAUDE.md (in case worktree was modified)
        inject_claude_md(worktree_path, "worker")

        # Step 5: Re-invoke Claude Code
        invoke_claude(worktree_path, resumed_prompt, conn, task_id)

        # Step 5b: Auto-commit any uncommitted changes left by the agent
        commit_uncommitted_changes(worktree_path, conn, task_id)

        # Step 6: Check for new questions
        questions = check_questions(worktree_path)
        if questions:
            append_output(conn, task_id, "system",
                f"Agent asked {len(questions)} more question(s) — awaiting user answers")
            # Clear old questions and save new ones
            conn.execute(
                "DELETE FROM agent_task_questions WHERE task_id = ?",
                (task_id,),
            )
            save_questions_to_db(conn, task_id, questions)
            raise QuestionsAsked(f"Task {task_id} has {len(questions)} new questions")

        # Step 7: Rebase onto main
        rebase_onto_main(REPO_ROOT, worktree_path, branch_name, conn, task_id)

        # Step 8: Run build validation
        run_build(worktree_path, conn, task_id)

        # Step 9: Merge into main and clean up
        commit_sha = merge_into_main(
            REPO_ROOT, worktree_path, branch_name, conn, task_id
        )
        if not commit_sha:
            raise RuntimeError(
                "Merge produced no changes — agent may have failed to modify any files"
            )
        conn.execute(
            "UPDATE agent_tasks SET commit_id = ? WHERE id = ?",
            (commit_sha, task_id),
        )
        conn.commit()

        append_output(conn, task_id, "system",
            "Resumed task complete — merged and finished")
        log.info("Resumed task %d complete, merged into main", task_id)

    except CancelledError:
        append_output(conn, task_id, "system", "Task cancelled — cleaning up")
        if worktree_path and branch_name:
            cleanup_worktree(REPO_ROOT, worktree_path, branch_name)
        raise

    except QuestionsAsked:
        # Preserve worktree — will resume after more answers
        raise

    except Exception:
        if worktree_path:
            append_output(conn, task_id, "system",
                f"Resumed task failed — worktree preserved at {worktree_path}")
        raise


# ---------------------------------------------------------------------------
# Decompose agent execution
# ---------------------------------------------------------------------------




def check_decompose_questions(repo_root: str) -> list[dict] | None:
    """Check for decompose-questions.json in the repo root.

    Returns:
        List of question dicts if found, None otherwise.
    """
    questions_path = os.path.join(repo_root, "decompose-questions.json")
    if not os.path.isfile(questions_path):
        return None

    with open(questions_path, "r", encoding="utf-8") as f:
        questions = json.load(f)

    log.info("Found %d decompose question(s)", len(questions))
    return questions


def check_breakdown(repo_root: str) -> list[dict] | None:
    """Check for breakdown.json in the repo root.

    Returns:
        List of task dicts if found, None otherwise.
    """
    breakdown_path = os.path.join(repo_root, "breakdown.json")
    if not os.path.isfile(breakdown_path):
        return None

    with open(breakdown_path, "r", encoding="utf-8") as f:
        breakdown = json.load(f)

    log.info("Found breakdown with %d sub-task(s)", len(breakdown))
    return breakdown


def check_reflection_result(repo_root: str) -> dict | None:
    """Check for reflection-complete.json or reflection-retry.json.

    Returns:
        Dict with reflection result if found, None otherwise.
    """
    complete_path = os.path.join(repo_root, "reflection-complete.json")
    retry_path = os.path.join(repo_root, "reflection-retry.json")

    if os.path.isfile(complete_path):
        with open(complete_path, "r", encoding="utf-8") as f:
            result = json.load(f)
        log.info("Found reflection-complete.json")
        return {"type": "complete", "data": result}

    if os.path.isfile(retry_path):
        with open(retry_path, "r", encoding="utf-8") as f:
            result = json.load(f)
        log.info("Found reflection-retry.json")
        return {"type": "retry", "data": result}

    return None


def execute_decompose_task(conn: sqlite3.Connection, task: dict) -> None:
    """Execute a decompose task: understand objective and create breakdown.

    This handles Phase 1 (understand) and Phase 2 (breakdown).
    The agent runs in an isolated worktree, just like worker agents.

    On success: stores breakdown, transitions to waiting_for_approval.
    On questions: stores questions, raises QuestionsAsked (worktree preserved).
    On cancel: cleans up worktree, raises CancelledError.
    On failure: preserves worktree for debugging, raises the original exception.
    """
    task_id = task["id"]
    prompt = task["prompt"]

    worktree_path = None
    branch_name = None

    try:
        # Step 1: Create worktree
        append_output(conn, task_id, "system", "Starting decompose agent...")
        worktree_path, branch_name = create_worktree(
            REPO_ROOT, task_id, task.get("title") or f"decompose-{task_id}"
        )
        conn.execute(
            "UPDATE agent_tasks SET branch_name = ?, worktree_path = ? WHERE id = ?",
            (branch_name, worktree_path, task_id),
        )
        conn.commit()

        # Step 2: Inject decompose CLAUDE.md
        inject_claude_md(worktree_path, "decompose")

        # Step 3: Invoke Claude Code in worktree
        invoke_claude(worktree_path, prompt, conn, task_id)

        # Step 4: Check for breakdown first (takes priority over questions)
        breakdown = check_breakdown(worktree_path)
        if breakdown:
            # Breakdown exists - store it and transition to approval
            conn.execute(
                "UPDATE agent_tasks SET decompose_breakdown = ? WHERE id = ?",
                (json.dumps(breakdown), task_id),
            )
            conn.commit()

            append_output(conn, task_id, "system",
                f"Breakdown created with {len(breakdown)} sub-task(s) — awaiting user approval")
            log.info("Decompose task %d created breakdown with %d sub-tasks", task_id, len(breakdown))

            # Cleanup worktree (breakdown is stored in DB, no code to merge)
            cleanup_worktree(REPO_ROOT, worktree_path, branch_name)
            return

        # Step 5: Check for questions (only if no breakdown)
        questions = check_decompose_questions(worktree_path)
        if questions:
            append_output(conn, task_id, "system",
                f"Decompose agent asked {len(questions)} clarification question(s)")
            save_questions_to_db(conn, task_id, questions)
            raise QuestionsAsked(f"Decompose task {task_id} has {len(questions)} questions")

        # Step 6: Neither breakdown nor questions found
        raise RuntimeError("Decompose agent did not produce breakdown.json or questions")

    except CancelledError:
        append_output(conn, task_id, "system", "Decompose task cancelled")
        if worktree_path and branch_name:
            cleanup_worktree(REPO_ROOT, worktree_path, branch_name)
        raise

    except QuestionsAsked:
        # Preserve worktree for resume
        raise

    except Exception:
        append_output(conn, task_id, "system", "Decompose task failed")
        if worktree_path:
            append_output(conn, task_id, "system",
                f"Worktree preserved at {worktree_path} for debugging")
        raise


def resume_decompose_task(conn: sqlite3.Connection, task: dict) -> None:
    """Resume a decompose task after user answered questions.

    Reuses the existing worktree (preserved when questions were asked).
    Similar to execute_decompose_task but includes Q&A context in prompt.
    """
    task_id = task["id"]
    prompt = task["prompt"]
    worktree_path = task["worktree_path"]
    branch_name = task["branch_name"]

    if not worktree_path or not branch_name:
        raise RuntimeError(
            f"Decompose task {task_id} has no worktree_path or branch_name — cannot resume"
        )

    if not os.path.isdir(worktree_path):
        raise RuntimeError(
            f"Worktree {worktree_path} does not exist — cannot resume"
        )

    try:
        # Step 1: Build Q&A context
        rows = conn.execute(
            "SELECT question_id, question, answer FROM agent_task_questions WHERE task_id = ?",
            (task_id,),
        ).fetchall()

        qa_context = "\n".join(
            f"Q{i+1} ({row['question_id']}): {row['question']}\nA: {row['answer']}"
            for i, row in enumerate(rows)
        )

        resumed_prompt = (
            f"Previous Clarification Q&A:\n\n{qa_context}\n\n"
            f"Original Objective:\n{prompt}\n\n"
            f"Continue with the breakdown using these answers."
        )

        append_output(conn, task_id, "system",
            f"Resuming decompose task with {len(rows)} answered question(s)...")

        # Step 2: Re-inject decompose CLAUDE.md (in case worktree was modified)
        inject_claude_md(worktree_path, "decompose")

        # Step 3: Re-invoke Claude Code in worktree
        invoke_claude(worktree_path, resumed_prompt, conn, task_id)

        # Step 4: Check for breakdown first (takes priority over questions)
        breakdown = check_breakdown(worktree_path)
        if breakdown:
            # Breakdown exists - store it and transition to approval
            conn.execute(
                "UPDATE agent_tasks SET decompose_breakdown = ? WHERE id = ?",
                (json.dumps(breakdown), task_id),
            )
            conn.commit()

            append_output(conn, task_id, "system",
                f"Breakdown created with {len(breakdown)} sub-task(s) — awaiting user approval")
            log.info("Resumed decompose task %d created breakdown with %d sub-tasks",
                task_id, len(breakdown))

            # Cleanup worktree (breakdown is stored in DB)
            cleanup_worktree(REPO_ROOT, worktree_path, branch_name)
            return

        # Step 5: Check for new questions (only if no breakdown)
        questions = check_decompose_questions(worktree_path)
        if questions:
            append_output(conn, task_id, "system",
                f"Decompose agent asked {len(questions)} more question(s)")
            # Clear old questions and save new ones
            conn.execute(
                "DELETE FROM agent_task_questions WHERE task_id = ?",
                (task_id,),
            )
            save_questions_to_db(conn, task_id, questions)
            raise QuestionsAsked(f"Decompose task {task_id} has {len(questions)} new questions")

        # Step 6: Neither breakdown nor questions found
        raise RuntimeError("Decompose agent did not produce breakdown.json or questions")

    except CancelledError:
        append_output(conn, task_id, "system", "Decompose task cancelled")
        if worktree_path and branch_name:
            cleanup_worktree(REPO_ROOT, worktree_path, branch_name)
        raise

    except QuestionsAsked:
        # Preserve worktree for next resume
        raise

    except Exception:
        append_output(conn, task_id, "system", "Resumed decompose task failed")
        if worktree_path:
            append_output(conn, task_id, "system",
                f"Worktree preserved at {worktree_path} for debugging")
        raise


def retry_decompose_breakdown(conn: sqlite3.Connection, task: dict, user_comment: str) -> None:
    """Retry breakdown creation after user rejection.

    Creates a fresh worktree and invokes the decompose agent with the
    user's rejection comment.
    """
    task_id = task["id"]
    prompt = task["prompt"]
    previous_breakdown = task.get("decompose_breakdown")

    worktree_path = None
    branch_name = None

    try:
        # Build context with rejection feedback
        retry_prompt = (
            f"User Rejection Comments:\n\n{user_comment}\n\n"
            f"Original Objective:\n{prompt}\n\n"
        )

        if previous_breakdown:
            retry_prompt += f"Previous Breakdown (rejected):\n{previous_breakdown}\n\n"

        retry_prompt += (
            "The user rejected your previous breakdown. "
            "Address their concerns and create a revised breakdown."
        )

        append_output(conn, task_id, "system",
            "Retrying breakdown with user feedback...")

        # Create fresh worktree
        worktree_path, branch_name = create_worktree(
            REPO_ROOT, task_id, task.get("title") or f"decompose-{task_id}"
        )
        conn.execute(
            "UPDATE agent_tasks SET branch_name = ?, worktree_path = ? WHERE id = ?",
            (branch_name, worktree_path, task_id),
        )
        conn.commit()

        # Inject decompose CLAUDE.md
        inject_claude_md(worktree_path, "decompose")

        # Invoke Claude Code in worktree
        invoke_claude(worktree_path, retry_prompt, conn, task_id)

        # Check for breakdown
        breakdown = check_breakdown(worktree_path)
        if not breakdown:
            raise RuntimeError("Decompose agent did not produce revised breakdown.json")

        # Store new breakdown
        conn.execute(
            "UPDATE agent_tasks SET decompose_breakdown = ?, decompose_user_comment = NULL WHERE id = ?",
            (json.dumps(breakdown), task_id),
        )
        conn.commit()

        append_output(conn, task_id, "system",
            f"Revised breakdown created with {len(breakdown)} sub-task(s)")
        log.info("Decompose task %d created revised breakdown", task_id)

        # Cleanup worktree
        cleanup_worktree(REPO_ROOT, worktree_path, branch_name)

    except Exception:
        append_output(conn, task_id, "system", "Breakdown retry failed")
        if worktree_path:
            append_output(conn, task_id, "system",
                f"Worktree preserved at {worktree_path} for debugging")
        raise


def execute_decompose_reflection(conn: sqlite3.Connection, task: dict) -> None:
    """Execute decompose reflection phase.

    Creates a fresh worktree, reviews all completed sub-tasks, and determines
    if the objective was achieved. Either completes the decompose task or
    loops back to Phase 1.
    """
    task_id = task["id"]

    worktree_path = None
    branch_name = None

    try:
        # Step 1: Gather sub-task results
        sub_tasks = conn.execute(
            """SELECT id, title, prompt, status, commit_id, user_task_comment
               FROM agent_tasks
               WHERE parent_task_id = ?
               ORDER BY created_at ASC""",
            (task_id,),
        ).fetchall()

        if not sub_tasks:
            raise RuntimeError("No sub-tasks found for reflection")

        # Build reflection context
        results_context = "Reflection Context: All sub-tasks completed\n\n"
        results_context += f"Original Objective: {task['prompt']}\n\n"
        results_context += "Sub-task Results:\n\n"

        for i, sub in enumerate(sub_tasks, 1):
            results_context += f"{i}. {sub['title']}\n"
            results_context += f"   Status: {sub['status']}\n"
            results_context += f"   User Comment: {sub['user_task_comment'] or 'None'}\n"
            if sub['commit_id']:
                results_context += f"   Commit: {sub['commit_id']}\n"
            results_context += "\n"

        append_output(conn, task_id, "system",
            f"Starting reflection on {len(sub_tasks)} completed sub-task(s)...")

        # Step 2: Create fresh worktree
        worktree_path, branch_name = create_worktree(
            REPO_ROOT, task_id, task.get("title") or f"decompose-{task_id}"
        )
        conn.execute(
            "UPDATE agent_tasks SET branch_name = ?, worktree_path = ? WHERE id = ?",
            (branch_name, worktree_path, task_id),
        )
        conn.commit()

        # Step 3: Inject decompose CLAUDE.md
        inject_claude_md(worktree_path, "decompose")

        # Step 4: Invoke Claude Code with reflection context
        invoke_claude(worktree_path, results_context, conn, task_id)

        # Step 5: Check reflection result
        result = check_reflection_result(worktree_path)
        if not result:
            raise RuntimeError("Decompose agent did not produce reflection result")

        if result["type"] == "complete":
            # Success! Mark decompose task as complete
            append_output(conn, task_id, "system",
                f"Reflection complete: {result['data'].get('summary', 'Objective achieved')}")
            log.info("Decompose task %d reflection complete", task_id)

        elif result["type"] == "retry":
            # False-finishes detected, need to loop back
            false_finishes = result["data"].get("false_finished_tasks", [])
            append_output(conn, task_id, "system",
                f"Reflection identified {len(false_finishes)} false-finished task(s) — looping back")
            log.info("Decompose task %d needs retry due to false-finishes", task_id)

            # Store retry context for next invocation
            conn.execute(
                "UPDATE agent_tasks SET decompose_user_comment = ? WHERE id = ?",
                (json.dumps(result["data"]), task_id),
            )
            conn.commit()

        # Cleanup worktree
        cleanup_worktree(REPO_ROOT, worktree_path, branch_name)

    except Exception:
        append_output(conn, task_id, "system", "Reflection failed")
        if worktree_path:
            append_output(conn, task_id, "system",
                f"Worktree preserved at {worktree_path} for debugging")
        raise


# ---------------------------------------------------------------------------
# Investigation agent execution
# ---------------------------------------------------------------------------


def execute_investigation(conn: sqlite3.Connection, task: dict) -> None:
    """Execute an investigation task: read-only research producing a report.

    Creates a worktree (for CLAUDE.md isolation), invokes Claude, reads the
    resulting report.md, and stores it in investigation_reports.  No rebase,
    build, or merge — investigations are purely read-only.

    On success: stores report, cleans up worktree, returns normally.
    On cancel: cleans up worktree, raises CancelledError.
    On failure: preserves worktree for debugging, raises the original exception.
    """
    task_id = task["id"]
    prompt = task["prompt"]

    worktree_path = None
    branch_name = None

    try:
        # Step 1: Create worktree (for CLAUDE.md isolation)
        append_output(conn, task_id, "system", "Starting investigation agent...")
        worktree_path, branch_name = create_worktree(
            REPO_ROOT, task_id, task.get("title") or f"investigation-{task_id}"
        )

        # Update task record with worktree info
        conn.execute(
            "UPDATE agent_tasks SET branch_name = ?, worktree_path = ? WHERE id = ?",
            (branch_name, worktree_path, task_id),
        )
        conn.commit()
        append_output(conn, task_id, "system",
            f"Worktree: {worktree_path}  Branch: {branch_name}")

        # Step 2: Inject investigation CLAUDE.md
        inject_claude_md(worktree_path, "investigation")

        # Step 3: Invoke Claude Code
        invoke_claude(worktree_path, prompt, conn, task_id)

        # Step 4: Read the report
        report_path = os.path.join(worktree_path, "report.md")
        if os.path.isfile(report_path):
            with open(report_path, "r", encoding="utf-8") as f:
                report_markdown = f.read()
            log.info("Investigation task %d produced report.md (%d chars)",
                task_id, len(report_markdown))
        else:
            # Fallback: use last assistant output from agent_task_output
            log.warning("Investigation task %d did not produce report.md — "
                "falling back to last assistant output", task_id)
            row = conn.execute(
                "SELECT content FROM agent_task_output "
                "WHERE task_id = ? AND type = 'assistant' "
                "ORDER BY id DESC LIMIT 1",
                (task_id,),
            ).fetchone()
            report_markdown = row["content"] if row else "No report produced."

        # Step 5: Store the report in investigation_reports
        conn.execute(
            "INSERT INTO investigation_reports (task_id, report_markdown) VALUES (?, ?)",
            (task_id, report_markdown),
        )
        conn.commit()
        append_output(conn, task_id, "system",
            "Investigation report stored successfully.")
        log.info("Investigation task %d report stored", task_id)

        # Step 6: Clean up worktree (no rebase, no build, no merge)
        cleanup_worktree(REPO_ROOT, worktree_path, branch_name)
        append_output(conn, task_id, "system",
            "Investigation complete — worktree cleaned up.")

    except CancelledError:
        append_output(conn, task_id, "system",
            "Investigation cancelled — cleaning up")
        if worktree_path and branch_name:
            cleanup_worktree(REPO_ROOT, worktree_path, branch_name)
        raise

    except Exception:
        # Preserve worktree on failure for debugging
        if worktree_path:
            append_output(conn, task_id, "system",
                f"Investigation failed — worktree preserved at {worktree_path} for debugging")
        raise


# ---------------------------------------------------------------------------
# Interactive Study executor
# ---------------------------------------------------------------------------


def execute_interactive_study(conn: sqlite3.Connection, task: dict) -> None:
    """Execute one turn of an interactive study conversation.

    Creates a worktree on the FIRST message in a session, then reuses it
    for all subsequent messages.  The worktree persists for the lifetime
    of the session so the Claude CLI has a stable working directory.

    The daemon sets status to 'developing' before calling this.
    After this returns, the daemon sets status to 'waiting_for_review'
    (idle, ready for the next user message).
    """
    task_id = task["id"]

    append_output(conn, task_id, "system", "Processing study response...")

    # Step 1: Get or create worktree (once per session)
    worktree_path = task.get("worktree_path")

    if not worktree_path or not os.path.isdir(worktree_path):
        # First message — create a persistent worktree for this session
        append_output(conn, task_id, "system", "Creating session worktree...")
        worktree_path, branch_name = create_worktree(
            REPO_ROOT, task_id, task["title"]
        )
        conn.execute(
            "UPDATE agent_tasks SET branch_name = ?, worktree_path = ? WHERE id = ?",
            (branch_name, worktree_path, task_id),
        )
        conn.commit()
        append_output(
            conn, task_id, "system",
            f"Worktree: {worktree_path}  Branch: {branch_name}",
        )

    # Inject CLAUDE.md, memory, and skills every turn (in case they were updated)
    inject_agent_context(worktree_path, "interactive-study")

    # Step 2: Load conversation history from agent_task_output
    rows = conn.execute(
        "SELECT type, content FROM agent_task_output "
        "WHERE task_id = ? AND type IN ('user', 'assistant') "
        "ORDER BY id ASC",
        (task_id,),
    ).fetchall()

    # Step 3: Build conversation prompt
    if not rows:
        conversation_text = "(This is the start of a new conversation)"
    else:
        conversation_parts = []
        for row in rows:
            role = "User" if row["type"] == "user" else "Assistant"
            conversation_parts.append(f"{role}: {row['content']}")

        conversation_text = "\n\n".join(conversation_parts)

        # Validate that the last message is from the user
        if rows[-1]["type"] != "user":
            append_output(conn, task_id, "system", "Error: Last message must be from user")
            raise RuntimeError("Invalid conversation state: last message is not from user")

    # The task prompt contains the study topic/context
    topic = task.get("prompt") or task.get("title") or "general study"

    prompt = (
        f"You are a Socratic tutor. The study topic is: {topic}\n\n"
        f"Here is the conversation so far:\n\n{conversation_text}\n\n"
        f"Continue the conversation. Respond to the user's latest message. "
        f"Guide them with questions rather than just giving answers. "
        f"Use LaTeX notation ($...$ for inline, $$...$$ for block) when writing math."
    )

    # Step 4: Invoke Claude CLI in the persistent worktree
    try:
        invoke_claude(worktree_path, prompt, conn, task_id)
    except CancelledError:
        append_output(conn, task_id, "system", "Study session cancelled")
        raise
    except RuntimeError as e:
        append_output(conn, task_id, "system", f"Claude CLI error: {e}")
        raise

    append_output(conn, task_id, "system", "Response complete — ready for next message")
    log.info("Interactive study task %d turn complete", task_id)


def finish_interactive_study_session(conn: sqlite3.Connection, task: dict) -> None:
    """Finish an interactive study session.

    When the user ends a session (status='finished'), this function:
    1. Invokes the agent one final time to record progress
    2. Copies the updated REFLECTION.md back to the agent's data folder
    3. Cleans up the worktree (no commit needed)

    Args:
        conn: Database connection
        task: Task dict with worktree_path set
    """
    task_id = task["id"]
    worktree_path = task.get("worktree_path")

    if not worktree_path or not os.path.isdir(worktree_path):
        log.warning("Task %d has no worktree to clean up", task_id)
        return

    append_output(conn, task_id, "system", "Finishing session and recording progress...")

    # Step 1: Inject agent context (in case it was updated)
    inject_agent_context(worktree_path, "interactive-study")

    # Step 2: Build prompt to record progress
    prompt = (
        "The student has ended this study session. "
        "Invoke the 'record-progress' skill to summarize what was learned "
        "and update the progress memory file."
    )

    # Step 3: Invoke Claude CLI to record progress
    try:
        invoke_claude(worktree_path, prompt, conn, task_id)
    except CancelledError:
        append_output(conn, task_id, "system", "Session finish cancelled")
        raise
    except RuntimeError as e:
        append_output(conn, task_id, "system", f"Error recording progress: {e}")
        # Continue with cleanup even if recording fails
        log.warning("Failed to record progress for task %d: %s", task_id, e)

    # Step 4: Copy updated REFLECTION.md back to agent's data folder
    from agent_model import get_agent_dir

    agent_dir = get_agent_dir("interactive-study")
    agent_memory_path = os.path.join(agent_dir, "REFLECTION.md")

    # The memory was written to .claude/projects/.../memory/MEMORY.md
    project_slug = worktree_path.replace("/", "-").lstrip("-")
    worktree_memory_path = os.path.join(
        worktree_path, ".claude", "projects", project_slug, "memory", "MEMORY.md"
    )

    if os.path.isfile(worktree_memory_path):
        try:
            shutil.copy2(worktree_memory_path, agent_memory_path)
            append_output(conn, task_id, "system", "Progress saved to agent memory")
            log.info("Copied updated memory from %s to %s", worktree_memory_path, agent_memory_path)
        except Exception as e:
            append_output(conn, task_id, "system", f"Warning: Failed to save progress: {e}")
            log.warning("Failed to copy memory for task %d: %s", task_id, e)
    else:
        log.warning("No updated memory found at %s", worktree_memory_path)

    # Step 5: Clean up worktree
    branch_name = task.get("branch_name")
    if branch_name:
        append_output(conn, task_id, "system", "Cleaning up worktree...")
        cleanup_worktree(REPO_ROOT, worktree_path, branch_name)

        # Clear worktree_path and branch_name from task
        conn.execute(
            "UPDATE agent_tasks SET worktree_path = NULL, branch_name = NULL WHERE id = ?",
            (task_id,),
        )
        conn.commit()

        append_output(conn, task_id, "system", "Session complete — worktree cleaned up")
        log.info("Cleaned up worktree for task %d", task_id)
    else:
        log.warning("Task %d has no branch_name — skipping cleanup", task_id)

