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
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-surface-alt text-2xl font-medium text-ink active:bg-orange-dim/40"
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="font-display text-3xl font-semibold tabular-nums">
            {value}
            {suffix ? (
              <span className="ml-1 text-lg font-normal text-muted">
                {suffix}
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange(roundToStep(value + step, step))}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-surface-alt text-2xl font-medium text-ink active:bg-orange-dim/40"
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

/** Digits + at most one decimal point; no negatives or other characters. */
function sanitizeWeightInput(raw) {
  const cleaned = String(raw).replace(/[^0-9.]/g, '')
  const dot = cleaned.indexOf('.')
  if (dot === -1) return cleaned
  return (
    cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '')
  )
}

function parseWeight(raw) {
  if (raw === '' || raw === '.') return 0
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

function RpePicker({ value, onSelect, onClear, onSkip, saving, editing }) {
  return (
    <div className="space-y-3 rounded border border-orange-dim/40 bg-surface-alt px-3 py-3">
      <div>
        <div className="text-sm font-medium">
          {editing ? 'Edit RPE' : 'How hard did that feel?'}
        </div>
        <p className="mt-0.5 text-xs text-muted">
          Optional — RPE 1 easy, 10 max effort.
          {editing ? ' Tap a number to update.' : ' Skip anytime.'}
        </p>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const selected = value === n
          return (
            <button
              key={n}
              type="button"
              disabled={saving}
              onClick={() => onSelect(n)}
              className={[
                'h-11 rounded text-sm font-semibold tabular-nums active:scale-[0.98]',
                selected
                  ? 'bg-orange text-on-orange'
                  : 'bg-surface text-ink ring-1 ring-orange-dim/50 hover:bg-surface-alt',
                saving ? 'opacity-60' : '',
              ].join(' ')}
              aria-label={`RPE ${n}`}
              aria-pressed={selected}
            >
              {n}
            </button>
          )
        })}
      </div>
      <div className="flex gap-2">
        {editing && value != null && onClear ? (
          <button
            type="button"
            disabled={saving}
            onClick={onClear}
            className="flex-1 py-2 text-sm text-muted hover:text-ink disabled:opacity-60"
          >
            Clear RPE
          </button>
        ) : null}
        <button
          type="button"
          disabled={saving}
          onClick={onSkip}
          className="flex-1 py-2 text-sm text-muted hover:text-ink disabled:opacity-60"
        >
          {editing ? 'Done' : 'Skip'}
        </button>
      </div>
    </div>
  )
}

function SetForm({
  title,
  reps,
  setReps,
  weightText,
  setWeightText,
  saving,
  error,
  primaryLabel,
  onPrimary,
  onCancel,
}) {
  return (
    <div className="space-y-6">
      {title ? (
        <p className="text-sm font-medium text-ink">{title}</p>
      ) : null}

      <Stepper label="Reps" value={reps} onChange={setReps} step={1} min={0} />

      <div>
        <label htmlFor="log-weight" className="mb-2 block text-sm font-medium">
          Weight
        </label>
        <div className="relative">
          <input
            id="log-weight"
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            value={weightText}
            onChange={(e) => setWeightText(sanitizeWeightInput(e.target.value))}
            onFocus={(e) => e.target.select()}
            className="h-14 w-full rounded border border-orange-dim/50 bg-surface px-4 pr-12 text-center font-display text-3xl font-semibold tabular-nums text-ink focus:border-orange focus:outline-none focus:ring-1 focus:ring-orange"
            aria-label="Weight in pounds"
          />
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-lg text-muted">
            lb
          </span>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onPrimary}
        disabled={saving}
        className="w-full rounded bg-orange py-4 text-base font-medium text-on-orange hover:bg-orange-dim disabled:opacity-60"
      >
        {saving ? 'Saving…' : primaryLabel}
      </button>

      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="w-full py-2 text-sm text-muted hover:text-ink disabled:opacity-60"
        >
          Cancel
        </button>
      ) : null}
    </div>
  )
}

