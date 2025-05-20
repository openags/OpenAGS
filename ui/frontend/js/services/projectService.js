// ui/frontend/js/services/projectService.js
class ProjectService {
    constructor(baseUrl = 'http://localhost:8000') {
        this.baseUrl = baseUrl;
    }

    async listProjects() {
        const res = await fetch(`${this.baseUrl}/projects/`);
        if (!res.ok) throw new Error('Failed to fetch projects');
        return (await res.json()).projects;
    }

    async createProject(name, description = '') {
        const res = await fetch(`${this.baseUrl}/projects/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description })
        });
        if (!res.ok) throw new Error('Failed to create project');
        return await res.json();
    }

    async renameProject(name, newName) {
        const res = await fetch(`${this.baseUrl}/projects/${encodeURIComponent(name)}/rename`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_name: newName })
        });
        if (!res.ok) throw new Error('Failed to rename project');
        return await res.json();
    }

    async deleteProject(name) {
        const res = await fetch(`${this.baseUrl}/projects/${encodeURIComponent(name)}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Failed to delete project');
        return await res.json();
    }
}

export default new ProjectService();
