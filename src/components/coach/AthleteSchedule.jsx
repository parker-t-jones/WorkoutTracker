import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, LoaderCircle } from 'lucide-react'
import { exerciseProgress } from '../../lib/logging'
import { loadAthleteProgram, splitSchedule, todayIso } from '../../lib/coach'
import CoachWorkoutView from './CoachWorkoutView'

function progressFor(detail, logs, logSplits) {
  let done = 0
  let total = 0
  for (const we of detail?.exercises ?? []) {
    const p = exerciseProgress(we, logs, logSplits)
    done += p.done
    total += p.total
  }
  return { done, total }
}

function StatusBadge({ sw, progress }) {
  const today = todayIso()
  if (sw.status === 'completed') {
    return <span className="text-xs font-medium text-success">Done</span>
  }
  if (progress.done > 0) {
    return (
      <span className="font-mono text-xs text-muted">
        {progress.done}/{progress.total}
      </span>
    )
  }
  if (sw.date < today) return <span className="text-xs text-danger">Missed</span>
  if (sw.date === today) return <span className="text-xs text-orange">Today</span>
  return <span className="text-xs text-muted">Upcoming</span>
}

function formatDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/** An active athlete's schedule (read-only) → tap a workout to manage demos. */
export default function AthleteSchedule({ coachId, link, onBack }) {
  const athleteId = link.other_user_id
  const athleteName = link.other_name || link.other_email || 'Athlete'
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await loadAthleteProgram(athleteId))
    } catch (err) {
      console.error(err)
      setError(err.message || 'Could not load this athlete’s program')
    } finally {
      setLoading(false)
    }
  }, [athleteId])

  useEffect(() => {
    load()
  }, [load])

  const open = openId && data ? data.scheduledWorkouts.find((s) => s.id === openId) : null
  if (open) {
    return (
      <CoachWorkoutView
        coachId={coachId}
        athleteName={athleteName}
        scheduled={open}
        detail={data.workoutDetails[open.workout_id]}
        logs={data.logs}
        logSplits={data.logSplits}
        onBack={() => setOpenId(null)}
      />
    )
  }

  const { upcoming, recent } = splitSchedule(data?.scheduledWorkouts)

  function renderList(list, emptyText) {
    if (!list.length) return <p className="text-sm text-muted">{emptyText}</p>
    return (
      <ul className="space-y-2">
        {list.map((sw) => {
          const detail = data.workoutDetails[sw.workout_id]
          const progress = progressFor(detail, data.logs, data.logSplits)
          return (
            <li key={sw.id}>
              <button
                type="button"
                onClick={() => setOpenId(sw.id)}
                className="flex w-full items-center justify-between gap-3 rounded border border-orange-dim/40 bg-surface px-3 py-3 text-left hover:border-orange"
              >
                <div className="min-w-0">
                  <div className="text-xs text-muted">{formatDate(sw.date)}</div>
                  <div className="truncate font-display font-medium text-ink">
                    {detail?.workout?.focus ?? 'Workout'}
                  </div>
                  <div className="text-xs text-muted">
                    {(detail?.exercises?.length ?? 0)} exercises
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge sw={sw} progress={progress} />
                  <ChevronRight className="h-4 w-4 text-muted" aria-hidden="true" />
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm text-muted hover:text-ink">
        ← Athletes
      </button>
      <header className="mb-6">
        <p className="text-sm text-muted">{link.other_email}</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{athleteName}</h1>
      </header>

      {loading && !data ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading program…
        </p>
      ) : null}

      {error ? (
        <div className="mb-4 space-y-2">
          <p role="alert" className="text-sm text-danger">{error}</p>
          <button
            type="button"
            onClick={load}
            className="rounded border border-orange-dim/50 bg-surface px-3 py-1.5 text-sm text-ink hover:bg-surface-alt"
          >
            Retry
          </button>
        </div>
      ) : null}

      {data && !data.scheduledWorkouts.length ? (
        <p className="text-sm text-muted">
          {athleteName} has no scheduled workouts yet.
        </p>
      ) : null}

      {data && data.scheduledWorkouts.length ? (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">Upcoming</h2>
            {renderList(upcoming, 'Nothing scheduled ahead.')}
          </section>
          <section>
            <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">Recent</h2>
            {renderList(recent, 'No past workouts yet.')}
          </section>
        </div>
      ) : null}
    </div>
  )
}
