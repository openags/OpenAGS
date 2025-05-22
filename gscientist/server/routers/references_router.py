from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any
from ..services.references_service import ReferencesService

router = APIRouter()

# Dependency for ReferencesService
def get_references_service():
    return ReferencesService()

@router.get("/projects/{project_name}/papers", response_model=List[Dict[str, Any]])
async def get_project_papers_route(
    project_name: str, 
    references_service: ReferencesService = Depends(get_references_service)
):
    """
    Retrieves all papers associated with a specific project.
    """
    try:
        papers = references_service.get_project_papers(project_name)
        if papers is None: # Should not happen if service raises ValueError, but good for safety
            raise HTTPException(status_code=404, detail=f"Papers for project '{project_name}' not found or project has no papers.")
        return papers
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        # Catch any other unexpected errors
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

@router.delete("/projects/{project_name}/papers/{doi}", status_code=204) # 204 No Content for successful deletion
async def remove_paper_from_project_route(
    project_name: str, 
    doi: str, 
    references_service: ReferencesService = Depends(get_references_service)
):
    """
    Removes a paper (by its DOI) from a specific project.
    """
    try:
        success = references_service.remove_paper_from_project(project_name, doi)
        if not success:
            # This case might occur if the DOI wasn't in the project, but the project itself exists.
            # Depending on desired behavior, this could be a 404 for the paper or still a 204 if idempotency is key.
            # For now, let's assume if it didn't error but returned False, the paper wasn't there to begin with.
            raise HTTPException(status_code=404, detail=f"Paper with DOI '{doi}' not found in project '{project_name}'.")
        # No content to return on successful deletion
        return
    except ValueError as e:
        # This typically means the project itself was not found
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        # Catch any other unexpected errors
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
