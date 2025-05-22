// ui/frontend/js/chat.js
import ChatService from '../services/chatService.js';

// Simplify markdown-it configuration
const md = window.markdownit({
  linkify: true,
  breaks: true
});

export function initChatTab(container) {
  // Clear tabContent to prevent content stacking or blank spaces
  container.innerHTML = '';

  // Create chat container
  const chatContainer = document.createElement('div');
  chatContainer.classList.add('chat-container', 'fadeIn');
  chatContainer.dataset.tabContent = 'chat';

  // Agent selection dropdown
  const agentSelect = document.createElement('select');
  agentSelect.classList.add('chat-agent-select');
  agentSelect.innerHTML = '<option value="">Select Agent</option>';

  // Message area
  const messages = document.createElement('div');
  messages.classList.add('chat-messages');

  // Input container
  const inputContainer = document.createElement('div');
  inputContainer.classList.add('chat-input-container');

  // Input field
  const input = document.createElement('input');
  input.type = 'text';
  input.classList.add('chat-input');
  input.placeholder = 'Type your message...';

  // Send/Stop button
  const actionButton = document.createElement('button');
  actionButton.classList.add('chat-send');
  actionButton.textContent = 'Send';
  actionButton.dataset.action = 'send';

  // Error message
  const errorDiv = document.createElement('div');
  errorDiv.classList.add('chat-error');
  errorDiv.style.display = 'none';

  // Assemble elements
  inputContainer.append(agentSelect, input, actionButton);
  chatContainer.append(messages, inputContainer, errorDiv);
  container.appendChild(chatContainer);

  // Fetch agent list
  fetch('http://localhost:8000/agents')
    .then(response => response.json())
    .then(data => {
      data.agents.forEach(agent => {
        const option = document.createElement('option');
        option.value = agent;
        option.textContent = agent;
        agentSelect.appendChild(option);
      });
      agentSelect.value = 'GSAgent'; // Default selection
    })
    .catch(err => {
      errorDiv.textContent = 'Failed to load agents: ' + err.message;
      errorDiv.style.display = 'block';
    });

  let abortController = null;

  // Toggle button state
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

  // Get current selected project name
  const projectName = localStorage.getItem('selectedProject') || 'Default';
  const chatHistoryKey = `chat_history_${projectName}`;

  // Render message history
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

    // Save to history
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

    // Accumulated message content
    let fullContent = '';

    try {
      await ChatService.aChat(
        message,
        agentType,
        { stream: true, signal: abortController.signal },
        (chunk) => {
          // Handle array type chunks
          if (Array.isArray(chunk)) {
            chunk = chunk.join('');
          }

          // Append content
          fullContent += chunk;
          
          // Render markdown
          agentMessage.innerHTML = md.render(fullContent);
          
          // Scroll to bottom
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
      // Save agent reply to history
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

  // Stop generation
  function stopGeneration() {
    if (abortController) {
      abortController.abort();
    }
  }

  // Event listeners
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