/**
 * Normalize AI cardio prescriptions into structured workout_exercises columns.
 * Keeps strength-only fields (reps) unused for cardio; effort/RPE may stay in weight_guidance.
 */

const STEADY_DEFAULTS = {
  'Easy Run': { distanceMi: 3, effort: 'easy' },
  'Tempo Run': { distanceMi: 4, effort: 'tempo' },
  'Long Run': { distanceMi: 8, effort: 'easy-moderate' },
  'Recovery Run': { distanceMi: 2.5, effort: 'easy' },
  'Steady-State Ride': { durationSec: 2700, effort: 'steady' },
  'Steady Swim': { durationSec: 1800, effort: 'steady' },
  'Steady Row': { durationSec: 1800, effort: 'steady' },
  'Cardio Warm-up': { durationSec: 600, effort: 'easy' },
}

const INTERVAL_DEFAULTS = {
  'Interval Run': {
    workCount: 6,
    workDistanceMi: 0.5,
    recoverySec: 90,
    targetPace: '7:30',
  },
  'Interval Ride': {
    workCount: 5,
    workDurationSec: 180,
    recoverySec: 120,
    targetPace: null,
  },
  'Interval Swim': {
    workCount: 6,
    workDistanceMi: 0.062, // ~100m in mi; converted below by unit
    workMeters: 100,
    recoverySec: 45,
    targetPace: null,
  },
  'Interval Row': {
    workCount: 5,
    workDurationSec: 180,
    recoverySec: 90,
    targetPace: null,
  },
}

function miToUnit(mi, unit) {
  if (unit === 'km') return Math.round(mi * 1.60934 * 100) / 100
  return Math.round(mi * 100) / 100
}

function metersToUnit(meters, unit) {
  if (unit === 'km') return Math.round((meters / 1000) * 1000) / 1000
  return Math.round((meters / 1609.34) * 1000) / 1000
}

function parseDurationSeconds(text) {
  if (text == null) return null
  const s = String(text).trim()
  if (!s) return null
  // Prefer explicit minute/second wording over mm:ss (mm:ss is usually pace).
  const mins = s.match(/\b(\d+(?:\.\d+)?)\s*(?:min|mins|minutes?)\b/i)
  if (mins) return Math.round(Number(mins[1]) * 60)
  const secs = s.match(/\b(\d+)\s*(?:sec|secs|seconds?)\b/i)
  if (secs) return Number(secs[1])
  // Bare mm:ss only when not a pace cue (…/mi, …/km, "pace").
  const mmss = s.match(/\b(\d{1,2}):(\d{2})\b/)
  if (mmss) {
    const after = s.slice(mmss.index + mmss[0].length)
    if (/^\s*\/\s*(mi|km)\b/i.test(after) || /\bpace\b/i.test(s)) {
      return null
    }
    return Number(mmss[1]) * 60 + Number(mmss[2])
  }
  return null
}

