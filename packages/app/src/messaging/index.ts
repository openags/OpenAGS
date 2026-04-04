/**
 * Messaging Router — unified interface for all notification platforms
 */

import { TelegramBot, TelegramConfig } from './telegram.js'
import { DiscordBot, DiscordConfig } from './discord.js'
import { FeishuBot, FeishuConfig } from './feishu.js'

export interface MessagingConfig {
  telegram?: TelegramConfig
  discord?: DiscordConfig
  feishu?: FeishuConfig
  /** Default platforms to send to */
  defaultPlatforms?: Array<'telegram' | 'discord' | 'feishu'>
}

export interface NotificationOptions {
  /** Override default platforms */
  platforms?: Array<'telegram' | 'discord' | 'feishu'>
  /** For Discord: embed color */
  color?: number
  /** For Feishu: card template color */
  template?: 'blue' | 'green' | 'red' | 'yellow' | 'orange'
}

export class MessagingRouter {
  private telegram: TelegramBot | null = null
  private discord: DiscordBot | null = null
  private feishu: FeishuBot | null = null
  private defaultPlatforms: Array<'telegram' | 'discord' | 'feishu'>

  constructor(config: MessagingConfig) {
    if (config.telegram?.botToken) {
      this.telegram = new TelegramBot(config.telegram)
    }

    if (config.discord?.botToken || config.discord?.webhookUrl) {
      this.discord = new DiscordBot(config.discord)
    }

    if (config.feishu?.webhookUrl || config.feishu?.appId) {
      this.feishu = new FeishuBot(config.feishu)
    }

    this.defaultPlatforms = config.defaultPlatforms || ['telegram', 'discord', 'feishu']
  }

  /**
   * Send a text notification to configured platforms.
   */
  async notify(text: string, options?: NotificationOptions): Promise<Record<string, boolean>> {
    const platforms = options?.platforms || this.defaultPlatforms
    const results: Record<string, boolean> = {}

    const promises: Promise<void>[] = []

    if (platforms.includes('telegram') && this.telegram) {
      promises.push(
        this.telegram.notify(text)
          .then(ok => { results.telegram = ok })
          .catch(() => { results.telegram = false })
      )
    }

    if (platforms.includes('discord') && this.discord) {
      promises.push(
        this.discord.notify(text)
          .then(ok => { results.discord = ok })
          .catch(() => { results.discord = false })
      )
    }

    if (platforms.includes('feishu') && this.feishu) {
      promises.push(
        this.feishu.notify(text)
          .then(ok => { results.feishu = ok })
          .catch(() => { results.feishu = false })
      )
    }

    await Promise.all(promises)
    return results
  }

  /**
   * Send a research progress notification.
   */
  async notifyProgress(
    stage: string,
    status: 'running' | 'completed' | 'failed',
    details?: string,
    options?: NotificationOptions
  ): Promise<Record<string, boolean>> {
    const platforms = options?.platforms || this.defaultPlatforms
    const results: Record<string, boolean> = {}

    const promises: Promise<void>[] = []

    // Telegram: plain text with emoji
    if (platforms.includes('telegram') && this.telegram) {
      const emoji = status === 'running' ? '🔄' : status === 'completed' ? '✅' : '❌'
      const text = `${emoji} *Research: ${stage}*\nStatus: ${status}${details ? `\n\n${details}` : ''}`

      promises.push(
        this.telegram.notify(text, { parseMode: 'MarkdownV2' })
          .then(ok => { results.telegram = ok })
          .catch(() => { results.telegram = false })
      )
    }

    // Discord: embed
    if (platforms.includes('discord') && this.discord) {
      const embed = DiscordBot.createProgressEmbed(stage, status, details)

      promises.push(
        this.discord.notifyEmbed(embed)
          .then(ok => { results.discord = ok })
          .catch(() => { results.discord = false })
      )
    }

    // Feishu: card
    if (platforms.includes('feishu') && this.feishu) {
      const card = FeishuBot.createProgressCard(stage, status, details)

      promises.push(
        this.feishu.sendWebhook(card)
          .then(ok => { results.feishu = ok })
          .catch(() => { results.feishu = false })
      )
    }

    await Promise.all(promises)
    return results
  }

  /**
   * Check which platforms are configured.
   */
  getConfiguredPlatforms(): Array<'telegram' | 'discord' | 'feishu'> {
    const platforms: Array<'telegram' | 'discord' | 'feishu'> = []
    if (this.telegram) platforms.push('telegram')
    if (this.discord) platforms.push('discord')
    if (this.feishu) platforms.push('feishu')
    return platforms
  }

  /**
   * Test connectivity to all configured platforms.
   */
  async testConnections(): Promise<Record<string, { ok: boolean; error?: string }>> {
    const results: Record<string, { ok: boolean; error?: string }> = {}

    if (this.telegram) {
      try {
        const me = await this.telegram.getMe()
        results.telegram = me ? { ok: true } : { ok: false, error: 'Failed to get bot info' }
      } catch (err) {
        results.telegram = { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
      }
    }

    if (this.discord) {
      try {
        const me = await this.discord.getMe()
        results.discord = me ? { ok: true } : { ok: false, error: 'Failed to get bot info' }
      } catch (err) {
        results.discord = { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
      }
    }

    if (this.feishu) {
      // Feishu doesn't have a simple "get me" — just mark as configured
      results.feishu = { ok: true }
    }

    return results
  }
}

export { TelegramBot, TelegramConfig } from './telegram.js'
export { DiscordBot, DiscordConfig } from './discord.js'
export { FeishuBot, FeishuConfig } from './feishu.js'
