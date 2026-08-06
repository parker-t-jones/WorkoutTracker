-- Family leaderboard: aggregate scores only (no raw workout/log rows).
-- Run in the Supabase SQL editor after schema.sql + auth.sql.
--
-- SECURITY DEFINER bypasses per-user RLS so any authenticated family member
-- can read name + scores + streak — nothing else.

create or replace function public.week_score_for(
  p_user_id uuid,
  p_week_start date,
  p_week_end date
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with sw as (
    select id, workout_id, status
    from scheduled_workouts
    where user_id = p_user_id
      and date >= p_week_start
      and date <= p_week_end
  ),
  workout_stats as (
    select
      count(*)::numeric as total,
      count(*) filter (where status = 'completed')::numeric as completed
    from sw
  ),
  we as (
    select we.id
    from workout_exercises we
    where we.workout_id in (select workout_id from sw)
  ),
  exercise_stats as (
    select
      count(*)::numeric as total,
      count(*) filter (
        where exists (
          select 1
          from logs l
          where l.workout_exercise_id = we.id
            and l.user_id = p_user_id
        )
      )::numeric as completed
    from we
  )
  select
    case
      -- No scheduled work this week → NULL (omit from monthly average / breaks streak).
      when (select total from workout_stats) = 0 then null
      else
        (
          ((select completed from workout_stats) / (select total from workout_stats)) * 0.6
        )
        + (
          case
            when (select total from exercise_stats) = 0 then 0::numeric
            else
              ((select completed from exercise_stats) / (select total from exercise_stats)) * 0.4
          end
        )
    end;
$$;

revoke all on function public.week_score_for(uuid, date, date) from public;
revoke all on function public.week_score_for(uuid, date, date) from anon, authenticated;
-- Not granted to clients — only used inside family_leaderboard.

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
  -- Monday–Sunday week containing as_of (dow: 0=Sun … 6=Sat).
  v_week_start := as_of - ((extract(dow from as_of)::integer + 6) % 7);
  v_week_end := v_week_start + 6;

  v_month_start := date_trunc('month', as_of::timestamp)::date;
  v_month_end := (date_trunc('month', as_of::timestamp) + interval '1 month - 1 day')::date;

  for r in
    select u.id, u.name
    from users u
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
    -- NULL (no schedule) or 0% breaks the streak.
    s := 0;
    w_start := v_week_start;
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
