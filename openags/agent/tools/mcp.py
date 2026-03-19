"""MCP (Model Context Protocol) integration — connect external tool servers.

MCP allows OpenAGS to use tools provided by external MCP-compatible servers,
enabling integration with services like file systems, databases, web search,
and domain-specific tools without building custom adapters.

Architecture:
  MCPClient → connects to an MCP server via stdio/SSE
  MCPTool   → wraps an MCP tool to satisfy the OpenAGS Tool protocol
  MCPManager → discovers and manages multiple MCP servers
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from openags.agent.tools.base import ToolResult

logger = logging.getLogger(__name__)


@dataclass
class MCPServerConfig:
    """Configuration for an MCP server connection."""

    name: str
    command: str  # e.g., "npx -y @anthropic/mcp-server-filesystem"
    args: list[str] = field(default_factory=list)
    env: dict[str, str] = field(default_factory=dict)
    transport: str = "stdio"  # "stdio" or "sse"
    url: str | None = None  # For SSE transport


@dataclass
class MCPToolSpec:
    """Parsed MCP tool specification from a server."""

    name: str
    description: str
    input_schema: dict[str, Any]
    server_name: str


class MCPClient:
    """Client for communicating with a single MCP server via stdio."""

    def __init__(self, config: MCPServerConfig) -> None:
        self._config = config
        self._process: asyncio.subprocess.Process | None = None
        self._request_id = 0
        self._tools: list[MCPToolSpec] = []

    async def connect(self) -> None:
        """Start the MCP server process and initialize connection."""
        cmd = self._config.command.split()
        cmd.extend(self._config.args)

        import os
        env = {**os.environ, **self._config.env}

        self._process = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )

        # Initialize MCP protocol
        await self._send_request("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "openags", "version": "0.1.0"},
        })

        # Send initialized notification
        await self._send_notification("notifications/initialized", {})

        # Discover tools
        result = await self._send_request("tools/list", {})
        if result and "tools" in result:
            self._tools = [
                MCPToolSpec(
                    name=t["name"],
                    description=t.get("description", ""),
                    input_schema=t.get("inputSchema", {}),
                    server_name=self._config.name,
                )
                for t in result["tools"]
            ]
            logger.info(
                "MCP server '%s' connected: %d tools discovered",
                self._config.name,
                len(self._tools),
            )

    async def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> str:
        """Call a tool on the MCP server and return the result text."""
        result = await self._send_request("tools/call", {
            "name": tool_name,
            "arguments": arguments,
        })

        if result is None:
            return "Error: No response from MCP server"

        # Extract text content from result
        content_list = result.get("content", [])
        texts = []
        for item in content_list:
            if isinstance(item, dict) and item.get("type") == "text":
                texts.append(item.get("text", ""))
        return "\n".join(texts) if texts else json.dumps(result)

    async def disconnect(self) -> None:
        """Shut down the MCP server."""
        if self._process and self._process.returncode is None:
            self._process.stdin.close()  # type: ignore
            try:
                await asyncio.wait_for(self._process.wait(), timeout=5)
            except TimeoutError:
                self._process.kill()
            self._process = None

    @property
    def tools(self) -> list[MCPToolSpec]:
        return list(self._tools)

    async def _send_request(self, method: str, params: dict) -> dict | None:
        """Send a JSON-RPC request and wait for response."""
        if not self._process or not self._process.stdin or not self._process.stdout:
            raise RuntimeError("MCP client not connected")

        self._request_id += 1
        request = {
            "jsonrpc": "2.0",
            "id": self._request_id,
            "method": method,
            "params": params,
        }

        msg = json.dumps(request) + "\n"
        self._process.stdin.write(msg.encode())
        await self._process.stdin.drain()

        # Read response line
        try:
            line = await asyncio.wait_for(
                self._process.stdout.readline(),
                timeout=30,
            )
            if not line:
                return None

            response = json.loads(line.decode())
            if "error" in response:
                logger.error("MCP error: %s", response["error"])
                return None
            return response.get("result")
        except TimeoutError:
            logger.warning("MCP request timed out: %s", method)
            return None
        except json.JSONDecodeError:
            return None

    async def _send_notification(self, method: str, params: dict) -> None:
        """Send a JSON-RPC notification (no response expected)."""
        if not self._process or not self._process.stdin:
            return

        notification = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        }
        msg = json.dumps(notification) + "\n"
        self._process.stdin.write(msg.encode())
        await self._process.stdin.drain()


class MCPTool:
    """Wraps an MCP tool to satisfy the OpenAGS Tool protocol."""

    def __init__(self, spec: MCPToolSpec, client: MCPClient) -> None:
        self._spec = spec
        self._client = client

    @property
    def name(self) -> str:
        return f"mcp_{self._spec.server_name}_{self._spec.name}"

    @property
    def description(self) -> str:
        return self._spec.description

    def schema(self) -> dict[str, object]:
        """Return OpenAI function-calling compatible schema."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self._spec.input_schema,
            },
        }

    async def invoke(self, **kwargs: Any) -> ToolResult:
        """Execute the MCP tool."""
        try:
            result_text = await self._client.call_tool(self._spec.name, kwargs)
            return ToolResult(success=True, data=result_text)
        except Exception as e:
            return ToolResult(success=False, error=str(e))


class MCPManager:
    """Manages multiple MCP server connections and their tools."""

    def __init__(self) -> None:
        self._clients: dict[str, MCPClient] = {}
        self._tools: dict[str, MCPTool] = {}

    async def add_server(self, config: MCPServerConfig) -> list[MCPTool]:
        """Connect to an MCP server and register its tools."""
        if config.name in self._clients:
            logger.info("MCP server '%s' already connected", config.name)
            return [t for t in self._tools.values() if t._spec.server_name == config.name]

        client = MCPClient(config)
        await client.connect()
        self._clients[config.name] = client

        new_tools: list[MCPTool] = []
        for spec in client.tools:
            tool = MCPTool(spec, client)
            self._tools[tool.name] = tool
            new_tools.append(tool)

        return new_tools

    async def remove_server(self, name: str) -> None:
        """Disconnect from an MCP server and unregister its tools."""
        client = self._clients.pop(name, None)
        if client:
            await client.disconnect()
            # Remove tools from this server
            to_remove = [k for k, v in self._tools.items() if v._spec.server_name == name]
            for k in to_remove:
                del self._tools[k]

    def get_tool(self, name: str) -> MCPTool | None:
        return self._tools.get(name)

    def get_all_tools(self) -> list[MCPTool]:
        return list(self._tools.values())

    def get_all_schemas(self) -> list[dict[str, object]]:
        """Get OpenAI function-calling schemas for all MCP tools."""
        return [t.schema() for t in self._tools.values()]

    async def shutdown(self) -> None:
        """Disconnect all MCP servers."""
        for name in list(self._clients.keys()):
            await self.remove_server(name)

    @staticmethod
    def load_config(config_path: Path) -> list[MCPServerConfig]:
        """Load MCP server configs from a JSON file.

        Expected format:
        {
          "mcpServers": {
            "filesystem": {
              "command": "npx",
              "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
              "env": {}
            }
          }
        }
        """
        if not config_path.exists():
            return []

        data = json.loads(config_path.read_text(encoding="utf-8"))
        servers = data.get("mcpServers", {})

        configs: list[MCPServerConfig] = []
        for name, spec in servers.items():
            configs.append(MCPServerConfig(
                name=name,
                command=spec.get("command", ""),
                args=spec.get("args", []),
                env=spec.get("env", {}),
            ))
        return configs
