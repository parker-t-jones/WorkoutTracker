import { supabase } from './supabase'
import { computePace, convertWeight } from './units'
import { workSplitNumbers, countLoggedWorkSplits } from './intervals'

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

/** Work splits required for completion (recovery rows are optional). */
export function prescribedSplitCount(we) {
  return workSplitNumbers(we).size
}

function splitsForExercise(we, logs, logSplits) {
  const parentIds = new Set(
    (logs ?? [])
      .filter((l) => l.workout_exercise_id === we.id)
      .map((l) => l.id),
  )
  return (logSplits ?? []).filter((s) => parentIds.has(s.log_id))
}

/** True when this workout_exercise has enough logged work to count as done. */
export function isExerciseFullyLogged(we, logs, logSplits = []) {
  const weLogs = (logs ?? []).filter((l) => l.workout_exercise_id === we.id)
  if (isCardioExercise(we)) {
    if (we.is_interval) {
      const needed = prescribedSplitCount(we)
      if (needed <= 0) return weLogs.length >= 1
      return (
        countLoggedWorkSplits(we, splitsForExercise(we, logs, logSplits)) >=
        needed
      )
    }
    return weLogs.some(
      (l) =>
        l.actual_duration_seconds != null || l.actual_distance != null,
    )
  }
  return weLogs.length >= (Number(we.sets) || 0)
}

/**
 * Insert a log row. If the logs.weight_unit column doesn't exist yet (the
 * 2026-11 hardening migration hasn't been run), retry without it so logging
 * keeps working.
 */
async function insertLogRow(client, payload) {
  let res = await client.from('logs').insert(payload).select().single()
  if (res.error && 'weight_unit' in payload && isMissingWeightUnit(res.error)) {
    res = await client.from('logs').insert(withoutWeightUnit(payload)).select().single()
  }
  if (res.error) throw res.error
  return res.data
}

async function updateLogRow(client, logId, userId, fields) {
  const run = (f) =>
    client
      .from('logs')
      .update(f)
      .eq('id', logId)
      .eq('user_id', userId)
      .select()
      .single()
  let res = await run(fields)
  if (res.error && 'weight_unit' in fields && isMissingWeightUnit(res.error)) {
    res = await run(withoutWeightUnit(fields))
  }
  if (res.error) throw res.error
  return res.data
}

/**
 * Pre-migration fallback: rows without weight_unit are read as pounds, so a
 * kg entry must be stored converted to lb or it would later display as
 * (and progress/e1RM would treat it as) the same number in pounds.
 */
function withoutWeightUnit(fields) {
  const { weight_unit: unit, ...rest } = fields
  if (unit === 'kg' && rest.actual_weight != null) {
    rest.actual_weight = convertWeight(rest.actual_weight, 'kg', 'lb')
  }
  return rest
}

function isMissingWeightUnit(error) {
  return /weight_unit/i.test(
    `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`,
  )
}

/** Oldest log row in the DB for this workout_exercise (or null). */
async function findExistingLogForExercise(client, workoutExerciseId, userId) {
  const { data, error } = await client
    .from('logs')
    .select('*')
    .eq('workout_exercise_id', workoutExerciseId)
    .eq('user_id', userId)
    .order('completed_at', { ascending: true })
    .limit(1)
  if (error) throw error
  return data?.[0] ?? null
}

const COMPLETE_WARNING =
  'Saved, but the workout could not be marked complete — it will retry on your next save, or use Finish workout.'

/**
 * Mark the scheduled workout complete when everything is logged. Never
 * throws: the log row is already saved, so callers must still get it into
 * state (otherwise a retry would insert a duplicate). Returns
 * { completed, warning }.
 */
async function completeIfFullyLogged(
  scheduledWorkoutId,
  userId,
  exercises,
  allLogs,
  logSplits,
) {
  if (!isWorkoutFullyLogged(exercises, allLogs, logSplits)) {
    return { completed: false, warning: null }
  }
  try {
    await markScheduledCompleted(scheduledWorkoutId, userId)
    return { completed: true, warning: null }
  } catch (err) {
    console.error(err)
    return { completed: false, warning: COMPLETE_WARNING }
  }
}

/**
 * Insert one set into logs. If every prescribed set for the scheduled
 * workout is now logged, mark scheduled_workouts.status = completed.
 * Returns { log, completed, warning }.
 *
 * If a row for this set_number already exists in the DB but not in local
 * state (an earlier attempt committed but its response was lost), that row
 * is updated instead of inserting a duplicate.
 */
