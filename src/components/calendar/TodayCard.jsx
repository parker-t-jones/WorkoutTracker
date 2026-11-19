import StatusIndicator from './StatusIndicator'
import {
  addDaysToKey,
  formatDateKey,
  formatRelativeDateKey,
  formatWeekday,
} from '../../lib/dates'
import { scheduledStatus } from '../../lib/schedule'

/** "Tomorrow" / "Thu" (within a week) / "Thu, Dec 3". */
function nextLabel(dateKey, todayKey) {
  if (dateKey === addDaysToKey(todayKey, 1)) return 'Tomorrow'
  if (dateKey < addDaysToKey(todayKey, 7)) return formatWeekday(dateKey)
  return formatDateKey(dateKey)
}

/**
 * Top-of-calendar card: today's workout with progress and a Start/Continue
 * button; otherwise the next upcoming workout; otherwise a short note.
 * `scheduled` must be sorted by date.
 */
export default function TodayCard({
  scheduled,
  todayKey,
  getWorkout,
  progressById,
  onSelectScheduled,
}) {
  const todays = scheduled.filter((sw) => sw.date === todayKey)
  const current = todays.find((sw) => sw.status !== 'completed') ?? todays[0]

  if (current) {
    const workout = getWorkout(current.workout_id)
    const progress = progressById.get(current.id) ?? {
      done: 0,
      total: 0,
      exerciseCount: 0,
    }
    const status = scheduledStatus(current, progress, todayKey)
    const done = status === 'completed'
    const started = progress.done > 0
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
    const others = todays.length - 1

    return (
      <section
        aria-label="Today's workout"
        className={[
          'mb-6 rounded border bg-surface px-3 py-3',
          done ? 'border-success-border/55' : 'border-orange',
          !done && started ? 'hazard-stripe' : '',
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-xs font-medium uppercase tracking-wide text-muted">
            Today
            {workout?.week_number != null ? ` · Week ${workout.week_number}` : ''}
            {others > 0 ? ` · +${others} more` : ''}
          </p>
          <StatusIndicator status={status} size="md" label />
        </div>
        <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
          {workout?.focus ?? 'Workout'}
        </h2>
        <p className="mt-1 font-mono text-sm text-muted">
          {progress.exerciseCount} exercise{progress.exerciseCount === 1 ? '' : 's'} ·{' '}
          {progress.done}/{progress.total} logged
        </p>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded bg-surface-alt"
          role="progressbar"
          aria-label="Logged so far"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
        >
          <div
            className={['h-full rounded', done ? 'bg-success' : 'bg-orange'].join(' ')}
            style={{ width: `${done ? 100 : pct}%` }}
          />
        </div>
        <button
          type="button"
          onClick={() => onSelectScheduled(current.id)}
          className={[
            'mt-3 min-h-12 w-full rounded py-3 text-base font-medium',
            done
              ? 'border border-orange-dim/50 bg-surface text-ink hover:bg-surface-alt'
              : 'bg-orange text-on-orange hover:bg-orange-dim',
          ].join(' ')}
        >
          {done ? 'View workout' : started ? 'Continue' : 'Start workout'}
        </button>
      </section>
    )
  }

  const next = scheduled.find(
    (sw) => sw.date > todayKey && sw.status !== 'completed',
  )

  if (next) {
    const workout = getWorkout(next.workout_id)
    return (
      <section
        aria-label="Next workout"
        className="mb-6 rounded border border-orange-dim/40 bg-surface px-3 py-3"
      >
        <p className="font-display text-xs font-medium uppercase tracking-wide text-muted">
          Rest day
        </p>
        <button
          type="button"
          onClick={() => onSelectScheduled(next.id)}
          aria-label={`Next workout ${formatRelativeDateKey(next.date)}: ${workout?.focus ?? 'Workout'}. Preview`}
          className="mt-1 flex min-h-11 w-full items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0 font-display text-lg font-semibold">
            Next: {nextLabel(next.date, todayKey)} · {workout?.focus ?? 'Workout'}
          </span>
          <span className="shrink-0 text-sm text-muted">Preview →</span>
        </button>
      </section>
    )
  }

  return (
    <section
      aria-label="Today"
      className="mb-6 rounded border border-orange-dim/40 bg-surface px-3 py-3"
    >
      <p className="text-sm text-muted">No workouts scheduled ahead.</p>
    </section>
  )
}
