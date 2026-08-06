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

function formatShortDate(dateKey) {
  const [, m, d] = dateKey.split('-')
  return `${Number(m)}/${Number(d)}`
}

function AdherenceCard({ label, stats }) {
  return (
    <div className="rounded-md border border-stone-200 bg-white px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">
        {label}
      </div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">
        {stats.percent}%
      </div>
      <div className="mt-1 text-sm text-stone-500">
        {stats.completed} of {stats.scheduled} workouts completed
      </div>
    </div>
  )
}

export default function ProgressView({ scheduledWorkouts, workoutDetails, logs }) {
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
        <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
        <p className="mt-1 text-sm text-stone-500">Your training only</p>
      </header>

      <section className="mb-8 space-y-3">
        <h2 className="text-sm font-medium text-stone-700">Adherence</h2>
        <div className="grid grid-cols-2 gap-3">
          <AdherenceCard label="This week" stats={weekStats} />
          <AdherenceCard label="All time" stats={allTimeStats} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-stone-700">
          Weight progression
        </h2>

        {series.length === 0 ? (
          <p className="rounded-md border border-dashed border-stone-300 bg-white px-4 py-8 text-center text-sm text-stone-500">
            Log the same lift at least twice (with weight) to see a chart here.
          </p>
        ) : (
          <div className="space-y-4 rounded-md border border-stone-200 bg-white p-4">
            <label className="block">
              <span className="mb-1 block text-xs text-stone-500">Exercise</span>
              <select
                value={selected?.exerciseId ?? ''}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
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
                    <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatShortDate}
                      tick={{ fontSize: 11, fill: '#78716c' }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#78716c' }}
                      width={40}
                      domain={['auto', 'auto']}
                      unit=""
                    />
                    <Tooltip
                      formatter={(value) => [`${value} lb`, 'Top set']}
                      labelFormatter={(label) => formatShortDate(label)}
                    />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      stroke="#1c1917"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#1c1917' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <p className="text-xs text-stone-400">
              Top set (heaviest logged weight) per day
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
