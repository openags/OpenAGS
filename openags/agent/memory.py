"""Two-layer memory system: memory.md (rewritable) + history.md (append-only)."""

from __future__ import annotations

import logging
import platform
from datetime import datetime
from io import TextIOWrapper
from pathlib import Path


logger = logging.getLogger(__name__)


def _lock_file(f: TextIOWrapper) -> None:
    """Acquire exclusive file lock (cross-platform)."""
    if platform.system() != "Windows":
        import fcntl

        fcntl.flock(f, fcntl.LOCK_EX)
    # On Windows, file locking is handled differently; skip for now


def _unlock_file(f: TextIOWrapper) -> None:
    """Release file lock (cross-platform)."""
    if platform.system() != "Windows":
        import fcntl

        fcntl.flock(f, fcntl.LOCK_UN)


class MemorySystem:
    """Per-module two-layer memory.

    Each research module (literature, manuscript, etc.) has its own memory:

    Layer 1 - memory.md: LLM-rewritable structured knowledge.
      Organized by sections with markers: <!-- section:name --> ... <!-- /section:name -->

    Layer 2 - history.md: Append-only chronological log (at project level).
      Never modified, only appended to. Used for audit trail.
    """

    MEMORY_MAX_LINES = 200

    def __init__(self, module_dir: Path, project_dir: Path | None = None):
        self._module_dir = module_dir
        self._project_dir = project_dir or module_dir

        # Memory lives in the module directory
        self._memory_path = self._module_dir / "memory.md"
        self._module_dir.mkdir(parents=True, exist_ok=True)
        self._memory_path.touch(exist_ok=True)

        # History stays at project level (audit trail across all modules)
        openags_dir = self._project_dir / ".openags"
        openags_dir.mkdir(parents=True, exist_ok=True)
        self._history_path = openags_dir / "history.md"
        self._history_path.touch(exist_ok=True)

    @property
    def project_dir(self) -> Path:
        """Project directory (falls back to module_dir if not set)."""
        return self._project_dir

    def get_context(self, role: str | None = None) -> str:
        """Build context string for Agent prompt injection."""
        parts: list[str] = []

        memory = self._read_memory()
        if memory.strip():
            parts.append(f"## Project Memory\n{memory}")

        history = self._read_recent_history(limit=50)
        if history.strip():
            parts.append(f"## Recent History\n{history}")

        return "\n\n".join(parts)

    def update_memory(self, section: str, content: str) -> None:
        """Update a named section in memory.md (with file lock and timeout)."""
        marker_start = f"<!-- section:{section} -->"
        marker_end = f"<!-- /section:{section} -->"

        try:
            f = open(self._memory_path, "r+", encoding="utf-8")
        except OSError as exc:
            logger.error("Cannot open memory file: %s", exc)
            return

        try:
            _lock_file(f)
            text = f.read()

            new_block = f"{marker_start}\n{content}\n{marker_end}"

            if marker_start in text:
                start_idx = text.index(marker_start)
                end_idx = text.index(marker_end) + len(marker_end)
                text = text[:start_idx] + new_block + text[end_idx:]
            else:
                text = text.rstrip() + f"\n\n{new_block}\n"

            f.seek(0)
            f.truncate()
            f.write(text)
        finally:
            _unlock_file(f)
            f.close()

        logger.debug("Memory section '%s' updated", section)

    def read_memory_section(self, section: str) -> str | None:
        """Read a specific section from memory.md."""
        marker_start = f"<!-- section:{section} -->"
        marker_end = f"<!-- /section:{section} -->"

        text = self._read_memory()
        if marker_start not in text:
            return None

        start = text.index(marker_start) + len(marker_start)
        end = text.index(marker_end)
        return text[start:end].strip()

    def append_history(self, event: str, details: str) -> None:
        """Append an entry to history.md (never modifies existing content)."""
        timestamp = datetime.now().isoformat(timespec="seconds")
        entry = f"\n### [{timestamp}] {event}\n{details}\n"

        with open(self._history_path, "a", encoding="utf-8") as f:
            _lock_file(f)
            try:
                f.write(entry)
            finally:
                _unlock_file(f)

    def needs_compression(self) -> bool:
        """Check if memory.md exceeds the line limit."""
        if not self._memory_path.exists():
            return False
        line_count = len(self._memory_path.read_text(encoding="utf-8").splitlines())
        return line_count > self.MEMORY_MAX_LINES

    async def compress_memory(self, backend: object) -> bool:
        """Use LLM to compress memory.md, keeping only key facts.

        Returns True if compression was performed.
        """
        if not self.needs_compression():
            return False

        current = self._read_memory()
        if not current.strip():
            return False

        prompt = (
            "Compress the following project memory into a concise summary.\n"
            "Keep all critical facts, decisions, and findings.\n"
            "Remove redundant or outdated information.\n"
            "Preserve the section marker format: <!-- section:name --> ... <!-- /section:name -->\n"
            "Keep it under 100 lines.\n\n"
            f"## Current Memory\n```\n{current}\n```\n\n"
            "Reply with ONLY the compressed memory content (no explanation)."
        )

        try:
            response = await backend.execute(prompt, timeout=60)  # type: ignore[attr-defined]
            compressed = response.content.strip()

            # Sanity check: don't replace with empty or very short content
            if len(compressed) < 50:
                logger.warning("Compression result too short, skipping")
                return False

            # Remove markdown fences if LLM wrapped it
            if compressed.startswith("```"):
                lines = compressed.splitlines()
                compressed = "\n".join(lines[1:-1]) if len(lines) > 2 else compressed

            # Backup original before overwriting
            backup_path = self._memory_path.parent / "memory.md.bak"
            backup_path.write_text(current, encoding="utf-8")

            with open(self._memory_path, "w", encoding="utf-8") as f:
                _lock_file(f)
                try:
                    f.write(compressed)
                finally:
                    _unlock_file(f)

            logger.info(
                "Memory compressed: %d → %d lines",
                len(current.splitlines()),
                len(compressed.splitlines()),
            )
            return True

        except Exception as e:
            logger.error("Memory compression failed: %s", e)
            return False

    def _read_memory(self) -> str:
        if self._memory_path.exists():
            return self._memory_path.read_text(encoding="utf-8")
        return ""

    def _read_recent_history(self, limit: int) -> str:
        if not self._history_path.exists():
            return ""
        lines = self._history_path.read_text(encoding="utf-8").splitlines()
        return "\n".join(lines[-limit:])
