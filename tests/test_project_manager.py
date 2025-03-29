import unittest
from unittest.mock import MagicMock, patch
from pathlib import Path
import os
from gscientist.project_manager import ProjectManager

class TestProjectManager(unittest.TestCase):
    
    @patch('pathlib.Path.exists', return_value=True)
    @patch('builtins.open', new_callable=MagicMock)
    def setUp(self, mock_open, mock_exists):
        # Mock the content of the YAML file
        mock_open.return_value.__enter__.return_value.read.return_value = """
        Test Project: test_project
        """
        self.mock_config_path = Path('/mock/config.yml')  # Use Path for cross-platform compatibility
        self.pm = ProjectManager(self.mock_config_path)  # Pass a mock file path
        
    @patch('os.makedirs')
    def test_create_project_directory(self, mock_makedirs):
        """Test project directory creation"""
        project_path = Path('/tmp/test_project')  # Use Path for cross-platform compatibility
        self.pm.add_project('Test Project', str(project_path))
        mock_makedirs.assert_called_once_with(project_path, exist_ok=True)
        
    @patch('os.path.exists', return_value=True)
    def test_project_exists(self, mock_exists):
        """Test project existence check"""
        project_path = Path('/tmp/test_project')  # Use Path for cross-platform compatibility
        self.pm.add_project('Test Project', str(project_path))
        self.assertTrue(project_path.exists())
        mock_exists.assert_called_once_with(str(project_path))
        
    def test_project_metadata(self):
        """Test project metadata"""
        project = self.pm.add_project('Test Project', '/tmp/test_project')
        self.assertEqual(project.name, 'Test Project')
        self.assertEqual(str(project.get_workspace_path()), '/tmp/test_project')
        
    @patch('os.listdir')
    def test_list_project_files(self, mock_listdir):
        """Test listing project files"""
        mock_listdir.return_value = ['file1.txt', 'file2.md']
        project_path = Path('/tmp/test_project')  # Use Path for cross-platform compatibility
        self.pm.add_project('Test Project', str(project_path))
        files = mock_listdir.return_value
        self.assertEqual(len(files), 2)
        mock_listdir.assert_called_once_with(str(project_path))
        
    @patch('os.path.exists', return_value=False)
    @patch('os.makedirs')
    def test_initialize_project(self, mock_makedirs, mock_exists):
        """Test project initialization"""
        project_path = Path('/tmp/test_project')  # Use Path for cross-platform compatibility
        self.pm.add_project('Test Project', str(project_path))
        mock_exists.assert_called_once_with(str(project_path))
        mock_makedirs.assert_called_once_with(project_path, exist_ok=True)

    def test_add_project(self):
        """Test adding a new project"""
        project = self.pm.add_project('New Project', '/tmp/new_project')
        self.assertEqual(project.name, 'New Project')
        self.assertEqual(str(project.get_workspace_path()), '/tmp/new_project')

    def test_list_projects(self):
        """Test listing projects"""
        self.pm.add_project('Test Project', '/tmp/test_project')
        projects = self.pm.list_projects()
        self.assertIn('Test Project', projects)

if __name__ == '__main__':
    unittest.main()