# OpenAGS API Reference

Base URL: `http://127.0.0.1:8000` (default) or `http://127.0.0.1:19836` (Electron)

## Health

### `GET /api/health`

Returns server status.

```json
{"status": "ok", "version": "0.1.0"}
```

## Projects

### `POST /api/projects/`

Create a new research project.

**Body:**
```json
{
  "project_id": "my-project",
  "name": "My Research Project",
  "description": "Optional description"
}
```

**Response:** `Project` object (201) or 409 if already exists.

### `GET /api/projects/`

List all projects.

**Response:** Array of `Project` objects.

### `GET /api/projects/{project_id}`

Get a single project by ID.

**Response:** `Project` object or 404.

### `DELETE /api/projects/{project_id}`

Delete a project and its workspace. **Irreversible.**

**Response:**
```json
{"status": "deleted", "project_id": "my-project"}
```

## Agents

### `POST /api/agents/{project_id}/run`

Run a single agent on a task.

**Body:**
```json
{
  "task": "Search for papers on transformer architectures",
  "role": "literature",
  "mode": "auto"
}
```

**Response:** `AgentResult` with `success`, `output`, `artifacts`, `token_usage`.

### `POST /api/agents/{project_id}/step`

Execute a single agent step (atomic LLM call).

**Body:**
```json
{
  "task": "Summarize this paper",
  "role": "literature"
}
```

**Response:** `StepResult`.

### `POST /api/agents/{project_id}/pipeline`

Run a full or partial research pipeline across multiple stages.

**Body:**
```json
{
  "task": "Research quantum computing applications",
  "stages": ["literature", "proposal"],
  "mode": "auto"
}
```

**Response:** Array of `AgentResult`.

### `POST /api/agents/{project_id}/chat`

Send chat messages to an agent. Supports streaming.

**Body:**
```json
{
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "role": "coordinator",
  "stream": true
}
```

**Response:**
- `stream: false` -> JSON: `{"content": "...", "token_usage": {...}}`
- `stream: true` -> `text/plain` streaming response (chunked)

### `GET /api/agents/{project_id}/tokens`

Get token usage summary for a project.

**Response:**
```json
{
  "input_tokens": 1234,
  "output_tokens": 567,
  "cost_usd": 0.0123,
  "calls": 5
}
```

### `GET /api/agents/roles`

List available agent roles.

**Response:** `["coordinator", "literature", "proposer", ...]`

## Skills

### `GET /api/skills/`

List all loaded skills.

**Response:** Array of skill metadata objects.

### `GET /api/skills/{name}`

Get a single skill by name.

### `GET /api/skills/role/{role}`

Get skills for a specific agent role.

### `POST /api/skills/match`

Find skills matching trigger keywords.

**Body:**
```json
{"query": "search papers"}
```

## Configuration

### `GET /api/config/`

Get current configuration (secrets masked).

### `PUT /api/config/`

Set a configuration value using dot notation.

**Body:**
```json
{
  "key": "default_backend.model",
  "value": "claude-sonnet-4-20250514"
}
```

Supported keys:
- `default_backend.model` — LLM model name
- `default_backend.api_key` — API key (stored securely)
- `default_backend.timeout` — Request timeout in seconds
- `log_level` — DEBUG, INFO, WARNING, ERROR
- `token_budget_usd` — Maximum spend per project

### `GET /api/config/backends`

List configured backends and their health.

## Logs

### `GET /api/logs/tokens`

Get aggregated token usage summary.

**Query params:** `project_id` (optional)

### `GET /api/logs/tokens/recent`

Get recent token usage entries (newest first).

**Query params:**
- `limit` (default 100, max 1000)
- `project_id` (optional)

**Response:** Array of token usage entries with timestamp, project_id, agent_role, tokens, cost.

## WebSocket

### `WS /ws/{project_id}`

Real-time event streaming for a project.

**Events from server:**
- `agent.output` — Streaming agent text
- `agent.completed` — Agent finished
- `agent.failed` — Agent error
- `experiment.progress` — Experiment execution progress

**Messages to server:**
```json
{"action": "interrupt"}
{"action": "approve"}
```
