/**
 * Experiment Engine — Docker-based sandboxed code execution
 *
 * Replaces Python's research/experiment/engine.py using dockerode.
 */

import Docker from 'dockerode'
import * as path from 'path'
import * as fs from 'fs'
import { randomUUID } from 'crypto'

export interface ExperimentConfig {
  /** Docker image to use */
  image: string
  /** Command to run */
  command: string[]
  /** Working directory inside container */
  workingDir?: string
  /** Memory limit (e.g., '512m', '1g') */
  memoryLimit?: string
  /** CPU limit (number of CPUs) */
  cpuLimit?: number
  /** Timeout in seconds */
  timeout?: number
  /** Environment variables */
  env?: Record<string, string>
  /** Host directory to mount as /workspace */
  workspaceDir?: string
  /** Enable network access (default: false for security) */
  network?: boolean
}

export interface ExperimentResult {
  /** Unique experiment ID */
  id: string
  /** Exit code (null if timed out) */
  exitCode: number | null
  /** Standard output */
  stdout: string
  /** Standard error */
  stderr: string
  /** Execution time in milliseconds */
  durationMs: number
  /** Whether the experiment timed out */
  timedOut: boolean
}

export class ExperimentEngine {
  private docker: Docker

  constructor(dockerSocket?: string) {
    this.docker = new Docker(dockerSocket ? { socketPath: dockerSocket } : undefined)
  }

