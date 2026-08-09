import { supabase } from './supabase'
import { normalizeExerciseName, scheduleDateFor, nextMonday } from './user'
import { getDistanceUnit } from './units'
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

/** Load calendar data for the signed-in auth user. */
export async function loadProgramData(userId) {
  const client = assertSupabase()
  if (!userId) {
    throw new Error('Not signed in')
  }

  const { data: scheduledWorkouts, error: swErr } = await client
    .from('scheduled_workouts')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true })

  if (swErr) throw swErr

  if (!scheduledWorkouts?.length) {
    return {
      userId,
      scheduledWorkouts: [],
      workouts: [],
      workoutDetails: {},
      logs: [],
      logSplits: [],
    }
  }

  const workoutIds = [...new Set(scheduledWorkouts.map((s) => s.workout_id))]

  const { data: workouts, error: wErr } = await client
    .from('workouts')
    .select('*')
    .in('id', workoutIds)

  if (wErr) throw wErr

  const { data: workoutExercises, error: weErr } = await client
    .from('workout_exercises')
    .select('*, exercise:exercises(*)')
    .in('workout_id', workoutIds)

  if (weErr) throw weErr

  const weIds = (workoutExercises ?? []).map((we) => we.id)
  let logs = []
  let logSplits = []
  if (weIds.length > 0) {
    const { data: logRows, error: logErr } = await client
      .from('logs')
      .select('*')
      .eq('user_id', userId)
      .in('workout_exercise_id', weIds)
      .order('set_number', { ascending: true })

    if (logErr) throw logErr
    logs = logRows ?? []

    const logIds = logs.map((l) => l.id)
    if (logIds.length > 0) {
      const { data: splitRows, error: splitErr } = await client
        .from('log_splits')
        .select('*')
        .in('log_id', logIds)
        .order('split_number', { ascending: true })
      if (splitErr) throw splitErr
      logSplits = splitRows ?? []
    }
  }

  const workoutDetails = {}
  for (const w of workouts ?? []) {
    workoutDetails[w.id] = {
      workout: w,
      exercises: (workoutExercises ?? []).filter((we) => we.workout_id === w.id),
    }
  }

  return {
    userId,
    scheduledWorkouts: scheduledWorkouts ?? [],
    workouts: workouts ?? [],
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

async function resolveExerciseId(name, catalog, catalogByNorm) {
  const client = assertSupabase()
  const norm = normalizeExerciseName(name)
  const existing = catalogByNorm.get(norm)
  if (existing) return existing.id

  const { data, error } = await client
    .from('exercises')
    .insert({
      name: name.trim(),
      movement_pattern: 'other',
      muscle_group: 'general',
    })
    .select()
    .single()

  if (error) {
    // Race / unique conflict — re-fetch
    const { data: again } = await client
      .from('exercises')
      .select('*')
      .ilike('name', name.trim())
      .maybeSingle()
    if (again) {
      catalog.push(again)
      catalogByNorm.set(normalizeExerciseName(again.name), again)
      return again.id
    }
    throw error
  }

  catalog.push(data)
  catalogByNorm.set(normalizeExerciseName(data.name), data)
  return data.id
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
}) {
  const client = assertSupabase()
  const catalog = await fetchExerciseCatalog()
  const catalogByNorm = new Map(
    catalog.map((e) => [normalizeExerciseName(e.name), e]),
  )

  for (const week of program.weeks) {
    for (let dayIndex = 0; dayIndex < week.days.length; dayIndex++) {
      const day = week.days[dayIndex]

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

      const distanceUnit = getDistanceUnit()
      ensureCardioWarmup(day, distanceUnit)

      const weRows = []
      for (const raw of day.exercises) {
        const catalogEx = catalogByNorm.get(
          normalizeExerciseName(raw.name),
        )
        const ex = normalizeCardioExercise(raw, catalogEx, distanceUnit)
        const exerciseId = await resolveExerciseId(
          ex.name,
          catalog,
          catalogByNorm,
        )
        const modality = ex.modality === 'cardio' ? 'cardio' : 'strength'
        const isInterval = Boolean(ex.is_interval)
        weRows.push({
          workout_id: workout.id,
          exercise_id: exerciseId,
          sets: Number(ex.sets) || (modality === 'cardio' ? 1 : 3),
          reps: String(
            modality === 'cardio' ? '—' : (ex.reps ?? '8'),
          ),
          weight_guidance: String(
            ex.weight_guidance ??
              (modality === 'cardio' ? 'steady' : 'moderate'),
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
          is_interval: isInterval,
          target_splits:
            modality === 'cardio' && Array.isArray(ex.target_splits)
              ? ex.target_splits
              : null,
        })
      }

      const { error: weErr } = await client.from('workout_exercises').insert(weRows)
      if (weErr) throw weErr

      const scheduleWeekNumber = relativeToStartMonday ? 1 : week.week_number
      const date = scheduleDateFor(
        scheduleWeekNumber,
        dayIndex,
        daysPerWeek,
        startMonday,
      )

      const { error: swErr } = await client.from('scheduled_workouts').insert({
        workout_id: workout.id,
        user_id: userId,
        date,
        status: 'pending',
      })
      if (swErr) throw swErr
    }
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

  const startMonday = nextMonday()
  const daysPerWeek = Number(formAnswers.days_per_week)

  await insertProgramWeeks({
    userId: user.id,
    program,
    daysPerWeek,
    startMonday,
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
 * Adaptive next week from prior-week logs. Does not mutate existing weeks.
 * Returns { weekNumber, decisions }.
 */
export async function generateAndSaveNextWeek({
  userId,
  scheduledWorkouts,
  workouts,
  workoutDetails,
  logs,
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

  const logIds = (logs ?? []).map((l) => l.id)
  let logSplits = []
  if (logIds.length > 0) {
    const client = assertSupabase()
    const { data: splitRows, error: splitErr } = await client
      .from('log_splits')
      .select('*')
      .in('log_id', logIds)
      .order('split_number', { ascending: true })
    if (splitErr) throw splitErr
    logSplits = splitRows ?? []
  }

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

  const startMonday = mondayAfterLastScheduled(weekEntry.scheduled)
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
