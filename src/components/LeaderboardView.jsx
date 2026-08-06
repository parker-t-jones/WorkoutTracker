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
        <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
        <p className="mt-1 text-sm text-stone-500">
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
                'flex-1 rounded-md py-2 text-sm font-medium',
                selected
                  ? 'bg-stone-900 text-white'
                  : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50',
              ].join(' ')}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-stone-500">Loading…</p>
      ) : error ? (
        <div className="space-y-3">
          <p role="alert" className="rounded-md bg-red-50 px-3 py-3 text-sm text-red-700">
            {error}
          </p>
          <button
            type="button"
            onClick={load}
            className="w-full rounded-md border border-stone-300 bg-white py-2 text-sm font-medium hover:bg-stone-50"
          >
            Retry
          </button>
        </div>
      ) : ranked.length === 0 ? (
        <p className="rounded-md border border-dashed border-stone-300 bg-white px-4 py-8 text-center text-sm text-stone-500">
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
                  'flex items-center gap-3 rounded-md border px-3 py-3',
                  isYou
                    ? 'border-stone-900 bg-stone-50'
                    : 'border-stone-200 bg-white',
                ].join(' ')}
              >
                <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-stone-500">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {row.name}
                    {isYou ? (
                      <span className="ml-1 text-xs font-normal text-stone-500">
                        (you)
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-xs text-stone-500">
                    Week {formatScorePercent(row.weekly_score)} · Month{' '}
                    {formatScorePercent(row.monthly_score)} · Streak{' '}
                    {row.streak ?? 0}
                    {(row.streak ?? 0) === 1 ? ' wk' : ' wks'}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xl font-semibold tabular-nums">
                    {formatScorePercent(primary)}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <p className="mt-6 text-xs text-stone-400">
        Score = workout completion × 60% + exercise completion × 40%. Ties break
        on streak (consecutive weeks above 0%).
      </p>
    </div>
  )
}
