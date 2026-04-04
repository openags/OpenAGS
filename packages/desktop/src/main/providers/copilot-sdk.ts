/**
 * GitHub Copilot provider — runs @github/copilot-sdk in a child Node.js process.
 *
 * The SDK requires node:sqlite which isn't available in Electron's Node.js.
 * We spawn a regular Node.js process that runs the SDK and communicates via stdout NDJSON.
 */

import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { WsWriter } from './types'

const activeSessions = new Map<string, { proc: ReturnType<typeof spawn> }>()

/**
 * Create the helper script that runs the Copilot SDK in a standalone Node.js process.
 */
function getHelperScript(): string {
  return `
const { CopilotClient, approveAll } = require('@github/copilot-sdk');

const prompt = process.argv[2];
const cwd = process.argv[3] || process.cwd();
const model = process.argv[4] || undefined;
const sessionId = process.argv[5] || undefined;

function emit(obj) { process.stdout.write(JSON.stringify(obj) + '\\n'); }

(async () => {
  try {
    const client = new CopilotClient({ autoStart: true });

    const config = {
      streaming: true,
      onPermissionRequest: approveAll,
      ...(model ? { model } : {}),
      ...(cwd ? { workingDirectory: cwd } : {}),
    };

    let session;
    if (sessionId) {
      try { session = await client.resumeSession(sessionId, config); }
      catch { session = await client.createSession(config); }
    } else {
      session = await client.createSession(config);
    }

    emit({ type: 'session-created', sessionId: session.id || 'copilot_' + Date.now() });

    session.on('assistant.message_delta', (event) => {
      const text = event.data?.deltaContent || '';
      if (text) emit({ type: 'text', content: text });
    });

    session.on('tool.call_started', (event) => {
      emit({ type: 'tool_use', name: event.data?.name || 'tool', input: event.data?.input || {} });
    });

    session.on('tool.call_completed', (event) => {
      emit({ type: 'tool_result', toolId: event.data?.id || '', output: event.data?.output || '', isError: false });
    });

    session.on('tool.call_failed', (event) => {
      emit({ type: 'tool_result', toolId: event.data?.id || '', output: event.data?.error || 'Failed', isError: true });
    });

    const response = await session.sendAndWait({ prompt });

    const usage = response?.data?.usage || {};
    emit({ type: 'result', input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0 });
    emit({ type: 'complete', code: 0 });

    await session.disconnect();
    process.exit(0);
  } catch (err) {
    emit({ type: 'error', message: err.message || String(err) });
    emit({ type: 'complete', code: 1 });
    process.exit(1);
  }
})();
`
}

export async function queryCopilot(
  command: string,
  options: {
    sessionId?: string
    cwd?: string
    model?: string
    permissionMode?: string
  },
  writer: WsWriter,
): Promise<void> {
  // Write helper script to temp file
  const tmpScript = path.join(require('os').tmpdir(), 'openags-copilot-helper.js')
  fs.writeFileSync(tmpScript, getHelperScript(), 'utf-8')

  const args = [
    tmpScript,
    command,
    options.cwd || process.cwd(),
    options.model || '',
    options.sessionId || '',
  ]

  return new Promise((resolve) => {
    // Use system Node.js (not Electron's) — Electron's Node lacks node:sqlite
    const nodePath = process.env.NODE_PATH_OVERRIDE || 'node'

    // Resolve the monorepo root node_modules for pnpm hoisting
    let modulesPath = path.join(__dirname, '..', '..', 'node_modules')
    // Walk up to find the root node_modules with @github/copilot-sdk
    let searchDir = __dirname
    for (let i = 0; i < 10; i++) {
      const candidate = path.join(searchDir, 'node_modules', '@github', 'copilot-sdk')
      if (fs.existsSync(candidate)) {
        modulesPath = path.join(searchDir, 'node_modules')
        break
      }
      const parent = path.dirname(searchDir)
      if (parent === searchDir) break
      searchDir = parent
    }

    const proc = spawn(nodePath, args, {
      cwd: options.cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    let sessionId = options.sessionId || null
    const processKey = sessionId || `copilot_${Date.now()}`
    activeSessions.set(processKey, { proc })

    let lineBuffer = ''

    proc.stdout?.on('data', (data: Buffer) => {
      lineBuffer += data.toString()
      const lines = lineBuffer.split('\n')
      lineBuffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)

          if (msg.type === 'session-created') {
            sessionId = msg.sessionId
            writer.sendSessionCreated(msg.sessionId)
            activeSessions.delete(processKey)
            activeSessions.set(msg.sessionId, { proc })
          } else if (msg.type === 'text') {
            writer.sendText(msg.content || '')
          } else if (msg.type === 'tool_use') {
            writer.sendToolUse(msg.name || 'tool', msg.input || {})
          } else if (msg.type === 'tool_result') {
            writer.sendToolResult(msg.toolId || '', msg.output || '', msg.isError || false)
          } else if (msg.type === 'result') {
            writer.sendResult(undefined, {
              input: msg.input_tokens || 0,
              output: msg.output_tokens || 0,
            })
          } else if (msg.type === 'error') {
            writer.sendError(msg.message || 'Unknown error')
          }
        } catch {
          // Non-JSON output
          if (line.trim()) writer.sendText(line)
        }
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString()
      if (text.includes('ExperimentalWarning') || text.includes('DeprecationWarning')) return
      writer.sendError(text.trim())
    })

    proc.on('close', (code) => {
      activeSessions.delete(sessionId || processKey)
      writer.sendComplete(code || 0)
      resolve()
    })

    proc.on('error', (err) => {
      activeSessions.delete(sessionId || processKey)
      writer.sendError(err.message)
      writer.sendComplete(1)
      resolve()
    })

    proc.stdin?.end()
  })
}

export function abortCopilotSession(sessionId: string): boolean {
  const entry = activeSessions.get(sessionId)
  if (entry) {
    try { entry.proc.kill('SIGTERM') } catch { /* ignore */ }
    activeSessions.delete(sessionId)
    return true
  }
  return false
}

export function isCopilotSessionActive(sessionId: string): boolean {
  return activeSessions.has(sessionId)
}
