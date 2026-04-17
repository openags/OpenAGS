import React, { useState } from 'react'
import { Segmented, Tag, Tooltip } from 'antd'
import {
  Clapperboard,
  FileCode,
  FileVideo,
  Image as ImageIcon,
  Layers,
  Mic,
  Play,
  Presentation as PresentationIcon,
  Settings2,
  Sparkles,
  Volume2,
  Wand2,
} from 'lucide-react'

interface PresentationPanelProps {
  projectId: string
  projectName: string
}

type Tab = 'slides' | 'video'

/**
 * UI-only skeleton. Tech stack (Marp vs reveal.js vs Slidev; TTS provider;
 * video assembler) is intentionally undecided — buttons are disabled and
 * labels are neutral. Wire up once the user picks the approach.
 */
export default function PresentationPanel({ projectId, projectName }: PresentationPanelProps): React.ReactElement {
  const [tab, setTab] = useState<Tab>('slides')

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px', maxWidth: 1000, margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: '#ec489910', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <PresentationIcon size={18} color="#ec4899" strokeWidth={2} />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Presentation</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-tertiary)' }}>
            Author slides and record a narrated video for {projectName}.
          </p>
        </div>
        <Tag color="default" style={{ fontSize: 11 }}>Preview — implementation TBD</Tag>
      </div>

      {/* Tabs */}
      <div style={{ marginBottom: 20 }}>
        <Segmented
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            {
              value: 'slides',
              label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 6px' }}>
                  <Layers size={14} color="#0ea5e9" strokeWidth={2} />
                  <span style={{ fontWeight: 500 }}>Slides</span>
                </div>
              ),
            },
            {
              value: 'video',
              label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 6px' }}>
                  <Clapperboard size={14} color="#8b5cf6" strokeWidth={2} />
                  <span style={{ fontWeight: 500 }}>Video</span>
                </div>
              ),
            },
          ]}
        />
      </div>

      {tab === 'slides' ? <SlidesTab projectId={projectId} /> : <VideoTab projectId={projectId} />}
    </div>
  )
}

// ── Slides tab ────────────────────────────────────────────────────────────

function SlidesTab({ projectId: _projectId }: { projectId: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Source card */}
      <Card
        icon={<FileCode size={18} color="#0ea5e9" strokeWidth={2} />}
        title="Slides source"
        subtitle="Markdown / HTML authored by you or the agent."
        right={<Tag>not created</Tag>}
      >
        <Field label="Format">
          <Tag color="default">TBD</Tag>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 8 }}>
            Marp, reveal.js, Slidev — to be decided.
          </span>
        </Field>
        <Field label="File">
          <code style={codeStyle}>presentation/slides.md</code>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 8 }}>
            not created yet
          </span>
        </Field>
        <Field label="Figures">
          <code style={codeStyle}>presentation/figures/</code>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 8 }}>
            empty — reuse figures from manuscript/ when ready
          </span>
        </Field>
      </Card>

      {/* Compile / export placeholder */}
      <Card
        icon={<Sparkles size={18} color="#8b5cf6" strokeWidth={2} />}
        title="Compile & export"
        subtitle="Render slides.md to HTML / PDF / PNG-per-slide. Disabled until the rendering stack is chosen."
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <StubButton icon={<Play size={14} />} label="Compile HTML" />
          <StubButton icon={<FileCode size={14} />} label="Export PDF" />
          <StubButton icon={<ImageIcon size={14} />} label="Export PNG per slide" />
        </div>
        <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8, background: '#f8fafc', border: '1px dashed var(--border)', fontSize: 12, color: 'var(--text-tertiary)' }}>
          The compile pipeline is intentionally not wired up yet. Once we pick a
          renderer (Marp / reveal.js / Slidev / …) and agree on a template,
          these buttons will run the build and drop outputs into <code>presentation/build/</code>.
        </div>
      </Card>

      {/* Preview placeholder */}
      <Card
        icon={<Layers size={18} color="#10b981" strokeWidth={2} />}
        title="Preview"
        subtitle="Live slide preview — iframe appears here after the first compile."
      >
        <div style={{
          height: 260, borderRadius: 10,
          background: 'repeating-linear-gradient(45deg, #f8fafc, #f8fafc 10px, #f1f5f9 10px, #f1f5f9 20px)',
          border: '1px dashed var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-tertiary)', fontSize: 13,
        }}>
          No preview yet — compile the slides to render them here.
        </div>
      </Card>
    </div>
  )
}

