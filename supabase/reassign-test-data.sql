-- Reassign v1 test-user data to your real auth account.
-- Run this in the SQL editor AFTER you sign up, BEFORE running auth.sql
-- (auth.sql adds a FK from public.users.id → auth.users.id).
--
-- 1. Sign up in the app (or Authentication → Users). Copy your new uid.
-- 2. Fill in the two UUIDs below.
-- 3. Run this script.
-- 4. Then run auth.sql.

-- Existing test profile (the random uuid from before auth):
--   select id, name, goal from public.users;
-- New auth uid:
--   Authentication → Users → copy the UUID

do $$
declare
  old_id uuid := 'f1b34ce5-25bc-42ac-8fd3-94c54923866c'; -- <-- replace
  new_id uuid := 'dc2c8c54-acba-4aa6-8a9a-622b28270360'; -- <-- replace
begin
  if old_id = new_id then
    raise notice 'IDs are the same — nothing to do';
    return;
  end if;

  if not exists (select 1 from auth.users where id = new_id) then
    raise exception 'No auth.users row for %. Sign up first.', new_id;
  end if;

  if not exists (select 1 from public.users where id = old_id) then
    raise exception 'No public.users row for old id %', old_id;
  end if;

  -- Drop an empty stub created on first login (no child rows).
  if exists (select 1 from public.users where id = new_id) then
    if exists (select 1 from public.workouts where user_id = new_id)
       or exists (select 1 from public.scheduled_workouts where user_id = new_id)
       or exists (select 1 from public.logs where user_id = new_id) then
      raise exception 'New user % already has workouts/logs — aborting to avoid merge conflicts', new_id;
    end if;
    delete from public.users where id = new_id;
  end if;

  insert into public.users (id, name, goal, experience_level, days_per_week, equipment_access, limitations)
  select new_id, name, goal, experience_level, days_per_week, equipment_access, limitations
  from public.users
  where id = old_id;

  update public.workouts set user_id = new_id where user_id = old_id;
  update public.scheduled_workouts set user_id = new_id where user_id = old_id;
  update public.logs set user_id = new_id where user_id = old_id;

  delete from public.users where id = old_id;

  raise notice 'Reassigned data from % to %', old_id, new_id;
end $$;