  /**
   * Run an experiment in a Docker container.
   */
  async run(config: ExperimentConfig): Promise<ExperimentResult> {
    const id = randomUUID()
    const startTime = Date.now()

    // Parse memory limit
    const memoryBytes = config.memoryLimit ? this.parseMemoryLimit(config.memoryLimit) : 512 * 1024 * 1024

    // Build container options
    const containerOptions: Docker.ContainerCreateOptions = {
      Image: config.image,
      Cmd: config.command,
      WorkingDir: config.workingDir || '/workspace',
      Env: config.env ? Object.entries(config.env).map(([k, v]) => `${k}=${v}`) : [],
      HostConfig: {
        Memory: memoryBytes,
        MemorySwap: memoryBytes, // Disable swap
        CpuPeriod: 100000,
        CpuQuota: (config.cpuLimit || 1) * 100000,
        NetworkMode: config.network ? 'bridge' : 'none',
        AutoRemove: true,
        Binds: config.workspaceDir ? [`${config.workspaceDir}:/workspace:rw`] : [],
        SecurityOpt: ['no-new-privileges'],
        ReadonlyRootfs: false,
      },
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    }

    let container: Docker.Container | null = null
    let timedOut = false
    let stdout = ''
    let stderr = ''
    let exitCode: number | null = null

    try {
      // Pull image if not present
      await this.ensureImage(config.image)

      // Create container
      container = await this.docker.createContainer(containerOptions)

      // Start with timeout
      const timeoutMs = (config.timeout || 300) * 1000

      const runPromise = (async () => {
        const stream = await container!.attach({ stream: true, stdout: true, stderr: true })

        // Collect output
        const outputPromise = new Promise<void>((resolve) => {
          const stdoutChunks: Buffer[] = []
          const stderrChunks: Buffer[] = []

          // Create simple writable stream wrappers
          const stdoutStream = {
            write: (chunk: Buffer) => { stdoutChunks.push(chunk); return true },
            end: () => {},
            writable: true,
          }
          const stderrStream = {
            write: (chunk: Buffer) => { stderrChunks.push(chunk); return true },
            end: () => {},
            writable: true,
          }

          container!.modem.demuxStream(stream, stdoutStream as unknown as NodeJS.WritableStream, stderrStream as unknown as NodeJS.WritableStream)

          stream.on('end', () => {
            stdout = Buffer.concat(stdoutChunks).toString('utf-8')
            stderr = Buffer.concat(stderrChunks).toString('utf-8')
            resolve()
          })
        })

        await container!.start()
        const result = await container!.wait()
        await outputPromise

        return result.StatusCode
      })()

      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('Experiment timed out')), timeoutMs)
      })

      try {
        exitCode = await Promise.race([runPromise, timeoutPromise])
      } catch (err) {
        if (err instanceof Error && err.message === 'Experiment timed out') {
          timedOut = true
          // Kill the container
          try {
            await container.kill()
          } catch {
            // Container may already be stopped
          }
        } else {
          throw err
        }
      }
    } finally {
      // Cleanup
      if (container) {
        try {
          await container.remove({ force: true })
        } catch {
          // Container may have been auto-removed
        }
      }
    }

    const durationMs = Date.now() - startTime

    return {
      id,
      exitCode,
      stdout,
      stderr,
      durationMs,
      timedOut,
    }
  }

  /**
   * Run a Python script in a sandbox.
   */
  async runPython(
    script: string,
    options?: {
      image?: string
      timeout?: number
      memoryLimit?: string
      requirements?: string[]
    }
  ): Promise<ExperimentResult> {
    const workspaceDir = fs.mkdtempSync(path.join('/tmp', 'openags-experiment-'))

    try {
      // Write script
      fs.writeFileSync(path.join(workspaceDir, 'script.py'), script, { mode: 0o644 })

      // Build command
      let command: string[]
      if (options?.requirements && options.requirements.length > 0) {
        const reqFile = path.join(workspaceDir, 'requirements.txt')
        fs.writeFileSync(reqFile, options.requirements.join('\n'), { mode: 0o644 })
        command = ['sh', '-c', 'pip install -q -r requirements.txt && python script.py']
      } else {
        command = ['python', 'script.py']
      }

      return await this.run({
        image: options?.image || 'python:3.11-slim',
        command,
        workspaceDir,
        timeout: options?.timeout || 120,
        memoryLimit: options?.memoryLimit || '256m',
        network: !!(options?.requirements && options.requirements.length > 0),
      })
    } finally {
      // Cleanup temp directory
      fs.rmSync(workspaceDir, { recursive: true, force: true })
    }
  }

  /**
   * Run a shell script in a sandbox.
   */
  async runShell(
    script: string,
    options?: {
      image?: string
      timeout?: number
      memoryLimit?: string
    }
  ): Promise<ExperimentResult> {
    const workspaceDir = fs.mkdtempSync(path.join('/tmp', 'openags-experiment-'))

    try {
      fs.writeFileSync(path.join(workspaceDir, 'script.sh'), script, { mode: 0o755 })

      return await this.run({
        image: options?.image || 'ubuntu:22.04',
        command: ['bash', 'script.sh'],
        workspaceDir,
        timeout: options?.timeout || 60,
        memoryLimit: options?.memoryLimit || '256m',
      })
    } finally {
      fs.rmSync(workspaceDir, { recursive: true, force: true })
    }
  }

  /**
   * List available images.
   */
  async listImages(): Promise<string[]> {
    const images = await this.docker.listImages()
    return images
      .flatMap(img => img.RepoTags || [])
      .filter(tag => tag !== '<none>:<none>')
  }

  /**
   * Pull an image if not present.
   */
  private async ensureImage(image: string): Promise<void> {
    try {
      await this.docker.getImage(image).inspect()
    } catch {
      // Image not found, pull it
      await new Promise<void>((resolve, reject) => {
        this.docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) return reject(err)

          this.docker.modem.followProgress(stream, (err: Error | null) => {
            if (err) reject(err)
            else resolve()
          })
        })
      })
    }
  }

  private parseMemoryLimit(limit: string): number {
    const match = limit.match(/^(\d+)([kmg]?)$/i)
    if (!match) return 512 * 1024 * 1024

    const value = parseInt(match[1], 10)
    const unit = match[2].toLowerCase()

    switch (unit) {
      case 'k':
        return value * 1024
      case 'm':
        return value * 1024 * 1024
      case 'g':
        return value * 1024 * 1024 * 1024
      default:
        return value
    }
  }
}
