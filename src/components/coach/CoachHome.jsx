import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, LoaderCircle, UserPlus } from 'lucide-react'
import {
  endCoachRelationship,
  groupAthleteLinks,
  inviteAthleteByEmail,
  listMyCoachLinks,
} from '../../lib/coach'
import AthleteSchedule from './AthleteSchedule'

/**
 * Coach tab: invite athletes, see them grouped Active / Pending / Ended,
 * open an active athlete's schedule to attach demo media.
 */
export default function CoachHome({ coachId }) {
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState(null) // { kind: 'ok'|'error', text }
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [showEnded, setShowEnded] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setLinks(await listMyCoachLinks())
    } catch (err) {
      console.error(err)
      setLoadError(err.message || 'Could not load athletes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function invite(addr) {
    if (inviting) return
    setInviting(true)
    setInviteMsg(null)
    try {
      await inviteAthleteByEmail(addr)
      setInviteMsg({
        kind: 'ok',
        text: `Invite sent to ${addr.trim()}. They accept it in Account → Coach.`,
      })
      setEmail('')
      await load()
    } catch (err) {
      setInviteMsg({ kind: 'error', text: err.message || 'Could not send invite' })
    } finally {
      setInviting(false)
    }
  }

  async function end(link) {
    const who = link.other_name || link.other_email || 'this athlete'
    const ok = window.confirm(
      link.status === 'pending'
        ? `Cancel the invite to ${who}?`
        : `End coaching ${who}? You’ll immediately lose access to their workouts and logs, and they’ll stop seeing your demos.`,
    )
    if (!ok) return
    setBusyId(link.id)
    setActionError(null)
    try {
      await endCoachRelationship(link.id)
      await load()
    } catch (err) {
      setActionError(err.message || 'Could not update — try again')
    } finally {
      setBusyId(null)
    }
  }

  if (selected) {
    return (
      <AthleteSchedule
        coachId={coachId}
        link={selected}
        onBack={() => {
          setSelected(null)
          load()
        }}
      />
    )
  }

  const groups = groupAthleteLinks(links)
  const label = (l) => l.other_name || l.other_email || 'Athlete'

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Coach</h1>
        <p className="mt-1 text-sm text-muted">
          Invite athletes, follow their training and add demo photos/videos to their exercises.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          invite(email)
        }}
        className="rounded border border-orange-dim/40 bg-surface px-4 py-4"
      >
        <label htmlFor="invite-email" className="text-xs uppercase tracking-wide text-muted">
          Invite an athlete
        </label>
        <p className="mt-1 text-xs text-muted">
          They need an account first (signed up and opened the app once).
        </p>
        <div className="mt-3 flex gap-2">
          <input
            id="invite-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="athlete@example.com"
            className="min-w-0 flex-1 rounded border border-orange-dim/50 bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-orange focus:outline-none focus:ring-1 focus:ring-orange"
            required
          />
          <button
            type="submit"
            disabled={inviting || !email.trim()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded bg-orange px-3 py-2 text-sm font-medium text-on-orange hover:bg-orange-dim disabled:opacity-60"
          >
            {inviting ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <UserPlus className="h-4 w-4" aria-hidden="true" />
            )}
            Invite
          </button>
        </div>
        {inviteMsg ? (
          <p
            role={inviteMsg.kind === 'error' ? 'alert' : 'status'}
            className={['mt-2 text-sm', inviteMsg.kind === 'error' ? 'text-danger' : 'text-success'].join(' ')}
          >
            {inviteMsg.text}
          </p>
        ) : null}
      </form>

      {loading && !links.length ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading athletes…
        </p>
      ) : null}
      {loadError ? (
        <div className="mt-6 space-y-2">
          <p role="alert" className="text-sm text-danger">{loadError}</p>
          <button
            type="button"
            onClick={load}
            className="rounded border border-orange-dim/50 bg-surface px-3 py-1.5 text-sm text-ink hover:bg-surface-alt"
          >
            Retry
          </button>
        </div>
      ) : null}
      {actionError ? (
        <p role="alert" className="mt-4 text-sm text-danger">{actionError}</p>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">
          Active <span className="font-mono">{groups.active.length}</span>
        </h2>
        {groups.active.length ? (
          <ul className="space-y-2">
            {groups.active.map((l) => (
              <li key={l.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(l)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded border border-orange-dim/40 bg-surface px-3 py-3 text-left hover:border-orange"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink">{label(l)}</div>
                    {l.other_email && l.other_name ? (
                      <div className="truncate text-xs text-muted">{l.other_email}</div>
                    ) : null}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => end(l)}
                  disabled={busyId === l.id}
                  className="shrink-0 rounded px-2 text-xs text-muted hover:bg-surface-alt hover:text-danger disabled:opacity-60"
                >
                  {busyId === l.id ? 'Ending…' : 'End'}
                </button>
              </li>
            ))}
          </ul>
        ) : !loading ? (
          <p className="text-sm text-muted">No active athletes yet.</p>
        ) : null}
      </section>

      {groups.pending.length ? (
        <section className="mt-6">
          <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">
            Pending <span className="font-mono">{groups.pending.length}</span>
          </h2>
          <ul className="space-y-2">
            {groups.pending.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-2 rounded border border-orange-dim/30 bg-surface px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-ink">{label(l)}</div>
                  <div className="text-xs text-muted">Waiting for them to accept</div>
                </div>
                <button
                  type="button"
                  onClick={() => end(l)}
                  disabled={busyId === l.id}
                  className="shrink-0 rounded px-2 py-1 text-xs text-muted hover:bg-surface-alt hover:text-danger disabled:opacity-60"
                >
                  {busyId === l.id ? 'Cancelling…' : 'Cancel'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {groups.revoked.length ? (
        <section className="mt-6">
          <button
            type="button"
            onClick={() => setShowEnded((v) => !v)}
            aria-expanded={showEnded}
            className="mb-2 text-xs uppercase tracking-wide text-muted hover:text-ink"
          >
            Ended <span className="font-mono">{groups.revoked.length}</span>{' '}
            {showEnded ? '▾' : '▸'}
          </button>
          {showEnded ? (
            <ul className="space-y-2">
              {groups.revoked.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-2 rounded border border-orange-dim/20 bg-surface px-3 py-2.5"
                >
                  <div className="min-w-0 truncate text-sm text-muted">{label(l)}</div>
                  {l.other_email ? (
                    <button
                      type="button"
                      onClick={() => invite(l.other_email)}
                      disabled={inviting}
                      className="shrink-0 rounded px-2 py-1 text-xs text-muted hover:bg-surface-alt hover:text-ink disabled:opacity-60"
                    >
                      Re-invite
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
