"""Runtime adapter — converts SOUL.md + skills + memory into CLI agent config files.

Before launching an external CLI agent (Claude Code, Codex, etc.) in a folder,
this module reads the OpenAGS configuration and generates the equivalent config
file that the CLI agent will auto-load.

Adapter mapping:
    Claude Code  → CLAUDE.md (auto-read from cwd)
    Codex        → AGENTS.md
    Copilot      → .github/copilot-instructions.md
    Gemini CLI   → GEMINI.md
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def _read_soul(folder: Path) -> str:
    """Read SOUL.md body (the prompt part, not frontmatter)."""
    soul_path = folder / "SOUL.md"
    if not soul_path.exists():
        return ""

    from openags.agent.soul import parse_soul

    _, body = parse_soul(soul_path)
    return body


def _read_skills(folder: Path) -> list[str]:
    """Read all skill .md bodies from folder/skills/."""
    skills_dir = folder / "skills"
    if not skills_dir.is_dir():
        return []

    bodies: list[str] = []
    for path in sorted(skills_dir.rglob("*.md")):
        text = path.read_text(encoding="utf-8")
        # Strip frontmatter if present
        if text.startswith("---"):
            try:
                end = text.index("---", 3)
                text = text[end + 3:].strip()
            except ValueError:
                pass
        if text.strip():
            bodies.append(text)
    return bodies


def _read_memory(folder: Path) -> str:
    """Read memory.md content."""
    memory_path = folder / "memory.md"
    if not memory_path.exists():
        return ""
    content = memory_path.read_text(encoding="utf-8").strip()
    return content


def _read_auto_memory(folder: Path) -> str:
    """Read MEMORY.md (auto-learned knowledge)."""
    mem_path = folder / "MEMORY.md"
    if not mem_path.exists():
        return ""
    content = mem_path.read_text(encoding="utf-8").strip()
    # Only use first 200 lines (same as auto_memory.py convention)
    lines = content.splitlines()
    if len(lines) > 200:
        lines = lines[:200]
    return "\n".join(lines)


def _build_combined_prompt(folder: Path) -> str:
    """Build a combined system prompt from SOUL.md + skills + memory."""
    parts: list[str] = []

    # 1. SOUL.md body (role definition)
    soul = _read_soul(folder)
    if soul:
        parts.append(soul)

    # 2. Skills
    skills = _read_skills(folder)
    if skills:
        parts.append("## Skills\n")
        for skill_body in skills:
            parts.append(skill_body)

    # 3. Memory context
    memory = _read_memory(folder)
    if memory:
        parts.append(f"## Project Memory\n\n{memory}")

    # 4. Auto-learned memory (only if different from memory.md)
    auto_mem = _read_auto_memory(folder)
    if auto_mem and auto_mem != memory:
        parts.append(f"## Learned Knowledge\n\n{auto_mem}")

    return "\n\n".join(parts)


def generate_claude_md(folder: Path) -> Path:
    """Generate CLAUDE.md for Claude Code from SOUL.md + skills + memory.

    Claude Code auto-reads CLAUDE.md from the working directory.
    Returns the path to the generated file.
    """
    content = _build_combined_prompt(folder)
    if not content:
        content = f"You are an AI assistant working in the {folder.name} directory."

    out = folder / "CLAUDE.md"
    out.write_text(content + "\n", encoding="utf-8")
    logger.info("Generated CLAUDE.md in %s (%d chars)", folder, len(content))
    return out


def generate_agents_md(folder: Path) -> Path:
    """Generate AGENTS.md for Codex from SOUL.md + skills + memory."""
    content = _build_combined_prompt(folder)
    if not content:
        content = f"You are an AI assistant working in the {folder.name} directory."

    out = folder / "AGENTS.md"
    out.write_text(content + "\n", encoding="utf-8")
    logger.info("Generated AGENTS.md in %s (%d chars)", folder, len(content))
    return out


def generate_copilot_md(folder: Path) -> Path:
    """Generate .github/copilot-instructions.md for Copilot."""
    content = _build_combined_prompt(folder)
    if not content:
        content = f"You are an AI assistant working in the {folder.name} directory."

    out_dir = folder / ".github"
    out_dir.mkdir(exist_ok=True)
    out = out_dir / "copilot-instructions.md"
    out.write_text(content + "\n", encoding="utf-8")
    logger.info("Generated copilot-instructions.md in %s", folder)
    return out


def generate_gemini_md(folder: Path) -> Path:
    """Generate GEMINI.md for Gemini CLI."""
    content = _build_combined_prompt(folder)
    if not content:
        content = f"You are an AI assistant working in the {folder.name} directory."

    out = folder / "GEMINI.md"
    out.write_text(content + "\n", encoding="utf-8")
    logger.info("Generated GEMINI.md in %s", folder)
    return out


# Registry: runtime type → generator function
_GENERATORS: dict[str, object] = {
    "claude_code": generate_claude_md,
    "codex": generate_agents_md,
    "copilot": generate_copilot_md,
    "gemini_cli": generate_gemini_md,
}


def prepare_folder_for_cli(folder: Path, runtime_type: str) -> Path | None:
    """Prepare a folder for a specific CLI agent runtime.

    Reads SOUL.md + skills + memory and generates the appropriate config file
    that the CLI agent will auto-load when started in this folder.

    Returns the generated file path, or None if no generator exists.
    """
    generator = _GENERATORS.get(runtime_type)
    if generator is None:
        logger.warning("No adapter for runtime '%s'", runtime_type)
        return None
    return generator(folder)  # type: ignore[operator]
