// Supabase Edge Function: generate-program
// Calls Anthropic with PLAN.md prompts; returns validated program JSON.
// Secret: ANTHROPIC_API_KEY (set via `supabase secrets set`, never in client env)
// Modes: "initial" (1 week from onboarding) | "adaptive" (next week from prior performance)

import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const EXERCISE_SCHEMA = `{
              "name": "string — MUST match an exercise library name exactly",
              "modality": "strength | cardio",
              "sets": "number — strength: set count; cardio interval: WORK-bout count only; steady cardio / Cardio Warm-up: 1",
              "reps": "string — STRENGTH ONLY (e.g. \\"8\\"). For ALL cardio rows use exactly \\"—\\". Never put distance, duration, split counts, or pace in reps.",
              "weight_guidance": "string — strength: load/RPE. cardio: SHORT intensity cue ONLY (easy / tempo / RPE 6 / hard). Never put distance, duration, split counts, or pace here.",
              "notes": "string — brief cues only; never bury warm-up instructions here",
              "target_duration_seconds": "number|null — REQUIRED for steady/non-interval cardio when prescribing by time (integer seconds). null for strength and for pure distance prescriptions",
              "target_distance": "number|null — REQUIRED for steady/non-interval cardio when prescribing by distance (numeric in distance_unit). null for strength and interval rows",
              "distance_unit": "mi|km|null — must match user distance_unit for any cardio with distance",
              "is_interval": "boolean — true only for typically_interval cardio library exercises",
              "target_splits": "array|null — REQUIRED when is_interval true. Each item MUST be an object: { \\"split_number\\": number, \\"distance\\"?: number, \\"duration_seconds\\"?: number, \\"unit\\"?: \\"mi\\"|\\"km\\", \\"target_pace\\"?: \\"m:ss\\", \\"label\\"?: \\"work\\"|\\"recovery\\" }. Include recovery bouts as separate splits. Do NOT put split summaries in reps. null when not interval"
            }`

const INITIAL_SYSTEM_PROMPT = `You are a certified strength and endurance coach generating a structured training program.

Rules:
- Output ONLY valid JSON. No markdown formatting, no code fences, no explanation text before or after.
- Generate exactly ONE week of training (duration_weeks: 1, weeks array length 1).
- ONLY select exercise names from the provided exercise library (exact spelling). Never invent names.
- Every exercise must be appropriate for the stated equipment access. Never include an exercise requiring unavailable equipment.
- If an injury, limitation, or other constraint is mentioned in Additional context from user, avoid exercises that load that area directly, and note the substitution logic in the "notes" field for that exercise.
- Goal handling:
  - strength / hypertrophy / general fitness: primarily strength-library exercises; optional light cardio accessories OK.
  - cardio, OR goal starting with "other:" that indicates an endurance event (marathon, half marathon, triathlon, 5K, 10K, century, etc.): bias HEAVILY toward cardio-library modalities relevant to the event (running/cycling/swimming/rowing). This must be a real endurance week, not a strength split with a token jog. Include accessory strength for injury prevention unless equipment or notes forbid it.
  - Endurance periodization: one long session per week as the longest cardio day (e.g. Long Run for marathon-style), mostly easy/recovery cardio filling other days, and one interval session when appropriate for fitness level. Scale volume/intensity for beginner vs intermediate vs advanced.
- Cardio prescription (CRITICAL — structured columns only):
  - modality MUST be "cardio". Use library cardio names only.
  - NEVER write distance, duration, pace, or split counts into reps or weight_guidance. Those strength fields stay unused (reps = "—"; weight_guidance = short effort cue only).
  - Steady / non-interval (Easy Run, Tempo Run, Long Run, Recovery Run, Steady-State Ride, Steady Swim, Steady Row, Cardio Warm-up): is_interval false; you MUST populate target_distance (number) and/or target_duration_seconds (integer) using the user's distance_unit. Example: Easy Run → target_distance 3, distance_unit "mi", target_duration_seconds null, weight_guidance "easy".
  - Interval (Interval Run/Ride/Swim/Row): is_interval true; sets = work-bout count; you MUST populate target_splits as a JSON array of split objects (not a sentence). Example for 6×0.5 mi: [{"split_number":1,"distance":0.5,"unit":"mi","target_pace":"7:30","label":"work"},{"split_number":2,"duration_seconds":90,"label":"recovery"}, ...]. Leave target_distance and target_duration_seconds null on the parent interval row.
  - Warm-up: for ANY day that includes Interval* or Tempo Run, the FIRST exercise MUST be library name "Cardio Warm-up" with modality cardio, is_interval false, target_duration_seconds typically 600, weight_guidance "easy". Do not put warm-up text in another exercise's notes.
- Strength prescription: modality "strength"; leave cardio fields null/false.
- Fit the session to the stated session length.
- Use age and bodyweight when writing weight_guidance for loaded lifts.
- Each training day should target different or complementary patterns than the day before when possible.

Output must match this exact JSON schema:
{
  "program_name": "string",
  "duration_weeks": 1,
  "weeks": [
    {
      "week_number": 1,
      "days": [
        {
          "day_number": number,
          "focus": "string, e.g. 'Upper body push' or 'Easy run + core'",
          "exercises": [
            ${EXERCISE_SCHEMA}
          ]
        }
      ]
    }
  ]
}`

