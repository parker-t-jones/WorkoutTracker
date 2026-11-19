import { supabase } from './supabase'
import {
  normalizeExerciseName,
  scheduleDateFor,
  nextMonday,
  firstWeekScheduleDates,
  START_TODAY,
  START_NEXT_MONDAY,
} from './user'
import { getDistanceUnit, getWeightUnit } from './units'
import {
  ensureCardioWarmup,
  normalizeCardioExercise,
} from './cardioPrescription'
import {
  groupByWeekNumber,
  maxWeekNumber,
  canGenerateNextWeek,
  buildPriorWeekAdaptation,
  mondayAfterLastScheduled,
  filterScheduledForCalendar,
  filterScheduledToHorizon,
  resolvePainSubstitutions,
} from './adapt'

const GENERATE_ERROR = "couldn't generate program, try again"

function assertSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env',
    )
  }
  return supabase
}

/**
 * PostgREST caps every response at max_rows (1000 in config.toml / the
 * hosted default) and silently truncates the rest. Page with .range() until a
 * short page comes back. The factory must build a fresh, deterministically
 * ordered query each call (include a unique tiebreaker such as id).
 */
const PAGE_SIZE = 1000

async function fetchAll(queryFactory) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await queryFactory().range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

/** Remove an embedded join-filter key (e.g. `workouts`) from each row. */
function stripKey(rows, key) {
  return rows.map((row) => {
    const copy = { ...row }
    delete copy[key]
    return copy
  })
}

/**
 * All interval splits for a user's logs. Scoped by user via an inner embed on
 * the parent log instead of an unbounded `.in('log_id', [...])` URL.
 */
export async function fetchUserLogSplits(userId) {
  const client = assertSupabase()
  const rows = await fetchAll(() =>
    client
      .from('log_splits')
      .select('*, logs!inner(user_id)')
      .eq('logs.user_id', userId)
      .order('split_number', { ascending: true })
      .order('id', { ascending: true }),
  )
  return stripKey(rows, 'logs')
}

/**
 * workout_exercises has no order column; the UI shows exercises in the order
 * the rows come back (insertion order), so these queries must NOT add an
 * ORDER BY and therefore cannot be paged with .range(). Instead query in
 * small chunks of workout ids (short URLs, far below max_rows) and split a
 * chunk in half if it ever comes back full.
 */
const WORKOUT_ID_CHUNK = 40

async function fetchWorkoutExercisesChunk(client, ids) {
  const { data, error } = await client
    .from('workout_exercises')
    .select('*, exercise:exercises(*)')
    .in('workout_id', ids)
  if (error) throw error
  const rows = data ?? []
  if (rows.length >= PAGE_SIZE) {
    if (ids.length === 1) {
      throw new Error('Too many exercises in one workout to load')
    }
    const mid = Math.ceil(ids.length / 2)
    const [a, b] = await Promise.all([
      fetchWorkoutExercisesChunk(client, ids.slice(0, mid)),
      fetchWorkoutExercisesChunk(client, ids.slice(mid)),
    ])
    return [...a, ...b]
  }
  return rows
}

async function fetchWorkoutExercises(client, workoutIds) {
  const chunks = []
  for (let i = 0; i < workoutIds.length; i += WORKOUT_ID_CHUNK) {
    chunks.push(workoutIds.slice(i, i + WORKOUT_ID_CHUNK))
  }
  const results = await Promise.all(
    chunks.map((ids) => fetchWorkoutExercisesChunk(client, ids)),
  )
  return results.flat()
}

