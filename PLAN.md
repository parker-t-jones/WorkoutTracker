# Workout App — Build Plan (v1, 1-week scope)

## Overview

A gym-tracking app (TrueCoach-style) for personal/family use, with an AI agent
that generates workout programs and schedules them for the user to complete.

**Guiding principle for v1:** ship a working core in one week. Adaptive AI
logic, the family leaderboard, and the substitution engine are real features
but are explicitly deferred to v2 — see "Deferred to v2" section at the
bottom. Do not try to build a scaled-down version of everything at once.

**Assumed stack** (adjust if you have a preference already): React + Tailwind
for frontend, Supabase (Postgres + auth) for backend — chosen for speed of
setup over a custom Node/Express backend, given the one-week target.

---

## Data model (v1 scope)

```sql
users
  id, name, goal, experience_level, days_per_week, equipment_access, limitations

exercises
  id, name, movement_pattern, muscle_group  -- flat seed list, ~30-40 exercises, no substitution logic yet

workouts
  id, user_id, week_number, day_number, focus

scheduled_workouts
  id, workout_id, user_id, date, status  -- status: pending | completed

workout_exercises
  id, workout_id, exercise_id, sets, reps, weight_guidance, notes

logs
  id, workout_exercise_id, user_id, set_number, actual_reps, actual_weight, completed_at
```

Keep this flat. No substitution table, no leaderboard tables, no adaptation
tables in v1 — those come in v2 once there's real logging data to build on.

---

## Build order

### Day 1 — Data model + skeleton (no AI yet)
- Set up tables above in Supabase.
- Seed `exercises` with ~30-40 common movements (flat list, no tagging needed yet).
- Build basic screens with hardcoded/dummy data: calendar view, workout detail
  view, log-a-set input.
- Goal: navigable app before AI enters the picture, so later bugs are never
  ambiguous between "UI bug" and "AI bug."

### Day 2 — Onboarding form + AI program generation
- Build the 5-question onboarding form (see below).
- Wire up a single AI call using the system/user prompts below.
- Parse the returned JSON directly into `workouts`, `scheduled_workouts`, and
  `workout_exercises`.
- Spend real time testing the prompt (see testing checklist below) — this is
  the highest-risk part of the week.

### Day 3 — Workout logging
- User opens today's scheduled workout, logs actual sets/reps/weight against
  each prescribed exercise, marks the workout complete.
- This needs to feel fast — no one wants to fight a clunky form between sets.

### Day 4 — Progress views
- Simple line chart: weight progression per lift over time.
- A basic completion/adherence stat (workouts completed ÷ scheduled).
- Even minimal charts here are what make this feel like more than a to-do list.

### Day 5 — Polish + real-world test
- Actually use the app for a real workout — yourself and one family member.
- Fix whatever breaks; this surfaces rough edges faster than reading code does.

### Days 6-7 — Buffer
- Reserve for AI prompt output issues (weird formatting, occasional garbage
  sets/reps) — this is the most likely place to lose unplanned time.

---

## Onboarding form (5 questions)

1. **Goal** — strength / hypertrophy / general fitness
2. **Experience level** — beginner / intermediate / advanced
3. **Days per week available** — becomes the weekly schedule directly
4. **Equipment access** — home gym / commercial gym / dumbbells only / bodyweight only
5. **Injury or limitation flags** — free text for v1 (e.g. "bad left knee");
   the AI takes it as a prompt constraint since structured contraindication
   tagging doesn't exist yet in v1

---

## AI program generation

### System prompt

```
You are a certified strength coach generating a structured training program.

Rules:
- Output ONLY valid JSON. No markdown formatting, no code fences, no explanation text before or after.
- Every exercise must be appropriate for the stated equipment access. Never include an exercise requiring unavailable equipment.
- If an injury or limitation is mentioned, avoid exercises that load that area directly, and note the substitution logic in the "notes" field for that exercise.
- Vary exercise selection and set/rep schemes across the week according to the stated goal (strength = lower reps/higher intensity, hypertrophy = moderate reps/higher volume, general fitness = balanced, moderate everything).
- Each training day should target different or complementary muscle groups than the day before it — do not repeat the same primary movement pattern on consecutive scheduled days unless the split explicitly calls for it (e.g. upper/lower).
- Beginner programs: fewer exercises per day (4-6), simpler movements, more rest guidance. Advanced programs: more exercises (6-9), more complex/compound movements.

Output must match this exact JSON schema:
{
  "program_name": "string",
  "duration_weeks": number,
  "weeks": [
    {
      "week_number": number,
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
}
```

