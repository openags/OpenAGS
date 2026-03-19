"""Auto Memory — agents automatically accumulate knowledge across sessions.

After each agent loop completes, the system checks if the execution
produced insights worth remembering. If so, they're written to MEMORY.md.
The first 200 lines of MEMORY.md are loaded into every session.
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

MEMORY_FILE = "MEMORY.md"
MAX_CONTEXT_LINES = 200


class AutoMemory:
    """Automatic learning system for agents."""

    def __init__(self, module_dir: Path) -> None:
        self._memory_path = module_dir / MEMORY_FILE
        module_dir.mkdir(parents=True, exist_ok=True)

    async def maybe_learn(self, task: str, output: str, success: bool, backend: object) -> None:
        """Extract and save reusable insights from a completed task.

        Uses a lightweight LLM call to decide what's worth remembering.
        Only saves on successful executions.
        """
        if not success:
            return
        if len(output.strip()) < 100:
            return

        prompt = (
            "Based on this task and result, extract any reusable insights worth "
            "remembering for future sessions. Focus on:\n"
            "- Commands or tools that worked\n"
            "- Patterns or conventions discovered\n"
            "- Key findings or decisions made\n"
            "- Debugging insights\n\n"
            f"Task: {task[:500]}\n"
            f"Result: {output[:2000]}\n\n"
            "If there are useful insights, output them as concise bullet points.\n"
            "If nothing is worth remembering, output exactly: NONE"
        )

        try:
            response = await backend.execute(prompt, system="You extract reusable knowledge concisely.", timeout=30)  # type: ignore[attr-defined]
            content = response.content.strip()
            if "NONE" in content.upper() or len(content) < 20:
                return
            self._append(content)
            logger.info("Auto-memory updated for %s", self._memory_path.parent.name)
        except Exception as e:
            logger.debug("Auto-memory extraction skipped: %s", e)

    def get_context(self) -> str:
        """Load first MAX_CONTEXT_LINES lines of MEMORY.md as context."""
        if not self._memory_path.exists():
            return ""
        lines = self._memory_path.read_text(encoding="utf-8").splitlines()
        if not lines:
            return ""
        context_lines = lines[:MAX_CONTEXT_LINES]
        if len(lines) > MAX_CONTEXT_LINES:
            context_lines.append(f"\n... ({len(lines) - MAX_CONTEXT_LINES} more lines in MEMORY.md)")
        return "\n".join(context_lines)

    def _append(self, content: str) -> None:
        """Append insights to MEMORY.md."""
        from datetime import datetime

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        entry = f"\n### [{timestamp}]\n{content}\n"

        with open(self._memory_path, "a", encoding="utf-8") as f:
            f.write(entry)

        self._maybe_trim()

    def _maybe_trim(self) -> None:
        """If MEMORY.md exceeds MAX_CONTEXT_LINES * 2, keep recent entries."""
        if not self._memory_path.exists():
            return
        lines = self._memory_path.read_text(encoding="utf-8").splitlines()
        if len(lines) <= MAX_CONTEXT_LINES * 2:
            return
        trimmed = lines[-MAX_CONTEXT_LINES:]
        self._memory_path.write_text("\n".join(trimmed) + "\n", encoding="utf-8")
        logger.info("MEMORY.md trimmed from %d to %d lines", len(lines), len(trimmed))
