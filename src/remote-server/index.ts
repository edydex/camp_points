import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server as HttpServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'

import * as QRCode from 'qrcode'
import { WebSocket, WebSocketServer } from 'ws'

import type { CommandResult, EngineSnapshot, ShowCommand } from '../shared'
import type { RemoteStatus } from '../preload/contracts'
import { ClientMessageSchema, type ServerMessage } from './protocol'
import { REMOTE_CSS, REMOTE_HTML, REMOTE_JS } from './remote-app'

const PAIRING_LIFETIME_MS = 10 * 60 * 1000
const MAX_ACK_CACHE = 500
const MAX_MESSAGE_BYTES = 64 * 1024
const REMOTE_COMMAND_TYPES = new Set<ShowCommand['type']>([
  'score.adjust',
  'cue.execute',
  'cue.rewind',
  'history.undo',
  'history.redo',
  'team.select',
  'preset.select',
  'audio.set',
  'audio.mute',
])

interface RemoteServerOptions {
  getSnapshot: () => EngineSnapshot
  dispatchCommand: (command: ShowCommand) => Promise<CommandResult> | CommandResult
  onStatus?: (status: RemoteStatus) => void
  port?: number
  host?: string
  pairingLifetimeMs?: number
  now?: () => number
}

interface ClientContext {
  paired: boolean
  clientId: string | null
  alive: boolean
}

interface ActiveController {
  clientId: string
  label: string
  sessionToken: string
  socket: WebSocket | null
}

interface AttemptWindow {
  startedAt: number
  failures: number
  blockedUntil: number
}

export class RemoteControlServer {
  private readonly options: RemoteServerOptions
  private httpServer: HttpServer | null = null
  private wsServer: WebSocketServer | null = null
  private heartbeat: NodeJS.Timeout | null = null
  private pairingPin: string | null = null
  private pairingExpiresAt = 0
  private qrDataUrl: string | null = null
  private advertisedAddresses: string[] = []
  private active: ActiveController | null = null
  private readonly contexts = new WeakMap<WebSocket, ClientContext>()
  private readonly attempts = new Map<string, AttemptWindow>()
  private readonly ackCache = new Map<string, ServerMessage & { type: 'ack' }>()
  private lastError: string | null = null

  constructor(options: RemoteServerOptions) {
    this.options = options
  }

