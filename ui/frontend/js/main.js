import './modules/project.js';
import { initChatTab } from './modules/chat.js';
import { initPlannerTab } from './modules/planner.js';
import { initEditorTab } from './modules/editor.js';
import { initBrowserTab } from './modules/browser.js';
import { initReferencesTab } from './modules/references.js';

// ui/frontend/js/main.js
document.addEventListener('DOMContentLoaded', () => {
  // Sidebar Toggle
  const toggleBtn = document.getElementById('toggleSidebar');
  const sidebar = document.querySelector('.sidebar');
  const toggleIcon = toggleBtn.querySelector('i');

  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    toggleIcon.classList.toggle('fa-chevron-left');
    toggleIcon.classList.toggle('fa-chevron-right');
  });

  // Tab切换函数
  function switchTab(tabId) {
    // 移除所有active类
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.remove('active');
    });
    
    // 激活选中的tab
    const selectedTab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    const selectedPane = document.querySelector(`.tab-pane[data-tab-content="${tabId}"]`);
    
    if (selectedTab && selectedPane) {
      selectedTab.classList.add('active');
      selectedPane.classList.add('active');
      
      // 懒加载tab内容
      if (!selectedPane.dataset.initialized) {
        switch (tabId) {
          case 'chat':
            initChatTab(selectedPane);
            break;
          case 'planner':
            initPlannerTab(selectedPane);
            break;
          case 'editor':
            initEditorTab(selectedPane);
            break;
          case 'browser':
            initBrowserTab(selectedPane);
            break;
          case 'references':
            initReferencesTab(selectedPane);
            break;
        }
        selectedPane.dataset.initialized = 'true';
      }
    }
  }

  // 绑定tab点击事件
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      switchTab(tabId);
    });
  });
  
  // 监听子模块点击事件
  document.querySelectorAll('.child-button').forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.dataset.tab;
      if (tabId) switchTab(tabId);
    });
  });

  // 默认显示chat tab
  switchTab('chat');
  
  // 导出switchTab函数供其他模块使用
  window.switchTab = switchTab;
});