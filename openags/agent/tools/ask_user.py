"""AskUser tool — agent can ask the user clarifying questions mid-execution.

This enables interactive multi-turn within the agent loop. The agent can
pause to ask "Which baseline should I compare against?" and continue
after receiving the user's answer.

The actual user interaction is handled via a callback function injected
at agent creation time. Different modes (CLI, web, auto) provide different
callbacks.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any

from openags.agent.tools.base import ToolResult

logger = logging.getLogger(__name__)

# Type alias for the callback: receives question string, returns answer string
AskUserCallback = Callable[[str], Awaitable[str]]


async def _default_callback(question: str) -> str:
    """Default callback when no user is available (auto/pipeline mode)."""
    return "No user available to answer. Please proceed with your best judgment."


class AskUserTool:
    """Ask the user a clarifying question during agent execution (satisfies Tool protocol).

    The callback is injected at construction time:
    - CLI mode: prompts via stdin
    - Web/Desktop mode: emits WebSocket event, waits for response
    - Auto mode: returns a default "proceed on your own" message
    """

    _name = "ask_user"
    _description = (
        "Ask the user a clarifying question. Use this when you need user input "
        "to proceed, e.g. choosing between options, confirming parameters, or "
        "getting additional context the user hasn't provided."
    )

    def __init__(self, callback: AskUserCallback | None = None) -> None:
        self._callback = callback or _default_callback

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    async def invoke(self, **kwargs: Any) -> ToolResult:
        question = kwargs.get("question", "")
        if not question:
            return ToolResult(success=False, error="'question' is required.")

        try:
            logger.info("AskUser: %s", question[:200])
            answer = await self._callback(question)
            return ToolResult(
                success=True,
                data=answer,
                metadata={"question": question[:200]},
            )
        except Exception as e:
            logger.error("AskUser callback failed: %s", e)
            return ToolResult(
                success=True,
                data="Unable to reach the user. Please proceed with your best judgment.",
                metadata={"error": str(e)},
            )

    def schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "The question to ask the user. Be clear and specific.",
                },
            },
            "required": ["question"],
        }
