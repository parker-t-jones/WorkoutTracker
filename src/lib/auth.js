import { supabase } from './supabase'

function assertSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env',
    )
  }
  return supabase
}

export async function getSession() {
  const client = assertSupabase()
  const { data, error } = await client.auth.getSession()
  if (error) throw error
  return data.session
}

export function onAuthStateChange(callback) {
  const client = assertSupabase()
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    callback(session, _event)
  })
  return () => data.subscription.unsubscribe()
}

export async function signUp({ email, password }) {
  const client = assertSupabase()
  const { data, error } = await client.auth.signUp({ email, password })
  if (error) throw error
  return data
}

export async function signIn({ email, password }) {
  const client = assertSupabase()
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  })
  if (error) throw error
  return data
}

export async function signOut() {
  const client = assertSupabase()
  const { error } = await client.auth.signOut()
  if (error) throw error
}

export async function requestPasswordReset(email) {
  const client = assertSupabase()
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/`,
  })
  if (error) throw error
}

export async function updatePassword(password) {
  const client = assertSupabase()
  const { error } = await client.auth.updateUser({ password })
  if (error) throw error
}

/** Ensure a public.users row exists for this auth uid. */
export async function ensureProfile(authUser) {
  const client = assertSupabase()
  const { data: existing, error: selectErr } = await client
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle()

  if (selectErr) throw selectErr
  if (existing) return existing

  const name =
    authUser.user_metadata?.name ||
    authUser.email?.split('@')[0] ||
    'Athlete'

  const { data, error } = await client
    .from('users')
    .insert({ id: authUser.id, name })
    .select()
    .single()

  if (error) throw error
  return data
}
