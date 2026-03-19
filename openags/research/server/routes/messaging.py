"""Messaging / notification API routes."""

from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter()


class SendNotificationRequest(BaseModel):
    title: str
    body: str
    level: str = "info"


class SendTextRequest(BaseModel):
    text: str


def _get_notifier(request: Request):
    return request.app.state.notifier


@router.get("/channels")
async def list_channels(request: Request) -> dict[str, list[str]]:
    """List configured notification channels."""
    notifier = _get_notifier(request)
    return {"channels": notifier.channel_ids}


@router.get("/health")
async def health_check(request: Request) -> dict[str, bool]:
    """Health check all configured channels."""
    notifier = _get_notifier(request)
    return await notifier.health_check_all()


@router.post("/notify")
async def send_notification(
    request: Request,
    body: SendNotificationRequest,
) -> dict[str, bool]:
    """Send a notification to all channels."""
    notifier = _get_notifier(request)
    return await notifier.notify(body.title, body.body, body.level)


@router.post("/send")
async def send_text(request: Request, body: SendTextRequest) -> dict[str, bool]:
    """Send plain text to all channels."""
    notifier = _get_notifier(request)
    return await notifier.send_text(body.text)
