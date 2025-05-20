// ui/frontend/js/chat.js
import ChatService from '../services/chatService.js';

// 简化 markdown-it 配置
const md = window.markdownit({
  linkify: true,
  breaks: true
});

export function initChatTab(container) {
  // 先清空 tabContent，防止内容堆叠或空白
  container.innerHTML = '';

  // 创建聊天容器
  const chatContainer = document.createElement('div');
  chatContainer.classList.add('chat-container', 'fadeIn');
  chatContainer.dataset.tabContent = 'chat';

  // 代理选择下拉框
  const agentSelect = document.createElement('select');
  agentSelect.classList.add('chat-agent-select');
  agentSelect.innerHTML = '<option value="">Select Agent</option>';

  // 消息区域
  const messages = document.createElement('div');
  messages.classList.add('chat-messages');

  // 输入容器
  const inputContainer = document.createElement('div');
  inputContainer.classList.add('chat-input-container');

  // 输入框
  const input = document.createElement('input');
  input.type = 'text';
  input.classList.add('chat-input');
  input.placeholder = 'Type your message...';

  // 发送/停止按钮
  const actionButton = document.createElement('button');
  actionButton.classList.add('chat-send');
  actionButton.textContent = 'Send';
  actionButton.dataset.action = 'send';

  // 错误消息
  const errorDiv = document.createElement('div');
  errorDiv.classList.add('chat-error');
  errorDiv.style.display = 'none';

  // 组装元素
  inputContainer.append(agentSelect, input, actionButton);
  chatContainer.append(messages, inputContainer, errorDiv);
  container.appendChild(chatContainer);

  // 获取代理列表
  fetch('http://localhost:8000/agents')
    .then(response => response.json())
    .then(data => {
      data.agents.forEach(agent => {
        const option = document.createElement('option');
        option.value = agent;
        option.textContent = agent;
        agentSelect.appendChild(option);
      });
      agentSelect.value = 'GSAgent'; // 默认选择
    })
    .catch(err => {
      errorDiv.textContent = 'Failed to load agents: ' + err.message;
      errorDiv.style.display = 'block';
    });

  let abortController = null;

  // 切换按钮状态
  function toggleButtonState(state) {
    if (state === 'sending') {
      actionButton.textContent = 'Stop';
      actionButton.dataset.action = 'stop';
      actionButton.classList.add('chat-stop');
      input.disabled = true;
      agentSelect.disabled = true;
    } else {
      actionButton.textContent = 'Send';
      actionButton.dataset.action = 'send';
      actionButton.classList.remove('chat-stop');
      input.disabled = false;
      agentSelect.disabled = false;
    }
  }

  // 获取当前选中项目名
  const projectName = localStorage.getItem('selectedProject') || 'Default';
  const chatHistoryKey = `chat_history_${projectName}`;

  // 渲染历史消息
  function renderHistory() {
    messages.innerHTML = '';
    const history = JSON.parse(localStorage.getItem(chatHistoryKey) || '[]');
    history.forEach(item => {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'chat-message ' + (item.role === 'user' ? 'chat-message-user' : 'chat-message-agent');
      if (item.role === 'user') {
        msgDiv.textContent = item.content;
      } else {
        msgDiv.innerHTML = md.render(item.content);
      }
      messages.appendChild(msgDiv);
    });
    messages.scrollTop = messages.scrollHeight;
  }
  renderHistory();

  async function sendMessage() {
    const message = input.value.trim();
    const agentType = agentSelect.value;
    if (!message || !agentType) {
      errorDiv.textContent = 'Please enter a message and select an agent.';
      errorDiv.style.display = 'block';
      return;
    }

    // Update UI state
    toggleButtonState('sending');
    abortController = new AbortController();

    // Add user message
    const userMessage = document.createElement('div');
    userMessage.classList.add('chat-message', 'chat-message-user');
    userMessage.textContent = message;
    messages.appendChild(userMessage);

    // 保存到历史
    let history = JSON.parse(localStorage.getItem(chatHistoryKey) || '[]');
    history.push({ role: 'user', content: message });
    localStorage.setItem(chatHistoryKey, JSON.stringify(history));

    // Clear input and error
    input.value = '';
    errorDiv.style.display = 'none';

    // Add agent message container
    const agentMessage = document.createElement('div');
    agentMessage.classList.add('chat-message', 'chat-message-agent');
    messages.appendChild(agentMessage);

    // 累积的消息内容
    let fullContent = '';

    try {
      await ChatService.aChat(
        message,
        agentType,
        { stream: true, signal: abortController.signal },
        (chunk) => {
          // 处理数组类型的chunk
          if (Array.isArray(chunk)) {
            chunk = chunk.join('');
          }

          // 追加内容
          fullContent += chunk;
          
          // 渲染markdown
          agentMessage.innerHTML = md.render(fullContent);
          
          // 滚动到底部
          messages.scrollTop = messages.scrollHeight;
        },
        (err) => {
          if (err.name === 'AbortError') {
            console.log('Request aborted');
            return;
          }
          console.error('[ERROR]', err);
          errorDiv.textContent = 'Error: ' + err.message;
          errorDiv.style.display = 'block';
        }
      );
      // 保存 agent 回复到历史
      history = JSON.parse(localStorage.getItem(chatHistoryKey) || '[]');
      history.push({ role: 'agent', content: fullContent });
      localStorage.setItem(chatHistoryKey, JSON.stringify(history));
    } finally {
      toggleButtonState('default');
      abortController = null;
    }
  }

  function handleError(err) {
    if (err.name === 'AbortError') {
      console.log('Request aborted');
      return;
    }
    console.error('[ERROR]', err);
    errorDiv.textContent = 'Error: ' + err.message;
    errorDiv.style.display = 'block';
  }

  // 停止生成
  function stopGeneration() {
    if (abortController) {
      abortController.abort();
    }
  }

  // 事件监听
  actionButton.addEventListener('click', handleButtonClick);
  input.addEventListener('keypress', e => {
    if (e.key === 'Enter' && actionButton.dataset.action === 'send') {
      sendMessage();
    }
  });

  async function handleButtonClick() {
    if (actionButton.dataset.action === 'send') {
      await sendMessage();
    } else {
      stopGeneration();
    }
  }
}