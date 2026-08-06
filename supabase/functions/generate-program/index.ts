// Supabase Edge Function: generate-program
// Calls Anthropic with PLAN.md prompts; returns validated program JSON.
// Secret: ANTHROPIC_API_KEY (set via `supabase secrets set`, never in client env)
// Modes: "initial" (1 week from onboarding) | "adaptive" (next week from prior performance)

import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const INITIAL_SYSTEM_PROMPT = `You are a certified strength coach generating a structured training program.

Rules:
- Output ONLY valid JSON. No markdown formatting, no code fences, no explanation text before or after.
- Generate exactly ONE week of training (duration_weeks: 1, weeks array length 1).
- Every exercise must be appropriate for the stated equipment access. Never include an exercise requiring unavailable equipment.
- If an injury or limitation is mentioned, avoid exercises that load that area directly, and note the substitution logic in the "notes" field for that exercise.
- Vary exercise selection and set/rep schemes across the week according to the stated goal (strength = lower reps/higher intensity, hypertrophy = moderate reps/higher volume, general fitness = balanced, moderate everything).
- Each training day should target different or complementary muscle groups than the day before it — do not repeat the same primary movement pattern on consecutive scheduled days unless the split explicitly calls for it (e.g. upper/lower).
- Beginner programs: fewer exercises per day (4-6), simpler movements, more rest guidance. Advanced programs: more exercises (6-9), more complex/compound movements.

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
          "focus": "string, e.g. 'Upper body push'",
          "exercises": [
            {
              "name": "string",
              "sets": number,
              "reps": "string, e.g. '8-10' or '5'",
              "weight_guidance": "string, e.g. 'moderate, RPE 7' or 'bodyweight'",
              "notes": "string, optional, empty string if none"
            }
          ]
        }
      ]
    }
  ]
}`

const ADAPTIVE_SYSTEM_PROMPT = `You are a certified strength coach adapting a lifter's NEXT week of training based on last week's logged performance.

Rules:
- Output ONLY valid JSON. No markdown formatting, no code fences, no explanation text before or after.
- Generate exactly ONE week (duration_weeks: 1, weeks array length 1) with the given week_number.
- Keep the weekly split/focus structure close to the prior week. Do NOT freely redesign the week from scratch.
- Apply each exercise's decision from the performance summary EXACTLY:
  - substitute: SAFETY OVERRIDE — do NOT invent a replacement. Use the provided substitute_to exercise name exactly. Prescribe appropriate sets/reps/weight_guidance for that substitute and note the swap in "notes".
  - skip: SAFETY OVERRIDE — no safe vetted substitute exists. Omit this exercise from the week entirely, OR replace it only with a clearly lighter optional accessory that is NOT the same movement under load (prefer omitting). Do not invent a same-pattern heavy substitute. Note the skip in another exercise's notes only if useful; do not keep the painful lift.
  - progress: keep the exercise; bump load slightly via weight_guidance (e.g. +5 lb or slightly higher RPE target).
  - hold: keep the exercise with similar sets/reps/load guidance.
  - reduce_volume: keep the exercise but reduce sets first (fewer sets) before cutting weight in weight_guidance.
- Pain / substitute / skip decisions always win over performance-based progression.
- Never invent substitute exercise names when substitute_to is provided — use that name verbatim.
- Every exercise must fit the stated equipment access.
- Prefer exercise names from the provided library when possible (exact spelling).

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
            {
              "name": "string",
              "sets": number,
              "reps": "string",
              "weight_guidance": "string",
              "notes": "string"
            }
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
        if (typeof e.reps !== "string") return false
        if (typeof e.weight_guidance !== "string") return false
      }
    }
  }

  return true
}

function buildInitialUserPrompt(body: Record<string, unknown>): string {
  const {
    goal,
    experience_level,
    days_per_week,
    equipment,
    limitations,
    exercise_names,
  } = body

  let userPrompt = `Generate a 1-week program for a ${experience_level} lifter.
Goal: ${goal}
Training days per week: ${days_per_week}
Equipment access: ${equipment}
Injuries or limitations: ${
    typeof limitations === "string" && limitations.trim()
      ? limitations.trim()
      : "none"
  }`

  if (Array.isArray(exercise_names) && exercise_names.length > 0) {
    userPrompt += `

Prefer exercise names from this library when possible (use exact spelling): ${exercise_names.join(", ")}`
  }

  return userPrompt
}

function buildAdaptiveUserPrompt(body: Record<string, unknown>): string {
  const {
    goal,
    experience_level,
    days_per_week,
    equipment,
    limitations,
    exercise_names,
    next_week_number,
    prior_week_program,
    exercise_performance,
  } = body

  let userPrompt = `Adapt next week's training (week_number ${next_week_number}) for a ${experience_level} lifter.
Goal: ${goal}
Training days per week: ${days_per_week}
Equipment access: ${equipment}
Injuries or limitations: ${
    typeof limitations === "string" && limitations.trim()
      ? limitations.trim()
      : "none"
  }

Prior week program (adapt from this structure — do not redesign from scratch):
${JSON.stringify(prior_week_program, null, 2)}

Per-exercise performance and REQUIRED decisions (apply each decision):
${JSON.stringify(exercise_performance, null, 2)}

Reminder: decision "substitute" requires using substitute_to exactly (vetted table). decision "skip" means omit/deload — do not invent a same-tag replacement.`

  if (Array.isArray(exercise_names) && exercise_names.length > 0) {
    userPrompt += `

Prefer exercise names from this library when possible (use exact spelling): ${exercise_names.join(", ")}`
  }

  return userPrompt
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
    const mode = body?.mode === "adaptive" ? "adaptive" : "initial"
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

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
    if (!apiKey) {
      return jsonResponse(
        { error: "ANTHROPIC_API_KEY secret is not configured" },
        500,
      )
    }

    const system =
      mode === "adaptive" ? ADAPTIVE_SYSTEM_PROMPT : INITIAL_SYSTEM_PROMPT
    const userPrompt =
      mode === "adaptive"
        ? buildAdaptiveUserPrompt(body)
        : buildInitialUserPrompt(body)

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 8000,
        system,
        messages: [{ role: "user", content: userPrompt }],
      }),
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      console.error("Anthropic error:", anthropicRes.status, errText)
      return jsonResponse(
        { error: "couldn't generate program, try again" },
        502,
      )
    }

    const anthropicJson = await anthropicRes.json()
    const rawText =
      anthropicJson?.content
        ?.filter((block: { type: string }) => block.type === "text")
        ?.map((block: { text: string }) => block.text)
        ?.join("\n") ?? ""

    if (!rawText) {
      return jsonResponse(
        { error: "couldn't generate program, try again" },
        502,
      )
    }

    let program
    try {
      program = JSON.parse(stripCodeFences(rawText))
    } catch (parseErr) {
      console.error("JSON parse failed:", parseErr, rawText.slice(0, 500))
      return jsonResponse(
        { error: "couldn't generate program, try again" },
        502,
      )
    }

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
