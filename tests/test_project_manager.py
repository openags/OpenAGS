import shutil
from pathlib import Path
import os
from gscientist.project_manager import ProjectManager

def run_tests():
    print("Running ProjectManager tests...\n")
    # Setup test config dir and workspace
    test_config_dir = Path("test_config")
    test_config_dir.mkdir(exist_ok=True)
    test_workspace = Path("test_workspace")
    test_workspace.mkdir(exist_ok=True)
    pm = ProjectManager(base_path=str(test_workspace), config_dir=str(test_config_dir))

    # Test creating project
    project_name = "TestProject"
    project_id = pm.create_project(project_name, description="A test project")
    print(f"Test 1: Created project '{project_name}' with id {project_id}")
    projects = pm.list_projects()
    found = any(p["id"] == project_id and p["name"] == project_name for p in projects)
    print(f"Project found in list: {found}")

    # Test project directory creation
    project_dir = test_workspace / project_name
    print("Test 2: Project directory creation")
    if project_dir.exists():
        print(f"Directory {project_dir} created successfully")
    else:
        print(f"Failed to create directory {project_dir}")

    # Test get_project
    print("\nTest 3: Get project by id")
    project = pm.get_project(project_id)
    if project and project["name"] == project_name:
        print(f"Project '{project_name}' retrieved successfully")
    else:
        print(f"Failed to retrieve project '{project_name}'")

    # Test rename_project
    new_name = "RenamedProject"
    pm.rename_project(project_id, new_name)
    renamed_dir = test_workspace / new_name
    print("\nTest 4: Rename project")
    if renamed_dir.exists() and not project_dir.exists():
        print(f"Project directory renamed to {renamed_dir}")
    else:
        print(f"Failed to rename project directory")

    # Test delete_project
    pm.delete_project(project_id)
    print("\nTest 5: Delete project")
    if not renamed_dir.exists():
        print(f"Project directory {renamed_dir} deleted successfully")
    else:
        print(f"Failed to delete project directory")

    # Cleanup test config and workspace
    shutil.rmtree(test_config_dir)
    shutil.rmtree(test_workspace)
    print("\nTest cleanup completed")

if __name__ == '__main__':
    run_tests()