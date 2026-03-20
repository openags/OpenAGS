/**
 * WorkflowOrchestrator — automated research pipeline engine.
 *
 * Dispatches agents through the SAME chat channels as manual mode.
 * UI sees auto-mode messages in each module's Chat thread in real-time.
 *
 * For CLI backends: calls provider SDK directly with BroadcastWriter.
 * For builtin: calls Python streaming API, forwards chunks to UI.
 */

import * as fs from 'fs'
import * as path from 'path'
import { EventEmitter } from 'events'
import { WebSocket } from 'ws'
import { parseStatusMd, parseDirectiveMd, isTerminalStatus, writeFailedStatusMd } from './parser'
import { BroadcastWriter } from '../providers/types'
import type { AgentState, DirectiveModel, WorkflowConfig, WorkflowEvent, StatusModel } from './types'

const PYTHON_API = 'http://127.0.0.1:19836'
const RESEARCH_AGENTS = ['literature', 'proposal', 'experiments', 'manuscript', 'review']

export class WorkflowOrchestrator extends EventEmitter {
  private projectId: string
  private projectDir: string
  private config: WorkflowConfig
  private backendType: string
  private agents: Map<string, AgentState> = new Map()
  private watchers: Map<string, fs.FSWatcher> = new Map()
  private coordinatorLock = false
  private pendingTriggers: string[] = []
  private paused = false
  private stopped = false
  private pivotCount = 0
  private dispatchLocks: Set<string> = new Set()
  private refineCount: Map<string, number> = new Map()
  /** Per-module provider session IDs — reuse across rounds */
  private sessionIds: Map<string, string> = new Map()

  /** All connected UI WebSocket clients — auto messages broadcast here */
  uiClients: Set<WebSocket> = new Set()

  constructor(projectId: string, projectDir: string, config: WorkflowConfig, backendType = 'builtin') {
    super()
    this.projectId = projectId
    this.projectDir = projectDir
    this.config = config
    this.backendType = backendType
  }

  // ── Lifecycle ────────────────────────────────────

  /** Import existing session IDs from UI (localStorage) so auto-mode resumes them */
  setSessionIds(ids: Record<string, string>): void {
    for (const [module, sid] of Object.entries(ids)) {
      if (sid) this.sessionIds.set(module, sid)
    }
  }

  async start(): Promise<void> {
    this.stopped = false
    this.paused = false

    for (const name of RESEARCH_AGENTS) {
      const dir = path.join(this.projectDir, name)
      if (fs.existsSync(dir)) {
        this.agents.set(name, {
          name, dir,
          status: parseStatusMd(dir),
          directive: parseDirectiveMd(dir),
          timeoutTimer: null,
        })
      }
    }

    await this.recoverFromCrash()

    // Watch STATUS.md + DIRECTIVE.md changes
    for (const [name, agent] of this.agents) {
      try {
        const watcher = fs.watch(agent.dir, (_, filename) => {
          if (this.paused || this.stopped) return
          if (filename === 'STATUS.md') {
            setTimeout(() => this.onStatusChanged(name), 300)
          } else if (filename === 'DIRECTIVE.md') {
            // AGS wrote a new directive → dispatch this sub-agent
            setTimeout(() => void this.onDirectiveChanged(name), 500)
          }
        })
        this.watchers.set(name, watcher)
      } catch { /* dir may not exist */ }
    }

    this.broadcast({ type: 'auto.pipeline', status: 'running', agents: this.getAgentStatuses() })
    // NOTE: Do NOT trigger AGS here. The frontend sends @@AUTO_MODE_START via the normal chat session.
    // One-shot delayed scan: catch any DIRECTIVE.md written before fs.watch was ready
    setTimeout(() => {
      if (this.stopped) return
      for (const [name] of this.agents) void this.onDirectiveChanged(name)
    }, 3000)
  }

  stop(): void {
    this.stopped = true
    this.paused = false
    for (const [, watcher] of this.watchers) watcher.close()
    this.watchers.clear()
    for (const [, agent] of this.agents) {
      if (agent.timeoutTimer) { clearTimeout(agent.timeoutTimer); agent.timeoutTimer = null }
    }
    this.broadcast({ type: 'auto.pipeline', status: 'stopped', agents: this.getAgentStatuses() })
  }

  pause(): void {
    this.paused = true
    this.broadcast({ type: 'auto.pipeline', status: 'paused', agents: this.getAgentStatuses() })
  }

