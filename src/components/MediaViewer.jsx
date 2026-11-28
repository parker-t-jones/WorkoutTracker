import { useEffect, useState } from 'react'
import { ExternalLink, Image, LoaderCircle, Video, X } from 'lucide-react'
import { getSignedUrls, linkHost, parseExternalUrl } from '../lib/media'

/** Signed URLs for the stored items in `items` → { [storage_path]: url }. */
function useSignedUrls(items) {
  const paths = (items ?? [])
    .map((i) => i.storage_path)
    .filter(Boolean)
  const key = [...new Set(paths)].sort().join('|')
  const [state, setState] = useState({ key: '', urls: {}, loading: false })

  useEffect(() => {
    if (!key) {
      setState({ key: '', urls: {}, loading: false })
      return
    }
    let cancelled = false
    setState((prev) => ({ key, urls: prev.urls, loading: true }))
    getSignedUrls(key.split('|')).then((urls) => {
      if (!cancelled) setState({ key, urls, loading: false })
    })
    return () => {
      cancelled = true
    }
  }, [key])

  return state
}

function FullscreenImage({ src, alt, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt || 'Image'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
      }}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 rounded-full bg-black/60 p-2 text-white"
        style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
        aria-label="Close"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
      <img
        src={src}
        alt={alt || ''}
        className="max-h-full max-w-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

function Placeholder({ label }) {
  return (
    <div className="flex aspect-video w-full items-center justify-center rounded bg-surface-alt text-xs text-muted">
      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  )
}

function Unavailable({ url, kind }) {
  return (
    <div className="flex w-full flex-col items-center justify-center gap-2 rounded bg-surface-alt px-3 py-4 text-center text-xs text-muted">
      <span>
        {kind === 'video'
          ? 'This video can’t play here.'
          : 'This image can’t be shown here.'}
      </span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded border border-orange-dim/50 px-2 py-1 text-ink hover:border-orange"
        >
          Open {kind} <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      ) : null}
    </div>
  )
}

function StoredImage({ url, loading, caption }) {
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!url) {
    return loading ? <Placeholder label="Loading photo…" /> : <Unavailable kind="image" />
  }
  if (failed) return <Unavailable url={url} kind="image" />
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full overflow-hidden rounded bg-surface-alt"
        aria-label="View photo full screen"
      >
        <img
          src={url}
          alt={caption || 'Exercise demo photo'}
          loading="lazy"
          className="max-h-72 w-full object-contain"
          onError={() => setFailed(true)}
        />
      </button>
      {open ? (
        <FullscreenImage
          src={url}
          alt={caption}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}

function StoredVideo({ url, loading }) {
  const [failed, setFailed] = useState(false)
  if (!url) {
    return loading ? <Placeholder label="Loading video…" /> : <Unavailable kind="video" />
  }
  if (failed) return <Unavailable url={url} kind="video" />
  return (
    <video
      src={url}
      controls
      playsInline
      preload="metadata"
      className="max-h-80 w-full rounded bg-black"
      onError={() => setFailed(true)}
    />
  )
}

function LinkMedia({ externalUrl, caption }) {
  let parsed = null
  try {
    parsed = parseExternalUrl(externalUrl)
  } catch {
    parsed = null
  }
  if (!parsed) return null

  if (parsed.embedUrl) {
    return (
      <div className="relative w-full overflow-hidden rounded bg-black pt-[56.25%]">
        <iframe
          src={parsed.embedUrl}
          title={caption || `${parsed.provider === 'youtube' ? 'YouTube' : 'Vimeo'} demo`}
          className="absolute inset-0 h-full w-full"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    )
  }

  return (
    <a
      href={parsed.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-full items-center justify-between gap-2 rounded border border-orange-dim/50 bg-surface-alt px-3 py-2.5 text-sm text-ink hover:border-orange"
    >
      <span className="min-w-0 truncate">Open demo · {linkHost(parsed.url)}</span>
      <ExternalLink className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
    </a>
  )
}

/**
 * Shared viewer for coach demo media.
 *
 * items: exercise_media rows (optionally with scope: 'workout'|'exercise').
 * showScope: label each item "This workout" / "Default demo".
 * renderActions(item): optional node per item (e.g. coach delete button).
 */
export default function MediaViewer({ items, showScope = false, renderActions = null }) {
  const { urls, loading } = useSignedUrls(items)
  if (!items?.length) return null

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const url = item.storage_path ? urls[item.storage_path] : null
        return (
          <li key={item.id} className="space-y-1.5">
            {item.kind === 'image' ? (
              <StoredImage url={url} loading={loading} caption={item.caption} />
            ) : item.kind === 'video' ? (
              <StoredVideo url={url} loading={loading} />
            ) : (
              <LinkMedia externalUrl={item.external_url} caption={item.caption} />
            )}
            {item.caption || showScope || renderActions ? (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {item.caption ? (
                    <p className="whitespace-pre-line text-sm text-ink">
                      {item.caption}
                    </p>
                  ) : null}
                  {showScope ? (
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
                      {item.kind === 'video' ? (
                        <Video className="h-3 w-3" aria-hidden="true" />
                      ) : item.kind === 'image' ? (
                        <Image className="h-3 w-3" aria-hidden="true" />
                      ) : null}
                      {item.scope === 'exercise' || (!item.scope && item.exercise_id)
                        ? 'Default for this exercise'
                        : 'This workout only'}
                    </p>
                  ) : null}
                </div>
                {renderActions ? renderActions(item) : null}
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
