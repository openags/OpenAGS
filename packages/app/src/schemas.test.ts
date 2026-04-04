import { describe, it, expect } from 'vitest'
import {
  ProjectId, Project, Session, Message, BackendConfig, AgentConfig,
  Experiment, Citation, SkillMeta, SystemConfig, TokenUsage,
  WorkflowConfig, DirectiveModel, StatusModel, HookConfig,
} from './schemas.js'

describe('ProjectId', () => {
  it('accepts valid project IDs', () => {
    expect(ProjectId.safeParse('my-project').success).toBe(true)
    expect(ProjectId.safeParse('a1').success).toBe(true)
    expect(ProjectId.safeParse('test-project-123').success).toBe(true)
    expect(ProjectId.safeParse('a0_b1-c2').success).toBe(true)
  })

  it('rejects invalid project IDs', () => {
    expect(ProjectId.safeParse('').success).toBe(false)
    expect(ProjectId.safeParse('A').success).toBe(false) // uppercase
    expect(ProjectId.safeParse('-start').success).toBe(false) // starts with dash
    expect(ProjectId.safeParse('end-').success).toBe(false) // ends with dash
    expect(ProjectId.safeParse('has space').success).toBe(false)
  })
})

describe('Project', () => {
  it('parses a valid project', () => {
    const result = Project.safeParse({
      id: 'my-project',
      name: 'My Project',
      workspace: '/tmp/my-project',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.stage).toBe('idle')
      expect(result.data.description).toBe('')
      expect(result.data.owner_id).toBe('')
    }
  })

  it('rejects missing required fields', () => {
    expect(Project.safeParse({ name: 'test' }).success).toBe(false) // missing id, workspace
    expect(Project.safeParse({ id: 'test-id', workspace: '/tmp' }).success).toBe(false) // missing name
  })
})

describe('Message', () => {
  it('validates role enum', () => {
    expect(Message.safeParse({ role: 'user', content: 'hello' }).success).toBe(true)
    expect(Message.safeParse({ role: 'assistant', content: 'hi' }).success).toBe(true)
    expect(Message.safeParse({ role: 'system', content: 'sys' }).success).toBe(true)
    expect(Message.safeParse({ role: 'invalid', content: 'x' }).success).toBe(false)
  })
})

describe('BackendConfig', () => {
  it('uses defaults', () => {
    const result = BackendConfig.parse({})
    expect(result.type).toBe('claude_code')
    expect(result.model).toBe('claude-sonnet-4-6')
    expect(result.timeout).toBe(300)
    expect(result.max_retries).toBe(3)
  })

  it('validates timeout range', () => {
    expect(BackendConfig.safeParse({ timeout: 5 }).success).toBe(false) // min 10
    expect(BackendConfig.safeParse({ timeout: 5000 }).success).toBe(false) // max 3600
    expect(BackendConfig.safeParse({ timeout: 60 }).success).toBe(true)
  })
})

describe('AgentConfig', () => {
  it('validates agent name pattern', () => {
    expect(AgentConfig.safeParse({ name: 'literature' }).success).toBe(true)
    expect(AgentConfig.safeParse({ name: 'ags' }).success).toBe(true)
    expect(AgentConfig.safeParse({ name: 'my-agent-1' }).success).toBe(true)
    expect(AgentConfig.safeParse({ name: 'UPPERCASE' }).success).toBe(false)
    expect(AgentConfig.safeParse({ name: '' }).success).toBe(false)
  })

  it('applies defaults', () => {
    const result = AgentConfig.parse({ name: 'test-agent' })
    expect(result.max_steps).toBe(50)
    expect(result.done_strategy).toBe('default')
    expect(result.mode).toBe('subagent')
    expect(result.tools).toEqual([])
  })

  it('validates step limits', () => {
    expect(AgentConfig.safeParse({ name: 'aa', max_steps: 0 }).success).toBe(false)
    expect(AgentConfig.safeParse({ name: 'aa', max_steps: 501 }).success).toBe(false)
    expect(AgentConfig.safeParse({ name: 'aa', max_steps: 100 }).success).toBe(true)
  })
})

