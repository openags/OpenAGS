/**
 * Shared types for all provider integrations.
 */

import { WebSocket } from 'ws'

/** Message sent from provider to frontend via WebSocket */
export interface ProviderMessage {
  type: 'text' | 'tool_use' | 'tool_result' | 'system' | 'result' | 'error' | 'session-created'
  sessionId?: string
  data?: unknown
}

/** Options passed from frontend when starting a chat */
export interface ChatOptions {
  sessionId?: string
  projectPath: string
  cwd?: string
  model?: string
  permissionMode?: string
  images?: Array<{ data: string }>
}

/** WebSocket writer helper — ensures JSON serialization + safe send */
export class WsWriter {
  constructor(private ws: WebSocket, private _sessionId: string | null = null) {}

  get sessionId(): string | null { return this._sessionId }
  set sessionId(id: string | null) { this._sessionId = id }

  send(msg: Record<string, unknown>): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...msg, sessionId: this._sessionId }))
    }
  }

  sendText(text: string): void {
    this.send({ type: 'text', content: text })
  }

  sendToolUse(name: string, input: unknown): void {
    this.send({ type: 'tool_use', name, input })
  }

  sendToolResult(toolId: string, output: string, isError = false): void {
    this.send({ type: 'tool_result', toolId, output, isError })
  }

  sendResult(cost?: number, tokens?: { input: number; output: number }): void {
    this.send({ type: 'result', cost, tokens })
  }

  sendError(error: string): void {
    this.send({ type: 'error', error })
  }

  sendSessionCreated(sessionId: string): void {
    this._sessionId = sessionId
    this.send({ type: 'session-created', sessionId })
  }

  sendComplete(exitCode = 0): void {
    this.send({ type: 'complete', exitCode })
  }
}

/**
 * BroadcastWriter — sends messages to ALL connected UI clients.
 * Used by WorkflowOrchestrator for auto-mode streaming.
 * Same interface as WsWriter so providers don't need to know the difference.
 */
export class BroadcastWriter {
  private _sessionId: string | null = null

  constructor(
    private clients: Set<WebSocket>,
    private module: string,
  ) {}

  get sessionId(): string | null { return this._sessionId }
  set sessionId(id: string | null) { this._sessionId = id }

  private broadcast(msg: Record<string, unknown>): void {
    const data = JSON.stringify({ ...msg, module: this.module, sessionId: this._sessionId })
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data)
    }
  }

  send(msg: Record<string, unknown>): void { this.broadcast(msg) }
  sendText(text: string): void { this.broadcast({ type: 'auto.text', content: text }) }
  sendToolUse(name: string, input: unknown): void {
    const detail = typeof input === 'string' ? input : JSON.stringify(input)?.slice(0, 200) || ''
    this.broadcast({ type: 'auto.tool_use', name, detail })
  }
  sendToolResult(toolId: string, output: string, isError = false): void {
    this.broadcast({ type: 'auto.tool_result', name: toolId, isError })
  }
  sendResult(cost?: number, tokens?: { input: number; output: number }): void {
    this.broadcast({ type: 'auto.result', cost, tokens })
  }
  sendError(error: string): void { this.broadcast({ type: 'auto.error', error }) }
  sendSessionCreated(sessionId: string): void {
    this._sessionId = sessionId
    this.broadcast({ type: 'auto.session-created', sessionId })
  }
  sendComplete(exitCode = 0): void {
    this.broadcast({ type: 'auto.done', exitCode, success: exitCode === 0 })
  }
}
