"""Dynamic agent discovery — scan project directories for SOUL.md to find agents."""

from __future__ import annotations

import logging
from pathlib import Path

from openags.models import AgentConfig, DoneStrategy

logger = logging.getLogger(__name__)

_ROOT_DEFAULT_TOOLS = [
    "check_progress",
    "dispatch_agent",
    "ask_user",
    "read",
    "ls",
    "grep",
    "bash",
    "sub_agent",
]
_SUB_DEFAULT_TOOLS = [
    "read",
    "write",
    "edit",
    "ls",
    "grep",
    "sub_agent",
]


class AgentDiscovery:
    """Scan project directories to discover agents by SOUL.md presence."""

    @staticmethod
    def discover(project_dir: Path) -> dict[str, AgentConfig]:
        """Discover all agents in a project directory."""
        agents: dict[str, AgentConfig] = {}

        # Root = coordinator
        root_config = AgentDiscovery._load_from_dir(project_dir, is_root=True)
        agents[root_config.name] = root_config

        # Scan first-level subdirectories
        if not project_dir.exists():
            return agents

        for child in sorted(project_dir.iterdir()):
            if not child.is_dir() or child.name.startswith("."):
                continue
            soul_path = child / "SOUL.md"
            has_sessions = (child / "sessions").is_dir()
            has_memory = (child / "memory.md").exists()
            if soul_path.exists() or has_sessions or has_memory:
                config = AgentDiscovery._load_from_dir(child, is_root=False)
                agents[config.name] = config

        return agents

    @staticmethod
    def _load_from_dir(directory: Path, *, is_root: bool = False) -> AgentConfig:
        """Load agent config from directory's SOUL.md frontmatter, or use defaults."""
        soul_path = directory / "SOUL.md"

        if soul_path.exists():
            from openags.agent.soul import parse_soul

            config, _ = parse_soul(soul_path)
            # Fill defaults based on root/sub
            if not config.tools:
                config.tools = list(
                    _ROOT_DEFAULT_TOOLS if is_root else _SUB_DEFAULT_TOOLS
                )
            if is_root:
                config.mode = "root"
            return config

        # No SOUL.md — pure defaults
        name = "coordinator" if is_root else directory.name
        return AgentConfig(
            name=name,
            description=f"Agent for {name}",
            tools=list(_ROOT_DEFAULT_TOOLS if is_root else _SUB_DEFAULT_TOOLS),
            done_strategy=DoneStrategy.COORDINATOR if is_root else DoneStrategy.DEFAULT,
            mode="root" if is_root else "subagent",
        )
