// Run: npm test   (node --test tests/*.test.js; .ts imported via type stripping)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyPattern,
  classifyTier,
  painRegionsFromText,
  repairProgram,
} from '../supabase/functions/generate-program/sessionRules.ts'

// Subset of supabase/seed.sql + cardio.sql, shaped like the client payload.
const C = (name, movement_pattern, equipment_required, tags = [], modality = 'strength') => ({
  name,
  modality,
  movement_pattern,
  equipment_required,
  contraindication_tags: tags,
})
const CATALOG = [
  C('Back Squat', 'squat', 'barbell', ['high_knee_strain', 'high_lower_back_load']),
  C('Front Squat', 'squat', 'barbell', ['high_knee_strain']),
  C('Goblet Squat', 'squat', 'dumbbell', ['high_knee_strain']),
  C('Bulgarian Split Squat', 'squat', 'dumbbell', ['high_knee_strain']),
  C('Leg Press', 'squat', 'machine', ['high_knee_strain']),
  C('Romanian Deadlift', 'hinge', 'barbell', ['high_lower_back_load']),
  C('Hip Thrust', 'hinge', 'barbell'),
  C('Barbell Bench Press', 'horizontal_push', 'barbell', ['high_shoulder_strain']),
  C('Dumbbell Bench Press', 'horizontal_push', 'dumbbell', ['high_shoulder_strain']),
  C('Overhead Press', 'vertical_push', 'barbell', ['high_shoulder_strain']),
  C('Lateral Raise', 'vertical_push', 'dumbbell', ['high_shoulder_strain']),
  C('Dumbbell Row', 'horizontal_pull', 'dumbbell'),
  C('Seated Cable Row', 'horizontal_pull', 'cable'),
  C('Lat Pulldown', 'vertical_pull', 'cable'),
  C('Pull-Up', 'vertical_pull', 'bodyweight'),
  C('Plank', 'core', 'bodyweight'),
  C('Dead Bug', 'core', 'bodyweight'),
  C('Cardio Warm-up', 'cardio_warmup', 'bodyweight', [], 'cardio'),
  C('Interval Run', 'cardio_run', 'bodyweight', [], 'cardio'),
  C('Easy Run', 'cardio_run', 'bodyweight', [], 'cardio'),
]

const S = (name, extra = {}) => ({
  name,
  modality: 'strength',
  sets: 3,
  reps: '5',
  weight_guidance: 'RPE 7',
  notes: '',
  ...extra,
})
const cardio = (name, extra = {}) => ({
  name,
  modality: 'cardio',
  sets: 1,
  reps: '—',
  weight_guidance: 'easy',
  target_duration_seconds: 600,
  is_interval: false,
  ...extra,
})

const programOf = (...days) => ({
  program_name: 'Test',
  duration_weeks: 1,
  weeks: [
    {
      week_number: 1,
      days: days.map((exercises, i) => ({ day_number: i + 1, focus: 'x', exercises })),
    },
  ],
})

const names = (res, day = 0) => res.program.weeks[0].days[day].exercises.map((e) => e.name)
const patterns = (list) =>
  list.map((n) => classifyPattern({ name: n }, CATALOG.find((c) => c.name === n)))

/** Same-pattern neighbours, ignoring a power primer right before its main lift. */
function adjacentSame(list) {
  const pats = patterns(list)
  const hits = []
  for (let i = 1; i < list.length; i++) {
    const primer = classifyTier({ name: list[i - 1] }) === 'power'
    if (pats[i] === pats[i - 1] && pats[i] !== 'cardio' && !primer) {
      hits.push(`${list[i - 1]} → ${list[i]}`)
    }
  }
  return hits
}

const PARKER_DAY = () => [
  S('Back Squat'),
  S('Front Squat'),
  S('Goblet Squat'),
  S('Romanian Deadlift'),
  S('Plank', { reps: '45s' }),
  S('Jump Squat', { reps: '10' }),
]
const INTERMEDIATE = {
  experience_level: 'intermediate',
  goal: 'strength',
  equipment: 'commercial gym',
}

