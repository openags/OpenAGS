/**
 * Preload script — minimal, Electron-only features.
 *
 * PTY and chat are handled via WebSocket (works in both Electron and browser).
 * This preload only provides native desktop features (file dialogs, app info).
 */

import { contextBridge, ipcRenderer } from 'electron'

const api = {
  /** Flag: running inside Electron */
  isElectron: true,

  /** Open native folder picker dialog (Electron-only) */
  selectDirectory: (): Promise<string | null> => {
    return ipcRenderer.invoke('dialog:openDirectory')
  },

  /** App version */
  getVersion: (): string => {
    return process.env.npm_package_version || '0.1.0'
  },

  /** Platform info */
  platform: process.platform,
}

contextBridge.exposeInMainWorld('openags', api)

export type OpenAGSAPI = typeof api
