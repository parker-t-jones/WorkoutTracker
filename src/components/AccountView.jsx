import { useEffect, useState } from 'react'
import { countPendingProposals } from '../lib/proposals'
import {
  getStoredPreference,
  resolveTheme,
  setThemePreference,
} from '../lib/theme'
import {
  getDistanceUnit,
  setDistanceUnit,
  getWeightUnit,
  setWeightUnit,
} from '../lib/units'
import AthleteCoachCard from './coach/AthleteCoachCard'
import DeleteAccountSection from './DeleteAccountSection'

// Set VITE_PRIVACY_POLICY_URL in .env to show the link (App Store requires a
// privacy policy URL); hidden while unset.
const PRIVACY_POLICY_URL = (import.meta.env.VITE_PRIVACY_POLICY_URL || '').trim()

export default function AccountView({
  email,
  onSignOut,
  signOutError = null,
  onOpenProposals,
  onCoachLinksChange,
  isCoach = false,
  onAccountDeleted,
}) {
  const [pendingCount, setPendingCount] = useState(null)
  const [theme, setTheme] = useState(() => resolveTheme())
  const [distanceUnit, setDistanceUnitState] = useState(() => getDistanceUnit())
  const [weightUnit, setWeightUnitState] = useState(() => getWeightUnit())
  const [signingOut, setSigningOut] = useState(false)

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

  useEffect(() => {
    function onThemeChange(e) {
      setTheme(e.detail)
    }
    document.addEventListener('wt-themechange', onThemeChange)
    return () => document.removeEventListener('wt-themechange', onThemeChange)
  }, [])

  function chooseTheme(next) {
    setThemePreference(next)
    setTheme(next)
  }

  function chooseDistanceUnit(next) {
    setDistanceUnitState(setDistanceUnit(next))
  }

  function chooseWeightUnit(next) {
    setWeightUnitState(setWeightUnit(next))
  }

  async function handleSignOutClick() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await onSignOut()
    } finally {
      setSigningOut(false)
    }
  }

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

      <AthleteCoachCard onLinksChange={onCoachLinksChange} />

      <div className="mt-4 rounded border border-orange-dim/40 bg-surface px-4 py-4">
        <div className="text-xs uppercase tracking-wide text-muted">
          Appearance
        </div>
        <p className="mt-1 text-sm text-muted">
          {getStoredPreference()
            ? 'Your choice is saved on this device.'
            : 'Following your system preference until you choose.'}
        </p>
        <div className="mt-3 flex gap-1">
          {[
            { id: 'dark', label: 'Dark' },
            { id: 'light', label: 'Light' },
          ].map((opt) => {
            const selected = theme === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => chooseTheme(opt.id)}
                className={[
                  'flex-1 rounded py-2 text-sm font-medium',
                  selected
                    ? 'bg-orange text-on-orange'
                    : 'bg-surface-alt text-muted ring-1 ring-orange-dim/40 hover:text-ink',
                ].join(' ')}
                aria-pressed={selected}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        <div className="mt-5 text-xs uppercase tracking-wide text-muted">
          Distance
        </div>
        <p className="mt-1 text-sm text-muted">
          Used for cardio targets and logging. Saved on this device.
        </p>
        <div className="mt-3 flex gap-1">
          {[
            { id: 'mi', label: 'Miles' },
            { id: 'km', label: 'Kilometers' },
          ].map((opt) => {
            const selected = distanceUnit === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => chooseDistanceUnit(opt.id)}
                className={[
                  'flex-1 rounded py-2 text-sm font-medium',
                  selected
                    ? 'bg-orange text-on-orange'
                    : 'bg-surface-alt text-muted ring-1 ring-orange-dim/40 hover:text-ink',
                ].join(' ')}
                aria-pressed={selected}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        <div className="mt-5 text-xs uppercase tracking-wide text-muted">
          Weight
        </div>
        <p className="mt-1 text-sm text-muted">
          Used for logging sets and progress charts. Saved on this device.
        </p>
        <div className="mt-3 flex gap-1">
          {[
            { id: 'lb', label: 'Pounds (lb)' },
            { id: 'kg', label: 'Kilograms (kg)' },
          ].map((opt) => {
            const selected = weightUnit === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => chooseWeightUnit(opt.id)}
                className={[
                  'flex-1 rounded py-2 text-sm font-medium',
                  selected
                    ? 'bg-orange text-on-orange'
                    : 'bg-surface-alt text-muted ring-1 ring-orange-dim/40 hover:text-ink',
                ].join(' ')}
                aria-pressed={selected}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
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
        onClick={handleSignOutClick}
        disabled={signingOut}
        className="mt-6 w-full rounded border border-orange-dim/50 bg-surface py-3 text-sm font-medium text-ink hover:bg-surface-alt disabled:opacity-60"
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
      {signOutError ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {signOutError}
        </p>
      ) : null}

      {PRIVACY_POLICY_URL ? (
        <p className="mt-4 text-center text-sm">
          <a
            href={PRIVACY_POLICY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted underline hover:text-ink"
          >
            Privacy policy
          </a>
        </p>
      ) : null}

      <DeleteAccountSection isCoach={isCoach} onDeleted={onAccountDeleted} />
    </div>
  )
}
