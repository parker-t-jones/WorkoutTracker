-- Extend users profile for expanded onboarding (age, bodyweight, session length, notes).
-- Safe to re-run.

alter table users add column if not exists age integer;
alter table users add column if not exists bodyweight numeric;
alter table users add column if not exists bodyweight_unit text
  check (bodyweight_unit is null or bodyweight_unit in ('lb', 'kg'));
alter table users add column if not exists session_length text;
alter table users add column if not exists additional_notes text;
