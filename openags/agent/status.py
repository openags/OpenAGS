"""STATUS.md reader/writer — execution result from Sub-Agent.

Implements four-layer parsing for resilience against malformed LLM output:
  Layer 1: Full YAML frontmatter parse
  Layer 2: Regex extraction of key fields
  Layer 3: Heuristic body scan (keywords)
  Layer 4: Fallback — treat as failed with parse_error
"""

from __future__ import annotations

import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import yaml

from openags.models import (
    AgentResult,
    AgentStatus,
    ExitReason,
    StatusModel,
    TokenUsage,
)

STATUS_FILENAME = "STATUS.md"


def write_status(agent_dir: Path, status: StatusModel) -> None:
    """Write STATUS.md atomically (tmp + rename)."""
    agent_dir.mkdir(parents=True, exist_ok=True)

    # Build frontmatter (exclude body fields)
    fm: dict[str, object] = {
        "directive_id": status.directive_id,
        "agent": status.agent,
        "status": status.status.value,
    }
    if status.started_at:
        fm["started_at"] = status.started_at
    if status.completed_at:
        fm["completed_at"] = status.completed_at
    if status.duration_seconds > 0:
        fm["duration_seconds"] = round(status.duration_seconds, 1)
    if status.exit_reason:
        fm["exit_reason"] = status.exit_reason.value
    if status.error_message:
        fm["error_message"] = status.error_message
    if status.artifacts:
        fm["artifacts"] = status.artifacts
    if status.quality_self_assessment > 0:
        fm["quality_self_assessment"] = status.quality_self_assessment
    if status.backend:
        fm["backend"] = status.backend

    parts = [
        "---",
        yaml.dump(fm, default_flow_style=False, allow_unicode=True).strip(),
        "---",
        "",
    ]

    if status.summary:
        parts.extend(["## Summary", "", status.summary, ""])
    if status.acceptance_criteria_met:
        parts.extend(["## Acceptance Criteria Met", "", status.acceptance_criteria_met, ""])
    if status.issues:
        parts.extend(["## Issues", "", status.issues, ""])
    if status.recommendations:
        parts.extend(["## Recommendations", "", status.recommendations, ""])

    content = "\n".join(parts)

    target = agent_dir / STATUS_FILENAME
    fd, tmp_path = tempfile.mkstemp(dir=str(agent_dir), suffix=".tmp")
    try:
        os.write(fd, content.encode("utf-8"))
        os.close(fd)
        os.rename(tmp_path, str(target))
    except Exception:
        try:
            os.close(fd)
        except OSError:
            pass
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise


def write_status_from_result(
    agent_dir: Path,
    directive_id: str,
    agent_name: str,
    result: AgentResult,
    started_at: datetime,
) -> None:
    """Convert AgentResult to StatusModel and write STATUS.md.

    Used by the builtin backend path — guarantees well-formed output.
    """
    now = datetime.now(tz=timezone.utc)
    duration = (now - started_at).total_seconds()

    status = StatusModel(
        directive_id=directive_id,
        agent=agent_name,
        status=AgentStatus.COMPLETED if result.success else AgentStatus.FAILED,
        started_at=started_at.isoformat(),
        completed_at=now.isoformat(),
        duration_seconds=duration,
        exit_reason=ExitReason.TASK_COMPLETE if result.success else ExitReason.ERROR,
        error_message=result.error,
        artifacts=[str(p) for p in result.artifacts],
        token_usage=result.token_usage,
        backend="builtin",
        summary=result.output[:500] if result.output else "",
    )

    write_status(agent_dir, status)


def write_failed_status(
    agent_dir: Path,
    directive_id: str,
    agent_name: str,
    reason: ExitReason,
    error_message: str,
) -> None:
    """Write a failed STATUS.md — used by orchestrator for crashes/timeouts."""
    now = datetime.now(tz=timezone.utc)
    status = StatusModel(
        directive_id=directive_id,
        agent=agent_name,
        status=AgentStatus.FAILED,
        completed_at=now.isoformat(),
        exit_reason=reason,
        error_message=error_message,
        summary=f"Failed: {error_message}",
    )
    write_status(agent_dir, status)


