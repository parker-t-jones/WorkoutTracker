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
        className="mb-4 text-sm text-stone-600 hover:text-stone-900"
      >
        ← Account
      </button>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Substitution proposals
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          AI suggestions from skip/fallback cases. Nothing here reaches a live
          workout until you approve it into the vetted table.
        </p>
      </header>

      {banner ? (
        <p
          role="status"
          className={[
            'mb-4 rounded-md px-3 py-2 text-sm',
            banner.type === 'ok'
              ? 'bg-emerald-50 text-emerald-900'
              : 'bg-red-50 text-red-800',
          ].join(' ')}
        >
          {banner.text}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-stone-200 bg-white px-3 py-4 text-sm text-stone-600">
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
                className="rounded-md border border-stone-200 bg-white px-3 py-3"
              >
                <div className="text-xs text-stone-400">
                  {new Date(row.created_at).toLocaleString()}
                </div>
                <div className="mt-1 text-sm font-medium text-stone-900">
                  {primaryName}
                  <span className="font-normal text-stone-500"> → </span>
                  {subLabel}
                  {isNew ? (
                    <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900 ring-1 ring-amber-200">
                      new exercise
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-xs font-medium text-stone-500">
                  {row.reason_tag?.replaceAll('_', ' ')}
                </div>
                <p className="mt-2 text-sm text-stone-700">{row.reasoning}</p>

                {rejectDraftId === row.id ? (
                  <div className="mt-3 space-y-2 border-t border-stone-100 pt-3">
                    <label className="block text-xs text-stone-600">
                      Rejection note (optional)
                      <textarea
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        rows={2}
                        className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                        placeholder="Why this pairing is wrong…"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleReject(row.id)}
                        className="rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
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
                        className="rounded-md px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100"
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
                      className="rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
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
                      className="rounded-md px-3 py-1.5 text-xs text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50 disabled:opacity-60"
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
