"""OpenAGS CLI entry point."""

from __future__ import annotations

import asyncio
import logging
import os
from typing import TYPE_CHECKING

import typer
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.table import Table

if TYPE_CHECKING:
    from openags.agent.backend import Backend

app = typer.Typer(
    name="openags",
    help="OpenAGS - Open Autonomous Generalist Scientist",
    no_args_is_help=True,
)
console = Console()


# ── Helpers ────────────────────────────────────────────


def _setup_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=getattr(logging, level),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


def _check_backend_ready() -> None:
    """Check if a backend can work. Give actionable error if not."""
    from openags.research.config import load_config

    config = load_config()
    model = config.default_backend.model

    # Check if API key is available
    has_explicit_key = config.default_backend.api_key is not None

    if has_explicit_key:
        return

    # Check environment variables for common providers
    provider_env_map = {
        "deepseek": "DEEPSEEK_API_KEY",
        "openai": "OPENAI_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
        "gemini": "GEMINI_API_KEY",
        "google": "GEMINI_API_KEY",
        "groq": "GROQ_API_KEY",
        "mistral": "MISTRAL_API_KEY",
    }

    provider = model.split("/")[0] if "/" in model else model.split("-")[0]
    env_var = provider_env_map.get(provider.lower())

    if env_var and os.environ.get(env_var):
        return

    # No key found — show helpful message
    console.print()
    console.print(
        Panel(
            f"[bold red]API Key not configured[/]\n\n"
            f"Current model: [cyan]{model}[/]\n\n"
            f"Set it with one of:\n"
            f"  [green]openags config set default_backend.api_key sk-your-key[/]\n"
            + (f"  [green]export {env_var}=sk-your-key[/]\n" if env_var else "")
            + "\nOr switch model:\n"
            "  [green]openags config set default_backend.model openai/gpt-4o[/]\n"
            "  [green]openags config set default_backend.model deepseek/deepseek-chat[/]",
            title="Setup Required",
            border_style="red",
        )
    )
    raise typer.Exit(1)


async def _stream_response(
    backend: Backend,
    messages: list[dict[str, str]],
    system: str,
) -> tuple[str, int]:
    """Stream response to console, return (full_text, chunk_count)."""
    full_text = ""
    chunk_count = 0

    try:
        stream = backend.stream_chat(messages, system=system)
        async for chunk in stream:
            console.print(chunk, end="", highlight=False)
            full_text += chunk
            chunk_count += 1
        console.print()
    except (AttributeError, NotImplementedError):
        response = await backend.execute_chat(messages, system=system)
        full_text = response.content
        console.print(Markdown(full_text))

    return full_text, chunk_count


# ── Commands ───────────────────────────────────────────


@app.command()
def init(
    project_id: str = typer.Argument(..., help="Project ID (lowercase, hyphens allowed)"),
    name: str = typer.Option("", "--name", "-n", help="Human-readable project name"),
    description: str = typer.Option("", "--desc", "-d", help="Project description"),
) -> None:
    """Create a new research project."""
    from openags.research.config import load_config
    from openags.research.project import ProjectManager

    config = load_config()
    pm = ProjectManager(config.workspace_dir)

    try:
        project = pm.create(project_id, name or project_id, description)
        console.print(f"[bold green]Created project:[/] {project.id}")
        console.print(f"  Workspace: {project.workspace}")
    except Exception as e:
        console.print(f"[bold red]Error:[/] {e}")
        raise typer.Exit(1)


@app.command("list")
def list_projects() -> None:
    """List all research projects."""
    from openags.research.config import load_config
    from openags.research.project import ProjectManager

    config = load_config()
    pm = ProjectManager(config.workspace_dir)
    projects = pm.list_all()

    if not projects:
        console.print("[dim]No projects found. Create one with: openags init <project-id>[/]")
        return

    table = Table(title="Projects")
    table.add_column("ID", style="cyan")
    table.add_column("Name")
    table.add_column("Stage", style="yellow")
    table.add_column("Created")

    for p in projects:
        table.add_row(
            p.id,
            p.name,
            p.stage.value,
            p.created_at.strftime("%Y-%m-%d"),
        )
    console.print(table)


