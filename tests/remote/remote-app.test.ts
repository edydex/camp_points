import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { REMOTE_HTML, REMOTE_JS } from '../../src/remote-server/remote-app'

type SocketListener = (event: { data?: string; code?: number }) => void

class MockWebSocket {
  static readonly OPEN = 1
  static readonly instances: MockWebSocket[] = []

  readyState = MockWebSocket.OPEN
  readonly sent: string[] = []
  private readonly listeners = new Map<string, SocketListener[]>()

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this)
  }

  addEventListener(type: string, listener: SocketListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  send(value: string): void {
    this.sent.push(value)
  }

  close(): void {
    this.readyState = 3
  }

  emit(type: string, event: { data?: string; code?: number } = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

function mountRemote(): MockWebSocket {
  const body = REMOTE_HTML.match(/<body>([\s\S]*)<\/body>/)?.[1]
  if (!body) throw new Error('Remote HTML body was not found')
  document.body.innerHTML = body
  sessionStorage.setItem('rocketFuelSessionToken', 'stale-session-token')
  new Function(REMOTE_JS)()
  const socket = MockWebSocket.instances.at(-1)
  if (!socket) throw new Error('Remote did not open a WebSocket')
  return socket
}

describe('offline remote pairing recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', MockWebSocket)
    MockWebSocket.instances.length = 0
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })

  it.each(['invalid-pin', 'pairing-expired', 'not-paired'])(
    'clears a stale session and returns to pairing after %s',
    (code) => {
      const socket = mountRemote()
      socket.emit('message', { data: JSON.stringify({ type: 'error', code, message: 'Pair again.' }) })

      expect(sessionStorage.getItem('rocketFuelSessionToken')).toBeNull()
      expect(document.getElementById('pairingPanel')).not.toHaveClass('hidden')
      expect(document.getElementById('controlPanel')).toHaveClass('hidden')
    },
  )

  it('shows replacement confirmation and discards obsolete controller authority', () => {
    const socket = mountRemote()
    socket.emit('message', {
      data: JSON.stringify({
        type: 'error',
        code: 'active-controller',
        message: 'Another phone is active.',
        canReplace: true,
      }),
    })

    expect(sessionStorage.getItem('rocketFuelSessionToken')).toBeNull()
    expect(document.getElementById('replaceButton')).not.toHaveClass('hidden')
    expect(document.getElementById('pairingPanel')).not.toHaveClass('hidden')
  })

  it('clears the replaced phone session when the server closes it', () => {
    const socket = mountRemote()
    socket.emit('close', { code: 4001 })

    expect(sessionStorage.getItem('rocketFuelSessionToken')).toBeNull()
    expect(document.getElementById('status')).toHaveTextContent('This phone was replaced')
    expect(document.getElementById('pairingPanel')).not.toHaveClass('hidden')
  })
})
