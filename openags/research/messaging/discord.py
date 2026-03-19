"""Discord notification channel via Bot API / Webhook."""

from __future__ import annotations

import logging

import httpx

from openags.models import DiscordConfig

logger = logging.getLogger(__name__)

_LEVEL_COLOR = {
    "info": 0x3498DB,     # blue
    "warning": 0xF39C12,  # orange
    "error": 0xE74C3C,    # red
    "success": 0x2ECC71,  # green
}


class DiscordChannel:
    """Send notifications to a Discord channel via Bot API.

    Requires a bot token and channel_id.
    Alternatively, channel_id can be a webhook URL for simpler setup.
    """

    def __init__(self, config: DiscordConfig) -> None:
        self._token = config.token.get_secret_value()
        self._channel_id = config.channel_id
        self._base_url = "https://discord.com/api/v10"

    @property
    def channel_id(self) -> str:
        return "discord"

    async def send_text(self, text: str) -> bool:
        if self._channel_id.startswith("http"):
            return await self._send_webhook({"content": text})
        return await self._send_bot(text)

    async def send_markdown(self, markdown: str) -> bool:
        # Discord uses its own markdown format; wrap in code block for complex md
        return await self.send_text(markdown)

    async def send_notification(
        self,
        title: str,
        body: str,
        level: str = "info",
    ) -> bool:
        embed = {
            "title": title,
            "description": body,
            "color": _LEVEL_COLOR.get(level, 0x3498DB),
        }

        if self._channel_id.startswith("http"):
            return await self._send_webhook({"embeds": [embed]})
        return await self._send_bot_embed(embed)

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    f"{self._base_url}/users/@me",
                    headers={"Authorization": f"Bot {self._token}"},
                )
                return r.status_code == 200
        except Exception as e:
            logger.warning("Discord health check failed: %s", e)
            return False

    async def _send_bot(self, text: str) -> bool:
        """Send via Discord Bot API."""
        url = f"{self._base_url}/channels/{self._channel_id}/messages"
        headers = {"Authorization": f"Bot {self._token}"}

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(url, headers=headers, json={"content": text})
                if r.status_code in (200, 201):
                    return True
                logger.warning("Discord send failed: %s %s", r.status_code, r.text)
                return False
        except Exception as e:
            logger.error("Discord send error: %s", e)
            return False

    async def _send_bot_embed(self, embed: dict) -> bool:
        """Send an embed via Discord Bot API."""
        url = f"{self._base_url}/channels/{self._channel_id}/messages"
        headers = {"Authorization": f"Bot {self._token}"}

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(url, headers=headers, json={"embeds": [embed]})
                if r.status_code in (200, 201):
                    return True
                logger.warning("Discord embed failed: %s", r.text)
                return False
        except Exception as e:
            logger.error("Discord embed error: %s", e)
            return False

    async def _send_webhook(self, payload: dict) -> bool:
        """Send via Discord webhook URL."""
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(self._channel_id, json=payload)
                if r.status_code in (200, 204):
                    return True
                logger.warning("Discord webhook failed: %s", r.text)
                return False
        except Exception as e:
            logger.error("Discord webhook error: %s", e)
            return False
