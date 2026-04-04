/**
 * Discord Bot Integration
 *
 * Send messages via Discord webhooks or bot API.
 */

export interface DiscordConfig {
  /** Bot token for full API access */
  botToken?: string
  /** Webhook URL for simple messaging */
  webhookUrl?: string
  /** Default channel ID for notifications */
  channelId?: string
}

export interface DiscordEmbed {
  title?: string
  description?: string
  url?: string
  color?: number
  fields?: Array<{
    name: string
    value: string
    inline?: boolean
  }>
  footer?: {
    text: string
    icon_url?: string
  }
  timestamp?: string
}

export interface DiscordMessage {
  content?: string
  embeds?: DiscordEmbed[]
  username?: string
  avatar_url?: string
}

const DISCORD_API = 'https://discord.com/api/v10'

export class DiscordBot {
  private config: DiscordConfig

  constructor(config: DiscordConfig) {
    this.config = config
  }

  /**
   * Send a message via webhook.
   */
  async sendWebhook(message: DiscordMessage): Promise<boolean> {
    if (!this.config.webhookUrl) {
      throw new Error('webhookUrl not configured')
    }

    const response = await fetch(this.config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })

    return response.ok
  }

  /**
   * Send a message to a channel via bot API.
   */
  async sendMessage(channelId: string, message: DiscordMessage): Promise<{ id: string } | null> {
    if (!this.config.botToken) {
      throw new Error('botToken not configured')
    }

    const url = `${DISCORD_API}/channels/${channelId}/messages`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bot ${this.config.botToken}`,
      },
      body: JSON.stringify(message),
    })

    if (!response.ok) return null

    const result = await response.json() as { id: string }
    return result
  }

  /**
   * Send a notification to the default channel.
   */
  async notify(text: string, options?: { embed?: DiscordEmbed }): Promise<boolean> {
    // Prefer webhook if available
    if (this.config.webhookUrl) {
      return this.sendWebhook({
        content: text,
        embeds: options?.embed ? [options.embed] : undefined,
      })
    }

    // Fall back to bot API
    if (this.config.botToken && this.config.channelId) {
      const result = await this.sendMessage(this.config.channelId, {
        content: text,
        embeds: options?.embed ? [options.embed] : undefined,
      })
      return result !== null
    }

    throw new Error('No webhook URL or bot token configured')
  }

  /**
   * Send a rich embed notification.
   */
  async notifyEmbed(embed: DiscordEmbed): Promise<boolean> {
    return this.notify('', { embed })
  }

  /**
   * Create a research progress embed.
   */
  static createProgressEmbed(
    stage: string,
    status: 'running' | 'completed' | 'failed',
    details?: string
  ): DiscordEmbed {
    const colors = {
      running: 0x3498db,  // Blue
      completed: 0x2ecc71, // Green
      failed: 0xe74c3c,   // Red
    }

    return {
      title: `Research Stage: ${stage}`,
      description: details,
      color: colors[status],
      timestamp: new Date().toISOString(),
      footer: {
        text: `Status: ${status}`,
      },
    }
  }

  /**
   * Get bot info.
   */
  async getMe(): Promise<{ id: string; username: string } | null> {
    if (!this.config.botToken) {
      throw new Error('botToken not configured')
    }

    const url = `${DISCORD_API}/users/@me`

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bot ${this.config.botToken}`,
      },
    })

    if (!response.ok) return null

    const result = await response.json() as { id: string; username: string }
    return result
  }

  /**
   * Get channel info.
   */
  async getChannel(channelId: string): Promise<{ id: string; name: string; type: number } | null> {
    if (!this.config.botToken) {
      throw new Error('botToken not configured')
    }

    const url = `${DISCORD_API}/channels/${channelId}`

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bot ${this.config.botToken}`,
      },
    })

    if (!response.ok) return null

    const result = await response.json() as { id: string; name: string; type: number }
    return result
  }
}
