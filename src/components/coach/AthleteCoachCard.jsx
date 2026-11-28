import { useCallback, useEffect, useState } from 'react'
import {
  endCoachRelationship,
  listMyCoachLinks,
  respondToCoachInvite,
} from '../../lib/coach'

/**
 * Account → "Coach" card for the athlete side of coach links: accept or
 * decline pending invites, end an active coaching relationship.
 * Hidden entirely if the coach RPCs aren't available (migration not run).
 * onLinksChange() runs after an accept / decline / end so App can refresh
 * whether the athlete has an active coach (gates workout editing).
 */
export default function AthleteCoachCard({ onLinksChange = null }) {
  const [links, setLinks] = useState(null)
  const [unavailable, setUnavailable] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const all = await listMyCoachLinks()
      setLinks(all.filter((l) => l.role === 'athlete'))
      setUnavailable(false)
    } catch (err) {
      console.warn('[coach] could not load coach links', err)
      setUnavailable(true)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function run(id, fn) {
    setBusyId(id)
    setError(null)
    try {
      await fn()
      await load()
      onLinksChange?.()
    } catch (err) {
      setError(err.message || 'Something went wrong — try again')
    } finally {
      setBusyId(null)
    }
  }

  function endCoaching(link) {
    const who = link.other_name || link.other_email || 'your coach'
    const ok = window.confirm(
      `End coaching with ${who}? They’ll immediately lose access to your workouts and logs.`,
    )
    if (ok) run(link.id, () => endCoachRelationship(link.id))
  }

  if (unavailable || links == null) return null

  const pending = links.filter((l) => l.status === 'pending')
  const active = links.filter((l) => l.status === 'active')
  const label = (l) => l.other_name || l.other_email || 'Coach'

  return (
    <div className="mt-4 rounded border border-orange-dim/40 bg-surface px-4 py-4">
      <div className="text-xs uppercase tracking-wide text-muted">Coach</div>

      {!pending.length && !active.length ? (
        <p className="mt-1 text-sm text-muted">
          No coach yet. A coach can invite you using this account’s email.
        </p>
      ) : null}

      {pending.map((l) => (
        <div key={l.id} className="mt-3 rounded bg-surface-alt px-3 py-3">
          <p className="text-sm text-ink">
            <span className="font-medium">{label(l)}</span> wants to coach you.
          </p>
          <p className="mt-0.5 text-xs text-muted">
            If you accept, they can see your workouts and logs, edit your program and share
            exercise demos with you.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busyId === l.id}
              onClick={() => run(l.id, () => respondToCoachInvite(l.id, true))}
              className="flex-1 rounded bg-orange py-2 text-sm font-medium text-on-orange hover:bg-orange-dim disabled:opacity-60"
            >
              Accept
            </button>
            <button
              type="button"
              disabled={busyId === l.id}
              onClick={() => run(l.id, () => respondToCoachInvite(l.id, false))}
              className="flex-1 rounded bg-surface py-2 text-sm text-muted ring-1 ring-orange-dim/40 hover:text-ink disabled:opacity-60"
            >
              Decline
            </button>
          </div>
        </div>
      ))}

      {active.map((l) => (
        <div key={l.id} className="mt-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ink">{label(l)}</div>
            <div className="text-xs text-success">Your coach</div>
          </div>
          <button
            type="button"
            disabled={busyId === l.id}
            onClick={() => endCoaching(l)}
            className="shrink-0 rounded px-2 py-1 text-xs text-muted hover:bg-surface-alt hover:text-danger disabled:opacity-60"
          >
            {busyId === l.id ? 'Ending…' : 'End coaching'}
          </button>
        </div>
      ))}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
