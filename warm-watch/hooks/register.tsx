import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const KEY = 'cache-cooling'
const TITLE = 'Cache going cold'

const lastAt = atom({ plugin: 'warm-watch', key: 'lastAt' } as const, 0)
const tokens = atom({ plugin: 'warm-watch', key: 'tokens' } as const, 0)
const alertedFor = atom({ plugin: 'warm-watch', key: 'alertedFor' } as const, 0)
const now = atom({ plugin: 'warm-watch', key: 'now' } as const, 0)
const surface = atom({ plugin: 'warm-watch', key: 'surface' } as const, '')
const compactedFor = atom({ plugin: 'warm-watch', key: 'compactedFor' } as const, 0)

const KEEP = 'Keep the goal, the decisions made and why, open tasks, file paths touched, and the exact next step.'

type Cfg = { ttlMs: number; warnMs: number; minTokens: number; compactIdleMs: number; compactAbove: number }

type CacheTaxStatus = {
  keepwarm: 'on' | 'stopped' | 'off'
  leftMs: number
  cold: boolean | null
  always?: boolean
  alwaysMs?: number | null
  guard?: 'refuse' | 'warn'
}


/** cache-tax's read-only status, where cache-tax is installed. */
async function cacheTax($: EngineInterface): Promise<CacheTaxStatus | null> {
  try {
    // Throws where cache-tax is not installed, which reads as null.
    return await ($ as unknown as { cacheTax: { status: () => Promise<CacheTaxStatus> } }).cacheTax.status()
  } catch {
    return null
  }
}

/** Whether cache-tax is set up to keep chats warm, and the command that fixes it if not. */
function policyLine(ct: CacheTaxStatus | null): string {
  if (ct === null) {
    return 'cache-tax is not installed.'
  }

  const fixes: string[] = []

  if (ct.guard !== undefined && ct.guard !== 'warn') {
    fixes.push('/cache-tax guard warn')
  }
  if (ct.always !== true) {
    fixes.push('/keepwarm always 24h')
  }

  const now = `cache-tax: cold sends ${ct.guard === 'warn' ? 'show their price' : 'ask first'}; keep warm ${ct.always === true ? `${Math.round((ct.alwaysMs ?? 0) / 3600000)}h after each turn` : `${ct.keepwarm}`}.`

  return fixes.length === 0 ? now : `${now} To keep chats warm, run ${fixes.join(' and ')} once on this machine.`
}

function kTokens(n: number): string {
  return `${Math.round(n / 1000)}k`
}

function message(minutes: number, size: number): string {
  return `This conversation's prompt cache goes cold in about ${minutes} min. Its ${kTokens(size)} tokens would be re-cached at full price on your next message. Open the session and tap Keep warm.`
}

/** Books the warning on clients that can hold one (desktop, phone), to fire even with the session out of reach. */
async function book($: EngineInterface, at: number, size: number, warnMs: number): Promise<void> {
  const where = await read($, surface)

  if (where !== 'desktop' && where !== 'mobile') {
    return
  }

  try {
    await $.ui.cancelNotify(KEY)
    await $.ui.notify(message(Math.round(warnMs / 60000), size), { title: TITLE, key: KEY, at, untilBack: true })
  } catch {
    // a refused or unsupported notification leaves the in-session warning
  }
}

/** Runs every half minute: raises the warning in-session when its moment comes. */
/**
 * Compacts the conversation now, between turns. While the cache is still warm
 * this reads the long context at the cache-read price, so the next cold
 * rebuild only has the short summary to write.
 */
async function compactNow($: EngineInterface, why: string): Promise<void> {
  const last = await read($, lastAt)
  await update($, compactedFor, () => last)

  try {
    const r = await $.session.compact({ instructions: KEEP })

    if ('skip' in r && typeof r.skip === 'string') {
      $.ui.toast(`warm-watch: compaction skipped: ${r.skip}`, { timeoutMs: 8000 })
      return
    }

    await update($, alertedFor, () => last)
    await $.ui.cancelNotify(KEY).catch(() => undefined)
    $.ui.toast(`warm-watch: ${why}: compacted while the cache was warm, so the next rebuild is small.`, { timeoutMs: 8000 })
  } catch (error) {
    $.ui.toast(`warm-watch: could not compact now (${String(error).slice(0, 120)}). Try /compact.`, { timeoutMs: 8000 })
  }
}

async function check($: EngineInterface, cfg: Cfg): Promise<void> {
  const { ttlMs, warnMs, minTokens, compactIdleMs, compactAbove } = cfg
  const t = await $.clock.now()
  await update($, now, () => t)

  const last = await read($, lastAt)
  const size = await read($, tokens)

  if (last === 0 || size < minTokens) {
    return
  }

  const idle = t - last

  // A big chat idle long enough: compact it while the cache is still warm.
  if (compactIdleMs > 0 && size >= compactAbove && idle >= compactIdleMs && idle < ttlMs - 60000 && (await read($, compactedFor)) !== last) {
    await compactNow($, `idle ${Math.round(idle / 60000)} min at ${kTokens(size)} tokens`)
    return
  }

  const left = last + ttlMs - t

  if (left <= 0 || left > warnMs || (await read($, alertedFor)) === last) {
    return
  }

  const ct = await cacheTax($)

  if (ct?.keepwarm === 'on') {
    return
  }

  await update($, alertedFor, () => last)
  $.ui.toast(`Cache goes cold in ${Math.max(1, Math.round(left / 60000))} min. Keep warm from the row above the prompt.`, { timeoutMs: 10000 })

  // A terminal can't book ahead, so it is told now; a booked client already fired.
  const where = await read($, surface)

  if (where !== 'desktop' && where !== 'mobile') {
    try {
      await $.ui.notify(message(Math.max(1, Math.round(left / 60000)), size), { title: TITLE, key: KEY })
    } catch {
      // the toast and the row still say it
    }
  }
}

