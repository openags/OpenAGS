"""Tests for streaming output across backends and agents."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

import pytest

from openags.agent.loop import Agent
from openags.agent.memory import MemorySystem
from openags.models import AgentConfig, BackendResponse, Project, TokenUsage
from tests.conftest import MockBackend


# ── Multi-chunk mock ────────────────────────────────────


class ChunkedMockBackend(MockBackend):
    """MockBackend that yields multiple chunks in stream_chat."""

    def __init__(self, chunks: list[str] | None = None):
        super().__init__()
        self._chunks = chunks or ["Hello ", "world, ", "this is ", "streaming!"]

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        system: str = "",
    ) -> AsyncIterator[str]:
        for chunk in self._chunks:
            yield chunk


class EmptyStreamBackend(MockBackend):
    """Backend whose stream yields nothing."""

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        system: str = "",
    ) -> AsyncIterator[str]:
        return
        yield  # make it an async generator


class ErrorStreamBackend(MockBackend):
    """Backend whose stream raises mid-iteration."""

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        system: str = "",
    ) -> AsyncIterator[str]:
        yield "partial "
        raise RuntimeError("connection lost")


class SlowStreamBackend(MockBackend):
    """Backend that yields chunks with small delays (simulates real streaming)."""

    def __init__(self, chunks: list[str] | None = None, delay: float = 0.01):
        super().__init__()
        self._chunks = chunks or ["Chunk1 ", "Chunk2 ", "Chunk3 "]
        self._delay = delay

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        system: str = "",
    ) -> AsyncIterator[str]:
        for chunk in self._chunks:
            await asyncio.sleep(self._delay)
            yield chunk


# ── Backend-level streaming tests ───────────────────────


class TestBackendStreaming:
    @pytest.mark.asyncio
    async def test_mock_stream_yields_content(self) -> None:
        """Default MockBackend stream_chat yields the execute response."""
        backend = MockBackend()
        chunks: list[str] = []
        async for chunk in backend.stream_chat(
            [{"role": "user", "content": "hello"}]
        ):
            chunks.append(chunk)

        assert len(chunks) == 1
        assert chunks[0] == "Mock response from test backend."

    @pytest.mark.asyncio
    async def test_chunked_stream_yields_all_chunks(self) -> None:
        """ChunkedMockBackend yields multiple chunks in order."""
        backend = ChunkedMockBackend()
        chunks: list[str] = []
        async for chunk in backend.stream_chat(
            [{"role": "user", "content": "hello"}]
        ):
            chunks.append(chunk)

        assert chunks == ["Hello ", "world, ", "this is ", "streaming!"]
        assert "".join(chunks) == "Hello world, this is streaming!"

    @pytest.mark.asyncio
    async def test_empty_stream(self) -> None:
        """Empty stream yields no chunks."""
        backend = EmptyStreamBackend()
        chunks: list[str] = []
        async for chunk in backend.stream_chat(
            [{"role": "user", "content": "hello"}]
        ):
            chunks.append(chunk)

        assert chunks == []

    @pytest.mark.asyncio
    async def test_error_during_stream(self) -> None:
        """Stream that raises mid-iteration surfaces the error."""
        backend = ErrorStreamBackend()
        chunks: list[str] = []

        with pytest.raises(RuntimeError, match="connection lost"):
            async for chunk in backend.stream_chat(
                [{"role": "user", "content": "hello"}]
            ):
                chunks.append(chunk)

        # Partial content received before error
        assert chunks == ["partial "]

    @pytest.mark.asyncio
    async def test_slow_stream_completes(self) -> None:
        """Slow stream with delays still completes and yields all chunks."""
        backend = SlowStreamBackend(delay=0.005)
        chunks: list[str] = []
        async for chunk in backend.stream_chat(
            [{"role": "user", "content": "hello"}]
        ):
            chunks.append(chunk)

        assert chunks == ["Chunk1 ", "Chunk2 ", "Chunk3 "]

    @pytest.mark.asyncio
    async def test_custom_chunks(self) -> None:
        """ChunkedMockBackend accepts custom chunk list."""
        custom = ["α", "β", "γ"]
        backend = ChunkedMockBackend(chunks=custom)
        result: list[str] = []
        async for chunk in backend.stream_chat(
            [{"role": "user", "content": "test"}]
        ):
            result.append(chunk)

        assert result == custom

    @pytest.mark.asyncio
    async def test_stream_with_system_prompt(self) -> None:
        """stream_chat accepts a system prompt without error."""
        backend = ChunkedMockBackend(chunks=["ok"])
        chunks: list[str] = []
        async for chunk in backend.stream_chat(
            [{"role": "user", "content": "test"}],
            system="You are a helpful assistant.",
        ):
            chunks.append(chunk)

        assert chunks == ["ok"]

    @pytest.mark.asyncio
    async def test_stream_with_multi_turn_messages(self) -> None:
        """stream_chat works with multi-turn conversation history."""
        backend = ChunkedMockBackend(chunks=["response"])
        messages = [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi there"},
            {"role": "user", "content": "continue"},
        ]
        chunks: list[str] = []
        async for chunk in backend.stream_chat(messages):
            chunks.append(chunk)

        assert chunks == ["response"]


# ── _stream_response helper tests ───────────────────────


class TestStreamResponse:
    @pytest.mark.asyncio
    async def test_stream_response_collects_full_text(self) -> None:
        """_stream_response returns concatenated text and chunk count."""
        from openags.main import _stream_response

        backend = ChunkedMockBackend(chunks=["Hello ", "world!"])
        messages = [{"role": "user", "content": "test"}]

        full_text, chunk_count = await _stream_response(backend, messages, system="")

        assert full_text == "Hello world!"
        assert chunk_count == 2

    @pytest.mark.asyncio
    async def test_stream_response_fallback_on_no_stream(self) -> None:
        """_stream_response falls back to execute_chat if stream_chat fails."""
        from openags.main import _stream_response

        class NoStreamBackend(MockBackend):
            def stream_chat(self, *_a, **_kw):
                raise NotImplementedError

        backend = NoStreamBackend()
        messages = [{"role": "user", "content": "test"}]

        full_text, chunk_count = await _stream_response(backend, messages, system="")

        assert full_text == "Mock response from test backend."
        assert chunk_count == 0

    @pytest.mark.asyncio
    async def test_stream_response_single_chunk(self) -> None:
        """_stream_response works with a single chunk."""
        from openags.main import _stream_response

        backend = ChunkedMockBackend(chunks=["single"])
        messages = [{"role": "user", "content": "test"}]

        full_text, chunk_count = await _stream_response(backend, messages, system="")

        assert full_text == "single"
        assert chunk_count == 1


# ── Agent-level streaming (via backend) ─────────────────


class TestAgentWithStreaming:
    @pytest.mark.asyncio
    async def test_agent_backend_supports_streaming(
        self, temp_project: Project
    ) -> None:
        """Agent's backend can stream — verifying the integration path."""
        backend = ChunkedMockBackend(chunks=["lit ", "review ", "done"])
        memory = MemorySystem(temp_project.workspace)
        agent = Agent(config=AgentConfig(name="literature"), module_dir=temp_project.workspace / "literature", backend=backend, memory=memory)

        # Agent.run uses execute_chat (non-streaming)
        result = await agent.run("Find papers")
        assert result.success

        # But the same backend can also stream
        chunks: list[str] = []
        async for chunk in backend.stream_chat(
            [{"role": "user", "content": "Find papers"}]
        ):
            chunks.append(chunk)
        assert "".join(chunks) == "lit review done"

    @pytest.mark.asyncio
    async def test_agent_backend_stream_after_run(
        self, temp_project: Project
    ) -> None:
        """Backend streaming still works after agent.run() completes."""
        backend = ChunkedMockBackend(chunks=["a", "b", "c"])
        memory = MemorySystem(temp_project.workspace)
        agent = Agent(config=AgentConfig(name="literature"), module_dir=temp_project.workspace / "literature", backend=backend, memory=memory)

        # Run agent (non-streaming path)
        await agent.run("Test task")

        # Backend streaming is still functional
        chunks: list[str] = []
        async for chunk in agent._backend.stream_chat(
            [{"role": "user", "content": "stream test"}]
        ):
            chunks.append(chunk)
        assert chunks == ["a", "b", "c"]