@app.command()
def chat(
    project: str = typer.Option(..., "--project", "-p", help="Project ID"),
    agent: str = typer.Option("coordinator", "--agent", "-a", help="Agent name"),
    no_stream: bool = typer.Option(False, "--no-stream", help="Disable streaming output"),
    verbose: bool = typer.Option(False, "--verbose", "-v"),
    continue_session: bool = typer.Option(False, "--continue", "-c", help="Continue most recent session"),
    resume: str = typer.Option("", "--resume", "-r", help="Resume session by ID or name"),
    session_name: str = typer.Option("", "--name", "-n", help="Name this session"),
) -> None:
    """Interactive multi-turn chat with a research agent."""
    from openags.research.backend.router import RuntimeRouter
    from openags.research.config import load_config
    from openags.agent.memory import MemorySystem
    from openags.research.project import ProjectManager
    _setup_logging("DEBUG" if verbose else "WARNING")

    # Agent name
    agent_name = agent

    # Load config and verify project
    config = load_config()
    _check_backend_ready()

    pm = ProjectManager(config.workspace_dir)
    try:
        proj = pm.get(project)
    except Exception as e:
        console.print(f"[bold red]Error:[/] {e}")
        console.print(f"[dim]Create a project first: openags init {project}[/]")
        raise typer.Exit(1)

    # Initialize backend and memory
    runtime = RuntimeRouter(config)
    backend = runtime.get_llm_backend()

    # Determine module directory for this agent
    from openags.agent.discovery import AgentDiscovery
    discovered = AgentDiscovery.discover(proj.workspace)
    agent_config = discovered.get(agent_name)
    if agent_config is None:
        console.print(f"[bold red]Unknown agent:[/] {agent_name}")
        console.print(f"Available: {', '.join(discovered.keys())}")
        raise typer.Exit(1)

    if agent_config.mode == "root":
        module_dir = proj.workspace
    else:
        module_dir = proj.workspace / agent_name

    memory = MemorySystem(module_dir, project_dir=proj.workspace)

    # Build system prompt using the new Agent class
    from openags.agent.loop import Agent
    temp_agent = Agent(
        config=agent_config,
        module_dir=module_dir,
        backend=backend,
        memory=memory,
    )
    system_prompt = temp_agent._load_soul()

    # Inject project context
    context = memory.get_context(None)
    if context.strip():
        system_prompt += f"\n\n## Current Project Context\n{context}"

    # Session resume support (Phase 8)
    from openags.core.session import SessionManager
    session_mgr = SessionManager(module_dir if agent_config.mode != "root" else proj.workspace / ".openags")
    chat_messages: list[dict[str, str]] = []
    total_tokens_in = 0
    total_tokens_out = 0

    if continue_session or resume:
        if resume:
            existing = session_mgr.get(resume) or session_mgr.get_by_name(project, resume)
        else:
            existing = session_mgr.get_latest(project, agent_name)
        if existing:
            for msg in existing.messages:
                chat_messages.append({"role": msg.role, "content": msg.content})
            console.print(f"[dim]Resumed session: {existing.id} ({len(existing.messages)} messages)[/]")
        else:
            console.print("[dim]No previous session found, starting fresh.[/]")

    # Header
    console.print()
    console.print(
        Panel(
            f"[bold]Project:[/] [cyan]{project}[/]  |  "
            f"[bold]Agent:[/] [yellow]{agent_name}[/]  |  "
            f"[bold]Model:[/] [green]{config.default_backend.model}[/]",
            title="[bold]OpenAGS Chat[/]",
            subtitle="[dim]Type /help for commands, /exit to quit[/]",
            border_style="blue",
        )
    )
    console.print()

    while True:
        # Input
        try:
            user_input = console.input("[bold green]You > [/]").strip()
        except (EOFError, KeyboardInterrupt):
            console.print("\n[dim]Goodbye.[/]")
            break

        if not user_input:
            continue

        # Handle slash commands
        if user_input.startswith("/"):
            cmd = user_input.lower().split()[0]
            if cmd in ("/exit", "/quit"):
                break
            elif cmd == "/help":
                console.print(
                    Panel(
                        "[bold]/exit[/]     — Quit chat\n"
                        "[bold]/clear[/]    — Clear conversation history\n"
                        "[bold]/history[/]  — Show conversation turn count\n"
                        "[bold]/agent[/]    — Switch agent role\n"
                        "[bold]/context[/]  — Show current project memory\n"
                        "[bold]/tokens[/]   — Show token usage this session",
                        title="Commands",
                        border_style="dim",
                    )
                )
                continue
            elif cmd == "/clear":
                chat_messages.clear()
                total_tokens_in = 0
                total_tokens_out = 0
                console.print("[dim]Conversation cleared.[/]\n")
                continue
            elif cmd == "/history":
                turns = len([m for m in chat_messages if m["role"] == "user"])
                msg = f"[dim]Conversation: {turns} turns, {len(chat_messages)} messages[/]\n"
                console.print(msg)
                continue
            elif cmd == "/context":
                ctx = memory.get_context(None)
                if ctx.strip():
                    console.print(Panel(Markdown(ctx), title="Project Context", border_style="dim"))
                else:
                    console.print("[dim]No project context yet.[/]")
                console.print()
                continue
            elif cmd == "/tokens":
                console.print(
                    f"[dim]Session tokens: {total_tokens_in} in / {total_tokens_out} out[/]\n"
                )
                continue
            elif cmd == "/agent":
                parts = user_input.split()
                if len(parts) < 2:
                    console.print(f"[dim]Current: {agent_name}. Switch: /agent <name>[/]")
                    console.print(f"[dim]Available: {', '.join(discovered.keys())}[/]\n")
                    continue
                new_name = parts[1]
                if new_name in discovered:
                    agent_name = new_name
                    agent_config = discovered[agent_name]
                    if agent_config.mode == "root":
                        module_dir = proj.workspace
                    else:
                        module_dir = proj.workspace / agent_name
                    memory = MemorySystem(module_dir, project_dir=proj.workspace)
                    temp_agent = Agent(
                        config=agent_config, module_dir=module_dir,
                        backend=backend, memory=memory,
                    )
                    system_prompt = temp_agent._load_soul()
                    ctx = memory.get_context(None)
                    if ctx.strip():
                        system_prompt += f"\n\n## Current Project Context\n{ctx}"
                    console.print(f"[dim]Switched to agent: {agent_name}[/]\n")
                else:
                    console.print(f"[bold red]Unknown agent:[/] {new_name}")
                    console.print(f"[dim]Available: {', '.join(discovered.keys())}[/]\n")
                continue
            else:
                console.print(f"[dim]Unknown command: {cmd}. Type /help[/]\n")
                continue

        # Add user message to history
        chat_messages.append({"role": "user", "content": user_input})

        # Generate response
        console.print()
        import time

        start = time.monotonic()

        try:
            if no_stream:
                with console.status("[bold]Thinking...[/]"):
                    response = asyncio.run(
                        backend.execute_chat(chat_messages, system=system_prompt)
                    )
                assistant_text = response.content
                console.print(Markdown(assistant_text))
                tokens_in = response.token_usage.input_tokens
                tokens_out = response.token_usage.output_tokens
            else:
                assistant_text, _ = asyncio.run(
                    _stream_response(backend, chat_messages, system_prompt)
                )
                # Token count not available in streaming; estimate
                tokens_in = 0
                tokens_out = 0

        except KeyboardInterrupt:
            console.print("\n[dim]Interrupted.[/]")
            # Remove the unanswered user message
            if chat_messages and chat_messages[-1]["role"] == "user":
                chat_messages.pop()
            console.print()
            continue
        except Exception as e:
            elapsed = time.monotonic() - start
            console.print(f"\n[bold red]Error:[/] {e}")
            _show_error_help(str(e))
            # Remove the failed user message
            if chat_messages and chat_messages[-1]["role"] == "user":
                chat_messages.pop()
            console.print()
            continue

        elapsed = time.monotonic() - start

        # Add assistant response to history
        chat_messages.append({"role": "assistant", "content": assistant_text})
        total_tokens_in += tokens_in
        total_tokens_out += tokens_out

        # Record to project history
        memory.append_history(
            event=f"{agent_name}:chat",
            details=f"User: {user_input[:200]}\nAssistant: {assistant_text[:300]}",
        )

        # Status line
        token_info = f"tokens: {tokens_in}/{tokens_out}" if tokens_in > 0 else ""
        console.print(
            f"\n[dim]{elapsed:.1f}s{' | ' + token_info if token_info else ''} | "
            f"turn {len([m for m in chat_messages if m['role'] == 'user'])}[/]\n"
        )


