-- Additive: exercise substitution foundation.
-- Safe to re-run. Does not change generation/logging behavior.

alter table public.exercises
  add column if not exists equipment_required text;

alter table public.exercises
  add column if not exists contraindication_tags text[] not null default '{}'::text[];

-- Ranked alternate exercises for safe in-session / adaptive swaps.
-- NEXT PASS: if every candidate for a pain-flagged lift still carries the
-- same contraindication_tag (e.g. all vertical pulls share high_shoulder_strain),
-- fall back to skip/deload that pattern for the week — do not serve a no-op swap.
create table if not exists public.substitutions (
  id uuid primary key default gen_random_uuid(),
  primary_exercise_id uuid not null references public.exercises(id) on delete cascade,
  substitute_exercise_id uuid not null references public.exercises(id) on delete cascade,
  reason_tag text not null,
  priority_rank integer not null check (priority_rank >= 1),
  unique (primary_exercise_id, substitute_exercise_id),
  check (primary_exercise_id <> substitute_exercise_id)
);

create index if not exists idx_substitutions_primary
  on public.substitutions(primary_exercise_id, priority_rank);

-- Shared catalog (same model as exercises): authenticated read.
alter table public.substitutions enable row level security;

drop policy if exists substitutions_select_authenticated on public.substitutions;
create policy substitutions_select_authenticated on public.substitutions
  for select to authenticated
  using (true);
