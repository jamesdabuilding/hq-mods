import type { ThemeSetArgs, ThemeSound, ThemeStyle } from 'claude-code'

import { makeColors } from './make-colors.js'

// Deep teal-black at night, pale sage by day, one warm peach accent.
export const { theme, problems } = makeColors({
  label: 'HQ',
  roles: { accent: '#efbc90', danger: '#e07a6a', success: '#8fc7a5', warning: '#e6b55c', pro: '#a99bd6' },
  light: {
    gray: {
      anchors: {
        'surface-0': '#e3eae7',
        'surface-1': '#ecf1ee',
        'surface-2': '#f5f7f4',
        'surface-3': '#f5f7f4',
        'text-primary': '#0f2a31',
        'text-secondary': '#2c474d',
        'text-muted': '#4a6266',
      },
    },
    roles: { accent: '#b8693a' },
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#071a20',
        'surface-1': '#0c2229',
        'surface-2': '#112a31',
        'surface-3': '#132d33',
        'text-primary': '#f4f5f1',
        'text-secondary': '#c4d5d8',
        'text-muted': '#a8bab7',
      },
    },
  },
})

const PEACH = '#efbc90'
const INK = '#1d130b'

// Glass cards on the landscape: the reply is a frosted panel, the person's
// words a peach chip like HQ's primary buttons, tool calls quiet pills.
export const STYLE: ThemeStyle = {
  Text: { fontFamily: ['sans'], fontSize: 15, lineHeight: 24 },
  Heading: { fontFamily: ['sans'], fontWeight: 'semibold', letterSpacing: -0.5 },
  UserMessage: {
    color: INK,
    backgroundColor: PEACH,
    fontWeight: 'medium',
    radius: 14,
    paddingX: 16,
    paddingY: 10,
    shadow: { y: 6, blur: 18, color: '#00000033' },
  },
  AssistantMessage: {
    backgroundColor: 'surface-1',
    radius: 20,
    paddingX: 22,
    paddingY: 18,
    borderWidth: 1,
    borderColor: '#9fb8b51f',
    shadow: { y: 12, blur: 32, color: '#00000038' },
  },
  ToolUse: {
    backgroundColor: 'surface-2',
    radius: 12,
    paddingX: 10,
    borderWidth: 1,
    borderColor: '#efbc902e',
  },
}

// A low wind over water, the odd distant chime; soft cues.
export const SOUND: ThemeSound = {
  ambience: {
    layers: [
      { wave: 'brown', drone: true, gain: 0.18, filter: { type: 'lowpass', hz: 420 } },
      { wave: 'sine', notes: ['A2', 'E3'], drone: true, gain: 0.06, tremolo: { hz: 0.08, depth: 0.5 } },
      { wave: 'bell', notes: ['E5', 'A5', 'B5', 'C#6'], scatter: 0.04, gain: 0.08, release: 3 },
    ],
    reverb: 0.4,
  },
  cues: {
    send: { layers: [{ wave: 'sine', notes: ['A4'], glide: 2, gain: 0.25, release: 0.25 }] },
    done: { layers: [{ wave: 'bell', notes: ['E5', 'A5'], step: 0.12, gain: 0.3, release: 1.2 }] },
    error: { layers: [{ wave: 'triangle', notes: ['E3', 'C3'], step: 0.12, gain: 0.25, release: 0.4 }] },
  },
}

export const LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: 'hq-dusk', glass: { blur: 22, opacity: 0.62 } },
  style: STYLE,
  sound: SOUND,
}

/** The same look for a build that refuses `style` or `sound`. */
export const PLAIN_LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: 'hq-dusk', glass: { blur: 22, opacity: 0.62 } },
}
