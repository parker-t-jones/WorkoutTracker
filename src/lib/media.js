import { supabase } from './supabase'

/**
 * Coach exercise demo media (supabase/2026-11-hardening.sql section 9).
 *
 * Rows in public.exercise_media are either
 *   - exercise-level  (exercise_id)          → the coach's default demo, or
 *   - workout-level   (workout_exercise_id)  → one prescribed exercise.
 * Files live in the private 'exercise-media' bucket at
 * '<coach uid>/<uuid>.<ext>' and are read through short-lived signed URLs.
 *
 * Reads never throw: if the migration hasn't been run yet (table missing) or
 * anything else fails, callers get "no media" and the error is logged.
 */

export const MEDIA_BUCKET = 'exercise-media'
// Supabase free plan caps a single upload at 50 MB (and 1 GB in total).
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
export const CAPTION_MAX = 280

const SIGNED_URL_TTL_SECONDS = 60 * 60
// Re-sign a little before expiry so a URL never dies mid-playback.
const SIGNED_URL_REFRESH_MARGIN_MS = 5 * 60 * 1000

const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}

const EXT_TO_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
}

export const ACCEPTED_MIME_TYPES = Object.keys(MIME_TO_EXT)

function assertSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env',
    )
  }
  return supabase
}

function friendlyError(err, fallback) {
  const msg = err?.message || ''
  if (/exercise_media|relation .* does not exist|schema cache/i.test(msg)) {
    return new Error(
      'Demo media isn’t set up yet — run supabase/2026-11-hardening.sql (section 9).',
    )
  }
  if (/bucket not found/i.test(msg)) {
    return new Error(
      'The exercise-media storage bucket is missing — run supabase/2026-11-hardening.sql (section 9).',
    )
  }
  if (/row-level security|violates|not authorized|unauthorized|403/i.test(msg)) {
    return new Error(
      'Not allowed — you can only add demos for your active athletes.',
    )
  }
  if (/payload too large|exceeded the maximum allowed size|413/i.test(msg)) {
    return new Error(tooBigMessage())
  }
  return new Error(msg || fallback)
}

function tooBigMessage(file) {
  const size = file ? ` (${formatBytes(file.size)})` : ''
  return `That file is too big${size}. Uploads are limited to 50 MB — for longer videos, upload to YouTube (unlisted), Vimeo or Google Drive and use “Add link” instead.`
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return ''
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function fileExtension(name) {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name || '')
  return m ? m[1].toLowerCase() : ''
}

/**
 * Validate a picked file. Returns { kind, mime, ext } or throws a friendly
 * Error. Some browsers report an empty type for HEIC/MOV, so fall back to
 * the extension.
 */
export function validateMediaFile(file) {
  if (!file) throw new Error('Choose a photo or video first.')
  let mime = (file.type || '').toLowerCase()
  if (mime === 'image/jpg') mime = 'image/jpeg'
  if (mime === 'image/heif') mime = 'image/heic'
  if (!mime || !MIME_TO_EXT[mime]) {
    const fromExt = EXT_TO_MIME[fileExtension(file.name)]
    if (fromExt && (!mime || mime === 'application/octet-stream')) mime = fromExt
  }
  if (!MIME_TO_EXT[mime]) {
    throw new Error(
      'Unsupported file type. Use a JPEG, PNG, WebP, GIF or HEIC photo, or an MP4, MOV or WebM video.',
    )
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(tooBigMessage(file))
  }
  if (file.size === 0) throw new Error('That file is empty.')
  return {
    kind: mime.startsWith('video/') ? 'video' : 'image',
    mime,
    ext: MIME_TO_EXT[mime],
  }
}

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  // Fallback for very old browsers: RFC4122-ish v4 from Math.random.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// ── Links ────────────────────────────────────────────────────────────────

const YT_ID = /^[A-Za-z0-9_-]{6,20}$/

/**
 * Parse a coach-entered link. Returns
 *   { url, provider: 'youtube' | 'vimeo' | 'other', embedUrl | null }
 * or throws if it isn't a valid https URL.
 */
