/**
 * Project Routes — REST API for project CRUD
 */

import { Router, Request, Response } from 'express'
import * as path from 'path'
import * as os from 'os'
import { ProjectManager, discoverModules } from '../research/project.js'
import { ProjectError } from '../errors.js'

function slugify(text: string): string {
  let slug = text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (slug.length < 3) slug = `${slug || 'project'}-${Date.now().toString(36).slice(-4)}`
  if (slug.length > 64) slug = slug.slice(0, 64).replace(/-$/, '')
  return slug
}

function getParamId(req: Request): string {
  const id = req.params.id
  return Array.isArray(id) ? id[0] : id
}

export function createProjectRoutes(workspaceDir?: string, templatesDir?: string): Router {
  const router = Router()
  const manager = new ProjectManager({
    workspaceDir: workspaceDir || path.join(os.homedir(), '.openags'),
    templatesDir,
  })

  // List all projects (with and without trailing slash)
  router.get('/projects/', (_req: Request, res: Response) => {
    try {
      const projects = manager.listAll()
      res.json(projects)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })
  router.get('/projects', (_req: Request, res: Response) => {
    try {
      const projects = manager.listAll()
      res.json(projects)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  // Get single project
  router.get('/projects/:id', (req: Request, res: Response) => {
    try {
      const project = manager.get(getParamId(req))
      const modules = discoverModules(project.workspace)
      res.json({ ...project, modules })
    } catch (err) {
      if (err instanceof ProjectError) {
        res.status(404).json({ error: err.message })
      } else {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
      }
    }
  })

  // Create project
  router.post('/projects', (req: Request, res: Response) => {
    try {
      const { id, name, description, workspace_dir, template } = req.body
      if (!name) {
        res.status(400).json({ error: 'name is required' })
        return
      }

      // Auto-generate ID from name if not provided
      const projectId = id || slugify(name)

      const project = manager.create({
        projectId,
        name,
        description,
        workspaceDir: workspace_dir,
        template,
      })

      res.status(201).json(project)
    } catch (err) {
      if (err instanceof ProjectError) {
        res.status(400).json({ error: err.message })
      } else {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
      }
    }
  })

  // Update project stage
  router.patch('/projects/:id/stage', (req: Request, res: Response) => {
    try {
      const { stage } = req.body
      if (!stage) {
        res.status(400).json({ error: 'stage is required' })
        return
      }

      const project = manager.updateStage(getParamId(req), stage)
      res.json(project)
    } catch (err) {
      if (err instanceof ProjectError) {
        res.status(404).json({ error: err.message })
      } else {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
      }
    }
  })

  // Delete project
  router.delete('/projects/:id', (req: Request, res: Response) => {
    try {
      manager.delete(getParamId(req))
      res.status(204).send()
    } catch (err) {
      if (err instanceof ProjectError) {
        res.status(404).json({ error: err.message })
      } else {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
      }
    }
  })

  // Get project modules
  router.get('/projects/:id/modules', (req: Request, res: Response) => {
    try {
      const project = manager.get(getParamId(req))
      const modules = discoverModules(project.workspace)
      res.json(modules)
    } catch (err) {
      if (err instanceof ProjectError) {
        res.status(404).json({ error: err.message })
      } else {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
      }
    }
  })

  // List available templates
  router.get('/templates', (_req: Request, res: Response) => {
    res.json(manager.listTemplates())
  })

  return router
}
