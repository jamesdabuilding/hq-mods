import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'agent-deck',
  component: 'Pane',
  requestId: 'agents',
  props: { title: 'Agents', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const BAND = {
  plugin: 'agent-deck',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: true, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

test('an agent shows what it is doing, its progress, then done', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  mock.store(on, { 'steps:Explore': [4, 4, 4] })
  on('command.register', () => ({ value: { command: 'deck' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('agent.list', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('agent.report', (_, e) => ({ text: e.text }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({
    tool_use_id: 't1', prompt: 'Find where auth tokens are refreshed', description: 'Find token refresh',
    subagentType: 'Explore', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-5-5',
  })
  await $.tool.call({ tool: 'Grep', pattern: 'refreshToken', agentId: 'a1' })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/auth/session.ts', agentId: 'a1' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Now: Reading auth\/session.ts/ }))).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /Explore · Haiku 5.5/ }))).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /~50%/ })).toBeTruthy()
    await ui.unmount()

    const band = await $.ui.mount({ ...BAND, surface })
    expect((await band.find({ key: 'agents-open' }))?.text).toMatch(/1 agent working/)
    await band.unmount()
  }

  await $.agent.report({ agentId: 'a1', subagentType: 'Explore', provider: { plugin: 'engine', tier: 'core' }, status: 'completed', text: 'Found it' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /1\/1 done/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^Finished$/ })).toBeTruthy()
  await ui.unmount()
})
