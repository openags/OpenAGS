// ui/frontend/js/services/chatService.js
class ChatService {
    constructor(baseUrl = 'http://localhost:8000') {
      this.baseUrl = baseUrl;
    }
  
    async streamChat(message, agentType = 'ChatAgent', onMessage, onError) {
      try {
        const response = await fetch(`${this.baseUrl}/chat/${agentType}/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message })
        });
  
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
  
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const content = line.slice(5).trim();
              if (content && content !== '[DONE]') {
                onMessage(content);
              }
            }
          }
        }
      } catch (error) {
        onError(error);
      }
    }
  }
  
  export default new ChatService();