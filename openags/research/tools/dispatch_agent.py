"""DispatchAgent tool — Coordinator dispatches tasks to specialized agents.

This is the core mechanism for dynamic workflow orchestration.
Instead of hardcoded pipeline stages, the Coordinator agent decides
which agent to invoke next based on project state and its SOUL.md guidance.

Supports both single dispatch and batch dispatch (parallel execution).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from openags.agent.discovery import AgentDiscovery
from openags.agent.tools.base import ToolResult

logger = logging.getLogger(__name__)


class DispatchAgentTool:
    """Dispatch a task to a specialized research agent (satisfies Tool protocol).

    The Coordinator uses this tool to dynamically invoke other agents
    during its own loop. Each dispatched agent runs to completion and
    returns a summary. The Coordinator then evaluates the result and
    decides what to do next.

    Supports batch dispatch: provide ``agents`` (list of {agent, task} dicts)
    to run multiple agents in parallel via ``asyncio.gather``.
    """

    _name = "dispatch_agent"
    _description = (
        "Dispatch a task to a specialized research agent. "
        "Provide 'agent' (string name) and 'task', or 'agents' (list) for batch dispatch. "
        "The agent runs to completion and returns a result summary."
    )

    def __init__(self, orchestrator: Any, project_id: str) -> None:
        self._orch = orchestrator
        self._project_id = project_id

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    def _discover_agents(self) -> dict[str, Any]:
        """Discover available agents for the current project."""
        project = self._orch.project_mgr.get(self._project_id)
        return AgentDiscovery.discover(project.workspace)

    async def invoke(self, **kwargs: Any) -> ToolResult:
        # Support batch dispatch
        agents_batch: list[dict[str, str]] | None = kwargs.get("agents")
        if agents_batch:
            return await self._batch_dispatch(agents_batch)

        # Single dispatch — accept 'agent' or 'role' (backward compat)
        agent_name = kwargs.get("agent", "") or kwargs.get("role", "")
        task = kwargs.get("task", "")

        if not agent_name:
            return ToolResult(success=False, error="'agent' is required.")
        if not task:
            return ToolResult(success=False, error="'task' is required.")

        return await self._single_dispatch(agent_name, task)

    async def _single_dispatch(self, agent_name: str, task: str) -> ToolResult:
        """Dispatch a single agent by name."""
        # Validate agent exists in project
        discovered = self._discover_agents()
        agent_lower = agent_name.lower()
        available_names = [n for n in discovered if n != "coordinator"]
        if agent_lower not in discovered:
            return ToolResult(
                success=False,
                error=(
                    f"Unknown agent '{agent_name}'. "
                    f"Available: {', '.join(available_names)}"
                ),
            )

        logger.info("Coordinator dispatching %s: %s", agent_name, task[:100])

        # Emit dispatch event for UI
        try:
            from openags.research.server.routes.ws import manager

            await manager.broadcast(self._project_id, "agent.dispatch", {
                "parent": "coordinator",
                "child": agent_name,
                "task": task[:200],
            })
        except Exception:
            pass

        try:
            result = await self._orch.run_agent(self._project_id, agent_lower, task)

            summary_parts = [
                f"Agent: {agent_name}",
                f"Success: {result.success}",
                f"Duration: {result.duration_seconds:.1f}s",
            ]
            if result.error:
                summary_parts.append(f"Error: {result.error}")

            output = result.output
            if len(output) > 2000:
                output = output[:2000] + "\n... (truncated)"
            summary_parts.append(f"Output:\n{output}")

            return ToolResult(
                success=result.success,
                data="\n".join(summary_parts),
                metadata={
                    "agent": agent_name,
                    "duration": result.duration_seconds,
                    "tokens_in": result.token_usage.input_tokens,
                    "tokens_out": result.token_usage.output_tokens,
                },
            )
        except Exception as e:
            logger.error("Dispatch failed for %s: %s", agent_name, e)
            return ToolResult(success=False, error=f"Dispatch failed: {e}")

    async def _batch_dispatch(self, agents_batch: list[dict[str, str]]) -> ToolResult:
        """Dispatch multiple agents in parallel."""
        if not agents_batch:
            return ToolResult(success=False, error="'agents' list is empty.")

        # Validate all agents before dispatching
        discovered = self._discover_agents()
        available_names = [n for n in discovered if n != "coordinator"]
        for item in agents_batch:
            agent_name = item.get("agent", "")
            if not agent_name:
                return ToolResult(success=False, error="Each batch item requires 'agent'.")
            if not item.get("task"):
                return ToolResult(success=False, error=f"Batch item for '{agent_name}' missing 'task'.")
            if agent_name.lower() not in discovered:
                return ToolResult(
                    success=False,
                    error=(
                        f"Unknown agent '{agent_name}'. "
                        f"Available: {', '.join(available_names)}"
                    ),
                )

        logger.info("Coordinator batch-dispatching %d agents", len(agents_batch))

        tasks = [
            self._single_dispatch(item["agent"], item["task"])
            for item in agents_batch
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        summaries: list[str] = []
        all_success = True
        for i, r in enumerate(results):
            agent_name = agents_batch[i]["agent"]
            if isinstance(r, Exception):
                summaries.append(f"## {agent_name}\nError: {r}")
                all_success = False
            elif isinstance(r, ToolResult):
                summaries.append(f"## {agent_name}\n{r.data or r.error or 'No output'}")
                if not r.success:
                    all_success = False
            else:
                summaries.append(f"## {agent_name}\nUnexpected result type")
                all_success = False

        return ToolResult(
            success=all_success,
            data="\n\n".join(summaries),
            metadata={"batch_size": len(agents_batch)},
        )

    def schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "agent": {
                    "type": "string",
                    "description": "The agent name to dispatch the task to (e.g. 'literature', 'proposer').",
                },
                "task": {
                    "type": "string",
                    "description": "Specific task description for the agent. Be detailed and actionable.",
                },
                "agents": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "agent": {"type": "string"},
                            "task": {"type": "string"},
                        },
                        "required": ["agent", "task"],
                    },
                    "description": "Batch dispatch: list of {agent, task} to run in parallel.",
                },
            },
            "required": [],
        }
