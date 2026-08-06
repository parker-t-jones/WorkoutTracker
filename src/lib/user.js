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

export function scheduleDateFor(weekNumber, dayIndex, daysPerWeek, startMonday) {
  const offsets = trainingDayOffsets(daysPerWeek)
  const offset = offsets[Math.min(dayIndex, offsets.length - 1)]
  const date = new Date(startMonday)
  date.setDate(startMonday.getDate() + (weekNumber - 1) * 7 + offset)
  return toDateKey(date)
}
