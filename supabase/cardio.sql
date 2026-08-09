-- Cardio training support: modality, prescription fields, log actuals, log_splits.
-- Safe to re-run. Ends with PostgREST schema reload.

-- ── exercises ──────────────────────────────────────────────────────────────
alter table public.exercises
  add column if not exists modality text not null default 'strength'
    check (modality in ('strength', 'cardio'));

alter table public.exercises
  add column if not exists typically_interval boolean not null default false;

-- ── workout_exercises (prescribed targets) ─────────────────────────────────
alter table public.workout_exercises
  add column if not exists target_duration_seconds integer;

alter table public.workout_exercises
  add column if not exists target_distance numeric;

alter table public.workout_exercises
  add column if not exists distance_unit text default 'mi'
    check (distance_unit is null or distance_unit in ('mi', 'km'));

alter table public.workout_exercises
  add column if not exists is_interval boolean not null default false;

alter table public.workout_exercises
  add column if not exists target_splits jsonb;

-- ── logs (cardio actuals for non-interval / session parent) ─────────────────
alter table public.logs
  add column if not exists actual_duration_seconds integer;

alter table public.logs
  add column if not exists actual_distance numeric;

alter table public.logs
  add column if not exists distance_unit text
    check (distance_unit is null or distance_unit in ('mi', 'km'));

-- Strength rows still require reps; cardio may log 0 reps.
alter table public.logs
  alter column actual_reps drop not null;

alter table public.logs
  alter column actual_reps set default 0;

-- ── log_splits (per-split actuals for interval cardio) ──────────────────────
create table if not exists public.log_splits (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.logs(id) on delete cascade,
  split_number integer not null check (split_number >= 1),
  distance numeric,
  distance_unit text check (distance_unit is null or distance_unit in ('mi', 'km')),
  duration_seconds integer,
  pace text,
  created_at timestamptz not null default now(),
  unique (log_id, split_number)
);

create index if not exists idx_log_splits_log on public.log_splits(log_id);

-- RLS: own rows only, via parent log.user_id (same ownership model as logs)
alter table public.log_splits enable row level security;

drop policy if exists log_splits_select_own on public.log_splits;
drop policy if exists log_splits_insert_own on public.log_splits;
drop policy if exists log_splits_update_own on public.log_splits;
drop policy if exists log_splits_delete_own on public.log_splits;

create policy log_splits_select_own on public.log_splits
  for select to authenticated
  using (
    exists (
      select 1 from public.logs l
      where l.id = log_splits.log_id
        and l.user_id = auth.uid()
    )
  );

create policy log_splits_insert_own on public.log_splits
  for insert to authenticated
  with check (
    exists (
      select 1 from public.logs l
      where l.id = log_splits.log_id
        and l.user_id = auth.uid()
    )
  );

create policy log_splits_update_own on public.log_splits
  for update to authenticated
  using (
    exists (
      select 1 from public.logs l
      where l.id = log_splits.log_id
        and l.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.logs l
      where l.id = log_splits.log_id
        and l.user_id = auth.uid()
    )
  );

create policy log_splits_delete_own on public.log_splits
  for delete to authenticated
  using (
    exists (
      select 1 from public.logs l
      where l.id = log_splits.log_id
        and l.user_id = auth.uid()
    )
  );

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exercises_name_key') then
    alter table public.exercises add constraint exercises_name_key unique (name);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'substitutions_pair_key') then
    alter table public.substitutions add constraint substitutions_pair_key unique (primary_exercise_id, substitute_exercise_id);
  end if;
end $$;

-- ── Seed cardio library ────────────────────────────────────────────────────
insert into public.exercises (
  name, movement_pattern, muscle_group, modality, typically_interval, equipment_required, contraindication_tags
) values
  ('Cardio Warm-up', 'cardio_warmup', 'cardio', 'cardio', false, 'bodyweight', '{}'),
  ('Easy Run', 'cardio_run', 'cardio', 'cardio', false, 'bodyweight', '{}'),
  ('Tempo Run', 'cardio_run', 'cardio', 'cardio', false, 'bodyweight', '{}'),
  ('Interval Run', 'cardio_run', 'cardio', 'cardio', true, 'bodyweight', '{}'),
  ('Long Run', 'cardio_run', 'cardio', 'cardio', false, 'bodyweight', '{}'),
  ('Recovery Run', 'cardio_run', 'cardio', 'cardio', false, 'bodyweight', '{}'),
  ('Steady-State Ride', 'cardio_cycle', 'cardio', 'cardio', false, 'bike', '{}'),
  ('Interval Ride', 'cardio_cycle', 'cardio', 'cardio', true, 'bike', '{}'),
  ('Steady Swim', 'cardio_swim', 'cardio', 'cardio', false, 'pool', '{}'),
  ('Interval Swim', 'cardio_swim', 'cardio', 'cardio', true, 'pool', '{}'),
  ('Steady Row', 'cardio_row', 'cardio', 'cardio', false, 'rower', '{}'),
  ('Interval Row', 'cardio_row', 'cardio', 'cardio', true, 'rower', '{}')
on conflict (name) do update set
  modality = excluded.modality,
  typically_interval = excluded.typically_interval,
  equipment_required = excluded.equipment_required,
  movement_pattern = excluded.movement_pattern,
  muscle_group = excluded.muscle_group;

-- Cross-modality cardio substitutions for pain (same pattern family preference)
insert into public.substitutions (primary_exercise_id, substitute_exercise_id, reason_tag, priority_rank)
select p.id, s.id, 'equipment_alt', r.rank
from (values
  ('Easy Run', 'Steady-State Ride', 1),
  ('Easy Run', 'Steady Row', 2),
  ('Tempo Run', 'Steady-State Ride', 1),
  ('Interval Run', 'Interval Ride', 1),
  ('Interval Run', 'Interval Row', 2),
  ('Long Run', 'Steady-State Ride', 1),
  ('Recovery Run', 'Steady Swim', 1),
  ('Steady-State Ride', 'Easy Run', 1),
  ('Steady-State Ride', 'Steady Row', 2),
  ('Interval Ride', 'Interval Run', 1),
  ('Interval Ride', 'Interval Row', 2),
  ('Steady Swim', 'Steady Row', 1),
  ('Interval Swim', 'Interval Row', 1),
  ('Steady Row', 'Steady-State Ride', 1),
  ('Interval Row', 'Interval Ride', 1)
) as r(primary_name, sub_name, rank)
join public.exercises p on p.name = r.primary_name
join public.exercises s on s.name = r.sub_name
on conflict (primary_exercise_id, substitute_exercise_id) do nothing;

notify pgrst, 'reload schema';
