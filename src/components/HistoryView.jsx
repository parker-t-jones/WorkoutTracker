import { useMemo, useState } from 'react'
import ScheduledRow from './calendar/ScheduledRow'
import { todayKey as getTodayKey } from '../lib/dates'
import { groupHistoryByWeek, scheduledStatus } from '../lib/schedule'

const EMPTY_PROGRESS = new Map()
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

/**
 * Past scheduled workouts (before today), newest first, grouped by program
 * week, with search (focus or exercise name) and "show earlier weeks" paging.
 * Tapping one opens the workout (athlete: WorkoutDetail, where it can still
 * be logged late; coach: the athlete's read-only workout view).
 *
 * Used as the athlete's History tab and inside the coach's AthleteCalendar.
 */
export default function HistoryView({
  scheduledWorkouts,
  progressById = EMPTY_PROGRESS,
  getWorkout,
  workoutDetails = {},
  onSelectScheduled,
  onBack,
  backLabel = '← Calendar',
  eyebrow = null,
  onShowUpcoming,
}) {
  const todayKey = getTodayKey()
  const [query, setQuery] = useState('')
  const [visibleWeeks, setVisibleWeeks] = useState(WEEKS_PER_PAGE)

  const filtered = useMemo(
    () =>
      (scheduledWorkouts ?? []).filter((sw) =>
        matchesQuery(sw, query, getWorkout, workoutDetails),
      ),
    [scheduledWorkouts, query, getWorkout, workoutDetails],
  )

  const allGroups = useMemo(
    () => groupHistoryByWeek(scheduledWorkouts, getWorkout, todayKey),
    [scheduledWorkouts, getWorkout, todayKey],
  )
  const groups = useMemo(
    () => groupHistoryByWeek(filtered, getWorkout, todayKey),
    [filtered, getWorkout, todayKey],
  )

  const shown = groups.slice(0, visibleWeeks)
  const remaining = groups.length - shown.length

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 mb-2 min-h-11 px-2 text-sm text-muted hover:text-ink"
        >
          {backLabel}
        </button>
      ) : null}

      <header className="mb-6">
        {eyebrow ? <p className="text-sm text-muted">{eyebrow}</p> : null}
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
        <p className="mt-1 text-sm text-muted">
          Past workouts, newest first. Tap one to review it
          {onShowUpcoming ? '.' : ' or log it late.'}
        </p>
      </header>

      {allGroups.length ? (
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setVisibleWeeks(WEEKS_PER_PAGE)
          }}
          placeholder="Search by exercise or focus"
          aria-label="Search past workouts"
          className="mb-6 w-full rounded border border-orange-dim/50 bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-orange focus:outline-none focus:ring-1 focus:ring-orange"
        />
      ) : null}

      {allGroups.length === 0 ? (
        <p className="text-sm text-muted">No past workouts yet.</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted">
          No workouts match “{query.trim()}”.
        </p>
      ) : null}

      <div className="space-y-6">
        {shown.map(({ weekNumber, items }) => {
          const statuses = items.map((sw) =>
            scheduledStatus(sw, progressById.get(sw.id), todayKey),
          )
          const completed = statuses.filter((s) => s === 'completed').length
          return (
            <section
              key={weekNumber ?? 'unknown'}
              aria-labelledby={`history-week-${weekNumber ?? 'unknown'}`}
            >
              <div className="mb-2 flex items-baseline justify-between">
                <h2
                  id={`history-week-${weekNumber ?? 'unknown'}`}
                  className="font-display text-sm font-medium text-muted"
                >
                  {weekNumber != null ? `Week ${weekNumber}` : 'Other'}
                </h2>
                <span className="font-mono text-xs text-muted">
                  {completed}/{items.length} completed
                </span>
              </div>
              <ul className="space-y-2">
                {items.map((sw, i) => (
                  <li key={sw.id}>
                    <ScheduledRow
                      sw={sw}
                      workout={getWorkout(sw.workout_id)}
                      status={statuses[i]}
                      progress={progressById.get(sw.id)}
                      onSelect={onSelectScheduled}
                      showWeek={false}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

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
