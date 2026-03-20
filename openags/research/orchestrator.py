"""Core orchestrator — routes requests to agents, tracks tokens, manages pipelines."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from pathlib import Path

from openags.agent.loop import Agent
from openags.agent.discovery import AgentDiscovery
from openags.research.backend.router import RuntimeRouter
from openags.agent.auto_memory import AutoMemory
from openags.agent.errors import AgentError
from openags.agent.hooks import HookRunner, parse_hooks
from openags.agent.memory import MemorySystem
from openags.agent.message_bus import MessageBus
from openags.research.project import ProjectManager
from openags.agent.session import SessionManager
from openags.research.logging.tracker import TokenTracker
from openags.models import (
    AgentResult,
    BackendResponse,
    BusMessage,
    Experiment,
    ExperimentResult,
    Message,
    Project,
    RunMode,
    SandboxMode,
    StepResult,
    SystemConfig,
    TokenUsage,
)
from openags.agent.skills.engine import SkillEngine
from openags.research.registry import create_research_registry
from openags.agent.tools.base import ToolRegistry
from openags.agent.tools.mcp import MCPManager

logger = logging.getLogger(__name__)


class Orchestrator:
    """Central orchestrator for OpenAGS.

    Receives user requests, selects the appropriate agent,
    manages execution, tracks token usage, and records results.
    """

    def __init__(self, config: SystemConfig) -> None:
        self._config = config
        self.project_mgr = ProjectManager(config.workspace_dir)
        self._runtime = RuntimeRouter(config)
        self.bus = MessageBus()
        self._tracker = TokenTracker(config.workspace_dir / "logs")
        self._agents: dict[tuple[str, str], Agent] = {}

        # Tool registries: per-project (workspace-scoped file tools)
        self._tool_registries: dict[str, ToolRegistry] = {}

        # Skill engine: load skills from global + workspace + plugins
        skill_dirs: list[Path] = [Path("skills")]
        project_skills = config.workspace_dir / "skills"
        if project_skills.exists():
            skill_dirs.append(project_skills)

        # Load plugin skills
        from openags.agent.plugins import PluginManager
        self._plugin_mgr = PluginManager(config.workspace_dir / "plugins")
        self._plugin_mgr.discover()
        skill_dirs.extend(self._plugin_mgr.get_skill_dirs())

        self._skill_engine = SkillEngine(skill_dirs)

        # MCP: load external tool servers and register to ToolRegistry
        self._mcp_manager: MCPManager | None = None
        mcp_config_path = config.workspace_dir / "mcp.json"
        if mcp_config_path.exists():
            self._mcp_manager = MCPManager()
            self._mcp_configs = MCPManager.load_config(mcp_config_path)
        else:
            self._mcp_configs = []

        # Messaging: initialize notification router from config
        from openags.research.messaging.router import NotificationRouter

        self.notifier = NotificationRouter.from_config(config.messaging)

    async def connect_mcp_servers(self) -> int:
        """Connect configured MCP servers and register their tools.

        Returns the number of newly registered MCP tools.
        """
        if not self._mcp_manager or not self._mcp_configs:
            return 0

        count = 0
        for server_config in self._mcp_configs:
            try:
                tools = await self._mcp_manager.add_server(server_config)
                for tool in tools:
                    # Register MCP tools to all existing project registries
                    for registry in self._tool_registries.values():
                        registry.register(tool)
                    count += 1
                # Store MCP tools for future project registries
                self._mcp_tools = getattr(self, "_mcp_tools", [])
                self._mcp_tools.extend(tools)
                logger.info(
                    "MCP server '%s': %d tools registered",
                    server_config.name, len(tools),
                )
            except Exception as e:
                logger.error("Failed to connect MCP server '%s': %s", server_config.name, e)
        return count

    def _write_checkpoint(
        self,
        project: Project,
        agent_name: str,
        task: str,
        result: AgentResult,
    ) -> None:
        """Write a checkpoint after an agent completes a task."""
        import json as _json
        from datetime import datetime, timezone

        checkpoint_dir = project.workspace / ".openags" / "checkpoints"
        checkpoint_dir.mkdir(parents=True, exist_ok=True)

        checkpoint = {
            "agent": agent_name,
            "task": task[:200],
            "success": result.success,
            "duration_seconds": result.duration_seconds,
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
            "output_preview": (result.output or "")[:500],
            "error": result.error,
            "token_usage": {
                "input": result.token_usage.input_tokens,
                "output": result.token_usage.output_tokens,
                "cost_usd": result.token_usage.cost_usd,
            },
        }

        # Write latest checkpoint per agent
        path = checkpoint_dir / f"{agent_name}.json"
        path.write_text(_json.dumps(checkpoint, indent=2, ensure_ascii=False), encoding="utf-8")

        # Append to checkpoint log
        log_path = checkpoint_dir / "log.jsonl"
        with log_path.open("a", encoding="utf-8") as f:
            f.write(_json.dumps(checkpoint, ensure_ascii=False) + "\n")

        logger.info("Checkpoint written for agent[%s] (success=%s)", agent_name, result.success)

    def _get_or_create_agent(self, agent_name: str, project: Project) -> Agent:
        """Get cached OpenAGS Agent. Only used in builtin mode."""
        key = (project.id, agent_name)
        if key not in self._agents:
            # Discover agents from project directory
            discovered = AgentDiscovery.discover(project.workspace)
            config = discovered.get(agent_name)
            if config is None:
                raise AgentError(f"No agent discovered with name '{agent_name}' in {project.workspace}")

            # Module directory: root (coordinator) uses project workspace,
            # subagents get their own subdirectory
            if config.mode == "root":
                module_dir = project.workspace
            else:
                module_dir = project.workspace / agent_name

            memory = MemorySystem(module_dir, project_dir=project.workspace)

            # Build a per-agent skill engine that includes module-level skills
            skill_engine = self._build_skill_engine(agent_name, project)

            # Create event callback that routes to WebSocket
            event_cb = self._make_event_callback(project.id)

            # Agent creates its own LLM connection internally
            agent = Agent(
                config=config,
                module_dir=module_dir,
                memory=memory,
                backend=self._runtime.get_llm_backend(),
                tool_registry=self._get_tool_registry(project),
                skill_engine=skill_engine,
                on_event=event_cb,
            )

            # Hooks integration: create HookRunner from agent config if hooks are present
            if config.hooks:
                hooks_raw: dict[str, object] = {}
                for hook in config.hooks:
                    event_key = hook.event
                    if event_key not in hooks_raw:
                        hooks_raw[event_key] = []
                    hook_list = hooks_raw[event_key]
                    if isinstance(hook_list, list):
                        hook_list.append({
                            "matcher": hook.matcher,
                            "command": hook.command,
                            "timeout": hook.timeout,
                        })
                hook_config = parse_hooks(hooks_raw)
                agent._hook_runner = HookRunner(hook_config, working_dir=module_dir)

            # Auto-memory: attach for post-loop learning
            agent._auto_memory = AutoMemory(module_dir)

            self._agents[key] = agent
        return self._agents[key]

    def _make_event_callback(self, project_id: str):
        """Create an async event callback that broadcasts via WebSocket."""
        async def on_event(event_type: str, data: dict) -> None:
            try:
                from openags.research.server.routes.ws import manager
                await manager.broadcast(project_id, event_type, data)
            except Exception:
                pass  # WebSocket may not be available (CLI mode)
        return on_event

    def _get_tool_registry(self, project: Project) -> ToolRegistry:
        """Get or create a per-project tool registry with workspace-scoped tools."""
        if project.id not in self._tool_registries:
            from openags.agent.tools.ask_user import AskUserTool
            from openags.research.tools.check_progress import CheckProgressTool
            from openags.research.tools.dispatch_agent import DispatchAgentTool
            from openags.agent.tools.sub_agent import SubAgentTool

            registry = create_research_registry(project.workspace)

            # SubAgent: needs backend + registry
            backend = self._runtime.get_llm_backend()
            registry.register(SubAgentTool(backend, registry))

            # AskUser: default callback (auto mode)
            registry.register(AskUserTool())

            # Coordinator tools: dispatch other agents + check project progress
            registry.register(DispatchAgentTool(self, project.id))
            registry.register(CheckProgressTool(project.workspace))

            # Register any previously loaded MCP tools
            for tool in getattr(self, "_mcp_tools", []):
                registry.register(tool)

            self._tool_registries[project.id] = registry
            logger.info("Created tool registry for project '%s' (%d tools)",
                        project.id, len(self._tool_registries[project.id].list_names()))
        return self._tool_registries[project.id]

    def _get_session_mgr(self, agent_name: str, project: Project) -> SessionManager:
        """Get a SessionManager for the module corresponding to an agent name."""
        # Coordinator (root) stores sessions in .openags, others in their module dir
        if agent_name == "coordinator":
            session_dir = project.workspace / ".openags"
        else:
            session_dir = project.workspace / agent_name
        return SessionManager(session_dir)

    def _build_skill_engine(self, agent_name: str, project: Project) -> SkillEngine:
        """Build a SkillEngine with module-level skills for a specific agent.

        Scans: {project}/{agent_name}/skills/ → global skills/
        """
        skill_dirs: list[Path] = []

        # Module-level skills (e.g. literature/skills/)
        if agent_name != "coordinator":
            module_skills = project.workspace / agent_name / "skills"
            if module_skills.exists():
                skill_dirs.append(module_skills)

        # Global skills
        skill_dirs.append(Path("skills"))
        workspace_skills = self._config.workspace_dir / "skills"
        if workspace_skills.exists():
            skill_dirs.append(workspace_skills)

        return SkillEngine(skill_dirs)

    async def run_agent(
        self,
        project_id: str,
        agent_name: str,
        task: str,
        mode: RunMode = RunMode.AUTO,
    ) -> AgentResult:
        """Run a single agent on a task within a project."""
        project = self.project_mgr.get(project_id)

        # Enforce token budget before execution
        if self._config.token_budget_usd is not None:
            summary = self._tracker.summary(project_id)
            if summary["cost_usd"] > self._config.token_budget_usd:
                raise AgentError(
                    f"Token budget exceeded for project '{project_id}': "
                    f"${summary['cost_usd']:.2f} > ${self._config.token_budget_usd:.2f}"
                )

        logger.info("Running agent[%s] on project '%s' (runtime=%s)",
                     agent_name, project_id, self._runtime.runtime_type)

        backend_type = self._runtime.runtime_type

        if backend_type == "builtin":
            # Path 1: OpenAGS builtin agent — full loop with tools, memory, skills
            agent = self._get_or_create_agent(agent_name, project)
            result = await agent.loop(task)
        else:
            # Path 2: CLI agent — spawn CLI process in the agent's folder
            result = await self._run_cli_agent(project, agent_name, task)

        # Write checkpoint after agent completes
        self._write_checkpoint(project, agent_name, task, result)

        # Auto-memory: learn from successful execution
        if hasattr(agent, '_auto_memory') and agent._auto_memory:
            await agent._auto_memory.maybe_learn(
                task, result.output, result.success, self._runtime.get_llm_backend(),
            )

        # Track token usage
        self._tracker.record(project_id, agent_name, result.token_usage)

        # Publish typed event via message bus
        status = "completed" if result.success else "failed"
        await self.bus.publish(
            BusMessage(
                topic=f"agent.{agent_name}.{status}",
                sender="orchestrator",
                payload={
                    "project_id": project_id,
                    "task": task,
                    "success": result.success,
                    "duration": result.duration_seconds,
                },
            )
        )

        # Notify via messaging channels
        if self.notifier.channel_count > 0:
            await self.notifier.notify(
                title=f"Agent {agent_name} {status}",
                body=f"Project: {project_id}\nDuration: {result.duration_seconds:.1f}s",
                level="success" if result.success else "error",
            )

        # Check token budget
        if self._config.token_budget_usd is not None:
            summary = self._tracker.summary(project_id)
            if summary["cost_usd"] > self._config.token_budget_usd:
                logger.warning(
                    "Project '%s' exceeded token budget ($%.2f > $%.2f)",
                    project_id,
                    summary["cost_usd"],
                    self._config.token_budget_usd,
                )

        return result

    async def run_agents_parallel(
        self,
        project_id: str,
        agents: list[dict[str, str]],
    ) -> list[AgentResult]:
        """Run multiple agents in parallel.

        Args:
            project_id: Project identifier
            agents: List of {"agent": "name", "task": "description"}

        Returns:
            List of AgentResults in the same order as input
        """
        import asyncio as _asyncio

        tasks = [
            self.run_agent(project_id, a["agent"], a["task"])
            for a in agents
        ]
        results = await _asyncio.gather(*tasks, return_exceptions=True)

        final: list[AgentResult] = []
        for i, r in enumerate(results):
            if isinstance(r, Exception):
                final.append(AgentResult(
                    success=False,
                    output="",
                    error=str(r),
                    token_usage=TokenUsage(model=""),
                    duration_seconds=0,
                ))
                logger.error("Parallel agent[%s] failed: %s", agents[i]["agent"], r)
            else:
                final.append(r)
        return final

    async def step_agent(
        self,
        project_id: str,
        agent_name: str,
        task: str,
    ) -> StepResult:
        """Single-step an agent for fine-grained external control."""
        project = self.project_mgr.get(project_id)
        agent = self._get_or_create_agent(agent_name, project)
        return await agent.step(task)

    async def run_pipeline(
        self,
        project_id: str,
        task: str,
        stages: list[str] | None = None,
        mode: RunMode = RunMode.AUTO,
    ) -> list[AgentResult]:
        """Run the research pipeline driven by the Coordinator agent.

        Instead of a hardcoded linear sequence, the Coordinator agent
        decides which stages to run, in what order, and whether to loop
        back based on results. The workflow is defined by the Coordinator's
        SOUL.md and Skills, not by code.

        If specific stages are provided, they are passed as guidance to
        the Coordinator but it still has autonomy to adjust.
        """
        # Build the Coordinator's task with stage guidance
        coordinator_task = task
        if stages:
            stage_names = ", ".join(stages)
            coordinator_task = (
                f"{task}\n\n"
                f"Focus on these stages: {stage_names}. "
                f"Use dispatch_agent to run each stage's agent with specific tasks."
            )
        else:
            coordinator_task = (
                f"{task}\n\n"
                f"Manage the full research workflow. Use check_progress to assess the current state, "
                f"then use dispatch_agent to run the appropriate agents in the right order. "
                f"After each agent completes, evaluate the results and decide next steps."
            )

        logger.info("Starting Coordinator-driven pipeline for '%s'", project_id)
        result = await self.run_agent(project_id, "coordinator", coordinator_task, mode)
        return [result]

    async def chat(
        self,
        project_id: str,
        agent_name: str,
        messages: list[dict[str, str]],
        session_id: str | None = None,
    ) -> BackendResponse:
        """Chat with an agent (builtin only; CLI agents handled by Desktop Node.js)."""
        project = self.project_mgr.get(project_id)
        agent = self._get_or_create_agent(agent_name, project)

        # Extract the task from the last user message
        task = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                task = msg.get("content", "")
                break

        if not task:
            # Fallback: simple LLM call without tools
            system_prompt = agent._load_soul()
            context = agent._memory.get_context(None)
            enriched: list[dict[str, str]] = []
            if context.strip():
                enriched.append({"role": "user", "content": f"[Project context]\n{context}"})
                enriched.append({"role": "assistant", "content": "Understood. I have the project context."})
            enriched.extend(messages)
            response = await self._runtime.get_llm_backend().execute_chat(enriched, system=system_prompt)
            self._tracker.record(project_id, agent_name, response.token_usage)
            return response

        # Run the agent loop with full tool support
        # Inject prior conversation context into the task
        prior_context = ""
        if len(messages) > 1:
            prior_msgs = [m for m in messages[:-1] if m.get("content")]
            if prior_msgs:
                prior_context = "\n".join(
                    f"[{m['role']}]: {m['content'][:300]}" for m in prior_msgs[-6:]
                )
                task = f"[Prior conversation]\n{prior_context}\n\n[Current request]\n{task}"

        result = await agent.loop(task)

        # Build a BackendResponse from AgentResult
        response = BackendResponse(
            content=result.output,
            token_usage=result.token_usage,
        )

        # Track token usage
        self._tracker.record(project_id, agent_name, response.token_usage)

        # Persist to session if provided
        if session_id:
            session_mgr = self._get_session_mgr(agent_name, project)
            # Persist the last user message and the response
            if messages:
                last_user = messages[-1]
                if last_user.get("role") == "user":
                    session_mgr.add_message(
                        session_id,
                        Message(role="user", content=last_user["content"]),
                    )
            session_mgr.add_message(
                session_id,
                Message(role="assistant", content=response.content),
            )

        return response

    _TOOL_LABELS: dict[str, str] = {
        "arxiv": "Searching arXiv",
        "semantic_scholar": "Searching Semantic Scholar",
        "read": "Reading file",
        "write": "Writing file",
        "edit": "Editing file",
        "ls": "Listing directory",
        "grep": "Searching files",
        "bash": "Running command",
        "check_progress": "Checking progress",
        "dispatch_agent": "Dispatching agent",
        "sub_agent": "Running sub-agent",
        "ask_user": "Asking user",
    }

    async def chat_stream(
        self,
        project_id: str,
        agent_name: str,
        messages: list[dict[str, str]],
        session_id: str | None = None,
    ) -> AsyncIterator[str]:
        """Streaming chat with real-time tool status.

        Runs agent step-by-step, yielding tool status lines immediately
        as each step completes. Uses the agent's own _is_done() for
        proper termination (with repeat detection).
        """
        import json as _json

        project = self.project_mgr.get(project_id)

        # Extract task from last user message
        task = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                task = msg.get("content", "")
                break

        # CLI agents (Claude Code, Codex, etc.) are handled by Desktop Node.js layer.
        # This method only handles builtin agent.
        agent = self._get_or_create_agent(agent_name, project)

        # Build system prompt and context for LLM
        system_prompt = agent._load_soul()
        context = agent._memory.get_context(None)
        if context.strip():
            system_prompt += f"\n\n## Project Context\n{context}"

        # Inject prior conversation context into task
        if task and len(messages) > 1:
            prior = [m for m in messages[:-1] if m.get("content")]
            if prior:
                ctx = "\n".join(f"[{m['role']}]: {m['content'][:300]}" for m in prior[-6:])
                task = f"[Prior conversation]\n{ctx}\n\n[Current request]\n{task}"

        llm = self._runtime.get_llm_backend()

        # Check if user's message needs file operations
        user_msg = (task or messages[-1].get("content", "")).lower()
        _FILE_KEYWORDS = {"读取", "查阅", "文件", "pdf", "uploads/", "[attached", "文档", "查看文件", "打开", "read", "file"}
        needs_tools = any(kw in user_msg for kw in _FILE_KEYWORDS)

        if not needs_tools:
            # Simple conversation → direct LLM streaming, no tools
            chat_messages = list(messages)
            if context.strip():
                chat_messages = [
                    {"role": "user", "content": f"[Project context]\n{context}"},
                    {"role": "assistant", "content": "Understood."},
                    *chat_messages,
                ]

            last_content = ""
            async for chunk in llm.stream_chat(chat_messages, system=system_prompt):
                last_content += chunk
                yield chunk

            # Persist
            self._tracker.record(project_id, agent_name, TokenUsage(model=""))
            if session_id:
                session_mgr = self._get_session_mgr(agent_name, project)
                if messages:
                    last_user = messages[-1]
                    if last_user.get("role") == "user":
                        session_mgr.add_message(session_id, Message(role="user", content=last_user["content"]))
                session_mgr.add_message(session_id, Message(role="assistant", content=last_content))
            agent._messages.clear()
            return

        # File-related → use agent step with tools
        yield "> Thinking...\n"

        first_result = await agent.step(task or messages[-1].get("content", ""))

        if first_result.tool_calls:
            # Agent needs tools → step-by-step mode (tool status lines + final text)
            last_content = first_result.content or ""
            has_tool_activity = True
            _repeat_count = 0
            _prev_content = first_result.content

            # Yield tool status for first step
            for tc in first_result.tool_calls:
                func = tc.get("function", {})
                tool_name = func.get("name", "?") if isinstance(func, dict) else "?"
                label = self._TOOL_LABELS.get(tool_name, tool_name)
                args_raw = func.get("arguments", "") if isinstance(func, dict) else ""
                arg_hint = ""
                if isinstance(args_raw, str) and args_raw:
                    try:
                        args = _json.loads(args_raw)
                        for k in ("query", "path", "command", "role", "task", "module", "pattern", "question"):
                            if k in args:
                                arg_hint = f": {str(args[k])[:60]}"
                                break
                    except Exception:
                        pass
                yield f"> {label}{arg_hint}...\n"

            if first_result.tool_results:
                for tr in first_result.tool_results:
                    name = tr.get("name", "?")
                    error = tr.get("error")
                    yield f"> {name} {'failed: ' + str(error)[:80] if error else 'done'}\n"

            # Continue stepping until done (cap at 10 for chat to avoid endless loops)
            chat_max_steps = min(agent.max_steps - 1, 10)
            for _step in range(chat_max_steps):
                if first_result.error or agent._is_done(first_result.content, first_result.tool_calls):
                    break

                # Tell frontend we're still working
                yield "> Thinking...\n"

                result = await agent.step(task or "")
                last_content = result.content or last_content

                if result.content and result.content == _prev_content and not result.tool_calls:
                    _repeat_count += 1
                    if _repeat_count >= 2:
                        break
                else:
                    _repeat_count = 0
                _prev_content = result.content

                if result.tool_calls:
                    for tc in result.tool_calls:
                        func = tc.get("function", {})
                        tool_name = func.get("name", "?") if isinstance(func, dict) else "?"
                        label = self._TOOL_LABELS.get(tool_name, tool_name)
                        args_raw = func.get("arguments", "") if isinstance(func, dict) else ""
                        arg_hint = ""
                        if isinstance(args_raw, str) and args_raw:
                            try:
                                args = _json.loads(args_raw)
                                for k in ("query", "path", "command", "role", "task", "module", "pattern", "question"):
                                    if k in args:
                                        arg_hint = f": {str(args[k])[:60]}"
                                        break
                            except Exception:
                                pass
                        yield f"> {label}{arg_hint}...\n"

                if result.tool_results:
                    for tr in result.tool_results:
                        name = tr.get("name", "?")
                        error = tr.get("error")
                        yield f"> {name} {'failed: ' + str(error)[:80] if error else 'done'}\n"

                if result.error:
                    yield f"\n**Error**: {result.error}\n"
                    break

                if agent._is_done(result.content, result.tool_calls):
                    break

            yield "\n"
            # Filter out raw tool result JSON that may have leaked into content
            if last_content and not last_content.strip().startswith("[{"):
                yield last_content

        else:
            # No tools needed → true token-level streaming
            # Clear the non-streaming step and redo with streaming
            agent._messages.clear()

            chat_messages = list(messages)
            if context.strip():
                chat_messages = [
                    {"role": "user", "content": f"[Project context]\n{context}"},
                    {"role": "assistant", "content": "Understood."},
                    *chat_messages,
                ]

            last_content = ""
            async for chunk in llm.stream_chat(chat_messages, system=system_prompt):
                last_content += chunk
                yield chunk

        # Post-process and persist
        try:
            await agent._post_process(last_content)
        except Exception:
            pass

        self._tracker.record(project_id, agent_name, TokenUsage(model=""))
        if session_id:
            session_mgr = self._get_session_mgr(agent_name, project)
            if messages:
                last_user = messages[-1]
                if last_user.get("role") == "user":
                    session_mgr.add_message(session_id, Message(role="user", content=last_user["content"]))
            session_mgr.add_message(session_id, Message(role="assistant", content=last_content))

        agent._messages.clear()

    async def run_experiment(
        self,
        project_id: str,
        name: str,
        code_path: str,
        gpu_count: int = 0,
        sandbox_mode: SandboxMode = SandboxMode.LOCAL,
        timeout: int = 3600,
    ) -> ExperimentResult:
        """Run an experiment with auto-fix via ExperimentEngine."""
        from openags.research.experiment.engine import ExperimentEngine

        backend = self._runtime.get_llm_backend()
        engine = ExperimentEngine(
            backend=backend,
            sandbox_mode=sandbox_mode,
            max_fix_attempts=self._config.experiment_max_fix_attempts,
        )

        experiment = Experiment(
            id=name,
            project_id=project_id,
            name=name,
            code_path=Path(code_path),
            gpu_count=gpu_count,
            sandbox=sandbox_mode,
            timeout=timeout,
        )

        result = await engine.run(experiment)

        # Notify via messaging if channels are configured
        status = "succeeded" if result.success else "failed"
        if self.notifier.channel_count > 0:
            await self.notifier.notify(
                title=f"Experiment {status}: {name}",
                body=(
                    f"Project: {project_id}\n"
                    f"Attempts: {result.attempts}\n"
                    f"Duration: {result.duration_seconds:.1f}s"
                    + (f"\nError: {result.error}" if result.error else "")
                ),
                level="success" if result.success else "error",
            )

        # Publish bus event
        await self.bus.publish(
            BusMessage(
                topic=f"experiment.{status}",
                sender="orchestrator",
                payload={
                    "project_id": project_id,
                    "experiment": name,
                    "success": result.success,
                    "attempts": result.attempts,
                },
            )
        )

        return result

    def get_token_summary(self, project_id: str | None = None) -> dict[str, int | float]:
        """Get token usage summary for a project or all projects."""
        return self._tracker.summary(project_id)
