from fastapi import APIRouter
from gscientist.agents import GSAgent
from gscientist.core.config import load_config

router = APIRouter()
agent = GSAgent(config=load_config())

@router.post("/chat")
async def chat(prompt: str):
    """处理聊天请求"""
    response = await agent.astep(prompt)
    return {"response": response}