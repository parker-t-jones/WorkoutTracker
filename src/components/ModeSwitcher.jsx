const MODES = [
  { id: 'training', label: 'Training' },
  { id: 'coaching', label: 'Coaching' },
]

export default function ModeSwitcher({ mode, onChange }) {
  return (
    <header
      className="sticky top-0 z-30 border-b border-orange-dim/25 bg-bg/90 backdrop-blur-sm"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="mx-auto flex max-w-lg justify-center px-4 py-2">
        <div
          className="inline-flex rounded bg-surface-alt p-0.5 ring-1 ring-orange-dim/30"
          role="tablist"
          aria-label="App mode"
        >
          {MODES.map((opt) => {
            const selected = mode === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onChange(opt.id)}
                className={[
                  'rounded px-3 py-1 text-xs font-medium sm:text-sm',
                  selected
                    ? 'bg-orange text-on-orange'
                    : 'text-muted hover:text-ink',
                ].join(' ')}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>
    </header>
  )
}
