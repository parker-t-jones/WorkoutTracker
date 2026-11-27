-- 2026-11 notes + dumbbell load basis.
-- Run in the Supabase SQL editor AFTER 2026-11-hardening.sql. Safe to re-run.
-- If you re-run an older file, re-run 2026-11-hardening.sql and then this one.
--
-- Sections:
--   1. exercise_notes: one free-form athlete note per prescribed exercise
--      (works before any set is logged; is_pain feeds adaptation like
--      logs.pain_flag does)
--   2. logs.load_basis: what actual_weight means (per dumbbell, total, …)
--   3. Athlete workout editing (AI-trainer athletes swap / add / remove
--      exercises and change set counts): workouts.created_by, a guard that
--      stops athletes editing coach-built workouts, workout_exercises
--      .sort_order and .athlete_edits
--
-- Policies use (select auth.uid()) so the value is computed once per
-- statement instead of once per row.

-- ═════════════════════════════════════════════════════════════════════════
-- 1. exercise_notes
-- ═════════════════════════════════════════════════════════════════════════

create table if not exists public.exercise_notes (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null
    references public.workout_exercises(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  note text not null,
  is_pain boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.exercise_notes drop constraint if exists exercise_notes_note_length;
alter table public.exercise_notes
  add constraint exercise_notes_note_length
  check (char_length(note) between 1 and 1000);

do $migration_guard_exercise_notes_unique$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'exercise_notes_workout_exercise_user_key'
  ) then
    alter table public.exercise_notes
      add constraint exercise_notes_workout_exercise_user_key
      unique (workout_exercise_id, user_id);
  end if;
end
$migration_guard_exercise_notes_unique$;

-- The unique constraint's index leads with workout_exercise_id; the app
-- loads notes by user_id.
create index if not exists idx_exercise_notes_user
  on public.exercise_notes(user_id);

-- updated_at maintenance (also stops clients from back-dating created_at).
create or replace function public.exercise_notes_touch()
returns trigger
language plpgsql
set search_path = public
as $exercise_notes_touch$
begin
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end
$exercise_notes_touch$;

revoke all on function public.exercise_notes_touch() from public, anon, authenticated;

drop trigger if exists exercise_notes_touch on public.exercise_notes;
create trigger exercise_notes_touch
  before insert or update on public.exercise_notes
  for each row execute function public.exercise_notes_touch();

alter table public.exercise_notes enable row level security;
revoke all on public.exercise_notes from anon;
grant select, insert, update, delete on public.exercise_notes to authenticated;

drop policy if exists exercise_notes_select_own on public.exercise_notes;
drop policy if exists exercise_notes_insert_own on public.exercise_notes;
drop policy if exists exercise_notes_update_own on public.exercise_notes;
drop policy if exists exercise_notes_delete_own on public.exercise_notes;
drop policy if exists exercise_notes_select_coach on public.exercise_notes;

-- Athlete: own rows, and only on exercises in their OWN workouts (a coach can
-- write workout_exercises into an athlete's workout, but never notes there).
create policy exercise_notes_select_own on public.exercise_notes
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy exercise_notes_insert_own on public.exercise_notes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = exercise_notes.workout_exercise_id
        and w.user_id = (select auth.uid())
    )
  );

create policy exercise_notes_update_own on public.exercise_notes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = exercise_notes.workout_exercise_id
        and w.user_id = (select auth.uid())
    )
  );

create policy exercise_notes_delete_own on public.exercise_notes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Coach: read-only, only while the relationship is ACTIVE (pending / revoked
-- links see nothing). user_id is always the workout owner (checked above).
create policy exercise_notes_select_coach on public.exercise_notes
  for select to authenticated
  using (public.is_active_coach_of(user_id));

-- ═════════════════════════════════════════════════════════════════════════
-- 2. logs.load_basis
-- ═════════════════════════════════════════════════════════════════════════
-- What actual_weight means for the set. NULL = legacy / unspecified.
-- 'per_dumbbell' = the weight of ONE dumbbell (the app always stores this for
-- dumbbell lifts, even when the athlete typed the total). Existing logs_*
-- RLS policies already cover this column.

alter table public.logs
  add column if not exists load_basis text;