export function parseExternalUrl(raw) {
  const text = (raw || '').trim()
  let u
  try {
    u = new URL(text)
  } catch {
    throw new Error('Enter a full link starting with https://')
  }
  if (u.protocol !== 'https:') {
    throw new Error('Only https:// links are supported.')
  }
  if (text.length > 2000) throw new Error('That link is too long.')

  const host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase()

  let ytId = null
  if (host === 'youtu.be') {
    ytId = u.pathname.split('/')[1] || null
  } else if (
    host === 'youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    if (u.pathname === '/watch') ytId = u.searchParams.get('v')
    else {
      const m = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(u.pathname)
      if (m) ytId = m[1]
    }
  }
  if (ytId && YT_ID.test(ytId)) {
    const start = parseYoutubeStart(u.searchParams.get('t') || u.searchParams.get('start'))
    const qs = new URLSearchParams({ rel: '0', playsinline: '1' })
    if (start) qs.set('start', String(start))
    return {
      url: u.toString(),
      provider: 'youtube',
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytId}?${qs}`,
    }
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    // vimeo.com/123, vimeo.com/123/abcdef (unlisted hash),
    // vimeo.com/channels/x/123, player.vimeo.com/video/123?h=abc
    const parts = u.pathname.split('/').filter(Boolean)
    const idx = parts.findIndex((p) => /^\d{5,12}$/.test(p))
    if (idx !== -1) {
      const id = parts[idx]
      const hash =
        u.searchParams.get('h') ||
        (parts[idx + 1] && /^[0-9a-f]{6,20}$/i.test(parts[idx + 1])
          ? parts[idx + 1]
          : null)
      const qs = new URLSearchParams({ dnt: '1' })
      if (hash) qs.set('h', hash)
      return {
        url: u.toString(),
        provider: 'vimeo',
        embedUrl: `https://player.vimeo.com/video/${id}?${qs}`,
      }
    }
  }

  return { url: u.toString(), provider: 'other', embedUrl: null }
}

function parseYoutubeStart(t) {
  if (!t) return 0
  if (/^\d+$/.test(t)) return Number(t)
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t)
  if (!m) return 0
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)
}

/** Short host label for a link button, e.g. "drive.google.com". */
export function linkHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'link'
  }
}

// ── Signed URLs (in-memory cache) ────────────────────────────────────────

const signedUrlCache = new Map() // path → { url, expiresAt }

function cachedSignedUrl(path) {
  const hit = signedUrlCache.get(path)
  if (hit && hit.expiresAt - SIGNED_URL_REFRESH_MARGIN_MS > Date.now()) {
    return hit.url
  }
  return null
}

/** Signed URL for one storage path (cached ~1h). Throws on failure. */
export async function getSignedUrl(path) {
  const cached = cachedSignedUrl(path)
  if (cached) return cached
  const client = assertSupabase()
  const { data, error } = await client.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error) throw friendlyError(error, 'Could not load media')
  signedUrlCache.set(path, {
    url: data.signedUrl,
    expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
  })
  return data.signedUrl
}

/**
 * Signed URLs for many paths in one request. Returns { [path]: url } and
 * simply omits paths that failed (logged).
 */
export async function getSignedUrls(paths) {
  const out = {}
  const missing = []
  for (const p of new Set(paths.filter(Boolean))) {
    const cached = cachedSignedUrl(p)
    if (cached) out[p] = cached
    else missing.push(p)
  }
  if (!missing.length) return out
  try {
    const client = assertSupabase()
    const { data, error } = await client.storage
      .from(MEDIA_BUCKET)
      .createSignedUrls(missing, SIGNED_URL_TTL_SECONDS)
    if (error) throw error
    const expiresAt = Date.now() + SIGNED_URL_TTL_SECONDS * 1000
    for (const row of data ?? []) {
      if (row?.signedUrl && !row.error) {
        out[row.path] = row.signedUrl
        signedUrlCache.set(row.path, { url: row.signedUrl, expiresAt })
      } else if (row) {
        console.warn('[media] could not sign', row.path, row.error)
      }
    }
  } catch (err) {
    console.warn('[media] createSignedUrls failed', err)
  }
  return out
}

export function clearSignedUrlCache() {
  signedUrlCache.clear()
}

// ── Reads ────────────────────────────────────────────────────────────────

