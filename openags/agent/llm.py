"""LLM transport — the way OpenAGS Agent talks to language models.

Uses litellm internally to support 100+ LLM providers.
This is NOT a user-facing choice — it is the Agent's internal implementation.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator

from openags.agent.errors import BackendError
from openags.models import BackendConfig, BackendResponse, TokenUsage

logger = logging.getLogger(__name__)


class LLMBackend:
    """OpenAGS Agent's LLM transport layer via litellm."""

    def __init__(self, config: BackendConfig) -> None:
        self._model = config.model
        self._api_key = config.api_key.get_secret_value() if config.api_key else None
        self._timeout = config.timeout
        self._max_retries = config.max_retries

    async def execute(
        self,
        prompt: str,
        system: str = "",
        tools: list[dict[str, object]] | None = None,
        working_dir: str | None = None,
        timeout: int | None = None,
    ) -> BackendResponse:
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        return await self.execute_chat(messages, timeout=timeout)

    async def execute_chat(
        self,
        messages: list[dict[str, str]],
        system: str = "",
        tools: list[dict[str, object]] | None = None,
        timeout: int | None = None,
    ) -> BackendResponse:
        from litellm import acompletion

        if system:
            messages = [{"role": "system", "content": system}, *messages]

        effective_timeout = timeout or self._timeout
        last_error: Exception | None = None

        for attempt in range(self._max_retries + 1):
            try:
                kwargs: dict[str, object] = {
                    "model": self._model,
                    "messages": messages,
                    "api_key": self._api_key,
                }
                if tools:
                    kwargs["tools"] = tools

                response = await asyncio.wait_for(
                    acompletion(**kwargs),
                    timeout=effective_timeout,
                )

                usage = response.usage
                message = response.choices[0].message
                content: str = message.content or ""

                # Extract tool calls if present
                tool_calls_raw: list[dict[str, object]] = []
                if hasattr(message, "tool_calls") and message.tool_calls:
                    for tc in message.tool_calls:
                        tool_calls_raw.append(
                            {
                                "id": tc.id,
                                "type": tc.type,
                                "function": {
                                    "name": tc.function.name,
                                    "arguments": tc.function.arguments,
                                },
                            }
                        )

                return BackendResponse(
                    content=content,
                    token_usage=TokenUsage(
                        input_tokens=usage.prompt_tokens if usage else 0,
                        output_tokens=usage.completion_tokens if usage else 0,
                        model=self._model,
                        cost_usd=self._estimate_cost(usage),
                    ),
                    tool_calls=tool_calls_raw,
                    raw=response.model_dump() if hasattr(response, "model_dump") else {},
                )

            except TimeoutError:
                last_error = BackendError(
                    f"Backend timed out after {effective_timeout}s (attempt {attempt + 1})"
                )
                logger.warning("Timeout on attempt %d/%d", attempt + 1, self._max_retries + 1)
            except Exception as e:
                last_error = e
                logger.warning(
                    "Backend error on attempt %d/%d: %s",
                    attempt + 1,
                    self._max_retries + 1,
                    e,
                )

            if attempt < self._max_retries:
                delay = 2**attempt
                logger.info("Retrying in %ds...", delay)
                await asyncio.sleep(delay)

        raise BackendError(f"Backend failed after {self._max_retries + 1} attempts") from last_error

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        system: str = "",
    ) -> AsyncIterator[str]:
        from litellm import acompletion

        if system:
            messages = [{"role": "system", "content": system}, *messages]

        response = await acompletion(
            model=self._model,
            messages=messages,
            api_key=self._api_key,
            stream=True,
        )

        async for chunk in response:
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield delta.content

    async def health_check(self) -> bool:
        """Quick config validity check — does NOT call the LLM API."""
        try:
            # Just verify the model string is non-empty and litellm can resolve it
            if not self._model:
                return False
            import litellm

            litellm.get_model_info(self._model)
            return True
        except Exception:
            # Model not in litellm registry is fine — custom/proxy models won't be
            return bool(self._model)

    @staticmethod
    def _estimate_cost(usage: object) -> float:
        if usage is None:
            return 0.0
        try:
            from litellm import completion_cost

            return float(completion_cost(completion_response=usage))
        except Exception:
            return 0.0
