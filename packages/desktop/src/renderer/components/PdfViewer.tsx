/**
 * PdfViewer — PDF.js canvas + text layer with SyncTeX.
 *
 * - Canvas renders sharp PDF (Retina-aware)
 * - Official TextLayer enables text selection/copy
 * - Double-click on text layer triggers SyncTeX jump
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { TextLayer } from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

function getApiBase(): string {
  if (window.location.port === '3090') return 'http://localhost:19836'
  return `${window.location.protocol}//${window.location.host}`
}

interface Props {
  url: string | null
  projectId: string
  module: string
  pdfFileName?: string
  onSyncTexJump?: (file: string, line: number) => void
}

export default function PdfViewer({ url, projectId, module, pdfFileName = 'main.pdf', onSyncTexJump }: Props): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const loadTaskRef = useRef<pdfjsLib.PDFDocumentLoadingTask | null>(null)
  const pageContainersRef = useRef<Map<number, HTMLDivElement>>(new Map())

  // Load PDF
  useEffect(() => {
    if (!url) { setPdf(null); setNumPages(0); return }
    if (loadTaskRef.current) { loadTaskRef.current.destroy().catch(() => {}); loadTaskRef.current = null }

    setLoading(true)
    setError(null)
    const task = pdfjsLib.getDocument(url)
    loadTaskRef.current = task

    task.promise.then((doc) => {
      setPdf(doc)
      setNumPages(doc.numPages)
      setLoading(false)
    }).catch((err) => {
      if (String(err).includes('destroyed')) return
      setError(err instanceof Error ? err.message : 'Failed to load PDF')
      setLoading(false)
    })

    return () => { task.destroy().catch(() => {}); loadTaskRef.current = null }
  }, [url])

  // Fit PDF width to container
  const pageWidthRef = useRef(612)
  const fitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fitToWidth = useCallback(() => {
    // Debounce to avoid rapid re-renders during drag
    if (fitTimerRef.current) clearTimeout(fitTimerRef.current)
    fitTimerRef.current = setTimeout(() => {
      const w = containerRef.current?.clientWidth || 400
      const newScale = Math.min(Math.max((w - 32) / pageWidthRef.current, 0.4), 2.5)
      setScale(prev => {
        // Only update if meaningfully different (avoid infinite loops)
        if (Math.abs(prev - newScale) < 0.01) return prev
        return newScale
      })
    }, 100)
  }, [])

  // Auto-fit on load
  useEffect(() => {
    if (!pdf || !containerRef.current) return
    pdf.getPage(1).then((page) => {
      pageWidthRef.current = page.getViewport({ scale: 1.0 }).width
      fitToWidth()
    })
  }, [pdf, fitToWidth])

  // Re-fit when container resizes
  useEffect(() => {
    const el = containerRef.current
    if (!el || !pdf) return
    const observer = new ResizeObserver(() => { fitToWidth() })
    observer.observe(el)
    return () => { observer.disconnect(); if (fitTimerRef.current) clearTimeout(fitTimerRef.current) }
  }, [pdf, fitToWidth])

  // Render each page: canvas + text layer
  useEffect(() => {
    if (!pdf || numPages === 0) return
    const dpr = window.devicePixelRatio || 1

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const container = pageContainersRef.current.get(pageNum)
      if (!container) continue

      pdf.getPage(pageNum).then(async (page) => {
        const viewport = page.getViewport({ scale })
        const cssW = Math.floor(viewport.width)
        const cssH = Math.floor(viewport.height)

        // Set container size
        container.style.width = cssW + 'px'
        container.style.height = cssH + 'px'

        // --- Canvas ---
        let canvas = container.querySelector('canvas')
        if (!canvas) {
          canvas = document.createElement('canvas')
          canvas.style.display = 'block'
          canvas.style.position = 'absolute'
          canvas.style.top = '0'
          canvas.style.left = '0'
          container.appendChild(canvas)
        }
        // Reset canvas completely — forces fresh context, no stale transforms
        const pixelW = Math.floor(viewport.width * dpr)
        const pixelH = Math.floor(viewport.height * dpr)
        canvas.width = 0
        canvas.height = 0
        canvas.width = pixelW
        canvas.height = pixelH
        canvas.style.width = cssW + 'px'
        canvas.style.height = cssH + 'px'

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // Retina: use transform parameter so it composes correctly with PDF.js Y-flip
        const transform: [number, number, number, number, number, number] = [dpr, 0, 0, dpr, 0, 0]
        try { await page.render({ canvasContext: ctx, viewport, transform }).promise } catch { return }

        // --- Text layer ---
        let textDiv = container.querySelector('.textLayer') as HTMLDivElement | null
        if (textDiv) { textDiv.innerHTML = '' } else {
          textDiv = document.createElement('div')
          textDiv.className = 'textLayer'
          container.appendChild(textDiv)
        }

        const textContent = await page.getTextContent()
        const tl = new TextLayer({ textContentSource: textContent, container: textDiv, viewport })
        await tl.render()
      })
    }
  }, [pdf, numPages, scale])

  // SyncTeX on double-click
  const handleDblClick = useCallback(async (e: React.MouseEvent, pageNum: number) => {
    if (!onSyncTexJump || !pdf) return
    const container = pageContainersRef.current.get(pageNum)
    if (!container) return

    const page = await pdf.getPage(pageNum)
    const rawVP = page.getViewport({ scale: 1.0 })

    const rect = container.getBoundingClientRect()
    const normX = (e.clientX - rect.left) / rect.width
    const normY = (e.clientY - rect.top) / rect.height

    // SyncTeX uses top-down Y, same as screen
    const pdfX = normX * rawVP.width
    const pdfY = normY * rawVP.height

    setSyncStatus('Looking up source...')
    try {
      const resp = await fetch(`${getApiBase()}/api/manuscript/${projectId}/synctex?module=${module}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: pageNum, x: Math.round(pdfX), y: Math.round(pdfY), pdf: pdfFileName }),
      })
      if (resp.ok) {
        const data = await resp.json() as { file: string | null; line: number | null }
        if (data.file && data.line) {
          setSyncStatus(`→ ${data.file}:${data.line}`)
          onSyncTexJump(data.file, data.line)
        } else { setSyncStatus('No source at this position') }
      } else { setSyncStatus('SyncTeX failed') }
    } catch { setSyncStatus('SyncTeX unavailable') }
    window.setTimeout(() => setSyncStatus(null), 2500)
  }, [onSyncTexJump, projectId, module, pdfFileName, pdf])

  if (!url) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 12 }}>Click Compile to generate PDF</div>
      </div>
    )
  }
  if (loading) {
    return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>Loading PDF...</div>
  }
  if (error) {
    return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', fontSize: 12 }}>{error}</div>
  }

  return (
    <div ref={containerRef} style={{ height: '100%', overflow: 'auto', background: '#e8e8e8', padding: '8px 0', position: 'relative' }}>
      {/* Zoom */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
        <div style={{ display: 'flex', gap: 2, background: '#fff', borderRadius: 6, padding: '2px 4px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', alignItems: 'center' }}>
          <button onClick={() => setScale(s => Math.max(0.4, +(s - 0.15).toFixed(2)))}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 8px', color: '#333' }}>−</button>
          <span style={{ fontSize: 10, minWidth: 36, textAlign: 'center', color: '#666' }}>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(3, +(s + 0.15).toFixed(2)))}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 8px', color: '#333' }}>+</button>
        </div>
      </div>

      {/* Pages */}
      {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
        <div key={pageNum} style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <div
            ref={(el) => { if (el) pageContainersRef.current.set(pageNum, el) }}
            onDoubleClick={(e) => void handleDblClick(e, pageNum)}
            style={{
              position: 'relative', background: '#fff',
              boxShadow: '0 1px 6px rgba(0,0,0,0.1)', borderRadius: 2,
            }}
          />
        </div>
      ))}

      {numPages > 0 && (
        <div style={{ textAlign: 'center', padding: '4px 0 8px', fontSize: 10, color: '#999' }}>
          {numPages} page{numPages !== 1 ? 's' : ''} · Select text to copy · Double-click to jump to source
        </div>
      )}

      {syncStatus && (
        <div style={{ position: 'fixed', bottom: 50, left: '50%', transform: 'translateX(-50%)', zIndex: 9999 }}>
          <div style={{ background: '#333', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.25)' }}>
            {syncStatus}
          </div>
        </div>
      )}
    </div>
  )
}
