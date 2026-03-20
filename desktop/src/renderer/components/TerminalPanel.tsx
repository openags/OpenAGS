/**
 * TerminalPanel — embedded xterm.js terminal for CLI agents.
 *
 * Communicates via WebSocket to /shell endpoint (works in both Electron and browser).
 * No IPC dependency — same code runs everywhere.
 */

import React, { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { ChevronDown, ChevronUp, Terminal, RotateCcw } from 'lucide-react'

interface TerminalPanelProps {
  sessionId: string     // unique PTY key, e.g. "ai-scholar:literature"
  cwd: string           // working directory for the CLI
  command?: string      // CLI command (default: "claude")
  color?: string        // accent color for the header
  minimized?: boolean
  onToggleMinimize?: () => void
}

/** Derive WebSocket URL for /shell endpoint from current page location */
function getShellWsUrl(): string {
  const host = window.location.port === '5173' ? 'localhost:3001' : window.location.host
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${host}/shell`
}

export default function TerminalPanel({
  sessionId,
  cwd,
  command = 'claude',
  color = '#7c5cf7',
  minimized = false,
  onToggleMinimize,
}: TerminalPanelProps): React.ReactElement {
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [exited, setExited] = useState(false)

  useEffect(() => {
    if (minimized || !termRef.current) return

    // Create xterm.js terminal
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      lineHeight: 1.3,
      theme: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
        selectionBackground: '#585b7066',
        black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
        blue: '#89b4fa', magenta: '#cba6f7', cyan: '#94e2d5', white: '#bac2de',
        brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af', brightBlue: '#89b4fa', brightMagenta: '#cba6f7',
        brightCyan: '#94e2d5', brightWhite: '#a6adc8',
      },
      scrollback: 10000,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(termRef.current)
    requestAnimationFrame(() => fitAddon.fit())

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    // Connect WebSocket to /shell
    const ws = new WebSocket(getShellWsUrl())
    wsRef.current = ws

    ws.onopen = () => {
      // Send init message (like claudecodeui's shell protocol)
      ws.send(JSON.stringify({
        type: 'init',
        id: sessionId,
        cwd,
        command,
        cols: term.cols,
        rows: term.rows,
      }))
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)

      if (msg.type === 'output') {
        term.write(msg.data)
      } else if (msg.type === 'ready') {
        setConnected(true)
        setExited(false)
      } else if (msg.type === 'exit') {
        term.write(`\r\n\x1b[33m[Process exited with code ${msg.exitCode}]\x1b[0m\r\n`)
        setExited(true)
        setConnected(false)
      } else if (msg.type === 'error') {
        term.write(`\r\n\x1b[31m[Error: ${msg.error}]\x1b[0m\r\n`)
      }
    }

    ws.onclose = () => {
      setConnected(false)
    }

    // Forward keyboard input to PTY via WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }))
      }
    })

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit()
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'resize',
            cols: xtermRef.current.cols,
            rows: xtermRef.current.rows,
          }))
        }
      }
    })
    if (termRef.current) resizeObserver.observe(termRef.current)

    return () => {
      resizeObserver.disconnect()
      ws.close()
      term.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
      wsRef.current = null
    }
  }, [sessionId, cwd, command, minimized])

  const handleRestart = () => {
    // Close current WS → triggers PTY keepalive → re-mount will reconnect
    wsRef.current?.close()
    setExited(false)
    setConnected(false)
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', background: '#1e1e2e', overflow: 'hidden',
      ...(minimized ? { height: 32 } : { flex: 1, minHeight: 120 }),
    }}>
      {/* Header */}
      <div
        onClick={onToggleMinimize}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
          background: '#181825', cursor: 'pointer', userSelect: 'none', flexShrink: 0,
          borderBottom: minimized ? 'none' : '1px solid #313244',
        }}
      >
        <Terminal size={13} color={color} strokeWidth={2} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#cdd6f4', fontFamily: "'SF Mono', monospace" }}>
          {command}
        </span>
        {connected && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a6e3a1', flexShrink: 0 }} />}
        {exited && (
          <div
            onClick={(e) => { e.stopPropagation(); handleRestart() }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px',
              borderRadius: 4, background: '#45475a', cursor: 'pointer', fontSize: 11, color: '#cdd6f4',
            }}
          >
            <RotateCcw size={10} /> Restart
          </div>
        )}
        {minimized ? <ChevronUp size={14} color="#6c7086" /> : <ChevronDown size={14} color="#6c7086" />}
      </div>

      {/* Terminal body */}
      {!minimized && <div ref={termRef} style={{ flex: 1, padding: '4px 0', minHeight: 0 }} />}
    </div>
  )
}
