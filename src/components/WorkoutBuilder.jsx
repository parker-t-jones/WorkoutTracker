import { useEffect, useMemo, useState } from 'react'
import {
  combineDurationFields,
  getDistanceUnit,
  splitDurationFields,
} from '../lib/units'
import { normalizeExerciseName } from '../lib/user'
import {
  createOwnedExercise,
  loadExerciseLibrary,
  saveAthleteWorkout,
} from '../lib/coachWorkouts'
import DurationMinSecFields from './DurationMinSecFields'

let draftKey = 0
function nextKey() {
  draftKey += 1
  return `ex-${draftKey}`
}

function emptySplit(label = 'work') {
  return {
    label,
    minutes: '',
    seconds: '',
    distance: '',
    paceMinutes: '',
    paceSeconds: '',
  }
}

function defaultSplits() {
  return [
    emptySplit('work'),
    emptySplit('recovery'),
    emptySplit('work'),
    emptySplit('recovery'),
  ]
}

function splitFromTarget(target) {
  const dur = splitDurationFields(target?.duration_seconds ?? null)
  let paceMinutes = ''
  let paceSeconds = ''
  if (target?.target_pace) {
    const parts = String(target.target_pace).split(':')
    if (parts.length === 2) {
      paceMinutes = parts[0]
      paceSeconds = parts[1]
    }
  }
  return {
    label: target?.label === 'recovery' ? 'recovery' : 'work',
    minutes: dur.minutes,
    seconds: dur.seconds,
    distance: target?.distance != null ? String(target.distance) : '',
    paceMinutes,
    paceSeconds,
  }
}

function draftFromWorkoutExercise(we) {
  const cardio = we.exercise?.modality === 'cardio'
  const dur = splitDurationFields(we.target_duration_seconds ?? null)
  const splits = Array.isArray(we.target_splits)
    ? we.target_splits.map(splitFromTarget)
    : []
  return {
    key: we.id || nextKey(),
    existingWeId: we.id ?? null,
    exercise: we.exercise ?? null,
    sets: String(we.sets ?? (cardio ? 1 : 3)),
    reps: cardio ? '—' : String(we.reps ?? '8'),
    weight_guidance: String(
      we.weight_guidance ?? (cardio ? 'steady' : 'moderate'),
    ),
    notes: we.notes ?? '',
    durationMinutes: dur.minutes,
    durationSeconds: dur.seconds,
    target_distance: we.target_distance != null ? String(we.target_distance) : '',
    distance_unit:
      we.distance_unit === 'km' || we.distance_unit === 'mi'
        ? we.distance_unit
        : getDistanceUnit(),
    is_interval: Boolean(we.is_interval),
    splits: we.is_interval && splits.length ? splits : defaultSplits(),
  }
}

function emptyDraft() {
  return {
    key: nextKey(),
    existingWeId: null,
    exercise: null,
    sets: '3',
    reps: '8',
    weight_guidance: 'moderate',
    notes: '',
    durationMinutes: '',
    durationSeconds: '',
    target_distance: '',
    distance_unit: getDistanceUnit(),
    is_interval: false,
    splits: defaultSplits(),
  }
}

function applyPickedExercise(draft, exercise) {
  const cardio = exercise.modality === 'cardio'
  const interval = cardio && Boolean(exercise.typically_interval)
  return {
    ...draft,
    exercise,
    sets: cardio ? '1' : draft.sets || '3',
    reps: cardio ? '—' : draft.reps === '—' ? '8' : draft.reps || '8',
    weight_guidance: cardio
      ? draft.weight_guidance === 'moderate'
        ? 'steady'
        : draft.weight_guidance || 'steady'
      : draft.weight_guidance === 'steady'
        ? 'moderate'
        : draft.weight_guidance || 'moderate',
    is_interval: interval,
    durationMinutes: cardio ? draft.durationMinutes : '',
    durationSeconds: cardio ? draft.durationSeconds : '',
    target_distance: cardio ? draft.target_distance : '',
    splits: interval ? draft.splits : defaultSplits(),
  }
}

const inputClass =
  'w-full rounded border border-orange-dim/50 bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-orange focus:outline-none focus:ring-1 focus:ring-orange'

