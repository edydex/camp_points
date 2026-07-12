import { app, dialog, powerSaveBlocker } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import {
  ShowCommandSchema,
  ShowEngine,
  createDefaultShow,
  type CommandResult,
  type CommandSource,
  type EngineSnapshot,
  type RocketShow,
  type ShowCommand,
  type StageMessage,
} from '../shared'
import type {
  ExportShowResult,
  ImportShowRequest,
  ImportShowResult,
  RemoteStatus,
  RuntimeStatus,
} from '../preload/contracts'
import { RemoteControlServer } from '../remote-server'
import {
  nextAnimationTimer,
  type AnimationTimerPlan,
  type TimerAction,
} from './animation-schedule'
import { IPC } from './ipc-channels'
import { ShowPersistence } from './persistence'
import { WindowManager } from './window-manager'

interface PendingImport {
  show: RocketShow
  expiresAt: number
}

export class AppRuntime {
  readonly windows: WindowManager
  /** The durable show. A rehearsal clone is never assigned here. */
  private engine: ShowEngine
  private rehearsalEngine: ShowEngine | null = null
  private readonly persistence: ShowPersistence
  private readonly remote: RemoteControlServer
  private commandQueue: Promise<void> = Promise.resolve()
  private pendingImport = new Map<string, PendingImport>()
  private isLive = false
  private powerSaveBlockerId: number | null = null
  private autosaveAvailable = false
  private lastAutosaveAt: string | null = null
  private lastError: string | null = null
  private animationTimer: NodeJS.Timeout | null = null
  private animationTimerAction: TimerAction | null = null
  private animationTimerDueAt = 0
  private suspendedTimer: AnimationTimerPlan | null = null

  private constructor(
    engine: ShowEngine,
    persistence: ShowPersistence,
    initialError: string | null,
    hadAutosave: boolean,
  ) {
    this.engine = engine
    this.persistence = persistence
    this.lastError = initialError
    this.autosaveAvailable = hadAutosave
    this.lastAutosaveAt = hadAutosave ? engine.exportShow(true).runtime?.updatedAt ?? null : null

    this.windows = new WindowManager({
      isDevelopment: !app.isPackaged,
      onChanged: () => this.emitRuntimeStatus(),
      onDisplayDisconnected: (displayId) => {
        this.lastError = `Stage display ${displayId} disconnected. The Stage was moved to the primary display.`
        this.emitRuntimeStatus()
      },
    })
    this.remote = new RemoteControlServer({
      getSnapshot: () => this.engine.getSnapshot(),
      dispatchCommand: (command) => this.dispatchRemote(command),
      onStatus: (status) => this.windows.broadcast(IPC.remoteStatusChanged, status),
    })
  }

  static async create(): Promise<AppRuntime> {
    const persistence = new ShowPersistence(app.getPath('userData'))
    let show: RocketShow | null = null
    let initialError: string | null = null
    try {
      show = await persistence.loadAutosave()
    } catch (error) {
      initialError = `The autosave could not be loaded; a new show was opened. ${safeError(error)}`
    }
    const document = show ?? createDefaultShow({ now: new Date() })
    const engine = new ShowEngine(document, { mode: show?.runtime ? 'resume' : 'baseline' })
    const runtime = new AppRuntime(engine, persistence, initialError, Boolean(show))
    runtime.rebuildAnimationTimer(runtime.getSnapshot())
    return runtime
  }

  getSnapshot(): EngineSnapshot {
    return this.activeEngine().getSnapshot()
  }

