/**
 * Workflow Routes — orchestration and task dispatch
 */

import { Router, Request, Response } from 'express'
import { WorkflowOrchestrator } from '../workflow/orchestrator.js'

export function createWorkflowRoutes(orchestrator: WorkflowOrchestrator): Router {
  const router = Router()

  // Get workflow state
  router.get('/workflows/state', (_req: Request, res: Response) => {
    try {
      const state = orchestrator.getState()
      res.json(state)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  // Pause workflow
  router.post('/workflows/pause', (_req: Request, res: Response) => {
    try {
      orchestrator.pause()
      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  // Resume workflow
  router.post('/workflows/resume', (_req: Request, res: Response) => {
    try {
      orchestrator.resume()
      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  // Stop workflow
  router.post('/workflows/stop', (_req: Request, res: Response) => {
    try {
      orchestrator.stop()
      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  // Intervene with message
  router.post('/workflows/intervene', async (req: Request, res: Response) => {
    try {
      const { message } = req.body
      if (!message) {
        res.status(400).json({ error: 'message is required' })
        return
      }
      await orchestrator.intervene(message)
      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  return router
}
