/** The cache-tax status fields warm-watch reads. */
export type CacheTaxSeen = { keepwarm: 'on' | 'stopped' | 'off'; leftMs: number; cold: boolean | null }

declare module 'claude-code' {
  interface PluginState {
    'warm-watch': {
      /** When the main conversation's last model request finished, epoch ms. */
      lastAt: number
      /** The context that request was answered over, in tokens. */
      tokens: number
      /** The lastAt an alert was already raised for. */
      alertedFor: number
      now: number
      surface: string
    }
  }
}

