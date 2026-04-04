/**
 * Feishu (Lark) Bot Integration
 *
 * Send messages via Feishu webhook or Bot API.
 */

export interface FeishuConfig {
  /** Webhook URL for simple messaging */
  webhookUrl?: string
  /** App ID for full API access */
  appId?: string
  /** App Secret for full API access */
  appSecret?: string
  /** Default chat ID for notifications */
  chatId?: string
}

export interface FeishuTextMessage {
  msg_type: 'text'
  content: {
    text: string
  }
}

export interface FeishuPostMessage {
  msg_type: 'post'
  content: {
    post: {
      zh_cn?: FeishuPostContent
      en_us?: FeishuPostContent
    }
  }
}

export interface FeishuPostContent {
  title: string
  content: Array<Array<FeishuPostElement>>
}

export type FeishuPostElement =
  | { tag: 'text'; text: string }
  | { tag: 'a'; text: string; href: string }
  | { tag: 'at'; user_id: string }
  | { tag: 'img'; image_key: string }

export type FeishuCardColor = 'blue' | 'wathet' | 'turquoise' | 'green' | 'yellow' | 'orange' | 'red' | 'carmine' | 'violet' | 'purple' | 'indigo' | 'grey'

export interface FeishuCardMessage {
  msg_type: 'interactive'
  card: {
    header?: {
      title: {
        tag: 'plain_text'
        content: string
      }
      template?: FeishuCardColor
    }
    elements: FeishuCardElement[]
  }
}

export type FeishuCardElement =
  | { tag: 'div'; text: { tag: 'plain_text' | 'lark_md'; content: string } }
  | { tag: 'hr' }
  | { tag: 'note'; elements: Array<{ tag: 'plain_text' | 'lark_md'; content: string }> }

export type FeishuMessage = FeishuTextMessage | FeishuPostMessage | FeishuCardMessage

const FEISHU_API = 'https://open.feishu.cn/open-apis'

export class FeishuBot {
  private config: FeishuConfig
  private accessToken: string | null = null
  private tokenExpiry: number = 0

  constructor(config: FeishuConfig) {
    this.config = config
  }

  /**
   * Send a message via webhook.
   */
  async sendWebhook(message: FeishuMessage): Promise<boolean> {
    if (!this.config.webhookUrl) {
      throw new Error('webhookUrl not configured')
    }

    const response = await fetch(this.config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })

    const result = await response.json() as { code: number }
    return result.code === 0
  }

  /**
   * Send a simple text notification.
   */
  async notify(text: string): Promise<boolean> {
    if (this.config.webhookUrl) {
      return this.sendWebhook({
        msg_type: 'text',
        content: { text },
      })
    }

    // Fall back to bot API
    if (this.config.appId && this.config.appSecret && this.config.chatId) {
      return this.sendMessage(this.config.chatId, {
        msg_type: 'text',
        content: { text },
      })
    }

    throw new Error('No webhook URL or app credentials configured')
  }

  /**
   * Send a rich card notification.
   */
  async notifyCard(title: string, content: string, color?: FeishuCardColor): Promise<boolean> {
    const card: FeishuCardMessage = {
      msg_type: 'interactive',
      card: {
        header: {
          title: { tag: 'plain_text', content: title },
          template: color || 'blue',
        },
        elements: [
          { tag: 'div', text: { tag: 'lark_md', content } },
        ],
      },
    }

    if (this.config.webhookUrl) {
      return this.sendWebhook(card)
    }

    if (this.config.appId && this.config.appSecret && this.config.chatId) {
      return this.sendMessage(this.config.chatId, card)
    }

    throw new Error('No webhook URL or app credentials configured')
  }

  /**
   * Get tenant access token for API calls.
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken
    }

    if (!this.config.appId || !this.config.appSecret) {
      throw new Error('appId and appSecret required for API calls')
    }

    const url = `${FEISHU_API}/auth/v3/tenant_access_token/internal`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: this.config.appId,
        app_secret: this.config.appSecret,
      }),
    })

    const result = await response.json() as {
      code: number
      tenant_access_token: string
      expire: number
    }

    if (result.code !== 0) {
      throw new Error('Failed to get access token')
    }

    this.accessToken = result.tenant_access_token
    // Expire 5 minutes early to be safe
    this.tokenExpiry = Date.now() + (result.expire - 300) * 1000

    return this.accessToken
  }

  /**
   * Send a message via bot API.
   */
  async sendMessage(chatId: string, message: FeishuMessage): Promise<boolean> {
    const token = await this.getAccessToken()
    const url = `${FEISHU_API}/im/v1/messages?receive_id_type=chat_id`

    const body = {
      receive_id: chatId,
      msg_type: message.msg_type,
      content: JSON.stringify(message.msg_type === 'interactive' ? message.card : message.content),
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })

    const result = await response.json() as { code: number }
    return result.code === 0
  }

  /**
   * Create a research progress card.
   */
  static createProgressCard(
    stage: string,
    status: 'running' | 'completed' | 'failed',
    details?: string
  ): FeishuCardMessage {
    const colors: Record<string, FeishuCardColor> = {
      running: 'blue',
      completed: 'green',
      failed: 'red',
    }

    const statusEmoji = {
      running: '🔄',
      completed: '✅',
      failed: '❌',
    }

    return {
      msg_type: 'interactive',
      card: {
        header: {
          title: { tag: 'plain_text', content: `${statusEmoji[status]} Research: ${stage}` },
          template: colors[status],
        },
        elements: [
          ...(details ? [{ tag: 'div' as const, text: { tag: 'lark_md' as const, content: details } }] : []),
          { tag: 'hr' as const },
          { tag: 'note' as const, elements: [{ tag: 'plain_text' as const, content: `Status: ${status} | ${new Date().toISOString()}` }] },
        ],
      },
    }
  }
}
