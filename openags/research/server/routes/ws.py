"""WebSocket routes — real-time agent output streaming."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()
logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections per project."""

    def __init__(self) -> None:
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, project_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.setdefault(project_id, []).append(ws)
        logger.info("WS connected: project=%s", project_id)

    def disconnect(self, project_id: str, ws: WebSocket) -> None:
        conns = self._connections.get(project_id, [])
        if ws in conns:
            conns.remove(ws)
        logger.info("WS disconnected: project=%s", project_id)

    async def broadcast(self, project_id: str, event: str, data: dict) -> None:
        """Send an event to all connections for a project."""
        msg = json.dumps({"event": event, "data": data})
        dead: list[WebSocket] = []

        for ws in self._connections.get(project_id, []):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)

        for ws in dead:
            self.disconnect(project_id, ws)

    def get_connection_count(self, project_id: str | None = None) -> int:
        if project_id:
            return len(self._connections.get(project_id, []))
        return sum(len(v) for v in self._connections.values())


manager = ConnectionManager()


@router.websocket("/{project_id}")
async def project_ws(ws: WebSocket, project_id: str) -> None:
    """WebSocket endpoint for real-time project events.

    Events sent to client:
      - agent.output: streaming agent text output
      - agent.completed: agent finished task
      - agent.failed: agent encountered error
      - experiment.progress: experiment execution progress

    Messages from client:
      - {"action": "interrupt"}: stop current agent
      - {"action": "approve"}: approve human-in-the-loop gate
    """
    await manager.connect(project_id, ws)
    try:
        while True:
            data = await ws.receive_text()
            try:
                msg = json.loads(data)
                action = msg.get("action", "")
                logger.info("WS action from client: %s (project=%s)", action, project_id)
                # Handle client actions (future: interrupt, approve, etc.)
            except json.JSONDecodeError:
                await ws.send_text(json.dumps({"error": "Invalid JSON"}))
    except WebSocketDisconnect:
        manager.disconnect(project_id, ws)
