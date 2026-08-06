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
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
      </header>

      <div className="rounded-md border border-stone-200 bg-white px-4 py-4">
        <div className="text-xs uppercase tracking-wide text-stone-500">
          Signed in as
        </div>
        <div className="mt-1 text-sm font-medium">{email || '—'}</div>
      </div>

      <button
        type="button"
        onClick={onOpenProposals}
        className="mt-4 flex w-full items-center justify-between rounded-md border border-stone-200 bg-white px-4 py-3 text-left hover:border-stone-400"
      >
        <div>
          <div className="text-sm font-medium text-stone-900">
            Substitution proposals
          </div>
          <div className="mt-0.5 text-xs text-stone-500">
            Review AI suggestions before they enter the live library
          </div>
        </div>
        {pendingCount != null && pendingCount > 0 ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
            {pendingCount}
          </span>
        ) : (
          <span className="text-sm text-stone-400">→</span>
        )}
      </button>

      <button
        type="button"
        onClick={onSignOut}
        className="mt-6 w-full rounded-md border border-stone-300 bg-white py-3 text-sm font-medium text-stone-800 hover:bg-stone-50"
      >
        Sign out
      </button>
    </div>
  )
}
