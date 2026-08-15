-- Coach mode: coach/athlete relationships, scoped coach RLS, custom exercise
-- library (exercises.owner_id), and saved workout templates.
-- Safe to re-run. Ends with PostgREST schema reload.

-- ── 1. Coach flag on users ──────────────────────────────────────────────────
alter table public.users
  add column if not exists is_coach boolean not null default false;

-- ── 2. coach_athletes relationship ──────────────────────────────────────────
create table if not exists public.coach_athletes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.users(id) on delete cascade,
  athlete_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'revoked')),
  invited_via text
    check (invited_via is null or invited_via in ('email', 'phone')),
  invited_contact text,
  created_at timestamptz not null default now()
);

do $migration_guard_coach_athletes_unique$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'coach_athletes_coach_athlete_key'
  ) then
    alter table public.coach_athletes
      add constraint coach_athletes_coach_athlete_key unique (coach_id, athlete_id);
  end if;
end
$migration_guard_coach_athletes_unique$;

create index if not exists idx_coach_athletes_coach on public.coach_athletes(coach_id);
create index if not exists idx_coach_athletes_athlete on public.coach_athletes(athlete_id);

alter table public.coach_athletes enable row level security;

drop policy if exists coach_athletes_select_coach on public.coach_athletes;
drop policy if exists coach_athletes_insert_coach on public.coach_athletes;
drop policy if exists coach_athletes_update_coach on public.coach_athletes;
drop policy if exists coach_athletes_select_athlete on public.coach_athletes;
drop policy if exists coach_athletes_update_athlete on public.coach_athletes;

create policy coach_athletes_select_coach on public.coach_athletes
  for select to authenticated
  using (coach_id = auth.uid());

create policy coach_athletes_insert_coach on public.coach_athletes
  for insert to authenticated
  with check (coach_id = auth.uid() and status = 'pending');

create policy coach_athletes_update_coach on public.coach_athletes
  for update to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid() and status = 'revoked');

create policy coach_athletes_select_athlete on public.coach_athletes
  for select to authenticated
  using (athlete_id = auth.uid());

create policy coach_athletes_update_athlete on public.coach_athletes
  for update to authenticated
  using (athlete_id = auth.uid())
  with check (athlete_id = auth.uid() and status in ('active', 'revoked'));

-- ── 3. Helper: active coach-of check ────────────────────────────────────────
create or replace function public.is_active_coach_of(target_athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $is_active_coach_of$
  select exists (
    select 1
    from public.coach_athletes
    where coach_id = auth.uid()
      and athlete_id = target_athlete_id
      and status = 'active'
  );
$is_active_coach_of$;

revoke all on function public.is_active_coach_of(uuid) from public;
grant execute on function public.is_active_coach_of(uuid) to authenticated;

-- ── 4. Additive coach access to athlete program data ────────────────────────
-- Existing self-scoped *_own policies are left untouched.

drop policy if exists workouts_select_coach on public.workouts;
drop policy if exists workouts_insert_coach on public.workouts;
drop policy if exists workouts_update_coach on public.workouts;

create policy workouts_select_coach on public.workouts
  for select to authenticated
  using (public.is_active_coach_of(user_id));

create policy workouts_insert_coach on public.workouts
  for insert to authenticated
  with check (public.is_active_coach_of(user_id));

create policy workouts_update_coach on public.workouts
  for update to authenticated
  using (public.is_active_coach_of(user_id))
  with check (public.is_active_coach_of(user_id));

drop policy if exists workout_exercises_select_coach on public.workout_exercises;
drop policy if exists workout_exercises_insert_coach on public.workout_exercises;
drop policy if exists workout_exercises_update_coach on public.workout_exercises;

create policy workout_exercises_select_coach on public.workout_exercises
  for select to authenticated
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id
        and public.is_active_coach_of(w.user_id)
    )
  );

create policy workout_exercises_insert_coach on public.workout_exercises
  for insert to authenticated
  with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id
        and public.is_active_coach_of(w.user_id)
    )
  );

create policy workout_exercises_update_coach on public.workout_exercises
  for update to authenticated
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id
        and public.is_active_coach_of(w.user_id)
    )
  )
  with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id
        and public.is_active_coach_of(w.user_id)
    )
  );

drop policy if exists scheduled_workouts_select_coach on public.scheduled_workouts;
drop policy if exists scheduled_workouts_insert_coach on public.scheduled_workouts;
drop policy if exists scheduled_workouts_update_coach on public.scheduled_workouts;

create policy scheduled_workouts_select_coach on public.scheduled_workouts
  for select to authenticated
  using (public.is_active_coach_of(user_id));

