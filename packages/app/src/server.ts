/**
 * OpenAGS Application Server
 *
 * Node.js HTTP + WebSocket server.
 * Serves the React frontend, handles PTY terminal sessions via WebSocket,
 * and provides chat endpoints for CLI agent providers.
 *
 * No Python backend — all logic is in TypeScript.
 */

import express from 'express'
import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { join } from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
// node-pty must be loaded via require() as it's a native addon
const pty = require('node-pty')

// ── Config ──────────────────────────────────────────

const PTY_SESSION_TIMEOUT = 30 * 60 * 1000 // 30 min keepalive after disconnect
const SHELL_BUFFER_MAX = 5000 // Max buffered output entries

// ── PTY Session Store ───────────────────────────────

interface PtySession {
  pty: ReturnType<typeof pty.spawn>
  cwd: string
  command: string
  ws: WebSocket | null
  buffer: string[]
  timeoutId: ReturnType<typeof setTimeout> | null
}

const ptySessions = new Map<string, PtySession>()

function getDefaultShell(): string {
  if (process.platform === 'win32') return 'powershell.exe'
  return process.env.SHELL || '/bin/zsh'
}

function destroyAllPtySessions(): void {
  for (const [, session] of ptySessions) {
    try { session.pty.kill() } catch { /* ignore */ }
    if (session.timeoutId) clearTimeout(session.timeoutId)
  }
  ptySessions.clear()
}

// ── Claude History Reader ───────────────────────────

function readClaudeHistory(cwd: string): Array<{ role: string; content: string; timestamp: string }> {
  const encoded = cwd.replace(/\//g, '-')
  const projectDir = path.join(os.homedir(), '.claude', 'projects', encoded)
  if (!fs.existsSync(projectDir)) return []

  const files = fs.readdirSync(projectDir).filter((f: string) => f.endsWith('.jsonl'))
  if (files.length === 0) return []

  const sorted = files
    .map((f: string) => ({ name: f, mtime: fs.statSync(path.join(projectDir, f)).mtimeMs }))
    .sort((a: { mtime: number }, b: { mtime: number }) => b.mtime - a.mtime)

  const content = fs.readFileSync(path.join(projectDir, sorted[0].name), 'utf-8')
  const messages: Array<{ role: string; content: string; timestamp: string }> = []

  for (const line of content.trim().split('\n')) {
    if (!line.trim()) continue
    try {
      const entry = JSON.parse(line)
      if (entry.type === 'user' && entry.message?.role === 'user') {
        const c = entry.message.content
        if (typeof c === 'string') {
          messages.push({ role: 'user', content: c, timestamp: entry.timestamp || '' })
        } else if (Array.isArray(c)) {
          const texts = c.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text)
          if (texts.length > 0) messages.push({ role: 'user', content: texts.join('\n'), timestamp: entry.timestamp || '' })
        }
      }
      if (entry.type === 'assistant' && entry.message?.role === 'assistant') {
        const c = entry.message.content
        if (typeof c === 'string') {
          messages.push({ role: 'assistant', content: c, timestamp: entry.timestamp || '' })
        } else if (Array.isArray(c)) {
          const texts = c.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text)
          if (texts.length > 0) messages.push({ role: 'assistant', content: texts.join('\n'), timestamp: entry.timestamp || '' })
        }
      }
    } catch { /* skip malformed */ }
  }
  return messages
}

// ── WebSocket: Shell/PTY Handler ────────────────────

