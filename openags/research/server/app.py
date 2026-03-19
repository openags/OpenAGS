"""FastAPI application factory."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from openags.research.auth import UserManager
from openags.research.config import load_config
from openags.research.orchestrator import Orchestrator


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan: init on startup, cleanup on shutdown."""
    config = load_config()
    app.state.config = config
    orch = Orchestrator(config)
    app.state.orchestrator = orch
    app.state.user_mgr = UserManager(config.workspace_dir)
    app.state.notifier = orch.notifier
    yield


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="OpenAGS",
        description="Open Autonomous Generalist Scientist API",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS: allow any localhost origin (dynamic Vite ports) + Electron
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["app://.", "null"],
        allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=True,
    )

    # Production middleware: rate limiting + audit logging
    from openags.research.server.middleware import AuditLogMiddleware, RateLimitMiddleware

    app.add_middleware(AuditLogMiddleware)
    app.add_middleware(RateLimitMiddleware, max_requests=120, window_seconds=60)

    # Import and register route modules
    from openags.research.server.routes import (
        agent_config,
        agents,
        auth,
        config,
        experiments,
        gpu,
        logs,
        manuscript,
        messaging,
        projects,
        sessions,
        skills,
        ws,
    )

    app.include_router(agent_config.router, prefix="/api/agent", tags=["agent-config"])
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
    app.include_router(agents.router, prefix="/api/agents", tags=["agents"])
    app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
    app.include_router(experiments.router, prefix="/api/experiments", tags=["experiments"])
    app.include_router(gpu.router, prefix="/api/gpu", tags=["gpu"])
    app.include_router(messaging.router, prefix="/api/messaging", tags=["messaging"])
    app.include_router(skills.router, prefix="/api/skills", tags=["skills"])
    app.include_router(config.router, prefix="/api/config", tags=["config"])
    app.include_router(logs.router, prefix="/api/logs", tags=["logs"])
    app.include_router(manuscript.router, prefix="/api/manuscript", tags=["manuscript"])
    app.include_router(ws.router, prefix="/ws", tags=["websocket"])

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "version": "0.1.0"}

    @app.get("/")
    async def root() -> dict[str, str]:
        return {
            "name": "OpenAGS API",
            "version": "0.1.0",
            "docs": "/docs",
            "ui": "http://localhost:3001",
        }

    return app
