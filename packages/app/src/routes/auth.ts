/**
 * Auth routes — simple file-based user management.
 *
 * Users are stored in {workspace}/users.json with hashed passwords.
 * Tokens are random hex strings stored alongside user data.
 */

import { Router } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'

interface StoredUser {
  id: string
  username: string
  display_name: string
  password_hash: string
  token: string
  created_at: string
}

interface UsersDB {
  users: StoredUser[]
}

function getUsersPath(workspaceDir?: string): string {
  const base = workspaceDir || path.join(os.homedir(), '.openags')
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true })
  }
  return path.join(base, 'users.json')
}

function loadUsers(filePath: string): UsersDB {
  if (!fs.existsSync(filePath)) {
    return { users: [] }
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { users?: unknown }).users)
    ) {
      return parsed as UsersDB
    }
    return { users: [] }
  } catch {
    return { users: [] }
  }
}

function saveUsers(filePath: string, db: UsersDB): void {
  fs.writeFileSync(filePath, JSON.stringify(db, null, 2), { encoding: 'utf-8', mode: 0o600 })
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const derived = crypto.scryptSync(password, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'))
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function createAuthRoutes(workspaceDir?: string): Router {
  const router = Router()
  const usersPath = getUsersPath(workspaceDir)

  // POST /auth/register
  router.post('/auth/register', (req, res) => {
    const { username, password, display_name } = req.body as {
      username?: string
      password?: string
      display_name?: string
    }

    if (!username || !password) {
      res.status(400).json({ detail: 'Username and password are required' })
      return
    }

    if (username.length < 2 || username.length > 64) {
      res.status(400).json({ detail: 'Username must be 2-64 characters' })
      return
    }

    if (password.length < 4) {
      res.status(400).json({ detail: 'Password must be at least 4 characters' })
      return
    }

    const db = loadUsers(usersPath)

    if (db.users.find((u) => u.username === username)) {
      res.status(409).json({ detail: 'Username already exists' })
      return
    }

    const token = generateToken()
    const user: StoredUser = {
      id: crypto.randomUUID(),
      username,
      display_name: display_name || username,
      password_hash: hashPassword(password),
      token,
      created_at: new Date().toISOString(),
    }

    db.users.push(user)
    saveUsers(usersPath, db)

    res.json({
      user: { id: user.id, username: user.username, display_name: user.display_name },
      token,
    })
  })

  // POST /auth/login
  router.post('/auth/login', (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string }

    if (!username || !password) {
      res.status(400).json({ detail: 'Username and password are required' })
      return
    }

    const db = loadUsers(usersPath)
    const user = db.users.find((u) => u.username === username)

    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ detail: 'Invalid username or password' })
      return
    }

    // Rotate token on login
    const token = generateToken()
    user.token = token
    saveUsers(usersPath, db)

    res.json({
      user: { id: user.id, username: user.username, display_name: user.display_name },
      token,
    })
  })

  // GET /auth/me — validate token, return user info
  router.get('/auth/me', (req, res) => {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ detail: 'Not authenticated' })
      return
    }

    const token = authHeader.slice(7)
    const db = loadUsers(usersPath)
    const user = db.users.find((u) => u.token === token)

    if (!user) {
      res.status(401).json({ detail: 'Invalid or expired token' })
      return
    }

    res.json({ id: user.id, username: user.username, display_name: user.display_name })
  })

  // POST /auth/logout
  router.post('/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const db = loadUsers(usersPath)
      const user = db.users.find((u) => u.token === token)
      if (user) {
        user.token = '' // Invalidate token
        saveUsers(usersPath, db)
      }
    }
    res.json({ status: 'ok' })
  })

  return router
}
