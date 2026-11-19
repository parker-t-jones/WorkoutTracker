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

All SQL is applied by hand in the Supabase **SQL editor**. Run in this order
(every file is safe to re-run):

| # | File | What it does |
|---|------|--------------|
| 1 | `supabase/schema.sql` | Base tables (fresh DB already includes cardio + onboarding columns) |
| 2 | `supabase/seed.sql` | ~38 strength exercises (+ equipment / contraindication tags) |
| 3 | `supabase/seed-substitutions.sql` | Ranked `substitutions` catalog (**deletes and re-seeds** all rows, including ones approved in the app) |
| 4 | `supabase/logs-rpe-pain.sql` | *Older DBs only:* RPE / pain columns on `logs` |
| 5 | `supabase/exercises-substitutions.sql` | *Older DBs only:* exercise metadata columns + `substitutions` table |
| 6 | `supabase/proposed-substitutions.sql` | *Older DBs only:* AI proposal review queue |
| 7 | `supabase/onboarding-fields.sql` | *Older DBs only:* age / bodyweight / session length / notes on `users` |
| 8 | `supabase/cardio.sql` | Cardio columns, `log_splits`, cardio exercise library + cardio substitutions |
| 9 | `supabase/auth.sql` | Auth FK + RLS on all tables (see **Auth** below — run after signing up) |
| 10 | `supabase/leaderboard.sql` | `family_leaderboard` RPC |
| 11 | `supabase/coach_mode.sql` | Coach/athlete links, coach RLS, custom exercises, templates |
| 12 | `supabase/2026-11-hardening.sql` | Security hardening (coach invite RPCs, `is_coach` guard, admin-only catalog writes, leaderboard groups + streak fix, `ensure_shared_exercise`, `logs.weight_unit`, coach demo media table + `exercise-media` storage bucket) |

**Always run `2026-11-hardening.sql` last.** If you ever re-run an older file
(especially `auth.sql`, `coach_mode.sql`, `exercises-substitutions.sql`,
`proposed-substitutions.sql` or `leaderboard.sql`), re-run
`2026-11-hardening.sql` afterwards — the older files recreate looser policies
and the old (unscoped) leaderboard function.

The first run of `2026-11-hardening.sql` creates a **Family** leaderboard
group containing every existing user, so the leaderboard looks the same as
before. New users only see themselves until they join a group with a join
code (Leaderboard tab → *Your groups*).

### Granting coach and admin

Neither can be self-granted from the app; run these in the SQL editor.

Make someone a **coach** (a trigger blocks `is_coach` changes from the API):

```sql
update public.users set is_coach = true where id = '<user uuid>';
-- look up the uuid by email:
-- select id from auth.users where email = 'someone@example.com';
```

Make someone an **admin** (may approve/reject substitution proposals and
write the shared `substitutions` catalog):

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'
where email = 'you@example.com';
```

Then **sign out and back in** — the role is read from the session JWT.

### Verify isolation

Run in the SQL editor with two real test accounts A and B (both signed up and
onboarded). Each block impersonates a user and rolls back, so nothing changes.

```sql
-- As user A
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"<A uuid>","role":"authenticated"}', true);

-- 1. No rows belonging to anyone else (all should be 0)
select
  (select count(*) from workouts           where user_id <> '<A uuid>') as workouts,
  (select count(*) from scheduled_workouts where user_id <> '<A uuid>') as scheduled,
  (select count(*) from logs               where user_id <> '<A uuid>') as logs,
  (select count(*) from users              where id      <> '<A uuid>') as users;

-- 2. Cannot self-grant coach (should return false)
update users set is_coach = true where id = '<A uuid>';
select is_coach from users where id = '<A uuid>';

-- 3. Cannot write the shared catalog unless admin (should ERROR with RLS violation)
insert into substitutions (primary_exercise_id, substitute_exercise_id, reason_tag, priority_rank)
select a.id, b.id, 'test', 99 from exercises a, exercises b where a.id <> b.id limit 1;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"<A uuid>","role":"authenticated"}', true);
-- 4. Cannot touch coach links directly (should be "UPDATE 0")
update coach_athletes set status = 'active';
-- 5. Leaderboard shows only A + people sharing a group with A
select user_id, name from family_leaderboard();
rollback;

-- 6. Anonymous key sees nothing (should be 0)
begin;
set local role anon;
select count(*) from workouts;
rollback;
```

Repeat with B's uuid. For coach access: make A a coach, `select
invite_athlete_by_email('<B email>')` as A, `select
respond_to_coach_invite('<id>', true)` as B, confirm A now sees B's workouts;
then `select end_coach_relationship('<id>')` and confirm A sees 0 of B's rows
again. Also confirm the edge function returns **401** when called with only
the anon key:

```bash
curl -i -X POST "https://<ref>.supabase.co/functions/v1/generate-program" \
  -H "Authorization: Bearer <anon key>" -H "Content-Type: application/json" -d '{}'