export async function saveSetLog({
  scheduledWorkoutId,
  workoutExerciseId,
  setNumber,
  actualReps,
  actualWeight,
  weightUnit = null,
  exercises,
  existingLogs,
  logSplits = [],
}) {
  const client = assertSupabase()
  const userId = await requireAuthUserId()

  const fields = {
    actual_reps: actualReps,
    actual_weight: actualWeight,
  }
  if (weightUnit === 'lb' || weightUnit === 'kg') fields.weight_unit = weightUnit

  const knownIds = new Set((existingLogs ?? []).map((l) => l.id))
  const { data: sameSet, error: lookupErr } = await client
    .from('logs')
    .select('id')
    .eq('workout_exercise_id', workoutExerciseId)
    .eq('user_id', userId)
    .eq('set_number', setNumber)
    .limit(1)
  if (lookupErr) throw lookupErr
  const orphan = (sameSet ?? []).find((row) => !knownIds.has(row.id))

  const log = orphan
    ? await updateLogRow(client, orphan.id, userId, fields)
    : await insertLogRow(client, {
        workout_exercise_id: workoutExerciseId,
        user_id: userId,
        set_number: setNumber,
        completed_at: new Date().toISOString(),
        ...fields,
      })

  const allLogs = [...existingLogs.filter((l) => l.id !== log.id), log]
  const { completed, warning } = await completeIfFullyLogged(
    scheduledWorkoutId,
    userId,
    exercises,
    allLogs,
    logSplits,
  )
  return { log, completed, warning }
}

export async function updateSetLog({
  logId,
  actualReps,
  actualWeight,
  weightUnit = null,
}) {
  const client = assertSupabase()
  const userId = await requireAuthUserId()

  const fields = {
    actual_reps: actualReps,
    actual_weight: actualWeight,
  }
  if (weightUnit === 'lb' || weightUnit === 'kg') fields.weight_unit = weightUnit
  return updateLogRow(client, logId, userId, fields)
}

/**
 * Delete one strength set, then renumber that exercise's remaining sets
 * 1..n (by set_number, then completed_at) so "next set" logic stays right.
 * Returns { deletedId, updated } where updated = renumbered rows.
 */
export async function deleteSetLog({ logId, workoutExerciseId }) {
  const client = assertSupabase()
  const userId = await requireAuthUserId()

  const { error } = await client
    .from('logs')
    .delete()
    .eq('id', logId)
    .eq('user_id', userId)
  if (error) throw error

  const { data: remaining, error: listErr } = await client
    .from('logs')
    .select('*')
    .eq('workout_exercise_id', workoutExerciseId)
    .eq('user_id', userId)
    .order('set_number', { ascending: true })
    .order('completed_at', { ascending: true })
  if (listErr) throw listErr

  const updated = []
  for (const [i, row] of (remaining ?? []).entries()) {
    const want = i + 1
    if (row.set_number === want) continue
    const { data, error: updErr } = await client
      .from('logs')
      .update({ set_number: want })
      .eq('id', row.id)
      .eq('user_id', userId)
      .select()
      .single()
    if (updErr) throw updErr
    updated.push(data)
  }
  return { deletedId: logId, remaining: remaining ?? [], updated }
}

/** "Finish workout": mark the scheduled workout completed regardless of logs. */
export async function finishScheduledWorkout(scheduledWorkoutId) {
  const userId = await requireAuthUserId()
  await markScheduledCompleted(scheduledWorkoutId, userId)
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

  // A row may exist in the DB but not in state if an earlier save committed
  // and then failed — reuse it instead of inserting a duplicate.
  const targetId =
    existingLogId ??
    (await findExistingLogForExercise(client, workoutExerciseId, userId))?.id ??
    null

  let log
  if (targetId) {
    log = await updateLogRow(client, targetId, userId, fields)
  } else {
    log = await insertLogRow(client, {
      workout_exercise_id: workoutExerciseId,
      user_id: userId,
      set_number: 1,
      completed_at: new Date().toISOString(),
      ...fields,
    })
  }

  const allLogs = [...existingLogs.filter((l) => l.id !== log.id), log]
  const { completed, warning } = await completeIfFullyLogged(
    scheduledWorkoutId,
    userId,
    exercises,
    allLogs,
    logSplits,
  )
  return { log, completed, warning }
}

/**
 * Ensure a parent log exists for an interval session, then upsert one split.
 * Returns { log, split, completed, warning, logSplits }.
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
    // Retry-safe: a parent may already exist in the DB from an attempt whose
    // split insert failed after the parent was created.
    parentLog = await findExistingLogForExercise(
      client,
      workoutExerciseId,
      userId,
    )
  }

  if (!parentLog) {
    parentLog = await insertLogRow(client, {
      workout_exercise_id: workoutExerciseId,
      user_id: userId,
      set_number: 1,
      actual_reps: 0,
      actual_weight: null,
      completed_at: new Date().toISOString(),
    })
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

  // Upsert on (log_id, split_number): covers edits and retries where the
  // split exists in the DB but not in local state.
  const { data: split, error: splitErr } = await client
    .from('log_splits')
    .upsert(splitPayload, { onConflict: 'log_id,split_number' })
    .select()
    .single()
  if (splitErr) throw splitErr

  const allLogs = existingLogs.some((l) => l.id === parentLog.id)
    ? existingLogs
    : [...existingLogs, parentLog]
  const nextSplits = [
    ...(logSplits ?? []).filter(
      (s) =>
        s.id !== split.id &&
        !(s.log_id === split.log_id && s.split_number === split.split_number),
    ),
    split,
  ]

  const { completed, warning } = await completeIfFullyLogged(
    scheduledWorkoutId,
    userId,
    exercises,
    allLogs,
    nextSplits,
  )

  return { log: parentLog, split, completed, warning, logSplits: nextSplits }
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
      const done = Math.min(
        countLoggedWorkSplits(we, splitsForExercise(we, logs, logSplits)),
        total,
      )
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
