import { useMemo, useState } from 'react'
import { NotebookPen, TriangleAlert } from 'lucide-react'
import {
  exerciseRpe,
  exerciseHasPain,
  exercisePainNote,
  exerciseProgress,
  isCardioExercise,
  isExerciseFullyLogged,
} from '../lib/logging'
import {
  formatDistance,
  formatDuration,
  getWeightUnit,
  roundWeight,
} from '../lib/units'
import { logWeightIn } from '../lib/progress'
import { formatDateKey } from '../lib/dates'
import { notesByWorkoutExercise } from '../lib/notes'
import ExerciseNoteSheet from './ExerciseNoteSheet'

/**
 * The athlete's note for one exercise: exercise_notes row, else a legacy
 * logs.pain_flag / pain_note ("felt off") from before notes existed.
 */
function noteFor(we, notesMap, logs) {
  const row = notesMap.get(we.id) ?? null
  const logPain = exerciseHasPain(logs, we.id)
  const text = row?.note ?? (logPain ? exercisePainNote(logs, we.id) : null)
  return {
    text: text || null,
    isPain: Boolean(row?.is_pain) || logPain,
    exists: Boolean(row) || logPain,
  }
}

function NotePreview({ note }) {
  if (!note.exists) return null
  return (
    <p
      className={[
        'mt-2 flex items-start gap-1.5 text-xs',
        note.isPain ? 'text-danger' : 'text-muted',
      ].join(' ')}
    >
      {note.isPain ? (
        <TriangleAlert aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
      ) : (
        <NotebookPen aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
      )}
      <span className="line-clamp-2 break-words">
        {note.isPain ? 'Pain / discomfort' : 'Note'}
        {note.text ? ` — ${note.text}` : ''}
      </span>
    </p>
  )
}

function prescribeLabel(we) {
  if (isCardioExercise(we)) {
    if (we.is_interval) {
      const splits = Array.isArray(we.target_splits) ? we.target_splits : []
      const work = splits.filter((s) => (s.label || 'work') !== 'recovery')
      const n = work.length || we.sets || splits.length
      const sample = work[0] || splits[0]
      const parts = [`${n} work splits`]
      if (sample?.distance != null) {
        parts.push(
          formatDistance(sample.distance, sample.unit || we.distance_unit || 'mi'),
        )
      } else if (sample?.duration_seconds != null) {
        parts.push(formatDuration(sample.duration_seconds))
      }
      if (sample?.target_pace) {
        parts.push(`@ ${sample.target_pace}`)
      }
      if (we.weight_guidance) parts.push(we.weight_guidance)
      return parts.join(' · ')
    }
    const parts = []
    if (we.target_duration_seconds != null) {
      parts.push(formatDuration(we.target_duration_seconds))
    }
    if (we.target_distance != null) {
      parts.push(formatDistance(we.target_distance, we.distance_unit || 'mi'))
    }
    if (we.weight_guidance) parts.push(we.weight_guidance)
    return parts.join(' · ') || 'Cardio'
  }
  return `${we.sets} × ${we.reps} · ${we.weight_guidance}`
}

