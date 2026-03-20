"""FileWrite tool — create or overwrite files in the project workspace."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from openags.agent.tools.base import ToolResult
from openags.agent.tools.workspace_base import ToolError, safe_path

logger = logging.getLogger(__name__)


class FileWriteTool:
    """Write content to a file in the project workspace (satisfies Tool protocol)."""

    _name = "write"
    _description = (
        "Create or overwrite a file in the project workspace."
        " Parent directories are created automatically."
    )

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
        content = kwargs.get("content")

        if not path_str:
            return ToolResult(success=False, error="'path' is required.")
        if content is None:
            return ToolResult(success=False, error="'content' is required.")

        try:
            file_path = safe_path(self._workspace, path_str)
        except ToolError as e:
            return ToolResult(success=False, error=str(e))

        try:
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(str(content), encoding="utf-8")
            size = file_path.stat().st_size
            return ToolResult(
                success=True,
                data=f"Wrote {size} bytes to {path_str}",
                metadata={"path": path_str, "size": size},
            )
        except Exception as e:
            logger.error("FileWriteTool error: %s", e)
            return ToolResult(success=False, error=str(e))

    def schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path for the file within the project workspace",
                },
                "content": {
                    "type": "string",
                    "description": "Content to write to the file",
                },
            },
            "required": ["path", "content"],
        }