### User prompt (built from onboarding form each time)

```
Generate a 4-week program for a {level} lifter.
Goal: {goal}
Training days per week: {days_per_week}
Equipment access: {equipment}
Injuries or limitations: {limitations, or "none"}
```

### Why it's structured this way

- The "no markdown/code fences" instruction matters because models default to
  wrapping JSON in ```json fences — keep a fence-stripping fallback in error
  handling regardless: `text.replace(/```json|```/g, '')`.
- The "don't repeat movement patterns on consecutive days" rule is the
  highest-leverage line for making output feel like real programming instead
  of a random exercise picker.
- `weight_guidance` is a descriptive string, not a hard number, because there's
  no baseline strength data yet on a new user (no prior logs) — a hard number
  would just be a guess.

### Testing checklist (30-60 min, before trusting it)

- Run with all 3 experience levels × at least 2 equipment types (bodyweight-only
  and full gym) — 6 calls minimum, actually read the output.
- Run once with a limitation filled in ("bad left knee") and manually verify
  it didn't sneak in a knee-loading exercise (e.g. walking lunges, box jumps).
- Wrap `JSON.parse` in try/catch with a clear UI error state ("couldn't
  generate program, try again") rather than a silent crash — this will happen
  occasionally no matter how good the prompt is.

---

## Deferred to v2 (do not build in week one)

These are fully designed but assume a working core already exists to build on:

- **Auth + multi-user support (prerequisite for the leaderboard)** — v1 was
  built for a single implicit user with no login flow. Before the family
  leaderboard can work, the app needs to actually distinguish between family
  members. Use Supabase Auth (already on Supabase, no new vendor):
  - Add a login/signup screen (email + password, or magic link, is simplest)
  - Each `users` row gets tied to a real `auth.uid()` instead of a hardcoded
    test user
  - Re-enable Row Level Security once auth exists, with policies scoped to
    `auth.uid()` so one family member can't query another's private logs
    (e.g. `using (auth.uid() = user_id)` on `logs`, `scheduled_workouts`, etc.)
  - The leaderboard's shared "family_stats" view is the one thing that should
    be readable across users; raw workout logs stay private per person
  - This should be built and verified before the leaderboard itself

- **PWA installability** — makes the app installable to a phone home screen
  (icon, full-screen, no browser chrome) without needing app store
  distribution. Low effort relative to value:
  - Add a web app manifest (`manifest.json`) with app name, icons, theme color
  - Add a minimal service worker for basic offline/caching support
  - Verify "Add to Home Screen" works correctly on both iOS Safari and
    Android Chrome
  - Full native App Store / Google Play distribution (via Capacitor or a
    native rewrite) is a much larger lift — developer accounts, app review,
    two build pipelines — and is not planned unless the PWA proves
    insufficient after real use. If wanted later purely for internal family
    use, TestFlight (iOS) or Google Play's internal testing track (Android)
    avoid public review entirely.

- **Adaptive weekly AI logic** — reviewing logged performance (completion
  rate, load trend, RPE, pain flags) to progress, hold, or reduce next week's
  program, with pain/injury flags acting as a hard override before any
  performance-based adjustment runs.
- **Exercise library substitution engine** — structured `contraindication_tags`
  and a pre-built `SUBSTITUTIONS` table so in-session swaps (equipment
  unavailable, pain flagged) are safe retrieval from a vetted shortlist, not
  live AI improvisation.
- **AI-proposed substitutions with human review** — AI proposes new
  substitution pairings with reasoning into a `PROPOSED_SUBSTITUTIONS` table;
  user approves or rejects before anything reaches a live workout. Rejections
  should be stored so the AI doesn't re-propose the same bad pairing.
- **Family leaderboard** — weekly and monthly views based on completion rate,
  not raw counts, so a 4-day and 6-day split are directly comparable:
  - `combined score = (workout completion rate × 0.6) + (exercise completion rate × 0.4)`
  - "scheduled" should mean the *current* version of the plan (post any AI
    adjustment), so adaptation doesn't unfairly tank someone's rate
  - monthly leaderboard = average of that person's weekly rates across the month
  - tiebreaker = current streak