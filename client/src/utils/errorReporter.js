// Client error reporting → own-server /api/log-error (no third-party).
// Fire-and-forget: failures are swallowed, payloads are allowlisted —
// never tokens, lyrics, or user-entered text.

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'
let installed = false

export function reportClientError(error, context = {}) {
  try {
    const payload = JSON.stringify({
      message: String(error?.message || error || '').slice(0, 900),
      stack: String(error?.stack || '').slice(0, 3900),
      route: context.route || window.location.pathname,
      appVersion: context.appVersion || 'web'
    })
    const blob = new Blob([payload], { type: 'application/json' })
    if (!navigator.sendBeacon?.(`${API_BASE}/api/log-error`, blob)) {
      fetch(`${API_BASE}/api/log-error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(() => {})
    }
  } catch { /* reporting must never destabilize an already-broken path */ }
}

export function installGlobalErrorHandlers() {
  if (installed) return
  installed = true
  window.addEventListener('error', (e) => reportClientError(e.error || e.message))
  window.addEventListener('unhandledrejection', (e) =>
    reportClientError(e.reason instanceof Error ? e.reason : { message: String(e.reason) }))
}
