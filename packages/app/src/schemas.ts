/**
 * OpenAGS Schemas — Zod-based validation (replaces Python Pydantic models)
 */

import { z } from 'zod'

// ── Enums ──────────────────────────────────────────────

export const DoneStrategy = z.enum(['default', 'coordinator', 'tool_required'])
export type DoneStrategy = z.infer<typeof DoneStrategy>

export const PermissionMode = z.enum(['default', 'plan', 'supervised'])
export type PermissionMode = z.infer<typeof PermissionMode>

export const RunMode = z.enum(['auto', 'interactive', 'review'])
export type RunMode = z.infer<typeof RunMode>

export const BackendType = z.enum(['builtin', 'claude_code', 'codex', 'copilot', 'gemini_cli', 'cursor'])
export type BackendType = z.infer<typeof BackendType>

export const SandboxMode = z.enum(['local', 'docker', 'remote'])
export type SandboxMode = z.infer<typeof SandboxMode>

export const AgentStatus = z.enum(['idle', 'pending', 'running', 'completed', 'failed', 'blocked', 'aborted'])
export type AgentStatus = z.infer<typeof AgentStatus>

export const ExitReason = z.enum([
  'task_complete', 'max_steps', 'timeout', 'error',
  'user_abort', 'agent_abort', 'parse_error', 'stale_after_crash',
  'wait_user', 'project_complete'
])
export type ExitReason = z.infer<typeof ExitReason>

export const DirectiveAction = z.enum(['execute', 'revise', 'abort'])
export type DirectiveAction = z.infer<typeof DirectiveAction>

export const DirectivePriority = z.enum(['critical', 'high', 'normal', 'low'])
export type DirectivePriority = z.infer<typeof DirectivePriority>

export const DirectiveDecision = z.enum(['PROCEED', 'REFINE', 'PIVOT'])
export type DirectiveDecision = z.infer<typeof DirectiveDecision>

// ── Token / Usage ──────────────────────────────────────

export const TokenUsage = z.object({
  input_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
  model: z.string().default(''),
  cost_usd: z.number().default(0),
})
export type TokenUsage = z.infer<typeof TokenUsage>

// ── Messages ───────────────────────────────────────────

export const Message = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  timestamp: z.string().datetime().optional(),
  token_usage: TokenUsage.optional(),
})
export type Message = z.infer<typeof Message>

// ── Project ────────────────────────────────────────────

export const ProjectId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,62}[a-z0-9]$/)

export const Project = z.object({
  id: ProjectId,
  name: z.string(),
  description: z.string().default(''),
  stage: z.string().default('idle'),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  workspace: z.string(), // Path as string
  owner_id: z.string().default(''),
})
export type Project = z.infer<typeof Project>

// ── Session ────────────────────────────────────────────

export const Session = z.object({
  id: z.string(),
  project_id: z.string(),
  agent_role: z.string().default('ags'),
  agent_name: z.string().default(''),
  name: z.string().default(''),
  mode: RunMode.default('interactive'),
  title: z.string().default(''),
  created_at: z.string().datetime().optional(),
  messages: z.array(Message).default([]),
})
export type Session = z.infer<typeof Session>

// ── Backend ────────────────────────────────────────────

export const BackendConfig = z.object({
  type: BackendType.default('claude_code'),
  model: z.string().default('claude-sonnet-4-6'),
  api_key: z.string().optional(),
  timeout: z.number().min(10).max(3600).default(300),
  max_retries: z.number().min(0).max(10).default(3),
})
export type BackendConfig = z.infer<typeof BackendConfig>

export const BackendResponse = z.object({
  content: z.string(),
  token_usage: TokenUsage.default({}),
  tool_calls: z.array(z.record(z.unknown())).default([]),
  raw: z.record(z.unknown()).default({}),
})
export type BackendResponse = z.infer<typeof BackendResponse>

// ── Agent ──────────────────────────────────────────────

export const AgentResult = z.object({
  success: z.boolean(),
  output: z.string(),
  artifacts: z.array(z.string()).default([]),
  token_usage: TokenUsage.default({}),
  duration_seconds: z.number().default(0),
  error: z.string().nullable().default(null),
})
export type AgentResult = z.infer<typeof AgentResult>

