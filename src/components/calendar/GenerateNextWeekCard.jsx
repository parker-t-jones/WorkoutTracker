import { useEffect, useState } from 'react'

const STATUS_MESSAGES = [
  'Reviewing last week...',
  'Adjusting loads and volume...',
  'Building next week...',
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

/** "Current week is done → Generate next week" card (moved from CalendarView). */
export default function GenerateNextWeekCard({ onGenerate, generating, error }) {
  const [statusIndex, setStatusIndex] = useState(0)

  useEffect(() => {
    if (!generating) {
      setStatusIndex(0)
      return
    }
    const id = setInterval(() => {
      setStatusIndex((i) => (i + 1) % STATUS_MESSAGES.length)
    }, 12000)
    return () => clearInterval(id)
  }, [generating])

  return (
    <div className="mb-6 rounded border border-orange-dim/40 bg-surface px-3 py-3">
      {generating ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center gap-3 py-4 text-center"
        >
          <Spinner />
          <p className="text-sm font-medium text-ink">
            {STATUS_MESSAGES[statusIndex]}
          </p>
          <p className="text-xs text-muted">This usually takes about a minute.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-ink">
            Current week is done. Generate next week from your logs (loads, RPE,
            your notes and any pain flags).
          </p>
          {error ? (
            <p
              role="alert"
              className="mt-2 rounded bg-danger-bg px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating}
            className="mt-3 w-full rounded bg-orange py-3 text-sm font-medium text-on-orange hover:bg-orange-dim disabled:pointer-events-none disabled:opacity-60"
          >
            Generate next week
          </button>
        </>
      )}
    </div>
  )
}
