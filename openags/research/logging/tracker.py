"""Token usage and cost tracking (JSONL-based, no DB dependency)."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from openags.models import TokenUsage


class _UsageTotals:
    """Accumulator for token usage totals."""

    __slots__ = ("input_tokens", "output_tokens", "cost_usd", "calls")

    def __init__(self) -> None:
        self.input_tokens: int = 0
        self.output_tokens: int = 0
        self.cost_usd: float = 0.0
        self.calls: int = 0

    def to_dict(self) -> dict[str, int | float]:
        return {
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "cost_usd": self.cost_usd,
            "calls": self.calls,
        }


class TokenTracker:
    """Records token usage to a JSONL file for analysis."""

    def __init__(self, log_dir: Path) -> None:
        self._log_path = log_dir / "token_usage.jsonl"
        self._log_path.parent.mkdir(parents=True, exist_ok=True)

    def record(
        self,
        project_id: str,
        agent_role: str,
        usage: TokenUsage,
    ) -> None:
        entry = {
            "timestamp": datetime.now().isoformat(timespec="seconds"),
            "project_id": project_id,
            "agent_role": agent_role,
            **usage.model_dump(),
        }
        with open(self._log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")

    def summary(self, project_id: str | None = None) -> dict[str, int | float]:
        """Aggregate token usage, optionally filtered by project."""
        totals = _UsageTotals()
        if not self._log_path.exists():
            return totals.to_dict()

        for line in self._log_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            entry = json.loads(line)
            if project_id and entry.get("project_id") != project_id:
                continue
            totals.input_tokens += entry.get("input_tokens", 0)
            totals.output_tokens += entry.get("output_tokens", 0)
            totals.cost_usd += entry.get("cost_usd", 0.0)
            totals.calls += 1

        return totals.to_dict()
