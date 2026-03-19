/**
 * CodeEditor — CodeMirror 6 based editor with LaTeX autocomplete.
 */

import React, { useEffect, useRef } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { bracketMatching, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { autocompletion, type CompletionContext, type Completion } from '@codemirror/autocomplete'

/** LaTeX command completions */
const LATEX_COMPLETIONS: Completion[] = [
  // Structure
  { label: '\\section', type: 'keyword', detail: 'Section heading', apply: '\\section{$}' },
  { label: '\\subsection', type: 'keyword', detail: 'Subsection heading', apply: '\\subsection{$}' },
  { label: '\\subsubsection', type: 'keyword', detail: 'Subsubsection', apply: '\\subsubsection{$}' },
  { label: '\\paragraph', type: 'keyword', detail: 'Paragraph heading', apply: '\\paragraph{$}' },
  // References
  { label: '\\cite', type: 'function', detail: 'Citation', apply: '\\cite{$}' },
  { label: '\\ref', type: 'function', detail: 'Reference', apply: '\\ref{$}' },
  { label: '\\label', type: 'function', detail: 'Label', apply: '\\label{$}' },
  { label: '\\eqref', type: 'function', detail: 'Equation ref', apply: '\\eqref{$}' },
  // Formatting
  { label: '\\textbf', type: 'function', detail: 'Bold', apply: '\\textbf{$}' },
  { label: '\\textit', type: 'function', detail: 'Italic', apply: '\\textit{$}' },
  { label: '\\emph', type: 'function', detail: 'Emphasis', apply: '\\emph{$}' },
  { label: '\\underline', type: 'function', detail: 'Underline', apply: '\\underline{$}' },
  // Environments
  { label: '\\begin{figure}', type: 'keyword', detail: 'Figure environment', apply: '\\begin{figure}[htbp]\n\\centering\n\\includegraphics[width=0.8\\textwidth]{$}\n\\caption{}\n\\label{fig:}\n\\end{figure}' },
  { label: '\\begin{table}', type: 'keyword', detail: 'Table environment', apply: '\\begin{table}[htbp]\n\\centering\n\\caption{$}\n\\begin{tabular}{lcc}\n\\toprule\n & Col 1 & Col 2 \\\\\n\\midrule\nRow 1 & & \\\\\n\\bottomrule\n\\end{tabular}\n\\label{tab:}\n\\end{table}' },
  { label: '\\begin{equation}', type: 'keyword', detail: 'Equation', apply: '\\begin{equation}\n$\n\\label{eq:}\n\\end{equation}' },
  { label: '\\begin{itemize}', type: 'keyword', detail: 'Bullet list', apply: '\\begin{itemize}\n\\item $\n\\end{itemize}' },
  { label: '\\begin{enumerate}', type: 'keyword', detail: 'Numbered list', apply: '\\begin{enumerate}\n\\item $\n\\end{enumerate}' },
  // Graphics
  { label: '\\includegraphics', type: 'function', detail: 'Include image', apply: '\\includegraphics[width=0.8\\textwidth]{$}' },
  // Math
  { label: '\\frac', type: 'function', detail: 'Fraction', apply: '\\frac{$}{}' },
  { label: '\\sqrt', type: 'function', detail: 'Square root', apply: '\\sqrt{$}' },
  { label: '\\sum', type: 'function', detail: 'Summation' },
  { label: '\\int', type: 'function', detail: 'Integral' },
  // Packages
  { label: '\\usepackage', type: 'keyword', detail: 'Use package', apply: '\\usepackage{$}' },
]

function latexCompletion(context: CompletionContext) {
  const before = context.matchBefore(/\\[a-zA-Z]*/)
  if (!before || (before.from === before.to && !context.explicit)) return null
  return {
    from: before.from,
    options: LATEX_COMPLETIONS,
  }
}

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language?: string
  readOnly?: boolean
}

export default function CodeEditor({ value, onChange, readOnly = false }: CodeEditorProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!containerRef.current) return

    const theme = EditorView.theme({
      '&': { height: '100%', fontSize: '13px' },
      '.cm-scroller': { overflow: 'auto', fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace" },
      '.cm-content': { padding: '8px 0' },
      '.cm-gutters': { background: 'var(--bg-sidebar)', border: 'none', color: 'var(--text-tertiary)' },
      '.cm-activeLineGutter': { background: 'var(--bg-hover)' },
      '.cm-activeLine': { background: 'rgba(79,110,247,0.04)' },
      '.cm-selectionBackground': { background: 'rgba(79,110,247,0.15) !important' },
      '.cm-cursor': { borderLeftColor: 'var(--accent)' },
    })

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        highlightSelectionMatches(),
        syntaxHighlighting(defaultHighlightStyle),
        autocompletion({ override: [latexCompletion] }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        theme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
        ...(readOnly ? [EditorState.readOnly.of(true)] : []),
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, []) // Only create once

  // Update content when value changes externally
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  return <div ref={containerRef} style={{ height: '100%', overflow: 'hidden' }} />
}
