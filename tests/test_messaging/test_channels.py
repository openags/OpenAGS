"""Tests for messaging module — protocol, channels, and notification router."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import SecretStr

from openags.research.messaging.protocol import Channel
from openags.models import DiscordConfig, FeishuConfig, MessagingConfig, TelegramConfig


# ── Protocol ──────────────────────────────────────────


class MockChannel:
    """Minimal channel implementation for protocol tests."""

    def __init__(self, name: str = "mock", succeed: bool = True):
        self._name = name
        self._succeed = succeed
        self.sent: list[str] = []

    @property
    def channel_id(self) -> str:
        return self._name

    async def send_text(self, text: str) -> bool:
        self.sent.append(text)
        return self._succeed

    async def send_markdown(self, markdown: str) -> bool:
        self.sent.append(markdown)
        return self._succeed

    async def send_notification(self, title: str, body: str, level: str = "info") -> bool:
        self.sent.append(f"[{level}] {title}: {body}")
        return self._succeed

    async def health_check(self) -> bool:
        return self._succeed


def test_mock_channel_is_channel():
    ch = MockChannel()
    assert isinstance(ch, Channel)


async def test_mock_channel_send():
    ch = MockChannel()
    assert await ch.send_text("hello")
    assert ch.sent == ["hello"]


async def test_mock_channel_notification():
    ch = MockChannel()
    assert await ch.send_notification("Title", "Body", "success")
    assert "[success] Title: Body" in ch.sent[0]


# ── Telegram ──────────────────────────────────────────


class TestTelegramChannel:
    def test_init(self):
        from openags.research.messaging.telegram import TelegramChannel

        config = TelegramConfig(token=SecretStr("123:ABC"), chat_id="@test")
        ch = TelegramChannel(config)
        assert ch.channel_id == "telegram"

    def test_implements_protocol(self):
        from openags.research.messaging.telegram import TelegramChannel

        config = TelegramConfig(token=SecretStr("123:ABC"), chat_id="@test")
        ch = TelegramChannel(config)
        assert isinstance(ch, Channel)

    async def test_send_text(self):
        from openags.research.messaging.telegram import TelegramChannel

        config = TelegramConfig(token=SecretStr("123:ABC"), chat_id="@test")
        ch = TelegramChannel(config)

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"ok": True}

        with patch("openags.research.messaging.telegram.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            result = await ch.send_text("Hello!")
            assert result is True

    async def test_health_check_fail(self):
        from openags.research.messaging.telegram import TelegramChannel

        config = TelegramConfig(token=SecretStr("bad"), chat_id="@test")
        ch = TelegramChannel(config)

        with patch("openags.research.messaging.telegram.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(side_effect=Exception("network error"))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            assert await ch.health_check() is False


# ── Feishu ────────────────────────────────────────────


class TestFeishuChannel:
    def test_init(self):
        from openags.research.messaging.feishu import FeishuChannel

        config = FeishuConfig(app_id="cli_xxx", app_secret=SecretStr("secret"), chat_id="oc_xxx")
        ch = FeishuChannel(config)
        assert ch.channel_id == "feishu"

    def test_implements_protocol(self):
        from openags.research.messaging.feishu import FeishuChannel

        config = FeishuConfig(app_id="cli_xxx", app_secret=SecretStr("secret"), chat_id="oc_xxx")
        ch = FeishuChannel(config)
        assert isinstance(ch, Channel)

    async def test_send_webhook(self):
        from openags.research.messaging.feishu import FeishuChannel

        config = FeishuConfig(
            app_id="cli_xxx",
            app_secret=SecretStr("secret"),
            chat_id="https://open.feishu.cn/open-apis/bot/v2/hook/xxx",
        )
        ch = FeishuChannel(config)

        mock_response = MagicMock()
        mock_response.json.return_value = {"code": 0}

        with patch("openags.research.messaging.feishu.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            result = await ch.send_text("Hello from Feishu!")
            assert result is True


# ── Discord ───────────────────────────────────────────


class TestDiscordChannel:
    def test_init(self):
        from openags.research.messaging.discord import DiscordChannel

        config = DiscordConfig(token=SecretStr("bot-token"), channel_id="123456789")
        ch = DiscordChannel(config)
        assert ch.channel_id == "discord"

    def test_implements_protocol(self):
        from openags.research.messaging.discord import DiscordChannel

        config = DiscordConfig(token=SecretStr("bot-token"), channel_id="123456789")
        ch = DiscordChannel(config)
        assert isinstance(ch, Channel)

    async def test_send_text(self):
        from openags.research.messaging.discord import DiscordChannel

        config = DiscordConfig(token=SecretStr("bot-token"), channel_id="123456789")
        ch = DiscordChannel(config)

        mock_response = MagicMock()
        mock_response.status_code = 200

        with patch("openags.research.messaging.discord.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            result = await ch.send_text("Hello Discord!")
            assert result is True

    async def test_send_webhook(self):
        from openags.research.messaging.discord import DiscordChannel

        config = DiscordConfig(
            token=SecretStr("unused"),
            channel_id="https://discord.com/api/webhooks/xxx/yyy",
        )
        ch = DiscordChannel(config)

        mock_response = MagicMock()
        mock_response.status_code = 204

        with patch("openags.research.messaging.discord.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            result = await ch.send_text("Webhook test!")
            assert result is True

    async def test_send_notification_embed(self):
        from openags.research.messaging.discord import DiscordChannel

        config = DiscordConfig(token=SecretStr("bot-token"), channel_id="123456789")
        ch = DiscordChannel(config)

        mock_response = MagicMock()
        mock_response.status_code = 201

        with patch("openags.research.messaging.discord.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            result = await ch.send_notification("Test", "Body", "error")
            assert result is True


# ── Notification Router ───────────────────────────────


class TestNotificationRouter:
    def test_init_empty(self):
        from openags.research.messaging.router import NotificationRouter

        router = NotificationRouter()
        assert router.channel_count == 0
        assert router.channel_ids == []

    def test_add_remove_channel(self):
        from openags.research.messaging.router import NotificationRouter

        router = NotificationRouter()
        ch = MockChannel("test")
        router.add_channel(ch)
        assert router.channel_count == 1
        assert "test" in router.channel_ids

        router.remove_channel("test")
        assert router.channel_count == 0

    async def test_send_text_all(self):
        from openags.research.messaging.router import NotificationRouter

        router = NotificationRouter()
        ch1 = MockChannel("a")
        ch2 = MockChannel("b")
        router.add_channel(ch1)
        router.add_channel(ch2)

        results = await router.send_text("broadcast")
        assert results == {"a": True, "b": True}
        assert ch1.sent == ["broadcast"]
        assert ch2.sent == ["broadcast"]

    async def test_notify_all(self):
        from openags.research.messaging.router import NotificationRouter

        router = NotificationRouter()
        ch = MockChannel("test")
        router.add_channel(ch)

        results = await router.notify("Done", "All passed", "success")
        assert results["test"] is True
        assert "Done" in ch.sent[0]

    async def test_send_with_failure(self):
        from openags.research.messaging.router import NotificationRouter

        router = NotificationRouter()
        good = MockChannel("good", succeed=True)
        bad = MockChannel("bad", succeed=False)
        router.add_channel(good)
        router.add_channel(bad)

        results = await router.send_text("test")
        assert results["good"] is True
        assert results["bad"] is False

    async def test_health_check_all(self):
        from openags.research.messaging.router import NotificationRouter

        router = NotificationRouter()
        ch = MockChannel("test")
        router.add_channel(ch)

        results = await router.health_check_all()
        assert results["test"] is True

    def test_from_config_empty(self):
        from openags.research.messaging.router import NotificationRouter

        config = MessagingConfig()
        router = NotificationRouter.from_config(config)
        assert router.channel_count == 0

    def test_from_config_telegram(self):
        from openags.research.messaging.router import NotificationRouter

        config = MessagingConfig(
            telegram=TelegramConfig(token=SecretStr("123:ABC"), chat_id="@test"),
        )
        router = NotificationRouter.from_config(config)
        assert router.channel_count == 1
        assert "telegram" in router.channel_ids

    def test_from_config_all(self):
        from openags.research.messaging.router import NotificationRouter

        config = MessagingConfig(
            telegram=TelegramConfig(token=SecretStr("123:ABC"), chat_id="@test"),
            feishu=FeishuConfig(app_id="x", app_secret=SecretStr("s"), chat_id="c"),
            discord=DiscordConfig(token=SecretStr("t"), channel_id="ch"),
        )
        router = NotificationRouter.from_config(config)
        assert router.channel_count == 3
