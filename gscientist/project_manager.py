import os
import shutil
import yaml
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime

class ProjectManager:
    def __init__(self, base_path: Optional[str] = None, config_dir: Optional[str] = None):
        """ProjectManager using YAML for project management."""
        # Set config directory
        if config_dir is None:
            self.config_dir = Path(__file__).parent.parent / "config"
        else:
            self.config_dir = Path(config_dir)
        self.config_dir.mkdir(exist_ok=True)
        self.projects_file = self.config_dir / "research_projects.yml"
        # If the file does not exist, create an empty YAML file
        if not self.projects_file.exists():
            with open(self.projects_file, 'w', encoding='utf-8') as f:
                yaml.dump({"projects": []}, f, sort_keys=False, allow_unicode=True)
        # Set workspace path
        if base_path is None:
            self.base_path = Path.home() / "Documents" / "AutoResearch_Workspace"
        else:
            self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

        self._init_projects_config()

    def _init_projects_config(self):
        if not self.projects_file.exists():
            # If file does not exist, create with a Default project
            default_project = {
                "name": "Default",
                "path": str(self.base_path / "Default"),
                "created_date": datetime.now().strftime("%Y-%m-%d"),
                "status": "active",
                "description": "Default project automatically created.",
                "structure": {
                    "references": {"path": "./References", "database": "./References/references.db"},
                    "literature_review": {"path": "./Literature_Review"},
                    "proposal": {"path": "./Proposal"},
                    "experiment": {"path": "./Experiment"},
                    "manuscript": {"path": "./Manuscript"}
                }
            }
            (self.base_path / "Default").mkdir(exist_ok=True)
            for folder in ["References", "Literature_Review", "Proposal", "Experiment", "Manuscript"]:
                (self.base_path / "Default" / folder).mkdir(exist_ok=True)
            config = {"projects": [default_project]}
            self._save_projects_config(config)
        else:
            with open(self.projects_file, 'r', encoding='utf-8') as f:
                self.projects_config = yaml.safe_load(f)
            # If file exists but projects is empty or None, add Default project
            if not self.projects_config or not self.projects_config.get("projects"):
                default_project = {
                    "name": "Default",
                    "path": str(self.base_path / "Default"),
                    "created_date": datetime.now().strftime("%Y-%m-%d"),
                    "status": "active",
                    "description": "Default project automatically created.",
                    "structure": {
                        "references": {"path": "./References", "database": "./References/references.db"},
                        "literature_review": {"path": "./Literature_Review"},
                        "proposal": {"path": "./Proposal"},
                        "experiment": {"path": "./Experiment"},
                        "manuscript": {"path": "./Manuscript"}
                    }
                }
                (self.base_path / "Default").mkdir(exist_ok=True)
                for folder in ["References", "Literature_Review", "Proposal", "Experiment", "Manuscript"]:
                    (self.base_path / "Default" / folder).mkdir(exist_ok=True)
                self.projects_config = {"projects": [default_project]}
                self._save_projects_config(self.projects_config)

    def _save_projects_config(self, config):
        with open(self.projects_file, 'w', encoding='utf-8') as f:
            yaml.dump(config, f, sort_keys=False, allow_unicode=True)
        self.projects_config = config

    def create_project(self, project_name: str, description: str = "") -> str:
        """Create a new research project and update YAML config."""
        project_path = self.base_path / project_name
        project_path.mkdir(exist_ok=True)
        # Standard folders
        folders = ["References", "Literature_Review", "Proposal", "Experiment", "Manuscript"]
        for folder in folders:
            (project_path / folder).mkdir(exist_ok=True)
        # Project config
        project_config = {
            "name": project_name,
            "path": str(project_path),
            "created_date": datetime.now().strftime("%Y-%m-%d"),
            "status": "active",
            "description": description,
            "structure": {
                "references": {"path": "./References", "database": "./References/references.db"},
                "literature_review": {"path": "./Literature_Review"},
                "proposal": {"path": "./Proposal"},
                "experiment": {"path": "./Experiment"},
                "manuscript": {"path": "./Manuscript"}
            }
        }
        self.projects_config["projects"].append(project_config)
        self._save_projects_config(self.projects_config)
        return project_name

    def rename_project(self, name: str, new_name: str):
        """Rename a project and update YAML config."""
        for project in self.projects_config["projects"]:
            if project["name"] == name:
                old_path = Path(project["path"])
                new_path = old_path.parent / new_name
                if old_path.exists():
                    os.rename(old_path, new_path)
                project["name"] = new_name
                project["path"] = str(new_path)
                self._save_projects_config(self.projects_config)
                return
        raise ValueError("Project not found")

    def delete_project(self, name: str):
        """Delete a project and update YAML config."""
        for i, project in enumerate(self.projects_config["projects"]):
            if project["name"] == name:
                project_path = Path(project["path"])
                if project_path.exists():
                    shutil.rmtree(project_path)
                del self.projects_config["projects"][i]
                self._save_projects_config(self.projects_config)
                return
        raise ValueError("Project not found")

    def list_projects(self) -> List[Dict[str, str]]:
        """List all projects from YAML config."""
        return self.projects_config.get("projects", [])

    def get_project(self, name: str) -> Optional[Dict[str, str]]:
        """Get details of a specific project from YAML config."""
        for project in self.projects_config.get("projects", []):
            if project["name"] == name:
                return project
        return None

    def get_project_structure(self, name: str) -> Optional[Dict]:
        """Get the folder structure for a project from YAML config."""
        project = self.get_project(name)
        if project:
            return project.get("structure", {})
        return None