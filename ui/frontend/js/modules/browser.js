export function initBrowserTab(container) {
  const browserContainer = container.querySelector('.browser-container');
  const urlInput = browserContainer.querySelector('.browser-url');
  const browserContent = browserContainer.querySelector('.browser-content');
  const backBtn = browserContainer.querySelector('.back-btn');
  const forwardBtn = browserContainer.querySelector('.forward-btn');
  const refreshBtn = browserContainer.querySelector('.refresh-btn');
  
  // Browsing history
  const history = {
    entries: [],
    currentIndex: -1,
    
    add(url) {
      // Remove all entries after current position
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
  
  // Update navigation button states
  function updateNavigationButtons() {
    backBtn.disabled = !history.canGoBack();
    forwardBtn.disabled = !history.canGoForward();
  }
  
  // Load URL
  async function loadUrl(url) {
    try {
      browserContent.innerHTML = '<div class="loading">Loading...</div>';
      
      // Check URL type
      if (url.endsWith('.pdf')) {
        // PDF viewer
        const viewer = document.createElement('iframe');
        viewer.className = 'pdf-viewer';
        viewer.src = url;
        browserContent.innerHTML = '';
        browserContent.appendChild(viewer);
      } else {
        // Web viewer
        const iframe = document.createElement('iframe');
        iframe.className = 'web-viewer';
        iframe.src = url;
        browserContent.innerHTML = '';
        browserContent.appendChild(iframe);
      }
      
      // Update URL input and history
      urlInput.value = url;
      history.add(url);
      
    } catch (error) {
      browserContent.innerHTML = `<div class="error">Failed to load: ${error.message}</div>`;
    }
  }

  // Event listeners
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
  
  // Initialize navigation button states
  updateNavigationButtons();
}