create policy scheduled_workouts_insert_coach on public.scheduled_workouts
  for insert to authenticated
  with check (public.is_active_coach_of(user_id));

create policy scheduled_workouts_update_coach on public.scheduled_workouts
  for update to authenticated
  using (public.is_active_coach_of(user_id))
  with check (public.is_active_coach_of(user_id));

-- logs / log_splits: coach SELECT only — never INSERT or UPDATE for coaches.
drop policy if exists logs_select_coach on public.logs;

create policy logs_select_coach on public.logs
  for select to authenticated
  using (public.is_active_coach_of(user_id));

drop policy if exists log_splits_select_coach on public.log_splits;

create policy log_splits_select_coach on public.log_splits
  for select to authenticated
  using (
    exists (
      select 1 from public.logs l
      where l.id = log_splits.log_id
        and public.is_active_coach_of(l.user_id)
    )
  );

-- ── 5. Coach custom exercise library ───────────────────────────────────────
alter table public.exercises
  add column if not exists owner_id uuid;

do $migration_guard_exercises_owner_fk$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'exercises_owner_id_fkey'
  ) then
    alter table public.exercises
      add constraint exercises_owner_id_fkey
      foreign key (owner_id) references public.users(id);
  end if;
end
$migration_guard_exercises_owner_fk$;

-- Drop whatever SELECT policies currently exist (do not hardcode names).
do $exercises_policy_cleanup$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'exercises' and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.exercises', pol.policyname);
  end loop;
end
$exercises_policy_cleanup$;

-- Remove the open authenticated INSERT from auth.sql so shared-library
-- rows cannot be inserted via the API after this migration.
drop policy if exists exercises_insert_authenticated on public.exercises;
drop policy if exists exercises_select_shared_or_own on public.exercises;
drop policy if exists exercises_insert_own on public.exercises;
drop policy if exists exercises_update_own on public.exercises;
drop policy if exists exercises_delete_own on public.exercises;

create policy exercises_select_shared_or_own on public.exercises
  for select to authenticated
  using (owner_id is null or owner_id = auth.uid());

create policy exercises_insert_own on public.exercises
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy exercises_update_own on public.exercises
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy exercises_delete_own on public.exercises
  for delete to authenticated
  using (owner_id = auth.uid());

-- ── 6. Saved workout templates ─────────────────────────────────────────────
create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.template_exercises (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workout_templates(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  sets integer,
  reps text,
  weight_guidance text,
  order_index integer not null default 0
);

create index if not exists idx_template_exercises_template
  on public.template_exercises(template_id);

alter table public.workout_templates enable row level security;
alter table public.template_exercises enable row level security;

drop policy if exists workout_templates_select_own on public.workout_templates;
drop policy if exists workout_templates_insert_own on public.workout_templates;
drop policy if exists workout_templates_update_own on public.workout_templates;
drop policy if exists workout_templates_delete_own on public.workout_templates;

create policy workout_templates_select_own on public.workout_templates
  for select to authenticated
  using (coach_id = auth.uid());

create policy workout_templates_insert_own on public.workout_templates
  for insert to authenticated
  with check (coach_id = auth.uid());

create policy workout_templates_update_own on public.workout_templates
  for update to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

create policy workout_templates_delete_own on public.workout_templates
  for delete to authenticated
  using (coach_id = auth.uid());

drop policy if exists template_exercises_select_own on public.template_exercises;
drop policy if exists template_exercises_insert_own on public.template_exercises;
drop policy if exists template_exercises_update_own on public.template_exercises;
drop policy if exists template_exercises_delete_own on public.template_exercises;

create policy template_exercises_select_own on public.template_exercises
  for select to authenticated
  using (
    exists (
      select 1 from public.workout_templates wt
      where wt.id = template_exercises.template_id
        and wt.coach_id = auth.uid()
    )
  );

create policy template_exercises_insert_own on public.template_exercises
  for insert to authenticated
  with check (
    exists (
      select 1 from public.workout_templates wt
      where wt.id = template_exercises.template_id
        and wt.coach_id = auth.uid()
    )
  );

create policy template_exercises_update_own on public.template_exercises
  for update to authenticated
  using (
    exists (
      select 1 from public.workout_templates wt
      where wt.id = template_exercises.template_id
        and wt.coach_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workout_templates wt
      where wt.id = template_exercises.template_id
        and wt.coach_id = auth.uid()
    )
  );

create policy template_exercises_delete_own on public.template_exercises
  for delete to authenticated
  using (
    exists (
      select 1 from public.workout_templates wt
      where wt.id = template_exercises.template_id
        and wt.coach_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
