import { useMemo } from 'react'
import ScheduledRow from './calendar/ScheduledRow'
import { todayKey as getTodayKey } from '../lib/dates'
import { groupHistoryByWeek, scheduledStatus } from '../lib/schedule'

const EMPTY_PROGRESS = new Map()

/**
 * Past scheduled workouts (before today), newest first, grouped by program
 * week. Tapping one opens WorkoutDetail, where it can still be logged/edited.
 */
export default function HistoryView({
  scheduledWorkouts,
  progressById = EMPTY_PROGRESS,
  getWorkout,
  onSelectScheduled,
  onBack,
}) {
  const todayKey = getTodayKey()
  const groups = useMemo(
    () => groupHistoryByWeek(scheduledWorkouts, getWorkout, todayKey),
    [scheduledWorkouts, getWorkout, todayKey],
  )

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 mb-2 min-h-11 px-2 text-sm text-muted hover:text-ink"
      >
        ← Calendar
      </button>

      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          History
        </h1>
        <p className="mt-1 text-sm text-muted">
          Past workouts, newest first. Tap one to review or log it late.
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="text-sm text-muted">No past workouts yet.</p>
      ) : null}

      <div className="space-y-6">
        {groups.map(({ weekNumber, items }) => {
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
    </div>
  )
}
