/**
 * Sign-in split (athlete vs coach) and a coach's Training/Coaching mode,
 * kept in sessionStorage. Routing state only: users.is_coach (returned by
 * ensureProfile) decides whether Coaching mode is offered, and the coach
 * RPCs / RLS enforce the real permissions server-side. The app cannot set
 * is_coach (users_guard_is_coach in 2026-11-hardening.sql).
 */

const ROLE_KEY = 'wt-sign-in-role'
const MODE_KEY = 'wt-app-mode'

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
