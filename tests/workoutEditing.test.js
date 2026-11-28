// Run: npm test   (node --test tests/)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  athleteEditSummary,
  buildPickerSections,
  clampSets,
  defaultsForAdd,
  hasActiveCoach,
  isWorkoutWeekLocked,
  matchesQuery,
  mergeAthleteEdits,
  reorderPatches,
  setsPatch,
  sortWorkoutExercises,
  swapBlockedReason,
  swapPatch,
} from '../src/lib/workoutEditing.js'

const ex = (id, name, movement_pattern, muscle_group, extra = {}) => ({
  id,
  name,
  movement_pattern,
  muscle_group,
  modality: 'strength',
  equipment_required: null,
  ...extra,
})

const backSquat = ex('bs', 'Back Squat', 'squat', 'quads', { equipment_required: 'barbell' })
const goblet = ex('gs', 'Goblet Squat', 'squat', 'quads', { equipment_required: 'dumbbell' })
const legPress = ex('lp', 'Leg Press', 'squat', 'quads', { equipment_required: 'machine' })
const rdl = ex('rdl', 'Romanian Deadlift', 'hinge', 'hamstrings', { equipment_required: 'barbell' })
const pushUp = ex('pu', 'Push-Up', 'horizontal_push', 'chest', { equipment_required: 'bodyweight' })
const run = ex('run', 'Easy Run', 'cardio_run', 'cardio', { modality: 'cardio' })
const bike = ex('bike', 'Stationary Bike', 'cardio_cycle', 'cardio', { modality: 'cardio' })
const library = [backSquat, goblet, legPress, rdl, pushUp, run, bike]

test('hasActiveCoach: only an active link where the caller is the athlete', () => {
  assert.equal(hasActiveCoach([]), false)
  assert.equal(hasActiveCoach([{ role: 'athlete', status: 'pending' }]), false)
  assert.equal(hasActiveCoach([{ role: 'athlete', status: 'revoked' }]), false)
  assert.equal(hasActiveCoach([{ role: 'coach', status: 'active' }]), false)
  assert.equal(hasActiveCoach([{ role: 'athlete', status: 'active' }]), true)
})

test('clampSets: 1..10 and never below logged sets', () => {
  assert.equal(clampSets(0), 1)
  assert.equal(clampSets(11), 10)
  assert.equal(clampSets(4), 4)
  assert.equal(clampSets(1, 3), 3)
  assert.equal(clampSets('x', 2), 2)
})

test('sortWorkoutExercises: sort_order first, fetch order as tiebreak', () => {
  const rows = [
    { id: 'a', sort_order: 3 },
    { id: 'b', sort_order: 1 },
    { id: 'c', sort_order: 2 },
  ]
  assert.deepEqual(sortWorkoutExercises(rows).map((r) => r.id), ['b', 'c', 'a'])
  // Before the migration (no column) order is unchanged.
  const legacy = [{ id: 'x' }, { id: 'y' }, { id: 'z' }]
  assert.deepEqual(sortWorkoutExercises(legacy).map((r) => r.id), ['x', 'y', 'z'])
  // Duplicates keep fetch order.
  const dup = [{ id: 'p', sort_order: 1 }, { id: 'q', sort_order: 1 }]
  assert.deepEqual(sortWorkoutExercises(dup).map((r) => r.id), ['p', 'q'])
})

test('reorderPatches: moves and renumbers only changed rows', () => {
  const rows = [
    { id: 'a', sort_order: 1 },
    { id: 'b', sort_order: 2 },
    { id: 'c', sort_order: 3 },
  ]
  assert.deepEqual(reorderPatches(rows, 2, 1), [
    { id: 'c', sort_order: 2 },
    { id: 'b', sort_order: 3 },
  ])
  assert.deepEqual(reorderPatches(rows, 0, -1), [])
  assert.deepEqual(reorderPatches(rows, 1, 1), [])
  // Gappy / duplicate positions get normalised.
  const gappy = [
    { id: 'a', sort_order: 5 },
    { id: 'b', sort_order: 5 },
  ]
  assert.deepEqual(reorderPatches(gappy, 1, 0), [
    { id: 'b', sort_order: 1 },
    { id: 'a', sort_order: 2 },
  ])
})

