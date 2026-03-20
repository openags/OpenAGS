"""FileSearch tool — grep/regex search across project files."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

from openags.agent.tools.base import ToolResult
from openags.agent.tools.workspace_base import ToolError, safe_path

logger = logging.getLogger(__name__)

MAX_MATCHES = 200
MAX_LINE_LEN = 500


class FileSearchTool:
    """Search file contents by regex pattern within the project workspace."""

    _name = "grep"
    _description = (
        "Search for a regex pattern across files in the project workspace."
        " Returns matching lines with file paths and line numbers."
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
        pattern_str = kwargs.get("pattern", "")
        path_str = kwargs.get("path", ".")
        file_glob = kwargs.get("glob")

        if not pattern_str:
            return ToolResult(success=False, error="'pattern' is required.")

        try:
            search_dir = safe_path(self._workspace, path_str)
        except ToolError as e:
            return ToolResult(success=False, error=str(e))

        if not search_dir.exists():
            return ToolResult(success=False, error=f"Directory not found: {path_str}")

        try:
            regex = re.compile(pattern_str)
        except re.error as e:
            return ToolResult(success=False, error=f"Invalid regex: {e}")

        try:
            # Collect files to search
            if search_dir.is_file():
                files = [search_dir]
            elif file_glob:
                files = sorted(search_dir.rglob(file_glob))
            else:
                files = sorted(search_dir.rglob("*"))

            matches: list[str] = []
            files_with_matches = 0

            for file_path in files:
                if not file_path.is_file():
                    continue
                # Skip binary / very large files
                try:
                    size = file_path.stat().st_size
                    if size > 5_000_000:  # 5MB
                        continue
                    text = file_path.read_text(encoding="utf-8", errors="ignore")
                except (OSError, UnicodeDecodeError):
                    continue

                rel = str(file_path.relative_to(self._workspace))
                found_in_file = False

                for line_num, line in enumerate(text.splitlines(), 1):
                    if regex.search(line):
                        if not found_in_file:
                            files_with_matches += 1
                            found_in_file = True
                        display = line[:MAX_LINE_LEN]
                        matches.append(f"{rel}:{line_num}: {display}")
                        if len(matches) >= MAX_MATCHES:
                            break

                if len(matches) >= MAX_MATCHES:
                    break

            if not matches:
                return ToolResult(
                    success=True,
                    data="No matches found.",
                    metadata={"match_count": 0},
                )

            result = "\n".join(matches)
            if len(matches) >= MAX_MATCHES:
                result += f"\n... (truncated at {MAX_MATCHES} matches)"

            return ToolResult(
                success=True,
                data=result,
                metadata={"match_count": len(matches), "files_with_matches": files_with_matches},
            )
        except Exception as e:
            logger.error("FileSearchTool error: %s", e)
            return ToolResult(success=False, error=str(e))

    def schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Regex pattern to search for in file contents",
                },
                "path": {
                    "type": "string",
                    "description": "Directory to search in (default: project root)",
                    "default": ".",
                },
                "glob": {
                    "type": "string",
                    "description": "File glob filter (e.g. '*.py', '*.tex')",
                },
            },
            "required": ["pattern"],
        }
