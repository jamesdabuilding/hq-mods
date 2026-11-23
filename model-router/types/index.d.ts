export type Tier = 'light' | 'standard' | 'heavy' | 'follow'

export type Decision = {
  turnId: string
  tier: Tier
  /** The alias the turn runs on, or '' for the session's own model. */
  model: string
  why: string
  at: number
  /** Set once the turn's first request named the session's model. */
  isResolved: boolean
}

export type Ctx = { tokens: number; lastStepAt: number; lastFamily: string }

export type RouterStats = {
  turns: number
  lighterTurns: number
  agents: number
  lighterAgents: number
  keptForCache: number
  /** Input+output tokens answered, by model family. */
  tokensByFamily: Record<string, number>
}

export type Usage = { usd: number; hasCost: boolean; planPercent: number; planKind: string }

declare module 'claude-code' {
  interface PluginState {
    'model-router': {
      mode: string
      pin: string
      decision: Shaped<Decision | null>
      ctx: Shaped<Ctx>
      stats: Shaped<RouterStats>
      usage: Shaped<Usage | null>
      isQuiet: boolean
    }
  }
}
