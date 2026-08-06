import { createClient } from '@supabase/supabase-js'

function normalizeSupabaseUrl(raw) {
  if (!raw) return null
  // Accept either project URL or accidental /rest/v1/ suffix from API docs.
  return raw.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
}

const url = normalizeSupabaseUrl(
  import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL,
)
const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY

export const supabase =
  url && anonKey ? createClient(url, anonKey) : null
