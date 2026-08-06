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
      className="h-8 w-8 animate-spin text-stone-800"
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
            className="text-sm text-stone-500 underline hover:text-stone-800"
          >
            Sign out
          </button>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Set up your program
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          Answer five questions and we&apos;ll generate a 4-week plan.
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
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 disabled:opacity-60"
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
            <span className="font-normal text-stone-400">(optional)</span>
          </span>
          <textarea
            name="limitations"
            rows={3}
            placeholder='e.g. "bad left knee"'
            disabled={submitting}
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>

        {error && !submitting ? (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}

        {submitting ? (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col items-center gap-3 rounded-md border border-stone-200 bg-white px-4 py-6 text-center"
          >
            <Spinner />
            <p className="text-sm font-medium text-stone-800">
              {STATUS_MESSAGES[statusIndex]}
            </p>
            <p className="text-xs text-stone-500">
              This usually takes about a minute.
            </p>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          aria-disabled={submitting}
          className="w-full rounded-md bg-stone-900 py-3 text-sm font-medium text-white hover:bg-stone-700 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Generating…' : 'Generate my program'}
        </button>
      </form>
    </div>
  )
}
