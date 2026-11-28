import { supabase } from './supabase'
import { normalizeExerciseName } from './user'
import { startOfWeekMonday, addDays } from './adapt'
import {
  combineDurationFields,
  getDistanceUnit,
} from './units'

function assertSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env',
    )
  }
  return supabase
}

/** Live auth uid. Used for owner-scoped exercise inserts only — never as workout user_id. */
async function requireAuthUserId() {
  const client = assertSupabase()
  const { data, error } = await client.auth.getUser()
  if (error) throw error
  if (!data?.user?.id) {
    throw new Error('Not signed in')
  }
  return data.user.id
}

function parseDateKey(dateKey) {
  const [y, m, d] = String(dateKey)
    .split('-')
    .map((n) => Number(n))
  if (!y || !m || !d) throw new Error('Invalid date')
  return new Date(y, m - 1, d)
}

function toDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dayNumberMon1(date) {
  return ((date.getDay() + 6) % 7) + 1
}

/**
 * Pick week_number / day_number so coach-assigned days sit on the same
 * week index as neighboring scheduled sessions when possible.
 */
export function inferWeekAndDay(dateKey, scheduledWorkouts, workoutsById) {
  const date = parseDateKey(dateKey)
  const day_number = dayNumberMon1(date)
  const monday = startOfWeekMonday(date)
  const mondayKey = toDateKey(monday)
  const sundayKey = toDateKey(addDays(monday, 6))

  for (const sw of scheduledWorkouts ?? []) {
    if (sw.date >= mondayKey && sw.date <= sundayKey) {
      const w = workoutsById?.[sw.workout_id]
      if (w?.week_number != null) {
        return { week_number: w.week_number, day_number }
      }
    }
  }

  let maxWeek = 0
  let lastDate = null
  for (const sw of scheduledWorkouts ?? []) {
    const w = workoutsById?.[sw.workout_id]
    if (w?.week_number != null && w.week_number > maxWeek) {
      maxWeek = w.week_number
    }
    if (!lastDate || sw.date > lastDate) lastDate = sw.date
  }

  if (maxWeek === 0) return { week_number: 1, day_number }

  if (lastDate) {
    const lastMonday = startOfWeekMonday(parseDateKey(lastDate))
    const weeksDelta = Math.round(
      (monday.getTime() - lastMonday.getTime()) / (7 * 24 * 60 * 60 * 1000),
    )
    return {
      week_number: Math.max(1, maxWeek + weeksDelta),
      day_number,
    }
  }

  return { week_number: maxWeek, day_number }
}

const PAGE_SIZE = 1000

/** Escape LIKE wildcards so .ilike() is an exact, case-insensitive match. */
function likeExact(text) {
  return String(text).replace(/[\\%_]/g, (c) => `\\${c}`)
}

/**
 * Shared library (owner_id null) + this coach's private exercises.
 * exercises_select_visible also returns other owners' exercises that appear
 * in a workout the caller can see; those are filtered out of the picker.
 * Paged: PostgREST silently truncates at max_rows (1000).
 */
