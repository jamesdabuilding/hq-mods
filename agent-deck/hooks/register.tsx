import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, Register } from 'claude-code'

import type { AgentRow } from '../types'

const PANE = 'agents'
const DEFAULT_EXPECTED = 12

const agents = atom({ plugin: 'agent-deck', key: 'agents' } as const, [] as AgentRow[], { shape: 'agents-1' })
const now = atom({ plugin: 'agent-deck', key: 'now' } as const, 0)
const hasOpened = atom({ plugin: 'agent-deck', key: 'hasOpened' } as const, false)

const LIVE = new Set<AgentRow['status']>(['pending', 'running', 'waiting'])
const isLive = (row: AgentRow): boolean => LIVE.has(row.status)

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function clip(s: string, max: number): string {
  const one = s.replace(/\s+/g, ' ').trim()

  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

function base(path: string): string {
  return path.split('/').filter(Boolean).slice(-2).join('/')
}

/** claude-haiku-5-5 → Haiku 5.5 */
export function shortModel(id: string): string {
  const m = /(opus|sonnet|haiku|fable)(?:[-_ ](\d+))?(?:[-_.](\d+))?/i.exec(id)

  if (m === null) {
    return id === '' ? '—' : id
  }

  const name = `${m[1]?.slice(0, 1).toUpperCase() ?? ''}${m[1]?.slice(1).toLowerCase() ?? ''}`

  return [name, [m[2], m[3]].filter(Boolean).join('.')].filter(Boolean).join(' ')
}

function span(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))

  if (s < 60) {
    return `${s}s`
  }
  if (s < 3600) {
    return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
  }

  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
}

function tokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n)
}

/** What a tool call is doing, in a few words. */
function activityOf(tool: string, a: Record<string, unknown>): string {
  const path = str(a.file_path) || str(a.notebook_path) || str(a.path)

  switch (tool) {
    case 'Read':
      return `Reading ${base(path)}`
    case 'Edit':
    case 'MultiEdit':
      return `Editing ${base(path)}`
    case 'Write':
      return `Writing ${base(path)}`
    case 'Grep':
      return `Searching for “${clip(str(a.pattern), 40)}”`
    case 'Glob':
      return `Finding files ${clip(str(a.pattern), 40)}`
    case 'Bash':
      return `Running ${clip(str(a.description) || str(a.command), 60)}`
    case 'WebSearch':
      return `Searching the web: ${clip(str(a.query), 50)}`
    case 'WebFetch':
      return `Reading ${clip(str(a.url), 60)}`
    case 'Agent':
      return `Starting a helper: ${clip(str(a.description), 50)}`
    default:
      return clip(`${tool} ${path === '' ? '' : base(path)}`, 60)
  }
}

/**
 * How far along an agent probably is: its tool calls against what agents of its
 * type usually take. Linear to 85%, then easing toward 95% until it reports.
 */
export function progressOf(row: AgentRow): number {
  if (row.status === 'completed') {
    return 1
  }

  const f = row.tools / Math.max(1, row.expected)

  return f < 0.85 ? f : 0.85 + 0.1 * (1 - Math.exp(-(f - 0.85) * 3))
}

function median(list: number[]): number {
  if (list.length === 0) {
    return DEFAULT_EXPECTED
  }

  const sorted = [...list].sort((x, y) => x - y)

  return sorted[Math.floor(sorted.length / 2)] ?? DEFAULT_EXPECTED
}

async function expectedFor($: EngineInterface, type: string): Promise<number> {
  const seen = await $.store.get(`steps:${type}`)

  return Array.isArray(seen) ? Math.max(3, median(seen.filter((n): n is number => typeof n === 'number'))) : DEFAULT_EXPECTED
}

function statusOf(info: AgentInfo): AgentRow['status'] {
  return info.status
}

