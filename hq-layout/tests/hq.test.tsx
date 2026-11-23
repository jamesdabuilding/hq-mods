import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'hq-layout',
  component: 'Pane',
  requestId: 'hq',
  props: { title: 'HQ', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const BAND = {
  plugin: 'hq-layout',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

test('a session fills the feed, the week strip and the dock', { options: { timeZone: 'UTC' } }, async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 10, 22, 15, 56) })
  on('command.register', () => ({ value: { command: 'hq' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('theme.set', () => ({ value: { isDrawn: true, requestId: 'look' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'Redesign the dashboard header', wait: false, origin: { kind: 'composer' } })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/Header.tsx', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'TodoWrite', todos: [
    { content: 'Draft layout', status: 'completed', activeForm: 'Drafting' },
    { content: 'Wire the dock', status: 'in_progress', activeForm: 'Wiring' },
  ] })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Edited src\/Header.tsx/ }))?.text).toBe('Edited src/Header.tsx')

    await ui.press({ key: 'feed-older' })
    expect((await ui.find({ type: 'Text', text: /Redesign the dashboard/ }))).toBeTruthy()

    await ui.press({ key: 'dock-today' })
    expect((await ui.find({ type: 'Text', text: /Wire the dock/ }))).toBeTruthy()

    await ui.press({ key: 'dock-metrics' })
    expect((await ui.find({ type: 'Text', text: /^TOOL CALLS$/ }))).toBeTruthy()
    await ui.press({ key: 'dock-home' })
    await ui.press({ key: 'feed-newer' })
    await ui.press({ key: 'feed-record' })
    expect((await ui.find({ type: 'Text', text: /^\/repo\/src\/Header.tsx$/ }))).toBeTruthy()
    await ui.press({ key: 'feed-record' })
    await ui.unmount()

    const band = await $.ui.mount({ ...BAND, surface })
    expect((await band.find({ type: 'Text', text: /1 item/ }))).toBeTruthy()
    await band.unmount()
  }
})
