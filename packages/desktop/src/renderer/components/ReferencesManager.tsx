/**
 * ReferencesManager — mini-Zotero for per-project reference management.
 *
 * Quick-add methods:
 *  - Paste a DOI, arXiv ID, arXiv URL, or BibTeX anywhere → auto-detected
 *  - Drag & drop PDF files → uploaded + metadata prompt
 *  - Click "Add" for manual entry
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  BookOpen, Plus, Download, Trash2, ExternalLink, FileText,
  Search, Copy, Tag, Edit3, X, Check, Upload, Clipboard, Info, MessageSquare,
} from 'lucide-react'
import { api } from '../services/api'

interface Reference {
  id: string
  title: string
  authors: string[]
  year: number | null
  doi: string | null
  arxiv_id: string | null
  venue: string | null
  bibtex_key: string
  bibtex: string
  pdf_path: string | null
  url: string | null
  tags: string[]
  notes: string
  added_at: string
}

interface Props {
  projectId: string
}

type AddMode = 'smart' | 'bibtex' | 'manual'

// ── Smart detection ──────────────────────────────────

function detectInputType(text: string): { type: 'doi' | 'arxiv' | 'bibtex' | 'unknown'; value: string } {
  const trimmed = text.trim()

  // BibTeX entry
  if (trimmed.startsWith('@')) return { type: 'bibtex', value: trimmed }

  // DOI patterns: 10.xxxx/..., https://doi.org/10.xxxx/...
  const doiMatch = trimmed.match(/(?:https?:\/\/doi\.org\/|doi:\s*)(10\.\d{4,}\/[^\s]+)/i)
    || trimmed.match(/^(10\.\d{4,}\/[^\s]+)$/i)
  if (doiMatch) return { type: 'doi', value: doiMatch[1] }

  // arXiv patterns: 2401.12345, arXiv:2401.12345, https://arxiv.org/abs/2401.12345
  const arxivMatch = trimmed.match(/(?:arxiv(?:\.org\/(?:abs|pdf)\/)?:?\s*)?(\d{4}\.\d{4,5})/i)
  if (arxivMatch) return { type: 'arxiv', value: arxivMatch[1] }

  return { type: 'unknown', value: trimmed }
}

export default function ReferencesManager({ projectId }: Props): React.ReactElement {
  const [refs, setRefs] = useState<Reference[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [addMode, setAddMode] = useState<AddMode>('smart')
  const [smartInput, setSmartInput] = useState('')
  const [smartDetected, setSmartDetected] = useState<string | null>(null)
  const [bibtexInput, setBibtexInput] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')
  const [addSuccess, setAddSuccess] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingNotes, setEditingNotes] = useState<string | null>(null)
  const [notesValue, setNotesValue] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [showTips, setShowTips] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Manual entry fields
  const [manualTitle, setManualTitle] = useState('')
  const [manualAuthors, setManualAuthors] = useState('')
  const [manualYear, setManualYear] = useState('')
  const [manualVenue, setManualVenue] = useState('')
  const [manualDoi, setManualDoi] = useState('')

  const fetchRefs = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<Reference[]>(`/api/projects/${projectId}/references`)
      setRefs(data)
    } catch { /* ignore */ }
    setLoading(false)
  }, [projectId])

  useEffect(() => { void fetchRefs() }, [fetchRefs])

  // Smart detection as user types/pastes
  useEffect(() => {
    if (!smartInput.trim()) { setSmartDetected(null); return }
    const { type } = detectInputType(smartInput)
    if (type === 'doi') setSmartDetected('DOI detected — will fetch metadata from Semantic Scholar')
    else if (type === 'arxiv') setSmartDetected('arXiv ID detected — will fetch metadata from arXiv')
    else if (type === 'bibtex') setSmartDetected('BibTeX detected — will parse and import')
    else setSmartDetected(null)
  }, [smartInput])

  const filtered = refs.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.title.toLowerCase().includes(q)
      || r.authors.some((a) => a.toLowerCase().includes(q))
      || r.tags.some((t) => t.toLowerCase().includes(q))
      || r.bibtex_key.toLowerCase().includes(q)
      || (r.venue && r.venue.toLowerCase().includes(q))
  })

  // ── Smart add (auto-detect type) ──────────────────

  const handleSmartAdd = async () => {
    const { type, value } = detectInputType(smartInput)
    setAddError('')
    setAddSuccess('')
    setAddLoading(true)
    try {
      if (type === 'doi') {
        await api.post(`/api/projects/${projectId}/references`, { doi_lookup: value })
        setAddSuccess('Paper added via DOI lookup')
      } else if (type === 'arxiv') {
        await api.post(`/api/projects/${projectId}/references`, { arxiv_lookup: value })
        setAddSuccess('Paper added via arXiv lookup')
      } else if (type === 'bibtex') {
        const result = await api.post<{ added: number }>(`/api/projects/${projectId}/references/import-bibtex`, { bibtex: value })
        setAddSuccess(`Imported ${result.added} reference(s) from BibTeX`)
      } else {
        setAddError('Could not detect DOI, arXiv ID, or BibTeX. Try pasting a DOI like "10.1234/..." or arXiv ID like "2401.12345".')
        setAddLoading(false)
        return
      }
      setSmartInput('')
      setSmartDetected(null)
      await fetchRefs()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add'
      const match = msg.match(/\): (.+)$/)
      setAddError(match ? match[1] : msg)
    }
    setAddLoading(false)
  }

  const handleBibtexImport = async () => {
    setAddError('')
    setAddSuccess('')
    setAddLoading(true)
    try {
      const result = await api.post<{ added: number }>(`/api/projects/${projectId}/references/import-bibtex`, { bibtex: bibtexInput })
      setAddSuccess(`Imported ${result.added} reference(s)`)
      setBibtexInput('')
      await fetchRefs()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to import')
    }
    setAddLoading(false)
  }

  const handleManualAdd = async () => {
    setAddError('')
    setAddSuccess('')
    setAddLoading(true)
    try {
      await api.post(`/api/projects/${projectId}/references`, {
        title: manualTitle,
        authors: manualAuthors.split(',').map((a) => a.trim()).filter(Boolean),
        year: manualYear ? parseInt(manualYear, 10) : null,
        venue: manualVenue || null,
        doi: manualDoi || null,
      })
      setAddSuccess('Reference added')
      setManualTitle(''); setManualAuthors(''); setManualYear(''); setManualVenue(''); setManualDoi('')
      await fetchRefs()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add')
    }
    setAddLoading(false)
  }

  // ── Drag & drop PDF ────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true) }
  const handleDragLeave = () => setDragOver(false)
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)

    const files = Array.from(e.dataTransfer.files).filter((f) => f.name.endsWith('.pdf'))
    if (files.length === 0) return

    for (const file of files) {
      try {
        const buffer = await file.arrayBuffer()
        await fetch(`/api/projects/${projectId}/references/upload-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': file.name },
          body: buffer,
        })
        // Add a stub reference for the PDF (user can enrich later)
        const name = file.name.replace(/\.pdf$/i, '')
        // Try to detect arXiv ID from filename (e.g., 2401.12345.pdf)
        const arxivMatch = name.match(/(\d{4}\.\d{4,5})/)
        if (arxivMatch) {
          try {
            await api.post(`/api/projects/${projectId}/references`, {
              arxiv_lookup: arxivMatch[1],
              pdf_path: `papers/${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
            })
            continue
          } catch { /* fall through to stub */ }
        }
        await api.post(`/api/projects/${projectId}/references`, {
          title: name.replace(/[-_]/g, ' '),
          pdf_path: `papers/${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
        })
      } catch { /* ignore individual failures */ }
    }
    await fetchRefs()
  }

  // ── Global paste handler ───────────────────────────

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Only auto-add if not typing in an input/textarea
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
      // Only when this panel is visible
      if (!containerRef.current) return

      const text = e.clipboardData?.getData('text') || ''
      if (!text.trim()) return

      const { type } = detectInputType(text)
      if (type !== 'unknown') {
        e.preventDefault()
        setShowAdd(true)
        setAddMode('smart')
        setSmartInput(text.trim())
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  const handleDelete = async (refId: string) => {
    try {
      await api.delete(`/api/projects/${projectId}/references/${refId}`)
      setRefs((prev) => prev.filter((r) => r.id !== refId))
    } catch { /* ignore */ }
  }

  const handleSaveNotes = async (refId: string) => {
    try {
      await api.put(`/api/projects/${projectId}/references/${refId}`, { notes: notesValue })
      setRefs((prev) => prev.map((r) => r.id === refId ? { ...r, notes: notesValue } : r))
      setEditingNotes(null)
    } catch { /* ignore */ }
  }

  const chatAboutPaper = (ref: Reference) => {
    // Build a context message with the paper's metadata
    const parts = [`I'd like to discuss this paper:\n`]
    parts.push(`**${ref.title}**`)
    if (ref.authors.length > 0) parts.push(`Authors: ${ref.authors.join(', ')}`)
    if (ref.year) parts.push(`Year: ${ref.year}`)
    if (ref.venue) parts.push(`Venue: ${ref.venue}`)
    if (ref.doi) parts.push(`DOI: ${ref.doi}`)
    if (ref.arxiv_id) parts.push(`arXiv: ${ref.arxiv_id}`)
    if (ref.pdf_path) parts.push(`PDF: ${ref.pdf_path}`)
    parts.push(`\nCite key: \\cite{${ref.bibtex_key}}`)
    if (ref.notes) parts.push(`\nMy notes: ${ref.notes}`)
    parts.push(`\nPlease read this paper${ref.pdf_path ? ' (PDF is available in the papers directory)' : ''} and help me understand its key contributions, methodology, and how it relates to our research.`)

    // Dispatch event — Project.tsx listens and navigates to literature chat
    window.dispatchEvent(new CustomEvent('openags-chat-paper', {
      detail: { section: 'literature', message: parts.join('\n'), title: ref.title.slice(0, 40) },
    }))
  }

  const copyBibtex = (bibtex: string, id: string) => {
    navigator.clipboard.writeText(bibtex)
    setCopiedId(id)
    window.setTimeout(() => setCopiedId(null), 2000)
  }

  const exportBib = () => {
    window.open(`/api/projects/${projectId}/references/export-bibtex`, '_blank')
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: '1px solid #e2e5ea', borderRadius: 6,
    fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  }

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        padding: '20px 24px', height: '100%', overflow: 'auto', background: 'var(--bg-main)',
        position: 'relative',
        ...(dragOver ? { outline: '2px dashed #4f6ef7', outlineOffset: -4, background: '#f0f4ff' } : {}),
      }}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(79,110,247,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10, borderRadius: 8, pointerEvents: 'none',
        }}>
          <div style={{ textAlign: 'center', color: '#4f6ef7' }}>
            <Upload size={32} style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 14, fontWeight: 600 }}>Drop PDF files to add</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BookOpen size={20} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>References</h2>
          <span style={{ fontSize: 12, color: '#8b95a5', background: '#f0f2f5', borderRadius: 10, padding: '2px 8px' }}>
            {refs.length}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setShowTips(!showTips)} title="Quick tips"
            style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e5ea', background: showTips ? '#eef1f8' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <Info size={14} color={showTips ? '#4f6ef7' : '#8b95a5'} />
          </button>
          <button onClick={exportBib}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #e2e5ea', background: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Download size={14} /> Export .bib
          </button>
          <button onClick={() => { setShowAdd(true); setAddMode('smart'); setAddError(''); setAddSuccess('') }}
            style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#4f6ef7', color: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {/* Quick tips */}
      {showTips && (
        <div style={{ marginBottom: 14, padding: '12px 14px', background: '#f8f9fc', border: '1px solid #e2e5ea', borderRadius: 8, fontSize: 12, color: '#4a5568', lineHeight: 1.7 }}>
          <div style={{ fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clipboard size={13} /> Quick ways to add references:
          </div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            <li><strong>Paste a DOI</strong> (e.g. <code>10.1038/s41586-024-07421-0</code>) — metadata fetched automatically</li>
            <li><strong>Paste an arXiv ID or URL</strong> (e.g. <code>2401.12345</code> or <code>https://arxiv.org/abs/2401.12345</code>)</li>
            <li><strong>Paste BibTeX</strong> — parsed and imported instantly (supports multiple entries)</li>
            <li><strong>Drag & drop PDF files</strong> — stored in <code>literature/papers/</code>, arXiv ID auto-detected from filename</li>
            <li><strong>Clipboard shortcut</strong> — just <strong>Ctrl/Cmd+V</strong> anywhere on this page with a DOI/arXiv/BibTeX copied</li>
          </ul>
          <div style={{ marginTop: 6, color: '#6b7280' }}>
            All references are saved with BibTeX so your manuscript and proposal agents can cite accurately using <code>\cite{'{key}'}</code>.
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: '#8b95a5' }} />
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, author, tag, key..."
          style={{ ...inputStyle, paddingLeft: 30 }}
        />
      </div>

      {/* Add panel */}
      {showAdd && (
        <div style={{ marginBottom: 14, background: '#fff', border: '1px solid #e2e5ea', borderRadius: 10, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Add Reference</span>
            <X size={16} style={{ cursor: 'pointer', color: '#8b95a5' }} onClick={() => { setShowAdd(false); setAddError(''); setAddSuccess('') }} />
          </div>

          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {([['smart', 'Paste DOI / arXiv / BibTeX'], ['bibtex', 'Bulk BibTeX'], ['manual', 'Manual']] as [AddMode, string][]).map(([m, label]) => (
              <button key={m} onClick={() => { setAddMode(m); setAddError(''); setAddSuccess('') }}
                style={{
                  padding: '5px 10px', borderRadius: 4, border: '1px solid #e2e5ea',
                  background: addMode === m ? '#4f6ef7' : '#fff',
                  color: addMode === m ? '#fff' : '#333',
                  cursor: 'pointer', fontSize: 12, fontWeight: 500,
                }}>
                {label}
              </button>
            ))}
          </div>

          {/* Smart input */}
          {addMode === 'smart' && (
            <div>
              <input value={smartInput}
                onChange={(e) => setSmartInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && smartInput.trim()) void handleSmartAdd() }}
                placeholder="Paste DOI, arXiv ID, arXiv URL, or BibTeX entry..."
                autoFocus
                style={inputStyle} />
              {smartDetected && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Check size={12} /> {smartDetected}
                </div>
              )}
              <button onClick={handleSmartAdd} disabled={addLoading || !smartInput.trim()}
                style={{
                  marginTop: 10, padding: '8px 16px', borderRadius: 6, border: 'none',
                  background: (addLoading || !smartInput.trim()) ? '#a0aec0' : '#4f6ef7', color: '#fff',
                  cursor: (addLoading || !smartInput.trim()) ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500,
                }}>
                {addLoading ? 'Fetching...' : 'Add Reference'}
              </button>
            </div>
          )}

          {/* Bulk BibTeX */}
          {addMode === 'bibtex' && (
            <div>
              <textarea value={bibtexInput} onChange={(e) => setBibtexInput(e.target.value)}
                placeholder={'Paste one or more BibTeX entries:\n\n@article{key,\n  title = {Paper Title},\n  author = {Last, First},\n  year = {2024},\n}'}
                rows={8} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
              <button onClick={handleBibtexImport} disabled={addLoading || !bibtexInput.trim()}
                style={{
                  marginTop: 10, padding: '8px 16px', borderRadius: 6, border: 'none',
                  background: (addLoading || !bibtexInput.trim()) ? '#a0aec0' : '#4f6ef7', color: '#fff',
                  cursor: (addLoading || !bibtexInput.trim()) ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500,
                }}>
                {addLoading ? 'Importing...' : 'Import BibTeX'}
              </button>
            </div>
          )}

          {/* Manual */}
          {addMode === 'manual' && (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder="Title *" style={inputStyle} />
                <input value={manualAuthors} onChange={(e) => setManualAuthors(e.target.value)} placeholder="Authors (comma-separated)" style={inputStyle} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={manualYear} onChange={(e) => setManualYear(e.target.value)} placeholder="Year" style={{ ...inputStyle, width: '30%' }} />
                  <input value={manualVenue} onChange={(e) => setManualVenue(e.target.value)} placeholder="Venue / Journal" style={inputStyle} />
                </div>
                <input value={manualDoi} onChange={(e) => setManualDoi(e.target.value)} placeholder="DOI (optional)" style={inputStyle} />
              </div>
              <button onClick={handleManualAdd} disabled={addLoading || !manualTitle.trim()}
                style={{
                  marginTop: 10, padding: '8px 16px', borderRadius: 6, border: 'none',
                  background: (addLoading || !manualTitle.trim()) ? '#a0aec0' : '#4f6ef7', color: '#fff',
                  cursor: (addLoading || !manualTitle.trim()) ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500,
                }}>
                {addLoading ? 'Adding...' : 'Add Reference'}
              </button>
            </div>
          )}

          {addError && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: '#fef2f2', color: '#dc2626', fontSize: 12, borderRadius: 6 }}>
              {addError}
            </div>
          )}
          {addSuccess && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: '#f0fdf4', color: '#16a34a', fontSize: 12, borderRadius: 6 }}>
              {addSuccess}
            </div>
          )}
        </div>
      )}

      {/* Reference list */}
      {loading ? (
        <div style={{ color: '#8b95a5', textAlign: 'center', padding: 40 }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#8b95a5' }}>
          <BookOpen size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
          <p style={{ margin: 0, fontSize: 14 }}>{refs.length === 0 ? 'No references yet' : 'No matches'}</p>
          {refs.length === 0 && (
            <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.6 }}>
              <p style={{ margin: 0 }}>Paste a <strong>DOI</strong>, <strong>arXiv ID</strong>, or <strong>BibTeX</strong> to get started</p>
              <p style={{ margin: '4px 0 0' }}>Or drag & drop <strong>PDF files</strong> here</p>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((ref) => {
            const isExpanded = expandedId === ref.id
            return (
              <div key={ref.id}
                style={{
                  background: '#fff', border: '1px solid #e2e5ea', borderRadius: 8,
                  padding: '12px 14px', cursor: 'pointer', transition: 'box-shadow 0.15s',
                }}
                onClick={() => setExpandedId(isExpanded ? null : ref.id)}>

                {/* Title row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{ref.title}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
                      {ref.authors.slice(0, 3).join(', ')}
                      {ref.authors.length > 3 && ' et al.'}
                      {ref.year && ` (${ref.year})`}
                      {ref.venue && <span style={{ color: '#4f6ef7' }}> — {ref.venue}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginLeft: 8, flexShrink: 0 }}>
                    {ref.pdf_path && <FileText size={14} color="#4f6ef7" title="Has PDF" />}
                    {ref.doi && <span style={{ fontSize: 10, color: '#8b95a5', background: '#f0f2f5', borderRadius: 4, padding: '1px 5px' }}>DOI</span>}
                    {ref.arxiv_id && <span style={{ fontSize: 10, color: '#8b95a5', background: '#f0f2f5', borderRadius: 4, padding: '1px 5px' }}>arXiv</span>}
                  </div>
                </div>

                {/* Tags */}
                {ref.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                    {ref.tags.map((tag) => (
                      <span key={tag} style={{ fontSize: 10, padding: '1px 6px', background: '#eef1f8', color: '#4f6ef7', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Tag size={9} /> {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Expanded details */}
                {isExpanded && (
                  <div style={{ marginTop: 12, borderTop: '1px solid #f0f2f5', paddingTop: 10 }}
                    onClick={(e) => e.stopPropagation()}>

                    {/* Cite key */}
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                      <strong>Key:</strong>{' '}
                      <code style={{ background: '#f0f2f5', padding: '1px 4px', borderRadius: 3 }}>\cite{'{' + ref.bibtex_key + '}'}</code>
                    </div>

                    {/* Links */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      {ref.url && (
                        <a href={ref.url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: '#4f6ef7', display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
                          <ExternalLink size={12} /> Paper
                        </a>
                      )}
                      {ref.doi && (
                        <a href={`https://doi.org/${ref.doi}`} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: '#4f6ef7', display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
                          <ExternalLink size={12} /> DOI
                        </a>
                      )}
                      {ref.arxiv_id && (
                        <a href={`https://arxiv.org/abs/${ref.arxiv_id}`} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: '#4f6ef7', display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
                          <ExternalLink size={12} /> arXiv
                        </a>
                      )}
                      {ref.pdf_path && (
                        <span style={{ fontSize: 12, color: '#4f6ef7', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <FileText size={12} /> {ref.pdf_path}
                        </span>
                      )}
                    </div>

                    {/* BibTeX */}
                    <div style={{ position: 'relative', marginBottom: 8 }}>
                      <pre style={{
                        background: '#f8f9fc', border: '1px solid #e2e5ea', borderRadius: 6,
                        padding: '8px 10px', fontSize: 11, fontFamily: 'monospace',
                        whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: 150, margin: 0,
                      }}>
                        {ref.bibtex}
                      </pre>
                      <button onClick={() => copyBibtex(ref.bibtex, ref.id)}
                        style={{
                          position: 'absolute', top: 6, right: 6, padding: '3px 8px',
                          borderRadius: 4, border: '1px solid #e2e5ea', background: '#fff',
                          cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3,
                        }}>
                        {copiedId === ref.id ? <><Check size={11} color="#22c55e" /> Copied</> : <><Copy size={11} /> Copy</>}
                      </button>
                    </div>

                    {/* Notes */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        Notes
                        {editingNotes !== ref.id && (
                          <Edit3 size={11} style={{ cursor: 'pointer', color: '#8b95a5' }}
                            onClick={() => { setEditingNotes(ref.id); setNotesValue(ref.notes) }} />
                        )}
                      </div>
                      {editingNotes === ref.id ? (
                        <div>
                          <textarea value={notesValue} onChange={(e) => setNotesValue(e.target.value)}
                            rows={3} style={{ ...inputStyle, fontSize: 12, resize: 'vertical' }} />
                          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                            <button onClick={() => handleSaveNotes(ref.id)}
                              style={{ padding: '4px 10px', borderRadius: 4, border: 'none', background: '#4f6ef7', color: '#fff', cursor: 'pointer', fontSize: 11 }}>
                              Save
                            </button>
                            <button onClick={() => setEditingNotes(null)}
                              style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid #e2e5ea', background: '#fff', cursor: 'pointer', fontSize: 11 }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: ref.notes ? '#333' : '#8b95a5', fontStyle: ref.notes ? 'normal' : 'italic' }}>
                          {ref.notes || 'No notes'}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => chatAboutPaper(ref)}
                        style={{
                          padding: '4px 10px', borderRadius: 4, border: '1px solid #e2e5ea',
                          background: '#eef1f8', color: '#4f6ef7', cursor: 'pointer',
                          fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500,
                        }}>
                        <MessageSquare size={12} /> Chat about this paper
                      </button>
                      <button onClick={() => handleDelete(ref.id)}
                        style={{
                          padding: '4px 10px', borderRadius: 4, border: '1px solid #fee2e2',
                          background: '#fef2f2', color: '#dc2626', cursor: 'pointer',
                          fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                        <Trash2 size={12} /> Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
