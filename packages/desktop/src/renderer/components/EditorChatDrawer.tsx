/**
 * EditorChatDrawer — Prism-style AI chat embedded at the bottom of the LaTeX editor.
 *
 * Connects to /chat WebSocket, sends messages to the current CLI backend.
 * Context-aware: knows which file is being edited.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { MessageSquare, Send, ChevronDown, ChevronUp, X, Sparkles } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  projectId: string
  module: string
  activeFile: string | null
  cwd: string
}

export default function EditorChatDrawer({ projectId, module, activeFile, cwd }: Props): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const [height, setHeight] = useState(280)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Connect WebSocket
  useEffect(() => {
    const host = window.location.port === '3090' ? 'localhost:19836' : window.location.host
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${host}/chat`)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'session-created') {
          setSessionId(msg.sessionId)
        } else if (msg.type === 'text' && msg.content) {
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: last.content + msg.content }
            }
            return updated
          })
        } else if (msg.type === 'tool_use') {
          const detail = msg.detail ? `: ${msg.detail}` : ''
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: last.content + `\n> Tool: ${msg.name}${detail}...` }
            }
            return updated
          })
        } else if (msg.type === 'tool_result') {
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last?.role === 'assistant') {
              const suffix = msg.isError ? ' failed' : ' done'
              updated[updated.length - 1] = { ...last, content: last.content.replace(/> Tool: ([^\n]+)\.\.\.\s*$/, `> Tool: $1${suffix}`) }
            }
            return updated
          })
        } else if (msg.type === 'complete') {
          setSending(false)
        } else if (msg.type === 'error') {
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: last.content + `\n[Error: ${msg.error}]` }
            }
            return updated
          })
          setSending(false)
        }
      } catch { /* ignore */ }
    }

    ws.onclose = () => { wsRef.current = null }
    return () => { ws.close(); wsRef.current = null }
  }, [])

  // Read backend type from config
  const [backendType, setBackendType] = useState('claude_code')
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then((cfg: Record<string, unknown>) => {
        const bt = (cfg.default_backend as Record<string, unknown>)?.type as string
        if (bt) setBackendType(bt)
      })
      .catch(() => {})
  }, [])

  const handleSend = useCallback(() => {
    if (!input.trim() || sending || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    const userMsg = input.trim()
    setInput('')
    setSending(true)

    // Add user message + empty assistant placeholder
    setMessages(prev => [...prev, { role: 'user', content: userMsg }, { role: 'assistant', content: '' }])

    // Build context-aware prompt
    let command = userMsg
    if (activeFile && !userMsg.toLowerCase().includes(activeFile)) {
      command = `[Context: I'm editing ${activeFile} in the ${module} directory]\n\n${userMsg}`
    }

    wsRef.current.send(JSON.stringify({
      type: 'chat',
      provider: backendType,
      command,
      cwd: cwd || `/tmp`,
      sessionId: sessionId || undefined,
      permissionMode: 'bypassPermissions',
    }))
  }, [input, sending, activeFile, module, backendType, sessionId, cwd])

  // Drag to resize
  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startH: height }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = dragRef.current.startY - ev.clientY
      setHeight(Math.max(150, Math.min(600, dragRef.current.startH + delta)))
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Collapsed: just show the toggle bar
  if (!isOpen) {
    return (
      <div
        onClick={() => setIsOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px',
          borderTop: '1px solid var(--border-light)', background: 'var(--bg-card)',
          cursor: 'pointer', fontSize: 12, color: 'var(--text-tertiary)',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover, rgba(0,0,0,0.02))' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)' }}
      >
        <Sparkles size={14} color="var(--accent)" />
        <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>AI Assistant</span>
        <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>— Ask about your LaTeX, get help writing</span>
        <ChevronUp size={14} style={{ marginLeft: 'auto' }} />
      </div>
    )
  }

  return (
    <div style={{ height, flexShrink: 0, display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border-light)', background: 'var(--bg-card)' }}>

      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        style={{
          height: 6, cursor: 'ns-resize', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, background: 'var(--bg-card)',
        }}>
        <div style={{ width: 40, height: 3, borderRadius: 2, background: 'var(--border, #ddd)' }} />
      </div>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px',
        borderBottom: '1px solid var(--border-light)', flexShrink: 0,
      }}>
        <Sparkles size={14} color="var(--accent)" />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>AI Assistant</span>
        {activeFile && (
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'var(--bg-hover, rgba(0,0,0,0.04))', padding: '1px 6px', borderRadius: 4 }}>
            {activeFile}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{backendType.replace('_', ' ')}</span>
        <button onClick={() => { setMessages([]); setSessionId(null) }}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 2, fontSize: 10 }}
          title="Clear chat">
          Clear
        </button>
        <button onClick={() => setIsOpen(false)}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 2 }}
          title="Collapse">
          <ChevronDown size={14} />
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px', minHeight: 0 }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-tertiary)', fontSize: 12 }}>
            <Sparkles size={20} style={{ marginBottom: 6, opacity: 0.5 }} />
            <div>Ask me anything about your LaTeX document</div>
            <div style={{ marginTop: 4, fontSize: 11 }}>I can help write sections, fix errors, explain code, or suggest improvements</div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '85%', padding: '6px 10px', borderRadius: 10,
                fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                background: msg.role === 'user'
                  ? 'var(--accent, #4f6ef7)'
                  : 'var(--bg-hover, rgba(0,0,0,0.04))',
                color: msg.role === 'user' ? '#fff' : 'var(--text)',
              }}>
                {msg.content || (msg.role === 'assistant' && sending ? '...' : '')}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
          }}
          placeholder="Ask about your LaTeX..."
          rows={1}
          style={{
            flex: 1, padding: '7px 10px', border: '1px solid var(--border, #e2e5ea)', borderRadius: 10,
            fontSize: 12, outline: 'none', resize: 'none', fontFamily: 'inherit',
            background: 'var(--bg-input, #fff)', color: 'var(--text)',
            maxHeight: 80, overflow: 'auto',
          }}
          onInput={(e) => {
            const t = e.currentTarget
            t.style.height = 'auto'
            t.style.height = Math.min(t.scrollHeight, 80) + 'px'
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          style={{
            width: 32, height: 32, borderRadius: '50%', border: 'none',
            background: (!input.trim() || sending) ? 'var(--border, #e2e5ea)' : 'var(--accent, #4f6ef7)',
            color: '#fff', cursor: (!input.trim() || sending) ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}
