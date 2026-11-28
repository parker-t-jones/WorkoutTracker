import { useCallback, useEffect, useState } from 'react'
import CalendarView from './CalendarView'
import HistoryView from './HistoryView'
import WorkoutDetail from './WorkoutDetail'
import WorkoutBuilder from './WorkoutBuilder'
import {
  loadProgramData,
  filterScheduledForCalendar,
} from '../lib/program'

export default function AthleteCalendar({ athlete, onBack }) {
  const athleteId = athlete.id
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [scheduledWorkouts, setScheduledWorkouts] = useState([])
  const [workoutsById, setWorkoutsById] = useState({})
  const [workoutDetails, setWorkoutDetails] = useState({})
  const [logs, setLogs] = useState([])
  const [logSplits, setLogSplits] = useState([])
  const [scheduledId, setScheduledId] = useState(null)
  const [pane, setPane] = useState('upcoming')
  const [builder, setBuilder] = useState(null)

  const applyData = useCallback((data) => {
    setScheduledWorkouts(data.scheduledWorkouts ?? [])
    setWorkoutsById(
      Object.fromEntries((data.workouts ?? []).map((w) => [w.id, w])),
    )
    setWorkoutDetails(data.workoutDetails ?? {})
    setLogs(data.logs ?? [])
    setLogSplits(data.logSplits ?? [])
  }, [])

  const reload = useCallback(async () => {
    const data = await loadProgramData(athleteId)
    applyData(data)
    return data
  }, [athleteId, applyData])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setScheduledId(null)
    setPane('upcoming')
    setBuilder(null)

    loadProgramData(athleteId)
      .then((data) => {
        if (cancelled) return
        applyData(data)
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
  }, [athleteId, applyData])

  function getWorkout(workoutId) {
    return workoutsById[workoutId]
  }

  function getScheduledBundle(id) {
    const sw = scheduledWorkouts.find((s) => s.id === id)
    if (!sw) return null
    const detail = workoutDetails[sw.workout_id]
    if (!detail) return null
    return {
      ...sw,
      workout: detail.workout,
      exercises: detail.exercises,
    }
  }

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
          ← Back to roster
        </button>
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      </div>
    )
  }

  const scheduled =
    scheduledId != null ? getScheduledBundle(scheduledId) : null

  if (builder) {
    const byId =
      builder.scheduledId != null
        ? getScheduledBundle(builder.scheduledId)
        : null
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
        onSaved={async () => {
          const dateKey = builder.dateKey
          try {
            const data = await reload()
            setBuilder(null)
            const match = (data.scheduledWorkouts ?? []).find(
              (s) => s.date === dateKey,
            )
            setScheduledId(match?.id ?? null)
          } catch (err) {
            console.error(err)
            throw err
          }
        }}
      />
    )
  }

  if (scheduled) {
    return (
      <WorkoutDetail
        scheduled={scheduled}
        logs={logs}
        logSplits={logSplits}
        onBack={() => setScheduledId(null)}
        backLabel={pane === 'history' ? '← History' : '← Calendar'}
        readOnly
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
        getWorkout={getWorkout}
        workoutDetails={workoutDetails}
        onSelectScheduled={setScheduledId}
        onBack={onBack}
        backLabel="← Back to roster"
        eyebrow={athlete.name}
        onShowUpcoming={() => setPane('upcoming')}
      />
    )
  }

  return (
    <CalendarView
      scheduledWorkouts={filterScheduledForCalendar(scheduledWorkouts)}
      gridWorkouts={scheduledWorkouts}
      getWorkout={getWorkout}
      onSelectScheduled={setScheduledId}
      onSelectDay={(dateKey) => {
        const existing = scheduledWorkouts.find((s) => s.date === dateKey)
        if (existing) setScheduledId(existing.id)
        else setBuilder({ dateKey, scheduledId: null })
      }}
      writable
      hint="Tap a day to add or edit a workout."
      onOpenHistory={() => setPane('history')}
      eyebrow={athlete.name}
      onBack={onBack}
      backLabel="← Back to roster"
    />
  )
}
