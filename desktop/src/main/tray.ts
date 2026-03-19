/**
 * System tray — minimize to tray, quick actions.
 */

import { Tray, Menu, BrowserWindow, app, nativeImage } from 'electron'
import { join } from 'path'

let tray: Tray | null = null

export function setupTray(mainWindow: BrowserWindow): void {
  const iconPath = join(__dirname, '../../resources/icon.png')

  // Create a small transparent icon as fallback
  const icon = nativeImage.createEmpty()
  try {
    const loaded = nativeImage.createFromPath(iconPath)
    if (!loaded.isEmpty()) {
      tray = new Tray(loaded.resize({ width: 16, height: 16 }))
    } else {
      tray = new Tray(icon)
    }
  } catch {
    tray = new Tray(icon)
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show OpenAGS',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      },
    },
  ])

  tray.setToolTip('OpenAGS — Autonomous Research Scientist')
  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  // Mark quitting state
  app.on('before-quit', () => {
    ;(app as any).isQuitting = true
  })
}
