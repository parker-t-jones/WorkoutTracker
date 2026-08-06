import { loggedCountFor } from '../lib/logging'

export default function WorkoutDetail({
  scheduled,
  logs,
  onBack,
  onLogExercise,
  justCompleted,
}) {
  const { workout, exercises, date, status } = scheduled

  const totalSets = exercises.reduce((sum, we) => sum + we.sets, 0)
  const loggedSets = exercises.reduce(
    (sum, we) => sum + Math.min(loggedCountFor(logs, we.id), we.sets),
    0,
  )
  const allDone = status === 'completed' || loggedSets >= totalSets

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-sm text-stone-600 hover:text-stone-900"
      >
        ← Calendar
      </button>

      <header className="mb-6">
        <p className="text-sm text-stone-500">
          Week {workout.week_number} · Day {workout.day_number} · {date}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{workout.focus}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={[
              'inline-block rounded px-2 py-0.5 text-xs font-medium',
              allDone
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-800',
            ].join(' ')}
          >
            {allDone ? 'completed' : status}
          </span>
          <span className="text-xs text-stone-500">
            {loggedSets}/{totalSets} sets logged
          </span>
        </div>
      </header>

      {(justCompleted || allDone) && (
        <p className="mb-4 rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
          Workout complete — nice work.
        </p>
      )}

      <ul className="space-y-3">
        {exercises.map((we, index) => {
          const logged = logs
            .filter((l) => l.workout_exercise_id === we.id)
            .sort((a, b) => a.set_number - b.set_number)
          const count = logged.length
          const exerciseDone = count >= we.sets

          return (
            <li
              key={we.id}
              className="rounded-md border border-stone-200 bg-white px-3 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-stone-400">
                    Exercise {index + 1}
                  </div>
                  <div className="font-medium">
                    {we.exercise?.name ?? 'Exercise'}
                  </div>
                  <div className="mt-1 text-sm text-stone-600">
                    {we.sets} × {we.reps} · {we.weight_guidance}
                  </div>
                  {we.notes ? (
                    <div className="mt-1 text-sm text-stone-500">{we.notes}</div>
                  ) : null}
                  {count > 0 && (
                    <div className="mt-2 text-xs text-emerald-700">
                      Logged {Math.min(count, we.sets)}/{we.sets} sets
                      {logged.slice(0, we.sets).map((l) => (
                        <span key={l.id} className="ml-2 tabular-nums">
                          #{l.set_number}: {l.actual_reps}
                          {l.actual_weight != null ? `@${l.actual_weight}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onLogExercise(we.id)}
                  className={[
                    'shrink-0 rounded px-3 py-1.5 text-sm font-medium',
                    exerciseDone
                      ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
                      : 'bg-stone-900 text-white hover:bg-stone-700',
                  ].join(' ')}
                >
                  {exerciseDone ? 'Done' : count > 0 ? 'Continue' : 'Log'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
