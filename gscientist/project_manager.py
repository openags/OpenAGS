import os
import shutil
import sqlite3
from pathlib import Path
from typing import Dict, List, Optional


class ProjectManager:
    def __init__(self, base_path: Optional[str] = None):
        """Initialize the ProjectManager with a database and base path.

        Args:
            base_path (str, optional): Base directory for projects. Defaults to user's Documents folder.
        """
        self.db_path = "research_projects.db"
        if base_path is None:
            # Default to user's Documents/Research Projects directory
            self.base_path = os.path.join(Path.home(), "Documents", "Research Projects")
        else:
            self.base_path = base_path

        # Ensure the base directory exists
        os.makedirs(self.base_path, exist_ok=True)
        self._create_database()

    def _create_database(self):
        """Create the SQLite database and required tables."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Create projects table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Create folders table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                parent_id INTEGER,
                name TEXT NOT NULL,
                folder_type TEXT NOT NULL,
                path TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
            )
        ''')

        conn.commit()
        conn.close()

    def create_project(self, project_name: str) -> int:
        """Create a new research project.

        Args:
            project_name (str): Name of the project.

        Returns:
            int: The ID of the created project.
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Create project directory
        project_path = os.path.join(self.base_path, project_name)
        os.makedirs(project_path, exist_ok=True)

        # Insert project into database
        cursor.execute("INSERT INTO projects (name, path) VALUES (?, ?)", (project_name, project_path))
        project_id = cursor.lastrowid

        # Create default folders
        default_folders = {
            "Literature Review": ["References"],
            "Proposal": [],
            "Experiment": [],
            "Manuscript": []
        }

        for folder_name, subfolders in default_folders.items():
            folder_path = os.path.join(project_path, folder_name)
            os.makedirs(folder_path, exist_ok=True)

            cursor.execute(
                "INSERT INTO folders (project_id, parent_id, name, folder_type, path) VALUES (?, NULL, ?, 'default', ?)",
                (project_id, folder_name, folder_path)
            )
            folder_id = cursor.lastrowid

            # Create subfolders
            for subfolder in subfolders:
                subfolder_path = os.path.join(folder_path, subfolder)
                os.makedirs(subfolder_path, exist_ok=True)
                cursor.execute(
                    "INSERT INTO folders (project_id, parent_id, name, folder_type, path) VALUES (?, ?, ?, 'default', ?)",
                    (project_id, folder_id, subfolder, subfolder_path)
                )

        conn.commit()
        conn.close()
        return project_id

    def rename_project(self, project_id: int, new_name: str):
        """Rename an existing project.

        Args:
            project_id (int): ID of the project to rename.
            new_name (str): New name for the project.
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Get old project info
        cursor.execute("SELECT name, path FROM projects WHERE id=?", (project_id,))
        old_name, old_path = cursor.fetchone()

        # Calculate new path
        new_path = os.path.join(os.path.dirname(old_path), new_name)

        # Rename directory
        if os.path.exists(old_path):
            os.rename(old_path, new_path)

        # Update database
        cursor.execute("UPDATE projects SET name=?, path=? WHERE id=?", (new_name, new_path, project_id))

        # Update paths in folders table
        cursor.execute("SELECT id, path FROM folders WHERE project_id=?", (project_id,))
        folders = cursor.fetchall()
        for folder_id, folder_path in folders:
            new_folder_path = folder_path.replace(old_path, new_path)
            cursor.execute("UPDATE folders SET path=? WHERE id=?", (new_folder_path, folder_id))

        conn.commit()
        conn.close()

    def delete_project(self, project_id: int):
        """Delete a project and its associated files.

        Args:
            project_id (int): ID of the project to delete.
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Get project path
        cursor.execute("SELECT path FROM projects WHERE id=?", (project_id,))
        project_path = cursor.fetchone()[0]

        # Delete project directory
        if os.path.exists(project_path):
            shutil.rmtree(project_path)

        # Delete from database (folders will be deleted due to CASCADE)
        cursor.execute("DELETE FROM projects WHERE id=?", (project_id,))

        conn.commit()
        conn.close()

    def list_projects(self) -> List[Dict[str, str]]:
        """List all projects.

        Returns:
            List[Dict[str, str]]: A list of projects with their ID, name, and path.
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("SELECT id, name, path FROM projects")
        projects = [{"id": row[0], "name": row[1], "path": row[2]} for row in cursor.fetchall()]

        conn.close()
        return projects

    def get_project(self, project_id: int) -> Optional[Dict[str, str]]:
        """Get details of a specific project.

        Args:
            project_id (int): ID of the project.

        Returns:
            Optional[Dict[str, str]]: Project details or None if not found.
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("SELECT id, name, path FROM projects WHERE id=?", (project_id,))
        row = cursor.fetchone()

        conn.close()
        if row:
            return {"id": row[0], "name": row[1], "path": row[2]}
        return None

    def get_project_structure(self, project_id: int) -> List[Dict]:
        """Get the folder structure for a project.

        Args:
            project_id (int): ID of the project.

        Returns:
            List[Dict]: List of folders with their properties and relationships.
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id, parent_id, name, folder_type, path 
            FROM folders 
            WHERE project_id=? 
            ORDER BY parent_id NULLS FIRST, name
        """, (project_id,))
        
        folders = [
            {
                "id": row[0],
                "parent_id": row[1],
                "name": row[2],
                "folder_type": row[3],
                "path": row[4]
            }
            for row in cursor.fetchall()
        ]

        conn.close()
        return folders