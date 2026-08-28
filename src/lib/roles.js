import { supabase } from './supabase'

const ROLE_KEY = 'wt-sign-in-role'
const MODE_KEY = 'wt-app-mode'

function assertSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env',
    )
  }
  return supabase
}

/** Look up is_coach and whether this user is an accepted athlete. */
export async function loadRoleContext(userId) {
  const client = assertSupabase()

  const { data: profile, error: profileError } = await client
    .from('users')
    .select('id, is_coach')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) throw profileError

  const { count, error: linkError } = await client
    .from('coach_athletes')
    .select('id', { count: 'exact', head: true })
    .eq('athlete_id', userId)
    .eq('status', 'active')

  if (linkError) throw linkError

  return {
    isCoach: Boolean(profile?.is_coach),
    hasActiveCoach: (count ?? 0) > 0,
  }
}

export function getIntendedRole() {
  try {
    const v = sessionStorage.getItem(ROLE_KEY)
    return v === 'athlete' || v === 'coach' ? v : null
  } catch {
    return null
  }
}

export function setIntendedRole(role) {
  try {
    if (role === 'athlete' || role === 'coach') {
      sessionStorage.setItem(ROLE_KEY, role)
    } else {
      sessionStorage.removeItem(ROLE_KEY)
    }
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearIntendedRole() {
  try {
    sessionStorage.removeItem(ROLE_KEY)
  } catch {
    /* ignore */
  }
}

export function getStoredAppMode() {
  try {
    const v = sessionStorage.getItem(MODE_KEY)
    return v === 'training' || v === 'coaching' ? v : null
  } catch {
    return null
  }
}

export function setStoredAppMode(mode) {
  try {
    if (mode === 'training' || mode === 'coaching') {
      sessionStorage.setItem(MODE_KEY, mode)
    } else {
      sessionStorage.removeItem(MODE_KEY)
    }
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearStoredAppMode() {
  try {
    sessionStorage.removeItem(MODE_KEY)
  } catch {
    /* ignore */
  }
}
