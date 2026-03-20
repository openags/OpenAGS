export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatThread {
  id: string
  title: string
  messages: ChatMessage[]
  /** Server-side session ID for builtin backend persistence. */
  sessionId?: string
  /** CLI provider session ID (Claude Code / Codex / Gemini / Cursor) for resume. */
  providerSessionId?: string
}

export type ThreadStore = Record<string, ChatThread[]>

const STORAGE_KEY = 'openags-chat-threads-v1'
const CHUNK_PREFIX = 'openags-chat-chunk-'
const MAX_SINGLE_SIZE = 2 * 1024 * 1024 // 2MB — split above this

export function getChatKey(projectId: string, section: string): string {
  return `${projectId}:${section}`
}

export function makeThreadId(): string {
  return `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function makeThreadTitle(index: number): string {
  return `New Chat ${index}`
}

export function loadThreadStore(): ThreadStore {
  if (typeof window === 'undefined') return {}

  // Try single-key storage first
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return parsed as ThreadStore
    } catch { /* fall through */ }
  }

  // Try chunked storage
  try {
    const indexRaw = window.localStorage.getItem(`${STORAGE_KEY}-index`)
    if (!indexRaw) return {}
    const index = JSON.parse(indexRaw) as string[]
    const merged: ThreadStore = {}
    for (const chunkKey of index) {
      const chunk = window.localStorage.getItem(chunkKey)
      if (chunk) {
        Object.assign(merged, JSON.parse(chunk))
      }
    }
    return merged
  } catch {
    return {}
  }
}

export function saveThreadStore(store: ThreadStore): void {
  if (typeof window === 'undefined') return

  const json = JSON.stringify(store)

  // If small enough, store as single key
  if (json.length < MAX_SINGLE_SIZE) {
    window.localStorage.setItem(STORAGE_KEY, json)
    // Clean up any old chunks
    window.localStorage.removeItem(`${STORAGE_KEY}-index`)
    return
  }

  // Split into chunks by top-level key (project:section)
  const keys = Object.keys(store)
  const chunks: Record<string, ThreadStore> = {}
  let chunkIdx = 0
  let currentChunk: ThreadStore = {}
  let currentSize = 0

  for (const key of keys) {
    const entry = JSON.stringify({ [key]: store[key] })
    if (currentSize + entry.length > MAX_SINGLE_SIZE && currentSize > 0) {
      chunks[`${CHUNK_PREFIX}${chunkIdx}`] = currentChunk
      chunkIdx++
      currentChunk = {}
      currentSize = 0
    }
    currentChunk[key] = store[key]
    currentSize += entry.length
  }
  if (Object.keys(currentChunk).length > 0) {
    chunks[`${CHUNK_PREFIX}${chunkIdx}`] = currentChunk
  }

  // Write chunks
  const chunkKeys = Object.keys(chunks)
  for (const [chunkKey, chunkData] of Object.entries(chunks)) {
    window.localStorage.setItem(chunkKey, JSON.stringify(chunkData))
  }
  window.localStorage.setItem(`${STORAGE_KEY}-index`, JSON.stringify(chunkKeys))
  window.localStorage.removeItem(STORAGE_KEY) // remove single-key version

  window.dispatchEvent(new Event('openags-threads-updated'))
}
