import { useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import StatusIndicator, { STATUS_LABEL } from './StatusIndicator'
import { formatDateKey, toDateKey } from '../../lib/dates'
import { scheduledStatus } from '../../lib/schedule'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const LEGEND = ['completed', 'pending', 'partial', 'missed']

function sameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

/**
 * Month calendar with prev/next/today navigation. `byDate` maps
 * YYYY-MM-DD → scheduled workouts on that date (several per day allowed;
 * tapping such a day opens a small chooser under the grid).
 */
export default function MonthGrid({
  month,
  onMonthChange,
  byDate,
  progressById,
  getWorkout,
  todayKey,
  onSelectScheduled,
}) {
  const [chooserDate, setChooserDate] = useState(null)
  const now = new Date()
  const isCurrentMonth = sameMonth(month, now)

  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const totalDays = new Date(year, monthIndex + 1, 0).getDate()
  const startWeekday = new Date(year, monthIndex, 1).getDay()
  const monthLabel = month.toLocaleString('en-US', { month: 'long', year: 'numeric' })

  function shift(delta) {
    setChooserDate(null)
    onMonthChange(new Date(year, monthIndex + delta, 1))
  }

  function goToday() {
    setChooserDate(null)
    onMonthChange(new Date(now.getFullYear(), now.getMonth(), 1))
  }

  const cells = []
  for (let i = 0; i < startWeekday; i++) {
    cells.push({ key: `pad-${i}`, empty: true })
  }
  for (let day = 1; day <= totalDays; day++) {
    const key = toDateKey(new Date(year, monthIndex, day))
    cells.push({ key, day, items: byDate.get(key) ?? [] })
  }

  const chooserItems = chooserDate ? (byDate.get(chooserDate) ?? []) : []

  return (
    <section aria-label="Month calendar">
      <div className="mb-3 flex items-center gap-1">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Previous month"
          className="flex h-11 w-11 items-center justify-center rounded text-muted hover:bg-surface-alt hover:text-ink"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <h2
          className="flex-1 text-center font-display text-lg font-semibold"
          aria-live="polite"
        >
          {monthLabel}
        </h2>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Next month"
          className="flex h-11 w-11 items-center justify-center rounded text-muted hover:bg-surface-alt hover:text-ink"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={goToday}
          disabled={isCurrentMonth}
          className="ml-1 h-11 rounded border border-orange-dim/40 bg-surface px-3 text-sm font-medium text-ink hover:border-orange disabled:pointer-events-none disabled:opacity-40"
        >
          Today
        </button>
      </div>

      <div
        className="mb-2 grid grid-cols-7 gap-1 text-center font-display text-xs font-medium text-muted"
        aria-hidden="true"
      >
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          if (cell.empty) {
            return <div key={cell.key} className="aspect-square" />
          }

          const { items } = cell
          const isToday = cell.key === todayKey
          const statuses = items.map((sw) =>
            scheduledStatus(sw, progressById.get(sw.id), todayKey),
          )
          const allDone = items.length > 0 && statuses.every((s) => s === 'completed')
          const first = items[0]
          const firstWorkout = first ? getWorkout(first.workout_id) : null
          const dateLabel = formatDateKey(cell.key)
          const ariaLabel =
            items.length === 0
              ? `${dateLabel}${isToday ? ', today' : ''}, no workout`
              : items.length === 1
                ? `${dateLabel}${isToday ? ', today' : ''}: ${firstWorkout?.focus ?? 'Workout'}, ${STATUS_LABEL[statuses[0]]}`
                : `${dateLabel}${isToday ? ', today' : ''}: ${items.length} workouts`

          return (
            <button
              key={cell.key}
              type="button"
              disabled={items.length === 0}
              aria-label={ariaLabel}
              aria-current={isToday ? 'date' : undefined}
              aria-expanded={items.length > 1 ? chooserDate === cell.key : undefined}
              onClick={() => {
                if (items.length === 1) onSelectScheduled(first.id)
                else if (items.length > 1) {
                  setChooserDate((d) => (d === cell.key ? null : cell.key))
                }
              }}
              className={[
                'flex aspect-square min-h-11 flex-col items-start rounded border-[1.5px] p-1.5 text-left text-sm transition',
                isToday ? 'ring-2 ring-orange ring-offset-1 ring-offset-bg' : '',
                items.length
                  ? allDone
                    ? 'border-orange/20 bg-surface text-ink hover:border-orange/35'
                    : 'border-orange bg-surface text-ink hover:border-orange-dim'
                  : 'border-transparent bg-transparent text-muted',
              ].join(' ')}
            >
              <span className="flex w-full items-center justify-between gap-0.5">
                <span className="font-display font-medium">{cell.day}</span>
                {items.length > 1 ? (
                  <span className="font-mono text-[10px] leading-none text-muted">
                    ×{items.length}
                  </span>
                ) : null}
              </span>
              {items.length ? (
                <span className="mt-auto flex w-full min-w-0 items-center gap-1">
                  <span className="flex shrink-0 items-center gap-0.5">
                    {statuses.slice(0, 3).map((s, i) => (
                      <StatusIndicator key={i} status={s} />
                    ))}
                  </span>
                  {items.length === 1 && firstWorkout ? (
                    <span className="hidden min-w-0 truncate font-display text-[10px] leading-tight text-muted min-[400px]:block">
                      {firstWorkout.focus}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {chooserItems.length > 1 ? (
        <div className="mt-3 rounded border border-orange-dim/40 bg-surface px-3 py-2">
          <div className="flex items-center justify-between">
            <p className="font-display text-sm font-medium text-muted">
              {formatDateKey(chooserDate)}
            </p>
            <button
              type="button"
              onClick={() => setChooserDate(null)}
              aria-label="Close workouts for this day"
              className="-mr-2 flex h-11 w-11 items-center justify-center text-muted hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <ul className="space-y-1 pb-1">
            {chooserItems.map((sw) => {
              const workout = getWorkout(sw.workout_id)
              const status = scheduledStatus(sw, progressById.get(sw.id), todayKey)
              return (
                <li key={sw.id}>
                  <button
                    type="button"
                    onClick={() => onSelectScheduled(sw.id)}
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded px-2 text-left hover:bg-surface-alt"
                  >
                    <span className="font-display font-medium">
                      {workout?.focus ?? 'Workout'}
                    </span>
                    <StatusIndicator status={status} size="md" label />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <ul
        className="mt-3 flex flex-wrap gap-x-4 gap-y-1"
        aria-label="Legend"
      >
        {LEGEND.map((s) => (
          <li key={s}>
            <StatusIndicator status={s} label />
          </li>
        ))}
      </ul>
    </section>
  )
}
