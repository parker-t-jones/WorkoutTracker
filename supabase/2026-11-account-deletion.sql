-- 2026-11 account deletion (App Store guideline 5.1.1(v)).
-- Run in the Supabase SQL editor AFTER 2026-11-notes-and-editing.sql.
-- Safe to re-run. If you re-run an older file, re-run 2026-11-hardening.sql,
-- 2026-11-notes-and-editing.sql and then this one.
--
-- Goal: `delete from auth.users where id = …` (what auth.admin.deleteUser()
-- does, and what the delete-account Edge Function calls) always succeeds and
-- removes every row of that user's personal data, while other users' data
-- survives.
--
-- Sections:
--   1. Every foreign key that leads to a user gets the right ON DELETE action
--      (looked up by table/column in pg_constraint — names are not assumed)
--   2. Warn about any other FK to a user this file doesn't know about
--   3. Before-delete cleanup on public.users: private custom exercises nobody
--      else uses, and leaderboard groups left with no members
--
-- Per-FK decisions (→ users = public.users(id), which itself → auth.users):
--   users.id → auth.users                      CASCADE  (the whole chain starts here)
--   workouts.user_id, scheduled_workouts.user_id,
--   logs.user_id, exercise_notes.user_id,
--   coach_athletes.coach_id / .athlete_id,
--   workout_templates.coach_id,
--   leaderboard_group_members.user_id,
--   exercise_media.coach_id                    CASCADE  (personal data)
--   workout_exercises / logs / log_splits /
--   scheduled_workouts / exercise_notes /
--   exercise_media / template_exercises /
--   leaderboard_group_members parent links     CASCADE  (go with their parent)
--   workouts.created_by                        SET NULL (a deleted coach's workouts
--                                                       stay with the athlete and become
--                                                       athlete-owned: the edit guard
--                                                       treats NULL as "built by the owner")
--   leaderboard_groups.created_by              SET NULL (group survives for the others)
--   exercises.owner_id                         SET NULL (see below; was NO ACTION, which
--                                                       made deleting any coach fail)
--   workout_exercises.exercise_id,
--   template_exercises.exercise_id             unchanged, NO ACTION (protects history)
--   proposed_substitutions, substitutions      no user column: shared catalog data,
--                                                       nothing personal, unchanged
--
-- exercises.owner_id → SET NULL. A coach's custom exercise that is still used
-- in someone else's workout (or template) is kept so their history keeps its
-- name; it becomes a shared exercise with no owner. Consequences, checked
-- against the RLS and indexes:
--   * exercises_select_visible lets every signed-in user read owner_id IS NULL
--     rows, so it shows up in everyone's exercise library. Only the exercise
--     itself is exposed (name, pattern, muscle group, equipment, tags); there
--     is no link back to the coach.
--   * Nobody can edit or delete it through the API any more
--     (exercises_update_own / _delete_own require owner_id = auth.uid()); only
--     the SQL editor can.
--   * exercises.name is unique across ALL rows (exercises_name_key), private
--     or not, so turning a private row shared can never create a duplicate
--     name. ensure_shared_exercise() may now return it for that name, which
--     is the intended behaviour for a shared exercise.
--   * exercise_media rows of OTHER coaches on that exercise keep working.
-- Custom exercises that no remaining workout or template uses are deleted
-- outright (section 3), so they do not leak into the shared library.

-- ═════════════════════════════════════════════════════════════════════════
-- 1. ON DELETE actions
-- ═════════════════════════════════════════════════════════════════════════
do $account_deletion_fks$
declare
  spec record;
  con record;
  v_found boolean;
  v_action text;
  v_name text;
