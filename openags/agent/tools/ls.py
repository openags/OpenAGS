"""FileList tool — list directory contents and glob search in project workspace."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from openags.agent.tools.base import ToolResult
from openags.agent.tools.workspace_base import ToolError, safe_path

logger = logging.getLogger(__name__)

MAX_ENTRIES = 1000


class FileListTool:
    """List directory contents or search files by glob pattern (satisfies Tool protocol)."""

    _name = "ls"
    _description = "List directory contents or find files by glob pattern within the project workspace."

    def __init__(self, workspace: Path) -> None:
        self._workspace = workspace

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    async def invoke(self, **kwargs: Any) -> ToolResult:
        path_str = kwargs.get("path", ".")
        pattern = kwargs.get("pattern")

        try:
            dir_path = safe_path(self._workspace, path_str)
        except ToolError as e:
            return ToolResult(success=False, error=str(e))

        try:
            if pattern:
                # Glob search within workspace
                matches = sorted(self._workspace.glob(pattern))
                entries = []
                for p in matches[:MAX_ENTRIES]:
                    try:
                        rel = str(p.relative_to(self._workspace))
                    except ValueError:
                        continue
                    entries.append({
                        "name": p.name,
                        "path": rel,
                        "is_dir": p.is_dir(),
                        "size": p.stat().st_size if p.is_file() else 0,
                    })
                truncated = len(matches) > MAX_ENTRIES
            else:
                # List directory
                if not dir_path.exists():
                    return ToolResult(success=False, error=f"Directory not found: {path_str}")
                if not dir_path.is_dir():
                    return ToolResult(success=False, error=f"Not a directory: {path_str}")

                items = sorted(dir_path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
                entries = []
                for p in items[:MAX_ENTRIES]:
                    entries.append({
                        "name": p.name,
                        "path": str(p.relative_to(self._workspace)),
                        "is_dir": p.is_dir(),
                        "size": p.stat().st_size if p.is_file() else 0,
                    })
                truncated = len(items) > MAX_ENTRIES

            result_text = "\n".join(
                f"{'[DIR] ' if e['is_dir'] else ''}{e['path']}"
                + (f" ({e['size']} bytes)" if not e['is_dir'] else "")
                for e in entries
            )
            if truncated:
                result_text += f"\n... (truncated at {MAX_ENTRIES} entries)"

            return ToolResult(
                success=True,
                data=result_text,
                metadata={"count": len(entries), "truncated": truncated},
            )
        except Exception as e:
            logger.error("FileListTool error: %s", e)
            return ToolResult(success=False, error=str(e))

    def schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative directory path to list (default: project root)",
                    "default": ".",
                },
                "pattern": {
                    "type": "string",
                    "description": "Glob pattern to search for files (e.g. '**/*.py', 'manuscript/*.tex')",
                },
            },
            "required": [],
        }
