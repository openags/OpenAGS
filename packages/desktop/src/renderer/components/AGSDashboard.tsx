/**
 * AGSDashboard — pipeline visualization overlay.
 * Sits on top of the normal AGS chat view. Clickable stages navigate to modules.
 */

import React from 'react'
import {
  BookOpen, ChevronRight, FlaskConical, FileText, Lightbulb, SearchCheck,
} from 'lucide-react'

const STAGES = [
  { key: 'literature', label: 'Literature', Icon: BookOpen, color: '#8b5cf6' },
  { key: 'proposal', label: 'Proposal', Icon: Lightbulb, color: '#0ea5e9' },
  { key: 'experiments', label: 'Experiments', Icon: FlaskConical, color: '#22c55e' },
  { key: 'manuscript', label: 'Manuscript', Icon: FileText, color: '#f59e0b' },
  { key: 'review', label: 'Review', Icon: SearchCheck, color: '#ef4444' },
]

const STATUS_COLORS: Record<string, string> = {
  idle: '#8b95a5', pending: '#f59e0b', running: '#3b82f6',
  completed: '#22c55e', failed: '#ef4444', blocked: '#f97316',
  aborted: '#6b7280',
}

interface AGSDashboardProps {
  autoState: 'idle' | 'running' | 'paused'
  runningModule: string | null
  agentStatuses: Record<string, string>
  onNavigateModule: (module: string) => void
}

export default function AGSDashboard({
  autoState: _autoState, runningModule, agentStatuses, onNavigateModule,
}: AGSDashboardProps): React.ReactElement {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      padding: '10px 12px', margin: '0 12px 0', background: 'var(--bg-sidebar)',
      borderRadius: '0 0 10 10',
    }}>
      {STAGES.map((stage, i) => {
        const status = agentStatuses[stage.key] || 'idle'
        const statusColor = STATUS_COLORS[status] || '#8b95a5'
        const isRunning = runningModule === stage.key
        return (
          <React.Fragment key={stage.key}>
            {i > 0 && <ChevronRight size={14} color="var(--text-tertiary)" style={{ flexShrink: 0, margin: '0 1px' }} />}
            <div
              onClick={() => onNavigateModule(stage.key)}
              style={{
                flex: 1, padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
                background: isRunning ? `${stage.color}08` : 'var(--bg-card)',
                border: `1.5px solid ${isRunning ? stage.color : status === 'completed' ? '#22c55e' : 'var(--border)'}`,
                transition: 'all 0.15s',
              }}
              title={`${stage.label}: ${status}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                <stage.Icon size={11} color={stage.color} strokeWidth={2} />
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text)' }}>{stage.label}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%', background: statusColor,
                  animation: isRunning ? 'blink 1.5s infinite' : 'none',
                }} />
                <span style={{ fontSize: 9, color: statusColor, fontWeight: 500 }}>{status}</span>
              </div>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}
