console.log('project.js loaded');
import ProjectService from '../services/projectService.js';

const projectListEl = document.querySelector('.project-list');
const newProjectBtn = document.querySelector('.new-project-btn');
let contextMenuEl = null;

async function renderProjectList() {
    console.log('renderProjectList called');
    if (!projectListEl) return;
    projectListEl.innerHTML = '';
    try {
        const projects = await ProjectService.listProjects();
        projects.forEach(project => {
            const li = document.createElement('li');
            li.className = 'project-item';
            // Project button
            const btn = document.createElement('button');
            btn.className = 'project-button';
            btn.innerHTML = `
                <div class="project-icon">
                    <i class="fas fa-folder"></i>
                    <span class="project-text">${project.name}</span>
                </div>
                <i class="fas fa-chevron-right project-arrow"></i>
            `;
            // Expand/collapse event
            btn.addEventListener('click', () => {
                const isExpanded = li.classList.contains('expanded');
                li.classList.toggle('expanded');
                const arrow = btn.querySelector('.project-arrow');
                arrow.classList.toggle('fa-chevron-down', !isExpanded);
                arrow.classList.toggle('fa-chevron-right', isExpanded);
                // Toggle child module display
                if (childrenUl) {
                    childrenUl.style.display = isExpanded ? 'none' : 'block';
                }
                // Set main content area title
                const projectTitle = document.getElementById('projectTitle');
                if (projectTitle) projectTitle.textContent = project.name;
                // Default subtitle
                const projectSection = document.getElementById('projectSection');
                if (projectSection) projectSection.textContent = 'Overview';
                // Save current selected project
                localStorage.setItem('selectedProject', project.name);
                // Auto switch to Chat tab
                if (window.switchTab) window.switchTab('chat');
            });
            li.appendChild(btn);

            // Child module rendering (styled buttons + icons + order)
            let childrenUl = null;
            const childConfig = [
                { key: 'chat', label: 'General Chat', icon: 'fa-comments', tab: 'chat' },
                { key: 'literature_review', label: 'Literature Review', icon: 'fa-book-open', tab: 'literature' },
                { key: 'proposal', label: 'Proposal', icon: 'fa-file-alt', tab: 'proposal' },
                { key: 'experiment', label: 'Experiment', icon: 'fa-flask', tab: 'experiment' },
                { key: 'manuscript', label: 'Manuscript', icon: 'fa-edit', tab: 'manuscript' },
                { key: 'references', label: 'References', icon: 'fa-bookmark', tab: 'references' }
            ];
            if (project.structure && typeof project.structure === 'object') {
                childrenUl = document.createElement('ul');
                childrenUl.className = 'project-children';
                childrenUl.style.display = 'none';
                // Render known child modules in order
                childConfig.forEach(cfg => {
                    if (project.structure[cfg.key]) {
                        const childLi = document.createElement('li');
                        childLi.className = 'project-child';
                        const btn = document.createElement('button');
                        btn.className = 'child-button';
                        btn.setAttribute('data-tab', cfg.tab);
                        btn.innerHTML = `<i class="fas ${cfg.icon}"></i><span>${cfg.label}</span>`;
                        // Update subtitle when child module is clicked
                        btn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const projectSection = document.getElementById('projectSection');
                            if (projectSection) projectSection.textContent = cfg.label;
                        });
                        childLi.appendChild(btn);
                        childrenUl.appendChild(childLi);
                    }
                });
                // Render undefined child modules
                for (const key in project.structure) {
                    if (!childConfig.some(cfg => cfg.key === key)) {
                        const childLi = document.createElement('li');
                        childLi.className = 'project-child';
                        const btn = document.createElement('button');
                        btn.className = 'child-button';
                        btn.setAttribute('data-tab', key);
                        btn.innerHTML = `<i class="fas fa-folder"></i><span>${key}</span>`;
                        childLi.appendChild(btn);
                        childrenUl.appendChild(childLi);
                    }
                }
                li.appendChild(childrenUl);
            }
            projectListEl.appendChild(li);
        });
    } catch (err) {
        projectListEl.innerHTML = `<li>Failed to load projects: ${err.message}</li>`;
    }
}

// Add event delegation to projectListEl
projectListEl.addEventListener('contextmenu', (e) => {
    const li = e.target.closest('.project-item');
    if (li) {
        e.preventDefault();
        const projectName = li.querySelector('.project-text').textContent;
        showContextMenu(e, projectName);
    }
});

function showContextMenu(e, projectName) {
    removeContextMenu();
    contextMenuEl = document.createElement('ul');
    contextMenuEl.className = 'context-menu';
    contextMenuEl.style.top = `${e.clientY}px`;
    contextMenuEl.style.left = `${e.clientX}px`;
    contextMenuEl.innerHTML = `
        <li class="rename">Rename</li>
        <li class="delete">Delete</li>
    `;
    document.body.appendChild(contextMenuEl);
    // Event binding
    contextMenuEl.querySelector('.rename').onclick = async () => {
        const newName = prompt('Enter new project name', projectName);
        if (newName && newName !== projectName) {
            await ProjectService.renameProject(projectName, newName);
            renderProjectList();
        }
        removeContextMenu();
    };
    contextMenuEl.querySelector('.delete').onclick = async () => {
        const confirmName = prompt(`Enter project name to confirm deletion: ${projectName}`);
        if (confirmName === projectName) {
            await ProjectService.deleteProject(projectName);
            renderProjectList();
        } else {
            alert('Project name does not match, not deleted');
        }
        removeContextMenu();
    };
    document.addEventListener('click', removeContextMenu, { once: true });
}

function removeContextMenu() {
    if (contextMenuEl) {
        contextMenuEl.remove();
        contextMenuEl = null;
    }
}

if (newProjectBtn) {
    newProjectBtn.addEventListener('click', async () => {
        const name = prompt('New project name?');
        if (name) {
            await ProjectService.createProject(name);
            renderProjectList();
        }
    });
}

// Initialize rendering
renderProjectList();