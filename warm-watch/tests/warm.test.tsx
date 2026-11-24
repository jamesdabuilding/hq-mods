import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'warm-watch',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const USAGE = { input_tokens: 2000, output_tokens: 800, cache_read_input_tokens: 110000, cache_creation_input_tokens: 8000 }

test('warns before the cache cools and keeps it warm through cache-tax', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000_000 })
  const notes: { text: string; at?: number }[] = []
  const commands: string[] = []
  on('command.register', () => ({ value: { command: 'warm' } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.cancelNotify', () => ({ value: { isSent: true } }))
  on('ui.notify', (_, e) => {
    notes.push({ text: e.text, at: e.at })
    return { value: { isSent: true, channel: 'client' } }
  })
  on('command.run', (_, e) => {
    commands.push(`${e.command} ${e.args ?? ''}`)
    return { text: 'Keeping warm for 90m.' }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.step', (async function* () {
    return { turnId: 't1', index: 0, answer: 'ok', toolUses: [], stopReason: 'end_turn' as const, usage: USAGE }
  }) as never)
  on('turn.complete', () => ({ text: 'ok' }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 40 })) {
    // the step's chunks
  }
  await $.turn.complete({ turnId: 't1', answer: 'ok', stopReason: 'end_turn' } as never)

  // Booked on the desktop for 50 minutes after the last request.
  expect(notes[0]?.at).toBe(1_000_000_000 + 50 * 60000)
  expect(notes[0]?.text).toMatch(/120k tokens/)

  // Early on: no row.
  for (const surface of ['terminal', 'desktop'] as const) {
    const quiet = await $.ui.mount({ ...BAND, surface })
    expect(await quiet.find({ key: 'warm-90m' })).toBeUndefined()
    await quiet.unmount()
  }

  // Ten minutes from cold: the row, and Keep warm runs /keepwarm.
  await clock.advance(51 * 60000)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /Cache goes cold in \d+ min/ })).toBeTruthy()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // Without cache-tax in the test, the row says to install it.
  expect(await ui.find({ type: 'Text', text: /Install cache-tax/ })).toBeTruthy()
  await ui.unmount()
  expect(commands).toEqual([])

})
