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

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

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
    return slug[:50]


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
    """Run a git command, raising on failure."""
    cmd = ["git"] + args
    log.debug("git %s  (cwd=%s)", " ".join(args), cwd)
    return subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
        check=True,
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

    _run_git(
        ["worktree", "add", worktree_dir, "-b", branch_name, "main"],
        cwd=repo_root,
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
