import { useEffect, useRef, useState } from 'react'
import { NOTE_MAX_LENGTH } from '../lib/notes'

/**
 * Bottom sheet for the athlete's note on one exercise: free-form text for
 * their trainer plus an optional "pain / discomfort" flag (drives the AI
 * swap/skip, and shows highlighted to a coach).
 *
 * onSave({ note, isPain }) and onDelete() must throw on failure (with a
 * user-facing message) — the sheet then stays open and shows the error.
 */
export default function ExerciseNoteSheet({
  exerciseName,
  initialNote = '',
  initialPain = false,
  hasNote = false,
  saving = false,
  onSave,
  onDelete,
  onClose,
}) {
  const [draft, setDraft] = useState(initialNote)
  const [isPain, setIsPain] = useState(initialPain)
  const [error, setError] = useState(null)
  const textareaRef = useRef(null)

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    textareaRef.current?.focus()
    function onKey(e) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const trimmed = draft.trim()
  const canSave = !saving && (trimmed.length > 0 || isPain || hasNote)

  async function run(fn) {
    setError(null)
    try {
      await fn()
      onClose()
    } catch (err) {
      setError(err?.message || 'Could not save note — try again')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close note"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-note-title"
        className="relative w-full max-w-lg rounded-t-lg border border-orange-dim/40 bg-surface px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg"
      >
        <h2 id="exercise-note-title" className="font-display text-lg font-semibold text-ink">
          {hasNote ? 'Edit note' : 'Add note'}
          <span className="block text-sm font-normal text-muted">{exerciseName}</span>
        </h2>

        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, NOTE_MAX_LENGTH))}
          maxLength={NOTE_MAX_LENGTH}
          rows={4}
          placeholder="Any notes for your trainer — pain, rep adjustments, etc."
          aria-label="Note for your trainer"
          className="mt-3 w-full rounded border border-orange-dim/50 bg-bg px-3 py-2 text-base text-ink placeholder:text-muted focus:border-orange focus:outline-none focus:ring-1 focus:ring-orange"
        />
        <div className="mt-1 text-right font-mono text-xs text-muted">
          {draft.length}/{NOTE_MAX_LENGTH}
        </div>

        <label className="mt-1 flex min-h-11 cursor-pointer items-start gap-3 rounded px-1 py-2">
          <input
            type="checkbox"
            checked={isPain}
            onChange={(e) => setIsPain(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-orange"
          />
          <span className="text-sm text-ink">
            This was pain / discomfort
            <span className="block text-xs text-muted">
              Flags it for your trainer; next week swaps or skips this exercise.
              Not medical advice.
            </span>
          </span>
        </label>

        {error ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            disabled={!canSave}
            onClick={() => run(() => onSave({ note: draft, isPain }))}
            className="min-h-11 w-full rounded bg-orange py-3 text-sm font-medium text-on-orange hover:bg-orange-dim disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save note'}
          </button>
          <div className="flex gap-2">
            {hasNote ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => run(onDelete)}
                className="min-h-11 flex-1 rounded border border-danger/40 text-sm font-medium text-danger hover:bg-danger-bg disabled:opacity-60"
              >
                Remove note
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 flex-1 rounded text-sm text-muted hover:bg-surface-alt hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
