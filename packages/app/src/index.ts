/**
 * OpenAGS Application Server — Entry Point & Library Exports
 *
 * When run directly: starts the server.
 * When imported: only exports are available (no auto-start).
 */

import { createServer, destroyAllPtySessions, destroyAllWorkflows } from './server.js'
import { execSync } from 'child_process'

const DEFAULT_PORT = 19836

function killPort(port: number): void {
  try {
    if (process.platform === 'win32') {
      execSync(`for /f "tokens=5" %a in ('netstat -aon ^| findstr :${port}') do taskkill /F /PID %a`, { stdio: 'ignore' })
    } else {
      execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null`, { stdio: 'ignore' })
    }
  } catch { /* nothing to kill */ }
}

async function main(): Promise<void> {
  const port = parseInt(process.env.PORT || String(DEFAULT_PORT), 10)
  const staticDir = process.env.STATIC_DIR || undefined

  killPort(port)
  // Wait for OS to release port
  await new Promise((r) => setTimeout(r, 1000))

  const { server } = createServer({ staticDir, port })

  server.listen(port, '127.0.0.1', () => {
    console.log(`OpenAGS server running at http://127.0.0.1:${port}`)
  })

  const shutdown = (): void => {
    console.log('\nShutting down...')
    destroyAllPtySessions()
    destroyAllWorkflows()
    server.close(() => {
      console.log('Server closed')
      process.exit(0)
    })
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

// Only auto-start when run directly (not when imported as library)
const isDirectRun = process.argv[1]?.includes('index.js') || process.argv[1]?.includes('index.ts')
if (isDirectRun) {
  main().catch((err) => {
    console.error('Failed to start server:', err)
    process.exit(1)
  })
}

// ── Library exports ──────────────────────────────────

export { createServer, destroyAllPtySessions, destroyAllWorkflows } from './server.js'
export type { ServerOptions } from './server.js'

export * from './schemas.js'
export * from './errors.js'
export { loadConfig } from './config.js'

export { searchArxiv, getArxivPaper, arxivToCitation } from './research/tools/arxiv.js'
export { searchSemanticScholar, getS2Paper, s2ToCitation } from './research/tools/semantic-scholar.js'
export { verifyCitation, verifyCitations, parseBibtex } from './research/tools/citations.js'
export { ProjectManager, discoverModules } from './research/project.js'

export { ExperimentEngine } from './research/experiment.js'
export type { ExperimentConfig, ExperimentResult } from './research/experiment.js'
export { SSHExecutor, sshExec } from './research/ssh.js'
export type { SSHConfig, SSHExecResult } from './research/ssh.js'

export { MessagingRouter, TelegramBot, DiscordBot, FeishuBot } from './messaging/index.js'
export type { MessagingConfig, TelegramConfig, DiscordConfig, FeishuConfig } from './messaging/index.js'

export { createAuthRoutes } from './routes/auth.js'
export { createProjectRoutes } from './routes/projects.js'
export { createResearchRoutes } from './routes/research.js'
export { createConfigRoutes } from './routes/config.js'
export { createSkillsRoutes } from './routes/skills.js'
export { createWorkflowRoutes } from './routes/workflow.js'
