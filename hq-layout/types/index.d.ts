export type View = 'home' | 'today' | 'needs' | 'sessions' | 'metrics' | 'workflows'

export type FeedItem = {
  id: string
  /** What kind of signal: Prompt, Edit, Command, Research, Agent, Turn */
  kind: string
  title: string
  evidence: string
  detail: string
  at: number
}

export type Todo = { id: string; content: string; status: 'pending' | 'in_progress' | 'completed' }

export type Run = { id: string; tool: string; label: string; state: 'running' | 'done' | 'error'; at: number }

export type Stats = {
  prompts: number
  turns: number
  tools: number
  edits: number
  commands: number
  errors: number
  startedAt: number
  byTool: Record<string, number>
}

export type Bucket = 'working' | 'blocked' | 'review' | 'done' | 'failed' | 'idle'

/** One of the person's other Claude sessions, as HQ shows it. Display-only: never sent to the model. */
export type SessionCard = {
  id: string
  title: string
  bucket: Bucket
  /** What it did last, one line. */
  recent: string
  /** What it needs from the person, one line, or ''. */
  needs: string
  task: string
  updatedAt: number
  origin: string
  isUnread: boolean
  isSelf: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'hq-layout': {
      view: View
      feed: Shaped<FeedItem[]>
      feedIndex: number
      showDetail: boolean
      todos: Shaped<Todo[]>
      runs: Shaped<Run[]>
      stats: Shaped<Stats>
      dismissed: string[]
      now: number
      sessions: Shaped<SessionCard[]>
      sessionsAt: number
      sessionsError: string
      selfId: string
      sent: Record<string, string>
    }
  }
}
