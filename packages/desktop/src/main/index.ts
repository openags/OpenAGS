/**
 * Main entry — starts @openags/app server + desktop WebSocket handlers + Electron window.
 *
 * Two modes:
 *   - Electron: `pnpm dev` / `pnpm build && electron .`
 *     → starts server + opens BrowserWindow
 *   - Browser-only: `node out/main/index.js --serve`
 *     → starts server only, open http://localhost:19836
 */

import { join } from 'path'
import { execSync } from 'child_process'
import http from 'http'
import { attachDesktopWebSockets } from './server'

const SERVER_PORT = parseInt(process.env.SERVER_PORT || '19836', 10)
const isServeOnly = process.argv.includes('--serve')

let _destroyPty: (() => void) | null = null
let _destroyWorkflows: (() => void) | null = null

/**
 * Force-kill whatever is on the port using OS commands.
 */
function forceKillPort(port: number): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (process.platform === 'win32') {
        execSync(`for /f "tokens=5" %a in ('netstat -aon ^| findstr :${port}') do taskkill /F /PID %a`, { stdio: 'ignore' })
      } else {
        execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null`, { stdio: 'ignore' })
      }
    } catch { /* nothing to kill */ }
    // Wait for OS to release the port
    setTimeout(resolve, 1500)
  })
}

/**
 * Try to listen on port. If EADDRINUSE, kill the old process and retry once.
 */
function listenWithRetry(server: http.Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = async (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[server] Port ${port} in use. Killing old process...`)
        server.removeListener('error', onError)
        await forceKillPort(port)
        // Retry once
        server.listen(port, host, () => {
          console.log(`[server] OpenAGS UI running at http://${host}:${port}`)
          resolve()
        })
        server.once('error', (retryErr) => {
          reject(new Error(`Port ${port} still in use after kill: ${retryErr.message}`))
        })
      } else {
        reject(err)
      }
    }
    server.once('error', onError)
    server.listen(port, host, () => {
      console.log(`[server] OpenAGS UI running at http://${host}:${port}`)
      resolve()
    })
  })
}

async function main(): Promise<void> {
  // Dynamic import — @openags/app is ESM
  const appModule = await import('@openags/app')
  const { createServer, destroyAllPtySessions, destroyAllWorkflows } = appModule

  _destroyPty = destroyAllPtySessions
  _destroyWorkflows = destroyAllWorkflows

  const staticDir = join(__dirname, '../renderer')
  const { server } = createServer({ staticDir, port: SERVER_PORT, skipWebSockets: true })

  attachDesktopWebSockets(server)

  await listenWithRetry(server, SERVER_PORT, '127.0.0.1')

  if (isServeOnly) {
    console.log('[server] Browser-only mode (no Electron window)')
    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
    return
  }

  // Electron mode
  try {
    const electron = await import('electron')
    const { app: electronApp, BrowserWindow, dialog, ipcMain, shell } = electron

    electronApp.whenReady().then(async () => {
      electronApp.setName('OpenAGS')

      ipcMain.handle('dialog:openDirectory', async () => {
        const result = await dialog.showOpenDialog({
          properties: ['openDirectory', 'createDirectory'],
          title: 'Select Project Workspace',
        })
        return result.canceled ? null : result.filePaths[0]
      })

      electronApp.on('browser-window-created', (_, window) => {
        window.webContents.on('before-input-event', (event, input) => {
          if (input.key === 'F12') {
            window.webContents.toggleDevTools()
            event.preventDefault()
          }
        })
      })

      const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 960,
        minHeight: 600,
        title: 'OpenAGS',
        show: false,
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          sandbox: false,
          contextIsolation: true,
          nodeIntegration: false,
        },
      })

      mainWindow.on('ready-to-show', () => mainWindow.show())

      mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://') || url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
          shell.openExternal(url)
        }
        return { action: 'deny' }
      })

      const devUrl = process.env['ELECTRON_RENDERER_URL']
      if (devUrl) {
        mainWindow.loadURL(devUrl)
      } else {
        mainWindow.loadURL(`http://127.0.0.1:${SERVER_PORT}`)
      }

      const { setupTray } = await import('./tray')
      const { setupUpdater } = await import('./updater')
      setupTray(mainWindow)
      setupUpdater()

      electronApp.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          const win = new BrowserWindow({
            width: 1280, height: 800,
            title: 'OpenAGS',
            webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true },
          })
          win.loadURL(`http://127.0.0.1:${SERVER_PORT}`)
        }
      })
    })

    electronApp.on('window-all-closed', () => {
      if (process.platform !== 'darwin') electronApp.quit()
    })

    electronApp.on('before-quit', shutdown)
  } catch {
    console.log('[server] Electron not available, running in browser-only mode')
    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  }
}

function shutdown(): void {
  if (_destroyWorkflows) _destroyWorkflows()
  if (_destroyPty) _destroyPty()
  process.exit(0)
}

main().catch((err) => {
  console.error('[server] Fatal error:', err)
  process.exit(1)
})
