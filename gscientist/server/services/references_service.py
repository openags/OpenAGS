from typing import List, Dict, Any
from gscientist.project_manager import ProjectManager  # Navigates from gscientist.server.services to gscientist

class ReferencesService:
    def __init__(self):
        """
        Initializes the ReferencesService.
        It creates an instance of ProjectManager to access its configured ReferencesManager.
        """
        # TODO: Consider a more robust way to manage ProjectManager instances
        # if multiple services need it, perhaps through dependency injection
        # at a higher level or a shared instance.
        self.project_manager = ProjectManager()
        self.references_manager = self.project_manager.references_manager

    def get_project_papers(self, project_name: str) -> List[Dict[str, Any]]:
        """
        Retrieves all papers associated with a specific project.

        Args:
            project_name: The name of the project.

        Returns:
            A list of dictionaries, where each dictionary represents a paper.
        
        Raises:
            ValueError: If the project is not found or has no references database.
        """
        # The call to references_manager.get_project_papers already handles
        # project validation and DB path retrieval.
        return self.references_manager.get_project_papers(project_name)

    def remove_paper_from_project(self, project_name: str, doi: str) -> bool:
        """
        Removes a paper (by its DOI) from a specific project.

        Args:
            project_name: The name of the project.
            doi: The DOI of the paper to remove.

        Returns:
            True if the paper was successfully removed, False otherwise.
        
        Raises:
            ValueError: If the project is not found or has no references database.
        """
        # The call to references_manager.remove_paper_from_project already handles
        # project validation and DB path retrieval.
        return self.references_manager.remove_paper_from_project(project_name, doi)
