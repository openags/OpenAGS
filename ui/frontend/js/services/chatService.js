// ui/frontend/js/services/chatService.js
class ChatService {
    constructor(baseUrl = 'http://localhost:8000') {
        this.baseUrl = baseUrl;
    }

    async chat(message, agentType = 'ChatAgent', { stream = false } = {}, onMessage, onError) {
        console.log('[ChatService.chat] URL:', `${this.baseUrl}/agents/chat/${agentType}`);
        console.log('[ChatService.chat] Params:', { message, agentType, stream });
        try {
            const response = await fetch(`${this.baseUrl}/agents/chat/${agentType}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    message,
                    options: { stream }
                })
            });

            if (stream) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    if (chunk && onMessage) onMessage(chunk);
                }
            } else {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                return data.message;
            }
        } catch (error) {
            console.error('[ChatService.chat] Error:', error);
            if (onError) onError(error);
            else throw error;
        }
    }

    async aChat(message, agentType = 'ChatAgent', { stream = true, signal = null } = {}, onMessage, onError) {
        console.log('[ChatService.aChat] URL:', `${this.baseUrl}/agents/chat/${agentType}/async`);
        try {
            const response = await fetch(`${this.baseUrl}/agents/chat/${agentType}/async`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                signal,
                body: JSON.stringify({ 
                    message,
                    options: { stream }
                })
            });

            if (stream) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                try {
                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        const chunk = decoder.decode(value, { stream: true });
                        if (chunk && onMessage) onMessage(chunk);
                    }
                } catch (err) {
                    if (err.name === 'AbortError') {
                        reader.cancel();
                        throw err;
                    }
                }
            } else {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                return data.message;
            }
        } catch (error) {
            console.error('[ChatService.aChat] Error:', error);
            if (onError) onError(error);
            else throw error;
        }
    }
}

export default new ChatService();