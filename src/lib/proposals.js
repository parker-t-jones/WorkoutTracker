import { supabase } from './supabase'
import { normalizeExerciseName } from './user'

function assertSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }
  return supabase
}

export const ADMIN_ONLY_MESSAGE =
  'Only an admin can approve or reject proposals.'

/** Error thrown when the signed-in user is not an admin (or RLS says no). */
export class AdminPermissionError extends Error {
  constructor(message = ADMIN_ONLY_MESSAGE) {
    super(message)
    this.name = 'AdminPermissionError'
    this.isPermissionError = true
  }
}

/**
 * Admin = app_metadata.role === 'admin' in the session JWT (set server-side,
 * see README). RLS enforces this too; the client check just fails fast and
 * avoids side effects such as creating a new exercise before the
 * substitutions insert is rejected.
 */
export async function isAdminSession() {
  const client = assertSupabase()
  const { data } = await client.auth.getSession()
  return data?.session?.user?.app_metadata?.role === 'admin'
}

async function assertAdmin() {
  if (!(await isAdminSession())) throw new AdminPermissionError()
}

/** Map RLS / "0 rows updated" failures to a readable permission error. */
function toPermissionError(error) {
  if (!error) return error
  // 42501 = insufficient_privilege / RLS violation (e.g. a stale session
  // whose JWT predates the admin grant). PGRST116 (0 rows) is NOT mapped:
  // assertAdmin() has already run, so it means the proposal was processed.
  if (error.code === '42501') {
    return new AdminPermissionError()
  }
  return error
}

