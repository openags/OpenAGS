import React, { useState, useEffect, useRef, useCallback } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { ConfigProvider, theme } from 'antd'
import {
  Search,
  Plus,
  MessageSquare,
  BookOpen,
  Lightbulb,
  FlaskConical,
  FileText,
  SearchCheck,
  Library,
  Send,
  Zap,
  Settings as SettingsIcon,
  User,
  LayoutDashboard,
  FolderOpen,
  Folder,
  Pencil,
  Trash2,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
} from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Project from './pages/Project'
import Settings from './pages/Settings'
import Skills from './pages/Skills'
import Logs from './pages/Logs'
import Login from './pages/Login'
import { api, AuthUser } from './services/api'
import {
  getChatKey,
  loadThreadStore,
  makeThreadId,
  makeThreadTitle,
  saveThreadStore,
  ThreadStore,
} from './services/chat_threads'

interface ProjectItem {
  id: string
  name: string
  stage: string
}

// Fixed workflow sections in display order
const WORKFLOW_SECTIONS = [
  { key: 'sessions', icon: MessageSquare, label: 'Sessions' },
  { key: 'literature', icon: BookOpen, label: 'Literature Review' },
  { key: 'proposal', icon: Lightbulb, label: 'Proposal' },
  { key: 'experiments', icon: FlaskConical, label: 'Experiments' },
  { key: 'manuscript', icon: FileText, label: 'Manuscript' },
  { key: 'review', icon: SearchCheck, label: 'Review' },
  { key: 'references', icon: Library, label: 'References' },
  { key: 'submit', icon: Send, label: 'Submit' },
]

const WORKFLOW_KEYS = new Set(WORKFLOW_SECTIONS.map((s) => s.key))

const MODULE_ICONS: Record<string, typeof MessageSquare> = {
  sessions: MessageSquare,
  literature: BookOpen,
  proposal: Lightbulb,
  experiments: FlaskConical,
  manuscript: FileText,
  review: SearchCheck,
  references: Library,
  submit: Send,
}

const NON_CHAT_SECTIONS = new Set(['references', 'submit', 'config'])

type ContextMenuData =
  | { kind: 'project'; x: number; y: number; projectId: string }
  | { kind: 'section'; x: number; y: number; projectId: string; sectionKey: string }
  | { kind: 'thread'; x: number; y: number; projectId: string; sectionKey: string; threadId: string }
  | null

