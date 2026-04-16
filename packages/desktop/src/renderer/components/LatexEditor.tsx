/**
 * LatexEditor — Unified Overleaf/Prism-style LaTeX editor.
 *
 * Used by both Manuscript and Proposal sections.
 * Features: resizable 3-panel layout, file tree, CodeMirror editor,
 * PDF preview, version history, embedded AI chat, status bar.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import CodeEditor from './CodeEditor'
import VersionHistory from './VersionHistory'
import PdfViewer from './PdfViewer'
import {
  ChevronRight, ChevronDown, FileText, Folder, FolderOpen,
  Plus, FolderPlus, RefreshCw, Save, Play, Eye, EyeOff,
  Trash2, Pencil, PanelLeftClose, PanelLeftOpen, Clock,
  Download, X, File,
} from 'lucide-react'
import { api } from '../services/api'
import { useLocale } from '../services/i18n'

// ── Types ────────────────────────────────────────────

interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  size: number
  children: FileEntry[]
}

interface OpenTab { path: string; name: string }

interface Props {
  projectId: string
  projectName: string
  /** Which module directory: 'manuscript' or 'proposal' */
  module: string
  /** Chat panel rendered by Project.tsx, embedded inside the editor */
  chatPanel?: React.ReactNode
}

type InlineInput = {
  kind: 'create-file' | 'create-folder' | 'rename'
  parentPath: string
  oldPath?: string
  value: string
} | null

type DeleteConfirm = { path: string } | null

// ── Component ────────────────────────────────────────

