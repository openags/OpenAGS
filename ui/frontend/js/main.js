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
  
    // Tab Switching
    const tabsContainer = document.querySelector('.tabs');
    const tabContent = document.querySelector('.tab-content');
    const homeContent = tabContent.querySelector('.home-container');
  
    function switchTab(tabId) {
      // Clear active tabs
      tabsContainer.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
      tabContent.querySelectorAll('[data-tab-content]').forEach(content => content.remove());
  
      // Add new tab
      const tab = document.createElement('div');
      tab.classList.add('tab', 'active');
      tab.dataset.tab = tabId;
      tab.textContent = tabId === 'chat' ? 'Chat' : tabId === 'references' ? 'References' : 'Home';
      tabsContainer.appendChild(tab);
  
      // Add tab content
      if (tabId === 'chat') {
        // Initialize chat interface
        import('./chat.js').then(module => {
          module.initChatTab(tabContent);
        });
      } else if (tabId === 'references') {
        const content = document.createElement('div');
        content.dataset.tabContent = 'references';
        content.classList.add('fadeIn');
        content.innerHTML = '<h3>References</h3><p>Placeholder for references content.</p>';
        tabContent.appendChild(content);
      } else {
        // Restore home content
        tabContent.appendChild(homeContent);
      }
  
      // Update tab event listeners
      tabsContainer.querySelectorAll('.tab').forEach(t => {
        t.addEventListener('click', () => switchTab(t.dataset.tab));
      });
    }
  
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