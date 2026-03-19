"""Auto Memory — agents automatically accumulate categorized knowledge.

After each agent loop completes, the system extracts insights and categorizes
them into: success strategies, failure patterns, and research findings.
Deduplication prevents the same insight from being recorded multiple times.
The first 200 lines of MEMORY.md are loaded into every session.
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

MEMORY_FILE = "MEMORY.md"
MAX_CONTEXT_LINES = 200


class AutoMemory:
    """Automatic categorized learning system for agents."""

    def __init__(self, module_dir: Path) -> None:
        self._memory_path = module_dir / MEMORY_FILE
        module_dir.mkdir(parents=True, exist_ok=True)

    async def maybe_learn(self, task: str, output: str, success: bool, backend: object) -> None:
        """Extract and save categorized insights from a completed task.

        Now learns from both successes AND failures:
        - Success → strategies that worked
        - Failure → patterns to avoid
        """
        if len((output or "").strip()) < 50:
            return

        status = "succeeded" if success else "failed"
        prompt = (
            f"This task {status}. Extract reusable insights, categorized as follows.\n\n"
            "Categories (use exactly these headers):\n"
            "- **Strategy**: approaches/commands/tools that worked well\n"
            "- **Failure Pattern**: what went wrong and why (only if task failed)\n"
            "- **Finding**: key discoveries, data points, or decisions made\n\n"
            f"Task: {task[:500]}\n"
            f"Result ({status}): {output[:2000]}\n\n"
            "Output concise bullet points under the relevant categories.\n"
            "Skip categories with no insights. If nothing is worth remembering, output: NONE"
        )

        try:
            response = await backend.execute(prompt, system="You extract categorized knowledge concisely.", timeout=30)  # type: ignore[attr-defined]
            content = response.content.strip()
            if "NONE" in content.upper() or len(content) < 20:
                return

            # Deduplicate: check if similar content already exists
            existing = self._memory_path.read_text(encoding="utf-8") if self._memory_path.exists() else ""
            if self._is_duplicate(content, existing):
                logger.debug("Auto-memory skipped duplicate for %s", self._memory_path.parent.name)
                return

            self._append(content, success)
            logger.info("Auto-memory updated for %s (%s)", self._memory_path.parent.name, status)
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

    def _is_duplicate(self, new_content: str, existing: str) -> bool:
        """Check if the new content is too similar to existing memory."""
        if not existing:
            return False
        # Extract bullet points from new content
        new_bullets = {
            line.strip().lower()
            for line in new_content.splitlines()
            if line.strip().startswith(("-", "*", "•"))
        }
        if not new_bullets:
            return False
        # Check overlap with existing
        existing_lower = existing.lower()
        matches = sum(1 for b in new_bullets if b.lstrip("-*• ") in existing_lower)
        return matches >= len(new_bullets) * 0.7  # 70%+ overlap = duplicate

    def _append(self, content: str, success: bool) -> None:
        """Append categorized insights to MEMORY.md."""
        from datetime import datetime

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        icon = "✓" if success else "✗"
        entry = f"\n### [{timestamp}] {icon}\n{content}\n"

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
