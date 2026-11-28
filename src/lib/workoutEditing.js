import { normalizeCardioExercise } from './cardioPrescription.js'

/**
 * Pure helpers for athletes editing their own (AI-trainer) workouts:
 * exercise picker ranking/filtering, swap / sets / add / reorder patches and
 * the athlete_edits record that adaptation reads. No Supabase here — the
 * writes live in workoutEditApi.js and the server rules in
 * supabase/2026-11-notes-and-editing.sql section 3.
 */

export const MIN_SETS = 1
export const MAX_SETS = 10

export function modalityOf(exercise) {
  return exercise?.modality === 'cardio' ? 'cardio' : 'strength'
}

/** Coach links → true when the caller is an athlete with an ACTIVE coach. */
export function hasActiveCoach(links) {
  return (links ?? []).some((l) => l.role === 'athlete' && l.status === 'active')
}

/** Display order: sort_order when the column exists, else the fetch order. */
export function sortWorkoutExercises(exercises) {
  return (exercises ?? [])
    .map((we, i) => ({ we, i }))
    .sort((a, b) => {
      const sa = a.we.sort_order
      const sb = b.we.sort_order
      if (sa != null && sb != null && sa !== sb) return sa - sb
      if (sa != null && sb == null) return -1
      if (sa == null && sb != null) return 1
      return a.i - b.i
    })
    .map(({ we }) => we)
}

/**
 * A workout is locked for editing when adaptation has already read its week
 * (a later week exists) or its whole week is completed and in the past.
 * `weekScheduled` = scheduled_workouts rows of the same week_number.
 */
export function isWorkoutWeekLocked({
  weekNumber,
  maxWeekNumber,
  weekScheduled = [],
  todayKey,
}) {
  if (weekNumber != null && maxWeekNumber != null && weekNumber < maxWeekNumber) {
    return true
  }
  if (!weekScheduled.length) return false
  const allCompleted = weekScheduled.every((sw) => sw.status === 'completed')
  const lastDate = weekScheduled.map((sw) => sw.date).sort().at(-1)
  return allCompleted && lastDate != null && todayKey != null && lastDate < todayKey
}

/** Clamp a requested set count to 1..10 and never below what's logged. */
export function clampSets(next, loggedCount = 0) {
  const n = Math.round(Number(next))
  const floor = Math.max(MIN_SETS, Number(loggedCount) || 0)
  if (!Number.isFinite(n)) return floor
  return Math.max(floor, Math.min(MAX_SETS, n))
}

function cleanEdits(edits) {
  const out = {}
  for (const [k, v] of Object.entries(edits ?? {})) {
    if (v != null && v !== false) out[k] = v
  }
  return Object.keys(out).length ? out : null
}

/**
 * Next athlete_edits after one change. Records the ORIGINAL exercise name
 * and set count (first edit wins) and drops them once the athlete edits back
 * to the original. Exercises the athlete added keep just { added: true }.
 *
 * change: { type: 'swap', fromName, toName } | { type: 'sets', from, to }
 */
export function mergeAthleteEdits(prev, change) {
  const edits = { ...(prev ?? {}) }
  if (change.type === 'swap') {
    if (!edits.added) {
      const original = edits.swapped_from ?? change.fromName ?? null
      edits.swapped_from = original && original !== change.toName ? original : null
    }
  } else if (change.type === 'sets') {
    if (!edits.added) {
      const original = edits.original_sets ?? change.from
      edits.original_sets = original != null && original !== change.to ? original : null
    }
  }
  return cleanEdits(edits)
}

/** One short line for the AI ("Athlete swapped Back Squat → Goblet Squat; …"). */
export function athleteEditSummary(we) {
  const edits = we?.athlete_edits
  if (!edits || typeof edits !== 'object') return null
  const name = we?.exercise?.name ?? 'this exercise'
  if (edits.added) return `Athlete added ${name} to this workout themselves.`
  const parts = []
  if (edits.swapped_from) parts.push(`swapped ${edits.swapped_from} → ${name}`)
  if (edits.original_sets != null && Number(edits.original_sets) !== Number(we.sets)) {
    parts.push(`changed sets ${edits.original_sets} → ${we.sets}`)
  }
  return parts.length ? `Athlete ${parts.join('; ')} (their choice).` : null
}

