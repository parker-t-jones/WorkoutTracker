/**
 * Interval split bookkeeping shared by logging (UI completion) and adapt
 * (weekly analysis). Pure — no Supabase import, so it can run under node.
 *
 * split_number is 1-based and indexes into the FULL target_splits array
 * (work and recovery rows alike), matching LogCardio rows and
 * adapt.analyzeIntervalSplits. Only work rows count toward completion;
 * recovery rows can still be logged but are optional.
 */

export function isRecoverySplit(target) {
  return String(target?.label || 'work').toLowerCase() === 'recovery'
}

/** Set of split_numbers that are work bouts for this workout_exercise. */
export function workSplitNumbers(we) {
  const targets = Array.isArray(we?.target_splits) ? we.target_splits : []
  const out = new Set()
  if (targets.length > 0) {
    targets.forEach((t, i) => {
      if (!isRecoverySplit(t)) out.add(i + 1)
    })
    return out
  }
  const n = Number(we?.sets) || 0
  for (let i = 1; i <= n; i++) out.add(i)
  return out
}

/** Number of rows LogCardio shows (work + recovery). */
export function displayedSplitCount(we) {
  const targets = Array.isArray(we?.target_splits) ? we.target_splits : []
  return targets.length > 0 ? targets.length : Number(we?.sets) || 0
}

/** Distinct work splits logged among `splits` (already scoped to this exercise). */
export function countLoggedWorkSplits(we, splits) {
  const work = workSplitNumbers(we)
  const seen = new Set()
  for (const s of splits ?? []) {
    const n = Number(s.split_number)
    if (work.has(n)) seen.add(n)
  }
  return seen.size
}
