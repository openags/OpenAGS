/**
 * REST API client — wraps fetch for backend communication.
 */

// Use relative URLs — works for both Electron (via server proxy) and browser
export const BASE_URL = ''

const AUTH_TOKEN_KEY = 'openags-auth-token'
const AUTH_USER_KEY = 'openags-auth-user'

function getToken(): string | null {
  return typeof window !== 'undefined' ? window.localStorage.getItem(AUTH_TOKEN_KEY) : null
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${BASE_URL}${path}`
  const options: RequestInit = {
    method,
    headers: authHeaders(),
  }
  if (body !== undefined) {
    options.body = JSON.stringify(body)
  }

  const res = await fetch(url, options)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${method} ${path} failed (${res.status}): ${text}`)
  }
  return res.json() as Promise<T>
}

async function uploadFile(path: string, file: File): Promise<{ filename: string; path: string; size: number }> {
  const url = `${BASE_URL}${path}`
  const formData = new FormData()
  formData.append('file', file)

  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Upload failed (${res.status}): ${text}`)
  }
  return res.json()
}

async function streamRequest(
  path: string,
  body: unknown,
  onChunk: (chunk: string) => void,
): Promise<void> {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API POST ${path} failed (${res.status}): ${text}`)
  }

  if (!res.body) {
    throw new Error('Streaming response body is unavailable')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      onChunk(decoder.decode(value, { stream: true }))
    }
  }
}

// ── Auth helpers ─────────────────────────────────────

export interface AuthUser {
  id: string
  username: string
  display_name: string
}

function saveAuth(user: AuthUser, token: string): void {
  window.localStorage.setItem(AUTH_TOKEN_KEY, token)
  window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
}

function loadAuth(): { user: AuthUser; token: string } | null {
  const token = window.localStorage.getItem(AUTH_TOKEN_KEY)
  const raw = window.localStorage.getItem(AUTH_USER_KEY)
  if (!token || !raw) return null
  try {
    return { user: JSON.parse(raw), token }
  } catch {
    return null
  }
}

function clearAuth(): void {
  window.localStorage.removeItem(AUTH_TOKEN_KEY)
  window.localStorage.removeItem(AUTH_USER_KEY)
}

// ── Session types ─────────────────────────────────────

export interface ServerSession {
  id: string
  project_id: string
  agent_role: string
  title: string
  created_at: string
  messages: Array<{ role: string; content: string; timestamp: string }>
}

// ── Session API helpers ───────────────────────────────

async function createSession(
  projectId: string,
  section: string,
  agentRole: string,
  title: string,
): Promise<ServerSession> {
  return request<ServerSession>('POST', `/api/sessions/${projectId}/${section}`, {
    module: agentRole,
    title,
  })
}

async function listSessions(projectId: string, section: string): Promise<ServerSession[]> {
  return request<ServerSession[]>('GET', `/api/sessions/${projectId}/${section}`)
}

async function getSession(projectId: string, section: string, sessionId: string): Promise<ServerSession> {
  return request<ServerSession>('GET', `/api/sessions/${projectId}/${section}/${sessionId}`)
}

async function deleteSession(projectId: string, section: string, sessionId: string): Promise<void> {
  return request<void>('DELETE', `/api/sessions/${projectId}/${section}/${sessionId}`)
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  upload: uploadFile,
  streamPost: (path: string, body: unknown, onChunk: (chunk: string) => void) =>
    streamRequest(path, body, onChunk),
  auth: { saveAuth, loadAuth, clearAuth },
  sessions: {
    create: createSession,
    list: listSessions,
    get: getSession,
    delete: deleteSession,
  },
}
