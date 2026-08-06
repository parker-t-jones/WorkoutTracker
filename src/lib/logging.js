import { supabase } from './supabase'

function assertSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }
  return supabase
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
 */
export async function saveSetLog({
  userId,
  scheduledWorkoutId,
  workoutExerciseId,
  setNumber,
  actualReps,
  actualWeight,
  exercises,
  existingLogs,
}) {
  const client = assertSupabase()

  const { data: log, error } = await client
    .from('logs')
    .insert({
      workout_exercise_id: workoutExerciseId,
      user_id: userId,
      set_number: setNumber,
      actual_reps: actualReps,
      actual_weight: actualWeight,
      completed_at: new Date().toISOString(),
    })
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

    if (statusErr) throw statusErr
  }

  return { log, completed }
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
