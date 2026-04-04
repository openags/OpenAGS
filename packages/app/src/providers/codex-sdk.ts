/**
 * Codex provider — uses @openai/codex-sdk.
 *
 * Reference: claudecodeui/server/openai-codex.js
 *
 * Key features:
 * - SDK-based thread management (start/resume)
 * - Streaming via runStreamed() async generator
 * - Approval policy (never / untrusted)
 * - Token tracking from turn.completed events
 */

import { WsWriter } from './types.js'

const activeCodexSessions = new Map<string, { thread: any; codex: any; abortController: AbortController }>()

export async function queryCodex(
  command: string,
  options: {
    sessionId?: string
    cwd?: string
    model?: string
    permissionMode?: string
  },
  writer: WsWriter,
): Promise<void> {
  const { Codex } = await import('@openai/codex-sdk')

  const codex = new Codex()

  // Map permission mode to Codex options
  let sandboxMode = 'workspace-write'
  let approvalPolicy = 'never'
  if (options.permissionMode === 'default') {
    approvalPolicy = 'untrusted'
  } else if (options.permissionMode === 'bypassPermissions') {
    sandboxMode = 'danger-full-access'
    approvalPolicy = 'never'
  }

  const threadOptions: Record<string, any> = {
    workingDirectory: options.cwd || process.cwd(),
    skipGitRepoCheck: true,
    sandboxMode,
    approvalPolicy,
  }
  if (options.model) threadOptions.model = options.model

  let thread: any
  try {
    if (options.sessionId) {
      thread = codex.resumeThread(options.sessionId, threadOptions)
    } else {
      thread = codex.startThread(threadOptions)
    }
  } catch (err) {
    writer.sendError(`Failed to create Codex thread: ${err instanceof Error ? err.message : err}`)
    writer.sendComplete(1)
    return
  }

  const sessionId = thread.id || options.sessionId || `codex_${Date.now()}`
  writer.sendSessionCreated(sessionId)

  const abortController = new AbortController()
  activeCodexSessions.set(sessionId, { thread, codex, abortController })

  try {
    const streamedTurn = await thread.runStreamed(command, {
      signal: abortController.signal,
    })

    for await (const event of streamedTurn.events) {
      const eventType = event.type

      if (eventType === 'item.started' || eventType === 'item.updated' || eventType === 'item.completed') {
        const item = event.item
        if (item?.type === 'agent_message' && item.text) {
          writer.sendText(item.text)
        } else if (item?.type === 'command_execution') {
          writer.sendToolUse(item.command || 'shell', { output: item.aggregated_output })
          if (eventType === 'item.completed') {
            writer.sendToolResult(item.id || '', item.aggregated_output || '', item.exit_code !== 0)
          }
        } else if (item?.type === 'mcp_tool_call' && eventType === 'item.completed') {
          writer.sendToolResult(item.id || '', item.result || item.error || '', !!item.error)
        }
      }

      if (eventType === 'turn.completed') {
        const usage = event.usage || {}
        writer.sendResult(undefined, {
          input: usage.input_tokens || 0,
          output: usage.output_tokens || 0,
        })
      }
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      writer.sendError(err instanceof Error ? err.message : String(err))
    }
  } finally {
    writer.sendComplete()
    activeCodexSessions.delete(sessionId)
  }
}

export function abortCodexSession(sessionId: string): boolean {
  const session = activeCodexSessions.get(sessionId)
  if (session) {
    session.abortController.abort()
    activeCodexSessions.delete(sessionId)
    return true
  }
  return false
}

export function isCodexSessionActive(sessionId: string): boolean {
  return activeCodexSessions.has(sessionId)
}
