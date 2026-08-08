import { useEffect, useState } from 'react'

const STATUS_MESSAGES = [
  'Reviewing last week...',
  'Adjusting loads and volume...',
  'Building next week...',
  'Almost done...',
]

function Spinner() {
  return (
    <svg
      className="h-8 w-8 animate-spin text-orange"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  )
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

function toDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CalendarView({
  scheduledWorkouts,
  getWorkout,
  onSelectScheduled,
  canGenerateNextWeek = false,
  onGenerateNextWeek,
  generatingNextWeek = false,
  generateNextWeekError = null,
}) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const monthStart = startOfMonth(today)
  const totalDays = daysInMonth(today)
  const startWeekday = monthStart.getDay()
  const [statusIndex, setStatusIndex] = useState(0)
  const todayKey = toDateKey(today)

  useEffect(() => {
    if (!generatingNextWeek) {
      setStatusIndex(0)
      return
    }
    const id = setInterval(() => {
      setStatusIndex((i) => (i + 1) % STATUS_MESSAGES.length)
    }, 12000)
    return () => clearInterval(id)
  }, [generatingNextWeek])

  const byDate = Object.fromEntries(
    scheduledWorkouts.map((sw) => [sw.date, sw]),
  )

  const cells = []
  for (let i = 0; i < startWeekday; i++) {
    cells.push({ key: `pad-${i}`, empty: true })
  }
  for (let day = 1; day <= totalDays; day++) {
    const date = new Date(today.getFullYear(), today.getMonth(), day)
    const key = toDateKey(date)
    cells.push({
      key,
      day,
      dateKey: key,
      isToday: key === todayKey,
      scheduled: byDate[key] ?? null,
    })
  }

  const monthLabel = today.toLocaleString('default', { month: 'long', year: 'numeric' })

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <header className="mb-6">
        <p className="text-sm text-muted">This week</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {monthLabel}
        </h1>
      </header>

      {canGenerateNextWeek || generatingNextWeek ? (
        <div className="mb-6 rounded border border-orange-dim/40 bg-surface px-3 py-3">
          {generatingNextWeek ? (
            <div
              role="status"
              aria-live="polite"
              className="flex flex-col items-center gap-3 py-4 text-center"
            >
              <Spinner />
              <p className="text-sm font-medium text-ink">
                {STATUS_MESSAGES[statusIndex]}
              </p>
              <p className="text-xs text-muted">
                This usually takes about a minute.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-ink">
                Current week is done. Generate next week from your logs
                (loads, RPE, and any felt-off flags).
              </p>
              {generateNextWeekError ? (
                <p
                  role="alert"
                  className="mt-2 rounded bg-red-950/60 px-3 py-2 text-sm text-red-300"
                >
                  {generateNextWeekError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={onGenerateNextWeek}
                disabled={generatingNextWeek}
                className="mt-3 w-full rounded bg-orange py-3 text-sm font-medium text-bg hover:bg-orange-dim disabled:pointer-events-none disabled:opacity-60"
              >
                Generate next week
              </button>
            </>
          )}
        </div>
      ) : null}

      <div className="mb-2 grid grid-cols-7 gap-1 text-center font-display text-xs font-medium text-muted">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          if (cell.empty) {
            return <div key={cell.key} className="aspect-square" />
          }

          const sw = cell.scheduled
          const workout = sw ? getWorkout(sw.workout_id) : null
          const done = sw?.status === 'completed'

          return (
            <button
              key={cell.key}
              type="button"
              disabled={!sw}
              onClick={() => sw && onSelectScheduled(sw.id)}
              className={[
                'flex aspect-square flex-col items-start rounded border-[1.5px] p-1.5 text-left text-sm transition',
                cell.isToday ? 'ring-2 ring-orange ring-offset-1 ring-offset-bg' : '',
                sw
                  ? done
                    ? 'border-orange/20 bg-surface text-ink hover:border-orange/35'
                    : 'border-orange bg-surface text-ink hover:border-orange-dim'
                  : 'border-transparent bg-transparent text-muted',
              ].join(' ')}
            >
              <span className="font-display font-medium">{cell.day}</span>
              {workout && (
                <span className="mt-auto line-clamp-2 font-display text-[10px] leading-tight text-muted">
                  {workout.focus}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <ul className="mt-8 space-y-2">
        <li className="font-display text-sm font-medium text-muted">
          Upcoming
        </li>
        {scheduledWorkouts.length === 0 ? (
          <li className="text-sm text-muted">No workouts in this window.</li>
        ) : null}
        {scheduledWorkouts
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((sw) => {
            const workout = getWorkout(sw.workout_id)
            const done = sw.status === 'completed'
            const isActive = !done && sw.date === todayKey
            return (
              <li key={sw.id}>
                <button
                  type="button"
                  onClick={() => onSelectScheduled(sw.id)}
                  className={[
                    'flex w-full items-center gap-3 rounded border border-orange-dim/40 bg-surface px-3 py-3 text-left hover:border-orange',
                    isActive ? 'hazard-stripe' : '',
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
                </button>
              </li>
            )
          })}
      </ul>
    </div>
  )
}
