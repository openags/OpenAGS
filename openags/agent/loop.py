"""Configuration-driven agent loop — the core execution engine of OpenAGS."""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable, Coroutine
from pathlib import Path
from typing import Any

from openags.agent.llm import LLMBackend
from openags.agent.memory import MemorySystem
from openags.models import (
    AgentConfig,
    AgentResult,
    BackendConfig,
    DoneStrategy,
    StepResult,
    TokenUsage,
)
from openags.agent.skills.engine import SkillEngine
from openags.agent.tools.base import ToolRegistry

# Event callback type: async fn(event_type: str, data: dict) -> None
AgentEventCallback = Callable[[str, dict[str, Any]], Coroutine[Any, Any, None]]

logger = logging.getLogger(__name__)

# Default token threshold when AgentConfig does not specify one
_DEFAULT_TOKEN_THRESHOLD = 80_000


class Agent:
    """Concrete, configuration-driven research agent.

    Two-layer API:
      - step(task) -> StepResult  -- atomic: one LLM call + tool execution + done check
      - loop(task) -> AgentResult -- loops step() until done or max_steps

    All behaviour is derived from the ``AgentConfig`` passed at construction
    time (typically parsed from SOUL.md frontmatter).
    """

    # Context compaction settings
    _KEEP_RECENT_RESULTS = 3

    def __init__(
        self,
        config: AgentConfig,
        module_dir: Path,
        memory: MemorySystem,
        backend: LLMBackend | None = None,
        backend_config: BackendConfig | None = None,
        tool_registry: ToolRegistry | None = None,
        skill_engine: SkillEngine | None = None,
        on_event: AgentEventCallback | None = None,
    ) -> None:
        self.config = config
        self._module_dir = module_dir
        self._memory = memory
        # LLM transport: accept a pre-built instance or create from config
        if backend is not None:
            self._backend = backend
        elif backend_config is not None:
            self._backend = LLMBackend(backend_config)
        else:
            raise ValueError("Agent requires either 'backend' (LLMBackend) or 'backend_config' (BackendConfig)")
        self._tool_registry = tool_registry
        self._skill_engine = skill_engine
        self._messages: list[dict[str, str]] = []
        self._on_event = on_event

    # ── Properties ────────────────────────────────────

    @property
    def name(self) -> str:
        """Agent name derived from config."""
        return self.config.name

    @property
    def agent_name(self) -> str:
        """Alias for ``name``."""
        return self.config.name

    @property
    def max_steps(self) -> int:
        """Maximum agentic loop iterations."""
        return self.config.max_steps

    @property
    def _TOKEN_THRESHOLD(self) -> int:  # noqa: N802
        token_threshold: int | None = getattr(self.config, "token_threshold", None)
        if token_threshold is not None:
            return token_threshold
        return _DEFAULT_TOKEN_THRESHOLD

    @property
    def role(self) -> str:
        """Agent role/name string."""
        return self.config.name

    @property
    def module_dir(self) -> Path:
        """The project module directory this agent works in."""
        return self._module_dir

    # ── Event emission ────────────────────────────────

    async def _emit(self, event_type: str, data: dict[str, Any] | None = None) -> None:
        """Emit an agent lifecycle event (tool call, completion, etc.)."""
        if self._on_event is None:
            return
        payload = {"role": self.config.name, **(data or {})}
        try:
            await self._on_event(event_type, payload)
        except Exception:
            pass  # never let event emission break agent execution

    # ── Public API ────────────────────────────────────

    async def step(self, task: str) -> StepResult:
        """Atomic: one LLM call + tool execution + done check."""
        try:
            self._maybe_compact()

            system_prompt = self._load_soul()

            if not self._messages:
                context = self._memory.get_context(None)
                user_prompt = self._build_user_prompt(task, context)
                self._messages.append({"role": "user", "content": user_prompt})

            tools = self._get_tools()

            await self._emit("agent.thinking")

            response = await self._backend.execute_chat(
                self._messages,
                system=system_prompt,
                tools=tools,
            )
            self._messages.append({"role": "assistant", "content": response.content})

            tool_results: list[dict[str, object]] = []
            if response.tool_calls:
                tool_results = await self._execute_tools(response.tool_calls)
                self._messages.append({"role": "user", "content": str(tool_results)})

            done = self._is_done(response.content, response.tool_calls)

            return StepResult(
                content=response.content,
                tool_calls=response.tool_calls,
                tool_results=tool_results,
                token_usage=response.token_usage,
                done=done,
            )
        except Exception as e:
            logger.error("Agent[%s] step failed: %s", self.config.name, e)
            await self._emit("agent.error", {"error": str(e)})
            return StepResult(error=str(e), done=True)

    async def run(self, task: str, max_steps: int | None = None) -> AgentResult:
        """Alias for loop() -- the primary entry point."""
        return await self.loop(task, max_steps=max_steps)

    async def loop(self, task: str, max_steps: int | None = None) -> AgentResult:
        """Loop step() until done or max_steps reached."""
        start = time.monotonic()
        steps = max_steps or self.max_steps
        min_steps = self.config.min_steps
        total_usage = TokenUsage()
        all_contents: list[str] = []
        _repeat_count = 0
        _prev_content = ""
        _has_tool_calls = False  # Track if any tool was called in this loop

        await self._emit("agent.start", {"task": task[:200], "max_steps": steps})

        try:
            for _i in range(steps):
                result = await self.step(task)
                if result.content and result.content.strip():
                    all_contents.append(result.content)

                # Track tool calls for TOOL_REQUIRED strategy
                if result.tool_calls:
                    _has_tool_calls = True

                # Detect repeated output -- force stop if agent is stuck
                if result.content and result.content == _prev_content and not result.tool_calls:
                    _repeat_count += 1
                    if _repeat_count >= 2:
                        logger.warning(
                            "Agent[%s] stuck: repeated output %d times, forcing stop",
                            self.config.name, _repeat_count,
                        )
                        break
                else:
                    _repeat_count = 0
                _prev_content = result.content

                total_usage.input_tokens += result.token_usage.input_tokens
                total_usage.output_tokens += result.token_usage.output_tokens
                total_usage.cost_usd += result.token_usage.cost_usd
                total_usage.model = result.token_usage.model or total_usage.model

                if result.error:
                    self._memory.append_history(
                        event=f"{self.config.name}:failed",
                        details=f"Task: {task}\nError: {result.error}",
                    )
                    self._messages.clear()
                    return AgentResult(
                        success=False,
                        output="",
                        error=result.error,
                        token_usage=total_usage,
                        duration_seconds=time.monotonic() - start,
                    )

                # Check done with min_steps guard and tool_required logic
                if result.done and (_i + 1) >= min_steps:
                    # TOOL_REQUIRED: must have called at least one tool
                    if self.config.done_strategy == DoneStrategy.TOOL_REQUIRED and not _has_tool_calls:
                        logger.info("Agent[%s] step %d: done but no tool calls yet (tool_required), continuing",
                                    self.config.name, _i + 1)
                        self._messages.append({
                            "role": "user",
                            "content": "你还没有使用任何工具。请立即使用工具来完成任务，不要只输出文字。",
                        })
                        continue
                    break

            # Combine all meaningful text outputs from the agent's run.
            # For multi-step agents, join all content blocks so nothing is lost.
            if len(all_contents) <= 1:
                combined = all_contents[0] if all_contents else ""
            else:
                # Filter out very short transitional messages, keep substantial ones
                substantial = [c for c in all_contents if len(c.strip()) > 20]
                combined = "\n\n".join(substantial) if substantial else all_contents[-1]
            output = await self._post_process(combined)

            duration = time.monotonic() - start
            logger.info(
                "Agent[%s] completed in %.1fs (tokens: %d/%d)",
                self.config.name,
                duration,
                total_usage.input_tokens,
                total_usage.output_tokens,
            )

            self._memory.append_history(
                event=f"{self.config.name}:completed",
                details=f"Task: {task}\nOutput: {output[:500]}",
            )

            await self._emit("agent.done", {
                "success": True,
                "duration": round(duration, 1),
                "steps": _i + 1,
            })

            self._messages.clear()
            return AgentResult(
                success=True,
                output=output,
                token_usage=total_usage,
                duration_seconds=time.monotonic() - start,
            )

        except Exception as e:
            logger.error("Agent[%s] loop failed: %s", self.config.name, e)
            self._messages.clear()
            return AgentResult(
                success=False,
                output="",
                error=str(e),
                token_usage=total_usage,
                duration_seconds=time.monotonic() - start,
            )

    # ── Context compaction ─────────────────────────────

    @staticmethod
    def _estimate_tokens(messages: list[dict[str, str]]) -> int:
        """Rough token estimate: ~4 chars per token."""
        return sum(len(str(m.get("content", ""))) for m in messages) // 4

    def _maybe_compact(self) -> None:
        """Compact context if approaching token threshold.

        Two-stage compaction (inspired by learn-claude-code s06):
        1. Microcompact: clear old tool result contents (keep recent ones)
        2. Auto-compact: if still over threshold, summarize and reset
        """
        if not self._messages:
            return

        est = self._estimate_tokens(self._messages)
        if est < self._TOKEN_THRESHOLD:
            return

        # Stage 1: Microcompact -- replace old tool results with "[cleared]"
        self._microcompact()

        # Re-check after microcompact
        est = self._estimate_tokens(self._messages)
        if est < self._TOKEN_THRESHOLD:
            logger.info("Agent[%s] microcompact reduced to ~%d tokens", self.config.name, est)
            return

        # Stage 2: Auto-compact -- keep only recent messages
        logger.info("Agent[%s] auto-compact: ~%d tokens, trimming history", self.config.name, est)
        self._auto_compact()

    def _microcompact(self) -> None:
        """Replace old tool result message contents with '[cleared]'.

        Preserves the most recent _KEEP_RECENT_RESULTS tool result messages.
        """
        result_indices: list[int] = []
        for i, msg in enumerate(self._messages):
            if msg.get("role") == "user" and "[{" in str(msg.get("content", ""))[:10]:
                result_indices.append(i)

        to_clear = result_indices[:-self._KEEP_RECENT_RESULTS] if len(result_indices) > self._KEEP_RECENT_RESULTS else []
        for idx in to_clear:
            content = str(self._messages[idx].get("content", ""))
            if len(content) > 100:
                self._messages[idx]["content"] = "[tool results cleared for context management]"

    def _auto_compact(self) -> None:
        """Keep only the first message (task) and the most recent exchanges."""
        if len(self._messages) <= 4:
            return

        first = self._messages[0]
        recent = self._messages[-4:]

        summary_note = {
            "role": "user",
            "content": (
                "[Context was automatically compacted to stay within token limits. "
                "Earlier conversation history has been trimmed. "
                "Continue working on the task based on what you can see.]"
            ),
        }
        assistant_ack = {
            "role": "assistant",
            "content": "Understood. Continuing with the available context.",
        }

        self._messages.clear()
        self._messages.extend([first, summary_note, assistant_ack, *recent])
        logger.info("Agent[%s] compacted to %d messages", self.config.name, len(self._messages))

    # ── SOUL.md loading ───────────────────────────────

    def _load_soul(self) -> str:
        """Four-level lookup for agent system prompt.

        1. Module-level:  {module_dir}/SOUL.md
        2. Project-level: {project}/.openags/souls/{name}.md  (legacy)
        3. Global:        skills/agents/{name}/SOUL.md
        4. Fallback:      _fallback_system_prompt()
        """
        agent_name = self.config.name

        # 1. Module-level: e.g. literature/SOUL.md
        if self._module_dir is not None:
            module_soul = self._module_dir / "SOUL.md"
            if module_soul.exists():
                return self._render_soul(module_soul.read_text(encoding="utf-8"))

        # 2. Project-level (legacy path)
        project_soul = (
            self._memory.project_dir / ".openags" / "souls" / f"{agent_name}.md"
        )
        if project_soul.exists():
            return self._render_soul(project_soul.read_text(encoding="utf-8"))

        # 3. Global
        global_soul = Path(f"skills/agents/{agent_name}/SOUL.md")
        if global_soul.exists():
            return self._render_soul(global_soul.read_text(encoding="utf-8"))

        # 4. Hardcoded fallback
        return self._fallback_system_prompt()

    def _render_soul(self, template: str) -> str:
        """Simple variable substitution -- no Jinja2 dependency."""
        return (
            template
            .replace("{{role}}", self.config.name)
            .replace("{{name}}", self.config.name)
            .replace("{{max_steps}}", str(self.max_steps))
        )

    def _fallback_system_prompt(self) -> str:
        """Generic fallback system prompt when no SOUL.md is found."""
        return (
            f"You are an AI research agent named '{self.config.name}'. "
            f"Follow instructions carefully and use the tools available to you. "
            f"Be thorough, precise, and provide well-structured output."
        )

    # ── Tool integration ──────────────────────────────

    def _get_tool_names(self) -> list[str]:
        """Return tool names this agent should use, from config."""
        return list(self.config.tools)

    def _get_tools(self) -> list[dict[str, object]] | None:
        """Build OpenAI-format tool list from registry filtered by agent config."""
        if self._tool_registry is None:
            return None
        names = self._get_tool_names()
        if not names:
            return None
        tools: list[dict[str, Any]] = []
        for tool_name in names:
            tool = self._tool_registry.get(tool_name)
            if tool:
                tools.append({
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.schema(),
                    },
                })
        return tools if tools else None

    async def _execute_tools(
        self, tool_calls: list[dict[str, object]],
    ) -> list[dict[str, object]]:
        """Execute tool calls using the tool registry."""
        if self._tool_registry is None:
            return []

        results: list[dict[str, object]] = []
        for call in tool_calls:
            func = call.get("function", {})
            if isinstance(func, dict):
                name = str(func.get("name", ""))
                args_raw = func.get("arguments", "{}")
            else:
                name = str(call.get("name", ""))
                args_raw = call.get("arguments", "{}")

            tool = self._tool_registry.get(name)
            if tool is None:
                results.append({
                    "tool_call_id": call.get("id", ""),
                    "name": name,
                    "error": f"Unknown tool: {name}",
                })
                continue

            # Emit tool_call event for UI
            tool_args_summary = ""
            if isinstance(args_raw, str) and len(args_raw) < 500:
                tool_args_summary = args_raw
            elif isinstance(args_raw, dict):
                tool_args_summary = str({k: str(v)[:100] for k, v in args_raw.items()})
            await self._emit("agent.tool_call", {"tool": name, "args": tool_args_summary[:300]})

            try:
                if isinstance(args_raw, str):
                    try:
                        kwargs = json.loads(args_raw) if args_raw else {}
                    except json.JSONDecodeError as je:
                        results.append({
                            "tool_call_id": call.get("id", ""),
                            "name": name,
                            "error": f"Invalid JSON arguments: {je}. Please retry with valid JSON.",
                        })
                        continue
                elif isinstance(args_raw, dict):
                    kwargs = args_raw
                else:
                    kwargs = {}

                tool_result = await tool.invoke(**kwargs)
                await self._emit("agent.tool_result", {
                    "tool": name,
                    "success": tool_result.success,
                    "summary": str(tool_result.data)[:200] if tool_result.data else None,
                    "error": tool_result.error,
                })
                results.append({
                    "tool_call_id": call.get("id", ""),
                    "name": name,
                    "success": tool_result.success,
                    "data": tool_result.data,
                    "error": tool_result.error,
                })
            except Exception as e:
                logger.error("Tool '%s' execution failed: %s", name, e)
                await self._emit("agent.tool_result", {
                    "tool": name, "success": False, "error": str(e),
                })
                results.append({
                    "tool_call_id": call.get("id", ""),
                    "name": name,
                    "error": str(e),
                })

        return results

    # ── Skill integration ─────────────────────────────

    def _build_user_prompt(self, task: str, context: str) -> str:
        """Build user prompt with memory context, skill injections, and upstream files."""
        parts: list[str] = []

        if self._skill_engine:
            skill_prompt = self._skill_engine.build_prompt_injection(
                self.config.name, task,
            )
            if skill_prompt.strip():
                parts.append(skill_prompt)

        if context.strip():
            parts.append(context)

        # Inject upstream file content (so agents don't need to read them manually)
        if self.config.upstream_files and self._module_dir:
            upstream_parts: list[str] = []
            for rel_path in self.config.upstream_files:
                # Resolve relative to module dir (supports ../sibling/ paths)
                full = (self._module_dir / rel_path).resolve()
                if full.is_file() and full.exists():
                    try:
                        content = full.read_text(encoding="utf-8")
                        if len(content) > 4000:
                            content = content[:4000] + "\n... (truncated)"
                        upstream_parts.append(f"### {rel_path}\n{content}")
                    except Exception:
                        pass
            if upstream_parts:
                parts.append("## Upstream Data (auto-injected)\n" + "\n\n".join(upstream_parts))

        parts.append(f"## Task\n{task}")
        return "\n\n".join(parts)

    # ── Done detection ────────────────────────────────

    def _is_done(self, content: str, tool_calls: list[dict[str, object]]) -> bool:
        """Check if the task is complete based on done_strategy.

        - DEFAULT: done when no tool calls AND content is substantial (>50 chars).
        - TOOL_REQUIRED: same as DEFAULT, but loop() enforces at least one tool call.
        - COORDINATOR: done when content contains none of the continuation phrases.
        """
        if tool_calls:
            return False

        if self.config.done_strategy == DoneStrategy.COORDINATOR:
            return self._is_done_coordinator(content)

        # DEFAULT and TOOL_REQUIRED: done when substantial text with no tool calls
        if len(content.strip()) < 50:
            return False
        return True

    def _is_done_coordinator(self, content: str) -> bool:
        """Coordinator done strategy: done unless content contains continuation phrases."""
        content_lower = content.lower()
        for phrase in self.config.continuation_phrases:
            if phrase.lower() in content_lower:
                return False
        return True

    # ── Post-processing (override in transition subclasses) ─

    async def _post_process(self, raw_output: str) -> str:
        """Override in subclasses for result validation/formatting."""
        return raw_output


# Backward-compatible alias
BaseAgent = Agent
