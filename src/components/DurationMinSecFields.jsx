function sanitizeMinutes(raw) {
  const digits = String(raw).replace(/\D/g, '')
  return digits
}

function sanitizeSeconds(raw) {
  const digits = String(raw).replace(/\D/g, '')
  if (digits === '') return ''
  const n = Number(digits)
  if (!Number.isFinite(n)) return ''
  return String(Math.min(59, n))
}

/** Dual Min / Sec numeric inputs — mobile-friendly (no colon needed). */
export default function DurationMinSecFields({
  minutes,
  seconds,
  onMinutesChange,
  onSecondsChange,
  size = 'lg',
  label = 'Duration',
  minutesAria = 'Minutes',
  secondsAria = 'Seconds',
}) {
  const inputClass =
    size === 'sm'
      ? 'w-full rounded border border-orange-dim/50 bg-bg px-2 py-2 font-mono text-sm tabular-nums text-ink'
      : 'w-full rounded border border-orange-dim/50 bg-surface px-3 py-3 font-mono text-xl tabular-nums text-ink'
  const labelClass = size === 'sm' ? 'text-xs text-muted' : 'text-xs text-muted'

  return (
    <div className="space-y-2">
      <span className={size === 'sm' ? 'text-xs text-muted' : 'text-sm font-medium'}>
        {label}
      </span>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className={labelClass}>Min</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="0"
            value={minutes}
            onChange={(e) => onMinutesChange(sanitizeMinutes(e.target.value))}
            className={inputClass}
            aria-label={minutesAria}
          />
        </label>
        <label className="block space-y-1">
          <span className={labelClass}>Sec</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="0"
            value={seconds}
            onChange={(e) => onSecondsChange(sanitizeSeconds(e.target.value))}
            className={inputClass}
            aria-label={secondsAria}
          />
        </label>
      </div>
    </div>
  )
}
