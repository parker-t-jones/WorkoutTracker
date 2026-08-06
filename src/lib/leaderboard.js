import { supabase } from './supabase'

/** Local calendar date as YYYY-MM-DD (matches Progress week boundaries). */
export function localDateKey(from = new Date()) {
  const y = from.getFullYear()
  const m = String(from.getMonth() + 1).padStart(2, '0')
  const d = String(from.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatScorePercent(score) {
  const n = Number(score)
  if (!Number.isFinite(n)) return '0%'
  return `${Math.round(n * 100)}%`
}

/**
 * Rank rows by weekly or monthly score, then streak desc, then name.
 */
export function rankLeaderboard(rows, sortBy = 'weekly') {
  const key = sortBy === 'monthly' ? 'monthly_score' : 'weekly_score'
  return [...(rows ?? [])].sort((a, b) => {
    const scoreDiff = Number(b[key]) - Number(a[key])
    if (scoreDiff !== 0) return scoreDiff
    const streakDiff = (b.streak ?? 0) - (a.streak ?? 0)
    if (streakDiff !== 0) return streakDiff
    return String(a.name).localeCompare(String(b.name))
  })
}

/**
 * Live family leaderboard aggregates (name + scores + streak only).
 * Requires supabase/leaderboard.sql to be applied.
 */
export async function fetchFamilyLeaderboard(asOf = new Date()) {
  if (!supabase) {
    throw new Error('Missing Supabase config')
  }

  const { data, error } = await supabase.rpc('family_leaderboard', {
    as_of: localDateKey(asOf),
  })

  if (error) throw error
  return data ?? []
}
