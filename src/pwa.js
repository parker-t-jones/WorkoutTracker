export function registerServiceWorker() {
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  // Only reload when the user asked for the update — the first install's
  // clients.claim() also fires controllerchange.
  let reloadRequested = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloadRequested) return
    reloadRequested = false
    window.location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        function offer(worker) {
          if (!worker || !navigator.serviceWorker.controller) return
          showUpdateToast(() => {
            reloadRequested = true
            worker.postMessage({ type: 'SKIP_WAITING' })
          })
        }

        if (reg.waiting) offer(reg.waiting)

        reg.addEventListener('updatefound', () => {
          const installing = reg.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed') offer(reg.waiting ?? installing)
          })
        })

        // Long-lived PWA sessions: check for a new deploy when refocused.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            reg.update().catch(() => {})
          }
        })
      })
      .catch((err) => {
        console.warn('Service worker registration failed:', err)
      })
  })
}

const TOAST_ID = 'wt-update-toast'

function showUpdateToast(onReload) {
  if (document.getElementById(TOAST_ID)) return

  const toast = document.createElement('div')
  toast.id = TOAST_ID
  toast.setAttribute('role', 'status')
  toast.className =
    'fixed inset-x-0 z-50 mx-auto flex max-w-lg items-center gap-3 px-4'
  // Sit above the fixed tab bar + iOS home indicator.
  toast.style.bottom = 'calc(4.75rem + env(safe-area-inset-bottom, 0px))'

  const inner = document.createElement('div')
  inner.className =
    'flex w-full items-center gap-3 rounded border border-orange-dim/40 bg-surface-alt px-3 py-2 text-sm text-ink shadow-lg'

  const label = document.createElement('span')
  label.className = 'flex-1'
  label.textContent = 'Update available'

  const reload = document.createElement('button')
  reload.type = 'button'
  reload.className =
    'min-h-11 rounded bg-orange px-4 text-sm font-medium text-on-orange hover:bg-orange-dim'
  reload.textContent = 'Reload'
  reload.addEventListener('click', () => {
    reload.disabled = true
    reload.textContent = 'Reloading…'
    onReload()
  })

  const dismiss = document.createElement('button')
  dismiss.type = 'button'
  dismiss.className = 'min-h-11 px-2 text-muted hover:text-ink'
  dismiss.setAttribute('aria-label', 'Dismiss')
  dismiss.textContent = '✕'
  dismiss.addEventListener('click', () => toast.remove())

  inner.append(label, reload, dismiss)
  toast.append(inner)
  document.body.append(toast)
}
