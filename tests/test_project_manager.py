import unittest
from unittest.mock import MagicMock, patch
from gscientist.project_manager import ProjectManager

class TestProjectManager(unittest.TestCase):
    
    def setUp(self):
        self.mock_config = {
            'project_dir': '/tmp/test_project',
            'name': 'Test Project',
            'description': 'Test project description'
        }
        self.pm = ProjectManager(self.mock_config)
        
    @patch('os.makedirs')
    def test_create_project_directory(self, mock_makedirs):
        """Test project directory creation"""
        self.pm.create_project_directory()
        mock_makedirs.assert_called_once_with(self.mock_config['project_dir'], exist_ok=True)
        
    @patch('os.path.exists')
    def test_project_exists(self, mock_exists):
        """Test project existence check"""
        mock_exists.return_value = True
        self.assertTrue(self.pm.project_exists())
        mock_exists.assert_called_once_with(self.mock_config['project_dir'])
        
    def test_project_metadata(self):
        """Test project metadata"""
        self.assertEqual(self.pm.get_project_name(), self.mock_config['name'])
        self.assertEqual(self.pm.get_project_description(), self.mock_config['description'])
        
    @patch('os.listdir')
    def test_list_project_files(self, mock_listdir):
        """Test listing project files"""
        mock_listdir.return_value = ['file1.txt', 'file2.md']
        files = self.pm.list_project_files()
        self.assertEqual(len(files), 2)
        mock_listdir.assert_called_once_with(self.mock_config['project_dir'])
        
    @patch('os.path.exists')
    @patch('os.makedirs')
    def test_initialize_project(self, mock_makedirs, mock_exists):
        """Test project initialization"""
        mock_exists.return_value = False
        self.pm.initialize_project()
        mock_exists.assert_called_once_with(self.mock_config['project_dir'])
        mock_makedirs.assert_called_once_with(self.mock_config['project_dir'], exist_ok=True)

if __name__ == '__main__':
    unittest.main()