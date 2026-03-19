"""Tests for MessageBus — async pub/sub with hop_count anti-loop."""

from __future__ import annotations

import asyncio

import pytest

from openags.agent.message_bus import MessageBus
from openags.models import BusMessage


@pytest.fixture()
def bus() -> MessageBus:
    return MessageBus()


@pytest.mark.asyncio()
async def test_subscribe_and_publish(bus: MessageBus) -> None:
    received: list[BusMessage] = []

    async def handler(msg: BusMessage) -> None:
        received.append(msg)

    bus.subscribe("test.topic", handler)
    msg = BusMessage(topic="test.topic", sender="agent-a", payload={"key": "value"})
    await bus.publish(msg)

    assert len(received) == 1
    assert received[0].sender == "agent-a"
    assert received[0].payload["key"] == "value"


@pytest.mark.asyncio()
async def test_unsubscribe(bus: MessageBus) -> None:
    received: list[BusMessage] = []

    async def handler(msg: BusMessage) -> None:
        received.append(msg)

    bus.subscribe("topic", handler)
    bus.unsubscribe("topic", handler)
    await bus.publish(BusMessage(topic="topic", sender="x"))

    assert len(received) == 0


@pytest.mark.asyncio()
async def test_emit_convenience(bus: MessageBus) -> None:
    received: list[BusMessage] = []

    async def handler(msg: BusMessage) -> None:
        received.append(msg)

    bus.subscribe("events", handler)
    await bus.emit("events", "coordinator", {"status": "ok"})

    assert len(received) == 1
    assert received[0].topic == "events"
    assert received[0].sender == "coordinator"
    assert received[0].payload["status"] == "ok"


@pytest.mark.asyncio()
async def test_hop_count_drops_message(bus: MessageBus) -> None:
    received: list[BusMessage] = []

    async def handler(msg: BusMessage) -> None:
        received.append(msg)

    bus.subscribe("loop", handler)
    msg = BusMessage(topic="loop", sender="x", hop_count=10, max_hops=10)
    await bus.publish(msg)

    assert len(received) == 0


@pytest.mark.asyncio()
async def test_forward_increments_hop(bus: MessageBus) -> None:
    received: list[BusMessage] = []

    async def handler(msg: BusMessage) -> None:
        received.append(msg)

    bus.subscribe("downstream", handler)
    original = BusMessage(topic="upstream", sender="agent-a", hop_count=2)
    await bus.forward(original, "downstream")

    assert len(received) == 1
    assert received[0].hop_count == 3
    assert received[0].topic == "downstream"


@pytest.mark.asyncio()
async def test_forward_chain_stops_at_max(bus: MessageBus) -> None:
    received: list[BusMessage] = []

    async def handler(msg: BusMessage) -> None:
        received.append(msg)

    bus.subscribe("chain", handler)
    msg = BusMessage(topic="start", sender="x", hop_count=0, max_hops=3)

    # Forward 3 times — first two should arrive, third should be dropped
    await bus.forward(msg, "chain")         # hop_count=1, delivered
    await bus.forward(msg.model_copy(update={"hop_count": 1}), "chain")  # hop_count=2, delivered
    await bus.forward(msg.model_copy(update={"hop_count": 2}), "chain")  # hop_count=3, dropped

    assert len(received) == 2


@pytest.mark.asyncio()
async def test_get_history(bus: MessageBus) -> None:
    for i in range(5):
        await bus.publish(BusMessage(topic="log", sender=f"s{i}"))

    history = bus.get_history()
    assert len(history) == 5


@pytest.mark.asyncio()
async def test_get_history_filtered_by_topic(bus: MessageBus) -> None:
    await bus.publish(BusMessage(topic="alpha", sender="x"))
    await bus.publish(BusMessage(topic="beta", sender="x"))
    await bus.publish(BusMessage(topic="alpha", sender="y"))

    alpha_history = bus.get_history(topic="alpha")
    assert len(alpha_history) == 2
    assert all(m.topic == "alpha" for m in alpha_history)


@pytest.mark.asyncio()
async def test_multiple_handlers(bus: MessageBus) -> None:
    results: list[str] = []

    async def handler_a(msg: BusMessage) -> None:
        results.append("a")

    async def handler_b(msg: BusMessage) -> None:
        results.append("b")

    bus.subscribe("multi", handler_a)
    bus.subscribe("multi", handler_b)
    await bus.publish(BusMessage(topic="multi", sender="x"))

    assert "a" in results
    assert "b" in results
    assert len(results) == 2


@pytest.mark.asyncio()
async def test_handler_error_doesnt_break_others(bus: MessageBus) -> None:
    results: list[str] = []

    async def bad_handler(msg: BusMessage) -> None:
        raise ValueError("boom")

    async def good_handler(msg: BusMessage) -> None:
        results.append("ok")

    bus.subscribe("err", bad_handler)
    bus.subscribe("err", good_handler)
    await bus.publish(BusMessage(topic="err", sender="x"))

    assert "ok" in results


@pytest.mark.asyncio()
async def test_payload_types(bus: MessageBus) -> None:
    received: list[BusMessage] = []

    async def handler(msg: BusMessage) -> None:
        received.append(msg)

    bus.subscribe("types", handler)
    payload: dict[str, object] = {
        "string_val": "hello",
        "int_val": 42,
        "list_val": [1, 2, 3],
        "nested": {"inner": "data"},
    }
    await bus.emit("types", "sender", payload)

    assert len(received) == 1
    p = received[0].payload
    assert p["string_val"] == "hello"
    assert p["int_val"] == 42
    assert p["list_val"] == [1, 2, 3]
    assert p["nested"] == {"inner": "data"}
