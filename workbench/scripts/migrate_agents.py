#!/usr/bin/env python3
"""
One-time migration script to create database entries for the default agents.

This script creates database entries for the worker, decompose, and investigation
agents that were migrated from the old data/agent-*-claude.md files to the new
agent section structure at shared-data/agent/.

Run once: python3 scripts/migrate_agents.py
"""

import os
import sqlite3
from datetime import datetime, timezone

DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "workbench.db",
)

AGENTS = [
    ("worker", "Working agent for implementing tasks in worktrees"),
    ("decompose", "Decomposition agent for breaking down objectives into sub-tasks"),
    ("investigation", "Investigation agent for analyzing and reporting on issues"),
]


def main():
    if not os.path.exists(DB_PATH):
        print(f"Error: Database not found at {DB_PATH}")
        return 1

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # Check if agents table exists
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='agents'"
    )
    if not cursor.fetchone():
        print("Error: agents table does not exist. Run the app first to initialize the schema.")
        return 1

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    for name, description in AGENTS:
        # Check if agent already exists
        existing = conn.execute(
            "SELECT id FROM agents WHERE name = ?", (name,)
        ).fetchone()

        if existing:
            print(f"Agent '{name}' already exists (id={existing['id']})")
            continue

        # Insert agent
        conn.execute(
            "INSERT INTO agents (name, description, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (name, description, now, now),
        )
        print(f"Created agent '{name}'")

    conn.commit()
    conn.close()
    print("Migration complete")
    return 0


if __name__ == "__main__":
    exit(main())
