from gscientist.db.session import get_db
from gscientist.db.models import Project

class ProjectService:
    """������Ŀ��������"""
    
    def __init__(self):
        self.db = get_db()

    def create_project(self, name: str):
        """��������Ŀ"""
        project = Project(name=name)
        self.db.add(project)
        self.db.commit()
        return project

    def list_projects(self):
        """�г�������Ŀ"""
        return self.db.query(Project).all()