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
