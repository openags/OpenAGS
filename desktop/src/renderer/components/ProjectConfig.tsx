import React, { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
import { Save } from 'lucide-react'
import { api } from '../services/api'

interface ComputeConfig {
  execution_mode?: string
  remote_server?: string
  gpu_count?: number
  experiment_timeout?: number
  auto_fix?: boolean
}

interface ProjectConfigData {
  name?: string
  description?: string
  workspace_override?: string
  latex_engine?: string
  default_agent?: string
  compute?: ComputeConfig
  custom?: Record<string, string>
}

interface Props {
  projectId: string
  projectName: string
}

export default function ProjectConfig({ projectId, projectName }: Props): React.ReactElement {
  const [config, setConfig] = useState<ProjectConfigData>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [remoteServers, setRemoteServers] = useState<Array<{ name: string }>>([])

  useEffect(() => {
    api.get<Array<{ name: string }>>('/api/config/remote-servers')
      .then(setRemoteServers).catch(() => {})
  }, [])

  const loadConfig = useCallback(async () => {
    try {
      const data = await api.get<ProjectConfigData>(`/api/projects/${projectId}/config`)
      setConfig(data)
    } catch {
      setConfig({})
    }
  }, [projectId])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  const save = async () => {
    setSaving(true)
    try {
      await api.put(`/api/projects/${projectId}/config`, config)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      message.error('Failed to save configuration')
    }
    setSaving(false)
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '9px 10px',
    fontSize: 13,
    outline: 'none',
    fontFamily: 'inherit',
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px', maxWidth: 640 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 17 }}>{projectName} — Configuration</h2>
        <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
          Per-project settings stored in .openags/config.yaml
        </div>
      </div>

      {/* General */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
        padding: 16, marginBottom: 14,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 15 }}>General</div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            Project Name
          </label>
          <input
            value={config.name || ''}
            onChange={e => setConfig(c => ({ ...c, name: e.target.value }))}
            style={fieldStyle}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            Description
          </label>
          <textarea
            rows={2}
            value={config.description || ''}
            onChange={e => setConfig(c => ({ ...c, description: e.target.value }))}
            style={{ ...fieldStyle, resize: 'vertical' }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            Workspace Override
          </label>
          <input
            value={config.workspace_override || ''}
            onChange={e => setConfig(c => ({ ...c, workspace_override: e.target.value }))}
            placeholder="(default)"
            style={{ ...fieldStyle, fontFamily: 'monospace' }}
          />
        </div>
      </div>

      {/* LaTeX / Manuscript */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
        padding: 16, marginBottom: 14,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 15 }}>LaTeX / Manuscript</div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            LaTeX Engine
          </label>
          <select
            value={config.latex_engine || 'pdflatex'}
            onChange={e => setConfig(c => ({ ...c, latex_engine: e.target.value }))}
            style={{ ...fieldStyle, background: 'var(--bg-card)' }}
          >
            <option value="pdflatex">pdflatex</option>
            <option value="xelatex">xelatex</option>
            <option value="lualatex">lualatex</option>
            <option value="tectonic">tectonic (auto)</option>
          </select>
        </div>
      </div>

      {/* Agent */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
        padding: 16, marginBottom: 14,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 15 }}>Agent</div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            Default Agent Role
          </label>
          <select
            value={config.default_agent || 'ags'}
            onChange={e => setConfig(c => ({ ...c, default_agent: e.target.value }))}
            style={{ ...fieldStyle, background: 'var(--bg-card)' }}
          >
            <option value="ags">AGS</option>
            <option value="pi">PI</option>
            <option value="literature">Literature</option>
            <option value="proposer">Proposer</option>
            <option value="experimenter">Experimenter</option>
            <option value="writer">Writer</option>
            <option value="reviewer">Reviewer</option>
          </select>
        </div>
      </div>

      {/* Compute */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
        padding: 16, marginBottom: 14,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 15 }}>Compute (Experiments)</div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            Execution Mode
          </label>
          <select
            value={config.compute?.execution_mode || 'local'}
            onChange={e => setConfig(c => ({ ...c, compute: { ...c.compute, execution_mode: e.target.value } }))}
            style={{ ...fieldStyle, background: 'var(--bg-card)' }}
          >
            <option value="local">Local (this machine)</option>
            <option value="docker">Docker (isolated container)</option>
            <option value="remote">Remote SSH</option>
          </select>
        </div>

        {config.compute?.execution_mode === 'remote' && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              Remote Server
            </label>
            <select
              value={config.compute?.remote_server || ''}
              onChange={e => setConfig(c => ({ ...c, compute: { ...c.compute, remote_server: e.target.value } }))}
              style={{ ...fieldStyle, background: 'var(--bg-card)' }}
            >
              <option value="">Select a server...</option>
              {remoteServers.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
            {remoteServers.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                No servers configured. Add one in Settings → Compute.
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              GPU Count
            </label>
            <select
              value={config.compute?.gpu_count ?? 0}
              onChange={e => setConfig(c => ({ ...c, compute: { ...c.compute, gpu_count: parseInt(e.target.value) } }))}
              style={{ ...fieldStyle, background: 'var(--bg-card)' }}
            >
              {[0,1,2,4,8].map(n => <option key={n} value={n}>{n === 0 ? '0 (CPU only)' : n}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              Timeout (seconds)
            </label>
            <input
              type="number"
              value={config.compute?.experiment_timeout ?? 300}
              onChange={e => setConfig(c => ({ ...c, compute: { ...c.compute, experiment_timeout: parseInt(e.target.value) || 300 } }))}
              style={fieldStyle}
            />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={config.compute?.auto_fix ?? true}
              onChange={e => setConfig(c => ({ ...c, compute: { ...c.compute, auto_fix: e.target.checked } }))}
            />
            Auto-fix on failure (LLM analyzes errors and retries)
          </label>
        </div>
      </div>

      {/* Save button */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {saved && (
          <span style={{ fontSize: 12, color: 'var(--green)', alignSelf: 'center' }}>
            Saved successfully
          </span>
        )}
        <button
          onClick={() => void save()}
          disabled={saving}
          style={{
            border: 'none', borderRadius: 8,
            padding: '10px 20px', fontSize: 13, cursor: 'pointer',
            background: 'var(--accent)', color: '#fff', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <Save size={14} /> {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
    </div>
  )
}
