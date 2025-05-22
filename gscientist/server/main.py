# gscientist/server/main.py
from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
import logging

from gscientist.server.routers.agent_router import router as agent_router
from gscientist.server.routers.project_router import router as project_router
from gscientist.server.routers.references_router import router as references_router # Added references_router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI application
app = FastAPI(
    title="GScientist Agent API",
    description="API for interacting with AI agents",
    version="0.1.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify specific domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register agent management routes
app.include_router(agent_router, prefix="/agents")
# Register project management routes
app.include_router(project_router, prefix="/projects")
# Register references management routes
app.include_router(references_router, prefix="/references") # Added references_router registration

# 健康检查端点
@app.get("/health")
async def health_check():
    """检查服务健康状态"""
    return {"status": "healthy", "version": "0.1.0"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("gscientist.server.main:app", host="0.0.0.0", port=8000, reload=True)