from fastapi import APIRouter, HTTPException, Body
from gscientist.server.services.project_service import ProjectService

router = APIRouter()
project_service = ProjectService()

@router.get("/")
def list_projects():
    return {"projects": project_service.list_projects()}

@router.get("/{name}")
def get_project(name: str):
    project = project_service.get_project(name)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.post("/")
def create_project(data: dict = Body(...)):
    name = data.get("name")
    description = data.get("description", "")
    if not name:
        raise HTTPException(status_code=400, detail="Project name required")
    project_name = project_service.create_project(name, description)
    return {"name": project_name}

@router.put("/{name}/rename")
def rename_project(name: str, data: dict = Body(...)):
    new_name = data.get("new_name")
    if not new_name:
        raise HTTPException(status_code=400, detail="New name required")
    project_service.rename_project(name, new_name)
    return {"success": True}

@router.delete("/{name}")
def delete_project(name: str):
    project_service.delete_project(name)
    return {"success": True}