async function refresh($: EngineInterface): Promise<void> {
  const t = await $.clock.now()
  const infos = await $.agent.list()
  const known = await read($, agents)
  const types = new Map<string, number>()

  for (const info of infos) {
    if (!known.some(r => r.id === info.id) && !types.has(info.type)) {
      types.set(info.type, await expectedFor($, info.type))
    }
  }

  await update($, agents, rows => {
    let next = rows.map(row => {
      const info = infos.find(i => i.id === row.id)

      if (info === undefined) {
        return row
      }

      const status = statusOf(info)

      return {
        ...row,
        status,
        model: info.model ?? row.model,
        label: info.label.trim() === '' ? row.label : info.label,
        tokens: info.tokenCount || row.tokens,
        usd: info.cost?.usd ?? row.usd,
        endedAt: !LIVE.has(status) && row.endedAt === 0 ? t : row.endedAt,
      }
    })

    for (const info of infos) {
      if (!next.some(r => r.id === info.id)) {
        next = [
          ...next,
          {
            id: info.id,
            title: info.name ?? info.description,
            type: info.type,
            model: info.model ?? '',
            status: statusOf(info),
            startedAt: info.startTime,
            endedAt: 0,
            label: info.label,
            activity: '',
            tools: 0,
            expected: types.get(info.type) ?? DEFAULT_EXPECTED,
            tokens: info.tokenCount,
            usd: info.cost?.usd ?? 0,
          },
        ]
      }
    }

    return next.slice(-30)
  })
  await update($, now, () => t)
}