@app.command()
def run(
    project: str = typer.Option(..., "--project", "-p", help="Project ID"),
    stage: str | None = typer.Option(None, "--stage", "-s", help="Single stage to run"),
    auto: bool = typer.Option(False, "--auto", help="Full auto mode (no confirmation)"),
    task: str = typer.Argument("", help="Research task description"),
    verbose: bool = typer.Option(False, "--verbose", "-v"),
) -> None:
    """Run automated research pipeline."""
    from openags.research.config import load_config
    from openags.research.orchestrator import Orchestrator
    from openags.models import RunMode

    _setup_logging("DEBUG" if verbose else "INFO")
    _check_backend_ready()

    if not task:
        console.print("[bold red]Error:[/] Please provide a task description")
        console.print('[dim]Usage: openags run -p <project> "your research task"[/]')
        raise typer.Exit(1)

    config = load_config()
    orch = Orchestrator(config)
    mode = RunMode.AUTO if auto else RunMode.INTERACTIVE

    stages: list[str] | None = None
    if stage:
        stages = [stage]

    console.print(f"[bold]Running pipeline[/] | project: [cyan]{project}[/] | mode: {mode.value}")

    try:
        results = asyncio.run(orch.run_pipeline(project, task, stages, mode))
    except Exception as e:
        console.print(f"\n[bold red]Error:[/] {e}")
        _show_error_help(str(e))
        raise typer.Exit(1)

    for r in results:
        status = "[green]OK[/]" if r.success else "[red]FAIL[/]"
        console.print(f"  {status} | {r.duration_seconds:.1f}s | {r.output[:100]}")

    total_cost = sum(r.token_usage.cost_usd for r in results)
    console.print(f"\n[dim]Total cost: ${total_cost:.4f}[/]")


