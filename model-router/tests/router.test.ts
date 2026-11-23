import { expect, test } from 'claude-code/testing'

import { chooseAgent, chooseMain, classify } from '../hooks/route'

const plan = { mode: 'balanced', pin: '', home: 'claude-opus-5-5', lastFamily: '', contextTokens: 0, isCacheCold: true, switchBudgetTokens: 40000 }

test('it reads the assignment', async () => {
  expect(classify('what does the --watch flag do?').tier).toBe('light')
  expect(classify('fix the typo in the README title').tier).toBe('light')
  expect(classify('add a dark mode toggle to the settings page').tier).toBe('standard')
  expect(classify('TypeError: x is undefined\n    at render (app.tsx:42)').tier).toBe('standard')
  expect(classify('refactor the auth module and plan the migration to OAuth').tier).toBe('heavy')
  expect(classify('why does this deadlock under load?').tier).toBe('heavy')
  expect(classify('yes, do it').tier).toBe('follow')
})

test('performance first: heavy work stays on the strongest model', async () => {
  expect(chooseMain('heavy', plan).model).toBe('')
  expect(chooseMain('heavy', { ...plan, lastFamily: 'sonnet', isCacheCold: false, contextTokens: 200000 }).model).toBe('')
})

test('light work moves down only while switching is cheap', async () => {
  expect(chooseMain('light', plan).model).toBe('sonnet')
  const kept = chooseMain('light', { ...plan, lastFamily: 'opus', isCacheCold: false, contextTokens: 150000 })
  expect(kept.model).toBe('')
  expect(kept.keptForCache).toBe(true)
  expect(chooseMain('light', { ...plan, lastFamily: 'opus', isCacheCold: true, contextTokens: 150000 }).model).toBe('sonnet')
})

test('a follow-up keeps whatever is running, and modes and pins hold', async () => {
  expect(chooseMain('follow', { ...plan, lastFamily: 'sonnet' }).model).toBe('sonnet')
  expect(chooseMain('light', { ...plan, mode: 'conservative' }).model).toBe('')
  expect(chooseMain('standard', { ...plan, mode: 'aggressive' }).model).toBe('sonnet')
  expect(chooseMain('light', { ...plan, mode: 'aggressive' }).model).toBe('haiku')
  expect(chooseMain('heavy', { ...plan, pin: 'sonnet' }).model).toBe('sonnet')
  expect(chooseMain('light', { ...plan, home: 'claude-sonnet-5-5' }).model).toBe('')
})

test('subagents get the lightest model that fits', async () => {
  expect(chooseAgent('Explore', 'Find auth handlers', 'Locate every place tokens are refreshed', 'claude-opus-5-5', 'balanced').model).toBe('haiku')
  expect(chooseAgent('general-purpose', 'Implement CSV export', 'Add an export button', 'claude-opus-5-5', 'balanced').model).toBe('sonnet')
  expect(chooseAgent('general-purpose', 'Security audit', 'Audit the API for injection', 'claude-opus-5-5', 'balanced').model).toBe('')
  expect(chooseAgent('Plan', 'Plan the feature', 'Design it', 'claude-opus-5-5', 'balanced').model).toBe('')
})

test('the spawn hook rewrites a subagent with no model, and leaves a chosen one', async ($, on) => {
  const seen: (string | undefined)[] = []
  on('agent.spawn', (_, e) => {
    seen.push(e.model)
    return { model: e.model ?? e.parentModel, agentId: `a${seen.length}` }
  })
  const base = { tool_use_id: 't', prompt: 'Locate the config loader', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-5-5' } as const
  await $.agent.spawn({ ...base, description: 'Find config loader', subagentType: 'Explore' })
  await $.agent.spawn({ ...base, description: 'Find config loader', subagentType: 'Explore', model: 'opus' })
  expect(seen).toEqual(['haiku', 'opus'])
})
