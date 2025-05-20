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
            // 项目按钮
            const btn = document.createElement('button');
            btn.className = 'project-button';
            btn.innerHTML = `
                <div class="project-icon">
                    <i class="fas fa-folder"></i>
                    <span class="project-text">${project.name}</span>
                </div>
                <i class="fas fa-chevron-right project-arrow"></i>
            `;
            // 展开/收起事件
            btn.addEventListener('click', () => {
                const isExpanded = li.classList.contains('expanded');
                li.classList.toggle('expanded');
                const arrow = btn.querySelector('.project-arrow');
                arrow.classList.toggle('fa-chevron-down', !isExpanded);
                arrow.classList.toggle('fa-chevron-right', isExpanded);
                // 切换子模块显示
                if (childrenUl) {
                    childrenUl.style.display = isExpanded ? 'none' : 'block';
                }
                // 设置主内容区标题
                const projectTitle = document.getElementById('projectTitle');
                if (projectTitle) projectTitle.textContent = project.name;
                // 默认副标题
                const projectSection = document.getElementById('projectSection');
                if (projectSection) projectSection.textContent = 'Overview';
                // 记录当前选中项目
                localStorage.setItem('selectedProject', project.name);
                // 自动切换到 Chat tab
                if (window.switchTab) window.switchTab('chat');
            });
            li.appendChild(btn);

            // 子模块渲染（美观按钮+图标+顺序）
            let childrenUl = null;
            const childConfig = [
                { key: 'chat', label: 'General Chat', icon: 'fa-comments', tab: 'chat' },
                { key: 'literature_review', label: 'Literature Review', icon: 'fa-book-open', tab: 'literature' },
                { key: 'proposal', label: 'Proposal', icon: 'fa-file-alt', tab: 'proposal' },
                { key: 'experiment', label: 'Experiment', icon: 'fa-flask', tab: 'experiment' },
                { key: 'manuscript', label: 'Manuscript', icon: 'fa-edit', tab: 'manuscript' },
                { key: 'references', label: 'References', icon: 'fa-bookmark', tab: 'references' },
            ];
            if (project.structure && typeof project.structure === 'object') {
                childrenUl = document.createElement('ul');
                childrenUl.className = 'project-children';
                childrenUl.style.display = 'none';
                // 按顺序渲染已知子模块
                childConfig.forEach(cfg => {
                    if (project.structure[cfg.key]) {
                        const childLi = document.createElement('li');
                        childLi.className = 'project-child';
                        const btn = document.createElement('button');
                        btn.className = 'child-button';
                        btn.setAttribute('data-tab', cfg.tab);
                        btn.innerHTML = `<i class="fas ${cfg.icon}"></i><span>${cfg.label}</span>`;
                        // 子模块点击时，更新副标题
                        btn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const projectSection = document.getElementById('projectSection');
                            if (projectSection) projectSection.textContent = cfg.label;
                        });
                        childLi.appendChild(btn);
                        childrenUl.appendChild(childLi);
                    }
                });
                // 渲染未定义的其它子模块
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
        projectListEl.innerHTML = `<li>加载项目失败: ${err.message}</li>`;
    }
}

// 在 projectListEl 上添加事件委托
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
    // 事件绑定
    contextMenuEl.querySelector('.rename').onclick = async () => {
        const newName = prompt('输入新项目名', projectName);
        if (newName && newName !== projectName) {
            await ProjectService.renameProject(projectName, newName);
            renderProjectList();
        }
        removeContextMenu();
    };
    contextMenuEl.querySelector('.delete').onclick = async () => {
        const confirmName = prompt(`输入项目名以确认删除: ${projectName}`);
        if (confirmName === projectName) {
            await ProjectService.deleteProject(projectName);
            renderProjectList();
        } else {
            alert('项目名不匹配，未删除');
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
        const name = prompt('新项目名称?');
        if (name) {
            await ProjectService.createProject(name);
            renderProjectList();
        }
    });
}

// 初始化渲染
renderProjectList();