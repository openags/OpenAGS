from gscientist.db.session import get_db
from gscientist.db.models import Project

class ProjectService:
    """科研项目管理服务"""
    
    def __init__(self):
        self.db = get_db()

    def create_project(self, name: str):
        """创建新项目"""
        project = Project(name=name)
        self.db.add(project)
        self.db.commit()
        return project

    def list_projects(self):
        """列出所有项目"""
        return self.db.query(Project).all()