test('isWorkoutWeekLocked', () => {
  const done = [
    { date: '2026-11-16', status: 'completed' },
    { date: '2026-11-18', status: 'completed' },
  ]
  // A later week exists → locked.
  assert.equal(
    isWorkoutWeekLocked({ weekNumber: 1, maxWeekNumber: 2, weekScheduled: [], todayKey: '2026-11-27' }),
    true,
  )
  // Past + fully completed → locked.
  assert.equal(
    isWorkoutWeekLocked({ weekNumber: 2, maxWeekNumber: 2, weekScheduled: done, todayKey: '2026-11-27' }),
    true,
  )
  // Completed but its last day is today → still editable.
  assert.equal(
    isWorkoutWeekLocked({ weekNumber: 2, maxWeekNumber: 2, weekScheduled: done, todayKey: '2026-11-18' }),
    false,
  )
  // Past but not all completed → editable.
  assert.equal(
    isWorkoutWeekLocked({
      weekNumber: 2,
      maxWeekNumber: 2,
      weekScheduled: [done[0], { date: '2026-11-18', status: 'pending' }],
      todayKey: '2026-11-27',
    }),
    false,
  )
})

test('mergeAthleteEdits / swapPatch / setsPatch keep the original', () => {
  const we = { sets: 4, exercise: backSquat, athlete_edits: null }
  const p1 = swapPatch(we, goblet)
  assert.deepEqual(p1, {
    exercise_id: 'gs',
    notes: '',
    athlete_edits: { swapped_from: 'Back Squat' },
  })
  // Second swap keeps the first original.
  const we2 = { ...we, exercise: goblet, athlete_edits: p1.athlete_edits }
  assert.deepEqual(swapPatch(we2, legPress).athlete_edits, { swapped_from: 'Back Squat' })
  // Swapping back clears it.
  assert.equal(swapPatch(we2, backSquat).athlete_edits, null)

  assert.deepEqual(setsPatch(we, 3), { sets: 3, athlete_edits: { original_sets: 4 } })
  const we3 = { ...we, sets: 3, athlete_edits: { original_sets: 4 } }
  assert.deepEqual(setsPatch(we3, 2).athlete_edits, { original_sets: 4 })
  assert.equal(setsPatch(we3, 4).athlete_edits, null)

  // Added exercises stay "added" whatever else changes.
  assert.deepEqual(
    mergeAthleteEdits({ added: true }, { type: 'swap', fromName: 'A', toName: 'B' }),
    { added: true },
  )
  assert.deepEqual(mergeAthleteEdits({ added: true }, { type: 'sets', from: 3, to: 5 }), {
    added: true,
  })
})

test('athleteEditSummary', () => {
  assert.equal(athleteEditSummary({ exercise: goblet, sets: 3, athlete_edits: null }), null)
  assert.equal(
    athleteEditSummary({
      exercise: goblet,
      sets: 3,
      athlete_edits: { swapped_from: 'Back Squat', original_sets: 4 },
    }),
    'Athlete swapped Back Squat → Goblet Squat; changed sets 4 → 3 (their choice).',
  )
  assert.equal(
    athleteEditSummary({ exercise: pushUp, sets: 3, athlete_edits: { added: true } }),
    'Athlete added Push-Up to this workout themselves.',
  )
})

test('swapBlockedReason: no strength ↔ cardio swaps', () => {
  assert.equal(swapBlockedReason(backSquat, goblet), null)
  assert.equal(swapBlockedReason(run, bike), null)
  assert.match(swapBlockedReason(backSquat, run), /strength/)
  assert.match(swapBlockedReason(run, backSquat), /cardio/i)
})

test('matchesQuery: words across name / muscle / pattern, accents and case', () => {
  assert.equal(matchesQuery(goblet, 'gob'), true)
  assert.equal(matchesQuery(goblet, 'squat quads'), true)
  assert.equal(matchesQuery(rdl, 'hinge'), true)
  assert.equal(matchesQuery(pushUp, 'push up'), true)
  assert.equal(matchesQuery(pushUp, 'horizontal push'), true)
  assert.equal(matchesQuery(goblet, 'bench'), false)
  assert.equal(matchesQuery(ex('x', 'Développé Couché', 'horizontal_push', 'chest'), 'developpe'), true)
})

