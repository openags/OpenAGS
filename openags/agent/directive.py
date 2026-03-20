"""DIRECTIVE.md reader/writer — task assignment from Coordinator to Sub-Agent."""

from __future__ import annotations

import os
import re
import secrets
import tempfile
from datetime import UTC, datetime
from pathlib import Path

import yaml

from openags.models import DirectiveAction, DirectiveDecision, DirectiveModel, DirectivePriority

DIRECTIVE_FILENAME = "DIRECTIVE.md"


def generate_directive_id(agent_name: str) -> str:
    """Generate a unique directive ID: d-YYYYMMDD-HHmmss-agent-4hex."""
    now = datetime.now(tz=UTC)
    ts = now.strftime("%Y%m%d-%H%M%S")
    hex4 = secrets.token_hex(2)
    return f"d-{ts}-{agent_name}-{hex4}"


def write_directive(agent_dir: Path, directive: DirectiveModel) -> None:
    """Write DIRECTIVE.md atomically (tmp + rename)."""
    agent_dir.mkdir(parents=True, exist_ok=True)

    # Build frontmatter
    fm: dict[str, object] = {
        "directive_id": directive.directive_id,
        "phase": directive.phase,
        "action": directive.action.value,
        "priority": directive.priority.value,
        "created_at": directive.created_at or datetime.now(tz=UTC).isoformat(),
        "timeout_seconds": directive.timeout_seconds,
        "max_attempts": directive.max_attempts,
        "attempt": directive.attempt,
        "decision": directive.decision.value,
        "decision_reason": directive.decision_reason,
    }
    if directive.depends_on:
        fm["depends_on"] = directive.depends_on

    # Build body
    parts = [
        "---",
        yaml.dump(fm, default_flow_style=False, allow_unicode=True).strip(),
        "---",
        "",
    ]

    if directive.task:
        parts.extend(["## Task", "", directive.task, ""])
    if directive.acceptance_criteria:
        parts.extend(["## Acceptance Criteria", "", directive.acceptance_criteria, ""])
    if directive.context:
        parts.extend(["## Context", "", directive.context, ""])
    if directive.upstream_data:
        parts.extend(["## Upstream Data", "", directive.upstream_data, ""])

    content = "\n".join(parts)

    # Atomic write
    target = agent_dir / DIRECTIVE_FILENAME
    fd, tmp_path = tempfile.mkstemp(dir=str(agent_dir), suffix=".tmp")
    try:
        os.write(fd, content.encode("utf-8"))
        os.close(fd)
        os.rename(tmp_path, str(target))
    except Exception:
        os.close(fd) if not os.get_inheritable(fd) else None
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise


def parse_directive(agent_dir: Path) -> DirectiveModel | None:
    """Parse DIRECTIVE.md with multi-layer fallback. Returns None if not found."""
    path = agent_dir / DIRECTIVE_FILENAME
    if not path.exists():
        return None

    raw = path.read_text(encoding="utf-8")

    # Layer 1: YAML frontmatter
    fm_match = re.match(r"^---\n(.*?)\n---", raw, re.DOTALL)
    if fm_match:
        try:
            fm = yaml.safe_load(fm_match.group(1))
            if isinstance(fm, dict) and "directive_id" in fm:
                body = raw[fm_match.end() :]
                return _build_directive_from_parsed(fm, body)
        except yaml.YAMLError:
            pass

    # Layer 2: Regex extraction
    did = _regex_field(raw, "directive_id")
    if did:
        return DirectiveModel(
            directive_id=did,
            phase=_regex_field(raw, "phase") or "",
            action=DirectiveAction(_regex_field(raw, "action") or "execute"),
            task=_extract_section(raw, "Task"),
        )

    # Layer 3: Unparseable — return minimal
    return DirectiveModel(
        directive_id="unknown",
        task=raw.strip(),
    )


def _build_directive_from_parsed(fm: dict[str, object], body: str) -> DirectiveModel:
    """Build DirectiveModel from parsed frontmatter + body."""
    action_val = str(fm.get("action", "execute"))
    priority_val = str(fm.get("priority", "normal"))
    decision_val = str(fm.get("decision", "PROCEED"))

    return DirectiveModel(
        directive_id=str(fm.get("directive_id", "unknown")),
        phase=str(fm.get("phase", "")),
        action=DirectiveAction(action_val)
        if action_val in DirectiveAction.__members__.values()
        else DirectiveAction.EXECUTE,
        priority=DirectivePriority(priority_val)
        if priority_val in DirectivePriority.__members__.values()
        else DirectivePriority.NORMAL,
        created_at=str(fm.get("created_at", "")),
        timeout_seconds=int(fm.get("timeout_seconds", 1800)),
        max_attempts=int(fm.get("max_attempts", 2)),
        attempt=int(fm.get("attempt", 1)),
        decision=DirectiveDecision(decision_val)
        if decision_val in DirectiveDecision.__members__.values()
        else DirectiveDecision.PROCEED,
        decision_reason=str(fm.get("decision_reason", "")),
        depends_on=list(fm.get("depends_on", [])),
        task=_extract_section(body, "Task"),
        acceptance_criteria=_extract_section(body, "Acceptance Criteria"),
        context=_extract_section(body, "Context"),
        upstream_data=_extract_section(body, "Upstream Data"),
    )


def _regex_field(text: str, field: str) -> str | None:
    """Extract a YAML field value via regex."""
    m = re.search(rf'^{field}:\s*["\']?(.+?)["\']?\s*$', text, re.MULTILINE)
    return m.group(1).strip() if m else None


def _extract_section(text: str, heading: str) -> str:
    """Extract content under a ## Heading until the next ## or end."""
    pattern = rf"^## {re.escape(heading)}\s*\n(.*?)(?=^## |\Z)"
    m = re.search(pattern, text, re.MULTILINE | re.DOTALL)
    return m.group(1).strip() if m else ""
