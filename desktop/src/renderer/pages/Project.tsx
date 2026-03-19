import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Spin, Typography } from 'antd'
import {
  BookOpen,
  Bot,
  ChevronDown,
  ChevronUp,
  Construction,
  FileText,
  FlaskConical,
  Library,
  Lightbulb,
  MessageSquare,
  Paperclip,
  SearchCheck,
  Send,
  SendHorizonal,
  Settings,
  Square,
  Terminal,
  X,
} from 'lucide-react'
import { api } from '../services/api'
import ManuscriptEditor from '../components/ManuscriptEditor'
import ProjectConfig from '../components/ProjectConfig'
import AgentConfigPanel from '../components/AgentConfigPanel'
import TerminalPanel from '../components/TerminalPanel'
import {
  ChatMessage,
  ChatThread,
  getChatKey,
  loadThreadStore,
  makeThreadId,
  makeThreadTitle,
  saveThreadStore,
} from '../services/chat_threads'

/** CLI backend types that should show an embedded terminal */
const CLI_BACKENDS = ['claude_code', 'codex', 'copilot', 'gemini_cli']

/** Map backend type to CLI command */
const CLI_COMMANDS: Record<string, string> = {
  claude_code: 'claude',
  codex: 'codex',
  copilot: 'gh copilot',
  gemini_cli: 'gemini',
}

/** Section → subfolder mapping (root for sessions) */
const SECTION_FOLDERS: Record<string, string> = {
  sessions: '',
  literature: 'literature',
  proposal: 'proposal',
  experiments: 'experiments',
  manuscript: 'manuscript',
  review: 'review',
}

/** Markdown renderer: headers, bold, inline code, code blocks, tables, lists, tool status. */
function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let codeBlock = ''
  let inCode = false
  let tableRows: string[][] = []
  let inTable = false

  const flushTable = (li: number) => {
    if (tableRows.length === 0) return
    // Filter out separator rows (|---|---|)
    const dataRows = tableRows.filter(r => !r.every(c => /^[-:]+$/.test(c.trim())))
    const isHeader = tableRows.length > 1 && tableRows[1]?.every(c => /^[-:]+$/.test(c.trim()))
    elements.push(
      <div key={`table-${li}`} style={{ overflowX: 'auto', margin: '8px 0' }}>
        <table style={{
          borderCollapse: 'collapse', fontSize: 13, width: '100%',
          border: '1px solid var(--border)', borderRadius: 6,
        }}>
          {isHeader && dataRows.length > 0 && (
            <thead>
              <tr>
                {dataRows[0].map((cell, ci) => (
                  <th key={ci} style={{
                    padding: '6px 10px', textAlign: 'left', fontWeight: 600,
                    background: 'var(--bg-sidebar)', borderBottom: '2px solid var(--border)',
                    fontSize: 12,
                  }}>
                    {renderInline(cell.trim())}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {dataRows.slice(isHeader ? 1 : 0).map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 ? 'var(--bg-sidebar)' : '#fff' }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{
                    padding: '5px 10px', borderBottom: '1px solid var(--border)', fontSize: 13,
                  }}>
                    {renderInline(cell.trim())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    tableRows = []
    inTable = false
  }

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]

    // Code block toggle
    if (line.startsWith('```')) {
      if (inTable) flushTable(li)
      if (inCode) {
        elements.push(
          <pre key={`code-${li}`} style={{
            background: '#f5f6f8', borderRadius: 8, padding: '10px 14px', fontSize: 13,
            overflow: 'auto', margin: '8px 0', fontFamily: "'SF Mono', 'Fira Code', monospace",
            border: '1px solid var(--border)',
          }}>
            <code>{codeBlock}</code>
          </pre>
        )
        codeBlock = ''
        inCode = false
      } else {
        inCode = true
        codeBlock = ''
      }
      continue
    }

    if (inCode) {
      codeBlock += (codeBlock ? '\n' : '') + line
      continue
    }

    // Table row: | cell | cell |
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      inTable = true
      const cells = line.trim().slice(1, -1).split('|')
      tableRows.push(cells)
      continue
    } else if (inTable) {
      flushTable(li)
    }

    // Tool status line: "> Tool: Read: /path/to/file... done"
    if (line.startsWith('> ')) {
      const content = line.slice(2)
      const isDone = content.endsWith(' done') || content.includes(' done:')
      const isFailed = content.includes(' failed')
      const isThinking = content === 'Thinking...'
      elements.push(
        <div key={`status-${li}`} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '2px 10px',
          margin: '2px 0', fontSize: 12, borderRadius: 4,
          color: isFailed ? '#ef4444' : isDone ? '#16a34a' : isThinking ? '#8b5cf6' : '#4f46e5',
          background: isFailed ? '#fef2f2' : isDone ? '#f0fdf4' : isThinking ? '#f5f3ff' : '#eef2ff',
        }}>
          <span style={{ fontSize: 10, flexShrink: 0, fontWeight: 700 }}>
            {isDone ? '✓' : isFailed ? '✗' : isThinking ? '◌' : '›'}
          </span>
          <span style={{
            fontFamily: "'SF Mono', monospace", fontSize: 11,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {content}
          </span>
        </div>
      )
      continue
    }

    // Headers: # ## ###
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/)
    if (headerMatch) {
      const level = headerMatch[1].length
      const fontSize = level === 1 ? 18 : level === 2 ? 16 : 14
      elements.push(
        <div key={`h-${li}`} style={{
          fontSize, fontWeight: 600, margin: `${level === 1 ? 16 : 10}px 0 6px 0`,
          color: 'var(--text)', lineHeight: 1.3,
          borderBottom: level <= 2 ? '1px solid var(--border)' : 'none',
          paddingBottom: level <= 2 ? 4 : 0,
        }}>
          {renderInline(headerMatch[2])}
        </div>
      )
      continue
    }

    // List items: - item or * item
    if (/^\s*[-*]\s/.test(line)) {
      const indent = line.match(/^(\s*)/)?.[1].length || 0
      const content = line.replace(/^\s*[-*]\s/, '')
      elements.push(
        <div key={`li-${li}`} style={{
          display: 'flex', gap: 6, marginLeft: indent * 8, padding: '1px 0',
        }}>
          <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>•</span>
          <span>{renderInline(content)}</span>
        </div>
      )
      continue
    }

    // Numbered list: 1. item
    const numMatch = line.match(/^\s*(\d+)\.\s+(.+)$/)
    if (numMatch) {
      elements.push(
        <div key={`ol-${li}`} style={{ display: 'flex', gap: 6, padding: '1px 0' }}>
          <span style={{ color: 'var(--text-tertiary)', flexShrink: 0, minWidth: 16, textAlign: 'right' }}>
            {numMatch[1]}.
          </span>
          <span>{renderInline(numMatch[2])}</span>
        </div>
      )
      continue
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<br key={`br-${li}`} />)
      continue
    }

    // Normal text with inline formatting
    elements.push(
      <span key={`line-${li}`}>
        {renderInline(line)}
        {li < lines.length - 1 ? '\n' : ''}
      </span>
    )
  }

  // Flush remaining table
  if (inTable) flushTable(lines.length)

  // Unclosed code block
  if (inCode && codeBlock) {
    elements.push(
      <pre key="code-unclosed" style={{
        background: '#f5f6f8', borderRadius: 8, padding: '10px 14px', fontSize: 13,
        overflow: 'auto', margin: '8px 0', fontFamily: "'SF Mono', 'Fira Code', monospace",
        border: '1px solid var(--border)',
      }}>
        <code>{codeBlock}</code>
      </pre>
    )
  }

  return <>{elements}</>
}

