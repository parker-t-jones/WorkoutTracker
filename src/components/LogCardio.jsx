import { useEffect, useMemo, useState } from 'react'
import {
  exerciseRpe,
  isExerciseFullyLogged,
  prescribedSplitCount,
} from '../lib/logging'
import {
  combineDurationFields,
  computePace,
  formatDuration,
  formatDistance,
  getDistanceUnit,
  splitDurationFields,
} from '../lib/units'

function sanitizeMinutes(raw) {
  const digits = String(raw).replace(/\D/g, '')
  return digits
}

function sanitizeSeconds(raw) {
  const digits = String(raw).replace(/\D/g, '')
  if (digits === '') return ''
  const n = Number(digits)
  if (!Number.isFinite(n)) return ''
  return String(Math.min(59, n))
}

/** Dual Min / Sec numeric inputs — mobile-friendly (no colon needed). */
function DurationMinSecFields({
  minutes,
  seconds,
  onMinutesChange,
  onSecondsChange,
  size = 'lg',
}) {
  const inputClass =
    size === 'sm'
      ? 'w-full rounded border border-orange-dim/50 bg-bg px-2 py-2 font-mono text-sm tabular-nums text-ink'
      : 'w-full rounded border border-orange-dim/50 bg-surface px-3 py-3 font-mono text-xl tabular-nums text-ink'
  const labelClass = size === 'sm' ? 'text-xs text-muted' : 'text-xs text-muted'

  return (
    <div className="space-y-2">
      <span className={size === 'sm' ? 'text-xs text-muted' : 'text-sm font-medium'}>
        Duration
      </span>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className={labelClass}>Min</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="0"
            value={minutes}
            onChange={(e) => onMinutesChange(sanitizeMinutes(e.target.value))}
            className={inputClass}
            aria-label="Minutes"
          />
        </label>
        <label className="block space-y-1">
          <span className={labelClass}>Sec</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="0"
            value={seconds}
            onChange={(e) => onSecondsChange(sanitizeSeconds(e.target.value))}
            className={inputClass}
            aria-label="Seconds"
          />
        </label>
      </div>
    </div>
  )
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

function SteadyCardioForm({
  workoutExercise,
  existingLog,
  unit,
  saving,
  error,
  onSave,
}) {
  const [minutes, setMinutes] = useState(() => {
    const split = splitDurationFields(
      existingLog?.actual_duration_seconds ??
        workoutExercise.target_duration_seconds ??
        null,
    )
    return split.minutes
  })
  const [seconds, setSeconds] = useState(() => {
    const split = splitDurationFields(
      existingLog?.actual_duration_seconds ??
        workoutExercise.target_duration_seconds ??
        null,
    )
    return split.seconds
  })
  const [distanceText, setDistanceText] = useState(() =>
    existingLog?.actual_distance != null
      ? String(existingLog.actual_distance)
      : workoutExercise.target_distance != null
        ? String(workoutExercise.target_distance)
        : '',
  )

  const durationSec = combineDurationFields(minutes, seconds)
  const distance = Number(distanceText)
  const pace =
    durationSec != null && Number.isFinite(distance) && distance > 0
      ? computePace(durationSec, distance)
      : null
  const canSave =
    (durationSec != null && durationSec > 0) ||
    (Number.isFinite(distance) && distance > 0)

  return (
    <div className="space-y-4">
      <div className="rounded border border-orange-dim/40 bg-surface px-3 py-3 text-sm text-muted">
        <div className="font-display text-ink">Target</div>
        <div className="mt-1 font-mono text-xs">
          {workoutExercise.target_duration_seconds != null
            ? formatDuration(workoutExercise.target_duration_seconds)
            : '—'}
          {' · '}
          {workoutExercise.target_distance != null
            ? formatDistance(
                workoutExercise.target_distance,
                workoutExercise.distance_unit || unit,
              )
            : '—'}
          {workoutExercise.weight_guidance
            ? ` · ${workoutExercise.weight_guidance}`
            : ''}
        </div>
      </div>

      <DurationMinSecFields
        minutes={minutes}
        seconds={seconds}
        onMinutesChange={setMinutes}
        onSecondsChange={setSeconds}
        size="lg"
      />

      <label className="block space-y-2">
        <span className="text-sm font-medium">Distance ({unit})</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={distanceText}
          onChange={(e) => setDistanceText(e.target.value)}
          className="w-full rounded border border-orange-dim/50 bg-surface px-3 py-3 font-mono text-xl tabular-nums text-ink"
        />
      </label>

      {pace ? (
        <p className="font-mono text-sm text-muted">
          Pace ≈ {pace}/{unit}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={saving || !canSave}
        onClick={() =>
          onSave({
            actualDurationSeconds: durationSec,
            actualDistance: Number.isFinite(distance) ? distance : null,
            distanceUnit: unit,
          })
        }
        className="w-full rounded bg-orange py-4 text-base font-medium text-on-orange hover:bg-orange-dim disabled:opacity-60"
      >
        {saving ? 'Saving…' : existingLog ? 'Save changes' : 'Log session'}
      </button>
    </div>
  )
}

function IntervalSplitsTable({
  workoutExercise,
  parentLog,
  splits,
  unit,
  saving,
  error,
  onSaveSplit,
}) {
  const targets = Array.isArray(workoutExercise.target_splits)
    ? workoutExercise.target_splits
    : []
  const count = prescribedSplitCount(workoutExercise) || targets.length

  const rows = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const n = i + 1
      const target = targets[i] ?? {}
      const logged = splits.find(
        (s) =>
          s.split_number === n &&
          (parentLog ? s.log_id === parentLog.id : true),
      )
      return { n, target, logged }
    })
  }, [count, targets, splits, parentLog])

  const [drafts, setDrafts] = useState({})

  useEffect(() => {
    const next = {}
    for (const row of rows) {
      const split = splitDurationFields(
        row.logged?.duration_seconds ?? row.target.duration_seconds ?? null,
      )
      next[row.n] = {
        minutes: split.minutes,
        seconds: split.seconds,
        distance:
          row.logged?.distance != null
            ? String(row.logged.distance)
            : row.target.distance != null
              ? String(row.target.distance)
              : '',
      }
    }
    setDrafts(next)
  }, [workoutExercise.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function patchDraft(n, partial) {
    setDrafts((prev) => ({
      ...prev,
      [n]: { ...prev[n], ...partial },
    }))
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Log each split. Target pace shown when prescribed.
      </p>
      <ul className="space-y-2">
        {rows.map(({ n, target, logged }) => {
          const draft = drafts[n] ?? {
            minutes: '',
            seconds: '',
            distance: '',
          }
          const dur = combineDurationFields(draft.minutes, draft.seconds)
          const dist = Number(draft.distance)
          const pace =
            dur != null && Number.isFinite(dist) && dist > 0
              ? computePace(dur, dist)
              : null
          const canSave =
            (dur != null && dur > 0) || (Number.isFinite(dist) && dist > 0)
          return (
            <li
              key={n}
              className="rounded border border-orange-dim/40 bg-surface px-3 py-3"
            >
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="font-display font-medium">
                  Split {n}
                  {target.label ? ` · ${target.label}` : ''}
                </span>
                <span className="font-mono text-xs text-muted">
                  {target.target_pace
                    ? `target ${target.target_pace}/${target.unit || unit}`
                    : target.distance != null
                      ? `target ${formatDistance(target.distance, target.unit || unit)}`
                      : target.duration_seconds != null
                        ? `target ${formatDuration(target.duration_seconds)}`
                        : '—'}
                </span>
              </div>
              <div className="space-y-2">
                <DurationMinSecFields
                  minutes={draft.minutes}
                  seconds={draft.seconds}
                  onMinutesChange={(v) => patchDraft(n, { minutes: v })}
                  onSecondsChange={(v) => patchDraft(n, { seconds: v })}
                  size="sm"
                />
                <label className="block space-y-1">
                  <span className="text-xs text-muted">Dist ({unit})</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={draft.distance}
                    onChange={(e) =>
                      patchDraft(n, { distance: e.target.value })
                    }
                    className="w-full rounded border border-orange-dim/50 bg-bg px-2 py-2 font-mono text-sm tabular-nums text-ink"
                  />
                </label>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted">
                  {logged
                    ? `Logged${logged.pace ? ` · ${logged.pace}/${logged.distance_unit || unit}` : ''}`
                    : pace
                      ? `≈ ${pace}/${unit}`
                      : 'Not logged'}
                </span>
                <button
                  type="button"
                  disabled={saving || !canSave}
                  onClick={() =>
                    onSaveSplit({
                      splitNumber: n,
                      durationSeconds: dur,
                      distance: Number.isFinite(dist) ? dist : null,
                      distanceUnit: unit,
                    })
                  }
                  className="rounded bg-orange px-3 py-1.5 text-xs font-medium text-on-orange hover:bg-orange-dim disabled:opacity-60"
                >
                  {logged ? 'Update' : 'Log'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export default function LogCardio({
  workoutExercise,
  existingLogs,
  logSplits = [],
  onBack,
  onSaveSteady,
  onSaveSplit,
  onSaveRpe,
  saving,
  savingRpe,
  error,
  initialShowRpe = false,
}) {
  const unit = getDistanceUnit()
  const isInterval = Boolean(workoutExercise.is_interval)
  const parentLog =
    existingLogs.find((l) => l.workout_exercise_id === workoutExercise.id) ??
    null
  const splits = logSplits.filter((s) =>
    parentLog ? s.log_id === parentLog.id : false,
  )
  const done = isExerciseFullyLogged(
    workoutExercise,
    existingLogs,
    logSplits,
  )
  const existingRpe = exerciseRpe(existingLogs, workoutExercise.id)
  const [rpe, setRpe] = useState(existingRpe)
  const [rpePromptOpen, setRpePromptOpen] = useState(
    () => Boolean(initialShowRpe) || (done && existingRpe == null),
  )

  useEffect(() => {
    setRpe(existingRpe)
  }, [existingRpe])

  useEffect(() => {
    if (done && existingRpe == null) setRpePromptOpen(true)
  }, [done, existingRpe])

  async function handleRpeSelect(n) {
    const leaveAfterFirst =
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
    if (leaveAfterFirst) onBack()
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
    const leaveAfterFirst =
      done && !initialShowRpe && existingRpe == null
    setRpePromptOpen(false)
    if (leaveAfterFirst) onBack()
  }

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
          {isInterval ? 'Interval cardio' : 'Cardio session'}
          {done ? ' · logged' : ''}
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {workoutExercise.exercise?.name ?? 'Cardio'}
        </h1>
        {workoutExercise.notes ? (
          <p className="mt-1 text-sm text-muted">{workoutExercise.notes}</p>
        ) : null}
      </header>

      {isInterval ? (
        <IntervalSplitsTable
          workoutExercise={workoutExercise}
          parentLog={parentLog}
          splits={splits}
          unit={unit}
          saving={saving}
          error={error}
          onSaveSplit={onSaveSplit}
        />
      ) : (
        <SteadyCardioForm
          workoutExercise={workoutExercise}
          existingLog={parentLog}
          unit={unit}
          saving={saving}
          error={error}
          onSave={onSaveSteady}
        />
      )}

      {done ? (
        <div className="mt-6 space-y-3">
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
          <button
            type="button"
            onClick={onBack}
            className="w-full rounded bg-orange py-3 text-sm font-medium text-on-orange hover:bg-orange-dim"
          >
            Back to workout
          </button>
        </div>
      ) : null}
    </div>
  )
}
