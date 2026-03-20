/**
 * WorkflowDashboard — pure display component for workflow monitoring.
 * All state comes from props (managed by Project.tsx via WebSocket).
 */

import React from 'react'
import {
  BookOpen, ChevronRight, FlaskConical, FileText, Lightbulb,
  SearchCheck,
} from 'lucide-react'

const STAGES = [
  { key: 'literature', label: 'Literature', Icon: BookOpen, color: '#8b5cf6' },
  { key: 'proposal', label: 'Proposal', Icon: Lightbulb, color: '#0ea5e9' },
  { key: 'experiments', label: 'Experiments', Icon: FlaskConical, color: '#22c55e' },
  { key: 'manuscript', label: 'Manuscript', Icon: FileText, color: '#f59e0b' },
  { key: 'review', label: 'Review', Icon: SearchCheck, color: '#ef4444' },
]

const STATUS_COLORS: Record<string, string> = {
  idle: '#8b95a5',
  pending: '#f59e0b',
  running: '#3b82f6',
  completed: '#22c55e',
  failed: '#ef4444',
  blocked: '#f97316',
  aborted: '#6b7280',
  'not started': '#8b95a5',
}

interface WorkflowDashboardProps {
  projectId: string
  autoMode: boolean
  autoRunningModule: string | null
  agentStatuses: Record<string, string>
  decisionLog: string[]
  onNavigateModule?: (module: string) => void
}

export default function WorkflowDashboard({
  projectId,
  autoMode,
  autoRunningModule,
  agentStatuses,
  decisionLog,
  onNavigateModule,
}: WorkflowDashboardProps): React.ReactElement {
  const pipelineStatus = autoMode
    ? (autoRunningModule ? 'running' : 'waiting')
    : Object.values(agentStatuses).some(s => s === 'completed') ? 'has progress' : 'idle'

  return (
    <div style={{ padding: '20px 24px', overflow: 'auto', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--text)' }}>
          Dashboard
        </h2>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 12,
          background: autoMode ? '#3b82f618' : '#8b95a518',
          color: autoMode ? '#3b82f6' : '#8b95a5',
        }}>
          {autoMode ? (autoRunningModule ? `🤖 Running: ${autoRunningModule}` : '⏳ Evaluating...') : 'Manual mode'}
        </span>
      </div>

      {/* Pipeline */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        padding: '16px 12px', background: 'var(--bg-sidebar)',
        borderRadius: 12, border: '1px solid var(--border)', marginBottom: 16,
      }}>
        {STAGES.map((stage, i) => {
          const status = agentStatuses[stage.key] || 'idle'
          const statusColor = STATUS_COLORS[status] || '#8b95a5'
          const isRunning = autoRunningModule === stage.key

          return (
            <React.Fragment key={stage.key}>
              {i > 0 && <ChevronRight size={16} color="var(--text-tertiary)" style={{ flexShrink: 0, margin: '0 2px' }} />}
              <div
                onClick={() => onNavigateModule?.(stage.key)}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                  background: isRunning ? `${stage.color}08` : 'var(--bg-card)',
                  border: `1.5px solid ${isRunning ? stage.color : status === 'completed' ? '#22c55e' : 'var(--border)'}`,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)' }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
                title={`Click to open ${stage.label} chat`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <stage.Icon size={13} color={stage.color} strokeWidth={2} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{stage.label}</span>
                  {isRunning && <span style={{ fontSize: 9, animation: 'blink 1.5s infinite' }}>🤖</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: statusColor,
                    animation: isRunning ? 'blink 1.5s infinite' : 'none',
                  }} />
                  <span style={{ fontSize: 10, color: statusColor, fontWeight: 500 }}>{status}</span>
                </div>
              </div>
            </React.Fragment>
          )
        })}
      </div>

      {/* Decision Log */}
      <div style={{
        padding: '14px 16px', borderRadius: 10,
        border: '1px solid var(--border)', background: 'var(--bg-card)',
        maxHeight: 300, overflow: 'auto',
      }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px', color: 'var(--text)' }}>
          Decision Log
        </h3>
        {decisionLog.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {autoMode ? 'Waiting for first decision...' : 'Click ▶ Auto to start automated workflow'}
          </div>
        ) : (
          <div style={{ fontSize: 11, fontFamily: "'SF Mono', monospace", lineHeight: 1.6 }}>
            {decisionLog.map((entry, i) => (
              <div key={i} style={{
                color: entry.includes('[ERROR]') || entry.includes('[FAIL]') ? '#ef4444'
                  : entry.includes('[DONE]') ? '#22c55e'
                  : entry.includes('[DISPATCH]') || entry.includes('[START]') ? '#3b82f6'
                  : 'var(--text-secondary)',
              }}>
                {entry}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
