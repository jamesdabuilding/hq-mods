import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'hq-layout',
  component: 'Pane',
  requestId: 'hq',
  props: { title: 'HQ', isFocused: false, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const LIST = {
  ccr: {
    data: [
      { id: 'session_SELF', title: 'This session', status_bucket: 'SESSION_STATUS_BUCKET_WORKING', updated_at: '2026-11-23T06:50:00Z', origin: 'desktop_app' },
      { id: 'session_DONE', title: 'Landing page', status_bucket: 'SESSION_STATUS_BUCKET_COMPLETED', updated_at: '2026-11-21T13:50:00Z', post_turn_summary: { recent_action: 'Copy is drafted; build awaits your decision.' } },
      { id: 'session_BLOCK', title: 'Server setup', status_bucket: 'SESSION_STATUS_BUCKET_BLOCKED', updated_at: '2026-11-22T02:51:00Z', post_turn_summary: { needs_action: 'run the setup command on the server' } },
      { id: 'session_WORK', title: 'Photo app', status_bucket: 'SESSION_STATUS_BUCKET_WORKING', updated_at: '2026-11-23T06:50:00Z', unread: true },
    ],
  },
}

test('HQ briefs, answers and stops other sessions', { options: { timeZone: 'UTC' } }, async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 10, 23, 7, 0) })
  const calls: { tool: string; args: Record<string, unknown> }[] = []
  on('mcp.call', (_, e) => {
    calls.push({ tool: e.tool, args: e.args })
    const text = e.tool === 'get_session' ? '{"id":"session_SELF"}' : e.tool === 'list_sessions' ? `<wrapped>${JSON.stringify(LIST)}</wrapped>` : 'ok'
    return { value: { content: [{ type: 'text', text }], isError: false } }
  })
  on('command.register', () => ({ value: { command: 'hq' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('theme.set', () => ({ value: { isDrawn: true, requestId: 'look' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'dock-sessions' })
    await ui.press({ key: 'sessions-refresh' })

    expect(await ui.find({ type: 'Text', text: /Needs: run the setup command/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /build awaits your decision/ })).toBeTruthy()
    expect(JSON.stringify(await ui.drawn())).toContain('https://claude.ai/code/session_BLOCK')
    // No reply box or stop for this very session.
    expect(await ui.find({ key: 'reply-session_SELF' })).toBeUndefined()

    await ui.input({ key: 'reply-session_BLOCK', text: 'I ran it, carry on' })
    expect(await ui.find({ type: 'Text', text: /Sent .*I ran it, carry on/ })).toBeTruthy()

    await ui.press({ key: 'stop-session_WORK' })

    await ui.press({ key: 'dock-needs' })
    expect(await ui.find({ type: 'Text', text: /run the setup command/ })).toBeTruthy()
    await ui.unmount()
  }

  const sends = calls.filter(c => c.tool === 'send_message')
  expect(sends[0]?.args).toEqual({ session_id: 'session_BLOCK', message: 'I ran it, carry on' })
  expect(calls.some(c => c.tool === 'interrupt_session' && c.args.session_id === 'session_WORK')).toBe(true)
})