function sortItems(a, b) {
  return (
    (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
    String(a.created_at).localeCompare(String(b.created_at)) ||
    String(a.id).localeCompare(String(b.id))
  )
}

/**
 * Media for a set of workout_exercises, in ONE query.
 *
 * Returns { [workoutExerciseId]: item[] } where each list has the items
 * attached to that workout_exercise first, then the coach's exercise-level
 * defaults for its exercise. Each item gets `scope: 'workout' | 'exercise'`.
 *
 * Athlete view: RLS already limits rows to the athlete's ACTIVE coaches.
 * Coach view: pass { coachId } to restrict to the coach's own rows.
 *
 * Never throws — errors (e.g. table not migrated yet) → {} + console.warn.
 */
export async function loadMediaForWorkoutExercises(workoutExercises, { coachId = null } = {}) {
  const list = (workoutExercises ?? []).filter((we) => we?.id)
  if (!list.length || !supabase) return {}

  const weIds = [...new Set(list.map((we) => we.id))]
  const exIds = [...new Set(list.map((we) => we.exercise_id).filter(Boolean))]

  try {
    const filters = [`workout_exercise_id.in.(${weIds.join(',')})`]
    if (exIds.length) filters.push(`exercise_id.in.(${exIds.join(',')})`)
    let query = supabase
      .from('exercise_media')
      .select(
        'id, coach_id, exercise_id, workout_exercise_id, kind, storage_path, external_url, caption, sort_order, created_at',
      )
      .or(filters.join(','))
    if (coachId) query = query.eq('coach_id', coachId)
    const { data, error } = await query
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(500)
    if (error) throw error

    const byWe = new Map()
    const byExercise = new Map()
    for (const row of data ?? []) {
      if (row.workout_exercise_id) {
        if (!byWe.has(row.workout_exercise_id)) byWe.set(row.workout_exercise_id, [])
        byWe.get(row.workout_exercise_id).push({ ...row, scope: 'workout' })
      } else if (row.exercise_id) {
        if (!byExercise.has(row.exercise_id)) byExercise.set(row.exercise_id, [])
        byExercise.get(row.exercise_id).push({ ...row, scope: 'exercise' })
      }
    }

    const out = {}
    for (const we of list) {
      const specific = (byWe.get(we.id) ?? []).slice().sort(sortItems)
      const defaults = (byExercise.get(we.exercise_id) ?? []).slice().sort(sortItems)
      const items = [...specific, ...defaults]
      if (items.length) out[we.id] = items
    }
    return out
  } catch (err) {
    console.warn('[media] could not load exercise media — treating as none', err)
    return {}
  }
}

// ── Coach writes ─────────────────────────────────────────────────────────

function targetColumns(target) {
  if (target?.workoutExerciseId) {
    return { workout_exercise_id: target.workoutExerciseId, exercise_id: null }
  }
  if (target?.exerciseId) {
    return { exercise_id: target.exerciseId, workout_exercise_id: null }
  }
  throw new Error('Pick an exercise for this demo.')
}

function cleanCaption(caption) {
  const c = (caption || '').trim()
  if (c.length > CAPTION_MAX) {
    throw new Error(`Caption must be ${CAPTION_MAX} characters or fewer.`)
  }
  return c || null
}

/**
 * Upload a photo/video and attach it.
 * target: { exerciseId } (default for every athlete) or { workoutExerciseId }.
 * If the row insert fails, the uploaded object is removed again.
 */
export async function addMediaFile({ coachId, file, target, caption = '', sortOrder = 0 }) {
  const client = assertSupabase()
  if (!coachId) throw new Error('Not signed in')
  const { kind, mime, ext } = validateMediaFile(file)
  const cols = targetColumns(target)
  const cleanedCaption = cleanCaption(caption)
  const path = `${coachId}/${randomId()}.${ext}`

  const { error: upErr } = await client.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, {
      contentType: mime,
      cacheControl: '3600',
      upsert: false,
    })
  if (upErr) throw friendlyError(upErr, 'Upload failed — try again')

  const { data, error } = await client
    .from('exercise_media')
    .insert({
      coach_id: coachId,
      ...cols,
      kind,
      storage_path: path,
      caption: cleanedCaption,
      sort_order: sortOrder,
    })
    .select()
    .single()

  if (error) {
    const { error: rmErr } = await client.storage.from(MEDIA_BUCKET).remove([path])
    if (rmErr) console.warn('[media] could not remove orphaned upload', path, rmErr)
    throw friendlyError(error, 'Could not save demo — try again')
  }
  return { ...data, scope: data.workout_exercise_id ? 'workout' : 'exercise' }
}

/** Attach a YouTube / Vimeo / other https link. */
export async function addMediaLink({ coachId, url, target, caption = '', sortOrder = 0 }) {
  const client = assertSupabase()
  if (!coachId) throw new Error('Not signed in')
  const parsed = parseExternalUrl(url)
  const cols = targetColumns(target)
  const { data, error } = await client
    .from('exercise_media')
    .insert({
      coach_id: coachId,
      ...cols,
      kind: 'link',
      external_url: parsed.url,
      caption: cleanCaption(caption),
      sort_order: sortOrder,
    })
    .select()
    .single()
  if (error) throw friendlyError(error, 'Could not save link — try again')
  return { ...data, scope: data.workout_exercise_id ? 'workout' : 'exercise' }
}

/** Update a caption (coach, own row). */
export async function updateMediaCaption(id, caption) {
  const client = assertSupabase()
  const { data, error } = await client
    .from('exercise_media')
    .update({ caption: cleanCaption(caption) })
    .eq('id', id)
    .select()
    .single()
  if (error) throw friendlyError(error, 'Could not save caption — try again')
  return data
}

/**
 * Delete a media row, then its storage object (if any). A failed object
 * removal is logged, not thrown — the row (and so the athlete's view) is
 * already gone.
 */
export async function deleteMedia(item) {
  const client = assertSupabase()
  if (!item?.id) return
  const { data, error } = await client
    .from('exercise_media')
    .delete()
    .eq('id', item.id)
    .select('id, storage_path')
  if (error) throw friendlyError(error, 'Could not delete — try again')
  if (!data?.length) {
    throw new Error('Could not delete — it may already be gone, or it isn’t yours.')
  }
  const path = data[0].storage_path || item.storage_path
  if (path) {
    signedUrlCache.delete(path)
    const { error: rmErr } = await client.storage.from(MEDIA_BUCKET).remove([path])
    if (rmErr) console.warn('[media] row deleted but file removal failed', path, rmErr)
  }
}
