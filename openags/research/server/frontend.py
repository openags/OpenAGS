"""Frontend adapter protocol — unified interface for CLI/Web/Desktop/IM."""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class FrontendAdapter(Protocol):
    """Frontend adapter interface — CLI/Web/Desktop/IM share this protocol."""

    @property
    def adapter_id(self) -> str:
        """Unique identifier, e.g. 'cli', 'web', 'electron', 'feishu'."""
        ...

    async def start(self) -> None:
        """Start the frontend service."""
        ...

    async def stop(self) -> None:
        """Stop the frontend service."""
        ...

    async def send_output(self, project_id: str, content: str) -> None:
        """Send agent output text to the user."""
        ...

    async def send_event(self, project_id: str, event: str, data: dict) -> None:
        """Send a structured event (progress/completed/error)."""
        ...


class CLIAdapter:
    """Minimal CLI adapter — prints to stdout."""

    @property
    def adapter_id(self) -> str:
        return "cli"

    async def start(self) -> None:
        pass

    async def stop(self) -> None:
        pass

    async def send_output(self, project_id: str, content: str) -> None:
        print(content, end="", flush=True)

    async def send_event(self, project_id: str, event: str, data: dict) -> None:
        print(f"\n[{event}] {data}")


class WebSocketAdapter:
    """WebSocket adapter — pushes events via WS ConnectionManager."""

    def __init__(self) -> None:
        from openags.research.server.routes.ws import manager
        self._manager = manager

    @property
    def adapter_id(self) -> str:
        return "web"

    async def start(self) -> None:
        pass

    async def stop(self) -> None:
        pass

    async def send_output(self, project_id: str, content: str) -> None:
        await self._manager.broadcast(project_id, "agent.output", {"content": content})

    async def send_event(self, project_id: str, event: str, data: dict) -> None:
        await self._manager.broadcast(project_id, event, data)
