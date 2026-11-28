/**
 * Calendar/history view-model helpers over loaded program data.
 * Pure apart from exerciseProgress (also pure; lives with the logging code).
 */
import { exerciseProgress } from './logging'
import { mondayOf, toDateKey } from './dates'

/**
 * scheduled_workout id → { done, total, exerciseCount } (sets/splits logged
 * vs prescribed). Logs/splits are bucketed once so this stays linear.
 */
export function buildScheduledProgress(
  scheduledWorkouts,
  workoutDetails,
  logs,
  logSplits,
) {
  const logsByWe = new Map()
  for (const log of logs ?? []) {
    const list = logsByWe.get(log.workout_exercise_id)
    if (list) list.push(log)
    else logsByWe.set(log.workout_exercise_id, [log])
  }
  const splitsByLog = new Map()
  for (const split of logSplits ?? []) {
    const list = splitsByLog.get(split.log_id)
    if (list) list.push(split)
    else splitsByLog.set(split.log_id, [split])
  }

  const byId = new Map()
  for (const sw of scheduledWorkouts ?? []) {
    const exercises = workoutDetails?.[sw.workout_id]?.exercises ?? []
    let done = 0
    let total = 0
    for (const we of exercises) {
      const weLogs = logsByWe.get(we.id) ?? []
      const weSplits = weLogs.flatMap((l) => splitsByLog.get(l.id) ?? [])
      const p = exerciseProgress(we, weLogs, weSplits)
      done += p.done
      total += p.total
    }
    byId.set(sw.id, { done, total, exerciseCount: exercises.length })
  }
  return byId
}

/**
 * 'completed' | 'missed' (past, nothing logged) | 'partial' (past, some
 * logged) | 'in-progress' (today/future, some logged) | 'pending'.
 */
export function scheduledStatus(sw, progress, todayKey) {
  if (sw.status === 'completed') return 'completed'
  const done = progress?.done ?? 0
  if (sw.date < todayKey) return done > 0 ? 'partial' : 'missed'
  return done > 0 ? 'in-progress' : 'pending'
}

/** Group scheduled workouts by date key → array (date order, then id). */
export function groupByDate(scheduledWorkouts) {
  const byDate = new Map()
  for (const sw of sortScheduled(scheduledWorkouts)) {
    const list = byDate.get(sw.date)
    if (list) list.push(sw)
    else byDate.set(sw.date, [sw])
  }
  return byDate
}

export function sortScheduled(scheduledWorkouts) {
  return (scheduledWorkouts ?? [])
    .slice()
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)),
    )
}

/**
 * Program week shown in the calendar header: the week_number of a workout in
 * the current Mon–Sun week, else the next upcoming one, else the latest past.
 */
export function currentProgramWeek(scheduledWorkouts, getWorkout, now = new Date()) {
  const monday = mondayOf(now)
  const startKey = toDateKey(monday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const endKey = toDateKey(sunday)
  const sorted = sortScheduled(scheduledWorkouts)
  const weekOf = (sw) => getWorkout(sw.workout_id)?.week_number ?? null
  const inWeek = sorted.filter((sw) => sw.date >= startKey && sw.date <= endKey)
  const pick =
    inWeek.find((sw) => weekOf(sw) != null) ??
    sorted.find((sw) => sw.date > endKey && weekOf(sw) != null) ??
    sorted.filter((sw) => weekOf(sw) != null).at(-1)
  return pick ? weekOf(pick) : null
}

/**
 * Past scheduled workouts (date before today), newest first, grouped by
 * program week number (newest week first). Workouts whose workout row isn't
 * loaded land in a `null` week group at the end.
 */
export function groupHistoryByWeek(scheduledWorkouts, getWorkout, todayKey) {
  const past = sortScheduled(scheduledWorkouts)
    .filter((sw) => sw.date < todayKey)
    .reverse()
  const groups = new Map()
  for (const sw of past) {
    const wn = getWorkout(sw.workout_id)?.week_number ?? null
    if (!groups.has(wn)) groups.set(wn, [])
    groups.get(wn).push(sw)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a == null ? 1 : b == null ? -1 : b - a))
    .map(([weekNumber, items]) => ({ weekNumber, items }))
}
