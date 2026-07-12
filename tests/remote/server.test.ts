import { once } from 'node:events'

import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'

import { ShowEngine, createDefaultShow } from '../../src/shared'
import { RemoteControlServer, getLanAddresses } from '../../src/remote-server'
import type { ServerMessage as RemoteServerMessage } from '../../src/remote-server/protocol'

class TestClient {
  readonly socket: WebSocket
  private readonly queue: RemoteServerMessage[] = []
  private readonly waiters: Array<{
    type: RemoteServerMessage['type']
    resolve: (message: RemoteServerMessage) => void
    reject: (error: Error) => void
    timer: NodeJS.Timeout
  }> = []

  private constructor(socket: WebSocket) {
    this.socket = socket
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString()) as RemoteServerMessage
      const waiterIndex = this.waiters.findIndex((waiter) => waiter.type === message.type)
      if (waiterIndex >= 0) {
        const [waiter] = this.waiters.splice(waiterIndex, 1)
        clearTimeout(waiter.timer)
        waiter.resolve(message)
      } else {
        this.queue.push(message)
      }
    })
  }

  static async connect(url: string): Promise<TestClient> {
    const socket = new WebSocket(url)
    const client = new TestClient(socket)
    await once(socket, 'open')
    return client
  }

  send(value: unknown): void {
    this.socket.send(JSON.stringify(value))
  }

  next<T extends RemoteServerMessage['type']>(type: T): Promise<Extract<RemoteServerMessage, { type: T }>> {
    const queuedIndex = this.queue.findIndex((message) => message.type === type)
    if (queuedIndex >= 0) {
      const [message] = this.queue.splice(queuedIndex, 1)
      return Promise.resolve(message as Extract<RemoteServerMessage, { type: T }>)
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.findIndex((waiter) => waiter.timer === timer)
        if (index >= 0) this.waiters.splice(index, 1)
        reject(new Error(`Timed out waiting for ${type}`))
      }, 2_000)
      this.waiters.push({
        type,
        resolve: (message) => resolve(message as Extract<RemoteServerMessage, { type: T }>),
        reject,
        timer,
      })
    })
  }

  async close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) return
    this.socket.close()
    await once(this.socket, 'close')
  }
}

