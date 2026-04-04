/**
 * Workflow protocol TypeScript types — mirrors Python models.
 */

export interface DirectiveModel {
  directive_id: string
  phase: string
  action: 'execute' | 'revise' | 'abort'
  priority: 'critical' | 'high' | 'normal' | 'low'
  created_at: string
  timeout_seconds: number
  max_attempts: number
  attempt: number
  decision: 'PROCEED' | 'REFINE' | 'PIVOT'
  decision_reason: string
  depends_on: string[]
  task: string
  acceptance_criteria: string
  context: string
  upstream_data: string
}

export type AgentStatusValue = 'idle' | 'pending' | 'running' | 'completed' | 'failed' | 'blocked' | 'aborted'

export type ExitReason =
  | 'task_complete' | 'max_steps' | 'timeout' | 'error'
  | 'user_abort' | 'agent_abort' | 'parse_error' | 'stale_after_crash'
  | 'wait_user' | 'project_complete'

export interface StatusModel {
  directive_id: string
  agent: string
  status: AgentStatusValue
  started_at: string
  completed_at: string
  duration_seconds: number
  exit_reason: ExitReason | null
  error_message: string | null
  artifacts: string[]
  quality_self_assessment: number
  summary: string
  issues: string
  recommendations: string
}

export interface WorkflowAgentConfig {
  timeout: number
  execution_timeout?: number
  max_attempts: number
}

export interface WorkflowConfig {
  max_refine: number
  max_pivot: number
  max_attempts: number
  coordinator_timeout: number
  poll_interval: number
  auto_start: boolean
  agents: Record<string, WorkflowAgentConfig>
}

export interface AgentState {
  name: string
  dir: string
  status: StatusModel | null
  directive: DirectiveModel | null
  timeoutTimer: ReturnType<typeof setTimeout> | null
}

export type WorkflowEvent =
  | { type: 'workflow.started' }
  | { type: 'workflow.agent_dispatched'; agent: string; task: string }
  | { type: 'workflow.agent_completed'; agent: string; summary: string }
  | { type: 'workflow.agent_failed'; agent: string; error: string }
  | { type: 'workflow.awaiting_user'; reason: string }
  | { type: 'workflow.complete' }
  | { type: 'workflow.paused' }
  | { type: 'workflow.error'; error: string }
  | { type: 'workflow.state'; agents: Record<string, { status: StatusModel | null; directive: DirectiveModel | null }> }
