"""Skill engine — loads, indexes, and queries SKILL.md files.

Skills are markdown files with YAML frontmatter defining metadata.
The engine scans skill directories recursively and provides:
  - Agent-based skill lookup (which skills apply to which agent)
  - Trigger matching (auto-activate skills based on user input)
  - Path matching (auto-activate skills for file operations)
  - Content injection (append skill instructions to agent prompts)

SKILL.md format (directory-based, Claude Code compatible):
    skills/
      search-papers/
        SKILL.md       ← entry point (required)
        templates/      ← optional support files

    SKILL.md:
    ---
    name: search-papers
    description: Search arXiv for papers
    roles: [literature, coordinator]
    tools: [arxiv]
    triggers: ["search papers", "find literature"]
    allowed-tools: Read, Write, Bash(curl *)    # Claude Code field
    ---
    ## Instructions
    When the user asks to find papers...
"""

from __future__ import annotations

import fnmatch
import logging
from pathlib import Path

import yaml

from openags.models import SkillMeta

logger = logging.getLogger(__name__)


class SkillEngine:
    """Load, index, and query SKILL.md files from one or more directories."""

    def __init__(self, skill_dirs: list[Path] | None = None) -> None:
        self._skills: dict[str, SkillMeta] = {}
        self._content: dict[str, str] = {}  # name → markdown body

        for d in skill_dirs or []:
            self._load_dir(d)

    # ── Loading ────────────────────────────────────────

    def _load_dir(self, directory: Path) -> None:
        if not directory.exists():
            logger.debug("Skill dir not found: %s", directory)
            return

        count = 0
        # Prefer directory-based format: skill-name/SKILL.md (Claude Code compatible)
        for path in directory.rglob("SKILL.md"):
            try:
                meta, body = self._parse_skill(path)
                self._skills[meta.name] = meta
                self._content[meta.name] = body
                count += 1
            except (ValueError, KeyError, yaml.YAMLError) as e:
                logger.debug("Skipping %s: %s", path, e)

        # Also load legacy flat files: skill_name.md (backward compat)
        for path in directory.rglob("*.md"):
            if path.name == "SKILL.md" or path.name == "SOUL.md":
                continue  # Already loaded or not a skill
            try:
                meta, body = self._parse_skill(path)
                if meta.name not in self._skills:
                    self._skills[meta.name] = meta
                    self._content[meta.name] = body
                    count += 1
            except (ValueError, KeyError, yaml.YAMLError) as e:
                logger.debug("Skipping %s: %s", path, e)

        logger.info("Loaded %d skills from %s", count, directory)

    def load_single(self, path: Path) -> SkillMeta | None:
        """Load a single skill file. Returns meta or None on failure."""
        try:
            meta, body = self._parse_skill(path)
            self._skills[meta.name] = meta
            self._content[meta.name] = body
            return meta
        except (ValueError, KeyError, yaml.YAMLError) as e:
            logger.warning("Failed to load skill %s: %s", path, e)
            return None

    @staticmethod
    def _parse_skill(path: Path) -> tuple[SkillMeta, str]:
        """Parse a SKILL.md file into (meta, body)."""
        text = path.read_text(encoding="utf-8")

        if not text.startswith("---"):
            raise ValueError(f"No YAML frontmatter in {path}")

        # Find closing ---
        end = text.index("---", 3)
        frontmatter_text = text[3:end]
        body = text[end + 3:].strip()

        frontmatter = yaml.safe_load(frontmatter_text)
        if not isinstance(frontmatter, dict):
            raise ValueError(f"Invalid frontmatter in {path}")

        meta = SkillMeta(source_path=path, **frontmatter)
        return meta, body

    # ── Query ──────────────────────────────────────────

    def get(self, name: str) -> SkillMeta | None:
        """Get skill metadata by name."""
        return self._skills.get(name)

    def get_content(self, name: str) -> str | None:
        """Get the markdown body of a skill."""
        return self._content.get(name)

    def get_all(self) -> list[SkillMeta]:
        """List all loaded skills."""
        return list(self._skills.values())

    def get_for_role(self, role: str) -> list[SkillMeta]:
        """Get all skills applicable to a specific agent role/name."""
        return [s for s in self._skills.values() if role in s.roles]

    def get_for_agent(self, agent_name: str) -> list[SkillMeta]:
        """Get all skills applicable to an agent by name.

        Checks both the `agents` field and the `roles` field.
        Also matches skills with agents: ["*"] (wildcard).
        """
        results: list[SkillMeta] = []
        for s in self._skills.values():
            if s.agents and (agent_name in s.agents or "*" in s.agents):
                results.append(s)
            elif agent_name in s.roles:
                results.append(s)
        return results

    def get_always_skills(self, agent_name: str) -> list[SkillMeta]:
        """Get skills that should always be injected for an agent."""
        results: list[SkillMeta] = []
        for s in self._skills.values():
            if "always" not in [t.lower() for t in s.triggers]:
                continue
            if s.agents and (agent_name in s.agents or "*" in s.agents):
                results.append(s)
            elif agent_name in s.roles:
                results.append(s)
        return results

    def match_trigger(self, user_input: str) -> list[SkillMeta]:
        """Find skills whose triggers match the user input."""
        user_lower = user_input.lower()
        matched: list[SkillMeta] = []
        for skill in self._skills.values():
            for trigger in skill.triggers:
                if trigger.lower() != "always" and trigger.lower() in user_lower:
                    matched.append(skill)
                    break
        return matched

    def match_paths(self, file_paths: list[str]) -> list[SkillMeta]:
        """Find skills whose paths patterns match the given file paths.

        Used for Phase 11 path-specific rules: when an agent reads/writes
        a file, skills with matching paths are dynamically injected.
        """
        matched: list[SkillMeta] = []
        for skill in self._skills.values():
            if not skill.paths:
                continue
            for pattern in skill.paths:
                for fp in file_paths:
                    if fnmatch.fnmatch(fp, pattern):
                        matched.append(skill)
                        break
                else:
                    continue
                break
        return matched

    def build_prompt_injection(
        self,
        agent_name: str,
        user_input: str = "",
    ) -> str:
        """Build skill instructions to inject into agent prompt.

        Combines:
          1. Always-active skills for this agent
          2. Trigger-matched skills from user input
        """
        skills_to_inject: dict[str, str] = {}

        # Always-active skills
        always = self.get_always_skills(agent_name)
        for meta in always:
            content = self.get_content(meta.name)
            if content:
                skills_to_inject[meta.name] = content

        # Trigger-matched skills
        if user_input:
            for meta in self.match_trigger(user_input):
                if meta.name not in skills_to_inject:
                    content = self.get_content(meta.name)
                    if content:
                        skills_to_inject[meta.name] = content

        if not skills_to_inject:
            return ""

        parts = ["## Active Skills\n"]
        for name, content in skills_to_inject.items():
            parts.append(f"### Skill: {name}\n{content}\n")

        return "\n".join(parts)

    # ── Management ─────────────────────────────────────

    def count(self) -> int:
        return len(self._skills)

    def remove(self, name: str) -> bool:
        """Remove a skill by name. Returns True if removed."""
        if name in self._skills:
            del self._skills[name]
            self._content.pop(name, None)
            return True
        return False
