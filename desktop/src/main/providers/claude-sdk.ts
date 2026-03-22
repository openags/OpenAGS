/**
 * Claude Code provider — uses @anthropic-ai/claude-agent-sdk.
 *
 * Sends structured messages (text, tool_use with details, tool_result, thinking).
 */

import { WsWriter } from './types'

const activeSessions = new Map<string, { instance: any; abort: () => void }>()

export async function queryClaudeSDK(
  command: string,
  options: {
    sessionId?: string
    cwd?: string
    model?: string
    permissionMode?: string
  },
  writer: WsWriter,
): Promise<void> {
  const { query } = await import('@anthropic-ai/claude-agent-sdk')

  const sdkOptions: Record<string, any> = {
    model: options.model || 'sonnet',
    systemPrompt: { type: 'preset', preset: 'claude_code' },
    tools: { type: 'preset', preset: 'claude_code' },
    settingSources: ['project', 'user', 'local'],
  }

  if (options.cwd) sdkOptions.cwd = options.cwd
  if (options.sessionId) sdkOptions.resume = options.sessionId

  if (options.permissionMode === 'bypassPermissions' || options.permissionMode === 'dangerously-skip-permissions') {
    sdkOptions.permissionMode = 'bypassPermissions'
  }

  let capturedSessionId = options.sessionId || null

  try {
    const queryInstance = query({ prompt: command, options: sdkOptions })

    for await (const message of queryInstance) {
      // Capture session ID
      if ((message as any).session_id && !capturedSessionId) {
        capturedSessionId = (message as any).session_id
        writer.sendSessionCreated(capturedSessionId!)
        activeSessions.set(capturedSessionId!, {
          instance: queryInstance,
          abort: () => (queryInstance as any).interrupt?.(),
        })
      }

      const msg = message as any

      // Assistant message: content blocks (text, tool_use, thinking)
      if (msg.type === 'assistant' && msg.message?.content) {
        const content = msg.message.content
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text') {
              writer.sendText(block.text)
            } else if (block.type === 'tool_use') {
              // Send detailed tool info: name + summarized input
              const detail = formatToolInput(block.name, block.input)
              writer.send({ type: 'tool_use', name: block.name, toolId: block.id, detail })
            } else if (block.type === 'thinking') {
              // Optionally send thinking (collapsed in UI)
              writer.send({ type: 'thinking', content: block.thinking })
            }
          }
        }
      }

      // Tool result (from user messages containing tool_result blocks)
      if (msg.type === 'user' && Array.isArray(msg.message?.content)) {
        for (const block of msg.message.content) {
          if (block.type === 'tool_result') {
            writer.send({
              type: 'tool_result',
              toolId: block.tool_use_id,
              isError: block.is_error || false,
            })
          }
        }
      }

      // Final result — text was already sent via assistant messages above
      if (msg.type === 'result') {
        const usage = msg.usage || {}
        writer.sendResult(
          msg.total_cost_usd || msg.cost_usd,
          { input: usage.input_tokens || 0, output: usage.output_tokens || 0 },
        )
      }
    }
  } catch (err) {
    writer.sendError(err instanceof Error ? err.message : String(err))
  } finally {
    writer.sendComplete()
    if (capturedSessionId) activeSessions.delete(capturedSessionId)
  }
}

/** Format tool input into a human-readable one-liner */
function formatToolInput(name: string, input: any): string {
  if (!input || typeof input !== 'object') return ''
  switch (name) {
    case 'Read': return input.file_path || ''
    case 'Write': return input.file_path || ''
    case 'Edit': return input.file_path || ''
    case 'Bash': return (input.command || '').substring(0, 100)
    case 'Glob': return input.pattern || ''
    case 'Grep': return `${input.pattern || ''} ${input.path || ''}`
    case 'Agent': return input.description || input.prompt?.substring(0, 60) || ''
    default: {
      // Generic: show first string value
      const firstVal = Object.values(input).find(v => typeof v === 'string')
      return typeof firstVal === 'string' ? firstVal.substring(0, 80) : ''
    }
  }
}

export function abortClaudeSession(sessionId: string): boolean {
  const session = activeSessions.get(sessionId)
  if (session) {
    session.abort()
    activeSessions.delete(sessionId)
    return true
  }
  return false
}

export function isClaudeSessionActive(sessionId: string): boolean {
  return activeSessions.has(sessionId)
}