@app.command()
def serve(
    host: str = typer.Option("127.0.0.1", "--host", help="Bind host"),
    port: int = typer.Option(8000, "--port", help="Bind port"),
    verbose: bool = typer.Option(False, "--verbose", "-v"),
) -> None:
    """Start the API server (for Desktop/Browser frontends)."""
    _setup_logging("DEBUG" if verbose else "INFO")

    import uvicorn

    from openags.research.server.app import create_app

    console.print(f"[bold]OpenAGS Server[/] starting on http://{host}:{port}")
    uvicorn.run(create_app(), host=host, port=port)


@app.command("config")
def config_cmd(
    show: bool = typer.Option(False, "--show", help="Show current configuration"),
    key: str | None = typer.Argument(None, help="Config key to set (dot notation)"),
    value: str | None = typer.Argument(None, help="Value to set"),
) -> None:
    """View or modify OpenAGS configuration.

    Examples:
      openags config --show
      openags config default_backend.model deepseek/deepseek-chat
      openags config default_backend.api_key sk-xxx
      openags config log_level DEBUG
    """
    from openags.research.config import load_config, set_config_value

    if key and value:
        # Set mode
        try:
            set_config_value(key, value)
            # Mask secrets in display
            display_value = "***" if "key" in key.lower() or "secret" in key.lower() else value
            console.print(f"[bold green]Set:[/] {key} = {display_value}")
        except Exception as e:
            console.print(f"[bold red]Error:[/] {e}")
            raise typer.Exit(1)
        return

    if key and not value:
        console.print("[bold red]Error:[/] Please provide both key and value")
        console.print("[dim]Usage: openags config <key> <value>[/]")
        console.print("[dim]Example: openags config default_backend.model gpt-4o[/]")
        raise typer.Exit(1)

    # Show mode
    cfg = load_config()

    if show:
        table = Table(title="OpenAGS Configuration", show_lines=True)
        table.add_column("Setting", style="cyan")
        table.add_column("Value")

        table.add_row("Workspace", str(cfg.workspace_dir))
        table.add_row("Backend type", cfg.default_backend.type)
        table.add_row("Model", cfg.default_backend.model)
        table.add_row(
            "API Key",
            "[green]configured[/]" if cfg.default_backend.api_key else "[yellow]from env[/]",
        )
        table.add_row("Timeout", f"{cfg.default_backend.timeout}s")
        table.add_row("Max retries", str(cfg.default_backend.max_retries))
        table.add_row("Log level", cfg.log_level)
        table.add_row("Sandbox", cfg.experiment_sandbox.value)
        table.add_row("Max fix attempts", str(cfg.experiment_max_fix_attempts))
        if cfg.token_budget_usd is not None:
            table.add_row("Token budget", f"${cfg.token_budget_usd:.2f}")
        if cfg.remote_servers:
            servers = ", ".join(s.name for s in cfg.remote_servers)
            table.add_row("Remote servers", servers)

        console.print(table)
    else:
        console.print(f"Config file: [cyan]{cfg.workspace_dir / 'config.yaml'}[/]")
        console.print()
        console.print("[dim]Usage:[/]")
        console.print("  openags config --show              [dim]Show all settings[/]")
        console.print("  openags config <key> <value>       [dim]Set a value[/]")
        console.print()
        console.print("[dim]Common settings:[/]")
        console.print("  default_backend.model    [dim]LLM model (e.g. deepseek/deepseek-chat)[/]")
        console.print("  default_backend.api_key  [dim]API key for the provider[/]")
        console.print("  log_level                [dim]DEBUG | INFO | WARNING | ERROR[/]")


