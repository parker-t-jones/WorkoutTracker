-- Proposed substitutions review pipeline (shared library data).
-- Safe to re-run.

create table if not exists public.proposed_substitutions (
  id uuid primary key default gen_random_uuid(),
  primary_exercise_id uuid not null references public.exercises(id) on delete cascade,
  substitute_exercise_id uuid references public.exercises(id) on delete set null,
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
  on public.proposed_substitutions(status, created_at desc);

create index if not exists idx_proposed_substitutions_primary
  on public.proposed_substitutions(primary_exercise_id);

alter table public.proposed_substitutions enable row level security;

drop policy if exists proposed_substitutions_select_authenticated on public.proposed_substitutions;
drop policy if exists proposed_substitutions_insert_authenticated on public.proposed_substitutions;
drop policy if exists proposed_substitutions_update_authenticated on public.proposed_substitutions;

create policy proposed_substitutions_select_authenticated
  on public.proposed_substitutions
  for select to authenticated
  using (true);

create policy proposed_substitutions_insert_authenticated
  on public.proposed_substitutions
  for insert to authenticated
  with check (true);

create policy proposed_substitutions_update_authenticated
  on public.proposed_substitutions
  for update to authenticated
  using (true)
  with check (true);
