from PySide6.QtCore import Qt, QAbstractItemModel, QModelIndex
from PySide6.QtWidgets import QMenu, QMessageBox, QInputDialog
from gscientist.project_manager import ProjectManager
import os

class TreeItem:
    def __init__(self, data, parent=None):
        self.parent_item = parent
        self.item_data = data
        self.child_items = []

    def appendChild(self, item):
        self.child_items.append(item)

    def child(self, row):
        return self.child_items[row]

    def childCount(self):
        return len(self.child_items)

    def columnCount(self):
        return 1

    def data(self):
        return self.item_data

    def parent(self):
        return self.parent_item

    def row(self):
        if self.parent_item:
            return self.parent_item.child_items.index(self)
        return 0

class ResearchProjectModel(QAbstractItemModel):
    # Define folder order
    FOLDER_ORDER = {
        "Literature Review": 0,
        "Proposal": 1,
        "Experiment": 2,
        "Manuscript": 3
    }

    def __init__(self, base_path=None):
        super().__init__()
        self.project_manager = ProjectManager(base_path)
        self.root_item = TreeItem({"name": "Projects"})
        self.setupModelData()

    def _get_folder_sort_order(self, folder_name):
        return self.FOLDER_ORDER.get(folder_name, len(self.FOLDER_ORDER))

    def setupModelData(self):
        self.projects = self.project_manager.list_projects()
        if not self.projects:
            project = self.create_new_project("Default Research Project")
            self.projects = [project]

        for project in self.projects:
            project_item = TreeItem(project, self.root_item)
            self.root_item.appendChild(project_item)
            
            # Load folders for this project
            folders = self.project_manager.get_project_structure(project["id"])
            
            # Sort folders based on predefined order
            folders.sort(key=lambda x: self._get_folder_sort_order(x["name"]))
            
            folder_items = {}
            
            # First pass: create all folder items
            for folder in folders:
                folder_item = TreeItem(folder, project_item if folder["parent_id"] is None else folder_items[folder["parent_id"]])
                folder_items[folder["id"]] = folder_item
                
                if folder["parent_id"] is None:
                    project_item.appendChild(folder_item)
                else:
                    parent_item = folder_items[folder["parent_id"]]
                    # Find the correct position to insert based on sort order
                    insert_pos = 0
                    for i, child in enumerate(parent_item.child_items):
                        if self._get_folder_sort_order(child.data()["name"]) > self._get_folder_sort_order(folder["name"]):
                            break
                        insert_pos = i + 1
                    parent_item.child_items.insert(insert_pos, folder_item)

    def index(self, row, column, parent=QModelIndex()):
        if not self.hasIndex(row, column, parent):
            return QModelIndex()

        if not parent.isValid():
            parent_item = self.root_item
        else:
            parent_item = parent.internalPointer()

        child_item = parent_item.child(row)
        if child_item:
            return self.createIndex(row, column, child_item)
        return QModelIndex()

    def parent(self, index):
        if not index.isValid():
            return QModelIndex()

        child_item = index.internalPointer()
        parent_item = child_item.parent()

        if parent_item == self.root_item:
            return QModelIndex()

        return self.createIndex(parent_item.row(), 0, parent_item)

    def rowCount(self, parent=QModelIndex()):
        if parent.column() > 0:
            return 0

        if not parent.isValid():
            parent_item = self.root_item
        else:
            parent_item = parent.internalPointer()

        return parent_item.childCount()

    def columnCount(self, parent=QModelIndex()):
        return 1

    def data(self, index, role=Qt.DisplayRole):
        if not index.isValid():
            return None

        item = index.internalPointer()
        
        if role == Qt.DisplayRole:
            return item.data()["name"]

        return None

    def headerData(self, section, orientation, role=Qt.DisplayRole):
        if orientation == Qt.Horizontal and role == Qt.DisplayRole:
            if section == 0:
                return "Project Name"
        return None

    def create_new_project(self, project_name):
        """Create a new research project."""
        project_id = self.project_manager.create_project(project_name)
        project = self.project_manager.get_project(project_id)
        project_item = TreeItem(project, self.root_item)
        self.beginInsertRows(QModelIndex(), self.root_item.childCount(), self.root_item.childCount())
        self.root_item.appendChild(project_item)
        self.endInsertRows()
        return project

    def rename_project(self, project_id, new_name):
        """Rename an existing project."""
        self.project_manager.rename_project(project_id, new_name)
        # Update the local project list
        for i in range(self.root_item.childCount()):
            project_item = self.root_item.child(i)
            if project_item.data()["id"] == project_id:
                project_item.item_data["name"] = new_name
                self.dataChanged.emit(self.index(i, 0, QModelIndex()), self.index(i, 0, QModelIndex()))
                break

    def delete_project(self, project_id):
        """Delete a research project."""
        for i in range(self.root_item.childCount()):
            project_item = self.root_item.child(i)
            if project_item.data()["id"] == project_id:
                self.beginRemoveRows(QModelIndex(), i, i)
                self.root_item.child_items.pop(i)
                self.endRemoveRows()
                break
        self.project_manager.delete_project(project_id)

    def list_projects(self):
        """List all research projects."""
        return self.projects

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

        # If no valid index, allow only "New Research Project"
        if not index.isValid():
            menu = QMenu()
            new_project_action = menu.addAction("New Research Project")
            action = menu.exec_(self.tree_view.viewport().mapToGlobal(position))
            if action == new_project_action:
                self.create_new_project()
            return

        # Get the selected item data
        item = index.internalPointer().data()
        
        # Create menu based on item type
        menu = QMenu()
        
        # Check if this is a project (has 'id' in item data) or a folder
        if 'id' in item and 'parent_id' not in item:
            # This is a project item
            new_project_action = menu.addAction("New Research Project")
            rename_action = menu.addAction("Rename Project")
            delete_action = menu.addAction("Delete Project")
            
            action = menu.exec_(self.tree_view.viewport().mapToGlobal(position))
            
            if action == new_project_action:
                self.create_new_project()
            elif action == rename_action:
                self.rename_project(item)
            elif action == delete_action:
                self.delete_project(item)
        else:
            # This is a folder item
            menu.addAction("Open Folder")
            menu.addSeparator()
            menu.addAction("View in Explorer")
            
            action = menu.exec_(self.tree_view.viewport().mapToGlobal(position))
            
            if action and action.text() == "View in Explorer":
                path = item.get('path', '')
                if path and os.path.exists(path):
                    os.startfile(path)

    def create_new_project(self):
        """Prompt the user to create a new research project."""
        name, ok = QInputDialog.getText(
            self.tree_view,
            "New Research Project",
            "Enter project name:"
        )
        if ok and name:
            self.model.create_new_project(name)

    def rename_project(self, item):
        """Prompt the user to rename an existing project."""
        project_id = item["id"]
        old_name = item["name"]
        new_name, ok = QInputDialog.getText(
            self.tree_view,
            "Rename Project",
            "Enter new name:",
            text=old_name
        )
        if ok and new_name and new_name != old_name:
            self.model.rename_project(project_id, new_name)

    def delete_project(self, item):
        """Prompt the user to confirm and delete a project."""
        reply = QMessageBox.question(
            self.tree_view,
            "Delete Project",
            f"Are you sure you want to delete project '{item['name']}'?\n"
            f"This will delete all project files and cannot be undone.",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )

        if reply == QMessageBox.Yes:
            project_id = item["id"]
            self.model.delete_project(project_id)

    def handle_double_click(self, index):
        """Handle double-click on items."""
        if not index.isValid():
            return
            
        item = index.internalPointer().data()
        if 'id' in item and 'parent_id' not in item:
            # This is a project item
            self.rename_project(item)
        else:
            # This is a folder item
            path = item.get('path', '')
            if path and os.path.exists(path):
                os.startfile(path)