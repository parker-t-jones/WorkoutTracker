/**
 * @typedef {'substitute' | 'skip' | 'progress' | 'hold' | 'reduce_volume'} AdaptDecision
 */

/**
 * Decide progression for one exercise from prior-week metrics.
 * Pain flag is checked first (hard safety override) — concrete swap vs skip
 * is resolved later via the vetted substitutions table.
 */
export function decideExerciseAdaptation({
  completionRate,
  avgRpe,
  painFlagged,
}) {
  if (painFlagged) {
    return {
      decision: 'substitute',
      reason: 'Flagged as felt off last week — resolving vetted substitute.',
    }
  }

  const rate = Number(completionRate) || 0
  const rpe = avgRpe == null ? null : Number(avgRpe)

  if (rate >= 0.9 && (rpe == null || rpe <= 7.5)) {
    return {
      decision: 'progress',
      reason:
        rpe == null
          ? `High completion (${Math.round(rate * 100)}%) — bump load slightly.`
          : `High completion (${Math.round(rate * 100)}%) with moderate RPE ${formatRpe(rpe)} — bump load slightly.`,
    }
  }

  if (rate < 0.85 && rpe != null && rpe >= 8) {
    return {
      decision: 'reduce_volume',
      reason: `Missed volume (${Math.round(rate * 100)}% sets) and high RPE ${formatRpe(rpe)} — fewer sets before cutting weight.`,
    }
  }

  if (rate < 0.85 || (rpe != null && rpe >= 8)) {
    const parts = []
    if (rate < 0.85) parts.push(`completion ${Math.round(rate * 100)}%`)
    if (rpe != null && rpe >= 8) parts.push(`RPE ${formatRpe(rpe)}`)
    return {
      decision: 'hold',
      reason: `Hold steady (${parts.join(', ')}).`,
    }
  }

  return {
    decision: 'hold',
    reason: 'Hold steady — no strong signal to change load.',
  }
}

