import { supabase } from './supabase'

/**
 * In-app account deletion (App Store guideline 5.1.1(v)).
 * The work happens in the delete-account Edge Function
 * (supabase/functions/delete-account): it removes the user's uploaded files
 * and hard-deletes the auth user; the database rows go with it via the
 * ON DELETE rules in supabase/2026-11-account-deletion.sql.
 */

export const DELETE_CONFIRM_WORD = 'DELETE'
export const DELETE_ERROR =
  'Couldn’t delete your account — it is still active. Check your connection and try again.'

// Device-only keys this app writes (theme, units, dumbbell entry mode, rest
// timer) all start with 'wt-'; 'gym_user_id' is a legacy key.
const APP_KEY_PREFIX = 'wt-'
const LEGACY_KEYS = ['gym_user_id']

function assertSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env',
    )
  }
  return supabase
}

/**
 * Ask the server to delete the signed-in user's account. Resolves when the
 * account is gone; throws an Error with a user-facing message otherwise (the
 * account is then still intact).
 */
export async function deleteAccount() {
  const client = assertSupabase()
  const { data, error } = await client.functions.invoke('delete-account', {
    body: { confirm: DELETE_CONFIRM_WORD },
  })

  if (error) {
    console.error('delete-account failed:', error)
    let message = DELETE_ERROR
    try {
      const payload = await error.context?.json?.()
      if (typeof payload?.error === 'string') message = payload.error
    } catch {
      // ignore body parse failures
    }
    throw new Error(message)
  }

  if (!data?.deleted) {
    throw new Error(typeof data?.error === 'string' ? data.error : DELETE_ERROR)
  }
}

function clearStorage(storage, shouldRemove) {
  try {
    const keys = []
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i)
      if (key && shouldRemove(key)) keys.push(key)
    }
    keys.forEach((key) => storage.removeItem(key))
  } catch {
    // Storage unavailable (private mode etc.) — nothing to clear.
  }
}

/** Remove everything this app keeps on the device. */
export function clearLocalAppData() {
  const isAppKey = (key) => key.startsWith(APP_KEY_PREFIX) || LEGACY_KEYS.includes(key)
  clearStorage(window.localStorage, isAppKey)
  clearStorage(window.sessionStorage, isAppKey)
}

/**
 * After a successful deletion: drop the (now invalid) session on this device
 * and clear app data. The server-side session is already gone, so only a
 * local sign-out is attempted; onAuthStateChange then shows the auth screen.
 */
export async function signOutDeletedAccount() {
  clearLocalAppData()
  const client = assertSupabase()
  try {
    await client.auth.signOut({ scope: 'local' })
  } catch (err) {
    console.error('Local sign-out after deletion failed:', err)
    // Fall back to dropping the stored Supabase session by hand.
    clearStorage(window.localStorage, (key) => key.startsWith('sb-') && key.endsWith('-auth-token'))
    window.location.reload()
  }
}
