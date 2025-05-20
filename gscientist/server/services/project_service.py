from gscientist.project_manager import ProjectManager

class ProjectService:
    def __init__(self, base_path=None, config_dir=None):
        self.pm = ProjectManager(base_path=base_path, config_dir=config_dir)

    def list_projects(self):
        return self.pm.list_projects()

    def get_project(self, name):
        return self.pm.get_project(name)

    def create_project(self, name, description=""):
        return self.pm.create_project(name, description)

    def rename_project(self, name, new_name):
        return self.pm.rename_project(name, new_name)

    def delete_project(self, name):
        return self.pm.delete_project(name)
