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

export default function CalendarView({ scheduledWorkouts, getWorkout, onSelectScheduled }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const monthStart = startOfMonth(today)
  const totalDays = daysInMonth(today)
  const startWeekday = monthStart.getDay()

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
        <li className="text-sm font-medium text-stone-600">Upcoming</li>
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
                    <div className="text-sm text-stone-500">{sw.date}</div>
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
