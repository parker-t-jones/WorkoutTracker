import { useEffect, useState } from 'react'
import { countPendingProposals } from '../lib/proposals'

export default function AccountView({
  email,
  onSignOut,
  onOpenProposals,
}) {
  const [pendingCount, setPendingCount] = useState(null)

  useEffect(() => {
    let cancelled = false
    countPendingProposals()
      .then((n) => {
        if (!cancelled) setPendingCount(n)
      })
      .catch(() => {
        if (!cancelled) setPendingCount(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Account
        </h1>
      </header>

      <div className="rounded border border-orange-dim/40 bg-surface px-4 py-4">
        <div className="text-xs uppercase tracking-wide text-muted">
          Signed in as
        </div>
        <div className="mt-1 text-sm font-medium">{email || '—'}</div>
      </div>

      <button
        type="button"
        onClick={onOpenProposals}
        className="mt-4 flex w-full items-center justify-between rounded border border-orange-dim/40 bg-surface px-4 py-3 text-left hover:border-orange"
      >
        <div>
          <div className="text-sm font-medium text-ink">
            Substitution proposals
          </div>
          <div className="mt-0.5 text-xs text-muted">
            Review AI suggestions before they enter the live library
          </div>
        </div>
        {pendingCount != null && pendingCount > 0 ? (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
            {pendingCount}
          </span>
        ) : (
          <span className="text-sm text-muted">→</span>
        )}
      </button>

      <button
        type="button"
        onClick={onSignOut}
        className="mt-6 w-full rounded border border-orange-dim/50 bg-surface py-3 text-sm font-medium text-ink hover:bg-surface-alt"
      >
        Sign out
      </button>
    </div>
  )
}