export const StepResult = z.object({
  content: z.string().default(''),
  tool_calls: z.array(z.record(z.unknown())).default([]),
  tool_results: z.array(z.record(z.unknown())).default([]),
  token_usage: TokenUsage.default({}),
  done: z.boolean().default(false),
  error: z.string().nullable().default(null),
})
export type StepResult = z.infer<typeof StepResult>

export const HookConfig = z.object({
  event: z.string(),
  matcher: z.string().default(''),
  command: z.string(),
  timeout: z.number().min(1).max(600).default(30),
})
export type HookConfig = z.infer<typeof HookConfig>

export const AgentConfig = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_-]{0,62}[a-z0-9]?$/),
  description: z.string().default(''),
  tools: z.array(z.string()).default([]),
  max_steps: z.number().min(1).max(500).default(50),
  min_steps: z.number().min(1).max(50).default(1),
  done_strategy: DoneStrategy.default('default'),
  continuation_phrases: z.array(z.string()).default([]),
  model: z.string().nullable().default(null),
  mode: z.string().default('subagent'),
  permission_mode: PermissionMode.default('default'),
  hooks: z.array(HookConfig).nullable().default(null),
  isolation: z.string().nullable().default(null),
  upstream_files: z.array(z.string()).default([]),
  source_path: z.string().nullable().default(null),
})
export type AgentConfig = z.infer<typeof AgentConfig>

// ── Experiment ─────────────────────────────────────────

export const Experiment = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  code_path: z.string(),
  requirements: z.array(z.string()).default([]),
  gpu_count: z.number().min(0).default(0),
  sandbox: SandboxMode.default('local'),
  timeout: z.number().min(60).default(3600),
})
export type Experiment = z.infer<typeof Experiment>

export const ExperimentResult = z.object({
  success: z.boolean(),
  data: z.record(z.unknown()).nullable().default(null),
  error: z.string().nullable().default(null),
  attempts: z.number().default(1),
  duration_seconds: z.number().default(0),
  log_path: z.string().nullable().default(null),
})
export type ExperimentResult = z.infer<typeof ExperimentResult>

// ── Citation ───────────────────────────────────────────

export const Citation = z.object({
  title: z.string(),
  authors: z.array(z.string()).default([]),
  year: z.number().nullable().default(null),
  doi: z.string().nullable().default(null),
  arxiv_id: z.string().nullable().default(null),
  venue: z.string().nullable().default(null),
  bibtex: z.string().nullable().default(null),
})
export type Citation = z.infer<typeof Citation>

export const VerifyResult = z.object({
  valid: z.boolean(),
  confidence: z.number().min(0).max(1).default(0),
  reason: z.string().default(''),
  verified_citation: Citation.nullable().default(null),
})
export type VerifyResult = z.infer<typeof VerifyResult>

// ── Skill ──────────────────────────────────────────────

export const SkillMeta = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_-]{0,62}[a-z0-9]$/),
  description: z.string(),
  roles: z.array(z.string()).default([]),
  agents: z.array(z.string()).default([]),
  paths: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  triggers: z.array(z.string()).default([]),
  version: z.string().default('1.0.0'),
  source_path: z.string().nullable().default(null),
  // Claude Code compatible fields
  allowed_tools: z.string().nullable().default(null),
  disable_model_invocation: z.boolean().default(false),
  context: z.string().nullable().default(null),
  agent: z.string().nullable().default(null),
  argument_hint: z.string().nullable().default(null),
})
export type SkillMeta = z.infer<typeof SkillMeta>

// ── Message Bus ────────────────────────────────────────

export const BusMessage = z.object({
  topic: z.string(),
  sender: z.string(),
  payload: z.record(z.unknown()).default({}),
  hop_count: z.number().min(0).default(0),
  max_hops: z.number().min(1).default(10),
  timestamp: z.string().datetime().optional(),
})
export type BusMessage = z.infer<typeof BusMessage>

// ── GPU Info ───────────────────────────────────────────

export const GPUInfo = z.object({
  index: z.number(),
  name: z.string().default(''),
  memory_total_mb: z.number().default(0),
  memory_free_mb: z.number().default(0),
  utilization_percent: z.number().default(0),
})
export type GPUInfo = z.infer<typeof GPUInfo>

// ── Configuration ──────────────────────────────────────

export const TelegramConfig = z.object({
  token: z.string(),
  chat_id: z.string(),
})
export type TelegramConfig = z.infer<typeof TelegramConfig>

