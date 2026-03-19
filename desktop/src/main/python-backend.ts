/**
 * Python backend process management.
 *
 * Spawns `openags serve` as a child process and monitors health.
 * The Python backend runs the FastAPI server on localhost:19836.
 */

import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'

let pythonProcess: ChildProcess | null = null

const BACKEND_PORT = 19836
const BACKEND_HOST = '127.0.0.1'
const HEALTH_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}/api/health`
const HEALTH_CHECK_INTERVAL = 5000
const STARTUP_TIMEOUT = 30000

let healthTimer: ReturnType<typeof setInterval> | null = null

/**
 * Find the openags executable.
 * In dev: uses the system PATH (assumes `uv run openags` or `openags` is available).
 * In production: looks for bundled Python in app resources.
 */
function getOpenAGSCommand(): { cmd: string; args: string[] } {
  // Check if running inside Electron
  let isPackaged = false
  try {
    const { app } = require('electron')
    isPackaged = app.isPackaged
  } catch {
    // Not in Electron (plain Node.js) — use dev mode
  }

  if (isPackaged) {
    // Production: bundled Python executable
    const resourcePath = process.resourcesPath
    const pyExe = join(resourcePath, 'python-backend', 'openags')
    return { cmd: pyExe, args: ['serve', '--port', String(BACKEND_PORT)] }
  }
  // Development: try venv python first, then fall back to uv
  const projectRoot = join(__dirname, '../../..')
  const venvPython = process.platform === 'win32'
    ? join(projectRoot, '.venv', 'Scripts', 'python.exe')
    : join(projectRoot, '.venv', 'bin', 'python')
  try {
    require('fs').accessSync(venvPython)
    return { cmd: venvPython, args: ['-m', 'openags', 'serve', '--port', String(BACKEND_PORT)] }
  } catch {
    return { cmd: 'uv', args: ['run', 'openags', 'serve', '--port', String(BACKEND_PORT)] }
  }
}

export async function startPythonBackend(): Promise<void> {
  if (pythonProcess) {
    console.log('[backend] Already running')
    return
  }

  const { cmd, args } = getOpenAGSCommand()
  console.log(`[backend] Starting: ${cmd} ${args.join(' ')}`)

  pythonProcess = spawn(cmd, args, {
    cwd: join(__dirname, '../../..'),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      OPENAGS_PORT: String(BACKEND_PORT),
      OPENAGS_HOST: BACKEND_HOST,
    },
  })

  pythonProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[backend:stdout] ${data.toString().trim()}`)
  })

  pythonProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[backend:stderr] ${data.toString().trim()}`)
  })

  pythonProcess.on('exit', (code, signal) => {
    console.log(`[backend] Exited: code=${code}, signal=${signal}`)
    pythonProcess = null
    stopHealthCheck()
  })

  // Wait for backend to become healthy
  await waitForHealth()
  startHealthCheck()
}

export function stopPythonBackend(): void {
  stopHealthCheck()
  if (pythonProcess) {
    console.log('[backend] Stopping...')
    pythonProcess.kill('SIGTERM')
    // Force kill after 5 seconds
    setTimeout(() => {
      if (pythonProcess) {
        pythonProcess.kill('SIGKILL')
        pythonProcess = null
      }
    }, 5000)
  }
}

async function waitForHealth(): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < STARTUP_TIMEOUT) {
    try {
      const res = await fetch(HEALTH_URL)
      if (res.ok) {
        console.log('[backend] Healthy!')
        return
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  console.warn('[backend] Startup timeout — proceeding anyway')
}

function startHealthCheck(): void {
  healthTimer = setInterval(async () => {
    try {
      const res = await fetch(HEALTH_URL)
      if (!res.ok) {
        console.warn('[backend] Health check failed, status:', res.status)
      }
    } catch {
      console.warn('[backend] Health check failed — backend may have crashed')
    }
  }, HEALTH_CHECK_INTERVAL)
}

function stopHealthCheck(): void {
  if (healthTimer) {
    clearInterval(healthTimer)
    healthTimer = null
  }
}

export function getBackendUrl(): string {
  return `http://${BACKEND_HOST}:${BACKEND_PORT}`
}

export function getBackendWsUrl(): string {
  return `ws://${BACKEND_HOST}:${BACKEND_PORT}`
}

export function isBackendRunning(): boolean {
  return pythonProcess !== null
}
