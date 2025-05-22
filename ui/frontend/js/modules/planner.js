export function initPlannerTab(container) {
  const plannerContainer = container.querySelector('.planner-container');
  
  // Initialize task tree 
  initTaskTree();
  
  // Initialize task details
  initTaskDetails();
  
  function initTaskTree() {
    const taskTree = plannerContainer.querySelector('.task-tree');
    // Sample task data
    const tasks = [
      {
        id: 1,
        title: 'Literature Review',
        status: 'in_progress',
        progress: 60,
        subtasks: [
          { id: 11, title: 'Search Related Papers', status: 'completed', progress: 100 },
          { id: 12, title: 'Read and Take Notes', status: 'in_progress', progress: 70 },
          { id: 13, title: 'Organize Key Points', status: 'not_started', progress: 0 }
        ]
      },
      {
        id: 2,
        title: 'Experiment Design',
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
    // Initialize task details interface
  }
}