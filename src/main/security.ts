import type { BrowserWindow, Session } from 'electron'

function contentSecurityPolicy(isDevelopment: boolean): string {
  const script = isDevelopment ? "script-src 'self' 'unsafe-eval'" : "script-src 'self'"
  const connect = isDevelopment
    ? "connect-src 'self' ws://localhost:* http://localhost:* ws://127.0.0.1:* http://127.0.0.1:*"
    : "connect-src 'self'"

  return [
    "default-src 'self'",
    script,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    connect,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

export function installSessionSecurity(session: Session, isDevelopment: boolean): void {
  const mayUseFullscreen = (url: string, permission: string): boolean => {
    if (permission !== 'fullscreen') return false
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'file:') return true
      return isDevelopment &&
        (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
    } catch {
      return false
    }
  }
  session.setPermissionCheckHandler((webContents, permission) =>
    mayUseFullscreen(webContents?.getURL() ?? '', permission),
  )
  session.setPermissionRequestHandler((webContents, permission, callback) =>
    callback(mayUseFullscreen(webContents.getURL(), permission)),
  )
  session.on('will-download', (event) => event.preventDefault())

  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy(isDevelopment)],
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'X-Content-Type-Options': ['nosniff'],
      },
    })
  })
}

export function hardenWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.webContents.on('will-navigate', (event, targetUrl) => {
    const currentUrl = window.webContents.getURL()
    if (!currentUrl || targetUrl === currentUrl) return

    try {
      const current = new URL(currentUrl)
      const target = new URL(targetUrl)
      if (
        current.protocol !== 'file:' &&
        current.protocol === target.protocol &&
        current.origin === target.origin
      ) return
    } catch {
      // Invalid or opaque URLs are never valid navigation targets.
    }
    event.preventDefault()
  })
}
