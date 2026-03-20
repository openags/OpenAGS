"""CheckProgress tool — inspect a module's status, outputs, and history."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from openags.agent.discovery import AgentDiscovery
from openags.agent.tools.base import ToolResult

logger = logging.getLogger(__name__)


class CheckProgressTool:
    """Check the progress of a research module (satisfies Tool protocol).

    Uses ``AgentDiscovery`` to dynamically find modules instead of a
    hardcoded list.  Returns a summary of:
    - Module memory (what has been accomplished)
    - Key output files
    - Recent session history
    """

    _name = "check_progress"
    _description = (
        "Check the progress of a research module. "
        "Returns memory, output files, and recent activity. "
        "Omit 'module' to get an overview of all discovered modules."
    )

    def __init__(self, workspace: Path) -> None:
        self._workspace = workspace

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    def _discover_modules(self) -> dict[str, str]:
        """Discover agent modules and return {name: directory_name} mapping."""
        discovered = AgentDiscovery.discover(self._workspace)
        modules: dict[str, str] = {}
        for agent_name, config in discovered.items():
            if agent_name in ("ags", "coordinator"):
                continue
            # The directory name is the agent name (discovery scans subdirs)
            modules[agent_name] = agent_name
        return modules

    async def invoke(self, **kwargs: Any) -> ToolResult:
        module = kwargs.get("module", "")

        if not module:
            return await self._overview()

        return await self._module_status(module.lower(), module.lower())

    async def _overview(self) -> ToolResult:
        """Quick overview of all discovered modules."""
        modules = self._discover_modules()
        lines: list[str] = ["## Project Progress Overview\n"]

        if not modules:
            lines.append("No agent modules discovered.")
            return ToolResult(success=True, data="\n".join(lines))

        from openags.agent.status import parse_status

        for module_name, dir_name in sorted(modules.items()):
            mod_dir = self._workspace / dir_name

            # Prefer STATUS.md for workflow state
            agent_status = parse_status(mod_dir)
            if agent_status and agent_status.status.value != "idle":
                status_str = agent_status.status.value
                extra = ""
                if agent_status.summary:
                    extra = f" — {agent_status.summary[:80]}"
                lines.append(f"- **{module_name}**: {status_str}{extra}")
                continue

            # Fallback: file-based heuristic
            memory_path = mod_dir / "memory.md"
            has_memory = memory_path.exists() and memory_path.stat().st_size > 10

            file_count = 0
            if mod_dir.exists():
                for f in mod_dir.rglob("*"):
                    if (
                        f.is_file()
                        and "agent" not in str(f)
                        and "sessions" not in str(f)
                        and f.name not in ("memory.md", "SOUL.md", "DIRECTIVE.md", "STATUS.md",
                                           "CLAUDE.md", "AGENTS.md", "GEMINI.md")
                    ):
                        file_count += 1

            status = "has content" if has_memory or file_count > 0 else "not started"
            lines.append(f"- **{module_name}**: {status} ({file_count} files)")

        return ToolResult(success=True, data="\n".join(lines))

    async def _module_status(self, module: str, dir_name: str) -> ToolResult:
        """Detailed status of a specific module."""
        mod_dir = self._workspace / dir_name

        if not mod_dir.exists():
            return ToolResult(
                success=False,
                error=f"Module directory '{dir_name}' does not exist.",
            )

        parts: list[str] = [f"## {module.title()} Module Status\n"]

        # 0. Workflow status (DIRECTIVE.md + STATUS.md)
        from openags.agent.directive import parse_directive
        from openags.agent.status import parse_status

        directive = parse_directive(mod_dir)
        agent_status = parse_status(mod_dir)

        if agent_status and agent_status.status.value != "idle":
            parts.append("### Workflow Status")
            parts.append(f"- **Status**: {agent_status.status.value}")
            if agent_status.exit_reason:
                parts.append(f"- **Exit Reason**: {agent_status.exit_reason.value}")
            if agent_status.quality_self_assessment:
                parts.append(f"- **Quality**: {agent_status.quality_self_assessment}/5")
            if agent_status.summary:
                parts.append(f"- **Summary**: {agent_status.summary[:300]}")
            if agent_status.error_message:
                parts.append(f"- **Error**: {agent_status.error_message[:200]}")
            if agent_status.artifacts:
                parts.append(f"- **Artifacts**: {', '.join(agent_status.artifacts)}")
            parts.append("")

        if directive:
            parts.append("### Current Directive")
            parts.append(f"- **Action**: {directive.action.value}")
            parts.append(f"- **Decision**: {directive.decision.value}")
            parts.append(f"- **Attempt**: {directive.attempt}/{directive.max_attempts}")
            if directive.task:
                parts.append(f"- **Task**: {directive.task[:200]}")
            parts.append("")

        # 1. Memory content
        memory_path = mod_dir / "memory.md"
        if memory_path.exists():
            memory_text = memory_path.read_text(encoding="utf-8").strip()
            if memory_text:
                if len(memory_text) > 1500:
                    memory_text = memory_text[:1500] + "\n... (truncated)"
                parts.append(f"### Memory\n{memory_text}\n")
            else:
                parts.append("### Memory\n(empty)\n")
        else:
            parts.append("### Memory\n(no memory file)\n")

        # 2. Output files
        parts.append("### Output Files")
        file_list: list[str] = []
        if mod_dir.exists():
            for f in sorted(mod_dir.rglob("*")):
                if not f.is_file():
                    continue
                rel = str(f.relative_to(mod_dir))
                if any(skip in rel for skip in ["agent/", "sessions/", "memory.md", ".versions/"]):
                    continue
                size = f.stat().st_size
                file_list.append(f"- {rel} ({size} bytes)")

        if file_list:
            parts.extend(file_list)
        else:
            parts.append("(no output files)")

        # 3. Recent history from project-level history
        history_path = self._workspace / ".openags" / "history.md"
        if history_path.exists():
            history = history_path.read_text(encoding="utf-8")
            module_events: list[str] = []
            for line in history.splitlines():
                if f"{module}:" in line.lower():
                    module_events.append(line)

            if module_events:
                parts.append("\n### Recent Activity")
                parts.extend(module_events[-5:])

        return ToolResult(
            success=True,
            data="\n".join(parts),
            metadata={"module": module, "files": len(file_list)},
        )

    def schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "module": {
                    "type": "string",
                    "description": "Module to check (e.g. 'literature', 'proposal'). Omit to get an overview of all modules.",
                },
            },
            "required": [],
        }
