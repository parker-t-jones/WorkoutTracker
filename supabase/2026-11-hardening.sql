-- 2026-11 hardening migration.
-- Run in the Supabase SQL editor AFTER every other migration (see README for
-- order). Safe to re-run. If you ever re-run an OLDER file (auth.sql,
-- coach_mode.sql, exercises-substitutions.sql, proposed-substitutions.sql,
-- leaderboard.sql), re-run this file afterwards: those files recreate
-- policies/functions that this one tightens.
--
-- Sections:
--   1. coach_athletes status integrity (RPCs + trigger, no direct UPDATE)
--   2. users.is_coach self-escalation guard
--   3. exercises visibility for coach-assigned custom exercises + indexes
--   4. ensure_shared_exercise RPC (program generation after coach_mode.sql)
--   5. drop auth.sql's open exercises policies
--   6. admin-only writes for the shared substitution catalog
--   7. leaderboard groups + scoped family_leaderboard (streak no longer
--      resets every Monday while the current week is still in progress)
--   8. logs.weight_unit (lb/kg per logged set; NULL = legacy lb)
--   9. Coach exercise demo media (exercise_media table + private
--      'exercise-media' storage bucket and its storage.objects policies)
--
-- All new policies use (select auth.uid()) so the value is computed once per
-- statement instead of once per row.

-- ═════════════════════════════════════════════════════════════════════════
-- 1. coach_athletes status integrity
-- ═════════════════════════════════════════════════════════════════════════

-- Direct UPDATE let an athlete re-activate a revoked link or change coach_id.
-- All transitions now go through the SECURITY DEFINER RPCs below.
drop policy if exists coach_athletes_update_coach on public.coach_athletes;
drop policy if exists coach_athletes_update_athlete on public.coach_athletes;
-- Direct INSERT did not check users.is_coach; invites go through
-- invite_athlete_by_email() instead.
drop policy if exists coach_athletes_insert_coach on public.coach_athletes;

-- Defense in depth: even a privileged writer cannot re-point a relationship or
-- resurrect a revoked one. The only exit from 'revoked' is revoked → pending,
-- and only when invite_athlete_by_email() sets app.coach_reinvite = 'on' for
-- its own transaction.
create or replace function public.coach_athletes_guard_update()
returns trigger
language plpgsql
set search_path = public
as $coach_athletes_guard_update$
begin
  if new.coach_id is distinct from old.coach_id
     or new.athlete_id is distinct from old.athlete_id then
    raise exception 'coach_id and athlete_id cannot be changed'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'revoked' then
      if not (new.status = 'pending'
              and coalesce(current_setting('app.coach_reinvite', true), '') = 'on') then
        raise exception 'A revoked coach relationship cannot be reactivated; send a new invite'
          using errcode = '42501';
      end if;
    elsif old.status = 'pending' then
      if new.status not in ('active', 'revoked') then
        raise exception 'Invalid status transition % → %', old.status, new.status
          using errcode = '42501';
      end if;
    elsif old.status = 'active' then
      if new.status <> 'revoked' then
        raise exception 'Invalid status transition % → %', old.status, new.status
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end
$coach_athletes_guard_update$;

drop trigger if exists coach_athletes_guard_update on public.coach_athletes;
create trigger coach_athletes_guard_update
  before update on public.coach_athletes
  for each row execute function public.coach_athletes_guard_update();

