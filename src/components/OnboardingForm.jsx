import { useEffect, useState } from 'react'

const GOALS = [
  { id: 'strength', label: 'Strength' },
  { id: 'hypertrophy', label: 'Hypertrophy' },
  { id: 'cardio', label: 'Cardio' },
  { id: 'general fitness', label: 'General Fitness' },
  { id: 'other', label: 'Other' },
]

const LEVELS = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
]

const DAYS = [2, 3, 4, 5, 6]

const SESSION_LENGTHS = [
  { id: '30 min', label: '30 min' },
  { id: '45 min', label: '45 min' },
  { id: '60 min', label: '60 min' },
  { id: '90+ min', label: '90+ min' },
]

const EQUIPMENT = [
  { id: 'home gym', label: 'Home Gym' },
  { id: 'commercial gym', label: 'Commercial Gym' },
  { id: 'dumbbells only', label: 'Dumbbells Only' },
  { id: 'bodyweight only', label: 'Bodyweight Only' },
]

const STEPS = [
  { key: 'age', title: 'How old are you?', required: true },
  { key: 'bodyweight', title: 'What’s your bodyweight?', required: true },
  { key: 'goal', title: 'What’s your main goal?', required: true },
  { key: 'level', title: 'What’s your fitness level?', required: true },
  { key: 'days', title: 'Days per week available?', required: true },
  { key: 'session', title: 'How long is a typical session?', required: true },
  { key: 'equipment', title: 'What equipment do you have?', required: true },
  {
    key: 'limitations',
    title: 'Any injuries or limitations?',
    required: false,
    optionalHint: 'Optional',
  },
  {
    key: 'notes',
    title: 'Anything else your AI trainer should know?',
    required: false,
    optionalHint: 'Optional',
  },
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

function ChoiceList({ name, options, value, onChange, disabled }) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="sr-only">{name}</legend>
      {options.map((opt) => {
        const selected = value === opt.id
        return (
          <label
            key={opt.id}
            className={[
              'flex cursor-pointer items-center gap-3 rounded border px-3 py-3 text-sm transition',
              selected
                ? 'border-orange bg-surface-alt text-ink'
                : 'border-orange-dim/40 bg-surface text-ink hover:border-orange-dim',
            ].join(' ')}
          >
            <input
              type="radio"
              name={name}
              value={opt.id}
              checked={selected}
              onChange={() => onChange(opt.id)}
              className="sr-only"
            />
            <span
              className={[
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                selected ? 'border-orange' : 'border-orange-dim/60',
              ].join(' ')}
              aria-hidden="true"
            >
              {selected ? (
                <span className="h-2 w-2 rounded-full bg-orange" />
              ) : null}
            </span>
            <span>{opt.label}</span>
          </label>
        )
      })}
    </fieldset>
  )
}

function isStepValid(stepKey, answers) {
  switch (stepKey) {
    case 'age': {
      const n = Number(answers.age)
      return Number.isFinite(n) && n >= 13 && n <= 100
    }
    case 'bodyweight': {
      const n = Number(answers.bodyweight)
      return Number.isFinite(n) && n > 0 && n < 1000
    }
    case 'goal':
      if (!answers.goal) return false
      if (answers.goal === 'other') return Boolean(answers.goalOther?.trim())
      return true
    case 'level':
      return Boolean(answers.experience_level)
    case 'days':
      return Boolean(answers.days_per_week)
    case 'session':
      return Boolean(answers.session_length)
    case 'equipment':
      return Boolean(answers.equipment)
    case 'limitations':
    case 'notes':
      return true
    default:
      return false
  }
}

function buildSubmitAnswers(answers) {
  const goal =
    answers.goal === 'other'
      ? `other: ${answers.goalOther.trim()}`
      : answers.goal

  return {
    age: Number(answers.age),
    bodyweight: Number(answers.bodyweight),
    bodyweight_unit: answers.bodyweight_unit,
    goal,
    experience_level: answers.experience_level,
    days_per_week: Number(answers.days_per_week),
    session_length: answers.session_length,
    equipment: answers.equipment,
    limitations: String(answers.limitations || '').trim(),
    additional_notes: String(answers.additional_notes || '').trim(),
  }
}

