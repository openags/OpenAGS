/**
 * VersionHistory — Overleaf-style version timeline for manuscript/proposal.
 *
 * Shows git commit history, diffs, labels, and restore.
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  Clock, Tag, RotateCcw, ChevronDown, ChevronRight,
  X, FileDiff, Check,
} from 'lucide-react'
import { api } from '../services/api'

interface CommitInfo {
  hash: string
  short_hash: string
  message: string
  date: string
  relative_date: string
  files_changed: number
  insertions: number
  deletions: number
  labels: string[]
}

interface DiffEntry {
  file: string
  status: string
  diff: string
}

interface Props {
  projectId: string
  module: string // 'manuscript' or 'proposal'
  onRestored?: () => void // callback after restore so editor reloads
}

export default function VersionHistory({ projectId, module, onRestored }: Props): React.ReactElement {
  const [commits, setCommits] = useState<CommitInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedHash, setExpandedHash] = useState<string | null>(null)
  const [diffEntries, setDiffEntries] = useState<DiffEntry[]>([])
  const [diffLoading, setDiffLoading] = useState(false)
  const [showLabelInput, setShowLabelInput] = useState(false)
  const [labelName, setLabelName] = useState('')
  const [labelHash, setLabelHash] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      // Init git repo if needed
      await api.post(`/api/projects/${projectId}/versions/${module}/init`, {})
      const data = await api.get<CommitInfo[]>(`/api/projects/${projectId}/versions/${module}/history?limit=50`)
      setCommits(data)
    } catch { /* ignore */ }
    setLoading(false)
  }, [projectId, module])

  useEffect(() => { void fetchHistory() }, [fetchHistory])

  useEffect(() => {
    if (message) {
      const t = window.setTimeout(() => setMessage(null), 3000)
      return () => clearTimeout(t)
    }
  }, [message])

  const loadDiff = async (hash: string) => {
    if (expandedHash === hash) { setExpandedHash(null); return }
    setExpandedHash(hash)
    setDiffLoading(true)
    try {
      const data = await api.get<{ entries: DiffEntry[] }>(`/api/projects/${projectId}/versions/${module}/diff/${hash}`)
      setDiffEntries(data.entries)
    } catch {
      setDiffEntries([])
    }
    setDiffLoading(false)
  }

  const handleRestore = async (hash: string) => {
    setRestoring(hash)
    try {
      await api.post(`/api/projects/${projectId}/versions/${module}/restore/${hash}`, {})
      setMessage({ text: `Restored to ${hash.slice(0, 7)}`, type: 'success' })
      await fetchHistory()
      onRestored?.()
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Restore failed', type: 'error' })
    }
    setRestoring(null)
  }

  const handleAddLabel = async () => {
    if (!labelName.trim()) return
    try {
      await api.post(`/api/projects/${projectId}/versions/${module}/label`, {
        name: labelName.trim(),
        hash: labelHash || undefined,
      })
      setMessage({ text: `Label "${labelName}" added`, type: 'success' })
      setLabelName('')
      setShowLabelInput(false)
      setLabelHash(null)
      await fetchHistory()
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Label failed', type: 'error' })
    }
  }

  const renderDiffLine = (line: string, idx: number) => {
    let bg = 'transparent'
    let color = '#333'
    if (line.startsWith('+') && !line.startsWith('+++')) { bg = '#dcfce7'; color = '#166534' }
    else if (line.startsWith('-') && !line.startsWith('---')) { bg = '#fee2e2'; color = '#991b1b' }
    else if (line.startsWith('@@')) { bg = '#eff6ff'; color = '#1e40af' }
    return (
      <div key={idx} style={{ background: bg, color, padding: '0 6px', fontFamily: 'monospace', fontSize: 11, lineHeight: '18px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {line}
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff', borderLeft: '1px solid #e2e5ea' }}>
      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #f0f2f5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={16} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>History</span>
          <span style={{ fontSize: 11, color: '#8b95a5', background: '#f0f2f5', borderRadius: 8, padding: '1px 6px' }}>
            {commits.length}
          </span>
        </div>
        <button onClick={() => { setShowLabelInput(true); setLabelHash(null) }}
          title="Label current version"
          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #e2e5ea', background: '#fff', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
          <Tag size={12} /> Label
        </button>
      </div>

      {/* Label input */}
      {showLabelInput && (
        <div style={{ padding: '8px 14px', borderBottom: '1px solid #f0f2f5', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input value={labelName} onChange={(e) => setLabelName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAddLabel() }}
            placeholder={labelHash ? `Label for ${labelHash.slice(0, 7)}` : 'Label current version (e.g. v1-draft)'}
            autoFocus
            style={{ flex: 1, padding: '5px 8px', border: '1px solid #e2e5ea', borderRadius: 4, fontSize: 12, outline: 'none' }} />
          <button onClick={handleAddLabel}
            style={{ padding: '5px 8px', borderRadius: 4, border: 'none', background: '#4f6ef7', color: '#fff', cursor: 'pointer', fontSize: 11 }}>
            <Check size={12} />
          </button>
          <button onClick={() => { setShowLabelInput(false); setLabelHash(null) }}
            style={{ padding: '5px 8px', borderRadius: 4, border: '1px solid #e2e5ea', background: '#fff', cursor: 'pointer', fontSize: 11 }}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* Message */}
      {message && (
        <div style={{
          padding: '6px 14px', fontSize: 12,
          background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
          color: message.type === 'success' ? '#16a34a' : '#dc2626',
        }}>
          {message.text}
        </div>
      )}

      {/* Commit timeline */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#8b95a5', fontSize: 12 }}>Loading history...</div>
        ) : commits.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#8b95a5', fontSize: 12 }}>No versions yet. Save a file to create the first version.</div>
        ) : (
          commits.map((commit, idx) => {
            const isExpanded = expandedHash === commit.hash
            const isFirst = idx === 0
            return (
              <div key={commit.hash}>
                {/* Labels for this commit */}
                {commit.labels.map((label) => (
                  <div key={label} style={{ padding: '4px 14px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 14, display: 'flex', justifyContent: 'center' }}>
                      <Tag size={11} color="#f59e0b" />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b', background: '#fffbeb', padding: '1px 6px', borderRadius: 4 }}>
                      {label}
                    </span>
                  </div>
                ))}

                {/* Commit row */}
                <div
                  onClick={() => loadDiff(commit.hash)}
                  style={{
                    padding: '8px 14px', cursor: 'pointer',
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    background: isExpanded ? '#f8f9fc' : 'transparent',
                    borderLeft: isFirst ? '3px solid #4f6ef7' : '3px solid transparent',
                  }}>
                  {/* Timeline dot */}
                  <div style={{ paddingTop: 3 }}>
                    {isExpanded ? <ChevronDown size={13} color="#4f6ef7" /> : <ChevronRight size={13} color="#8b95a5" />}
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3, color: '#333' }}>
                      {commit.message}
                    </div>
                    <div style={{ fontSize: 11, color: '#8b95a5', marginTop: 2, display: 'flex', gap: 8 }}>
                      <span>{commit.relative_date}</span>
                      {commit.files_changed > 0 && (
                        <span>
                          {commit.files_changed} file{commit.files_changed !== 1 ? 's' : ''}
                          {commit.insertions > 0 && <span style={{ color: '#16a34a' }}> +{commit.insertions}</span>}
                          {commit.deletions > 0 && <span style={{ color: '#dc2626' }}> -{commit.deletions}</span>}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded diff */}
                {isExpanded && (
                  <div style={{ padding: '0 14px 8px 37px' }}>
                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      {!isFirst && (
                        <button onClick={(e) => { e.stopPropagation(); void handleRestore(commit.hash) }}
                          disabled={restoring === commit.hash}
                          style={{
                            padding: '4px 8px', borderRadius: 4, border: '1px solid #e2e5ea',
                            background: '#fff', cursor: 'pointer', fontSize: 11,
                            display: 'flex', alignItems: 'center', gap: 3,
                            opacity: restoring === commit.hash ? 0.5 : 1,
                          }}>
                          <RotateCcw size={11} /> {restoring === commit.hash ? 'Restoring...' : 'Restore this version'}
                        </button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); setLabelHash(commit.hash); setShowLabelInput(true) }}
                        style={{
                          padding: '4px 8px', borderRadius: 4, border: '1px solid #e2e5ea',
                          background: '#fff', cursor: 'pointer', fontSize: 11,
                          display: 'flex', alignItems: 'center', gap: 3,
                        }}>
                        <Tag size={11} /> Label this
                      </button>
                    </div>

                    {/* Diff content */}
                    {diffLoading ? (
                      <div style={{ fontSize: 11, color: '#8b95a5' }}>Loading diff...</div>
                    ) : diffEntries.length === 0 ? (
                      <div style={{ fontSize: 11, color: '#8b95a5' }}>No file changes in this commit.</div>
                    ) : (
                      diffEntries.map((entry) => (
                        <div key={entry.file} style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <FileDiff size={12} />
                            <span style={{
                              color: entry.status === 'A' ? '#16a34a' : entry.status === 'D' ? '#dc2626' : '#333',
                            }}>
                              {entry.status === 'A' ? 'Added' : entry.status === 'D' ? 'Deleted' : 'Modified'}:
                            </span>
                            {entry.file}
                          </div>
                          {entry.diff && (
                            <div style={{
                              border: '1px solid #e2e5ea', borderRadius: 4, overflow: 'auto',
                              maxHeight: 200, background: '#fafafa',
                            }}>
                              {entry.diff.split('\n').map(renderDiffLine)}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