  dispatch(rawCommand: unknown, source: CommandSource = 'presenter'): Promise<CommandResult> {
    const parsed = ShowCommandSchema.safeParse(rawCommand)
    if (!parsed.success) {
      return Promise.resolve({
        accepted: false,
        duplicate: false,
        reason: 'Command did not match the supported command schema.',
        snapshot: this.activeEngine().getSnapshot(),
        messages: [],
      })
    }

    return this.enqueue(async () => {
      const target = this.activeEngine()
      const result = target.dispatch(parsed.data, source)
      if (result.accepted) {
        // Publish and arm visual timing immediately. Autosave is still awaited
        // before the command resolves, but a slow disk must not consume the
        // first seconds of an audience-facing countdown behind a frozen UI.
        this.publishResult(result, !this.rehearsalEngine)
        this.coordinateAnimation(parsed.data, result)
        if (!this.rehearsalEngine) {
          await this.autosave()
          // publishResult now intentionally precedes disk I/O so animation can
          // start on time. Emit once more after persistence so Presenter shows
          // the new durable-save timestamp instead of lagging one transaction.
          this.emitRuntimeStatus()
        }
      }
      return result
    })
  }

  async importShow(request: ImportShowRequest = {}): Promise<ImportShowResult> {
    if (request.token) {
      const pending = this.pendingImport.get(request.token)
      this.pendingImport.delete(request.token)
      if (!pending || pending.expiresAt < Date.now()) throw new Error('That import choice expired. Choose the file again.')
      if (!request.mode) throw new Error('Choose whether to resume or replay the imported show.')
      return this.activateImportedShow(pending.show, request.mode)
    }

    const options: Electron.OpenDialogOptions = {
      title: 'Import Rocket Fuel Show',
      properties: ['openFile'],
      filters: [
        { name: 'Rocket Fuel Show', extensions: ['rocketshow'] },
        { name: 'JSON', extensions: ['json'] },
      ],
    }
    const parent = this.windows.presenterWindow
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return { status: 'cancelled' }
    const show = await this.persistence.readShow(result.filePaths[0])
    if (show.runtime && !request.mode) {
      const token = randomUUID()
      this.prunePendingImports()
      this.pendingImport.set(token, { show, expiresAt: Date.now() + 5 * 60 * 1000 })
      return {
        status: 'needs-mode',
        token,
        title: show.title,
        updatedAt: show.runtime.updatedAt,
        teamCount: show.teams.length,
      }
    }
    return this.activateImportedShow(show, request.mode ?? 'baseline')
  }

  async exportShow(includeCheckpoint = true): Promise<ExportShowResult> {
    const show = this.engine.exportShow(includeCheckpoint)
    const filename = `${safeFilename(show.title) || 'rocket-fuel-show'}.rocketshow`
    const options: Electron.SaveDialogOptions = {
      title: 'Export Rocket Fuel Show',
      defaultPath: join(app.getPath('documents'), filename),
      filters: [{ name: 'Rocket Fuel Show', extensions: ['rocketshow'] }],
    }
    const parent = this.windows.presenterWindow
    const result = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { status: 'cancelled' }
    await this.persistence.writeShow(result.filePath, show)
    return { status: 'exported', path: ensureRocketShowExtension(result.filePath) }
  }

  async startRemote(): Promise<RemoteStatus> {
    return this.remote.start()
  }

  async stopRemote(): Promise<RemoteStatus> {
    return this.remote.stop()
  }

  async refreshRemotePairing(): Promise<RemoteStatus> {
    return this.remote.refreshPairing()
  }

  getRemoteStatus(): RemoteStatus {
    return this.remote.getStatus()
  }

  setShowLive(live: boolean): RuntimeStatus {
    this.isLive = live
    if (live && this.powerSaveBlockerId === null) {
      this.powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep')
    } else if (!live && this.powerSaveBlockerId !== null) {
      if (powerSaveBlocker.isStarted(this.powerSaveBlockerId)) powerSaveBlocker.stop(this.powerSaveBlockerId)
      this.powerSaveBlockerId = null
    }
    this.emitRuntimeStatus()
    return this.getRuntimeStatus()
  }

  setRehearsal(active: boolean): RuntimeStatus {
    if (active === Boolean(this.rehearsalEngine)) return this.getRuntimeStatus()
    this.cancelAnimationTimer()
    if (active) {
      if (this.engine.getSnapshot().animation.status !== 'idle') {
        throw new Error('Finish or skip the live animation before entering rehearsal.')
      }
      this.rehearsalEngine = this.engine.cloneForRehearsal()
    } else {
      this.rehearsalEngine = null
    }
    const snapshot = this.getSnapshot()
    this.broadcastSnapshot(snapshot)
    this.rebuildAnimationTimer(snapshot)
    this.emitRuntimeStatus()
    return this.getRuntimeStatus()
  }

