/**
 * Pure helpers for how a strength exercise is loaded (no Supabase / DOM), so
 * they can be unit-tested with plain node: `npm test`.
 */
import { convertWeight, roundWeight } from './units.js'

const DUMBBELL_NAME_RE = /\bdumb-?bells?\b|\bdbs?\b/i
const DUMBBELL_TEXT_RE = /\bdumb-?bells?\b|\bdbs?\b|\b(?:per|each)\s+(?:hand|arm)\b/i
const KETTLEBELL_RE = /\bkettle-?bells?\b|\bkbs?\b/i
// One dumbbell held by both hands or one hand at a time: the logged number is
// that one dumbbell, so a "Total" entry mode would make no sense.
const SINGLE_DUMBBELL_RE =
  /\bgoblet\b|\b(?:single|one|1)[\s-]?(?:arm|hand|handed)\b|\bsuitcase\b|\b(?:a|one|single)\s+dumb-?bell\b/i

/**
 * Is this workout_exercise loaded with dumbbells?
 *
 * Signals, strongest first: exercises.equipment_required, the exercise name
 * ("Dumbbell …", "DB …"), then the prescription text (weight_guidance /
 * notes mentioning dumbbells, "per hand", "each hand").
 * Kettlebell lifts are excluded on purpose (see README / PR notes).
 *
 * @returns {{ isDumbbell: boolean, single: boolean }}
 *   single = one dumbbell (goblet squat, single-arm row) — no Each/Total.
 */
export function dumbbellInfo(we) {
  const name = String(we?.exercise?.name ?? we?.name ?? '')
  const equipment = String(we?.exercise?.equipment_required ?? we?.equipment_required ?? '')
    .toLowerCase()
    .trim()
  const text = [we?.weight_guidance, we?.notes]
    .filter((s) => s != null)
    .join(' ')

  const none = { isDumbbell: false, single: false }
  if (we?.exercise?.modality === 'cardio') return none
  if (equipment === 'kettlebell' || KETTLEBELL_RE.test(name)) return none

  let isDumbbell = false
  if (equipment === 'dumbbell' || equipment === 'dumbbells') {
    isDumbbell = true
  } else if (equipment && equipment !== 'bodyweight') {
    // Barbell / machine / cable etc. — only trust an explicit name.
    isDumbbell = DUMBBELL_NAME_RE.test(name)
  } else {
    isDumbbell =
      DUMBBELL_NAME_RE.test(name) ||
      (DUMBBELL_TEXT_RE.test(text) && !KETTLEBELL_RE.test(text))
  }
  if (!isDumbbell) return none
  return {
    isDumbbell: true,
    single: SINGLE_DUMBBELL_RE.test(name) || SINGLE_DUMBBELL_RE.test(text),
  }
}

export function isDumbbellExercise(we) {
  return dumbbellInfo(we).isDumbbell
}

const UNIT_RE = '(lbs?|pounds?|kgs?|kilos?|kilograms?)'
const NUM_RE = '(\\d+(?:\\.\\d+)?)'
// First number (or range lower bound) directly followed by a weight unit:
// "45 lb", "45-50 lb", "45lb–50lb", "20 to 24 kg".
const WEIGHT_RE = new RegExp(
  `(?<![\\d.])${NUM_RE}(?:\\s*${UNIT_RE})?(?:\\s*(?:-|–|—|to)\\s*${NUM_RE})?\\s*${UNIT_RE}\\b`,
  'gi',
)
// "+5 lb", "add 10 lb", "increase by 5 lb", "drop 10 lb" are increments,
// not a starting load.
const INCREMENT_BEFORE_RE =
  /(?:\+|\b(?:add(?:ing)?|increase(?:\s+by)?|up|bump(?:\s+by)?|drop|reduce(?:\s+by)?|minus|plus|less|more)\s*)$/i
const TOTAL_AFTER_RE = /^\s*(?:total|combined|in total|for the pair|pair)\b/i
// "45 lb plates", "25 lb per side" on a bar describe plates, not the load.
const PLATE_AFTER_RE = /^\s*(?:plates?\b|(?:per|each|a)\s+side\b)/i

function unitOf(token) {
  return /^k/i.test(token) ? 'kg' : 'lb'
}

/**
 * Starting weight suggested by a prescription such as
 * "~45-50 lb dumbbells per hand". Percentages and RPE are ignored (they have
 * no unit). Returns the value in `unit` (rounded to 0.1) or null.
 *
 * For dumbbell exercises the number is read as per hand, unless the text says
 * it is the total ("40 lb total"), in which case it is halved.
 */
export function parseGuidanceWeight(guidance, unit = 'lb', { perHand = false } = {}) {
  if (guidance == null) return null
  const text = String(guidance)
  WEIGHT_RE.lastIndex = 0
  let m
  while ((m = WEIGHT_RE.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 16), m.index)
    if (INCREMENT_BEFORE_RE.test(before)) continue
    const after = text.slice(m.index + m[0].length)
    if (/^\s*plates?\b/i.test(after)) continue
    if (!perHand && PLATE_AFTER_RE.test(after)) continue
    const value = Number(m[1])
    if (!Number.isFinite(value) || value <= 0) continue
    let n = convertWeight(value, unitOf(m[4]), unit)
    if (perHand && TOTAL_AFTER_RE.test(after)) {
      n /= 2
    }
    return roundWeight(n)
  }
  return null
}
