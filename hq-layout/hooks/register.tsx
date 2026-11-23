import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { FeedItem, Run, SessionCard, Stats, Todo, View } from '../types'
import { LOOK, PLAIN_LOOK, problems } from './look'
import { BANNER, SCENE } from './scene'
import { SERVER, jsonIn, sessionLink, textOf, toCards } from './sessions'
import { clockOf, span, stamp } from './time'

const PANE = 'hq'
const PEACH = '#efbc90'
const INK = '#1d130b'

const EMPTY_STATS: Stats = { prompts: 0, turns: 0, tools: 0, edits: 0, commands: 0, errors: 0, startedAt: 0, byTool: {} }

const view = atom({ plugin: 'hq-layout', key: 'view' } as const, 'home' as View)
const feed = atom({ plugin: 'hq-layout', key: 'feed' } as const, [] as FeedItem[], { shape: 'feed-1' })
const feedIndex = atom({ plugin: 'hq-layout', key: 'feedIndex' } as const, 0)
const showDetail = atom({ plugin: 'hq-layout', key: 'showDetail' } as const, false)
const todos = atom({ plugin: 'hq-layout', key: 'todos' } as const, [] as Todo[], { shape: 'todos-1' })
const runs = atom({ plugin: 'hq-layout', key: 'runs' } as const, [] as Run[], { shape: 'runs-1' })
const stats = atom({ plugin: 'hq-layout', key: 'stats' } as const, EMPTY_STATS, { shape: 'stats-1' })
const dismissed = atom({ plugin: 'hq-layout', key: 'dismissed' } as const, [] as string[])
const now = atom({ plugin: 'hq-layout', key: 'now' } as const, 0)
const sessions = atom({ plugin: 'hq-layout', key: 'sessions' } as const, [] as SessionCard[], { shape: 'sessions-1' })
const sessionsAt = atom({ plugin: 'hq-layout', key: 'sessionsAt' } as const, 0)
const sessionsError = atom({ plugin: 'hq-layout', key: 'sessionsError' } as const, '')
const selfId = atom({ plugin: 'hq-layout', key: 'selfId' } as const, '')
const sent = atom({ plugin: 'hq-layout', key: 'sent' } as const, {} as Record<string, string>)

const VIEWS: { id: View; icon: string; name: string }[] = [
  { id: 'home', icon: '⌂', name: 'Home' },
  { id: 'today', icon: '☑', name: 'Today' },
  { id: 'needs', icon: '✉', name: 'Needs you' },
  { id: 'sessions', icon: '◎', name: 'Sessions' },
  { id: 'metrics', icon: '↗', name: 'Metrics' },
  { id: 'workflows', icon: '▷', name: 'Workflows' },
]

const isView = (v: string): v is View => VIEWS.some(one => one.id === v)
const nameOf = (v: View): string => VIEWS.find(one => one.id === v)?.name ?? 'Home'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const clip = (s: string, max: number): string => {
  const one = s.replace(/\s+/g, ' ').trim()

  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}
const base = (path: string): string => path.split('/').filter(Boolean).slice(-2).join('/')

const EDITS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

/** What a tool call says in the feed and in Workflows, or null to keep it out of the feed. */
function describe(tool: string, a: Record<string, unknown>): { label: string; item: Omit<FeedItem, 'id' | 'at'> | null } {
  const path = str(a.file_path) || str(a.notebook_path)

  if (EDITS.has(tool)) {
    return {
      label: `${tool} ${base(path)}`,
      item: { kind: 'Edit', title: `${tool === 'Write' ? 'Wrote' : 'Edited'} ${base(path)}`, evidence: path, detail: path },
    }
  }
  if (tool === 'Bash') {
    const command = str(a.command)
    const what = str(a.description) || clip(command, 70)

    return { label: clip(what, 60), item: { kind: 'Command', title: what, evidence: '1 shell run', detail: command } }
  }
  if (tool === 'WebSearch' || tool === 'WebFetch') {
    const target = str(a.query) || str(a.url)

    return { label: `${tool} ${clip(target, 50)}`, item: { kind: 'Research', title: clip(target, 90), evidence: tool === 'WebSearch' ? 'web search' : '1 linked source', detail: target } }
  }
  if (tool === 'Agent' || tool === 'Task') {
    const what = str(a.description) || 'Subagent'

    return { label: `Agent ${clip(what, 50)}`, item: { kind: 'Agent', title: what, evidence: str(a.subagent_type) || 'subagent', detail: clip(str(a.prompt), 600) } }
  }
  if (tool === 'Skill') {
    return { label: `Skill ${str(a.skill)}`, item: { kind: 'Skill', title: `Used ${str(a.skill)}`, evidence: 'skill', detail: str(a.args) } }
  }

  const hint = str(a.pattern) || str(a.query) || base(path) || str(a.subject)

  return { label: clip(`${tool} ${hint}`, 60), item: null }
}