async function keepWarm($: EngineInterface, window: string): Promise<void> {
  const last = await read($, lastAt)

  try {
    const r = await $.command.run({ command: 'keepwarm', args: window })
    await $.ui.cancelNotify(KEY).catch(() => undefined)
    $.ui.toast(r.text ?? `Keeping warm for ${window}.`, { timeoutMs: 6000 })
    await update($, alertedFor, () => last)
  } catch {
    $.ui.toast(`warm-watch: type /keepwarm ${window} to keep this chat warm.`, { timeoutMs: 10000 })
  }
}

export const register: Register = (on, options) => {
  const ttlMs = (typeof options.ttlMinutes === 'number' ? options.ttlMinutes : 60) * 60000
  const warnMs = Math.min(ttlMs - 60000, (typeof options.warnMinutes === 'number' ? options.warnMinutes : 10) * 60000)
  const minTokens = typeof options.minContextTokens === 'number' ? options.minContextTokens : 30000
  const idleWord = typeof options.compactWhenIdle === 'string' ? options.compactWhenIdle : 'off'
  const cfg: Cfg = {
    ttlMs,
    warnMs,
    minTokens,
    compactIdleMs: /^\d+m$/.test(idleWord) ? Number(idleWord.slice(0, -1)) * 60000 : 0,
    compactAbove: typeof options.compactAbove === 'number' ? options.compactAbove : 150000,
  }

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const where = e.surface ?? ''
    await update($, surface, () => where)
    await $.command.register({ name: 'warm', description: 'When this conversation’s cache goes cold, and keep it warm' })
    $.clock.every(30000, () => check($, cfg))

    return started
  })

  // The main conversation's requests are what keep its cache alive.
  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)

    if (e.agentId === undefined && r.usage !== null) {
      const u = r.usage
      const size = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      const t = await $.clock.now()
      await update($, lastAt, () => t)
      await update($, tokens, () => size)
      await update($, now, () => t)
    }

    return r
  })

  // Once a turn ends, book the warning for its cooling moment.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const last = await read($, lastAt)
    const size = await read($, tokens)

    if (last > 0 && size >= minTokens) {
      await book($, last + ttlMs - warnMs, size, warnMs)
    }

    return done
  })

  on('command.run', { command: 'warm' }, async ($, e) => {
    const word = e.args.trim()

    if (word === 'compact') {
      return { text: 'Run /compact now to shrink this chat while its cache is warm; warm-watch\'s Compact now button and the Compact when idle option do the same.' }
    }


    const last = await read($, lastAt)
    const t = await $.clock.now()
    const ct = await cacheTax($)
    const left = last === 0 ? 0 : Math.round((last + ttlMs - t) / 60000)
    const state = last === 0 ? 'No request yet this session.' : left > 0 ? `Warm for about ${left} more min.` : 'Likely cold now.'
    const tax = ct === null ? 'cache-tax is not installed, so Keep warm is unavailable.' : `cache-tax keepwarm: ${ct.keepwarm}${ct.keepwarm === 'on' ? ` (${Math.round(ct.leftMs / 60000)} min left)` : ''}.`

    return { text: `${state} Context ${kTokens(await read($, tokens))} tokens. ${tax} Warns ${Math.round(warnMs / 60000)} min before cold. /keepwarm 90m keeps it warm; /compact while warm makes the next rebuild small. ${policyLine(ct)}` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const last = await read($, lastAt)
    const size = await read($, tokens)
    const t = (await read($, now)) || last
    const left = last + ttlMs - t

    if (e.props.hasSurvey || last === 0 || size < minTokens || left > warnMs || left <= 0) {
      return next(e)
    }

    const ct = await cacheTax($)

    if (ct?.keepwarm === 'on') {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const minutes = Math.max(1, Math.round(left / 60000))

    return (
      <Box flexDirection="row" alignItems="center" gap="sm" flexWrap="wrap">
        <Text>
          <Text color="warning">❄</Text> {`Cache goes cold in ${minutes} min`}
          <Text dimColor>{` · ${kTokens(size)} tokens to re-cache`}</Text>
        </Text>
        <Button key="warm-compact" label="Compact now" onPress={() => compactNow($, 'you asked')} />
        {ct === null ? (
          <Text dimColor>Install cache-tax to keep it warm</Text>
        ) : (
          <Box flexDirection="row" gap="xs">
            <Button key="warm-90m" variant="primary" label="Keep warm 90m" onPress={() => keepWarm($, '90m')} />
            <Button key="warm-3h" label="3h" onPress={() => keepWarm($, '3h')} />
            <Button key="warm-let" plain dimColor label="Let it cool" onPress={() => update($, alertedFor, () => last).then(() => update($, lastAt, () => 0))} />
          </Box>
        )}
      </Box>
    )
  })
}
