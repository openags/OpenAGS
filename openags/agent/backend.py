"""Backend protocol — interface for the Agent's LLM transport.

The Agent needs a way to call a language model.  Any object satisfying
this Protocol can be used.  The default implementation is ``LLMBackend``
(in ``agent/llm.py``), which uses litellm to support 100+ providers.

Note: CLI tools like Claude Code, Codex, Copilot are NOT backends —
they are alternative agent runtimes.  They bypass Agent.loop() entirely.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Protocol, runtime_checkable

from openags.models import BackendResponse


@runtime_checkable
class Backend(Protocol):
    """Protocol for the Agent's LLM transport layer.

    Any object with these methods can drive the Agent loop.
    """

    async def execute(
        self,
        prompt: str,
        system: str = "",
        tools: list[dict[str, object]] | None = None,
        working_dir: str | None = None,
        timeout: int | None = None,
    ) -> BackendResponse: ...

    async def execute_chat(
        self,
        messages: list[dict[str, str]],
        system: str = "",
        tools: list[dict[str, object]] | None = None,
        timeout: int | None = None,
    ) -> BackendResponse: ...

    def stream_chat(
        self,
        messages: list[dict[str, str]],
        system: str = "",
    ) -> AsyncIterator[str]: ...

    async def health_check(self) -> bool: ...