/** Load calendar data for the signed-in auth user. */
export async function loadProgramData(userId) {
  const client = assertSupabase()
  if (!userId) {
    throw new Error('Not signed in')
  }

  // Every query is scoped to this user explicitly. RLS alone is not enough:
  // a coach can also read their athletes' rows.
  const scheduledWorkouts = await fetchAll(() =>
    client
      .from('scheduled_workouts')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true })
      .order('id', { ascending: true }),
  )

  if (!scheduledWorkouts.length) {
    return {
      userId,
      scheduledWorkouts: [],
      workouts: [],
      workoutDetails: {},
      logs: [],
      logSplits: [],
    }
  }

  const scheduledWorkoutIds = new Set(scheduledWorkouts.map((s) => s.workout_id))

  const [allWorkouts, workoutExercises, allLogs, logSplits] =
    await Promise.all([
      fetchAll(() =>
        client
          .from('workouts')
          .select('*')
          .eq('user_id', userId)
          .order('id', { ascending: true }),
      ),
      fetchWorkoutExercises(client, [...scheduledWorkoutIds]),
      fetchAll(() =>
        client
          .from('logs')
          .select('*')
          .eq('user_id', userId)
          .order('set_number', { ascending: true })
          .order('id', { ascending: true }),
      ),
      fetchUserLogSplits(userId),
    ])

  // Keep the previous shape: only workouts that are on the schedule (their
  // exercises were already fetched by scheduled workout id), and their logs.
  const workouts = allWorkouts.filter((w) => scheduledWorkoutIds.has(w.id))
  const weIds = new Set(workoutExercises.map((we) => we.id))
  const logs = allLogs.filter((l) => weIds.has(l.workout_exercise_id))

  const exercisesByWorkout = new Map()
  for (const we of workoutExercises) {
    if (!exercisesByWorkout.has(we.workout_id)) {
      exercisesByWorkout.set(we.workout_id, [])
    }
    exercisesByWorkout.get(we.workout_id).push(we)
  }

  const workoutDetails = {}
  for (const w of workouts) {
    workoutDetails[w.id] = {
      workout: w,
      exercises: exercisesByWorkout.get(w.id) ?? [],
    }
  }

  return {
    userId,
    scheduledWorkouts,
    workouts,
    workoutDetails,
    logs,
    logSplits,
  }
}