function AppLayout({ user, onLogout }: { user: AuthUser; onLogout: () => void }): React.ReactElement {
  const navigate = useNavigate()
  const location = useLocation()
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [searchFocused, setSearchFocused] = useState(false)
  const [threadsByKey, setThreadsByKey] = useState<ThreadStore>(() => loadThreadStore())
  const [contextMenu, setContextMenu] = useState<ContextMenuData>(null)
  const [renamingThread, setRenamingThread] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [modulesByProject, setModulesByProject] = useState<Record<string, Array<{ name: string }>>>({})
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = () => setThreadsByKey(loadThreadStore())
    window.addEventListener('openags-threads-updated', handler)
    return () => window.removeEventListener('openags-threads-updated', handler)
  }, [])

  useEffect(() => {
    api
      .get<ProjectItem[]>('/api/projects/')
      .then(setProjects)
      .catch(() => {})
  }, [location.pathname])

  // Fetch modules dynamically when a project is expanded
  useEffect(() => {
    expandedProjects.forEach((projectId) => {
      if (!modulesByProject[projectId]) {
        api
          .get<Array<{ name: string }>>(`/api/agents/${projectId}/modules`)
          .then((modules) => setModulesByProject((prev) => ({ ...prev, [projectId]: modules })))
          .catch(() => {})
      }
    })
  }, [expandedProjects])

  useEffect(() => {
    const match = location.pathname.match(/\/project\/([^/]+)/)
    if (match) {
      setExpandedProjects((prev) => new Set(prev).add(match[1]))
    }
    const sectionMatch = location.pathname.match(/\/project\/([^/]+)\/([^/]+)/)
    if (sectionMatch) {
      const key = `${sectionMatch[1]}:${sectionMatch[2]}`
      setExpandedSections((prev) => new Set(prev).add(key))
    }
  }, [location.pathname])

  useEffect(() => {
    const hideMenu = () => setContextMenu(null)
    window.addEventListener('click', hideMenu)
    return () => window.removeEventListener('click', hideMenu)
  }, [])

  useEffect(() => {
    if (renamingThread && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingThread])

  const toggleProject = (id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSection = (nodeKey: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(nodeKey)) next.delete(nodeKey)
      else next.add(nodeKey)
      return next
    })
  }

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const createThread = useCallback((projectId: string, sectionKey: string) => {
    const key = getChatKey(projectId, sectionKey)
    const store = loadThreadStore()
    const threads = store[key] || []
    const newThread = {
      id: makeThreadId(),
      title: makeThreadTitle(threads.length + 1),
      messages: [],
    }
    store[key] = [...threads, newThread]
    saveThreadStore(store)
    setThreadsByKey(store)
    setExpandedSections((prev) => new Set(prev).add(`${projectId}:${sectionKey}`))
    navigate(`/project/${projectId}/${sectionKey}/${newThread.id}`)

    // Module name = section key; coordinator is the default for 'sessions'
    const module = sectionKey === 'sessions' ? 'coordinator' : sectionKey
    if (!NON_CHAT_SECTIONS.has(sectionKey)) {
      api
        .post<{ id: string }>(`/api/sessions/${projectId}/${sectionKey}`, {
          module,
          title: newThread.title,
        })
        .then((session) => {
          const updated = loadThreadStore()
          updated[key] = (updated[key] || []).map((t) =>
            t.id === newThread.id ? { ...t, sessionId: session.id } : t,
          )
          saveThreadStore(updated)
          setThreadsByKey(updated)
        })
        .catch(() => {})
    }
  }, [navigate])

  const startRenameThread = (threadId: string, currentTitle: string) => {
    setRenamingThread(threadId)
    setRenameValue(currentTitle)
  }

  const commitRename = (projectId: string, sectionKey: string, threadId: string) => {
    const trimmed = renameValue.trim()
    if (!trimmed) {
      setRenamingThread(null)
      return
    }
    const key = getChatKey(projectId, sectionKey)
    const store = loadThreadStore()
    const threads = store[key] || []
    store[key] = threads.map((t) => (t.id === threadId ? { ...t, title: trimmed } : t))
    saveThreadStore(store)
    setThreadsByKey(store)
    setRenamingThread(null)
  }

  const deleteThread = useCallback((projectId: string, sectionKey: string, threadId: string) => {
    const key = getChatKey(projectId, sectionKey)
    const store = loadThreadStore()
    const threads = store[key] || []
    const remained = threads.filter((t) => t.id !== threadId)
    store[key] = remained
    saveThreadStore(store)
    setThreadsByKey(store)

    const isCurrentlyActive = location.pathname === `/project/${projectId}/${sectionKey}/${threadId}`
    if (isCurrentlyActive) {
      const fallback = remained[0]?.id
      if (fallback) navigate(`/project/${projectId}/${sectionKey}/${fallback}`)
      else navigate(`/project/${projectId}/${sectionKey}`)
    }
  }, [location.pathname, navigate])

  const isActive = (path: string) => location.pathname === path
  const isProjectActive = (id: string) => location.pathname.startsWith(`/project/${id}`)
  const isSectionActive = (projectId: string, sectionKey: string) =>
    location.pathname.startsWith(`/project/${projectId}/${sectionKey}`)
  const isThreadActive = (projectId: string, sectionKey: string, threadId: string) =>
    location.pathname === `/project/${projectId}/${sectionKey}/${threadId}`

  const renderContextMenu = () => {
    if (!contextMenu) return null
    return (
      <div
        style={{
          position: 'fixed',
          top: contextMenu.y,
          left: contextMenu.x,
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
        {contextMenu.kind === 'project' && (
          <>
            <ContextMenuItem
              icon={<MessageSquarePlus size={13} strokeWidth={2} />}
              label="New Chat"
              shortcut="N"
              onClick={() => {
                createThread(contextMenu.projectId, 'sessions')
                setContextMenu(null)
              }}
            />
          </>
        )}
        {contextMenu.kind === 'section' && (
          <ContextMenuItem
            icon={<MessageSquarePlus size={13} strokeWidth={2} />}
            label="New Chat"
            shortcut="N"
            onClick={() => {
              createThread(contextMenu.projectId, contextMenu.sectionKey)
              setContextMenu(null)
            }}
          />
        )}
        {contextMenu.kind === 'thread' && (
          <>
            <ContextMenuItem
              icon={<Pencil size={13} strokeWidth={2} />}
              label="Rename"
              shortcut="F2"
              onClick={() => {
                const key = getChatKey(contextMenu.projectId, contextMenu.sectionKey)
                const threads = threadsByKey[key] || []
                const target = threads.find((t) => t.id === contextMenu.threadId)
                if (target) startRenameThread(contextMenu.threadId, target.title)
                setContextMenu(null)
              }}
            />
            <div style={{ height: 1, background: 'var(--border-light)', margin: '3px 6px' }} />
            <ContextMenuItem
              icon={<Trash2 size={13} strokeWidth={2} />}
              label="Delete"
              shortcut="Del"
              danger
              onClick={() => {
                deleteThread(contextMenu.projectId, contextMenu.sectionKey, contextMenu.threadId)
                setContextMenu(null)
              }}
            />
          </>
        )}
      </div>
    )
  }

  const sidebarWidth = sidebarCollapsed ? 52 : 'var(--sidebar-width)'

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside
        style={{
          width: sidebarWidth,
          minWidth: sidebarCollapsed ? 52 : undefined,
          background: 'var(--bg-sidebar)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          userSelect: 'none',
          transition: 'width 0.2s ease',
          overflow: 'hidden',
        }}
      >
        {/* Logo + collapse toggle */}
        <div
          style={{
            padding: sidebarCollapsed ? '18px 10px 14px' : '18px 16px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              background: 'linear-gradient(135deg, #4f6ef7 0%, #7c5cf7 100%)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(79,110,247,0.3)',
              flexShrink: 0,
              cursor: 'pointer',
            }}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <FlaskConical size={16} color="#fff" strokeWidth={2.5} />
          </div>
          {!sidebarCollapsed && (
            <>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: -0.3, flex: 1 }}>
                OpenAGS
              </span>
              <div
                onClick={() => setSidebarCollapsed(true)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--text-tertiary)',
                  transition: 'all var(--transition)',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-hover)'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--text-tertiary)'
                }}
                title="Collapse sidebar"
              >
                <PanelLeftClose size={14} strokeWidth={1.8} />
              </div>
            </>
          )}
        </div>

        {/* Collapsed: show expand button */}
        {sidebarCollapsed && (
          <div style={{ padding: '4px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div
              onClick={() => setSidebarCollapsed(false)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--text-tertiary)',
                transition: 'all var(--transition)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-hover)'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--text-tertiary)'
              }}
              title="Expand sidebar"
            >
              <PanelLeftOpen size={16} strokeWidth={1.8} />
            </div>
          </div>
        )}

        {/* Expanded content */}
        {!sidebarCollapsed && (
          <>
            {/* Search */}
            <div style={{ padding: '0 12px 10px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: searchFocused ? '#fff' : 'var(--bg-input)',
                  border: `1px solid ${searchFocused ? 'var(--accent)' : 'transparent'}`,
                  transition: 'all var(--transition)',
                  boxShadow: searchFocused ? '0 0 0 3px rgba(79,110,247,0.08)' : 'none',
                }}
              >
                <Search size={14} color="var(--text-tertiary)" strokeWidth={2} />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  placeholder="Search projects..."
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    fontSize: 13,
                    outline: 'none',
                    color: 'var(--text)',
                  }}
                />
              </div>
            </div>

            {/* Projects header */}
            <div
              style={{
                padding: '8px 16px 4px',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>Projects</span>
              <div
                onClick={() => navigate('/')}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--text-tertiary)',
                  transition: 'all var(--transition)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-hover)'
                  e.currentTarget.style.color = 'var(--accent)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--text-tertiary)'
                }}
                title="New project"
              >
                <Plus size={14} strokeWidth={2.5} />
              </div>
            </div>

            {/* Project tree */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
              {filtered.length === 0 ? (
                <div
                  style={{
                    padding: '24px 12px',
                    fontSize: 13,
                    color: 'var(--text-tertiary)',
                    textAlign: 'center',
                    lineHeight: 1.6,
                  }}
                >
                  <LayoutDashboard size={28} strokeWidth={1.5} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
                  No projects yet
                </div>
              ) : (
                filtered.map((p) => {
                  const expanded = expandedProjects.has(p.id)
                  const active = isProjectActive(p.id)
                  const ProjectFolderIcon = expanded ? FolderOpen : Folder
                  return (
                    <div key={p.id} style={{ marginBottom: 2 }}>
                      <TreeNode
                        active={active}
                        depth={0}
                        onClick={() => {
                          toggleProject(p.id)
                          if (!expanded) navigate(`/project/${p.id}/sessions`)
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setContextMenu({ kind: 'project', x: e.clientX, y: e.clientY, projectId: p.id })
                        }}
                        icon={<ProjectFolderIcon size={14} strokeWidth={1.8} />}
                        label={p.name}
                        bold
                      />
                      {expanded && (
                        <div>
                          {[
                            ...WORKFLOW_SECTIONS,
                            // Append any custom modules not in the fixed workflow
                            ...(modulesByProject[p.id] || [])
                              .filter((m) => !WORKFLOW_KEYS.has(m.name))
                              .map((m) => ({
                                key: m.name,
                                icon: MODULE_ICONS[m.name] || FolderOpen,
                                label: m.name.charAt(0).toUpperCase() + m.name.slice(1),
                              })),
                          ].map((s) => {
                            const sectionActive = isSectionActive(p.id, s.key)
                            const Icon = s.icon
                            const sectionThreads = threadsByKey[getChatKey(p.id, s.key)] || []
                            const sectionChatEnabled = !NON_CHAT_SECTIONS.has(s.key)
                            const sectionNodeKey = `${p.id}:${s.key}`
                            const sectionExpanded = expandedSections.has(sectionNodeKey)
                            return (
                              <div key={s.key}>
                                <TreeNode
                                  active={sectionActive}
                                  depth={1}
                                  onClick={() => {
                                    if (sectionChatEnabled) {
                                      toggleSection(sectionNodeKey)
                                    }
                                    const firstThreadId = sectionThreads[0]?.id
                                    if (sectionChatEnabled && firstThreadId) {
                                      navigate(`/project/${p.id}/${s.key}/${firstThreadId}`)
                                      return
                                    }
                                    navigate(`/project/${p.id}/${s.key}`)
                                  }}
                                  onContextMenu={(e) => {
                                    if (!sectionChatEnabled) return
                                    e.preventDefault()
                                    setContextMenu({
                                      kind: 'section',
                                      x: e.clientX,
                                      y: e.clientY,
                                      projectId: p.id,
                                      sectionKey: s.key,
                                    })
                                  }}
                                  icon={<Icon size={14} strokeWidth={1.8} />}
                                  label={s.label}
                                  count={sectionChatEnabled ? sectionThreads.length : undefined}
                                />
                                {sectionChatEnabled && sectionExpanded && sectionThreads.length > 0 && (
                                  <div>
                                    {sectionThreads.map((thread) => {
                                      const threadActive = isThreadActive(p.id, s.key, thread.id)
                                      const isRenaming = renamingThread === thread.id
                                      return (
                                        <div key={thread.id}>
                                          {isRenaming ? (
                                            <div style={{ paddingLeft: 40, paddingRight: 8, marginBottom: 1 }}>
                                              <input
                                                ref={renameInputRef}
                                                value={renameValue}
                                                onChange={(e) => setRenameValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter') commitRename(p.id, s.key, thread.id)
                                                  if (e.key === 'Escape') setRenamingThread(null)
                                                }}
                                                onBlur={() => commitRename(p.id, s.key, thread.id)}
                                                style={{
                                                  width: '100%',
                                                  padding: '3px 6px',
                                                  fontSize: 12,
                                                  border: '1px solid var(--accent)',
                                                  borderRadius: 4,
                                                  outline: 'none',
                                                  background: 'var(--bg-card)',
                                                  color: 'var(--text)',
                                                  boxShadow: '0 0 0 2px rgba(79,110,247,0.1)',
                                                }}
                                              />
                                            </div>
                                          ) : (
                                            <TreeNode
                                              active={threadActive}
                                              depth={2}
                                              onClick={() => navigate(`/project/${p.id}/${s.key}/${thread.id}`)}
                                              onContextMenu={(e) => {
                                                e.preventDefault()
                                                setContextMenu({
                                                  kind: 'thread',
                                                  x: e.clientX,
                                                  y: e.clientY,
                                                  projectId: p.id,
                                                  sectionKey: s.key,
                                                  threadId: thread.id,
                                                })
                                              }}
                                              onDoubleClick={() => startRenameThread(thread.id, thread.title)}
                                              icon={<MessageSquare size={12} strokeWidth={1.8} />}
                                              label={thread.title}
                                              small
                                            />
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}

        {/* Collapsed: icon nav for projects */}
        {sidebarCollapsed && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            {filtered.map((p) => {
              const active = isProjectActive(p.id)
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/project/${p.id}/sessions`)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    background: active ? 'var(--accent-light)' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--text-secondary)',
                    transition: 'all var(--transition)',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  title={p.name}
                >
                  {p.name.charAt(0).toUpperCase()}
                </div>
              )
            })}
          </div>
        )}

        {/* Bottom nav */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '6px 8px' }}>
          {[
            { key: '/skills', Icon: Zap, label: 'Skills' },
            { key: '/settings', Icon: SettingsIcon, label: 'Settings' },
          ].map((item) => {
            const active = isActive(item.key)
            return (
              <div
                key={item.key}
                onClick={() => navigate(item.key)}
                style={{
                  padding: sidebarCollapsed ? '7px 0' : '7px 10px',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                  gap: 10,
                  fontSize: 13,
                  fontWeight: 500,
                  marginBottom: 1,
                  background: active ? 'var(--accent-medium)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  transition: 'all var(--transition)',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = 'var(--bg-hover)'
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = 'transparent'
                }}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <item.Icon size={16} strokeWidth={1.8} />
                {!sidebarCollapsed && item.label}
              </div>
            )
          })}
        </div>

        {/* Account */}
        <div
          style={{
            padding: sidebarCollapsed ? '10px 8px' : '10px 12px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: 10,
            transition: 'padding var(--transition)',
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent-light), var(--accent-medium))',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              cursor: 'pointer',
            }}
            onClick={() => !sidebarCollapsed && navigate('/settings')}
            title={sidebarCollapsed ? user.display_name : undefined}
          >
            <User size={14} color="var(--accent)" strokeWidth={2} />
          </div>
          {!sidebarCollapsed && (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.display_name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--green)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'var(--green)',
                      boxShadow: '0 0 6px rgba(34,197,94,0.4)',
                    }}
                  />
                  Online
                </div>
              </div>
              <div
                onClick={(e) => {
                  e.stopPropagation()
                  onLogout()
                }}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--text-tertiary)',
                  transition: 'all var(--transition)',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-hover)'
                  e.currentTarget.style.color = 'var(--red, #ef4444)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--text-tertiary)'
                }}
                title="Sign out"
              >
                <LogOut size={13} strokeWidth={2} />
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/project/:id/:section/:threadId" element={<Project />} />
            <Route path="/project/:id/:section?" element={<Project />} />
            <Route path="/skills" element={<Skills />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </main>

      {renderContextMenu()}
    </div>
  )
}

/** Reusable tree node component — no arrows, clean indentation */
function TreeNode({
  active,
  depth,
  onClick,
  onContextMenu,
  onDoubleClick,
  icon,
  label,
  count,
  bold,
  small,
}: {
  active: boolean
  depth: number
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  onDoubleClick?: () => void
  icon: React.ReactNode
  label: string
  count?: number
  bold?: boolean
  small?: boolean
}): React.ReactElement {
  const paddingLeft = 10 + depth * 14
  const fontSize = small ? 12 : 13
  const py = small ? 4 : 5

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      style={{
        padding: `${py}px 8px ${py}px ${paddingLeft}px`,
        cursor: 'pointer',
        borderRadius: 'var(--radius-sm)',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        fontSize,
        fontWeight: bold && active ? 600 : bold ? 500 : active ? 500 : 400,
        color: active ? 'var(--accent)' : small ? 'var(--text-tertiary)' : 'var(--text-secondary)',
        background: active ? 'var(--accent-light)' : 'transparent',
        transition: 'all var(--transition)',
        marginBottom: 1,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{label}</span>
      {count !== undefined && count > 0 && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: 'var(--text-tertiary)',
            background: 'var(--bg-hover)',
            borderRadius: 8,
            padding: '1px 6px',
            flexShrink: 0,
          }}
        >
          {count}
        </span>
      )}
    </div>
  )
}

/** Context menu item */
function ContextMenuItem({
  icon,
  label,
  shortcut,
  danger,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  shortcut?: string
  danger?: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '7px 10px',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 12,
        color: danger ? '#ef4444' : 'var(--text)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.06)' : 'var(--bg-hover)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {shortcut && (
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 500 }}>{shortcut}</span>
      )}
    </div>
  )
}

export default function App(): React.ReactElement {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  // Apply saved theme on mount
  useEffect(() => {
    const saved = localStorage.getItem('openags-theme')
    if (saved) document.documentElement.setAttribute('data-theme', saved)
  }, [])

  // On mount: validate saved token, auto-login if valid
  useEffect(() => {
    const checkAuth = async () => {
      const saved = api.auth.loadAuth()
      if (saved?.token) {
        try {
          const me = await api.get<AuthUser>('/api/auth/me')
          setAuthUser(me)
          setAuthChecked(true)
          return
        } catch {
          // Token expired or backend restarted — clear stale auth
          api.auth.clearAuth()
        }
      }
      setAuthChecked(true)
    }
    void checkAuth()
  }, [])

  const handleLogin = (user: AuthUser, token: string, rememberMe: boolean) => {
    if (rememberMe) {
      api.auth.saveAuth(user, token)
    } else {
      // Store token for current session only (sessionStorage), clear persistent storage
      api.auth.clearAuth()
      sessionStorage.setItem('openags-session-token', token)
      sessionStorage.setItem('openags-session-user', JSON.stringify(user))
    }
    setAuthUser(user)
  }

  const handleLogout = () => {
    api.post('/api/auth/logout', {}).catch(() => {})
    api.auth.clearAuth()
    setAuthUser(null)
  }

  if (!authChecked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8f9fc' }}>
        <div style={{ color: '#8b95a5', fontSize: 14 }}>Loading...</div>
      </div>
    )
  }

  if (!authUser) {
    return (
      <ConfigProvider
        theme={{
          algorithm: theme.defaultAlgorithm,
          token: { colorPrimary: '#4f6ef7', borderRadius: 10 },
        }}
      >
        <Login onLogin={handleLogin} />
      </ConfigProvider>
    )
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#4f6ef7',
          borderRadius: 10,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, 'Helvetica Neue', sans-serif",
        },
        components: {
          Card: { borderRadiusLG: 12 },
          Button: { borderRadius: 8 },
          Input: { borderRadius: 8 },
          Modal: { borderRadiusLG: 14 },
        },
      }}
    >
      <HashRouter>
        <AppLayout user={authUser} onLogout={handleLogout} />
      </HashRouter>
    </ConfigProvider>
  )
}
