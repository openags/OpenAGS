/**
 * SSH Executor — run commands on remote machines via SSH
 *
 * Replaces Python's research/experiment/ssh_executor.py using ssh2.
 */

import { Client, ConnectConfig, ExecOptions } from 'ssh2'

export interface SSHConfig {
  host: string
  port?: number
  username: string
  password?: string
  privateKey?: string | Buffer
  passphrase?: string
  /** Connection timeout in ms */
  timeout?: number
}

export interface SSHExecResult {
  /** Exit code */
  code: number | null
  /** Standard output */
  stdout: string
  /** Standard error */
  stderr: string
  /** Signal that killed the process (if any) */
  signal?: string
}

export class SSHExecutor {
  private config: SSHConfig
  private client: Client | null = null
  private connected = false

  constructor(config: SSHConfig) {
    this.config = config
  }

  /**
   * Connect to the SSH server.
   */
  async connect(): Promise<void> {
    if (this.connected) return

    return new Promise((resolve, reject) => {
      this.client = new Client()

      const connectConfig: ConnectConfig = {
        host: this.config.host,
        port: this.config.port || 22,
        username: this.config.username,
        readyTimeout: this.config.timeout || 30000,
      }

      if (this.config.password) {
        connectConfig.password = this.config.password
      } else if (this.config.privateKey) {
        connectConfig.privateKey = this.config.privateKey
        if (this.config.passphrase) {
          connectConfig.passphrase = this.config.passphrase
        }
      }

      this.client.on('ready', () => {
        this.connected = true
        resolve()
      })

      this.client.on('error', (err) => {
        this.connected = false
        reject(err)
      })

      this.client.connect(connectConfig)
    })
  }

  /**
   * Execute a command on the remote server.
   */
  async exec(command: string, options?: { timeout?: number; env?: Record<string, string> }): Promise<SSHExecResult> {
    if (!this.connected || !this.client) {
      await this.connect()
    }

    return new Promise((resolve, reject) => {
      const execOptions: ExecOptions = {}

      if (options?.env) {
        execOptions.env = options.env
      }

      this.client!.exec(command, execOptions, (err, stream) => {
        if (err) return reject(err)

        let stdout = ''
        let stderr = ''
        let code: number | null = null
        let signal: string | undefined

        // Set timeout if specified
        let timeoutId: NodeJS.Timeout | undefined
        if (options?.timeout) {
          timeoutId = setTimeout(() => {
            stream.close()
            reject(new Error(`Command timed out after ${options.timeout}ms`))
          }, options.timeout)
        }

        stream.on('close', (exitCode: number | null, signalName?: string) => {
          if (timeoutId) clearTimeout(timeoutId)
          code = exitCode
          signal = signalName
          resolve({ code, stdout, stderr, signal })
        })

        stream.on('data', (data: Buffer) => {
          stdout += data.toString()
        })

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString()
        })
      })
    })
  }

  /**
   * Upload a file to the remote server.
   */
  async upload(localPath: string, remotePath: string): Promise<void> {
    if (!this.connected || !this.client) {
      await this.connect()
    }

    return new Promise((resolve, reject) => {
      this.client!.sftp((err, sftp) => {
        if (err) return reject(err)

        sftp.fastPut(localPath, remotePath, (err) => {
          if (err) return reject(err)
          resolve()
        })
      })
    })
  }

  /**
   * Download a file from the remote server.
   */
  async download(remotePath: string, localPath: string): Promise<void> {
    if (!this.connected || !this.client) {
      await this.connect()
    }

    return new Promise((resolve, reject) => {
      this.client!.sftp((err, sftp) => {
        if (err) return reject(err)

        sftp.fastGet(remotePath, localPath, (err) => {
          if (err) return reject(err)
          resolve()
        })
      })
    })
  }

  /**
   * Execute a script on the remote server.
   */
  async runScript(script: string, options?: { timeout?: number; interpreter?: string }): Promise<SSHExecResult> {
    const interpreter = options?.interpreter || '/bin/bash'
    const command = `${interpreter} -c ${JSON.stringify(script)}`
    return this.exec(command, { timeout: options?.timeout })
  }

  /**
   * Check if a path exists on the remote server.
   */
  async exists(remotePath: string): Promise<boolean> {
    try {
      const result = await this.exec(`test -e ${JSON.stringify(remotePath)} && echo "exists"`)
      return result.stdout.trim() === 'exists'
    } catch {
      return false
    }
  }

  /**
   * Create a directory on the remote server.
   */
  async mkdir(remotePath: string, recursive = true): Promise<void> {
    const flag = recursive ? '-p' : ''
    await this.exec(`mkdir ${flag} ${JSON.stringify(remotePath)}`)
  }

  /**
   * Close the SSH connection.
   */
  close(): void {
    if (this.client) {
      this.client.end()
      this.client = null
      this.connected = false
    }
  }
}

/**
 * Execute a command on a remote server (one-shot connection).
 */
export async function sshExec(config: SSHConfig, command: string): Promise<SSHExecResult> {
  const executor = new SSHExecutor(config)
  try {
    await executor.connect()
    return await executor.exec(command)
  } finally {
    executor.close()
  }
}
