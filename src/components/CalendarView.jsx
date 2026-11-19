import { useMemo, useState } from 'react'
import TodayCard from './calendar/TodayCard'
import GenerateNextWeekCard from './calendar/GenerateNextWeekCard'
import MonthGrid from './calendar/MonthGrid'
import ScheduledRow from './calendar/ScheduledRow'
import { formatDateKey, todayKey as getTodayKey } from '../lib/dates'
import {
  currentProgramWeek,
  groupByDate,
  scheduledStatus,
  sortScheduled,
} from '../lib/schedule'

const EMPTY_PROGRESS = new Map()

export default function CalendarView({
  /** Every scheduled workout (past and future) — drives the month grid. */
  scheduledWorkouts,
  /** This week's Monday onward (filterScheduledForCalendar) — the list. */
  upcomingWorkouts = scheduledWorkouts,
  /** Map scheduled id → { done, total, exerciseCount } (buildScheduledProgress). */
  progressById = EMPTY_PROGRESS,
  getWorkout,
  onSelectScheduled,
  onOpenHistory,
  /** Month shown in the grid (first of month). Lifted so it survives opening a workout. */
  month: controlledMonth,
  onMonthChange,
  canGenerateNextWeek = false,
  onGenerateNextWeek,
  generatingNextWeek = false,
  generateNextWeekError = null,
}) {
  const todayKey = getTodayKey()
  const [localMonth, setLocalMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const month = controlledMonth ?? localMonth
  const setMonth = onMonthChange ?? setLocalMonth

  const sorted = useMemo(() => sortScheduled(scheduledWorkouts), [scheduledWorkouts])
  const byDate = useMemo(() => groupByDate(sorted), [sorted])
  const upcoming = useMemo(() => sortScheduled(upcomingWorkouts), [upcomingWorkouts])
  const programWeek = currentProgramWeek(sorted, getWorkout)
  const hasHistory = Boolean(onOpenHistory) && sorted.some((sw) => sw.date < todayKey)

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <header className="mb-6">
        {programWeek != null ? (
          <p className="text-sm text-muted">Week {programWeek}</p>
        ) : null}
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {formatDateKey(todayKey)}
        </h1>
      </header>

      <TodayCard
        scheduled={sorted}
        todayKey={todayKey}
        getWorkout={getWorkout}
        progressById={progressById}
        onSelectScheduled={onSelectScheduled}
      />

      {canGenerateNextWeek || generatingNextWeek ? (
        <GenerateNextWeekCard
          onGenerate={onGenerateNextWeek}
          generating={generatingNextWeek}
          error={generateNextWeekError}
        />
      ) : null}

      <MonthGrid
        month={month}
        onMonthChange={setMonth}
        byDate={byDate}
        progressById={progressById}
        getWorkout={getWorkout}
        todayKey={todayKey}
        onSelectScheduled={onSelectScheduled}
      />

      <div className="mt-8 mb-2 flex items-center justify-between">
        <h2 className="font-display text-sm font-medium text-muted">
          This week &amp; upcoming
        </h2>
        {hasHistory ? (
          <button
            type="button"
            onClick={onOpenHistory}
            className="-mr-2 min-h-11 px-2 text-sm font-medium text-orange hover:text-ink"
          >
            View history →
          </button>
        ) : null}
      </div>
      <ul className="space-y-2">
        {upcoming.length === 0 ? (
          <li className="text-sm text-muted">No workouts in this window.</li>
        ) : null}
        {upcoming.map((sw) => {
          const progress = progressById.get(sw.id)
          const status = scheduledStatus(sw, progress, todayKey)
          return (
            <li key={sw.id}>
              <ScheduledRow
                sw={sw}
                workout={getWorkout(sw.workout_id)}
                status={status}
                progress={progress}
                onSelect={onSelectScheduled}
                highlight={sw.date === todayKey && status !== 'completed'}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
