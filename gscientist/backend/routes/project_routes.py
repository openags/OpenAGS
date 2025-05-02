# routes/project_routes.py
from fastapi import APIRouter

router = APIRouter()

@router.get("/projects")
def get_projects():
    return {"message": "List of projects"}