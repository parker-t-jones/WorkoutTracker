import { useMemo, useState } from 'react'
import { filterScheduledForHistory } from '../lib/adapt'

const WEEKS_PER_PAGE = 4

function matchesQuery(sw, query, getWorkout, workoutDetails) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const workout = getWorkout(sw.workout_id)
  if ((workout?.focus ?? '').toLowerCase().includes(q)) return true
  const exercises = workoutDetails?.[sw.workout_id]?.exercises ?? []
  return exercises.some((we) =>
    (we.exercise?.name ?? '').toLowerCase().includes(q),
  )
}

function groupByWeek(scheduled, getWorkout) {
  const groups = new Map()
  for (const sw of scheduled) {
    const weekNumber = getWorkout(sw.workout_id)?.week_number ?? 0
    if (!groups.has(weekNumber)) groups.set(weekNumber, [])
    groups.get(weekNumber).push(sw)
  }
  return [...groups.entries()]
    .map(([weekNumber, items]) => ({
      weekNumber,
      items: items.slice().sort((a, b) => b.date.localeCompare(a.date)),
    }))
    .sort((a, b) => {
      const aMax = a.items[0]?.date ?? ''
      const bMax = b.items[0]?.date ?? ''
      if (aMax !== bMax) return bMax.localeCompare(aMax)
      return b.weekNumber - a.weekNumber
    })
}

function CompletionMark({ done }) {
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-orange-dim/40 bg-transparent"
      aria-label={done ? 'Completed' : 'Pending'}
    >
      {done ? (
        <svg
          viewBox="0 0 16 16"
          className="h-3 w-3 text-ink/70"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
        </svg>
      ) : null}
    </span>
  )
}

export default function HistoryView({
  scheduledWorkouts,
  getWorkout,
  workoutDetails = {},
  onSelectScheduled,
  onBack,
  backLabel = '← Back',
  eyebrow = 'Past weeks',
  onShowUpcoming,
}) {
  const [query, setQuery] = useState('')
  const [visibleWeeks, setVisibleWeeks] = useState(WEEKS_PER_PAGE)

  const past = useMemo(
    () => filterScheduledForHistory(scheduledWorkouts),
    [scheduledWorkouts],
  )

  const filtered = useMemo(
    () =>
      past.filter((sw) =>
        matchesQuery(sw, query, getWorkout, workoutDetails),
      ),
    [past, query, getWorkout, workoutDetails],
  )

  const groups = useMemo(
    () => groupByWeek(filtered, getWorkout),
    [filtered, getWorkout],
  )

  const shown = groups.slice(0, visibleWeeks)
  const remaining = groups.length - shown.length

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mb-4 text-sm text-muted hover:text-ink"
        >
          {backLabel}
        </button>
      ) : null}

      <header className="mb-6">
        <p className="text-sm text-muted">{eyebrow}</p>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            History
          </h1>
          {onShowUpcoming ? (
            <button
              type="button"
              onClick={onShowUpcoming}
              className="text-sm text-muted hover:text-ink"
            >
              Upcoming
            </button>
          ) : null}
        </div>
      </header>

      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setVisibleWeeks(WEEKS_PER_PAGE)
        }}
        placeholder="Search by name or focus"
        aria-label="Search past workouts"
        className="mb-6 w-full rounded border border-orange-dim/50 bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-orange focus:outline-none focus:ring-1 focus:ring-orange"
      />

      {past.length === 0 ? (
        <p className="text-sm text-muted">
          No past weeks yet. Completed sessions from earlier weeks will show
          up here.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted">
          No workouts match “{query.trim()}”.
        </p>
      ) : (
        <div className="space-y-6">
          {shown.map((group) => (
            <ul key={group.weekNumber} className="space-y-2">
              <li className="font-display text-sm font-medium text-muted">
                {group.weekNumber > 0 ? `Week ${group.weekNumber}` : 'Earlier'}
              </li>
              {group.items.map((sw) => {
                const workout = getWorkout(sw.workout_id)
                const done = sw.status === 'completed'
                return (
                  <li key={sw.id}>
                    <button
                      type="button"
                      onClick={() => onSelectScheduled(sw.id)}
                      className={[
                        'flex w-full items-center gap-3 rounded border bg-surface px-3 py-3 text-left hover:border-orange',
                        done ? 'border-orange/20' : 'border-orange',
                      ].join(' ')}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-display font-medium">
                          {workout?.focus ?? 'Workout'}
                        </div>
                        <div className="font-mono text-sm text-muted">
                          {sw.date}
                          {workout?.week_number != null
                            ? ` · Week ${workout.week_number}`
                            : ''}
                        </div>
                      </div>
                      <CompletionMark done={done} />
                    </button>
                  </li>
                )
              })}
            </ul>
          ))}
        </div>
      )}

      {remaining > 0 ? (
        <button
          type="button"
          onClick={() => setVisibleWeeks((n) => n + WEEKS_PER_PAGE)}
          className="mt-6 w-full rounded border border-orange-dim/40 bg-surface py-3 text-sm font-medium text-ink hover:border-orange"
        >
          Show earlier weeks ({remaining} more)
        </button>
      ) : null}
    </div>
  )
}
