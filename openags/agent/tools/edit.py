"""FileEdit tool — exact string replacement in project files."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from openags.agent.tools.base import ToolResult
from openags.agent.tools.workspace_base import ToolError, safe_path

logger = logging.getLogger(__name__)


class FileEditTool:
    """Replace exact text in a file (satisfies Tool protocol).

    The old_text must appear exactly once in the file.
    This ensures precise, unambiguous edits.
    """

    _name = "edit"
    _description = "Replace exact text in a file. The old_text must match exactly once in the file."

    def __init__(self, workspace: Path) -> None:
        self._workspace = workspace

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    async def invoke(self, **kwargs: Any) -> ToolResult:
        path_str = kwargs.get("path", "")
        old_text = kwargs.get("old_text", "")
        new_text = kwargs.get("new_text", "")

        if not path_str:
            return ToolResult(success=False, error="'path' is required.")
        if not old_text:
            return ToolResult(success=False, error="'old_text' is required.")

        try:
            file_path = safe_path(self._workspace, path_str)
        except ToolError as e:
            return ToolResult(success=False, error=str(e))

        if not file_path.exists():
            return ToolResult(success=False, error=f"File not found: {path_str}")
        if not file_path.is_file():
            return ToolResult(success=False, error=f"Not a file: {path_str}")

        try:
            content = file_path.read_text(encoding="utf-8")
            count = content.count(old_text)

            if count == 0:
                return ToolResult(success=False, error=f"old_text not found in {path_str}")
            if count > 1:
                return ToolResult(
                    success=False,
                    error=(
                        f"old_text found {count} times in {path_str}. "
                        "Must be unique. Provide more surrounding context."
                    ),
                )

            new_content = content.replace(old_text, new_text, 1)
            file_path.write_text(new_content, encoding="utf-8")

            return ToolResult(
                success=True,
                data=f"Edited {path_str}",
                metadata={"path": path_str},
            )
        except Exception as e:
            logger.error("FileEditTool error: %s", e)
            return ToolResult(success=False, error=str(e))

    def schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to the file to edit",
                },
                "old_text": {
                    "type": "string",
                    "description": "Exact text to find and replace (must appear exactly once)",
                },
                "new_text": {
                    "type": "string",
                    "description": "Replacement text",
                },
            },
            "required": ["path", "old_text", "new_text"],
        }
