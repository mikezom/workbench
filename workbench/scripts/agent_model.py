"""
Agent model abstraction for reading agent definitions from the agent section.

The agent section stores agents at shared-data/agent/<name>/ with:
- CLAUDE.md (persona)
- REFLECTION.md (memory)
- skills/ (per-agent skill copies)
- mcp-config.json (MCP tool configuration)

This module provides functions to read agent data for use in the executor.
"""

import json
import os
from typing import Optional

# Base directory for agent data
# From workbench/scripts/, go up to workbench/, then up to repo root, then to shared-data/agent/
AGENTS_BASE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "..",
    "shared-data",
    "agent"
)


def get_agent_dir(agent_name: str) -> str:
    """Get the filesystem path for an agent directory."""
    return os.path.join(AGENTS_BASE_DIR, agent_name)


def read_agent_persona(agent_name: str) -> str:
    """Read the CLAUDE.md file for an agent.

    Args:
        agent_name: Name of the agent (e.g., "worker", "decompose")

    Returns:
        Content of CLAUDE.md

    Raises:
        FileNotFoundError: If the agent or CLAUDE.md doesn't exist
    """
    agent_dir = get_agent_dir(agent_name)
    persona_path = os.path.join(agent_dir, "CLAUDE.md")

    if not os.path.isfile(persona_path):
        raise FileNotFoundError(
            f"Agent '{agent_name}' persona not found at {persona_path}"
        )

    with open(persona_path, "r", encoding="utf-8") as f:
        return f.read()


def read_agent_memory(agent_name: str) -> str:
    """Read the REFLECTION.md file for an agent.

    Args:
        agent_name: Name of the agent

    Returns:
        Content of REFLECTION.md, or empty string if file doesn't exist
    """
    agent_dir = get_agent_dir(agent_name)
    memory_path = os.path.join(agent_dir, "REFLECTION.md")

    if not os.path.isfile(memory_path):
        return ""

    with open(memory_path, "r", encoding="utf-8") as f:
        return f.read()


def read_agent_tools(agent_name: str) -> Optional[dict]:
    """Read the mcp-config.json file for an agent.

    Args:
        agent_name: Name of the agent

    Returns:
        Parsed JSON config, or None if file doesn't exist or is invalid
    """
    agent_dir = get_agent_dir(agent_name)
    tools_path = os.path.join(agent_dir, "mcp-config.json")

    if not os.path.isfile(tools_path):
        return None

    try:
        with open(tools_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def list_agent_skills(agent_name: str) -> list[str]:
    """List skill directories within an agent's skills folder.

    Args:
        agent_name: Name of the agent

    Returns:
        List of skill directory names
    """
    agent_dir = get_agent_dir(agent_name)
    skills_dir = os.path.join(agent_dir, "skills")

    if not os.path.isdir(skills_dir):
        return []

    try:
        entries = os.listdir(skills_dir)
        return [
            e for e in entries
            if os.path.isdir(os.path.join(skills_dir, e))
        ]
    except OSError:
        return []


def agent_exists(agent_name: str) -> bool:
    """Check if an agent directory exists.

    Args:
        agent_name: Name of the agent

    Returns:
        True if the agent directory exists
    """
    agent_dir = get_agent_dir(agent_name)
    return os.path.isdir(agent_dir)