-- Athlete accepts or declines a pending invite.
create or replace function public.respond_to_coach_invite(p_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $respond_to_coach_invite$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  update public.coach_athletes ca
     set status = case when p_accept then 'active' else 'revoked' end
   where ca.id = p_id
     and ca.athlete_id = v_uid
     and ca.status = 'pending'
  returning ca.status into v_status;

  if v_status is null then
    raise exception 'Invite not found or no longer pending' using errcode = 'P0002';
  end if;

  return v_status;
end
$respond_to_coach_invite$;

-- Either party ends a pending or active relationship.
create or replace function public.end_coach_relationship(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $end_coach_relationship$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  update public.coach_athletes ca
     set status = 'revoked'
   where ca.id = p_id
     and (ca.coach_id = v_uid or ca.athlete_id = v_uid)
     and ca.status in ('pending', 'active')
  returning ca.status into v_status;

  if v_status is null then
    raise exception 'Relationship not found or already ended' using errcode = 'P0002';
  end if;

  return v_status;
end
$end_coach_relationship$;

-- Coach invites an existing account by email. Returns the relationship id.
-- Re-inviting a revoked pair resets that row to 'pending'; inviting an
-- already pending/active pair returns the existing id unchanged.
create or replace function public.invite_athlete_by_email(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $invite_athlete_by_email$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_athlete uuid;
  v_id uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if not exists (select 1 from public.users u where u.id = v_uid and u.is_coach) then
    raise exception 'Only coaches can invite athletes' using errcode = '42501';
  end if;

  if v_email = '' then
    raise exception 'Email is required' using errcode = '22023';
  end if;

  select au.id into v_athlete
    from auth.users au
   where lower(au.email) = v_email
   limit 1;

  -- coach_athletes.athlete_id references public.users, so the account must
  -- have finished signing in at least once.
  if v_athlete is null
     or not exists (select 1 from public.users u where u.id = v_athlete) then
    raise exception 'No account with that email' using errcode = 'P0002';
  end if;

  if v_athlete = v_uid then
    raise exception 'You cannot invite yourself' using errcode = '22023';
  end if;

  select ca.id, ca.status into v_id, v_status
    from public.coach_athletes ca
   where ca.coach_id = v_uid and ca.athlete_id = v_athlete
   for update;

  if v_id is null then
    begin
      insert into public.coach_athletes (coach_id, athlete_id, status, invited_via, invited_contact)
      values (v_uid, v_athlete, 'pending', 'email', v_email)
      returning id into v_id;
      return v_id;
    exception when unique_violation then
      -- Concurrent invite for the same pair; fall through to the existing row.
      select ca.id, ca.status into v_id, v_status
        from public.coach_athletes ca
       where ca.coach_id = v_uid and ca.athlete_id = v_athlete
       for update;
    end;
  end if;

  if v_status = 'revoked' then
    perform set_config('app.coach_reinvite', 'on', true);
    update public.coach_athletes
       set status = 'pending',
           invited_via = 'email',
           invited_contact = v_email,
           created_at = now()
     where id = v_id;
    perform set_config('app.coach_reinvite', 'off', true);
  end if;

  return v_id;
end
$invite_athlete_by_email$;

-- Both sides of every relationship the caller is in, with the other party's
-- name/email (users RLS is own-row-only, so this is the only way to see them).
create or replace function public.list_my_coach_links()
returns table (
  id uuid,
  role text,
  other_user_id uuid,
  other_name text,
  other_email text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $list_my_coach_links$
  select
    ca.id,
    case when ca.coach_id = auth.uid() then 'coach' else 'athlete' end as role,
    other.id as other_user_id,
    other.name as other_name,
    au.email::text as other_email,
    ca.status,
    ca.created_at
  from public.coach_athletes ca
  join public.users other
    on other.id = case when ca.coach_id = auth.uid() then ca.athlete_id else ca.coach_id end
  left join auth.users au on au.id = other.id
  where auth.uid() is not null
    and (ca.coach_id = auth.uid() or ca.athlete_id = auth.uid())
  order by ca.created_at desc;
$list_my_coach_links$;

revoke all on function public.respond_to_coach_invite(uuid, boolean) from public, anon;
revoke all on function public.end_coach_relationship(uuid) from public, anon;
revoke all on function public.invite_athlete_by_email(text) from public, anon;
revoke all on function public.list_my_coach_links() from public, anon;
grant execute on function public.respond_to_coach_invite(uuid, boolean) to authenticated;
grant execute on function public.end_coach_relationship(uuid) to authenticated;
grant execute on function public.invite_athlete_by_email(text) to authenticated;
grant execute on function public.list_my_coach_links() to authenticated;

-- Trigger function is not an API.
revoke all on function public.coach_athletes_guard_update() from public, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 2. users.is_coach cannot be self-granted
-- ═════════════════════════════════════════════════════════════════════════
-- auth.role() is 'authenticated'/'anon' for API requests; it is NULL in the
-- SQL editor (postgres) and 'service_role' for the service key — those may
-- change is_coach.

create or replace function public.users_guard_is_coach()
returns trigger
language plpgsql
set search_path = public
as $users_guard_is_coach$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.is_coach := false;
    elsif new.is_coach is distinct from old.is_coach then
      new.is_coach := old.is_coach;
    end if;
  end if;
  return new;
end
$users_guard_is_coach$;

revoke all on function public.users_guard_is_coach() from public, anon, authenticated;

drop trigger if exists users_guard_is_coach_update on public.users;
create trigger users_guard_is_coach_update
  before update on public.users
  for each row execute function public.users_guard_is_coach();

drop trigger if exists users_guard_is_coach_insert on public.users;
create trigger users_guard_is_coach_insert
  before insert on public.users
  for each row execute function public.users_guard_is_coach();

-- ═════════════════════════════════════════════════════════════════════════
-- 3. exercises visibility + indexes
-- ═════════════════════════════════════════════════════════════════════════
-- A coach-owned custom exercise placed in an athlete's workout must be
-- readable by that athlete (otherwise the workout_exercises → exercises embed
-- returns null). SECURITY DEFINER helper avoids nested RLS evaluation.

create or replace function public.exercise_used_in_visible_workout(p_exercise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $exercise_used_in_visible_workout$
  select exists (
    select 1
    from public.workout_exercises we
    join public.workouts w on w.id = we.workout_id
    where we.exercise_id = p_exercise_id
      and (
        w.user_id = auth.uid()
        or exists (
          select 1 from public.coach_athletes ca
          where ca.coach_id = auth.uid()
            and ca.athlete_id = w.user_id
            and ca.status = 'active'
        )
      )
  );
$exercise_used_in_visible_workout$;

revoke all on function public.exercise_used_in_visible_workout(uuid) from public, anon;
grant execute on function public.exercise_used_in_visible_workout(uuid) to authenticated;

drop policy if exists exercises_select_shared_or_own on public.exercises;
drop policy if exists exercises_select_visible on public.exercises;

create policy exercises_select_visible on public.exercises
  for select to authenticated
  using (
    owner_id is null
    or owner_id = (select auth.uid())
    or public.exercise_used_in_visible_workout(id)
  );

create index if not exists idx_workout_exercises_exercise on public.workout_exercises(exercise_id);
create index if not exists idx_exercises_owner on public.exercises(owner_id);
create index if not exists idx_logs_user on public.logs(user_id);
create index if not exists idx_scheduled_workouts_workout on public.scheduled_workouts(workout_id);

-- ═════════════════════════════════════════════════════════════════════════
-- 4. ensure_shared_exercise: find-or-create a shared (owner_id null) exercise
-- ═════════════════════════════════════════════════════════════════════════
-- exercises INSERT requires owner_id = auth.uid() since coach_mode.sql, so the
-- client can no longer create shared catalog rows for AI-chosen names.

create or replace function public.ensure_shared_exercise(
  p_name text,
  p_movement_pattern text default 'other',
  p_muscle_group text default 'general',
  p_modality text default 'strength'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $ensure_shared_exercise$
declare
  -- Typographic dashes/quotes → ASCII, collapse whitespace.
  v_name text := btrim(regexp_replace(
    translate(coalesce(p_name, ''), '–—‘’', '--'''''),
    '\s+', ' ', 'g'));
  v_modality text := case when p_modality = 'cardio' then 'cardio' else 'strength' end;
  v_pattern text := lower(btrim(coalesce(p_movement_pattern, '')));
  v_muscle text := lower(btrim(coalesce(p_muscle_group, '')));
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'Exercise name must be 2–80 characters' using errcode = '22023';
  end if;

  if v_name !~ '^[A-Za-z0-9][A-Za-z0-9 ()''&/.,+:#%-]*$' then
    raise exception 'Exercise name contains unsupported characters' using errcode = '22023';
  end if;

  if v_pattern !~ '^[a-z][a-z_]{0,39}$' then
    v_pattern := case when v_modality = 'cardio' then 'cardio_other' else 'other' end;
  end if;
  if v_muscle !~ '^[a-z][a-z_]{0,39}$' then
    v_muscle := case when v_modality = 'cardio' then 'cardio' else 'general' end;
  end if;

  select e.id into v_id
    from public.exercises e
   where e.owner_id is null
     and lower(e.name) = lower(v_name)
   order by (e.name = v_name) desc
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.exercises (name, movement_pattern, muscle_group, modality, owner_id)
  values (v_name, v_pattern, v_muscle, v_modality, null)
  on conflict (name) do nothing
  returning id into v_id;

  if v_id is null then
    -- Lost a race with another insert, or the exact name belongs to a
    -- private (coach-owned) exercise.
    select e.id into v_id
      from public.exercises e
     where e.owner_id is null
       and lower(e.name) = lower(v_name)
     limit 1;
    if v_id is null then
      raise exception 'Exercise name "%" is already used by a private exercise', v_name
        using errcode = '23505';
    end if;
  end if;

  return v_id;
end
$ensure_shared_exercise$;

revoke all on function public.ensure_shared_exercise(text, text, text, text) from public, anon;
grant execute on function public.ensure_shared_exercise(text, text, text, text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 5. Remove auth.sql's open exercises policies (in case auth.sql was re-run)
-- ═════════════════════════════════════════════════════════════════════════
drop policy if exists exercises_select_authenticated on public.exercises;
drop policy if exists exercises_insert_authenticated on public.exercises;

-- ═════════════════════════════════════════════════════════════════════════
-- 6. Shared substitution catalog: admin-only writes
-- ═════════════════════════════════════════════════════════════════════════
-- Admin = auth.users.raw_app_meta_data ->> 'role' = 'admin' (README explains
-- how to set it). app_metadata is not user-editable, unlike user_metadata.

drop policy if exists substitutions_insert_authenticated on public.substitutions;
drop policy if exists substitutions_insert_admin on public.substitutions;
drop policy if exists substitutions_update_admin on public.substitutions;
drop policy if exists substitutions_delete_admin on public.substitutions;

create policy substitutions_insert_admin on public.substitutions
  for insert to authenticated
  with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin');

create policy substitutions_update_admin on public.substitutions
  for update to authenticated
  using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin')
  with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin');

create policy substitutions_delete_admin on public.substitutions
  for delete to authenticated
  using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin');

drop policy if exists proposed_substitutions_insert_authenticated on public.proposed_substitutions;
drop policy if exists proposed_substitutions_insert_pending on public.proposed_substitutions;
drop policy if exists proposed_substitutions_update_authenticated on public.proposed_substitutions;
drop policy if exists proposed_substitutions_update_admin on public.proposed_substitutions;

create policy proposed_substitutions_insert_pending on public.proposed_substitutions
  for insert to authenticated
  with check (status = 'pending');

create policy proposed_substitutions_update_admin on public.proposed_substitutions
  for update to authenticated
  using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin')
  with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin');

-- ═════════════════════════════════════════════════════════════════════════
-- 7. Leaderboard groups
-- ═════════════════════════════════════════════════════════════════════════

create table if not exists public.leaderboard_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 60),
  join_code text not null unique check (join_code ~ '^[A-Z0-9]{6}$'),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.leaderboard_group_members (
  group_id uuid not null references public.leaderboard_groups(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists idx_leaderboard_group_members_user
  on public.leaderboard_group_members(user_id);

alter table public.leaderboard_groups enable row level security;
alter table public.leaderboard_group_members enable row level security;

-- SECURITY DEFINER so the members policy can reference its own table without
-- infinite RLS recursion.
create or replace function public.is_leaderboard_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $is_leaderboard_group_member$
  select exists (
    select 1 from public.leaderboard_group_members m
    where m.group_id = p_group_id
      and m.user_id = auth.uid()
  );
$is_leaderboard_group_member$;

revoke all on function public.is_leaderboard_group_member(uuid) from public, anon;
grant execute on function public.is_leaderboard_group_member(uuid) to authenticated;

drop policy if exists leaderboard_groups_select_member on public.leaderboard_groups;
create policy leaderboard_groups_select_member on public.leaderboard_groups
  for select to authenticated
  using (public.is_leaderboard_group_member(id));

drop policy if exists leaderboard_group_members_select_member on public.leaderboard_group_members;
create policy leaderboard_group_members_select_member on public.leaderboard_group_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_leaderboard_group_member(group_id)
  );
-- No INSERT/UPDATE/DELETE policies: writes go through the RPCs below.

-- Random 6-char join code (A–Z, 0–9) from gen_random_uuid()'s random bytes.
create or replace function public.generate_leaderboard_join_code()
returns text
language plpgsql
volatile
set search_path = public
as $generate_leaderboard_join_code$
declare
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  bytes bytea := uuid_send(gen_random_uuid());
  code text := '';
  i integer;
begin
  for i in 0..5 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 36) + 1, 1);
  end loop;
  return code;
end
$generate_leaderboard_join_code$;

revoke all on function public.generate_leaderboard_join_code() from public, anon, authenticated;

create or replace function public.create_leaderboard_group(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $create_leaderboard_group$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_code text;
  v_group uuid;
  attempts integer := 0;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if length(v_name) < 1 or length(v_name) > 60 then
    raise exception 'Group name must be 1–60 characters' using errcode = '22023';
  end if;
  if not exists (select 1 from public.users u where u.id = v_uid) then
    raise exception 'Finish setting up your profile first' using errcode = 'P0002';
  end if;

  loop
    attempts := attempts + 1;
    v_code := public.generate_leaderboard_join_code();
    begin
      insert into public.leaderboard_groups (name, join_code, created_by)
      values (v_name, v_code, v_uid)
      returning id into v_group;
      exit;
    exception when unique_violation then
      if attempts >= 10 then
        raise exception 'Could not generate a unique join code, try again';
      end if;
    end;
  end loop;

  insert into public.leaderboard_group_members (group_id, user_id)
  values (v_group, v_uid)
  on conflict do nothing;

  return v_code;
end
$create_leaderboard_group$;

create or replace function public.join_leaderboard_group(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $join_leaderboard_group$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_group uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.users u where u.id = v_uid) then
    raise exception 'Finish setting up your profile first' using errcode = 'P0002';
  end if;

  select g.id into v_group
    from public.leaderboard_groups g
   where g.join_code = v_code;

  if v_group is null then
    raise exception 'No group with that code' using errcode = 'P0002';
  end if;

  insert into public.leaderboard_group_members (group_id, user_id)
  values (v_group, v_uid)
  on conflict do nothing;

  return v_group;
end
$join_leaderboard_group$;

create or replace function public.leave_leaderboard_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $leave_leaderboard_group$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  delete from public.leaderboard_group_members m
   where m.group_id = p_group_id
     and m.user_id = auth.uid();
end
$leave_leaderboard_group$;

create or replace function public.my_leaderboard_groups()
returns table (
  id uuid,
  name text,
  join_code text,
  member_count integer,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $my_leaderboard_groups$
  select
    g.id,
    g.name,
    g.join_code,
    (select count(*)::integer from public.leaderboard_group_members m2 where m2.group_id = g.id),
    m.joined_at
  from public.leaderboard_group_members m
  join public.leaderboard_groups g on g.id = m.group_id
  where m.user_id = auth.uid()
  order by m.joined_at, g.name;
$my_leaderboard_groups$;

revoke all on function public.create_leaderboard_group(text) from public, anon;
revoke all on function public.join_leaderboard_group(text) from public, anon;
revoke all on function public.leave_leaderboard_group(uuid) from public, anon;
revoke all on function public.my_leaderboard_groups() from public, anon;
grant execute on function public.create_leaderboard_group(text) to authenticated;
grant execute on function public.join_leaderboard_group(text) to authenticated;
grant execute on function public.leave_leaderboard_group(uuid) to authenticated;
grant execute on function public.my_leaderboard_groups() to authenticated;

-- Preserve current behavior: the first time this runs, put every existing
-- user into one 'Family' group (everyone already saw everyone).
do $seed_family_group$
declare
  v_group uuid;
  attempts integer := 0;
begin
  if exists (select 1 from public.leaderboard_groups) then
    return;
  end if;

  loop
    attempts := attempts + 1;
    begin
      insert into public.leaderboard_groups (name, join_code, created_by)
      values ('Family', public.generate_leaderboard_join_code(), null)
      returning id into v_group;
      exit;
    exception when unique_violation then
      if attempts >= 10 then raise; end if;
    end;
  end loop;

  insert into public.leaderboard_group_members (group_id, user_id)
  select v_group, u.id from public.users u
  on conflict do nothing;
end
$seed_family_group$;

-- family_leaderboard: identical scoring to leaderboard.sql. Changes: the user
-- filter (caller + anyone sharing at least one group with the caller), and
-- the streak skips the current week while it has no credit yet (see below).
create or replace function public.family_leaderboard(as_of date default current_date)
returns table (
  user_id uuid,
  name text,
  weekly_score numeric,
  monthly_score numeric,
  streak integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_week_start date;
  v_week_end date;
  v_month_start date;
  v_month_end date;
  r record;
  w_start date;
  w_end date;
  score numeric;
  sum_scores numeric;
  week_count integer;
  s integer;
begin
  if v_uid is null then
    return;
  end if;

  -- Monday–Sunday week containing as_of (dow: 0=Sun … 6=Sat).
  v_week_start := as_of - ((extract(dow from as_of)::integer + 6) % 7);
  v_week_end := v_week_start + 6;

  v_month_start := date_trunc('month', as_of::timestamp)::date;
  v_month_end := (date_trunc('month', as_of::timestamp) + interval '1 month - 1 day')::date;

  for r in
    select u.id, u.name
    from users u
    where u.id = v_uid
       or exists (
         select 1
         from leaderboard_group_members mine
         join leaderboard_group_members theirs
           on theirs.group_id = mine.group_id
         where mine.user_id = v_uid
           and theirs.user_id = u.id
       )
    order by u.name
  loop
    user_id := r.id;
    name := r.name;
    weekly_score := public.week_score_for(r.id, v_week_start, v_week_end);

    -- Average weekly scores for Mon–Sun weeks that overlap this calendar month.
    -- Weeks with no scheduled workouts (NULL score) are omitted so idle weeks
    -- don't dilute someone who only trained part of the month.
    sum_scores := 0;
    week_count := 0;
    w_start := v_month_start - ((extract(dow from v_month_start)::integer + 6) % 7);
    while w_start <= v_month_end loop
      w_end := w_start + 6;
      if w_end >= v_month_start and w_start <= v_month_end then
        score := public.week_score_for(r.id, w_start, w_end);
        if score is not null then
          sum_scores := sum_scores + score;
          week_count := week_count + 1;
        end if;
      end if;
      w_start := w_start + 7;
    end loop;

    monthly_score := case
      when week_count = 0 then 0::numeric
      else sum_scores / week_count
    end;

    -- Consecutive weeks with score > 0, walking back from the current week.
    -- NULL (no schedule) or 0% breaks the streak. The current week is still
    -- in progress, so if it has no credit yet it neither counts nor breaks
    -- the streak — counting starts at last week instead (otherwise every
    -- streak dropped to 0 each Monday).
    s := 0;
    w_start := v_week_start;
    score := public.week_score_for(r.id, v_week_start, v_week_end);
    if score is null or score <= 0 then
      w_start := v_week_start - 7;
    end if;
    loop
      score := public.week_score_for(r.id, w_start, w_start + 6);
      exit when score is null or score <= 0;
      s := s + 1;
      w_start := w_start - 7;
      exit when s >= 104;
    end loop;
    streak := s;

    -- Display current week as 0% when nothing is scheduled.
    if weekly_score is null then
      weekly_score := 0;
    end if;

    return next;
  end loop;
end;
$$;

revoke all on function public.family_leaderboard(date) from public;
revoke all on function public.family_leaderboard(date) from anon;
grant execute on function public.family_leaderboard(date) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 8. logs.weight_unit
-- ═════════════════════════════════════════════════════════════════════════
-- Unit the set's actual_weight was entered in. NULL = legacy rows, which were
-- all pounds. The app converts to the user's display unit when reading.
-- Existing logs_* RLS policies already cover this column.

alter table public.logs
  add column if not exists weight_unit text;

alter table public.logs drop constraint if exists logs_weight_unit_check;
alter table public.logs
  add constraint logs_weight_unit_check
  check (weight_unit is null or weight_unit in ('lb', 'kg'));

-- ═════════════════════════════════════════════════════════════════════════
-- 9. Coach exercise demo media
-- ═════════════════════════════════════════════════════════════════════════
-- Coaches attach photos / videos / links that show athletes how to do an
-- exercise (TrueCoach-style). Two scopes:
--   * exercise_id set         → the coach's default demo for that exercise,
--                               shown wherever any of their ACTIVE athletes
--                               has the exercise in a workout.
--   * workout_exercise_id set → specific to one prescribed exercise in one
--                               athlete's workout.
-- Files live in the private 'exercise-media' bucket at
-- '<coach uid>/<uuid>.<ext>'; the app reads them via short-lived signed URLs.
-- Storage objects are NOT deleted by the cascades below (Supabase blocks SQL
-- deletes on storage.objects) — the app removes the file when a coach deletes
-- a media row; files orphaned by a cascade can be cleaned up from the
-- dashboard (Storage → exercise-media).

-- 9a. Bucket. 50 MB per file is the Supabase FREE plan's global per-file cap
-- (a bucket limit cannot exceed it); free plan storage is 1 GB in total, so
-- long videos should be YouTube/Vimeo/Drive links instead. Re-running resets
-- the bucket to private with these limits.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-media',
  'exercise-media',
  false,
  52428800, -- 50 MB
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 9b. Table.
create table if not exists public.exercise_media (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.users(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete cascade,
  workout_exercise_id uuid references public.workout_exercises(id) on delete cascade,
  kind text not null check (kind in ('image', 'video', 'link')),
  storage_path text,
  external_url text,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.exercise_media drop constraint if exists exercise_media_one_target;
alter table public.exercise_media
  add constraint exercise_media_one_target
  check ((exercise_id is null) <> (workout_exercise_id is null));

alter table public.exercise_media drop constraint if exists exercise_media_kind_source;
alter table public.exercise_media
  add constraint exercise_media_kind_source
  check (
    (kind in ('image', 'video') and storage_path is not null and external_url is null)
    or (kind = 'link' and external_url is not null and storage_path is null)
  );

-- Files must sit in the owning coach's folder: '<coach uid>/<file>'.
alter table public.exercise_media drop constraint if exists exercise_media_storage_path_check;
alter table public.exercise_media
  add constraint exercise_media_storage_path_check
  check (
    storage_path is null
    or (split_part(storage_path, '/', 1) = coach_id::text
        and storage_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,200}$')
  );

alter table public.exercise_media drop constraint if exists exercise_media_external_url_check;
alter table public.exercise_media
  add constraint exercise_media_external_url_check
  check (
    external_url is null
    or (external_url ~* '^https://[^[:space:]]+$' and char_length(external_url) <= 2000)
  );

alter table public.exercise_media drop constraint if exists exercise_media_caption_check;
alter table public.exercise_media
  add constraint exercise_media_caption_check
  check (caption is null or char_length(caption) <= 280);

create index if not exists idx_exercise_media_exercise_coach
  on public.exercise_media(exercise_id, coach_id);
create index if not exists idx_exercise_media_workout_exercise
  on public.exercise_media(workout_exercise_id);
create index if not exists idx_exercise_media_coach
  on public.exercise_media(coach_id);

alter table public.exercise_media enable row level security;
revoke all on public.exercise_media from anon;

-- 9c. SECURITY DEFINER helpers (no nested RLS on users / workouts /
-- coach_athletes from inside the policies).

-- Caller has users.is_coach.
create or replace function public.is_coach_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $is_coach_user$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_coach
  );
$is_coach_user$;

-- Athlete (workouts.user_id) who owns a workout_exercises row.
create or replace function public.workout_exercise_owner(p_workout_exercise_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $workout_exercise_owner$
  select w.user_id
  from public.workout_exercises we
  join public.workouts w on w.id = we.workout_id
  where we.id = p_workout_exercise_id;
$workout_exercise_owner$;

-- Caller is an ACTIVE athlete of p_coach_id.
create or replace function public.has_active_coach(p_coach_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $has_active_coach$
  select exists (
    select 1 from public.coach_athletes ca
    where ca.coach_id = p_coach_id
      and ca.athlete_id = auth.uid()
      and ca.status = 'active'
  );
$has_active_coach$;

-- Same, keyed by a storage folder name (text, so a malformed folder never
-- raises a uuid cast error inside a storage policy).
create or replace function public.has_active_coach_folder(p_folder text)
returns boolean
language sql
stable
security definer
set search_path = public
as $has_active_coach_folder$
  select exists (
    select 1 from public.coach_athletes ca
    where ca.coach_id::text = p_folder
      and ca.athlete_id = auth.uid()
      and ca.status = 'active'
  );
$has_active_coach_folder$;

revoke all on function public.is_coach_user() from public, anon;
revoke all on function public.workout_exercise_owner(uuid) from public, anon;
revoke all on function public.has_active_coach(uuid) from public, anon;
revoke all on function public.has_active_coach_folder(text) from public, anon;
grant execute on function public.is_coach_user() to authenticated;
grant execute on function public.workout_exercise_owner(uuid) to authenticated;
grant execute on function public.has_active_coach(uuid) to authenticated;
grant execute on function public.has_active_coach_folder(text) to authenticated;

-- 9d. exercise_media policies.
drop policy if exists exercise_media_select_coach on public.exercise_media;
drop policy if exists exercise_media_select_athlete on public.exercise_media;
drop policy if exists exercise_media_insert_coach on public.exercise_media;
drop policy if exists exercise_media_update_coach on public.exercise_media;
drop policy if exists exercise_media_delete_coach on public.exercise_media;

create policy exercise_media_select_coach on public.exercise_media
  for select to authenticated
  using (coach_id = (select auth.uid()) and (select public.is_coach_user()));

-- Athlete: only media from a coach they are ACTIVELY linked to, and only
-- exercise-level defaults or items attached to their own workouts.
create policy exercise_media_select_athlete on public.exercise_media
  for select to authenticated
  using (
    public.has_active_coach(coach_id)
    and (
      exercise_id is not null
      or public.workout_exercise_owner(workout_exercise_id) = (select auth.uid())
    )
  );

-- Writes: coach only, own rows only; workout-specific media only on a
-- workout of a currently ACTIVE athlete; exercise-level media only for an
-- exercise the coach can see.
create policy exercise_media_insert_coach on public.exercise_media
  for insert to authenticated
  with check (
    coach_id = (select auth.uid())
    and (select public.is_coach_user())
    and (
      workout_exercise_id is null
      or public.is_active_coach_of(public.workout_exercise_owner(workout_exercise_id))
    )
    and (
      exercise_id is null
      or exists (select 1 from public.exercises e where e.id = exercise_media.exercise_id)
    )
  );

create policy exercise_media_update_coach on public.exercise_media
  for update to authenticated
  using (coach_id = (select auth.uid()) and (select public.is_coach_user()))
  with check (
    coach_id = (select auth.uid())
    and (select public.is_coach_user())
    and (
      workout_exercise_id is null
      or public.is_active_coach_of(public.workout_exercise_owner(workout_exercise_id))
    )
    and (
      exercise_id is null
      or exists (select 1 from public.exercises e where e.id = exercise_media.exercise_id)
    )
  );

create policy exercise_media_delete_coach on public.exercise_media
  for delete to authenticated
  using (coach_id = (select auth.uid()) and (select public.is_coach_user()));

-- 9e. storage.objects policies for the 'exercise-media' bucket.
-- Path convention '<coach uid>/<uuid>.<ext>'. Only coaches write, only into
-- their own folder. Readers: the folder owner, or an athlete whose ACTIVE
-- coach owns the folder (signed URLs require SELECT on the object).
drop policy if exists exercise_media_objects_select on storage.objects;
drop policy if exists exercise_media_objects_insert on storage.objects;
drop policy if exists exercise_media_objects_update on storage.objects;
drop policy if exists exercise_media_objects_delete on storage.objects;

create policy exercise_media_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'exercise-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.has_active_coach_folder((storage.foldername(name))[1])
    )
  );

create policy exercise_media_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'exercise-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_coach_user())
  );

create policy exercise_media_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'exercise-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_coach_user())
  )
  with check (
    bucket_id = 'exercise-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_coach_user())
  );

create policy exercise_media_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'exercise-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_coach_user())
  );

notify pgrst, 'reload schema';
