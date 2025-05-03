# gscientist/server/models.py
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List

class ChatRequest(BaseModel):
    """聊天请求模型"""
    message: str = Field(..., description="用户输入的消息")
    history: Optional[List[Dict[str, str]]] = Field(
        default=None, description="聊天历史，包含角色和内容"
    )
    options: Optional[Dict[str, Any]] = Field(
        default=None, description="额外选项，如温度、工具参数"
    )

    class Config:
        schema_extra = {
            "example": {
                "message": "Search for AI papers",
                "history": [
                    {"role": "user", "content": "What is AI?"},
                    {"role": "assistant", "content": "AI is..."}
                ],
                "options": {"temperature": 0.7}
            }
        }

class ChatResponse(BaseModel):
    """聊天响应模型"""
    message: Any = Field(..., description="代理返回的消息，可能是文本或 JSON")
    metadata: Optional[Dict[str, Any]] = Field(
        default=None, description="元数据，如处理时间、模型信息"
    )

    class Config:
        schema_extra = {
            "example": {
                "message": "Here are some AI papers: [...]",
                "metadata": {
                    "processing_time": 0.5,
                    "model": "deepseek-chat"
                }
            }
        }