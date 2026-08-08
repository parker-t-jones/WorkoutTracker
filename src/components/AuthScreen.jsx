import { useState } from 'react'
import {
  signIn,
  signUp,
  requestPasswordReset,
  updatePassword,
} from '../lib/auth'

export default function AuthScreen({ mode: initialMode = 'login', onAuthed }) {
  const [mode, setMode] = useState(initialMode) // login | signup | forgot | recovery
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setInfo(null)

    try {
      if (mode === 'login') {
        await signIn({ email, password })
        onAuthed?.()
      } else if (mode === 'signup') {
        const data = await signUp({ email, password })
        if (!data.session) {
          setInfo('Check your email to confirm your account, then sign in.')
          setMode('login')
        } else {
          onAuthed?.()
        }
      } else if (mode === 'forgot') {
        await requestPasswordReset(email)
        setInfo('Password reset email sent. Check your inbox.')
      } else if (mode === 'recovery') {
        if (password !== confirm) {
          setError('Passwords do not match')
          return
        }
        await updatePassword(password)
        setInfo('Password updated. You are signed in.')
        onAuthed?.()
      }
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const title =
    mode === 'signup'
      ? 'Create account'
      : mode === 'forgot'
        ? 'Reset password'
        : mode === 'recovery'
          ? 'Set a new password'
          : 'Sign in'

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <header className="mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {mode === 'signup'
            ? 'Email and password — one account per person.'
            : mode === 'forgot'
              ? 'We’ll email you a reset link.'
              : mode === 'recovery'
                ? 'Choose a new password for your account.'
                : 'Sign in to see your program and logs.'}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode !== 'recovery' && (
          <label className="block space-y-1">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-orange-dim/50 bg-surface px-3 py-2 text-ink placeholder:text-muted"
            />
          </label>
        )}

        {(mode === 'login' || mode === 'signup' || mode === 'recovery') && (
          <label className="block space-y-1">
            <span className="text-sm font-medium">
              {mode === 'recovery' ? 'New password' : 'Password'}
            </span>
            <input
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-orange-dim/50 bg-surface px-3 py-2 text-ink"
            />
          </label>
        )}

        {mode === 'recovery' && (
          <label className="block space-y-1">
            <span className="text-sm font-medium">Confirm password</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded border border-orange-dim/50 bg-surface px-3 py-2 text-ink"
            />
          </label>
        )}

        {error ? (
          <p
            role="alert"
            className="rounded bg-danger-bg px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}

        {info ? (
          <p className="rounded border border-success-border/55 bg-surface-alt px-3 py-2 text-sm text-success">
            {info}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-orange py-3 text-sm font-medium text-on-orange hover:bg-orange-dim disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy
            ? 'Please wait…'
            : mode === 'signup'
              ? 'Sign up'
              : mode === 'forgot'
                ? 'Send reset link'
                : mode === 'recovery'
                  ? 'Update password'
                  : 'Sign in'}
        </button>
      </form>

      <div className="mt-6 space-y-2 text-center text-sm text-muted">
        {mode === 'login' && (
          <>
            <button
              type="button"
              className="underline hover:text-ink"
              onClick={() => {
                setMode('forgot')
                setError(null)
                setInfo(null)
              }}
            >
              Forgot password?
            </button>
            <div>
              No account?{' '}
              <button
                type="button"
                className="underline hover:text-ink"
                onClick={() => {
                  setMode('signup')
                  setError(null)
                  setInfo(null)
                }}
              >
                Sign up
              </button>
            </div>
          </>
        )}
        {mode === 'signup' && (
          <button
            type="button"
            className="underline hover:text-ink"
            onClick={() => {
              setMode('login')
              setError(null)
              setInfo(null)
            }}
          >
            Already have an account? Sign in
          </button>
        )}
        {mode === 'forgot' && (
          <button
            type="button"
            className="underline hover:text-ink"
            onClick={() => {
              setMode('login')
              setError(null)
              setInfo(null)
            }}
          >
            Back to sign in
          </button>
        )}
      </div>
    </div>
  )
}
