"""Hooks lifecycle system — run user-defined commands at agent lifecycle events.

Hook events:
  - PreToolUse: Before tool execution (can block)
  - PostToolUse: After tool execution (informational)
  - AgentStart: When agent begins execution
  - AgentStop: When agent completes (can block)
  - SessionStart: When session begins/resumes
"""

from __future__ import annotations

import asyncio
import json
import logging
import subprocess
from pathlib import Path

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class HookResult(BaseModel):
    """Result of a hook execution."""
    allow: bool = True
    reason: str = ""
    modified_input: dict[str, object] | None = None


class HookEntry(BaseModel):
    """Single hook definition."""
    matcher: str = ""  # tool name pattern or empty for all
    command: str = ""  # shell command to run
    timeout: int = Field(default=10, ge=1, le=60)


class HookConfig(BaseModel):
    """Hook configuration from SOUL.md frontmatter or project config."""
    PreToolUse: list[HookEntry] = []
    PostToolUse: list[HookEntry] = []
    AgentStart: list[HookEntry] = []
    AgentStop: list[HookEntry] = []
    SessionStart: list[HookEntry] = []


def parse_hooks(raw: dict[str, object] | None) -> HookConfig:
    """Parse hooks from SOUL.md frontmatter format into HookConfig."""
    if not raw:
        return HookConfig()

    config = HookConfig()
    for event_name in ("PreToolUse", "PostToolUse", "AgentStart", "AgentStop", "SessionStart"):
        entries_raw = raw.get(event_name, [])
        if not isinstance(entries_raw, list):
            continue
        entries = []
        for entry in entries_raw:
            if isinstance(entry, dict):
                entries.append(HookEntry(
                    matcher=entry.get("matcher", ""),
                    command=entry.get("command", ""),
                    timeout=entry.get("timeout", 10),
                ))
        setattr(config, event_name, entries)
    return config


class HookRunner:
    """Execute hook chains at lifecycle events."""

    def __init__(self, config: HookConfig, working_dir: Path | None = None) -> None:
        self._config = config
        self._working_dir = working_dir

    def _matches(self, entry: HookEntry, name: str) -> bool:
        """Check if hook entry matcher matches the given name."""
        if not entry.matcher:
            return True
        patterns = [p.strip() for p in entry.matcher.split("|")]
        return name in patterns or "*" in patterns

    async def run_pre_tool(
        self, tool_name: str, tool_input: dict[str, object], agent_name: str,
    ) -> HookResult:
        """Run PreToolUse hooks. Returns allow=False if any hook blocks."""
        for entry in self._config.PreToolUse:
            if not self._matches(entry, tool_name):
                continue
            if not entry.command:
                continue
            result = await self._execute_hook(entry, {
                "hook_event_name": "PreToolUse",
                "tool_name": tool_name,
                "tool_input": tool_input,
                "agent_name": agent_name,
            })
            if not result.allow:
                return result
        return HookResult(allow=True)

    async def run_post_tool(
        self, tool_name: str, tool_result: str, agent_name: str,
    ) -> None:
        """Run PostToolUse hooks (informational, cannot block)."""
        for entry in self._config.PostToolUse:
            if not self._matches(entry, tool_name):
                continue
            if not entry.command:
                continue
            await self._execute_hook(entry, {
                "hook_event_name": "PostToolUse",
                "tool_name": tool_name,
                "tool_result": tool_result[:2000],
                "agent_name": agent_name,
            })

    async def run_agent_start(self, agent_name: str, task: str) -> None:
        """Run AgentStart hooks."""
        for entry in self._config.AgentStart:
            if not entry.command:
                continue
            await self._execute_hook(entry, {
                "hook_event_name": "AgentStart",
                "agent_name": agent_name,
                "task": task[:500],
            })

    async def run_agent_stop(self, agent_name: str, success: bool) -> HookResult:
        """Run AgentStop hooks. Can block completion."""
        for entry in self._config.AgentStop:
            if not entry.command:
                continue
            result = await self._execute_hook(entry, {
                "hook_event_name": "AgentStop",
                "agent_name": agent_name,
                "success": success,
            })
            if not result.allow:
                return result
        return HookResult(allow=True)

    async def _execute_hook(self, entry: HookEntry, input_data: dict[str, object]) -> HookResult:
        """Execute a single hook command."""
        try:
            input_json = json.dumps(input_data, default=str)
            proc = await asyncio.wait_for(
                asyncio.create_subprocess_exec(
                    *entry.command.split(),
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=str(self._working_dir) if self._working_dir else None,
                ),
                timeout=entry.timeout,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(input_json.encode()),
                timeout=entry.timeout,
            )

            if proc.returncode == 2:
                reason = stderr.decode().strip() or "Blocked by hook"
                logger.info("Hook blocked: %s — %s", entry.command, reason)
                return HookResult(allow=False, reason=reason)

            if proc.returncode == 0 and stdout:
                try:
                    output = json.loads(stdout.decode())
                    if isinstance(output, dict) and "modified_input" in output:
                        return HookResult(allow=True, modified_input=output["modified_input"])
                except json.JSONDecodeError:
                    pass

            return HookResult(allow=True)

        except TimeoutError:
            logger.warning("Hook timed out: %s (timeout=%ds)", entry.command, entry.timeout)
            return HookResult(allow=True)
        except OSError as e:
            logger.error("Hook execution failed: %s — %s", entry.command, e)
            return HookResult(allow=True)
        except subprocess.SubprocessError as e:
            logger.error("Hook execution failed: %s — %s", entry.command, e)
            return HookResult(allow=True)