export async function listPendingProposals() {
  const client = assertSupabase()
  const { data, error } = await client
    .from('proposed_substitutions')
    .select(
      `
      id,
      reason_tag,
      reasoning,
      status,
      rejection_note,
      proposed_new_exercise_name,
      created_at,
      primary_exercise_id,
      substitute_exercise_id,
      primary:exercises!proposed_substitutions_primary_exercise_id_fkey (
        id, name, movement_pattern, contraindication_tags, equipment_required
      ),
      substitute:exercises!proposed_substitutions_substitute_exercise_id_fkey (
        id, name, movement_pattern, contraindication_tags, equipment_required
      )
    `,
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function countPendingProposals() {
  const client = assertSupabase()
  const { count, error } = await client
    .from('proposed_substitutions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (error) throw error
  return count ?? 0
}

async function fetchRejectedPairings(primaryExerciseId) {
  const client = assertSupabase()
  const { data, error } = await client
    .from('proposed_substitutions')
    .select(
      `
      reason_tag,
      rejection_note,
      proposed_new_exercise_name,
      substitute:exercises!proposed_substitutions_substitute_exercise_id_fkey ( name )
    `,
    )
    .eq('primary_exercise_id', primaryExerciseId)
    .eq('status', 'rejected')

  if (error) throw error

  return (data ?? []).map((row) => ({
    substitute_name:
      row.substitute?.name ?? row.proposed_new_exercise_name ?? null,
    reason_tag: row.reason_tag,
    rejection_note: row.rejection_note,
  }))
}

async function hasOpenOrApprovedDuplicate({
  primaryExerciseId,
  substituteExerciseId,
  proposedNewName,
}) {
  const client = assertSupabase()
  let q = client
    .from('proposed_substitutions')
    .select('id')
    .eq('primary_exercise_id', primaryExerciseId)
    .in('status', ['pending', 'approved'])

  if (substituteExerciseId) {
    q = q.eq('substitute_exercise_id', substituteExerciseId)
  } else if (proposedNewName) {
    q = q.ilike('proposed_new_exercise_name', proposedNewName.trim())
  } else {
    return false
  }

  const { data, error } = await q.limit(1)
  if (error) throw error
  return (data ?? []).length > 0
}

/**
 * Ask the edge function for a proposal and insert as pending.
 * Never throws to callers that fire-and-forget — returns null on failure.
 */
export async function proposeSubstitutionForSkip({
  primary,
  equipmentAccess,
  painNote,
  exerciseNames,
}) {
  const client = assertSupabase()
  if (!primary?.exercise_id && !primary?.id) return null

  const primaryId = primary.exercise_id ?? primary.id
  const rejected = await fetchRejectedPairings(primaryId)

  const { data, error } = await client.functions.invoke('generate-program', {
    body: {
      mode: 'propose-substitution',
      equipment: equipmentAccess,
      pain_note: painNote || null,
      primary_exercise: {
        id: primaryId,
        name: primary.name,
        movement_pattern: primary.movement_pattern,
        contraindication_tags: primary.contraindication_tags ?? [],
        equipment_required: primary.equipment_required ?? null,
      },
      previously_rejected: rejected,
      exercise_names: exerciseNames ?? [],
    },
  })

  if (error) {
    console.error('propose-substitution invoke failed:', error)
    return null
  }
  if (data?.error) {
    console.error('propose-substitution error:', data.error)
    return null
  }

  const proposal = data?.proposal
  if (!proposal) return null

  let substituteId = null
  let proposedNewName = null

  if (proposal.substitute_exercise_name) {
    const want = normalizeExerciseName(proposal.substitute_exercise_name)
    const { data: matches } = await client
      .from('exercises')
      .select('id, name')
    const match = (matches ?? []).find(
      (e) => normalizeExerciseName(e.name) === want,
    )
    if (match) {
      substituteId = match.id
    } else {
      // Model returned a name not in library — treat as new exercise proposal.
      proposedNewName = proposal.substitute_exercise_name.trim()
    }
  } else if (proposal.proposed_new_exercise_name) {
    proposedNewName = proposal.proposed_new_exercise_name.trim()
  }

  if (!substituteId && !proposedNewName) return null

  // Don't propose the primary as its own substitute.
  if (substituteId && substituteId === primaryId) return null

  const dup = await hasOpenOrApprovedDuplicate({
    primaryExerciseId: primaryId,
    substituteExerciseId: substituteId,
    proposedNewName,
  })
  if (dup) return null

  // Also skip if already in live substitutions table.
  if (substituteId) {
    const { data: existingSub } = await client
      .from('substitutions')
      .select('id')
      .eq('primary_exercise_id', primaryId)
      .eq('substitute_exercise_id', substituteId)
      .maybeSingle()
    if (existingSub) return null
  }

  const { data: inserted, error: insErr } = await client
    .from('proposed_substitutions')
    .insert({
      primary_exercise_id: primaryId,
      substitute_exercise_id: substituteId,
      proposed_new_exercise_name: substituteId ? null : proposedNewName,
      reason_tag: proposal.reason_tag,
      reasoning: proposal.reasoning,
      status: 'pending',
    })
    .select()
    .single()

  if (insErr) {
    console.error('proposed_substitutions insert failed:', insErr)
    return null
  }

  return inserted
}

/** Generate proposals for each skipped decision; failures are logged, not thrown. */
export async function proposeSubstitutionsForSkippedDecisions({
  decisions,
  equipmentAccess,
  exerciseNames,
}) {
  const skipped = (decisions ?? []).filter(
    (d) => d.decision === 'skip' && (d.exercise_id || d.id),
  )
  const results = []
  for (const row of skipped) {
    try {
      const inserted = await proposeSubstitutionForSkip({
        primary: row,
        equipmentAccess,
        painNote: row.pain_note,
        exerciseNames,
      })
      if (inserted) results.push(inserted)
    } catch (err) {
      console.error('proposal for skip failed:', row.name, err)
    }
  }
  return results
}

export async function rejectProposal(proposalId, rejectionNote = null) {
  const client = assertSupabase()
  await assertAdmin()
  const { data, error } = await client
    .from('proposed_substitutions')
    .update({
      status: 'rejected',
      rejection_note: rejectionNote?.trim() || null,
    })
    .eq('id', proposalId)
    .eq('status', 'pending')
    .select()
    .single()
  if (error) throw toPermissionError(error)
  return data
}

/**
 * Approve a pending proposal into the live substitutions table.
 * Returns { proposal, substitution, createdExercise, needsMetadata }.
 */
export async function approveProposal(proposalId) {
  const client = assertSupabase()
  await assertAdmin()

  const { data: proposal, error: fetchErr } = await client
    .from('proposed_substitutions')
    .select('*')
    .eq('id', proposalId)
    .eq('status', 'pending')
    .single()

  if (fetchErr) throw fetchErr

  let substituteId = proposal.substitute_exercise_id
  let createdExercise = null
  let needsMetadata = false

  if (!substituteId && proposal.proposed_new_exercise_name) {
    // Shared catalog rows can only be created through this RPC since
    // coach_mode.sql (direct INSERT requires owner_id = auth.uid()).
    const name = proposal.proposed_new_exercise_name.trim()
    const { data: id, error: createErr } = await client.rpc(
      'ensure_shared_exercise',
      { p_name: name },
    )
    if (createErr) throw createErr

    const { data: existing, error: readErr } = await client
      .from('exercises')
      .select('*')
      .eq('id', id)
      .single()
    if (readErr) throw readErr

    substituteId = existing.id
    createdExercise = existing
    needsMetadata =
      existing.equipment_required == null ||
      !Array.isArray(existing.contraindication_tags) ||
      existing.contraindication_tags.length === 0
  }

  if (!substituteId) {
    throw new Error('Proposal has no substitute exercise to approve')
  }

  if (substituteId === proposal.primary_exercise_id) {
    throw new Error('Cannot approve a substitute that is the same exercise')
  }

  const { data: ranks } = await client
    .from('substitutions')
    .select('priority_rank')
    .eq('primary_exercise_id', proposal.primary_exercise_id)
    .order('priority_rank', { ascending: false })
    .limit(1)

  const nextRank = (ranks?.[0]?.priority_rank ?? 0) + 1

  const { data: existingLive } = await client
    .from('substitutions')
    .select('id')
    .eq('primary_exercise_id', proposal.primary_exercise_id)
    .eq('substitute_exercise_id', substituteId)
    .maybeSingle()

  let substitution = existingLive
  if (!existingLive) {
    const { data: inserted, error: subErr } = await client
      .from('substitutions')
      .insert({
        primary_exercise_id: proposal.primary_exercise_id,
        substitute_exercise_id: substituteId,
        reason_tag: proposal.reason_tag,
        priority_rank: nextRank,
      })
      .select()
      .single()
    if (subErr) throw toPermissionError(subErr)
    substitution = inserted
  }

  const { data: updated, error: updErr } = await client
    .from('proposed_substitutions')
    .update({
      status: 'approved',
      substitute_exercise_id: substituteId,
    })
    .eq('id', proposalId)
    .select()
    .single()

  if (updErr) throw toPermissionError(updErr)

  return {
    proposal: updated,
    substitution,
    createdExercise,
    needsMetadata: Boolean(createdExercise) && needsMetadata,
  }
}
