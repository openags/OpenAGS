"""FileRead tool — read file contents from the project workspace."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from openags.agent.tools.base import ToolResult
from openags.agent.tools.workspace_base import ToolError, safe_path

logger = logging.getLogger(__name__)

MAX_OUTPUT_CHARS = 100_000


class FileReadTool:
    """Read file contents within the project workspace (satisfies Tool protocol)."""

    _name = "read"
    _description = "Read file contents from the project workspace. Supports text files and PDFs. Use offset/limit for large files."

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
        offset = kwargs.get("offset")
        limit = kwargs.get("limit")

        if not path_str:
            return ToolResult(success=False, error="'path' is required.")

        try:
            file_path = safe_path(self._workspace, path_str)
        except ToolError as e:
            return ToolResult(success=False, error=str(e))

        if not file_path.exists():
            return ToolResult(success=False, error=f"File not found: {path_str}")
        if not file_path.is_file():
            return ToolResult(success=False, error=f"Not a file: {path_str}")

        try:
            # Handle PDF files
            if file_path.suffix.lower() == ".pdf":
                return await self._read_pdf(file_path, path_str, offset, limit)

            text = file_path.read_text(encoding="utf-8", errors="replace")
            lines = text.splitlines()
            total = len(lines)

            start = int(offset) if offset is not None else 0
            end = start + int(limit) if limit is not None else total
            selected = lines[start:end]

            # Add line numbers
            numbered = [f"{i + start + 1}\t{line}" for i, line in enumerate(selected)]
            content = "\n".join(numbered)

            if len(content) > MAX_OUTPUT_CHARS:
                content = content[:MAX_OUTPUT_CHARS] + f"\n... (truncated, {total} total lines)"

            return ToolResult(
                success=True,
                data=content,
                metadata={"path": path_str, "total_lines": total, "lines_returned": len(selected)},
            )
        except Exception as e:
            logger.error("FileReadTool error: %s", e)
            return ToolResult(success=False, error=str(e))

    async def _read_pdf(
        self, file_path: Path, path_str: str, offset: object, limit: object,
    ) -> ToolResult:
        """Extract text from a PDF file."""
        try:
            import fitz  # PyMuPDF
        except ImportError:
            return ToolResult(
                success=False,
                error="PDF reading requires pymupdf. Install with: pip install pymupdf",
            )

        try:
            doc = fitz.open(str(file_path))
            pages = list(range(len(doc)))

            # Apply offset/limit as page numbers
            start_page = int(offset) if offset is not None else 0
            end_page = start_page + int(limit) if limit is not None else len(pages)
            selected_pages = pages[start_page:end_page]

            parts: list[str] = []
            for page_num in selected_pages:
                page = doc[page_num]
                text = page.get_text("text").strip()
                if text:
                    parts.append(f"--- Page {page_num + 1} ---\n{text}")

            doc.close()
            content = "\n\n".join(parts)

            if len(content) > MAX_OUTPUT_CHARS:
                content = content[:MAX_OUTPUT_CHARS] + f"\n... (truncated, {len(doc)} total pages)"

            return ToolResult(
                success=True,
                data=content,
                metadata={"path": path_str, "total_pages": len(pages), "pages_returned": len(selected_pages)},
            )
        except Exception as e:
            logger.error("PDF read error: %s", e)
            return ToolResult(success=False, error=f"Failed to read PDF: {e}")

    def schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to file within the project workspace",
                },
                "offset": {
                    "type": "integer",
                    "description": "Line number to start reading from (0-based, default 0)",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of lines to read",
                },
            },
            "required": ["path"],
        }