export default function LatexEditor({ projectId, projectName: _projectName, module, chatPanel }: Props): React.ReactElement {
  const moduleParam = `module=${module}`
  const { t } = useLocale()

  // File tree
  const [tree, setTree] = useState<FileEntry[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [fileTreeCollapsed, setFileTreeCollapsed] = useState(false)

  // Tabs & editor
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [contents, setContents] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState<Record<string, boolean>>({})

  // PDF preview
  const [showPreview, setShowPreview] = useState(true)
  const [pdfWidth, setPdfWidth] = useState(400)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [compiling, setCompiling] = useState(false)
  const [compileLog, setCompileLog] = useState('')

  // History
  const [showHistory, setShowHistory] = useState(false)

  // Status
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [error, setError] = useState<string | null>(null)

  // Context menu & inline input
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; isDir: boolean } | null>(null)
  const [inlineInput, setInlineInput] = useState<InlineInput>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm>(null)
  const inlineInputRef = useRef<HTMLInputElement>(null)

  // ── Effects ──────────────────────────────────────

  useEffect(() => {
    if (inlineInput && inlineInputRef.current) {
      inlineInputRef.current.focus()
      if (inlineInput.kind === 'rename') {
        const dotIdx = inlineInput.value.lastIndexOf('.')
        inlineInputRef.current.setSelectionRange(0, dotIdx > 0 ? dotIdx : inlineInput.value.length)
      } else {
        inlineInputRef.current.select()
      }
    }
  }, [inlineInput])

  useEffect(() => {
    if (error) {
      const timer = window.setTimeout(() => setError(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [error])

  // ── Data loading ─────────────────────────────────

  const loadTree = useCallback(async () => {
    try {
      const data = await api.get<FileEntry[]>(`/api/manuscript/${projectId}/tree?${moduleParam}`)
      setTree(data)
    } catch { setTree([]) }
  }, [projectId, moduleParam])

  // Auto-compile flag — compile once on first mount
  const didAutoCompile = useRef(false)

  useEffect(() => {
    void loadTree()

    // Try to load existing PDF first
    const base = window.location.port === '3090' ? 'http://localhost:19836' : ''
    fetch(`${base}/api/manuscript/${projectId}/pdf/main.pdf?${moduleParam}&t=${Date.now()}`)
      .then(resp => resp.ok ? resp.blob() : null)
      .then(blob => {
        if (blob && blob.size > 0) {
          setPdfUrl(URL.createObjectURL(blob))
          setShowPreview(true)
        } else if (!didAutoCompile.current) {
          // No existing PDF — auto-compile
          didAutoCompile.current = true
          void compile()
        }
      })
      .catch(() => {
        // PDF fetch failed — auto-compile
        if (!didAutoCompile.current) {
          didAutoCompile.current = true
          void compile()
        }
      })
  }, [loadTree, projectId, moduleParam])

  // ── File operations ──────────────────────────────

  const openFile = async (filePath: string, name: string) => {
    if (name.endsWith('.pdf')) {
      try {
        if (pdfUrl?.startsWith('blob:')) URL.revokeObjectURL(pdfUrl)
        const base = window.location.port === '3090' ? 'http://localhost:19836' : ''
        const resp = await fetch(`${base}/api/manuscript/${projectId}/pdf/${filePath}?${moduleParam}&t=${Date.now()}`)
        if (resp.ok) { const blob = await resp.blob(); setPdfUrl(URL.createObjectURL(blob)); setShowPreview(true) }
      } catch { /* ignore */ }
      return
    }
    if (!openTabs.find(t => t.path === filePath)) setOpenTabs(prev => [...prev, { path: filePath, name }])
    setActiveTab(filePath)
    if (!(filePath in contents)) {
      try {
        const fc = await api.get<{ content: string }>(`/api/manuscript/${projectId}/file?path=${encodeURIComponent(filePath)}&${moduleParam}`)
        setContents(prev => ({ ...prev, [filePath]: fc.content }))
      } catch { setContents(prev => ({ ...prev, [filePath]: '' })) }
    }
  }

  const closeTab = (path: string) => {
    setOpenTabs(prev => prev.filter(t => t.path !== path))
    setDirty(prev => { const n = { ...prev }; delete n[path]; return n })
    setContents(prev => { const n = { ...prev }; delete n[path]; return n })
    if (activeTab === path) {
      const remaining = openTabs.filter(t => t.path !== path)
      setActiveTab(remaining.length > 0 ? remaining[remaining.length - 1].path : null)
    }
  }

  const saveFile = async (filePath: string) => {
    const content = contents[filePath]
    if (content === undefined) return
    setSaveStatus('saving')
    try {
      await api.put(`/api/manuscript/${projectId}/file?${moduleParam}`, { path: filePath, content })
      setDirty(prev => ({ ...prev, [filePath]: false }))
      const fileName = filePath.split('/').pop() || filePath
      await api.post(`/api/projects/${projectId}/versions/${module}/commit`, { message: `Update ${fileName}` }).catch(() => {})
      setSaveStatus('saved')
    } catch { setError(t('common.failed')); setSaveStatus('unsaved') }
  }

  // Resolve API base — always use real server, not Vite proxy
  const apiBase = window.location.port === '3090' ? 'http://localhost:19836' : ''

  const compile = async () => {
    setCompiling(true)
    try {
      if (activeTab) await saveFile(activeTab)
      const texFile = activeTab?.endsWith('.tex') ? activeTab : 'main.tex'
      const result = await api.post<{ success: boolean; pdf_path?: string; log: string; errors: string[] }>(
        `/api/manuscript/${projectId}/compile?path=${encodeURIComponent(texFile)}&${moduleParam}`, {})
      setCompileLog(result.log || '')
      if (result.success && result.pdf_path) {
        // Revoke old URL first, then set null to unmount PdfViewer cleanly
        if (pdfUrl?.startsWith('blob:')) URL.revokeObjectURL(pdfUrl)
        setPdfUrl(null)
        // Fetch new PDF after a tick (let PdfViewer unmount)
        await new Promise(r => setTimeout(r, 50))
        const pdfResp = await fetch(`${apiBase}/api/manuscript/${projectId}/pdf/${result.pdf_path}?${moduleParam}&t=${Date.now()}`)
        const blob = await pdfResp.blob()
        setPdfUrl(URL.createObjectURL(blob))
        setShowPreview(true)
      } else {
        setCompileLog((result.errors || []).join('\n') + '\n' + (result.log || ''))
      }
    } catch { setCompileLog('Compile request failed') }
    setCompiling(false)
  }

  // ── Inline create/rename/delete ──────────────────

  const commitCreate = async () => {
    if (!inlineInput || (inlineInput.kind !== 'create-file' && inlineInput.kind !== 'create-folder')) return
    const name = inlineInput.value.trim()
    if (!name) { setInlineInput(null); return }
    const isDir = inlineInput.kind === 'create-folder'
    const path = inlineInput.parentPath ? `${inlineInput.parentPath}/${name}` : name
    try {
      await api.post(`/api/manuscript/${projectId}/create?${moduleParam}`, { path, is_dir: isDir })
      await loadTree()
      if (!isDir) void openFile(path, name)
    } catch { setError(t('manuscript.createFailed')) }
    setInlineInput(null); setContextMenu(null)
  }

  const startCreate = (parentPath: string, isDir: boolean) => {
    setInlineInput({ kind: isDir ? 'create-folder' : 'create-file', parentPath, value: isDir ? '' : 'new.tex' })
    if (parentPath) setExpandedDirs(prev => new Set(prev).add(parentPath))
    setContextMenu(null)
  }

  const commitDelete = async () => {
    if (!deleteConfirm) return
    try {
      await api.delete(`/api/manuscript/${projectId}/file?path=${encodeURIComponent(deleteConfirm.path)}&${moduleParam}`)
      closeTab(deleteConfirm.path); await loadTree()
    } catch { setError(t('manuscript.deleteFailed')) }
    setDeleteConfirm(null); setContextMenu(null)
  }

  const startRename = (path: string) => {
    const name = path.split('/').pop() || ''
    setInlineInput({ kind: 'rename', parentPath: '', oldPath: path, value: name })
    setContextMenu(null)
  }

  const commitRename = async () => {
    if (!inlineInput || inlineInput.kind !== 'rename' || !inlineInput.oldPath) return
    const newName = inlineInput.value.trim()
    if (!newName) { setInlineInput(null); return }
    const oldPath = inlineInput.oldPath
    const parts = oldPath.split('/')
    parts[parts.length - 1] = newName
    const newPath = parts.join('/')
    try {
      await api.post(`/api/manuscript/${projectId}/rename?${moduleParam}`, { old_path: oldPath, new_path: newPath })
      await loadTree()
    } catch { setError(t('common.failed')) }
    setInlineInput(null)
  }

  const toggleDir = (path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path); else next.add(path)
      return next
    })
  }

  // ── SyncTeX jump handler ──────────────────────────

  const handleSyncTexJump = useCallback(async (file: string, line: number) => {
    // Open the file if not already open
    const name = file.split('/').pop() || file
    const alreadyOpen = openTabs.some(t => t.path === file)

    if (!alreadyOpen) {
      await openFile(file, name)
    }
    setActiveTab(file)

    // Wait for CodeMirror to mount/update, then scroll to line
    const delay = alreadyOpen ? 100 : 500
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openags-scroll-to-line', { detail: { file, line } }))
    }, delay)
  }, [openTabs])

  // ── Active content ───────────────────────────────

  const activeContent = activeTab ? contents[activeTab] || '' : ''

  // ── Render helpers ───────────────────────────────

  const renderInlineInput = (parentPath: string) => {
    if (!inlineInput || inlineInput.kind === 'rename' || inlineInput.parentPath !== parentPath) return null
    const isFolder = inlineInput.kind === 'create-folder'
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', marginBottom: 2 }}>
        {isFolder ? <Folder size={13} color="#f59e0b" /> : <FileText size={13} color="var(--accent)" />}
        <input ref={inlineInputRef} value={inlineInput.value}
          onChange={(e) => setInlineInput({ ...inlineInput, value: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') void commitCreate(); if (e.key === 'Escape') setInlineInput(null) }}
          onBlur={() => void commitCreate()}
          placeholder={isFolder ? 'Folder name' : 'File name'}
          style={{ flex: 1, border: '1px solid var(--accent)', borderRadius: 4, padding: '2px 6px', fontSize: 11, outline: 'none', background: 'var(--bg-card)', color: 'var(--text)' }} />
      </div>
    )
  }

  const renderTreeNode = (entry: FileEntry): React.ReactNode => {
    const isExpanded = expandedDirs.has(entry.path)
    const isActive = !entry.is_dir && activeTab === entry.path
    const isRenaming = inlineInput?.kind === 'rename' && inlineInput.oldPath === entry.path

    if (isRenaming) {
      return (
        <div key={entry.path} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', marginBottom: 2 }}>
          {entry.is_dir ? <Folder size={13} color="#f59e0b" /> : <FileText size={13} color="var(--accent)" />}
          <input ref={inlineInputRef} value={inlineInput!.value}
            onChange={(e) => setInlineInput({ ...inlineInput!, value: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') void commitRename(); if (e.key === 'Escape') setInlineInput(null) }}
            onBlur={() => void commitRename()}
            style={{ flex: 1, border: '1px solid var(--accent)', borderRadius: 4, padding: '2px 6px', fontSize: 11, outline: 'none', background: 'var(--bg-card)', color: 'var(--text)' }} />
        </div>
      )
    }

    return (
      <div key={entry.path}>
        <div
          onClick={() => entry.is_dir ? toggleDir(entry.path) : openFile(entry.path, entry.name)}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, path: entry.path, isDir: entry.is_dir }) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
            cursor: 'pointer', borderRadius: 6, fontSize: 12, marginBottom: 1,
            background: isActive ? 'var(--accent-medium, rgba(79,110,247,0.08))' : 'transparent',
            color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
            fontWeight: isActive ? 600 : 400,
            borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
          }}
          onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover, rgba(0,0,0,0.03))' }}
          onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
        >
          {entry.is_dir ? (
            <>
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {isExpanded ? <FolderOpen size={13} color="#f59e0b" /> : <Folder size={13} color="#f59e0b" />}
            </>
          ) : (
            <>
              <span style={{ width: 12 }} />
              <File size={13} color={entry.name.endsWith('.tex') ? 'var(--accent)' : entry.name.endsWith('.bib') ? '#22c55e' : 'var(--text-tertiary)'} />
            </>
          )}
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
        </div>
        {entry.is_dir && isExpanded && (
          <div style={{ paddingLeft: 12 }}>
            {renderInlineInput(entry.path)}
            {entry.children.map(renderTreeNode)}
          </div>
        )}
      </div>
    )
  }

  // ── Keyboard shortcuts ───────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (activeTab) void saveFile(activeTab)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        void compile()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  // ── Render ───────────────────────────────────────

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}
      onClick={() => { setContextMenu(null) }}>

      {/* ── Toolbar ─────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
        borderBottom: '1px solid var(--border-light)', background: 'var(--bg-card)',
        flexShrink: 0,
      }}>
        {/* File tree toggle */}
        <button onClick={() => setFileTreeCollapsed(!fileTreeCollapsed)}
          style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}
          title={fileTreeCollapsed ? 'Show file tree' : 'Hide file tree'}>
          {fileTreeCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </button>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, flex: 1, overflow: 'auto', minWidth: 0 }}>
          {openTabs.map(tab => (
            <div key={tab.path} onClick={() => setActiveTab(tab.path)}
              style={{
                padding: '4px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
                background: activeTab === tab.path ? 'rgba(79,110,247,0.08)' : 'transparent',
                color: activeTab === tab.path ? 'var(--accent)' : 'var(--text-tertiary)',
                fontWeight: activeTab === tab.path ? 600 : 400,
                border: activeTab === tab.path ? '1px solid rgba(79,110,247,0.15)' : '1px solid transparent',
              }}>
              {dirty[tab.path] && <span style={{ color: '#f59e0b', fontSize: 8 }}>●</span>}
              {tab.name}
              <span onClick={(e) => { e.stopPropagation(); closeTab(tab.path) }}
                style={{ fontSize: 10, opacity: 0.5, cursor: 'pointer', marginLeft: 2, lineHeight: 1 }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '0.5' }}>
                ✕
              </span>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
          <button onClick={() => activeTab && void saveFile(activeTab)} disabled={!activeTab}
            style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', gap: 3, color: 'var(--text)' }}>
            <Save size={12} /> Save
          </button>
          <button onClick={() => void compile()} disabled={compiling}
            style={{ border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 11, cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
            <Play size={12} /> {compiling ? 'Compiling...' : 'Compile'}
          </button>
          <button onClick={() => setShowPreview(!showPreview)}
            style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer', background: showPreview ? 'var(--accent)' : 'var(--bg-card)', color: showPreview ? '#fff' : 'var(--text)', display: 'flex', alignItems: 'center', gap: 3 }}>
            {showPreview ? <EyeOff size={12} /> : <Eye size={12} />} PDF
          </button>
          <button onClick={() => setShowHistory(!showHistory)}
            style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer', background: showHistory ? 'var(--accent)' : 'var(--bg-card)', color: showHistory ? '#fff' : 'var(--text)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={12} /> History
          </button>

          {/* Save status */}
          <span style={{ fontSize: 10, padding: '2px 6px', color: saveStatus === 'saved' ? '#16a34a' : saveStatus === 'saving' ? '#f59e0b' : '#8b95a5' }}>
            {saveStatus === 'saved' ? '● Saved' : saveStatus === 'saving' ? '● Saving...' : '○ Unsaved'}
          </span>
        </div>
      </div>

      {/* ── Main 3-panel area ───────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

          {/* File Tree Panel */}
          {!fileTreeCollapsed && (
              <div style={{ width: 200, minWidth: 140, maxWidth: 300, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-light)', background: 'var(--bg-sidebar, var(--bg-card))' }}>
                  {/* File tree header */}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '8px 8px 6px', gap: 4, borderBottom: '1px solid var(--border-light)' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>Files</span>
                    <button onClick={() => startCreate('', false)} title="New file"
                      style={{ padding: 2, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', borderRadius: 4 }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)' }}>
                      <Plus size={14} />
                    </button>
                    <button onClick={() => startCreate('', true)} title="New folder"
                      style={{ padding: 2, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', borderRadius: 4 }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#f59e0b' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)' }}>
                      <FolderPlus size={14} />
                    </button>
                    <button onClick={() => void loadTree()} title="Refresh"
                      style={{ padding: 2, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', borderRadius: 4 }}>
                      <RefreshCw size={13} />
                    </button>
                  </div>

                  {/* File tree */}
                  <div style={{ flex: 1, overflow: 'auto', padding: 4 }}
                    onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, path: '', isDir: true }) }}>
                    {renderInlineInput('')}
                    {tree.map(renderTreeNode)}
                  </div>
                </div>
          )}

          {/* Editor Panel */}
          <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
              {activeTab ? (
                <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                  <CodeEditor
                    value={activeContent}
                    onChange={(val) => {
                      if (activeTab) {
                        setContents(prev => ({ ...prev, [activeTab]: val }))
                        setDirty(prev => ({ ...prev, [activeTab]: true }))
                        setSaveStatus('unsaved')
                      }
                    }}
                  />
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', flexDirection: 'column', gap: 8 }}>
                  <FileText size={32} strokeWidth={1.2} />
                  <div style={{ fontSize: 13 }}>Select a file from the tree to start editing</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Cmd+S to save, Cmd+Enter to compile</div>
                </div>
              )}

            {/* Chat panel — rendered by Project.tsx, passed as prop */}
            {chatPanel}
          </div>

          {/* PDF Preview Panel with drag-to-resize */}
          {showPreview && (
            <>
              {/* Drag handle to resize PDF width */}
              <div
                style={{ width: 5, cursor: 'col-resize', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', transition: 'background 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent, #4f6ef7)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  const startX = e.clientX
                  const startW = pdfWidth
                  const onMove = (ev: MouseEvent) => {
                    const delta = startX - ev.clientX
                    setPdfWidth(Math.max(200, Math.min(800, startW + delta)))
                  }
                  const onUp = () => {
                    document.removeEventListener('mousemove', onMove)
                    document.removeEventListener('mouseup', onUp)
                  }
                  document.addEventListener('mousemove', onMove)
                  document.addEventListener('mouseup', onUp)
                }}
              >
                <div style={{ width: 3, height: 30, borderRadius: 2, background: 'var(--border, #ddd)' }} />
              </div>

              <div style={{ width: pdfWidth, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>
                  {/* PDF header with close button */}
                  <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-card)' }}>
                    <span style={{ flex: 1 }}>PDF Preview</span>
                    {pdfUrl && (
                      <a href={pdfUrl} download={`${module}.pdf`} style={{ color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }} title="Download PDF">
                        <Download size={14} />
                      </a>
                    )}
                    {compileLog && (
                      <button onClick={() => {
                        const w = window.open('', '_blank')
                        if (w) { w.document.write(`<pre style="font-size:12px;padding:16px;font-family:monospace">${compileLog}</pre>`); w.document.title = 'Compile Log' }
                      }}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--text-tertiary)', textDecoration: 'underline' }}>
                        Logs
                      </button>
                    )}
                    <button onClick={() => setShowPreview(false)} title="Close PDF preview"
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 2, display: 'flex', alignItems: 'center', borderRadius: 4 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)' }}>
                      <X size={14} />
                    </button>
                  </div>

                  {/* PDF content — PDF.js with SyncTeX support */}
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <PdfViewer
                      url={pdfUrl}
                      projectId={projectId}
                      module={module}
                      onSyncTexJump={handleSyncTexJump}
                    />
                  </div>
              </div>
            </>
          )}

          {/* Version History Panel */}
          {showHistory && (
              <div style={{ width: 280, flexShrink: 0, height: '100%' }}>
                <VersionHistory projectId={projectId} module={module} onRestored={() => void loadTree()} />
              </div>
          )}
      </div>

      {/* ── Status bar ──────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '3px 12px',
        borderTop: '1px solid var(--border-light)', background: 'var(--bg-card)',
        fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0,
      }}>
        <span>{module.charAt(0).toUpperCase() + module.slice(1)}</span>
        {activeTab && <span>{activeTab}</span>}
        {activeTab && activeTab.endsWith('.tex') && <span>LaTeX</span>}
        {activeTab && activeTab.endsWith('.bib') && <span>BibTeX</span>}
        <span style={{ flex: 1 }} />
        <span style={{ color: saveStatus === 'saved' ? '#16a34a' : saveStatus === 'saving' ? '#f59e0b' : '#8b95a5' }}>
          {saveStatus === 'saved' ? '● Synced' : saveStatus === 'saving' ? '● Saving...' : '○ Unsaved changes'}
        </span>
      </div>

      {/* ── Error toast ─────────────────────────── */}
      {error && (
        <div style={{
          position: 'fixed', bottom: 40, right: 20, padding: '8px 16px',
          background: '#dc2626', color: '#fff', borderRadius: 8, fontSize: 12,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 9999,
        }}>
          {error}
        </div>
      )}

      {/* ── Context menu ────────────────────────── */}
      {contextMenu && (
        <div style={{
          position: 'fixed', left: contextMenu.x, top: contextMenu.y,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          zIndex: 1001, minWidth: 150, padding: 4,
        }}
          onClick={(e) => e.stopPropagation()}>
          {contextMenu.isDir && (
            <>
              <div style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => startCreate(contextMenu.path, false)}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover, rgba(0,0,0,0.04))' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <Plus size={12} /> New File
              </div>
              <div style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => startCreate(contextMenu.path, true)}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover, rgba(0,0,0,0.04))' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <FolderPlus size={12} /> New Folder
              </div>
            </>
          )}
          {contextMenu.path && (
            <>
              <div style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => startRename(contextMenu.path)}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover, rgba(0,0,0,0.04))' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <Pencil size={12} /> Rename
              </div>
              <div style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626' }}
                onClick={() => { setDeleteConfirm({ path: contextMenu.path }); setContextMenu(null) }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.06)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <Trash2 size={12} /> Delete
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Delete confirmation ─────────────────── */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1002,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setDeleteConfirm(null)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, minWidth: 300, boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Delete file?</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Are you sure you want to delete <strong>{deleteConfirm.path}</strong>?
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteConfirm(null)}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', fontSize: 12 }}>
                Cancel
              </button>
              <button onClick={() => void commitDelete()}
                style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
