import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import CalendarView from './components/CalendarView'
import WorkoutDetail from './components/WorkoutDetail'
import HistoryView from './components/HistoryView'
import LogSet from './components/LogSet'
import LogCardio from './components/LogCardio'
import OnboardingForm from './components/OnboardingForm'
import ProgressView from './components/ProgressView'
import LeaderboardView from './components/LeaderboardView'
import TabBar from './components/TabBar'
import AuthScreen from './components/AuthScreen'
import AccountView from './components/AccountView'
import WeekAdaptationSummary from './components/WeekAdaptationSummary'
import ProposedSubstitutionsView from './components/ProposedSubstitutionsView'
import CoachHome from './components/coach/CoachHome'
import { DemoChip, HowToDoIt } from './components/ExerciseDemo'
import { useExerciseMedia } from './lib/useExerciseMedia'
import { supabase } from './lib/supabase'
import {
  loadProgramData,
  generateAndSaveProgram,
  generateAndSaveNextWeek,
  canGenerateNextWeek,
  filterScheduledForCalendar,
  GENERATE_ERROR,
} from './lib/program'
import {
  saveSetLog,
  updateSetLog,
  deleteSetLog,
  finishScheduledWorkout,
  saveCardioLog,
  saveIntervalSplit,
  updateExerciseRpe,
  updateExercisePain,
  isCardioExercise,
} from './lib/logging'
import {
  saveExerciseNote,
  deleteExerciseNote,
  isMissingNotesTable,
} from './lib/notes'
import { onAuthStateChange, signOut, ensureProfile } from './lib/auth'
import { workoutExerciseIndex } from './lib/progress'
import { buildScheduledProgress } from './lib/schedule'

