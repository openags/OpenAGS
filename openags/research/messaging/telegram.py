"""Telegram notification channel via Bot API."""

from __future__ import annotations

import logging

import httpx

from openags.models import TelegramConfig

logger = logging.getLogger(__name__)

_LEVEL_EMOJI = {
    "info": "ℹ️",
    "warning": "⚠️",
    "error": "❌",
    "success": "✅",
}


class TelegramChannel:
    """Send notifications to a Telegram chat via Bot API.

    Requires a bot token and chat_id. Create a bot via @BotFather.
    """

    def __init__(self, config: TelegramConfig) -> None:
        self._token = config.token.get_secret_value()
        self._chat_id = config.chat_id
        self._base_url = f"https://api.telegram.org/bot{self._token}"

    @property
    def channel_id(self) -> str:
        return "telegram"

    async def send_text(self, text: str) -> bool:
        return await self._send(text, parse_mode=None)

    async def send_markdown(self, markdown: str) -> bool:
        return await self._send(markdown, parse_mode="MarkdownV2")

    async def send_notification(
        self,
        title: str,
        body: str,
        level: str = "info",
    ) -> bool:
        emoji = _LEVEL_EMOJI.get(level, "ℹ️")
        text = f"{emoji} *{title}*\n\n{body}"
        return await self._send(text, parse_mode="MarkdownV2")

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(f"{self._base_url}/getMe")
                return r.status_code == 200 and r.json().get("ok", False)
        except Exception as e:
            logger.warning("Telegram health check failed: %s", e)
            return False

    async def _send(self, text: str, parse_mode: str | None = None) -> bool:
        """Send a message via the Telegram Bot API."""
        payload: dict[str, str] = {
            "chat_id": self._chat_id,
            "text": text,
        }
        if parse_mode:
            payload["parse_mode"] = parse_mode

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(f"{self._base_url}/sendMessage", json=payload)
                if r.status_code == 200 and r.json().get("ok"):
                    return True
                logger.warning("Telegram send failed: %s", r.text)
                return False
        except Exception as e:
            logger.error("Telegram send error: %s", e)
            return False
