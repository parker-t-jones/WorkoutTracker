import { supabase } from './supabase'
import { loadProgramData } from './program'

/**
 * Coach ↔ athlete relationships. All status changes go through the
 * SECURITY DEFINER RPCs in supabase/2026-11-hardening.sql section 1 —
 * coach_athletes has no direct INSERT/UPDATE policies.
 */

function assertSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env',
    )
  }
  return supabase
}

function friendly(err, fallback) {
  const msg = err?.message || ''
  if (/function .* does not exist|could not find the function/i.test(msg)) {
    return new Error(
      'Coach features aren’t set up yet — run supabase/2026-11-hardening.sql.',
    )
  }
  return new Error(msg || fallback)
}

/**
 * Every relationship the signed-in user is part of, either side.
 * Row: { id, role: 'coach'|'athlete', other_user_id, other_name,
 *        other_email, status: 'pending'|'active'|'revoked', created_at }
 * `role` is the CALLER's role in that link.
 */
export async function listMyCoachLinks() {
  const client = assertSupabase()
  const { data, error } = await client.rpc('list_my_coach_links')
  if (error) throw friendly(error, 'Could not load coaching links')
  return data ?? []
}

/** Coach invites an existing account by email. Returns the link id. */
export async function inviteAthleteByEmail(email) {
  const client = assertSupabase()
  const clean = (email || '').trim()
  if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    throw new Error('Enter a valid email address.')
  }
  const { data, error } = await client.rpc('invite_athlete_by_email', {
    p_email: clean,
  })
  if (error) {
    if (/no account with that email/i.test(error.message || '')) {
      throw new Error(
        'No account with that email yet. Ask them to sign up and open the app once, then invite again.',
      )
    }
    throw friendly(error, 'Could not send invite')
  }
  return data
}

/** Athlete accepts (true) or declines (false) a pending invite. */
export async function respondToCoachInvite(linkId, accept) {
  const client = assertSupabase()
  const { data, error } = await client.rpc('respond_to_coach_invite', {
    p_id: linkId,
    p_accept: Boolean(accept),
  })
  if (error) throw friendly(error, 'Could not respond to invite')
  return data
}

/** Either side ends a pending or active relationship. */
export async function endCoachRelationship(linkId) {
  const client = assertSupabase()
  const { data, error } = await client.rpc('end_coach_relationship', {
    p_id: linkId,
  })
  if (error) throw friendly(error, 'Could not end coaching')
  return data
}

/** Group links where the caller is the coach by status. */
export function groupAthleteLinks(links) {
  const groups = { active: [], pending: [], revoked: [] }
  for (const l of links ?? []) {
    if (l.role !== 'coach') continue
    ;(groups[l.status] ?? groups.revoked).push(l)
  }
  const byName = (a, b) =>
    String(a.other_name || a.other_email || '').localeCompare(
      String(b.other_name || b.other_email || ''),
    )
  groups.active.sort(byName)
  groups.pending.sort(byName)
  return groups
}

/**
 * An athlete's program as their coach sees it (read-only).
 *
 * loadProgramData scopes every query by user_id explicitly, and coach_mode.sql
 * grants an ACTIVE coach SELECT on that athlete's workouts,
 * scheduled_workouts, workout_exercises, logs and log_splits (and
 * exercise_used_in_visible_workout covers custom exercises) — so reusing it
 * with the athlete's id returns exactly that athlete's data, or nothing once
 * the link is no longer active.
 */
export async function loadAthleteProgram(athleteUserId) {
  if (!athleteUserId) throw new Error('No athlete selected')
  return loadProgramData(athleteUserId)
}

/** Local YYYY-MM-DD (scheduled_workouts.date is a plain date). */
export function todayIso(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Split an athlete's schedule into upcoming (today onward, soonest first)
 * and recent (before today, newest first).
 */
export function splitSchedule(scheduledWorkouts, { upcomingLimit = 14, recentLimit = 14 } = {}) {
  const today = todayIso()
  const sorted = (scheduledWorkouts ?? [])
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const upcoming = sorted.filter((s) => s.date >= today).slice(0, upcomingLimit)
  const recent = sorted
    .filter((s) => s.date < today)
    .reverse()
    .slice(0, recentLimit)
  return { upcoming, recent }
}