function formatRpe(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** Which equipment_required values a user's onboarding equipment_access allows. */
export function equipmentAllowedForAccess(equipmentAccess) {
  const key = String(equipmentAccess || '')
    .toLowerCase()
    .trim()
  const map = {
    'commercial gym': [
      'barbell',
      'dumbbell',
      'bodyweight',
      'machine',
      'cable',
      'kettlebell',
      'bands',
    ],
    'home gym': ['barbell', 'dumbbell', 'bodyweight', 'kettlebell', 'bands'],
    'dumbbells only': ['dumbbell', 'bodyweight', 'bands', 'kettlebell'],
    'bodyweight only': ['bodyweight'],
  }
  return new Set(map[key] ?? ['bodyweight', 'dumbbell', 'barbell'])
}

export function tagsOverlap(a = [], b = []) {
  const setB = new Set(b ?? [])
  return (a ?? []).some((t) => setB.has(t))
}

/**
 * True when the substitute still carries every contraindication on the
 * primary (no risk relief). Used instead of raw overlap so e.g. Back Squat
 * (knee + lower back) → Goblet Squat (knee only) remains valid, while
 * Pull-Up → Lat Pulldown (both only high_shoulder_strain) is rejected.
 */
export function substituteRetainsAllPrimaryTags(primaryTags = [], subTags = []) {
  const primary = primaryTags ?? []
  if (primary.length === 0) return false
  const setSub = new Set(subTags ?? [])
  return primary.every((t) => setSub.has(t))
}

export function reasonTagDisplay(reasonTag, primaryTags = []) {
  if (reasonTag === 'lower_joint_strain') {
    if (primaryTags.includes('high_knee_strain')) return 'reduced knee strain'
    if (primaryTags.includes('high_lower_back_load')) {
      return 'reduced lower-back load'
    }
    if (primaryTags.includes('high_shoulder_strain')) {
      return 'reduced shoulder strain'
    }
    if (primaryTags.includes('high_wrist_strain')) return 'reduced wrist strain'
    return 'reduced joint strain'
  }
  if (reasonTag === 'equipment_alt') return 'equipment alternative'
  if (reasonTag === 'similar_pattern') return 'similar movement pattern'
  if (reasonTag === 'controlled_load') return 'more controllable load'
  return reasonTag?.replaceAll('_', ' ') ?? 'vetted substitute'
}

/**
 * Pick the best vetted substitute for a pain-flagged primary exercise.
 * Candidates must not share contraindication tags with the primary, and must
 * fit the user's equipment_access. Returns null when nothing is safe.
 *
 * @param {object} primary - { id, name, contraindication_tags, movement_pattern }
 * @param {Array} candidates - substitutions joined with substitute exercise, sorted by priority_rank
 * @param {string} equipmentAccess
 */
export function pickVettedSubstitute(primary, candidates, equipmentAccess) {
  const primaryTags = primary?.contraindication_tags ?? []
  const allowed = equipmentAllowedForAccess(equipmentAccess)

  const ranked = [...(candidates ?? [])].sort(
    (a, b) => (a.priority_rank ?? 99) - (b.priority_rank ?? 99),
  )

  for (const row of ranked) {
    const sub = row.substitute ?? row
    const subTags = sub.contraindication_tags ?? []
    // Drop candidates that still carry every primary risk tag (no relief).
    if (substituteRetainsAllPrimaryTags(primaryTags, subTags)) continue

    const required = sub.equipment_required
    if (required && !allowed.has(required)) continue

    return {
      id: sub.id ?? row.substitute_exercise_id,
      name: sub.name,
      equipment_required: sub.equipment_required,
      contraindication_tags: subTags,
      reason_tag: row.reason_tag,
      priority_rank: row.priority_rank,
    }
  }

  return null
}

/**
 * Enrich pain-flagged decisions with a concrete substitute_to or flip to skip.
 * @param {Array} decisions
 * @param {Map<string, Array>} substitutionsByPrimaryId - primary_exercise_id → candidate rows
 * @param {string} equipmentAccess
 */
export function resolvePainSubstitutions(
  decisions,
  substitutionsByPrimaryId,
  equipmentAccess,
) {
  return (decisions ?? []).map((row) => {
    if (!row.pain_flagged && row.decision !== 'substitute') return row

    const primaryTags = row.contraindication_tags ?? []
    const candidates =
      (row.exercise_id && substitutionsByPrimaryId?.get(row.exercise_id)) ||
      []

    const picked = pickVettedSubstitute(
      {
        id: row.exercise_id,
        name: row.name,
        contraindication_tags: primaryTags,
        movement_pattern: row.movement_pattern,
      },
      candidates,
      equipmentAccess,
    )

    if (picked) {
      const why = reasonTagDisplay(picked.reason_tag, primaryTags)
      return {
        ...row,
        decision: 'substitute',
        substitute_to: picked.name,
        substitute_reason_tag: picked.reason_tag,
        reason: `Swapped to ${picked.name} — ${why}`,
      }
    }

    const pattern = row.movement_pattern?.replaceAll('_', ' ') || 'This movement'
    const patternLabel =
      pattern.charAt(0).toUpperCase() + pattern.slice(1)
    return {
      ...row,
      decision: 'skip',
      substitute_to: null,
      substitute_reason_tag: null,
      reason: `${patternLabel} skipped this week — no safe substitute available, will reassess`,
    }
  })
}

function toDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Monday 00:00 local for the calendar week containing `from`. */
export function startOfWeekMonday(from = new Date()) {
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0 Sun
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

export function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

/**
 * Calendar visibility window: from the start of the current calendar week
 * forward with no fixed end date. Newly generated weeks are scheduled from
 * the end of the prior week (often beyond today+7), so a capped lookahead
 * would hide valid data.
 */
export function filterScheduledForCalendar(scheduledWorkouts, from = new Date()) {
  const startKey = toDateKey(startOfWeekMonday(from))
  return (scheduledWorkouts ?? [])
    .filter((sw) => sw.date >= startKey)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** @deprecated use filterScheduledForCalendar — kept as alias */
export function filterScheduledToHorizon(scheduledWorkouts, from = new Date()) {
  return filterScheduledForCalendar(scheduledWorkouts, from)
}

/** @deprecated horizon end is no longer capped; start is current-week Monday */
export function calendarHorizonRange(from = new Date()) {
  const start = startOfWeekMonday(from)
  return { startKey: toDateKey(start), endKey: null }
}

/**
 * Build week index from loaded program data.
 * @returns {Map<number, { weekNumber, workouts, scheduled, exercises }>}
 */
export function groupByWeekNumber(scheduledWorkouts, workoutsById, workoutDetails) {
  const byWeek = new Map()

  for (const sw of scheduledWorkouts ?? []) {
    const workout = workoutsById[sw.workout_id] ?? workoutDetails[sw.workout_id]?.workout
    if (!workout) continue
    const wn = workout.week_number
    if (!byWeek.has(wn)) {
      byWeek.set(wn, {
        weekNumber: wn,
        scheduled: [],
        workoutIds: new Set(),
      })
    }
    const entry = byWeek.get(wn)
    entry.scheduled.push(sw)
    entry.workoutIds.add(sw.workout_id)
  }

  for (const entry of byWeek.values()) {
    entry.workouts = [...entry.workoutIds].map((id) => ({
      workout: workoutsById[id] ?? workoutDetails[id]?.workout,
      exercises: workoutDetails[id]?.exercises ?? [],
    }))
  }

  return byWeek
}

export function maxWeekNumber(byWeek) {
  if (!byWeek?.size) return 0
  return Math.max(...byWeek.keys())
}

/**
 * Ready for next week when max week has no successor and is fully completed
 * or its last scheduled date has passed.
 */
export function canGenerateNextWeek(
  scheduledWorkouts,
  workoutsById,
  workoutDetails,
  today = new Date(),
) {
  const byWeek = groupByWeekNumber(scheduledWorkouts, workoutsById, workoutDetails)
  const maxWeek = maxWeekNumber(byWeek)
  if (!maxWeek) return { ready: false, maxWeek: 0, nextWeek: 1 }

  if (byWeek.has(maxWeek + 1)) {
    return { ready: false, maxWeek, nextWeek: maxWeek + 1 }
  }

  const week = byWeek.get(maxWeek)
  const allCompleted = week.scheduled.every((sw) => sw.status === 'completed')
  const lastDate = week.scheduled
    .map((sw) => sw.date)
    .sort()
    .at(-1)
  const todayKey = toDateKey(today)
  const datesPassed = lastDate != null && todayKey > lastDate

  return {
    ready: allCompleted || datesPassed,
    maxWeek,
    nextWeek: maxWeek + 1,
    allCompleted,
    datesPassed,
  }
}

/**
 * Aggregate prior-week logs into per-exercise performance + decisions.
 */
export function buildPriorWeekAdaptation({
  weekNumber,
  weekWorkouts,
  logs,
}) {
  /** @type {Map<string, object>} */
  const byExercise = new Map()

  const priorDays = []

  for (const { workout, exercises } of weekWorkouts) {
    if (!workout) continue
    const dayExercises = []

    for (const we of exercises ?? []) {
      const name = we.exercise?.name ?? 'Exercise'
      const exerciseId = we.exercise_id
      const key = exerciseId || name
      const prescribedSets = Number(we.sets) || 0
      const weLogs = (logs ?? []).filter((l) => l.workout_exercise_id === we.id)
      const loggedSets = weLogs.length
      const rpes = weLogs.map((l) => l.rpe).filter((r) => r != null)
      const weights = weLogs
        .slice()
        .sort((a, b) => a.set_number - b.set_number)
        .map((l) => (l.actual_weight != null ? Number(l.actual_weight) : null))
        .filter((w) => w != null)
      const painLogs = weLogs.filter((l) => l.pain_flag)
      const painNote =
        painLogs.find((l) => l.pain_note)?.pain_note ?? null

      if (!byExercise.has(key)) {
        byExercise.set(key, {
          exercise_id: exerciseId,
          name,
          movement_pattern: we.exercise?.movement_pattern ?? null,
          contraindication_tags: we.exercise?.contraindication_tags ?? [],
          equipment_required: we.exercise?.equipment_required ?? null,
          sets_prescribed: 0,
          sets_logged: 0,
          rpeSum: 0,
          rpeCount: 0,
          weights: [],
          pain_flagged: false,
          pain_note: null,
          sample_reps: we.reps,
          sample_weight_guidance: we.weight_guidance,
          sample_sets: prescribedSets,
        })
      }

      const agg = byExercise.get(key)
      agg.sets_prescribed += prescribedSets
      agg.sets_logged += loggedSets
      for (const r of rpes) {
        agg.rpeSum += Number(r)
        agg.rpeCount += 1
      }
      agg.weights.push(...weights)
      if (painLogs.length) {
        agg.pain_flagged = true
        if (painNote) agg.pain_note = painNote
      }

      dayExercises.push({
        name,
        sets: prescribedSets,
        reps: String(we.reps),
        weight_guidance: we.weight_guidance,
        notes: we.notes ?? '',
      })
    }

    priorDays.push({
      day_number: workout.day_number,
      focus: workout.focus,
      exercises: dayExercises,
    })
  }

  const decisions = []
  const exercise_performance = []

  for (const agg of byExercise.values()) {
    const completion_rate =
      agg.sets_prescribed > 0 ? agg.sets_logged / agg.sets_prescribed : 0
    const avg_rpe =
      agg.rpeCount > 0 ? agg.rpeSum / agg.rpeCount : null
    const firstLoad = agg.weights[0] ?? null
    const lastLoad = agg.weights.length
      ? agg.weights[agg.weights.length - 1]
      : null
    const load_trend =
      firstLoad != null && lastLoad != null ? lastLoad - firstLoad : null

    const { decision, reason } = decideExerciseAdaptation({
      completionRate: completion_rate,
      avgRpe: avg_rpe,
      painFlagged: agg.pain_flagged,
    })

    const row = {
      exercise_id: agg.exercise_id,
      name: agg.name,
      movement_pattern: agg.movement_pattern,
      contraindication_tags: agg.contraindication_tags ?? [],
      equipment_required: agg.equipment_required,
      sets_prescribed: agg.sets_prescribed,
      sets_logged: agg.sets_logged,
      completion_rate: Math.round(completion_rate * 1000) / 1000,
      avg_rpe: avg_rpe != null ? Math.round(avg_rpe * 10) / 10 : null,
      load_trend,
      pain_flagged: agg.pain_flagged,
      pain_note: agg.pain_note,
      decision,
      reason,
      prior_sets: agg.sample_sets,
      prior_reps: agg.sample_reps,
      prior_weight_guidance: agg.sample_weight_guidance,
    }

    decisions.push(row)
    exercise_performance.push(row)
  }

  decisions.sort((a, b) => {
    const order = {
      substitute: 0,
      skip: 0,
      reduce_volume: 1,
      progress: 2,
      hold: 3,
    }
    return (order[a.decision] ?? 9) - (order[b.decision] ?? 9)
  })

  const prior_week_program = {
    week_number: weekNumber,
    days: priorDays.sort((a, b) => a.day_number - b.day_number),
  }

  return { decisions, exercise_performance, prior_week_program }
}

/** Monday after the last scheduled date of a week (or next Monday if empty). */
export function mondayAfterLastScheduled(scheduledForWeek) {
  const last = (scheduledForWeek ?? [])
    .map((sw) => sw.date)
    .sort()
    .at(-1)
  if (!last) {
    const d = startOfWeekMonday(new Date())
    return addDays(d, 7)
  }
  const [y, m, day] = last.split('-').map(Number)
  const lastDate = new Date(y, m - 1, day)
  lastDate.setHours(0, 0, 0, 0)
  // Next calendar Monday strictly after lastDate's week
  const mondayOfLast = startOfWeekMonday(lastDate)
  return addDays(mondayOfLast, 7)
}
