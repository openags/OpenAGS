/**
 * AgentActivityCard — real-time visualization of agent work in the chat stream.
 *
 * Shows tool calls, dispatched agents, and progress as they happen,
 * driven by WebSocket events from the backend.
 */

import React, { useEffect, useRef, useState } from 'react'
import {
  Bot,
  CheckCircle2,
  Loader2,
  FileText,
  BookOpen,
  FlaskConical,
  Lightbulb,
  SearchCheck,
  Library,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Zap,
  GraduationCap,
} from 'lucide-react'

interface ActivityStep {
  id: string
  type: 'thinking' | 'tool_call' | 'tool_result' | 'dispatch' | 'done' | 'error'
  role: string
  tool?: string
  args?: string
  success?: boolean
  summary?: string
  error?: string
  duration?: number
  steps?: number
  childRole?: string
  task?: string
  timestamp: number
}

interface ChildAgent {
  role: string
  task: string
  steps: ActivityStep[]
  done: boolean
}

const ROLE_ICONS: Record<string, typeof Bot> = {
  ags: Bot,
  pi: GraduationCap,
  literature: BookOpen,
  proposer: Lightbulb,
  experimenter: FlaskConical,
  writer: FileText,
  reviewer: SearchCheck,
  reference: Library,
}

const ROLE_COLORS: Record<string, string> = {
  ags: '#4f6ef7',
  pi: '#4f6ef7',
  literature: '#8b5cf6',
  proposer: '#0ea5e9',
  experimenter: '#22c55e',
  writer: '#f59e0b',
  reviewer: '#ef4444',
  reference: '#6366f1',
}

function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    arxiv: 'Searching arXiv',
    semantic_scholar: 'Searching Semantic Scholar',
    read: 'Reading file',
    write: 'Writing file',
    edit: 'Editing file',
    ls: 'Listing files',
    grep: 'Searching content',
    bash: 'Running command',
    sub_agent: 'Running sub-agent',
    ask_user: 'Asking user',
    dispatch_agent: 'Dispatching agent',
    check_progress: 'Checking progress',
    // Legacy aliases
    file_read: 'Reading file',
    file_write: 'Writing file',
    file_edit: 'Editing file',
    file_list: 'Listing files',
    file_search: 'Searching content',
    bash_execute: 'Running command',
  }
  return labels[name] || name
}

interface Props {
  projectId: string
  active: boolean
  color?: string
}

export default function AgentActivityCard({ projectId, active, color = '#4f6ef7' }: Props): React.ReactElement | null {
  const [steps, setSteps] = useState<ActivityStep[]>([])
  const [, setChildren] = useState<ChildAgent[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const [currentRole, setCurrentRole] = useState<string>('')
  const wsRef = useRef<WebSocket | null>(null)
  const idCounter = useRef(0)

  useEffect(() => {
    if (!active) return

    // Reset state on new activation
    setSteps([])
    setChildren([])
    setCollapsed(false)
    setCurrentRole('')

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${proto}//${window.location.host}`

    let ws: WebSocket
    try {
      ws = new WebSocket(`${wsUrl}/ws/${projectId}`)
    } catch {
      return // WebSocket not available
    }
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { event: string; data: any }
        const { event: evtType, data } = msg

        const newStep: ActivityStep = {
          id: `step-${++idCounter.current}`,
          type: 'thinking',
          role: data.role || '',
          timestamp: Date.now(),
        }

        switch (evtType) {
          case 'agent.start':
            setCurrentRole(data.role || '')
            newStep.type = 'thinking'
            newStep.task = data.task
            setSteps((prev) => [...prev, newStep])
            break

          case 'agent.thinking':
            newStep.type = 'thinking'
            setSteps((prev) => {
              // Replace last thinking with new thinking (avoid stacking)
              const last = prev[prev.length - 1]
              if (last?.type === 'thinking' && last?.role === data.role) {
                return prev
              }
              return [...prev, newStep]
            })
            break

          case 'agent.tool_call':
            newStep.type = 'tool_call'
            newStep.tool = data.tool
            newStep.args = data.args
            setSteps((prev) => {
              // Replace preceding "thinking" for same role
              const filtered = prev.filter((s) => !(s.type === 'thinking' && s.role === data.role))
              return [...filtered, newStep]
            })
            break

          case 'agent.tool_result':
            newStep.type = 'tool_result'
            newStep.tool = data.tool
            newStep.success = data.success
            newStep.summary = data.summary
            newStep.error = data.error
            // Update the preceding tool_call to show result
            setSteps((prev) => {
              return prev.map((s) => {
                if (s.type === 'tool_call' && s.tool === data.tool && !s.success) {
                  return { ...s, success: data.success, summary: data.summary, error: data.error }
                }
                return s
              })
            })
            break

          case 'agent.dispatch':
            newStep.type = 'dispatch'
            newStep.childRole = data.child
            newStep.task = data.task
            setSteps((prev) => [...prev, newStep])
            setChildren((prev) => [...prev, {
              role: data.child,
              task: data.task || '',
              steps: [],
              done: false,
            }])
            break

          case 'agent.done':
            newStep.type = 'done'
            newStep.success = data.success
            newStep.duration = data.duration
            newStep.steps = data.steps
            // If it's a child agent finishing
            setChildren((prev) => prev.map((c) => {
              if (c.role === data.role && !c.done) {
                return { ...c, done: true }
              }
              return c
            }))
            setSteps((prev) => [...prev, newStep])
            break

          case 'agent.error':
            newStep.type = 'error'
            newStep.error = data.error
            setSteps((prev) => [...prev, newStep])
            break
        }
      } catch {
        // ignore parse errors
      }
    }

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
      wsRef.current = null
    }
  }, [projectId, active])

  if (!active) return null

  const roleColor = ROLE_COLORS[currentRole] || color
  const RoleIcon = ROLE_ICONS[currentRole] || Bot
  const isDone = steps.some((s) => s.type === 'done' && s.role === currentRole)
  const lastDone = [...steps].reverse().find((s) => s.type === 'done')

  return (
    <div style={{
      margin: '8px 0', borderRadius: 10, border: `1px solid ${roleColor}25`,
      background: `${roleColor}04`, overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'pointer', userSelect: 'none',
          borderBottom: collapsed ? 'none' : `1px solid ${roleColor}15`,
        }}
      >
        <div style={{
          width: 24, height: 24, borderRadius: 6, display: 'flex',
          alignItems: 'center', justifyContent: 'center', background: `${roleColor}12`,
        }}>
          <RoleIcon size={13} color={roleColor} strokeWidth={2} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: roleColor, flex: 1 }}>
          {currentRole ? `${currentRole.charAt(0).toUpperCase()}${currentRole.slice(1)} Agent` : 'Agent'}
        </span>
        {!isDone && (
          <Loader2 size={13} color={roleColor} style={{ animation: 'spin 1s linear infinite' }} />
        )}
        {isDone && lastDone && (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {lastDone.duration}s / {lastDone.steps} steps
          </span>
        )}
        {isDone && <CheckCircle2 size={13} color="#22c55e" />}
        {collapsed ? <ChevronRight size={13} color="var(--text-tertiary)" /> : <ChevronDown size={13} color="var(--text-tertiary)" />}
      </div>

      {/* Steps */}
      {!collapsed && (
        <div style={{ padding: '4px 12px 8px', maxHeight: 300, overflowY: 'auto' }}>
          {steps.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 11, color: 'var(--text-tertiary)' }}>
              <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
              <span>Agent is working...</span>
            </div>
          )}
          {steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  )
}

