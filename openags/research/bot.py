"""IM Bot command handler — parses /commands from incoming messages and routes to OpenAGS.

Supports Telegram, Discord, and Feishu bots.  Each platform's polling/webhook
handler calls ``BotHandler.handle(text, chat_id)`` and gets back a reply string.

Commands:
    /status [project]         — show project status
    /run <project> <task>     — run an agent task
    /chat <project> <message> — chat with the coordinator
    /projects                 — list all projects
    /help                     — show available commands
"""

from __future__ import annotations

import asyncio
import logging
import re

logger = logging.getLogger(__name__)


class BotHandler:
    """Parse and execute bot commands against the OpenAGS orchestrator."""

    def __init__(self, orchestrator: object) -> None:
        self._orch = orchestrator

    async def handle(self, text: str, chat_id: str = "") -> str:
        """Handle a single incoming message. Returns the reply string."""
        text = text.strip()
        if not text.startswith("/"):
            return ""  # not a command

        parts = text.split(maxsplit=2)
        cmd = parts[0].lower()

        try:
            if cmd == "/help":
                return self._help()
            elif cmd == "/projects":
                return await self._list_projects()
            elif cmd == "/status":
                project_id = parts[1] if len(parts) > 1 else ""
                return await self._status(project_id)
            elif cmd == "/run":
                if len(parts) < 3:
                    return "Usage: /run <project> <task>"
                return await self._run(parts[1], parts[2])
            elif cmd == "/chat":
                if len(parts) < 3:
                    return "Usage: /chat <project> <message>"
                return await self._chat(parts[1], parts[2], chat_id)
            else:
                return f"Unknown command: {cmd}\nType /help for available commands."
        except Exception as e:
            logger.error("Bot command error: %s", e)
            return f"Error: {e}"

    def _help(self) -> str:
        return (
            "OpenAGS Bot Commands:\n"
            "/projects — List all projects\n"
            "/status [project] — Project status\n"
            "/run <project> <task> — Run agent task\n"
            "/chat <project> <message> — Chat with coordinator\n"
            "/help — Show this help"
        )

    async def _list_projects(self) -> str:
        projects = self._orch.project_mgr.list_all()  # type: ignore[attr-defined]
        if not projects:
            return "No projects found."
        lines = ["Projects:"]
        for p in projects:
            lines.append(f"  {p.id} — {p.name}")
        return "\n".join(lines)

    async def _status(self, project_id: str) -> str:
        if not project_id:
            return await self._list_projects()

        try:
            project = self._orch.project_mgr.get(project_id)  # type: ignore[attr-defined]
        except Exception:
            return f"Project '{project_id}' not found."

        from openags.research.project import discover_modules

        modules = discover_modules(project.workspace)
        lines = [f"Project: {project.name} ({project.id})", f"Stage: {project.stage}", "Modules:"]
        for m in modules:
            lines.append(f"  - {m}")
        if not modules:
            lines.append("  (none)")
        return "\n".join(lines)

    async def _run(self, project_id: str, task: str) -> str:
        try:
            result = await self._orch.run_agent(project_id, "coordinator", task)  # type: ignore[attr-defined]
            if result.success:
                output = result.output[:500]
                return f"Done ({result.duration_seconds:.1f}s)\n\n{output}"
            return f"Failed: {result.error}"
        except Exception as e:
            return f"Error: {e}"

    async def _chat(self, project_id: str, message: str, chat_id: str) -> str:
        try:
            messages = [{"role": "user", "content": message}]
            response = await self._orch.chat(project_id, "coordinator", messages)  # type: ignore[attr-defined]
            return response.content[:1000]
        except Exception as e:
            return f"Error: {e}"


class IMSessionMapper:
    """Map IM conversations to OpenAGS sessions.

    Tracks which IM chat_id corresponds to which project/session,
    enabling multi-turn conversations over IM.
    """

    def __init__(self) -> None:
        # chat_id → (project_id, session_id)
        self._mapping: dict[str, tuple[str, str]] = {}

    def bind(self, chat_id: str, project_id: str, session_id: str) -> None:
        """Bind an IM chat to a specific project session."""
        self._mapping[chat_id] = (project_id, session_id)

    def get(self, chat_id: str) -> tuple[str, str] | None:
        """Get the (project_id, session_id) for an IM chat, or None."""
        return self._mapping.get(chat_id)

    def unbind(self, chat_id: str) -> None:
        """Remove the binding for an IM chat."""
        self._mapping.pop(chat_id, None)
