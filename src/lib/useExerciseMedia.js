import { useCallback, useEffect, useState } from 'react'
import { loadMediaForWorkoutExercises } from './media'

/**
 * Lazily load demo media for one workout's exercises (one query), keyed by
 * workout_exercise id. Refetches only when the set of exercise ids changes.
 *
 * Returns { media: { [weId]: item[] }, loading, reload, setMedia }.
 * Never surfaces errors: a missing table / network error means "no media".
 */
export function useExerciseMedia(workoutExercises, { coachId = null, enabled = true } = {}) {
  const list = enabled ? (workoutExercises ?? []) : []
  // Sorted so reordering a workout doesn't refetch; unsaved rows
  // (temp- ids from the workout editor) are skipped.
  const key = list
    .filter((we) => !String(we.id).startsWith('temp-'))
    .map((we) => `${we.id}:${we.exercise_id ?? ''}`)
    .sort()
    .join(',')
  const [state, setState] = useState({ key: '', media: {}, loading: false })
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    if (!key) {
      setState({ key: '', media: {}, loading: false })
      return
    }
    let cancelled = false
    setState((prev) => ({
      key,
      media: prev.key === key ? prev.media : {},
      loading: true,
    }))
    const items = key.split(',').map((pair) => {
      const [id, exerciseId] = pair.split(':')
      return { id, exercise_id: exerciseId || null }
    })
    loadMediaForWorkoutExercises(items, { coachId }).then((media) => {
      if (!cancelled) setState({ key, media, loading: false })
    })
    return () => {
      cancelled = true
    }
  }, [key, coachId, reloadTick])

  const reload = useCallback(() => setReloadTick((n) => n + 1), [])
  const setMedia = useCallback(
    (updater) =>
      setState((prev) => ({
        ...prev,
        media: typeof updater === 'function' ? updater(prev.media) : updater,
      })),
    [],
  )

  return {
    media: state.key === key ? state.media : {},
    loading: state.loading || state.key !== key,
    reload,
    setMedia,
  }
}
