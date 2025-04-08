from .app import app
from .routes import chat, projects

# ×¢²áÂ·ÓÉ
app.include_router(chat.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")

__all__ = ["app"]