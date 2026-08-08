import { useEffect, useState, useCallback, useRef } from 'react'
import CalendarView from './components/CalendarView'
import WorkoutDetail from './components/WorkoutDetail'
import LogSet from './components/LogSet'
import OnboardingForm from './components/OnboardingForm'
import ProgressView from './components/ProgressView'
import LeaderboardView from './components/LeaderboardView'
import TabBar from './components/TabBar'
import AuthScreen from './components/AuthScreen'
import AccountView from './components/AccountView'
import WeekAdaptationSummary from './components/WeekAdaptationSummary'
import ProposedSubstitutionsView from './components/ProposedSubstitutionsView'
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
  updateExerciseRpe,
  updateExercisePain,
} from './lib/logging'
import { onAuthStateChange, signOut, ensureProfile } from './lib/auth'

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
  const [logs, setLogs] = useState([])

  const [view, setView] = useState('calendar') // calendar | progress | leaderboard | account | workout | log | week-summary | proposals
  const [scheduledId, setScheduledId] = useState(null)
  const [workoutExerciseId, setWorkoutExerciseId] = useState(null)
  const [editLogId, setEditLogId] = useState(null)
  const [logShowRpe, setLogShowRpe] = useState(false)
  const [savingLog, setSavingLog] = useState(false)
  const [savingRpe, setSavingRpe] = useState(false)
  const [savingPainId, setSavingPainId] = useState(null)
  const [logError, setLogError] = useState(null)
  const [justCompleted, setJustCompleted] = useState(false)

  const applyProgramData = useCallback((data) => {
    setUserId(data.userId)
    setScheduledWorkouts(data.scheduledWorkouts)
    setWorkoutsById(
      Object.fromEntries((data.workouts ?? []).map((w) => [w.id, w])),
    )
    setWorkoutDetails(data.workoutDetails)
    setLogs(data.logs ?? [])
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
        await ensureProfile(user)
        const data = await loadProgramData(user.id)
        applyProgramData(data)
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
        return
      }

      // Don't remount the app on token refresh — that unmounts onboarding
      // mid-generate and re-enables the submit button.
      if (event === 'TOKEN_REFRESHED') return

      if (nextSession?.user) {
        if (!submittingRef.current) setBootstrapping(true)
        // Defer DB calls — awaiting inside onAuthStateChange can deadlock the auth lock.
        setTimeout(() => {
          refreshRef.current(nextSession.user)
        }, 0)
      } else {
        setUserId(null)
        setScheduledWorkouts([])
        setWorkoutsById({})
        setWorkoutDetails({})
        setLogs([])
        setNeedsOnboarding(false)
        setView('calendar')
        setAuthScreenMode('login')
        setPasswordRecovery(false)
        setBootstrapping(false)
      }
    })

    return unsubscribe
  }, [])

  async function handleOnboardingSubmit(e) {
    e.preventDefault()
    if (submittingRef.current) return
    const user = session?.user
    if (!user?.id) return

    submittingRef.current = true
    setSubmitting(true)
    setOnboardingError(null)

    const form = new FormData(e.currentTarget)
    const answers = {
      goal: form.get('goal'),
      experience_level: form.get('experience_level'),
      days_per_week: Number(form.get('days_per_week')),
      equipment: form.get('equipment'),
      limitations: String(form.get('limitations') || '').trim(),
    }

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
    await signOut()
  }

  function getWorkout(workoutId) {
    return workoutsById[workoutId]
  }

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
    setView('calendar')
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

  async function handleSaveLog({ set_number, actual_reps, actual_weight }) {
    const scheduled = getScheduledBundle(scheduledId)
    if (!scheduled || !workoutExerciseId) return
    if (!session?.user?.id) {
      setLogError('Not signed in')
      return
    }

    setSavingLog(true)
    setLogError(null)
    try {
      const { log, completed } = await saveSetLog({
        scheduledWorkoutId: scheduled.id,
        workoutExerciseId,
        setNumber: set_number,
        actualReps: actual_reps,
        actualWeight: actual_weight,
        exercises: scheduled.exercises,
        existingLogs: logs,
      })

      setLogs((prev) => [...prev, log])

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

  async function handleUpdateLog({ log_id, actual_reps, actual_weight }) {
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

  async function handleSavePain({ workoutExerciseId: weId, painFlag, painNote }) {
    if (!weId) return
    if (!session?.user?.id) {
      setLogError('Not signed in')
      return
    }
    setSavingPainId(weId)
    setLogError(null)
    try {
      const updated = await updateExercisePain({
        workoutExerciseId: weId,
        painFlag,
        painNote,
      })
      mergeUpdatedLogs(updated)
    } catch (err) {
      console.error(err)
      setLogError(err.message || 'Could not save note — try again')
    } finally {
      setSavingPainId(null)
    }
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
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-red-300">
        {loadError}
      </div>
    )
  }

  if (passwordRecovery) {
    return (
      <AuthScreen
        key="recovery"
        mode="recovery"
        onAuthed={() => {
          setPasswordRecovery(false)
          setAuthScreenMode('login')
        }}
      />
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

  if (needsOnboarding) {
    return (
      <OnboardingForm
        onSubmit={handleOnboardingSubmit}
        error={onboardingError}
        submitting={submitting}
        onSignOut={handleSignOut}
      />
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
      return (
        <LogSet
          key={we.id}
          workoutExercise={we}
          existingLogs={existingLogs}
          onBack={backToWorkout}
          onSave={handleSaveLog}
          onUpdate={handleUpdateLog}
          onSaveRpe={handleSaveRpe}
          saving={savingLog}
          savingRpe={savingRpe}
          error={logError}
          initialEditLogId={editLogId}
          initialShowRpe={logShowRpe}
        />
      )
    }
  }

  if (view === 'workout' && scheduled) {
    return (
      <WorkoutDetail
        scheduled={scheduled}
        logs={logs}
        onBack={backToCalendar}
        onLogExercise={openLog}
        onSavePain={handleSavePain}
        savingPainId={savingPainId}
        justCompleted={justCompleted}
        error={logError}
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
          : 'calendar'

  return (
    <>
      <TabBar
        active={topTab}
        onChange={(tab) => {
          setView(tab)
          setScheduledId(null)
          setWorkoutExerciseId(null)
          setEditLogId(null)
          setLogShowRpe(false)
          setJustCompleted(false)
        }}
      />
      {view === 'progress' ? (
        <ProgressView
          scheduledWorkouts={scheduledWorkouts}
          workoutDetails={workoutDetails}
          logs={logs}
        />
      ) : view === 'leaderboard' ? (
        <LeaderboardView currentUserId={userId ?? session.user.id} />
      ) : view === 'account' ? (
        <AccountView
          email={session.user.email}
          onSignOut={handleSignOut}
          onOpenProposals={() => setView('proposals')}
        />
      ) : (
        <CalendarView
          scheduledWorkouts={calendarScheduled}
          getWorkout={getWorkout}
          onSelectScheduled={openWorkout}
          canGenerateNextWeek={nextWeekEligibility.ready}
          onGenerateNextWeek={handleGenerateNextWeek}
          generatingNextWeek={generatingNextWeek}
          generateNextWeekError={nextWeekError}
        />
      )}
    </>
  )
}
