import { describe, it, expect } from 'vitest'
import {
  OpenAGSError, ProjectError, ConfigError, AgentError,
  ToolError, ExperimentError, BackendError, ValidationError,
} from './errors.js'

describe('Error hierarchy', () => {
  it('all errors extend OpenAGSError', () => {
    expect(new ProjectError('test')).toBeInstanceOf(OpenAGSError)
    expect(new ConfigError('test')).toBeInstanceOf(OpenAGSError)
    expect(new AgentError('test')).toBeInstanceOf(OpenAGSError)
    expect(new ToolError('test')).toBeInstanceOf(OpenAGSError)
    expect(new ExperimentError('test')).toBeInstanceOf(OpenAGSError)
    expect(new BackendError('test')).toBeInstanceOf(OpenAGSError)
    expect(new ValidationError('test')).toBeInstanceOf(OpenAGSError)
  })

  it('all errors extend Error', () => {
    expect(new OpenAGSError('test')).toBeInstanceOf(Error)
    expect(new ProjectError('test')).toBeInstanceOf(Error)
  })

  it('preserves error name', () => {
    expect(new ProjectError('msg').name).toBe('ProjectError')
    expect(new ConfigError('msg').name).toBe('ConfigError')
    expect(new AgentError('msg').name).toBe('AgentError')
    expect(new ToolError('msg').name).toBe('ToolError')
    expect(new ExperimentError('msg').name).toBe('ExperimentError')
    expect(new BackendError('msg').name).toBe('BackendError')
    expect(new ValidationError('msg').name).toBe('ValidationError')
  })

  it('preserves error message', () => {
    expect(new ProjectError('project not found').message).toBe('project not found')
  })

  it('can be caught by type', () => {
    try {
      throw new ProjectError('not found')
    } catch (err) {
      expect(err).toBeInstanceOf(ProjectError)
      expect(err).toBeInstanceOf(OpenAGSError)
    }
  })
})
