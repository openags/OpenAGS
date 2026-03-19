"""Log and token usage API routes."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from fastapi import APIRouter, Query, Request

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/tokens")
async def get_token_summary(
    request: Request,
    project_id: str | None = Query(None, description="Filter by project ID"),
) -> dict[str, int | float]:
    """Get aggregated token usage summary, optionally filtered by project."""
    orch = request.app.state.orchestrator
    return orch.get_token_summary(project_id)


@router.get("/tokens/recent")
async def get_recent_token_entries(
    request: Request,
    limit: int = Query(100, ge=1, le=1000),
    project_id: str | None = Query(None),
) -> list[dict]:
    """Get recent token usage log entries (newest first)."""
    config = request.app.state.config
    log_path: Path = config.workspace_dir / "logs" / "token_usage.jsonl"

    if not log_path.exists():
        return []

    entries: list[dict] = []
    for line in reversed(log_path.read_text(encoding="utf-8").splitlines()):
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        if project_id and entry.get("project_id") != project_id:
            continue
        entries.append(entry)
        if len(entries) >= limit:
            break

    return entries


@router.get("/health")
async def logs_health(request: Request) -> dict:
    """Check logs subsystem health."""
    config = request.app.state.config
    log_path: Path = config.workspace_dir / "logs" / "token_usage.jsonl"
    return {
        "log_file": str(log_path),
        "exists": log_path.exists(),
        "size_bytes": log_path.stat().st_size if log_path.exists() else 0,
    }