test('buildPickerSections: vetted first, then same pattern, then groups', () => {
  const { suggested, groups } = buildPickerSections({
    library,
    current: backSquat,
    substitutions: [
      { substitute_exercise_id: 'lp', priority_rank: 2 },
      { substitute_exercise_id: 'gs', priority_rank: 1 },
      { substitute_exercise_id: 'run', priority_rank: 3 }, // wrong modality: dropped
    ],
    excludeIds: ['bs', 'pu'],
  })
  assert.deepEqual(
    suggested.map((s) => [s.exercise.id, s.vetted]),
    [
      ['gs', true],
      ['lp', true],
    ],
  )
  const ids = groups.flatMap((g) => g.items.map((i) => i.exercise.id))
  assert.ok(!ids.includes('bs') && !ids.includes('pu') && !ids.includes('gs'))
  // Cardio group sinks to the bottom and is disabled for a strength swap.
  assert.equal(groups.at(-1).key, 'cardio')
  assert.ok(groups.at(-1).items.every((i) => i.disabledReason))
  assert.equal(groups[0].items[0].disabledReason, null)
})

test('buildPickerSections: same-pattern suggestions without vetted rows', () => {
  const { suggested } = buildPickerSections({ library, current: goblet })
  assert.deepEqual(
    suggested.map((s) => s.exercise.id),
    ['bs', 'lp'],
  )
})

test('buildPickerSections: filters (query, muscle group, equipment)', () => {
  const q = buildPickerSections({ library, query: 'squat' })
  assert.deepEqual(q.suggested, [])
  assert.deepEqual(
    q.groups.flatMap((g) => g.items.map((i) => i.exercise.id)),
    ['bs', 'gs', 'lp'],
  )
  const mg = buildPickerSections({ library, muscleGroup: 'cardio' })
  assert.deepEqual(mg.groups.map((g) => g.key), ['cardio'])
  // Adding (no current): nothing disabled.
  assert.ok(mg.groups[0].items.every((i) => i.disabledReason == null))
  const eq = buildPickerSections({
    library,
    equipmentAllowed: new Set(['dumbbell', 'bodyweight']),
  })
  const eqIds = eq.groups.flatMap((g) => g.items.map((i) => i.exercise.id))
  // Barbell / machine filtered out; no-equipment cardio rows stay.
  assert.deepEqual(eqIds.sort(), ['bike', 'gs', 'pu', 'run'])
})

test('defaultsForAdd: strength copies the most similar exercise', () => {
  const workout = [
    { sets: 5, reps: '5', weight_guidance: 'heavy', exercise: backSquat },
    { sets: 3, reps: '12', weight_guidance: 'light', exercise: pushUp },
  ]
  const d = defaultsForAdd(legPress, workout)
  assert.equal(d.sets, 5)
  assert.equal(d.reps, '5')
  assert.equal(d.weight_guidance, 'heavy')
  assert.equal(d.notes, '')
  assert.deepEqual(d.athlete_edits, { added: true })
  assert.equal(d.is_interval, false)
  // Same muscle group fallback → push-up; nothing similar → first strength.
  assert.equal(defaultsForAdd(ex('dbp', 'DB Press', 'other', 'chest'), workout).reps, '12')
  assert.equal(defaultsForAdd(rdl, workout).reps, '5')
  // Empty workout → 3 × 10 moderate.
  const empty = defaultsForAdd(rdl, [])
  assert.deepEqual([empty.sets, empty.reps, empty.weight_guidance], [3, '10', 'moderate'])
})

test('defaultsForAdd: cardio gets structured targets LogCardio can use', () => {
  const steady = defaultsForAdd(run, [], 'km')
  assert.equal(steady.sets, 1)
  assert.equal(steady.reps, '—')
  assert.equal(steady.is_interval, false)
  assert.equal(steady.target_splits, null)
  assert.ok(steady.target_duration_seconds != null || steady.target_distance != null)
  assert.equal(steady.distance_unit, 'km')

  const intervals = defaultsForAdd(
    ex('int', 'Track Intervals', 'cardio_run', 'cardio', {
      modality: 'cardio',
      typically_interval: true,
    }),
    [],
    'mi',
  )
  assert.equal(intervals.is_interval, true)
  assert.ok(Array.isArray(intervals.target_splits) && intervals.target_splits.length > 0)
  assert.equal(intervals.target_duration_seconds, null)
})
