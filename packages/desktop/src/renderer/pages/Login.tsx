import React, { useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { api } from '../services/api'

interface LoginProps {
  onLogin: (user: { id: string; username: string; display_name: string }, token: string, rememberMe: boolean) => void
}

export default function Login({ onLogin }: LoginProps): React.ReactElement {
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login'
      const body = isRegister
        ? { username, password, display_name: displayName || username }
        : { username, password }
      const res = await api.post<{ user: { id: string; username: string; display_name: string }; token: string }>(
        endpoint,
        body,
      )
      onLogin(res.user, res.token, rememberMe)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Request failed'
      // Extract detail from API error message
      const match = msg.match(/\): (.+)$/)
      setError(match ? match[1] : msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f8f9fc 0%, #eef1f8 100%)',
      }}
    >
      <div
        style={{
          width: 380,
          background: 'var(--bg-card)',
          borderRadius: 16,
          padding: '40px 32px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
          border: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 48,
              height: 48,
              background: 'linear-gradient(135deg, #4f6ef7, #7c5cf7)',
              borderRadius: 14,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
              boxShadow: '0 4px 16px rgba(79,110,247,0.3)',
            }}
          >
            <FlaskConical size={24} color="#fff" strokeWidth={2} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#1a1a2e' }}>
            {isRegister ? 'Create Account' : 'Welcome Back'}
          </h1>
          <p style={{ fontSize: 14, color: '#8b95a5', margin: '6px 0 0' }}>
            {isRegister ? 'Sign up to start your research' : 'Sign in to OpenAGS'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 500,
                color: '#4a5568',
                marginBottom: 5,
              }}
            >
              Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your-username"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e2e5ea',
                borderRadius: 8,
                fontSize: 14,
                outline: 'none',
                transition: 'border-color 0.15s',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#4f6ef7'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e2e5ea'
              }}
            />
          </div>

          {isRegister && (
            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#4a5568',
                  marginBottom: 5,
                }}
              >
                Display Name
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Dr. Smith"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #e2e5ea',
                  borderRadius: 8,
                  fontSize: 14,
                  outline: 'none',
                  transition: 'border-color 0.15s',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#4f6ef7'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e2e5ea'
                }}
              />
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 500,
                color: '#4a5568',
                marginBottom: 5,
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e2e5ea',
                borderRadius: 8,
                fontSize: 14,
                outline: 'none',
                transition: 'border-color 0.15s',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#4f6ef7'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e2e5ea'
              }}
            />
          </div>

          {!isRegister && (
            <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#4f6ef7', cursor: 'pointer' }}
              />
              <label htmlFor="rememberMe" style={{ fontSize: 13, color: '#4a5568', cursor: 'pointer', userSelect: 'none' }}>
                Remember me
              </label>
            </div>
          )}

          {error && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                background: '#fef2f2',
                color: '#dc2626',
                fontSize: 13,
                marginBottom: 14,
                border: '1px solid #fee2e2',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '11px 0',
              background: loading ? '#a0aec0' : 'linear-gradient(135deg, #4f6ef7, #7c5cf7)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.15s',
            }}
          >
            {loading ? 'Please wait...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: '#8b95a5' }}>
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <span
            onClick={() => {
              setIsRegister(!isRegister)
              setError('')
            }}
            style={{ color: '#4f6ef7', cursor: 'pointer', fontWeight: 500 }}
          >
            {isRegister ? 'Sign In' : 'Sign Up'}
          </span>
        </div>
      </div>
    </div>
  )
}