def _show_error_help(error_msg: str) -> None:
    """Show actionable suggestions based on error message."""
    msg = error_msg.lower()

    if "api key" in msg or "authentication" in msg or "401" in msg or "unauthorized" in msg:
        console.print(
            "[dim]Hint: Check your API key with: openags config --show\n"
            "Set it with: openags config default_backend.api_key <your-key>[/]"
        )
    elif "rate limit" in msg or "429" in msg:
        console.print("[dim]Hint: Rate limited. Wait a moment and try again.[/]")
    elif "timeout" in msg:
        console.print(
            "[dim]Hint: Request timed out. Try increasing timeout:\n"
            "  openags config default_backend.timeout 600[/]"
        )
    elif "not found" in msg and "project" in msg:
        console.print("[dim]Hint: Create a project first: openags init <project-id>[/]")
    elif "connection" in msg or "network" in msg:
        console.print("[dim]Hint: Check your internet connection and API endpoint.[/]")


@app.command("agent")
def agent_cmd(
    task: str = typer.Argument("", help="Task to execute (omit for REPL mode)"),
    workspace: str = typer.Option("", "--workspace", "-w", help="Working directory (default: cwd)"),
    model: str = typer.Option("", "--model", "-m", help="Override LLM model"),
    repl: bool = typer.Option(False, "--repl", "-i", help="Interactive REPL mode"),
    verbose: bool = typer.Option(False, "--verbose", "-v"),
) -> None:
    """Run the standalone agent — no project required.

    Examples:
      openags agent "list all Python files"
      openags agent --repl
      openags agent -w ./my-project "summarize the code"
    """
    from openags.research.cli import run_repl, run_task

    ws = workspace or None
    mdl = model or None

    if repl or not task:
        run_repl(workspace=ws, model=mdl, verbose=verbose)
    else:
        run_task(task, workspace=ws, model=mdl, verbose=verbose)


if __name__ == "__main__":
    app()
