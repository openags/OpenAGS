/**
 * Node.js HTTP + WebSocket server.
 *
 * Serves the React frontend, proxies /api to Python backend,
 * and handles PTY terminal sessions via WebSocket.
 * Works in both Electron and browser mode — no IPC needed.
 *
 * Inspired by claudecodeui's server/index.js architecture.
 */

import express from 'express'
import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { join } from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pty = require('node-pty')

// ── Config ──────────────────────────────────────────

const PYTHON_BACKEND = 'http://127.0.0.1:19836'
const MAX_BUFFER_SIZE = 1024 * 1024 // 1MB PTY output buffer
const PTY_SESSION_TIMEOUT = 30 * 60 * 1000 // 30 min keepalive after disconnect
const SHELL_BUFFER_MAX = 5000 // Max buffered output entries (like claudecodeui)

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

    // Keep PTY alive, timeout after 30 min (like claudecodeui)
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

    const { WsWriter } = await import('./providers/types')
    const writer = new WsWriter(ws)

    // Sync config files across a project (triggered on backend switch)
    if (data.type === 'sync-configs') {
      const { syncProjectConfigs } = await import('./providers/adapter')
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
        const { abortClaudeSession } = await import('./providers/claude-sdk')
        success = abortClaudeSession(sid)
      } else if (provider === 'codex') {
        const { abortCodexSession } = await import('./providers/codex-sdk')
        success = abortCodexSession(sid)
      } else if (provider === 'cursor') {
        const { abortCursorSession } = await import('./providers/cursor-cli')
        success = abortCursorSession(sid)
      } else if (provider === 'gemini_cli') {
        const { abortGeminiSession } = await import('./providers/gemini-cli')
        success = abortGeminiSession(sid)
      }
      writer.send({ type: 'session-aborted', sessionId: sid, success })
      return
    }

    if (data.type !== 'chat') return

    try {
      if (provider === 'claude_code') {
        const { queryClaudeSDK } = await import('./providers/claude-sdk')
        await queryClaudeSDK(command, options, writer)
      } else if (provider === 'codex') {
        const { queryCodex } = await import('./providers/codex-sdk')
        await queryCodex(command, options, writer)
      } else if (provider === 'cursor') {
        const { spawnCursor } = await import('./providers/cursor-cli')
        await spawnCursor(command, options, writer)
      } else if (provider === 'gemini_cli') {
        const { spawnGemini } = await import('./providers/gemini-cli')
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

// ── Create Server ───────────────────────────────────

export function createServer(staticDir?: string): { app: ReturnType<typeof express>; server: http.Server } {
  const app = express()

  // Proxy /api/* to Python backend
  const apiProxy = createProxyMiddleware({
    target: PYTHON_BACKEND,
    changeOrigin: true,
  })
  // Use middleware that matches /api paths but preserves full path
  app.use((req, _res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/api') {
      return apiProxy(req, _res, next)
    }
    next()
  })

  // Serve static files (production build)
  if (staticDir) {
    app.use(express.static(staticDir))
    // SPA fallback — serve index.html for any non-API, non-file route
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/ws') && !req.path.startsWith('/shell')) {
        res.sendFile(join(staticDir, 'index.html'))
      } else {
        next()
      }
    })
  }

  const server = http.createServer(app)

  // WebSocket server for PTY terminals (/shell)
  const shellWss = new WebSocketServer({ noServer: true })
  shellWss.on('connection', handleShellConnection)

  // WebSocket server for provider chat (/chat)
  const chatWss = new WebSocketServer({ noServer: true })
  chatWss.on('connection', handleChatConnection)

  // Handle WebSocket upgrade: /shell → PTY, /chat → providers, /ws/* → Python
  const wsProxy = createProxyMiddleware({
    target: PYTHON_BACKEND,
    changeOrigin: true,
    ws: true,
  })

  server.on('upgrade', (req, socket, head) => {
    if (req.url?.startsWith('/shell')) {
      shellWss.handleUpgrade(req, socket, head, (ws) => {
        shellWss.emit('connection', ws, req)
      })
    } else if (req.url?.startsWith('/chat')) {
      chatWss.handleUpgrade(req, socket, head, (ws) => {
        chatWss.emit('connection', ws, req)
      })
    } else if (req.url?.startsWith('/ws')) {
      wsProxy.upgrade!(req, socket, head)
    } else {
      socket.destroy()
    }
  })

  return { app, server }
}

export { destroyAllPtySessions }
