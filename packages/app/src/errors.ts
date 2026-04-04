/**
 * OpenAGS Error Classes
 */

export class OpenAGSError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OpenAGSError'
  }
}

export class ProjectError extends OpenAGSError {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectError'
  }
}

export class ConfigError extends OpenAGSError {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export class AgentError extends OpenAGSError {
  constructor(message: string) {
    super(message)
    this.name = 'AgentError'
  }
}

export class ToolError extends OpenAGSError {
  constructor(message: string) {
    super(message)
    this.name = 'ToolError'
  }
}

export class ExperimentError extends OpenAGSError {
  constructor(message: string) {
    super(message)
    this.name = 'ExperimentError'
  }
}

export class BackendError extends OpenAGSError {
  constructor(message: string) {
    super(message)
    this.name = 'BackendError'
  }
}

export class ValidationError extends OpenAGSError {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}
