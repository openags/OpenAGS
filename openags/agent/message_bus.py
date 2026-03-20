"""Async event bus for inter-agent communication with hop_count anti-loop."""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from collections.abc import Awaitable, Callable

from openags.models import BusMessage

logger = logging.getLogger(__name__)

MessageHandler = Callable[[BusMessage], Awaitable[None]]


class MessageBus:
    """Topic-based async pub/sub for agent coordination.

    Features:
      - Type-safe BusMessage with sender, payload, timestamp
      - hop_count anti-loop: messages exceeding max_hops are dropped
      - forward() auto-increments hop_count for safe message relay
      - Bounded history for debugging
    """

    def __init__(self) -> None:
        self._handlers: dict[str, list[MessageHandler]] = defaultdict(list)
        self._history: list[BusMessage] = []
        self._mailbox: dict[str, list[BusMessage]] = defaultdict(list)

    def subscribe(self, topic: str, handler: MessageHandler) -> None:
        self._handlers[topic].append(handler)

    def unsubscribe(self, topic: str, handler: MessageHandler) -> None:
        handlers = self._handlers.get(topic, [])
        if handler in handlers:
            handlers.remove(handler)

    async def publish(self, message: BusMessage) -> None:
        """Publish a typed message. Drops if hop_count >= max_hops."""
        if message.hop_count >= message.max_hops:
            logger.warning(
                "Message dropped: hop_count=%d reached max_hops=%d on topic '%s'",
                message.hop_count,
                message.max_hops,
                message.topic,
            )
            return

        self._history.append(message)
        if len(self._history) > 1000:
            self._history = self._history[-500:]

        handlers = self._handlers.get(message.topic, [])
        if not handlers:
            return

        results = await asyncio.gather(
            *[self._safe_call(h, message) for h in handlers],
            return_exceptions=True,
        )
        for result in results:
            if isinstance(result, Exception):
                logger.error("Handler error on '%s': %s", message.topic, result)

    async def emit(self, topic: str, sender: str, payload: dict[str, object] | None = None) -> None:
        """Convenience: create and publish a BusMessage in one call."""
        msg = BusMessage(topic=topic, sender=sender, payload=payload or {})
        await self.publish(msg)

    async def forward(self, original: BusMessage, new_topic: str) -> None:
        """Forward a message to a new topic, auto-incrementing hop_count."""
        forwarded = original.model_copy(
            update={
                "topic": new_topic,
                "hop_count": original.hop_count + 1,
            }
        )
        await self.publish(forwarded)

    @staticmethod
    async def _safe_call(handler: MessageHandler, message: BusMessage) -> None:
        try:
            await asyncio.wait_for(handler(message), timeout=30)
        except TimeoutError:
            logger.warning("Handler timed out on topic '%s'", message.topic)
            raise

    def get_history(self, topic: str | None = None, limit: int = 50) -> list[BusMessage]:
        """Get recent message history, optionally filtered by topic."""
        events = self._history
        if topic:
            events = [e for e in events if e.topic == topic]
        return events[-limit:]

    # ── Phase 7: Directed messaging for Agent Teams ────

    async def send(self, from_agent: str, to_agent: str, content: str) -> None:
        """Send a directed message from one agent to another."""
        msg = BusMessage(
            topic=f"direct.{to_agent}",
            sender=from_agent,
            payload={"content": content, "from": from_agent, "to": to_agent},
        )
        self._mailbox.setdefault(to_agent, []).append(msg)
        self._history.append(msg)
        if len(self._history) > 1000:
            self._history = self._history[-500:]
        # Also publish on the direct topic for subscribers
        await self.publish(msg)

    async def receive(self, agent_name: str, clear: bool = True) -> list[BusMessage]:
        """Receive all pending directed messages for an agent."""
        messages = self._mailbox.get(agent_name, [])
        if clear:
            self._mailbox[agent_name] = []
        return messages
