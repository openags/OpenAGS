import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  ChevronDown,
  File,
  FileText,
  Folder,
  FolderOpen,
  Plus,
  FolderPlus,
  RefreshCw,
  Save,
  Play,
  Eye,
  EyeOff,
  X,
  Trash2,
  Pencil,
  PanelLeftClose,
  PanelLeftOpen,
  Check,
} from 'lucide-react'
import { api, BASE_URL } from '../services/api'
import { useLocale } from '../services/i18n'

interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  size: number
  children: FileEntry[]
}

interface OpenTab {
  path: string
  name: string
}

interface Props {
  projectId: string
  projectName: string
}

type InlineInput = {
  kind: 'create-file' | 'create-folder' | 'rename'
  parentPath: string
  oldPath?: string
  value: string
} | null

type DeleteConfirm = { path: string } | null

export default function ManuscriptEditor({ projectId, projectName }: Props): React.ReactElement {
  const { t } = useLocale()
  const [tree, setTree] = useState<FileEntry[]>([])
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [contents, setContents] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const [showPreview, setShowPreview] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [compiling, setCompiling] = useState(false)
  const [compileLog, setCompileLog] = useState('')
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; path: string; isDir: boolean
  } | null>(null)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [fileTreeCollapsed, setFileTreeCollapsed] = useState(false)
  const [inlineInput, setInlineInput] = useState<InlineInput>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm>(null)
  const [error, setError] = useState<string | null>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const inlineInputRef = useRef<HTMLInputElement>(null)

  // Auto-focus inline input
  useEffect(() => {
    if (inlineInput && inlineInputRef.current) {
      inlineInputRef.current.focus()
      if (inlineInput.kind === 'rename') {
        // Select name without extension
        const dotIdx = inlineInput.value.lastIndexOf('.')
        inlineInputRef.current.setSelectionRange(0, dotIdx > 0 ? dotIdx : inlineInput.value.length)
      } else {
        inlineInputRef.current.select()
      }
    }
  }, [inlineInput])

  // Auto-dismiss error
  useEffect(() => {
    if (error) {
      const timer = window.setTimeout(() => setError(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [error])

  const loadTree = useCallback(async () => {
    try {
      const data = await api.get<FileEntry[]>(`/api/manuscript/${projectId}/tree`)
      setTree(data)
    } catch {
      setTree([])
    }
  }, [projectId])

  useEffect(() => {
    void loadTree()
  }, [loadTree])

  const openFile = async (path: string, name: string) => {
    if (!openTabs.find(t => t.path === path)) {
      setOpenTabs(prev => [...prev, { path, name }])
    }
    setActiveTab(path)
    if (!(path in contents)) {
      try {
        const fc = await api.get<{ content: string }>(`/api/manuscript/${projectId}/file?path=${encodeURIComponent(path)}`)
        setContents(prev => ({ ...prev, [path]: fc.content }))
      } catch {
        setContents(prev => ({ ...prev, [path]: '' }))
      }
    }
  }

  const closeTab = (path: string) => {
    setOpenTabs(prev => prev.filter(t => t.path !== path))
    setDirty(prev => { const n = { ...prev }; delete n[path]; return n })
    setContents(prev => { const n = { ...prev }; delete n[path]; return n })
    if (activeTab === path) {
      setActiveTab(() => {
        const remaining = openTabs.filter(t => t.path !== path)
        return remaining.length > 0 ? remaining[remaining.length - 1].path : null
      })
    }
  }

  const saveFile = async (path: string) => {
    const content = contents[path]
    if (content === undefined) return
    try {
      await api.put(`/api/manuscript/${projectId}/file`, { path, content })
      setDirty(prev => ({ ...prev, [path]: false }))
    } catch {
      setError(t('common.failed'))
    }
  }

  const compile = async () => {
    setCompiling(true)
    try {
      if (activeTab) await saveFile(activeTab)
      const texFile = activeTab?.endsWith('.tex') ? activeTab : 'main.tex'
      const result = await api.post<{
        success: boolean; pdf_path?: string; log: string; errors: string[]
      }>(`/api/manuscript/${projectId}/compile?path=${encodeURIComponent(texFile)}`, {})
      setCompileLog(result.log || '')
      if (result.success && result.pdf_path) {
        // Revoke previous blob URL to avoid memory leaks
        if (pdfUrl && pdfUrl.startsWith('blob:')) {
          URL.revokeObjectURL(pdfUrl)
        }
        // Fetch PDF as blob to avoid Electron download dialog
        const pdfResp = await fetch(
          `${BASE_URL}/api/manuscript/${projectId}/pdf/${result.pdf_path}?t=${Date.now()}`
        )
        const blob = await pdfResp.blob()
        setPdfUrl(URL.createObjectURL(blob))
        setShowPreview(true)
      } else {
        setCompileLog((result.errors || []).join('\n') + '\n' + (result.log || ''))
      }
    } catch {
      setCompileLog('Compile request failed')
    }
    setCompiling(false)
  }

  // Inline create: commit the input
  const commitCreate = async () => {
    if (!inlineInput || (inlineInput.kind !== 'create-file' && inlineInput.kind !== 'create-folder')) return
    const name = inlineInput.value.trim()
    if (!name) { setInlineInput(null); return }
    const isDir = inlineInput.kind === 'create-folder'
    const path = inlineInput.parentPath ? `${inlineInput.parentPath}/${name}` : name
    try {
      await api.post(`/api/manuscript/${projectId}/create`, { path, is_dir: isDir })
      await loadTree()
      if (!isDir) void openFile(path, name)
    } catch {
      setError(t('manuscript.createFailed'))
    }
    setInlineInput(null)
    setContextMenu(null)
  }

  const startCreate = (parentPath: string, isDir: boolean) => {
    setInlineInput({
      kind: isDir ? 'create-folder' : 'create-file',
      parentPath,
      value: isDir ? '' : 'new.tex',
    })
    // Expand parent dir so the inline input is visible
    if (parentPath) {
      setExpandedDirs(prev => new Set(prev).add(parentPath))
    }
    setContextMenu(null)
  }

  const commitDelete = async () => {
    if (!deleteConfirm) return
    try {
      await api.delete(`/api/manuscript/${projectId}/file?path=${encodeURIComponent(deleteConfirm.path)}`)
      closeTab(deleteConfirm.path)
      await loadTree()
    } catch {
      setError(t('manuscript.deleteFailed'))
    }
    setDeleteConfirm(null)
    setContextMenu(null)
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
      await api.post(`/api/manuscript/${projectId}/rename`, { old_path: oldPath, new_path: newPath })
      setOpenTabs(prev => prev.map(t => t.path === oldPath ? { path: newPath, name: newName } : t))
      if (activeTab === oldPath) setActiveTab(newPath)
      if (oldPath in contents) {
        setContents(prev => {
          const n = { ...prev, [newPath]: prev[oldPath] }
          delete n[oldPath]
          return n
        })
      }
      await loadTree()
    } catch {
      setError(t('common.failed'))
    }
    setInlineInput(null)
  }

  const toggleDir = (path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!activeTab) return
    setContents(prev => ({ ...prev, [activeTab]: e.target.value }))
    setDirty(prev => ({ ...prev, [activeTab]: true }))
  }

  const handleEditorKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      if (activeTab) void saveFile(activeTab)
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = editorRef.current
      if (!ta || !activeTab) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const val = contents[activeTab] || ''
      const newVal = val.substring(0, start) + '  ' + val.substring(end)
      setContents(prev => ({ ...prev, [activeTab]: newVal }))
      setDirty(prev => ({ ...prev, [activeTab]: true }))
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2
      })
    }
  }

  // Inline input row for file tree
  const renderInlineInput = (parentPath: string) => {
    if (!inlineInput) return null
    if (inlineInput.kind === 'rename') return null
    if (inlineInput.parentPath !== parentPath) return null

    const isFolder = inlineInput.kind === 'create-folder'
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', marginBottom: 2,
      }}>
        {isFolder
          ? <Folder size={13} color="#f59e0b" />
          : <FileText size={13} color="#4f6ef7" />
        }
        <input
          ref={inlineInputRef}
          value={inlineInput.value}
          onChange={(e) => setInlineInput({ ...inlineInput, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commitCreate()
            if (e.key === 'Escape') setInlineInput(null)
          }}
          onBlur={() => void commitCreate()}
          placeholder={isFolder ? t('manuscript.enterFolderName') : t('manuscript.enterFileName')}
          style={{
            flex: 1, border: '1px solid var(--accent)', borderRadius: 4,
            padding: '2px 6px', fontSize: 11, outline: 'none',
            background: '#fff', color: 'var(--text)',
            boxShadow: '0 0 0 2px rgba(79,110,247,0.1)',
          }}
        />
      </div>
    )
  }

  const renderTreeNode = (entry: FileEntry): React.ReactNode => {
    const isExpanded = expandedDirs.has(entry.path)
    const isActive = !entry.is_dir && activeTab === entry.path
    const isRenaming = inlineInput?.kind === 'rename' && inlineInput.oldPath === entry.path

    if (isRenaming) {
      return (
        <div key={entry.path} style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', marginBottom: 2,
        }}>
          {entry.is_dir
            ? <Folder size={13} color="#f59e0b" />
            : <FileText size={13} color="#4f6ef7" />
          }
          <input
            ref={inlineInputRef}
            value={inlineInput!.value}
            onChange={(e) => setInlineInput({ ...inlineInput!, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitRename()
              if (e.key === 'Escape') setInlineInput(null)
            }}
            onBlur={() => void commitRename()}
            style={{
              flex: 1, border: '1px solid var(--accent)', borderRadius: 4,
              padding: '2px 6px', fontSize: 11, outline: 'none',
              background: '#fff', color: 'var(--text)',
              boxShadow: '0 0 0 2px rgba(79,110,247,0.1)',
            }}
          />
        </div>
      )
    }

    if (entry.is_dir) {
      return (
        <div key={entry.path}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
              fontSize: 12, color: 'var(--text-secondary)',
              background: 'transparent',
            }}
            onClick={() => toggleDir(entry.path)}
            onContextMenu={(e) => {
              e.preventDefault()
              setContextMenu({ x: e.clientX, y: e.clientY, path: entry.path, isDir: true })
            }}
          >
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {isExpanded ? <FolderOpen size={13} color="#f59e0b" /> : <Folder size={13} color="#f59e0b" />}
            <span>{entry.name}</span>
          </div>
          {isExpanded && (
            <div style={{ marginLeft: 14 }}>
              {renderInlineInput(entry.path)}
              {(entry.children || []).map(renderTreeNode)}
            </div>
          )}
        </div>
      )
    }

    const icon = entry.name.endsWith('.tex')
      ? <FileText size={13} color="#4f6ef7" />
      : entry.name.endsWith('.bib')
        ? <FileText size={13} color="#22c55e" />
        : <File size={13} color="var(--text-tertiary)" />

    return (
      <div
        key={entry.path}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
          fontSize: 12,
          color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
          background: isActive ? 'rgba(79,110,247,0.06)' : 'transparent',
          fontWeight: isActive ? 600 : 400,
        }}
        onClick={() => void openFile(entry.path, entry.name)}
        onContextMenu={(e) => {
          e.preventDefault()
          setContextMenu({ x: e.clientX, y: e.clientY, path: entry.path, isDir: false })
        }}
      >
        {icon}
        <span>{entry.name}</span>
      </div>
    )
  }

  const activeContent = activeTab ? (contents[activeTab] || '') : ''
  const isTexFile = activeTab?.endsWith('.tex')

  const highlightLaTeX = (text: string): string => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return esc(text)
      .replace(/(%.*)$/gm, '<span style="color:#9ca3af;font-style:italic">$1</span>')
      .replace(/(\\(?:begin|end))\{([^}]+)\}/g, '<span style="color:#059669">$1</span>{<span style="color:#059669">$2</span>}')
      .replace(/(\\[a-zA-Z@]+)/g, '<span style="color:#7c3aed">$1</span>')
      .replace(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g, '<span style="color:#d97706">$1</span>')
      .replace(/([{}])/g, '<span style="color:#dc2626">$1</span>')
  }

  const highlightRef = useRef<HTMLPreElement>(null)
  const syncScroll = () => {
    if (highlightRef.current && editorRef.current) {
      highlightRef.current.scrollTop = editorRef.current.scrollTop
      highlightRef.current.scrollLeft = editorRef.current.scrollLeft
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} onClick={() => { setContextMenu(null); setDeleteConfirm(null) }}>
      {/* Main editor area — NO separate header bar; controls are in tab bar */}
      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: fileTreeCollapsed
          ? (showPreview ? '36px 1fr 1fr' : '36px 1fr')
          : (showPreview ? '200px 1fr 1fr' : '200px 1fr'),
        overflow: 'hidden',
        transition: 'grid-template-columns 0.2s ease',
      }}>
        {/* File tree */}
        <div style={{
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-sidebar)',
          overflow: 'hidden',
        }}>
          {fileTreeCollapsed ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8, gap: 4 }}>
              <button
                onClick={() => setFileTreeCollapsed(false)}
                title={t('manuscript.showTree')}
                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-tertiary)' }}
              >
                <PanelLeftOpen size={14} />
              </button>
            </div>
          ) : (
            <>
              <div style={{
                padding: '8px 10px', borderBottom: '1px solid var(--border-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
              }}>
                <span>{t('manuscript.files')}</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  <button onClick={() => startCreate('', false)} title={t('manuscript.newFile')}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-tertiary)' }}>
                    <Plus size={13} />
                  </button>
                  <button onClick={() => startCreate('', true)} title={t('manuscript.newFolder')}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-tertiary)' }}>
                    <FolderPlus size={13} />
                  </button>
                  <button onClick={() => void loadTree()} title={t('manuscript.refresh')}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-tertiary)' }}>
                    <RefreshCw size={12} />
                  </button>
                  <button onClick={() => setFileTreeCollapsed(true)} title={t('manuscript.hideTree')}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-tertiary)' }}>
                    <PanelLeftClose size={12} />
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 4 }}
                   onContextMenu={(e) => {
                     e.preventDefault()
                     setContextMenu({ x: e.clientX, y: e.clientY, path: '', isDir: true })
                   }}>
                {renderInlineInput('')}
                {tree.map(renderTreeNode)}
              </div>
            </>
          )}
        </div>

        {/* Editor */}
        <div style={{ display: 'flex', flexDirection: 'column', borderRight: showPreview ? '1px solid var(--border)' : 'none' }}>
          {/* Tab bar with Save / Compile / Preview merged in */}
          <div style={{
            display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-light)',
            padding: '0 8px', minHeight: 34, gap: 2, overflow: 'auto',
          }}>
            <div style={{ display: 'flex', gap: 2, flex: 1 }}>
              {openTabs.map(tab => (
                <div key={tab.path}
                  onClick={() => setActiveTab(tab.path)}
                  style={{
                    padding: '4px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: activeTab === tab.path ? 'rgba(79,110,247,0.06)' : 'transparent',
                    color: activeTab === tab.path ? 'var(--accent)' : 'var(--text-tertiary)',
                    fontWeight: activeTab === tab.path ? 600 : 400,
                    border: activeTab === tab.path ? '1px solid rgba(79,110,247,0.12)' : '1px solid transparent',
                  }}>
                  {dirty[tab.path] && <span style={{ color: 'var(--yellow)' }}>●</span>}
                  {tab.name}
                  <span onClick={(e) => { e.stopPropagation(); closeTab(tab.path) }}
                    style={{ fontSize: 10, opacity: 0.5, cursor: 'pointer', marginLeft: 2 }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '0.5' }}>
                    ✕
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button onClick={() => activeTab && void saveFile(activeTab)} disabled={!activeTab}
                style={{
                  border: '1px solid var(--border)', borderRadius: 5,
                  padding: '3px 8px', fontSize: 11, cursor: 'pointer',
                  background: '#fff', display: 'flex', alignItems: 'center', gap: 3,
                  color: 'var(--text)',
                }}>
                <Save size={11} /> {t('manuscript.save')}
              </button>
              <button onClick={() => void compile()} disabled={compiling}
                style={{
                  border: 'none', borderRadius: 5,
                  padding: '3px 10px', fontSize: 11, cursor: 'pointer',
                  background: 'var(--accent)', color: '#fff', fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 3,
                }}>
                <Play size={11} /> {compiling ? t('manuscript.compiling') : t('manuscript.compile')}
              </button>
              <button
                onClick={() => setShowPreview(!showPreview)}
                style={{
                  border: '1px solid var(--border)', borderRadius: 5,
                  padding: '3px 8px', fontSize: 11, cursor: 'pointer',
                  background: showPreview ? 'var(--accent)' : '#fff',
                  color: showPreview ? '#fff' : 'var(--text)',
                  display: 'flex', alignItems: 'center', gap: 3,
                }}
              >
                {showPreview ? <EyeOff size={11} /> : <Eye size={11} />}
                {showPreview ? t('manuscript.hidePreview') : t('manuscript.preview')}
              </button>
            </div>
          </div>

          {/* Editor area */}
          {activeTab ? (
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              {isTexFile && (
                <pre
                  ref={highlightRef}
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: highlightLaTeX(activeContent) }}
                  style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    padding: '12px 14px', margin: 0,
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                    fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordWrap: 'break-word',
                    overflow: 'hidden', pointerEvents: 'none', tabSize: 2, color: 'transparent',
                  }}
                />
              )}
              <textarea
                ref={editorRef}
                value={activeContent}
                onChange={handleEditorChange}
                onKeyDown={handleEditorKeyDown}
                onScroll={syncScroll}
                spellCheck={false}
                style={{
                  position: 'relative', zIndex: 1,
                  width: '100%', height: '100%', border: 'none', outline: 'none', resize: 'none',
                  padding: '12px 14px',
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                  fontSize: 13, lineHeight: 1.6,
                  background: isTexFile ? 'transparent' : '#fff',
                  color: 'var(--text)',
                  caretColor: 'var(--text)', tabSize: 2,
                }}
              />
            </div>
          ) : (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-tertiary)', flexDirection: 'column', gap: 8,
            }}>
              <FileText size={32} strokeWidth={1.2} color="var(--text-tertiary)" style={{ opacity: 0.4 }} />
              <div style={{ fontSize: 13 }}>{t('manuscript.selectFile')}</div>
              <div style={{ fontSize: 11 }}>{t('manuscript.selectFileHint')}</div>
            </div>
          )}

          {/* Status bar */}
          <div style={{
            padding: '3px 12px', borderTop: '1px solid var(--border-light)',
            fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', gap: 14,
          }}>
            {activeTab && <span>{activeTab}</span>}
            {activeTab && dirty[activeTab] && <span style={{ color: 'var(--yellow)' }}>● {t('manuscript.unsaved')}</span>}
            {compileLog && (
              <span style={{ cursor: 'pointer', color: 'var(--accent)' }}
                    onClick={() => alert(compileLog)}>
                {t('manuscript.viewLog')}
              </span>
            )}
          </div>
        </div>

        {/* PDF Preview */}
        {showPreview && (
          <div style={{ display: 'flex', flexDirection: 'column', background: '#f9f9f9' }}>
            <div style={{
              padding: '8px 12px', borderBottom: '1px solid var(--border-light)',
              fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
            }}>
              {t('manuscript.pdfPreview')}
            </div>
            {pdfUrl ? (
              <embed src={pdfUrl} type="application/pdf" style={{ flex: 1, width: '100%', height: '100%' }} />
            ) : (
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-tertiary)', flexDirection: 'column', gap: 6,
              }}>
                <FileText size={28} strokeWidth={1.2} />
                <div style={{ fontSize: 12 }}>{t('manuscript.compileToSee')}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y,
            background: '#fff', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            zIndex: 1001, minWidth: 150, padding: 4,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.isDir && (
            <>
              <div style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                   onClick={() => startCreate(contextMenu.path, false)}
                   onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                   onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <Plus size={12} /> {t('manuscript.newFile')}
              </div>
              <div style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                   onClick={() => startCreate(contextMenu.path, true)}
                   onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                   onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <FolderPlus size={12} /> {t('manuscript.newFolder')}
              </div>
            </>
          )}
          {contextMenu.path && (
            <>
              <div style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                   onClick={() => startRename(contextMenu.path)}
                   onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                   onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <Pencil size={12} /> {t('manuscript.rename')}
              </div>
              <div style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}
                   onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ path: contextMenu.path }); setContextMenu(null) }}
                   onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                   onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <Trash2 size={12} /> {t('manuscript.delete')}
              </div>
            </>
          )}
        </div>
      )}

      {/* Delete confirmation overlay */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2000,
        }} onClick={() => setDeleteConfirm(null)}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: '20px 24px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)', minWidth: 300,
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>
              {t('manuscript.confirmDelete')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
              <code style={{ background: 'var(--bg-input)', padding: '2px 6px', borderRadius: 4 }}>
                {deleteConfirm.path}
              </code>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteConfirm(null)}
                style={{
                  padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)',
                  background: '#fff', fontSize: 12, cursor: 'pointer', color: 'var(--text)',
                }}>
                {t('manuscript.cancel')}
              </button>
              <button onClick={() => void commitDelete()}
                style={{
                  padding: '6px 14px', borderRadius: 6, border: 'none',
                  background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>
                {t('manuscript.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: '#ef4444', color: '#fff', padding: '8px 20px',
          borderRadius: 8, fontSize: 12, fontWeight: 600, zIndex: 3000,
          boxShadow: '0 4px 12px rgba(239,68,68,0.3)',
        }}>
          {error}
        </div>
      )}
    </div>
  )
}