def parse_status(agent_dir: Path) -> StatusModel | None:
    """Parse STATUS.md with four-layer fallback. Returns None if not found."""
    path = agent_dir / STATUS_FILENAME
    if not path.exists():
        return None

    raw = path.read_text(encoding="utf-8")

    # Layer 1: Full YAML frontmatter parse
    fm_match = re.match(r"^---\n(.*?)\n---", raw, re.DOTALL)
    if fm_match:
        try:
            fm = yaml.safe_load(fm_match.group(1))
            if isinstance(fm, dict) and "status" in fm:
                body = raw[fm_match.end():]
                return _build_status_from_parsed(fm, body)
        except yaml.YAMLError:
            pass

    # Layer 2: Regex extraction of key fields
    status_val = _regex_field(raw, "status")
    directive_id = _regex_field(raw, "directive_id")
    agent = _regex_field(raw, "agent")
    if status_val:
        return StatusModel(
            directive_id=directive_id or "unknown",
            agent=agent or "unknown",
            status=_safe_status(status_val),
            exit_reason=_safe_exit_reason(_regex_field(raw, "exit_reason")),
            error_message=_regex_field(raw, "error_message"),
            summary=_extract_section(raw, "Summary"),
        )

    # Layer 3: Heuristic from body content
    lower = raw.lower()
    if any(kw in lower for kw in ("completed", "finished", "done", "task_complete")):
        return StatusModel(
            directive_id="synthesized",
            status=AgentStatus.COMPLETED,
            exit_reason=ExitReason.TASK_COMPLETE,
            summary=_extract_section(raw, "Summary") or raw[:200],
        )
    if any(kw in lower for kw in ("failed", "error", "exception", "traceback")):
        return StatusModel(
            directive_id="synthesized",
            status=AgentStatus.FAILED,
            exit_reason=ExitReason.ERROR,
            error_message=raw[:200],
            summary=_extract_section(raw, "Summary") or raw[:200],
        )

    # Layer 4: Unparseable — treat as failed
    return StatusModel(
        directive_id="parse_error",
        status=AgentStatus.FAILED,
        exit_reason=ExitReason.PARSE_ERROR,
        error_message="Could not parse STATUS.md",
        summary=raw[:200],
    )


def status_is_terminal(status: StatusModel) -> bool:
    """Check if status represents a terminal state."""
    return status.status in (AgentStatus.COMPLETED, AgentStatus.FAILED, AgentStatus.ABORTED)


def _build_status_from_parsed(fm: dict[str, object], body: str) -> StatusModel:
    """Build StatusModel from parsed frontmatter + body."""
    # Parse token_usage if present
    tu_raw = fm.get("token_usage")
    tu = TokenUsage()
    if isinstance(tu_raw, dict):
        tu = TokenUsage(
            input_tokens=int(tu_raw.get("input", tu_raw.get("input_tokens", 0))),
            output_tokens=int(tu_raw.get("output", tu_raw.get("output_tokens", 0))),
            cost_usd=float(tu_raw.get("cost_usd", 0)),
        )

    return StatusModel(
        directive_id=str(fm.get("directive_id", "unknown")),
        agent=str(fm.get("agent", "unknown")),
        status=_safe_status(str(fm.get("status", "idle"))),
        started_at=str(fm.get("started_at", "")),
        completed_at=str(fm.get("completed_at", "")),
        duration_seconds=float(fm.get("duration_seconds", 0)),
        exit_reason=_safe_exit_reason(fm.get("exit_reason")),
        error_message=_str_or_none(fm.get("error_message")),
        artifacts=list(fm.get("artifacts", [])),
        quality_self_assessment=int(fm.get("quality_self_assessment", 0)),
        token_usage=tu,
        backend=str(fm.get("backend", "")),
        summary=_extract_section(body, "Summary"),
        acceptance_criteria_met=_extract_section(body, "Acceptance Criteria Met"),
        issues=_extract_section(body, "Issues"),
        recommendations=_extract_section(body, "Recommendations"),
    )


def _safe_status(val: str) -> AgentStatus:
    """Convert string to AgentStatus with fallback."""
    try:
        return AgentStatus(val.strip().lower())
    except ValueError:
        return AgentStatus.IDLE


def _safe_exit_reason(val: object) -> ExitReason | None:
    """Convert value to ExitReason with fallback."""
    if val is None:
        return None
    try:
        return ExitReason(str(val).strip().lower())
    except ValueError:
        return ExitReason.ERROR


def _str_or_none(val: object) -> str | None:
    """Convert to string or None."""
    if val is None:
        return None
    s = str(val).strip()
    return s if s and s != "null" and s != "None" else None


def _regex_field(text: str, field: str) -> str | None:
    """Extract a YAML field value via regex."""
    m = re.search(rf'^{field}:\s*["\']?(.+?)["\']?\s*$', text, re.MULTILINE)
    return m.group(1).strip() if m else None


def _extract_section(text: str, heading: str) -> str:
    """Extract content under a ## Heading until the next ## or end."""
    pattern = rf"^## {re.escape(heading)}\s*\n(.*?)(?=^## |\Z)"
    m = re.search(pattern, text, re.MULTILINE | re.DOTALL)
    return m.group(1).strip() if m else ""
