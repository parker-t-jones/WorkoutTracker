// Run: npm test   (node --test tests/)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dumbbellInfo, parseGuidanceWeight } from '../src/lib/equipment.js'

const ex = (name, equipment_required = null, extra = {}) => ({
  exercise: { name, equipment_required, modality: 'strength' },
  weight_guidance: '',
  notes: '',
  ...extra,
})

test('dumbbellInfo: equipment field', () => {
  assert.deepEqual(dumbbellInfo(ex('Bulgarian Split Squat', 'dumbbell')), {
    isDumbbell: true,
    single: false,
  })
  assert.equal(dumbbellInfo(ex('Back Squat', 'barbell')).isDumbbell, false)
  assert.equal(dumbbellInfo(ex('Leg Press', 'machine')).isDumbbell, false)
})

test('dumbbellInfo: name', () => {
  assert.equal(dumbbellInfo(ex('Dumbbell Bench Press')).isDumbbell, true)
  assert.equal(dumbbellInfo(ex('DB Romanian Deadlift')).isDumbbell, true)
  assert.equal(dumbbellInfo(ex('Incline DB Press', 'barbell')).isDumbbell, true)
  assert.equal(dumbbellInfo(ex('Seated Cable Row', 'cable')).isDumbbell, false)
  // "db" must be a whole word
  assert.equal(dumbbellInfo(ex('Feedback Squat')).isDumbbell, false)
})

test('dumbbellInfo: guidance / notes text', () => {
  const bss = ex('Bulgarian Split Squat', null, {
    weight_guidance: '~45-50 lb dumbbells per hand',
  })
  assert.equal(dumbbellInfo(bss).isDumbbell, true)
  assert.equal(
    dumbbellInfo(ex('Walking Lunge', null, { notes: '30 lb each hand' })).isDumbbell,
    true,
  )
  // explicit barbell equipment wins over "per side" text
  assert.equal(
    dumbbellInfo(ex('Back Squat', 'barbell', { weight_guidance: '45 lb plates per side' }))
      .isDumbbell,
    false,
  )
  assert.equal(dumbbellInfo(ex('Push-Up', 'bodyweight')).isDumbbell, false)
  // "per side" is about reps, not dumbbells
  assert.equal(
    dumbbellInfo(ex('Walking Lunge', null, { weight_guidance: '10 reps per side' })).isDumbbell,
    false,
  )
})

test('dumbbellInfo: single dumbbell and kettlebells', () => {
  assert.deepEqual(dumbbellInfo(ex('Goblet Squat', 'dumbbell')), {
    isDumbbell: true,
    single: true,
  })
  assert.equal(dumbbellInfo(ex('Single-Arm Dumbbell Row')).single, true)
  assert.equal(dumbbellInfo(ex('Kettlebell Swing', 'kettlebell')).isDumbbell, false)
  assert.equal(
    dumbbellInfo(ex('Double KB Front Squat', null, { weight_guidance: '16 kg per hand' }))
      .isDumbbell,
    false,
  )
  assert.equal(
    dumbbellInfo({ exercise: { name: 'Easy Run', modality: 'cardio' }, notes: 'each side' })
      .isDumbbell,
    false,
  )
})

test('parseGuidanceWeight: realistic prescriptions', () => {
  const cases = [
    ['~45-50 lb dumbbells per hand', 'lb', 45],
    ['135 lbs', 'lb', 135],
    ['20kg', 'kg', 20],
    ['45–50 lb', 'lb', 45], // en dash
    ['20 to 24 kg kettlebell', 'kg', 20],
    ['45lb-50lb DBs', 'lb', 45],
    ['Moderate — about 95 lb, RPE 7', 'lb', 95],
    ['RPE 7-8, leave 2 reps in reserve', 'lb', null],
    ['70-75% of 1RM', 'lb', null],
    ['75% 1RM (~185 lb)', 'lb', 185],
    ['bodyweight', 'lb', null],
    ['moderate', 'lb', null],
    ['+5 lb from last week, ~140 lb', 'lb', 140],
    ['add 10 lb', 'lb', null],
    ['up to 50 lb dumbbells', 'lb', 50],
    ['3 x 8 @ 60 kg', 'kg', 60],
    ['12.5 kg each hand', 'kg', 12.5],
    ['bar + 45 lb plates', 'lb', null],
    ['25 lb per side, ~95 lb total', 'lb', 95],
  ]
  for (const [s, unit, want] of cases) {
    assert.equal(parseGuidanceWeight(s, unit), want, s)
  }
})

test('parseGuidanceWeight: unit conversion', () => {
  assert.equal(parseGuidanceWeight('~45-50 lb dumbbells per hand', 'kg'), 20.4)
  assert.equal(parseGuidanceWeight('20 kg', 'lb'), 44.1)
  assert.equal(parseGuidanceWeight('100 pounds', 'lb'), 100)
})

test('parseGuidanceWeight: dumbbell totals are halved', () => {
  assert.equal(parseGuidanceWeight('40 lb total', 'lb', { perHand: true }), 20)
  assert.equal(parseGuidanceWeight('40 lb total', 'lb'), 40)
  assert.equal(parseGuidanceWeight('25 lb per hand', 'lb', { perHand: true }), 25)
  assert.equal(parseGuidanceWeight('20 lb per side', 'lb', { perHand: true }), 20)
  assert.equal(parseGuidanceWeight(null), null)
})
