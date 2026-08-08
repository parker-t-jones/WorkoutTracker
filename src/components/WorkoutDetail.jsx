import { useState } from 'react'
import {
  loggedCountFor,
  exerciseRpe,
  exerciseHasPain,
  exercisePainNote,
} from '../lib/logging'

export default function WorkoutDetail({
  scheduled,
  logs,
  onBack,
  onLogExercise,
  onSavePain,
  savingPainId,
  justCompleted,
  error,
}) {
  const { workout, exercises, date, status } = scheduled
  const [painOpenId, setPainOpenId] = useState(null)
  const [painDraft, setPainDraft] = useState('')

  const totalSets = exercises.reduce((sum, we) => sum + we.sets, 0)
  const loggedSets = exercises.reduce(
    (sum, we) => sum + Math.min(loggedCountFor(logs, we.id), we.sets),
    0,
  )
  const allDone = status === 'completed' || loggedSets >= totalSets

  function openPain(weId) {
    setPainOpenId(weId)
    setPainDraft(exercisePainNote(logs, weId) ?? '')
  }

  function closePain() {
    setPainOpenId(null)
    setPainDraft('')
  }

  async function savePain(weId, flagged) {
    if (!onSavePain) return
    await onSavePain({
      workoutExerciseId: weId,
      painFlag: flagged,
      painNote: flagged ? painDraft : null,
    })
    if (!flagged) closePain()
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-sm text-muted hover:text-ink"
      >
        ← Calendar
      </button>

      <header className="mb-6">
        <p className="font-display text-sm text-muted">
          Week {workout.week_number} · Day {workout.day_number} · {date}
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {workout.focus}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={[
              'inline-block rounded px-2 py-0.5 text-xs font-medium',
              allDone
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-800',
            ].join(' ')}
          >
            {allDone ? 'completed' : status}
          </span>
          <span className="font-mono text-xs text-muted">
            {loggedSets}/{totalSets} sets logged
          </span>
        </div>
      </header>

      {(justCompleted || allDone) && (
        <p className="mb-4 rounded bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
          Workout complete — nice work. Tap any set to edit.
        </p>
      )}

      {error ? (
        <p role="alert" className="mb-4 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {exercises.map((we, index) => {
          const logged = logs
            .filter((l) => l.workout_exercise_id === we.id)
            .sort((a, b) => a.set_number - b.set_number)
          const count = logged.length
          const exerciseDone = count >= we.sets
          const rpe = exerciseRpe(logs, we.id)
          const hasPain = exerciseHasPain(logs, we.id)
          const painOpen = painOpenId === we.id
          const savingThis = savingPainId === we.id

          return (
            <li
              key={we.id}
              className="rounded border border-orange-dim/40 bg-surface px-3 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted">
                    Exercise {index + 1}
                  </div>
                  <div className="font-display font-medium">
                    {we.exercise?.name ?? 'Exercise'}
                  </div>
                  <div className="mt-1 text-sm text-muted">
                    {we.sets} × {we.reps} · {we.weight_guidance}
                  </div>
                  {we.notes ? (
                    <div className="mt-1 text-sm text-muted">{we.notes}</div>
                  ) : null}
                  {count > 0 && (
                    <div className="mt-2 space-y-1.5">
                      <div className="text-xs text-emerald-700">
                        Logged {Math.min(count, we.sets)}/{we.sets} sets
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {logged.slice(0, we.sets).map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() =>
                              onLogExercise(we.id, { editLogId: l.id })
                            }
                            className="rounded bg-emerald-50 px-2 py-1 font-mono text-xs tabular-nums text-emerald-900 ring-1 ring-emerald-100 hover:bg-emerald-100"
                            aria-label={`Edit set ${l.set_number}`}
                          >
                            #{l.set_number}: {l.actual_reps}
                            {l.actual_weight != null
                              ? `@${l.actual_weight}`
                              : ''}
                          </button>
                        ))}
                      </div>
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
                      {hasPain ? (
                        <span className="block text-xs text-amber-800">
                          felt off
                          {exercisePainNote(logs, we.id)
                            ? ` — ${exercisePainNote(logs, we.id)}`
                            : ''}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="flex w-[5.75rem] shrink-0 flex-col items-stretch gap-2">
                  <button
                    type="button"
                    onClick={() => onLogExercise(we.id)}
                    className={[
                      'rounded px-3 py-1.5 text-sm font-medium',
                      exerciseDone
                        ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
                        : 'bg-orange text-bg hover:bg-orange-dim',
                    ].join(' ')}
                  >
                    {exerciseDone ? 'Edit' : count > 0 ? 'Continue' : 'Log'}
                  </button>
                  {exerciseDone ? (
                    <button
                      type="button"
                      onClick={() =>
                        painOpen ? closePain() : openPain(we.id)
                      }
                      className={[
                        'rounded px-2 py-1.5 text-center text-xs font-medium',
                        hasPain || painOpen
                          ? 'bg-white/15 text-ink ring-1 ring-white/20'
                          : 'bg-white/10 text-muted hover:bg-white/15 hover:text-ink',
                      ].join(' ')}
                      aria-expanded={painOpen}
                      aria-label={
                        hasPain ? 'Edit felt-off note' : 'Flag if this felt off'
                      }
                    >
                      {hasPain ? 'Felt off ✓' : 'Felt off?'}
                    </button>
                  ) : null}
                </div>
              </div>

              {painOpen ? (
                <div className="mt-3 space-y-2 border-t border-orange-dim/30 pt-3">
                  <p className="text-xs text-muted">
                    Optional — note where or what felt off. Not medical advice,
                    just for your log.
                  </p>
                  <textarea
                    value={painDraft}
                    onChange={(e) => setPainDraft(e.target.value)}
                    rows={2}
                    placeholder="e.g. left shoulder on the press"
                    className="w-full rounded border border-orange-dim/50 bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-orange focus:outline-none focus:ring-1 focus:ring-orange"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={savingThis}
                      onClick={() => savePain(we.id, true)}
                      className="rounded bg-orange px-3 py-1.5 text-xs font-medium text-bg hover:bg-orange-dim disabled:opacity-60"
                    >
                      {savingThis ? 'Saving…' : hasPain ? 'Update note' : 'Save'}
                    </button>
                    {hasPain ? (
                      <button
                        type="button"
                        disabled={savingThis}
                        onClick={() => savePain(we.id, false)}
                        className="rounded px-3 py-1.5 text-xs text-muted hover:bg-surface-alt hover:text-ink disabled:opacity-60"
                      >
                        Clear
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={savingThis}
                        onClick={() => savePain(we.id, true)}
                        className="rounded px-3 py-1.5 text-xs text-muted hover:bg-surface-alt hover:text-ink disabled:opacity-60"
                      >
                        Flag without note
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={closePain}
                      className="rounded px-3 py-1.5 text-xs text-muted hover:bg-surface-alt"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