  async start(): Promise<RemoteStatus> {
    if (this.httpServer) return this.getStatus()
    this.refreshPinValue()

    const server = createServer((request, response) => this.handleHttp(request, response))
    const wsServer = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_MESSAGE_BYTES,
      perMessageDeflate: false,
      clientTracking: true,
    })
    this.httpServer = server
    this.wsServer = wsServer

    server.on('upgrade', (request, socket, head) => this.handleUpgrade(request, socket, head))
    wsServer.on('connection', (socket, request) => this.handleConnection(socket, request))

    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => reject(error)
        server.once('error', onError)
        server.listen(
          { host: this.options.host ?? '0.0.0.0', port: this.options.port ?? 0, exclusive: true },
          () => {
            server.off('error', onError)
            resolve()
          },
        )
      })
      const port = (server.address() as AddressInfo).port
      const lan = getLanAddresses()
      const configuredHost = this.options.host
      const hosts = configuredHost && !['0.0.0.0', '::'].includes(configuredHost)
        ? [configuredHost]
        : lan.length > 0
          ? lan
          : ['127.0.0.1']
      this.advertisedAddresses = hosts.map((address) => `http://${formatHost(address)}:${port}`)
      this.qrDataUrl = await QRCode.toDataURL(this.advertisedAddresses[0], {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 420,
      })
      this.lastError = !configuredHost && lan.length === 0
        ? 'No private LAN address was found. Connect to Wi-Fi or enable a hotspot.'
        : null
      this.startHeartbeat()
      this.emitStatus()
      return this.getStatus()
    } catch (error) {
      this.lastError = safeError(error)
      await this.stop()
      throw error
    }
  }

  async stop(): Promise<RemoteStatus> {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
    for (const socket of this.wsServer?.clients ?? []) socket.terminate()
    this.wsServer?.close()

    const server = this.httpServer
    this.httpServer = null
    this.wsServer = null
    if (server?.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    this.active = null
    this.advertisedAddresses = []
    this.qrDataUrl = null
    this.pairingPin = null
    this.pairingExpiresAt = 0
    this.emitStatus()
    return this.getStatus()
  }

  async refreshPairing(): Promise<RemoteStatus> {
    if (!this.httpServer) return this.start()
    this.refreshPinValue()
    this.attempts.clear()
    this.emitStatus()
    return this.getStatus()
  }

  publishSnapshot(snapshot: EngineSnapshot): void {
    const socket = this.active?.socket
    if (socket?.readyState === WebSocket.OPEN) this.send(socket, { type: 'snapshot', snapshot })
  }

  getStatus(): RemoteStatus {
    const address = this.httpServer?.address()
    return {
      running: Boolean(this.httpServer?.listening),
      addresses: [...this.advertisedAddresses],
      port: address && typeof address !== 'string' ? address.port : null,
      pairingPin: this.pairingPin,
      pairingExpiresAt: this.pairingExpiresAt ? new Date(this.pairingExpiresAt).toISOString() : null,
      qrDataUrl: this.qrDataUrl,
      activeClientId: this.active?.clientId ?? null,
      activeClientLabel: this.active?.label ?? null,
      connected: this.active?.socket?.readyState === WebSocket.OPEN,
      lastError: this.lastError,
    }
  }

  private handleHttp(request: IncomingMessage, response: import('node:http').ServerResponse): void {
    if (!isPrivateAddress(request.socket.remoteAddress)) {
      response.writeHead(403).end('LAN access only')
      return
    }

    const path = new URL(request.url ?? '/', 'http://remote.local').pathname
    const headers = {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { ...headers, Allow: 'GET, HEAD' }).end()
      return
    }
    if (path === '/' || path === '/index.html') {
      this.respond(response, request.method, 200, 'text/html; charset=utf-8', REMOTE_HTML, headers)
    } else if (path === '/remote.css') {
      this.respond(response, request.method, 200, 'text/css; charset=utf-8', REMOTE_CSS, headers)
    } else if (path === '/remote.js') {
      this.respond(response, request.method, 200, 'text/javascript; charset=utf-8', REMOTE_JS, headers)
    } else if (path === '/health') {
      this.respond(response, request.method, 200, 'application/json; charset=utf-8', '{"ok":true}', headers)
    } else {
      response.writeHead(404, headers).end('Not found')
    }
  }

  private respond(
    response: import('node:http').ServerResponse,
    method: string | undefined,
    status: number,
    contentType: string,
    body: string,
    headers: Record<string, string>,
  ): void {
    response.writeHead(status, {
      ...headers,
      'Content-Type': contentType,
      'Content-Length': Buffer.byteLength(body),
    })
    response.end(method === 'HEAD' ? undefined : body)
  }

  private handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const path = new URL(request.url ?? '/', 'http://remote.local').pathname
    if (
      path !== '/ws' ||
      !isPrivateAddress(request.socket.remoteAddress) ||
      !this.validOrigin(request.headers.origin, request.headers.host)
    ) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    this.wsServer?.handleUpgrade(request, socket, head, (webSocket) => {
      this.wsServer?.emit('connection', webSocket, request)
    })
  }

  private validOrigin(origin: string | undefined, host: string | undefined): boolean {
    if (!origin) return true
    try {
      const url = new URL(origin)
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        isPrivateAddress(url.hostname) &&
        Boolean(host) &&
        url.host.toLowerCase() === host?.toLowerCase()
      )
    } catch {
      return false
    }
  }

  private handleConnection(socket: WebSocket, request: IncomingMessage): void {
    const context: ClientContext = { paired: false, clientId: null, alive: true }
    this.contexts.set(socket, context)
    socket.on('pong', () => (context.alive = true))
    socket.on('message', (data, isBinary) => {
      context.alive = true
      const messageBytes = Array.isArray(data)
        ? data.reduce((total, chunk) => total + chunk.byteLength, 0)
        : data.byteLength
      if (isBinary || messageBytes > MAX_MESSAGE_BYTES) {
        this.sendError(socket, 'invalid-message', 'Only small JSON messages are accepted.')
        return
      }
      void this.handleMessage(socket, request.socket.remoteAddress ?? 'unknown', data.toString())
    })
    socket.on('close', () => {
      if (this.active?.socket === socket) {
        this.active.socket = null
        this.emitStatus()
      }
    })
    this.send(socket, {
      type: 'hello',
      pairingRequired: true,
      pairingExpiresAt: new Date(this.pairingExpiresAt).toISOString(),
      serverVersion: 1,
    })
  }

  private async handleMessage(socket: WebSocket, remoteAddress: string, source: string): Promise<void> {
    let input: unknown
    try {
      input = JSON.parse(source)
    } catch {
      this.sendError(socket, 'invalid-message', 'Message must be valid JSON.')
      return
    }
    const parsed = ClientMessageSchema.safeParse(input)
    if (!parsed.success) {
      this.sendError(socket, 'invalid-message', 'Message did not match the remote protocol.')
      return
    }
    const message = parsed.data
    const context = this.contexts.get(socket)
    if (!context) return

    if (message.type === 'ping') {
      this.send(socket, { type: 'pong', at: message.at })
      return
    }
    if (message.type === 'pair') {
      this.handlePair(socket, context, remoteAddress, message)
      return
    }
    if (!context.paired || this.active?.socket !== socket) {
      this.sendError(socket, 'not-paired', 'Pair this controller before sending commands.')
      return
    }
    if (message.type === 'snapshot.request') {
      this.send(socket, { type: 'snapshot', snapshot: this.options.getSnapshot() })
      return
    }
    if (message.id !== message.command.commandId) {
      this.sendError(socket, 'invalid-message', 'Command envelope and command IDs must match.')
      return
    }
    const cached = this.ackCache.get(message.id)
    if (cached) {
      this.send(socket, {
        ...cached,
        result: {
          ...cached.result,
          duplicate: true,
          reason: 'Command was already applied',
          snapshot: this.options.getSnapshot(),
          messages: [],
        },
      })
      return
    }
    if (!REMOTE_COMMAND_TYPES.has(message.command.type)) {
      const acknowledgement: ServerMessage & { type: 'ack' } = {
        type: 'ack',
        id: message.id,
        result: {
          accepted: false,
          duplicate: false,
          reason: 'That operation is only available in the desktop Presenter Console.',
          snapshot: this.options.getSnapshot(),
          messages: [],
        },
      }
      this.cacheAck(message.id, acknowledgement)
      this.send(socket, acknowledgement)
      return
    }
    try {
      const result = await this.options.dispatchCommand(message.command)
      const acknowledgement: ServerMessage & { type: 'ack' } = {
        type: 'ack',
        id: message.id,
        result,
      }
      this.cacheAck(message.id, acknowledgement)
      this.send(socket, acknowledgement)
    } catch {
      this.sendError(socket, 'command-failed', 'The presenter could not apply that command.')
    }
  }

  private handlePair(
    socket: WebSocket,
    context: ClientContext,
    remoteAddress: string,
    message: Extract<ReturnType<typeof ClientMessageSchema.parse>, { type: 'pair' }>,
  ): void {
    const canResume = Boolean(
      this.active &&
        message.clientId === this.active.clientId &&
        message.sessionToken &&
        secureEqual(message.sessionToken, this.active.sessionToken),
    )
    if (!canResume) {
      if (this.isRateLimited(remoteAddress)) {
        this.sendError(socket, 'rate-limited', 'Too many incorrect attempts. Wait briefly and try again.')
        return
      }
      if (this.optionsNow() >= this.pairingExpiresAt) {
        this.recordFailure(remoteAddress)
        this.sendError(socket, 'pairing-expired', 'The pairing code expired. Refresh it in the Presenter Console.')
        return
      }
      if (!message.pin || !this.pairingPin || !secureEqual(message.pin, this.pairingPin)) {
        this.recordFailure(remoteAddress)
        this.sendError(socket, 'invalid-pin', 'That pairing code is not correct.')
        return
      }
    }

    if (this.active && this.active.clientId !== message.clientId && !message.replace) {
      this.sendError(socket, 'active-controller', 'Another phone is paired. Confirm replacement to take control.', true)
      return
    }

    if (this.active?.socket && this.active.socket !== socket) {
      this.active.socket.close(4001, 'Controller replaced or reconnected')
    }
    if (!this.active || this.active.clientId !== message.clientId) {
      this.active = {
        clientId: message.clientId,
        label: message.clientLabel ?? 'Mobile controller',
        sessionToken: randomBytes(32).toString('base64url'),
        socket,
      }
    } else {
      this.active.label = message.clientLabel ?? this.active.label
      this.active.socket = socket
    }
    context.paired = true
    context.clientId = message.clientId
    this.attempts.delete(remoteAddress)
    this.send(socket, {
      type: 'paired',
      clientId: this.active.clientId,
      sessionToken: this.active.sessionToken,
      snapshot: this.options.getSnapshot(),
    })
    this.emitStatus()
  }

  private startHeartbeat(): void {
    this.heartbeat = setInterval(() => {
      for (const socket of this.wsServer?.clients ?? []) {
        const context = this.contexts.get(socket)
        if (!context) continue
        if (!context.alive) {
          socket.terminate()
          continue
        }
        context.alive = false
        socket.ping()
      }
    }, 30_000)
    this.heartbeat.unref()
  }

  private refreshPinValue(): void {
    this.pairingPin = randomInt(0, 1_000_000).toString().padStart(6, '0')
    this.pairingExpiresAt = this.optionsNow() + (this.options.pairingLifetimeMs ?? PAIRING_LIFETIME_MS)
  }

  private optionsNow(): number {
    return this.options.now?.() ?? Date.now()
  }

  private isRateLimited(address: string): boolean {
    const attempt = this.attempts.get(address)
    if (!attempt) return false
    const now = this.optionsNow()
    if (now - attempt.startedAt > 60_000 && now >= attempt.blockedUntil) {
      this.attempts.delete(address)
      return false
    }
    return now < attempt.blockedUntil
  }

  private recordFailure(address: string): void {
    const now = this.optionsNow()
    let attempt = this.attempts.get(address)
    if (!attempt || now - attempt.startedAt > 60_000) {
      attempt = { startedAt: now, failures: 0, blockedUntil: 0 }
    }
    attempt.failures += 1
    if (attempt.failures >= 5) attempt.blockedUntil = now + 30_000
    this.attempts.set(address, attempt)
  }

  private cacheAck(id: string, acknowledgement: ServerMessage & { type: 'ack' }): void {
    this.ackCache.set(id, acknowledgement)
    if (this.ackCache.size <= MAX_ACK_CACHE) return
    const oldest = this.ackCache.keys().next().value as string | undefined
    if (oldest) this.ackCache.delete(oldest)
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }

  private sendError(
    socket: WebSocket,
    code: Extract<ServerMessage, { type: 'error' }>['code'],
    message: string,
    canReplace?: boolean,
  ): void {
    this.send(socket, { type: 'error', code, message, ...(canReplace ? { canReplace } : {}) })
  }

  private emitStatus(): void {
    this.options.onStatus?.(this.getStatus())
  }
}

