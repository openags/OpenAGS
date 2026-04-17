import React, { useEffect, useMemo, useState } from 'react'
import { Button, Segmented, message, Tag } from 'antd'
import {
  Download,
  FileArchive,
  FileText,
  Lightbulb,
  Loader2,
  Play,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react'
import { api } from '../services/api'

interface SubmitPanelProps {
  projectId: string
  projectName: string
}

type ModuleKey = 'manuscript' | 'proposal'

interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  size: number
  children: FileEntry[]
}

interface CompileResult {
  success: boolean
  pdf_path: string | null
  log: string
  errors: string[]
}

const MODULES: Array<{ key: ModuleKey; label: string; Icon: typeof FileText; color: string }> = [
  { key: 'manuscript', label: 'Manuscript', Icon: FileText, color: '#f59e0b' },
  { key: 'proposal', label: 'Proposal', Icon: Lightbulb, color: '#0ea5e9' },
]

function findFile(tree: FileEntry[], name: string): FileEntry | null {
  for (const e of tree) {
    if (!e.is_dir && e.name === name) return e
    if (e.is_dir) {
      const found = findFile(e.children, name)
      if (found) return found
    }
  }
  return null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export default function SubmitPanel({ projectId, projectName }: SubmitPanelProps): React.ReactElement {
  const [module, setModule] = useState<ModuleKey>('manuscript')
  const [tree, setTree] = useState<FileEntry[]>([])
  const [loadingTree, setLoadingTree] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null)
  const [showLog, setShowLog] = useState(false)

  const moduleMeta = MODULES.find((m) => m.key === module)!
  const ModuleIcon = moduleMeta.Icon

  const refreshTree = async (): Promise<void> => {
    setLoadingTree(true)
    try {
      const data = await api.get<FileEntry[]>(`/api/manuscript/${projectId}/tree?module=${module}`)
      setTree(data)
    } catch {
      setTree([])
    }
    setLoadingTree(false)
  }

  useEffect(() => {
    setCompileResult(null)
    setShowLog(false)
    void refreshTree()
  }, [projectId, module])

  const texEntry = useMemo(() => findFile(tree, 'main.tex'), [tree])
  const pdfEntry = useMemo(() => findFile(tree, 'main.pdf'), [tree])

  const handleCompile = async (): Promise<void> => {
    if (compiling) return
    setCompiling(true)
    setCompileResult(null)
    try {
      const result = await api.post<CompileResult>(
        `/api/manuscript/${projectId}/compile?module=${module}&path=main.tex`,
        {},
      )
      setCompileResult(result)
      setShowLog(true)
      if (result.success) {
        message.success('Compiled to PDF')
      } else {
        message.error(result.errors[0] || 'Compilation failed')
      }
      await refreshTree()
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unknown error'
      message.error(`Compile failed: ${detail}`)
      setCompileResult({ success: false, pdf_path: null, log: detail, errors: [detail] })
      setShowLog(true)
    } finally {
      setCompiling(false)
    }
  }

  const downloadBlob = async (url: string, filename: string): Promise<void> => {
    const token = window.localStorage.getItem('openags-auth-token')
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }

  const handleDownloadZip = async (): Promise<void> => {
    const url = `/api/manuscript/${projectId}/export?module=${module}&include_pdf=true`
    try {
      await downloadBlob(url, `${projectId}-${module}.zip`)
    } catch (err) {
      message.error(`Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleDownloadPdf = async (): Promise<void> => {
    if (!pdfEntry) {
      message.warning('No PDF yet — compile first')
      return
    }
    const url = `/api/manuscript/${projectId}/pdf/main.pdf?module=${module}&download=1`
    try {
      await downloadBlob(url, `${projectId}-${module}.pdf`)
    } catch (err) {
      message.error(`Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handlePreviewPdf = (): void => {
    if (!pdfEntry) return
    const url = `${window.location.origin}/api/manuscript/${projectId}/pdf/main.pdf?module=${module}`
    window.open(url, '_blank')
  }

  const handleCleanAux = async (): Promise<void> => {
    try {
      const result = await api.delete<{ count: number; removed: string[] }>(
        `/api/manuscript/${projectId}/aux?module=${module}`,
      )
      if (result.count === 0) {
        message.info('No build artifacts to clean')
      } else {
        message.success(`Removed ${result.count} file${result.count === 1 ? '' : 's'}`)
      }
      await refreshTree()
    } catch (err) {
      message.error(`Clean failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px', maxWidth: 960, margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: '#14b8a610', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Send size={18} color="#14b8a6" strokeWidth={2} />
        </div>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Submit</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-tertiary)' }}>
            Compile and export the LaTeX source for {projectName}.
          </p>
        </div>
      </div>

      {/* Module selector */}
      <div style={{ marginTop: 24, marginBottom: 18 }}>
        <Segmented
          value={module}
          onChange={(v) => setModule(v as ModuleKey)}
          options={MODULES.map(({ key, label, Icon, color }) => ({
            value: key,
            label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 6px' }}>
                <Icon size={14} color={color} strokeWidth={2} />
                <span style={{ fontWeight: 500 }}>{label}</span>
              </div>
            ),
          }))}
        />
      </div>

      {/* Source / PDF status card */}
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 18,
        background: 'var(--bg-card)',
        marginBottom: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <ModuleIcon size={18} color={moduleMeta.color} strokeWidth={2} />
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{moduleMeta.label}</span>
          <button
            onClick={() => void refreshTree()}
            title="Refresh"
            style={{
              marginLeft: 'auto', border: 'none', background: 'transparent',
              cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4,
              display: 'flex', alignItems: 'center', borderRadius: 4,
            }}
          >
            <RefreshCw size={14} className={loadingTree ? 'spin' : ''} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: 8, columnGap: 16, fontSize: 13 }}>
          <span style={{ color: 'var(--text-tertiary)' }}>Source</span>
          <span style={{ color: 'var(--text)', fontFamily: "'SF Mono', monospace", fontSize: 12 }}>
            {texEntry ? `${module}/main.tex` : <em style={{ color: '#ef4444' }}>main.tex not found — create one in the {moduleMeta.label} editor first</em>}
          </span>

          <span style={{ color: 'var(--text-tertiary)' }}>Compiled PDF</span>
          <span style={{ color: 'var(--text)' }}>
            {pdfEntry ? (
              <>
                <Tag color="green" style={{ marginRight: 8 }}>ready</Tag>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{formatBytes(pdfEntry.size)}</span>
                {' · '}
                <a onClick={handlePreviewPdf} style={{ cursor: 'pointer', fontSize: 12 }}>preview</a>
              </>
            ) : (
              <Tag>not compiled</Tag>
            )}
          </span>
        </div>

        {/* Action buttons */}
        <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button
            type="primary"
            disabled={!texEntry || compiling}
            onClick={() => void handleCompile()}
            icon={compiling
              ? <Loader2 size={14} className="spin" />
              : <Play size={14} />}
            style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {compiling ? 'Compiling…' : 'Compile PDF'}
          </Button>

          <Button
            disabled={!texEntry}
            onClick={() => void handleDownloadZip()}
            icon={<FileArchive size={14} />}
            style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            Download .zip
          </Button>

          <Button
            disabled={!pdfEntry}
            onClick={() => void handleDownloadPdf()}
            icon={<Download size={14} />}
            style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            Download PDF
          </Button>

          <Button
            onClick={() => void handleCleanAux()}
            icon={<Trash2 size={14} />}
            style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            Clean build artifacts
          </Button>
        </div>
      </div>

      {/* Compile result */}
      {compileResult && (
        <div style={{
          border: `1px solid ${compileResult.success ? '#22c55e40' : '#ef444440'}`,
          borderRadius: 12,
          background: compileResult.success ? '#f0fdf4' : '#fef2f2',
          padding: '12px 16px',
          marginBottom: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 13, fontWeight: 600,
              color: compileResult.success ? '#16a34a' : '#dc2626',
            }}>
              {compileResult.success ? '✓ Compilation succeeded' : '✗ Compilation failed'}
            </span>
            <span style={{ flex: 1 }} />
            <a onClick={() => setShowLog((v) => !v)} style={{ fontSize: 12, cursor: 'pointer' }}>
              {showLog ? 'Hide log' : 'Show log'}
            </a>
          </div>
          {compileResult.errors.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12, color: '#dc2626' }}>
              {compileResult.errors.slice(0, 5).map((e, i) => (
                <li key={i} style={{ fontFamily: "'SF Mono', monospace" }}>{e}</li>
              ))}
            </ul>
          )}
          {showLog && compileResult.log && (
            <pre style={{
              marginTop: 10, padding: 12, borderRadius: 6,
              background: '#1e293b', color: '#e2e8f0',
              fontSize: 11, fontFamily: "'SF Mono', monospace",
              maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap',
            }}>
              {compileResult.log}
            </pre>
          )}
        </div>
      )}

      {/* Help text */}
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text-secondary)' }}>Tips</strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
          <li>The .zip bundles every source the paper needs — <code>.tex</code>, <code>.bib</code>, <code>.cls</code>/<code>.sty</code>, figures, and subfolders referenced by <code>\input</code> / <code>\includegraphics</code> / <code>\bibliography</code>.</li>
          <li>Session files, agent prompts (<code>SOUL.md</code> etc.), and LaTeX aux files (<code>.aux</code>, <code>.log</code>, <code>.bbl</code>, <code>.synctex.gz</code>, …) are excluded automatically.</li>
          <li>The compiled <code>main.pdf</code> is included by default. Aux files are also hidden from the file tree — use <strong>Clean build artifacts</strong> to delete them from disk.</li>
          <li>If compilation fails, install TeX Live (or BasicTeX on macOS) and ensure <code>pdflatex</code> is on your PATH.</li>
        </ul>
      </div>

      {/* Spinner CSS */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  )
}
