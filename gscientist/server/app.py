from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# 允许跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def start_api_server(host="0.0.0.0", port=8000):
    """启动API服务"""
    import uvicorn
    uvicorn.run(app, host=host, port=port)