export default function App() {
  const [bootstrapping, setBootstrapping] = useState(true)
  const [session, setSession] = useState(null)
  const [authScreenMode, setAuthScreenMode] = useState('login')
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [onboardingError, setOnboardingError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [generatingNextWeek, setGeneratingNextWeek] = useState(false)
  const generatingNextWeekRef = useRef(false)
  const [nextWeekError, setNextWeekError] = useState(null)
  const [adaptationSummary, setAdaptationSummary] = useState(null)

  const [scheduledWorkouts, setScheduledWorkouts] = useState([])
  const [workoutsById, setWorkoutsById] = useState({})
  const [workoutDetails, setWorkoutDetails] = useState({})
  const [userId, setUserId] = useState(null)
  // users.is_coach from ensureProfile — gates the Coach tab (RLS/RPCs enforce
  // the real permission server-side).
  const [isCoach, setIsCoach] = useState(false)
  const [logs, setLogs] = useState([])
  const [logSplits, setLogSplits] = useState([])
  // exercise_notes rows; notesAvailable = false until
  // 2026-11-notes-and-editing.sql is run (then notes fall back to logs.pain_*).
  const [exerciseNotes, setExerciseNotes] = useState([])
  const [notesAvailable, setNotesAvailable] = useState(true)

  const [view, setView] = useState('calendar') // calendar | history | progress | leaderboard | account | coach | workout | log | week-summary | proposals
  // Where "back" from a workout goes (it can be opened from the history list).
  const [workoutReturnView, setWorkoutReturnView] = useState('calendar')
  // Month shown in the calendar grid — kept here so it survives opening a workout.
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [scheduledId, setScheduledId] = useState(null)
  const [workoutExerciseId, setWorkoutExerciseId] = useState(null)
  const [editLogId, setEditLogId] = useState(null)
  const [logShowRpe, setLogShowRpe] = useState(false)
  const [savingLog, setSavingLog] = useState(false)
  const [savingRpe, setSavingRpe] = useState(false)
  const [savingNoteId, setSavingNoteId] = useState(null)
  const [logError, setLogError] = useState(null)
  const [justCompleted, setJustCompleted] = useState(false)
  const [finishingWorkout, setFinishingWorkout] = useState(false)
  const [signOutError, setSignOutError] = useState(null)
  // User id whose data is loaded/loading. Auth events for the same user
  // (SIGNED_IN re-emitted on tab refocus, USER_UPDATED) must not remount the
  // app — that would unmount LogSet mid-entry.
  const loadedUserIdRef = useRef(null)

  const applyProgramData = useCallback((data) => {
    setUserId(data.userId)
    setScheduledWorkouts(data.scheduledWorkouts)
    setWorkoutsById(
      Object.fromEntries((data.workouts ?? []).map((w) => [w.id, w])),
    )
    setWorkoutDetails(data.workoutDetails)
    setLogs(data.logs ?? [])
    setLogSplits(data.logSplits ?? [])
    setExerciseNotes(data.exerciseNotes ?? [])
    setNotesAvailable(data.notesAvailable !== false)
    setNeedsOnboarding(data.scheduledWorkouts.length === 0)
  }, [])

  const refresh = useCallback(
    async (authUser) => {
      if (!supabase) {
        setLoadError(
          'Missing Supabase config. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env',
        )
        setBootstrapping(false)
        return
      }

      const user = typeof authUser === 'string' ? { id: authUser } : authUser
      if (!user?.id) {
        setBootstrapping(false)
        return
      }

      try {
        setLoadError(null)
        const profile = await ensureProfile(user)
        const coach = Boolean(profile?.is_coach)
        setIsCoach(coach)
        const data = await loadProgramData(user.id)
        applyProgramData(data)
        // A coach who doesn't train with the app lands on the Coach tab
        // instead of being forced through onboarding.
        if (coach && data.scheduledWorkouts.length === 0) setView('coach')
        return data
      } catch (err) {
        console.error(err)
        setLoadError(err.message || 'Failed to load program data')
        return null
      } finally {
        setBootstrapping(false)
      }
    },
    [applyProgramData],
  )

  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    localStorage.removeItem('gym_user_id')

    if (!supabase) {
      setLoadError(
        'Missing Supabase config. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env',
      )
      setBootstrapping(false)
      return
    }

    const unsubscribe = onAuthStateChange((nextSession, event) => {
      setSession(nextSession)

      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true)
        setAuthScreenMode('recovery')
        setBootstrapping(false)
        // Load data in the background so "Continue" after the new password
        // lands on a ready app (and USER_UPDATED is then a same-user no-op).
        const user = nextSession?.user
        if (user?.id && loadedUserIdRef.current !== user.id) {
          loadedUserIdRef.current = user.id
          setTimeout(() => {
            refreshRef.current(user)
          }, 0)
        }
        return
      }

      // Don't remount the app on token refresh — that unmounts onboarding
      // mid-generate and re-enables the submit button.
      if (event === 'TOKEN_REFRESHED') return

      if (nextSession?.user) {
        // Same user (SIGNED_IN on refocus, USER_UPDATED, …): nothing to reload.
        if (loadedUserIdRef.current === nextSession.user.id) return
        loadedUserIdRef.current = nextSession.user.id
        if (!submittingRef.current) setBootstrapping(true)
        // Defer DB calls — awaiting inside onAuthStateChange can deadlock the auth lock.
        setTimeout(() => {
          refreshRef.current(nextSession.user)
        }, 0)
      } else {
        loadedUserIdRef.current = null
        setUserId(null)
        setIsCoach(false)
        setLoadError(null)
        setAdaptationSummary(null)
        setSignOutError(null)
        setScheduledWorkouts([])
        setWorkoutsById({})
        setWorkoutDetails({})
        setLogs([])
        setLogSplits([])
        setExerciseNotes([])
        setNotesAvailable(true)
        setNeedsOnboarding(false)
        setView('calendar')
        setAuthScreenMode('login')
        setPasswordRecovery(false)
        setBootstrapping(false)
      }
    })

    return unsubscribe
  }, [])

  async function handleOnboardingSubmit(answers) {
    if (submittingRef.current) return
    const user = session?.user
    if (!user?.id) return

    submittingRef.current = true
    setSubmitting(true)
    setOnboardingError(null)

    try {
      await generateAndSaveProgram(answers, user.id)
      await refreshRef.current(user)
      // Generation inserted rows — leave onboarding even if a reload races.
      setNeedsOnboarding(false)
      setView('calendar')
    } catch (err) {
      console.error(err)
      setOnboardingError(err?.message || GENERATE_ERROR)
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  async function handleGenerateNextWeek() {
    if (generatingNextWeekRef.current || !userId) return
    generatingNextWeekRef.current = true
    setGeneratingNextWeek(true)
    setNextWeekError(null)

    try {
      const result = await generateAndSaveNextWeek({
        userId,
        scheduledWorkouts,
        workouts: Object.values(workoutsById),
        workoutDetails,
        logs,
        logSplits,
        exerciseNotes,
      })

      // Always reload calendar data after insert — don't rely on pre-generate state.
      const data = await loadProgramData(userId)
      applyProgramData(data)

      setAdaptationSummary({
        weekNumber: result.weekNumber,
        decisions: result.decisions ?? [],
      })
      setView('week-summary')
    } catch (err) {
      console.error(err)
      setNextWeekError(err?.message || GENERATE_ERROR)
    } finally {
      generatingNextWeekRef.current = false
      setGeneratingNextWeek(false)
    }
  }

  async function handleSignOut() {
    setSignOutError(null)
    try {
      await signOut()
    } catch (err) {
      console.error(err)
      // Server sign-out failed (e.g. offline) — still clear this device.
      try {
        await supabase?.auth.signOut({ scope: 'local' })
      } catch (localErr) {
        console.error(localErr)
        setSignOutError(err?.message || 'Could not sign out — try again')
        return
      }
    }
    setLoadError(null)
    setAdaptationSummary(null)
  }

  function handleRetryLoad() {
    const user = session?.user
    if (!user?.id) {
      setLoadError(null)
      return
    }
    loadedUserIdRef.current = user.id
    setBootstrapping(true)
    refreshRef.current(user)
  }

  const getWorkout = useCallback(
    (workoutId) => workoutsById[workoutId],
    [workoutsById],
  )

  function getScheduledBundle(id) {
    const sw = scheduledWorkouts.find((s) => s.id === id)
    if (!sw) return null
    const detail = workoutDetails[sw.workout_id]
    if (!detail) return null
    return {
      ...sw,
      workout: detail.workout,
      exercises: detail.exercises,
    }
  }

  function openWorkout(id) {
    setWorkoutReturnView(view === 'history' ? 'history' : 'calendar')
    setScheduledId(id)
    setWorkoutExerciseId(null)
    setEditLogId(null)
    setLogShowRpe(false)
    setJustCompleted(false)
    setLogError(null)
    setView('workout')
  }

  function openLog(weId, options = {}) {
    setWorkoutExerciseId(weId)
    setEditLogId(options.editLogId ?? null)
    setLogShowRpe(Boolean(options.showRpe))
    setLogError(null)
    setView('log')
  }

  function backToCalendar() {
    setView(workoutReturnView === 'history' ? 'history' : 'calendar')
    setScheduledId(null)
    setWorkoutExerciseId(null)
    setEditLogId(null)
    setLogShowRpe(false)
    setJustCompleted(false)
    setLogError(null)
  }

  function backToWorkout() {
    setView('workout')
    setWorkoutExerciseId(null)
    setEditLogId(null)
    setLogShowRpe(false)
    setLogError(null)
  }

  function mergeUpdatedLogs(updatedRows) {
    if (!updatedRows?.length) return
    const byId = Object.fromEntries(updatedRows.map((row) => [row.id, row]))
    setLogs((prev) => prev.map((row) => byId[row.id] ?? row))
  }

  async function handleSaveLog({
    set_number,
    actual_reps,
    actual_weight,
    weight_unit,
    load_basis,
  }) {
    const scheduled = getScheduledBundle(scheduledId)
    if (!scheduled || !workoutExerciseId) return
    if (!session?.user?.id) {
      setLogError('Not signed in')
      return
    }

    setSavingLog(true)
    setLogError(null)
    try {
      const { log, completed, warning } = await saveSetLog({
        scheduledWorkoutId: scheduled.id,
        workoutExerciseId,
        setNumber: set_number,
        actualReps: actual_reps,
        actualWeight: actual_weight,
        weightUnit: weight_unit,
        loadBasis: load_basis,
        exercises: scheduled.exercises,
        existingLogs: logs,
        logSplits,
      })

      setLogs((prev) => [...prev.filter((l) => l.id !== log.id), log])
      if (warning) setLogError(warning)

      // Stay on the log screen so the optional post-exercise RPE prompt can show.
      if (completed) {
        setScheduledWorkouts((prev) =>
          prev.map((sw) =>
            sw.id === scheduled.id ? { ...sw, status: 'completed' } : sw,
          ),
        )
        setJustCompleted(true)
      }
    } catch (err) {
      console.error(err)
      setLogError(err.message || 'Could not save set — try again')
    } finally {
      setSavingLog(false)
    }
  }

  async function handleSaveCardioSteady({
    actualDurationSeconds,
    actualDistance,
    distanceUnit,
  }) {
    const scheduled = getScheduledBundle(scheduledId)
    if (!scheduled || !workoutExerciseId) return
    if (!session?.user?.id) {
      setLogError('Not signed in')
      return
    }
    setSavingLog(true)
    setLogError(null)
    try {
      const existing = logs.find(
        (l) => l.workout_exercise_id === workoutExerciseId,
      )
      const { log, completed, warning } = await saveCardioLog({
        scheduledWorkoutId: scheduled.id,
        workoutExerciseId,
        actualDurationSeconds,
        actualDistance,
        distanceUnit,
        exercises: scheduled.exercises,
        existingLogs: logs,
        logSplits,
        existingLogId: existing?.id ?? null,
      })
      setLogs((prev) => [...prev.filter((l) => l.id !== log.id), log])
      if (warning) setLogError(warning)
      if (completed) {
        setScheduledWorkouts((prev) =>
          prev.map((sw) =>
            sw.id === scheduled.id ? { ...sw, status: 'completed' } : sw,
          ),
        )
        setJustCompleted(true)
      }
    } catch (err) {
      console.error(err)
      setLogError(err.message || 'Could not save cardio — try again')
    } finally {
      setSavingLog(false)
    }
  }

  async function handleSaveIntervalSplit({
    splitNumber,
    durationSeconds,
    distance,
    distanceUnit,
  }) {
    const scheduled = getScheduledBundle(scheduledId)
    if (!scheduled || !workoutExerciseId) return
    if (!session?.user?.id) {
      setLogError('Not signed in')
      return
    }
    setSavingLog(true)
    setLogError(null)
    try {
      const existing = logs.find(
        (l) => l.workout_exercise_id === workoutExerciseId,
      )
      const {
        log,
        completed,
        warning,
        logSplits: nextSplits,
      } = await saveIntervalSplit({
        scheduledWorkoutId: scheduled.id,
        workoutExerciseId,
        splitNumber,
        distance,
        distanceUnit,
        durationSeconds,
        exercises: scheduled.exercises,
        existingLogs: logs,
        logSplits,
        parentLogId: existing?.id ?? null,
      })
      setLogs((prev) =>
        prev.some((l) => l.id === log.id) ? prev : [...prev, log],
      )
      setLogSplits(nextSplits)
      if (warning) setLogError(warning)
      if (completed) {
        setScheduledWorkouts((prev) =>
          prev.map((sw) =>
            sw.id === scheduled.id ? { ...sw, status: 'completed' } : sw,
          ),
        )
        setJustCompleted(true)
      }
    } catch (err) {
      console.error(err)
      setLogError(err.message || 'Could not save split — try again')
    } finally {
      setSavingLog(false)
    }
  }

  async function handleUpdateLog({
    log_id,
    actual_reps,
    actual_weight,
    weight_unit,
    load_basis,
  }) {
    if (!log_id) return
    if (!session?.user?.id) {
      setLogError('Not signed in')
      return
    }

    setSavingLog(true)
    setLogError(null)
    try {
      const log = await updateSetLog({
        logId: log_id,
        actualReps: actual_reps,
        actualWeight: actual_weight,
        weightUnit: weight_unit,
        loadBasis: load_basis,
      })
      mergeUpdatedLogs([log])
    } catch (err) {
      console.error(err)
      setLogError(err.message || 'Could not update set — try again')
      throw err
    } finally {
      setSavingLog(false)
    }
  }

  async function handleDeleteLog(logId) {
    const target = logs.find((l) => l.id === logId)
    if (!target) return
    if (!session?.user?.id) {
      setLogError('Not signed in')
      return
    }
    setSavingLog(true)
    setLogError(null)
    try {
      const { updated } = await deleteSetLog({
        logId,
        workoutExerciseId: target.workout_exercise_id,
      })
      const byId = Object.fromEntries(updated.map((row) => [row.id, row]))
      setLogs((prev) =>
        prev.filter((l) => l.id !== logId).map((l) => byId[l.id] ?? l),
      )
    } catch (err) {
      console.error(err)
      setLogError(err.message || 'Could not delete set — try again')
      throw err
    } finally {
      setSavingLog(false)
    }
  }

  async function handleFinishWorkout() {
    const scheduled = getScheduledBundle(scheduledId)
    if (!scheduled || finishingWorkout) return
    setFinishingWorkout(true)
    setLogError(null)
    try {
      await finishScheduledWorkout(scheduled.id)
      setScheduledWorkouts((prev) =>
        prev.map((sw) =>
          sw.id === scheduled.id ? { ...sw, status: 'completed' } : sw,
        ),
      )
      setJustCompleted(true)
    } catch (err) {
      console.error(err)
      setLogError(err.message || 'Could not finish workout — try again')
    } finally {
      setFinishingWorkout(false)
    }
  }

  async function handleSaveRpe(rpe) {
    if (!workoutExerciseId) return
    if (!session?.user?.id) {
      setLogError('Not signed in')
      return
    }
    setSavingRpe(true)
    setLogError(null)
    try {
      const updated = await updateExerciseRpe({
        workoutExerciseId,
        rpe,
      })
      mergeUpdatedLogs(updated)
    } catch (err) {
      console.error(err)
      setLogError(err.message || 'Could not save RPE — try again')
      throw err
    } finally {
      setSavingRpe(false)
    }
  }

  /**
   * Save (or clear, with an empty note and no pain) the athlete's note on one
   * exercise. The pain checkbox is also mirrored onto logs.pain_flag /
   * pain_note when sets exist, so older readers and adaptation keep working.
   * Without the exercise_notes table this falls back to the old behaviour:
   * pain notes on logs only, which needs at least one logged set.
   * Throws (with a user-facing message) so the note sheet can stay open.
   */
  async function handleSaveNote({ workoutExerciseId: weId, note, isPain }) {
    if (!weId) return
    if (!session?.user?.id) throw new Error('Not signed in')
    const text = String(note ?? '').trim()
    const pain = Boolean(isPain)
    const hasLogs = logs.some((l) => l.workout_exercise_id === weId)
    const existing = exerciseNotes.find((n) => n.workout_exercise_id === weId)

    setSavingNoteId(weId)
    setLogError(null)
    try {
      let useNotesTable = notesAvailable
      if (useNotesTable) {
        try {
          if (text) {
            const row = await saveExerciseNote({
              workoutExerciseId: weId,
              note: text,
              isPain: pain,
            })
            setExerciseNotes((prev) => [
              ...prev.filter((n) => n.workout_exercise_id !== weId),
              row,
            ])
          } else {
            if (pain && !hasLogs) {
              throw new Error('Add a few words about the pain so it can be saved.')
            }
            if (existing) {
              await deleteExerciseNote({ workoutExerciseId: weId })
              setExerciseNotes((prev) =>
                prev.filter((n) => n.workout_exercise_id !== weId),
              )
            }
          }
        } catch (err) {
          if (!isMissingNotesTable(err)) throw err
          setNotesAvailable(false)
          useNotesTable = false
        }
      }

      if (!useNotesTable) {
        if (!hasLogs) {
          throw new Error('Log a set first — notes before the first set need a database update.')
        }
        if (text && !pain) {
          throw new Error(
            'Only pain / discomfort notes can be saved until the database is updated — tick the box or clear the note.',
          )
        }
      }

      if (hasLogs) {
        const loggedPain = logs.some(
          (l) => l.workout_exercise_id === weId && l.pain_flag,
        )
        if (pain || loggedPain) {
          try {
            const updated = await updateExercisePain({
              workoutExerciseId: weId,
              painFlag: pain,
              painNote: pain ? text : null,
            })
            mergeUpdatedLogs(updated)
          } catch (err) {
            if (!useNotesTable) throw err
            console.error(err)
            throw new Error(
              'Note saved, but the pain flag on your logged sets could not be updated — try again.',
            )
          }
        }
      }
    } catch (err) {
      console.error(err)
      throw new Error(err?.message || 'Could not save note — try again')
    } finally {
      setSavingNoteId(null)
    }
  }

  async function handleDeleteNote(weId) {
    return handleSaveNote({ workoutExerciseId: weId, note: '', isPain: false })
  }

  // workout_exercise id → { exerciseId, date, … } for "last time" / PRs.
  const weIndex = useMemo(
    () => workoutExerciseIndex(scheduledWorkouts, workoutDetails),
    [scheduledWorkouts, workoutDetails],
  )

  // scheduled id → { done, total, exerciseCount } for calendar/history status.
  const progressById = useMemo(
    () =>
      buildScheduledProgress(scheduledWorkouts, workoutDetails, logs, logSplits),
    [scheduledWorkouts, workoutDetails, logs, logSplits],
  )

  // Coach demo media for the open workout — fetched lazily (one query per
  // workout), never in the global loader. Errors / missing table → no media.
  const mediaBundle =
    (view === 'workout' || view === 'log') && scheduledId != null
      ? getScheduledBundle(scheduledId)
      : null
  const { media: exerciseMedia } = useExerciseMedia(mediaBundle?.exercises, {
    enabled: Boolean(mediaBundle),
  })

  function changeTab(tab) {
    setView(tab)
    setWorkoutReturnView('calendar')
    setScheduledId(null)
    setWorkoutExerciseId(null)
    setEditLogId(null)
    setLogShowRpe(false)
    setJustCompleted(false)
  }

  // Before the loading screen: a background reload must not unmount the
  // recovery form (or its "Password updated" confirmation).
  if (passwordRecovery) {
    return (
      <AuthScreen
        key="recovery"
        mode="recovery"
        onAuthed={() => {
          setPasswordRecovery(false)
          setAuthScreenMode('login')
        }}
        onCancel={async () => {
          await handleSignOut()
          setPasswordRecovery(false)
          setAuthScreenMode('login')
        }}
      />
    )
  }

  if (bootstrapping && !submitting) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-muted">
        Loading…
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p role="alert" className="text-danger">
          {loadError}
        </p>
        {supabase ? (
          <div className="mt-6 space-y-3">
            {session?.user ? (
              <button
                type="button"
                onClick={handleRetryLoad}
                className="w-full rounded bg-orange py-3 text-sm font-medium text-on-orange hover:bg-orange-dim"
              >
                Retry
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full rounded border border-orange-dim/50 bg-surface py-3 text-sm font-medium text-ink hover:bg-surface-alt"
            >
              Sign out
            </button>
            {signOutError ? (
              <p role="alert" className="text-sm text-danger">
                {signOutError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  if (!session) {
    return (
      <AuthScreen
        key={authScreenMode}
        mode={authScreenMode}
        onAuthed={() => {
          /* session listener loads data */
        }}
      />
    )
  }

  const coachWithoutProgram =
    isCoach &&
    ['coach', 'account', 'progress', 'leaderboard', 'proposals'].includes(view)

  if (needsOnboarding && !coachWithoutProgram) {
    const form = (
      <OnboardingForm
        onSubmit={handleOnboardingSubmit}
        error={onboardingError}
        submitting={submitting}
        onSignOut={handleSignOut}
        signOutError={signOutError}
      />
    )
    if (!isCoach) return form
    return (
      <>
        <div className="pb-tab-bar">{form}</div>
        <TabBar active="calendar" onChange={changeTab} showCoach />
      </>
    )
  }

  if (view === 'week-summary' && adaptationSummary) {
    return (
      <WeekAdaptationSummary
        weekNumber={adaptationSummary.weekNumber}
        decisions={adaptationSummary.decisions}
        onDismiss={() => {
          setAdaptationSummary(null)
          setView('calendar')
        }}
      />
    )
  }

  if (view === 'proposals') {
    return (
      <ProposedSubstitutionsView onBack={() => setView('account')} />
    )
  }

  const scheduled =
    scheduledId != null ? getScheduledBundle(scheduledId) : null

  const nextWeekEligibility = canGenerateNextWeek(
    scheduledWorkouts,
    workoutsById,
    workoutDetails,
  )
  const calendarScheduled = filterScheduledForCalendar(scheduledWorkouts)

  if (view === 'log' && scheduled && workoutExerciseId) {
    const we = scheduled.exercises.find((e) => e.id === workoutExerciseId)
    if (we) {
      const existingLogs = logs.filter(
        (l) => l.workout_exercise_id === workoutExerciseId,
      )
      if (isCardioExercise(we)) {
        return (
          <LogCardio
            key={we.id}
            workoutExercise={we}
            existingLogs={existingLogs}
            logSplits={logSplits}
            onBack={backToWorkout}
            onSaveSteady={handleSaveCardioSteady}
            onSaveSplit={handleSaveIntervalSplit}
            onSaveRpe={handleSaveRpe}
            saving={savingLog}
            savingRpe={savingRpe}
            error={logError}
            initialShowRpe={logShowRpe}
          />
        )
      }
      const exerciseHistory = we.exercise_id
        ? logs.filter(
            (l) =>
              weIndex.get(l.workout_exercise_id)?.exerciseId === we.exercise_id,
          )
        : existingLogs
      return (
        <LogSet
          key={we.id}
          workoutExercise={we}
          existingLogs={existingLogs}
          exerciseHistory={exerciseHistory}
          weIndex={weIndex}
          scheduledDate={scheduled.date}
          onBack={backToWorkout}
          onSave={handleSaveLog}
          onUpdate={handleUpdateLog}
          onDelete={handleDeleteLog}
          onSaveRpe={handleSaveRpe}
          saving={savingLog}
          savingRpe={savingRpe}
          error={logError}
          initialEditLogId={editLogId}
          initialShowRpe={logShowRpe}
          headerExtras={<HowToDoIt items={exerciseMedia[we.id]} />}
        />
      )
    }
  }

  if (view === 'workout' && scheduled) {
    return (
      <WorkoutDetail
        scheduled={scheduled}
        logs={logs}
        logSplits={logSplits}
        onBack={backToCalendar}
        backLabel={workoutReturnView === 'history' ? 'History' : 'Calendar'}
        onLogExercise={openLog}
        exerciseNotes={exerciseNotes}
        onSaveNote={handleSaveNote}
        onDeleteNote={handleDeleteNote}
        savingNoteId={savingNoteId}
        onFinishWorkout={handleFinishWorkout}
        finishingWorkout={finishingWorkout}
        justCompleted={justCompleted}
        error={logError}
        renderExerciseExtras={(we) => <DemoChip items={exerciseMedia[we.id]} />}
      />
    )
  }

  const topTab =
    view === 'progress'
      ? 'progress'
      : view === 'leaderboard'
        ? 'leaderboard'
        : view === 'account'
          ? 'account'
          : view === 'coach' && isCoach
            ? 'coach'
            : 'calendar'

  return (
    <>
      <div className="pb-tab-bar">
        {view === 'progress' ? (
          <ProgressView
            scheduledWorkouts={scheduledWorkouts}
            workoutDetails={workoutDetails}
            logs={logs}
          />
        ) : view === 'leaderboard' ? (
          <LeaderboardView currentUserId={userId ?? session.user.id} />
        ) : view === 'coach' && isCoach ? (
          <CoachHome coachId={userId ?? session.user.id} />
        ) : view === 'account' ? (
          <AccountView
            email={session.user.email}
            onSignOut={handleSignOut}
            signOutError={signOutError}
            onOpenProposals={() => setView('proposals')}
          />
        ) : view === 'history' ? (
          <HistoryView
            scheduledWorkouts={scheduledWorkouts}
            progressById={progressById}
            getWorkout={getWorkout}
            onSelectScheduled={openWorkout}
            onBack={() => setView('calendar')}
          />
        ) : (
          <CalendarView
            scheduledWorkouts={scheduledWorkouts}
            upcomingWorkouts={calendarScheduled}
            progressById={progressById}
            getWorkout={getWorkout}
            onSelectScheduled={openWorkout}
            onOpenHistory={() => setView('history')}
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            canGenerateNextWeek={nextWeekEligibility.ready}
            onGenerateNextWeek={handleGenerateNextWeek}
            generatingNextWeek={generatingNextWeek}
            generateNextWeekError={nextWeekError}
          />
        )}
      </div>
      <TabBar active={topTab} onChange={changeTab} showCoach={isCoach} />
    </>
  )
}
