/**
 * Local-calendar date helpers for plain `YYYY-MM-DD` keys
 * (scheduled_workouts.date is a Postgres `date`, not a timestamp).
 *
 * Never use `new Date('YYYY-MM-DD')`: date-only ISO strings parse as UTC
 * midnight, which is the previous day anywhere west of Greenwich.
 */

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isDateKey(value) {
  return typeof value === 'string' && DATE_KEY_RE.test(value)
}

/** Local YYYY-MM-DD for a Date (or anything `new Date()` accepts). */
export function toDateKey(date = new Date()) {
  if (isDateKey(date)) return date
  const d = date instanceof Date ? date : new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** `YYYY-MM-DD` → local Date at 00:00, or null when malformed. */
export function parseDateKey(key) {
  const match = DATE_KEY_RE.exec(String(key ?? ''))
  if (!match) return null
  const [, y, m, d] = match
  return new Date(Number(y), Number(m) - 1, Number(d))
}

export function todayKey(now = new Date()) {
  return toDateKey(now)
}

export function addDaysToKey(key, n) {
  const d = parseDateKey(key)
  if (!d) return key
  d.setDate(d.getDate() + n)
  return toDateKey(d)
}

/** Monday 00:00 local of the week containing `from`. */
export function mondayOf(from = new Date()) {
  const d = from instanceof Date ? new Date(from) : parseDateKey(from)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0 Sun
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return d
}

/**
 * "Thu, Nov 19" — adds the year when it isn't the current one
 * ("Mon, Dec 29, 2025"). Falls back to the raw value if it isn't a date key.
 */
export function formatDateKey(key, { weekday = true, now = new Date() } = {}) {
  const d = parseDateKey(key)
  if (!d) return key ?? ''
  return d.toLocaleDateString('en-US', {
    weekday: weekday ? 'short' : undefined,
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
}

/** "Thu" */
export function formatWeekday(key) {
  const d = parseDateKey(key)
  if (!d) return ''
  return d.toLocaleDateString('en-US', { weekday: 'short' })
}

/** "Today" / "Tomorrow" / "Yesterday" / "Thu, Nov 19". */
export function formatRelativeDateKey(key, now = new Date()) {
  const today = toDateKey(now)
  if (key === today) return 'Today'
  if (key === addDaysToKey(today, 1)) return 'Tomorrow'
  if (key === addDaysToKey(today, -1)) return 'Yesterday'
  return formatDateKey(key, { now })
}
