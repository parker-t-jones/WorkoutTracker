import { useEffect, useState } from 'react'

const GOALS = ['strength', 'hypertrophy', 'general fitness']
const LEVELS = ['beginner', 'intermediate', 'advanced']
const DAYS = [2, 3, 4, 5, 6]
const EQUIPMENT = [
  'home gym',
  'commercial gym',
  'dumbbells only',
  'bodyweight only',
]

const STATUS_MESSAGES = [
  'Designing your program...',
  'Selecting exercises for your goals...',
  'Finalizing your schedule...',
  'Almost done...',
]

function Spinner() {
  return (
    <svg
      className="h-8 w-8 animate-spin text-orange"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  )
}

export default function OnboardingForm({ onSubmit, error, submitting, onSignOut }) {
  const [statusIndex, setStatusIndex] = useState(0)

  useEffect(() => {
    if (!submitting) {
      setStatusIndex(0)
      return
    }

    const id = setInterval(() => {
      setStatusIndex((i) => (i + 1) % STATUS_MESSAGES.length)
    }, 12000)

    return () => clearInterval(id)
  }, [submitting])

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <header className="mb-8">
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={onSignOut}
            className="text-sm text-muted underline hover:text-ink"
          >
            Sign out
          </button>
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Set up your program
        </h1>
        <p className="mt-2 text-sm text-muted">
          Answer five questions and we&apos;ll generate your first week.
          Later weeks adapt from how you train.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (submitting) return
          onSubmit(e)
        }}
        className="space-y-6"
      >
        <fieldset className="space-y-2" disabled={submitting}>
          <legend className="text-sm font-medium">Goal</legend>
          {GOALS.map((goal) => (
            <label key={goal} className="flex items-center gap-2 text-sm">
              <input type="radio" name="goal" value={goal} required />
              <span className="capitalize">{goal}</span>
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-2" disabled={submitting}>
          <legend className="text-sm font-medium">Experience level</legend>
          {LEVELS.map((level) => (
            <label key={level} className="flex items-center gap-2 text-sm">
              <input type="radio" name="experience_level" value={level} required />
              <span className="capitalize">{level}</span>
            </label>
          ))}
        </fieldset>

        <label className="block space-y-2">
          <span className="text-sm font-medium">Days per week available</span>
          <select
            name="days_per_week"
            required
            defaultValue="4"
            disabled={submitting}
            className="w-full rounded border border-orange-dim/50 bg-surface px-3 py-2 text-ink disabled:opacity-60"
          >
            {DAYS.map((n) => (
              <option key={n} value={n}>
                {n} days
              </option>
            ))}
          </select>
        </label>

        <fieldset className="space-y-2" disabled={submitting}>
          <legend className="text-sm font-medium">Equipment access</legend>
          {EQUIPMENT.map((eq) => (
            <label key={eq} className="flex items-center gap-2 text-sm">
              <input type="radio" name="equipment" value={eq} required />
              <span className="capitalize">{eq}</span>
            </label>
          ))}
        </fieldset>

        <label className="block space-y-2">
          <span className="text-sm font-medium">
            Injuries or limitations{' '}
            <span className="font-normal text-muted">(optional)</span>
          </span>
          <textarea
            name="limitations"
            rows={3}
            placeholder='e.g. "bad left knee"'
            disabled={submitting}
            className="w-full rounded border border-orange-dim/50 bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted disabled:opacity-60"
          />
        </label>

        {error && !submitting ? (
          <p
            role="alert"
            className="rounded bg-danger-bg px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}

        {submitting ? (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col items-center gap-3 rounded border border-orange-dim/40 bg-surface px-4 py-6 text-center"
          >
            <Spinner />
            <p className="text-sm font-medium text-ink">
              {STATUS_MESSAGES[statusIndex]}
            </p>
            <p className="text-xs text-muted">
              This usually takes about a minute.
            </p>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          aria-disabled={submitting}
          className="w-full rounded bg-orange py-3 text-sm font-medium text-on-orange hover:bg-orange-dim disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Generating…' : 'Generate my program'}
        </button>
      </form>
    </div>
  )
}