begin
  for spec in
    select * from (values
      -- table,                       column,                ref table,                     ref col, action (c = cascade, n = set null)
      ('public.users',                'id',                  'auth.users',                  'id',    'c'),
      ('public.workouts',             'user_id',             'public.users',                'id',    'c'),
      ('public.workouts',             'created_by',          'public.users',                'id',    'n'),
      ('public.scheduled_workouts',   'user_id',             'public.users',                'id',    'c'),
      ('public.scheduled_workouts',   'workout_id',          'public.workouts',             'id',    'c'),
      ('public.workout_exercises',    'workout_id',          'public.workouts',             'id',    'c'),
      ('public.logs',                 'user_id',             'public.users',                'id',    'c'),
      ('public.logs',                 'workout_exercise_id', 'public.workout_exercises',    'id',    'c'),
      ('public.log_splits',           'log_id',              'public.logs',                 'id',    'c'),
      ('public.coach_athletes',       'coach_id',            'public.users',                'id',    'c'),
      ('public.coach_athletes',       'athlete_id',          'public.users',                'id',    'c'),
      ('public.exercises',            'owner_id',            'public.users',                'id',    'n'),
      ('public.workout_templates',    'coach_id',            'public.users',                'id',    'c'),
      ('public.template_exercises',   'template_id',         'public.workout_templates',    'id',    'c'),
      ('public.leaderboard_groups',   'created_by',          'public.users',                'id',    'n'),
      ('public.leaderboard_group_members', 'user_id',        'public.users',                'id',    'c'),
      ('public.leaderboard_group_members', 'group_id',       'public.leaderboard_groups',   'id',    'c'),
      ('public.exercise_media',       'coach_id',            'public.users',                'id',    'c'),
      ('public.exercise_media',       'workout_exercise_id', 'public.workout_exercises',    'id',    'c'),
      ('public.exercise_notes',       'user_id',             'public.users',                'id',    'c'),
      ('public.exercise_notes',       'workout_exercise_id', 'public.workout_exercises',    'id',    'c')
    ) as t(tbl, col, ref_tbl, ref_col, action)
  loop
    -- Older databases may not have every table / column yet.
    if to_regclass(spec.tbl) is null or to_regclass(spec.ref_tbl) is null
       or not exists (
         select 1 from pg_attribute
          where attrelid = to_regclass(spec.tbl)
            and attname = spec.col and not attisdropped
       ) then
      raise notice 'account-deletion: %.% not present, skipped', spec.tbl, spec.col;
      continue;
    end if;

    v_action := case spec.action when 'c' then 'cascade' else 'set null' end;
    v_found := false;

    -- Every single-column FK on (tbl.col) → ref_tbl, whatever it is called
    -- (some databases have two, e.g. users_id_fkey and users_id_auth_fkey).
    for con in
      select c.conname, c.confdeltype
        from pg_constraint c
       where c.contype = 'f'
         and c.conrelid = to_regclass(spec.tbl)
         and c.confrelid = to_regclass(spec.ref_tbl)
         and array_length(c.conkey, 1) = 1
         and c.conkey[1] = (
           select attnum from pg_attribute
            where attrelid = to_regclass(spec.tbl) and attname = spec.col
         )
    loop
      v_found := true;
      if con.confdeltype <> spec.action then
        -- One statement, so there is no moment without the constraint.
        execute format(
          'alter table %s drop constraint %I, add constraint %I foreign key (%I) references %s(%I) on delete %s',
          spec.tbl, con.conname, con.conname, spec.col, spec.ref_tbl, spec.ref_col, v_action);
        raise notice 'account-deletion: % now ON DELETE %', con.conname, v_action;
      end if;
    end loop;

    if not v_found then
      v_name := format('%s_%s_fkey', split_part(spec.tbl, '.', 2), spec.col);
      if exists (select 1 from pg_constraint
                  where conname = v_name and conrelid = to_regclass(spec.tbl)) then
        v_name := v_name || '_del';
      end if;
      execute format(
        'alter table %s add constraint %I foreign key (%I) references %s(%I) on delete %s',
        spec.tbl, v_name, spec.col, spec.ref_tbl, spec.ref_col, v_action);
      raise notice 'account-deletion: added % ON DELETE %', v_name, v_action;
    end if;
  end loop;
end
$account_deletion_fks$;

-- ═════════════════════════════════════════════════════════════════════════
-- 2. Unknown FKs to a user
-- ═════════════════════════════════════════════════════════════════════════
-- A NO ACTION / RESTRICT FK to public.users or auth.users that this file
-- does not know about (e.g. added by hand) would make account deletion fail.
do $account_deletion_unknown_fks$
declare
  con record;
begin
  for con in
    select c.conrelid::regclass as tbl, c.conname
      from pg_constraint c
     where c.contype = 'f'
       and c.confrelid in (to_regclass('public.users'), to_regclass('auth.users'))
       and c.confdeltype not in ('c', 'n', 'd')
       and c.connamespace <> 'auth'::regnamespace
  loop
    raise warning 'account-deletion: % on % blocks deleting a user (no ON DELETE action) — decide cascade / set null for it',
      con.conname, con.tbl;
  end loop;
end
$account_deletion_unknown_fks$;

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Before-delete cleanup on public.users
-- ═════════════════════════════════════════════════════════════════════════
-- Runs inside the same delete (also when it cascades from auth.users).
--   a. The user's own workouts and templates go first (the cascades would
--      remove them anyway) so their references to the user's custom
--      exercises are gone before (b).
--   b. Custom exercises no remaining workout or template uses are deleted;
--      the rest are kept and lose their owner via exercises.owner_id
--      ON DELETE SET NULL. Their exercise_media / substitutions cascade.
--   c. Leaderboard groups this user created or belongs to that would be left
--      with no other member are deleted (name + join code are theirs).
create or replace function public.users_before_delete_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $users_before_delete_cleanup$
begin
  delete from public.workouts where user_id = old.id;
  delete from public.workout_templates where coach_id = old.id;

  -- Kept (owner set NULL) when still used anywhere. A pending proposal that
  -- names it as the substitute keeps it too: that FK is SET NULL and the
  -- row's check constraint would reject a NULL substitute without a name.
  delete from public.exercises e
   where e.owner_id = old.id
     and not exists (select 1 from public.workout_exercises we where we.exercise_id = e.id)
     and not exists (select 1 from public.template_exercises te where te.exercise_id = e.id)
     and not exists (select 1 from public.proposed_substitutions ps
                      where ps.substitute_exercise_id = e.id);

  delete from public.leaderboard_groups g
   where (g.created_by = old.id
          or exists (select 1 from public.leaderboard_group_members m
                      where m.group_id = g.id and m.user_id = old.id))
     and not exists (select 1 from public.leaderboard_group_members m
                      where m.group_id = g.id and m.user_id <> old.id);

  return old;
end
$users_before_delete_cleanup$;

revoke all on function public.users_before_delete_cleanup() from public, anon, authenticated;

drop trigger if exists users_before_delete_cleanup on public.users;
create trigger users_before_delete_cleanup
  before delete on public.users
  for each row execute function public.users_before_delete_cleanup();

notify pgrst, 'reload schema';
