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
  limitations text
);

create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  movement_pattern text not null,
  muscle_group text not null
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
  notes text not null default ''
);

create table if not exists logs (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references workout_exercises(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  set_number integer not null,
  actual_reps integer not null,
  actual_weight numeric,
  completed_at timestamptz not null default now()
);

create index if not exists idx_workouts_user on workouts(user_id);
create index if not exists idx_scheduled_workouts_user_date on scheduled_workouts(user_id, date);
create index if not exists idx_workout_exercises_workout on workout_exercises(workout_id);
create index if not exists idx_logs_workout_exercise on logs(workout_exercise_id);
