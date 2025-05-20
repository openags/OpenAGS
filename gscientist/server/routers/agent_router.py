from fastapi import APIRouter, HTTPException, Body, WebSocket
from gscientist.server.services.agent_service import AgentService
from gscientist.server.models import ChatRequest

router = APIRouter()
agent_service = AgentService()

@router.get("/")
def get_agents():
    """返回可用代理类型列表"""
    return {"agents": agent_service.get_agent_types()}

@router.post("/chat/{agent_type}")
def chat(agent_type: str, request: ChatRequest):
    try:
        response = agent_service.process_request(agent_type, request)
        stream = request.options.get('stream', False) if request.options else False
        if stream:
            def generate():
                if hasattr(response, "__iter__") and not isinstance(response, str):
                    for chunk in response:
                        if chunk: yield chunk
                else:
                    yield response
            from fastapi.responses import StreamingResponse
            return StreamingResponse(generate(), media_type="text/event-stream")
        else:
            return {"message": response}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/chat/{agent_type}/async")
async def a_chat(agent_type: str, request: ChatRequest):
    try:
        response = await agent_service.process_request_async(agent_type, request)
        stream = request.options.get('stream', False) if request.options else False
        if stream:
            from fastapi.responses import StreamingResponse
            async def generate():
                if hasattr(response, "__aiter__"):
                    async for chunk in response:
                        if chunk: yield chunk
                elif hasattr(response, "__iter__") and not isinstance(response, str):
                    for chunk in response:
                        if chunk: yield chunk
                else:
                    yield response
            return StreamingResponse(generate(), media_type="text/event-stream")
        else:
            return {"message": response}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.websocket("/chat/{agent_type}/ws")
async def websocket_endpoint(websocket: WebSocket, agent_type: str):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            message = data.get("message", "")
            if not message:
                await websocket.send_json({"error": "No message provided"})
                continue
            request = ChatRequest(message=message, options={"stream": True})
            response = await agent_service.process_request_async(agent_type, request)
            if hasattr(response, "__aiter__"):
                async for chunk in response:
                    if chunk:
                        await websocket.send_json({"content": chunk})
            elif hasattr(response, "__iter__") and not isinstance(response, str):
                for chunk in response:
                    if chunk:
                        await websocket.send_json({"content": chunk})
            else:
                await websocket.send_json({"content": response})
    except Exception as e:
        await websocket.send_json({"error": str(e)})
    finally:
        await websocket.close()
