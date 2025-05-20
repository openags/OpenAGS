import './modules/project.js';
import './modules/chat.js';


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
  
    // Project Expand/Collapse
    const projectButtons = document.querySelectorAll('.project-button');
    projectButtons.forEach(button => {
      button.addEventListener('click', () => {
        const projectItem = button.closest('.project-item');
        const isExpanded = projectItem.classList.contains('expanded');
        const arrow = button.querySelector('.project-arrow');
        projectItem.classList.toggle('expanded');
        arrow.classList.toggle('fa-chevron-down', !isExpanded);
        arrow.classList.toggle('fa-chevron-right', isExpanded);
      });
    });
  
    // 固定 tabs: Home, Chat, References
    const tabsContainer = document.querySelector('.tabs');
    const tabContent = document.querySelector('.tab-content');
    const homeContent = tabContent.querySelector('.home-container');

    // 清空并重建 tabs
    tabsContainer.innerHTML = '';
    const tabList = [
        { id: 'home', label: 'Home' },
        { id: 'chat', label: 'Chat' },
        { id: 'references', label: 'References' }
    ];
    tabList.forEach((tabInfo, idx) => {
        const tab = document.createElement('div');
        tab.className = 'tab' + (idx === 0 ? ' active' : '');
        tab.dataset.tab = tabInfo.id;
        tab.textContent = tabInfo.label;
        tab.addEventListener('click', () => switchTab(tabInfo.id));
        tabsContainer.appendChild(tab);
    });

    // 切换 tab 的函数，暴露到 window 方便外部调用
    function switchTab(tabId) {
      let tab = tabsContainer.querySelector(`.tab[data-tab="${tabId}"]`);
      let content = tabContent.querySelector(`[data-tab-content="${tabId}"]`);
      tabsContainer.querySelectorAll('.tab').forEach(tabEl => tabEl.classList.remove('active'));
      if (tab) tab.classList.add('active');
      tabContent.querySelectorAll('[data-tab-content]').forEach(contentEl => {
        if (!content || contentEl !== content) contentEl.remove();
      });
      if (!content) {
        if (tabId === 'chat') {
          import('./modules/chat.js').then(module => {
            module.initChatTab(tabContent);
          });
        } else if (tabId === 'references') {
          content = document.createElement('div');
          content.dataset.tabContent = 'references';
          content.classList.add('fadeIn');
          content.innerHTML = '<h3>References</h3><p>Placeholder for references content.</p>';
          tabContent.appendChild(content);
        } else {
          tabContent.appendChild(homeContent);
        }
      } else {
        tabContent.appendChild(content);
      }
    }
    window.switchTab = switchTab; // 供外部调用

    // 默认显示 Chat
    switchTab('chat');

    // Child Button Clicks (e.g., General Chat)
    const childButtons = document.querySelectorAll('.child-button');
    childButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabId = button.dataset.tab;
        if (tabId) {
          childButtons.forEach(btn => btn.classList.remove('active'));
          button.classList.add('active');
          switchTab(tabId);
        }
      });
    });
  
    // Suggestion Items to Search Input
    const suggestionItems = document.querySelectorAll('.suggestion-item');
    const searchInput = document.querySelector('.search-input');
    suggestionItems.forEach(item => {
      item.addEventListener('click', () => {
        const text = item.querySelector('.suggestion-text').textContent;
        searchInput.value = text;
        searchInput.focus();
      });
    });
  });