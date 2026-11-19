import { useState } from 'react'
import { ChevronDown, CirclePlay, Image } from 'lucide-react'
import MediaViewer from './MediaViewer'

function summaryIcon(items) {
  return items.some((i) => i.kind !== 'image') ? CirclePlay : Image
}

/**
 * WorkoutDetail coach media slot: a small "Watch demo" chip that expands the
 * coach's demos inline. Renders nothing when there's no media.
 */
export function DemoChip({ items }) {
  const [open, setOpen] = useState(false)
  if (!items?.length) return null
  const Icon = summaryIcon(items)
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={[
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
          open
            ? 'border-orange bg-orange text-on-orange'
            : 'border-orange-dim/50 bg-surface-alt text-ink hover:border-orange',
        ].join(' ')}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {open ? 'Hide demo' : 'Watch demo'}
        {items.length > 1 ? (
          <span className="font-mono tabular-nums opacity-80">{items.length}</span>
        ) : null}
      </button>
      {open ? (
        <div className="mt-2">
          <MediaViewer items={items} />
        </div>
      ) : null}
    </div>
  )
}

/** LogSet header slot: collapsible "How to do it" section. */
export function HowToDoIt({ items, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  if (!items?.length) return null
  const Icon = summaryIcon(items)
  return (
    <section className="mb-6 rounded border border-orange-dim/40 bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          <Icon className="h-4 w-4 text-orange" aria-hidden="true" />
          How to do it
          <span className="font-mono text-xs text-muted">
            {items.length} {items.length === 1 ? 'demo' : 'demos'}
          </span>
        </span>
        <ChevronDown
          className={[
            'h-4 w-4 text-muted transition-transform',
            open ? 'rotate-180' : '',
          ].join(' ')}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="border-t border-orange-dim/30 px-3 py-3">
          <MediaViewer items={items} />
        </div>
      ) : null}
    </section>
  )
}
