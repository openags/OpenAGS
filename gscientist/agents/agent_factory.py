# gscientist/agents/agent_factory.py
import importlib
import pkgutil
import inspect
import logging
from typing import Dict, Type, Any

from gscientist.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)

class AgentFactory:
    """代理工厂，自动发现和注册代理类"""

    def __init__(self):
        """初始化工厂，自动发现代理类"""
        self.agent_classes: Dict[str, Type[BaseAgent]] = {}
        self._discover_agents()

    def _discover_agents(self):
        """扫描 gscientist.agents 模块，发现继承 BaseAgent 的类"""
        module_base = "gscientist.agents"
        module = importlib.import_module(module_base)
        module_path = module.__path__

        for _, module_name, _ in pkgutil.iter_modules(module_path):
            try:
                # 导入子模块
                sub_module = importlib.import_module(f"{module_base}.{module_name}")
                # 检查模块中的所有成员
                for name, obj in inspect.getmembers(sub_module, inspect.isclass):
                    # 确保是 BaseAgent 的子类且不是抽象类
                    if issubclass(obj, BaseAgent) and obj is not BaseAgent:
                        self.agent_classes[name] = obj
                        logger.info(f"Discovered agent class: {name}")
            except Exception as e:
                logger.warning(f"Failed to load module {module_name}: {str(e)}")

    def get_agent_types(self) -> list:
        """返回可用代理类型列表"""
        return list(self.agent_classes.keys())

    def get_agent(self, agent_type: str, config: Dict[str, Any]) -> BaseAgent:
        """获取代理实例"""
        if agent_type not in self.agent_classes:
            raise ValueError(f"Unknown agent type: {agent_type}")

        try:
            agent_class = self.agent_classes[agent_type]
            # 只取该 agent 的 llm_config
            agent_config = config.get('agents', {}).get(agent_type, {})
            # 兼容 deepseek 的 api_base 字段
            if 'url' in agent_config:
                agent_config['api_base'] = agent_config['url']
            if 'model_config_dict' in agent_config:
                agent_config.update(agent_config['model_config_dict'])
            agent = agent_class(name=f"{agent_type}Agent", llm_config=agent_config)
            return agent
        except Exception as e:
            logger.error(f"Failed to create agent of type {agent_type}: {str(e)}")
            raise