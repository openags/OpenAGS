"""openags.agent — self-contained agent engine.

Zero dependency on the research layer.  Any object satisfying the
``Backend`` protocol can drive the agent loop.

Usage::

    from openags.agent import Agent, MemorySystem, create_engine_registry
    from openags.models import AgentConfig

    registry = create_engine_registry(Path("./workspace"))
    memory   = MemorySystem(Path("./workspace"))

    agent = Agent(
        config=AgentConfig(name="assistant"),
        module_dir=Path("./workspace"),
        backend=my_backend,
        memory=memory,
        tool_registry=registry,
    )
    result = await agent.loop("do something")
"""

from __future__ import annotations

from openags.agent.backend import Backend
from openags.agent.directive import generate_directive_id, parse_directive, write_directive
from openags.agent.discovery import AgentDiscovery
from openags.agent.errors import OpenAGSError
from openags.agent.llm import LLMBackend
from openags.agent.loop import Agent
from openags.agent.memory import MemorySystem
from openags.agent.session import SessionManager
from openags.agent.soul import parse_soul, write_soul
from openags.agent.status import parse_status, status_is_terminal, write_status, write_status_from_result
from openags.agent.tools.base import ToolRegistry, create_engine_registry

__all__ = [
    "Agent",
    "AgentDiscovery",
    "Backend",
    "LLMBackend",
    "MemorySystem",
    "OpenAGSError",
    "SessionManager",
    "ToolRegistry",
    "create_engine_registry",
    "generate_directive_id",
    "parse_directive",
    "parse_soul",
    "parse_status",
    "status_is_terminal",
    "write_directive",
    "write_soul",
    "write_status",
    "write_status_from_result",
]
