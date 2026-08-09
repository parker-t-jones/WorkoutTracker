const STORAGE_KEY = 'wt-distance-unit'

/** @returns {'mi' | 'km'} */
export function getDistanceUnit() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'km' ? 'km' : 'mi'
  } catch {
    return 'mi'
  }
}

/** @param {'mi' | 'km'} unit */
export function setDistanceUnit(unit) {
  const next = unit === 'km' ? 'km' : 'mi'
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* ignore */
  }
  document.dispatchEvent(
    new CustomEvent('wt-distance-unit-change', { detail: next }),
  )
  return next
}

export function distanceUnitLabel(unit = getDistanceUnit()) {
  return unit === 'km' ? 'km' : 'mi'
}

/** Convert distance between mi and km. */
export function convertDistance(value, fromUnit, toUnit) {
  const n = Number(value)
  if (!Number.isFinite(n)) return n
  if (fromUnit === toUnit) return n
  if (fromUnit === 'mi' && toUnit === 'km') return n * 1.60934
  if (fromUnit === 'km' && toUnit === 'mi') return n / 1.60934
  return n
}

/** Format seconds as m:ss or h:mm:ss. */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  return `${m}:${String(sec).padStart(2, '0')}`
}

/** Parse "mm:ss" or "h:mm:ss" or plain seconds into seconds. */
export function parseDurationInput(raw) {
  const str = String(raw ?? '').trim()
  if (!str) return null
  if (/^\d+$/.test(str)) return Number(str)
  const parts = str.split(':').map((p) => Number(p))
  if (parts.some((p) => !Number.isFinite(p))) return null
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

/** Pace as m:ss per distance unit (e.g. "7:30"). */
export function computePace(durationSeconds, distance) {
  const dur = Number(durationSeconds)
  const dist = Number(distance)
  if (!Number.isFinite(dur) || !Number.isFinite(dist) || dist <= 0 || dur <= 0) {
    return null
  }
  const secPer = dur / dist
  const m = Math.floor(secPer / 60)
  const s = Math.round(secPer % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatDistance(value, unit = getDistanceUnit()) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  const rounded = Math.round(n * 100) / 100
  return `${rounded} ${distanceUnitLabel(unit)}`
}
