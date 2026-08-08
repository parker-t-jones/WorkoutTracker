import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchFamilyLeaderboard,
  formatScorePercent,
  rankLeaderboard,
} from '../lib/leaderboard'

export default function LeaderboardView({ currentUserId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortBy, setSortBy] = useState('weekly') // weekly | monthly

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchFamilyLeaderboard()
      setRows(data)
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Could not load leaderboard')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const ranked = useMemo(() => rankLeaderboard(rows, sortBy), [rows, sortBy])

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Leaderboard
        </h1>
        <p className="mt-1 text-sm text-muted">
          Family completion scores — live from current schedules
        </p>
      </header>

      <div className="mb-4 flex gap-1">
        {[
          { id: 'weekly', label: 'This week' },
          { id: 'monthly', label: 'This month' },
        ].map((opt) => {
          const selected = sortBy === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSortBy(opt.id)}
              className={[
                'flex-1 rounded py-2 text-sm font-medium',
                selected
                  ? 'bg-orange text-on-orange'
                  : 'bg-surface text-muted ring-1 ring-orange-dim/50 hover:bg-surface-alt hover:text-ink',
              ].join(' ')}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted">Loading…</p>
      ) : error ? (
        <div className="space-y-3">
          <p
            role="alert"
            className="rounded bg-danger-bg px-3 py-3 text-sm text-danger"
          >
            {error}
          </p>
          <button
            type="button"
            onClick={load}
            className="w-full rounded border border-orange-dim/50 bg-surface py-2 text-sm font-medium text-ink hover:bg-surface-alt"
          >
            Retry
          </button>
        </div>
      ) : ranked.length === 0 ? (
        <p className="rounded border border-dashed border-orange-dim/50 bg-surface px-4 py-8 text-center text-sm text-muted">
          No family members yet.
        </p>
      ) : (
        <ol className="space-y-2">
          {ranked.map((row, index) => {
            const isYou = row.user_id === currentUserId
            const primary =
              sortBy === 'monthly' ? row.monthly_score : row.weekly_score
            return (
              <li
                key={row.user_id}
                className={[
                  'flex items-center gap-3 rounded border px-3 py-3',
                  isYou
                    ? 'border-orange bg-surface-alt'
                    : 'border-orange-dim/40 bg-surface',
                ].join(' ')}
              >
                <span className="w-6 shrink-0 text-center font-display text-sm font-semibold tabular-nums text-muted">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display font-medium">
                    {row.name}
                    {isYou ? (
                      <span className="ml-1 font-sans text-xs font-normal text-muted">
                        (you)
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-muted">
                    Week {formatScorePercent(row.weekly_score)} · Month{' '}
                    {formatScorePercent(row.monthly_score)} · Streak{' '}
                    {row.streak ?? 0}
                    {(row.streak ?? 0) === 1 ? ' wk' : ' wks'}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-display text-xl font-semibold tabular-nums">
                    {formatScorePercent(primary)}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <p className="mt-6 text-xs text-muted">
        Score = workout completion × 60% + exercise completion × 40%. Ties break
        on streak (consecutive weeks above 0%).
      </p>
    </div>
  )
}