/** Why `candidate` can't replace `current` (null = it can). */
export function swapBlockedReason(current, candidate) {
  if (!candidate) return 'Unknown exercise'
  if (current && modalityOf(current) !== modalityOf(candidate)) {
    return modalityOf(current) === 'cardio'
      ? 'Cardio can only be swapped for cardio'
      : 'Strength can only be swapped for strength'
  }
  return null
}

/**
 * Patch for swapping a prescribed exercise: keeps sets / reps / guidance and
 * cardio targets, clears exercise-specific notes.
 */
export function swapPatch(we, newExercise) {
  return {
    exercise_id: newExercise.id,
    notes: '',
    athlete_edits: mergeAthleteEdits(we.athlete_edits, {
      type: 'swap',
      fromName: we.exercise?.name ?? null,
      toName: newExercise.name,
    }),
  }
}

export function setsPatch(we, nextSets) {
  return {
    sets: nextSets,
    athlete_edits: mergeAthleteEdits(we.athlete_edits, {
      type: 'sets',
      from: Number(we.sets),
      to: nextSets,
    }),
  }
}

/**
 * workout_exercises fields (minus workout_id) for an exercise the athlete
 * adds. Strength copies sets/reps/guidance from the most similar exercise
 * already in the workout (same movement pattern, then muscle group, then any
 * strength exercise), else 3 × 10 moderate. Cardio gets the same structured
 * targets program generation would give it (see cardioPrescription.js).
 */
export function defaultsForAdd(exercise, workoutExercises = [], distanceUnit = 'mi') {
  const modality = modalityOf(exercise)
  const base = {
    exercise_id: exercise.id,
    notes: '',
    athlete_edits: { added: true },
  }
  if (modality === 'cardio') {
    const ex = normalizeCardioExercise(
      {
        name: exercise.name,
        modality: 'cardio',
        sets: 1,
        reps: '—',
        weight_guidance: '',
        notes: '',
        is_interval: Boolean(exercise.typically_interval),
      },
      exercise,
      distanceUnit,
    )
    const splits = Array.isArray(ex.target_splits) ? ex.target_splits : null
    return {
      ...base,
      sets: Number(ex.sets) || 1,
      reps: '—',
      weight_guidance: String(ex.weight_guidance || 'steady'),
      target_duration_seconds:
        ex.target_duration_seconds != null ? Number(ex.target_duration_seconds) : null,
      target_distance: ex.target_distance != null ? Number(ex.target_distance) : null,
      distance_unit:
        ex.distance_unit === 'km' || ex.distance_unit === 'mi' ? ex.distance_unit : distanceUnit,
      is_interval: Boolean(ex.is_interval),
      target_splits: splits,
    }
  }

  const strength = workoutExercises.filter(
    (we) => modalityOf(we.exercise) === 'strength',
  )
  const similar =
    strength.find(
      (we) =>
        exercise.movement_pattern &&
        we.exercise?.movement_pattern === exercise.movement_pattern,
    ) ??
    strength.find(
      (we) => exercise.muscle_group && we.exercise?.muscle_group === exercise.muscle_group,
    ) ??
    strength[0] ??
    null
  return {
    ...base,
    sets: similar ? clampSets(similar.sets) : 3,
    reps: similar?.reps ? String(similar.reps) : '10',
    weight_guidance: similar?.weight_guidance ? String(similar.weight_guidance) : 'moderate',
    target_duration_seconds: null,
    target_distance: null,
    distance_unit: null,
    is_interval: false,
    target_splits: null,
  }
}

/**
 * sort_order updates for moving exercises[from] to index `to` (list already
 * in display order). Positions become 1..n; only rows that change are
 * returned: [{ id, sort_order }].
 */
export function reorderPatches(exercises, from, to) {
  const list = [...(exercises ?? [])]
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) {
    return []
  }
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
  const patches = []
  list.forEach((we, i) => {
    if (we.sort_order !== i + 1) patches.push({ id: we.id, sort_order: i + 1 })
  })
  return patches
}

