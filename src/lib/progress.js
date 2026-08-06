/** Local Monday 00:00 → Sunday 23:59:59 of the week containing `from`. */
export function currentWeekRange(from = new Date()) {
  const start = new Date(from)
  start.setHours(0, 0, 0, 0)
  const day = start.getDay() // 0 Sun
  const mondayOffset = day === 0 ? -6 : 1 - day
  start.setDate(start.getDate() + mondayOffset)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)

  return { start, end }
}

function toDateKey(date) {
  const d = date instanceof Date ? date : new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function adherenceFor(scheduledWorkouts, range = null) {
  const list = range
    ? scheduledWorkouts.filter((sw) => {
        const key = sw.date
        const startKey = toDateKey(range.start)
        const endKey = toDateKey(range.end)
        return key >= startKey && key <= endKey
      })
    : scheduledWorkouts

  const scheduled = list.length
  const completed = list.filter((sw) => sw.status === 'completed').length
  const percent = scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100)

  return { scheduled, completed, percent }
}

/**
 * Map workout_exercise id → { exerciseId, name } from loaded workoutDetails.
 */
export function exerciseLookupFromDetails(workoutDetails) {
  const byWeId = new Map()
  for (const detail of Object.values(workoutDetails ?? {})) {
    for (const we of detail.exercises ?? []) {
      byWeId.set(we.id, {
        exerciseId: we.exercise_id,
        name: we.exercise?.name ?? 'Exercise',
      })
    }
  }
  return byWeId
}

/**
 * Exercises with at least two weighted logs, sorted by log count desc.
 * Series points: max actual_weight per calendar day (top set that day).
 */
export function weightProgressByExercise(logs, workoutDetails) {
  const lookup = exerciseLookupFromDetails(workoutDetails)
  const byExercise = new Map()

  for (const log of logs ?? []) {
    if (log.actual_weight == null) continue
    const meta = lookup.get(log.workout_exercise_id)
    if (!meta) continue

    let entry = byExercise.get(meta.exerciseId)
    if (!entry) {
      entry = { exerciseId: meta.exerciseId, name: meta.name, logs: [] }
      byExercise.set(meta.exerciseId, entry)
    }
    entry.logs.push(log)
  }

  const results = []
  for (const entry of byExercise.values()) {
    if (entry.logs.length < 2) continue

    const byDay = new Map()
    for (const log of entry.logs) {
      const day = toDateKey(log.completed_at)
      const weight = Number(log.actual_weight)
      const prev = byDay.get(day)
      if (!prev || weight > prev.weight) {
        byDay.set(day, { date: day, weight, completed_at: log.completed_at })
      }
    }

    const points = [...byDay.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    )

    if (points.length < 2) continue

    results.push({
      exerciseId: entry.exerciseId,
      name: entry.name,
      logCount: entry.logs.length,
      points,
    })
  }

  results.sort((a, b) => b.logCount - a.logCount || a.name.localeCompare(b.name))
  return results
}
