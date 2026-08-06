export default function AccountView({ email, onSignOut }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
      </header>

      <div className="rounded-md border border-stone-200 bg-white px-4 py-4">
        <div className="text-xs uppercase tracking-wide text-stone-500">Signed in as</div>
        <div className="mt-1 text-sm font-medium">{email || '—'}</div>
      </div>

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
