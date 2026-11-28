import { supabase } from './supabase'

/**
 * Athlete notes per prescribed exercise (public.exercise_notes, created by
 * supabase/2026-11-notes-and-editing.sql). One row per
 * (workout_exercise_id, user_id); works before any set is logged.
 *
 * If the migration hasn't been run, reads return [] and writes throw a
 * NotesUnavailableError so callers can fall back to the old
 * logs.pain_flag / pain_note behaviour.
 */

export const NOTE_MAX_LENGTH = 1000

export class NotesUnavailableError extends Error {
  constructor() {
    super('Exercise notes are not set up yet — run supabase/2026-11-notes-and-editing.sql.')
    this.name = 'NotesUnavailableError'
  }
}

/** PostgREST / Postgres "that table doesn't exist" for exercise_notes. */
export function isMissingNotesTable(error) {
  if (!error) return false
  if (error instanceof NotesUnavailableError) return true
  if (['42P01', 'PGRST205', 'PGRST204'].includes(error.code)) return true
  const text = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`
  return (
    /exercise_notes/i.test(text) &&
    /does not exist|could not find|schema cache/i.test(text)
  )
}

function assertSupabase() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

async function requireAuthUserId(client) {
  const { data, error } = await client.auth.getUser()
  if (error) throw error
  if (!data?.user?.id) throw new Error('Not signed in')
  return data.user.id
}

const PAGE_SIZE = 1000

/**
 * All notes written by `userId` (explicitly scoped: a coach can also read
 * their athletes' notes through RLS). Returns { notes, available }.
 * Never throws — a missing table or any read error just means no notes.
 */
export async function fetchExerciseNotes(userId) {
  const client = assertSupabase()
  const notes = []
  try {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await client
        .from('exercise_notes')
        .select('*')
        .eq('user_id', userId)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      notes.push(...(data ?? []))
      if ((data ?? []).length < PAGE_SIZE) break
    }
    return { notes, available: true }
  } catch (err) {
    if (!isMissingNotesTable(err)) console.error('Could not load exercise notes:', err)
    return { notes: [], available: !isMissingNotesTable(err) }
  }
}

/** Create or replace the caller's note on one workout_exercise. */
export async function saveExerciseNote({ workoutExerciseId, note, isPain }) {
  const client = assertSupabase()
  const userId = await requireAuthUserId(client)
  const text = String(note ?? '').trim().slice(0, NOTE_MAX_LENGTH)
  if (!text) throw new Error('Write a note first')

  const { data, error } = await client
    .from('exercise_notes')
    .upsert(
      {
        workout_exercise_id: workoutExerciseId,
        user_id: userId,
        note: text,
        is_pain: Boolean(isPain),
      },
      { onConflict: 'workout_exercise_id,user_id' },
    )
    .select()
    .single()
  if (error) {
    if (isMissingNotesTable(error)) throw new NotesUnavailableError()
    throw error
  }
  return data
}

/** Remove the caller's note on one workout_exercise (no-op if none). */
export async function deleteExerciseNote({ workoutExerciseId }) {
  const client = assertSupabase()
  const userId = await requireAuthUserId(client)
  const { error } = await client
    .from('exercise_notes')
    .delete()
    .eq('workout_exercise_id', workoutExerciseId)
    .eq('user_id', userId)
  if (error) {
    if (isMissingNotesTable(error)) throw new NotesUnavailableError()
    throw error
  }
}

/** workout_exercise_id → note row. */
export function notesByWorkoutExercise(notes) {
  const map = new Map()
  for (const n of notes ?? []) map.set(n.workout_exercise_id, n)
  return map
}
