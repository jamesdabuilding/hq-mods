export type AgentRow = {
  id: string
  title: string
  type: string
  model: string
  status: 'pending' | 'running' | 'waiting' | 'idle' | 'completed' | 'failed' | 'killed' | 'stopped'
  startedAt: number
  endedAt: number
  /** The agent's own latest progress summary, else its task. */
  label: string
  /** What it is doing right now, from its latest tool call. */
  activity: string
  tools: number
  /** Tool calls an agent of this type usually takes, learned across sessions. */
  expected: number
  tokens: number
  usd: number
}

declare module 'claude-code' {
  interface PluginState {
    'agent-deck': {
      agents: Shaped<AgentRow[]>
      now: number
      hasOpened: boolean
    }
  }
}
