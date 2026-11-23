import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, TurnUsage } from 'claude-code'

import type { Ctx, Decision, RouterStats, Usage } from '../types'
import { chooseAgent, chooseMain, classify, familyOf } from './route'

const MODES = ['off', 'conservative', 'balanced', 'aggressive']
const FAMILIES = ['haiku', 'sonnet', 'opus', 'fable']

const EMPTY_STATS: RouterStats = { turns: 0, lighterTurns: 0, agents: 0, lighterAgents: 0, keptForCache: 0, tokensByFamily: {} }

const modeOverride = atom({ plugin: 'model-router', key: 'mode' } as const, '')
const pin = atom({ plugin: 'model-router', key: 'pin' } as const, '')
const decision = atom({ plugin: 'model-router', key: 'decision' } as const, null as Decision | null, { shape: 'decision-1' })
const ctx = atom({ plugin: 'model-router', key: 'ctx' } as const, { tokens: 0, lastStepAt: 0, lastFamily: '' } as Ctx, { shape: 'ctx-1' })
const stats = atom({ plugin: 'model-router', key: 'stats' } as const, EMPTY_STATS, { shape: 'stats-1' })
const usage = atom({ plugin: 'model-router', key: 'usage' } as const, null as Usage | null, { shape: 'usage-1' })
const isQuiet = atom({ plugin: 'model-router', key: 'isQuiet' } as const, false)

const cap = (s: string): string => (s === '' ? s : `${s.slice(0, 1).toUpperCase()}${s.slice(1)}`)

function sizeOf(u: TurnUsage | null): number {
  return u === null ? 0 : u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens + u.output_tokens
}

async function tally($: EngineInterface, family: string, u: TurnUsage | null): Promise<void> {
  if (u === null || family === '') {
    return
  }

  const n = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens + u.output_tokens
  await update($, stats, s => ({ ...s, tokensByFamily: { ...s.tokensByFamily, [family]: (s.tokensByFamily[family] ?? 0) + n } }))
}

async function modeOf($: EngineInterface, fallback: string): Promise<string> {
  return (await read($, modeOverride)) || fallback
}

async function measure($: EngineInterface): Promise<void> {
  const u = await $.session.usage()
  const top = [...u.rateLimits].sort((x, y) => y.percentUsed - x.percentUsed)[0]

  await update($, usage, () => ({
    usd: u.cost?.usd ?? 0,
    hasCost: u.cost !== undefined,
    planPercent: top?.percentUsed ?? -1,
    planKind: top?.kind ?? '',
  }))
}

function report(mode: string, pinned: string, d: Decision | null, s: RouterStats, u: Usage | null): string {
  const lines = [
    `Model router: ${mode}${pinned === '' ? '' : `, pinned to ${pinned}`}`,
    d === null ? 'No turn routed yet.' : `This turn: ${d.model === '' ? 'the session model' : cap(d.model)} (${d.tier}${d.why === '' ? '' : `, ${d.why}`})`,
    `Main turns: ${s.lighterTurns} of ${s.turns} on a lighter model; ${s.keptForCache} kept on the current model to protect the cache.`,
    `Subagents: ${s.lighterAgents} of ${s.agents} sent to a lighter model.`,
    `Tokens by model: ${FAMILIES.filter(f => (s.tokensByFamily[f] ?? 0) > 0).map(f => `${cap(f)} ${Math.round((s.tokensByFamily[f] ?? 0) / 1000)}k`).join(' · ') || 'none yet'}`,
  ]

  if (u !== null) {
    lines.push(
      [u.planPercent >= 0 ? `Plan usage: ${Math.round(u.planPercent)}% (${u.planKind})` : '', u.hasCost ? `Session cost: ~$${u.usd.toFixed(2)} (estimate)` : '']
        .filter(Boolean)
        .join(' · '),
    )
  }

  lines.push('Change it: /route balanced | aggressive | conservative | off, /route pin sonnet, /route auto')

  return lines.filter(Boolean).join('\n')
}

