import { convertWeight, roundWeight } from './units'

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

export function toDateKey(date) {
  // A plain YYYY-MM-DD is already a local date key — new Date('YYYY-MM-DD')
  // would parse it as UTC midnight (the previous day west of Greenwich).
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  const d = date instanceof Date ? date : new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Adherence over scheduled workouts dated on or before today (local date) —
 * future workouts haven't had a chance to be completed yet.
 */
export function adherenceFor(scheduledWorkouts, range = null, today = new Date()) {
  const todayKey = toDateKey(today)
  const startKey = range ? toDateKey(range.start) : null
  const endKey = range ? toDateKey(range.end) : null
  const list = (scheduledWorkouts ?? []).filter((sw) => {
    const key = sw.date
    if (key > todayKey) return false
    if (range && (key < startKey || key > endKey)) return false
    return true
  })

  const scheduled = list.length
  const completed = list.filter((sw) => sw.status === 'completed').length
  const percent = scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100)

  return { scheduled, completed, percent }
}

/** Epley estimated 1RM; only for 1–12 reps with a positive weight. */
export function estimateOneRepMax(weight, reps) {
  const w = Number(weight)
  const r = Number(reps)
  if (!Number.isFinite(w) || w <= 0) return null
  if (!Number.isFinite(r) || r < 1 || r > 12) return null
  return w * (1 + r / 30)
}

/** A log's weight in `unit` (null weight_unit = legacy lb). null if no weight. */
export function logWeightIn(log, unit) {
  if (log?.actual_weight == null) return null
  const n = Number(log.actual_weight)
  if (!Number.isFinite(n)) return null
  return convertWeight(n, log.weight_unit || 'lb', unit)
}

/** e1RM of one log in `unit`, or null. */
export function logE1rm(log, unit) {
  return estimateOneRepMax(logWeightIn(log, unit), log?.actual_reps)
}

/**
 * Map workout_exercise id → { exerciseId, name, date, scheduledId } using
 * loaded workoutDetails + scheduledWorkouts (date = scheduled date).
 */
export function workoutExerciseIndex(scheduledWorkouts, workoutDetails) {
  const swByWorkout = new Map()
  for (const sw of scheduledWorkouts ?? []) {
    if (!swByWorkout.has(sw.workout_id)) swByWorkout.set(sw.workout_id, sw)
  }
  const index = new Map()
  for (const detail of Object.values(workoutDetails ?? {})) {
    const workoutId = detail.workout?.id
    const sw = workoutId != null ? swByWorkout.get(workoutId) : null
    for (const we of detail.exercises ?? []) {
      index.set(we.id, {
        exerciseId: we.exercise_id,
        name: we.exercise?.name ?? 'Exercise',
        date: sw?.date ?? null,
        scheduledId: sw?.id ?? null,
      })
    }
  }
  return index
}

/** All strength logs (any workout) for one exercise_id. */
export function logsForExercise(exerciseId, logs, index) {
  if (!exerciseId) return []
  return (logs ?? []).filter(
    (l) => index.get(l.workout_exercise_id)?.exerciseId === exerciseId,
  )
}

/**
 * Most recent earlier session of the same exercise with logs.
 * "Earlier" = a different workout_exercise whose scheduled date is on/before
 * `currentDate` (ties broken by latest completed_at). Returns
 * { date, logs (sorted by set_number) } or null.
 */
export function previousPerformance({
  exerciseId,
  currentWorkoutExerciseId,
  currentDate,
  logs,
  index,
}) {
  const groups = new Map()
  for (const log of logsForExercise(exerciseId, logs, index)) {
    if (log.workout_exercise_id === currentWorkoutExerciseId) continue
    const meta = index.get(log.workout_exercise_id)
    const date = meta?.date ?? toDateKey(log.completed_at)
    if (currentDate && date > currentDate) continue
    let g = groups.get(log.workout_exercise_id)
    if (!g) {
      g = { date, last: '', logs: [] }
      groups.set(log.workout_exercise_id, g)
    }
    g.logs.push(log)
    const ts = String(log.completed_at ?? '')
    if (ts > g.last) g.last = ts
  }
  let best = null
  for (const g of groups.values()) {
    if (
      !best ||
      g.date > best.date ||
      (g.date === best.date && g.last > best.last)
    ) {
      best = g
    }
  }
  if (!best) return null
  return {
    date: best.date,
    logs: best.logs.slice().sort((a, b) => a.set_number - b.set_number),
  }
}

/**
 * Exercises with at least two weighted (non-zero) logs on two different days.
 * Points per calendar day: top set weight and best e1RM, both in `unit`.
 */
export function weightProgressByExercise(logs, workoutDetails, unit = 'lb') {
  const lookup = exerciseLookupFromDetails(workoutDetails)
  const byExercise = new Map()

  for (const log of logs ?? []) {
    const weight = logWeightIn(log, unit)
    // Bodyweight sets (0 / no weight) don't belong on a weight chart.
    if (weight == null || weight <= 0) continue
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
      const weight = roundWeight(logWeightIn(log, unit))
      const e1rm = logE1rm(log, unit)
      const prev = byDay.get(day) ?? {
        date: day,
        weight: 0,
        e1rm: null,
        completed_at: log.completed_at,
      }
      if (weight > prev.weight) prev.weight = weight
      if (e1rm != null && (prev.e1rm == null || e1rm > prev.e1rm)) {
        prev.e1rm = roundWeight(e1rm)
      }
      byDay.set(day, prev)
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

/** Best e1RM per lift (reps ≤ 12, weight > 0), highest first. */
export function personalRecords(logs, workoutDetails, unit = 'lb') {
  const lookup = exerciseLookupFromDetails(workoutDetails)
  const best = new Map()
  for (const log of logs ?? []) {
    const e1rm = logE1rm(log, unit)
    if (e1rm == null) continue
    const meta = lookup.get(log.workout_exercise_id)
    if (!meta) continue
    const prev = best.get(meta.exerciseId)
    if (!prev || e1rm > prev.e1rm) {
      best.set(meta.exerciseId, {
        exerciseId: meta.exerciseId,
        name: meta.name,
        e1rm,
        weight: roundWeight(logWeightIn(log, unit)),
        reps: Number(log.actual_reps),
        date: toDateKey(log.completed_at),
      })
    }
  }
  return [...best.values()]
    .map((r) => ({ ...r, e1rm: roundWeight(r.e1rm) }))
    .sort((a, b) => b.e1rm - a.e1rm || a.name.localeCompare(b.name))
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
