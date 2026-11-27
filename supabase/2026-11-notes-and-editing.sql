-- 2026-11 notes + dumbbell load basis.
-- Run in the Supabase SQL editor AFTER 2026-11-hardening.sql. Safe to re-run.
-- If you re-run an older file, re-run 2026-11-hardening.sql and then this one.
--
-- Sections:
--   1. exercise_notes: one free-form athlete note per prescribed exercise
--      (works before any set is logged; is_pain feeds adaptation like
--      logs.pain_flag does)
--   2. logs.load_basis: what actual_weight means (per dumbbell, total, …)
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

notify pgrst, 'reload schema';
