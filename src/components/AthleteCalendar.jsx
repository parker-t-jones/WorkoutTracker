import { useCallback, useEffect, useMemo, useState } from 'react'
import CalendarView from './CalendarView'
import HistoryView from './HistoryView'
import WorkoutBuilder from './WorkoutBuilder'
import CoachWorkoutView from './coach/CoachWorkoutView'
import { filterScheduledForCalendar } from '../lib/program'
import { loadAthleteProgram } from '../lib/coach'
import { buildScheduledProgress } from '../lib/schedule'

/**
 * Coach's view of one ACTIVE athlete: their calendar (tap an empty day to
 * assign a workout), history, a workout's prescription + logs + notes +
 * demo media (CoachWorkoutView), and the WorkoutBuilder to create/edit.
 *
 * Data comes from loadProgramData(athleteId) — coach_mode.sql gives an
 * active coach SELECT on the athlete's program, logs and notes. Writes go
 * through coachWorkouts.saveAthleteWorkout (user_id = athlete; created_by
 * is set to the coach by the workouts_guard_created_by trigger).
 */
export default function AthleteCalendar({ coachId, athlete, onBack }) {
  const athleteId = athlete.id
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [scheduledId, setScheduledId] = useState(null)
  const [pane, setPane] = useState('upcoming') // upcoming | history
  const [builder, setBuilder] = useState(null) // { dateKey, scheduledId }
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const reload = useCallback(async () => {
    const next = await loadAthleteProgram(athleteId)
    setData(next)
    return next
  }, [athleteId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    setScheduledId(null)
    setPane('upcoming')
    setBuilder(null)

    loadAthleteProgram(athleteId)
      .then((next) => {
        if (!cancelled) setData(next)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) {
          setError(err.message || 'Could not load this athlete’s program')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [athleteId])

  const scheduledWorkouts = useMemo(() => data?.scheduledWorkouts ?? [], [data])
  const workoutDetails = useMemo(() => data?.workoutDetails ?? {}, [data])
  const logs = useMemo(() => data?.logs ?? [], [data])
  const logSplits = useMemo(() => data?.logSplits ?? [], [data])
  const workoutsById = useMemo(
    () => Object.fromEntries((data?.workouts ?? []).map((w) => [w.id, w])),
    [data],
  )
  const getWorkout = useCallback((id) => workoutsById[id], [workoutsById])
  const progressById = useMemo(
    () =>
      buildScheduledProgress(scheduledWorkouts, workoutDetails, logs, logSplits),
    [scheduledWorkouts, workoutDetails, logs, logSplits],
  )

  function getScheduledBundle(id) {
    const sw = scheduledWorkouts.find((s) => s.id === id)
    if (!sw) return null
    const detail = workoutDetails[sw.workout_id]
    if (!detail) return null
    return { ...sw, workout: detail.workout, exercises: detail.exercises }
  }

  const backToRoster = '← Athletes'

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-muted">
        Loading…
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 text-sm text-muted hover:text-ink"
        >
          {backToRoster}
        </button>
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      </div>
    )
  }

  if (builder) {
    const byId =
      builder.scheduledId != null ? getScheduledBundle(builder.scheduledId) : null
    const byDate = scheduledWorkouts.find((s) => s.date === builder.dateKey)
    const editing = byId ?? (byDate ? getScheduledBundle(byDate.id) : null)
    const weIds = new Set((editing?.exercises ?? []).map((we) => we.id))
    const hasLogs = logs.some((l) => weIds.has(l.workout_exercise_id))
    return (
      <WorkoutBuilder
        key={`${builder.dateKey}:${editing?.id ?? 'new'}`}
        athlete={athlete}
        dateKey={builder.dateKey}
        existingScheduled={editing}
        scheduledWorkouts={scheduledWorkouts}
        workoutsById={workoutsById}
        hasLogs={hasLogs}
        onBack={() => setBuilder(null)}
        onSaved={async ({ scheduledId: savedId } = {}) => {
          const next = await reload()
          setBuilder(null)
          const match =
            (next.scheduledWorkouts ?? []).find((s) => s.id === savedId) ??
            (next.scheduledWorkouts ?? []).find((s) => s.date === builder.dateKey)
          setScheduledId(match?.id ?? null)
        }}
      />
    )
  }

  const scheduled = scheduledId != null ? getScheduledBundle(scheduledId) : null
  if (scheduled) {
    return (
      <CoachWorkoutView
        coachId={coachId}
        athleteName={athlete.name}
        scheduled={scheduled}
        detail={workoutDetails[scheduled.workout_id]}
        logs={logs}
        logSplits={logSplits}
        exerciseNotes={data?.exerciseNotes ?? []}
        onBack={() => setScheduledId(null)}
        onEdit={() =>
          setBuilder({ dateKey: scheduled.date, scheduledId: scheduled.id })
        }
      />
    )
  }

  if (pane === 'history') {
    return (
      <HistoryView
        scheduledWorkouts={scheduledWorkouts}
        progressById={progressById}
        getWorkout={getWorkout}
        workoutDetails={workoutDetails}
        onSelectScheduled={setScheduledId}
        onBack={onBack}
        backLabel={backToRoster}
        eyebrow={athlete.name}
        onShowUpcoming={() => setPane('upcoming')}
      />
    )
  }

  return (
    <CalendarView
      scheduledWorkouts={scheduledWorkouts}
      upcomingWorkouts={filterScheduledForCalendar(scheduledWorkouts)}
      progressById={progressById}
      getWorkout={getWorkout}
      onSelectScheduled={setScheduledId}
      onSelectDay={(dateKey) => setBuilder({ dateKey, scheduledId: null })}
      writable
      hint="Tap an empty day to assign a workout, or a workout to review and edit it."
      onOpenHistory={() => setPane('history')}
      month={month}
      onMonthChange={setMonth}
      eyebrow={athlete.name}
      onBack={onBack}
      backLabel={backToRoster}
    />
  )
}