/** Render inline formatting: bold, inline code */
function renderInline(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((seg, j) => {
    if (seg.startsWith('**') && seg.endsWith('**')) {
      return <strong key={j}>{seg.slice(2, -2)}</strong>
    }
    if (seg.startsWith('`') && seg.endsWith('`')) {
      return (
        <code key={j} style={{
          background: '#f0f2f5', padding: '1px 5px', borderRadius: 4,
          fontSize: '0.9em', fontFamily: "'SF Mono', 'Fira Code', monospace",
        }}>
          {seg.slice(1, -1)}
        </code>
      )
    }
    return seg
  })
}

const { Text } = Typography

interface ProjectData {
  id: string
  name: string
  description: string
  stage: string
}

interface SectionMeta {
  Icon: typeof MessageSquare
  title: string
  description: string
  color: string
  chatEnabled: boolean
  agentRole?: string
  agentLabel?: string
}

const SECTION_META: Record<string, SectionMeta> = {
  sessions: {
    Icon: MessageSquare,
    title: 'Sessions',
    description: 'Free discussion related to this project (outside workflow).',
    color: '#4f6ef7',
    chatEnabled: true,
    agentRole: 'coordinator',
    agentLabel: 'General Chat Agent',
  },
  literature: {
    Icon: BookOpen,
    title: 'Literature Review',
    description: 'Search, read, and organize papers.',
    color: '#8b5cf6',
    chatEnabled: true,
    agentRole: 'literature',
    agentLabel: 'Literature Agent',
  },
  proposal: {
    Icon: Lightbulb,
    title: 'Proposal',
    description: 'Draft and refine research proposals.',
    color: '#0ea5e9',
    chatEnabled: true,
    agentRole: 'proposer',
    agentLabel: 'Proposer Agent',
  },
  experiments: {
    Icon: FlaskConical,
    title: 'Experiments',
    description: 'Design, run, and analyze experiments.',
    color: '#22c55e',
    chatEnabled: true,
    agentRole: 'experimenter',
    agentLabel: 'Experimenter Agent',
  },
  manuscript: {
    Icon: FileText,
    title: 'Manuscript',
    description: 'Write and edit research papers.',
    color: '#f59e0b',
    chatEnabled: true,
    agentRole: 'writer',
    agentLabel: 'Writer Agent',
  },
  review: {
    Icon: SearchCheck,
    title: 'Review',
    description: 'Peer review and quality assurance.',
    color: '#ef4444',
    chatEnabled: true,
    agentRole: 'reviewer',
    agentLabel: 'Reviewer Agent',
  },
  references: {
    Icon: Library,
    title: 'References',
    description: 'Manage citations and bibliography.',
    color: '#6366f1',
    chatEnabled: false,
  },
  submit: {
    Icon: Send,
    title: 'Submit',
    description: 'Prepare and submit for publication.',
    color: '#14b8a6',
    chatEnabled: false,
  },
  config: {
    Icon: Settings,
    title: 'Config',
    description: 'Project-level configuration.',
    color: '#64748b',
    chatEnabled: false,
  },
}

function SectionPlaceholder({ section }: { section: string }): React.ReactElement {
  const meta = SECTION_META[section] || {
    Icon: Construction,
    title: section,
    description: '',
    color: '#8b95a5',
    chatEnabled: false,
  }
  const Icon = meta.Icon

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: 14,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: `${meta.color}10`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={26} color={meta.color} strokeWidth={1.5} />
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--text)' }}>{meta.title}</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0, textAlign: 'center', maxWidth: 380 }}>
        {meta.description}
      </p>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 8,
          padding: '8px 16px',
          borderRadius: 8,
          background: 'var(--bg-sidebar)',
          border: '1px solid var(--border)',
          fontSize: 13,
          color: 'var(--text-tertiary)',
        }}
      >
        <Construction size={14} />
        This section has no chat interface.
      </div>
    </div>
  )
}