export default function OnboardingForm({ onSubmit, error, submitting, onSignOut }) {
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [animKey, setAnimKey] = useState(0)
  const [statusIndex, setStatusIndex] = useState(0)
  const [answers, setAnswers] = useState({
    age: '',
    bodyweight: '',
    bodyweight_unit: 'lb',
    goal: '',
    goalOther: '',
    experience_level: '',
    days_per_week: '4',
    session_length: '',
    equipment: '',
    limitations: '',
    additional_notes: '',
  })

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const canContinue = isStepValid(current.key, answers)

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

  function patch(partial) {
    setAnswers((prev) => ({ ...prev, ...partial }))
  }

  function goTo(next, direction) {
    setDir(direction)
    setAnimKey((k) => k + 1)
    setStep(next)
  }

  function handleBack() {
    if (step === 0 || submitting) return
    goTo(step - 1, -1)
  }

  function handleContinue() {
    if (!canContinue || submitting) return
    if (isLast) {
      onSubmit(buildSubmitAnswers(answers))
      return
    }
    goTo(step + 1, 1)
  }

  function handleSkip() {
    if (submitting) return
    if (current.key === 'limitations') patch({ limitations: '' })
    if (current.key === 'notes') patch({ additional_notes: '' })
    if (isLast) {
      onSubmit(buildSubmitAnswers({ ...answers, additional_notes: '' }))
      return
    }
    goTo(step + 1, 1)
  }

  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col px-4 py-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        {step > 0 ? (
          <button
            type="button"
            onClick={handleBack}
            disabled={submitting}
            className="text-sm text-muted hover:text-ink disabled:opacity-60"
          >
            ← Back
          </button>
        ) : (
          <span className="text-sm text-muted">Set up</span>
        )}
        <button
          type="button"
          onClick={onSignOut}
          disabled={submitting}
          className="text-sm text-muted underline hover:text-ink disabled:opacity-60"
        >
          Sign out
        </button>
      </div>

      <div
        className="mb-6 h-1 overflow-hidden rounded bg-surface-alt"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={step + 1}
        aria-label={`Step ${step + 1} of ${STEPS.length}`}
      >
        <div
          className="h-full rounded bg-orange transition-[width] duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div
        key={animKey}
        className={[
          'flex flex-1 flex-col',
          dir >= 0 ? 'onboarding-step-forward' : 'onboarding-step-back',
        ].join(' ')}
      >
        <header className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Step {step + 1} of {STEPS.length}
            {current.optionalHint ? ` · ${current.optionalHint}` : ''}
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">
            {current.title}
          </h1>
        </header>

        <div className="flex-1 space-y-4">
          {current.key === 'age' ? (
            <label className="block space-y-2">
              <span className="text-sm text-muted">Age in years</span>
              <input
                type="number"
                inputMode="numeric"
                min={13}
                max={100}
                value={answers.age}
                onChange={(e) => patch({ age: e.target.value })}
                disabled={submitting}
                autoFocus
                className="w-full rounded border border-orange-dim/50 bg-surface px-3 py-3 font-display text-2xl font-semibold tabular-nums text-ink disabled:opacity-60"
              />
            </label>
          ) : null}

          {current.key === 'bodyweight' ? (
            <div className="space-y-3">
              <div className="flex gap-1">
                {['lb', 'kg'].map((unit) => {
                  const selected = answers.bodyweight_unit === unit
                  return (
                    <button
                      key={unit}
                      type="button"
                      disabled={submitting}
                      onClick={() => patch({ bodyweight_unit: unit })}
                      className={[
                        'flex-1 rounded py-2 text-sm font-medium',
                        selected
                          ? 'bg-orange text-on-orange'
                          : 'bg-surface text-muted ring-1 ring-orange-dim/40 hover:text-ink',
                      ].join(' ')}
                      aria-pressed={selected}
                    >
                      {unit}
                    </button>
                  )
                })}
              </div>
              <label className="block space-y-2">
                <span className="text-sm text-muted">
                  Bodyweight ({answers.bodyweight_unit})
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step="0.1"
                  value={answers.bodyweight}
                  onChange={(e) => patch({ bodyweight: e.target.value })}
                  disabled={submitting}
                  autoFocus
                  className="w-full rounded border border-orange-dim/50 bg-surface px-3 py-3 font-display text-2xl font-semibold tabular-nums text-ink disabled:opacity-60"
                />
              </label>
              <p className="text-xs text-muted">
                Used to calibrate starting loads. Logging stays in lb.
              </p>
            </div>
          ) : null}

          {current.key === 'goal' ? (
            <div className="space-y-3">
              <ChoiceList
                name="goal"
                options={GOALS}
                value={answers.goal}
                onChange={(goal) => patch({ goal })}
                disabled={submitting}
              />
              {answers.goal === 'other' ? (
                <label className="block space-y-2">
                  <span className="text-sm font-medium">What’s your goal?</span>
                  <input
                    type="text"
                    value={answers.goalOther}
                    onChange={(e) => patch({ goalOther: e.target.value })}
                    disabled={submitting}
                    placeholder="e.g. marathon prep, recomp"
                    className="w-full rounded border border-orange-dim/50 bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted disabled:opacity-60"
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          {current.key === 'level' ? (
            <ChoiceList
              name="experience_level"
              options={LEVELS}
              value={answers.experience_level}
              onChange={(experience_level) => patch({ experience_level })}
              disabled={submitting}
            />
          ) : null}

          {current.key === 'days' ? (
            <label className="block space-y-2">
              <span className="text-sm text-muted">Training days per week</span>
              <select
                value={answers.days_per_week}
                onChange={(e) => patch({ days_per_week: e.target.value })}
                disabled={submitting}
                className="w-full rounded border border-orange-dim/50 bg-surface px-3 py-2 text-ink disabled:opacity-60"
              >
                {DAYS.map((n) => (
                  <option key={n} value={n}>
                    {n} days
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {current.key === 'session' ? (
            <ChoiceList
              name="session_length"
              options={SESSION_LENGTHS}
              value={answers.session_length}
              onChange={(session_length) => patch({ session_length })}
              disabled={submitting}
            />
          ) : null}

          {current.key === 'equipment' ? (
            <ChoiceList
              name="equipment"
              options={EQUIPMENT}
              value={answers.equipment}
              onChange={(equipment) => patch({ equipment })}
              disabled={submitting}
            />
          ) : null}

          {current.key === 'limitations' ? (
            <label className="block space-y-2">
              <span className="text-sm text-muted">
                Tell us what to avoid or work around
              </span>
              <textarea
                rows={4}
                value={answers.limitations}
                onChange={(e) => patch({ limitations: e.target.value })}
                disabled={submitting}
                placeholder='e.g. "bad left knee"'
                className="w-full rounded border border-orange-dim/50 bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted disabled:opacity-60"
              />
            </label>
          ) : null}

          {current.key === 'notes' ? (
            <label className="block space-y-2">
              <span className="text-sm text-muted">
                Preferences, schedule quirks, anything useful
              </span>
              <textarea
                rows={4}
                value={answers.additional_notes}
                onChange={(e) => patch({ additional_notes: e.target.value })}
                disabled={submitting}
                placeholder='e.g. "I prefer training in the morning," "avoid overhead pressing"'
                className="w-full rounded border border-orange-dim/50 bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted disabled:opacity-60"
              />
            </label>
          ) : null}

          {error && !submitting && isLast ? (
            <p
              role="alert"
              className="rounded bg-danger-bg px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          ) : null}

          {submitting ? (
            <div
              role="status"
              aria-live="polite"
              className="flex flex-col items-center gap-3 rounded border border-orange-dim/40 bg-surface px-4 py-6 text-center"
            >
              <Spinner />
              <p className="text-sm font-medium text-ink">
                {STATUS_MESSAGES[statusIndex]}
              </p>
              <p className="text-xs text-muted">
                This usually takes about a minute.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 space-y-2 pb-[env(safe-area-inset-bottom,0px)]">
        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue || submitting}
          className="w-full rounded bg-orange py-3 text-sm font-medium text-on-orange hover:bg-orange-dim disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting
            ? 'Generating…'
            : isLast
              ? 'Generate my program'
              : 'Continue'}
        </button>
        {!current.required && !submitting ? (
          <button
            type="button"
            onClick={handleSkip}
            className="w-full py-2 text-sm text-muted hover:text-ink"
          >
            Skip
          </button>
        ) : null}
      </div>
    </div>
  )
}
