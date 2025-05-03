# tests/test_agents/test_agent_factory.py
import pytest
import os
import yaml
from gscientist.agents.agent_factory import AgentFactory
from gscientist.agents.base_agent import BaseAgent

@pytest.fixture
def config():
    """加载 config.yml"""
    config_path = os.path.join("config", "config.yml")
    with open(config_path, "r") as f:
        return yaml.safe_load(f)

@pytest.fixture
def agent_factory():
    """创建 AgentFactory 实例"""
    return AgentFactory()

def test_discover_agents(agent_factory):
    """测试 AgentFactory 是否能发现所有代理类"""
    agent_types = agent_factory.get_agent_types()
    assert "ChatAgent" in agent_types, "ChatAgent not discovered"
    assert "GSAgent" in agent_types, "GSAgent not discovered"
    assert len(agent_types) >= 2, "Expected at least 2 agent types"

def test_get_agent_valid(agent_factory, config):
    """测试 AgentFactory 是否能正确实例化代理"""
    chat_agent = agent_factory.get_agent("ChatAgent", config)
    gs_agent = agent_factory.get_agent("GSAgent", config)
    assert isinstance(chat_agent, BaseAgent), "ChatAgent is not a BaseAgent instance"
    assert isinstance(gs_agent, BaseAgent), "GSAgent is not a BaseAgent instance"
    assert chat_agent.name == "ChatAgentAgent", "ChatAgent name incorrect"
    assert gs_agent.name == "GSAgentAgent", "GSAgent name incorrect"

def test_get_agent_invalid(agent_factory, config):
    """测试 AgentFactory 处理无效代理类型"""
    with pytest.raises(ValueError, match="Unknown agent type: InvalidAgent"):
        agent_factory.get_agent("InvalidAgent", config)

def test_get_agent_types(agent_factory):
    """测试 AgentFactory 返回正确的代理类型列表"""
    agent_types = agent_factory.get_agent_types()
    assert isinstance(agent_types, list), "Agent types should be a list"
    assert "ChatAgent" in agent_types, "ChatAgent not in types"
    assert "GSAgent" in agent_types, "GSAgent not in types"