export default function LogSet({
  workoutExercise,
  existingLogs,
  onBack,
  onSave,
  onUpdate,
  onSaveRpe,
  saving,
  savingRpe,
  error,
  initialEditLogId = null,
  initialShowRpe = false,
}) {
  const prescribedReps = parsePrescribedReps(workoutExercise.reps)
  const loggedCount = existingLogs.length
  const nextSet = loggedCount + 1
  const done = loggedCount >= workoutExercise.sets

  const existingRpe =
    existingLogs.find((l) => l.rpe != null)?.rpe ?? null

  const [reps, setReps] = useState(prescribedReps)
  // String so the user can clear/type mid-edit (e.g. "12.") without fighting a number.
  const [weightText, setWeightText] = useState(() =>
    String(defaultWeight(workoutExercise, existingLogs)),
  )
  const [rpe, setRpe] = useState(existingRpe)
  // After first completion prompt is dismissed, keep a compact "edit RPE" affordance.
  const [rpePromptOpen, setRpePromptOpen] = useState(
    () => Boolean(initialShowRpe) || (done && existingRpe == null),
  )
  const [editingLogId, setEditingLogId] = useState(initialEditLogId)

  const editingLog =
    editingLogId != null
      ? existingLogs.find((l) => l.id === editingLogId) ?? null
      : null

  // Re-seed defaults only when moving to the next set (after a successful save).
  const prevLoggedCount = useRef(loggedCount)
  useEffect(() => {
    if (prevLoggedCount.current === loggedCount) return
    prevLoggedCount.current = loggedCount
    if (done || editingLogId) return
    setReps(prescribedReps)
    setWeightText(String(defaultWeight(workoutExercise, existingLogs)))
    if (loggedCount >= workoutExercise.sets && existingRpe == null) {
      setRpePromptOpen(true)
    }
  }, [
    loggedCount,
    done,
    prescribedReps,
    workoutExercise,
    existingLogs,
    editingLogId,
    existingRpe,
  ])

  useEffect(() => {
    setRpe(existingRpe)
  }, [existingRpe])

  // Load values when entering edit mode for a specific set.
  useEffect(() => {
    if (!editingLog) return
    setReps(Number(editingLog.actual_reps) || 0)
    setWeightText(
      editingLog.actual_weight != null
        ? String(editingLog.actual_weight)
        : '0',
    )
  }, [editingLog])

  function startEdit(log) {
    setEditingLogId(log.id)
    setRpePromptOpen(false)
    setReps(Number(log.actual_reps) || 0)
    setWeightText(log.actual_weight != null ? String(log.actual_weight) : '0')
  }

  function cancelEdit() {
    setEditingLogId(null)
    if (!done) {
      setReps(prescribedReps)
      setWeightText(String(defaultWeight(workoutExercise, existingLogs)))
    }
  }

  async function handleSave() {
    if (done || saving || editingLog) return
    await onSave({
      set_number: nextSet,
      actual_reps: reps,
      actual_weight: parseWeight(weightText),
    })
  }

  async function handleUpdate() {
    if (!editingLog || saving || !onUpdate) return
    try {
      await onUpdate({
        log_id: editingLog.id,
        actual_reps: reps,
        actual_weight: parseWeight(weightText),
      })
      setEditingLogId(null)
    } catch {
      // Parent sets error; stay in edit mode.
    }
  }

  async function handleRpeSelect(n) {
    const leaveAfterFirstPrompt =
      done && !initialShowRpe && existingRpe == null
    setRpe(n)
    if (onSaveRpe) {
      try {
        await onSaveRpe(n)
      } catch {
        return
      }
    }
    setRpePromptOpen(false)
    if (leaveAfterFirstPrompt) onBack()
  }

  async function handleRpeClear() {
    setRpe(null)
    if (onSaveRpe) {
      try {
        await onSaveRpe(null)
      } catch {
        return
      }
    }
    setRpePromptOpen(false)
  }

  function handleRpeSkip() {
    const leaveAfterFirstPrompt =
      done && !initialShowRpe && existingRpe == null && !editingLog
    setRpePromptOpen(false)
    if (leaveAfterFirstPrompt) onBack()
  }

  const sortedLogs = existingLogs
    .slice()
    .sort((a, b) => a.set_number - b.set_number)

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-sm text-muted hover:text-ink"
      >
        ← Workout
      </button>

      <header className="mb-6">
        <p className="text-sm text-muted">
          {editingLog
            ? `Editing set ${editingLog.set_number} of ${workoutExercise.sets}`
            : done
              ? `${workoutExercise.sets} sets logged`
              : `Set ${Math.min(nextSet, workoutExercise.sets)} of ${workoutExercise.sets}`}
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {workoutExercise.exercise?.name ?? 'Exercise'}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Prescribed: {workoutExercise.sets} × {workoutExercise.reps} ·{' '}
          {workoutExercise.weight_guidance}
        </p>
        {workoutExercise.notes ? (
          <p className="mt-1 text-sm text-muted">{workoutExercise.notes}</p>
        ) : null}
      </header>

      {sortedLogs.length > 0 && !editingLog && (
        <ul className="mb-6 space-y-1 rounded border border-orange-dim/40 bg-surface px-3 py-2 text-sm">
          {sortedLogs.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => startEdit(l)}
                className="flex w-full items-center justify-between py-2 text-left hover:bg-surface-alt active:bg-surface-alt"
              >
                <span className="font-mono">Set {l.set_number}</span>
                <span className="font-mono tabular-nums text-ink">
                  {l.actual_reps} reps
                  {l.actual_weight != null ? ` x ${l.actual_weight}` : ''}
                  <span className="ml-2 font-sans text-xs text-muted">Edit</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editingLog ? (
        <SetForm
          title={`Edit set ${editingLog.set_number}`}
          reps={reps}
          setReps={setReps}
          weightText={weightText}
          setWeightText={setWeightText}
          saving={saving}
          error={error}
          primaryLabel="Save changes"
          onPrimary={handleUpdate}
          onCancel={cancelEdit}
        />
      ) : done ? (
        <div className="space-y-3">
          <p className="rounded border border-success-border/55 bg-surface-alt px-3 py-3 text-sm text-success">
            All {workoutExercise.sets} sets logged — tap a set above to edit.
          </p>

          {rpePromptOpen ? (
            <RpePicker
              value={rpe}
              onSelect={handleRpeSelect}
              onClear={existingRpe != null ? handleRpeClear : undefined}
              onSkip={handleRpeSkip}
              saving={savingRpe}
              editing={existingRpe != null || Boolean(initialShowRpe)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setRpePromptOpen(true)}
              className="w-full rounded border border-orange-dim/40 bg-surface px-3 py-3 text-left text-sm hover:bg-surface-alt"
            >
              <span className="font-medium text-ink">
                {rpe != null ? `RPE ${rpe}` : 'Add RPE'}
              </span>
              <span className="ml-2 text-muted">
                {rpe != null ? '· tap to change' : '· optional'}
              </span>
            </button>
          )}

          {error && !editingLog ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={onBack}
            className="w-full rounded bg-orange py-3 text-sm font-medium text-on-orange hover:bg-orange-dim"
          >
            Back to workout
          </button>
        </div>
      ) : (
        <SetForm
          reps={reps}
          setReps={setReps}
          weightText={weightText}
          setWeightText={setWeightText}
          saving={saving}
          error={error}
          primaryLabel={`Log set ${nextSet}`}
          onPrimary={handleSave}
        />
      )}
    </div>
  )
}