function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function labelize(s) {
  const t = String(s ?? '').replaceAll('_', ' ').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Other'
}

/** Every query word must appear in the name, muscle group or pattern. */
export function matchesQuery(exercise, query) {
  const words = norm(query).split(' ').filter(Boolean)
  if (!words.length) return true
  const hay = norm(
    `${exercise.name} ${exercise.muscle_group ?? ''} ${exercise.movement_pattern ?? ''} ${exercise.equipment_required ?? ''}`,
  )
  return words.every((w) => hay.includes(w))
}

/** Distinct muscle groups (sorted) for filter chips. */
export function muscleGroupsOf(library) {
  return [...new Set((library ?? []).map((e) => e.muscle_group || 'other'))].sort((a, b) =>
    a.localeCompare(b),
  )
}

/**
 * Picker contents.
 *   library        exercises visible to the user
 *   current        exercise being swapped (null when adding)
 *   substitutions  vetted rows for current: { substitute_exercise_id, priority_rank }
 *   excludeIds     exercise ids already in the workout (and the current one)
 *   query, muscleGroup ('' = all), equipmentAllowed (Set | null)
 * Returns { suggested: [item], groups: [{ key, label, items: [item] }] },
 * item = { exercise, disabledReason, vetted }.
 */
export function buildPickerSections({
  library = [],
  current = null,
  substitutions = [],
  excludeIds = [],
  query = '',
  muscleGroup = '',
  equipmentAllowed = null,
}) {
  const exclude = new Set(excludeIds)
  if (current?.id) exclude.add(current.id)
  const byId = new Map(library.map((e) => [e.id, e]))

  const visible = library.filter((e) => {
    if (exclude.has(e.id)) return false
    if (
      equipmentAllowed &&
      e.equipment_required &&
      !equipmentAllowed.has(String(e.equipment_required).toLowerCase())
    ) {
      return false
    }
    if (muscleGroup && (e.muscle_group || 'other') !== muscleGroup) return false
    return matchesQuery(e, query)
  })
  const visibleIds = new Set(visible.map((e) => e.id))
  const item = (exercise, vetted = false) => ({
    exercise,
    vetted,
    disabledReason: current ? swapBlockedReason(current, exercise) : null,
  })

  const suggested = []
  const seen = new Set()
  if (current) {
    const vettedRows = [...substitutions].sort(
      (a, b) => (a.priority_rank ?? 99) - (b.priority_rank ?? 99),
    )
    for (const row of vettedRows) {
      const ex = byId.get(row.substitute_exercise_id)
      if (!ex || !visibleIds.has(ex.id) || seen.has(ex.id)) continue
      if (swapBlockedReason(current, ex)) continue
      seen.add(ex.id)
      suggested.push(item(ex, true))
    }
    if (current.movement_pattern) {
      const samePattern = visible
        .filter(
          (e) =>
            !seen.has(e.id) &&
            e.movement_pattern === current.movement_pattern &&
            !swapBlockedReason(current, e),
        )
        .sort((a, b) => a.name.localeCompare(b.name))
      for (const ex of samePattern) {
        seen.add(ex.id)
        suggested.push(item(ex))
      }
    }
  }

  const groupsMap = new Map()
  for (const ex of visible) {
    if (seen.has(ex.id)) continue
    const key = ex.muscle_group || 'other'
    if (!groupsMap.has(key)) groupsMap.set(key, [])
    groupsMap.get(key).push(ex)
  }
  const currentModality = current ? modalityOf(current) : null
  const groups = [...groupsMap.entries()]
    .map(([key, list]) => ({
      key,
      label: labelize(key),
      items: list.sort((a, b) => a.name.localeCompare(b.name)).map((e) => item(e)),
      // Groups the current exercise can't swap into sink to the bottom.
      blocked: currentModality != null && list.every((e) => modalityOf(e) !== currentModality),
    }))
    .sort((a, b) => Number(a.blocked) - Number(b.blocked) || a.label.localeCompare(b.label))
    .map(({ blocked: _blocked, ...g }) => g)

  return { suggested, groups }
}
