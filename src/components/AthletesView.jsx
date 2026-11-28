import { useEffect, useRef, useState } from 'react'
import { loadActiveRoster } from '../lib/athletes'
import AthleteCalendar from './AthleteCalendar'

function pretty(value) {
  if (value == null || value === '') return null
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function athleteMeta(athlete) {
  const parts = []
  const goal = pretty(athlete.goal)
  if (goal) parts.push(goal)
  if (athlete.daysPerWeek) parts.push(`${athlete.daysPerWeek} days/week`)
  const level = pretty(athlete.experienceLevel)
  if (level) parts.push(level)
  return parts.join(' · ')
}

export default function AthletesView({ coachId, rosterNonce = 0 }) {
  const [athletes, setAthletes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const rosterNonceRef = useRef(rosterNonce)

  useEffect(() => {
    if (rosterNonceRef.current === rosterNonce) return
    rosterNonceRef.current = rosterNonce
    setSelected(null)
  }, [rosterNonce])

  useEffect(() => {
    if (!coachId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    loadActiveRoster(coachId)
      .then((rows) => {
        if (cancelled) return
        const sorted = [...rows].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
        )
        setAthletes(sorted)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setError(err.message || 'Could not load athletes')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [coachId])

  if (selected) {
    return (
      <AthleteCalendar athlete={selected} onBack={() => setSelected(null)} />
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Athletes
        </h1>
      </header>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : athletes.length === 0 ? (
        <div className="rounded border border-orange-dim/40 bg-surface px-4 py-4">
          <p className="font-display font-medium">No athletes yet</p>
          <p className="mt-1 text-sm text-muted">
            Invite an athlete by email or phone to start coaching them.
          </p>
          <button
            type="button"
            disabled
            className="mt-4 w-full rounded bg-orange py-3 text-sm font-medium text-on-orange opacity-60"
          >
            Invite athlete
          </button>
          <p className="mt-2 text-center text-xs text-muted">Coming next</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {athletes.map((athlete) => {
            const meta = athleteMeta(athlete)
            return (
              <li key={athlete.linkId}>
                <button
                  type="button"
                  onClick={() => setSelected(athlete)}
                  className="flex w-full items-center gap-3 rounded border border-orange-dim/40 bg-surface px-3 py-3 text-left hover:border-orange"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-medium">{athlete.name}</div>
                    {meta ? (
                      <div className="mt-0.5 text-sm text-muted">{meta}</div>
                    ) : null}
                  </div>
                  <span className="text-sm text-muted" aria-hidden="true">
                    →
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
