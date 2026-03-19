/**
 * Gemini CLI provider — subprocess with --output-format stream-json.
 *
 * Reference: claudecodeui/server/gemini-cli.js
 *
 * Key features:
 * - Spawns `gemini` CLI as child process
 * - NDJSON parsing of stream-json output
 * - Session resume via --resume (with CLI session ID mapping)
 * - MCP config from ~/.gemini.json
 * - Approval mode: --yolo / --approval-mode auto_edit
 * - Image handling: base64 → temp files → prompt paths
 * - 120s watchdog timeout (reset on output)
 * - Unix shell wrapper: sh -c 'exec "$0" "$@"'
 */

import { spawn, ChildProcess } from 'child_process'
import crossSpawn from 'cross-spawn'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { WsWriter } from './types'

const spawnFn = os.platform() === 'win32' ? crossSpawn : spawn
const activeProcesses = new Map<string, ChildProcess>()

// Session ID mapping: internal ID → Gemini CLI native session ID
const sessionIdMap = new Map<string, string>()

const TIMEOUT_MS = 120_000

export async function spawnGemini(
  command: string,
  options: {
    sessionId?: string
    cwd?: string
    model?: string
    permissionMode?: string
    images?: Array<{ data: string }>
  },
  writer: WsWriter,
): Promise<void> {
  const workingDir = options.cwd || process.cwd()
  let capturedSessionId = options.sessionId || null
  const tempImagePaths: string[] = []
  let tempDir: string | null = null

  // Handle images: base64 → temp files
  if (options.images && options.images.length > 0) {
    try {
      tempDir = path.join(workingDir, '.tmp', 'images', Date.now().toString())
      fs.mkdirSync(tempDir, { recursive: true })

      for (const [index, image] of options.images.entries()) {
        const matches = image.data.match(/^data:([^;]+);base64,(.+)$/)
        if (!matches) continue
        const [, mimeType, base64Data] = matches
        const ext = mimeType.split('/')[1] || 'png'
        const filepath = path.join(tempDir, `image_${index}.${ext}`)
        fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'))
        tempImagePaths.push(filepath)
      }
    } catch (err) {
      console.error('[gemini] Error processing images:', err)
    }
  }

  // Build CLI args
  const args: string[] = []

  let fullCommand = command
  if (tempImagePaths.length > 0) {
    fullCommand += `\n\n[Images: ${tempImagePaths.length} files]\n${tempImagePaths.join('\n')}`
  }

  if (fullCommand.trim()) {
    args.push('--prompt', fullCommand)
  }

  // Session resume (map internal ID → CLI native ID)
  if (options.sessionId) {
    const cliId = sessionIdMap.get(options.sessionId)
    if (cliId) {
      args.push('--resume', cliId)
    }
  }

  // MCP config
  try {
    const geminiConfigPath = path.join(os.homedir(), '.gemini.json')
    if (fs.existsSync(geminiConfigPath)) {
      const config = JSON.parse(fs.readFileSync(geminiConfigPath, 'utf-8'))
      if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
        args.push('--mcp-config', geminiConfigPath)
      }
    }
  } catch { /* ignore */ }

  // Model
  args.push('--model', options.model || 'gemini-2.5-flash')
  args.push('--output-format', 'stream-json')

  // Approval mode
  if (options.permissionMode === 'bypassPermissions' || options.permissionMode === 'yolo') {
    args.push('--yolo')
  } else if (options.permissionMode === 'auto_edit') {
    args.push('--approval-mode', 'auto_edit')
  }

  // Unix shell wrapper (avoids ENOEXEC for scripts without shebang)
  const geminiPath = process.env.GEMINI_PATH || 'gemini'
  let spawnCmd: string
  let spawnArgs: string[]

  if (os.platform() !== 'win32') {
    spawnCmd = 'sh'
    spawnArgs = ['-c', 'exec "$0" "$@"', geminiPath, ...args]
  } else {
    spawnCmd = geminiPath
    spawnArgs = args
  }

  return new Promise((resolve, reject) => {
    const proc = spawnFn(spawnCmd, spawnArgs, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    const processKey = capturedSessionId || `gemini_${Date.now()}`
    activeProcesses.set(processKey, proc)

    // Watchdog timeout (reset on each output)
    let hasOutput = false
    let timeout: ReturnType<typeof setTimeout>
    const resetTimeout = () => {
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => {
        writer.sendError(`Gemini CLI timeout — no response for ${TIMEOUT_MS / 1000}s`)
        try { proc.kill('SIGTERM') } catch { /* ignore */ }
      }, TIMEOUT_MS)
    }
    resetTimeout()

    // Create session ID for new sessions on first output
    proc.stdout?.on('data', (data: Buffer) => {
      hasOutput = true
      resetTimeout()

      const raw = data.toString()

      // Generate session ID on first output for new sessions
      if (!capturedSessionId) {
        capturedSessionId = `gemini_${Date.now()}`
        writer.sendSessionCreated(capturedSessionId)
        activeProcesses.delete(processKey)
        activeProcesses.set(capturedSessionId, proc)
      }

      // Parse NDJSON lines
      for (const line of raw.split(/\r?\n/)) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)

          // Capture native CLI session ID for resume
          if (event.type === 'init' && event.session_id && capturedSessionId) {
            sessionIdMap.set(capturedSessionId, event.session_id)
          }

          // Text content
          if (event.type === 'text_delta' || event.type === 'content') {
            writer.sendText(event.text || event.content || '')
          }

          // Assistant message with content blocks
          if (event.type === 'assistant' && event.message?.content) {
            const content = event.message.content
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text') writer.sendText(block.text)
                else if (block.type === 'tool_use') writer.sendToolUse(block.name, block.input)
              }
            }
          }

          // Tool result
          if (event.type === 'tool_result') {
            writer.sendToolResult(event.tool_id || '', event.output || '', event.status === 'error')
          }

          // Result
          if (event.type === 'result') {
            writer.sendResult(event.cost_usd, {
              input: event.input_tokens || 0,
              output: event.output_tokens || 0,
            })
          }
        } catch {
          // Non-JSON output — send as raw text
          if (line.trim()) writer.sendText(line)
        }
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString()
      // Filter deprecation warnings
      if (text.includes('[DEP0040]') || text.includes('DeprecationWarning') || text.includes('Loaded cached credentials')) {
        return
      }
      writer.sendError(text)
    })

    proc.on('close', (code) => {
      clearTimeout(timeout)
      const finalId = capturedSessionId || processKey
      activeProcesses.delete(finalId)

      // Cleanup temp images
      for (const p of tempImagePaths) {
        try { fs.unlinkSync(p) } catch { /* ignore */ }
      }
      if (tempDir) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch { /* ignore */ }
      }

      writer.sendComplete(code || 0)
      resolve()
    })

    proc.on('error', (err) => {
      clearTimeout(timeout)
      activeProcesses.delete(capturedSessionId || processKey)
      writer.sendError(err.message)
      writer.sendComplete(1)
      reject(err)
    })

    proc.stdin?.end()
  })
}

export function abortGeminiSession(sessionId: string): boolean {
  const proc = activeProcesses.get(sessionId)
  if (proc) {
    proc.kill('SIGTERM')
    setTimeout(() => {
      if (activeProcesses.has(sessionId)) {
        try { proc.kill('SIGKILL') } catch { /* ignore */ }
      }
    }, 2000)
    activeProcesses.delete(sessionId)
    return true
  }
  return false
}

export function isGeminiSessionActive(sessionId: string): boolean {
  return activeProcesses.has(sessionId)
}
