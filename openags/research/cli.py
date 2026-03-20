"""Standalone CLI for the OpenAGS agent engine.

Runs an agent in any directory — no project or server required.

Usage::

    # Single task
    openags agent "list all Python files"

    # REPL (interactive)
    openags agent --repl

    # With explicit workspace
    openags agent --workspace ./my-dir "summarize the code"
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

import typer
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel

console = Console()
logger = logging.getLogger(__name__)


def _resolve_workspace(workspace: str | None) -> Path:
    """Resolve workspace directory — default to cwd."""
    if workspace:
        ws = Path(workspace).resolve()
    else:
        ws = Path.cwd()
    ws.mkdir(parents=True, exist_ok=True)
    return ws


def _load_soul_config(workspace: Path) -> tuple[str | None, str | None]:
    """Load SOUL.md from workspace if it exists.

    Returns (agent_name, system_prompt) or (None, None).
    """
    soul_path = workspace / "SOUL.md"
    if not soul_path.exists():
        return None, None

    from openags.agent.soul import parse_soul

    config, body = parse_soul(soul_path)
    return config.name, body if body.strip() else None


def _build_standalone_agent(
    workspace: Path,
    model: str | None = None,
) -> tuple[object, object]:
    """Build an Agent + Backend for standalone use.

    Returns (agent, backend).
    """
    from openags.agent.loop import Agent
    from openags.agent.memory import MemorySystem
    from openags.models import AgentConfig
    from openags.agent.tools.base import create_engine_registry

    # Try to discover agent config from SOUL.md
    soul_name, soul_body = _load_soul_config(workspace)

    # Build backend
    try:
        from openags.research.config import load_config

        config = load_config()
        from openags.research.backend.router import RuntimeRouter

        backend = RuntimeRouter(config).get_llm_backend()
        backend_model = config.default_backend.model
    except Exception:
        # Fallback: try to create a basic backend
        raise typer.Exit(1)

    if model:
        backend_model = model

    # Build agent config
    if soul_name:
        # Use SOUL.md-discovered config
        soul_path = workspace / "SOUL.md"
        from openags.agent.soul import parse_soul

        agent_config, _ = parse_soul(soul_path)
    else:
        agent_config = AgentConfig(
            name="assistant",
            description="Standalone assistant agent",
            tools=["read", "write", "edit", "ls", "grep", "bash"],
            max_steps=30,
        )

    memory = MemorySystem(workspace)
    registry = create_engine_registry(workspace)

    agent = Agent(
        config=agent_config,
        module_dir=workspace,
        backend=backend,
        memory=memory,
        tool_registry=registry,
    )

    return agent, backend


def run_task(
    task: str,
    workspace: str | None = None,
    model: str | None = None,
    verbose: bool = False,
) -> None:
    """Run a single task and print the result."""
    if verbose:
        logging.basicConfig(level=logging.DEBUG, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

    ws = _resolve_workspace(workspace)
    agent, _backend = _build_standalone_agent(ws, model=model)

    console.print(f"[dim]Workspace: {ws}[/]")
    console.print(f"[dim]Agent: {agent.name}[/]\n")  # type: ignore[attr-defined]

    with console.status("[bold]Working...[/]"):
        result = asyncio.run(agent.loop(task))  # type: ignore[attr-defined]

    if result.success:  # type: ignore[attr-defined]
        console.print(Markdown(result.output))  # type: ignore[attr-defined]
    else:
        console.print(f"[bold red]Error:[/] {result.error}")  # type: ignore[attr-defined]
        raise typer.Exit(1)

    console.print(
        f"\n[dim]{result.duration_seconds:.1f}s | "  # type: ignore[attr-defined]
        f"tokens: {result.token_usage.input_tokens}/{result.token_usage.output_tokens}[/]"  # type: ignore[attr-defined]
    )


def run_repl(
    workspace: str | None = None,
    model: str | None = None,
    verbose: bool = False,
) -> None:
    """Interactive REPL mode."""
    if verbose:
        logging.basicConfig(level=logging.DEBUG, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

    ws = _resolve_workspace(workspace)
    agent, backend = _build_standalone_agent(ws, model=model)

    console.print(
        Panel(
            f"[bold]Workspace:[/] [cyan]{ws}[/]  |  "
            f"[bold]Agent:[/] [yellow]{agent.name}[/]",  # type: ignore[attr-defined]
            title="[bold]OpenAGS Agent[/]",
            subtitle="[dim]Type /exit to quit[/]",
            border_style="blue",
        )
    )
    console.print()

    while True:
        try:
            user_input = console.input("[bold green]> [/]").strip()
        except (EOFError, KeyboardInterrupt):
            console.print("\n[dim]Goodbye.[/]")
            break

        if not user_input:
            continue

        if user_input.lower() in ("/exit", "/quit"):
            break

        if user_input == "/help":
            console.print("[dim]/exit — Quit  |  /clear — Reset agent[/]\n")
            continue

        if user_input == "/clear":
            agent._messages.clear()  # type: ignore[attr-defined]
            console.print("[dim]Context cleared.[/]\n")
            continue

        console.print()
        import time

        start = time.monotonic()

        try:
            result = asyncio.run(agent.loop(user_input))  # type: ignore[attr-defined]
            elapsed = time.monotonic() - start

            if result.success:  # type: ignore[attr-defined]
                console.print(Markdown(result.output))  # type: ignore[attr-defined]
            else:
                console.print(f"[bold red]Error:[/] {result.error}")  # type: ignore[attr-defined]

            console.print(f"\n[dim]{elapsed:.1f}s[/]\n")
        except KeyboardInterrupt:
            console.print("\n[dim]Interrupted.[/]\n")
        except Exception as e:
            console.print(f"\n[bold red]Error:[/] {e}\n")
