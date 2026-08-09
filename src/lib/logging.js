import { supabase } from './supabase'
import { computePace } from './units'

function assertSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }
  return supabase
}

/**
 * Live auth uid for RLS-scoped writes. Always resolved at call time via
 * getUser() — never trust React state, props, or leftover localStorage.
 */
async function requireAuthUserId() {
  const client = assertSupabase()
  const { data, error } = await client.auth.getUser()
  if (error) throw error
  if (!data?.user?.id) {
    throw new Error('Not signed in')
  }
  return data.user.id
}

/** Pull a sensible default reps number from strings like "5", "8-10", "10/side", "45s". */
export function parsePrescribedReps(reps) {
  if (reps == null) return 8
  const str = String(reps)
  const range = str.match(/(\d+)\s*-\s*(\d+)/)
  if (range) return Number(range[1])
  const first = str.match(/(\d+)/)
  if (first) return Number(first[1])
  return 8
}

export function isBodyweightGuidance(guidance) {
  if (!guidance) return false
  return /bodyweight|bw\b|unweighted/i.test(String(guidance))
}

export function exerciseModality(we) {
  return we?.exercise?.modality === 'cardio' ? 'cardio' : 'strength'
}

export function isCardioExercise(we) {
  return exerciseModality(we) === 'cardio'
}

export function prescribedSplitCount(we) {
  if (Array.isArray(we?.target_splits) && we.target_splits.length > 0) {
    return we.target_splits.length
  }
  return Number(we?.sets) || 0
}

/** True when this workout_exercise has enough logged work to count as done. */
export function isExerciseFullyLogged(we, logs, logSplits = []) {
  const weLogs = (logs ?? []).filter((l) => l.workout_exercise_id === we.id)
  if (isCardioExercise(we)) {
    if (we.is_interval) {
      const needed = prescribedSplitCount(we)
      if (needed <= 0) return weLogs.length >= 1
      const parentIds = new Set(weLogs.map((l) => l.id))
      const splitCount = (logSplits ?? []).filter((s) =>
        parentIds.has(s.log_id),
      ).length
      return splitCount >= needed
    }
    return weLogs.some(
      (l) =>
        l.actual_duration_seconds != null || l.actual_distance != null,
    )
  }
  return weLogs.length >= (Number(we.sets) || 0)
}

/**
 * Insert one set into logs. If every prescribed set for the scheduled
 * workout is now logged, mark scheduled_workouts.status = completed.
 * Returns { log, completed }.
 */
export async function saveSetLog({
  scheduledWorkoutId,
  workoutExerciseId,
  setNumber,
  actualReps,
  actualWeight,
  exercises,
  existingLogs,
  logSplits = [],
}) {
  const client = assertSupabase()
  const userId = await requireAuthUserId()

  const payload = {
    workout_exercise_id: workoutExerciseId,
    user_id: userId,
    set_number: setNumber,
    actual_reps: actualReps,
    actual_weight: actualWeight,
    completed_at: new Date().toISOString(),
  }

  const { data: log, error } = await client
    .from('logs')
    .insert(payload)
    .select()
    .single()

  if (error) throw error

  const allLogs = [...existingLogs, log]
  const completed = isWorkoutFullyLogged(exercises, allLogs, logSplits)

  if (completed) {
    await markScheduledCompleted(scheduledWorkoutId, userId)
  }

  return { log, completed }
}