export default function WorkoutDetail({
  scheduled,
  logs,
  logSplits = [],
  onBack,
  backLabel = 'Calendar',
  onLogExercise,
  // Athlete notes (see ExerciseNoteSheet). onSaveNote/onDeleteNote throw on
  // failure so the sheet can stay open.
  exerciseNotes = [],
  onSaveNote = null,
  onDeleteNote = null,
  savingNoteId = null,
  onFinishWorkout,
  finishingWorkout = false,
  justCompleted,
  error,
  // Optional (we) => node rendered under each exercise's header, e.g. coach
  // demo media. Kept generic so coach mode can plug in without restructuring.
  renderExerciseExtras = null,
}) {
  const { workout, exercises, date, status } = scheduled
  const [noteOpenId, setNoteOpenId] = useState(null)
  const [weightUnit] = useState(() => getWeightUnit())
  const notesMap = useMemo(
    () => notesByWorkoutExercise(exerciseNotes),
    [exerciseNotes],
  )
  const noteExercise =
    noteOpenId != null ? exercises.find((we) => we.id === noteOpenId) : null
  const openNote = noteExercise ? noteFor(noteExercise, notesMap, logs) : null

  let doneUnits = 0
  let totalUnits = 0
  for (const we of exercises) {
    const { done, total } = exerciseProgress(we, logs, logSplits)
    doneUnits += done
    totalUnits += total
  }
  const allDone =
    status === 'completed' ||
    exercises.every((we) => isExerciseFullyLogged(we, logs, logSplits))
  const exerciseIds = new Set(exercises.map((we) => we.id))
  const anyLogged = logs.some((l) => exerciseIds.has(l.workout_exercise_id))
  const canFinish = Boolean(onFinishWorkout) && status !== 'completed' && anyLogged

  function handleFinish() {
    if (!onFinishWorkout || finishingWorkout) return
    const ok = window.confirm(
      'Finish this workout now? Unlogged sets will count as skipped.',
    )
    if (ok) onFinishWorkout()
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 mb-2 min-h-11 px-2 text-sm text-muted hover:text-ink"
      >
        ← {backLabel}
      </button>

      <header className="mb-6">
        <p className="font-display text-sm text-muted">
          Week {workout.week_number} · Day {workout.day_number} · {formatDateKey(date)}
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {workout.focus}
        </h1>
        <p className="mt-2 font-mono text-xs text-muted">
          {doneUnits}/{totalUnits} logged
        </p>
      </header>

      {(justCompleted || allDone) && (
        <p className="mb-4 rounded border border-success-border/55 bg-surface-alt px-3 py-3 text-sm text-success">
          Workout complete — nice work. Tap any item to edit.
        </p>
      )}

      {error ? (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {exercises.map((we, index) => {
          const cardio = isCardioExercise(we)
          const { done, total } = exerciseProgress(we, logs, logSplits)
          const exerciseDone = isExerciseFullyLogged(we, logs, logSplits)
          const logged = logs
            .filter((l) => l.workout_exercise_id === we.id)
            .sort((a, b) => a.set_number - b.set_number)
          const rpe = exerciseRpe(logs, we.id)
          const note = noteFor(we, notesMap, logs)
          const parentIds = new Set(logged.map((l) => l.id))
          const splits = (logSplits ?? []).filter((s) =>
            parentIds.has(s.log_id),
          )

          return (
            <li
              key={we.id}
              className="rounded border border-orange-dim/40 bg-surface px-3 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted">
                    {cardio ? 'Cardio' : 'Exercise'} {index + 1}
                  </div>
                  <div className="font-display font-medium">
                    {we.exercise?.name ?? 'Exercise'}
                  </div>
                  <div className="mt-1 text-sm text-muted">
                    {prescribeLabel(we)}
                  </div>
                  {we.notes ? (
                    <div className="mt-1 text-sm text-muted">{we.notes}</div>
                  ) : null}
                  {renderExerciseExtras ? renderExerciseExtras(we) : null}
                  <NotePreview note={note} />
                  {logged.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      <div className="text-xs text-success/85">
                        Logged {done}/{total}
                        {cardio
                          ? we.is_interval
                            ? ' splits'
                            : ' session'
                          : ' sets'}
                      </div>
                      {!cardio ? (
                        <div className="flex flex-wrap gap-1.5">
                          {logged.slice(0, we.sets).map((l) => (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() =>
                                onLogExercise(we.id, { editLogId: l.id })
                              }
                              className="rounded border border-success-border/55 bg-surface-alt px-2 py-1 font-mono text-xs tabular-nums text-success hover:border-success-border hover:text-ink"
                              aria-label={`Edit set ${l.set_number}`}
                            >
                              #{l.set_number}: {l.actual_reps}
                              {l.actual_weight != null
                                ? `x${roundWeight(logWeightIn(l, weightUnit))}`
                                : ''}
                            </button>
                          ))}
                        </div>
                      ) : we.is_interval ? (
                        <div className="flex flex-wrap gap-1.5">
                          {splits.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => onLogExercise(we.id)}
                              className="rounded border border-success-border/55 bg-surface-alt px-2 py-1 font-mono text-xs tabular-nums text-success"
                            >
                              #{s.split_number}
                              {s.pace ? `: ${s.pace}` : ''}
                            </button>
                          ))}
                        </div>
                      ) : logged[0] ? (
                        <button
                          type="button"
                          onClick={() => onLogExercise(we.id)}
                          className="rounded border border-success-border/55 bg-surface-alt px-2 py-1 font-mono text-xs tabular-nums text-success"
                        >
                          {logged[0].actual_duration_seconds != null
                            ? formatDuration(logged[0].actual_duration_seconds)
                            : '—'}
                          {logged[0].actual_distance != null
                            ? ` · ${formatDistance(logged[0].actual_distance, logged[0].distance_unit || 'mi')}`
                            : ''}
                        </button>
                      ) : null}
                      {exerciseDone ? (
                        <button
                          type="button"
                          onClick={() =>
                            onLogExercise(we.id, { showRpe: true })
                          }
                          className="text-xs text-muted hover:text-ink"
                        >
                          {rpe != null
                            ? `RPE ${rpe} · tap to change`
                            : 'Add RPE'}
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="flex w-[5.75rem] shrink-0 flex-col items-stretch gap-2">
                  <button
                    type="button"
                    onClick={() => onLogExercise(we.id)}
                    className="rounded bg-orange px-3 py-1.5 text-sm font-medium text-on-orange hover:bg-orange-dim"
                  >
                    {exerciseDone ? 'Edit' : done > 0 ? 'Continue' : 'Log'}
                  </button>
                  {onSaveNote ? (
                    <button
                      type="button"
                      onClick={() => setNoteOpenId(we.id)}
                      className={[
                        'flex min-h-11 items-center justify-center gap-1 rounded px-2 text-center text-xs font-medium',
                        note.exists
                          ? 'bg-ink/15 text-ink ring-1 ring-ink/20'
                          : 'bg-ink/10 text-muted hover:bg-ink/15 hover:text-ink',
                      ].join(' ')}
                      aria-label={
                        note.exists
                          ? `Edit note for ${we.exercise?.name ?? 'exercise'}`
                          : `Add note for ${we.exercise?.name ?? 'exercise'}`
                      }
                    >
                      <NotebookPen aria-hidden className="h-3.5 w-3.5 shrink-0" />
                      {note.exists ? 'Edit note' : 'Note'}
                    </button>
                  ) : null}
                </div>
              </div>

            </li>
          )
        })}
      </ul>

      {noteExercise && onSaveNote ? (
        <ExerciseNoteSheet
          key={noteExercise.id}
          exerciseName={noteExercise.exercise?.name ?? 'Exercise'}
          initialNote={openNote.text ?? ''}
          initialPain={openNote.isPain}
          hasNote={openNote.exists}
          saving={savingNoteId === noteExercise.id}
          onSave={({ note, isPain }) =>
            onSaveNote({ workoutExerciseId: noteExercise.id, note, isPain })
          }
          onDelete={() => onDeleteNote?.(noteExercise.id)}
          onClose={() => setNoteOpenId(null)}
        />
      ) : null}

      {canFinish ? (
        <button
          type="button"
          onClick={handleFinish}
          disabled={finishingWorkout}
          className="mt-6 w-full rounded border border-orange-dim/50 bg-surface py-4 text-base font-medium text-ink hover:bg-surface-alt disabled:opacity-60"
        >
          {finishingWorkout ? 'Finishing…' : 'Finish workout'}
        </button>
      ) : null}
    </div>
  )
}
