import React, { useEffect, useState, useRef } from 'react'
import { Empty, Spin, message } from 'antd'
import { Search, FileText, RefreshCw, DollarSign, Cpu, ArrowDownUp, Download } from 'lucide-react'
import { api } from '../services/api'

interface TokenEntry {
  timestamp: string
  project_id: string
  agent_role: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  model?: string
}

interface TokenSummary {
  input_tokens: number
  output_tokens: number
  cost_usd: number
  calls: number
}

export default function Logs(): React.ReactElement {
  const [entries, setEntries] = useState<TokenEntry[]>([])
  const [summary, setSummary] = useState<TokenSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const [entriesData, summaryData] = await Promise.all([
        api.get<TokenEntry[]>('/api/logs/tokens/recent?limit=200'),
        api.get<TokenSummary>('/api/logs/tokens'),
      ])
      setEntries(entriesData)
      setSummary(summaryData)
    } catch {
      setEntries([])
      setSummary(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  const filtered = filter
    ? entries.filter(
        (e) =>
          e.project_id.toLowerCase().includes(filter.toLowerCase()) ||
          e.agent_role.toLowerCase().includes(filter.toLowerCase()) ||
          (e.model || '').toLowerCase().includes(filter.toLowerCase()),
      )
    : entries

  const roleColor = (role: string): string => {
    const colors: Record<string, string> = {
      coordinator: '#4f6ef7',
      literature: '#8b5cf6',
      proposer: '#0ea5e9',
      experimenter: '#22c55e',
      writer: '#f59e0b',
      reviewer: '#ef4444',
      reference: '#6366f1',
    }
    return colors[role] || 'var(--text-tertiary)'
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#6366f110', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={16} color="#6366f1" strokeWidth={2} />
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Logs & Usage</h2>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
              Token usage and API call history
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 12px',
              borderRadius: 8,
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              width: 220,
            }}
          >
            <Search size={14} color="var(--text-tertiary)" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by project, role..."
              style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, outline: 'none', color: 'var(--text)' }}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              if (filtered.length === 0) { message.info('No data to export'); return }
              const header = 'timestamp,project,agent,model,input_tokens,output_tokens,cost_usd'
              const rows = filtered.map(e => `${e.timestamp},${e.project_id},${e.agent_role},${e.model || ''},${e.input_tokens},${e.output_tokens},${e.cost_usd}`)
              const csv = [header, ...rows].join('\n')
              const blob = new Blob([csv], { type: 'text/csv' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a'); a.href = url; a.download = `openags-logs-${new Date().toISOString().slice(0,10)}.csv`; a.click()
              URL.revokeObjectURL(url)
              message.success('CSV exported')
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px',
              border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)',
              cursor: 'pointer', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)',
            }}
          >
            <Download size={13} />
            CSV
          </button>
          <button
            type="button"
            onClick={() => void fetchLogs()}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px',
              border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)',
              cursor: 'pointer', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)',
            }}
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <SummaryCard
            icon={<ArrowDownUp size={15} color="#4f6ef7" />}
            label="Total Calls"
            value={String(summary.calls)}
            color="#4f6ef7"
          />
          <SummaryCard
            icon={<Cpu size={15} color="#22c55e" />}
            label="Input Tokens"
            value={formatNumber(summary.input_tokens)}
            color="#22c55e"
          />
          <SummaryCard
            icon={<Cpu size={15} color="#8b5cf6" />}
            label="Output Tokens"
            value={formatNumber(summary.output_tokens)}
            color="#8b5cf6"
          />
          <SummaryCard
            icon={<DollarSign size={15} color="#f59e0b" />}
            label="Total Cost"
            value={`$${summary.cost_usd.toFixed(4)}`}
            color="#f59e0b"
          />
        </div>
      )}

      {/* Entries table */}
      <div
        ref={containerRef}
        style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          maxHeight: 'calc(100vh - 300px)',
          overflow: 'auto',
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: 40 }}>
            <Empty description={entries.length === 0 ? 'No usage data yet. Start chatting with agents to see logs here.' : 'No matching entries'} />
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Project</th>
                <th style={thStyle}>Agent</th>
                <th style={thStyle}>Model</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Input</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Output</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, i) => (
                <tr
                  key={i}
                  style={{
                    borderBottom: '1px solid var(--border-light)',
                    transition: 'background var(--transition)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <td style={tdStyle}>
                    <span style={{ color: 'var(--text-tertiary)', fontFamily: 'monospace', fontSize: 11 }}>
                      {formatTimestamp(entry.timestamp)}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 500, color: 'var(--text)' }}>{entry.project_id}</span>
                  </td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 10,
                        background: `${roleColor(entry.agent_role)}10`,
                        color: roleColor(entry.agent_role),
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {entry.agent_role}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                      {entry.model || '-'}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                    {formatNumber(entry.input_tokens)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                    {formatNumber(entry.output_tokens)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: '#f59e0b' }}>
                    ${entry.cost_usd.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
}

const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
}

function SummaryCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
}): React.ReactElement {
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: `${color}10`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{value}</div>
    </div>
  )
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return ts
  }
}
