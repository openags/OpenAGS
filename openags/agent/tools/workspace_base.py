"""Workspace-scoped tool utilities — safe path resolution for all file tools."""

from __future__ import annotations

from pathlib import Path

from openags.agent.errors import OpenAGSError


class ToolError(OpenAGSError):
    """Tool execution errors (path violation, command failure)."""


def safe_path(workspace: Path, user_path: str) -> Path:
    """Resolve a user-provided path safely within the workspace boundary.

    Prevents path traversal attacks by resolving the full path and checking
    it stays within the workspace directory.

    Raises ToolError if the path escapes the workspace.
    """
    workspace = workspace.resolve()
    resolved = (workspace / user_path).resolve()
    if not resolved.is_relative_to(workspace):
        raise ToolError(f"Path escapes workspace: {user_path}")
    return resolved
