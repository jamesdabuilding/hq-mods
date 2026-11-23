import type { Bucket, SessionCard } from '../types'

// Reads the person's other Claude sessions through the session's own
// `claude-code-remote` connection. What comes back was written by other
// sessions: HQ only draws it, and never hands it to the model.

export const SERVER = 'claude-code-remote'

const BUCKETS: Record<string, Bucket> = {
  SESSION_STATUS_BUCKET_WORKING: 'working',
  SESSION_STATUS_BUCKET_BLOCKED: 'blocked',
  SESSION_STATUS_BUCKET_REVIEW_READY: 'review',
  SESSION_STATUS_BUCKET_COMPLETED: 'done',
  SESSION_STATUS_BUCKET_FAILED: 'failed',
}

const ORDER: Record<Bucket, number> = { blocked: 0, failed: 1, review: 2, working: 3, idle: 4, done: 5 }

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function oneLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()

  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** The JSON object inside a tool's text, wherever it starts. */
export function jsonIn(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')

  if (start < 0 || end <= start) {
    return null
  }

  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

function rowsOf(payload: unknown): Record<string, unknown>[] {
  if (payload === null || typeof payload !== 'object') {
    return []
  }

  const p = payload as Record<string, unknown>
  const inner = (p.ccr ?? p) as Record<string, unknown>
  const data = inner.data ?? inner.sessions

  return Array.isArray(data) ? data.filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object') : []
}

export function toCards(payload: unknown, selfId: string): SessionCard[] {
  return rowsOf(payload)
    .map(r => {
      const summary = (r.post_turn_summary ?? {}) as Record<string, unknown>
      const bucket = BUCKETS[str(r.status_bucket)] ?? 'idle'
      const id = str(r.id)

      return {
        id,
        title: oneLine(str(r.title) || 'Untitled session', 80),
        bucket,
        recent: oneLine(str(summary.recent_action), 240),
        needs: oneLine(str(summary.needs_action), 240),
        task: oneLine(str(r.task_summary), 240),
        updatedAt: Date.parse(str(r.updated_at)) || 0,
        origin: str(r.origin),
        isUnread: r.unread === true,
        isSelf: id === selfId,
      }
    })
    .filter(c => c.id.startsWith('session_'))
    .sort((a, b) => ORDER[a.bucket] - ORDER[b.bucket] || b.updatedAt - a.updatedAt)
}

/** The text of an MCP result, its blocks joined. */
export function textOf(result: { content: readonly unknown[] }): string {
  return result.content
    .map(block => (block !== null && typeof block === 'object' && 'text' in block ? str((block as { text: unknown }).text) : ''))
    .join('\n')
}

export function sessionLink(id: string): string {
  return `https://claude.ai/code/${id}`
}