export async function loadExerciseLibrary() {
  const client = assertSupabase()
  const coachId = await requireAuthUserId()
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('exercises')
      .select('*')
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
    .filter((e) => e.owner_id == null || e.owner_id === coachId)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

/**
 * Insert a coach-owned exercise. Shape matches approveProposal's shared
 * create, plus owner_id = the signed-in coach (null is reserved for the
 * shared/AI library) and modality so cardio prescriptions branch correctly.
 */
export async function createOwnedExercise({
  name,
  modality = 'strength',
  typicallyInterval = false,
  catalog = [],
}) {
  const client = assertSupabase()
  const coachId = await requireAuthUserId()
  const trimmed = String(name ?? '').trim()
  if (!trimmed) throw new Error('Exercise name is required')

  const want = normalizeExerciseName(trimmed)
  const existing = (catalog ?? []).find(
    (e) => normalizeExerciseName(e.name) === want,
  )
  if (existing) return existing

  // Same name already visible (shared, or this coach's own)?
  const { data: visible, error: lookupError } = await client
    .from('exercises')
    .select('*')
    .ilike('name', likeExact(trimmed))
    .or(`owner_id.is.null,owner_id.eq.${coachId}`)
    .limit(1)
  if (lookupError) throw lookupError
  if (visible?.[0]) return visible[0]

  const row = {
    name: trimmed,
    movement_pattern: 'other',
    muscle_group: 'general',
    equipment_required: null,
    contraindication_tags: [],
    owner_id: coachId,
    modality: modality === 'cardio' ? 'cardio' : 'strength',
    typically_interval:
      modality === 'cardio' ? Boolean(typicallyInterval) : false,
  }

  const { data, error } = await client
    .from('exercises')
    .insert(row)
    .select()
    .single()

  if (error) {
    const { data: again } = await client
      .from('exercises')
      .select('*')
      .ilike('name', likeExact(trimmed))
      .or(`owner_id.is.null,owner_id.eq.${coachId}`)
      .limit(1)
    if (again?.[0]) return again[0]
    if (error?.code === '23505') {
      throw new Error('That exercise name is already in use')
    }
    throw error
  }

  return data
}

function formatPaceFields(minutes, seconds) {
  const total = combineDurationFields(minutes, seconds)
  if (total == null || total <= 0) return null
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function workoutExerciseRow(workoutId, draft, sortOrder) {
  const exercise = draft.exercise
  if (!exercise?.id) {
    throw new Error('Every movement needs an exercise from the library')
  }
  const modality = exercise.modality === 'cardio' ? 'cardio' : 'strength'
  const notes = String(draft.notes ?? '')
  const isInterval = modality === 'cardio' && Boolean(draft.is_interval)

  if (modality === 'cardio') {
    const durationSec = combineDurationFields(
      draft.durationMinutes,
      draft.durationSeconds,
    )
    const distRaw = String(draft.target_distance ?? '').trim()
    const distNum = distRaw === '' ? null : Number(distRaw)
    const targetDistance =
      distNum != null && Number.isFinite(distNum) && distNum > 0 ? distNum : null
    const distanceUnit =
      draft.distance_unit === 'km' || draft.distance_unit === 'mi'
        ? draft.distance_unit
        : getDistanceUnit()

    let targetSplits = null
    let workBouts = 1
    if (isInterval) {
      const splits = (draft.splits ?? [])
        .map((s, i) => {
          const duration_seconds = combineDurationFields(s.minutes, s.seconds)
          const splitDistRaw = String(s.distance ?? '').trim()
          const splitDist = splitDistRaw === '' ? null : Number(splitDistRaw)
          const target_pace = formatPaceFields(s.paceMinutes, s.paceSeconds)
          const row = {
            split_number: i + 1,
            label: s.label === 'recovery' ? 'recovery' : 'work',
          }
          if (duration_seconds != null && duration_seconds > 0) {
            row.duration_seconds = duration_seconds
          }
          if (splitDist != null && Number.isFinite(splitDist) && splitDist > 0) {
            row.distance = splitDist
            row.unit = distanceUnit
          }
          if (target_pace) row.target_pace = target_pace
          return row
        })
        .filter(
          (s) =>
            s.duration_seconds != null ||
            s.distance != null ||
            Boolean(s.target_pace),
        )
      if (splits.length === 0) {
        throw new Error(`Add at least one split for ${exercise.name}`)
      }
      targetSplits = splits.map((s, i) => ({ ...s, split_number: i + 1 }))
      workBouts =
        targetSplits.filter((s) => (s.label || 'work') !== 'recovery').length ||
        targetSplits.length
    } else if (
      (durationSec == null || durationSec <= 0) &&
      targetDistance == null
    ) {
      throw new Error(
        `Set a duration or distance for ${exercise.name}`,
      )
    }

    return {
      workout_id: workoutId,
      exercise_id: exercise.id,
      sets: isInterval ? workBouts : 1,
      reps: '—',
      weight_guidance: String(draft.weight_guidance || 'steady'),
      notes,
      target_duration_seconds:
        !isInterval && durationSec != null && durationSec > 0
          ? durationSec
          : null,
      target_distance: isInterval ? null : targetDistance,
      distance_unit: distanceUnit,
      is_interval: isInterval,
      target_splits: isInterval ? targetSplits : null,
      sort_order: sortOrder,
    }
  }

  const sets = Number(draft.sets)
  if (!Number.isFinite(sets) || sets < 1) {
    throw new Error(`Sets must be at least 1 for ${exercise.name}`)
  }
  const reps = String(draft.reps ?? '').trim()
  if (!reps) {
    throw new Error(`Reps are required for ${exercise.name}`)
  }

  return {
    workout_id: workoutId,
    exercise_id: exercise.id,
    sets,
    reps,
    weight_guidance: String(draft.weight_guidance || 'moderate'),
    notes,
    target_duration_seconds: null,
    target_distance: null,
    distance_unit: null,
    is_interval: false,
    target_splits: null,
    sort_order: sortOrder,
  }
}

/** sort_order exists once 2026-11-notes-and-editing.sql has run. */
function isMissingSortOrder(error) {
  if (!error) return false
  const text = `${error.message ?? ''} ${error.details ?? ''}`
  return (
    (['PGRST204', '42703'].includes(error.code) || /column/i.test(text)) &&
    text.includes('sort_order')
  )
}

function withoutSortOrder(row) {
  const { sort_order: _dropped, ...rest } = row
  return rest
}

/** Run a write; retry once without sort_order on a pre-migration database. */
async function writeWithSortOrder(rows, write) {
  const result = await write(rows)
  if (!isMissingSortOrder(result.error)) return result
  return write(Array.isArray(rows) ? rows.map(withoutSortOrder) : withoutSortOrder(rows))
}

async function insertWorkoutExercises(client, workoutId, drafts) {
  const rows = drafts.map((draft, i) => workoutExerciseRow(workoutId, draft, i + 1))
  const { error } = await writeWithSortOrder(rows, (r) =>
    client.from('workout_exercises').insert(r),
  )
  if (error) throw error
}

/**
 * Logged workout: update existing rows in place (matched by the draft's
 * existingWeId, never by list position) and insert new ones. Rows cannot be
 * deleted here (coaches have no DELETE policy, and logged rows are protected
 * by workout_exercises_guard_edit), so the builder keeps existing rows.
 */
async function updateWorkoutExercises(client, workoutId, existingExercises, drafts) {
  const existingById = new Map((existingExercises ?? []).map((we) => [we.id, we]))
  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]
    const existing = draft.existingWeId ? existingById.get(draft.existingWeId) : null
    const row = workoutExerciseRow(workoutId, draft, i + 1)
    if (existing) {
      const { workout_id: _ignore, ...patch } = row
      const { data, error } = await writeWithSortOrder(patch, (p) =>
        client
          .from('workout_exercises')
          .update(p)
          .eq('id', existing.id)
          .eq('workout_id', workoutId)
          .select('id'),
      )
      if (error) throw error
      if (!data?.length) {
        throw new Error('You can’t edit this workout (is the athlete still active?)')
      }
    } else {
      const { error } = await writeWithSortOrder(row, (r) =>
        client.from('workout_exercises').insert(r),
      )
      if (error) throw error
    }
  }
}

