export function initPlannerTab(container) {
  const plannerContainer = container.querySelector('.planner-container');
  
  // 初始化任务树
  initTaskTree();
  
  // 初始化任务详情
  initTaskDetails();
  
  function initTaskTree() {
    const taskTree = plannerContainer.querySelector('.task-tree');
    // 示例任务数据
    const tasks = [
      {
        id: 1,
        title: '文献综述',
        status: 'in_progress',
        progress: 60,
        subtasks: [
          { id: 11, title: '搜索相关论文', status: 'completed', progress: 100 },
          { id: 12, title: '阅读和笔记', status: 'in_progress', progress: 70 },
          { id: 13, title: '整理主要观点', status: 'not_started', progress: 0 }
        ]
      },
      {
        id: 2,
        title: '实验设计',
        status: 'not_started',
        progress: 0,
        subtasks: []
      }
    ];
    
    renderTaskTree(taskTree, tasks);
  }
  
  function renderTaskTree(container, tasks) {
    const ul = document.createElement('ul');
    ul.className = 'task-list';
    
    tasks.forEach(task => {
      const li = document.createElement('li');
      li.className = 'task-item';
      li.innerHTML = `
        <div class="task-header">
          <span class="task-title">${task.title}</span>
          <span class="task-progress">${task.progress}%</span>
        </div>
      `;
      
      if (task.subtasks && task.subtasks.length > 0) {
        renderTaskTree(li, task.subtasks);
      }
      
      ul.appendChild(li);
    });
    
    container.appendChild(ul);
  }
  
  function initTaskDetails() {
    const taskDetails = plannerContainer.querySelector('.task-details');
    // 初始化任务详情界面
  }
}