test('classification: tiers and patterns', () => {
  assert.equal(classifyTier({ name: 'Jump Squat' }), 'power')
  assert.equal(classifyTier({ name: 'Box Jump' }), 'power')
  assert.equal(classifyTier({ name: 'Hang Clean' }), 'power')
  assert.equal(classifyTier({ name: 'Medicine Ball Slam' }), 'power')
  assert.equal(classifyTier({ name: 'Kettlebell Swing' }, C('Kettlebell Swing', 'hinge', 'kettlebell')), 'secondary_compound')
  assert.equal(classifyTier({ name: 'Jump Rope' }), 'conditioning')
  assert.equal(classifyTier({ name: 'Back Squat' }), 'main_compound')
  assert.equal(classifyTier({ name: 'Goblet Squat' }), 'secondary_compound')
  assert.equal(classifyTier({ name: 'Lateral Raise' }), 'accessory')
  assert.equal(classifyTier({ name: 'Plank' }, CATALOG.find((c) => c.name === 'Plank')), 'core')
  assert.equal(classifyTier({ name: 'Cardio Warm-up', modality: 'cardio' }), 'warmup')
  assert.equal(classifyPattern({ name: 'Jump Squat' }), 'squat')
  assert.equal(classifyPattern({ name: 'Bulgarian Split Squat' }, CATALOG[3]), 'lunge')
  assert.equal(classifyPattern({ name: 'Romanian Deadlift' }), 'hinge')
  assert.equal(classifyPattern({ name: 'Lat Pulldown' }), 'vertical_pull')
})

test("Parker's case: 3 squats + Jump Squat at the end", () => {
  const res = repairProgram(programOf(PARKER_DAY()), CATALOG, INTERMEDIATE)
  const out = names(res)
  const pats = patterns(out)

  // Jump Squat now comes before any heavy work (or is gone).
  const jump = out.indexOf('Jump Squat')
  if (jump !== -1) assert.equal(jump, 0, out.join(', '))
  assert.ok(pats.filter((p) => p === 'squat').length <= 2, out.join(', '))
  assert.deepEqual(adjacentSame(out), [])
  assert.ok(out.includes('Back Squat'))
  assert.ok(res.fixes.some((f) => /Moved Jump Squat before Back Squat/.test(f)), res.fixes.join('\n'))
  assert.deepEqual(res.shortfalls, [])
  const jumpRow = res.program.weeks[0].days[0].exercises[0]
  assert.equal(jumpRow.reps, '5', 'power work capped at 5 reps')
  assert.deepEqual(out, [
    'Jump Squat',
    'Back Squat',
    'Romanian Deadlift',
    'Bulgarian Split Squat',
    'Plank',
  ])
})

test("Parker's case for a beginner: plyo dropped, squats capped", () => {
  const res = repairProgram(programOf(PARKER_DAY()), CATALOG, {
    ...INTERMEDIATE,
    experience_level: 'beginner',
  })
  const out = names(res)
  assert.ok(!out.includes('Jump Squat'), out.join(', '))
  assert.ok(patterns(out).filter((p) => p === 'squat').length <= 2)
  assert.deepEqual(adjacentSame(out), [])
  assert.ok(res.fixes.some((f) => /Removed Jump Squat \(plyometric not suited: beginner\)/.test(f)), res.fixes.join('\n'))
})

test('plyo dropped for a beginner; replaced when the pattern has room', () => {
  const day = [S('Box Jump'), S('Barbell Bench Press'), S('Dumbbell Row'), S('Plank')]
  const res = repairProgram(programOf(day), CATALOG, {
    experience_level: 'beginner',
    goal: 'general fitness',
    equipment: 'commercial gym',
  })
  const out = names(res)
  assert.ok(!out.includes('Box Jump'), out.join(', '))
  // Box Jump is a squat-pattern jump; a vetted non-plyo squat replaces it.
  assert.ok(out.some((n) => patterns([n])[0] === 'squat'), out.join(', '))
  assert.ok(res.fixes.some((f) => /Box Jump/.test(f)))
})

test('plyo dropped for a knee pain flag, without a knee-straining swap', () => {
  const day = [S('Box Jump'), S('Romanian Deadlift'), S('Dumbbell Row'), S('Plank')]
  const res = repairProgram(programOf(day), CATALOG, {
    ...INTERMEDIATE,
    limitations: 'Left knee gets sore on stairs',
  })
  const out = names(res)
  assert.ok(!out.includes('Box Jump'))
  assert.ok(!out.some((n) => /squat|leg press/i.test(n)), out.join(', '))
  assert.ok(res.fixes.some((f) => /knee/.test(f)), res.fixes.join('\n'))
})

test('pain text: negations and exercise names are not flags', () => {
  assert.deepEqual([...painRegionsFromText('none')], [])
  assert.deepEqual([...painRegionsFromText('No knee issues, I love back squats')], [])
  assert.deepEqual([...painRegionsFromText('lower back pain')], ['back'])
})

test('accessory interleaving: no back-to-back same pattern', () => {
  const day = [
    S('Barbell Bench Press'),
    S('Dumbbell Row'),
    S('Lateral Raise'),
    S('Overhead Press', { reps: '10' }),
    S('Bicep Curl'),
    S('Hammer Curl'),
    S('Preacher Curl'),
    S('Tricep Pushdown'),
  ]
  // 3 curls exceed the cap; remaining accessories interleave.
  const res = repairProgram(programOf(day), CATALOG, INTERMEDIATE)
  const out = names(res)
  assert.deepEqual(adjacentSame(out), [], out.join(', '))
  assert.ok(!out.includes('Preacher Curl'))
  assert.deepEqual(out.slice(3), ['Lateral Raise', 'Bicep Curl', 'Tricep Pushdown', 'Hammer Curl'])
})