/**
 * Create or replace a day's workout for an athlete.
 * user_id on workouts / scheduled_workouts is always athleteId (the athlete
 * being viewed), never the coach's uid.
 *
 * Coaches have INSERT/UPDATE but not DELETE on these tables. When the
 * session has no logs we insert a new workout and retarget scheduled_workouts.
 * When logs exist we update in place and only append new exercise rows.
 *
 * Does not write to logs or log_splits.
 */
export async function saveAthleteWorkout({
  athleteId,
  date,
  focus,
  drafts,
  existingScheduled = null,
  existingWorkout = null,
  existingExercises = [],
  preserveExistingRows = false,
  scheduledWorkouts = [],
  workoutsById = {},
}) {
  const client = assertSupabase()
  if (!athleteId) throw new Error('Missing athlete')
  const trimmedFocus = String(focus ?? '').trim()
  if (!trimmedFocus) throw new Error('Give this workout a focus')
  if (!drafts?.length) throw new Error('Add at least one exercise')

  let scheduled = existingScheduled
  if (!scheduled) {
    const { data: existingRows, error } = await client
      .from('scheduled_workouts')
      .select('*')
      .eq('user_id', athleteId)
      .eq('date', date)
      .order('id', { ascending: true })
    if (error) throw error
    scheduled = existingRows?.[0] ?? null
  }

  const weekAndDay = existingWorkout
    ? {
        week_number: existingWorkout.week_number,
        day_number: existingWorkout.day_number,
      }
    : inferWeekAndDay(date, scheduledWorkouts, workoutsById)

  if (preserveExistingRows && scheduled && existingWorkout) {
    const { data: updated, error: wErr } = await client
      .from('workouts')
      .update({ focus: trimmedFocus })
      .eq('id', existingWorkout.id)
      .eq('user_id', athleteId)
      .select('id')
    if (wErr) throw wErr
    if (!updated?.length) {
      throw new Error('You can’t edit this workout (is the athlete still active?)')
    }

    await updateWorkoutExercises(
      client,
      existingWorkout.id,
      existingExercises,
      drafts,
    )
    return { workoutId: existingWorkout.id, scheduledId: scheduled.id }
  }

  // created_by is not sent: workouts_guard_created_by sets it to auth.uid()
  // (the coach), which is what stops the athlete editing this workout.
  const { data: workout, error: wErr } = await client
    .from('workouts')
    .insert({
      user_id: athleteId,
      week_number: weekAndDay.week_number,
      day_number: weekAndDay.day_number,
      focus: trimmedFocus,
    })
    .select()
    .single()
  if (wErr) throw wErr

  await insertWorkoutExercises(client, workout.id, drafts)

  if (scheduled) {
    const { data: retargeted, error: swErr } = await client
      .from('scheduled_workouts')
      .update({ workout_id: workout.id })
      .eq('id', scheduled.id)
      .eq('user_id', athleteId)
      .select('id')
    if (swErr) throw swErr
    if (!retargeted?.length) {
      throw new Error('You can’t edit this workout (is the athlete still active?)')
    }
    return { workoutId: workout.id, scheduledId: scheduled.id }
  }

  const { data: insertedSw, error: swErr } = await client
    .from('scheduled_workouts')
    .insert({
      workout_id: workout.id,
      user_id: athleteId,
      date,
      status: 'pending',
    })
    .select()
    .single()
  if (swErr) throw swErr

  return { workoutId: workout.id, scheduledId: insertedSw.id }
}
