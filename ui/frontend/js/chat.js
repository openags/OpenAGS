// ui/frontend/js/chat.js
import ChatService from './services/chatService.js';

export function initChatTab(container) {
  // Create chat container
  const chatContainer = document.createElement('div');
  chatContainer.classList.add('chat-container', 'fadeIn');
  chatContainer.dataset.tabContent = 'chat';

  // Agent dropdown
  const agentSelect = document.createElement('select');
  agentSelect.classList.add('chat-agent-select');
  agentSelect.innerHTML = '<option value="">Select Agent</option>';

  // Message area
  const messages = document.createElement('div');
  messages.classList.add('chat-messages');

  // Input container
  const inputContainer = document.createElement('div');
  inputContainer.classList.add('chat-input-container');

  // Input box
  const input = document.createElement('input');
  input.type = 'text';
  input.classList.add('chat-input');
  input.placeholder = 'Type your message...';

  // Send button
  const sendButton = document.createElement('button');
  sendButton.classList.add('chat-send');
  sendButton.textContent = 'Send';

  // Error message
  const errorDiv = document.createElement('div');
  errorDiv.classList.add('chat-error');
  errorDiv.style.display = 'none';

  // Append elements
  inputContainer.append(agentSelect, input, sendButton);
  chatContainer.append(messages, inputContainer, errorDiv);
  container.appendChild(chatContainer);

  // Fetch agents
  fetch('http://localhost:8000/agents')
    .then(response => response.json())
    .then(data => {
      data.agents.forEach(agent => {
        const option = document.createElement('option');
        option.value = agent;
        option.textContent = agent;
        agentSelect.appendChild(option);
      });
      agentSelect.value = 'ChatAgent'; // Default to ChatAgent
    })
    .catch(err => {
      errorDiv.textContent = 'Failed to load agents: ' + err.message;
      errorDiv.style.display = 'block';
    });

  // Send message handler
  function sendMessage() {
    const message = input.value.trim();
    const agentType = agentSelect.value;
    if (!message || !agentType) {
      errorDiv.textContent = 'Please enter a message and select an agent.';
      errorDiv.style.display = 'block';
      return;
    }

    // Append user message
    const userMessage = document.createElement('div');
    userMessage.classList.add('chat-message', 'chat-message-user');
    userMessage.textContent = message;
    messages.appendChild(userMessage);
    messages.scrollTop = messages.scrollHeight;

    // Clear input and error
    input.value = '';
    errorDiv.style.display = 'none';

    // Append agent message placeholder
    const agentMessage = document.createElement('div');
    agentMessage.classList.add('chat-message', 'chat-message-agent');
    messages.appendChild(agentMessage);

    // Stream response
    ChatService.streamChat(
      message,
      agentType,
      chunk => {
        agentMessage.textContent += chunk;
        messages.scrollTop = messages.scrollHeight;
      },
      err => {
        errorDiv.textContent = 'Error: ' + err.message;
        errorDiv.style.display = 'block';
      }
    );
  }

  // Event listeners
  sendButton.addEventListener('click', sendMessage);
  input.addEventListener('keypress', e => {
    if (e.key === 'Enter') sendMessage();
  });
}