import { useEffect, useRef, useState } from 'react'
import { DELETE_CONFIRM_WORD, DELETE_ERROR, deleteAccount } from '../lib/account'

/**
 * "Delete account" danger zone for AccountView: explains what is deleted,
 * then a confirmation sheet where the user types DELETE.
 *
 * onDeleted() runs after the server has deleted the account (it signs out
 * locally and shows the "account deleted" message).
 */
export default function DeleteAccountSection({ isCoach = false, onDeleted }) {
  const [open, setOpen] = useState(false)

  return (
    <section
      aria-labelledby="delete-account-heading"
      className="mt-10 rounded border border-danger/40 bg-surface px-4 py-4"
    >
      <h2
        id="delete-account-heading"
        className="text-xs uppercase tracking-wide text-danger"
      >
        Delete account
      </h2>
      <WhatGetsDeleted isCoach={isCoach} />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 min-h-11 w-full rounded border border-danger/60 bg-surface py-3 text-sm font-medium text-danger hover:bg-danger-bg"
      >
        Delete account
      </button>
      {open ? (
        <DeleteAccountSheet
          isCoach={isCoach}
          onClose={() => setOpen(false)}
          onDeleted={onDeleted}
        />
      ) : null}
    </section>
  )
}

function WhatGetsDeleted({ isCoach }) {
  return (
    <div className="mt-2 space-y-2 text-sm text-muted">
      <p>
        Permanently deletes your account and everything in it: your program,
        workout logs, notes, progress, leaderboard memberships and coach
        links.
      </p>
      {isCoach ? (
        <p>
          As a coach, the demo photos and videos you uploaded are deleted and
          your athletes lose access to them. Custom exercises you created stay
          in your athletes’ workout history, without your name attached.
        </p>
      ) : null}
      <p className="font-medium text-ink">This can’t be undone.</p>
    </div>
  )
}

export function DeleteAccountSheet({ isCoach = false, onClose, onDeleted }) {
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  const deletingRef = useRef(false)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    inputRef.current?.focus()
    function onKey(e) {
      if (e.key === 'Escape' && !deletingRef.current) onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const confirmed = typed.trim() === DELETE_CONFIRM_WORD

  async function handleDelete() {
    if (!confirmed || deletingRef.current) return
    deletingRef.current = true
    setDeleting(true)
    setError(null)
    try {
      await deleteAccount()
    } catch (err) {
      setError(err?.message || DELETE_ERROR)
      deletingRef.current = false
      setDeleting(false)
      return
    }
    // The account is gone; this unmounts the app into the auth screen.
    await onDeleted?.()
  }

  function close() {
    if (!deletingRef.current) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Cancel account deletion"
        onClick={close}
        className="absolute inset-0 bg-black/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        className="relative w-full max-w-lg rounded-t-lg border border-orange-dim/40 bg-surface px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg"
      >
        <h2
          id="delete-account-title"
          className="font-display text-lg font-semibold text-ink"
        >
          Delete your account?
        </h2>
        <WhatGetsDeleted isCoach={isCoach} />

        <label className="mt-4 block space-y-1">
          <span className="text-sm font-medium text-ink">
            Type {DELETE_CONFIRM_WORD} to confirm
          </span>
          <input
            ref={inputRef}
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleDelete()
            }}
            disabled={deleting}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded border border-orange-dim/50 bg-bg px-3 py-2 font-mono text-base text-ink placeholder:text-muted focus:border-danger focus:outline-none focus:ring-1 focus:ring-danger disabled:opacity-60"
          />
        </label>

        {error ? (
          <p
            role="alert"
            className="mt-3 rounded bg-danger-bg px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={!confirmed || deleting}
            onClick={handleDelete}
            className="min-h-11 w-full rounded bg-danger py-3 text-sm font-medium text-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? 'Deleting your account…' : 'Delete my account'}
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={close}
            className="min-h-11 w-full rounded border border-orange-dim/50 bg-surface py-3 text-sm font-medium text-ink hover:bg-surface-alt disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