  getRuntimeStatus(): RuntimeStatus {
    return {
      isLive: this.isLive,
      isRehearsal: Boolean(this.rehearsalEngine),
      presenterOpen: this.windows.presenterOpen,
      stageOpen: this.windows.stageOpen,
      stageFullscreen: this.windows.stageFullscreen,
      selectedDisplayId: this.windows.stageDisplayId,
      powerSaveBlocked: this.powerSaveBlockerId !== null && powerSaveBlocker.isStarted(this.powerSaveBlockerId),
      autosaveAvailable: this.autosaveAvailable,
      lastAutosaveAt: this.lastAutosaveAt,
      lastError: this.lastError,
    }
  }

  async shutdown(): Promise<void> {
    this.cancelAnimationTimer()
    await this.remote.stop()
    this.setShowLive(false)
  }

  private async activateImportedShow(show: RocketShow, mode: 'resume' | 'baseline'): Promise<ImportShowResult> {
    return this.enqueue(async () => {
      this.cancelAnimationTimer()
      this.rehearsalEngine = null
      this.engine = new ShowEngine(show, { mode })
      await this.autosave()
      const snapshot = this.engine.getSnapshot()
      this.broadcastSnapshot(snapshot)
      this.remote.publishSnapshot(snapshot)
      this.rebuildAnimationTimer(snapshot)
      this.emitRuntimeStatus()
      return { status: 'imported', snapshot }
    })
  }

  private publishResult(result: CommandResult, publishToRemote: boolean): void {
    const snapshot = result.snapshot
    // Stage receives transient events before the settled snapshot so ordered
    // score/finale motion cannot be bypassed by the React snapshot channel.
    for (const message of result.messages) this.windows.broadcast(IPC.stageMessage, message)
    this.windows.broadcast(IPC.snapshotChanged, snapshot)
    if (publishToRemote) this.remote.publishSnapshot(snapshot)
    this.emitRuntimeStatus()
  }

  private broadcastSnapshot(snapshot: EngineSnapshot): void {
    const snapshotMessage: StageMessage = { type: 'snapshot', snapshot }
    this.windows.broadcast(IPC.snapshotChanged, snapshot)
    this.windows.broadcast(IPC.stageMessage, snapshotMessage)
  }

  private activeEngine(): ShowEngine {
    return this.rehearsalEngine ?? this.engine
  }

  private dispatchRemote(command: ShowCommand): Promise<CommandResult> {
    if (this.rehearsalEngine) {
      return Promise.resolve({
        accepted: false,
        duplicate: false,
        reason: 'The phone remote is read-only while the desktop is rehearsing.',
        snapshot: this.engine.getSnapshot(),
        messages: [],
      })
    }
    return this.dispatch(command, 'remote')
  }

  private coordinateAnimation(
    command: ShowCommand,
    result: CommandResult,
  ): void {
    if (result.duplicate) return

    switch (command.type) {
      case 'cue.execute':
      case 'finale.start':
      case 'finale.replay':
        this.rebuildAnimationTimer(result.snapshot)
        return
      case 'animation.pause':
      case 'finale.pause':
        if (
          result.snapshot.animation.sequenceType === 'finale' &&
          result.snapshot.finale.pausedFrom === 'countdown'
        ) {
          // Finale state carries its own paused countdown budget. Rebuild from
          // that value instead of sampling the old Node timer a few IPC/
          // autosave milliseconds later, which could make Stage and launch
          // disagree at the final second.
          this.rebuildAnimationTimer(result.snapshot)
          return
        }
        if (this.animationTimer) this.suspendAnimationTimer()
        else this.rebuildAnimationTimer(result.snapshot)
        return
      case 'animation.resume':
      case 'finale.resume':
        if (
          result.snapshot.animation.sequenceType === 'finale' &&
          result.snapshot.finale.status === 'countdown'
        ) {
          this.rebuildAnimationTimer(result.snapshot)
          return
        }
        if (this.suspendedTimer) this.resumeAnimationTimer()
        else this.rebuildAnimationTimer(result.snapshot)
        return
      case 'finale.skip':
        this.rebuildAnimationTimer(result.snapshot)
        return
      case 'animation.skip':
      case 'animation.complete':
      case 'finale.cancel':
      case 'cue.rewind':
      case 'history.undo':
      case 'history.redo':
      case 'teams.replace':
      case 'cues.replace':
      case 'show.reset':
        this.cancelAnimationTimer()
        return
      case 'show.update':
        // Theme, display, audio, title, and compatible gauge edits preserve
        // the in-flight sequence and its remaining authoritative timer.
        return
      default:
        return
    }
  }

