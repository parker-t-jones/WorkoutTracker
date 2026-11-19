import { useRef, useState } from 'react'
import {
  Camera,
  Link as LinkIcon,
  LoaderCircle,
  Trash2,
  Upload,
} from 'lucide-react'
import MediaViewer from '../MediaViewer'
import {
  CAPTION_MAX,
  addMediaFile,
  addMediaLink,
  deleteMedia,
  formatBytes,
  parseExternalUrl,
  validateMediaFile,
} from '../../lib/media'

const inputClass =
  'w-full rounded border border-orange-dim/50 bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-orange focus:outline-none focus:ring-1 focus:ring-orange'

/**
 * Coach-side "Demo media" manager for one prescribed exercise.
 *
 * items: this coach's media for the exercise (workout-specific first, then
 *        exercise-level defaults), as returned by loadMediaForWorkoutExercises
 *        with { coachId }.
 * onChanged(): reload media for the workout after add/delete.
 */
export default function DemoMediaManager({
  coachId,
  workoutExercise,
  athleteName,
  items = [],
  onChanged,
}) {
  const [mode, setMode] = useState(null) // null | 'file' | 'link'
  const [file, setFile] = useState(null)
  const [url, setUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [forAll, setForAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const libraryInput = useRef(null)
  const cameraInput = useRef(null)

  const exerciseName = workoutExercise.exercise?.name ?? 'this exercise'
  const nextSortOrder = items.length
    ? Math.max(...items.map((i) => i.sort_order ?? 0)) + 1
    : 0

  function reset() {
    setMode(null)
    setFile(null)
    setUrl('')
    setCaption('')
    setForAll(false)
    setError(null)
    if (libraryInput.current) libraryInput.current.value = ''
    if (cameraInput.current) cameraInput.current.value = ''
  }

  function openMode(next) {
    setNotice(null)
    setError(null)
    setMode((m) => (m === next ? null : next))
  }

  function onPick(e) {
    const picked = e.target.files?.[0] ?? null
    setNotice(null)
    setError(null)
    setFile(null)
    if (!picked) return
    try {
      validateMediaFile(picked)
      setFile(picked)
      setMode('file')
    } catch (err) {
      setError(err.message)
      e.target.value = ''
    }
  }

  function target() {
    return forAll
      ? { exerciseId: workoutExercise.exercise_id }
      : { workoutExerciseId: workoutExercise.id }
  }

  async function handleSave(e) {
    e.preventDefault()
    if (busy) return
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (mode === 'file') {
        if (!file) throw new Error('Choose a photo or video first.')
        await addMediaFile({
          coachId,
          file,
          target: target(),
          caption,
          sortOrder: nextSortOrder,
        })
      } else if (mode === 'link') {
        await addMediaLink({
          coachId,
          url,
          target: target(),
          caption,
          sortOrder: nextSortOrder,
        })
      }
      const savedForAll = forAll
      reset()
      setNotice(
        savedForAll
          ? `Saved — shown to every active athlete with ${exerciseName}.`
          : `Saved — shown on this workout${athleteName ? ` for ${athleteName}` : ''}.`,
      )
      onChanged?.()
    } catch (err) {
      console.error(err)
      setError(err.message || 'Could not save — try again')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(item) {
    const shared = item.scope === 'exercise' || (!item.scope && item.exercise_id)
    const ok = window.confirm(
      shared
        ? `Delete this default demo for ${exerciseName}? It will disappear for every athlete.`
        : 'Delete this demo from this workout?',
    )
    if (!ok) return
    setDeletingId(item.id)
    setError(null)
    setNotice(null)
    try {
      await deleteMedia(item)
      onChanged?.()
    } catch (err) {
      console.error(err)
      setError(err.message || 'Could not delete — try again')
    } finally {
      setDeletingId(null)
    }
  }

  let linkPreview = null
  if (mode === 'link' && url.trim()) {
    try {
      const p = parseExternalUrl(url)
      linkPreview =
        p.provider === 'youtube'
          ? 'YouTube — plays inside the app'
          : p.provider === 'vimeo'
            ? 'Vimeo — plays inside the app'
            : 'Opens in a new tab'
    } catch (err) {
      linkPreview = err.message
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-orange-dim/30 pt-3">
      <div className="text-xs uppercase tracking-wide text-muted">
        Demo media
      </div>

      {items.length ? (
        <MediaViewer
          items={items}
          showScope
          renderActions={(item) => (
            <button
              type="button"
              onClick={() => handleDelete(item)}
              disabled={deletingId === item.id}
              className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-danger hover:bg-surface-alt disabled:opacity-60"
              aria-label="Delete demo"
            >
              {deletingId === item.id ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Delete
            </button>
          )}
        />
      ) : (
        <p className="text-sm text-muted">
          No demo yet. Add a photo, video or link to show how it’s done.
        </p>
      )}

      {/* Hidden pickers: library vs. camera (capture opens the camera on phones). */}
      <input
        ref={libraryInput}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={onPick}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={onPick}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setMode('file')
            libraryInput.current?.click()
          }}
          className="inline-flex items-center gap-1.5 rounded bg-orange px-3 py-1.5 text-sm font-medium text-on-orange hover:bg-orange-dim disabled:opacity-60"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          Add photo/video
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setMode('file')
            cameraInput.current?.click()
          }}
          className="inline-flex items-center gap-1.5 rounded border border-orange-dim/50 bg-surface px-3 py-1.5 text-sm text-ink hover:bg-surface-alt disabled:opacity-60"
        >
          <Camera className="h-4 w-4" aria-hidden="true" />
          Record
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => openMode('link')}
          aria-pressed={mode === 'link'}
          className="inline-flex items-center gap-1.5 rounded border border-orange-dim/50 bg-surface px-3 py-1.5 text-sm text-ink hover:bg-surface-alt disabled:opacity-60"
        >
          <LinkIcon className="h-4 w-4" aria-hidden="true" />
          Add link
        </button>
      </div>

      {(mode === 'file' && file) || mode === 'link' ? (
        <form
          onSubmit={handleSave}
          className="space-y-3 rounded border border-orange-dim/40 bg-surface-alt px-3 py-3"
        >
          {mode === 'file' ? (
            <p className="truncate text-sm text-ink">
              {file.name}{' '}
              <span className="font-mono text-xs text-muted">
                {formatBytes(file.size)}
              </span>
            </p>
          ) : (
            <div>
              <label className="mb-1 block text-xs text-muted" htmlFor={`url-${workoutExercise.id}`}>
                YouTube, Vimeo, Google Drive or any https link
              </label>
              <input
                id={`url-${workoutExercise.id}`}
                type="url"
                inputMode="url"
                autoComplete="off"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://youtu.be/…"
                className={inputClass}
                required
              />
              {linkPreview ? (
                <p className="mt-1 text-xs text-muted">{linkPreview}</p>
              ) : null}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs text-muted" htmlFor={`cap-${workoutExercise.id}`}>
              Caption (optional)
            </label>
            <textarea
              id={`cap-${workoutExercise.id}`}
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_MAX))}
              rows={2}
              maxLength={CAPTION_MAX}
              placeholder="e.g. Brace, then push the floor away"
              className={inputClass}
            />
            <p className="mt-0.5 text-right font-mono text-[11px] text-muted">
              {caption.length}/{CAPTION_MAX}
            </p>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="sr-only">Who sees this demo</legend>
            <label className="flex items-start gap-2 text-sm text-ink">
              <input
                type="radio"
                name={`scope-${workoutExercise.id}`}
                checked={!forAll}
                onChange={() => setForAll(false)}
                className="mt-0.5"
              />
              <span>
                Just this workout
                {athleteName ? (
                  <span className="block text-xs text-muted">Only {athleteName} sees it, on this day.</span>
                ) : null}
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-ink">
              <input
                type="radio"
                name={`scope-${workoutExercise.id}`}
                checked={forAll}
                onChange={() => setForAll(true)}
                className="mt-0.5"
              />
              <span>
                Use for every athlete when I assign this exercise
                <span className="block text-xs text-muted">
                  Shown wherever any of your active athletes has {exerciseName}.
                </span>
              </span>
            </label>
          </fieldset>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded bg-orange px-3 py-2 text-sm font-medium text-on-orange hover:bg-orange-dim disabled:opacity-60"
            >
              {busy ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {mode === 'file' ? 'Uploading…' : 'Saving…'}
                </>
              ) : (
                'Save demo'
              )}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={reset}
              className="rounded px-3 py-2 text-sm text-muted hover:bg-surface hover:text-ink disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
          {busy && mode === 'file' ? (
            <p className="text-xs text-muted" role="status">
              Uploading {formatBytes(file?.size)} — keep this screen open.
            </p>
          ) : null}
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      ) : null}
    </div>
  )
}
