/**
 * Main entry — starts Node.js server + optionally Electron window.
 *
 * Two modes:
 *   - Electron: `pnpm dev` / `pnpm build && electron .`
 *     → starts server + opens BrowserWindow
 *   - Browser-only: `node out/main/index.js --serve`
 *     → starts server only, open http://localhost:3001
 */

import { join } from 'path'
import { startPythonBackend, stopPythonBackend } from './python-backend'
import { createServer, destroyAllPtySessions, destroyAllWorkflows } from './server'

const SERVER_PORT = parseInt(process.env.SERVER_PORT || '3001', 10)
const isServeOnly = process.argv.includes('--serve')

async function main(): Promise<void> {
  // Start Python backend (openags serve)
  await startPythonBackend()

  // Start Node.js HTTP + WebSocket server
  const staticDir = join(__dirname, '../renderer')
  const { server } = createServer(staticDir)

  server.listen(SERVER_PORT, '127.0.0.1', () => {
    console.log(`[server] OpenAGS UI running at http://127.0.0.1:${SERVER_PORT}`)
  })

  if (isServeOnly) {
    // Browser-only mode — no Electron
    console.log('[server] Browser-only mode (no Electron window)')
    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
    return
  }

  // Electron mode — open window
  try {
    const electron = await import('electron')
    const { app, BrowserWindow, dialog, ipcMain, shell } = electron

    app.whenReady().then(async () => {
      app.setName('OpenAGS')

      // IPC: open folder dialog (Electron-only feature)
      ipcMain.handle('dialog:openDirectory', async () => {
        const result = await dialog.showOpenDialog({
          properties: ['openDirectory', 'createDirectory'],
          title: 'Select Project Workspace',
        })
        return result.canceled ? null : result.filePaths[0]
      })

      // Dev: F12 toggles DevTools
      app.on('browser-window-created', (_, window) => {
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
        if (url.startsWith('https://')) shell.openExternal(url)
        return { action: 'deny' }
      })

      // Load from the server URL (same as browser mode)
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

      app.on('activate', () => {
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

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit()
    })

    app.on('before-quit', shutdown)
  } catch {
    // Electron not available (running with plain Node.js)
    console.log('[server] Electron not available, running in browser-only mode')
    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  }
}

function shutdown(): void {
  destroyAllWorkflows()
  destroyAllPtySessions()
  stopPythonBackend()
  process.exit(0)
}

main().catch((err) => {
  console.error('[server] Fatal error:', err)
  process.exit(1)
})
