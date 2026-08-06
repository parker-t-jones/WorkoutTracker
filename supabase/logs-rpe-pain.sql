-- Additive columns for adaptive programming data capture.
-- Safe to re-run. Run in the Supabase SQL editor after schema.sql.

alter table public.logs
  add column if not exists rpe integer;

alter table public.logs
  add column if not exists pain_flag boolean not null default false;

alter table public.logs
  add column if not exists pain_note text;

-- Drop/recreate check so re-runs stay idempotent.
alter table public.logs drop constraint if exists logs_rpe_check;
alter table public.logs
  add constraint logs_rpe_check check (rpe is null or (rpe >= 1 and rpe <= 10));