export const register: Register = (on, options) => {
  const openOnSpawn = options.openOnSpawn !== false

  on('session.start', async ($, e, next) => {
    const started = await next(e)

    await $.command.register({ name: 'deck', description: 'Show what every agent is working on, with progress' })
    await refresh($)

    $.clock.every(2500, async () => {
      const rows = await read($, agents)

      if (rows.some(isLive)) {
        await refresh($)
        const live = (await read($, agents)).filter(isLive)
        const avg = live.reduce((n, r) => n + progressOf(r), 0) / Math.max(1, live.length)
        $.ui.status(live.length > 0 ? `${live.length} ${live.length === 1 ? 'agent' : 'agents'} working · ~${Math.round(avg * 100)}%` : undefined)
      }
    })

    return started
  })

  on('command.run', { command: 'deck' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: 'Agents' })
    const rows = await read($, agents)

    return { text: `Agents pane opened: ${rows.filter(isLive).length} working, ${rows.filter(r => !isLive(r)).length} finished.` }
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)

    if (spawned.agentId !== undefined) {
      const id = spawned.agentId
      const t = await $.clock.now()
      const expected = await expectedFor($, e.subagentType)

      await update($, agents, rows =>
        rows.some(r => r.id === id)
          ? rows
          : [
              ...rows,
              {
                id,
                title: e.description,
                type: e.subagentType,
                model: spawned.model,
                status: 'running' as const,
                startedAt: t,
                endedAt: 0,
                label: e.description,
                activity: 'Starting up',
                tools: 0,
                expected,
                tokens: 0,
                usd: 0,
              },
            ].slice(-30),
      )
      await update($, now, () => t)

      if (openOnSpawn && !(await read($, hasOpened))) {
        await update($, hasOpened, () => true)
        void $.ui.open({ id: PANE, title: 'Agents' })
      }
    }

    return spawned
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const agentId = str((e as unknown as Record<string, unknown>).agentId)

    if (agentId !== '') {
      const doing = activityOf(e.tool, e as unknown as Record<string, unknown>)
      await update($, agents, rows => rows.map(r => (r.id === agentId ? { ...r, tools: r.tools + 1, activity: doing } : r)))
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('agent.report', async ($, e, next) => {
    const t = await $.clock.now()
    const rows = await read($, agents)
    const row = rows.find(r => r.id === e.agentId)

    await update($, agents, list =>
      list.map(r => (r.id === e.agentId ? { ...r, status: e.status, endedAt: t, activity: e.status === 'completed' ? 'Done' : r.activity } : r)),
    )
    await update($, now, () => t)

    // Learn how many tool calls this kind of agent takes, for next time's bar.
    if (row !== undefined && e.status === 'completed' && row.tools > 0) {
      const seen = await $.store.get(`steps:${row.type}`)
      const list = Array.isArray(seen) ? seen.filter((n): n is number => typeof n === 'number') : []
      await $.store.set(`steps:${row.type}`, [...list, row.tools].slice(-25))
    }

    if (!(await read($, agents)).some(isLive)) {
      $.ui.status(undefined)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // A row above the prompt while agents work.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rows = await read($, agents)
    const live = rows.filter(isLive)

    if (e.props.hasSurvey || live.length === 0) {
      return next(e)
    }

    const { Box, Button, Text, Progress } = $.ui.resolve(e)
    const avg = live.reduce((n, r) => n + progressOf(r), 0) / live.length
    const lead = live[live.length - 1]

    return (
      <Box flexDirection="row" alignItems="center" gap="sm">
        <Button key="agents-open" plain onPress={() => $.ui.open({ id: PANE, title: 'Agents' }).then(() => undefined)}>
          ⚙ {`${live.length} ${live.length === 1 ? 'agent' : 'agents'} working`}
          <Text dimColor>{lead === undefined ? '' : ` · ${clip(lead.activity || lead.title, Math.max(20, e.props.bodyColumns - 60))}`}</Text>
        </Button>
        <Box flexGrow={1} minWidth={16}>
          <Progress label="Agents" value={avg} valueText={`~${Math.round(avg * 100)}%`} color="claude" />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text, Progress } = $.ui.resolve(e)
    const rows = await read($, agents)
    const t = (await read($, now)) || (await $.clock.now())
    const live = rows.filter(isLive)
    const done = rows.filter(r => r.status === 'completed')
    const finished = rows.filter(r => !isLive(r))
    const batch = live.length + done.length
    const avg = live.reduce((n, r) => n + progressOf(r), 0)
    const overall = batch === 0 ? 0 : (done.length + avg) / batch
    const spent = rows.reduce((n, r) => n + r.usd, 0)

    if (e.props.placement === 'widget') {
      return (
        <Box flexDirection="column">
          <Text weight="semibold">⚙ {`${live.length} working`}</Text>
          <Progress label="All agents" value={overall} valueText={`${Math.round(overall * 100)}%`} color="claude" />
        </Box>
      )
    }

    if (rows.length === 0) {
      return (
        <Box flexDirection="column" gap="xs">
          <Text size="caption" dimColor>AGENTS</Text>
          <Text>No agents yet.</Text>
          <Text dimColor>When Claude hands work to a subagent, it shows here with what it is doing and how far along it is.</Text>
        </Box>
      )
    }

    const order = [...live, ...[...finished].reverse()].slice(0, 12)

    return (
      <Box flexDirection="column" gap="sm">
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text size="caption" dimColor>{`AGENTS · ${live.length} WORKING · ${done.length} DONE`}</Text>
            <Text size="caption" dimColor tabular>{spent > 0 ? `~$${spent.toFixed(2)} est.` : ''}</Text>
          </Box>
          <Progress label="This batch" value={overall} valueText={`${done.length}/${batch} done · ~${Math.round(overall * 100)}%`} color="claude" />
        </Box>
        {order.map(r => {
          const pct = progressOf(r)
          const glyph = r.status === 'completed' ? '✓' : r.status === 'failed' || r.status === 'killed' ? '✕' : r.status === 'stopped' ? '■' : r.status === 'waiting' || r.status === 'idle' ? '…' : '◌'
          const tone = r.status === 'completed' ? 'success' : r.status === 'failed' || r.status === 'killed' ? 'error' : isLive(r) ? 'warning' : 'inactive'
          const elapsed = span((r.endedAt || t) - r.startedAt)
          const summary = r.label.trim() !== '' && r.label !== r.title ? r.label : ''

          return (
            <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
              <Box flexDirection="row" justifyContent="space-between" gap="sm">
                <Text weight="semibold" wrap="truncate-end">
                  <Text color={tone}>{glyph}</Text> {r.title}
                </Text>
                <Text size="caption" dimColor tabular>{elapsed}</Text>
              </Box>
              <Text size="caption" dimColor>{`${r.type} · ${shortModel(r.model)}`}</Text>
              {isLive(r) ? <Text wrap="truncate-end">{`Now: ${r.activity || 'thinking'}`}</Text> : <Text dimColor wrap="truncate-end">{r.status === 'completed' ? 'Finished' : `Ended: ${r.status}`}</Text>}
              {summary === '' ? <Text dimColor> </Text> : <Text dimColor maxLines={2}>{clip(summary, 240)}</Text>}
              {isLive(r) ? (
                <Progress label={clip(r.title, 40)} value={pct} valueText={`~${Math.round(pct * 100)}%`} color="claude" />
              ) : (
                <Progress label={clip(r.title, 40)} value={r.status === 'completed' ? 1 : pct} valueText={r.status === 'completed' ? 'done' : r.status} color={r.status === 'completed' ? 'success' : 'error'} />
              )}
              <Text size="caption" dimColor>
                {`${r.tools} tool ${r.tools === 1 ? 'call' : 'calls'} · ${tokens(r.tokens)} tokens${r.usd > 0 ? ` · ~$${r.usd.toFixed(2)}` : ''}`}
              </Text>
            </Box>
          )
        })}
        {finished.length > 0 ? (
          <Button key="agents-clear" dimColor label="Clear finished" onPress={() => update($, agents, list => list.filter(isLive))} />
        ) : (
          <Text> </Text>
        )}
      </Box>
    )
  })
}