// ── Video tab ─────────────────────────────────────────────────────────────

function VideoTab({ projectId: _projectId }: { projectId: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Narration script card */}
      <Card
        icon={<FileCode size={18} color="#f59e0b" strokeWidth={2} />}
        title="Narration script"
        subtitle="One section per slide. Authored by the agent from the manuscript or written by you."
        right={<Tag>not created</Tag>}
      >
        <Field label="File">
          <code style={codeStyle}>presentation/narration.md</code>
        </Field>
        <Field label="Slides covered">
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>0 / 0</span>
        </Field>
        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <StubButton icon={<Wand2 size={14} />} label="Draft from manuscript" />
          <StubButton icon={<Settings2 size={14} />} label="Edit script" />
        </div>
      </Card>

      {/* Voice card */}
      <Card
        icon={<Mic size={18} color="#ec4899" strokeWidth={2} />}
        title="Voice & speech"
        subtitle="Pick a TTS provider and voice. Per-slide audio clips are generated here."
      >
        <Field label="Provider">
          <Tag color="default">TBD</Tag>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 8 }}>
            ElevenLabs, OpenAI TTS, Azure, local (Piper) — to be decided.
          </span>
        </Field>
        <Field label="Voice">
          <Tag color="default">—</Tag>
        </Field>
        <Field label="Audio clips">
          <code style={codeStyle}>presentation/audio/</code>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 8 }}>
            empty
          </span>
        </Field>
        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <StubButton icon={<Volume2 size={14} />} label="Generate TTS" />
          <StubButton icon={<Play size={14} />} label="Preview audio" />
        </div>
      </Card>

      {/* Video assembly card */}
      <Card
        icon={<FileVideo size={18} color="#8b5cf6" strokeWidth={2} />}
        title="Video assembly"
        subtitle="Combine slides + per-slide audio into a narrated mp4."
      >
        <Field label="Output">
          <code style={codeStyle}>presentation/build/video.mp4</code>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 8 }}>
            not generated
          </span>
        </Field>
        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <StubButton icon={<Clapperboard size={14} />} label="Assemble video" />
          <StubButton icon={<Play size={14} />} label="Play video" />
        </div>
        <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8, background: '#faf5ff', border: '1px dashed #d8b4fe', fontSize: 12, color: '#6b21a8' }}>
          Video assembly depends on the slide renderer AND the TTS provider.
          Locked until both are chosen.
        </div>
      </Card>
    </div>
  )
}

// ── Primitives ────────────────────────────────────────────────────────────

function Card({ icon, title, subtitle, right, children }: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  right?: React.ReactNode
  children?: React.ReactNode
}): React.ReactElement {
  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 18,
      background: 'var(--bg-card)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: subtitle ? 4 : 12 }}>
        {icon}
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
        <span style={{ flex: 1 }} />
        {right}
      </div>
      {subtitle && (
        <p style={{ margin: '0 0 14px 0', fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
          {subtitle}
        </p>
      )}
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '120px 1fr',
      alignItems: 'center', rowGap: 6, columnGap: 16,
      fontSize: 13, marginBottom: 6,
    }}>
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ color: 'var(--text)', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
        {children}
      </span>
    </div>
  )
}

function StubButton({ icon, label }: { icon: React.ReactNode; label: string }): React.ReactElement {
  return (
    <Tooltip title="Not wired up yet — implementation TBD">
      <button
        type="button"
        disabled
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '7px 12px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--bg-sidebar)',
          fontSize: 13, color: 'var(--text-tertiary)',
          cursor: 'not-allowed', height: 34,
        }}
      >
        {icon}
        {label}
      </button>
    </Tooltip>
  )
}

const codeStyle: React.CSSProperties = {
  fontFamily: "'SF Mono', 'Fira Code', monospace",
  fontSize: 12,
  background: '#f3f4f6',
  padding: '2px 6px',
  borderRadius: 4,
  color: 'var(--text-secondary)',
}
