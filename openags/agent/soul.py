"""SOUL.md parser — extract YAML frontmatter config + markdown prompt body."""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from openags.models import AgentConfig

_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?", re.DOTALL)


def parse_soul(path: Path) -> tuple[AgentConfig, str]:
    """Parse SOUL.md, return (config, prompt_body).

    If no frontmatter, returns default config (name from directory) + full text as prompt.
    """
    text = path.read_text(encoding="utf-8")
    match = _FRONTMATTER_RE.match(text)

    if match:
        raw: dict[str, object] = yaml.safe_load(match.group(1)) or {}
        body = text[match.end() :]
        if "name" not in raw:
            raw["name"] = path.parent.name or "coordinator"
        config = AgentConfig(**raw, source_path=path)
    else:
        name = path.parent.name or "coordinator"
        config = AgentConfig(name=name, source_path=path)
        body = text

    return config, body.strip()


def write_soul(path: Path, config: AgentConfig, body: str) -> None:
    """Write SOUL.md with frontmatter + body."""
    data = config.model_dump(
        exclude={"source_path"},
        exclude_none=True,
        exclude_defaults=True,
    )
    # Always include name
    data["name"] = config.name
    parts = ["---", yaml.dump(data, allow_unicode=True).strip(), "---", "", body]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(parts) + "\n", encoding="utf-8")
