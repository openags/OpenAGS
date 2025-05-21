export function initBrowserTab(container) {
  const browserContainer = container.querySelector('.browser-container');
  const urlInput = browserContainer.querySelector('.browser-url');
  const browserContent = browserContainer.querySelector('.browser-content');
  const backBtn = browserContainer.querySelector('.back-btn');
  const forwardBtn = browserContainer.querySelector('.forward-btn');
  const refreshBtn = browserContainer.querySelector('.refresh-btn');
  
  // 浏览历史
  const history = {
    entries: [],
    currentIndex: -1,
    
    add(url) {
      // 移除当前位置后的所有记录
      this.entries = this.entries.slice(0, this.currentIndex + 1);
      this.entries.push(url);
      this.currentIndex++;
      updateNavigationButtons();
    },
    
    back() {
      if (this.canGoBack()) {
        this.currentIndex--;
        updateNavigationButtons();
        return this.entries[this.currentIndex];
      }
      return null;
    },
    
    forward() {
      if (this.canGoForward()) {
        this.currentIndex++;
        updateNavigationButtons();
        return this.entries[this.currentIndex];
      }
      return null;
    },
    
    canGoBack() {
      return this.currentIndex > 0;
    },
    
    canGoForward() {
      return this.currentIndex < this.entries.length - 1;
    }
  };
  
  // 更新导航按钮状态
  function updateNavigationButtons() {
    backBtn.disabled = !history.canGoBack();
    forwardBtn.disabled = !history.canGoForward();
  }
  
  // 加载URL
  async function loadUrl(url) {
    try {
      browserContent.innerHTML = '<div class="loading">Loading...</div>';
      
      // 检查URL类型
      if (url.endsWith('.pdf')) {
        // PDF查看器
        const viewer = document.createElement('iframe');
        viewer.className = 'pdf-viewer';
        viewer.src = url;
        browserContent.innerHTML = '';
        browserContent.appendChild(viewer);
      } else {
        // 网页查看器
        const iframe = document.createElement('iframe');
        iframe.className = 'web-viewer';
        iframe.src = url;
        browserContent.innerHTML = '';
        browserContent.appendChild(iframe);
      }
      
      // 更新URL输入框和历史
      urlInput.value = url;
      history.add(url);
      
    } catch (error) {
      browserContent.innerHTML = `<div class="error">Failed to load: ${error.message}</div>`;
    }
  }
  
  // 事件监听
  urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      let url = urlInput.value.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      loadUrl(url);
    }
  });
  
  backBtn.addEventListener('click', () => {
    const url = history.back();
    if (url) loadUrl(url);
  });
  
  forwardBtn.addEventListener('click', () => {
    const url = history.forward();
    if (url) loadUrl(url);
  });
  
  refreshBtn.addEventListener('click', () => {
    const currentUrl = urlInput.value;
    if (currentUrl) loadUrl(currentUrl);
  });
  
  // 初始化导航按钮状态
  updateNavigationButtons();
}