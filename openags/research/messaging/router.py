"""Notification router — routes events to configured messaging channels."""

from __future__ import annotations

import logging

from openags.models import MessagingConfig
from openags.research.messaging.protocol import Channel

logger = logging.getLogger(__name__)


class NotificationRouter:
    """Routes notifications to all configured messaging channels.

    Usage:
        router = NotificationRouter.from_config(config.messaging)
        await router.notify("Experiment Complete", "All tests passed", level="success")
    """

    def __init__(self) -> None:
        self._channels: dict[str, Channel] = {}

    def add_channel(self, channel: Channel) -> None:
        self._channels[channel.channel_id] = channel
        logger.info("Registered notification channel: %s", channel.channel_id)

    def remove_channel(self, channel_id: str) -> None:
        self._channels.pop(channel_id, None)

    @property
    def channel_count(self) -> int:
        return len(self._channels)

    @property
    def channel_ids(self) -> list[str]:
        return list(self._channels.keys())

    async def send_text(self, text: str) -> dict[str, bool]:
        """Send text to all channels. Returns {channel_id: success}."""
        results: dict[str, bool] = {}
        for cid, ch in self._channels.items():
            try:
                results[cid] = await ch.send_text(text)
            except Exception as e:
                logger.error("Failed to send text to %s: %s", cid, e)
                results[cid] = False
        return results

    async def send_markdown(self, markdown: str) -> dict[str, bool]:
        """Send markdown to all channels."""
        results: dict[str, bool] = {}
        for cid, ch in self._channels.items():
            try:
                results[cid] = await ch.send_markdown(markdown)
            except Exception as e:
                logger.error("Failed to send markdown to %s: %s", cid, e)
                results[cid] = False
        return results

    async def notify(
        self,
        title: str,
        body: str,
        level: str = "info",
    ) -> dict[str, bool]:
        """Send a notification to all channels."""
        results: dict[str, bool] = {}
        for cid, ch in self._channels.items():
            try:
                results[cid] = await ch.send_notification(title, body, level)
            except Exception as e:
                logger.error("Failed to notify %s: %s", cid, e)
                results[cid] = False
        return results

    async def health_check_all(self) -> dict[str, bool]:
        """Health check all channels."""
        results: dict[str, bool] = {}
        for cid, ch in self._channels.items():
            try:
                results[cid] = await ch.health_check()
            except Exception:
                results[cid] = False
        return results

    @classmethod
    def from_config(cls, messaging: MessagingConfig) -> NotificationRouter:
        """Create router from MessagingConfig, instantiating configured channels."""
        router = cls()

        if messaging.telegram:
            from openags.research.messaging.telegram import TelegramChannel

            router.add_channel(TelegramChannel(messaging.telegram))

        if messaging.feishu:
            from openags.research.messaging.feishu import FeishuChannel

            router.add_channel(FeishuChannel(messaging.feishu))

        if messaging.discord:
            from openags.research.messaging.discord import DiscordChannel

            router.add_channel(DiscordChannel(messaging.discord))

        return router