describe('Experiment', () => {
  it('validates gpu_count non-negative', () => {
    const valid = Experiment.safeParse({
      id: 'exp-1', project_id: 'proj', name: 'test', code_path: '/tmp/code.py',
    })
    expect(valid.success).toBe(true)

    const invalid = Experiment.safeParse({
      id: 'exp-1', project_id: 'proj', name: 'test', code_path: '/tmp/code.py',
      gpu_count: -1,
    })
    expect(invalid.success).toBe(false)
  })

  it('validates minimum timeout', () => {
    expect(Experiment.safeParse({
      id: 'e', project_id: 'p', name: 'n', code_path: '/c', timeout: 30,
    }).success).toBe(false) // min 60
  })
})

describe('Citation', () => {
  it('parses a full citation', () => {
    const result = Citation.parse({
      title: 'A Great Paper',
      authors: ['Author One', 'Author Two'],
      year: 2024,
      doi: '10.1234/test',
      arxiv_id: '2401.12345',
    })
    expect(result.title).toBe('A Great Paper')
    expect(result.authors).toHaveLength(2)
    expect(result.venue).toBeNull()
  })
})

describe('SkillMeta', () => {
  it('validates skill name pattern', () => {
    expect(SkillMeta.safeParse({ name: 'search-papers', description: 'Search' }).success).toBe(true)
    expect(SkillMeta.safeParse({ name: 'x', description: 'too short' }).success).toBe(false)
    expect(SkillMeta.safeParse({ name: 'UPPER', description: 'bad' }).success).toBe(false)
  })
})

describe('TokenUsage', () => {
  it('defaults to zero', () => {
    const result = TokenUsage.parse({})
    expect(result.input_tokens).toBe(0)
    expect(result.output_tokens).toBe(0)
    expect(result.cost_usd).toBe(0)
  })
})

describe('HookConfig', () => {
  it('validates timeout range', () => {
    expect(HookConfig.safeParse({ event: 'pre_tool', command: 'echo' }).success).toBe(true)
    expect(HookConfig.safeParse({ event: 'pre_tool', command: 'echo', timeout: 0 }).success).toBe(false)
    expect(HookConfig.safeParse({ event: 'pre_tool', command: 'echo', timeout: 700 }).success).toBe(false)
  })
})

describe('SystemConfig', () => {
  it('uses all defaults', () => {
    const result = SystemConfig.parse({})
    expect(result.workspace_dir).toBe('~/.openags')
    expect(result.default_backend.type).toBe('claude_code')
    expect(result.log_level).toBe('INFO')
    expect(result.experiment_sandbox).toBe('local')
  })

  it('validates log_level enum', () => {
    expect(SystemConfig.safeParse({ log_level: 'TRACE' }).success).toBe(false)
    expect(SystemConfig.safeParse({ log_level: 'DEBUG' }).success).toBe(true)
  })
})

describe('WorkflowConfig', () => {
  it('applies defaults', () => {
    const result = WorkflowConfig.parse({})
    expect(result.max_refine).toBe(2)
    expect(result.max_pivot).toBe(1)
    expect(result.poll_interval).toBe(2000)
    expect(result.auto_start).toBe(false)
  })

  it('validates ranges', () => {
    expect(WorkflowConfig.safeParse({ max_refine: 0 }).success).toBe(false)
    expect(WorkflowConfig.safeParse({ max_refine: 11 }).success).toBe(false)
    expect(WorkflowConfig.safeParse({ coordinator_timeout: 10 }).success).toBe(false) // min 60
  })
})

describe('DirectiveModel', () => {
  it('parses with defaults', () => {
    const result = DirectiveModel.parse({ directive_id: 'd-001' })
    expect(result.action).toBe('execute')
    expect(result.priority).toBe('normal')
    expect(result.decision).toBe('PROCEED')
    expect(result.timeout_seconds).toBe(1800)
  })
})

describe('StatusModel', () => {
  it('parses with defaults', () => {
    const result = StatusModel.parse({})
    expect(result.status).toBe('idle')
    expect(result.exit_reason).toBeNull()
    expect(result.artifacts).toEqual([])
  })
})

describe('Session', () => {
  it('parses with defaults', () => {
    const result = Session.parse({ id: 's-1', project_id: 'p-1' })
    expect(result.agent_role).toBe('ags')
    expect(result.mode).toBe('interactive')
    expect(result.messages).toEqual([])
  })
})
