/**
 * WebSocket client — real-time event streaming from backend.
 */

type EventHandler = (data: unknown) => void

// Derive WebSocket URL from current page location (works in Electron and browser)
function getWsBaseUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}`
}

const WS_URL = typeof window !== 'undefined' ? getWsBaseUrl() : 'ws://127.0.0.1:3001'

export class WSClient {
  private ws: WebSocket | null = null
  private handlers: Map<string, EventHandler[]> = new Map()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private projectId: string

  constructor(projectId: string) {
    this.projectId = projectId
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return

    const url = `${WS_URL}/ws/${this.projectId}`
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      console.log(`[ws] Connected to ${this.projectId}`)
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { event: string; data: unknown }
        const handlers = this.handlers.get(msg.event) || []
        handlers.forEach((h) => h(msg.data))

        // Also fire wildcard handlers
        const wildcardHandlers = this.handlers.get('*') || []
        wildcardHandlers.forEach((h) => h(msg))
      } catch {
        console.warn('[ws] Invalid message:', event.data)
      }
    }

    this.ws.onclose = () => {
      console.log('[ws] Disconnected, reconnecting in 3s...')
      this.reconnectTimer = setTimeout(() => this.connect(), 3000)
    }

    this.ws.onerror = (err) => {
      console.error('[ws] Error:', err)
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, [])
    }
    this.handlers.get(event)!.push(handler)

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(event) || []
      const idx = handlers.indexOf(handler)
      if (idx >= 0) handlers.splice(idx, 1)
    }
  }

  send(action: string, data?: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action, ...((data as object) || {}) }))
    }
  }
}
