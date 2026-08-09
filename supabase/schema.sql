-- Workout App v1 schema
-- Matches PLAN.md "Data model (v1 scope)". Run in the Supabase SQL editor.
-- users.id is the Supabase Auth uid (auth.uid()).

create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  goal text,
  experience_level text,
  days_per_week integer,
  equipment_access text,
  limitations text,
  age integer,
  bodyweight numeric,
  bodyweight_unit text check (bodyweight_unit is null or bodyweight_unit in ('lb', 'kg')),
  session_length text,
  additional_notes text
);

create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  movement_pattern text not null,
  muscle_group text not null,
  equipment_required text,
  contraindication_tags text[] not null default '{}'::text[],
  modality text not null default 'strength' check (modality in ('strength', 'cardio')),
  typically_interval boolean not null default false
);

create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  week_number integer not null,
  day_number integer not null,
  focus text not null
);

create table if not exists scheduled_workouts (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  date date not null,
  status text not null default 'pending' check (status in ('pending', 'completed'))
);

create table if not exists workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  sets integer not null,
  reps text not null,
  weight_guidance text not null,
  notes text not null default '',
  target_duration_seconds integer,
  target_distance numeric,
  distance_unit text default 'mi' check (distance_unit is null or distance_unit in ('mi', 'km')),
  is_interval boolean not null default false,
  target_splits jsonb
);

create table if not exists logs (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references workout_exercises(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  set_number integer not null,
  actual_reps integer default 0,
  actual_weight numeric,
  actual_duration_seconds integer,
  actual_distance numeric,
  distance_unit text check (distance_unit is null or distance_unit in ('mi', 'km')),
  rpe integer check (rpe is null or (rpe >= 1 and rpe <= 10)),
  pain_flag boolean not null default false,
  pain_note text,
  completed_at timestamptz not null default now()
);

create table if not exists log_splits (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references logs(id) on delete cascade,
  split_number integer not null check (split_number >= 1),
  distance numeric,
  distance_unit text check (distance_unit is null or distance_unit in ('mi', 'km')),
  duration_seconds integer,
  pace text,
  created_at timestamptz not null default now(),
  unique (log_id, split_number)
);

-- Ranked alternate exercises for safe in-session / adaptive swaps.
-- NEXT PASS: if every candidate for a pain-flagged lift still carries the
-- same contraindication_tag (e.g. all vertical pulls share high_shoulder_strain),
-- fall back to skip/deload that pattern for the week — do not serve a no-op swap.
create table if not exists substitutions (
  id uuid primary key default gen_random_uuid(),
  primary_exercise_id uuid not null references exercises(id) on delete cascade,
  substitute_exercise_id uuid not null references exercises(id) on delete cascade,
  reason_tag text not null,
  priority_rank integer not null check (priority_rank >= 1),
  unique (primary_exercise_id, substitute_exercise_id),
  check (primary_exercise_id <> substitute_exercise_id)
);

create index if not exists idx_workouts_user on workouts(user_id);
create index if not exists idx_scheduled_workouts_user_date on scheduled_workouts(user_id, date);
create index if not exists idx_workout_exercises_workout on workout_exercises(workout_id);
create index if not exists idx_logs_workout_exercise on logs(workout_exercise_id);
create index if not exists idx_substitutions_primary on substitutions(primary_exercise_id, priority_rank);

-- AI-proposed pairings awaiting human review (never used live until approved).
create table if not exists proposed_substitutions (
  id uuid primary key default gen_random_uuid(),
  primary_exercise_id uuid not null references exercises(id) on delete cascade,
  substitute_exercise_id uuid references exercises(id) on delete set null,
  proposed_new_exercise_name text,
  reason_tag text not null,
  reasoning text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  rejection_note text,
  created_at timestamptz not null default now(),
  check (
    substitute_exercise_id is not null
    or (proposed_new_exercise_name is not null and length(trim(proposed_new_exercise_name)) > 0)
  )
);

create index if not exists idx_proposed_substitutions_status
  on proposed_substitutions(status, created_at desc);
