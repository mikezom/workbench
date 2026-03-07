from __future__ import annotations

"""
Task handler abstraction for the agent daemon.

Each handler knows how to find its next actionable task and how to execute it.
The daemon uses a shared `execute_with_handler` function to run any handler
with consistent lock/status/error handling.
"""

import logging
import sqlite3
import traceback
from abc import ABC, abstractmethod
from datetime import datetime, timezone

from agent_executor import execute_task as run_task_pipeline
from agent_executor import resume_task as run_resume_pipeline
from agent_executor import (
    execute_decompose_task as run_decompose_pipeline,
    resume_decompose_task as run_decompose_resume_pipeline,
    retry_decompose_breakdown as run_decompose_retry_pipeline,
    execute_decompose_reflection as run_decompose_reflection_pipeline,
    execute_investigation as run_investigation_pipeline,
)
from agent_executor import CancelledError, QuestionsAsked

log = logging.getLogger("agent-daemon")


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------


class TaskHandler(ABC):
    """Base class for all task handlers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name for logging."""

    @abstractmethod
    def get_next_task(self, conn: sqlite3.Connection) -> dict | None:
        """SQL query to find next actionable task."""

    @abstractmethod
    def execute(self, conn: sqlite3.Connection, task: dict) -> None:
        """Call the right pipeline function."""

    def get_developing_status(self) -> str:
        return "developing"

    def get_finished_status(self) -> str:
        return "finished"

    def get_questions_status(self) -> str:
        return "waiting_for_review"

    def needs_started_at(self) -> bool:
        return True

    def supports_questions(self) -> bool:
        """Whether QuestionsAsked exceptions are expected."""
        return True

    def post_success(self, conn: sqlite3.Connection, task: dict) -> str | None:
        """Hook called after successful execution.

        Return an alternative finished status, or None to use
        get_finished_status().
        """
        return None


# ---------------------------------------------------------------------------
# Worker handlers
# ---------------------------------------------------------------------------


class WorkerNewTaskHandler(TaskHandler):
    @property
    def name(self) -> str:
        return "worker-new"

    def get_next_task(self, conn: sqlite3.Connection) -> dict | None:
        row = conn.execute(
            "SELECT * FROM agent_tasks WHERE status = 'waiting_for_dev' "
            "AND (task_type IS NULL OR task_type NOT IN ('decompose', 'investigation')) "
            "ORDER BY created_at ASC LIMIT 1"
        ).fetchone()
        if row is None:
            return None
        return dict(row)

    def execute(self, conn: sqlite3.Connection, task: dict) -> None:
        run_task_pipeline(conn, task)


class WorkerResumeHandler(TaskHandler):
    @property
    def name(self) -> str:
        return "worker-resume"

    def get_next_task(self, conn: sqlite3.Connection) -> dict | None:
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

    def execute(self, conn: sqlite3.Connection, task: dict) -> None:
        run_resume_pipeline(conn, task)

    def needs_started_at(self) -> bool:
        return False


# ---------------------------------------------------------------------------
# Decompose handlers
# ---------------------------------------------------------------------------


class DecomposeStartHandler(TaskHandler):
    @property
    def name(self) -> str:
        return "decompose-start"

    def get_next_task(self, conn: sqlite3.Connection) -> dict | None:
        row = conn.execute(
            """SELECT * FROM agent_tasks
               WHERE task_type = 'decompose'
               AND status = 'decompose_understanding'
               ORDER BY created_at ASC LIMIT 1"""
        ).fetchone()
        if row is None:
            return None
        return dict(row)

    def execute(self, conn: sqlite3.Connection, task: dict) -> None:
        run_decompose_pipeline(conn, task)

    def get_developing_status(self) -> str:
        return "decompose_understanding"

    def get_finished_status(self) -> str:
        return "decompose_waiting_for_approval"

    def get_questions_status(self) -> str:
        return "decompose_waiting_for_answers"


class DecomposeResumeHandler(TaskHandler):
    @property
    def name(self) -> str:
        return "decompose-resume"

    def get_next_task(self, conn: sqlite3.Connection) -> dict | None:
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

    def execute(self, conn: sqlite3.Connection, task: dict) -> None:
        run_decompose_resume_pipeline(conn, task)

    def get_developing_status(self) -> str:
        return "decompose_breaking_down"

    def get_finished_status(self) -> str:
        return "decompose_waiting_for_approval"

    def get_questions_status(self) -> str:
        return "decompose_waiting_for_answers"

    def needs_started_at(self) -> bool:
        return False


class DecomposeRetryHandler(TaskHandler):
    @property
    def name(self) -> str:
        return "decompose-retry"

    def get_next_task(self, conn: sqlite3.Connection) -> dict | None:
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

    def execute(self, conn: sqlite3.Connection, task: dict) -> None:
        user_comment = task["decompose_user_comment"]
        run_decompose_retry_pipeline(conn, task, user_comment)

    def get_developing_status(self) -> str:
        return "decompose_breaking_down"

    def get_finished_status(self) -> str:
        return "decompose_waiting_for_approval"

    def supports_questions(self) -> bool:
        return False

    def needs_started_at(self) -> bool:
        return False


class DecomposeReflectionHandler(TaskHandler):
    @property
    def name(self) -> str:
        return "decompose-reflection"

    def get_next_task(self, conn: sqlite3.Connection) -> dict | None:
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

    def execute(self, conn: sqlite3.Connection, task: dict) -> None:
        run_decompose_reflection_pipeline(conn, task)

    def get_developing_status(self) -> str:
        return "decompose_reflecting"

    def get_finished_status(self) -> str:
        return "decompose_complete"

    def supports_questions(self) -> bool:
        return False

    def needs_started_at(self) -> bool:
        return False

    def post_success(self, conn: sqlite3.Connection, task: dict) -> str | None:
        """Check if reflection wants to retry — loop back to understanding."""
        task_after = conn.execute(
            "SELECT decompose_user_comment FROM agent_tasks WHERE id = ?",
            (task["id"],)
        ).fetchone()
        if task_after and task_after["decompose_user_comment"]:
            return "decompose_understanding"
        return None


# ---------------------------------------------------------------------------
# Investigation handler
# ---------------------------------------------------------------------------


class InvestigationTaskHandler(TaskHandler):
    @property
    def name(self) -> str:
        return "investigation"

    def get_next_task(self, conn: sqlite3.Connection) -> dict | None:
        row = conn.execute(
            "SELECT * FROM agent_tasks WHERE status = 'waiting_for_dev' "
            "AND task_type = 'investigation' "
            "ORDER BY created_at ASC LIMIT 1"
        ).fetchone()
        return dict(row) if row else None

    def execute(self, conn: sqlite3.Connection, task: dict) -> None:
        run_investigation_pipeline(conn, task)

    def supports_questions(self) -> bool:
        return False