function ExercisePicker({ catalog, onPick, onCreated, onClose }) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newModality, setNewModality] = useState('strength')
  const [newInterval, setNewInterval] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const filtered = useMemo(() => {
    const q = normalizeExerciseName(query)
    if (!q) return catalog
    return catalog.filter((e) =>
      normalizeExerciseName(e.name).includes(q),
    )
  }, [catalog, query])

  const exact = useMemo(() => {
    const q = normalizeExerciseName(query)
    if (!q) return null
    return catalog.find((e) => normalizeExerciseName(e.name) === q) ?? null
  }, [catalog, query])

  function startCreate() {
    setError(null)
    setNewName(query.trim())
    setNewModality('strength')
    setNewInterval(false)
    setCreating(true)
  }

  async function handleCreate() {
    const name = newName.trim()
    if (!name) {
      setError('Name is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const created = await createOwnedExercise({
        name,
        modality: newModality,
        typicallyInterval: newInterval,
        catalog,
      })
      onCreated(created)
      onPick(created)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Could not create exercise')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <button
        type="button"
        onClick={onClose}
        className="mb-4 text-sm text-muted hover:text-ink"
      >
        ← Back
      </button>
      <header className="mb-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Choose exercise
        </h1>
        <p className="mt-1 text-sm text-muted">
          Shared library plus your own movements.
        </p>
      </header>

      {creating ? (
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Name</span>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className={inputClass}
              autoFocus
            />
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Type</legend>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'strength', label: 'Strength' },
                { id: 'cardio', label: 'Cardio' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setNewModality(opt.id)}
                  className={[
                    'rounded border py-2 text-sm font-medium',
                    newModality === opt.id
                      ? 'border-orange bg-orange text-on-orange'
                      : 'border-orange-dim/40 bg-surface text-ink hover:border-orange',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>
          {newModality === 'cardio' ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newInterval}
                onChange={(e) => setNewInterval(e.target.checked)}
              />
              Typically intervals
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={saving}
            onClick={handleCreate}
            className="w-full rounded bg-orange py-3 text-sm font-medium text-on-orange hover:bg-orange-dim disabled:opacity-60"
          >
            {saving ? 'Creating…' : 'Create exercise'}
          </button>
        </div>
      ) : (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exercises"
            aria-label="Search exercises"
            className={`mb-4 ${inputClass}`}
            autoFocus
          />
          <ul className="space-y-2">
            {filtered.map((ex) => (
              <li key={ex.id}>
                <button
                  type="button"
                  onClick={() => onPick(ex)}
                  className="flex w-full items-center justify-between gap-3 rounded border border-orange-dim/40 bg-surface px-3 py-3 text-left hover:border-orange"
                >
                  <span className="min-w-0">
                    <span className="block font-display font-medium">
                      {ex.name}
                    </span>
                    <span className="text-xs text-muted">
                      {ex.modality === 'cardio' ? 'Cardio' : 'Strength'}
                      {ex.owner_id ? ' · yours' : ''}
                    </span>
                  </span>
                  <span className="text-sm text-muted" aria-hidden="true">
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted">No matches in the library.</p>
          ) : null}
          {query.trim() && !exact ? (
            <button
              type="button"
              onClick={startCreate}
              className="mt-4 w-full rounded border border-orange-dim/40 bg-surface py-3 text-sm font-medium text-ink hover:border-orange"
            >
              Create “{query.trim()}”
            </button>
          ) : (
            <button
              type="button"
              onClick={startCreate}
              className="mt-4 w-full py-2 text-sm text-muted hover:text-ink"
            >
              Create a custom exercise
            </button>
          )}
        </>
      )}
    </div>
  )
}

function StrengthFields({ draft, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="block space-y-1">
        <span className="text-xs text-muted">Sets</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={draft.sets}
          onChange={(e) =>
            onChange({ sets: e.target.value.replace(/\D/g, '') })
          }
          className={inputClass}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted">Reps</span>
        <input
          type="text"
          value={draft.reps}
          onChange={(e) => onChange({ reps: e.target.value })}
          className={inputClass}
        />
      </label>
      <label className="col-span-2 block space-y-1">
        <span className="text-xs text-muted">Weight guidance</span>
        <input
          type="text"
          value={draft.weight_guidance}
          onChange={(e) => onChange({ weight_guidance: e.target.value })}
          placeholder="e.g. moderate, RPE 7"
          className={inputClass}
        />
      </label>
    </div>
  )
}

function SplitEditor({ splits, onChange, unit }) {
  function patch(i, partial) {
    onChange(splits.map((s, idx) => (idx === i ? { ...s, ...partial } : s)))
  }

  return (
    <ul className="space-y-2">
      {splits.map((split, i) => (
        <li
          key={i}
          className="space-y-2 rounded border border-orange-dim/30 bg-bg px-3 py-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted">Split {i + 1}</span>
            <div className="flex gap-1">
              {['work', 'recovery'].map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => patch(i, { label })}
                  className={[
                    'rounded px-2 py-1 text-xs font-medium capitalize',
                    split.label === label
                      ? 'bg-orange text-on-orange'
                      : 'bg-surface text-muted hover:text-ink',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
              {splits.length > 1 ? (
                <button
                  type="button"
                  onClick={() => onChange(splits.filter((_, idx) => idx !== i))}
                  className="px-2 py-1 text-xs text-muted hover:text-ink"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
          <DurationMinSecFields
            minutes={split.minutes}
            seconds={split.seconds}
            onMinutesChange={(v) => patch(i, { minutes: v })}
            onSecondsChange={(v) => patch(i, { seconds: v })}
            size="sm"
            minutesAria={`Split ${i + 1} minutes`}
            secondsAria={`Split ${i + 1} seconds`}
          />
          <label className="block space-y-1">
            <span className="text-xs text-muted">Dist ({unit})</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={split.distance}
              onChange={(e) => patch(i, { distance: e.target.value })}
              className="w-full rounded border border-orange-dim/50 bg-bg px-2 py-2 font-mono text-sm tabular-nums text-ink"
            />
          </label>
          <DurationMinSecFields
            minutes={split.paceMinutes}
            seconds={split.paceSeconds}
            onMinutesChange={(v) => patch(i, { paceMinutes: v })}
            onSecondsChange={(v) => patch(i, { paceSeconds: v })}
            size="sm"
            label="Target pace"
            minutesAria={`Split ${i + 1} pace minutes`}
            secondsAria={`Split ${i + 1} pace seconds`}
          />
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={() => onChange([...splits, emptySplit('work')])}
          className="text-sm text-muted hover:text-ink"
        >
          + Add split
        </button>
      </li>
    </ul>
  )
}

function CardioFields({ draft, onChange }) {
  const unit = draft.distance_unit || getDistanceUnit()

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange({ is_interval: false })}
          className={[
            'flex-1 rounded border py-2 text-sm font-medium',
            !draft.is_interval
              ? 'border-orange bg-orange text-on-orange'
              : 'border-orange-dim/40 bg-surface text-ink hover:border-orange',
          ].join(' ')}
        >
          Steady
        </button>
        <button
          type="button"
          onClick={() => onChange({ is_interval: true })}
          className={[
            'flex-1 rounded border py-2 text-sm font-medium',
            draft.is_interval
              ? 'border-orange bg-orange text-on-orange'
              : 'border-orange-dim/40 bg-surface text-ink hover:border-orange',
          ].join(' ')}
        >
          Intervals
        </button>
      </div>

      {draft.is_interval ? (
        <SplitEditor
          splits={draft.splits}
          onChange={(splits) => onChange({ splits })}
          unit={unit}
        />
      ) : (
        <>
          <DurationMinSecFields
            minutes={draft.durationMinutes}
            seconds={draft.durationSeconds}
            onMinutesChange={(v) => onChange({ durationMinutes: v })}
            onSecondsChange={(v) => onChange({ durationSeconds: v })}
            size="sm"
          />
          <label className="block space-y-1">
            <span className="text-xs text-muted">Distance ({unit})</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={draft.target_distance}
              onChange={(e) => onChange({ target_distance: e.target.value })}
              className={inputClass}
            />
          </label>
        </>
      )}

      <div className="flex gap-2">
        {['mi', 'km'].map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => onChange({ distance_unit: u })}
            className={[
              'rounded px-3 py-1.5 text-xs font-medium',
              unit === u
                ? 'bg-orange text-on-orange'
                : 'bg-bg text-muted hover:text-ink',
            ].join(' ')}
          >
            {u}
          </button>
        ))}
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-muted">Effort</span>
        <input
          type="text"
          value={draft.weight_guidance}
          onChange={(e) => onChange({ weight_guidance: e.target.value })}
          placeholder="e.g. easy, tempo, steady"
          className={inputClass}
        />
      </label>
    </div>
  )
}

export default function WorkoutBuilder({
  athlete,
  dateKey,
  existingScheduled = null,
  scheduledWorkouts = [],
  workoutsById = {},
  hasLogs = false,
  onBack,
  onSaved,
}) {
  const [focus, setFocus] = useState(
    () => existingScheduled?.workout?.focus ?? '',
  )
  const [drafts, setDrafts] = useState(() => {
    const exercises = existingScheduled?.exercises ?? []
    return exercises.length
      ? exercises.map(draftFromWorkoutExercise)
      : [emptyDraft()]
  })
  const [catalog, setCatalog] = useState([])
  const [pickingIndex, setPickingIndex] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    loadExerciseLibrary()
      .then((rows) => {
        if (!cancelled) setCatalog(rows)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) {
          setError(err.message || 'Could not load exercises')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  function patchDraft(index, partial) {
    setDrafts((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...partial } : d)),
    )
  }

  function removeDraft(index) {
    const row = drafts[index]
    if (hasLogs && row.existingWeId) return
    setDrafts((prev) => {
      const next = prev.filter((_, i) => i !== index)
      return next.length ? next : [emptyDraft()]
    })
  }

  async function handleSave() {
    let saved = null
    setSaving(true)
    setError(null)
    try {
      for (const d of drafts) {
        if (!d.exercise?.id) {
          throw new Error('Pick an exercise for every row')
        }
        if (d.exercise.modality === 'cardio' && !d.is_interval) {
          const dur = combineDurationFields(
            d.durationMinutes,
            d.durationSeconds,
          )
          const dist = Number(d.target_distance)
          if (!(dur > 0) && !(Number.isFinite(dist) && dist > 0)) {
            throw new Error(
              `Set a duration or distance for ${d.exercise.name}`,
            )
          }
        }
      }
      saved = await saveAthleteWorkout({
        athleteId: athlete.id,
        date: dateKey,
        focus,
        drafts,
        existingScheduled: existingScheduled
          ? {
              id: existingScheduled.id,
              workout_id: existingScheduled.workout_id,
            }
          : null,
        existingWorkout: existingScheduled?.workout ?? null,
        existingExercises: existingScheduled?.exercises ?? [],
        preserveExistingRows: hasLogs,
        scheduledWorkouts,
        workoutsById,
      })
    } catch (err) {
      console.error(err)
      setError(err.message || 'Could not save workout')
      setSaving(false)
      return
    }
    try {
      await onSaved(saved)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Saved, but could not refresh')
    } finally {
      setSaving(false)
    }
  }

  if (pickingIndex != null) {
    return (
      <ExercisePicker
        catalog={catalog}
        onClose={() => setPickingIndex(null)}
        onCreated={(ex) => {
          setCatalog((prev) => {
            if (prev.some((e) => e.id === ex.id)) return prev
            return [...prev, ex].sort((a, b) =>
              a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
            )
          })
        }}
        onPick={(ex) => {
          patchDraft(pickingIndex, applyPickedExercise(drafts[pickingIndex], ex))
          setPickingIndex(null)
        }}
      />
    )
  }

  const editing = Boolean(existingScheduled)

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-sm text-muted hover:text-ink"
      >
        ← Cancel
      </button>

      <header className="mb-6">
        <p className="text-sm text-muted">
          {athlete.name} · {dateKey}
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {editing ? 'Edit workout' : 'Assign workout'}
        </h1>
        {hasLogs ? (
          <p className="mt-2 text-xs text-muted">
            This session has logs. You can change targets and add movements;
            existing movements stay so logged sets are not detached.
          </p>
        ) : null}
      </header>

      <label className="mb-6 block space-y-1">
        <span className="text-sm font-medium">Focus</span>
        <input
          type="text"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="e.g. Upper body push"
          className={inputClass}
        />
      </label>

      <ul className="space-y-3">
        {drafts.map((draft, index) => {
          const cardio = draft.exercise?.modality === 'cardio'
          const canRemove = !(hasLogs && draft.existingWeId)
          return (
            <li
              key={draft.key}
              className="space-y-3 rounded border border-orange-dim/40 bg-surface px-3 py-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs text-muted">
                  {cardio ? 'Cardio' : 'Exercise'} {index + 1}
                </div>
                {canRemove ? (
                  <button
                    type="button"
                    onClick={() => removeDraft(index)}
                    className="text-xs text-muted hover:text-ink"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setPickingIndex(index)}
                disabled={!canRemove}
                className="w-full rounded border border-orange-dim/40 bg-bg px-3 py-2 text-left hover:border-orange"
              >
                <span className="block font-display font-medium">
                  {draft.exercise?.name ?? 'Choose exercise'}
                </span>
                <span className="text-xs text-muted">
                  {draft.exercise && !canRemove
                    ? 'Logged session · exercise can’t be swapped'
                    : draft.exercise
                    ? cardio
                      ? 'Cardio · tap to change'
                      : 'Strength · tap to change'
                    : 'From the shared library or your own'}
                </span>
              </button>

              {draft.exercise ? (
                cardio ? (
                  <CardioFields
                    draft={draft}
                    onChange={(partial) => patchDraft(index, partial)}
                  />
                ) : (
                  <StrengthFields
                    draft={draft}
                    onChange={(partial) => patchDraft(index, partial)}
                  />
                )
              ) : null}

              <label className="block space-y-1">
                <span className="text-xs text-muted">Notes</span>
                <textarea
                  value={draft.notes}
                  onChange={(e) => patchDraft(index, { notes: e.target.value })}
                  rows={2}
                  className={inputClass}
                />
              </label>
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={() => setDrafts((prev) => [...prev, emptyDraft()])}
        className="mt-4 w-full rounded border border-orange-dim/40 bg-surface py-3 text-sm font-medium text-ink hover:border-orange"
      >
        Add exercise
      </button>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={saving}
        onClick={handleSave}
        className="mt-4 w-full rounded bg-orange py-4 text-base font-medium text-on-orange hover:bg-orange-dim disabled:opacity-60"
      >
        {saving ? 'Saving…' : editing ? 'Save workout' : 'Assign workout'}
      </button>
    </div>
  )
}
