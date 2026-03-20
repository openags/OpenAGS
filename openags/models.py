"""OpenAGS global data models — single source of truth for all cross-module data."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from pathlib import Path

from pydantic import BaseModel, Field, SecretStr

# ── Enums ──────────────────────────────────────────────


# Agents are identified by name string (directory name)
AgentName = str


class DoneStrategy(StrEnum):
    DEFAULT = "default"
    COORDINATOR = "coordinator"
    TOOL_REQUIRED = "tool_required"


class PermissionMode(StrEnum):
    DEFAULT = "default"
    PLAN = "plan"
    SUPERVISED = "supervised"


class RunMode(StrEnum):
    AUTO = "auto"
    INTERACTIVE = "interactive"
    REVIEW = "review"


class BackendType(StrEnum):
    BUILTIN = "builtin"
    CLAUDE_CODE = "claude_code"
    CODEX = "codex"
    COPILOT = "copilot"
    GEMINI_CLI = "gemini_cli"


class SandboxMode(StrEnum):
    LOCAL = "local"
    DOCKER = "docker"
    REMOTE = "remote"


# ── Token / Usage ──────────────────────────────────────


class TokenUsage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    model: str = ""
    cost_usd: float = 0.0


# ── Messages ───────────────────────────────────────────


class Message(BaseModel):
    role: str = Field(..., pattern=r"^(user|assistant|system)$")
    content: str
    timestamp: datetime = Field(default_factory=datetime.now)
    token_usage: TokenUsage | None = None


# ── Project ────────────────────────────────────────────


class Project(BaseModel):
    id: str = Field(..., pattern=r"^[a-z0-9][a-z0-9_-]{0,62}[a-z0-9]$")
    name: str
    description: str = ""
    stage: str = "idle"
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    workspace: Path
    owner_id: str = ""


# ── User ──────────────────────────────────────────────


class UserPublic(BaseModel):
    """User info returned by API (no secrets)."""

    id: str
    username: str
    display_name: str = ""
    created_at: datetime = Field(default_factory=datetime.now)


# ── Session ────────────────────────────────────────────


class Session(BaseModel):
    id: str
    project_id: str
    agent_role: str = "ags"
    agent_name: str = ""
    name: str = ""
    mode: RunMode = RunMode.INTERACTIVE
    title: str = ""
    created_at: datetime = Field(default_factory=datetime.now)
    messages: list[Message] = []


# ── Backend ────────────────────────────────────────────


class BackendConfig(BaseModel):
    type: BackendType = BackendType.BUILTIN
    model: str = "claude-sonnet-4-6"
    api_key: SecretStr | None = None
    timeout: int = Field(default=300, ge=10, le=3600)
    max_retries: int = Field(default=3, ge=0, le=10)


class BackendResponse(BaseModel):
    content: str
    token_usage: TokenUsage = Field(default_factory=TokenUsage)
    tool_calls: list[dict[str, object]] = []
    raw: dict[str, object] = {}


# ── Agent ──────────────────────────────────────────────


class AgentResult(BaseModel):
    success: bool
    output: str
    artifacts: list[Path] = []
    token_usage: TokenUsage = Field(default_factory=TokenUsage)
    duration_seconds: float = 0.0
    error: str | None = None


class StepResult(BaseModel):
    """Single-step result — return value of agent.step()."""

    content: str = ""
    tool_calls: list[dict[str, object]] = []
    tool_results: list[dict[str, object]] = []
    token_usage: TokenUsage = Field(default_factory=TokenUsage)
    done: bool = False
    error: str | None = None


class HookConfig(BaseModel):
    """Hook definition — run a command on a matching event."""

    event: str
    matcher: str = ""
    command: str
    timeout: int = Field(default=30, ge=1, le=600)


class AgentConfig(BaseModel):
    """Declarative agent configuration parsed from SOUL.md frontmatter."""

    name: str = Field(..., pattern=r"^[a-z][a-z0-9_-]{0,62}[a-z0-9]?$")
    description: str = ""
    tools: list[str] = []
    max_steps: int = Field(default=50, ge=1, le=500)
    min_steps: int = Field(default=1, ge=1, le=50)
    done_strategy: DoneStrategy = DoneStrategy.DEFAULT
    continuation_phrases: list[str] = []
    model: str | None = None
    mode: str = "subagent"
    permission_mode: PermissionMode = PermissionMode.DEFAULT
    hooks: list[HookConfig] | None = None
    isolation: str | None = None
    upstream_files: list[str] = []
    source_path: Path | None = Field(default=None, exclude=True)


class TaskItem(BaseModel):
    """A single task within a multi-agent plan."""

    id: str
    description: str
    assigned_to: str | None = None
    status: str = Field(default="pending", pattern=r"^(pending|in_progress|completed)$")
    result: str = ""
    depends_on: list[str] = []


# ── Experiment ─────────────────────────────────────────


class Experiment(BaseModel):
    id: str
    project_id: str
    name: str
    code_path: Path
    requirements: list[str] = []
    gpu_count: int = Field(default=0, ge=0)
    sandbox: SandboxMode = SandboxMode.LOCAL
    timeout: int = Field(default=3600, ge=60)


class ExperimentResult(BaseModel):
    success: bool
    data: dict[str, object] | None = None
    error: str | None = None
    attempts: int = 1
    duration_seconds: float = 0.0
    log_path: Path | None = None


# ── Citation ───────────────────────────────────────────


class Citation(BaseModel):
    title: str
    authors: list[str] = []
    year: int | None = None
    doi: str | None = None
    arxiv_id: str | None = None
    venue: str | None = None
    bibtex: str | None = None


class VerifyResult(BaseModel):
    valid: bool
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    reason: str = ""
    verified_citation: Citation | None = None


# ── Skill ──────────────────────────────────────────────


class SkillMeta(BaseModel):
    """Skill metadata — compatible with both OpenAGS and Claude Code SKILL.md format."""

    model_config = {"populate_by_name": True}

    name: str = Field(..., pattern=r"^[a-z][a-z0-9_-]{0,62}[a-z0-9]$")
    description: str
    # OpenAGS fields
    roles: list[str] = []
    agents: list[str] = []
    paths: list[str] = []
    tools: list[str] = []
    triggers: list[str] = []
    version: str = "1.0.0"
    source_path: Path | None = None
    # Claude Code compatible fields (passed through, not used by OpenAGS engine)
    allowed_tools: str | None = Field(None, alias="allowed-tools")
    disable_model_invocation: bool = Field(False, alias="disable-model-invocation")
    context: str | None = None
    agent: str | None = None
    argument_hint: str | None = Field(None, alias="argument-hint")


# ── Message Bus ────────────────────────────────────────


class BusMessage(BaseModel):
    """Typed message for inter-agent communication via MessageBus."""

    topic: str
    sender: str
    payload: dict[str, object] = {}
    hop_count: int = Field(default=0, ge=0)
    max_hops: int = Field(default=10, ge=1)
    timestamp: datetime = Field(default_factory=datetime.now)


# ── GPU Info ───────────────────────────────────────────


class GPUInfo(BaseModel):
    """Detected GPU device information."""

    index: int
    name: str = ""
    memory_total_mb: int = 0
    memory_free_mb: int = 0
    utilization_percent: float = 0.0


# ── Configuration ──────────────────────────────────────


class TelegramConfig(BaseModel):
    token: SecretStr
    chat_id: str


class FeishuConfig(BaseModel):
    app_id: str
    app_secret: SecretStr
    chat_id: str


class DiscordConfig(BaseModel):
    token: SecretStr
    channel_id: str


class MessagingConfig(BaseModel):
    telegram: TelegramConfig | None = None
    feishu: FeishuConfig | None = None
    discord: DiscordConfig | None = None


# ── Workflow Protocol ─────────────────────────────────


class DirectiveAction(StrEnum):
    EXECUTE = "execute"
    REVISE = "revise"
    ABORT = "abort"


class DirectivePriority(StrEnum):
    CRITICAL = "critical"
    HIGH = "high"
    NORMAL = "normal"
    LOW = "low"


class DirectiveDecision(StrEnum):
    PROCEED = "PROCEED"
    REFINE = "REFINE"
    PIVOT = "PIVOT"


class AgentStatus(StrEnum):
    IDLE = "idle"
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    BLOCKED = "blocked"
    ABORTED = "aborted"


class ExitReason(StrEnum):
    TASK_COMPLETE = "task_complete"
    MAX_STEPS = "max_steps"
    TIMEOUT = "timeout"
    ERROR = "error"
    USER_ABORT = "user_abort"
    AGENT_ABORT = "agent_abort"
    PARSE_ERROR = "parse_error"
    STALE_AFTER_CRASH = "stale_after_crash"
    WAIT_USER = "wait_user"
    PROJECT_COMPLETE = "project_complete"


class DirectiveModel(BaseModel):
    """DIRECTIVE.md — task assignment from Coordinator to Sub-Agent."""

    directive_id: str
    phase: str = ""
    action: DirectiveAction = DirectiveAction.EXECUTE
    priority: DirectivePriority = DirectivePriority.NORMAL
    created_at: str = ""
    timeout_seconds: int = 1800
    max_attempts: int = 2
    attempt: int = 1
    decision: DirectiveDecision = DirectiveDecision.PROCEED
    decision_reason: str = ""
    depends_on: list[str] = []
    # Body sections (not in frontmatter)
    task: str = ""
    acceptance_criteria: str = ""
    context: str = ""
    upstream_data: str = ""


class StatusModel(BaseModel):
    """STATUS.md — execution result from Sub-Agent."""

    directive_id: str = ""
    agent: str = ""
    status: AgentStatus = AgentStatus.IDLE
    started_at: str = ""
    completed_at: str = ""
    duration_seconds: float = 0.0
    exit_reason: ExitReason | None = None
    error_message: str | None = None
    artifacts: list[str] = []
    quality_self_assessment: int = 0
    token_usage: TokenUsage = Field(default_factory=TokenUsage)
    backend: str = ""
    # Body sections (not in frontmatter)
    summary: str = ""
    acceptance_criteria_met: str = ""
    issues: str = ""
    recommendations: str = ""


class WorkflowAgentConfig(BaseModel):
    """Per-agent workflow overrides."""

    timeout: int = 1800
    execution_timeout: int | None = None
    max_attempts: int = 2


class WorkflowConfig(BaseModel):
    """Global workflow configuration with per-agent overrides."""

    max_refine: int = Field(default=2, ge=1, le=10)
    max_pivot: int = Field(default=1, ge=0, le=5)
    max_attempts: int = Field(default=2, ge=1, le=10)
    coordinator_timeout: int = Field(default=300, ge=60, le=3600)
    poll_interval: int = Field(default=2000, ge=500, le=30000)
    auto_start: bool = False
    agents: dict[str, WorkflowAgentConfig] = {}

    def get_agent_timeout(self, agent_name: str) -> int:
        """Lookup chain: agent-level → code default (1800)."""
        agent_cfg = self.agents.get(agent_name)
        if agent_cfg:
            return agent_cfg.timeout
        return 1800

    def get_agent_max_attempts(self, agent_name: str) -> int:
        """Lookup chain: agent-level → global → code default (2)."""
        agent_cfg = self.agents.get(agent_name)
        if agent_cfg:
            return agent_cfg.max_attempts
        return self.max_attempts


class GPUConfig(BaseModel):
    auto_detect: bool = True
    device_ids: list[int] = []
    max_memory_gb: float | None = None


class RemoteServer(BaseModel):
    name: str
    host: str
    port: int = 22
    user: str
    key_file: Path | None = None
    gpus: list[int] = []


class SystemConfig(BaseModel):
    """Global system configuration — single source, Pydantic-validated."""

    workspace_dir: Path = Field(default_factory=lambda: Path.home() / ".openags")
    default_backend: BackendConfig = Field(default_factory=BackendConfig)
    backends: dict[str, BackendConfig] = {}
    gpu: GPUConfig = Field(default_factory=GPUConfig)
    remote_servers: list[RemoteServer] = []
    messaging: MessagingConfig = Field(default_factory=MessagingConfig)
    workflow: WorkflowConfig = Field(default_factory=WorkflowConfig)
    experiment_sandbox: SandboxMode = SandboxMode.LOCAL
    experiment_max_fix_attempts: int = Field(default=5, ge=1, le=20)
    token_budget_usd: float | None = Field(default=None, ge=0)
    log_level: str = Field(default="INFO", pattern=r"^(DEBUG|INFO|WARNING|ERROR)$")
