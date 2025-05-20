# gscientist/server/main.py
from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
import logging

from gscientist.server.routers.agent_router import router as agent_router
from gscientist.server.routers.project_router import router as project_router

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

# 注册代理管理路由
app.include_router(agent_router, prefix="/agents")
# 注册项目管理路由
app.include_router(project_router, prefix="/projects")

# 健康检查端点
@app.get("/health")
async def health_check():
    """检查服务健康状态"""
    return {"status": "healthy", "version": "0.1.0"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("gscientist.server.main:app", host="0.0.0.0", port=8000, reload=True)