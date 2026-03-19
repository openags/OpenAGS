/**
 * Cursor CLI provider — subprocess with --output-format stream-json.
 *
 * Reference: claudecodeui/server/cursor-cli.js
 *
 * Key features:
 * - Spawns `cursor-agent` CLI as child process
 * - NDJSON parsing of stream-json output
 * - Session resume via --resume=sessionId
 * - Workspace trust auto-retry
 * - Force mode via -f flag
 */

import { spawn, ChildProcess } from 'child_process'
import crossSpawn from 'cross-spawn'
import * as os from 'os'
import { WsWriter } from './types'

const spawnFn = os.platform() === 'win32' ? crossSpawn : spawn
const activeProcesses = new Map<string, ChildProcess>()

const TRUST_PATTERNS = [
  /workspace trust required/i,
  /do you trust the contents of this directory/i,
  /pass --trust.*-f/i,
]

export async function spawnCursor(
  command: string,
  options: {
    sessionId?: string
    cwd?: string
    model?: string
    permissionMode?: string
  },
  writer: WsWriter,
): Promise<void> {
  const workingDir = options.cwd || process.cwd()
  let capturedSessionId = options.sessionId || null
  let sawTrustPrompt = false
  let hasRetried = false

  function runProcess(extraArgs: string[] = [], label = 'initial'): Promise<void> {
    return new Promise((resolve, reject) => {
      const args: string[] = []

      if (options.sessionId) {
        args.push(`--resume=${options.sessionId}`)
      }

      if (command.trim()) {
        args.push('-p', command)
        if (options.model && !options.sessionId) {
          args.push('--model', options.model)
        }
        args.push('--output-format', 'stream-json')
      }

      if (options.permissionMode === 'bypassPermissions') {
        args.push('-f')
      }

      args.push(...extraArgs)

      const proc = spawnFn('cursor-agent', args, {
        cwd: workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      })

      const processKey = capturedSessionId || `cursor_${Date.now()}`
      activeProcesses.set(processKey, proc)

      let lineBuffer = ''

      proc.stdout?.on('data', (data: Buffer) => {
        lineBuffer += data.toString()
        const lines = lineBuffer.split(/\r?\n/)
        lineBuffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line)

            // Capture session ID
            if (event.type === 'system' && event.subtype === 'init' && event.session_id) {
              if (!capturedSessionId) {
                capturedSessionId = event.session_id
                writer.sendSessionCreated(capturedSessionId)
              }
            }

            // Assistant message
            if (event.type === 'assistant' && event.message?.content) {
              const content = event.message.content
              if (Array.isArray(content)) {
                for (const block of content) {
                  if (block.type === 'text') writer.sendText(block.text)
                  else if (block.type === 'tool_use') writer.sendToolUse(block.name, block.input)
                }
              } else if (typeof content === 'string') {
                writer.sendText(content)
              }
            }

            // Result
            if (event.type === 'result') {
              const usage = event.usage || {}
              writer.sendResult(event.cost_usd, {
                input: usage.input_tokens || 0,
                output: usage.output_tokens || 0,
              })
            }
          } catch {
            // Non-JSON line — check for workspace trust prompt
            if (TRUST_PATTERNS.some(p => p.test(line))) {
              sawTrustPrompt = true
            }
          }
        }
      })

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString()
        if (TRUST_PATTERNS.some(p => p.test(text))) {
          sawTrustPrompt = true
        }
      })

      proc.on('close', (code) => {
        activeProcesses.delete(processKey)

        // Retry with --trust if workspace trust was requested
        if (sawTrustPrompt && code !== 0 && !hasRetried) {
          hasRetried = true
          runProcess(['--trust'], 'trust-retry').then(resolve).catch(reject)
          return
        }

        writer.sendComplete(code || 0)
        resolve()
      })

      proc.on('error', (err) => {
        activeProcesses.delete(processKey)
        writer.sendError(err.message)
        writer.sendComplete(1)
        reject(err)
      })

      proc.stdin?.end()
    })
  }

  try {
    await runProcess()
  } catch {
    // Error already sent via writer
  }
}

export function abortCursorSession(sessionId: string): boolean {
  const proc = activeProcesses.get(sessionId)
  if (proc) {
    proc.kill('SIGTERM')
    activeProcesses.delete(sessionId)
    return true
  }
  return false
}

export function isCursorSessionActive(sessionId: string): boolean {
  return activeProcesses.has(sessionId)
}
