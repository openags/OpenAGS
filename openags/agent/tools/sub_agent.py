"""SubAgent tool — spawn a child agent with isolated context for subtasks.

The child agent gets fresh messages (no parent history contamination),
shares the filesystem and tool registry, and returns only a text summary
to the parent. This keeps the parent's context clean while delegating work.

Inspired by Claude Code's Agent tool and learn-claude-code s04_subagent.py.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from openags.agent.backend import Backend
from openags.agent.tools.base import ToolRegistry, ToolResult

logger = logging.getLogger(__name__)

_SUBAGENT_SYSTEM = (
    "You are a research sub-agent. Complete the given task thoroughly, "
    "then provide a clear summary of your findings or actions. "
    "Use the available tools to read files, search, and gather information. "
    "Be concise but comprehensive in your final response."
)


class SubAgentTool:
    """Spawn a child agent with fresh context to handle an isolated subtask.

    The child shares the filesystem and tools but NOT the parent's conversation
    history. Only the final text summary returns to the parent.
    This prevents context pollution and enables focused exploration.
    """

    _name = "sub_agent"
    _description = (
        "Spawn a sub-agent with fresh context to handle a subtask. "
        "The sub-agent can read/write files and search, but has its own "
        "conversation history. Returns only a summary to you."
    )

    def __init__(
        self,
        backend: Backend,
        tool_registry: ToolRegistry,
    ) -> None:
        self._backend = backend
        # Create a child registry without sub_agent tool (prevent recursion)
        self._child_registry = ToolRegistry()
        for tool in tool_registry.list_all():
            if tool.name != self._name:
                self._child_registry.register(tool)

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    async def invoke(self, **kwargs: Any) -> ToolResult:
        task = kwargs.get("task", "")
        max_steps = min(int(kwargs.get("max_steps", 10)), 30)

        if not task:
            return ToolResult(success=False, error="'task' is required.")

        logger.info("SubAgent spawned: %s", task[:100])
        start = time.monotonic()

        try:
            result_text = await self._run_child_loop(task, max_steps)
            duration = time.monotonic() - start
            logger.info("SubAgent completed in %.1fs", duration)

            return ToolResult(
                success=True,
                data=result_text,
                metadata={"duration_seconds": round(duration, 1), "task": task[:200]},
            )
        except Exception as e:
            logger.error("SubAgent failed: %s", e)
            return ToolResult(success=False, error=f"Sub-agent error: {e}")

    async def _run_child_loop(self, task: str, max_steps: int) -> str:
        """Run the child agent loop with fresh messages."""
        # Build child tool list (OpenAI format)
        child_tools = []
        for tool in self._child_registry.list_all():
            child_tools.append({
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.schema(),
                },
            })

        messages: list[dict[str, str]] = [
            {"role": "user", "content": task},
        ]

        last_content = ""
        for _step in range(max_steps):
            response = await self._backend.execute_chat(
                messages,
                system=_SUBAGENT_SYSTEM,
                tools=child_tools if child_tools else None,
            )
            messages.append({"role": "assistant", "content": response.content})
            last_content = response.content

            # No tool calls → done
            if not response.tool_calls:
                break

            # Execute tool calls
            results: list[dict[str, object]] = []
            for call in response.tool_calls:
                func = call.get("function", {})
                if isinstance(func, dict):
                    tool_name = str(func.get("name", ""))
                    args_raw = func.get("arguments", "{}")
                else:
                    tool_name = str(call.get("name", ""))
                    args_raw = call.get("arguments", "{}")

                tool = self._child_registry.get(tool_name)
                if tool is None:
                    results.append({
                        "tool_call_id": call.get("id", ""),
                        "name": tool_name,
                        "error": f"Unknown tool: {tool_name}",
                    })
                    continue

                try:
                    if isinstance(args_raw, str):
                        tool_kwargs = json.loads(args_raw) if args_raw else {}
                    elif isinstance(args_raw, dict):
                        tool_kwargs = args_raw
                    else:
                        tool_kwargs = {}

                    tool_result = await tool.invoke(**tool_kwargs)
                    results.append({
                        "tool_call_id": call.get("id", ""),
                        "name": tool_name,
                        "success": tool_result.success,
                        "data": tool_result.data,
                        "error": tool_result.error,
                    })
                except Exception as e:
                    results.append({
                        "tool_call_id": call.get("id", ""),
                        "name": tool_name,
                        "error": str(e),
                    })

            messages.append({"role": "user", "content": str(results)})

        return last_content or "(sub-agent produced no output)"

    def schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "The task for the sub-agent to complete. Be specific and detailed.",
                },
                "max_steps": {
                    "type": "integer",
                    "description": "Maximum number of steps the sub-agent can take (default 10, max 30)",
                    "default": 10,
                },
            },
            "required": ["task"],
        }