export const FeishuConfig = z.object({
  app_id: z.string(),
  app_secret: z.string(),
  chat_id: z.string(),
})
export type FeishuConfig = z.infer<typeof FeishuConfig>

export const DiscordConfig = z.object({
  token: z.string(),
  channel_id: z.string(),
})
export type DiscordConfig = z.infer<typeof DiscordConfig>

export const MessagingConfig = z.object({
  telegram: TelegramConfig.nullable().default(null),
  feishu: FeishuConfig.nullable().default(null),
  discord: DiscordConfig.nullable().default(null),
})
export type MessagingConfig = z.infer<typeof MessagingConfig>

// ── Workflow Protocol ─────────────────────────────────

export const DirectiveModel = z.object({
  directive_id: z.string(),
  phase: z.string().default(''),
  action: DirectiveAction.default('execute'),
  priority: DirectivePriority.default('normal'),
  created_at: z.string().default(''),
  timeout_seconds: z.number().default(1800),
  max_attempts: z.number().default(2),
  attempt: z.number().default(1),
  decision: DirectiveDecision.default('PROCEED'),
  decision_reason: z.string().default(''),
  depends_on: z.array(z.string()).default([]),
  // Body sections
  task: z.string().default(''),
  acceptance_criteria: z.string().default(''),
  context: z.string().default(''),
  upstream_data: z.string().default(''),
})
export type DirectiveModel = z.infer<typeof DirectiveModel>

export const StatusModel = z.object({
  directive_id: z.string().default(''),
  agent: z.string().default(''),
  status: AgentStatus.default('idle'),
  started_at: z.string().default(''),
  completed_at: z.string().default(''),
  duration_seconds: z.number().default(0),
  exit_reason: ExitReason.nullable().default(null),
  error_message: z.string().nullable().default(null),
  artifacts: z.array(z.string()).default([]),
  quality_self_assessment: z.number().default(0),
  token_usage: TokenUsage.default({}),
  backend: z.string().default(''),
  // Body sections
  summary: z.string().default(''),
  acceptance_criteria_met: z.string().default(''),
  issues: z.string().default(''),
  recommendations: z.string().default(''),
})
export type StatusModel = z.infer<typeof StatusModel>

export const WorkflowAgentConfig = z.object({
  timeout: z.number().default(1800),
  execution_timeout: z.number().nullable().default(null),
  max_attempts: z.number().default(2),
})
export type WorkflowAgentConfig = z.infer<typeof WorkflowAgentConfig>

export const WorkflowConfig = z.object({
  max_refine: z.number().min(1).max(10).default(2),
  max_pivot: z.number().min(0).max(5).default(1),
  max_attempts: z.number().min(1).max(10).default(2),
  coordinator_timeout: z.number().min(60).max(3600).default(300),
  poll_interval: z.number().min(500).max(30000).default(2000),
  auto_start: z.boolean().default(false),
  agents: z.record(WorkflowAgentConfig).default({}),
})
export type WorkflowConfig = z.infer<typeof WorkflowConfig>

export const GPUConfig = z.object({
  auto_detect: z.boolean().default(true),
  device_ids: z.array(z.number()).default([]),
  max_memory_gb: z.number().nullable().default(null),
})
export type GPUConfig = z.infer<typeof GPUConfig>

export const RemoteServer = z.object({
  name: z.string(),
  host: z.string(),
  port: z.number().default(22),
  user: z.string(),
  key_file: z.string().nullable().default(null),
  gpus: z.array(z.number()).default([]),
})
export type RemoteServer = z.infer<typeof RemoteServer>

export const SystemConfig = z.object({
  workspace_dir: z.string().default('~/.openags'),
  default_backend: BackendConfig.default({}),
  backends: z.record(BackendConfig).default({}),
  gpu: GPUConfig.default({}),
  remote_servers: z.array(RemoteServer).default([]),
  messaging: MessagingConfig.default({}),
  workflow: WorkflowConfig.default({}),
  experiment_sandbox: SandboxMode.default('local'),
  experiment_max_fix_attempts: z.number().min(1).max(20).default(5),
  token_budget_usd: z.number().min(0).nullable().default(null),
  log_level: z.enum(['DEBUG', 'INFO', 'WARNING', 'ERROR']).default('INFO'),
})
export type SystemConfig = z.infer<typeof SystemConfig>