export const register: Register = (on, options) => {
  const optionMode = typeof options.mode === 'string' && MODES.includes(options.mode) ? options.mode : 'balanced'
  const budget = typeof options.switchBudgetTokens === 'number' ? options.switchBudgetTokens : 40000
  const ttlMs = (typeof options.cacheTtlMinutes === 'number' ? options.cacheTtlMinutes : 60) * 60000

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'route',
      description: 'Model router: show what it chose and why, or change how hard it saves',
      argumentHint: '[balanced|aggressive|conservative|off|pin <model>|auto]',
    })

    return started
  })

  on('command.run', { command: 'route' }, async ($, e) => {
    const [word = '', arg = ''] = e.args.trim().toLowerCase().split(/\s+/)

    if (MODES.includes(word)) {
      await update($, modeOverride, () => word)
    } else if (word === 'pin' && FAMILIES.includes(arg)) {
      await update($, pin, () => arg)
    } else if (word === 'auto' || word === 'unpin') {
      await update($, pin, () => '')
      await update($, modeOverride, () => '')
    } else if (word === 'hide' || word === 'show') {
      await update($, isQuiet, () => word === 'hide')
    }

    await measure($)

    return { text: report(await modeOf($, optionMode), await read($, pin), await read($, decision), await read($, stats), await read($, usage)) }
  })

  // Read the assignment once, as the turn starts.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      const { tier, why } = classify(e.text)
      const at = await $.clock.now()
      await update($, decision, () => ({ turnId: e.turnId, tier, model: '', why, at, isResolved: false }))
    }

    return next(e)
  })

  // Every request of the turn goes to the model chosen at its first request, so
  // the cache stays whole within the turn.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      const r = yield* next(e)
      await tally($, familyOf(e.model), r.usage)

      return r
    }

    let d = await read($, decision)

    if (d === null || d.turnId !== e.turnId) {
      const at = await $.clock.now()
      d = { turnId: e.turnId, tier: 'follow', model: '', why: 'a continuation keeps the current model', at, isResolved: false }
    }

    if (!d.isResolved) {
      const c = await read($, ctx)
      const t = await $.clock.now()
      const pick = chooseMain(d.tier, {
        mode: await modeOf($, optionMode),
        pin: await read($, pin),
        home: e.model,
        lastFamily: c.lastFamily,
        contextTokens: c.tokens,
        isCacheCold: c.lastStepAt === 0 || t - c.lastStepAt > ttlMs,
        switchBudgetTokens: budget,
      })
      const resolved: Decision = { ...d, model: pick.model, why: pick.why || d.why, isResolved: true }
      d = resolved
      await update($, decision, () => resolved)
      await update($, stats, s => ({
        ...s,
        turns: s.turns + 1,
        lighterTurns: s.lighterTurns + (pick.model === '' ? 0 : 1),
        keptForCache: s.keptForCache + (pick.keptForCache ? 1 : 0),
      }))
    }

    const runs = d.model === '' || familyOf(d.model) === familyOf(e.model) ? e.model : d.model
    const r = yield* next(runs === e.model ? e : { ...e, model: runs })
    const t = await $.clock.now()

    if (r.usage !== null) {
      const size = sizeOf(r.usage)
      await update($, ctx, () => ({ tokens: size, lastStepAt: t, lastFamily: familyOf(runs) }))
    }
    await tally($, familyOf(runs), r.usage)

    return r
  })

  // Subagents start with an empty context, so a lighter model costs them no cache.
  on('agent.spawn', async ($, e, next) => {
    if (e.model !== undefined || e.subagentType === 'fork') {
      await update($, stats, s => ({ ...s, agents: s.agents + 1 }))

      return next(e)
    }

    const pinned = await read($, pin)
    const pick = pinned !== '' ? { model: pinned, why: 'pinned' } : chooseAgent(e.subagentType, e.description, e.prompt, e.parentModel, await modeOf($, optionMode))
    await update($, stats, s => ({ ...s, agents: s.agents + 1, lighterAgents: s.lighterAgents + (pick.model === '' ? 0 : 1) }))

    return next(pick.model === '' ? e : { ...e, model: pick.model })
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)

    try {
      await measure($)
    } catch {
      // usage is a nicety; never fail a turn over it
    }

    return done
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const d = await read($, decision)

    if (e.props.hasSurvey || d === null || !d.isResolved || (await read($, isQuiet)) || (await modeOf($, optionMode)) === 'off') {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const u = await read($, usage)
    const s = await read($, stats)
    const where = d.model === '' ? 'session model' : cap(d.model)

    return (
      <Box flexDirection="row" alignItems="center" gap="sm" flexWrap="wrap">
        <Text>
          <Text color="claude">◆</Text> {`Router: ${where}`}
          <Text dimColor>{` · ${d.tier}${d.why === '' ? '' : ` · ${d.why}`}`}</Text>
        </Text>
        <Text dimColor>
          {[
            s.agents > 0 ? `${s.lighterAgents}/${s.agents} agents lighter` : '',
            u !== null && u.planPercent >= 0 ? `plan ${Math.round(u.planPercent)}%` : '',
            u !== null && u.hasCost ? `~$${u.usd.toFixed(2)} est.` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <Button key="route-hide" plain dimColor label="Hide" onPress={() => update($, isQuiet, () => true)} />
      </Box>
    )
  })
}
