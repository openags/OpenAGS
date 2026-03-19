"""Feishu (Lark) notification channel via Bot Webhook."""

from __future__ import annotations

import logging
import time

import httpx

from openags.models import FeishuConfig

logger = logging.getLogger(__name__)

_LEVEL_EMOJI = {
    "info": "ℹ️",
    "warning": "⚠️",
    "error": "❌",
    "success": "✅",
}


class FeishuChannel:
    """Send notifications to Feishu/Lark via Bot Webhook or API.

    Supports two modes:
      1. Webhook URL (simple, no OAuth needed)
      2. App API with app_id/app_secret (for richer message types)

    For webhook mode, set chat_id to the webhook URL.
    For API mode, provide app_id and app_secret.
    """

    def __init__(self, config: FeishuConfig) -> None:
        self._app_id = config.app_id
        self._app_secret = config.app_secret.get_secret_value()
        self._chat_id = config.chat_id
        self._tenant_token: str | None = None
        self._token_expires: float = 0

    @property
    def channel_id(self) -> str:
        return "feishu"

    async def send_text(self, text: str) -> bool:
        return await self._send_webhook({"msg_type": "text", "content": {"text": text}})

    async def send_markdown(self, markdown: str) -> bool:
        # Feishu uses "interactive" card for rich formatting
        card = {
            "msg_type": "interactive",
            "card": {
                "elements": [
                    {
                        "tag": "markdown",
                        "content": markdown,
                    }
                ],
            },
        }
        return await self._send_webhook(card)

    async def send_notification(
        self,
        title: str,
        body: str,
        level: str = "info",
    ) -> bool:
        emoji = _LEVEL_EMOJI.get(level, "ℹ️")
        card = {
            "msg_type": "interactive",
            "card": {
                "header": {
                    "title": {"tag": "plain_text", "content": f"{emoji} {title}"},
                    "template": "blue" if level == "info" else "red" if level == "error" else "orange",
                },
                "elements": [
                    {"tag": "markdown", "content": body},
                ],
            },
        }
        return await self._send_webhook(card)

    async def health_check(self) -> bool:
        """Check connectivity by getting a tenant access token."""
        try:
            token = await self._get_tenant_token()
            return token is not None
        except Exception as e:
            logger.warning("Feishu health check failed: %s", e)
            return False

    async def _send_webhook(self, payload: dict) -> bool:
        """Send via webhook URL (chat_id as webhook URL)."""
        url = self._chat_id
        if not url.startswith("http"):
            # If chat_id is not a URL, use the API method
            return await self._send_api(payload)

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(url, json=payload)
                data = r.json()
                if data.get("code") == 0 or data.get("StatusCode") == 0:
                    return True
                logger.warning("Feishu webhook failed: %s", data)
                return False
        except Exception as e:
            logger.error("Feishu send error: %s", e)
            return False

    async def _send_api(self, payload: dict) -> bool:
        """Send via Feishu API with tenant token."""
        token = await self._get_tenant_token()
        if not token:
            return False

        url = "https://open.feishu.cn/open-apis/im/v1/messages"
        params = {"receive_id_type": "chat_id"}
        headers = {"Authorization": f"Bearer {token}"}

        body = {
            "receive_id": self._chat_id,
            **payload,
        }

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(url, params=params, headers=headers, json=body)
                data = r.json()
                if data.get("code") == 0:
                    return True
                logger.warning("Feishu API send failed: %s", data)
                return False
        except Exception as e:
            logger.error("Feishu API error: %s", e)
            return False

    async def _get_tenant_token(self) -> str | None:
        """Get or refresh the Feishu tenant access token."""
        if self._tenant_token and time.time() < self._token_expires:
            return self._tenant_token

        url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
        payload = {
            "app_id": self._app_id,
            "app_secret": self._app_secret,
        }

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(url, json=payload)
                data = r.json()
                if data.get("code") == 0:
                    self._tenant_token = data["tenant_access_token"]
                    self._token_expires = time.time() + data.get("expire", 7200) - 300
                    return self._tenant_token
        except Exception as e:
            logger.error("Feishu token error: %s", e)

        return None