function handleShellConnection(ws: WebSocket): void {
  let currentSessionKey: string | null = null

  ws.on('message', (raw) => {
    let data: Record<string, unknown>
    try { data = JSON.parse(raw.toString()) } catch { return }

    // ── Init: create or reconnect PTY ──
    if (data.type === 'init') {
      const id = data.id as string
      const cwd = data.cwd as string
      const command = (data.command as string) || 'claude'
      const cols = (data.cols as number) || 120
      const rows = (data.rows as number) || 30
      currentSessionKey = id

      // Reconnect to existing session
      const existing = ptySessions.get(id)
      if (existing) {
        if (existing.timeoutId) {
          clearTimeout(existing.timeoutId)
          existing.timeoutId = null
        }
        existing.ws = ws

        // Replay buffered output
        for (const buffered of existing.buffer) {
          ws.send(JSON.stringify({ type: 'output', data: buffered }))
        }
        return
      }

      // Create new PTY
      try {
        fs.mkdirSync(cwd, { recursive: true })
      } catch { /* ignore */ }

      const shell = getDefaultShell()
      const extraPaths = ['/usr/local/bin', '/opt/homebrew/bin', `${os.homedir()}/.npm-global/bin`].join(':')
      const env = {
        ...process.env,
        TERM: 'xterm-256color',
        PATH: `${process.env.PATH || ''}:${extraPaths}`,
      }

      try {
        const ptyProcess = pty.spawn(shell, ['--login'], {
          name: 'xterm-256color',
          cols, rows, cwd, env,
        })

        const session: PtySession = {
          pty: ptyProcess, cwd, command,
          ws, buffer: [], timeoutId: null,
        }
        ptySessions.set(id, session)

        // Forward PTY output to WebSocket + buffer
        ptyProcess.onData((output: string) => {
          // Buffer for reconnect replay
          if (session.buffer.length >= SHELL_BUFFER_MAX) session.buffer.shift()
          session.buffer.push(output)

          if (session.ws?.readyState === WebSocket.OPEN) {
            session.ws.send(JSON.stringify({ type: 'output', data: output }))
          }
        })

        ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
          if (session.ws?.readyState === WebSocket.OPEN) {
            session.ws.send(JSON.stringify({ type: 'exit', exitCode }))
          }
          ptySessions.delete(id)
        })

        // Send CLI command after shell initializes (skip if empty = plain shell)
        if (command) {
          setTimeout(() => {
            ptyProcess.write(`${command}\r`)
          }, 500)
        }

        ws.send(JSON.stringify({ type: 'ready', id, existing: false }))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        ws.send(JSON.stringify({ type: 'error', error: msg }))
      }
    }

    // ── Input: keyboard data to PTY ──
    else if (data.type === 'input' && currentSessionKey) {
      const session = ptySessions.get(currentSessionKey)
      if (session) session.pty.write(data.data as string)
    }

    // ── Resize ──
    else if (data.type === 'resize' && currentSessionKey) {
      const session = ptySessions.get(currentSessionKey)
      if (session) session.pty.resize(data.cols as number, data.rows as number)
    }

    // ── Read Claude history ──
    else if (data.type === 'claude-history') {
      const history = readClaudeHistory(data.cwd as string)
      ws.send(JSON.stringify({ type: 'claude-history', data: history }))
    }
  })

  ws.on('close', () => {
    if (!currentSessionKey) return
    const session = ptySessions.get(currentSessionKey)
    if (!session) return

    // Keep PTY alive, timeout after 30 min
    session.ws = null
    session.timeoutId = setTimeout(() => {
      try { session.pty.kill() } catch { /* ignore */ }
      ptySessions.delete(currentSessionKey!)
    }, PTY_SESSION_TIMEOUT)
  })
}

// ── WebSocket: Chat Provider Handler ────────────────

async function handleChatConnection(ws: WebSocket): Promise<void> {
  ws.on('message', async (raw) => {
    let data: Record<string, unknown>
    try { data = JSON.parse(raw.toString()) } catch { return }

    const provider = data.provider as string
    const command = data.command as string || ''
    const options = {
      sessionId: data.sessionId as string | undefined,
      cwd: data.cwd as string | undefined,
      model: data.model as string | undefined,
      permissionMode: data.permissionMode as string | undefined,
      images: data.images as Array<{ data: string }> | undefined,
    }

    const { WsWriter } = await import('./providers/types.js')
    const writer = new WsWriter(ws)

    // Read CLI provider config (Claude Code / Codex / Gemini)
    if (data.type === 'read-cli-config') {
      const { readCLIConfig, CLAUDE_PRESETS, CODEX_PRESETS, GEMINI_PRESETS } = await import('./providers/cli-config.js')
      const backend = data.backend as string
      const config = readCLIConfig(backend)
      const presets = backend === 'claude_code' ? CLAUDE_PRESETS
        : backend === 'codex' ? CODEX_PRESETS
        : backend === 'gemini_cli' ? GEMINI_PRESETS : []
      writer.send({ type: 'cli-config', config, presets })
      return
    }

    // Write CLI provider config
    if (data.type === 'write-cli-config') {
      const { writeCLIConfig } = await import('./providers/cli-config.js')
      const backend = data.backend as string
      const config = data.config as { provider: string; apiKey: string; model: string; baseUrl: string }
      try {
        writeCLIConfig(backend, config)
        writer.send({ type: 'cli-config-saved' })
      } catch (err) {
        writer.sendError(err instanceof Error ? err.message : String(err))
      }
      return
    }

    // Sync config files across a project (triggered on backend switch)
    if (data.type === 'sync-configs') {
      const { syncProjectConfigs } = await import('./providers/adapter.js')
      const projectDir = data.projectDir as string
      if (projectDir) {
        try {
          syncProjectConfigs(projectDir)
          writer.send({ type: 'sync-configs-done' })
        } catch (err) {
          writer.sendError(err instanceof Error ? err.message : String(err))
        }
      }
      return
    }

    if (data.type === 'abort-session') {
      const sid = data.sessionId as string
      let success = false
      if (provider === 'claude_code') {
        const { abortClaudeSession } = await import('./providers/claude-sdk.js')
        success = abortClaudeSession(sid)
      } else if (provider === 'codex') {
        const { abortCodexSession } = await import('./providers/codex-sdk.js')
        success = abortCodexSession(sid)
      } else if (provider === 'gemini_cli') {
        const { abortGeminiSession } = await import('./providers/gemini-cli.js')
        success = abortGeminiSession(sid)
      }
      writer.send({ type: 'session-aborted', sessionId: sid, success })
      return
    }

    if (data.type !== 'chat') return

    try {
      if (provider === 'claude_code') {
        const { queryClaudeSDK } = await import('./providers/claude-sdk.js')
        await queryClaudeSDK(command, options, writer)
      } else if (provider === 'codex') {
        const { queryCodex } = await import('./providers/codex-sdk.js')
        await queryCodex(command, options, writer)
      } else if (provider === 'gemini_cli') {
        const { spawnGemini } = await import('./providers/gemini-cli.js')
        await spawnGemini(command, options, writer)
      } else {
        writer.sendError(`Unknown provider: ${provider}`)
        writer.sendComplete(1)
      }
    } catch (err) {
      writer.sendError(err instanceof Error ? err.message : String(err))
      writer.sendComplete(1)
    }
  })
}

