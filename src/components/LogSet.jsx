import { useEffect, useState, useRef } from 'react'
import {
  parsePrescribedReps,
  isBodyweightGuidance,
} from '../lib/logging'

function Stepper({ label, value, onChange, step = 1, min = 0, suffix = '' }) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium">{label}</div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, roundToStep(value - step, step)))}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-stone-200 text-2xl font-medium active:bg-stone-300"
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="text-3xl font-semibold tabular-nums">
            {value}
            {suffix ? (
              <span className="ml-1 text-lg font-normal text-stone-500">
                {suffix}
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange(roundToStep(value + step, step))}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-stone-200 text-2xl font-medium active:bg-stone-300"
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  )
}

function roundToStep(n, step) {
  const precision = step < 1 ? 1 : 0
  const rounded = Math.round(n / step) * step
  return Number(rounded.toFixed(precision))
}

function defaultWeight(workoutExercise, existingLogs) {
  const sorted = existingLogs
    .slice()
    .sort((a, b) => b.set_number - a.set_number)
  const lastWithWeight = sorted.find((l) => l.actual_weight != null)
  if (lastWithWeight) return Number(lastWithWeight.actual_weight)

  if (isBodyweightGuidance(workoutExercise.weight_guidance)) return 0
  return 135
}

export default function LogSet({
  workoutExercise,
  existingLogs,
  onBack,
  onSave,
  saving,
  error,
}) {
  const prescribedReps = parsePrescribedReps(workoutExercise.reps)
  const loggedCount = existingLogs.length
  const nextSet = loggedCount + 1
  const done = loggedCount >= workoutExercise.sets

  const [reps, setReps] = useState(prescribedReps)
  const [weight, setWeight] = useState(() =>
    defaultWeight(workoutExercise, existingLogs),
  )

  // Re-seed defaults only when moving to the next set (after a successful save).
  const prevLoggedCount = useRef(loggedCount)
  useEffect(() => {
    if (prevLoggedCount.current === loggedCount) return
    prevLoggedCount.current = loggedCount
    if (done) return
    setReps(prescribedReps)
    setWeight(defaultWeight(workoutExercise, existingLogs))
  }, [loggedCount, done, prescribedReps, workoutExercise, existingLogs])

  async function handleSave() {
    if (done || saving) return
    await onSave({
      set_number: nextSet,
      actual_reps: reps,
      // Allow 0 weight (bodyweight); still persist the number the user set.
      actual_weight: weight,
    })
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-sm text-stone-600 hover:text-stone-900"
      >
        ← Workout
      </button>

      <header className="mb-6">
        <p className="text-sm text-stone-500">
          Set {Math.min(nextSet, workoutExercise.sets)} of {workoutExercise.sets}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {workoutExercise.exercise?.name ?? 'Exercise'}
        </h1>
        <p className="mt-1 text-sm text-stone-600">
          Prescribed: {workoutExercise.sets} × {workoutExercise.reps} ·{' '}
          {workoutExercise.weight_guidance}
        </p>
        {workoutExercise.notes ? (
          <p className="mt-1 text-sm text-stone-500">{workoutExercise.notes}</p>
        ) : null}
      </header>

      {existingLogs.length > 0 && (
        <ul className="mb-6 space-y-1 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm">
          {existingLogs
            .slice()
            .sort((a, b) => a.set_number - b.set_number)
            .map((l) => (
              <li key={l.id} className="flex justify-between py-1">
                <span>Set {l.set_number}</span>
                <span className="tabular-nums">
                  {l.actual_reps} reps
                  {l.actual_weight != null ? ` @ ${l.actual_weight}` : ''}
                </span>
              </li>
            ))}
        </ul>
      )}

      {done ? (
        <div className="space-y-3">
          <p className="rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
            All {workoutExercise.sets} sets logged for this exercise.
          </p>
          <button
            type="button"
            onClick={onBack}
            className="w-full rounded-md bg-stone-900 py-3 text-sm font-medium text-white hover:bg-stone-700"
          >
            Back to workout
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <Stepper
            label="Reps"
            value={reps}
            onChange={setReps}
            step={1}
            min={0}
          />

          <div>
            <Stepper
              label="Weight"
              value={weight}
              onChange={setWeight}
              step={5}
              min={0}
              suffix="lb"
            />
            <div className="mt-2 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setWeight((w) => roundToStep(Math.max(0, w - 2.5), 2.5))}
                className="rounded px-2 py-1 text-xs text-stone-600 hover:bg-stone-200"
              >
                −2.5
              </button>
              <button
                type="button"
                onClick={() => setWeight((w) => roundToStep(w + 2.5, 2.5))}
                className="rounded px-2 py-1 text-xs text-stone-600 hover:bg-stone-200"
              >
                +2.5
              </button>
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-md bg-stone-900 py-4 text-base font-medium text-white hover:bg-stone-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : `Log set ${nextSet}`}
          </button>
        </div>
      )}
    </div>
  )
}
