// Supabase Edge Function: delete-account
// Permanently deletes the signed-in caller's account and data (App Store
// guideline 5.1.1(v)).
//
//   POST { "confirm": "DELETE" }  with the user's JWT in Authorization
//
// 1. Verifies the caller with auth.getUser() (the anon key alone → 401).
// 2. With the service-role key (SUPABASE_SERVICE_ROLE_KEY is provided to
//    every Edge Function automatically): removes the user's files from the
//    'exercise-media' bucket — everything under '<uid>/' plus any file an
//    exercise_media row that is about to be deleted points at.
// 3. auth.admin.deleteUser(uid) — a hard delete, so the ON DELETE rules in
//    supabase/2026-11-account-deletion.sql remove the database rows.
// If any step fails the account is left in place and the caller gets an
// error; calling again is safe (already-removed files are simply skipped).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const MEDIA_BUCKET = "exercise-media"
const LIST_PAGE_SIZE = 100
const REMOVE_BATCH_SIZE = 100
const MAX_BODY_BYTES = 1_000
const MAX_FOLDER_DEPTH = 3

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

/** Error text safe to log: never a token, just the message / code. */
function describeError(err: unknown): string {
  if (!err) return "unknown error"
  if (typeof err === "string") return err
  const e = err as { message?: unknown; code?: unknown; status?: unknown }
  const parts = [e.message, e.code, e.status].filter((p) => p != null && p !== "")
  return parts.length ? parts.map(String).join(" | ") : "unknown error"
}

/** Resolve the signed-in user from the request's Authorization header. */
async function requireUser(req: Request): Promise<{ id: string } | null> {
  const authHeader = req.headers.get("Authorization") ?? ""
  const token = authHeader.replace(/^Bearer\s+/i, "").trim()
  if (!token) return null

  const url = Deno.env.get("SUPABASE_URL")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY are not available")
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  // The anon key is a valid JWT but has no user, so getUser() rejects it.
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user?.id) return null
  return { id: data.user.id }
}

async function readConfirm(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? "0")
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null
  const text = await req.text()
  if (text.length > MAX_BODY_BYTES) return null
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === "object" && typeof parsed.confirm === "string"
      ? parsed.confirm
      : null
  } catch {
    return null
  }
}

// deno-lint-ignore no-explicit-any
type Admin = any

/** Every object path under `prefix/` (paged; recurses into sub-folders). */
async function listFolder(admin: Admin, prefix: string, depth = 0): Promise<string[]> {
  const paths: string[] = []
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await admin.storage
      .from(MEDIA_BUCKET)
      .list(prefix, { limit: LIST_PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } })
    if (error) throw new Error(`list ${MEDIA_BUCKET}: ${describeError(error)}`)
    const items: { name: string; id: string | null }[] = data ?? []
    for (const item of items) {
      const path = `${prefix}/${item.name}`
      if (item.id) {
        paths.push(path)
      } else if (depth < MAX_FOLDER_DEPTH) {
        // Folders come back with id = null.
        paths.push(...(await listFolder(admin, path, depth + 1)))
      }
    }
    if (items.length < LIST_PAGE_SIZE) break
  }
  return paths
}

/**
 * Files of exercise_media rows that the account deletion will cascade away:
 * the user's own rows (as a coach) and rows any coach attached to the user's
 * own workouts. A path still used by a row that survives is left alone.
 */
async function mediaRowPaths(admin: Admin, uid: string): Promise<string[]> {
  const rowIds = new Set<string>()
  const candidates = new Set<string>()

  const own = await admin
    .from("exercise_media")
    .select("id, storage_path")
    .eq("coach_id", uid)
    .not("storage_path", "is", null)
  if (own.error) throw new Error(`exercise_media (own): ${describeError(own.error)}`)

  const onWorkouts = await admin
    .from("exercise_media")
    .select("id, storage_path, workout_exercises!inner(workouts!inner(user_id))")
    .eq("workout_exercises.workouts.user_id", uid)
    .not("storage_path", "is", null)
  if (onWorkouts.error) {
    throw new Error(`exercise_media (workouts): ${describeError(onWorkouts.error)}`)
  }

  for (const row of [...(own.data ?? []), ...(onWorkouts.data ?? [])]) {
    rowIds.add(row.id)
    candidates.add(row.storage_path)
  }
  if (candidates.size === 0) return []

  const shared = new Set<string>()
  const list = [...candidates]
  for (let i = 0; i < list.length; i += REMOVE_BATCH_SIZE) {
    const { data, error } = await admin
      .from("exercise_media")
      .select("id, storage_path")
      .in("storage_path", list.slice(i, i + REMOVE_BATCH_SIZE))
    if (error) throw new Error(`exercise_media (shared check): ${describeError(error)}`)
    for (const row of data ?? []) {
      if (!rowIds.has(row.id)) shared.add(row.storage_path)
    }
  }
  return list.filter((p) => !shared.has(p))
}

async function removeObjects(admin: Admin, paths: string[]) {
  for (let i = 0; i < paths.length; i += REMOVE_BATCH_SIZE) {
    const batch = paths.slice(i, i + REMOVE_BATCH_SIZE)
    // Paths that no longer exist are ignored by remove().
    const { error } = await admin.storage.from(MEDIA_BUCKET).remove(batch)
    if (error) throw new Error(`remove ${MEDIA_BUCKET}: ${describeError(error)}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  let user: { id: string } | null
  try {
    user = await requireUser(req)
  } catch (err) {
    console.error("delete-account: auth check misconfigured:", describeError(err))
    return jsonResponse({ error: "Server auth is not configured" }, 500)
  }
  if (!user) {
    return jsonResponse({ error: "Sign in required" }, 401)
  }

  if ((await readConfirm(req)) !== "DELETE") {
    return jsonResponse(
      { error: 'Confirmation missing: send { "confirm": "DELETE" }' },
      400,
    )
  }

  const url = Deno.env.get("SUPABASE_URL")
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !serviceKey) {
    console.error("delete-account: SUPABASE_SERVICE_ROLE_KEY is not available")
    return jsonResponse({ error: "Account deletion is not configured on the server" }, 500)
  }
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1. Storage first: once the user row is gone the exercise_media rows
  //    that point at files are gone too.
  let removed = 0
  try {
    const paths = new Set<string>([
      ...(await listFolder(admin, user.id)),
      ...(await mediaRowPaths(admin, user.id)),
    ])
    await removeObjects(admin, [...paths])
    removed = paths.size
  } catch (err) {
    console.error(`delete-account: storage cleanup failed for ${user.id}:`, describeError(err))
    return jsonResponse(
      {
        error:
          "Couldn't delete your uploaded files, so your account was not deleted. Try again in a moment.",
      },
      502,
    )
  }

  // 2. Hard delete (shouldSoftDelete = false) so the FK cascades run.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, false)
  if (deleteError) {
    console.error(`delete-account: deleteUser failed for ${user.id}:`, describeError(deleteError))
    return jsonResponse(
      { error: "Couldn't delete your account — it is still active. Try again in a moment." },
      500,
    )
  }

  console.log(`delete-account: deleted ${user.id} (${removed} storage objects)`)
  return jsonResponse({ deleted: true })
})
