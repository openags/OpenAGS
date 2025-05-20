import yaml
import os
import logging
from typing import Dict, AsyncGenerator, Any, Union

from gscientist.agents.agent_factory import AgentFactory
from gscientist.server.models import ChatRequest
from sciagents.agents.message import AgentOutput

logger = logging.getLogger(__name__)

class AgentService:
    """代理服务类，负责加载和调用代理"""

    def __init__(self):
        """初始化代理服务，加载配置和代理工厂"""
        # 加载配置
        config_path = os.path.join("config", "config.yml")
        try:
            with open(config_path, "r") as f:
                self.config = yaml.safe_load(f) or {}
        except Exception as e:
            logger.error(f"Failed to load config from {config_path}: {e}")
            self.config = {}
        
        # 初始化代理工厂
        self.agent_factory = AgentFactory()
        
        # 代理实例缓存
        self.agents: Dict[str, Any] = {}

    def get_agent_types(self) -> list:
        """返回可用代理类型列表"""
        return self.agent_factory.get_agent_types()

    def _get_agent(self, agent_type: str):
        """获取代理实例"""
        if (agent_type not in self.get_agent_types()):
            raise ValueError(f"Unknown agent type: {agent_type}")
        
        # 如果已经创建了代理实例，则返回
        if (agent_type in self.agents):
            return self.agents[agent_type]
        
        try:
            # 使用工厂创建代理实例
            agent = self.agent_factory.get_agent(agent_type, self.config)
            
            # 缓存代理实例
            self.agents[agent_type] = agent
            logger.info(f"Created agent instance for type: {agent_type}")
            
            return agent
        except Exception as e:
            logger.error(f"Failed to create agent of type {agent_type}: {e}")
            raise

    def get_agent(self, agent_type: str):
        """对外暴露获取代理实例的方法"""
        return self._get_agent(agent_type)

    def process_request(self, agent_type: str, request: ChatRequest) -> Union[str, AgentOutput]:
        """处理同步请求，支持流式和非流式输出"""
        logger.info(f"Processing request for agent type: {agent_type}")
        try:
            agent = self._get_agent(agent_type)
            stream = request.options.get('stream', False) if request.options else False
            response = agent.step(request.message, stream=stream)
            return response.content if isinstance(response, AgentOutput) else response
        except Exception as e:
            logger.error(f"Error processing request: {str(e)}")
            raise

    async def process_request_async(self, agent_type: str, request: ChatRequest) -> Union[str, AgentOutput]:
        """处理异步请求，支持流式和非流式输出"""
        logger.info(f"Processing async request for agent type: {agent_type}")
        try:
            agent = self._get_agent(agent_type)
            stream = request.options.get('stream', False) if request.options else False
            response = await agent.a_step(request.message, stream=stream)
            return response.content if isinstance(response, AgentOutput) else response
        except Exception as e:
            logger.error(f"Error processing async request: {str(e)}")
            raise
