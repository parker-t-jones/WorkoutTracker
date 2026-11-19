import { useState } from 'react'
import { formatDateKey } from '../../lib/dates'
import {
  exercisePainNote,
  exerciseHasPain,
  exerciseProgress,
  exerciseRpe,
  isCardioExercise,
} from '../../lib/logging'
import {
  formatDistance,
  formatDuration,
  getWeightUnit,
  roundWeight,
} from '../../lib/units'
import { logWeightIn } from '../../lib/progress'
import { useExerciseMedia } from '../../lib/useExerciseMedia'
import DemoMediaManager from './DemoMediaManager'

function prescription(we) {
  if (isCardioExercise(we)) {
    if (we.is_interval) {
      const splits = Array.isArray(we.target_splits) ? we.target_splits : []
      const work = splits.filter((s) => (s.label || 'work') !== 'recovery')
      const n = work.length || we.sets || splits.length
      const sample = work[0] || splits[0]
      const parts = [`${n} work splits`]
      if (sample?.distance != null) {
        parts.push(formatDistance(sample.distance, sample.unit || we.distance_unit || 'mi'))
      } else if (sample?.duration_seconds != null) {
        parts.push(formatDuration(sample.duration_seconds))
      }
      if (sample?.target_pace) parts.push(`@ ${sample.target_pace}`)
      if (we.weight_guidance) parts.push(we.weight_guidance)
      return parts.join(' · ')
    }
    const parts = []
    if (we.target_duration_seconds != null) parts.push(formatDuration(we.target_duration_seconds))
    if (we.target_distance != null) parts.push(formatDistance(we.target_distance, we.distance_unit || 'mi'))
    if (we.weight_guidance) parts.push(we.weight_guidance)
    return parts.join(' · ') || 'Cardio'
  }
  return `${we.sets} × ${we.reps} · ${we.weight_guidance}`
}

/**
 * Read-only view of one athlete workout for their coach: prescription,
 * what the athlete logged, and a demo media manager per exercise.
 */
export default function CoachWorkoutView({
  coachId,
  athleteName,
  scheduled,
  detail,
  logs,
  logSplits,
  onBack,
}) {
  const [weightUnit] = useState(() => getWeightUnit())
  const exercises = detail?.exercises ?? []
  const workout = detail?.workout
  const { media, loading, reload } = useExerciseMedia(exercises, { coachId })

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm text-muted hover:text-ink">
        ← {athleteName || 'Athlete'}
      </button>

      <header className="mb-6">
        <p className="font-display text-sm text-muted">
          {athleteName ? `${athleteName} · ` : ''}
          {workout ? `Week ${workout.week_number} · Day ${workout.day_number} · ` : ''}
          {formatDateKey(scheduled.date)}
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {workout?.focus ?? 'Workout'}
        </h1>
        <p className="mt-1 text-xs text-muted">
          {scheduled.status === 'completed' ? (
            <span className="text-success">Completed</span>
          ) : (
            'Not completed yet'
          )}
          {' · read-only'}
          {loading ? ' · loading demos…' : ''}
        </p>
      </header>

      {!exercises.length ? (
        <p className="text-sm text-muted">No exercises in this workout.</p>
      ) : null}

      <ul className="space-y-3">
        {exercises.map((we, index) => {
          const cardio = isCardioExercise(we)
          const { done, total } = exerciseProgress(we, logs, logSplits)
          const logged = logs
            .filter((l) => l.workout_exercise_id === we.id)
            .sort((a, b) => a.set_number - b.set_number)
          const parentIds = new Set(logged.map((l) => l.id))
          const splits = (logSplits ?? [])
            .filter((s) => parentIds.has(s.log_id))
            .sort((a, b) => a.split_number - b.split_number)
          const rpe = exerciseRpe(logs, we.id)
          const hasPain = exerciseHasPain(logs, we.id)
          const painNote = exercisePainNote(logs, we.id)

          return (
            <li key={we.id} className="rounded border border-orange-dim/40 bg-surface px-3 py-3">
              <div className="text-xs text-muted">
                {cardio ? 'Cardio' : 'Exercise'} {index + 1}
              </div>
              <div className="font-display font-medium">{we.exercise?.name ?? 'Exercise'}</div>
              <div className="mt-1 text-sm text-muted">{prescription(we)}</div>
              {we.notes ? <div className="mt-1 text-sm text-muted">{we.notes}</div> : null}

              <div className="mt-2 space-y-1.5">
                <div className={['text-xs', done > 0 ? 'text-success/85' : 'text-muted'].join(' ')}>
                  Logged {done}/{total}
                  {cardio ? (we.is_interval ? ' splits' : ' session') : ' sets'}
                </div>
                {!cardio && logged.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {logged.map((l) => {
                      const w = logWeightIn(l, weightUnit)
                      return (
                        <span
                          key={l.id}
                          className="rounded border border-success-border/55 bg-surface-alt px-2 py-1 font-mono text-xs tabular-nums text-success"
                        >
                          #{l.set_number}: {l.actual_reps}
                          {w != null ? ` × ${roundWeight(w)} ${weightUnit}` : ''}
                        </span>
                      )
                    })}
                  </div>
                ) : null}
                {cardio && we.is_interval && splits.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {splits.map((s) => (
                      <span
                        key={s.id}
                        className="rounded border border-success-border/55 bg-surface-alt px-2 py-1 font-mono text-xs tabular-nums text-success"
                      >
                        #{s.split_number}
                        {s.duration_seconds != null ? ` ${formatDuration(s.duration_seconds)}` : ''}
                        {s.pace ? ` · ${s.pace}` : ''}
                      </span>
                    ))}
                  </div>
                ) : null}
                {cardio && !we.is_interval && logged[0] ? (
                  <span className="inline-block rounded border border-success-border/55 bg-surface-alt px-2 py-1 font-mono text-xs tabular-nums text-success">
                    {logged[0].actual_duration_seconds != null
                      ? formatDuration(logged[0].actual_duration_seconds)
                      : '—'}
                    {logged[0].actual_distance != null
                      ? ` · ${formatDistance(logged[0].actual_distance, logged[0].distance_unit || 'mi')}`
                      : ''}
                  </span>
                ) : null}
                {rpe != null ? <div className="font-mono text-xs text-muted">RPE {rpe}</div> : null}
                {hasPain ? (
                  <div className="text-xs text-danger">
                    Felt off{painNote ? ` — ${painNote}` : ''}
                  </div>
                ) : null}
              </div>

              <DemoMediaManager
                coachId={coachId}
                workoutExercise={we}
                athleteName={athleteName}
                items={media[we.id] ?? []}
                onChanged={reload}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
