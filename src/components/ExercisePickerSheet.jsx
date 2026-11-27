import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { fetchVettedSubstitutes } from '../lib/workoutEditApi'
import {
  buildPickerSections,
  labelize,
  muscleGroupsOf,
} from '../lib/workoutEditing'

function ExerciseRow({ item, onPick }) {
  const { exercise, disabledReason, vetted } = item
  const meta = [
    labelize(exercise.muscle_group),
    exercise.movement_pattern ? labelize(exercise.movement_pattern) : null,
    exercise.equipment_required ? labelize(exercise.equipment_required) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <li>
      <button
        type="button"
        disabled={Boolean(disabledReason)}
        onClick={() => onPick(exercise)}
        className="flex min-h-11 w-full flex-col items-start rounded px-3 py-2 text-left hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
      >
        <span className="text-sm font-medium text-ink">
          {exercise.name}
          {vetted ? (
            <span className="ml-2 rounded bg-surface-alt px-1.5 py-0.5 text-[0.65rem] font-normal uppercase tracking-wide text-success">
              Vetted
            </span>
          ) : null}
        </span>
        <span className="text-xs text-muted">{disabledReason || meta}</span>
      </button>
    </li>
  )
}

/**
 * Bottom sheet listing the exercise library for swapping one exercise
 * (mode 'swap', `current` set) or adding one (mode 'add'). Swaps show
 * vetted substitutions and same-movement-pattern exercises first under
 * "Suggested swaps"; strength ↔ cardio swaps are disabled.
 */
export default function ExercisePickerSheet({
  mode = 'add',
  current = null,
  library = null,
  libraryError = null,
  onRetryLibrary,
  excludeIds = [],
  equipmentAllowed = null,
  onPick,
  onClose,
}) {
  const [query, setQuery] = useState('')
  const [muscleGroup, setMuscleGroup] = useState('')
  const [fitsEquipment, setFitsEquipment] = useState(Boolean(equipmentAllowed))
  const [substitutions, setSubstitutions] = useState([])
  const searchRef = useRef(null)

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    searchRef.current?.focus()
    function onKey(e) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const currentId = current?.id ?? null
  useEffect(() => {
    if (!currentId) return undefined
    let cancelled = false
    fetchVettedSubstitutes(currentId).then((rows) => {
      if (!cancelled) setSubstitutions(rows)
    })
    return () => {
      cancelled = true
    }
  }, [currentId])

  const groupsList = useMemo(() => muscleGroupsOf(library ?? []), [library])
  const sections = useMemo(
    () =>
      buildPickerSections({
        library: library ?? [],
        current,
        substitutions,
        excludeIds,
        query,
        muscleGroup,
        equipmentAllowed: fitsEquipment ? equipmentAllowed : null,
      }),
    [library, current, substitutions, excludeIds, query, muscleGroup, fitsEquipment, equipmentAllowed],
  )
  const empty = !sections.suggested.length && !sections.groups.length
  const title = mode === 'swap' ? 'Swap exercise' : 'Add exercise'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close exercise picker"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-picker-title"
        className="relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-lg border border-orange-dim/40 bg-surface pt-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-lg"
      >
        <div className="flex items-start justify-between gap-2 px-4">
          <h2 id="exercise-picker-title" className="font-display text-lg font-semibold text-ink">
            {title}
            {current ? (
              <span className="block text-sm font-normal text-muted">
                Replacing {current.name} — sets, reps and guidance stay the same
              </span>
            ) : null}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted hover:bg-surface-alt hover:text-ink"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4">
          <label className="relative mt-3 block">
            <span className="sr-only">Search exercises</span>
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, muscle or movement"
              className="min-h-11 w-full rounded border border-orange-dim/50 bg-bg py-2 pr-3 pl-9 text-base text-ink placeholder:text-muted focus:border-orange focus:outline-none focus:ring-1 focus:ring-orange"
            />
          </label>

          <div
            className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1"
            role="group"
            aria-label="Filter by muscle group"
          >
            {['', ...groupsList].map((g) => (
              <button
                key={g || 'all'}
                type="button"
                aria-pressed={muscleGroup === g}
                onClick={() => setMuscleGroup(g)}
                className={[
                  'min-h-9 shrink-0 rounded-full px-3 text-xs font-medium',
                  muscleGroup === g
                    ? 'bg-orange text-on-orange'
                    : 'bg-surface-alt text-muted hover:text-ink',
                ].join(' ')}
              >
                {g ? labelize(g) : 'All'}
              </button>
            ))}
          </div>

          {equipmentAllowed ? (
            <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={fitsEquipment}
                onChange={(e) => setFitsEquipment(e.target.checked)}
                className="h-5 w-5 accent-orange"
              />
              Only exercises that fit my equipment
            </label>
          ) : null}
        </div>

        <div className="mt-1 min-h-0 flex-1 overflow-y-auto border-t border-orange-dim/40 px-1 pt-2">
          {libraryError ? (
            <div className="px-3 py-4">
              <p role="alert" className="text-sm text-danger">
                {libraryError}
              </p>
              {onRetryLibrary ? (
                <button
                  type="button"
                  onClick={onRetryLibrary}
                  className="mt-2 min-h-11 rounded bg-orange px-4 text-sm font-medium text-on-orange hover:bg-orange-dim"
                >
                  Retry
                </button>
              ) : null}
            </div>
          ) : library == null ? (
            <p className="px-3 py-4 text-sm text-muted">Loading exercises…</p>
          ) : empty ? (
            <p className="px-3 py-4 text-sm text-muted">No exercises match.</p>
          ) : (
            <>
              {sections.suggested.length ? (
                <section aria-labelledby="picker-suggested">
                  <h3
                    id="picker-suggested"
                    className="px-3 pt-1 pb-1 text-xs uppercase tracking-wide text-muted"
                  >
                    Suggested swaps
                  </h3>
                  <ul>
                    {sections.suggested.map((item) => (
                      <ExerciseRow key={item.exercise.id} item={item} onPick={onPick} />
                    ))}
                  </ul>
                </section>
              ) : null}
              {sections.groups.map((g) => (
                <section key={g.key} aria-labelledby={`picker-group-${g.key.replace(/\W+/g, '-')}`}>
                  <h3
                    id={`picker-group-${g.key.replace(/\W+/g, '-')}`}
                    className="px-3 pt-3 pb-1 text-xs uppercase tracking-wide text-muted"
                  >
                    {g.label}
                  </h3>
                  <ul>
                    {g.items.map((item) => (
                      <ExerciseRow key={item.exercise.id} item={item} onPick={onPick} />
                    ))}
                  </ul>
                </section>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
