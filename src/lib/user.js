/** Normalize for fuzzy matching against the exercises seed list. */
export function normalizeExerciseName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Spread N training days across a Mon–Sun week.
 * Returns weekday offsets from Monday (0 = Mon … 6 = Sun).
 */
export function trainingDayOffsets(daysPerWeek) {
  const n = Math.min(7, Math.max(1, Number(daysPerWeek) || 3))
  const presets = {
    1: [0],
    2: [1, 3], // Tue, Thu
    3: [0, 2, 4], // Mon, Wed, Fri
    4: [0, 1, 3, 4], // Mon, Tue, Thu, Fri
    5: [0, 1, 2, 3, 4],
    6: [0, 1, 2, 3, 4, 5],
    7: [0, 1, 2, 3, 4, 5, 6],
  }
  return presets[n]
}

function toDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Next Monday from today (or today if today is Monday). */
export function nextMonday(from = new Date()) {
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0 Sun
  const add = day === 1 ? 0 : day === 0 ? 1 : 8 - day
  d.setDate(d.getDate() + add)
  return d
}

/** The Monday strictly after `from` (a Monday returns the following one). */
export function upcomingMonday(from = new Date()) {
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0 Sun
  d.setDate(d.getDate() + (day === 0 ? 1 : 8 - day))
  return d
}

/** Onboarding start choice. */
export const START_TODAY = 'today'
export const START_NEXT_MONDAY = 'next_monday'

/** Default start: today when it's Mon–Thu, otherwise next Monday. */
export function defaultStartMode(today = new Date()) {
  const day = today.getDay() // 0 Sun
  return day >= 1 && day <= 4 ? START_TODAY : START_NEXT_MONDAY
}

/** Monday-based weekday offset (0 = Mon … 6 = Sun). */
function mondayOffset(date) {
  return (date.getDay() + 6) % 7
}

/**
 * Week-1 offsets (days from today) when starting today instead of Monday.
 *
 * - Every preset training day is still ahead this week → keep the preset.
 * - Otherwise, if the days fit between today and Sunday, spread them evenly
 *   over that window (keeps rest days, and week 2 still starts next Monday).
 * - Otherwise pack them on consecutive days from today (spills past Sunday,
 *   never more than 7 days).
 *
 * Always: first day is today or later, no duplicates, all < 7.
 */
export function startTodayOffsets(daysPerWeek, today = new Date()) {
  const presets = trainingDayOffsets(daysPerWeek)
  const n = presets.length
  const t = mondayOffset(today)
  if (presets.every((o) => o >= t)) return presets.map((o) => o - t)
  const remaining = 7 - t // days from today through Sunday, inclusive
  if (n <= remaining) {
    return presets.map((_, i) => Math.round((i * remaining) / n))
  }
  return presets.map((_, i) => i)
}

/**
 * Concrete YYYY-MM-DD dates for the first program week, one per training day
 * (index = day index in the generated week).
 */
export function firstWeekScheduleDates(
  daysPerWeek,
  startMode = START_NEXT_MONDAY,
  today = new Date(),
) {
  const base = new Date(today)
  base.setHours(0, 0, 0, 0)
  if (startMode === START_TODAY) {
    return startTodayOffsets(daysPerWeek, base).map((off) => {
      const d = new Date(base)
      d.setDate(base.getDate() + off)
      return toDateKey(d)
    })
  }
  const monday = upcomingMonday(base)
  return trainingDayOffsets(daysPerWeek).map((off) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + off)
    return toDateKey(d)
  })
}

export function scheduleDateFor(weekNumber, dayIndex, daysPerWeek, startMonday) {
  const offsets = trainingDayOffsets(daysPerWeek)
  const offset = offsets[Math.min(dayIndex, offsets.length - 1)]
  const date = new Date(startMonday)
  date.setDate(startMonday.getDate() + (weekNumber - 1) * 7 + offset)
  return toDateKey(date)
}
