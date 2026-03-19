import React, { useEffect, useState } from 'react'
import { Tag, Input, Empty, Spin } from 'antd'
import { Search, Zap } from 'lucide-react'
import { api } from '../services/api'

interface Skill {
  name: string
  description: string
  roles: string[]
  triggers: string[]
  version: string
}

export default function Skills(): React.ReactElement {
  const [skills, setSkills] = useState<Skill[]>([])
  const [filtered, setFiltered] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [searchValue, setSearchValue] = useState('')
  const [hoveredSkill, setHoveredSkill] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<Skill[]>('/api/skills/')
      .then((data) => {
        setSkills(data)
        setFiltered(data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSearch = (value: string) => {
    setSearchValue(value)
    if (!value) {
      setFiltered(skills)
      return
    }
    const lower = value.toLowerCase()
    setFiltered(
      skills.filter(
        (s) =>
          s.name.includes(lower) ||
          s.description.toLowerCase().includes(lower) ||
          s.triggers.some((t) => t.toLowerCase().includes(lower)),
      ),
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Skills</h2>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>
            {filtered.length} skill{filtered.length !== 1 ? 's' : ''} available
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 12px',
            borderRadius: 8,
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            width: 260,
          }}
        >
          <Search size={14} color="var(--text-tertiary)" />
          <input
            value={searchValue}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search skills..."
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

      {filtered.length === 0 ? (
        <Empty description="No skills found" />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}
        >
          {filtered.map((skill) => {
            const hovered = hoveredSkill === skill.name
            return (
              <div
                key={skill.name}
                onMouseEnter={() => setHoveredSkill(skill.name)}
                onMouseLeave={() => setHoveredSkill(null)}
                style={{
                  padding: '18px 20px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: '#fff',
                  transition: 'all 0.2s ease',
                  boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                  transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 7,
                        background: 'var(--accent-light)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Zap size={14} color="var(--accent)" strokeWidth={2} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                      {skill.name}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>v{skill.version}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 10 }}>
                  {skill.description}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {skill.roles.map((r) => (
                    <Tag key={r} color="blue" style={{ margin: 0, fontSize: 11 }}>{r}</Tag>
                  ))}
                  {skill.triggers.map((t) => (
                    <Tag key={t} color="green" style={{ margin: 0, fontSize: 11 }}>{t}</Tag>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