alter table public.logs drop constraint if exists logs_load_basis_check;
alter table public.logs
  add constraint logs_load_basis_check
  check (load_basis is null
    or load_basis in ('per_dumbbell', 'total', 'barbell', 'bodyweight'));

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Athlete workout editing
-- ═════════════════════════════════════════════════════════════════════════
-- Athletes WITHOUT an active coach ("AI trainer") may edit their own
-- workouts: swap / add / remove exercises, change set counts, reorder.
-- The app hides the controls from coached athletes; the guard below is the
-- server-side rule: an athlete can never change the prescription of a
-- workout somebody else (their coach) built. Coaches keep editing their
-- athletes' workouts through the coach_mode.sql policies.

-- 3a. Who built each workout. The default makes coach-built workouts (the
-- coach's client inserts them) record the coach; AI-generated weeks are
-- inserted by the athlete's own client, so they record the athlete.
alter table public.workouts
  add column if not exists created_by uuid;

alter table public.workouts
  alter column created_by set default auth.uid();

do $migration_guard_workouts_created_by_fk$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workouts_created_by_fkey'
  ) then
    alter table public.workouts
      add constraint workouts_created_by_fkey
      foreign key (created_by) references public.users(id) on delete set null;
  end if;
end
$migration_guard_workouts_created_by_fk$;

-- Every workout so far was generated by the athlete's own client.
update public.workouts set created_by = user_id where created_by is null;

-- created_by cannot be forged or changed through the API (an athlete could
-- otherwise claim a coach-built workout and bypass 3c). The SQL editor
-- (auth.role() NULL) and the service key may set it; they fall back to the
-- owner when they leave it empty. When the creator's account is deleted,
-- ON DELETE SET NULL clears it (the workout becomes athlete-owned); that is
-- let through because the old creator no longer exists.
create or replace function public.workouts_guard_created_by()
returns trigger
language plpgsql
set search_path = public
as $workouts_guard_created_by$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
    elsif new.created_by is null and old.created_by is not null
          and not exists (select 1 from public.users u where u.id = old.created_by) then
      null; -- creator deleted: keep the SET NULL
    else
      new.created_by := old.created_by;
    end if;
  elsif tg_op = 'INSERT' and new.created_by is null then
    new.created_by := new.user_id;
  end if;
  return new;
end
$workouts_guard_created_by$;

revoke all on function public.workouts_guard_created_by() from public, anon, authenticated;

drop trigger if exists workouts_guard_created_by on public.workouts;
create trigger workouts_guard_created_by
  before insert or update on public.workouts
  for each row execute function public.workouts_guard_created_by();

-- 3b. Display order + a record of the athlete's own edits.
-- workout_exercises had no order column (the app relied on insertion order,
-- which an UPDATE can shuffle). Backfill from the current physical order,
-- which is still insertion order for rows that were never updated.
alter table public.workout_exercises
  add column if not exists sort_order integer;

update public.workout_exercises we
set sort_order = r.rn
from (
  select id, row_number() over (partition by workout_id order by ctid) as rn
  from public.workout_exercises
) r
where r.id = we.id
  and we.sort_order is null;

-- { "swapped_from": "<original exercise name>", "original_sets": 4,
--   "added": true } — written by the app when an athlete edits; read by
-- adaptation as "the athlete chose this". NULL = untouched prescription.
alter table public.workout_exercises
  add column if not exists athlete_edits jsonb;

alter table public.workout_exercises
  drop constraint if exists workout_exercises_athlete_edits_check;
alter table public.workout_exercises
  add constraint workout_exercises_athlete_edits_check
  check (
    athlete_edits is null
    or (jsonb_typeof(athlete_edits) = 'object'
        and pg_column_size(athlete_edits) <= 2000)
  );

-- New rows without a sort_order go last. Rows inserted earlier by the same
-- multi-row INSERT are visible here, so a generated day keeps its order.
-- SECURITY DEFINER so the max() sees every row of the workout.
create or replace function public.workout_exercises_default_sort_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $workout_exercises_default_sort_order$
begin
  if new.sort_order is null then
    select coalesce(max(we.sort_order), 0) + 1
      into new.sort_order
      from public.workout_exercises we
     where we.workout_id = new.workout_id;
  end if;
  return new;
