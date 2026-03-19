"""Tests for Phase 2: message bus, GPU detection, memory compression, orchestrator."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from openags.agent.memory import MemorySystem
from openags.agent.message_bus import MessageBus
from openags.models import BusMessage, GPUConfig, GPUInfo, TokenUsage
from openags.research.tools.gpu import allocate_gpus, build_cuda_env


# ── BusMessage model tests ─────────────────────────────


class TestBusMessage:
    def test_defaults(self) -> None:
        msg = BusMessage(topic="test", sender="agent1")
        assert msg.hop_count == 0
        assert msg.max_hops == 10
        assert msg.payload == {}

    def test_custom_values(self) -> None:
        msg = BusMessage(
            topic="exp.done",
            sender="experimenter",
            payload={"result": "ok"},
            hop_count=3,
            max_hops=5,
        )
        assert msg.topic == "exp.done"
        assert msg.hop_count == 3
        assert msg.max_hops == 5


# ── MessageBus tests ───────────────────────────────────


class TestMessageBus:
    @pytest.mark.asyncio
    async def test_publish_and_subscribe(self) -> None:
        bus = MessageBus()
        received: list[BusMessage] = []

        async def handler(msg: BusMessage) -> None:
            received.append(msg)

        bus.subscribe("test.topic", handler)
        await bus.publish(BusMessage(topic="test.topic", sender="test"))

        assert len(received) == 1
        assert received[0].topic == "test.topic"

    @pytest.mark.asyncio
    async def test_emit_convenience(self) -> None:
        bus = MessageBus()
        received: list[BusMessage] = []

        async def handler(msg: BusMessage) -> None:
            received.append(msg)

        bus.subscribe("quick", handler)
        await bus.emit("quick", "sender1", {"key": "val"})

        assert len(received) == 1
        assert received[0].sender == "sender1"
        assert received[0].payload["key"] == "val"

    @pytest.mark.asyncio
    async def test_hop_count_prevents_loop(self) -> None:
        bus = MessageBus()
        received: list[BusMessage] = []

        async def handler(msg: BusMessage) -> None:
            received.append(msg)

        bus.subscribe("loop", handler)

        # Message at max hops should be dropped
        msg = BusMessage(topic="loop", sender="x", hop_count=10, max_hops=10)
        await bus.publish(msg)

        assert len(received) == 0

    @pytest.mark.asyncio
    async def test_forward_increments_hop_count(self) -> None:
        bus = MessageBus()
        received: list[BusMessage] = []

        async def handler(msg: BusMessage) -> None:
            received.append(msg)

        bus.subscribe("forwarded", handler)

        original = BusMessage(topic="original", sender="a", hop_count=2)
        await bus.forward(original, "forwarded")

        assert len(received) == 1
        assert received[0].hop_count == 3
        assert received[0].topic == "forwarded"

    @pytest.mark.asyncio
    async def test_forward_chain_stops_at_max(self) -> None:
        """Forward chain should stop when max_hops is reached."""
        bus = MessageBus()
        call_count = 0

        async def recursive_handler(msg: BusMessage) -> None:
            nonlocal call_count
            call_count += 1
            await bus.forward(msg, "recursive")

        bus.subscribe("recursive", recursive_handler)

        # Start with hop_count=0, max_hops=3
        await bus.publish(BusMessage(topic="recursive", sender="test", max_hops=3))

        # Should only recurse 3 times (0, 1, 2) then stop at 3
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_unsubscribe(self) -> None:
        bus = MessageBus()
        received: list[BusMessage] = []

        async def handler(msg: BusMessage) -> None:
            received.append(msg)

        bus.subscribe("topic", handler)
        bus.unsubscribe("topic", handler)
        await bus.emit("topic", "test")

        assert len(received) == 0

    @pytest.mark.asyncio
    async def test_history(self) -> None:
        bus = MessageBus()
        await bus.emit("a", "s1")
        await bus.emit("b", "s2")
        await bus.emit("a", "s3")

        all_history = bus.get_history()
        assert len(all_history) == 3

        a_history = bus.get_history(topic="a")
        assert len(a_history) == 2

    @pytest.mark.asyncio
    async def test_handler_error_doesnt_crash(self) -> None:
        bus = MessageBus()

        async def bad_handler(msg: BusMessage) -> None:
            raise ValueError("oops")

        good_calls: list[BusMessage] = []

        async def good_handler(msg: BusMessage) -> None:
            good_calls.append(msg)

        bus.subscribe("topic", bad_handler)
        bus.subscribe("topic", good_handler)
        await bus.emit("topic", "test")

        # Good handler still ran despite bad handler
        assert len(good_calls) == 1


# ── GPU utility tests ──────────────────────────────────


class TestGPU:
    def test_allocate_explicit_ids(self) -> None:
        config = GPUConfig(device_ids=[2, 3])
        available = [
            GPUInfo(index=0, name="A100", memory_total_mb=40000, memory_free_mb=39000),
            GPUInfo(index=1, name="A100", memory_total_mb=40000, memory_free_mb=10000),
        ]
        result = allocate_gpus(available, config, requested=2)
        assert result == [2, 3]

    def test_allocate_by_free_memory(self) -> None:
        config = GPUConfig()
        available = [
            GPUInfo(index=0, name="A100", memory_total_mb=40000, memory_free_mb=10000),
            GPUInfo(index=1, name="A100", memory_total_mb=40000, memory_free_mb=35000),
            GPUInfo(index=2, name="A100", memory_total_mb=40000, memory_free_mb=25000),
        ]
        result = allocate_gpus(available, config, requested=2)
        # Should pick indices 1 and 2 (most free memory)
        assert result == [1, 2]

    def test_allocate_with_memory_filter(self) -> None:
        config = GPUConfig(max_memory_gb=30)
        available = [
            GPUInfo(index=0, name="RTX3060", memory_total_mb=12000, memory_free_mb=11000),
            GPUInfo(index=1, name="A100", memory_total_mb=40000, memory_free_mb=38000),
        ]
        result = allocate_gpus(available, config, requested=1)
        # Only A100 has >= 30GB
        assert result == [1]

    def test_allocate_empty(self) -> None:
        config = GPUConfig()
        result = allocate_gpus([], config, requested=1)
        assert result == []

    def test_build_cuda_env(self) -> None:
        env = build_cuda_env([0, 2])
        assert env == {"CUDA_VISIBLE_DEVICES": "0,2"}

    def test_build_cuda_env_empty(self) -> None:
        env = build_cuda_env([])
        assert env == {}


# ── Memory compression tests ──────────────────────────


class TestMemoryCompression:
    def test_needs_compression_false(self, tmp_path: Path) -> None:
        mem = MemorySystem(tmp_path)
        assert not mem.needs_compression()

    def test_needs_compression_true(self, tmp_path: Path) -> None:
        mem = MemorySystem(tmp_path)
        # Write > MEMORY_MAX_LINES
        big_content = "\n".join(f"line {i}" for i in range(250))
        (tmp_path / "memory.md").write_text(big_content)
        assert mem.needs_compression()

    @pytest.mark.asyncio
    async def test_compress_memory(self, tmp_path: Path) -> None:
        """Test LLM-driven memory compression with mock backend."""
        mem = MemorySystem(tmp_path)

        # Write lots of content
        big_content = "\n".join(f"<!-- section:data -->\nfact {i}\n<!-- /section:data -->" for i in range(250))
        (tmp_path / "memory.md").write_text(big_content)
        assert mem.needs_compression()

        # Mock backend that returns compressed content
        class MockCompressor:
            async def execute(self, prompt: str, timeout: int = 60) -> Any:
                class Resp:
                    content = "<!-- section:data -->\nCompressed summary of all facts\n<!-- /section:data -->"
                return Resp()

        result = await mem.compress_memory(MockCompressor())
        assert result is True

        # Verify the memory was compressed
        new_content = (tmp_path / "memory.md").read_text()
        assert "Compressed summary" in new_content
        assert not mem.needs_compression()

        # Verify backup was created
        backup = tmp_path / "memory.md.bak"
        assert backup.exists()

    @pytest.mark.asyncio
    async def test_compress_skip_when_not_needed(self, tmp_path: Path) -> None:
        mem = MemorySystem(tmp_path)
        mem.update_memory("test", "Short content")

        class FakeBackend:
            async def execute(self, prompt: str, timeout: int = 60) -> Any:
                raise AssertionError("Should not be called")

        result = await mem.compress_memory(FakeBackend())
        assert result is False


# ── Token tracker tests ────────────────────────────────


class TestTokenTracker:
    def test_record_and_summary(self, tmp_path: Path) -> None:
        from openags.research.logging.tracker import TokenTracker

        tracker = TokenTracker(tmp_path)
        tracker.record("proj1", "literature", TokenUsage(input_tokens=100, output_tokens=50, cost_usd=0.01))
        tracker.record("proj1", "writer", TokenUsage(input_tokens=200, output_tokens=100, cost_usd=0.02))

        summary = tracker.summary("proj1")
        assert summary["input_tokens"] == 300
        assert summary["output_tokens"] == 150
        assert abs(summary["cost_usd"] - 0.03) < 0.001
        assert summary["calls"] == 2

    def test_summary_filter_by_project(self, tmp_path: Path) -> None:
        from openags.research.logging.tracker import TokenTracker

        tracker = TokenTracker(tmp_path)
        tracker.record("proj1", "lit", TokenUsage(input_tokens=100, cost_usd=0.01))
        tracker.record("proj2", "lit", TokenUsage(input_tokens=200, cost_usd=0.02))

        s1 = tracker.summary("proj1")
        assert s1["input_tokens"] == 100

        s2 = tracker.summary("proj2")
        assert s2["input_tokens"] == 200

    def test_summary_empty(self, tmp_path: Path) -> None:
        from openags.research.logging.tracker import TokenTracker

        tracker = TokenTracker(tmp_path)
        summary = tracker.summary()
        assert summary["calls"] == 0
