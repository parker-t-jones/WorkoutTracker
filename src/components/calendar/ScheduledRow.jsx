import StatusIndicator from './StatusIndicator'
import { formatDateKey } from '../../lib/dates'

/**
 * One tappable scheduled-workout row (upcoming list, history). Shows the
 * focus, formatted date, optional week number and status; partial / in
 * progress add the logged x/y count.
 */
export default function ScheduledRow({
  sw,
  workout,
  status,
  progress,
  onSelect,
  showWeek = true,
  highlight = false,
}) {
  const counts =
    (status === 'partial' || status === 'in-progress') && progress?.total
      ? `${progress.done}/${progress.total} logged`
      : null

  return (
    <button
      type="button"
      onClick={() => onSelect(sw.id)}
      className={[
        'block w-full rounded border border-orange-dim/40 bg-surface px-3 py-3 text-left hover:border-orange',
        highlight ? 'hazard-stripe' : '',
      ].join(' ')}
    >
      <span className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block font-display font-medium">
            {workout?.focus ?? 'Workout'}
          </span>
          <span className="block font-mono text-sm text-muted">
            {formatDateKey(sw.date)}
            {showWeek && workout?.week_number != null
              ? ` · Week ${workout.week_number}`
              : ''}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <StatusIndicator status={status} size="md" label />
          {counts ? (
            <span className="font-mono text-xs text-muted">{counts}</span>
          ) : null}
        </span>
      </span>
    </button>
  )
}