async function addFeed($: EngineInterface, item: Omit<FeedItem, 'id' | 'at'>, id: string): Promise<void> {
  const at = await $.clock.now()
  await update($, feed, list => [...list, { ...item, id, at }].slice(-60))
  await update($, feedIndex, () => 0)
}

/** Reads the person's other sessions into state. Never throws: a failure is shown in the view. */
async function refreshSessions($: EngineInterface): Promise<void> {
  try {
    let self = await read($, selfId)

    if (self === '') {
      const me = await $.mcp.call(SERVER, 'get_session', {})
      self = /"id"\s*:\s*"(session_[A-Za-z0-9]+)"/.exec(textOf(me))?.[1] ?? ''
      const found = self
      await update($, selfId, () => found)
    }

    const r = await $.mcp.call(SERVER, 'list_sessions', { mine: true, limit: 20 })
    const t = await $.clock.now()

    if (r.isError) {
      await update($, sessionsError, () => clip(textOf(r), 220) || 'The sessions service refused the request.')
      return
    }

    let cards = toCards(jsonIn(textOf(r)), self)

    if (cards.length === 0 && r.structuredContent !== undefined) {
      cards = toCards(r.structuredContent, self)
    }

    await update($, sessions, () => cards)
    await update($, sessionsAt, () => t)
    await update($, sessionsError, () => '')
  } catch (error) {
    await update($, sessionsError, () => clip(`Could not reach your sessions: ${String(error)}`, 220))
  }
}

