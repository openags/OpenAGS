"""Tests for IM bot command handler."""

from __future__ import annotations

import pytest

from openags.research.bot import BotHandler, IMSessionMapper


class FakeOrch:
    """Minimal orchestrator stub for bot testing."""

    class ProjectMgr:
        def list_all(self):
            return []

        def get(self, project_id):
            raise ValueError(f"not found: {project_id}")

    project_mgr = ProjectMgr()


@pytest.mark.asyncio
async def test_help_command() -> None:
    handler = BotHandler(FakeOrch())
    reply = await handler.handle("/help")
    assert "OpenAGS Bot Commands" in reply
    assert "/projects" in reply


@pytest.mark.asyncio
async def test_projects_empty() -> None:
    handler = BotHandler(FakeOrch())
    reply = await handler.handle("/projects")
    assert "No projects" in reply


@pytest.mark.asyncio
async def test_unknown_command() -> None:
    handler = BotHandler(FakeOrch())
    reply = await handler.handle("/unknown_cmd")
    assert "Unknown command" in reply


@pytest.mark.asyncio
async def test_non_command_ignored() -> None:
    handler = BotHandler(FakeOrch())
    reply = await handler.handle("just a message")
    assert reply == ""


@pytest.mark.asyncio
async def test_run_missing_args() -> None:
    handler = BotHandler(FakeOrch())
    reply = await handler.handle("/run proj1")
    assert "Usage" in reply


def test_session_mapper() -> None:
    mapper = IMSessionMapper()
    assert mapper.get("chat-1") is None

    mapper.bind("chat-1", "proj-1", "sess-1")
    assert mapper.get("chat-1") == ("proj-1", "sess-1")

    mapper.unbind("chat-1")
    assert mapper.get("chat-1") is None
