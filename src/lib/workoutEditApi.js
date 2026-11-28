import { supabase } from './supabase'

/**
 * Writes for athletes editing their own workouts (see workoutEditing.js for
 * the pure helpers). RLS + the workout_exercises_guard_edit trigger
 * (supabase/2026-11-notes-and-editing.sql section 3) are the real rules; the
 * app only hides controls it knows the server would refuse.
 *
 * Before that migration: athlete_edits / sort_order don't exist yet, so
 * writes retry without them (editing still works; reordering is hidden).
 */

const OPTIONAL_COLUMNS = ['athlete_edits', 'sort_order']
const WE_SELECT = '*, exercise:exercises(*)'

function assertSupabase() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

function missingColumn(error) {
  if (!error) return null
  const text = `${error.message ?? ''} ${error.details ?? ''}`
  if (!['PGRST204', '42703'].includes(error.code) && !/column/i.test(text)) return null
  return OPTIONAL_COLUMNS.find((c) => text.includes(c)) ?? null
}

/** Run `fn(fields)`, dropping optional columns the database doesn't have. */
async function withOptionalColumns(fields, fn) {
  let current = { ...fields }
  for (let attempt = 0; attempt <= OPTIONAL_COLUMNS.length; attempt++) {
    const result = await fn(current)
    const col = missingColumn(result.error)
    if (!col || !(col in current)) return result
    const { [col]: _dropped, ...rest } = current
    current = rest
  }
  return fn(current)
}

function friendly(error, fallback) {
  const msg = error?.message || ''
  if (error?.code === '42501' && !/coach/i.test(msg)) {
    return new Error('You can’t edit this workout.')
  }
  return new Error(msg || fallback)
}

/** Exercises the user can see (shared catalog + their own + coach-assigned). */
export async function fetchExerciseLibrary() {
  const client = assertSupabase()
  const { data, error } = await client
    .from('exercises')
    .select('*')
    .order('name', { ascending: true })
    .range(0, 1999)
  if (error) throw friendly(error, 'Could not load the exercise library')
  return data ?? []
}

/** Vetted substitutions for one exercise ([] on any error). */
export async function fetchVettedSubstitutes(exerciseId) {
  if (!exerciseId) return []
  const client = assertSupabase()
  const { data, error } = await client
    .from('substitutions')
    .select('substitute_exercise_id, priority_rank, reason_tag')
    .eq('primary_exercise_id', exerciseId)
    .order('priority_rank', { ascending: true })
  if (error) {
    console.warn('Could not load substitutions:', error)
    return []
  }
  return data ?? []
}

/** Update one workout_exercises row; returns it with its exercise embedded. */
export async function updateWorkoutExercise(id, patch) {
  const client = assertSupabase()
  const { data, error } = await withOptionalColumns(patch, (fields) =>
    client.from('workout_exercises').update(fields).eq('id', id).select(WE_SELECT),
  )
  if (error) throw friendly(error, 'Could not save the change')
  if (!data?.length) throw new Error('You can’t edit this workout.')
  return data[0]
}

/** Insert an exercise into a workout; returns the row with its exercise. */
export async function insertWorkoutExercise(row) {
  const client = assertSupabase()
  const { data, error } = await withOptionalColumns(row, (fields) =>
    client.from('workout_exercises').insert(fields).select(WE_SELECT),
  )
  if (error) throw friendly(error, 'Could not add the exercise')
  if (!data?.length) throw new Error('Could not add the exercise')
  return data[0]
}

export async function deleteWorkoutExercise(id) {
  const client = assertSupabase()
  const { data, error } = await client
    .from('workout_exercises')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) throw friendly(error, 'Could not remove the exercise')
  if (!data?.length) throw new Error('You can’t edit this workout.')
}
