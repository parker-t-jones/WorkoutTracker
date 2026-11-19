import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createLeaderboardGroup,
  fetchFamilyLeaderboard,
  fetchMyLeaderboardGroups,
  formatScorePercent,
  joinLeaderboardGroup,
  leaveLeaderboardGroup,
  rankLeaderboard,
} from '../lib/leaderboard'

function GroupsSection({ groups, loading, error, onChanged }) {
  const [code, setCode] = useState('')
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(null) // 'join' | 'create' | group id
  const [message, setMessage] = useState(null) // { type: 'ok' | 'err', text }
  const [copiedId, setCopiedId] = useState(null)

  async function run(kind, fn, okText) {
    setBusy(kind)
    setMessage(null)
    try {
      const result = await fn()
      setMessage({ type: 'ok', text: okText(result) })
      await onChanged()
      return true
    } catch (err) {
      console.error(err)
      setMessage({ type: 'err', text: err?.message || 'Something went wrong' })
      return false
    } finally {
      setBusy(null)
    }
  }

  async function handleJoin(e) {
    e.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) return
    const ok = await run('join', () => joinLeaderboardGroup(trimmed), () => 'Joined the group.')
    if (ok) setCode('')
  }

  async function handleCreate(e) {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return
    const ok = await run(
      'create',
      () => createLeaderboardGroup(trimmed),
      (joinCode) => `Group created — share code ${joinCode} so others can join.`,
    )
    if (ok) setNewName('')
  }

  async function handleLeave(group) {
    if (!window.confirm(`Leave "${group.name}"?`)) return
    await run(group.id, () => leaveLeaderboardGroup(group.id), () => `Left "${group.name}".`)
  }

  async function handleCopy(group) {
    try {
      await navigator.clipboard.writeText(group.join_code)
      setCopiedId(group.id)
      setTimeout(() => setCopiedId((id) => (id === group.id ? null : id)), 1500)
    } catch {
      setMessage({ type: 'err', text: `Couldn't copy — the code is ${group.join_code}` })
    }
  }

  const inputClass =
    'min-w-0 flex-1 rounded border border-orange-dim/50 bg-bg px-2 py-1.5 text-sm text-ink'
  const buttonClass =
    'shrink-0 rounded bg-orange px-3 py-1.5 text-xs font-medium text-on-orange disabled:opacity-60'

  return (
    <section className="mt-6 rounded border border-orange-dim/40 bg-surface px-3 py-3">
      <h2 className="font-display text-sm font-semibold">Your groups</h2>

      {loading ? (
        <p className="mt-2 text-xs text-muted">Loading…</p>
      ) : error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : groups.length === 0 ? (
        <p className="mt-2 text-xs text-muted">
          You&apos;re not in a group yet, so the leaderboard only shows you. Ask
          a family member for their 6-character join code and enter it below,
          or create a group and share its code.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {groups.map((g) => (
            <li key={g.id} className="flex items-center gap-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{g.name}</div>
                <div className="text-xs text-muted">
                  {g.member_count} {g.member_count === 1 ? 'member' : 'members'} · code{' '}
                  <span className="font-mono tracking-wider text-ink">{g.join_code}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(g)}
                className="shrink-0 rounded px-2 py-1 text-xs text-muted ring-1 ring-orange-dim/50 hover:bg-surface-alt hover:text-ink"
              >
                {copiedId === g.id ? 'Copied' : 'Copy code'}
              </button>
              <button
                type="button"
                disabled={busy === g.id}
                onClick={() => handleLeave(g)}
                className="shrink-0 rounded px-2 py-1 text-xs text-muted hover:bg-surface-alt hover:text-ink disabled:opacity-60"
              >
                Leave
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleJoin} className="mt-3 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Join code"
          maxLength={12}
          autoCapitalize="characters"
          autoComplete="off"
          aria-label="Group join code"
          className={`${inputClass} font-mono tracking-wider`}
        />
        <button type="submit" disabled={busy != null || !code.trim()} className={buttonClass}>
          {busy === 'join' ? 'Joining…' : 'Join a group'}
        </button>
      </form>

      <form onSubmit={handleCreate} className="mt-2 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New group name"
          maxLength={60}
          aria-label="New group name"
          className={inputClass}
        />
        <button type="submit" disabled={busy != null || !newName.trim()} className={buttonClass}>
          {busy === 'create' ? 'Creating…' : 'Create group'}
        </button>
      </form>

      {message ? (
        <p
          role="status"
          className={[
            'mt-2 text-xs',
            message.type === 'ok' ? 'text-success' : 'text-danger',
          ].join(' ')}
        >
          {message.text}
        </p>
      ) : null}
    </section>
  )
}

export default function LeaderboardView({ currentUserId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortBy, setSortBy] = useState('weekly') // weekly | monthly

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchFamilyLeaderboard()
      setRows(data)
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Could not load leaderboard')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  const [groups, setGroups] = useState([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [groupsError, setGroupsError] = useState(null)

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true)
    setGroupsError(null)
    try {
      setGroups(await fetchMyLeaderboardGroups())
    } catch (err) {
      console.error(err)
      setGroupsError(err?.message || 'Could not load groups')
      setGroups([])
    } finally {
      setGroupsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    loadGroups()
  }, [load, loadGroups])

  const handleGroupsChanged = useCallback(async () => {
    await Promise.all([load(), loadGroups()])
  }, [load, loadGroups])

  const ranked = useMemo(() => rankLeaderboard(rows, sortBy), [rows, sortBy])

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Leaderboard
        </h1>
        <p className="mt-1 text-sm text-muted">
          Completion scores for you and your groups — live from current
          schedules
        </p>
      </header>

      <div className="mb-4 flex gap-1">
        {[
          { id: 'weekly', label: 'This week' },
          { id: 'monthly', label: 'This month' },
        ].map((opt) => {
          const selected = sortBy === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSortBy(opt.id)}
              className={[
                'flex-1 rounded py-2 text-sm font-medium',
                selected
                  ? 'bg-orange text-on-orange'
                  : 'bg-surface text-muted ring-1 ring-orange-dim/50 hover:bg-surface-alt hover:text-ink',
              ].join(' ')}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted">Loading…</p>
      ) : error ? (
        <div className="space-y-3">
          <p
            role="alert"
            className="rounded bg-danger-bg px-3 py-3 text-sm text-danger"
          >
            {error}
          </p>
          <button
            type="button"
            onClick={load}
            className="w-full rounded border border-orange-dim/50 bg-surface py-2 text-sm font-medium text-ink hover:bg-surface-alt"
          >
            Retry
          </button>
        </div>
      ) : ranked.length === 0 ? (
        <p className="rounded border border-dashed border-orange-dim/50 bg-surface px-4 py-8 text-center text-sm text-muted">
          No family members yet.
        </p>
      ) : (
        <ol className="space-y-2">
          {ranked.map((row, index) => {
            const isYou = row.user_id === currentUserId
            const primary =
              sortBy === 'monthly' ? row.monthly_score : row.weekly_score
            return (
              <li
                key={row.user_id}
                className={[
                  'flex items-center gap-3 rounded border px-3 py-3',
                  isYou
                    ? 'border-orange bg-surface-alt'
                    : 'border-orange-dim/40 bg-surface',
                ].join(' ')}
              >
                <span className="w-6 shrink-0 text-center font-display text-sm font-semibold tabular-nums text-muted">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display font-medium">
                    {row.name}
                    {isYou ? (
                      <span className="ml-1 font-sans text-xs font-normal text-muted">
                        (you)
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-muted">
                    Week {formatScorePercent(row.weekly_score)} · Month{' '}
                    {formatScorePercent(row.monthly_score)} · Streak{' '}
                    {row.streak ?? 0}
                    {(row.streak ?? 0) === 1 ? ' wk' : ' wks'}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-display text-xl font-semibold tabular-nums">
                    {formatScorePercent(primary)}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <GroupsSection
        groups={groups}
        loading={groupsLoading}
        error={groupsError}
        onChanged={handleGroupsChanged}
      />

      <p className="mt-6 text-xs text-muted">
        Score = workout completion × 60% + exercise completion × 40%. Ties break
        on streak (consecutive weeks above 0%).
      </p>
    </div>
  )
}
