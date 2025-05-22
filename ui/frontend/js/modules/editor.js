export function initEditorTab(container) {
  const editorContainer = container.querySelector('.editor-container');
  
  // Initialize file tree
  initFileExplorer();
  
  // Initialize editor tabs and content
  initEditor();
  
  function initFileExplorer() {
    const fileTree = editorContainer.querySelector('.file-tree');
    
    // Example file structure
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
      
      // Add click event
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
    
    // Add tab
    function addEditorTab(filename) {
      const tab = document.createElement('div');
      tab.className = 'editor-tab';
      tab.innerHTML = `
        <span>${filename}</span>
        <i class="fas fa-times"></i>
      `;
      
      tab.addEventListener('click', () => {
        // Switch active tab
        editorTabs.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        // Load file content
        loadFileContent(filename);
      });
      
      // Close tab
      tab.querySelector('.fa-times').addEventListener('click', (e) => {
        e.stopPropagation();
        closeEditorTab(tab, filename);
      });
      
      editorTabs.appendChild(tab);
      tab.click(); // Auto activate new tab
    }
    
    function closeEditorTab(tab, filename) {
      tab.remove();
      // If there are other tabs, activate the first one
      const remainingTabs = editorTabs.querySelectorAll('.editor-tab');
      if (remainingTabs.length > 0) {
        remainingTabs[0].click();
      } else {
        editorContent.innerHTML = ''; // Clear editor content
      }
    }
  }
  
  function loadFileContent(filename) {
    // Here should load file content from backend
    const editorContent = editorContainer.querySelector('.editor-content');
    editorContent.innerHTML = `<div class="loading">Loading ${filename}...</div>`;
  }
  
  function openFile(filename) {
    // Check if file is already open
    const existingTab = Array.from(editorContainer.querySelectorAll('.editor-tab'))
      .find(tab => tab.querySelector('span').textContent === filename);
      
    if (existingTab) {
      existingTab.click(); // Switch to opened tab
    } else {
      initEditor(filename); // Open new tab
    }
  }
}