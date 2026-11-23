// An original ink-wash landscape in the spirit of a calm headquarters at dusk:
// contour-lined mountains, curling cream clouds and a warm river of light.
// Everything is generated as plain vector so it stays small and crisp.

const W = 1600
const H = 1000

const n = (v: number): string => String(Math.round(v))

type Peak = { x: number; h: number; w: number }

function ridge(peaks: readonly Peak[], base: number, x: number): number {
  let lift = 0

  for (const p of peaks) {
    const d = (x - p.x) / p.w
    lift += p.h * Math.exp(-d * d)
  }

  return base - lift
}

function mountain(id: string, peaks: readonly Peak[], base: number, from: number, to: number, cls: string, gap: number): string {
  const step = 24
  let edge = `M${n(from)} ${n(H)}`

  for (let x = from; x <= to; x += step) {
    edge += `L${n(x)} ${n(ridge(peaks, base, x))}`
  }

  edge += `L${n(to)} ${n(H)}Z`

  let lines = ''

  for (let k = 1; k * gap < 520; k++) {
    let d = ''

    for (let x = from; x <= to; x += step) {
      // each contour sags a little and waves, like brush strokes
      const y = ridge(peaks, base, x) * (1 - k * 0.012) + k * gap + Math.sin(x / 90 + k) * 4 + base * k * 0.012
      d += `${x === from ? 'M' : 'L'}${n(x)} ${n(y)}`
    }

    lines += `<path d="${d}"/>`
  }

  return (
    `<clipPath id="${id}"><path d="${edge}"/></clipPath>` +
    `<path class="${cls}" d="${edge}"/>` +
    `<g class="${cls}l" clip-path="url(#${id})" fill="none" stroke-width="2">${lines}</g>`
  )
}

function spiral(cx: number, cy: number, r: number, turns: number, start: number): string {
  const steps = Math.round(turns * 14)
  let d = ''

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = start + t * turns * Math.PI * 2
    const rr = r * (1 - t * 0.88)
    d += `${i === 0 ? 'M' : 'L'}${n(cx + rr * Math.cos(a))} ${n(cy + rr * Math.sin(a))}`
  }

  return d
}

const PUFFS: readonly [number, number, number][] = [
  [-1.25, 0.3, 0.5],
  [-0.6, -0.1, 0.72],
  [0.2, -0.35, 0.92],
  [1.0, -0.05, 0.74],
  [1.65, 0.3, 0.5],
]

function cloud(x: number, y: number, s: number, cls: string): string {
  let g = `<g class="${cls}">`
  g += `<ellipse class="shade" cx="${n(x + s * 0.25)}" cy="${n(y + s * 0.6)}" rx="${n(s * 2.15)}" ry="${n(s * 0.38)}"/>`
  g += `<ellipse class="puff" cx="${n(x + s * 0.2)}" cy="${n(y + s * 0.45)}" rx="${n(s * 2.1)}" ry="${n(s * 0.42)}"/>`

  PUFFS.forEach(([dx, dy, k], i) => {
    const cx = x + dx * s
    const cy = y + dy * s
    const r = s * k
    g += `<circle class="puff" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/>`
    g += `<path class="curl" d="${spiral(cx, cy, r * 0.82, 2.2, i * 1.3)}"/>`
  })

  return `${g}</g>`
}

function sea(): string {
  let lines = ''

  for (let j = 0; j < 9; j++) {
    const y0 = 860 + j * 18
    let d = `M0 ${y0}`

    for (let x = 0; x <= W; x += 40) {
      d += `L${x} ${n(y0 + Math.sin(x / 110 + j * 0.9) * (10 + j * 1.5))}`
    }

    lines += `<path d="${d}"/>`
  }

  return `<path class="m4" d="M0 850L${W} 830L${W} ${H}L0 ${H}Z"/><g class="m4l" fill="none" stroke-width="2">${lines}</g>`
}

