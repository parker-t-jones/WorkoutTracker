import { supabase } from './supabase'

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

/**
 * Insert one set into logs. If every prescribed set for the scheduled
 * workout is now logged, mark scheduled_workouts.status = completed.
 * Returns { log, completed }.
 *
 * user_id always comes from the live session (auth.getUser()), not callers.
 */
export async function saveSetLog({
  scheduledWorkoutId,
  workoutExerciseId,
  setNumber,
  actualReps,
  actualWeight,
  exercises,
  existingLogs,
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
  const completed = isWorkoutFullyLogged(exercises, allLogs)

  if (completed) {
    const { error: statusErr } = await client
      .from('scheduled_workouts')
      .update({ status: 'completed' })
      .eq('id', scheduledWorkoutId)
      .eq('user_id', userId)

    if (statusErr) throw statusErr
  }

  return { log, completed }
}

/**
 * Update reps/weight on an existing log row. Leaves completed_at unchanged
 * so it still reflects when the set was first logged.
 */
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

/**
 * Apply an optional exercise-level RPE to every logged set for that
 * workout_exercise. Pass null to clear.
 */
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

/**
 * Flag (or clear) pain on every logged set for a workout_exercise.
 * pain_note is optional free text when flagged.
 */
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

/** True when each workout_exercise has at least `sets` log rows. */
export function isWorkoutFullyLogged(exercises, logs) {
  if (!exercises?.length) return false
  return exercises.every((we) => {
    const count = logs.filter((l) => l.workout_exercise_id === we.id).length
    return count >= we.sets
  })
}

export function loggedCountFor(logs, workoutExerciseId) {
  return logs.filter((l) => l.workout_exercise_id === workoutExerciseId).length
}

/** Shared RPE across an exercise's logs, if any set has one. */
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
