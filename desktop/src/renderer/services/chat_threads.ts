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
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as ThreadStore
  } catch {
    return {}
  }
}

export function saveThreadStore(store: ThreadStore): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  window.dispatchEvent(new Event('openags-threads-updated'))
}
