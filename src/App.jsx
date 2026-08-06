import { useEffect, useState, useCallback, useRef } from 'react'
import CalendarView from './components/CalendarView'
import WorkoutDetail from './components/WorkoutDetail'
import LogSet from './components/LogSet'
import OnboardingForm from './components/OnboardingForm'
import ProgressView from './components/ProgressView'
import TabBar from './components/TabBar'
import AuthScreen from './components/AuthScreen'
import AccountView from './components/AccountView'
import { supabase } from './lib/supabase'
import {
  loadProgramData,
  generateAndSaveProgram,
  GENERATE_ERROR,
} from './lib/program'
import { saveSetLog } from './lib/logging'
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

  const [scheduledWorkouts, setScheduledWorkouts] = useState([])
  const [workoutsById, setWorkoutsById] = useState({})
  const [workoutDetails, setWorkoutDetails] = useState({})
  const [userId, setUserId] = useState(null)
  const [logs, setLogs] = useState([])

  const [view, setView] = useState('calendar') // calendar | progress | account | workout | log
  const [scheduledId, setScheduledId] = useState(null)
  const [workoutExerciseId, setWorkoutExerciseId] = useState(null)
  const [savingLog, setSavingLog] = useState(false)
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
    setJustCompleted(false)
    setLogError(null)
    setView('workout')
  }

  function openLog(weId) {
    setWorkoutExerciseId(weId)
    setLogError(null)
    setView('log')
  }

  function backToCalendar() {
    setView('calendar')
    setScheduledId(null)
    setWorkoutExerciseId(null)
    setJustCompleted(false)
    setLogError(null)
  }

  function backToWorkout() {
    setView('workout')
    setWorkoutExerciseId(null)
    setLogError(null)
  }

  async function handleSaveLog({ set_number, actual_reps, actual_weight }) {
    const scheduled = getScheduledBundle(scheduledId)
    if (!scheduled || !userId || !workoutExerciseId) return

    setSavingLog(true)
    setLogError(null)
    try {
      const { log, completed } = await saveSetLog({
        userId,
        scheduledWorkoutId: scheduled.id,
        workoutExerciseId,
        setNumber: set_number,
        actualReps: actual_reps,
        actualWeight: actual_weight,
        exercises: scheduled.exercises,
        existingLogs: logs,
      })

      setLogs((prev) => [...prev, log])

      if (completed) {
        setScheduledWorkouts((prev) =>
          prev.map((sw) =>
            sw.id === scheduled.id ? { ...sw, status: 'completed' } : sw,
          ),
        )
        setJustCompleted(true)
        setView('workout')
        setWorkoutExerciseId(null)
      }
    } catch (err) {
      console.error(err)
      setLogError(err.message || 'Could not save set — try again')
    } finally {
      setSavingLog(false)
    }
  }

  if (bootstrapping && !submitting) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-stone-500">
        Loading…
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-red-700">
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

  const scheduled =
    scheduledId != null ? getScheduledBundle(scheduledId) : null

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
          saving={savingLog}
          error={logError}
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
        justCompleted={justCompleted}
      />
    )
  }

  const topTab =
    view === 'progress' ? 'progress' : view === 'account' ? 'account' : 'calendar'

  return (
    <>
      <TabBar
        active={topTab}
        onChange={(tab) => {
          setView(tab)
          setScheduledId(null)
          setWorkoutExerciseId(null)
          setJustCompleted(false)
        }}
      />
      {view === 'progress' ? (
        <ProgressView
          scheduledWorkouts={scheduledWorkouts}
          workoutDetails={workoutDetails}
          logs={logs}
        />
      ) : view === 'account' ? (
        <AccountView email={session.user.email} onSignOut={handleSignOut} />
      ) : (
        <CalendarView
          scheduledWorkouts={scheduledWorkouts}
          getWorkout={getWorkout}
          onSelectScheduled={openWorkout}
        />
      )}
    </>
  )
}