// ── Workflow Orchestrators (per project) ────────────

import { WorkflowOrchestrator } from './workflow/orchestrator.js'
import type { WorkflowConfig } from './workflow/types.js'
import { createProjectRoutes } from './routes/projects.js'
import { createResearchRoutes } from './routes/research.js'
import { createConfigRoutes } from './routes/config.js'
import { createSkillsRoutes } from './routes/skills.js'
import { createWorkflowRoutes } from './routes/workflow.js'
import { createAuthRoutes } from './routes/auth.js'
import { createReferencesRoutes } from './routes/references.js'
import { createVersionRoutes } from './routes/versions.js'
import { createManuscriptRoutes } from './routes/manuscript.js'

const workflowOrchestrators = new Map<string, WorkflowOrchestrator>()

function handleWorkflowConnection(ws: WebSocket): void {
  let registeredProjectId: string | null = null

  ws.on('message', async (raw) => {
    let data: Record<string, unknown>
    try { data = JSON.parse(raw.toString()) } catch { return }

    const projectId = data.projectId as string
    const projectDir = data.projectDir as string
    const backendType = (data.backendType as string) || 'claude_code'

    if (data.type === 'workflow.start') {
      // Default config (can be loaded from project later)
      const config: WorkflowConfig = {
        max_refine: 2, max_pivot: 1, max_attempts: 2,
        coordinator_timeout: 300, poll_interval: 2000,
        auto_start: false, agents: {},
      }

      // Create and start orchestrator
      let orch = workflowOrchestrators.get(projectId)
      if (orch) orch.stop()

      orch = new WorkflowOrchestrator(projectId, projectDir, config, backendType)

      // Import existing session IDs from UI (so auto-mode resumes manual sessions)
      const existingSessionIds = data.sessionIds as Record<string, string> | undefined
      if (existingSessionIds) orch.setSessionIds(existingSessionIds)

      // Register this UI client for auto-mode broadcasts
      orch.uiClients.add(ws)
      registeredProjectId = projectId

      workflowOrchestrators.set(projectId, orch)
      await orch.start()
    }

    else if (data.type === 'workflow.subscribe') {
      // UI client wants to receive auto messages for a project (without starting)
      const orch = workflowOrchestrators.get(projectId)
      if (orch) {
        orch.uiClients.add(ws)
        registeredProjectId = projectId
        // Send current state
        const statuses: Record<string, string> = {}
        for (const [name, info] of Object.entries(orch.getState())) {
          statuses[name] = info.status?.status || 'idle'
        }
        ws.send(JSON.stringify({ type: 'auto.pipeline', status: 'running', agents: statuses }))
      }
    }

    else if (data.type === 'workflow.stop') {
      const orch = workflowOrchestrators.get(projectId)
      if (orch) {
        orch.uiClients.delete(ws)
        orch.stop()
        workflowOrchestrators.delete(projectId)
      }
      ws.send(JSON.stringify({ type: 'auto.pipeline', status: 'stopped' }))
    }

    else if (data.type === 'workflow.pause') {
      workflowOrchestrators.get(projectId)?.pause()
    }

    else if (data.type === 'workflow.resume') {
      workflowOrchestrators.get(projectId)?.resume()
    }

    else if (data.type === 'workflow.intervene') {
      await workflowOrchestrators.get(projectId)?.intervene(data.message as string)
    }

    else if (data.type === 'workflow.get_state') {
      const orch = workflowOrchestrators.get(projectId)
      if (orch) {
        ws.send(JSON.stringify({ type: 'auto.pipeline', agents: orch.getState() }))
      }
    }
  })

  ws.on('close', () => {
    // Unregister from orchestrator's UI clients (but don't stop the orchestrator)
    if (registeredProjectId) {
      const orch = workflowOrchestrators.get(registeredProjectId)
      if (orch) orch.uiClients.delete(ws)
    }
  })
}

