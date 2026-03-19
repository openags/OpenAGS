/**
 * AgentConfigPanel — right-side drawer for editing a module's SOUL.md and skills.
 *
 * Appears within each project section (literature, manuscript, etc.)
 * when the user clicks the Agent config button in the header.
 */

import React, { useEffect, useState } from 'react'
import { message } from 'antd'
import {
  X,
  Save,
  Plus,
  Trash2,
  FileText,
  Sparkles,
  Loader2,
  ChevronRight,
  Bot,
  Pencil,
  Upload,
} from 'lucide-react'
import { api } from '../services/api'

interface SkillItem {
  name: string
  description: string
  roles: string[]
  tools: string[]
  triggers: string[]
  version: string
  source: string
  body: string
}

interface AgentConfig {
  soul: string
  soul_source: string
  skills: SkillItem[]
  global_skills_count: number
}

interface Props {
  projectId: string
  section: string
  color: string
  onClose: () => void
}

export default function AgentConfigPanel({ projectId, section, color, onClose }: Props): React.ReactElement {
  const [tab, setTab] = useState<'soul' | 'skills'>('soul')
  const [config, setConfig] = useState<AgentConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [soulText, setSoulText] = useState('')
  const [soulDirty, setSoulDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  // Skill editor state
  const [editingSkill, setEditingSkill] = useState<string | null>(null) // skill name or '__new__'
  const [skillForm, setSkillForm] = useState({ name: '', description: '', triggers: '', content: '' })
  const [skillSaving, setSkillSaving] = useState(false)
  const skillFileInputRef = React.useRef<HTMLInputElement>(null)

  const fetchConfig = async () => {
    setLoading(true)
    try {
      const data = await api.get<AgentConfig>(`/api/agent/${projectId}/${section}`)
      setConfig(data)
      setSoulText(data.soul)
      setSoulDirty(false)
    } catch {
      message.error('Failed to load agent config')
    }
    setLoading(false)
  }

  useEffect(() => { void fetchConfig() }, [projectId, section])

  const saveSoul = async () => {
    // Validate YAML frontmatter before saving
    if (soulText.startsWith('---')) {
      const endIdx = soulText.indexOf('---', 3)
      if (endIdx === -1) {
        message.error('Invalid SOUL.md: YAML frontmatter not closed (missing closing ---)')
        return
      }
      const frontmatter = soulText.slice(3, endIdx).trim()
      // Basic YAML validation: check for required 'name' field
      if (!frontmatter.includes('name:')) {
        message.warning('SOUL.md frontmatter is missing "name:" field')
      }
    }

    setSaving(true)
    try {
      await api.put(`/api/agent/${projectId}/${section}/soul`, { content: soulText })
      setSoulDirty(false)
      message.success('SOUL.md saved')
      void fetchConfig()
    } catch {
      message.error('Failed to save SOUL.md')
    }
    setSaving(false)
  }

  const deleteSkill = async (name: string) => {
    try {
      await api.delete(`/api/agent/${projectId}/${section}/skills/${name}`)
      message.success(`Skill "${name}" deleted`)
      void fetchConfig()
    } catch {
      message.error('Failed to delete skill')
    }
  }

  const openSkillEditor = (skill?: SkillItem) => {
    if (skill) {
      setEditingSkill(skill.name)
      setSkillForm({
        name: skill.name,
        description: skill.description,
        triggers: skill.triggers.join(', '),
        content: skill.body || '',
      })
    } else {
      setEditingSkill('__new__')
      setSkillForm({ name: '', description: '', triggers: '', content: '## Instructions\n\nDescribe what the agent should do when this skill is activated.\n' })
    }
  }

  const saveSkill = async () => {
    if (!skillForm.name.trim()) {
      message.error('Skill name is required')
      return
    }
    setSkillSaving(true)
    try {
      const triggers = skillForm.triggers.split(',').map((t) => t.trim()).filter(Boolean)
      const body = {
        name: skillForm.name.trim(),
        description: skillForm.description.trim(),
        triggers,
        body: skillForm.content,
      }
      if (editingSkill === '__new__') {
        await api.post(`/api/agent/${projectId}/${section}/skills`, body)
        message.success('Skill created')
      } else {
        await api.put(`/api/agent/${projectId}/${section}/skills/${editingSkill}`, body)
        message.success('Skill updated')
      }
      setEditingSkill(null)
      void fetchConfig()
    } catch {
      message.error('Failed to save skill')
    }
    setSkillSaving(false)
  }

  const handleImportSkill = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const text = await file.text()

    // Try to parse as a skill file with YAML frontmatter
    if (text.startsWith('---')) {
      try {
        const endIdx = text.indexOf('---', 3)
        const frontmatter = text.substring(3, endIdx).trim()
        const body = text.substring(endIdx + 3).trim()

        // Extract name from frontmatter
        const nameMatch = frontmatter.match(/^name:\s*(.+)$/m)
        const descMatch = frontmatter.match(/^description:\s*(.+)$/m)
        const triggersMatch = frontmatter.match(/^triggers:\s*\[(.+)\]$/m)

        const name = nameMatch?.[1]?.trim().replace(/['"]/g, '') || file.name.replace('.md', '')
        const description = descMatch?.[1]?.trim().replace(/['"]/g, '') || ''
        const triggers = triggersMatch?.[1]?.split(',').map((t: string) => t.trim().replace(/['"]/g, '')) || []

        await api.post(`/api/agent/${projectId}/${section}/skills`, {
          name,
          description,
          triggers,
          body,
        })
        message.success(`Skill "${name}" imported`)
        void fetchConfig()
        return
      } catch {
        // Fall through to raw import
      }
    }

    // Raw markdown — use filename as skill name
    const name = file.name.replace(/\.md$/i, '').replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
    await api.post(`/api/agent/${projectId}/${section}/skills`, {
      name,
      description: `Imported from ${file.name}`,
      triggers: [],
      body: text,
    })
    message.success(`Skill "${name}" imported`)
    void fetchConfig()
  }

  const sourceLabel: Record<string, string> = {
    module: 'Module custom',
    project: 'Project override',
    global: 'Global default',
    default: 'Built-in default',
  }

  return (
    <div style={{
      width: 340,
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-card)',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <Bot size={16} color={color} strokeWidth={2} />
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', flex: 1 }}>Agent Config</span>
        <div
          onClick={onClose}
          style={{ width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-tertiary)', transition: 'all 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)' }}
        >
          <X size={14} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '8px 16px 0', gap: 4 }}>
        {(['soul', 'skills'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            style={{
              padding: '6px 14px', border: 'none', borderRadius: '6px 6px 0 0', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s',
              background: tab === t ? `${color}10` : 'transparent',
              color: tab === t ? color : 'var(--text-tertiary)',
              borderBottom: tab === t ? `2px solid ${color}` : '2px solid transparent',
            }}
          >
            {t === 'soul' ? 'SOUL' : 'Skills'}
          </button>
        ))}
      </div>

      <div style={{ borderBottom: '1px solid var(--border)' }} />

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: 'var(--text-tertiary)' }}>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : tab === 'soul' ? (
          /* ── SOUL Tab ── */
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={12} />
                Agent Persona
              </span>
              <span style={{
                fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 4,
                background: config?.soul_source === 'module' ? `${color}12` : 'var(--bg-hover)',
                color: config?.soul_source === 'module' ? color : 'var(--text-tertiary)',
              }}>
                {sourceLabel[config?.soul_source || 'default']}
              </span>
            </div>

            {config?.soul_source !== 'module' && (
              <div style={{
                fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, padding: '6px 10px',
                borderRadius: 6, background: `${color}06`, border: `1px solid ${color}15`, lineHeight: 1.5,
              }}>
                Editing will create a custom SOUL.md for this module.
              </div>
            )}

            {/* Frontmatter hint */}
            {!soulText.startsWith('---') && soulText.length === 0 && (
              <div style={{
                fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, padding: '6px 10px',
                borderRadius: 6, background: 'var(--bg-sidebar)', border: '1px solid var(--border)',
                fontFamily: 'monospace', lineHeight: 1.6, whiteSpace: 'pre',
              }}>
                {'---\nname: ' + section + '\ndescription: ""\ntools: [read, write, edit, ls, grep, bash]\nmax_steps: 20\n---\n\nYour agent prompt here...'}
              </div>
            )}

            <textarea
              value={soulText}
              onChange={(e) => { setSoulText(e.target.value); setSoulDirty(true) }}
              placeholder={'---\nname: ' + section + '\ndescription: "Agent description"\ntools: [read, write, edit, ls, grep, bash]\n---\n\nYour agent instructions here...'}
              style={{
                width: '100%', minHeight: 300, padding: '10px 12px', border: `1px solid ${soulDirty ? color : 'var(--border)'}`,
                borderRadius: 8, fontSize: 12, fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
                lineHeight: 1.6, resize: 'vertical', outline: 'none', background: 'var(--bg-input)',
                color: 'var(--text)', transition: 'border-color 0.15s',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = color }}
              onBlur={(e) => { if (!soulDirty) e.currentTarget.style.borderColor = 'var(--border)' }}
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              {soulDirty && config?.soul_source === 'module' && (
                <button type="button"
                  onClick={() => { setSoulText(config?.soul || ''); setSoulDirty(false) }}
                  style={{
                    padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6,
                    background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  Discard
                </button>
              )}
              <button type="button" onClick={() => void saveSoul()} disabled={saving || !soulDirty}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '6px 16px', border: 'none',
                  borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: soulDirty ? color : 'var(--bg-hover)',
                  color: soulDirty ? '#fff' : 'var(--text-tertiary)',
                  cursor: saving || !soulDirty ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1, transition: 'all 0.15s',
                }}
              >
                {saving ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
                Save
              </button>
            </div>
          </div>
        ) : editingSkill !== null ? (
          /* ── Skill Editor ── */
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Pencil size={12} color={color} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                {editingSkill === '__new__' ? 'New Skill' : `Edit: ${editingSkill}`}
              </span>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => setEditingSkill(null)}
                style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>

            <label style={labelStyle}>Name</label>
            <input value={skillForm.name} onChange={(e) => setSkillForm({ ...skillForm, name: e.target.value })}
              placeholder="my_skill" disabled={editingSkill !== '__new__'}
              style={{ ...inputStyle, opacity: editingSkill !== '__new__' ? 0.6 : 1 }} />

            <label style={labelStyle}>Description</label>
            <input value={skillForm.description} onChange={(e) => setSkillForm({ ...skillForm, description: e.target.value })}
              placeholder="What does this skill do?" style={inputStyle} />

            <label style={labelStyle}>Triggers <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(comma separated)</span></label>
            <input value={skillForm.triggers} onChange={(e) => setSkillForm({ ...skillForm, triggers: e.target.value })}
              placeholder="search papers, find literature, always" style={inputStyle} />

            <label style={labelStyle}>Instructions (Markdown)</label>
            <textarea value={skillForm.content} onChange={(e) => setSkillForm({ ...skillForm, content: e.target.value })}
              style={{ ...inputStyle, minHeight: 180, fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace", fontSize: 12, lineHeight: 1.6, resize: 'vertical' }} />

            <button type="button" onClick={() => void saveSkill()} disabled={skillSaving}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                padding: '7px 0', width: '100%', border: 'none', borderRadius: 6,
                background: color, color: '#fff', fontSize: 12, fontWeight: 600,
                cursor: skillSaving ? 'wait' : 'pointer', opacity: skillSaving ? 0.7 : 1, marginTop: 8,
              }}
            >
              {skillSaving ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
              {editingSkill === '__new__' ? 'Create Skill' : 'Save Changes'}
            </button>
          </div>
        ) : (
          /* ── Skills List ── */
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={12} />
                Module Skills
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <input ref={skillFileInputRef} type="file" accept=".md" style={{ display: 'none' }}
                  onChange={(e) => void handleImportSkill(e)} />
                <button type="button" onClick={() => skillFileInputRef.current?.click()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', border: '1px solid var(--border)',
                    borderRadius: 5, background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                  }}
                  title="Import .md skill file"
                >
                  <Upload size={10} /> Import
                </button>
                <button type="button" onClick={() => openSkillEditor()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: `1px solid ${color}40`,
                    borderRadius: 5, background: `${color}08`, color, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <Plus size={11} /> Add
                </button>
              </div>
            </div>

            {config && config.skills.filter((s) => s.source === 'module').length === 0 && (
              <div style={{
                padding: '20px 16px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border-light)',
                textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6,
              }}>
                No module-specific skills yet.<br />Click "Add" to create one.
              </div>
            )}

            {config?.skills.filter((s) => s.source === 'module').map((skill) => (
              <SkillCard key={skill.name} skill={skill} color={color}
                onEdit={() => openSkillEditor(skill)}
                onDelete={() => { if (window.confirm(`Delete skill "${skill.name}"?`)) void deleteSkill(skill.name) }}
              />
            ))}

            {/* Global skills info */}
            {config && config.skills.filter((s) => s.source !== 'module').length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginTop: 16, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={11} />
                  Global Skills
                </div>
                {config.skills.filter((s) => s.source !== 'module').map((skill) => (
                  <SkillCard key={skill.name} skill={skill} color="#8b95a5" readonly />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SkillCard({ skill, color, readonly, onEdit, onDelete }: {
  skill: SkillItem
  color: string
  readonly?: boolean
  onEdit?: () => void
  onDelete?: () => void
}): React.ReactElement {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)',
      marginBottom: 6, background: 'var(--bg-card)', transition: 'border-color 0.15s',
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${color}40` }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{skill.name}</span>
        {readonly && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-hover)', color: 'var(--text-tertiary)', fontWeight: 500 }}>global</span>}
        {!readonly && (
          <span style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
            <div onClick={onEdit} style={{ cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: 2 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = color }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)' }}>
              <Pencil size={11} />
            </div>
            <div onClick={onDelete} style={{ cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: 2 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)' }}>
              <Trash2 size={11} />
            </div>
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 4 }}>{skill.description}</div>
      {skill.triggers.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {skill.triggers.map((t) => (
            <span key={t} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: `${color}10`, color, fontWeight: 500 }}>{t}</span>
          ))}
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, marginTop: 10,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6,
  fontSize: 12, outline: 'none', background: 'var(--bg-input)', color: 'var(--text)',
  transition: 'border-color 0.15s',
}
