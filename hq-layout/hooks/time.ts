const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export type Clock = {
  /** 7:56 */
  time: string
  /** AM or PM */
  period: string
  /** Sunday, November 22 */
  date: string
  /** The seven days of this week, Sunday first. */
  week: { short: string; day: number; isToday: boolean }[]
}

type Local = { y: number; m: number; d: number; hour: number; minute: number }

function local(ms: number, zone: string): Local {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone === '' ? undefined : zone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(new Date(ms))
    const get = (type: string): number => Number(parts.find(p => p.type === type)?.value ?? 0)

    return { y: get('year'), m: get('month'), d: get('day'), hour: get('hour') % 24, minute: get('minute') }
  } catch {
    const t = new Date(ms)

    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), hour: t.getUTCHours(), minute: t.getUTCMinutes() }
  }
}

export function clockOf(ms: number, zone: string): Clock {
  const l = local(ms, zone)
  const today = new Date(Date.UTC(l.y, l.m - 1, l.d))
  const weekday = today.getUTCDay()
  const hour12 = l.hour % 12 === 0 ? 12 : l.hour % 12

  const week = DAYS.map((short, i) => {
    const day = new Date(Date.UTC(l.y, l.m - 1, l.d - weekday + i))

    return { short, day: day.getUTCDate(), isToday: i === weekday }
  })

  return {
    time: `${hour12}:${String(l.minute).padStart(2, '0')}`,
    period: l.hour < 12 ? 'AM' : 'PM',
    date: `${DAYS_LONG[weekday]}, ${MONTHS[l.m - 1]} ${l.d}`,
    week,
  }
}

/** 3m, 2h 05m: how long ago or how long for. */
export function span(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000))

  if (minutes < 60) {
    return `${minutes}m`
  }

  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

/** The time of day of a moment, 7:52. */
export function stamp(ms: number, zone: string): string {
  const c = clockOf(ms, zone)

  return `${c.time} ${c.period}`
}
