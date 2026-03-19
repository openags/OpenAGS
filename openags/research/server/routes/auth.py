"""Authentication API routes: register, login, me."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from openags.research.auth import AuthError

router = APIRouter()


class RegisterRequest(BaseModel):
    username: str
    password: str
    display_name: str = ""


class LoginRequest(BaseModel):
    username: str
    password: str


def _user_mgr(request: Request):
    return request.app.state.user_mgr


def _extract_user(request: Request):
    """Extract current user from Authorization header (optional)."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:]
    try:
        return _user_mgr(request).verify_token(token)
    except Exception:
        return None


@router.post("/register")
async def register(request: Request, body: RegisterRequest):
    try:
        user, token = _user_mgr(request).register(body.username, body.password, body.display_name)
        return {"user": user.model_dump(mode="json"), "token": token}
    except AuthError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/login")
async def login(request: Request, body: LoginRequest):
    try:
        user, token = _user_mgr(request).login(body.username, body.password)
        return {"user": user.model_dump(mode="json"), "token": token}
    except AuthError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.get("/me")
async def get_me(request: Request):
    user = _extract_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user.model_dump(mode="json")


@router.post("/logout")
async def logout(request: Request):
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        _user_mgr(request).logout(auth[7:])
    return {"status": "ok"}