const ADAPTIVE_SYSTEM_PROMPT = `You are a certified strength and endurance coach adapting NEXT week's training from last week's logged performance.

Rules:
- Output ONLY valid JSON. No markdown formatting, no code fences, no explanation text before or after.
- Generate exactly ONE week (duration_weeks: 1, weeks array length 1) with the given week_number.
- Keep the weekly split/focus structure close to the prior week. Do NOT freely redesign the week from scratch.
- ONLY select exercise names from the provided exercise library (exact spelling).
- Apply each exercise's decision from the performance summary EXACTLY:
  - substitute: SAFETY OVERRIDE — use substitute_to exactly (same modality family). Prescribe appropriately for strength or cardio.
  - skip: omit/deload — do not invent a same-tag replacement.
  - progress: strength → bump load slightly; steady cardio → bump duration/distance slightly; interval cardio → slightly faster target_pace and/or one more work bout when interval_hit_rate was strong.
  - hold: keep similar prescription.
  - reduce_volume: strength → fewer sets first; cardio → shorten duration/distance or ease interval demand (fewer bouts / easier pace), especially if late_split_fade is true.
- Pain / substitute / skip decisions always win over performance-based progression.
- Every exercise must fit the stated equipment access.
- Honor Additional context, session length, age/bodyweight, and distance_unit.
- Prefer exercise names from the provided library when possible (exact spelling).
- Cardio fields stay structured: never put distance/duration/pace/split counts in reps or weight_guidance. Interval rows require target_splits objects. Interval/Tempo days must start with "Cardio Warm-up" as its own exercise.

Output must match this exact JSON schema:
{
  "program_name": "string",
  "duration_weeks": 1,
  "weeks": [
    {
      "week_number": number,
      "days": [
        {
          "day_number": number,
          "focus": "string",
          "exercises": [
            ${EXERCISE_SCHEMA}
          ]
        }
      ]
    }
  ]
}`

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function stripCodeFences(text: string): string {
  return text.replace(/```json|```/g, "").trim()
}

type CatalogEntry = {
  name: string
  modality?: string
  typically_interval?: boolean
}

function normName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ")
}

function miToUnit(mi: number, unit: string): number {
  if (unit === "km") return Math.round(mi * 1.60934 * 100) / 100
  return Math.round(mi * 100) / 100
}

function metersToUnit(meters: number, unit: string): number {
  if (unit === "km") return Math.round((meters / 1000) * 1000) / 1000
  return Math.round((meters / 1609.34) * 1000) / 1000
}

function parseDurationSeconds(text: unknown): number | null {
  if (text == null) return null
  const s = String(text).trim()
  if (!s) return null
  // Prefer explicit minute/second wording over mm:ss (mm:ss is usually pace).
  const mins = s.match(/\b(\d+(?:\.\d+)?)\s*(?:min|mins|minutes?)\b/i)
  if (mins) return Math.round(Number(mins[1]) * 60)
  const secs = s.match(/\b(\d+)\s*(?:sec|secs|seconds?)\b/i)
  if (secs) return Number(secs[1])
  const mmss = s.match(/\b(\d{1,2}):(\d{2})\b/)
  if (mmss) {
    const after = s.slice((mmss.index ?? 0) + mmss[0].length)
    if (/^\s*\/\s*(mi|km)\b/i.test(after) || /\bpace\b/i.test(s)) {
      return null
    }
    return Number(mmss[1]) * 60 + Number(mmss[2])
  }
  return null
}

