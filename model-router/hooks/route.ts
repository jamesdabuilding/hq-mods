import type { Tier } from '../types'

// Pure routing rules: no `$`, so they are cheap, instant and testable. No model
// call is spent deciding which model to call.

const HEAVY = new RegExp(
  [
    'architect', 'system design', 'design (a|an|the) ', 'refactor', 'migrat', 'race condition', 'deadlock',
    'concurren', 'security', 'vulnerab', 'exploit', 'threat model', 'performance', 'optimi[sz]', 'profil',
    'memory leak', 'root cause', 'debug', 'investigat', 'why (does|is|did|do|are|would)', 'complex', 'tricky',
    'trade-?offs?', 'strategy', 'plan (out|for|the)', 'review', 'audit', 'prove', 'proof', 'algorithm',
    'ultrathink', 'think (hard|deeply|carefully)', 'from scratch', 'end-to-end', 'whole (app|codebase|repo)',
    'across (the|all|every)', 'multi-?step', 'figure out',
  ].join('|'),
  'i',
)

const LIGHT_OPENERS = /^(what|whats|what's|where|which|who|when|how (do|can|would) i|is there|are there|can you (show|list|tell|explain)|show|list|explain|summari[sz]e|rename|format|translate|convert|define|tell me|remind me|give me (a|the) (list|summary|command))\b/i
const LIGHT_WORDS = /\b(typo|spelling|quick|small|tiny|simple|one-?liner|rename|reformat|bump|comment out|sort (the|this)|capitali[sz]e)\b/i
const FOLLOW = /^(?:(?:y|yes|yep|yeah|ok|okay|sure|go|go ahead|continue|keep going|do it|do that|proceed|sounds good|lgtm|perfect|great|thanks|thank you|next|retry|try again|again|please)[\s,.!]*)+$/i
const CODEY = /```|\bTraceback\b|\bat \S+:\d+|\bError:|\bException\b|^\s*[{}<>]/m

export function classify(text: string): { tier: Tier; why: string } {
  const t = text.trim()

  if (t.length <= 40 && FOLLOW.test(t)) {
    return { tier: 'follow', why: 'a follow-up keeps the current model' }
  }
  if (t.length > 1500) {
    return { tier: 'heavy', why: 'a long, detailed brief' }
  }

  const heavy = HEAVY.exec(t)

  if (heavy !== null) {
    return { tier: 'heavy', why: `"${heavy[0].trim()}" calls for the strongest model` }
  }
  if (CODEY.test(t)) {
    return { tier: 'standard', why: 'code or an error to work through' }
  }
  if (t.length <= 280 && (LIGHT_OPENERS.test(t) || LIGHT_WORDS.test(t))) {
    return { tier: 'light', why: 'a short question or small change' }
  }

  return { tier: 'standard', why: 'ordinary build work' }
}

const RANK: Record<string, number> = { haiku: 1, sonnet: 2, opus: 3, fable: 4 }

/** The family of a model id or alias: claude-opus-5-5 → opus. */
export function familyOf(model: string): string {
  const m = /(haiku|sonnet|opus|fable)/i.exec(model)

  return m?.[1]?.toLowerCase() ?? ''
}

export function rankOf(model: string): number {
  return RANK[familyOf(model)] ?? 3
}

export type Plan = {
  mode: string
  pin: string
  home: string
  lastFamily: string
  contextTokens: number
  isCacheCold: boolean
  switchBudgetTokens: number
}

/**
 * Which model a main-conversation turn runs on: '' for the session's own.
 * Performance first: a heavy turn always gets the session's model, and moving
 * back up is always allowed. Moving down is allowed only where it is cheap: a
 * small context, or a cache that has gone cold anyway.
 */
export function chooseMain(tier: Tier, p: Plan): { model: string; why: string; keptForCache: boolean } {
  if (p.pin !== '') {
    return { model: rankOf(p.pin) >= rankOf(p.home) ? '' : p.pin, why: `pinned to ${p.pin}`, keptForCache: false }
  }
  if (p.mode === 'off' || p.mode === 'conservative') {
    return { model: '', why: 'main conversation left alone', keptForCache: false }
  }

  const homeFamily = familyOf(p.home)
  const current = p.lastFamily === '' ? homeFamily : p.lastFamily
  let target = homeFamily

  if (tier === 'follow') {
    target = current
  } else if (tier === 'light') {
    target = p.mode === 'aggressive' ? 'haiku' : 'sonnet'
  } else if (tier === 'standard' && p.mode === 'aggressive') {
    target = 'sonnet'
  }

  // Never above what the person chose.
  if ((RANK[target] ?? 3) > rankOf(p.home)) {
    target = homeFamily
  }

  const isDown = (RANK[target] ?? 3) < (RANK[current] ?? 3)

  if (isDown && !p.isCacheCold && p.contextTokens > p.switchBudgetTokens) {
    return {
      model: current === homeFamily ? '' : current,
      why: `stayed on ${current}: switching would re-cache ~${Math.round(p.contextTokens / 1000)}k tokens`,
      keptForCache: true,
    }
  }

  return { model: target === homeFamily ? '' : target, why: '', keptForCache: false }
}

const LIGHT_AGENT = /\b(find|search|locate|look ?up|list|grep|scan|read|skim|summari[sz]e|fetch|collect|gather|check (whether|if)|where (is|are)|explore|inventory|map (out )?the)\b/i
const LIGHT_TYPES = new Set(['explore', 'web-fetch', 'statusline-setup', 'claude-code-guide'])
const HEAVY_TYPES = new Set(['plan', 'fork'])

/** A subagent's model: '' leaves it to the agent's own definition or the parent. */
export function chooseAgent(type: string, description: string, prompt: string, home: string, mode: string): { model: string; why: string } {
  if (mode === 'off') {
    return { model: '', why: 'routing off' }
  }

  const t = type.toLowerCase()
  const text = `${description}\n${prompt}`

  if (HEAVY_TYPES.has(t) || HEAVY.test(text)) {
    return { model: '', why: 'hard task: kept on the strongest model' }
  }
  if (LIGHT_TYPES.has(t) || (LIGHT_AGENT.test(description) && prompt.length < 4000)) {
    return { model: rankOf(home) > 1 ? 'haiku' : '', why: 'search and reading work' }
  }

  return { model: rankOf(home) > 2 ? 'sonnet' : '', why: 'build work' }
}
