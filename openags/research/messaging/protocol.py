"""Messaging channel protocol — unified interface for notification channels."""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class Channel(Protocol):
    """Notification channel protocol — Telegram/Feishu/Discord share this interface."""

    @property
    def channel_id(self) -> str:
        """Unique identifier, e.g. 'telegram', 'feishu', 'discord'."""
        ...

    async def send_text(self, text: str) -> bool:
        """Send a plain text message. Returns True on success."""
        ...

    async def send_markdown(self, markdown: str) -> bool:
        """Send a markdown-formatted message. Returns True on success."""
        ...

    async def send_notification(
        self,
        title: str,
        body: str,
        level: str = "info",
    ) -> bool:
        """Send a structured notification (info/warning/error/success).

        Args:
            title: Notification title
            body: Notification body text
            level: One of 'info', 'warning', 'error', 'success'
        """
        ...

    async def health_check(self) -> bool:
        """Check if the channel is operational."""
        ...
