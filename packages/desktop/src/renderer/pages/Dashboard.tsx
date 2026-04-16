import React, { useEffect, useState } from 'react'
import { Button, Modal, Form, Input, Tag, message } from 'antd'
import {
  Plus,
  Rocket,
  FileSearch,
  BookOpen,
  FlaskConical,
  BarChart3,
  PenTool,
  ArrowRight,
  Trash2,
  MoreHorizontal,
  Pencil,
  FolderOpen,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { clearProjectThreads } from '../services/chat_threads'

interface Project {
  id: string
  name: string
  description: string
  stage: string
  created_at: string
  workspace: string
}

const SKILLS = [
  { icon: Rocket, title: 'Start a project', desc: 'Initialize a new research', color: '#4f6ef7' },
  { icon: FileSearch, title: 'Reproduce a paper', desc: 'Replicate experiments', color: '#8b5cf6' },
  { icon: BookOpen, title: 'Literature survey', desc: 'Search & summarize papers', color: '#0ea5e9' },
  { icon: FlaskConical, title: 'Experimental design', desc: 'Plan experiments', color: '#22c55e' },
  { icon: BarChart3, title: 'Data analysis', desc: 'Analyze results', color: '#f59e0b' },
  { icon: PenTool, title: 'Write manuscript', desc: 'Draft research paper', color: '#ef4444' },
]

const stageColor: Record<string, string> = {
  idle: 'default',
  literature: 'blue',
  proposal: 'cyan',
  experiments: 'orange',
  manuscript: 'purple',
  review: 'green',
  submit: 'gold',
}

export default function Dashboard(): React.ReactElement {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<{ calls: number; cost_usd: number; input_tokens: number; output_tokens: number } | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [hoveredSkill, setHoveredSkill] = useState<number | null>(null)
  const [hoveredProject, setHoveredProject] = useState<string | null>(null)
  const [projectMenu, setProjectMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [form] = Form.useForm()
  const [editForm] = Form.useForm()
  const navigate = useNavigate()

  const fetchProjects = async () => {
    setLoading(true)
    try {
      const data = await api.get<Project[]>('/api/projects/')
      setProjects(data)
    } catch {
      setProjects([])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchProjects()
    api.get<{ calls: number; cost_usd: number; input_tokens: number; output_tokens: number }>('/api/logs/tokens')
      .then(setStats).catch(() => {})
  }, [])

  // Close project menu on click anywhere
  useEffect(() => {
    const hide = () => setProjectMenu(null)
    window.addEventListener('click', hide)
    return () => window.removeEventListener('click', hide)
  }, [])

  const handleCreate = async () => {
    let values: { name: string; description?: string; workspace_dir?: string }
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    try {
      await api.post('/api/projects/', {
        name: values.name,
        description: values.description || '',
        workspace_dir: values.workspace_dir || '',
      })
      setModalOpen(false)
      form.resetFields()
      await fetchProjects()
      message.success(`Created "${values.name}"`)
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unknown error'
      message.error(`Failed to create project: ${detail}`)
    }
  }

  const handleBrowseFolder = async (targetForm: typeof form) => {
    const openags = (window as unknown as Record<string, unknown>).openags as { selectDirectory?: () => Promise<string | null> } | undefined
    if (openags?.selectDirectory) {
      const dir = await openags.selectDirectory()
      if (dir) {
        targetForm.setFieldsValue({ workspace_dir: dir })
      }
    } else {
      message.info('Folder picker is only available in the desktop app')
    }
  }

  const handleDelete = async (projectId: string) => {
    try {
      await api.delete(`/api/projects/${projectId}`)
      clearProjectThreads(projectId)
      window.dispatchEvent(new Event('openags-projects-updated'))
      message.success(`Deleted project "${projectId}"`)
      fetchProjects()
    } catch {
      message.error('Failed to delete project')
    }
  }

  const handleEdit = async () => {
    if (!editProject) return
    try {
      const values = await editForm.validateFields()
      await api.put(`/api/projects/${editProject.id}/config`, {
        name: values.name,
        description: values.description || '',
      })
      message.success('Project updated')
      setEditModalOpen(false)
      setEditProject(null)
      editForm.resetFields()
      fetchProjects()
    } catch {
      message.error('Failed to update project')
    }
  }

  const openEditModal = (project: Project) => {
    setEditProject(project)
    editForm.setFieldsValue({ name: project.name, description: project.description })
    setEditModalOpen(true)
    setProjectMenu(null)
  }

  const createModal = (
    <Modal
      title="New Research Project"
      open={modalOpen}
      onOk={handleCreate}
      onCancel={() => setModalOpen(false)}
      okText="Create"
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item name="name" label="Project Name" rules={[{ required: true, message: 'Please enter a project name' }]}>
          <Input placeholder="My Research Project" />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={3} placeholder="What is this research about?" />
        </Form.Item>
        <Form.Item name="workspace_dir" label="Workspace Directory" extra="Leave empty to use default location">
          <Input
            placeholder="Default (~/.openags/projects/...)"
            readOnly
            addonAfter={
              <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => void handleBrowseFolder(form)}>
                <FolderOpen size={13} /> Browse
              </span>
            }
          />
        </Form.Item>
      </Form>
    </Modal>
  )

  const editModal = (
    <Modal
      title="Edit Project"
      open={editModalOpen}
      onOk={handleEdit}
      onCancel={() => { setEditModalOpen(false); setEditProject(null); editForm.resetFields() }}
      okText="Save"
    >
      <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item name="name" label="Project Name" rules={[{ required: true, message: 'Please enter a project name' }]}>
          <Input placeholder="My Research Project" />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={3} placeholder="What is this research about?" />
        </Form.Item>
        <Form.Item label="Workspace">
          <code style={{ padding: '6px 10px', borderRadius: 6, background: '#f5f5f5', fontSize: 12, color: '#666', display: 'block', border: '1px solid #e8e8e8', wordBreak: 'break-all' }}>
            {editProject?.workspace || 'Unknown'}
          </code>
        </Form.Item>
      </Form>
    </Modal>
  )

  if (!loading && projects.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '40px 32px',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'linear-gradient(135deg, #4f6ef7 0%, #7c5cf7 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
            boxShadow: '0 8px 24px rgba(79,110,247,0.25)',
          }}
        >
          <FlaskConical size={28} color="#fff" strokeWidth={1.8} />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>
          What can I help with?
        </h1>
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: 15,
            marginBottom: 36,
            textAlign: 'center',
            maxWidth: 440,
            lineHeight: 1.6,
          }}
        >
          OpenAGS is your autonomous research assistant. Choose a skill to get started.
        </p>

        {/* Stats bar */}
        {stats && (
          <div style={{
            display: 'flex', gap: 16, marginBottom: 28, padding: '12px 20px',
            borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border)',
          }}>
            {[
              { label: 'Projects', value: String(projects.length), color: '#4f6ef7' },
              { label: 'API Calls', value: stats.calls >= 1000 ? `${(stats.calls/1000).toFixed(1)}K` : String(stats.calls), color: '#22c55e' },
              { label: 'Tokens', value: (stats.input_tokens + stats.output_tokens) >= 1000000 ? `${((stats.input_tokens + stats.output_tokens)/1000000).toFixed(1)}M` : `${((stats.input_tokens + stats.output_tokens)/1000).toFixed(0)}K`, color: '#8b5cf6' },
              { label: 'Cost', value: `$${stats.cost_usd.toFixed(2)}`, color: '#f59e0b' },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 14,
            maxWidth: 640,
            width: '100%',
            marginBottom: 40,
          }}
        >
          {SKILLS.map((s, idx) => {
            const Icon = s.icon
            const hovered = hoveredSkill === idx
            return (
              <div
                key={s.title}
                onClick={() => setModalOpen(true)}
                onMouseEnter={() => setHoveredSkill(idx)}
                onMouseLeave={() => setHoveredSkill(null)}
                style={{
                  padding: '18px 16px',
                  border: `1px solid ${hovered ? s.color + '40' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  background: hovered ? s.color + '06' : '#fff',
                  transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
                  boxShadow: hovered ? `0 4px 12px ${s.color}15` : 'var(--shadow-sm)',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: s.color + '10',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <Icon size={18} color={s.color} strokeWidth={1.8} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>
                  {s.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
                  {s.desc}
                </div>
              </div>
            )
          })}
        </div>
        {createModal}
        {editModal}
      </div>
    )
  }

  return (
    <div style={{ padding: '28px 32px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
            Research Projects
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button
          type="primary"
          icon={<Plus size={15} />}
          onClick={() => setModalOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 36,
            borderRadius: 8,
            fontWeight: 500,
          }}
        >
          New Project
        </Button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 14,
        }}
      >
        {projects.map((project) => {
          const hovered = hoveredProject === project.id
          return (
            <div
              key={project.id}
              onClick={() => navigate(`/project/${project.id}/pi`)}
              onContextMenu={(e) => {
                e.preventDefault()
                setProjectMenu({ id: project.id, x: e.clientX, y: e.clientY })
              }}
              onMouseEnter={() => setHoveredProject(project.id)}
              onMouseLeave={() => setHoveredProject(null)}
              style={{
                padding: '18px 20px',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                background: 'var(--bg-card)',
                transition: 'all 0.2s ease',
                transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
                boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                position: 'relative',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: 'var(--accent-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <FlaskConical size={16} color="var(--accent)" strokeWidth={1.8} />
                  </div>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {project.name}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Tag color={stageColor[project.stage] || 'default'} style={{ margin: 0 }}>
                    {project.stage}
                  </Tag>
                  <div
                    onClick={(e) => {
                      e.stopPropagation()
                      setProjectMenu({ id: project.id, x: e.clientX, y: e.clientY })
                    }}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: 'var(--text-tertiary)',
                      opacity: hovered ? 1 : 0,
                      transition: 'all var(--transition)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <MoreHorizontal size={14} />
                  </div>
                </div>
              </div>
              <div
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: 13,
                  lineHeight: 1.5,
                  marginBottom: 12,
                }}
              >
                {project.description || 'No description'}
              </div>
              {/* Module progress dots */}
              <div style={{ display: 'flex', gap: 3, marginBottom: 12 }}>
                {['literature', 'proposal', 'experiments', 'manuscript', 'review'].map(mod => {
                  const colors: Record<string, string> = { literature: '#8b5cf6', proposal: '#0ea5e9', experiments: '#22c55e', manuscript: '#f59e0b', review: '#ef4444' }
                  return (
                    <div key={mod} title={mod} style={{
                      flex: 1, height: 4, borderRadius: 2,
                      background: `${colors[mod] || '#ccc'}30`,
                    }}>
                      <div style={{ height: '100%', borderRadius: 2, background: colors[mod], width: '0%' }} />
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>
                  Open project <ArrowRight size={12} />
                </div>
                {project.created_at && (
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {new Date(project.created_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Project context menu */}
      {projectMenu && (
        <div
          style={{
            position: 'fixed',
            top: projectMenu.y,
            left: projectMenu.x,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)',
            zIndex: 9999,
            minWidth: 160,
            padding: 4,
            animation: 'menuFadeIn 0.1s ease',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            onClick={() => {
              navigate(`/project/${projectMenu.id}/pi`)
              setProjectMenu(null)
            }}
            style={menuItemStyle}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <ArrowRight size={13} strokeWidth={2} />
            <span style={{ flex: 1 }}>Open</span>
          </div>
          <div
            onClick={() => {
              const p = projects.find((proj) => proj.id === projectMenu.id)
              if (p) openEditModal(p)
            }}
            style={menuItemStyle}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <Pencil size={13} strokeWidth={2} />
            <span style={{ flex: 1 }}>Edit</span>
          </div>
          <div
            onClick={async () => {
              const id = projectMenu.id
              setProjectMenu(null)
              const newName = window.prompt('Clone project — enter new name:')
              if (newName) {
                try {
                  await api.post(`/api/projects/${id}/clone`, { new_name: newName })
                  message.success(`Cloned to "${newName}"`)
                  void fetchProjects()
                } catch { message.error('Clone failed') }
              }
            }}
            style={menuItemStyle}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <FolderOpen size={13} strokeWidth={2} />
            <span style={{ flex: 1 }}>Clone</span>
          </div>
          <div
            onClick={() => {
              const id = projectMenu.id
              setProjectMenu(null)
              window.open(`/api/projects/${id}/export`, '_blank')
            }}
            style={menuItemStyle}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <ArrowRight size={13} strokeWidth={2} />
            <span style={{ flex: 1 }}>Export ZIP</span>
          </div>
          <div style={{ height: 1, background: 'var(--border-light)', margin: '3px 6px' }} />
          <div
            onClick={() => {
              const id = projectMenu.id
              setProjectMenu(null)
              if (window.confirm(`Delete project "${id}"? This cannot be undone.`)) {
                void handleDelete(id)
              }
            }}
            style={{ ...menuItemStyle, color: '#ef4444' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.06)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <Trash2 size={13} strokeWidth={2} />
            <span style={{ flex: 1 }}>Delete</span>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Del</span>
          </div>
        </div>
      )}

      {createModal}
      {editModal}
    </div>
  )
}

const menuItemStyle: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
  color: 'var(--text)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}
