# gscientist/server/main.py
from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import logging

from gscientist.server.models import ChatRequest, ChatResponse
from gscientist.server.agent_service import AgentService

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 创建 FastAPI 应用
app = FastAPI(
    title="GScientist Agent API",
    description="API for interacting with AI agents",
    version="0.1.0"
)

# 添加 CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境中应指定具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 创建服务实例
agent_service = AgentService()

# 健康检查端点
@app.get("/health")
async def health_check():
    """检查服务健康状态"""
    return {"status": "healthy", "version": "0.1.0"}

# 获取可用代理列表
@app.get("/agents")
async def get_agents():
    """返回可用代理类型列表"""
    return {"agents": agent_service.get_agent_types()}

# 同步聊天端点
@app.post("/chat/{agent_type}")
async def chat(agent_type: str, request: ChatRequest):
    """处理同步非流式请求"""
    print(f"Received payload: {request.message}")
    try:
        response = agent_service.process_request(agent_type, request)
        return ChatResponse(message=response)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# 异步聊天端点
@app.post("/chat/{agent_type}/async")
async def async_chat(agent_type: str, request: ChatRequest):
    """处理异步非流式请求"""
    try:
        response = await agent_service.process_request_async(agent_type, request)
        return ChatResponse(message=response)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in async_chat endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# 流式聊天端点
@app.post("/chat/{agent_type}/stream")
async def stream_chat(agent_type: str, request: ChatRequest):
    """处理流式请求，使用 SSE"""
    async def generate():
        try:
            async for chunk in agent_service.stream_response(agent_type, request):
                if chunk:
                    yield f"data: {chunk}\n\n"
        except Exception as e:
            logger.error(f"Error in stream_chat endpoint: {str(e)}")
            yield f"data: Error: {str(e)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream"
    )

# WebSocket 聊天端点
@app.websocket("/chat/{agent_type}/ws")
async def websocket_endpoint(websocket: WebSocket, agent_type: str):
    """处理 WebSocket 请求，支持实时交互"""
    await websocket.accept()
    
    try:
        while True:
            # 接收消息
            data = await websocket.receive_json()
            message = data.get("message", "")
            
            if not message:
                await websocket.send_json({"error": "No message provided"})
                continue
            
            # 创建请求对象
            request = ChatRequest(message=message)
            
            # 流式响应
            async for chunk in agent_service.stream_response(agent_type, request):
                if chunk:
                    await websocket.send_json({"type": "chunk", "content": chunk})
            
            # 发送完成信号
            await websocket.send_json({"type": "done"})
    except Exception as e:
        logger.error(f"Error in websocket_endpoint: {str(e)}")
        await websocket.send_json({"error": str(e)})
    finally:
        await websocket.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("gscientist.server.main:app", host="0.0.0.0", port=8000, reload=True)