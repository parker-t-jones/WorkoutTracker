# Workout Tracker

Personal gym-tracking app (see `PLAN.md`).

## Setup

```bash
npm install
cp .env.example .env   # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev
```

Use the project URL only (e.g. `https://xxxx.supabase.co`) — no `/rest/v1` suffix.

### Supabase schema

1. Run `supabase/schema.sql` in the SQL editor.
2. Run `supabase/seed.sql` to load ~38 exercises (+ equipment / contraindication tags).
3. Run `supabase/seed-substitutions.sql` for the ranked `substitutions` catalog.
4. If the DB already exists from an older schema, also run:
   - `supabase/logs-rpe-pain.sql` (RPE / pain columns on `logs`)
   - `supabase/exercises-substitutions.sql` (exercise metadata columns + `substitutions` table)
   - `supabase/proposed-substitutions.sql` (AI proposal review queue)

### Day 2 — AI program generation (Edge Function)

The Anthropic API key must live as a **Supabase secret**, never in `.env` or the Vite bundle.

1. Link the CLI to your project (once):

```bash
supabase login
supabase link --project-ref yevcoowbywijhlrhejun
```

2. Set the Anthropic secret:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here
```

3. Deploy the function:

```bash
supabase functions deploy generate-program
```

4. Restart `npm run dev` and open the app. With no `scheduled_workouts` for your user, the onboarding form appears, calls the Edge Function, and writes **week 1** into `workouts` / `scheduled_workouts` / `workout_exercises`. Later weeks are generated adaptively from logs (RPE, completion, pain flags) via **Generate next week** on the calendar.

### Auth

`public.users.id` **is** `auth.uid()` (no separate `auth_id` column).

1. In the Supabase dashboard, add `http://localhost:5173` (and your production origin) under **Authentication → URL Configuration → Redirect URLs**.
2. Sign up in the app.
3. If you have old test-user workouts/logs, run `supabase/reassign-test-data.sql` (fill in old + new UUIDs) **before** enabling RLS.
4. Run `supabase/auth.sql` to attach the auth FK and enable RLS on all 6 tables.
5. Run `supabase/leaderboard.sql` for the family leaderboard RPC (`family_leaderboard`).
