/**
 * Europe/Amsterdam wall-clock helpers for the lifecycle scheduler.
 *
 * Everything goes through Intl.DateTimeFormat — no hand-rolled UTC offsets — so
 * the CET/CEST switch is handled by the platform's tz database. The EventBridge
 * schedule already fires at 10:00 local time; these helpers exist so the
 * function can (a) double-check that it really is the 10:00 hour and (b) turn
 * "the start of the day after X" into an exact instant.
 */

export const TIME_ZONE = 'Europe/Amsterdam'
export const HOUR_MS = 60 * 60 * 1000
export const DAY_MS = 24 * HOUR_MS

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
})

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** Amsterdam wall-clock parts of an instant. `weekday`: 0 = Sunday … 6 = Saturday. */
export function localParts(ms) {
  const parts = {}
  for (const { type, value } of formatter.formatToParts(new Date(ms))) parts[type] = value
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday],
  }
}

const pad = (n) => String(n).padStart(2, '0')

/** Amsterdam calendar date of an instant, as `YYYY-MM-DD`. */
export function localDate(ms) {
  const { year, month, day } = localParts(ms)
  return `${year}-${pad(month)}-${pad(day)}`
}

/** `YYYY-MM-DD` shifted by a whole number of calendar days (pure calendar arithmetic, DST-free). */
export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** local wall clock minus UTC at this instant, in ms (+1 h in winter, +2 h in summer). */
function offsetMs(ms) {
  const p = localParts(ms)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000
}

/** The instant at which the given Amsterdam calendar date starts (local 00:00). */
export function localMidnightUtc(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const wall = Date.UTC(y, m - 1, d)
  // Two passes: the offset at `wall` (read as UTC) can differ from the offset at the
  // real instant when a DST change falls in between. Amsterdam changes at 02:00/03:00,
  // never at midnight, so the second pass is always exact.
  const first = wall - offsetMs(wall)
  return wall - offsetMs(first)
}

/** The first instant of the Amsterdam calendar day that follows the one `ms` falls in. */
export function startOfNextLocalDay(ms) {
  return localMidnightUtc(addDays(localDate(ms), 1))
}
