import { useEffect, useState } from 'react'
import {
  listPendingProposals,
  approveProposal,
  rejectProposal,
} from '../lib/proposals'

export default function ProposedSubstitutionsView({ onBack }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [rejectDraftId, setRejectDraftId] = useState(null)
  const [rejectNote, setRejectNote] = useState('')
  const [banner, setBanner] = useState(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const data = await listPendingProposals()
      setRows(data)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Could not load proposals')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleApprove(id) {
    setBusyId(id)
    setBanner(null)
    try {
      const result = await approveProposal(id)
      let msg = 'Approved — added to the live substitutions table.'
      if (result.needsMetadata && result.createdExercise) {
        msg += ` New exercise "${result.createdExercise.name}" was created with empty equipment/contraindication tags — fill those in before it can pass future safety filters.`
      }
      setBanner({ type: 'ok', text: msg })
      await refresh()
    } catch (err) {
      console.error(err)
      setBanner({ type: 'err', text: err.message || 'Approve failed' })
    } finally {
      setBusyId(null)
    }
  }

  async function handleReject(id) {
    setBusyId(id)
    setBanner(null)
    try {
      await rejectProposal(id, rejectNote)
      setRejectDraftId(null)
      setRejectNote('')
      setBanner({
        type: 'ok',
        text: 'Rejected — will be fed back so it is not re-proposed casually.',
      })
      await refresh()
    } catch (err) {
      console.error(err)
      setBanner({ type: 'err', text: err.message || 'Reject failed' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-sm text-muted hover:text-ink"
      >
        ← Account
      </button>

      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Substitution proposals
        </h1>
        <p className="mt-2 text-sm text-muted">
          AI suggestions from skip/fallback cases. Nothing here reaches a live
          workout until you approve it into the vetted table.
        </p>
      </header>

      {banner ? (
        <p
          role="status"
          className={[
            'mb-4 rounded px-3 py-2 text-sm',
            banner.type === 'ok'
              ? 'border border-success-border/55 bg-surface-alt text-success'
              : 'bg-danger-bg text-danger',
          ].join(' ')}
        >
          {banner.text}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded border border-orange-dim/40 bg-surface px-3 py-4 text-sm text-muted">
          No pending proposals.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const primaryName = row.primary?.name ?? 'Exercise'
            const subLabel =
              row.substitute?.name ??
              row.proposed_new_exercise_name ??
              '—'
            const isNew = !row.substitute_exercise_id && row.proposed_new_exercise_name
            const busy = busyId === row.id

            return (
              <li
                key={row.id}
                className="rounded border border-orange-dim/40 bg-surface px-3 py-3"
              >
                <div className="font-mono text-xs text-muted">
                  {new Date(row.created_at).toLocaleString()}
                </div>
                <div className="mt-1 font-display text-sm font-medium text-ink">
                  {primaryName}
                  <span className="font-sans font-normal text-muted"> → </span>
                  {subLabel}
                  {isNew ? (
                    <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 font-sans text-[10px] font-medium uppercase tracking-wide text-amber-900 ring-1 ring-amber-200">
                      new exercise
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-xs font-medium text-muted">
                  {row.reason_tag?.replaceAll('_', ' ')}
                </div>
                <p className="mt-2 text-sm text-ink">{row.reasoning}</p>

                {rejectDraftId === row.id ? (
                  <div className="mt-3 space-y-2 border-t border-orange-dim/30 pt-3">
                    <label className="block text-xs text-muted">
                      Rejection note (optional)
                      <textarea
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        rows={2}
                        className="mt-1 w-full rounded border border-orange-dim/50 bg-bg px-2 py-1.5 text-sm text-ink"
                        placeholder="Why this pairing is wrong…"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleReject(row.id)}
                        className="rounded bg-orange px-3 py-1.5 text-xs font-medium text-on-orange disabled:opacity-60"
                      >
                        {busy ? 'Saving…' : 'Confirm reject'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setRejectDraftId(null)
                          setRejectNote('')
                        }}
                        className="rounded px-3 py-1.5 text-xs text-muted hover:bg-surface-alt hover:text-ink"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleApprove(row.id)}
                      className="rounded bg-orange px-3 py-1.5 text-xs font-medium text-on-orange disabled:opacity-60"
                    >
                      {busy ? 'Saving…' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setRejectDraftId(row.id)
                        setRejectNote('')
                      }}
                      className="rounded px-3 py-1.5 text-xs text-muted ring-1 ring-orange-dim/50 hover:bg-surface-alt hover:text-ink disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
