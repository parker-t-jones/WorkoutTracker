/** Visual + text label for a scheduled workout's status (see lib/schedule). */

export const STATUS_LABEL = {
  completed: 'Completed',
  'in-progress': 'In progress',
  pending: 'Planned',
  partial: 'Partial',
  missed: 'Missed',
}

/**
 * Small status mark. `size="sm"` is the calendar-cell dot; `md` the boxed
 * mark used in lists. Decorative by default — callers put the status in text
 * or an aria-label next to it.
 */
export default function StatusIndicator({ status, size = 'sm', label = false }) {
  const mark =
    status === 'completed' ? (
      <svg
        viewBox="0 0 16 16"
        className={size === 'sm' ? 'h-3 w-3 text-success' : 'h-3.5 w-3.5 text-success'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
      </svg>
    ) : (
      <span
        aria-hidden="true"
        className={[
          'block rounded-full',
          size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5',
          status === 'in-progress'
            ? 'bg-orange'
            : status === 'pending'
              ? 'border-[1.5px] border-orange'
              : status === 'partial'
                ? 'border-[1.5px] border-danger bg-orange'
                : 'bg-danger',
        ].join(' ')}
      />
    )

  if (!label) return mark
  return (
    <span className="inline-flex items-center gap-1.5">
      {mark}
      <span
        className={[
          'text-xs',
          status === 'completed'
            ? 'text-success'
            : status === 'missed' || status === 'partial'
              ? 'text-danger'
              : 'text-muted',
        ].join(' ')}
      >
        {STATUS_LABEL[status] ?? status}
      </span>
    </span>
  )
}