function StepRow({ step }: { step: ActivityStep }): React.ReactElement {
  const roleColor = ROLE_COLORS[step.role] || '#8b95a5'

  if (step.type === 'thinking') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 11, color: 'var(--text-tertiary)' }}>
        <Loader2 size={11} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
        <span>Thinking...</span>
      </div>
    )
  }

  if (step.type === 'tool_call') {
    const done = step.success !== undefined
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '3px 0' }}>
        <div style={{ marginTop: 1, flexShrink: 0 }}>
          {done
            ? (step.success
              ? <CheckCircle2 size={12} color="#22c55e" />
              : <AlertCircle size={12} color="#ef4444" />)
            : <Loader2 size={12} color={roleColor} style={{ animation: 'spin 1s linear infinite' }} />}
        </div>
        <div style={{ fontSize: 11, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
            {toolLabel(step.tool || '')}
          </span>
          {step.args && (
            <span style={{ color: 'var(--text-tertiary)', marginLeft: 4 }}>
              {step.args.length > 80 ? step.args.slice(0, 80) + '...' : step.args}
            </span>
          )}
          {step.error && (
            <div style={{ color: '#ef4444', fontSize: 10 }}>{step.error.slice(0, 100)}</div>
          )}
        </div>
      </div>
    )
  }

  if (step.type === 'dispatch') {
    const childColor = ROLE_COLORS[step.childRole || ''] || '#8b95a5'
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0',
        borderTop: '1px solid var(--border-light)', marginTop: 2,
      }}>
        <Zap size={12} color={childColor} />
        <span style={{ fontSize: 11, fontWeight: 600, color: childColor }}>
          Dispatching {step.childRole}
        </span>
        {step.task && (
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {step.task.slice(0, 60)}
          </span>
        )}
      </div>
    )
  }

  if (step.type === 'done') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0',
        fontSize: 11, color: step.success ? '#22c55e' : '#ef4444', fontWeight: 500,
      }}>
        {step.success ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
        <span>
          {step.role} {step.success ? 'completed' : 'failed'}
          {step.duration ? ` (${step.duration}s` : ''}
          {step.steps ? `, ${step.steps} steps)` : step.duration ? ')' : ''}
        </span>
      </div>
    )
  }

  if (step.type === 'error') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 11, color: '#ef4444' }}>
        <AlertCircle size={12} />
        <span>{step.error?.slice(0, 100)}</span>
      </div>
    )
  }

  return <></>
}
