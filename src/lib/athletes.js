import { supabase } from './supabase'

function assertSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env',
    )
  }
  return supabase
}

/**
 * Active athletes for a coach, with users display fields when RLS allows.
 * Disambiguates the users embed via the athlete_id FK (coach_id also points at users).
 */
export async function loadActiveRoster(coachId) {
  const client = assertSupabase()
  if (!coachId) throw new Error('Not signed in')

  const { data, error } = await client
    .from('coach_athletes')
    .select(
      `
      id,
      athlete_id,
      invited_contact,
      created_at,
      athlete:users!athlete_id (
        id,
        name,
        goal,
        experience_level,
        days_per_week,
        equipment_access
      )
    `,
    )
    .eq('coach_id', coachId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data ?? []).map((row) => {
    const profile = row.athlete
    return {
      linkId: row.id,
      id: row.athlete_id,
      name: profile?.name || row.invited_contact || 'Athlete',
      goal: profile?.goal ?? null,
      experienceLevel: profile?.experience_level ?? null,
      daysPerWeek: profile?.days_per_week ?? null,
      equipmentAccess: profile?.equipment_access ?? null,
    }
  })
}
