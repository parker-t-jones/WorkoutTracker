const DECISION_LABELS = {
  substitute: 'Substituted',
  skip: 'Skipped',
  progress: 'Progressed',
  reduce_volume: 'Reduced volume',
  hold: 'Held steady',
}

export default function WeekAdaptationSummary({
  weekNumber,
  decisions = [],
  onDismiss,
}) {
  const substituted = decisions.filter((d) => d.decision === 'substitute')
  const skipped = decisions.filter((d) => d.decision === 'skip')
  const changed = decisions.filter(
    (d) =>
      d.decision !== 'substitute' &&
      d.decision !== 'skip' &&
      d.decision !== 'hold',
  )
  const held = decisions.filter((d) => d.decision === 'hold')

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <header className="mb-6">
        <p className="text-sm text-stone-500">Week {weekNumber} ready</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          What changed for next week
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          Based on last week&apos;s logs — no action needed, just a heads-up.
        </p>
      </header>

      {substituted.length > 0 ? (
        <section className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-3">
          <h2 className="text-sm font-semibold text-amber-950">
            Felt off — swapped from vetted list
          </h2>
          <p className="mt-1 text-xs text-amber-900/80">
            These were flagged last week. Replacements come from the vetted
            substitutions table, not freeform AI picks.
          </p>
          <ul className="mt-3 space-y-2">
            {substituted.map((d) => (
              <li key={d.name} className="text-sm text-amber-950">
                <div className="font-medium">
                  {d.name}
                  {d.substitute_to ? (
                    <span className="font-normal text-amber-900/80">
                      {' '}
                      → {d.substitute_to}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-amber-900/80">{d.reason}</div>
                {d.pain_note ? (
                  <div className="mt-0.5 text-xs text-amber-800/70">
                    Note: {d.pain_note}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {skipped.length > 0 ? (
        <section className="mb-5 rounded-md border border-stone-300 bg-stone-100 px-3 py-3">
          <h2 className="text-sm font-semibold text-stone-900">
            Skipped — no safe substitute
          </h2>
          <p className="mt-1 text-xs text-stone-600">
            Every vetted alternate still carried the same strain tag (or
            needed unavailable equipment), so the movement is omitted/deloaded
            this week instead of forcing a bad swap.
          </p>
          <ul className="mt-3 space-y-2">
            {skipped.map((d) => (
              <li key={d.name} className="text-sm text-stone-900">
                <div className="font-medium">{d.name}</div>
                <div className="text-xs text-stone-600">{d.reason}</div>
                {d.pain_note ? (
                  <div className="mt-0.5 text-xs text-stone-500">
                    Note: {d.pain_note}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {changed.length > 0 ? (
        <section className="mb-5 space-y-2">
          <h2 className="text-sm font-medium text-stone-700">Adjustments</h2>
          <ul className="space-y-2">
            {changed.map((d) => (
              <li
                key={d.name}
                className="rounded-md border border-stone-200 bg-white px-3 py-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{d.name}</span>
                  <span className="shrink-0 text-xs font-medium text-stone-500">
                    {DECISION_LABELS[d.decision] ?? d.decision}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-stone-500">{d.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {held.length > 0 ? (
        <details className="mb-6 rounded-md border border-stone-200 bg-stone-50 px-3 py-2">
          <summary className="cursor-pointer text-sm text-stone-600">
            {held.length} exercise{held.length === 1 ? '' : 's'} held steady
          </summary>
          <ul className="mt-2 space-y-1.5 border-t border-stone-200 pt-2">
            {held.map((d) => (
              <li key={d.name} className="text-xs text-stone-600">
                <span className="font-medium text-stone-800">{d.name}</span>
                {' — '}
                {d.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {decisions.length === 0 ? (
        <p className="mb-6 text-sm text-stone-600">
          Next week is ready. No per-exercise changes to highlight.
        </p>
      ) : null}

      <button
        type="button"
        onClick={onDismiss}
        className="w-full rounded-md bg-stone-900 py-3 text-sm font-medium text-white hover:bg-stone-700"
      >
        Got it — back to calendar
      </button>
    </div>
  )
}
