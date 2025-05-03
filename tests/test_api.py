# tests/test_server/test_api.py
import pytest
import httpx
import asyncio
import logging
from fastapi.testclient import TestClient
from gscientist.server.main import app
from gscientist.server.agent_service import AgentService

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@pytest.fixture
def client():
    """创建 FastAPI 测试客户端"""
    logger.info("Creating FastAPI test client")
    return TestClient(app)

@pytest.fixture
def agent_service():
    """创建 AgentService 实例"""
    logger.info("Creating AgentService instance")
    return AgentService()

def test_get_agent_types(agent_service):
    """测试 AgentService 是否返回正确的代理类型"""
    logger.info("Testing AgentService get_agent_types")
    agent_types = agent_service.get_agent_types()
    logger.info(f"Agent types: {agent_types}")
    assert "ChatAgent" in agent_types, "ChatAgent not found"
    assert "GSAgent" in agent_types, "GSAgent not found"

def test_get_agent_valid(agent_service):
    """测试 AgentService 是否能获取代理实例"""
    logger.info("Testing AgentService get_agent")
    for agent_type in ["ChatAgent", "GSAgent"]:
        agent = agent_service._get_agent(agent_type)
        assert agent.name == f"{agent_type}Agent", f"{agent_type} name incorrect"
        logger.info(f"Successfully got {agent_type}")

def test_get_agent_invalid(agent_service):
    """测试 AgentService 处理无效代理类型"""
    logger.info("Testing AgentService invalid agent type")
    with pytest.raises(ValueError, match="Unknown agent type: InvalidAgent"):
        agent_service._get_agent("InvalidAgent")
    logger.info("Invalid agent type handled correctly")

@pytest.mark.asyncio
async def test_health_endpoint(client):
    """测试健康检查端点"""
    logger.info("Testing health endpoint")
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "version": "0.1.0"}
    logger.info("Health endpoint test passed")

@pytest.mark.asyncio
async def test_agents_endpoint(client):
    """测试代理列表端点"""
    logger.info("Testing agents endpoint")
    response = client.get("/agents")
    assert response.status_code == 200
    agents = response.json()["agents"]
    assert "ChatAgent" in agents, "ChatAgent not found"
    assert "GSAgent" in agents, "GSAgent not found"
    logger.info(f"Agents found: {agents}")

@pytest.mark.asyncio
async def test_chat_sync_endpoint(client):
    """测试同步聊天端点"""
    logger.info("Testing chat sync endpoint")
    payload = {"message": "Give me investment suggestions"}
    response = client.post("/chat/ChatAgent", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert isinstance(data["message"], str)
    assert data["message"], "Response should not be empty"
    logger.info(f"Sync response: {data['message'][:50]}...")

@pytest.mark.asyncio
async def test_chat_async_endpoint(client):
    """测试异步聊天端点"""
    logger.info("Testing chat async endpoint")
    payload = {"message": "Tell me about AI"}
    response = client.post("/chat/ChatAgent/async", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert isinstance(data["message"], str)
    assert data["message"], "Response should not be empty"
    logger.info(f"Async response: {data['message'][:50]}...")

@pytest.mark.asyncio
async def test_gs_agent_sync_endpoint(client):
    """测试 GSAgent 同步端点"""
    logger.info("Testing GSAgent sync endpoint")
    payload = {"message": "Search for AI papers"}
    response = client.post("/chat/GSAgent", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert isinstance(data["message"], str)
    assert data["message"], "Response should not be empty"
    logger.info(f"GSAgent sync response: {data['message'][:50]}...")

@pytest.mark.asyncio
async def test_chat_stream_endpoint():
    """测试流式聊天端点"""
    logger.info("Testing chat stream endpoint")
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8000/chat/ChatAgent/stream",
            json={"message": "Hello"},
            timeout=30
        )
        assert response.status_code == 200
        content = ""
        async for line in response.aiter_lines():
            if line.startswith("data: "):
                chunk = line[6:].strip()
                if chunk and not chunk.startswith("Error"):
                    content += chunk
                    logger.info(f"Stream chunk: {chunk[:50]}...")
        assert content, "No content received from stream"
        logger.info("Stream test completed")

@pytest.mark.asyncio
async def test_gs_agent_stream_endpoint():
    """测试 GSAgent 流式端点"""
    logger.info("Testing GSAgent stream endpoint")
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8000/chat/GSAgent/stream",
            json={"message": "Search for AI papers"},
            timeout=30
        )
        assert response.status_code == 200
        content = ""
        async for line in response.aiter_lines():
            if line.startswith("data: "):
                chunk = line[6:].strip()
                if chunk and not chunk.startswith("Error"):
                    content += chunk
                    logger.info(f"Stream chunk: {chunk[:50]}...")
        assert content, "No content received from stream"
        logger.info("GSAgent stream test completed")

@pytest.mark.asyncio
async def test_invalid_agent_endpoint(client):
    """测试无效代理类型"""
    logger.info("Testing invalid agent endpoint")
    payload = {"message": "Hello"}
    response = client.post("/chat/InvalidAgent", json=payload)
    assert response.status_code == 400
    assert "Unknown agent type" in response.json()["detail"]
    logger.info("Invalid agent endpoint test passed")

@pytest.mark.asyncio
async def test_empty_message_endpoint(client):
    """测试空消息请求"""
    logger.info("Testing empty message endpoint")
    payload = {"message": ""}
    response = client.post("/chat/ChatAgent", json=payload)
    assert response.status_code == 200  # 代理可能返回空响应或错误消息
    data = response.json()
    assert "message" in data
    logger.info(f"Empty message response: {data['message'][:50]}...")