// ── Create Server ───────────────────────────────────

export interface ServerOptions {
  staticDir?: string
  port?: number
  workspaceDir?: string
  configPath?: string
  skillsDir?: string
  /** Directory containing project templates (copied on project creation) */
  templatesDir?: string
  /** Skip WebSocket setup (shell/chat/workflow) — set true when the caller adds its own WS handlers */
  skipWebSockets?: boolean
}

export function createServer(options: ServerOptions = {}): { app: ReturnType<typeof express>; server: http.Server } {
  const app = express()

  // JSON body parser
  app.use(express.json())

  // CORS — allow requests from Vite dev server and Electron
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (_req.method === 'OPTIONS') { res.status(204).send(); return }
    next()
  })

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.0.1' })
  })

  // ── REST API Routes ─────────────────────────────────

  // Create workflow orchestrator for REST endpoint
  const apiOrchestrator = new WorkflowOrchestrator('__api__', process.cwd(), {
    max_refine: 2, max_pivot: 1, max_attempts: 2,
    coordinator_timeout: 300, poll_interval: 2000,
    auto_start: false, agents: {},
  }, 'claude_code')

  app.use('/api', createAuthRoutes(options.workspaceDir))
  app.use('/api', createProjectRoutes(options.workspaceDir, options.templatesDir))
  app.use('/api', createResearchRoutes())
  app.use('/api', createConfigRoutes(options.configPath))
  app.use('/api', createSkillsRoutes(options.skillsDir))
  app.use('/api', createWorkflowRoutes(apiOrchestrator))
  app.use('/api', createReferencesRoutes(options.workspaceDir))
  app.use('/api', createVersionRoutes(options.workspaceDir))
  app.use('/api', createManuscriptRoutes(options.workspaceDir))

  // Serve static files (production build)
  if (options.staticDir) {
    app.use(express.static(options.staticDir))
    // SPA fallback — serve index.html for any non-API, non-file route
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/ws') && !req.path.startsWith('/shell')) {
        res.sendFile(join(options.staticDir!, 'index.html'))
      } else {
        next()
      }
    })
  }

  const server = http.createServer(app)

  // WebSocket handlers — skipped when desktop provides its own
  if (!options.skipWebSockets) {
    const shellWss = new WebSocketServer({ noServer: true })
    shellWss.on('connection', handleShellConnection)

    const chatWss = new WebSocketServer({ noServer: true })
    chatWss.on('connection', handleChatConnection)

    const workflowWss = new WebSocketServer({ noServer: true })
    workflowWss.on('connection', handleWorkflowConnection)

    server.on('upgrade', (req, socket, head) => {
      if (req.url?.startsWith('/shell')) {
        shellWss.handleUpgrade(req, socket, head, (ws) => shellWss.emit('connection', ws, req))
      } else if (req.url?.startsWith('/chat')) {
        chatWss.handleUpgrade(req, socket, head, (ws) => chatWss.emit('connection', ws, req))
      } else if (req.url?.startsWith('/workflow')) {
        workflowWss.handleUpgrade(req, socket, head, (ws) => workflowWss.emit('connection', ws, req))
      } else {
        socket.destroy()
      }
    })
  }

  return { app, server }
}

function destroyAllWorkflows(): void {
  for (const [, orch] of workflowOrchestrators) {
    orch.stop()
  }
  workflowOrchestrators.clear()
}

export { destroyAllPtySessions, destroyAllWorkflows }
