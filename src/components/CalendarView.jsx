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
      className="h-8 w-8 animate-spin text-stone-800"
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
      isToday: key === toDateKey(today),
      scheduled: byDate[key] ?? null,
    })
  }

  const monthLabel = today.toLocaleString('default', { month: 'long', year: 'numeric' })

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <header className="mb-6">
        <p className="text-sm text-stone-500">This week</p>
        <h1 className="text-2xl font-semibold tracking-tight">{monthLabel}</h1>
      </header>

      {canGenerateNextWeek || generatingNextWeek ? (
        <div className="mb-6 rounded-md border border-stone-200 bg-white px-3 py-3">
          {generatingNextWeek ? (
            <div
              role="status"
              aria-live="polite"
              className="flex flex-col items-center gap-3 py-4 text-center"
            >
              <Spinner />
              <p className="text-sm font-medium text-stone-800">
                {STATUS_MESSAGES[statusIndex]}
              </p>
              <p className="text-xs text-stone-500">
                This usually takes about a minute.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-stone-700">
                Current week is done. Generate next week from your logs
                (loads, RPE, and any felt-off flags).
              </p>
              {generateNextWeekError ? (
                <p
                  role="alert"
                  className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
                >
                  {generateNextWeekError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={onGenerateNextWeek}
                disabled={generatingNextWeek}
                className="mt-3 w-full rounded-md bg-stone-900 py-3 text-sm font-medium text-white hover:bg-stone-700 disabled:pointer-events-none disabled:opacity-60"
              >
                Generate next week
              </button>
            </>
          )}
        </div>
      ) : null}

      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-medium text-stone-500">
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
                'flex aspect-square flex-col items-start rounded-md p-1.5 text-left text-sm transition',
                cell.isToday ? 'ring-2 ring-stone-800' : '',
                sw
                  ? done
                    ? 'bg-emerald-100 hover:bg-emerald-200'
                    : 'bg-amber-100 hover:bg-amber-200'
                  : 'bg-transparent text-stone-400',
              ].join(' ')}
            >
              <span className="font-medium">{cell.day}</span>
              {workout && (
                <span className="mt-auto line-clamp-2 text-[10px] leading-tight text-stone-700">
                  {workout.focus}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <ul className="mt-8 space-y-2">
        <li className="text-sm font-medium text-stone-600">
          Upcoming
        </li>
        {scheduledWorkouts.length === 0 ? (
          <li className="text-sm text-stone-500">No workouts in this window.</li>
        ) : null}
        {scheduledWorkouts
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((sw) => {
            const workout = getWorkout(sw.workout_id)
            return (
              <li key={sw.id}>
                <button
                  type="button"
                  onClick={() => onSelectScheduled(sw.id)}
                  className="flex w-full items-center justify-between rounded-md border border-stone-200 bg-white px-3 py-3 text-left hover:border-stone-400"
                >
                  <div>
                    <div className="font-medium">{workout?.focus ?? 'Workout'}</div>
                    <div className="text-sm text-stone-500">
                      {sw.date}
                      {workout?.week_number != null
                        ? ` · Week ${workout.week_number}`
                        : ''}
                    </div>
                  </div>
                  <span
                    className={[
                      'rounded px-2 py-0.5 text-xs font-medium',
                      sw.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800',
                    ].join(' ')}
                  >
                    {sw.status}
                  </span>
                </button>
              </li>
            )
          })}
      </ul>
    </div>
  )
}
