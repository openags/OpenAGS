/**
 * PTY Manager — manages pseudo-terminal sessions for CLI agents (Claude Code, Codex, etc.).
 *
 * Each PTY is keyed by `projectId:section` and persists until the app closes.
 * Switching sections hides the terminal but keeps the PTY alive.
 * Output is buffered so reconnecting terminals can replay history.
 */

import { ipcMain, BrowserWindow } from 'electron'
import * as os from 'os'
import * as path from 'path'

// node-pty is a native module — require at runtime to avoid bundling issues
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pty = require('node-pty')

/** Max bytes to keep in the output buffer per session (1 MB). */
const MAX_BUFFER_SIZE = 1024 * 1024

interface PtySession {
  pty: InstanceType<typeof pty.IPty>
  cwd: string
  command: string
  /** Circular buffer of all output for replay on reconnect. */
  outputBuffer: string
}

const sessions = new Map<string, PtySession>()

/** Encode a filesystem path to Claude Code's project directory name. */
function encodeProjectPath(p: string): string {
  return p.replace(/\//g, '-')
}

/** Get the default shell for the current platform. */
function getDefaultShell(): string {
  if (process.platform === 'win32') return 'powershell.exe'
  return process.env.SHELL || '/bin/zsh'
}

/**
 * Register all PTY-related IPC handlers.
 * Call this once from the main process during app startup.
 */
export function setupPtyHandlers(): void {
  // Create a new PTY session (or return existing one)
  ipcMain.handle('pty:create', (_event, opts: {
    id: string        // e.g. "ai-scholar:literature"
    cwd: string       // working directory for the CLI
    command?: string   // CLI command (default: "claude")
  }) => {
    const { id, cwd, command = 'claude' } = opts

    // If session already exists, just return its info (caller should use pty:replay to get buffer)
    if (sessions.has(id)) {
      return { id, existing: true, error: null }
    }

    // Ensure cwd exists (subfolder like literature/ may not be created yet)
    const fs = require('fs')
    try {
      fs.mkdirSync(cwd, { recursive: true })
    } catch {
      // ignore — will fail on spawn if truly invalid
    }

    const shell = getDefaultShell()
    // Ensure PATH includes common binary locations (Electron may not inherit full shell profile)
    const extraPaths = ['/usr/local/bin', '/opt/homebrew/bin', `${os.homedir()}/.npm-global/bin`].join(':')
    const env = {
      ...process.env,
      TERM: 'xterm-256color',
      PATH: `${process.env.PATH || ''}:${extraPaths}`,
    }

    try {
      // Spawn a login shell so it loads the user's profile (.zshrc, .bashrc)
      const ptyProcess = pty.spawn(shell, ['--login'], {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd,
        env,
      })

      const session: PtySession = { pty: ptyProcess, cwd, command, outputBuffer: '' }
      sessions.set(id, session)

      // Forward PTY output to renderer AND buffer it for replay
      ptyProcess.onData((data: string) => {
        // Append to buffer (trim if too large)
        session.outputBuffer += data
        if (session.outputBuffer.length > MAX_BUFFER_SIZE) {
          session.outputBuffer = session.outputBuffer.slice(-MAX_BUFFER_SIZE)
        }

        // Forward to all windows
        const windows = BrowserWindow.getAllWindows()
        for (const win of windows) {
          win.webContents.send('pty:data', id, data)
        }
      })

      ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
        sessions.delete(id)
        const windows = BrowserWindow.getAllWindows()
        for (const win of windows) {
          win.webContents.send('pty:exit', id, exitCode)
        }
      })

      // Send the CLI command after a short delay to let the shell initialize
      globalThis.setTimeout(() => {
        ptyProcess.write(`${command}\r`)
      }, 500)

      return { id, existing: false, error: null }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[pty-manager] Failed to create PTY for ${id}:`, message)
      return { id, existing: false, error: message }
    }
  })

  // Replay buffered output (used when reconnecting to an existing session)
  ipcMain.handle('pty:replay', (_event, id: string) => {
    const session = sessions.get(id)
    if (session) {
      return session.outputBuffer
    }
    return ''
  })

  // Write data to a PTY (user keyboard input)
  ipcMain.on('pty:write', (_event, id: string, data: string) => {
    const session = sessions.get(id)
    if (session) {
      session.pty.write(data)
    }
  })

  // Resize a PTY
  ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => {
    const session = sessions.get(id)
    if (session) {
      session.pty.resize(cols, rows)
    }
  })

  // Destroy a specific PTY session
  ipcMain.handle('pty:destroy', (_event, id: string) => {
    const session = sessions.get(id)
    if (session) {
      session.pty.kill()
      sessions.delete(id)
      return true
    }
    return false
  })

  // Check if a PTY session exists
  ipcMain.handle('pty:exists', (_event, id: string) => {
    return sessions.has(id)
  })

  // Read Claude Code conversation history from JSONL
  ipcMain.handle('claude:read-history', (_event, cwd: string) => {
    return readClaudeHistory(cwd)
  })
}

/** Destroy all PTY sessions (called on app quit). */
export function destroyAllPtySessions(): void {
  for (const [id, session] of sessions) {
    try {
      session.pty.kill()
    } catch {
      // ignore — process may already be dead
    }
    sessions.delete(id)
  }
}

/**
 * Read the most recent Claude Code conversation from ~/.claude/projects/.
 * Returns parsed user/assistant message pairs for chat bubble display.
 */
function readClaudeHistory(cwd: string): Array<{ role: string; content: string; timestamp: string }> {
  const fs = require('fs')
  const homedir = os.homedir()
  const encodedPath = encodeProjectPath(cwd)
  const projectDir = path.join(homedir, '.claude', 'projects', encodedPath)

  if (!fs.existsSync(projectDir)) return []

  // Find the most recently modified .jsonl file
  const files: string[] = fs.readdirSync(projectDir)
    .filter((f: string) => f.endsWith('.jsonl'))

  if (files.length === 0) return []

  // Sort by modification time, newest first
  const sorted = files
    .map((f: string) => ({
      name: f,
      mtime: fs.statSync(path.join(projectDir, f)).mtimeMs,
    }))
    .sort((a: { mtime: number }, b: { mtime: number }) => b.mtime - a.mtime)

  const latestFile = path.join(projectDir, sorted[0].name)
  const content = fs.readFileSync(latestFile, 'utf-8')
  const lines = content.trim().split('\n')

  const messages: Array<{ role: string; content: string; timestamp: string }> = []

  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const entry = JSON.parse(line)

      // User text message
      if (entry.type === 'user' && entry.message?.role === 'user') {
        const content = entry.message.content
        if (typeof content === 'string') {
          messages.push({ role: 'user', content, timestamp: entry.timestamp || '' })
        } else if (Array.isArray(content)) {
          // Could be tool_result or text blocks — skip tool_results
          const textParts = content
            .filter((c: { type: string }) => c.type === 'text')
            .map((c: { text: string }) => c.text)
          if (textParts.length > 0) {
            messages.push({ role: 'user', content: textParts.join('\n'), timestamp: entry.timestamp || '' })
          }
        }
      }

      // Assistant message
      if (entry.type === 'assistant' && entry.message?.role === 'assistant') {
        const content = entry.message.content
        if (typeof content === 'string') {
          messages.push({ role: 'assistant', content, timestamp: entry.timestamp || '' })
        } else if (Array.isArray(content)) {
          const textParts = content
            .filter((c: { type: string }) => c.type === 'text')
            .map((c: { text: string }) => c.text)
          if (textParts.length > 0) {
            messages.push({ role: 'assistant', content: textParts.join('\n'), timestamp: entry.timestamp || '' })
          }
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  return messages
}
