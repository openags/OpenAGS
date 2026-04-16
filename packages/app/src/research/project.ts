/**
 * Project Management — CRUD + workspace directory structure
 *
 * Templates are loaded from an external directory (not hardcoded).
 * Default template location: {repo}/templates/default/
 * Configurable via ProjectManager options or config.yaml.
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'
import { Project, ProjectId } from '../schemas.js'
import { ProjectError } from '../errors.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Resolve a project's workspace directory, checking both the default
 * `{workspace}/projects/{id}/` location and the external index for
 * projects created with a custom workspace_dir.
 */
export function resolveProjectWorkspace(workspaceDirRoot: string, projectId: string): string | null {
  const indexPath = path.join(workspaceDirRoot, 'projects_index.yaml')
  if (fs.existsSync(indexPath)) {
    try {
      const data = yaml.load(fs.readFileSync(indexPath, 'utf-8')) as Record<string, string> | null
      const ext = data?.[projectId]
      if (ext && fs.existsSync(path.join(ext, '.openags', 'meta.yaml'))) {
        return ext
      }
    } catch { /* fall through to default */ }
  }
  const defaultDir = path.join(workspaceDirRoot, 'projects', projectId)
  if (fs.existsSync(path.join(defaultDir, '.openags', 'meta.yaml'))) {
    return defaultDir
  }
  return null
}

/**
 * Discover agent modules in a project directory.
 * A subdirectory is a module if it contains SOUL.md, sessions/, or memory.md.
 */
export function discoverModules(projectDir: string): string[] {
  if (!fs.existsSync(projectDir)) return []

  const modules: string[] = []
  for (const entry of fs.readdirSync(projectDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const sub = path.join(projectDir, entry.name)
    const hasSoul = fs.existsSync(path.join(sub, 'SOUL.md'))
    const hasSessions = fs.existsSync(path.join(sub, 'sessions')) && fs.statSync(path.join(sub, 'sessions')).isDirectory()
    const hasMemory = fs.existsSync(path.join(sub, 'memory.md'))
    if (hasSoul || hasSessions || hasMemory) {
      modules.push(entry.name)
    }
  }
  return modules.sort()
}

/**
 * List available template names from the templates directory.
 */
export function listTemplates(templatesDir: string): string[] {
  if (!fs.existsSync(templatesDir)) return []
  return fs.readdirSync(templatesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
}

/**
 * Recursively copy a directory tree, skipping files that already exist.
 */
function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else {
      // Don't overwrite existing files
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath)
      }
    }
  }
}

export interface ProjectManagerOptions {
  workspaceDir: string
  templatesDir?: string
}

/**
 * Manages project lifecycle and workspace directories.
 *
 * Templates are external directories that get copied into new projects.
 * To update templates, edit the files in the templates directory — no code changes needed.
 */
export class ProjectManager {
  private baseDir: string
  private templatesDir: string
  private indexPath: string
  private external: Record<string, string> = {}