function parseDistance(
  text: unknown,
  preferredUnit: string,
): { distance: number; unit: string } | null {
  if (text == null) return null
  const s = String(text)
  const mi = s.match(/\b(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\b/i)
  if (mi) {
    const n = Number(mi[1])
    return {
      distance: preferredUnit === "km" ? miToUnit(n, "km") : n,
      unit: preferredUnit,
    }
  }
  const km = s.match(/\b(\d+(?:\.\d+)?)\s*(?:km|kilometers?)\b/i)
  if (km) {
    const n = Number(km[1])
    return {
      distance:
        preferredUnit === "mi"
          ? Math.round((n / 1.60934) * 100) / 100
          : n,
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

function parseIntervalPattern(
  text: unknown,
  unit: string,
): Array<Record<string, unknown>> | null {
  if (text == null) return null
  const s = String(text)
  const m = s.match(
    /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(m|mi|miles?|km|kilometers?|min|mins|minutes?)?/i,
  )
  if (!m) return null
  const count = Number(m[1])
  const mag = Number(m[2])
  const u = (m[3] || "").toLowerCase()
  const splits: Array<Record<string, unknown>> = []
  for (let i = 0; i < count; i++) {
    const work: Record<string, unknown> = {
      split_number: splits.length + 1,
      label: "work",
    }
    if (u === "m") {
      work.distance = metersToUnit(mag, unit)
      work.unit = unit
    } else if (u.startsWith("km")) {
      work.distance =
        unit === "mi" ? Math.round((mag / 1.60934) * 100) / 100 : mag
      work.unit = unit
    } else if (u.startsWith("min")) {
      work.duration_seconds = Math.round(mag * 60)
    } else {
      work.distance = mag
      work.unit = unit
    }
    splits.push(work)
    splits.push({
      split_number: splits.length + 1,
      label: "recovery",
      duration_seconds: 90,
    })
  }
  return splits.length ? splits : null
}

function effortOnly(text: unknown): string {
  if (text == null) return ""
  const s = String(text).trim()
  if (!s) return ""
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
    return ""
  }
  if (s.length <= 40) return s
  const rpe = s.match(/\bRPE\s*\d+(?:\.\d+)?\b/i)
  return rpe ? rpe[0] : s.slice(0, 40)
}

function stripWarmupProse(notes: unknown): string {
  if (notes == null || notes === "") return ""
  return String(notes)
    .replace(/\b\d+\s*(?:min|mins|minutes?)\s*warm-?ups?\b/gi, "")
    .replace(/\b(?:include|with|do)\s+(?:a\s+)?warm-?ups?\b/gi, "")
    .replace(/\bwarm-?up[:\s][^.]+\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
}

const STEADY_DEFAULTS: Record<
  string,
  { distanceMi?: number; durationSec?: number; effort: string }
> = {
  "Easy Run": { distanceMi: 3, effort: "easy" },
  "Tempo Run": { distanceMi: 4, effort: "tempo" },
  "Long Run": { distanceMi: 8, effort: "easy-moderate" },
  "Recovery Run": { distanceMi: 2.5, effort: "easy" },
  "Steady-State Ride": { durationSec: 2700, effort: "steady" },
  "Steady Swim": { durationSec: 1800, effort: "steady" },
  "Steady Row": { durationSec: 1800, effort: "steady" },
  "Cardio Warm-up": { durationSec: 600, effort: "easy" },
}

function defaultIntervalSplits(
  name: string,
  unit: string,
): Array<Record<string, unknown>> {
  const presets: Record<
    string,
    {
      workCount: number
      workDistanceMi?: number
      workDurationSec?: number
      workMeters?: number
      recoverySec: number
      targetPace?: string
    }
  > = {
    "Interval Run": {
      workCount: 6,
      workDistanceMi: 0.5,
      recoverySec: 90,
      targetPace: "7:30",
    },
    "Interval Ride": {
      workCount: 5,
      workDurationSec: 180,
      recoverySec: 120,
    },
    "Interval Swim": {
      workCount: 6,
      workMeters: 100,
      recoverySec: 45,
    },
    "Interval Row": {
      workCount: 5,
      workDurationSec: 180,
      recoverySec: 90,
    },
  }
  const d = presets[name] ?? {
    workCount: 6,
    workDistanceMi: 0.5,
    recoverySec: 90,
    targetPace: "7:30",
  }
  const splits: Array<Record<string, unknown>> = []
  for (let i = 0; i < d.workCount; i++) {
    const work: Record<string, unknown> = {
      split_number: splits.length + 1,
      label: "work",
    }
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
      label: "recovery",
      duration_seconds: d.recoverySec,
    })
  }
  return splits
}

function normalizeCardioExercise(
  ex: Record<string, unknown>,
  catalogEx: CatalogEntry | null,
  distanceUnit: string,
): Record<string, unknown> {
  const unit = distanceUnit === "km" ? "km" : "mi"
  const name = String(ex.name || catalogEx?.name || "").trim()
  const isCardio =
    ex.modality === "cardio" || catalogEx?.modality === "cardio"
  if (!isCardio) {
    return {
      ...ex,
      modality: "strength",
      is_interval: false,
      target_duration_seconds: null,
      target_distance: null,
      distance_unit: null,
      target_splits: null,
    }
  }

  const notesClean = stripWarmupProse(ex.notes)
  const blob = [ex.reps, ex.weight_guidance, notesClean]
    .filter(Boolean)
    .join(" ")
  const typicallyInterval = Boolean(
    ex.is_interval ?? catalogEx?.typically_interval,
  )
  const isWarmup = /^cardio warm-?up$/i.test(name)
  const isInterval = typicallyInterval && !isWarmup

  let targetDuration =
    ex.target_duration_seconds != null &&
      Number.isFinite(Number(ex.target_duration_seconds))
      ? Number(ex.target_duration_seconds)
      : parseDurationSeconds(blob)
  let targetDistance =
    ex.target_distance != null &&
      Number.isFinite(Number(ex.target_distance))
      ? Number(ex.target_distance)
      : null
  let distUnit =
    ex.distance_unit === "km" || ex.distance_unit === "mi"
      ? ex.distance_unit
      : unit

  if (targetDistance == null) {
    const parsed = parseDistance(blob, unit)
    if (parsed) {
      targetDistance = parsed.distance
      distUnit = parsed.unit
    }
  }

  let targetSplits = Array.isArray(ex.target_splits)
    ? (ex.target_splits as Array<Record<string, unknown>>)
    : null

  if (isInterval) {
    if (!targetSplits || targetSplits.length === 0) {
      targetSplits = parseIntervalPattern(blob, unit)
    }
    if (!targetSplits || targetSplits.length === 0) {
      targetSplits = defaultIntervalSplits(name, unit)
    }
    targetSplits = targetSplits.map((s, i) => ({
      ...s,
      split_number: s.split_number ?? i + 1,
      unit:
        s.unit === "km" || s.unit === "mi"
          ? s.unit
          : s.distance != null
            ? unit
            : s.unit,
    }))
    targetDuration = null
    targetDistance = null
  } else {
    targetSplits = null
    if (targetDuration == null && targetDistance == null) {
      const def = STEADY_DEFAULTS[name] || {
        distanceMi: 3,
        effort: "steady",
      }
      targetDuration = def.durationSec ?? null
      targetDistance =
        def.distanceMi != null ? miToUnit(def.distanceMi, unit) : null
      distUnit = unit
    }
  }

  const defEffort =
    STEADY_DEFAULTS[name]?.effort ||
    (isWarmup ? "easy" : isInterval ? "hard" : "steady")
  const effort = effortOnly(ex.weight_guidance) || defEffort
  const workBouts = isInterval
    ? targetSplits!.filter((s) => (s.label || "work") !== "recovery").length ||
      Math.ceil(targetSplits!.length / 2)
    : 1

  if (
    !isInterval &&
    targetDistance != null &&
    ex.target_duration_seconds == null &&
    /run/i.test(name) &&
    !isWarmup
  ) {
    const explicitTime = /\b\d+(?:\.\d+)?\s*(?:min|mins|minutes|sec|secs|seconds)\b/i
      .test([ex.reps, ex.weight_guidance].filter(Boolean).join(" "))
    if (!explicitTime) targetDuration = null
  }

  return {
    ...ex,
    name,
    modality: "cardio",
    sets: isInterval ? workBouts : 1,
    reps: "—",
    weight_guidance: effort,
    notes: notesClean,
    target_duration_seconds: targetDuration,
    target_distance: targetDistance,
    distance_unit: distUnit,
    is_interval: isInterval,
    target_splits: targetSplits,
  }
}

function ensureCardioWarmup(
  day: Record<string, unknown>,
  distanceUnit: string,
) {
  const exercises = day.exercises as Array<Record<string, unknown>> | undefined
  if (!exercises?.length) return
  const hasWarmup = exercises.some((e) =>
    /^cardio warm-?up$/i.test(String(e.name || "")),
  )
  if (hasWarmup) return
  const needsWarmup = exercises.some((e) => {
    const name = String(e.name || "")
    return (
      e.is_interval === true ||
      /interval/i.test(name) ||
      /^tempo run$/i.test(name)
    )
  })
  if (!needsWarmup) return
  const unit = distanceUnit === "km" ? "km" : "mi"
  exercises.unshift(
    normalizeCardioExercise(
      {
        name: "Cardio Warm-up",
        modality: "cardio",
        sets: 1,
        reps: "—",
        weight_guidance: "easy",
        notes: "",
        target_duration_seconds: 600,
        target_distance: null,
        distance_unit: unit,
        is_interval: false,
        target_splits: null,
      },
      {
        name: "Cardio Warm-up",
        modality: "cardio",
        typically_interval: false,
      },
      unit,
    ),
  )
}

function normalizeProgramCardio(
  program: Record<string, unknown>,
  catalog: CatalogEntry[],
  distanceUnit: string,
) {
  const byNorm = new Map(catalog.map((e) => [normName(e.name), e]))
  const unit = distanceUnit === "km" ? "km" : "mi"
  const weeks = program.weeks as Array<Record<string, unknown>>
  for (const week of weeks || []) {
    for (const day of (week.days as Array<Record<string, unknown>>) || []) {
      const exercises = (day.exercises as Array<Record<string, unknown>>) || []
      day.exercises = exercises.map((ex) => {
        const catalogEx = byNorm.get(normName(String(ex.name || ""))) ?? null
        return normalizeCardioExercise(ex, catalogEx, unit)
      })
      ensureCardioWarmup(day, unit)
    }
  }
  return program
}

function validateProgram(
  program: unknown,
  opts: { expectSingleWeek: boolean; expectedWeekNumber?: number },
): program is {
  program_name: string
  duration_weeks: number
  weeks: Array<{
    week_number: number
    days: Array<{
      day_number: number
      focus: string
      exercises: Array<{
        name: string
        sets: number
        reps: string
        weight_guidance: string
        notes?: string
      }>
    }>
  }>
} {
  if (!program || typeof program !== "object") return false
  const p = program as Record<string, unknown>
  if (typeof p.program_name !== "string") return false
  if (typeof p.duration_weeks !== "number") return false
  if (!Array.isArray(p.weeks) || p.weeks.length === 0) return false

  if (opts.expectSingleWeek) {
    if (p.weeks.length !== 1) return false
    if (p.duration_weeks !== 1) return false
  }

  for (const week of p.weeks) {
    if (!week || typeof week !== "object") return false
    const w = week as Record<string, unknown>
    if (typeof w.week_number !== "number") return false
    if (
      opts.expectedWeekNumber != null &&
      w.week_number !== opts.expectedWeekNumber
    ) {
      return false
    }
    if (!Array.isArray(w.days) || w.days.length === 0) return false

    for (const day of w.days) {
      if (!day || typeof day !== "object") return false
      const d = day as Record<string, unknown>
      if (typeof d.day_number !== "number") return false
      if (typeof d.focus !== "string") return false
      if (!Array.isArray(d.exercises) || d.exercises.length === 0) return false

      for (const ex of d.exercises) {
        if (!ex || typeof ex !== "object") return false
        const e = ex as Record<string, unknown>
        if (typeof e.name !== "string" || !e.name.trim()) return false
        if (typeof e.sets !== "number") return false
        if (e.reps != null && typeof e.reps !== "string") return false
        if (e.weight_guidance != null && typeof e.weight_guidance !== "string") {
          return false
        }
        if (e.modality != null && e.modality !== "strength" && e.modality !== "cardio") {
          return false
        }
        if (e.modality === "cardio") {
          if (e.is_interval === true) {
            if (!Array.isArray(e.target_splits) || e.target_splits.length === 0) {
              return false
            }
          } else {
            const hasDuration =
              e.target_duration_seconds != null &&
              Number.isFinite(Number(e.target_duration_seconds))
            const hasDistance =
              e.target_distance != null &&
              Number.isFinite(Number(e.target_distance))
            if (!hasDuration && !hasDistance) return false
          }
        }
      }
    }
  }

  return true
}

function buildAdditionalContext(body: Record<string, unknown>): string {
  const parts: string[] = []
  const limitations =
    typeof body.limitations === "string" ? body.limitations.trim() : ""
  const notes =
    typeof body.additional_notes === "string"
      ? body.additional_notes.trim()
      : ""
  if (limitations) parts.push(limitations)
  if (notes) parts.push(notes)
  // Deduplicate exact duplicates if the user pasted the same text twice.
  const unique = [...new Set(parts)]
  return unique.length > 0 ? unique.join("\n") : "none"
}

function buildAthleteContext(body: Record<string, unknown>): string {
  const age =
    typeof body.age === "number" && Number.isFinite(body.age)
      ? String(body.age)
      : typeof body.age === "string" && body.age.trim()
        ? body.age.trim()
        : "unspecified"
  const unit =
    body.bodyweight_unit === "kg" || body.bodyweight_unit === "lb"
      ? body.bodyweight_unit
      : "lb"
  let bodyweight = "unspecified"
  if (
    (typeof body.bodyweight === "number" && Number.isFinite(body.bodyweight)) ||
    (typeof body.bodyweight === "string" &&
      body.bodyweight.trim() &&
      Number.isFinite(Number(body.bodyweight)))
  ) {
    bodyweight = `${body.bodyweight} ${unit}`
  }
  const session =
    typeof body.session_length === "string" && body.session_length.trim()
      ? body.session_length.trim()
      : "unspecified"

  return `Age: ${age}
Bodyweight: ${bodyweight}
Session length: ${session}`
}

function buildLibraryBlock(body: Record<string, unknown>): string {
  if (Array.isArray(body.exercise_catalog) && body.exercise_catalog.length > 0) {
    return `Exercise library (use these names only; modality/typically_interval/equipment_required included):
${JSON.stringify(body.exercise_catalog)}`
  }
  if (Array.isArray(body.exercise_names) && body.exercise_names.length > 0) {
    return `Prefer exercise names from this library when possible (use exact spelling): ${body.exercise_names.join(", ")}`
  }
  return ""
}

function buildInitialUserPrompt(body: Record<string, unknown>): string {
  const {
    goal,
    experience_level,
    days_per_week,
    equipment,
  } = body
  const distanceUnit =
    body.distance_unit === "km" || body.distance_unit === "mi"
      ? body.distance_unit
      : "mi"

  let userPrompt = `Generate a 1-week program for a ${experience_level} athlete.
Goal: ${goal}
Training days per week: ${days_per_week}
Equipment access: ${equipment}
Distance unit preference: ${distanceUnit}
${buildAthleteContext(body)}
Additional context from user: ${buildAdditionalContext(body)}

Calibrate starting weight_guidance using age and bodyweight for strength work. For cardio, prescribe distances/paces in ${distanceUnit}. Keep each day realistically completable within the stated session length. If the goal is cardio or an endurance event, build a true endurance-biased week with periodization (long session + easy days + interval when appropriate).`

  const library = buildLibraryBlock(body)
  if (library) userPrompt += `\n\n${library}`

  return userPrompt
}

function buildAdaptiveUserPrompt(body: Record<string, unknown>): string {
  const {
    goal,
    experience_level,
    days_per_week,
    equipment,
    exercise_names,
    next_week_number,
    prior_week_program,
    exercise_performance,
  } = body

  const distanceUnit =
    body.distance_unit === "km" || body.distance_unit === "mi"
      ? body.distance_unit
      : "mi"

  let userPrompt = `Adapt next week's training (week_number ${next_week_number}) for a ${experience_level} athlete.
Goal: ${goal}
Training days per week: ${days_per_week}
Equipment access: ${equipment}
Distance unit preference: ${distanceUnit}
${buildAthleteContext(body)}
Additional context from user: ${buildAdditionalContext(body)}

Prior week program (adapt from this structure — do not redesign from scratch):
${JSON.stringify(prior_week_program, null, 2)}

Per-exercise performance and REQUIRED decisions (apply each decision). For interval cardio, interval_hit_rate and late_split_fade summarize split pace adherence vs targets:
${JSON.stringify(exercise_performance, null, 2)}

Reminder: decision "substitute" requires using substitute_to exactly (vetted table, same modality). decision "skip" means omit/deload — do not invent a same-tag replacement. Keep session length, age/bodyweight, and ${distanceUnit} distances in mind when adjusting loads or interval paces.`

  void exercise_names
  const library = buildLibraryBlock(body)
  if (library) userPrompt += `\n\n${library}`

  return userPrompt
}

const PROPOSE_SYSTEM_PROMPT = `You are a certified strength coach proposing ONE safer substitute for an exercise that had to be skipped because every vetted alternate still carried the same contraindication risk.

Rules:
- Output ONLY valid JSON. No markdown, no code fences, no extra text.
- Propose a genuinely lower-strain alternative for the stated movement pattern that does NOT retain every contraindication tag of the primary exercise.
- Prefer an existing library exercise name (exact spelling) when a good option exists.
- Only invent a new exercise name if nothing in the library is appropriate.
- reason_tag must be one of: lower_joint_strain, equipment_alt, similar_pattern, controlled_load.
- Never re-propose a pairing listed in previously_rejected.
- Do not propose the primary exercise itself.

Output schema:
{
  "reason_tag": "string",
  "reasoning": "string — concise clinical/coaching explanation",
  "substitute_exercise_name": "string or null — existing library name if using one",
  "proposed_new_exercise_name": "string or null — only if inventing a new exercise"
}`

function validateProposal(proposal: unknown): proposal is {
  reason_tag: string
  reasoning: string
  substitute_exercise_name: string | null
  proposed_new_exercise_name: string | null
} {
  if (!proposal || typeof proposal !== "object") return false
  const p = proposal as Record<string, unknown>
  if (typeof p.reason_tag !== "string" || !p.reason_tag.trim()) return false
  if (typeof p.reasoning !== "string" || !p.reasoning.trim()) return false

  const existing =
    p.substitute_exercise_name == null
      ? null
      : typeof p.substitute_exercise_name === "string"
        ? p.substitute_exercise_name.trim() || null
        : null
  const neu =
    p.proposed_new_exercise_name == null
      ? null
      : typeof p.proposed_new_exercise_name === "string"
        ? p.proposed_new_exercise_name.trim() || null
        : null

  if (!existing && !neu) return false
  // Normalize onto the object for callers
  ;(p as Record<string, unknown>).substitute_exercise_name = existing
  ;(p as Record<string, unknown>).proposed_new_exercise_name = existing
    ? null
    : neu
  return true
}

function buildProposeUserPrompt(body: Record<string, unknown>): string {
  const primary = body.primary_exercise ?? {}
  const rejected = Array.isArray(body.previously_rejected)
    ? body.previously_rejected
    : []
  const names = Array.isArray(body.exercise_names) ? body.exercise_names : []

  return `Propose one safer substitute for this skipped exercise.

Primary exercise:
${JSON.stringify(primary, null, 2)}

User equipment access: ${body.equipment ?? "unknown"}
Pain note (if any): ${body.pain_note ?? "none"}

Previously rejected pairings (do not re-propose unless clearly different circumstances):
${JSON.stringify(rejected, null, 2)}

Exercise library (prefer these exact names when suitable):
${names.join(", ")}`
}

async function callAnthropic(
  apiKey: string,
  system: string,
  userPrompt: string,
  maxTokens = 2000,
) {
  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userPrompt }],
    }),
  })

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text()
    console.error("Anthropic error:", anthropicRes.status, errText)
    return { error: "couldn't generate program, try again", status: 502 }
  }

  const anthropicJson = await anthropicRes.json()
  const rawText =
    anthropicJson?.content
      ?.filter((block: { type: string }) => block.type === "text")
      ?.map((block: { text: string }) => block.text)
      ?.join("\n") ?? ""

  if (!rawText) {
    return { error: "couldn't generate program, try again", status: 502 }
  }

  try {
    return { data: JSON.parse(stripCodeFences(rawText)) }
  } catch (parseErr) {
    console.error("JSON parse failed:", parseErr, rawText.slice(0, 500))
    return { error: "couldn't generate program, try again", status: 502 }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  try {
    const body = await req.json()
    const mode =
      body?.mode === "adaptive"
        ? "adaptive"
        : body?.mode === "propose-substitution"
          ? "propose-substitution"
          : "initial"

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
    if (!apiKey) {
      return jsonResponse(
        { error: "ANTHROPIC_API_KEY secret is not configured" },
        500,
      )
    }

    if (mode === "propose-substitution") {
      if (!body?.primary_exercise?.name) {
        return jsonResponse(
          { error: "propose-substitution requires primary_exercise" },
          400,
        )
      }

      const result = await callAnthropic(
        apiKey,
        PROPOSE_SYSTEM_PROMPT,
        buildProposeUserPrompt(body),
        1500,
      )
      if (result.error) {
        return jsonResponse({ error: result.error }, result.status ?? 502)
      }

      if (!validateProposal(result.data)) {
        console.error(
          "Proposal failed validation:",
          JSON.stringify(result.data).slice(0, 500),
        )
        return jsonResponse(
          { error: "couldn't generate proposal, try again" },
          502,
        )
      }

      return jsonResponse({ proposal: result.data })
    }

    const {
      goal,
      experience_level,
      days_per_week,
      equipment,
    } = body ?? {}

    if (!goal || !experience_level || !days_per_week || !equipment) {
      return jsonResponse(
        {
          error:
            "Missing required fields: goal, experience_level, days_per_week, equipment",
        },
        400,
      )
    }

    if (mode === "adaptive") {
      if (
        body.next_week_number == null ||
        !body.prior_week_program ||
        !Array.isArray(body.exercise_performance)
      ) {
        return jsonResponse(
          {
            error:
              "Adaptive mode requires next_week_number, prior_week_program, exercise_performance",
          },
          400,
        )
      }
    }

    const system =
      mode === "adaptive" ? ADAPTIVE_SYSTEM_PROMPT : INITIAL_SYSTEM_PROMPT
    const userPrompt =
      mode === "adaptive"
        ? buildAdaptiveUserPrompt(body)
        : buildInitialUserPrompt(body)

    const result = await callAnthropic(apiKey, system, userPrompt, 8000)
    if (result.error) {
      return jsonResponse({ error: result.error }, result.status ?? 502)
    }

    const program = result.data

    // Normalize week_number for adaptive if model drifts slightly.
    if (
      mode === "adaptive" &&
      program?.weeks?.[0] &&
      typeof body.next_week_number === "number"
    ) {
      program.weeks[0].week_number = body.next_week_number
      program.duration_weeks = 1
    }
    if (mode === "initial" && program?.weeks?.[0]) {
      program.weeks[0].week_number = 1
      program.duration_weeks = 1
    }

    const distanceUnit =
      body.distance_unit === "km" || body.distance_unit === "mi"
        ? body.distance_unit
        : "mi"
    const catalog: CatalogEntry[] = Array.isArray(body.exercise_catalog)
      ? (body.exercise_catalog as CatalogEntry[]).filter(
          (e) => e && typeof e.name === "string",
        )
      : []
    if (program && typeof program === "object") {
      normalizeProgramCardio(
        program as Record<string, unknown>,
        catalog,
        distanceUnit,
      )
    }

    const valid = validateProgram(program, {
      expectSingleWeek: true,
      expectedWeekNumber:
        mode === "adaptive" ? Number(body.next_week_number) : 1,
    })

    if (!valid) {
      console.error("Program failed validation:", JSON.stringify(program).slice(0, 500))
      return jsonResponse(
        { error: "couldn't generate program, try again" },
        502,
      )
    }

    return jsonResponse({ program })
  } catch (err) {
    console.error("generate-program failed:", err)
    return jsonResponse(
      { error: "couldn't generate program, try again" },
      500,
    )
  }
})
