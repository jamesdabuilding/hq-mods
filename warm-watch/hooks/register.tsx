import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const KEY = 'cache-cooling'
const TITLE = 'Cache going cold'

const lastAt = atom({ plugin: 'warm-watch', key: 'lastAt' } as const, 0)
const tokens = atom({ plugin: 'warm-watch', key: 'tokens' } as const, 0)
const alertedFor = atom({ plugin: 'warm-watch', key: 'alertedFor' } as const, 0)
const now = atom({ plugin: 'warm-watch', key: 'now' } as const, 0)
const surface = atom({ plugin: 'warm-watch', key: 'surface' } as const, '')
const isApplied = atom({ plugin: 'warm-watch', key: 'isApplied' } as const, false)

type CacheTaxStatus = {
  keepwarm: 'on' | 'stopped' | 'off'
  leftMs: number
  cold: boolean | null
  always?: boolean
  alwaysMs?: number | null
  guard?: 'refuse' | 'warn'
}

const WINDOWS: Record<string, number> = { '6h': 6, '12h': 12, '24h': 24, '48h': 48, '72h': 72, '168h': 168 }

/** cache-tax's read-only status, where cache-tax is installed. */
async function cacheTax($: EngineInterface): Promise<CacheTaxStatus | null> {
  try {
    // Throws where cache-tax is not installed, which reads as null.
    return await ($ as unknown as { cacheTax: { status: () => Promise<CacheTaxStatus> } }).cacheTax.status()
  } catch {
    return null
  }
}

/**
 * Applies the person's cache policy through cache-tax's own commands, once a
 * session starts: a cold send only shows its price, and chats stay warm for the
 * chosen time after their last turn. Runs a command only where cache-tax's
 * setting differs, so a session that already matches changes nothing.
 */
async function applyPolicy($: EngineInterface, coldSend: string, keepFor: string): Promise<void> {
  if (await read($, isApplied)) {
    return
  }

  const ct = await cacheTax($)

  if (ct === null) {
    return
  }

  await update($, isApplied, () => true)
  const done: string[] = []

  if (coldSend === 'warn' && ct.guard !== undefined && ct.guard !== 'warn') {
    await $.command.run({ command: 'cache-tax', args: 'guard warn' })
    done.push('cold sends show their price without asking')
  }

  const hours = WINDOWS[keepFor]

  if (hours !== undefined && (ct.always !== true || ct.alwaysMs !== hours * 3600000)) {
    await $.command.run({ command: 'keepwarm', args: `always ${keepFor}` })
    done.push(`chats stay warm for ${keepFor} after your last message`)
  }

  if (done.length > 0) {
    $.ui.toast(`warm-watch: ${done.join('; ')}.`, { timeoutMs: 8000 })
  }
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
async function check($: EngineInterface, ttlMs: number, warnMs: number, minTokens: number): Promise<void> {
  const t = await $.clock.now()
  await update($, now, () => t)

  const last = await read($, lastAt)
  const size = await read($, tokens)

  if (last === 0 || size < minTokens) {
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
  const r = await $.command.run({ command: 'keepwarm', args: window })
  await $.ui.cancelNotify(KEY).catch(() => undefined)
  $.ui.toast(r.text ?? `Keeping warm for ${window}.`, { timeoutMs: 6000 })
  const last = await read($, lastAt)
  await update($, alertedFor, () => last)
}

export const register: Register = (on, options) => {
  const ttlMs = (typeof options.ttlMinutes === 'number' ? options.ttlMinutes : 60) * 60000
  const warnMs = Math.min(ttlMs - 60000, (typeof options.warnMinutes === 'number' ? options.warnMinutes : 10) * 60000)
  const minTokens = typeof options.minContextTokens === 'number' ? options.minContextTokens : 30000
  const coldSend = options.coldSend === 'ask' ? 'ask' : 'warn'
  const keepFor = typeof options.keepWarmFor === 'string' ? options.keepWarmFor : '24h'

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const where = e.surface ?? ''
    await update($, surface, () => where)
    await $.command.register({ name: 'warm', description: 'When this conversation’s cache goes cold, and keep it warm' })
    $.clock.every(30000, () => check($, ttlMs, warnMs, minTokens))
    // After cache-tax has read its own settings for the session.
    $.clock.after(3000, () => applyPolicy($, coldSend, keepFor))

    return started
  })

  // A backstop for the timer: apply the policy as the first turn starts.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await applyPolicy($, coldSend, keepFor)
    }

    return next(e)
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

    if (word !== '') {
      await keepWarm($, word)
    }

    const last = await read($, lastAt)
    const t = await $.clock.now()
    const ct = await cacheTax($)
    const left = last === 0 ? 0 : Math.round((last + ttlMs - t) / 60000)
    const state = last === 0 ? 'No request yet this session.' : left > 0 ? `Warm for about ${left} more min.` : 'Likely cold now.'
    const tax = ct === null ? 'cache-tax is not installed, so Keep warm is unavailable.' : `cache-tax keepwarm: ${ct.keepwarm}${ct.keepwarm === 'on' ? ` (${Math.round(ct.leftMs / 60000)} min left)` : ''}.`

    return { text: `${state} Context ${kTokens(await read($, tokens))} tokens. ${tax} Warns ${Math.round(warnMs / 60000)} min before cold. /warm 90m keeps it warm.` }
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