  constructor(options: ProjectManagerOptions) {
    this.baseDir = path.join(options.workspaceDir, 'projects')
    this.indexPath = path.join(options.workspaceDir, 'projects_index.yaml')

    // Templates directory: explicit > repo templates/ > fallback empty
    this.templatesDir = options.templatesDir || this.findTemplatesDir()

    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true })
    }

    this.external = this.loadIndex()
  }

  /**
   * Find the templates directory by searching upward from this file.
   */
  private findTemplatesDir(): string {
    // Search upward for a 'templates' directory (repo root)
    let dir = __dirname
    for (let i = 0; i < 10; i++) {
      const candidate = path.join(dir, 'templates')
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate
      }
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    // Fallback: next to workspace
    return path.join(path.dirname(this.baseDir), 'templates')
  }

  private loadIndex(): Record<string, string> {
    if (!fs.existsSync(this.indexPath)) return {}
    try {
      const data = yaml.load(fs.readFileSync(this.indexPath, 'utf-8'))
      return typeof data === 'object' && data !== null ? data as Record<string, string> : {}
    } catch {
      return {}
    }
  }

  private saveIndex(): void {
    fs.writeFileSync(this.indexPath, yaml.dump(this.external, { indent: 2 }), 'utf-8')
  }

  /**
   * Create a new project by copying a template directory.
   */
  create(options: {
    projectId: string
    name: string
    description?: string
    ownerId?: string
    workspaceDir?: string
    template?: string
  }): Project {
    const { projectId, name, description = '', ownerId = '', template = 'default' } = options

    const idResult = ProjectId.safeParse(projectId)
    if (!idResult.success) {
      throw new ProjectError(`Invalid project ID: ${projectId}`)
    }

    const projectDir = options.workspaceDir
      ? path.resolve(options.workspaceDir)
      : path.join(this.baseDir, projectId)

    if (fs.existsSync(path.join(projectDir, '.openags', 'meta.yaml'))) {
      throw new ProjectError(`Project '${projectId}' already exists at ${projectDir}`)
    }
    const defaultDir = path.join(this.baseDir, projectId)
    if (
      defaultDir !== projectDir &&
      fs.existsSync(path.join(defaultDir, '.openags', 'meta.yaml'))
    ) {
      throw new ProjectError(
        `Project ID '${projectId}' is already in use at ${defaultDir}. Pick a different name or remove the existing project.`,
      )
    }
    if (this.external[projectId] && this.external[projectId] !== projectDir) {
      throw new ProjectError(
        `Project ID '${projectId}' is already registered at ${this.external[projectId]}. Pick a different name.`,
      )
    }

    const now = new Date().toISOString()
    const project: Project = {
      id: projectId,
      name,
      description,
      stage: 'idle',
      created_at: now,
      updated_at: now,
      workspace: projectDir,
      owner_id: ownerId,
    }

    // Create base .openags directory
    fs.mkdirSync(path.join(projectDir, '.openags', 'sessions'), { recursive: true })

    // Copy template directory into project
    const templateDir = path.join(this.templatesDir, template)
    if (fs.existsSync(templateDir)) {
      copyDirRecursive(templateDir, projectDir)
    }

    // Save metadata (after template copy so .openags exists)
    this.saveMeta(project)
    // Ensure history and plan files exist
    const historyPath = path.join(projectDir, '.openags', 'history.md')
    const planPath = path.join(projectDir, '.openags', 'plan.md')
    if (!fs.existsSync(historyPath)) fs.writeFileSync(historyPath, '', 'utf-8')
    if (!fs.existsSync(planPath)) fs.writeFileSync(planPath, '', 'utf-8')

    // Track external projects
    if (options.workspaceDir) {
      this.external[projectId] = projectDir
      this.saveIndex()
    }

    return project
  }

  private resolveProjectDir(projectId: string): string | null {
    const extPath = this.external[projectId]
    if (extPath && fs.existsSync(path.join(extPath, '.openags', 'meta.yaml'))) {
      return extPath
    }
    const defaultDir = path.join(this.baseDir, projectId)
    if (fs.existsSync(path.join(defaultDir, '.openags', 'meta.yaml'))) {
      return defaultDir
    }
    return null
  }

  get(projectId: string): Project {
    const projectDir = this.resolveProjectDir(projectId)
    if (!projectDir) {
      throw new ProjectError(`Project '${projectId}' not found`)
    }

    const metaPath = path.join(projectDir, '.openags', 'meta.yaml')
    try {
      const raw = yaml.load(fs.readFileSync(metaPath, 'utf-8')) as Record<string, unknown>
      const result = Project.safeParse(raw)
      if (!result.success) {
        throw new ProjectError(`Invalid project metadata: ${result.error.message}`)
      }
      return result.data
    } catch (err) {
      if (err instanceof ProjectError) throw err
      throw new ProjectError(`Failed to load project '${projectId}': ${err}`)
    }
  }

  listAll(): Project[] {
    const seen = new Set<string>()
    const projects: Project[] = []

    if (fs.existsSync(this.baseDir)) {
      for (const entry of fs.readdirSync(this.baseDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const metaPath = path.join(this.baseDir, entry.name, '.openags', 'meta.yaml')
        if (fs.existsSync(metaPath)) {
          try {
            const p = this.get(entry.name)
            projects.push(p)
            seen.add(p.id)
          } catch { /* skip corrupt */ }
        }
      }
    }

    for (const pid of Object.keys(this.external)) {
      if (seen.has(pid)) continue
      try {
        projects.push(this.get(pid))
      } catch { /* skip missing */ }
    }

    return projects.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
  }

  /**
   * List available templates.
   */
  listTemplates(): string[] {
    return listTemplates(this.templatesDir)
  }

  updateStage(projectId: string, stage: string): Project {
    const project = this.get(projectId)
    project.stage = stage
    project.updated_at = new Date().toISOString()
    this.saveMeta(project)
    return project
  }

  delete(projectId: string): void {
    const projectDir = this.resolveProjectDir(projectId)
    if (!projectDir) {
      throw new ProjectError(`Project '${projectId}' not found`)
    }
    fs.rmSync(projectDir, { recursive: true, force: true })
    if (this.external[projectId]) {
      delete this.external[projectId]
      this.saveIndex()
    }
  }

  private saveMeta(project: Project): void {
    const metaPath = path.join(project.workspace, '.openags', 'meta.yaml')
    fs.writeFileSync(metaPath, yaml.dump({ ...project }, { indent: 2 }), 'utf-8')
  }
}
