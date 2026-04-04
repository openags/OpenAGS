/**
 * Telegram Bot Integration
 *
 * Send messages and receive updates via Telegram Bot API.
 */

export interface TelegramConfig {
  botToken: string
  /** Default chat ID for notifications */
  chatId?: string | number
}

export interface TelegramMessage {
  chat_id: string | number
  text: string
  parse_mode?: 'MarkdownV2' | 'HTML' | 'Markdown'
  disable_notification?: boolean
  reply_to_message_id?: number
}

export interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from?: {
      id: number
      username?: string
      first_name?: string
    }
    chat: {
      id: number
      type: string
      title?: string
    }
    date: number
    text?: string
  }
}

const TELEGRAM_API = 'https://api.telegram.org'

export class TelegramBot {
  private config: TelegramConfig

  constructor(config: TelegramConfig) {
    this.config = config
  }

  /**
   * Send a text message.
   */
  async sendMessage(message: TelegramMessage): Promise<{ ok: boolean; message_id?: number }> {
    const url = `${TELEGRAM_API}/bot${this.config.botToken}/sendMessage`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })

    const result = await response.json() as { ok: boolean; result?: { message_id: number } }

    return {
      ok: result.ok,
      message_id: result.result?.message_id,
    }
  }

  /**
   * Send a notification to the default chat.
   */
  async notify(text: string, options?: { parseMode?: 'MarkdownV2' | 'HTML' }): Promise<boolean> {
    if (!this.config.chatId) {
      throw new Error('chatId not configured')
    }

    const result = await this.sendMessage({
      chat_id: this.config.chatId,
      text,
      parse_mode: options?.parseMode,
    })

    return result.ok
  }

  /**
   * Get recent updates (for polling).
   */
  async getUpdates(options?: { offset?: number; limit?: number; timeout?: number }): Promise<TelegramUpdate[]> {
    const url = new URL(`${TELEGRAM_API}/bot${this.config.botToken}/getUpdates`)

    if (options?.offset) url.searchParams.set('offset', String(options.offset))
    if (options?.limit) url.searchParams.set('limit', String(options.limit))
    if (options?.timeout) url.searchParams.set('timeout', String(options.timeout))

    const response = await fetch(url.toString())
    const result = await response.json() as { ok: boolean; result: TelegramUpdate[] }

    return result.ok ? result.result : []
  }

  /**
   * Set a webhook URL for receiving updates.
   */
  async setWebhook(url: string): Promise<boolean> {
    const apiUrl = `${TELEGRAM_API}/bot${this.config.botToken}/setWebhook`

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })

    const result = await response.json() as { ok: boolean }
    return result.ok
  }

  /**
   * Delete the webhook.
   */
  async deleteWebhook(): Promise<boolean> {
    const url = `${TELEGRAM_API}/bot${this.config.botToken}/deleteWebhook`

    const response = await fetch(url, { method: 'POST' })
    const result = await response.json() as { ok: boolean }
    return result.ok
  }

  /**
   * Get bot info.
   */
  async getMe(): Promise<{ id: number; username: string; first_name: string } | null> {
    const url = `${TELEGRAM_API}/bot${this.config.botToken}/getMe`

    const response = await fetch(url)
    const result = await response.json() as { ok: boolean; result?: { id: number; username: string; first_name: string } }

    return result.ok ? result.result! : null
  }

  /**
   * Send a document.
   */
  async sendDocument(
    chatId: string | number,
    document: Buffer | string,
    options?: { filename?: string; caption?: string }
  ): Promise<boolean> {
    const url = `${TELEGRAM_API}/bot${this.config.botToken}/sendDocument`

    const formData = new FormData()
    formData.append('chat_id', String(chatId))

    if (typeof document === 'string') {
      // URL to document
      formData.append('document', document)
    } else {
      // Buffer
      const blob = new Blob([document])
      formData.append('document', blob, options?.filename || 'document')
    }

    if (options?.caption) {
      formData.append('caption', options.caption)
    }

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    })

    const result = await response.json() as { ok: boolean }
    return result.ok
  }
}