```

### Coach mode & exercise demos

Coaches can upload photos/videos (or paste YouTube/Vimeo/other links) that
show athletes how to do an exercise — TrueCoach-style. Everything below needs
`supabase/2026-11-hardening.sql` (section 9 creates the `exercise_media` table
and the private `exercise-media` storage bucket + its policies).

**Make a coach.** See *Granting coach and admin* above (`update public.users
set is_coach = true …`), then have them reload the app — a **Coach** tab
appears. A coach who doesn't train with the app lands on the Coach tab
instead of onboarding.

**Invite flow.**
1. The athlete signs up and opens the app once (so a `public.users` row exists).
2. Coach → **Coach** tab → *Invite an athlete* → their email.
3. Athlete → **Account** → *Coach* card → **Accept** (or Decline).
4. Coach taps the athlete → schedule (upcoming + recent, read-only) → a
   workout → each exercise shows the prescription, what the athlete logged
   (sets, RPE, "felt off") and a **Demo media** manager.
5. Either side can end it (coach: *End* on the athlete; athlete: *End
   coaching*). Access to workouts, logs **and** demo media stops immediately.
   A coach can re-invite an ended athlete; they must accept again.

**Demo scope.** When adding media the coach picks:
- *Just this workout* — attached to that one prescribed exercise
  (`workout_exercise_id`); only that athlete sees it.
- *Use for every athlete when I assign this exercise* — the coach's default
  demo for the exercise (`exercise_id`); shown wherever any of their
  **active** athletes has that exercise. Workout-specific items show first.

Athletes see a **Watch demo** chip on the workout screen and a collapsible
**How to do it** section on the strength logging screen. Media loads lazily
per workout; if the migration hasn't been run, the app simply shows no media.

**Limits (Supabase free plan).** 1 GB total file storage and **50 MB per
file** (the bucket enforces 50 MB and image/jpeg, png, webp, gif, heic +
video/mp4, quicktime, webm). A minute of phone video is often 50–150 MB, so
for anything longer than a short clip upload it to YouTube (unlisted), Vimeo
or Google Drive and use **Add link** — YouTube/Vimeo play inside the app
(youtube-nocookie / player.vimeo embeds); other links open in a new tab.
HEIC photos and HEVC `.mov` videos only display in Safari; the viewer shows
an "Open" fallback elsewhere. Files are private: the app uses signed URLs
that expire after an hour.

Deleting a demo in the app also deletes its file. Files whose row was removed
by a cascade (athlete/workout/exercise deleted) are not auto-deleted —
clean them up occasionally in Dashboard → Storage → `exercise-media`
(folder name = coach's user id).

**Verify media isolation** (SQL editor, same impersonation pattern as
*Verify isolation*; use coach A, coach B, athlete C of A, unrelated athlete
D, and an athlete E whose link with A was ended):

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"<uuid>","role":"authenticated"}', true);
select coach_id, exercise_id, workout_exercise_id, kind from exercise_media;
select name from storage.objects where bucket_id = 'exercise-media';
rollback;
```

- [ ] Coach A sees only rows with `coach_id = A`; coach B sees none of A's.
- [ ] Athlete C sees A's exercise-level rows + A's rows on C's own workouts,
      and only objects under `A/…`.
- [ ] Athletes D and E (and anyone with a *pending* invite from A) see 0 of
      A's rows and 0 objects under `A/…`.
- [ ] As A, `insert into exercise_media (coach_id, workout_exercise_id, kind,
      external_url) values ('<A>', '<a workout_exercise of D or E>', 'link',
      'https://x.com')` fails with a row-level security error.
- [ ] As C (not a coach), inserting into `exercise_media` or uploading to
      `exercise-media` fails.
- [ ] `set local role anon; select count(*) from exercise_media;` → permission
      denied; `storage.objects` → 0 rows.
- [ ] In the app: end the relationship as C, reopen the workout → demos gone;
      a previously copied signed URL keeps working until it expires (≤1 h).

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

3. Deploy the function (redeploy after any change to `supabase/functions/`):

```bash
supabase functions deploy generate-program
```

The function rejects requests that aren't from a signed-in user (401).
Optionally override the model with `supabase secrets set ANTHROPIC_MODEL=<model id>`.

4. Restart `npm run dev` and open the app. With no `scheduled_workouts` for your user, the onboarding form appears, calls the Edge Function, and writes **week 1** into `workouts` / `scheduled_workouts` / `workout_exercises`. Later weeks are generated adaptively from logs (RPE, completion, pain flags) via **Generate next week** on the calendar.

### Auth

`public.users.id` **is** `auth.uid()` (no separate `auth_id` column).

1. In the Supabase dashboard, add `http://localhost:5173` (and your production origin) under **Authentication → URL Configuration → Redirect URLs**.
2. Sign up in the app.
3. If you have old test-user workouts/logs, run `supabase/reassign-test-data.sql` (fill in old + new UUIDs) **before** enabling RLS.
4. Run `supabase/auth.sql` to attach the auth FK and enable RLS on every table.
5. Continue with the remaining files in the migration table above
   (`leaderboard.sql`, `coach_mode.sql`, then `2026-11-hardening.sql`).
