import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import {
  adherenceFor,
  currentWeekRange,
  weightProgressByExercise,
} from '../lib/progress'
import { readThemeVars } from '../lib/theme'

function formatShortDate(dateKey) {
  const [, m, d] = dateKey.split('-')
  return `${Number(m)}/${Number(d)}`
}

function AdherenceCard({ label, stats }) {
  return (
    <div className="rounded border border-orange-dim/40 bg-surface px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className="mt-1 font-display text-3xl font-semibold tabular-nums">
        {stats.percent}%
      </div>
      <div className="mt-1 text-sm text-muted">
        {stats.completed} of {stats.scheduled} workouts completed
      </div>
    </div>
  )
}

function useChartColors() {
  const [colors, setColors] = useState(() => readThemeVars())

  useEffect(() => {
    function refresh() {
      setColors(readThemeVars())
    }
    document.addEventListener('wt-themechange', refresh)
    return () => document.removeEventListener('wt-themechange', refresh)
  }, [])

  return colors
}

export default function ProgressView({ scheduledWorkouts, workoutDetails, logs }) {
  const chart = useChartColors()
  const weekStats = useMemo(
    () => adherenceFor(scheduledWorkouts, currentWeekRange()),
    [scheduledWorkouts],
  )
  const allTimeStats = useMemo(
    () => adherenceFor(scheduledWorkouts),
    [scheduledWorkouts],
  )

  const series = useMemo(
    () => weightProgressByExercise(logs, workoutDetails),
    [logs, workoutDetails],
  )

  const [selectedId, setSelectedId] = useState(series[0]?.exerciseId ?? '')

  useEffect(() => {
    if (!series.some((s) => s.exerciseId === selectedId)) {
      setSelectedId(series[0]?.exerciseId ?? '')
    }
  }, [series, selectedId])

  const selected =
    series.find((s) => s.exerciseId === selectedId) ?? series[0] ?? null

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Progress
        </h1>
        <p className="mt-1 text-sm text-muted">Your training only</p>
      </header>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-sm font-medium text-ink">Adherence</h2>
        <div className="grid grid-cols-2 gap-3">
          <AdherenceCard label="This week" stats={weekStats} />
          <AdherenceCard label="All time" stats={allTimeStats} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-sm font-medium text-ink">
          Weight progression
        </h2>

        {series.length === 0 ? (
          <p className="rounded border border-dashed border-orange-dim/50 bg-surface px-4 py-8 text-center text-sm text-muted">
            Log the same lift at least twice (with weight) to see a chart here.
          </p>
        ) : (
          <div className="space-y-4 rounded border border-orange-dim/40 bg-surface p-4">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Exercise</span>
              <select
                value={selected?.exerciseId ?? ''}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded border border-orange-dim/50 bg-bg px-3 py-2 text-sm text-ink"
              >
                {series.map((s) => (
                  <option key={s.exerciseId} value={s.exerciseId}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            {selected && (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={selected.points}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke={chart.surfaceAlt}
                      strokeDasharray="3 3"
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatShortDate}
                      tick={{ fontSize: 11, fill: chart.textMuted }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: chart.textMuted }}
                      width={40}
                      domain={['auto', 'auto']}
                      unit=""
                    />
                    <Tooltip
                      contentStyle={{
                        background: chart.surface,
                        border: `1px solid ${chart.orangeDim}`,
                        borderRadius: 6,
                        color: chart.text,
                      }}
                      formatter={(value) => [`${value} lb`, 'Top set']}
                      labelFormatter={(label) => formatShortDate(label)}
                    />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      stroke={chart.orange}
                      strokeWidth={2}
                      dot={{ r: 3, fill: chart.orange }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <p className="text-xs text-muted">
              Top set (heaviest logged weight) per day
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