test('accessory interleaving keeps order when patterns alternate already', () => {
  const day = [
    S('Back Squat'),
    S('Romanian Deadlift'),
    S('Lateral Raise'),
    S('Leg Curl'),
    S('Face Pull'),
    S('Calf Raise'),
  ]
  const res = repairProgram(programOf(day), CATALOG, INTERMEDIATE)
  assert.deepEqual(names(res), day.map((e) => e.name))
})

test('accessory interleaving: [push, push, pull] becomes push, pull, push', () => {
  const day = [S('Back Squat'), S('Lateral Raise'), S('Front Raise'), S('Face Pull')]
  const res = repairProgram(programOf(day), CATALOG, INTERMEDIATE)
  assert.deepEqual(names(res), ['Back Squat', 'Lateral Raise', 'Face Pull', 'Front Raise'])
  assert.ok(res.fixes.some((f) => /Moved Face Pull before Front Raise/.test(f)))
})

test('cardio warm-up stays first; power goes right after it', () => {
  const day = [
    cardio('Cardio Warm-up'),
    S('Barbell Bench Press'),
    S('Pull-Up'),
    S('Medicine Ball Chest Pass'),
  ]
  const res = repairProgram(programOf(day), CATALOG, INTERMEDIATE)
  const out = names(res)
  assert.equal(out[0], 'Cardio Warm-up')
  assert.equal(out[1], 'Medicine Ball Chest Pass')
})

test('run-led day keeps the run before accessories; finisher cardio stays last', () => {
  const runDay = [cardio('Cardio Warm-up'), cardio('Interval Run', { is_interval: true }), S('Goblet Squat'), S('Plank')]
  const res = repairProgram(programOf(runDay), CATALOG, INTERMEDIATE)
  assert.deepEqual(names(res), runDay.map((e) => e.name))

  const finisher = [S('Back Squat'), S('Easy Run'), S('Romanian Deadlift')]
  finisher[1] = cardio('Easy Run')
  const res2 = repairProgram(programOf(finisher), CATALOG, INTERMEDIATE)
  assert.deepEqual(names(res2), ['Back Squat', 'Romanian Deadlift', 'Easy Run'])
})

test('already-good sessions are unchanged, with no fixes', () => {
  const lower = [
    cardio('Cardio Warm-up'),
    S('Back Squat'),
    S('Romanian Deadlift'),
    S('Bulgarian Split Squat'),
    S('Hip Thrust'),
    S('Plank'),
  ]
  const upper = [
    S('Barbell Bench Press'),
    S('Overhead Press'),
    S('Dumbbell Row'),
    S('Lat Pulldown'),
    S('Lateral Raise'),
    S('Dead Bug'),
  ]
  const program = programOf(lower, upper)
  const before = JSON.stringify(program)
  const res = repairProgram(program, CATALOG, INTERMEDIATE)
  assert.deepEqual(res.fixes, [])
  assert.deepEqual(res.shortfalls, [])
  assert.equal(JSON.stringify(res.program), before)
  assert.equal(JSON.stringify(program), before, 'input not mutated')
})

test('athlete-added exercises are never dropped', () => {
  const day = [S('Back Squat'), S('Front Squat'), S('Goblet Squat'), S('Romanian Deadlift')]
  const res = repairProgram(programOf(day), CATALOG, {
    ...INTERMEDIATE,
    exercise_performance: [
      { name: 'Goblet Squat', athlete_edits: ['Athlete added Goblet Squat to this workout themselves.'] },
    ],
  })
  const out = names(res)
  assert.ok(out.includes('Goblet Squat'), out.join(', '))
  assert.ok(out.includes('Back Squat'))
  assert.ok(patterns(out).filter((p) => p === 'squat').length <= 2)
})

test('shortfall reported when the repair leaves under 3 strength exercises', () => {
  const day = [S('Back Squat'), S('Front Squat'), S('Goblet Squat'), S('Leg Press')]
  // Bodyweight-only equipment: no swap candidates fit, so extras are dropped.
  const res = repairProgram(programOf(day), CATALOG, {
    ...INTERMEDIATE,
    equipment: 'bodyweight only',
  })
  assert.equal(names(res).length, 2)
  assert.equal(res.shortfalls.length, 1)
  assert.match(res.shortfalls[0], /^Day 1: only 2 strength/)
})
