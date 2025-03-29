from pathlib import Path
import os
from gscientist.project_manager import ProjectManager


def run_tests():
    print("Running ProjectManager tests...\n")
    
    # Setup
    config_path = Path('test_config.yml')
    pm = ProjectManager(config_path)
    
    # Test adding project
    project_name = "Test Project"
    project_path = Path('test_project_dir')
    project = pm.add_project(project_name, str(project_path))
    
    print(f"Test 1: Adding project '{project_name}'")
    print(f"Project name: {project.name}")
    print(f"Project path: {project.get_workspace_path()}\n")
    
    # Test project directory creation
    print("Test 2: Project directory creation")
    if project_path.exists():
        print(f"Directory {project_path} created successfully")
    else:
        print(f"Failed to create directory {project_path}")
    
    # Test listing projects
    print("\nTest 3: Listing projects")
    projects = pm.list_projects()
    if project_name in projects:
        print(f"Project '{project_name}' found in project list")
    else:
        print(f"Project '{project_name}' not found in project list")
    
    # Cleanup
    try:
        if project_path.exists():
            os.rmdir(project_path)
        print("\nTest cleanup completed")
    except Exception as e:
        print(f"\nError during cleanup: {e}")

if __name__ == '__main__':
    run_tests()