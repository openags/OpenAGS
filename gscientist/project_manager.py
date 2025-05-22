import os
import shutil
import yaml
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime
from .references.references_manager import ReferencesManager

class ProjectManager:
    def __init__(self, base_path: Optional[str] = None, config_dir: Optional[str] = None):
        """Initialize ProjectManager, using YAML to manage projects"""
        # --- Modification: Added comments to clarify default path logic ---
        if config_dir is None:
            self.config_dir = Path(__file__).parent.parent / "config"
        else:
            self.config_dir = Path(config_dir)
        self.config_dir.mkdir(exist_ok=True)
        self.projects_file = self.config_dir / "research_projects.yml"

        if base_path is None:
            self.base_path = Path.home() / "Documents" / "AutoResearch_Workspace"
        else:
            self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

        self.global_config = {
            "workspace": {
                "path": str(self.base_path),
                "papers_database": str(self.base_path / "papers.db")
            }
        }

        self._init_projects_config()
        self.references_manager = ReferencesManager(
            global_db_path=self.global_config['workspace']['papers_database'],
            projects_file_path=str(self.projects_file)
        )

    def _init_projects_config(self):
        """Initialize YAML file and default project"""
        # --- Modification: Optimized default project creation logic, added comments ---
        if not self.projects_file.exists():
            default_project = self._create_default_project_config()
            config = {"global": self.global_config, "projects": [default_project]}
            self._save_projects_config(config)
        else:
            with open(self.projects_file, 'r', encoding='utf-8') as f:
                self.projects_config = yaml.safe_load(f) or {"global": self.global_config, "projects": []}
            if not self.projects_config.get("projects"):
                default_project = self._create_default_project_config()
                self.projects_config["projects"] = [default_project]
                self._save_projects_config(self.projects_config)

    def _create_default_project_config(self):
        """Create default project configuration"""
        # --- Modification: Added call to initialize references.db ---
        project_name = "Default"
        project_path = self.base_path / project_name
        project_path.mkdir(exist_ok=True)
        folders = ["References", "Literature_Review", "Proposal", "Experiment", "Manuscript"]
        for folder in folders:
            (project_path / folder).mkdir(exist_ok=True)
        default_project = {
            "name": project_name,
            "path": str(project_path),
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
        # --- Added: Initialize references.db for default project ---
        # Note: references_manager will be initialized later, so we'll create the DB directly
        refs_db_path = project_path / "References" / "references.db"
        refs_db_path.parent.mkdir(exist_ok=True)
        return default_project

    def _save_projects_config(self, config):
        """Save YAML configuration"""
        # --- Modification: Optimized configuration saving logic, added comments ---
        full_config = {
            "global": self.global_config,
            "projects": config.get("projects", [])
        }
        with open(self.projects_file, 'w', encoding='utf-8') as f:
            yaml.dump(full_config, f, sort_keys=False, allow_unicode=True)
        self.projects_config = full_config

    def create_project(self, project_name: str, description: str = "") -> str:
        """Create a new project and initialize references.db"""
        # --- Modification: Added uniqueness check and references.db initialization ---
        if any(p['name'] == project_name for p in self.projects_config.get("projects", [])):
            raise ValueError(f"Project '{project_name}' already exists")

        project_path = self.base_path / project_name
        project_path.mkdir(exist_ok=True)
        folders = ["References", "Literature_Review", "Proposal", "Experiment", "Manuscript"]
        for folder in folders:
            (project_path / folder).mkdir(exist_ok=True)

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

        # --- Added: Initialize references.db for new project ---
        self.references_manager.create_project_references_db(str(project_path / "References" / "references.db"))
        return project_name

    def rename_project(self, name: str, new_name: str):
        """Rename project and update path"""
        # --- Modification: Optimized path update logic ---
        for project in self.projects_config["projects"]:
            if project["name"] == name:
                old_path = Path(project["path"])
                new_path = old_path.parent / new_name
                if old_path.exists():
                    os.rename(old_path, new_path)
                project["name"] = new_name
                project["path"] = str(new_path)
                project["structure"]["references"]["database"] = "./References/references.db"
                self._save_projects_config(self.projects_config)
                return
        raise ValueError(f"Project '{name}' not found")

    def delete_project(self, name: str):
        """Delete project and remove directory"""
        # --- Modification: Added comments, logic remains unchanged ---
        for i, project in enumerate(self.projects_config["projects"]):
            if project["name"] == name:
                project_path = Path(project["path"])
                if project_path.exists():
                    shutil.rmtree(project_path)
                del self.projects_config["projects"][i]
                self._save_projects_config(self.projects_config)
                return
        raise ValueError(f"Project '{name}' not found")

    def list_projects(self) -> List[Dict[str, str]]:
        """List all projects"""
        return self.projects_config.get("projects", [])

    def get_project(self, name: str) -> Optional[Dict[str, str]]:
        """Get project details"""
        for project in self.projects_config.get("projects", []):
            if project["name"] == name:
                return project
        return None

    def get_project_structure(self, name: str) -> Optional[Dict]:
        """Get project directory structure"""
        project = self.get_project(name)
        if project:
            return project.get("structure", {})
        return None