function parseDistance(text, preferredUnit) {
  if (text == null) return null
  const s = String(text)
  const mi = s.match(/\b(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\b/i)
  if (mi) {
    const n = Number(mi[1])
    return {
      distance: preferredUnit === 'km' ? miToUnit(n, 'km') : n,
      unit: preferredUnit,
    }
  }
  const km = s.match(/\b(\d+(?:\.\d+)?)\s*(?:km|kilometers?)\b/i)
  if (km) {
    const n = Number(km[1])
    return {
      distance: preferredUnit === 'mi' ? Math.round((n / 1.60934) * 100) / 100 : n,
      unit: preferredUnit,
    }
  }
  const meters = s.match(/\b(\d+)\s*m\b/i)
  if (meters && !/\bmi\b/i.test(s)) {
    return {
      distance: metersToUnit(Number(meters[1]), preferredUnit),
      unit: preferredUnit,
    }
  }
  return null
}

function parseIntervalPattern(text, unit) {
  if (text == null) return null
  const s = String(text)
  // e.g. 6x800m, 6 × 0.5 mi, 5 x 3 min
  const m = s.match(
    /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(m|mi|miles?|km|kilometers?|min|mins|minutes?)?/i,
  )
  if (!m) return null
  const count = Number(m[1])
  const mag = Number(m[2])
  const u = (m[3] || '').toLowerCase()
  const splits = []
  for (let i = 0; i < count; i++) {
    const work = { split_number: splits.length + 1, label: 'work' }
    if (u === 'm') {
      work.distance = metersToUnit(mag, unit)
      work.unit = unit
    } else if (u.startsWith('km')) {
      work.distance = unit === 'mi' ? Math.round((mag / 1.60934) * 100) / 100 : mag
      work.unit = unit
    } else if (u.startsWith('min')) {
      work.duration_seconds = Math.round(mag * 60)
    } else {
      // mi or bare number treated as distance in preferred unit
      work.distance = mag
      work.unit = unit
    }
    splits.push(work)
    splits.push({
      split_number: splits.length + 1,
      label: 'recovery',
      duration_seconds: 90,
    })
  }
  return splits.length ? splits : null
}

function effortOnly(text) {
  if (text == null) return ''
  const s = String(text).trim()
  if (!s) return ''
  // Drop chunks that look like prescription prose (distance/pace/splits)
  if (
    /\b\d+\s*[x×]\b/i.test(s) ||
    /\b\d+(?:\.\d+)?\s*(?:mi|mile|miles|km|m)\b/i.test(s) ||
    /\b\d+:\d{2}\b/.test(s) ||
    /\bsplits?\b/i.test(s) ||
    /\brepeats?\b/i.test(s)
  ) {
    const rpe = s.match(/\bRPE\s*\d+(?:\.\d+)?\b/i)
    if (rpe) return rpe[0]
    const cue = s.match(
      /\b(easy|tempo|steady|hard|recovery|easy-moderate|moderate)\b/i,
    )
    if (cue) return cue[1].toLowerCase()
    return ''
  }
  // Keep short intensity cues
  if (s.length <= 40) return s
  const rpe = s.match(/\bRPE\s*\d+(?:\.\d+)?\b/i)
  return rpe ? rpe[0] : s.slice(0, 40)
}

function defaultIntervalSplits(name, unit) {
  const d = INTERVAL_DEFAULTS[name]
  if (!d) {
    return Array.from({ length: 6 }, (_, i) => {
      const workN = i * 2 + 1
      return [
        {
          split_number: workN,
          label: 'work',
          distance: miToUnit(0.5, unit),
          unit,
          target_pace: '7:30',
        },
        {
          split_number: workN + 1,
          label: 'recovery',
          duration_seconds: 90,
        },
      ]
    }).flat()
  }
  const splits = []
  for (let i = 0; i < d.workCount; i++) {
    const work = { split_number: splits.length + 1, label: 'work' }
    if (d.workMeters != null) {
      work.distance = metersToUnit(d.workMeters, unit)
      work.unit = unit
    } else if (d.workDistanceMi != null) {
      work.distance = miToUnit(d.workDistanceMi, unit)
      work.unit = unit
    } else if (d.workDurationSec != null) {
      work.duration_seconds = d.workDurationSec
    }
    if (d.targetPace) work.target_pace = d.targetPace
    splits.push(work)
    splits.push({
      split_number: splits.length + 1,
      label: 'recovery',
      duration_seconds: d.recoverySec ?? 90,
    })
  }
  return splits
}

function defaultSteady(name, unit) {
  const d = STEADY_DEFAULTS[name] || { distanceMi: 3, effort: 'steady' }
  const out = {
    target_duration_seconds: d.durationSec ?? null,
    target_distance:
      d.distanceMi != null ? miToUnit(d.distanceMi, unit) : null,
    distance_unit: unit,
    weight_guidance: d.effort,
  }
  return out
}

/**
 * @param {object} ex - AI exercise object
 * @param {{ modality?: string, typically_interval?: boolean, name?: string } | null} catalogEx
 * @param {'mi'|'km'} distanceUnit
 */
export function normalizeCardioExercise(ex, catalogEx, distanceUnit = 'mi') {
  const unit = distanceUnit === 'km' ? 'km' : 'mi'
  const name = String(ex.name || catalogEx?.name || '').trim()
  const isCardio =
    ex.modality === 'cardio' || catalogEx?.modality === 'cardio'
  if (!isCardio) {
    return {
      ...ex,
      modality: 'strength',
      is_interval: false,
      target_duration_seconds: null,
      target_distance: null,
      distance_unit: null,
      target_splits: null,
    }
  }

  const notesClean = stripWarmupProse(ex.notes)
  // Parse prescription from reps/guidance/notes, ignoring warm-up prose so
  // "10 min warm-up" does not become target_duration_seconds.
  const blob = [ex.reps, ex.weight_guidance, notesClean].filter(Boolean).join(' ')
  const typicallyInterval = Boolean(
    ex.is_interval ?? catalogEx?.typically_interval,
  )
  const isWarmup = /^cardio warm-?up$/i.test(name)
  const isInterval = typicallyInterval && !isWarmup

  let targetDuration =
    ex.target_duration_seconds != null && Number.isFinite(Number(ex.target_duration_seconds))
      ? Number(ex.target_duration_seconds)
      : parseDurationSeconds(blob)
  let targetDistance =
    ex.target_distance != null && Number.isFinite(Number(ex.target_distance))
      ? Number(ex.target_distance)
      : null
  let distUnit =
    ex.distance_unit === 'km' || ex.distance_unit === 'mi'
      ? ex.distance_unit
      : unit

  if (targetDistance == null) {
    const parsed = parseDistance(blob, unit)
    if (parsed) {
      targetDistance = parsed.distance
      distUnit = parsed.unit
    }
  }

  let targetSplits = Array.isArray(ex.target_splits) ? ex.target_splits : null
  if (isInterval) {
    if (!targetSplits || targetSplits.length === 0) {
      targetSplits = parseIntervalPattern(blob, unit)
    }
    if (!targetSplits || targetSplits.length === 0) {
      targetSplits = defaultIntervalSplits(name, unit)
    }
    // Ensure split_number present
    targetSplits = targetSplits.map((s, i) => ({
      ...s,
      split_number: s.split_number ?? i + 1,
      unit: s.unit === 'km' || s.unit === 'mi' ? s.unit : s.distance != null ? unit : s.unit,
    }))
    targetDuration = null
    targetDistance = null
  } else {
    targetSplits = null
    if (targetDuration == null && targetDistance == null) {
      const def = defaultSteady(name, unit)
      targetDuration = def.target_duration_seconds
      targetDistance = def.target_distance
      distUnit = def.distance_unit
    }
  }

  const effort = effortOnly(ex.weight_guidance) ||
    (isWarmup
      ? 'easy'
      : isInterval
        ? 'hard'
        : defaultSteady(name, unit).weight_guidance)

  const workBouts = isInterval
    ? targetSplits.filter((s) => (s.label || 'work') !== 'recovery').length ||
      Math.ceil(targetSplits.length / 2)
    : 1

  // If distance was prescribed in prose and duration only came from leftover text,
  // keep distance as the primary target for distance-based run names.
  if (
    !isInterval &&
    targetDistance != null &&
    ex.target_duration_seconds == null &&
    /run/i.test(name) &&
    !isWarmup
  ) {
    const explicitTime =
      /\b\d+(?:\.\d+)?\s*(?:min|mins|minutes|sec|secs|seconds)\b/i.test(
        [ex.reps, ex.weight_guidance].filter(Boolean).join(' '),
      )
    if (!explicitTime) targetDuration = null
  }

  return {
    ...ex,
    name,
    modality: 'cardio',
    sets: isInterval ? workBouts : 1,
    reps: '—',
    weight_guidance: effort || 'steady',
    notes: notesClean,
    target_duration_seconds: targetDuration,
    target_distance: targetDistance,
    distance_unit: distUnit,
    is_interval: isInterval,
    target_splits: targetSplits,
  }
}

function stripWarmupProse(notes) {
  if (notes == null || notes === '') return ''
  const s = String(notes)
    .replace(/\b\d+\s*(?:min|mins|minutes?)\s*warm-?ups?\b/gi, '')
    .replace(/\b(?:include|with|do)\s+(?:a\s+)?warm-?ups?\b/gi, '')
    .replace(/\bwarm-?up[:\s][^.]+\.?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return s
}

/**
 * Ensure interval/tempo days include a leading Cardio Warm-up row.
 * Mutates day.exercises in place.
 */
export function ensureCardioWarmup(day, distanceUnit = 'mi') {
  if (!day?.exercises?.length) return
  const hasWarmup = day.exercises.some((e) =>
    /^cardio warm-?up$/i.test(String(e.name || '')),
  )
  if (hasWarmup) return

  const needsWarmup = day.exercises.some((e) => {
    const name = String(e.name || '')
    return (
      e.is_interval === true ||
      /interval/i.test(name) ||
      /^tempo run$/i.test(name)
    )
  })
  if (!needsWarmup) return

  const warm = normalizeCardioExercise(
    {
      name: 'Cardio Warm-up',
      modality: 'cardio',
      sets: 1,
      reps: '—',
      weight_guidance: 'easy',
      notes: '',
      target_duration_seconds: 600,
      target_distance: null,
      distance_unit: distanceUnit === 'km' ? 'km' : 'mi',
      is_interval: false,
      target_splits: null,
    },
    { modality: 'cardio', typically_interval: false, name: 'Cardio Warm-up' },
    distanceUnit,
  )
  day.exercises.unshift(warm)
}

export function normalizeProgramCardio(program, catalogByNorm, distanceUnit) {
  if (!program?.weeks) return program
  const unit = distanceUnit === 'km' ? 'km' : 'mi'
  for (const week of program.weeks) {
    for (const day of week.days || []) {
      day.exercises = (day.exercises || []).map((ex) => {
        const key = String(ex.name || '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ')
        const catalogEx = catalogByNorm?.get?.(key) ?? null
        return normalizeCardioExercise(ex, catalogEx, unit)
      })
      ensureCardioWarmup(day, unit)
    }
  }
  return program
}