  resume(): void {
    this.paused = false
    this.broadcast({ type: 'auto.pipeline', status: 'running', agents: this.getAgentStatuses() })
    if (this.pendingTriggers.length > 0) {
      void this.triggerCoordinator(this.pendingTriggers.shift()!)
    }
  }

  // ── Broadcast to all UI clients ──────────────────

  private broadcast(msg: Record<string, unknown>): void {
    const data = JSON.stringify(msg)
    for (const ws of this.uiClients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data)
    }
  }

  // ── Status Change Handler ────────────────────────

  private async onStatusChanged(agentName: string): Promise<void> {
    if (this.stopped) return
    const agent = this.agents.get(agentName)
    if (!agent) return

    const newStatus = parseStatusMd(agent.dir)
    if (!newStatus) return
    agent.status = newStatus

    if (isTerminalStatus(newStatus.status)) {
      if (agent.timeoutTimer) { clearTimeout(agent.timeoutTimer); agent.timeoutTimer = null }
      this.broadcast({ type: 'auto.pipeline', status: 'running', agents: this.getAgentStatuses() })
      await this.triggerCoordinator(`${agentName}_${newStatus.status}`)
    }
  }

  // ── Directive Change Handler — dispatch sub-agent when AGS writes DIRECTIVE.md ──

  private async onDirectiveChanged(agentName: string): Promise<void> {
    if (this.stopped) return
    if (this.dispatchLocks.has(agentName)) return  // prevent concurrent dispatch
    const agent = this.agents.get(agentName)
    if (!agent) return

    const directive = parseDirectiveMd(agent.dir)
    if (!directive) return

    // Skip if already handled (same directive_id and terminal or running)
    if (agent.status?.directive_id === directive.directive_id) {
      if (isTerminalStatus(agent.status.status) || agent.status.status === 'running') return
    }

    // Lock + mark running BEFORE async dispatch
    this.dispatchLocks.add(agentName)
    agent.status = { ...(agent.status || {} as any), directive_id: directive.directive_id, status: 'running' } as any
    agent.directive = directive

    const timeout = this.getAgentTimeout(agentName)
    if (agent.timeoutTimer) clearTimeout(agent.timeoutTimer)
    agent.timeoutTimer = setTimeout(() => {
      void this.handleTimeout(agentName, directive.directive_id)
    }, timeout * 1000)

    try {
      await this.dispatchViaChat(agentName, agentName, `Read DIRECTIVE.md in your directory. Execute the task following the Workflow Protocol in your role configuration. Write STATUS.md when done.`)
    } finally {
      this.dispatchLocks.delete(agentName)
    }
  }

  // ── Coordinator Trigger ──────────────────────────

  private async triggerCoordinator(reason: string): Promise<void> {
    if (this.stopped || this.paused) { this.pendingTriggers.push(reason); return }

    // Build status summary and send to frontend — frontend will forward to AGS via the existing chat session
    const context = this.buildCoordinatorContext(reason)
    const message = `[STATUS_UPDATE] ${reason}\n\n${context}`
    this.broadcast({ type: 'auto.ags-trigger', message })

    // After notifying AGS, scan for new DIRECTIVE.md (AGS may have already written it)
    // Give AGS time to process and write DIRECTIVE.md
    setTimeout(() => {
      if (!this.stopped && !this.paused) {
        void this.processCoordinatorOutput()
      }
    }, 5000)
  }

  // ── Process Coordinator Output ───────────────────

  private async processCoordinatorOutput(): Promise<void> {
    const coordStatus = parseStatusMd(this.projectDir)
    if (coordStatus) {
      if (coordStatus.exit_reason === 'wait_user') {
        this.paused = true
        this.broadcast({ type: 'auto.wait_user', reason: coordStatus.summary || 'Need user input' })
        return
      }
      if (coordStatus.exit_reason === 'project_complete') {
        this.broadcast({ type: 'auto.pipeline', status: 'complete', agents: this.getAgentStatuses() })
        this.stop()
        return
      }
    }

    // Scan for new DIRECTIVE.md written by coordinator
    let dispatched = false
    for (const [name, agent] of this.agents) {
      const directive = parseDirectiveMd(agent.dir)
      if (!directive) continue
      if (agent.status?.directive_id === directive.directive_id && isTerminalStatus(agent.status.status)) continue
      if (agent.status?.directive_id === directive.directive_id && agent.status?.status === 'running') continue

      const timeout = this.getAgentTimeout(name)
      agent.timeoutTimer = setTimeout(() => {
        void this.handleTimeout(name, directive.directive_id)
      }, timeout * 1000)

      await this.dispatchViaChat(name, name, `Read DIRECTIVE.md in your directory. Execute the task following the Workflow Protocol in your role configuration. Write STATUS.md when done.`)
      dispatched = true
    }

    // Fallback: if coordinator didn't write DIRECTIVE.md, auto-determine next agent
    if (!dispatched) {
      const nextAgent = this.determineNextAgent()
      if (nextAgent) {
        // Write DIRECTIVE.md ourselves
        const { atomicWriteFile } = await import('./parser')
        const directiveContent = `---\ndirective_id: "auto-${Date.now()}"\nphase: "${nextAgent}"\naction: "execute"\ndecision: "PROCEED"\n---\n\n## Task\n\nExecute the ${nextAgent} phase. Read upstream outputs and complete the task. Write STATUS.md when done.\n`
        atomicWriteFile(path.join(this.projectDir, nextAgent, 'DIRECTIVE.md'), directiveContent)

        const timeout = this.getAgentTimeout(nextAgent)
        const agent = this.agents.get(nextAgent)!
        agent.timeoutTimer = setTimeout(() => {
          void this.handleTimeout(nextAgent, `auto-${Date.now()}`)
        }, timeout * 1000)

        await this.dispatchViaChat(nextAgent, nextAgent, `读取 DIRECTIVE.md，执行任务，完成后写 STATUS.md。`)
      } else {
        // All agents done or blocked
        this.broadcast({ type: 'auto.pipeline', status: 'complete', agents: this.getAgentStatuses() })
        this.stop()
        return
      }
    }

    this.broadcast({ type: 'auto.pipeline', status: 'running', agents: this.getAgentStatuses() })
  }

  // ── Core Dispatch — uses the SAME chat path as manual mode ──

  private async dispatchViaChat(uiModule: string, agentName: string, task: string): Promise<void> {
    // Mark agent as running in pipeline BEFORE dispatch
    const agent = this.agents.get(agentName)
    if (agent) {
      agent.status = { ...(agent.status || {} as any), status: 'running' } as any
    }
    // Notify UI: add user message to this module's chat thread
    this.broadcast({ type: 'auto.pipeline', status: 'running', agents: this.getAgentStatuses() })
    this.broadcast({ type: 'auto.start', module: uiModule, task })

    try {
      if (this.backendType === 'builtin') {
        await this.dispatchBuiltin(uiModule, agentName, task)
      } else {
        await this.dispatchCli(uiModule, agentName, task)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.broadcast({ type: 'auto.error', module: uiModule, error: msg })
    }

    this.broadcast({ type: 'auto.done', module: uiModule, success: true })
  }

  /** Builtin: call Python streaming API, forward chunks to UI */
  private async dispatchBuiltin(uiModule: string, agentName: string, task: string): Promise<void> {
    const url = `${PYTHON_API}/api/agents/${this.projectId}/chat`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: task }],
        module: agentName,
        stream: true,
      }),
    })

    if (!response.ok) throw new Error(`Chat API error: ${response.status}`)
    if (!response.body) throw new Error('No response body')

    // Read SSE stream and broadcast chunks
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value, { stream: true })
      if (text.trim()) {
        this.broadcast({ type: 'auto.text', module: uiModule, content: text })
      }
    }
  }

  /** CLI: call provider SDK directly with BroadcastWriter, reuse session per module */
  private async dispatchCli(uiModule: string, agentName: string, task: string): Promise<void> {
    const writer = new BroadcastWriter(this.uiClients, uiModule)
    const agentDir = (agentName === 'ags' || agentName === 'coordinator')
      ? this.projectDir
      : path.join(this.projectDir, agentName)

    // Reuse existing session ID for this module (single session per module)
    const existingSessionId = this.sessionIds.get(agentName)
    const options: Record<string, unknown> = {
      cwd: agentDir,
      permissionMode: 'bypassPermissions',
      ...(existingSessionId ? { sessionId: existingSessionId } : {}),
    }

    // Capture session ID from provider response and save for reuse
    const origSendSessionCreated = writer.sendSessionCreated.bind(writer)
    writer.sendSessionCreated = (sessionId: string) => {
      this.sessionIds.set(agentName, sessionId)
      // Broadcast to UI so it can save in ChatThread.providerSessionId (localStorage)
      this.broadcast({ type: 'auto.session-created', module: agentName, sessionId })
      origSendSessionCreated(sessionId)
    }

    if (this.backendType === 'claude_code') {
      const { queryClaudeSDK } = await import('../providers/claude-sdk')
      await queryClaudeSDK(task, options, writer as any)
    } else if (this.backendType === 'codex') {
      const { queryCodex } = await import('../providers/codex-sdk')
      await queryCodex(task, options, writer as any)
    } else if (this.backendType === 'cursor') {
      const { spawnCursor } = await import('../providers/cursor-cli')
      await spawnCursor(task, options, writer as any)
    } else if (this.backendType === 'gemini_cli') {
      const { spawnGemini } = await import('../providers/gemini-cli')
      await spawnGemini(task, options, writer as any)
    }
  }

  // ── Timeout & Recovery ───────────────────────────

  private async handleTimeout(agentName: string, directiveId: string): Promise<void> {
    const agent = this.agents.get(agentName)
    if (!agent) return
    const current = parseStatusMd(agent.dir)
    if (current && isTerminalStatus(current.status)) return

    writeFailedStatusMd(agent.dir, directiveId, agentName, 'timeout',
      `Timeout after ${this.getAgentTimeout(agentName)}s`)
    this.broadcast({ type: 'auto.error', module: agentName, error: 'Timeout' })
  }

  private async recoverFromCrash(): Promise<void> {
    for (const [name, agent] of this.agents) {
      if (agent.status?.status === 'running') {
        const elapsed = (Date.now() - new Date(agent.status.started_at).getTime()) / 1000
        const timeout = this.getAgentTimeout(name)
        if (elapsed > timeout) {
          writeFailedStatusMd(agent.dir, agent.status.directive_id, name,
            'stale_after_crash', `Stale running state (${Math.round(elapsed)}s)`)
          agent.status = parseStatusMd(agent.dir)
        }
      }
    }
  }

  // ── Helpers ──────────────────────────────────────

  private buildCoordinatorContext(reason: string): string {
    const parts = [`# Project Status\nTrigger: ${reason}\nPivot: ${this.pivotCount}/${this.config.max_pivot}\n`]
    for (const [name, agent] of this.agents) {
      parts.push(`## ${name}`)
      if (agent.status && agent.status.status !== 'idle') {
        parts.push(`- Status: ${agent.status.status}`)
        if (agent.status.summary) parts.push(`- Summary: ${agent.status.summary.slice(0, 200)}`)
        parts.push(`- Refine: ${this.refineCount.get(name) || 0}/${this.config.max_refine}`)
      } else {
        parts.push('- Status: not started')
      }
      parts.push('')
    }
    return parts.join('\n')
  }

  /** Determine next agent from dependency graph based on current statuses */
  private determineNextAgent(): string | null {
    const order = RESEARCH_AGENTS // ['literature', 'proposal', 'experiments', 'manuscript', 'review']
    for (const name of order) {
      const agent = this.agents.get(name)
      if (!agent) continue
      const status = agent.status?.status || 'idle'
      if (status === 'completed') continue // already done
      if (status === 'running') return null // something is running, wait
      // This agent is idle/failed — it's the next one to run
      return name
    }
    return null // all completed
  }

  private getAgentTimeout(name: string): number {
    return this.config.agents[name]?.timeout || 1800
  }

  private getAgentStatuses(): Record<string, string> {
    const result: Record<string, string> = {}
    for (const [name, agent] of this.agents) {
      // If agent was set to 'running' in memory (by dispatchViaChat), keep it
      // Only re-read from file for non-running agents
      const memStatus = agent.status?.status
      if (memStatus !== 'running') {
        agent.status = parseStatusMd(agent.dir)
      }
      result[name] = agent.status?.status || 'idle'
    }
    return result
  }

  getState(): Record<string, { status: StatusModel | null; directive: DirectiveModel | null }> {
    const result: Record<string, { status: StatusModel | null; directive: DirectiveModel | null }> = {}
    for (const [name, agent] of this.agents) {
      agent.status = parseStatusMd(agent.dir)
      agent.directive = parseDirectiveMd(agent.dir)
      result[name] = { status: agent.status, directive: agent.directive }
    }
    return result
  }

  async intervene(message: string): Promise<void> {
    this.paused = false
    await this.triggerCoordinator(`user_intervention: ${message}`)
  }
}