export const register: Register = (on, options) => {
  const zone = typeof options.timeZone === 'string' ? options.timeZone : ''
  const openOnStart = options.openOnStart !== false
  let turnTools = 0

  on('session.start', async ($, e, next) => {
    const started = await next(e)

    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.log(unpainted)
    }

    try {
      await $.theme.set(LOOK)
    } catch (error) {
      $.ui.log(`hq-layout: full look refused, using colors and scene only (${String(error)})`)
      await $.theme.set(PLAIN_LOOK)
    }

    await $.command.register({ name: 'hq', description: 'Open HQ: home, today, needs, sessions, metrics or workflows', argumentHint: '[home|today|needs|sessions|metrics|workflows]' })

    const t = await $.clock.now()
    await update($, now, () => t)
    await update($, stats, s => (s.startedAt === 0 ? { ...s, startedAt: t } : s))
    $.ui.status(`HQ · ${stamp(t, zone)}`)

    $.clock.every(20000, async () => {
      const at = await $.clock.now()
      await update($, now, () => at)
      $.ui.status(`HQ · ${stamp(at, zone)}`)
    })

    void refreshSessions($)
    $.clock.every(30000, () => refreshSessions($))

    if (openOnStart) {
      void $.ui.open({ id: PANE, title: 'HQ' })
    }

    return started
  })

  on('command.run', { command: 'hq' }, async ($, e) => {
    const want = e.args.trim().toLowerCase()
    const pick = isView(want) ? want : 'home'
    await update($, view, () => pick)
    await $.ui.open({ id: PANE, title: 'HQ' })

    return { text: `HQ opened on ${nameOf(pick)}.` }
  })

  on('prompt.submit', async ($, e, next) => {
    turnTools = 0

    if (e.isMeta !== true && e.command === undefined && e.text.trim() !== '') {
      await update($, stats, s => ({ ...s, prompts: s.prompts + 1 }))
      await addFeed($, { kind: 'Prompt', title: clip(e.text, 110), evidence: 'from you', detail: e.text }, `p${await $.clock.now()}`)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const a = e as unknown as Record<string, unknown>
    const { label, item } = describe(e.tool, a)
    const at = await $.clock.now()
    turnTools += 1

    await update($, runs, list => [...list, { id: e.tool_use_id, tool: e.tool, label, state: 'running' as const, at }].slice(-80))
    await update($, stats, s => ({
      ...s,
      tools: s.tools + 1,
      edits: s.edits + (EDITS.has(e.tool) ? 1 : 0),
      commands: s.commands + (e.tool === 'Bash' ? 1 : 0),
      byTool: { ...s.byTool, [e.tool]: (s.byTool[e.tool] ?? 0) + 1 },
    }))

    if (e.tool === 'TodoWrite' && Array.isArray(a.todos)) {
      const list = (a.todos as { content?: unknown; status?: unknown }[]).map((t, i) => ({
        id: `todo-${i}`,
        content: str(t.content),
        status: t.status === 'completed' || t.status === 'in_progress' ? t.status : ('pending' as const),
      }))
      await update($, todos, () => list)
    }

    if (e.tool === 'TaskUpdate') {
      const id = str(a.taskId)
      const status = str(a.status)
      const subject = str(a.subject)
      await update($, todos, list =>
        status === 'deleted'
          ? list.filter(t => t.id !== id)
          : list.map(t =>
              t.id === id
                ? {
                    ...t,
                    content: subject || t.content,
                    status: status === 'completed' || status === 'in_progress' || status === 'pending' ? status : t.status,
                  }
                : t,
            ),
      )
    }

    const ran = await next(e)
    const isError = 'deny' in ran && ran.deny !== undefined ? true : ran.isError === true

    await update($, runs, list => list.map(r => (r.id === e.tool_use_id ? { ...r, state: isError ? ('error' as const) : ('done' as const) } : r)))

    if (isError) {
      await update($, stats, s => ({ ...s, errors: s.errors + 1 }))
    }

    if (e.tool === 'TaskCreate' && !isError) {
      const task = (ran.result as { task?: { id?: unknown; subject?: unknown } } | undefined)?.task
      const id = str(task?.id)

      if (id !== '') {
        await update($, todos, list => [...list.filter(t => t.id !== id), { id, content: str(task?.subject) || str(a.subject), status: 'pending' as const }])
      }
    }

    if (item !== null && !isError) {
      await addFeed($, item, e.tool_use_id)
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    await update($, stats, s => ({ ...s, turns: s.turns + 1 }))

    if (turnTools > 0) {
      await addFeed($, { kind: 'Turn', title: `Wrapped a turn with ${turnTools} tool ${turnTools === 1 ? 'call' : 'calls'}`, evidence: `${turnTools} receipts`, detail: '' }, `t${await $.clock.now()}`)
    }
    turnTools = 0

    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }

    const { Svg } = $.ui.resolve(e)

    return <Svg source={SCENE} alt="Ink-wash mountains with curling clouds and a warm river at dusk" isInteractive />
  })

  // The week strip: HQ's row of days, today in peach, with what needs you.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const t = await read($, now)

    if (t === 0) {
      return next(e)
    }

    const c = clockOf(t, zone)
    const plan = await read($, todos)
    const errs = (await read($, runs)).filter(r => r.state === 'error')
    const gone = await read($, dismissed)
    const running = (await read($, runs)).filter(r => r.state === 'running').length
    const waiting = (await read($, sessions)).filter(c => c.bucket === 'blocked' && !c.isSelf).length
    const needs = plan.filter(p => p.status !== 'completed').length + errs.filter(r => !gone.includes(r.id)).length + waiting
    const isNarrow = e.props.bodyColumns < 84
    const days = isNarrow ? c.week.filter((_, i) => Math.abs(i - c.week.findIndex(d => d.isToday)) <= 1) : c.week

    const go = (v: View) => async () => {
      await update($, view, () => v)
      await $.ui.open({ id: PANE, title: 'HQ' })
    }

    return (
      <Box flexDirection="row" alignItems="center" gap="sm" flexWrap="wrap">
        {days.map(d =>
          d.isToday ? (
            <Box backgroundColor={PEACH} paddingX={1}>
              <Text color={INK} size="caption">{d.short} </Text>
              <Text color={INK} weight="bold">{String(d.day)}</Text>
            </Box>
          ) : (
            <Box paddingX={1}>
              <Text dimColor size="caption">{d.short} </Text>
              <Text weight="semibold">{String(d.day)}</Text>
            </Box>
          ),
        )}
        <Button key="hq-needs" plain onPress={go('needs')}>
          ✉ Needs you <Text dimColor>{`${needs} ${needs === 1 ? 'item' : 'items'}`}</Text>
        </Button>
        <Button key="hq-flows" plain onPress={go('workflows')}>
          ▷ Automations <Text dimColor>{running > 0 ? `${running} running` : 'idle'}</Text>
        </Button>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text, Progress, Input, Link } = $.ui.resolve(e)
    const t = (await read($, now)) || (await $.clock.now())
    const c = clockOf(t, zone)
    const current = await read($, view)
    const items = [...(await read($, feed))].reverse()
    const index = Math.min(await read($, feedIndex), Math.max(0, items.length - 1))
    const isOpen = await read($, showDetail)
    const plan = await read($, todos)
    const allRuns = await read($, runs)
    const gone = await read($, dismissed)
    const s = await read($, stats)
    const errs = allRuns.filter(r => r.state === 'error' && !gone.includes(r.id))
    const open = plan.filter(p => p.status !== 'completed')
    const others = await read($, sessions)
    const blocked = others.filter(c => c.bucket === 'blocked' && !c.isSelf)
    const needs = open.length + errs.length + blocked.length
    const running = allRuns.filter(r => r.state === 'running')
    const cols = e.props.bodyColumns
    const isGraphic = e.surface !== 'terminal'

    // Minimized on the desktop: the clock and what needs you, at a glance.
    if (e.props.placement === 'widget') {
      return (
        <Box flexDirection="column">
          <Text size="title" weight="medium" tabular>{c.time} <Text size="caption" dimColor>{c.period}</Text></Text>
          <Text size="caption" dimColor>{c.date}</Text>
          <Text size="caption">✉ {`${needs} need you`}</Text>
        </Box>
      )
    }

    const set = (v: View) => () => update($, view, () => v)

    let banner = <Text> </Text>

    if ((e.surface === 'desktop' || e.surface === 'mobile') && cols >= 40) {
      const { Svg } = $.ui.resolve(e)
      banner = <Svg source={BANNER} alt="Mountains, clouds and a river of light" height={110} />
    }

    const bar = (name: string, value: number, max: number) => (
      <Progress label={name} value={value} max={max} valueText={`${value}/${max}`} color="claude" />
    )

    const header = (
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="sm">
        <Text weight="bold">HQ <Text dimColor>/</Text> {nameOf(current)}</Text>
        <Box flexDirection="row" alignItems="center" gap="sm">
          <Text size="title" weight="medium" tabular>{c.time}</Text>
          <Box flexDirection="column">
            <Text size="caption" dimColor>{c.period}</Text>
            <Text size="caption" weight="semibold">{c.date}</Text>
          </Box>
        </Box>
      </Box>
    )

    const label = (text: string) => <Text size="caption" dimColor>{text.toUpperCase()}</Text>

    const fact = (name: string, value: string) => (
      <Box flexDirection="column" marginRight={2}>
        {label(name)}
        <Text size="footnote" weight="medium">{value}</Text>
      </Box>
    )

    const card = (children: JSX.Element[] | JSX.Element) => (
      <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1} paddingY={isGraphic ? 1 : 0} gap="xs">
        {children}
      </Box>
    )

    let body: JSX.Element

    if (current === 'home') {
      const item = items[index]
      const move = (by: number) => async () => {
        await update($, showDetail, () => false)
        await update($, feedIndex, i => Math.max(0, Math.min(items.length - 1, i + by)))
      }

      body = (
        <Box flexDirection="column" gap="sm">
          {card(
            item === undefined ? (
              <Box flexDirection="column" gap="xs">
                {label('HQ / Feed')}
                <Text size="title" weight="medium">Nothing in the feed yet</Text>
                <Text dimColor>Send a prompt. Edits, commands, research and finished turns land here as cards.</Text>
              </Box>
            ) : (
              <Box flexDirection="column" gap="xs">
                {banner}
                <Box flexDirection="row" justifyContent="space-between">
                  {label('HQ / Feed')}
                  <Text size="caption" dimColor tabular>{`${String(index + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`}</Text>
                </Box>
                <Text size="footnote" weight="semibold">{item.kind} · <Text dimColor>{item.evidence}</Text></Text>
                <Text size="title" weight="medium" maxLines={3}>{item.title}</Text>
                <Box flexDirection="row" flexWrap="wrap" marginTop={1}>
                  {fact('Signal', item.kind)}
                  {fact('Evidence', clip(item.evidence, 28) || '—')}
                  {fact('Observed', stamp(item.at, zone))}
                </Box>
                {isOpen && item.detail !== '' ? (
                  <Box borderStyle="single" borderColor="subtle" paddingX={1}>
                    <Text mono size="footnote" maxLines={14}>{item.detail}</Text>
                  </Box>
                ) : (
                  <Text> </Text>
                )}
                <Box flexDirection="row" justifyContent="space-between" alignItems="center">
                  <Box flexDirection="row" gap="xs">
                    <Button key="feed-newer" label="‹ Newer" dimColor={index === 0} onPress={move(-1)} />
                    <Button key="feed-older" label="Older ›" dimColor={index >= items.length - 1} onPress={move(1)} />
                  </Box>
                  <Button
                    key="feed-record"
                    variant="primary"
                    label={isOpen ? 'Close record' : 'Open record →'}
                    onPress={() => update($, showDetail, v => !v)}
                  />
                </Box>
              </Box>
            ),
          )}
          <Box flexDirection={cols >= 60 ? 'row' : 'column'} gap="sm">
            <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="subtle" paddingX={1}>
              {label(`Workflows · ${running.length} running`)}
              <Text weight="medium" wrap="truncate-end">{allRuns[allRuns.length - 1]?.label ?? 'No runs yet.'}</Text>
              <Text size="caption" dimColor>{running.length > 0 ? 'STATE  Running' : 'STATE  Ready'}</Text>
            </Box>
            <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="subtle" paddingX={1}>
              {label(`Needs you · ${needs}`)}
              <Text weight="medium" wrap="truncate-end">{open[0]?.content ?? (errs[errs.length - 1]?.label ?? 'All clear.')}</Text>
              <Text size="caption" dimColor>{`PLAN  ${plan.length - open.length}/${plan.length} done`}</Text>
            </Box>
          </Box>
        </Box>
      )
    } else if (current === 'today') {
      const done = plan.filter(p => p.status === 'completed').length

      body = card(
        <Box flexDirection="column" gap="xs">
          {label('Today · one finite plan')}
          {plan.length === 0 ? (
            <Text dimColor>No plan yet. When Claude breaks work into steps, they show here.</Text>
          ) : (
            <Box flexDirection="column" gap="xs">
              {bar('Plan', done, plan.length)}
              {plan.map(p => (
                <Text
                  color={p.status === 'in_progress' ? 'claude' : undefined}
                  dimColor={p.status === 'completed'}
                  strikethrough={p.status === 'completed'}
                >
                  {p.status === 'completed' ? '●' : p.status === 'in_progress' ? '◐' : '○'} {p.content}
                </Text>
              ))}
            </Box>
          )}
        </Box>,
      )
    } else if (current === 'needs') {
      body = card(
        <Box flexDirection="column" gap="xs">
          {label(`Needs you · ${needs} ${needs === 1 ? 'item' : 'items'}`)}
          {needs === 0 ? <Text dimColor>All clear. Nothing is waiting on you.</Text> : <Text> </Text>}
          {open.map(p => (
            <Text>
              {p.status === 'in_progress' ? '◐' : '○'} {p.content} <Text dimColor>{p.status === 'in_progress' ? 'in progress' : 'open'}</Text>
            </Text>
          ))}
          {blocked.map(c => (
            <Box flexDirection="column">
              <Text color="warning" wrap="truncate-end">! {c.title} <Text dimColor>· another session</Text></Text>
              <Text dimColor maxLines={2}>{c.needs || 'Waiting on you.'}</Text>
              <Box flexDirection="row" gap="sm">
                <Link key={`needs-open-${c.id}`} href={sessionLink(c.id)} label="Open to answer ↗" />
                <Button key={`needs-go-${c.id}`} plain dimColor label="Reply from HQ" onPress={() => update($, view, () => 'sessions' as View)} />
              </Box>
            </Box>
          ))}
          {errs.slice(-8).map(r => (
            <Box flexDirection="row" justifyContent="space-between" alignItems="center">
              <Text color="error" wrap="truncate-end">✕ {r.label}</Text>
              <Button key={`dismiss-${r.id}`} plain dimColor label="Dismiss" onPress={() => update($, dismissed, list => [...list, r.id].slice(-200))} />
            </Box>
          ))}
        </Box>,
      )
    } else if (current === 'sessions') {
      const when = await read($, sessionsAt)
      const problem = await read($, sessionsError)
      const notes = await read($, sent)
      const ago = (ms: number) => (ms === 0 ? '' : `${span(t - ms)} ago`)
      const look: Record<SessionCard['bucket'], [string, string, string]> = {
        blocked: ['!', 'warning', 'Needs you'],
        failed: ['✕', 'error', 'Failed'],
        review: ['◆', 'success', 'Ready for review'],
        working: ['◌', 'claude', 'Working'],
        idle: ['·', 'inactive', 'Idle'],
        done: ['✓', 'inactive', 'Done'],
      }
      const counts = (['blocked', 'working', 'review', 'failed'] as const)
        .map(b => [b, others.filter(c => c.bucket === b && !c.isSelf).length] as const)
        .filter(([, n]) => n > 0)
        .map(([b, n]) => `${n} ${look[b][2].toLowerCase()}`)

      body = (
        <Box flexDirection="column" gap="sm">
          <Box flexDirection="row" justifyContent="space-between" alignItems="center">
            {label(`Sessions · ${counts.join(' · ') || 'all quiet'}`)}
            <Button key="sessions-refresh" plain dimColor label={when === 0 ? 'Refresh' : `Refreshed ${ago(when)} · Refresh`} onPress={() => refreshSessions($)} />
          </Box>
          {problem === '' ? <Text> </Text> : <Text color="error" maxLines={3}>{problem}</Text>}
          {others.length === 0 && problem === '' ? <Text dimColor>{when === 0 ? 'Loading your sessions…' : 'No other sessions found.'}</Text> : <Text> </Text>}
          {others.slice(0, 12).map(c => {
            const [glyph, tone, word] = look[c.bucket]
            const brief = c.bucket === 'blocked' && c.needs !== '' ? c.needs : c.recent || c.task || c.needs

            return (
              <Box flexDirection="column" borderStyle="round" borderColor={c.bucket === 'blocked' ? 'warning' : 'subtle'} paddingX={1} gap="xs">
                <Box flexDirection="row" justifyContent="space-between" gap="sm">
                  <Text weight="semibold" wrap="truncate-end">
                    <Text color={tone}>{glyph}</Text> {c.title}{c.isUnread ? <Text color="claude"> •</Text> : ''}
                  </Text>
                  <Text size="caption" dimColor tabular>{ago(c.updatedAt)}</Text>
                </Box>
                <Text size="caption" dimColor>{`${word.toUpperCase()}${c.isSelf ? ' · THIS SESSION' : ''}${c.origin === '' ? '' : ` · from ${c.origin.replace('_', ' ')}`}`}</Text>
                {c.bucket === 'blocked' && c.needs !== '' ? <Text color="warning" maxLines={3}>{`Needs: ${c.needs}`}</Text> : <Text dimColor maxLines={3}>{brief || 'No summary yet.'}</Text>}
                {c.bucket === 'blocked' && c.recent !== '' ? <Text dimColor maxLines={2}>{c.recent}</Text> : <Text> </Text>}
                {c.isSelf ? (
                  <Text> </Text>
                ) : (
                  <Input
                    key={`reply-${c.id}`}
                    placeholder="Reply to this session…"
                    submitLabel="Send"
                    onSubmit={async value => {
                      const message = value.trim()

                      if (message === '') {
                        return
                      }

                      const r = await $.mcp.call(SERVER, 'send_message', { session_id: c.id, message })
                      const at = await $.clock.now()
                      const note = r.isError ? `Not sent: ${clip(textOf(r), 140)}` : `Sent ${stamp(at, zone)}: “${clip(message, 70)}”`
                      await update($, sent, m => ({ ...m, [c.id]: note }))
                      $.ui.toast(r.isError ? `HQ: message to “${clip(c.title, 40)}” was not sent` : `HQ: sent to “${clip(c.title, 40)}”`)
                      await refreshSessions($)
                    }}
                  />
                )}
                {notes[c.id] === undefined ? <Text> </Text> : <Text size="caption" dimColor>{notes[c.id]}</Text>}
                <Box flexDirection="row" gap="sm" alignItems="center">
                  <Link key={`open-${c.id}`} href={sessionLink(c.id)} label={c.bucket === 'blocked' ? 'Open to approve ↗' : 'Open ↗'} />
                  {c.bucket === 'working' && !c.isSelf ? (
                    <Button
                      key={`stop-${c.id}`}
                      plain
                      dimColor
                      label="Stop turn"
                      onPress={async () => {
                        const r = await $.mcp.call(SERVER, 'interrupt_session', { session_id: c.id })
                        $.ui.toast(r.isError ? `HQ: could not stop “${clip(c.title, 40)}”` : `HQ: stopped “${clip(c.title, 40)}”; reply to steer it`)
                        await refreshSessions($)
                      }}
                    />
                  ) : (
                    <Text> </Text>
                  )}
                </Box>
              </Box>
            )
          })}
        </Box>
      )
    } else if (current === 'metrics') {
      const tiles: [string, string][] = [
        ['Prompts', String(s.prompts)],
        ['Turns', String(s.turns)],
        ['Tool calls', String(s.tools)],
        ['Edits', String(s.edits)],
        ['Commands', String(s.commands)],
        ['Errors', String(s.errors)],
        ['Session', span(t - (s.startedAt || t))],
      ]
      const top = Object.entries(s.byTool).sort((x, y) => y[1] - x[1]).slice(0, 6)
      const most = top[0]?.[1] ?? 1

      body = (
        <Box flexDirection="column" gap="sm">
          <Box flexDirection="row" flexWrap="wrap" gap="sm">
            {tiles.map(([name, value]) => (
              <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1} minWidth={12}>
                {label(name)}
                <Text size="title" weight="medium" tabular>{value}</Text>
              </Box>
            ))}
          </Box>
          {card(
            <Box flexDirection="column" gap="xs">
              {label('Tools by use')}
              {top.length === 0 ? <Text dimColor>No tool calls yet.</Text> : <Text> </Text>}
              {top.map(([tool, count]) => bar(tool, count, most))}
            </Box>,
          )}
        </Box>
      )
    } else {
      const recent = [...allRuns].reverse().slice(0, Math.max(4, (e.props.scroll.bodyRows ?? 20) - 8))

      body = card(
        <Box flexDirection="column" gap="xs">
          {label(`Workflows · ${running.length} running · ${allRuns.length} this session`)}
          {recent.length === 0 ? <Text dimColor>No automations have run yet.</Text> : <Text> </Text>}
          {recent.map(r => (
            <Box flexDirection="row" justifyContent="space-between">
              <Text
                color={r.state === 'error' ? 'error' : r.state === 'running' ? 'warning' : 'success'}
                wrap="truncate-end"
              >
                {r.state === 'error' ? '✕' : r.state === 'running' ? '◌' : '✓'} {r.label}
              </Text>
              <Text size="caption" dimColor tabular>{stamp(r.at, zone)}</Text>
            </Box>
          ))}
        </Box>,
      )
    }

    // The dock: HQ's row of apps along the foot.
    const dock = (
      <Box flexDirection="row" flexWrap="wrap" gap="xs" justifyContent="center" marginTop={1}>
        {VIEWS.map(v => (
          <Button key={`dock-${v.id}`} variant={v.id === current ? 'primary' : 'secondary'} onPress={set(v.id)}>
            {v.icon} {cols >= 70 || v.id === current ? v.name : ''}
            {v.id === 'needs' && needs > 0 ? <Text dimColor>{` ${needs}`}</Text> : ''}
          </Button>
        ))}
      </Box>
    )

    return (
      <Box flexDirection="column" gap="sm">
        {header}
        {body}
        {dock}
      </Box>
    )
  })
}