  private rebuildAnimationTimer(snapshot: EngineSnapshot): void {
    this.cancelAnimationTimer()
    if (snapshot.animation.status === 'idle') return

    const next = nextAnimationTimer(snapshot)
    if (!next) return
    if (snapshot.animation.status === 'paused' || snapshot.finale.status === 'paused') {
      this.suspendedTimer = next
      return
    }
    this.scheduleAnimationTimer(next.action, next.remainingMs)
  }

  private scheduleAnimationTimer(action: TimerAction, delayMs: number): void {
    this.cancelAnimationTimer()
    const duration = Math.max(0, Math.trunc(delayMs))
    this.animationTimerAction = action
    this.animationTimerDueAt = Date.now() + duration
    this.animationTimer = setTimeout(() => {
      this.animationTimer = null
      this.animationTimerAction = null
      this.animationTimerDueAt = 0
      const command: ShowCommand = action === 'animation.complete'
        ? { type: 'animation.complete', commandId: systemCommandId(action) }
        : { type: 'finale.skip', commandId: systemCommandId(action) }
      void this.dispatch(command, 'system').catch((error) => {
        this.lastError = `Animation coordinator failed: ${safeError(error)}`
        this.emitRuntimeStatus()
      })
    }, duration)
    this.animationTimer.unref()
  }

  private suspendAnimationTimer(): void {
    if (!this.animationTimer || !this.animationTimerAction) return
    const suspended: AnimationTimerPlan = {
      action: this.animationTimerAction,
      remainingMs: Math.max(0, this.animationTimerDueAt - Date.now()),
    }
    this.cancelAnimationTimer()
    this.suspendedTimer = suspended
  }

  private resumeAnimationTimer(): void {
    const suspended = this.suspendedTimer
    if (!suspended) return
    this.suspendedTimer = null
    this.scheduleAnimationTimer(suspended.action, suspended.remainingMs)
  }

  private cancelAnimationTimer(): void {
    if (this.animationTimer) clearTimeout(this.animationTimer)
    this.animationTimer = null
    this.animationTimerAction = null
    this.animationTimerDueAt = 0
    this.suspendedTimer = null
  }

  private async autosave(): Promise<void> {
    try {
      const show = this.engine.exportShow(true)
      await this.persistence.saveAutosave(show)
      this.autosaveAvailable = true
      this.lastAutosaveAt = show.runtime?.updatedAt ?? new Date().toISOString()
      this.lastError = null
    } catch (error) {
      this.lastError = `Autosave failed: ${safeError(error)}`
      this.emitRuntimeStatus()
    }
  }

  private emitRuntimeStatus(): void {
    this.windows.broadcast(IPC.runtimeStatusChanged, this.getRuntimeStatus())
  }

  private enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = this.commandQueue.then(operation, operation)
    this.commandQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private prunePendingImports(): void {
    const now = Date.now()
    for (const [token, pending] of this.pendingImport) {
      if (pending.expiresAt < now) this.pendingImport.delete(token)
    }
  }
}

function systemCommandId(action: TimerAction): string {
  return `system-${action}-${randomUUID()}`
}

function safeFilename(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/\.+$/g, '')
    .slice(0, 80)
}

function ensureRocketShowExtension(path: string): string {
  return path.toLowerCase().endsWith('.rocketshow') ? path : `${path}.rocketshow`
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}