const STYLE = `
.s0{stop-color:#0f2a31}.s1{stop-color:#071a20}.s2{stop-color:#efbc90}.r0{stop-color:#f3c9a2}.r1{stop-color:#c9855a}
.m0{fill:#0e252c}.m0l{stroke:#15313a}.m1{fill:#17333b}.m1l{stroke:#26474f}.m2{fill:#232f48}.m2l{stroke:#34405e}.m3{fill:#0d242a}.m3l{stroke:#1b3a42}.m4{fill:#081c22}.m4l{stroke:#163239}
.puff{fill:#e8dcc9}.curl{fill:none;stroke:#b7a58d;stroke-width:2.2;stroke-linecap:round}
.riv{fill:none;stroke-linecap:round}
.flow{fill:none;stroke:#fff3e4;stroke-width:2;stroke-linecap:round;stroke-dasharray:140 260;opacity:.35;animation:flow 38s linear infinite}
.glow{opacity:.24;animation:breathe 26s ease-in-out infinite}.shade{fill:#8f7f6c;opacity:.55}
.drift1{animation:drift 90s ease-in-out infinite alternate}
.drift2{animation:drift 120s ease-in-out infinite alternate-reverse}
@keyframes drift{from{transform:translateX(0)}to{transform:translateX(-46px)}}
@keyframes flow{to{stroke-dashoffset:-1360}}
@keyframes breathe{0%,100%{opacity:.2}50%{opacity:.32}}
@media (prefers-color-scheme: light){
.s0{stop-color:#f2f6f3}.s1{stop-color:#dce6e2}.s2{stop-color:#f6c9a0}.r0{stop-color:#f5c69c}.r1{stop-color:#d9905e}
.m0{fill:#d9e4e0}.m0l{stroke:#cbd9d4}.m1{fill:#c3d4d0}.m1l{stroke:#adc3be}.m2{fill:#cdcde0}.m2l{stroke:#b6b7d1}.m3{fill:#d3e0dc}.m3l{stroke:#bccfca}.m4{fill:#e1e9e6}.m4l{stroke:#cbd9d5}
.puff{fill:#ffffff}.shade{fill:#b9c8c4}.curl{stroke:#c8d4d1}.flow{stroke:#fffaf2}
}
`

const RIVER = 'M1590 610C1430 660 1520 730 1330 780S1040 840 1190 905S1010 975 880 1010'

function build(viewBox: string, label: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${label}">` +
    `<style>${STYLE}</style>` +
    '<defs>' +
    '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s0"/><stop offset="1" class="s1"/></linearGradient>' +
    '<radialGradient id="warm" cx=".18" cy="1" r=".6"><stop offset="0" class="s2"/><stop offset="1" class="s2" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s0" stop-opacity="0"/><stop offset=".55" class="s0" stop-opacity=".55"/><stop offset="1" class="s0" stop-opacity="0"/></linearGradient>' +
    '<linearGradient id="river" x1="1" y1="0" x2="0" y2="1"><stop offset="0" class="r0"/><stop offset="1" class="r1"/></linearGradient>' +
    '</defs>' +
    `<rect width="${W}" height="${H}" fill="url(#sky)"/>` +
    `<rect class="glow" width="${W}" height="${H}" fill="url(#warm)"/>` +
    mountain('mf', [{ x: 900, h: 120, w: 260 }, { x: 560, h: 90, w: 220 }, { x: 1250, h: 160, w: 240 }], 860, 0, W, 'm0', 22) +
    cloud(1420, 150, 40, 'drift2') +
    mountain('ma', [{ x: 1260, h: 620, w: 150 }, { x: 1470, h: 500, w: 130 }, { x: 1060, h: 340, w: 150 }], 870, 640, W, 'm1', 15) +
    mountain('mb', [{ x: 1380, h: 420, w: 110 }, { x: 1560, h: 330, w: 90 }], 900, 1060, W, 'm2', 13) +
    cloud(1150, 330, 58, 'drift1') +
    cloud(1500, 470, 36, 'drift2') +
    mountain('mc', [{ x: 90, h: 400, w: 170 }, { x: 330, h: 230, w: 150 }], 940, -80, 820, 'm3', 14) +
    cloud(170, 300, 30, 'drift1') +
    sea() +
    `<rect class="mist" y="700" width="${W}" height="190" fill="url(#mist)"/>` +
    `<path class="riv" d="${RIVER}" stroke="url(#river)" stroke-width="56" opacity=".09"/>` +
    `<path class="riv" d="${RIVER}" stroke="url(#river)" stroke-width="22" opacity=".9"/>` +
    `<path class="flow" d="${RIVER}"/>` +
    '</svg>'
  )
}

/** The whole backdrop, for every screen. */
export const SCENE = build(`0 0 ${W} ${H}`, 'Ink-wash mountains with curling clouds and a warm river at dusk')

/** A crop of the same place, for the banner on the HQ feed card. */
export const BANNER = build('760 250 840 300', 'Mountains, clouds and a river of light')
