/**
 * Rest timer helpers. The timer is stored as an absolute end timestamp in
 * sessionStorage so it survives re-renders, remounts and tab switches.
 */

export const DEFAULT_REST_SECONDS = 90
const STORAGE_KEY = 'wt-rest-timer'
const MIN_REST = 10
const MAX_REST = 600

const UNIT = '(seconds?|secs?|s|minutes?|mins?|m)'

function toSeconds(n, unit) {
  const value = Number(n)
  if (!Number.isFinite(value)) return null
  return /^m/i.test(unit) ? Math.round(value * 60) : Math.round(value)
}

function clampRest(sec) {
  if (sec == null || !Number.isFinite(sec)) return null
  if (sec < MIN_REST || sec > MAX_REST) return null
  return sec
}

/**
 * Parse a rest prescription from free text ("rest 90s", "2 min rest",
 * "Rest: 1:30", "rest 60-90 sec"). Returns seconds or null. A bare duration
 * ("2 min") is accepted only when nothing suggests it's a hold/tempo cue.
 */
export function parseRestSeconds(...texts) {
  const s = texts
    .filter((t) => t != null && t !== '')
    .map(String)
    .join(' · ')
  if (!s) return null

  // "rest 1:30"
  let m = s.match(/\brest\w*\s*(?:of|for|:)?\s*(\d{1,2}):(\d{2})\b/i)
  if (m) return clampRest(Number(m[1]) * 60 + Number(m[2]))

  // "rest 60-90s", "rest 90 sec", "rest 2 min"
  m = s.match(
    new RegExp(
      `\\brest\\w*\\s*(?:of|for|:)?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:(?:-|–|to)\\s*\\d+(?:\\.\\d+)?\\s*)?${UNIT}\\b`,
      'i',
    ),
  )
  if (m) return clampRest(toSeconds(m[1], m[2]))

  // "90s rest", "2-3 min rest", "2 min between sets"
  m = s.match(
    new RegExp(
      `\\b(\\d+(?:\\.\\d+)?)\\s*(?:(?:-|–|to)\\s*\\d+(?:\\.\\d+)?\\s*)?${UNIT}\\s*(?:of\\s*)?(?:rest|between)\\b`,
      'i',
    ),
  )
  if (m) return clampRest(toSeconds(m[1], m[2]))

  if (/\b(hold|plank|carry|tempo|eccentric|isometric|pause)\b/i.test(s)) {
    return null
  }
  m = s.match(/\b(\d+(?:\.\d+)?)\s*(minutes?|mins?|seconds?|secs?)\b/i)
  if (m) return clampRest(toSeconds(m[1], m[2]))
  return null
}

/** @returns {{ endAt: number, total: number, fired: boolean } | null} */
export function readRestTimer() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (!v || !Number.isFinite(v.endAt)) return null
    return {
      endAt: v.endAt,
      total: Number(v.total) || DEFAULT_REST_SECONDS,
      fired: Boolean(v.fired),
    }
  } catch {
    return null
  }
}

export function writeRestTimer(timer) {
  try {
    if (!timer) sessionStorage.removeItem(STORAGE_KEY)
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(timer))
  } catch {
    /* ignore — private mode etc. */
  }
  return timer
}

export function startRestTimer(seconds, now = Date.now()) {
  const total = Math.max(MIN_REST, Math.round(seconds) || DEFAULT_REST_SECONDS)
  return writeRestTimer({ endAt: now + total * 1000, total, fired: false })
}

export function adjustRestTimer(timer, deltaSeconds, now = Date.now()) {
  if (!timer) return null
  const base = Math.max(timer.endAt, now)
  const endAt = Math.max(now, base + deltaSeconds * 1000)
  return writeRestTimer({
    endAt,
    total: Math.max(1, timer.total + deltaSeconds),
    fired: endAt > now ? false : timer.fired,
  })
}
