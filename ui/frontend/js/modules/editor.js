export function initEditorTab(container) {
  const editorContainer = container.querySelector('.editor-container');
  
  // 初始化文件树
  initFileExplorer();
  
  // 初始化编辑器标签页和内容
  initEditor();
  
  function initFileExplorer() {
    const fileTree = editorContainer.querySelector('.file-tree');
    
    // 示例文件结构
    const files = [
      {
        name: 'src',
        type: 'folder',
        children: [
          { name: 'main.py', type: 'file' },
          { name: 'utils.py', type: 'file' }
        ]
      },
      {
        name: 'docs',
        type: 'folder',
        children: [
          { name: 'readme.md', type: 'file' },
          { name: 'api.md', type: 'file' }
        ]
      },
      { name: 'requirements.txt', type: 'file' }
    ];
    
    renderFileTree(fileTree, files);
  }
  
  function renderFileTree(container, files) {
    const ul = document.createElement('ul');
    ul.className = 'file-list';
    
    files.forEach(file => {
      const li = document.createElement('li');
      li.className = 'file-item';
      
      const icon = file.type === 'folder' ? 'fa-folder' : 'fa-file-code';
      li.innerHTML = `
        <div class="file-item-content">
          <i class="fas ${icon}"></i>
          <span class="file-name">${file.name}</span>
        </div>
      `;
      
      if (file.type === 'folder' && file.children) {
        renderFileTree(li, file.children);
      }
      
      // 添加点击事件
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        if (file.type === 'file') {
          openFile(file.name);
        } else {
          li.classList.toggle('expanded');
        }
      });
      
      ul.appendChild(li);
    });
    
    container.appendChild(ul);
  }
  
  function initEditor() {
    const editorTabs = editorContainer.querySelector('.editor-tabs');
    const editorContent = editorContainer.querySelector('.editor-content');
    
    // 添加标签页
    function addEditorTab(filename) {
      const tab = document.createElement('div');
      tab.className = 'editor-tab';
      tab.innerHTML = `
        <span>${filename}</span>
        <i class="fas fa-times"></i>
      `;
      
      tab.addEventListener('click', () => {
        // 切换活动标签页
        editorTabs.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        // 加载文件内容
        loadFileContent(filename);
      });
      
      // 关闭标签页
      tab.querySelector('.fa-times').addEventListener('click', (e) => {
        e.stopPropagation();
        closeEditorTab(tab, filename);
      });
      
      editorTabs.appendChild(tab);
      tab.click(); // 自动激活新标签页
    }
    
    function closeEditorTab(tab, filename) {
      tab.remove();
      // 如果还有其他标签页，激活第一个
      const remainingTabs = editorTabs.querySelectorAll('.editor-tab');
      if (remainingTabs.length > 0) {
        remainingTabs[0].click();
      } else {
        editorContent.innerHTML = ''; // 清空编辑器内容
      }
    }
  }
  
  function loadFileContent(filename) {
    // 这里应该从后端加载文件内容
    const editorContent = editorContainer.querySelector('.editor-content');
    editorContent.innerHTML = `<div class="loading">Loading ${filename}...</div>`;
  }
  
  function openFile(filename) {
    // 检查文件是否已经打开
    const existingTab = Array.from(editorContainer.querySelectorAll('.editor-tab'))
      .find(tab => tab.querySelector('span').textContent === filename);
      
    if (existingTab) {
      existingTab.click(); // 切换到已打开的标签页
    } else {
      initEditor(filename); // 打开新标签页
    }
  }
}