const STORAGE_KEY = 'wt-theme'

const THEME_COLORS = {
  dark: '#121110',
  light: '#F5F1EA',
}

export function getStoredPreference() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

export function getSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark'
}

export function resolveTheme() {
  return getStoredPreference() ?? getSystemTheme()
}

export function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', next)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = THEME_COLORS[next]
  document.dispatchEvent(new CustomEvent('wt-themechange', { detail: next }))
}

export function setThemePreference(theme) {
  const next = theme === 'light' ? 'light' : 'dark'
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* ignore quota / private mode */
  }
  applyTheme(next)
}

/** Apply resolved theme and follow system changes until the user picks explicitly. */
export function initTheme() {
  applyTheme(resolveTheme())

  const mq = window.matchMedia('(prefers-color-scheme: light)')
  const onChange = () => {
    if (getStoredPreference() == null) applyTheme(getSystemTheme())
  }
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

/** Read live CSS custom properties (for canvas/charts that can't use classes). */
export function readThemeVars() {
  const s = getComputedStyle(document.documentElement)
  const get = (name) => s.getPropertyValue(name).trim()
  return {
    bg: get('--bg'),
    surface: get('--surface'),
    surfaceAlt: get('--surface-alt'),
    orange: get('--orange'),
    orangeDim: get('--orange-dim'),
    text: get('--text'),
    textMuted: get('--text-muted'),
  }
}