end
$workout_exercises_default_sort_order$;

revoke all on function public.workout_exercises_default_sort_order() from public, anon, authenticated;

drop trigger if exists workout_exercises_default_sort_order on public.workout_exercises;
create trigger workout_exercises_default_sort_order
  before insert on public.workout_exercises
  for each row execute function public.workout_exercises_default_sort_order();

-- 3c. Edit guard for API writes (auth.role() = 'authenticated').
--   * The workout's OWNER may not insert / change / delete exercises of a
--     workout created_by someone else (their coach, current or former).
--     UPDATEs that change nothing outside v_exempt are allowed (no app code
--     path does one today; list any future non-prescription column there).
--   * Anyone (athlete or coach): no deleting an exercise that has logged
--     sets, no swapping exercise_id under logged sets, no lowering sets below
--     the number already logged, no moving a row to another workout.
-- Cascaded deletes (a workout or account being deleted) are not edits and
-- pass through (pg_trigger_depth() > 1). RLS still decides who may write at
-- all; this only adds restrictions.
create or replace function public.workout_exercises_guard_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $workout_exercises_guard_edit$
declare
  v_uid uuid := auth.uid();
  -- Columns an owner may change on a coach-built workout. Empty today.
  v_exempt text[] := array[]::text[];
  v_workout_id uuid;
  v_owner uuid;
  v_creator uuid;
  v_logged integer;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or v_uid is null then
    return coalesce(new, old);
  end if;
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - v_exempt) = (to_jsonb(old) - v_exempt) then
      return new;
    end if;
    if new.id is distinct from old.id
       or new.workout_id is distinct from old.workout_id then
      raise exception 'An exercise cannot be moved to another workout.'
        using errcode = 'check_violation';
    end if;
  end if;

  v_workout_id := case when tg_op = 'INSERT' then new.workout_id else old.workout_id end;
  select w.user_id, w.created_by into v_owner, v_creator
    from public.workouts w
   where w.id = v_workout_id;

  if v_owner = v_uid and v_creator is not null and v_creator <> v_uid then
    raise exception 'This workout was built by your coach — ask them to change it.'
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  select count(*) into v_logged
    from public.logs l
   where l.workout_exercise_id = old.id;

  if tg_op = 'DELETE' then
    if v_logged > 0 then
      raise exception 'This exercise has logged sets — delete them before removing it.'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if v_logged > 0 and new.exercise_id is distinct from old.exercise_id then
    raise exception 'This exercise has logged sets — it can''t be swapped.'
      using errcode = 'check_violation';
  end if;
  if new.sets < old.sets and new.sets < v_logged then
    raise exception 'Sets can''t go below the % already logged.', v_logged
      using errcode = 'check_violation';
  end if;
  return new;
end
$workout_exercises_guard_edit$;

revoke all on function public.workout_exercises_guard_edit() from public, anon, authenticated;

drop trigger if exists workout_exercises_guard_edit on public.workout_exercises;
create trigger workout_exercises_guard_edit
  before insert or update or delete on public.workout_exercises
  for each row execute function public.workout_exercises_guard_edit();

-- 3d. Athlete write access to exercises of their OWN workouts (auth.sql
-- created these; recreated here so they are guaranteed to exist, with the
-- per-statement auth.uid()). Coach policies (coach_mode.sql) are untouched.
drop policy if exists workout_exercises_insert_own on public.workout_exercises;
drop policy if exists workout_exercises_update_own on public.workout_exercises;
drop policy if exists workout_exercises_delete_own on public.workout_exercises;

create policy workout_exercises_insert_own on public.workout_exercises
  for insert to authenticated
  with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id
        and w.user_id = (select auth.uid())
    )
  );

create policy workout_exercises_update_own on public.workout_exercises
  for update to authenticated
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id
        and w.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id
        and w.user_id = (select auth.uid())
    )
  );

create policy workout_exercises_delete_own on public.workout_exercises
  for delete to authenticated
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id
        and w.user_id = (select auth.uid())
    )
  );

notify pgrst, 'reload schema';
