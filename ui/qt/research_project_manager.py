from PySide6.QtCore import Qt, QAbstractItemModel, QModelIndex, QDir
from PySide6.QtWidgets import QMenu, QMessageBox, QInputDialog, QFileDialog
from PySide6.QtGui import QStandardItemModel, QStandardItem
import sqlite3
import os
import shutil

class ResearchDatabase:
    def __init__(self, base_path=None):
        self.db_path = "research_projects.db"
        if base_path is None:
            # 默认使用用户文档目录下的 Research Projects 文件夹
            self.base_path = os.path.join(QDir.homePath(), "Documents", "Research Projects")
        else:
            self.base_path = base_path
            
        # 确保基础目录存在
        os.makedirs(self.base_path, exist_ok=True)
        self.create_database()
    
    def create_database(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Create projects table with path column
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

    def create_project(self, project_name):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Create project directory
        project_path = os.path.join(self.base_path, project_name)
        os.makedirs(project_path, exist_ok=True)
        
        # Create project in database
        cursor.execute("INSERT INTO projects (name, path) VALUES (?, ?)", 
                      (project_name, project_path))
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
            
            # Create subfolders if any
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

    def rename_project(self, project_id, new_name):
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
        cursor.execute("UPDATE projects SET name=?, path=? WHERE id=?", 
                      (new_name, new_path, project_id))
        
        # Update paths in folders table
        cursor.execute("SELECT id, path FROM folders WHERE project_id=?", (project_id,))
        folders = cursor.fetchall()
        for folder_id, folder_path in folders:
            new_folder_path = folder_path.replace(old_path, new_path)
            cursor.execute("UPDATE folders SET path=? WHERE id=?", 
                         (new_folder_path, folder_id))
        
        conn.commit()
        conn.close()

    def delete_project(self, project_id):
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

class ResearchProjectModel(QStandardItemModel):
    def __init__(self, base_path=None):
        super().__init__()
        self.db = ResearchDatabase(base_path)
        self.setup_model()
    
    def setup_model(self):
        self.clear()
        root_item = self.invisibleRootItem()
        
        # Create "My Research" root item
        my_research = QStandardItem("My Research")
        my_research.setData("root", Qt.UserRole)  # 标记为根节点
        root_item.appendRow(my_research)
        
        # Load existing projects from database
        self.load_projects(my_research)
    
    def load_projects(self, parent_item):
        conn = sqlite3.connect(self.db.db_path)
        cursor = conn.cursor()
        
        # Get all projects
        cursor.execute("SELECT id, name, path FROM projects")
        projects = cursor.fetchall()
        
        for project_id, project_name, project_path in projects:
            project_item = QStandardItem(project_name)
            project_item.setData(project_id, Qt.UserRole)
            project_item.setData(project_path, Qt.UserRole + 1)
            parent_item.appendRow(project_item)
            
            # Load project folders
            cursor.execute("""
                SELECT id, name, path, parent_id 
                FROM folders 
                WHERE project_id=? AND parent_id IS NULL
                """, (project_id,))
            root_folders = cursor.fetchall()
            
            for folder_id, folder_name, folder_path, _ in root_folders:
                folder_item = QStandardItem(folder_name)
                folder_item.setData(folder_id, Qt.UserRole)
                folder_item.setData(folder_path, Qt.UserRole + 1)
                project_item.appendRow(folder_item)
                
                # Load subfolders
                self.load_subfolders(cursor, folder_item, folder_id)
        
        conn.close()
    
    def load_subfolders(self, cursor, parent_item, parent_folder_id):
        cursor.execute("""
            SELECT id, name, path 
            FROM folders 
            WHERE parent_id=?
            """, (parent_folder_id,))
        subfolders = cursor.fetchall()
        
        for folder_id, folder_name, folder_path in subfolders:
            folder_item = QStandardItem(folder_name)
            folder_item.setData(folder_id, Qt.UserRole)
            folder_item.setData(folder_path, Qt.UserRole + 1)
            parent_item.appendRow(folder_item)

    def create_new_project(self, project_name):
        project_id = self.db.create_project(project_name)
        my_research = self.item(0)  # Get "My Research" item
        
        project_path = os.path.join(self.db.base_path, project_name)
        
        # Create new project item
        project_item = QStandardItem(project_name)
        project_item.setData(project_id, Qt.UserRole)
        project_item.setData(project_path, Qt.UserRole + 1)
        my_research.appendRow(project_item)
        
        # Add default folders with References subfolder
        folders = {
            "Literature Review": ["References"],
            "Proposal": [],
            "Experiment": [],
            "Manuscript": []
        }
        
        for folder_name, subfolders in folders.items():
            folder_item = QStandardItem(folder_name)
            folder_path = os.path.join(project_path, folder_name)
            folder_item.setData(folder_path, Qt.UserRole + 1)
            project_item.appendRow(folder_item)
            
            # Add subfolders if any
            for subfolder in subfolders:
                subfolder_item = QStandardItem(subfolder)
                subfolder_path = os.path.join(folder_path, subfolder)
                subfolder_item.setData(subfolder_path, Qt.UserRole + 1)
                folder_item.appendRow(subfolder_item)
        
        return project_item

class ResearchTreeView:
    def __init__(self, tree_view, base_path=None):
        self.tree_view = tree_view
        self.model = ResearchProjectModel(base_path)
        self.tree_view.setModel(self.model)
        
        # Setup context menu
        self.tree_view.setContextMenuPolicy(Qt.CustomContextMenu)
        self.tree_view.customContextMenuRequested.connect(self.show_context_menu)
        
        # Setup double click for rename
        self.tree_view.doubleClicked.connect(self.handle_double_click)
    
    def show_context_menu(self, position):
        index = self.tree_view.indexAt(position)
        
        if not index.isValid():
            return
            
        item = self.model.itemFromIndex(index)
        menu = QMenu()
        
        if item.data(Qt.UserRole) == "root":  # My Research root node
            new_project_action = menu.addAction("New Research Project")
            action = menu.exec_(self.tree_view.viewport().mapToGlobal(position))
            
            if action == new_project_action:
                self.create_new_project()
        elif item.parent() == self.model.item(0):  # Project node
            rename_action = menu.addAction("Rename Project")
            delete_action = menu.addAction("Delete Project")
            action = menu.exec_(self.tree_view.viewport().mapToGlobal(position))
            
            if action == rename_action:
                self.rename_project(item)
            elif action == delete_action:
                self.delete_project(item)
    
    def create_new_project(self):
        name, ok = QInputDialog.getText(self.tree_view, 
                                      "New Research Project",
                                      "Enter project name:")
        if ok and name:
            self.model.create_new_project(name)
    
    def rename_project(self, item):
        project_id = item.data(Qt.UserRole)
        old_name = item.text()
        new_name, ok = QInputDialog.getText(self.tree_view,
                                          "Rename Project",
                                          "Enter new name:",
                                          text=old_name)
        if ok and new_name and new_name != old_name:
            self.model.db.rename_project(project_id, new_name)
            item.setText(new_name)
            # Update item path
            new_path = os.path.join(os.path.dirname(item.data(Qt.UserRole + 1)), new_name)
            item.setData(new_path, Qt.UserRole + 1)
    
    def delete_project(self, item):
        reply = QMessageBox.question(self.tree_view,
                                   "Delete Project",
                                   f"Are you sure you want to delete project '{item.text()}'?\n"
                                   f"This will delete all project files and cannot be undone.",
                                   QMessageBox.Yes | QMessageBox.No,
                                   QMessageBox.No)
        
        if reply == QMessageBox.Yes:
            project_id = item.data(Qt.UserRole)
            self.model.db.delete_project(project_id)
            self.model.item(0).removeRow(item.row())
    
    def handle_double_click(self, index):
        item = self.model.itemFromIndex(index)
        if item.parent() == self.model.item(0):  # Project node
            self.rename_project(item)

    def get_base_path(self):
        return self.model.db.base_path