/** Streaming cursor indicator */
function StreamingCursor(): React.ReactElement {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 2,
        height: 16,
        background: 'var(--accent)',
        marginLeft: 2,
        verticalAlign: 'text-bottom',
        animation: 'blink 1s step-end infinite',
      }}
    />
  )
}

interface AttachedFile {
  name: string
  size: number
  serverPath?: string
}

export default function Project(): React.ReactElement {
  const { id, section, threadId } = useParams<{ id: string; section?: string; threadId?: string }>()
  const navigate = useNavigate()

  const [project, setProject] = useState<ProjectData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [threadsByKey, setThreadsByKey] = useState<Record<string, ChatThread[]>>(() => loadThreadStore())
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [manuscriptChatOpen, setManuscriptChatOpen] = useState(false)
  const [agentPanelOpen, setAgentPanelOpen] = useState(false)
  const [manuscriptChatHeight, setManuscriptChatHeight] = useState(300)
  const [backendType, setBackendType] = useState<string>('builtin')
  const [terminalOpen, setTerminalOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ignoreNextSync.current = true
    saveThreadStore(threadsByKey)
  }, [threadsByKey])

  // Sync thread store when updated externally (e.g. sidebar creates a thread)
  const ignoreNextSync = useRef(false)
  useEffect(() => {
    const handler = () => {
      if (ignoreNextSync.current) {
        ignoreNextSync.current = false
        return
      }
      setThreadsByKey(loadThreadStore())
    }
    window.addEventListener('openags-threads-updated', handler)
    return () => window.removeEventListener('openags-threads-updated', handler)
  }, [])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api
      .get<ProjectData>(`/api/projects/${id}`)
      .then(setProject)
      .catch(() => setProject(null))
      .finally(() => setLoading(false))
  }, [id])

  // Fetch backend type and workspace dir from config
  const [workspaceDir, setWorkspaceDir] = useState('')
  useEffect(() => {
    api.get<{ default_backend: { type: string }; workspace_dir: string }>('/api/config/')
      .then((cfg) => {
        setBackendType(cfg.default_backend.type || 'builtin')
        setWorkspaceDir(cfg.workspace_dir || '')
      })
      .catch(() => {})
  }, [])

  const isCliBackend = CLI_BACKENDS.includes(backendType)
  const cliCommand = CLI_COMMANDS[backendType] || 'claude'

  // Compute the working directory for the terminal
  const terminalCwd = useMemo(() => {
    if (!project || !workspaceDir) return ''
    const baseDir = `${workspaceDir}/projects/${project.id}`
    const subfolder = SECTION_FOLDERS[section || 'sessions'] || ''
    return subfolder ? `${baseDir}/${subfolder}` : baseDir
  }, [project, section, workspaceDir])

  const terminalSessionId = useMemo(() => {
    return `${id || 'unknown'}:${section || 'sessions'}`
  }, [id, section])

  // CLI chat WebSocket ref
  const cliWsRef = useRef<WebSocket | null>(null)
  // Refs declared here, initialized after activeThread/chatKey are defined (see below)
  const activeThreadRef = useRef<typeof activeThread>(undefined as any)
  const chatKeyRef = useRef('')

  // Helper: update the last assistant message in the active thread
  const updateLastAssistant = (fn: (content: string) => string) => {
    const key = chatKeyRef.current
    const threadId = activeThreadRef.current?.id
    if (!key) return
    setThreadsByKey(prev => {
      const threads = prev[key]
      if (!threads) return prev
      return {
        ...prev,
        [key]: threads.map(t => {
          // Match by thread id, or if no id, find the thread with a trailing empty assistant msg
          const isTarget = threadId ? t.id === threadId : t.messages.length > 0 && t.messages[t.messages.length - 1]?.role === 'assistant'
          if (!isTarget || t.messages.length === 0) return t
          const msgs = [...t.messages]
          const last = msgs[msgs.length - 1]
          if (last.role === 'assistant') {
            msgs[msgs.length - 1] = { ...last, content: fn(last.content) }
          }
          return { ...t, messages: msgs }
        }),
      }
    })
  }

  // Connect to /chat WebSocket for CLI backends
  useEffect(() => {
    if (!isCliBackend) return

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${window.location.host}/chat`)
    cliWsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        const thread = activeThreadRef.current
        const key = chatKeyRef.current

        if (msg.type === 'session-created') {
          // Save provider session ID into the active thread
          if (thread) {
            setThreadsByKey(prev => ({
              ...prev,
              [key]: (prev[key] || []).map(t =>
                t.id === thread.id ? { ...t, providerSessionId: msg.sessionId } : t
              ),
            }))
          }
        } else if (msg.type === 'text' && msg.content) {
          updateLastAssistant(c => c + msg.content)
        } else if (msg.type === 'tool_use') {
          const detail = msg.detail ? `: ${msg.detail}` : ''
          updateLastAssistant(c => c + `\n> Tool: ${msg.name}${detail}...`)
        } else if (msg.type === 'tool_result') {
          const suffix = msg.isError ? ' failed' : ' done'
          updateLastAssistant(c => c.replace(/> Tool: ([^\n]+)\.\.\.\s*$/, `> Tool: $1${suffix}`))
        } else if (msg.type === 'thinking') {
          updateLastAssistant(c => c.trim() ? c : '> Thinking...\n')
        } else if (msg.type === 'complete') {
          setSending(false)
        } else if (msg.type === 'error') {
          updateLastAssistant(c => c + `\n[Error: ${msg.error}]`)
          setSending(false)
        }
      } catch { /* ignore */ }
    }

    ws.onclose = () => { cliWsRef.current = null }
    return () => { ws.close(); cliWsRef.current = null }
  }, [isCliBackend, backendType])

  // CLI file attachments
  const [cliAttachedFiles, setCliAttachedFiles] = useState<AttachedFile[]>([])
  const cliFileInputRef = useRef<HTMLInputElement>(null)

  const handleCliFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const newAttachments: AttachedFile[] = []

    for (const file of Array.from(files)) {
      // For images: store as base64 data URL for passing to provider
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        const dataUrl: string = await new Promise((resolve) => {
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(file)
        })
        newAttachments.push({ name: file.name, size: file.size, serverPath: dataUrl })
      } else if (id) {
        // For other files: upload to project uploads/ dir
        try {
          const result = await api.upload(`/api/projects/${id}/files`, file)
          newAttachments.push({ name: result.filename, size: result.size, serverPath: result.path })
        } catch {
          newAttachments.push({ name: file.name, size: file.size })
        }
      }
    }
    setCliAttachedFiles(prev => [...prev, ...newAttachments])
    e.target.value = ''
  }

  /** Send a message via CLI provider WebSocket */
  const sendCliMessage = () => {
    if ((!input.trim() && cliAttachedFiles.length === 0) || !cliWsRef.current || sending || !activeThread) return

    let userMsg = input.trim()

    // Append file references to the message
    const fileRefs = cliAttachedFiles
      .filter(f => f.serverPath && !f.serverPath.startsWith('data:'))
      .map(f => `[Attached: ${f.name} (${f.serverPath})]`)
    if (fileRefs.length > 0) {
      userMsg = userMsg ? `${userMsg}\n\n${fileRefs.join('\n')}` : fileRefs.join('\n')
    }

    // Collect image data URLs for the provider
    const images = cliAttachedFiles
      .filter(f => f.serverPath?.startsWith('data:image/'))
      .map(f => ({ data: f.serverPath! }))

    setInput('')
    setCliAttachedFiles([])
    setSending(true)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // Add user + empty assistant messages to the active thread (shared storage)
    setThreadsByKey(prev => ({
      ...prev,
      [chatKey]: (prev[chatKey] || []).map(t => {
        if (t.id !== activeThread.id) return t
        return {
          ...t,
          title: t.title.startsWith('New Chat') && t.messages.length === 0
            ? userMsg.slice(0, 30) : t.title,
          messages: [
            ...t.messages,
            { role: 'user' as const, content: userMsg },
            { role: 'assistant' as const, content: '' },
          ],
        }
      }),
    }))

    // Send via WebSocket — use this thread's providerSessionId for resume
    cliWsRef.current.send(JSON.stringify({
      type: 'chat',
      provider: backendType,
      command: userMsg,
      cwd: terminalCwd,
      sessionId: activeThread.providerSessionId || undefined,
      permissionMode: 'bypassPermissions',
      ...(images.length > 0 ? { images } : {}),
    }))
  }

  const activeSection = section || 'sessions'
  const meta = SECTION_META[activeSection] || SECTION_META.sessions
  const chatKey = useMemo(() => getChatKey(id || 'unknown', activeSection), [id, activeSection])

  useEffect(() => {
    if (!meta.chatEnabled || !id) return

    // Check if we already have threads locally
    const existing = loadThreadStore()
    if (existing[chatKey] && existing[chatKey].length > 0) return

    // Try loading sessions from backend first
    api.sessions.list(id, activeSection)
      .then((serverSessions) => {
        if (serverSessions.length > 0) {
          // Restore threads from server sessions
          const restored: ChatThread[] = serverSessions.map((s) => ({
            id: makeThreadId(),
            title: s.title || `Chat`,
            messages: (s.messages || []).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
            sessionId: s.id,
          }))
          setThreadsByKey((prev) => ({ ...prev, [chatKey]: restored }))
        } else {
          // No server sessions — create a fresh thread
          const newThread: ChatThread = { id: makeThreadId(), title: makeThreadTitle(1), messages: [] }
          if (meta.agentRole) {
            api.sessions.create(id, activeSection, meta.agentRole, newThread.title)
              .then((session) => {
                setThreadsByKey((cur) => ({
                  ...cur,
                  [chatKey]: (cur[chatKey] || []).map((t) =>
                    t.id === newThread.id ? { ...t, sessionId: session.id } : t,
                  ),
                }))
              })
              .catch(() => {})
          }
          setThreadsByKey((prev) => ({ ...prev, [chatKey]: [newThread] }))
        }
      })
      .catch(() => {
        // Backend unreachable — create local thread
        const newThread: ChatThread = { id: makeThreadId(), title: makeThreadTitle(1), messages: [] }
        setThreadsByKey((prev) => ({ ...prev, [chatKey]: [newThread] }))
      })
  }, [chatKey, id, meta.chatEnabled, meta.agentRole])

  const threads = threadsByKey[chatKey] || []

  useEffect(() => {
    if (!id || !meta.chatEnabled || threads.length === 0) return
    const exists = threadId ? threads.some((thread) => thread.id === threadId) : false
    if (!exists) {
      navigate(`/project/${id}/${activeSection}/${threads[0].id}`, { replace: true })
    }
  }, [activeSection, id, meta.chatEnabled, navigate, threadId, threads])

  const activeThread = threads.find((t) => t.id === threadId) || threads[0]
  const messages = activeThread?.messages || []

  // Keep refs in sync (for WebSocket handler — avoids stale closures)
  activeThreadRef.current = activeThread
  chatKeyRef.current = chatKey

  // Reset sending state when switching threads/sections
  useEffect(() => {
    setSending(false)
  }, [threadId, activeSection])

  // Auto-scroll to bottom on new messages, content updates, and thread switch
  const scrollToBottom = () => {
    // Scroll all possible message containers to bottom
    const container = messagesContainerRef.current
    if (container) {
      container.scrollTop = container.scrollHeight
    }
    // Also scroll any element with data-chat-scroll attribute (manuscript panel etc.)
    document.querySelectorAll('[data-chat-scroll]').forEach(el => {
      el.scrollTop = el.scrollHeight
    })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages.length, messages[messages.length - 1]?.content, threadId, activeSection])

  // Also scroll on every threadsByKey change (catches CLI streaming updates)
  useEffect(() => {
    scrollToBottom()
  }, [threadsByKey])

  // Auto-resize textarea
  const adjustTextarea = () => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || !id) return

    setUploading(true)
    const newAttachments: AttachedFile[] = []

    for (const file of Array.from(files)) {
      try {
        const result = await api.upload(`/api/projects/${id}/files`, file)
        newAttachments.push({
          name: result.filename,
          size: result.size,
          serverPath: result.path,
        })
      } catch {
        newAttachments.push({ name: file.name, size: file.size })
      }
    }

    setAttachedFiles((prev) => [...prev, ...newAttachments])
    setUploading(false)
    // Reset input so the same file can be selected again
    e.target.value = ''
  }

  const removeAttachment = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const sendMessage = async (): Promise<void> => {
    if (!id || !meta.chatEnabled || !activeThread || (!input.trim() && attachedFiles.length === 0) || sending) return

    let content = input.trim()

    // Append file references to the message
    if (attachedFiles.length > 0) {
      const fileRefs = attachedFiles
        .map((f) => f.serverPath ? `[Attached: ${f.name} (${f.serverPath})]` : `[Attached: ${f.name}]`)
        .join('\n')
      content = content ? `${content}\n\n${fileRefs}` : fileRefs
    }

    const userMessage: ChatMessage = { role: 'user', content }
    const nextMessages = [...activeThread.messages, userMessage]
    setInput('')
    setAttachedFiles([])
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    setThreadsByKey((prev) => ({
      ...prev,
      [chatKey]: (prev[chatKey] || []).map((thread) =>
        thread.id === activeThread.id
          ? {
              ...thread,
              title:
                thread.title.startsWith('New Chat') && thread.messages.length === 0
                  ? content.slice(0, 30)
                  : thread.title,
              messages: nextMessages,
            }
          : thread,
      ),
    }))

    setSending(true)
    try {
      // Add empty assistant message for streaming
      setThreadsByKey((prev) => ({
        ...prev,
        [chatKey]: (prev[chatKey] || []).map((thread) =>
          thread.id === activeThread.id
            ? { ...thread, messages: [...thread.messages, { role: 'assistant' as const, content: '' }] }
            : thread,
        ),
      }))

      let received = false
      await api.streamPost(
        `/api/agents/${id}/chat`,
        {
          messages: nextMessages,
          module: meta.agentRole || section,
          stream: true,
          session_id: activeThread.sessionId || null,
        },
        (chunk) => {
          if (!chunk) return
          received = true
          setThreadsByKey((prev) => ({
            ...prev,
            [chatKey]: (prev[chatKey] || []).map((thread) => {
              if (thread.id !== activeThread.id || thread.messages.length === 0) return thread
              const updated = [...thread.messages]
              const last = updated[updated.length - 1]
              if (last.role === 'assistant') {
                updated[updated.length - 1] = {
                  ...last,
                  content: `${last.content}${chunk}`,
                }
              }
              return { ...thread, messages: updated }
            }),
          }))
        },
      )

      if (!received) {
        setThreadsByKey((prev) => ({
          ...prev,
          [chatKey]: (prev[chatKey] || []).map((thread) => {
            if (thread.id !== activeThread.id || thread.messages.length === 0) return thread
            const updated = [...thread.messages]
            const last = updated[updated.length - 1]
            if (last.role === 'assistant' && !last.content.trim()) {
              updated[updated.length - 1] = { ...last, content: '(empty response)' }
            }
            return { ...thread, messages: updated }
          }),
        }))
      }
    } catch {
      setThreadsByKey((prev) => ({
        ...prev,
        [chatKey]: (prev[chatKey] || []).map((thread) => {
          if (thread.id !== activeThread.id) return thread
          const updated = [...thread.messages]
          const last = updated[updated.length - 1]
          if (last?.role === 'assistant' && !last.content.trim()) {
            updated[updated.length - 1] = { ...last, content: 'Request failed. Check backend and API key in Settings.' }
          } else {
            updated.push({ role: 'assistant', content: 'Request failed. Check backend and API key in Settings.' })
          }
          return { ...thread, messages: updated }
        }),
      }))
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!project) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Text type="danger">Project not found</Text>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header bar */}
      <div
        style={{
          padding: '14px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
          background: 'var(--bg-card)',
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: `${meta.color}10`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <meta.Icon size={15} color={meta.color} strokeWidth={2} />
        </div>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--text)' }}>{project.name}</h2>
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            padding: '2px 10px',
            borderRadius: 12,
            background: `${meta.color}10`,
            color: meta.color,
          }}
        >
          {meta.title}
        </span>
        {/* Spacer to push icons to the right */}
        <div style={{ flex: 1 }} />
        {/* Terminal toggle */}
        {meta.chatEnabled && terminalCwd && (
          <div
            onClick={() => setTerminalOpen(!terminalOpen)}
            style={{
              width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', marginLeft: activeThread ? 0 : 'auto', flexShrink: 0, transition: 'all 0.15s',
              background: terminalOpen ? '#22c55e' : 'var(--bg-sidebar)',
              color: terminalOpen ? '#fff' : '#64748b',
              border: `1px solid ${terminalOpen ? '#22c55e' : 'var(--border)'}`,
            }}
            onMouseEnter={(e) => { if (!terminalOpen) { e.currentTarget.style.background = '#e8ecf1'; e.currentTarget.style.color = '#334155' } }}
            onMouseLeave={(e) => { if (!terminalOpen) { e.currentTarget.style.background = 'var(--bg-sidebar)'; e.currentTarget.style.color = '#64748b' } }}
            title={terminalOpen ? 'Close Terminal' : 'Open Terminal'}
          >
            <Terminal size={14} strokeWidth={2} />
          </div>
        )}
        {/* Agent config (non-sessions sections) */}
        {meta.chatEnabled && activeSection !== 'sessions' && (
          <div
            onClick={() => setAgentPanelOpen(!agentPanelOpen)}
            style={{
              width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
              background: agentPanelOpen ? `${meta.color}15` : 'transparent',
              color: agentPanelOpen ? meta.color : 'var(--text-tertiary)',
              border: agentPanelOpen ? `1px solid ${meta.color}30` : '1px solid transparent',
            }}
            onMouseEnter={(e) => { if (!agentPanelOpen) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
            onMouseLeave={(e) => { if (!agentPanelOpen) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)' } }}
            title="Agent Config"
          >
            <Bot size={15} strokeWidth={2} />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {activeSection === 'manuscript' && project ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {/* Editor takes remaining space */}
          <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
            <ManuscriptEditor projectId={project.id} projectName={project.name} />
          </div>

          {/* Collapsible chat panel toggle */}
          <div
            onClick={() => setManuscriptChatOpen(!manuscriptChatOpen)}
            style={{
              padding: '6px 16px',
              borderTop: '1px solid var(--border)',
              background: manuscriptChatOpen ? '#fff' : 'var(--bg-sidebar)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              userSelect: 'none',
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = manuscriptChatOpen ? '#fff' : 'var(--bg-sidebar)' }}
          >
            <MessageSquare size={13} color={meta.color} strokeWidth={2} />
            <span style={{ flex: 1 }}>{isCliBackend ? `Chat via ${cliCommand}` : 'Writer Agent Chat'}</span>
            {manuscriptChatOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </div>

          {/* Chat panel (resizable) */}
          {manuscriptChatOpen && (
            <div style={{
              height: manuscriptChatHeight,
              borderTop: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
              background: 'var(--bg-card)',
            }}>
              {/* Resize handle */}
              <div
                style={{
                  height: 8, cursor: 'ns-resize', flexShrink: 0,
                  background: 'var(--border)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--border)' }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  const startY = e.clientY
                  const startHeight = manuscriptChatHeight
                  const onMove = (ev: MouseEvent) => {
                    const delta = startY - ev.clientY
                    setManuscriptChatHeight(Math.max(150, Math.min(600, startHeight + delta)))
                  }
                  const onUp = () => {
                    document.removeEventListener('mousemove', onMove)
                    document.removeEventListener('mouseup', onUp)
                  }
                  document.addEventListener('mousemove', onMove)
                  document.addEventListener('mouseup', onUp)
                }}
              />

              {/* Chat messages */}
              <div data-chat-scroll ref={messagesContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
                {messages.length === 0 ? (
                  <div style={{
                    height: '100%', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-tertiary)', textAlign: 'center', gap: 6,
                  }}>
                    <meta.Icon size={24} strokeWidth={1.2} color={meta.color} style={{ opacity: 0.4 }} />
                    <div style={{ fontSize: 13 }}>Chat with {meta.agentLabel} about your manuscript</div>
                  </div>
                ) : (
                  <div style={{ maxWidth: 820, margin: '0 auto' }}>
                    {messages.map((m, idx) => {
                      const isUser = m.role === 'user'
                      const isLastAssistant = !isUser && idx === messages.length - 1 && sending
                      return isUser ? (
                        <div key={`ms-${idx}`} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8, padding: '0 4px' }}>
                          <div style={{
                            maxWidth: 'min(75%, 600px)', padding: '6px 10px', borderRadius: 10,
                            background: 'var(--accent)', color: '#fff',
                            whiteSpace: 'pre-wrap', lineHeight: 1.5, fontSize: 13, wordBreak: 'break-word',
                          }}>{m.content}</div>
                        </div>
                      ) : (
                        <div key={`ms-${idx}`} style={{ marginBottom: 10, padding: '0 4px' }}>
                          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55, fontSize: 13, color: 'var(--text)', wordBreak: 'break-word' }}>
                            {renderMarkdown(m.content)}
                            {isLastAssistant && <StreamingCursor />}
                          </div>
                        </div>
                      )
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Chat input — routes to CLI or builtin based on backend */}
              <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => { setInput(e.target.value); adjustTextarea() }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        isCliBackend ? sendCliMessage() : void sendMessage()
                      }
                    }}
                    placeholder={`Ask ${meta.agentLabel || 'agent'} about manuscript...`}
                    rows={1}
                    style={{
                      flex: 1, border: '1px solid var(--border)', borderRadius: 8,
                      padding: '8px 12px', outline: 'none', fontSize: 13,
                      resize: 'none', lineHeight: 1.5, maxHeight: 100,
                      fontFamily: 'inherit',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
                  />
                  <button
                    type="button"
                    onClick={() => isCliBackend ? sendCliMessage() : void sendMessage()}
                    disabled={!activeThread || (!input.trim() && !sending)}
                    style={{
                      border: 'none', background: sending ? '#ef4444' : 'var(--accent)',
                      color: '#fff', borderRadius: 8, width: 34, height: 34,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: !activeThread ? 'not-allowed' : 'pointer',
                      opacity: !activeThread ? 0.5 : 1, flexShrink: 0,
                    }}
                  >
                    {sending ? <Square size={14} fill="#fff" /> : <SendHorizonal size={14} />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : activeSection === 'config' && project ? (
        <ProjectConfig projectId={project.id} projectName={project.name} />
      ) : !meta.chatEnabled ? (
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
          <SectionPlaceholder section={activeSection} />
        </div>
      ) : isCliBackend && terminalCwd ? (
        /* ── CLI Backend: show Chat OR Terminal (toggled via header icon) ── */
        terminalOpen ? (
          /* Terminal view (full height) */
          <TerminalPanel
            sessionId={terminalSessionId}
            cwd={terminalCwd}
            command=""
            color={meta.color}
            minimized={false}
            onToggleMinimize={() => setTerminalOpen(false)}
          />
        ) : (
          /* Chat view (full height) */
          <>
            {/* Messages area */}
            <div
              ref={messagesContainerRef}
              style={{ flex: 1, overflowY: 'auto', padding: '16px 16px', scrollBehavior: 'smooth' }}
            >
              {messages.length === 0 ? (
                <div style={{
                  height: '100%', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-tertiary)', textAlign: 'center', gap: 8,
                }}>
                  <meta.Icon size={32} strokeWidth={1.2} color={meta.color} style={{ opacity: 0.4 }} />
                  <div style={{ fontSize: 14 }}>Start a conversation with {meta.agentLabel}</div>
                  <div style={{ fontSize: 12 }}>Powered by {cliCommand} SDK</div>
                </div>
              ) : (
                <div style={{ maxWidth: 820, margin: '0 auto' }}>
                  {messages.map((m, idx) => {
                    const isUser = m.role === 'user'
                    const isLastAssistant = !isUser && idx === messages.length - 1 && sending
                    return isUser ? (
                      <div key={`cli-${idx}`}
                        style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10, padding: '0 8px' }}>
                        <div style={{
                          maxWidth: 'min(80%, 640px)', padding: '8px 14px', borderRadius: 12,
                          background: 'var(--accent)', color: '#fff',
                          whiteSpace: 'pre-wrap', lineHeight: 1.55, fontSize: 14, wordBreak: 'break-word',
                        }}>
                          {m.content}
                        </div>
                      </div>
                    ) : (
                      <div key={`cli-${idx}`} style={{ marginBottom: 14, padding: '0 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <div style={{
                            width: 22, height: 22, borderRadius: 6, display: 'flex',
                            alignItems: 'center', justifyContent: 'center', background: `${meta.color}12`,
                          }}>
                            <meta.Icon size={11} color={meta.color} strokeWidth={2} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: meta.color }}>
                            {meta.agentLabel || 'Agent'}
                          </span>
                        </div>
                        <div style={{
                          whiteSpace: 'pre-wrap', lineHeight: 1.65, fontSize: 14,
                          color: 'var(--text)', wordBreak: 'break-word',
                        }}>
                          {renderMarkdown(m.content)}
                          {isLastAssistant && <StreamingCursor />}
                        </div>
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input area */}
            <div style={{
              padding: '10px 16px 14px', borderTop: '1px solid var(--border)',
              background: 'var(--bg-card)', flexShrink: 0,
            }}>
              <div style={{ maxWidth: 820, margin: '0 auto' }}>
                {/* Attached files chips */}
                {cliAttachedFiles.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {cliAttachedFiles.map((f, idx) => (
                      <div key={idx} style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '3px 8px 3px 10px', borderRadius: 6,
                        background: 'var(--bg-sidebar)', border: '1px solid var(--border)',
                        fontSize: 12, color: 'var(--text-secondary)',
                      }}>
                        <Paperclip size={11} strokeWidth={2} />
                        <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.name}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                          {f.size < 1024 ? `${f.size}B` : `${(f.size / 1024).toFixed(0)}KB`}
                        </span>
                        <div
                          onClick={() => setCliAttachedFiles(prev => prev.filter((_, i) => i !== idx))}
                          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-tertiary)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)' }}
                        >
                          <X size={12} strokeWidth={2} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  {/* File upload button */}
                  <input ref={cliFileInputRef} type="file" multiple onChange={handleCliFileSelect} style={{ display: 'none' }} />
                  <button
                    type="button"
                    onClick={() => cliFileInputRef.current?.click()}
                    style={{
                      border: '1px solid var(--border)', background: 'var(--bg-card)', borderRadius: 10,
                      width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: 'var(--text-tertiary)', flexShrink: 0,
                      transition: 'all var(--transition)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-tertiary)' }}
                    title="Attach files"
                  >
                    <Paperclip size={16} strokeWidth={1.8} />
                  </button>

                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => { setInput(e.target.value); adjustTextarea() }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCliMessage() }
                    }}
                    placeholder={`Message ${meta.agentLabel || cliCommand}...`}
                    rows={1}
                    style={{
                      flex: 1, border: '1px solid var(--border)', borderRadius: 10,
                      padding: '10px 14px', outline: 'none', fontSize: 14,
                      resize: 'none', lineHeight: 1.5, maxHeight: 160,
                      fontFamily: 'inherit',
                      transition: 'border-color var(--transition), box-shadow var(--transition)',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent)'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79,110,247,0.08)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                  <button
                    type="button"
                    onClick={sendCliMessage}
                    disabled={(!input.trim() && cliAttachedFiles.length === 0) || sending}
                    style={{
                      border: 'none',
                      background: sending ? '#ef4444' : 'var(--accent)',
                      color: '#fff', borderRadius: 10, width: 40, height: 40,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: (!input.trim() && cliAttachedFiles.length === 0) || sending ? 'not-allowed' : 'pointer',
                      opacity: (!input.trim() && cliAttachedFiles.length === 0) && !sending ? 0.5 : 1,
                      flexShrink: 0, transition: 'all var(--transition)',
                    }}
                    title={sending ? 'Generating...' : 'Send message'}
                  >
                    {sending ? <Square size={16} fill="#fff" /> : <SendHorizonal size={16} />}
                  </button>
                </div>
                <div style={{ margin: '5px 0 0', fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center' }}>
                  Enter to send · Shift+Enter for new line
                </div>
              </div>
            </div>
          </>
        )
      ) : (
        <>
          {/* ── Builtin Backend: Standard Chat Interface ── */}
          {/* Messages area */}
          <div
            ref={messagesContainerRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 16px',
              scrollBehavior: 'smooth',
            }}
          >
            {messages.length === 0 ? (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-tertiary)',
                  textAlign: 'center',
                  gap: 8,
                }}
              >
                <meta.Icon size={32} strokeWidth={1.2} color={meta.color} style={{ opacity: 0.4 }} />
                <div style={{ fontSize: 14 }}>Start a conversation with {meta.agentLabel}</div>
                <div style={{ fontSize: 12 }}>Type a message below to begin</div>
              </div>
            ) : (
              <div style={{ maxWidth: 820, margin: '0 auto' }}>
                {messages.map((m, idx) => {
                  const isUser = m.role === 'user'
                  const isLastAssistant = !isUser && idx === messages.length - 1 && sending
                  return isUser ? (
                    <div key={`${m.role}-${idx}`}
                      style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10, padding: '0 8px' }}>
                      <div style={{
                        maxWidth: 'min(80%, 640px)', padding: '8px 14px', borderRadius: 12,
                        background: 'var(--accent)', color: '#fff',
                        whiteSpace: 'pre-wrap', lineHeight: 1.55, fontSize: 14, wordBreak: 'break-word',
                      }}>
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    <div key={`${m.role}-${idx}`}
                      style={{ marginBottom: 14, padding: '0 8px' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
                      }}>
                        <div style={{
                          width: 22, height: 22, borderRadius: 6, display: 'flex',
                          alignItems: 'center', justifyContent: 'center', background: `${meta.color}12`,
                        }}>
                          <meta.Icon size={11} color={meta.color} strokeWidth={2} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: meta.color }}>
                          {meta.agentLabel || 'Agent'}
                        </span>
                      </div>
                      <div style={{
                        whiteSpace: 'pre-wrap', lineHeight: 1.65, fontSize: 14,
                        color: 'var(--text)', wordBreak: 'break-word',
                      }}>
                        {renderMarkdown(m.content)}
                        {isLastAssistant && <StreamingCursor />}
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input area */}
          <div
            style={{
              padding: '10px 16px 14px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-card)',
              flexShrink: 0,
            }}
          >
            <div style={{ maxWidth: 820, margin: '0 auto' }}>
              {/* Attached files chips */}
              {attachedFiles.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {attachedFiles.map((f, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '3px 8px 3px 10px',
                        borderRadius: 6,
                        background: 'var(--bg-sidebar)',
                        border: '1px solid var(--border)',
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <Paperclip size={11} strokeWidth={2} />
                      <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.name}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                        {f.size < 1024 ? `${f.size}B` : `${(f.size / 1024).toFixed(0)}KB`}
                      </span>
                      <div
                        onClick={() => removeAttachment(idx)}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-tertiary)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)' }}
                      >
                        <X size={12} strokeWidth={2} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                {/* File upload button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{
                    border: '1px solid var(--border)',
                    background: 'var(--bg-card)',
                    borderRadius: 10,
                    width: 40,
                    height: 40,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: uploading ? 'wait' : 'pointer',
                    color: 'var(--text-tertiary)',
                    flexShrink: 0,
                    transition: 'all var(--transition)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)'
                    e.currentTarget.style.color = 'var(--accent)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.color = 'var(--text-tertiary)'
                  }}
                  title="Attach files"
                >
                  <Paperclip size={16} strokeWidth={1.8} />
                </button>

                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value)
                    adjustTextarea()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void sendMessage()
                    }
                  }}
                  placeholder={`Message ${meta.agentLabel || 'agent'}...`}
                  rows={1}
                  style={{
                    flex: 1,
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    outline: 'none',
                    fontSize: 14,
                    resize: 'none',
                    lineHeight: 1.5,
                    maxHeight: 160,
                    fontFamily: 'inherit',
                    transition: 'border-color var(--transition), box-shadow var(--transition)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79,110,247,0.08)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={!activeThread || (!input.trim() && attachedFiles.length === 0 && !sending)}
                  style={{
                    border: 'none',
                    background: sending ? 'var(--red)' : 'var(--accent)',
                    color: '#fff',
                    borderRadius: 10,
                    width: 40,
                    height: 40,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: !activeThread ? 'not-allowed' : 'pointer',
                    opacity: !activeThread ? 0.5 : 1,
                    flexShrink: 0,
                    transition: 'all var(--transition)',
                  }}
                  title={sending ? 'Generating...' : 'Send message'}
                >
                  {sending ? <Square size={16} fill="#fff" /> : <SendHorizonal size={16} />}
                </button>
              </div>
              <div
                style={{
                  margin: '5px 0 0',
                  fontSize: 11,
                  color: 'var(--text-tertiary)',
                  textAlign: 'center',
                }}
              >
                Enter to send · Shift+Enter for new line
              </div>
            </div>
          </div>
        </>
      )}
      </div>
      {agentPanelOpen && project && meta.chatEnabled && activeSection !== 'sessions' && (
        <AgentConfigPanel
          projectId={project.id}
          section={activeSection}
          color={meta.color}
          onClose={() => setAgentPanelOpen(false)}
        />
      )}
      </div>
    </div>
  )
}
