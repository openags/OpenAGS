import os
from pathlib import Path
import yaml
from typing import Dict, List, Optional

class ResearchProject:
    def __init__(self, name: str, workspace_path: str):
        self.name = name
        self.workspace_path = Path(workspace_path).absolute()
        
    def get_workspace_path(self) -> Path:
        """Get absolute path to workspace"""
        return self.workspace_path
        
    def create_workspace(self) -> None:
        """Create workspace directory structure"""
        self.workspace_path.mkdir(parents=True, exist_ok=True)
        
class ProjectManager:
    def __init__(self, config_path: str):
        self.config_path = Path(config_path).absolute()
        self.projects: Dict[str, ResearchProject] = {}
        self.load_projects()
        
    def add_project(self, name: str, workspace_path: str) -> ResearchProject:
        """Add a new research project"""
        if name in self.projects:
            raise ValueError(f"Project '{name}' already exists")
            
        project = ResearchProject(name, workspace_path)
        self.projects[name] = project
        self.save_projects()
        return project
        
    def get_project(self, name: str) -> Optional[ResearchProject]:
        """Get a project by name"""
        return self.projects.get(name)
        
    def list_projects(self) -> List[str]:
        """List all project names"""
        return list(self.projects.keys())
        
    def load_projects(self) -> None:
        """Load projects from config file"""
        if self.config_path.exists():
            with open(self.config_path, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f) or {}
                for name, workspace in data.items():
                    self.projects[name] = ResearchProject(name, workspace)
                    
    def save_projects(self) -> None:
        """Save projects to config file"""
        data = {name: str(project.workspace_path) 
               for name, project in self.projects.items()}
        with open(self.config_path, 'w', encoding='utf-8') as f:
            yaml.safe_dump(data, f)