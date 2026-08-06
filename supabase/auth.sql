-- Auth + RLS for an existing v1 database.
-- Run AFTER signing up (so auth.users has your account), and AFTER
-- reassign-test-data.sql if you need to keep old workouts/logs.
--
-- Choice: public.users.id IS auth.uid() (no separate auth_id column).
-- All existing user_id FKs already point at users.id, so this is the
-- least-disruptive link to auth identities.

-- Drop the old random-uuid default; new rows always set id = auth.uid().
alter table public.users alter column id drop default;

-- Point users.id at auth.users. Fails if any public.users row has no
-- matching auth.users id — run reassign-test-data.sql first in that case.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_id_auth_fkey'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_id_auth_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end $$;

alter table public.users enable row level security;
alter table public.exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.scheduled_workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.logs enable row level security;
alter table public.substitutions enable row level security;

-- users: own row only
drop policy if exists users_select_own on public.users;
drop policy if exists users_insert_own on public.users;
drop policy if exists users_update_own on public.users;

create policy users_select_own on public.users
  for select to authenticated
  using (id = auth.uid());

create policy users_insert_own on public.users
  for insert to authenticated
  with check (id = auth.uid());

create policy users_update_own on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- exercises: shared catalog
drop policy if exists exercises_select_authenticated on public.exercises;
drop policy if exists exercises_insert_authenticated on public.exercises;

create policy exercises_select_authenticated on public.exercises
  for select to authenticated
  using (true);

create policy exercises_insert_authenticated on public.exercises
  for insert to authenticated
  with check (true);

-- substitutions: shared catalog (read-only for clients)
drop policy if exists substitutions_select_authenticated on public.substitutions;
create policy substitutions_select_authenticated on public.substitutions
  for select to authenticated
  using (true);

-- workouts
drop policy if exists workouts_select_own on public.workouts;
drop policy if exists workouts_insert_own on public.workouts;
drop policy if exists workouts_update_own on public.workouts;
drop policy if exists workouts_delete_own on public.workouts;

create policy workouts_select_own on public.workouts
  for select to authenticated
  using (user_id = auth.uid());

create policy workouts_insert_own on public.workouts
  for insert to authenticated
  with check (user_id = auth.uid());

create policy workouts_update_own on public.workouts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy workouts_delete_own on public.workouts
  for delete to authenticated
  using (user_id = auth.uid());

-- scheduled_workouts
drop policy if exists scheduled_workouts_select_own on public.scheduled_workouts;
drop policy if exists scheduled_workouts_insert_own on public.scheduled_workouts;
drop policy if exists scheduled_workouts_update_own on public.scheduled_workouts;
drop policy if exists scheduled_workouts_delete_own on public.scheduled_workouts;

create policy scheduled_workouts_select_own on public.scheduled_workouts
  for select to authenticated
  using (user_id = auth.uid());

create policy scheduled_workouts_insert_own on public.scheduled_workouts
  for insert to authenticated
  with check (user_id = auth.uid());

create policy scheduled_workouts_update_own on public.scheduled_workouts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy scheduled_workouts_delete_own on public.scheduled_workouts
  for delete to authenticated
  using (user_id = auth.uid());

-- workout_exercises: owned via parent workout
drop policy if exists workout_exercises_select_own on public.workout_exercises;
drop policy if exists workout_exercises_insert_own on public.workout_exercises;
drop policy if exists workout_exercises_update_own on public.workout_exercises;
drop policy if exists workout_exercises_delete_own on public.workout_exercises;

create policy workout_exercises_select_own on public.workout_exercises
  for select to authenticated
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id
        and w.user_id = auth.uid()
    )
  );

create policy workout_exercises_insert_own on public.workout_exercises
  for insert to authenticated
  with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id
        and w.user_id = auth.uid()
    )
  );

create policy workout_exercises_update_own on public.workout_exercises
  for update to authenticated
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id
        and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id
        and w.user_id = auth.uid()
    )
  );

create policy workout_exercises_delete_own on public.workout_exercises
  for delete to authenticated
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id
        and w.user_id = auth.uid()
    )
  );

-- logs
drop policy if exists logs_select_own on public.logs;
drop policy if exists logs_insert_own on public.logs;
drop policy if exists logs_update_own on public.logs;
drop policy if exists logs_delete_own on public.logs;

create policy logs_select_own on public.logs
  for select to authenticated
  using (user_id = auth.uid());

create policy logs_insert_own on public.logs
  for insert to authenticated
  with check (user_id = auth.uid());

create policy logs_update_own on public.logs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy logs_delete_own on public.logs
  for delete to authenticated
  using (user_id = auth.uid());