export function getLanAddresses(
  interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces(),
): string[] {
  const addresses = new Map<string, number>()
  for (const [interfaceName, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (
        !entry.internal &&
        isPrivateAddress(entry.address) &&
        !/^fe[89ab]/i.test(entry.address)
      ) {
        const rank = interfaceRank(interfaceName)
        addresses.set(entry.address, Math.min(rank, addresses.get(entry.address) ?? rank))
      }
    }
  }
  return [...addresses].sort(([left, leftRank], [right, rightRank]) => {
    if (leftRank !== rightRank) return leftRank - rightRank
    const leftV4 = left.includes(':') ? 1 : 0
    const rightV4 = right.includes(':') ? 1 : 0
    return leftV4 - rightV4 || left.localeCompare(right)
  }).map(([address]) => address)
}

function isPrivateAddress(input: string | undefined): boolean {
  if (!input) return false
  const address = input.replace(/^\[|\]$/g, '').replace(/^::ffff:/, '')
  if (address === 'localhost' || address === '::1' || address === '127.0.0.1') return true
  const v4 = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const octets = v4.slice(1).map(Number)
    if (octets.some((value) => value > 255)) return false
    return (
      octets[0] === 127 ||
      octets[0] === 10 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    )
  }
  const lower = address.toLowerCase()
  if (!lower.includes(':')) return false
  return lower.startsWith('fc') || lower.startsWith('fd') || /^fe[89ab]/.test(lower)
}

function interfaceRank(name: string): number {
  const normalized = name.trim().toLowerCase()
  if (/(^|\b)(utun|tun\d*|tap\d*|vpn|docker|vbox|vmnet|virbr|tailscale|zerotier|hamachi|hyper-v|vethernet|loopback)(\b|\d|$)/i.test(normalized)) return 20
  if (/^(bridge|br-|ap\d*$)/i.test(normalized)) return 15
  if (/^(en0|wi-?fi(?:\s*\d+)?|wireless(?:\s+network)?|wlan\d*|wl[a-z0-9]+|airport)$/i.test(normalized)) return 0
  if (/^(en\d+|ethernet(?:\s*\d+)?|eth\d+|eno\d+|ens\d+|enp[a-z0-9]+|lan(?:\s*\d+)?)$/i.test(normalized)) return 1
  if (/^(hotspot|internet sharing)/i.test(normalized)) return 2
  return 5
}

function formatHost(address: string): string {
  return address.includes(':') ? `[${address}]` : address
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown remote server error'
}