export async function updateSetLog({ logId, actualReps, actualWeight }) {
  const client = assertSupabase()
  const userId = await requireAuthUserId()

  const { data: log, error } = await client
    .from('logs')
    .update({
      actual_reps: actualReps,
      actual_weight: actualWeight,
    })
    .eq('id', logId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw error
  return log
}

/** Save or update a steady-state cardio log (one row per exercise). */
export async function saveCardioLog({
  scheduledWorkoutId,
  workoutExerciseId,
  actualDurationSeconds,
  actualDistance,
  distanceUnit,
  exercises,
  existingLogs,
  logSplits = [],
  existingLogId = null,
}) {
  const client = assertSupabase()
  const userId = await requireAuthUserId()

  const fields = {
    actual_duration_seconds: actualDurationSeconds,
    actual_distance: actualDistance,
    distance_unit: distanceUnit,
    actual_reps: 0,
    actual_weight: null,
  }

  let log
  if (existingLogId) {
    const { data, error } = await client
      .from('logs')
      .update(fields)
      .eq('id', existingLogId)
      .eq('user_id', userId)
      .select()
      .single()
    if (error) throw error
    log = data
  } else {
    const { data, error } = await client
      .from('logs')
      .insert({
        workout_exercise_id: workoutExerciseId,
        user_id: userId,
        set_number: 1,
        completed_at: new Date().toISOString(),
        ...fields,
      })
      .select()
      .single()
    if (error) throw error
    log = data
  }

  const allLogs = existingLogId
    ? existingLogs.map((l) => (l.id === log.id ? log : l))
    : [...existingLogs, log]
  const completed = isWorkoutFullyLogged(exercises, allLogs, logSplits)
  if (completed) {
    await markScheduledCompleted(scheduledWorkoutId, userId)
  }
  return { log, completed }
}

/**
 * Ensure a parent log exists for an interval session, then upsert one split.
 * Returns { log, split, completed, logSplits }.
 */
export async function saveIntervalSplit({
  scheduledWorkoutId,
  workoutExerciseId,
  splitNumber,
  distance,
  distanceUnit,
  durationSeconds,
  exercises,
  existingLogs,
  logSplits = [],
  parentLogId = null,
}) {
  const client = assertSupabase()
  const userId = await requireAuthUserId()

  let parentLog =
    parentLogId != null
      ? existingLogs.find((l) => l.id === parentLogId) ?? null
      : existingLogs.find((l) => l.workout_exercise_id === workoutExerciseId) ??
        null

  if (!parentLog) {
    const { data, error } = await client
      .from('logs')
      .insert({
        workout_exercise_id: workoutExerciseId,
        user_id: userId,
        set_number: 1,
        actual_reps: 0,
        actual_weight: null,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single()
    if (error) throw error
    parentLog = data
  }

  const pace = computePace(durationSeconds, distance)
  const splitPayload = {
    log_id: parentLog.id,
    split_number: splitNumber,
    distance,
    distance_unit: distanceUnit,
    duration_seconds: durationSeconds,
    pace,
  }

  const existingSplit = (logSplits ?? []).find(
    (s) => s.log_id === parentLog.id && s.split_number === splitNumber,
  )

  let split
  if (existingSplit) {
    const { data, error } = await client
      .from('log_splits')
      .update({
        distance,
        distance_unit: distanceUnit,
        duration_seconds: durationSeconds,
        pace,
      })
      .eq('id', existingSplit.id)
      .select()
      .single()
    if (error) throw error
    split = data
  } else {
    const { data, error } = await client
      .from('log_splits')
      .insert(splitPayload)
      .select()
      .single()
    if (error) throw error
    split = data
  }

  const allLogs = existingLogs.some((l) => l.id === parentLog.id)
    ? existingLogs
    : [...existingLogs, parentLog]
  const nextSplits = existingSplit
    ? logSplits.map((s) => (s.id === split.id ? split : s))
    : [...(logSplits ?? []), split]

  const completed = isWorkoutFullyLogged(exercises, allLogs, nextSplits)
  if (completed) {
    await markScheduledCompleted(scheduledWorkoutId, userId)
  }

  return { log: parentLog, split, completed, logSplits: nextSplits }
}

async function markScheduledCompleted(scheduledWorkoutId, userId) {
  const client = assertSupabase()
  const { error } = await client
    .from('scheduled_workouts')
    .update({ status: 'completed' })
    .eq('id', scheduledWorkoutId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function updateExerciseRpe({ workoutExerciseId, rpe }) {
  const client = assertSupabase()
  const userId = await requireAuthUserId()

  const value =
    rpe == null || rpe === ''
      ? null
      : Math.min(10, Math.max(1, Math.round(Number(rpe))))

  if (value != null && !Number.isFinite(value)) {
    throw new Error('RPE must be a number from 1 to 10')
  }

  const { data, error } = await client
    .from('logs')
    .update({ rpe: value })
    .eq('user_id', userId)
    .eq('workout_exercise_id', workoutExerciseId)
    .select()

  if (error) throw error
  return data ?? []
}

export async function updateExercisePain({
  workoutExerciseId,
  painFlag,
  painNote = null,
}) {
  const client = assertSupabase()
  const userId = await requireAuthUserId()

  const flagged = Boolean(painFlag)
  const note = flagged ? (String(painNote || '').trim() || null) : null

  const { data, error } = await client
    .from('logs')
    .update({
      pain_flag: flagged,
      pain_note: note,
    })
    .eq('user_id', userId)
    .eq('workout_exercise_id', workoutExerciseId)
    .select()

  if (error) throw error
  return data ?? []
}

/** True when each workout_exercise has enough logged work. */
export function isWorkoutFullyLogged(exercises, logs, logSplits = []) {
  if (!exercises?.length) return false
  return exercises.every((we) => isExerciseFullyLogged(we, logs, logSplits))
}

export function loggedCountFor(logs, workoutExerciseId) {
  return logs.filter((l) => l.workout_exercise_id === workoutExerciseId).length
}

/** Progress numerator/denominator for UI (sets or splits). */
export function exerciseProgress(we, logs, logSplits = []) {
  if (isCardioExercise(we)) {
    if (we.is_interval) {
      const total = prescribedSplitCount(we) || 1
      const weLogs = logs.filter((l) => l.workout_exercise_id === we.id)
      const parentIds = new Set(weLogs.map((l) => l.id))
      const done = (logSplits ?? []).filter((s) => parentIds.has(s.log_id))
        .length
      return { done, total }
    }
    const done = isExerciseFullyLogged(we, logs, logSplits) ? 1 : 0
    return { done, total: 1 }
  }
  const total = Number(we.sets) || 0
  const done = Math.min(loggedCountFor(logs, we.id), total)
  return { done, total }
}

export function exerciseRpe(logs, workoutExerciseId) {
  const row = logs.find(
    (l) => l.workout_exercise_id === workoutExerciseId && l.rpe != null,
  )
  return row?.rpe ?? null
}

export function exerciseHasPain(logs, workoutExerciseId) {
  return logs.some(
    (l) => l.workout_exercise_id === workoutExerciseId && l.pain_flag,
  )
}

export function exercisePainNote(logs, workoutExerciseId) {
  const row = logs.find(
    (l) =>
      l.workout_exercise_id === workoutExerciseId &&
      l.pain_flag &&
      l.pain_note,
  )
  return row?.pain_note ?? null
}