async function ensureUser(userId, answers) {
  const client = assertSupabase()

  const { data: existing, error: selectErr } = await client
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (selectErr) throw selectErr

  const profile = {
    goal: answers.goal,
    experience_level: answers.experience_level,
    days_per_week: answers.days_per_week,
    equipment_access: answers.equipment,
    limitations: answers.limitations || null,
    age: answers.age != null ? Number(answers.age) : null,
    bodyweight: answers.bodyweight != null ? Number(answers.bodyweight) : null,
    bodyweight_unit: answers.bodyweight_unit || null,
    session_length: answers.session_length || null,
    additional_notes: answers.additional_notes || null,
  }

  if (existing) {
    const { data, error } = await client
      .from('users')
      .update(profile)
      .eq('id', userId)
      .select()
      .single()
    if (error) throw error
    return data
  }

  const { data, error } = await client
    .from('users')
    .insert({
      id: userId,
      name: 'Athlete',
      ...profile,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

async function fetchUserProfile(userId) {
  const client = assertSupabase()
  const { data, error } = await client
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

async function fetchExerciseCatalog() {
  const client = assertSupabase()
  const { data, error } = await client.from('exercises').select('*')
  if (error) throw error
  return data ?? []
}

/**
 * Id of a catalog exercise for `name`, creating a shared (owner_id null) row
 * through the ensure_shared_exercise RPC when the AI picked an unknown name.
 * Direct INSERTs into exercises require owner_id = auth.uid() since
 * coach_mode.sql, so the RPC is the only way to grow the shared catalog.
 */
async function resolveExerciseId(
  name,
  catalog,
  catalogByNorm,
  { modality = 'strength' } = {},
) {
  const client = assertSupabase()
  const norm = normalizeExerciseName(name)
  const existing = catalogByNorm.get(norm)
  if (existing) return existing.id

  const isCardio = modality === 'cardio'
  const { data: id, error } = await client.rpc('ensure_shared_exercise', {
    p_name: name.trim(),
    p_movement_pattern: isCardio ? 'cardio_other' : 'other',
    p_muscle_group: isCardio ? 'cardio' : 'general',
    p_modality: isCardio ? 'cardio' : 'strength',
  })
  if (error) throw error
  if (!id) throw new Error(`Could not resolve exercise "${name}"`)

  const row = {
    id,
    name: name.trim(),
    movement_pattern: isCardio ? 'cardio_other' : 'other',
    muscle_group: isCardio ? 'cardio' : 'general',
    modality: isCardio ? 'cardio' : 'strength',
    owner_id: null,
  }
  catalog.push(row)
  catalogByNorm.set(norm, row)
  return id
}

/** Errors from resolveExerciseId that should skip one exercise, not the run. */
function isSkippableExerciseError(err) {
  return ['22023', '23505', 'PGRST202', '42883'].includes(err?.code)
}

async function invokeGenerateProgram(body) {
  const client = assertSupabase()
  const { data, error } = await client.functions.invoke('generate-program', {
    body,
  })

  if (error) {
    console.error('Edge function error:', error)
    let message = GENERATE_ERROR
    try {
      const payload = await error.context?.json?.()
      if (typeof payload?.error === 'string') message = payload.error
    } catch {
      // ignore body parse failures
    }
    throw new Error(message)
  }

  if (data?.error) {
    throw new Error(
      typeof data.error === 'string' ? data.error : GENERATE_ERROR,
    )
  }

  const program = data?.program
  if (!program?.weeks?.length) {
    throw new Error(GENERATE_ERROR)
  }

  return program
}

async function insertProgramWeeks({
  userId,
  program,
  daysPerWeek,
  startMonday,
  /** When true, schedule dates as if this is week 1 relative to startMonday
   *  (used when appending adaptive weeks whose Monday is already week N's start). */
  relativeToStartMonday = false,
  /** Explicit YYYY-MM-DD per day index for a single-week program (onboarding
   *  "start today"). Overrides startMonday + trainingDayOffsets. */
  scheduleDates = null,
}) {
  const client = assertSupabase()
  const catalog = await fetchExerciseCatalog()
  const catalogByNorm = new Map(
    catalog.map((e) => [normalizeExerciseName(e.name), e]),
  )
  const distanceUnit = getDistanceUnit()

  // Pass 1 — no writes to workouts yet: normalize every exercise and resolve
  // every exercise id first, so the most common failure (an unknown / invalid
  // exercise name) happens before any workout row exists.
  const planned = []
  for (const week of program.weeks) {
    for (let dayIndex = 0; dayIndex < week.days.length; dayIndex++) {
      const day = week.days[dayIndex]
      ensureCardioWarmup(day, distanceUnit)

      const exercises = []
      let firstSkipError = null
      for (const raw of day.exercises) {
        const catalogEx = catalogByNorm.get(normalizeExerciseName(raw.name))
        const ex = normalizeCardioExercise(raw, catalogEx, distanceUnit)
        const modality = ex.modality === 'cardio' ? 'cardio' : 'strength'
        let exerciseId
        try {
          exerciseId = await resolveExerciseId(
            ex.name,
            catalog,
            catalogByNorm,
            { modality },
          )
        } catch (err) {
          // An unusable AI-chosen name (rejected by ensure_shared_exercise,
          // taken by a private exercise, or the RPC not migrated yet) drops
          // just that exercise. Network/auth errors still fail the run.
          if (!isSkippableExerciseError(err)) throw err
          console.warn(`Skipping exercise "${ex.name}":`, err)
          firstSkipError ??= err
          continue
        }
        exercises.push({ ex, exerciseId, modality })
      }
      if (exercises.length === 0 && firstSkipError) throw firstSkipError

      const scheduleWeekNumber = relativeToStartMonday ? 1 : week.week_number
      const date = scheduleDates?.length
        ? scheduleDates[Math.min(dayIndex, scheduleDates.length - 1)]
        : scheduleDateFor(scheduleWeekNumber, dayIndex, daysPerWeek, startMonday)
      planned.push({ week, day, exercises, date })
    }
  }

  // Pass 2 — writes. PostgREST gives no multi-statement transaction, so track
  // every inserted workout and delete them on failure. Deleting a workout
  // cascades to workout_exercises and scheduled_workouts (ON DELETE CASCADE in
  // schema.sql), so a failed run leaves no partial week behind to block
  // regeneration.
  const insertedWorkoutIds = []
  try {
    for (const { week, day, exercises, date } of planned) {
      const { data: workout, error: wErr } = await client
        .from('workouts')
        .insert({
          user_id: userId,
          week_number: week.week_number,
          day_number: day.day_number,
          focus: day.focus,
        })
        .select()
        .single()

      if (wErr) throw wErr
      insertedWorkoutIds.push(workout.id)

      const weRows = exercises.map(({ ex, exerciseId, modality }) => ({
        workout_id: workout.id,
        exercise_id: exerciseId,
        sets: Number(ex.sets) || (modality === 'cardio' ? 1 : 3),
        reps: String(modality === 'cardio' ? '—' : (ex.reps ?? '8')),
        weight_guidance: String(
          ex.weight_guidance ?? (modality === 'cardio' ? 'steady' : 'moderate'),
        ),
        notes: ex.notes ?? '',
        target_duration_seconds:
          modality === 'cardio' && ex.target_duration_seconds != null
            ? Number(ex.target_duration_seconds)
            : null,
        target_distance:
          modality === 'cardio' && ex.target_distance != null
            ? Number(ex.target_distance)
            : null,
        distance_unit:
          modality === 'cardio'
            ? ex.distance_unit === 'km' || ex.distance_unit === 'mi'
              ? ex.distance_unit
              : distanceUnit
            : null,
        is_interval: Boolean(ex.is_interval),
        target_splits:
          modality === 'cardio' && Array.isArray(ex.target_splits)
            ? ex.target_splits
            : null,
      }))

      const { error: weErr } = await client.from('workout_exercises').insert(weRows)
      if (weErr) throw weErr

      const { error: swErr } = await client.from('scheduled_workouts').insert({
        workout_id: workout.id,
        user_id: userId,
        date,
        status: 'pending',
      })
      if (swErr) throw swErr
    }
  } catch (err) {
    if (insertedWorkoutIds.length > 0) {
      const { error: cleanupErr } = await client
        .from('workouts')
        .delete()
        .eq('user_id', userId)
        .in('id', insertedWorkoutIds)
      if (cleanupErr) {
        console.error('Rollback of partial week failed:', cleanupErr)
      }
    }
    throw err
  }
}

/**
 * Call Edge Function, then insert workouts / scheduled_workouts / workout_exercises.
 * Onboarding: one week only.
 */
export async function generateAndSaveProgram(formAnswers, userId) {
  if (!userId) throw new Error('Not signed in')
  const user = await ensureUser(userId, formAnswers)
  const catalog = await fetchExerciseCatalog()

  const program = await invokeGenerateProgram({
    mode: 'initial',
    goal: formAnswers.goal,
    experience_level: formAnswers.experience_level,
    days_per_week: formAnswers.days_per_week,
    equipment: formAnswers.equipment,
    limitations: formAnswers.limitations || '',
    additional_notes: formAnswers.additional_notes || '',
    age: formAnswers.age,
    bodyweight: formAnswers.bodyweight,
    bodyweight_unit: formAnswers.bodyweight_unit || 'lb',
    session_length: formAnswers.session_length || '',
    distance_unit: getDistanceUnit(),
    weight_unit: getWeightUnit(),
    exercise_catalog: catalog.map((e) => ({
      name: e.name,
      modality: e.modality ?? 'strength',
      typically_interval: Boolean(e.typically_interval),
      equipment_required: e.equipment_required ?? null,
      movement_pattern: e.movement_pattern,
    })),
    exercise_names: catalog.map((e) => e.name),
  })

  // Force week 1 in case the model drifts.
  if (program.weeks?.[0]) {
    program.weeks[0].week_number = 1
    program.duration_weeks = 1
    program.weeks = [program.weeks[0]]
  }

  const daysPerWeek = Number(formAnswers.days_per_week)
  // "today": week 1 starts today, with no day before today (see
  // firstWeekScheduleDates). "next_monday": the following Monday. Without a
  // choice keep the old behaviour (nextMonday(): today on a Monday, else the
  // coming Monday). Week 2 is scheduled from the Monday after week 1's last
  // date by nextWeekStartMonday, so every mode chains correctly.
  const startMode =
    formAnswers.start_mode === START_TODAY ||
    formAnswers.start_mode === START_NEXT_MONDAY
      ? formAnswers.start_mode
      : new Date().getDay() === 1
        ? START_TODAY
        : START_NEXT_MONDAY
  const scheduleDates = firstWeekScheduleDates(daysPerWeek, startMode)

  await insertProgramWeeks({
    userId: user.id,
    program,
    daysPerWeek,
    startMonday: nextMonday(),
    scheduleDates,
  })

  return user.id
}

async function fetchSubstitutionsByPrimaryIds(exerciseIds) {
  const client = assertSupabase()
  const ids = [...new Set((exerciseIds ?? []).filter(Boolean))]
  /** @type {Map<string, Array>} */
  const byPrimary = new Map()
  if (ids.length === 0) return byPrimary

  const { data, error } = await client
    .from('substitutions')
    .select(
      `
      primary_exercise_id,
      substitute_exercise_id,
      reason_tag,
      priority_rank,
      substitute:exercises!substitutions_substitute_exercise_id_fkey (
        id,
        name,
        equipment_required,
        contraindication_tags,
        movement_pattern,
        modality
      )
    `,
    )
    .in('primary_exercise_id', ids)
    .order('priority_rank', { ascending: true })

  if (error) throw error

  for (const row of data ?? []) {
    const key = row.primary_exercise_id
    if (!byPrimary.has(key)) byPrimary.set(key, [])
    byPrimary.get(key).push(row)
  }

  return byPrimary
}

/**
 * Monday the adaptive next week starts on.
 *
 * Normally the Monday after the prior week's last scheduled date. If the
 * athlete generates late (that Monday has already gone by), the week's first
 * days would be scheduled in the past — and if every day is past,
 * canGenerateNextWeek immediately says "ready" again. In that case start
 * today if today IS Monday, otherwise next Monday — a few days are skipped,
 * but no workout is ever scheduled on a date that has already gone by.
 */
export function nextWeekStartMonday(scheduledForPriorWeek, today = new Date()) {
  const afterLast = mondayAfterLastScheduled(scheduledForPriorWeek)
  const todayStart = new Date(today)
  todayStart.setHours(0, 0, 0, 0)
  if (afterLast < todayStart) {
    // nextMonday() returns today when today is Monday.
    return nextMonday(today)
  }
  return afterLast
}

/**
 * Adaptive next week from prior-week logs. Does not mutate existing weeks.
 * Returns { weekNumber, decisions }.
 */
export async function generateAndSaveNextWeek({
  userId,
  scheduledWorkouts,
  workouts,
  workoutDetails,
  logs,
  /** Already-loaded splits from loadProgramData; fetched (scoped) if omitted. */
  logSplits: loadedLogSplits,
}) {
  if (!userId) throw new Error('Not signed in')

  const workoutsById = Object.fromEntries(
    (workouts ?? []).map((w) => [w.id, w]),
  )
  // Prefer workoutDetails.workout when present
  for (const [id, detail] of Object.entries(workoutDetails ?? {})) {
    if (detail?.workout) workoutsById[id] = detail.workout
  }

  const eligibility = canGenerateNextWeek(
    scheduledWorkouts,
    workoutsById,
    workoutDetails,
  )
  if (!eligibility.ready) {
    throw new Error('Finish the current week before generating the next one')
  }

  const byWeek = groupByWeekNumber(
    scheduledWorkouts,
    workoutsById,
    workoutDetails,
  )
  const maxWeek = maxWeekNumber(byWeek)
  const weekEntry = byWeek.get(maxWeek)
  if (!weekEntry) throw new Error(GENERATE_ERROR)

  const logSplits = Array.isArray(loadedLogSplits)
    ? loadedLogSplits
    : await fetchUserLogSplits(userId)

  const built = buildPriorWeekAdaptation({
    weekNumber: maxWeek,
    weekWorkouts: weekEntry.workouts,
    logs,
    logSplits,
  })

  const profile = await fetchUserProfile(userId)
  const painIds = built.decisions
    .filter((d) => d.pain_flagged || d.decision === 'substitute')
    .map((d) => d.exercise_id)
    .filter(Boolean)

  const substitutionsByPrimary = await fetchSubstitutionsByPrimaryIds(painIds)
  const decisions = resolvePainSubstitutions(
    built.decisions,
    substitutionsByPrimary,
    profile.equipment_access,
  )
  const exercise_performance = decisions
  const { prior_week_program } = built

  const catalog = await fetchExerciseCatalog()
  const nextWeek = maxWeek + 1

  const program = await invokeGenerateProgram({
    mode: 'adaptive',
    goal: profile.goal,
    experience_level: profile.experience_level,
    days_per_week: profile.days_per_week,
    equipment: profile.equipment_access,
    limitations: profile.limitations || '',
    additional_notes: profile.additional_notes || '',
    age: profile.age,
    bodyweight: profile.bodyweight,
    bodyweight_unit: profile.bodyweight_unit || 'lb',
    session_length: profile.session_length || '',
    distance_unit: getDistanceUnit(),
    weight_unit: getWeightUnit(),
    exercise_catalog: catalog.map((e) => ({
      name: e.name,
      modality: e.modality ?? 'strength',
      typically_interval: Boolean(e.typically_interval),
      equipment_required: e.equipment_required ?? null,
      movement_pattern: e.movement_pattern,
    })),
    exercise_names: catalog.map((e) => e.name),
    next_week_number: nextWeek,
    prior_week_program,
    exercise_performance,
  })

  if (program.weeks?.[0]) {
    program.weeks[0].week_number = nextWeek
    program.duration_weeks = 1
    program.weeks = [program.weeks[0]]
  }

  const startMonday = nextWeekStartMonday(weekEntry.scheduled)
  const daysPerWeek = Number(profile.days_per_week) || 3

  await insertProgramWeeks({
    userId,
    program,
    daysPerWeek,
    startMonday,
    relativeToStartMonday: true,
  })

  // Background library growth: propose vetted-table additions for skips.
  // Failures must not undo or fail the week that was already inserted.
  try {
    const { proposeSubstitutionsForSkippedDecisions } = await import(
      './proposals.js'
    )
    await proposeSubstitutionsForSkippedDecisions({
      decisions,
      equipmentAccess: profile.equipment_access,
      exerciseNames: catalog.map((e) => e.name),
    })
  } catch (err) {
    console.error('Skip-proposal generation failed (week still saved):', err)
  }

  return { weekNumber: nextWeek, decisions }
}

export {
  GENERATE_ERROR,
  canGenerateNextWeek,
  filterScheduledForCalendar,
  filterScheduledToHorizon,
}