describe('RemoteControlServer', () => {
  let server: RemoteControlServer | null = null
  const clients: TestClient[] = []

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      if (client.socket.readyState !== WebSocket.CLOSED) client.socket.terminate()
    }
    await server?.stop()
    server = null
  })

  async function setup() {
    const engine = new ShowEngine(createDefaultShow({ now: '2026-07-11T00:00:00.000Z' }))
    let dispatchCount = 0
    server = new RemoteControlServer({
      host: '127.0.0.1',
      port: 0,
      getSnapshot: () => engine.getSnapshot(),
      dispatchCommand: (command) => {
        dispatchCount += 1
        return engine.dispatch(command, 'remote')
      },
    })
    const status = await server.start()
    const baseUrl = `http://127.0.0.1:${status.port}`
    return { engine, status, baseUrl, dispatchCount: () => dispatchCount }
  }

  async function pairedClient(baseUrl: string, pin: string, clientId = 'controller-alpha') {
    const client = await TestClient.connect(baseUrl.replace('http:', 'ws:') + '/ws')
    clients.push(client)
    await client.next('hello')
    client.send({ type: 'pair', clientId, clientLabel: 'Test phone', pin })
    const paired = await client.next('paired')
    return { client, paired }
  }

  it('serves the offline remote with restrictive no-cache security headers', async () => {
    const { baseUrl } = await setup()
    const response = await fetch(baseUrl)
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(body).toContain('Rocket Fuel Remote')
    expect(body).not.toMatch(/https?:\/\/(?!remote\.local)/)
  })

  it('pairs, acknowledges commands, and prevents duplicate command execution', async () => {
    const { engine, status, baseUrl, dispatchCount } = await setup()
    const { client } = await pairedClient(baseUrl, status.pairingPin as string)
    const teamId = engine.getSnapshot().teams[0].id
    const commandId = 'command-score-one'
    const envelope = {
      type: 'command',
      id: commandId,
      command: { type: 'score.adjust', commandId, teamId, delta: 1 },
    }

    client.send(envelope)
    const first = await client.next('ack')
    const laterCommandId = 'command-score-later'
    client.send({
      type: 'command',
      id: laterCommandId,
      command: { type: 'score.adjust', commandId: laterCommandId, teamId, delta: 2 },
    })
    await client.next('ack')
    client.send(envelope)
    const duplicate = await client.next('ack')

    expect(first.result.accepted).toBe(true)
    expect(first.result.duplicate).toBe(false)
    expect(duplicate.result.duplicate).toBe(true)
    expect(duplicate.result.snapshot.scores[teamId]).toBe(3)
    expect(duplicate.result.messages).toEqual([])
    expect(dispatchCount()).toBe(2)
    expect(engine.getSnapshot().scores[teamId]).toBe(3)
  })

  it('reconnects the active phone with a session token and sends a fresh snapshot', async () => {
    const { engine, status, baseUrl } = await setup()
    const first = await pairedClient(baseUrl, status.pairingPin as string)
    const teamId = engine.getSnapshot().teams[0].id
    const commandId = 'command-before-reconnect'
    first.client.send({
      type: 'command',
      id: commandId,
      command: { type: 'score.adjust', commandId, teamId, delta: 3 },
    })
    await first.client.next('ack')
    await first.client.close()

    const second = await TestClient.connect(baseUrl.replace('http:', 'ws:') + '/ws')
    clients.push(second)
    await second.next('hello')
    second.send({
      type: 'pair',
      clientId: 'controller-alpha',
      clientLabel: 'Test phone',
      sessionToken: first.paired.sessionToken,
    })
    const resumed = await second.next('paired')

    expect(resumed.snapshot.scores[teamId]).toBe(3)
    expect(resumed.sessionToken).toBe(first.paired.sessionToken)
  })

  it('keeps show authoring, exact corrections, and resets desktop-only', async () => {
    const { status, baseUrl, dispatchCount } = await setup()
    const { client } = await pairedClient(baseUrl, status.pairingPin as string)
    const commandId = 'command-forbidden-reset'
    client.send({
      type: 'command',
      id: commandId,
      command: { type: 'show.reset', commandId, mode: 'zero' },
    })
    const acknowledgement = await client.next('ack')

    expect(acknowledgement.result.accepted).toBe(false)
    expect(acknowledgement.result.reason).toContain('desktop Presenter Console')
    expect(dispatchCount()).toBe(0)
  })

  it('requires explicit confirmation before replacing the active phone', async () => {
    const { status, baseUrl } = await setup()
    await pairedClient(baseUrl, status.pairingPin as string)
    const second = await TestClient.connect(baseUrl.replace('http:', 'ws:') + '/ws')
    clients.push(second)
    await second.next('hello')
    const request = {
      type: 'pair',
      clientId: 'controller-bravo',
      clientLabel: 'Second phone',
      pin: status.pairingPin,
    }

    second.send(request)
    const blocked = await second.next('error')
    expect(blocked.code).toBe('active-controller')
    expect(blocked.canReplace).toBe(true)

    second.send({ ...request, replace: true })
    const paired = await second.next('paired')
    expect(paired.clientId).toBe('controller-bravo')
    expect(server?.getStatus().activeClientId).toBe('controller-bravo')
  })
})

describe('getLanAddresses', () => {
  it('prefers ordinary Wi-Fi and Ethernet while retaining virtual fallbacks', () => {
    const interfaces = {
      utun9: [{ address: '10.200.0.2', internal: false }],
      docker0: [{ address: '172.18.0.1', internal: false }],
      bridge100: [{ address: '192.168.64.1', internal: false }],
      Thunderbolt: [{ address: '10.42.0.2', internal: false }],
      Ethernet: [{ address: '10.0.0.20', internal: false }],
      'Wi-Fi': [{ address: '192.168.1.20', internal: false }],
      public0: [{ address: '203.0.113.9', internal: false }],
      lo0: [{ address: '127.0.0.1', internal: true }],
    } as unknown as Parameters<typeof getLanAddresses>[0]

    expect(getLanAddresses(interfaces)).toEqual([
      '192.168.1.20',
      '10.0.0.20',
      '10.42.0.2',
      '192.168.64.1',
      '10.200.0.2',
      '172.18.0.1',
    ])
  })
})
