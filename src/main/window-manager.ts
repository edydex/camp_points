import { BrowserWindow, screen, type Display, type Rectangle } from 'electron'
import { join } from 'node:path'

import type { DisplayInfo } from '../preload/contracts'
import { IPC } from './ipc-channels'
import { hardenWindow } from './security'

interface WindowManagerOptions {
  isDevelopment: boolean
  onChanged: () => void
  onDisplayDisconnected: (displayId: number) => void
}

interface StagePlacement {
  displayId: number
  fullscreen: boolean
}

type FullscreenTransition = 'entering' | 'leaving' | 'settling' | null

function rectangle(value: Rectangle): Rectangle {
  return { x: value.x, y: value.y, width: value.width, height: value.height }
}

function windowedStageBounds(display: Display): Rectangle {
  const availableWidth = Math.max(640, display.workArea.width - 80)
  const availableHeight = Math.max(360, display.workArea.height - 100)
  let width = Math.min(1280, availableWidth)
  let height = Math.round(width * 9 / 16)
  if (height > availableHeight) {
    height = availableHeight
    width = Math.round(height * 16 / 9)
  }
  return {
    x: display.workArea.x + Math.round((display.workArea.width - width) / 2),
    y: display.workArea.y + Math.round((display.workArea.height - height) / 2),
    width,
    height,
  }
}

export class WindowManager {
  private presenter: BrowserWindow | null = null
  private stage: BrowserWindow | null = null
  private readonly failedWindows = new Set<number>()
  private selectedDisplayId: number | null = null
  private stageActualDisplayId: number | null = null
  private stagePlacement: StagePlacement | null = null
  private stageFullscreenDesired = false
  private stageNativeFullscreen = false
  private stageFullscreenTransition: FullscreenTransition = null
  private stageRelocationTimer: ReturnType<typeof setTimeout> | null = null
  private readonly options: WindowManagerOptions
  private displayListenersInstalled = false

  constructor(options: WindowManagerOptions) {
    this.options = options
  }

  get presenterOpen(): boolean {
    return Boolean(this.presenter && !this.presenter.isDestroyed())
  }

  get stageOpen(): boolean {
    return Boolean(this.stage && !this.stage.isDestroyed())
  }

  get stageFullscreen(): boolean {
    return this.stageOpen && this.stageFullscreenDesired
  }

  get stageDisplayId(): number | null {
    return this.selectedDisplayId
  }

  get presenterWindow(): BrowserWindow | null {
    return this.presenterOpen ? this.presenter : null
  }

  roleForWebContents(webContentsId: number): 'presenter' | 'stage' | null {
    if (this.presenterOpen && this.presenter?.webContents.id === webContentsId) return 'presenter'
    if (this.stageOpen && this.stage?.webContents.id === webContentsId) return 'stage'
    return null
  }

  createPresenter(): BrowserWindow {
    if (this.presenterOpen) {
      this.presenter?.focus()
      return this.presenter as BrowserWindow
    }

    const window = new BrowserWindow({
      title: 'Rocket Fuel Camp Points — Presenter',
      width: 1440,
      height: 960,
      minWidth: 1080,
      minHeight: 700,
      show: false,
      backgroundColor: '#060b1d',
      webPreferences: this.webPreferences(),
    })
    this.presenter = window
    hardenWindow(window)
    this.installLoadFailureHandling(window, 'Presenter')
    window.once('ready-to-show', () => window.show())
    window.on('closed', () => {
      this.presenter = null
      this.options.onChanged()
    })
    void this.loadSurface(window, 'presenter').catch((error: unknown) => {
      void this.showLoadFailure(window, 'Presenter', error instanceof Error ? error.message : String(error))
    })
    this.installDisplayListeners()
    this.options.onChanged()
    return window
  }

  openStage(displayId?: number, fullscreenOverride?: boolean): BrowserWindow {
    const display = this.resolveDisplay(displayId)
    const shouldFullscreen = fullscreenOverride ?? display.id !== screen.getPrimaryDisplay().id
    this.selectedDisplayId = display.id

    if (this.stageOpen) {
      this.requestStagePlacement(display, shouldFullscreen)
      this.stage?.showInactive()
      this.presenter?.focus()
      this.emitDisplays()
      this.options.onChanged()
      return this.stage as BrowserWindow
    }

    const window = new BrowserWindow({
      title: 'Rocket Fuel Camp Points — Stage',
      ...(shouldFullscreen ? rectangle(display.bounds) : windowedStageBounds(display)),
      // A normal frame makes the Stage controllable on a one-screen laptop.
      // Native fullscreen hides it automatically on a projector.
      frame: true,
      show: false,
      fullscreenable: true,
      // A projected Stage is render-only and must never steal keyboard
      // shortcuts from the private Presenter. A laptop-windowed Stage remains
      // focusable so it can still be moved or closed normally.
      focusable: !shouldFullscreen,
      backgroundColor: '#02040f',
      webPreferences: this.webPreferences(),
    })
    this.stage = window
    this.stageActualDisplayId = display.id
    this.stagePlacement = { displayId: display.id, fullscreen: shouldFullscreen }
    this.stageFullscreenDesired = shouldFullscreen
    this.stageNativeFullscreen = false
    this.stageFullscreenTransition = null
    hardenWindow(window)
    this.installLoadFailureHandling(window, 'Stage')
    window.setMenuBarVisibility(false)
    window.once('ready-to-show', () => {
      window.showInactive()
      this.reconcileStagePlacement()
      this.presenter?.focus()
      this.options.onChanged()
    })
    window.on('enter-full-screen', () => {
      const requested = this.stageFullscreenTransition === 'entering'
      this.stageNativeFullscreen = true
      this.stageFullscreenTransition = null
      if (!requested) {
        this.stageFullscreenDesired = true
        if (this.stagePlacement) this.stagePlacement.fullscreen = true
      }
      window.setFocusable(false)
      this.presenter?.focus()
      this.reconcileStagePlacement()
      this.options.onChanged()
    })
    window.on('leave-full-screen', () => {
      const requested = this.stageFullscreenTransition === 'leaving'
      this.stageNativeFullscreen = false
      // macOS restores the pre-fullscreen window bounds just after emitting
      // this event. Defer relocation until that native Space transition has
      // settled, otherwise our target display bounds are silently overwritten.
      this.stageFullscreenTransition = 'settling'
      if (!requested) {
        this.stageFullscreenDesired = false
        if (this.stagePlacement) this.stagePlacement.fullscreen = false
      }
      this.scheduleStageReconcile()
      this.options.onChanged()
    })
    window.on('closed', () => {
      if (this.stageRelocationTimer) clearTimeout(this.stageRelocationTimer)
      this.stageRelocationTimer = null
      this.stage = null
      this.stageActualDisplayId = null
      this.stagePlacement = null
      this.stageFullscreenDesired = false
      this.stageNativeFullscreen = false
      this.stageFullscreenTransition = null
      this.options.onChanged()
    })
    void this.loadSurface(window, 'stage').catch((error: unknown) => {
      void this.showLoadFailure(window, 'Stage', error instanceof Error ? error.message : String(error))
    })
    this.installDisplayListeners()
    this.emitDisplays()
    this.options.onChanged()
    return window
  }

  closeStage(): void {
    if (!this.stageOpen) return
    this.stage?.close()
  }

  setStageFullscreen(fullscreen: boolean): void {
    if (!this.stageOpen) {
      this.openStage(this.selectedDisplayId ?? undefined, fullscreen)
      return
    }
    const display = this.resolveDisplay(this.selectedDisplayId ?? undefined)
    this.requestStagePlacement(display, fullscreen)
    this.options.onChanged()
  }

  getDisplays(): DisplayInfo[] {
    const primaryId = screen.getPrimaryDisplay().id
    return screen.getAllDisplays().map((display, index) => ({
      id: display.id,
      label: display.label || `Display ${index + 1}`,
      bounds: rectangle(display.bounds),
      workArea: rectangle(display.workArea),
      scaleFactor: display.scaleFactor,
      rotation: display.rotation,
      isPrimary: display.id === primaryId,
      isSelectedForStage: display.id === this.selectedDisplayId,
    }))
  }

  broadcast(channel: string, payload: unknown): void {
    for (const window of [this.presenter, this.stage]) {
      if (!window || window.isDestroyed() || window.webContents.isDestroyed()) continue
      window.webContents.send(channel, payload)
    }
  }

  private resolveDisplay(displayId?: number): Display {
    const displays = screen.getAllDisplays()
    const requested = displays.find((candidate) => candidate.id === displayId)
    if (requested) return requested

    const selected = displays.find((candidate) => candidate.id === this.selectedDisplayId)
    if (selected) return selected

    const external = displays.find((candidate) => candidate.id !== screen.getPrimaryDisplay().id)
    return external ?? screen.getPrimaryDisplay()
  }

  private requestStagePlacement(display: Display, fullscreen: boolean): void {
    this.selectedDisplayId = display.id
    this.stagePlacement = { displayId: display.id, fullscreen }
    this.stageFullscreenDesired = fullscreen
    this.reconcileStagePlacement()
  }

  private scheduleStageReconcile(): void {
    if (this.stageRelocationTimer) clearTimeout(this.stageRelocationTimer)
    const delay = process.platform === 'darwin' ? 250 : 0
    this.stageRelocationTimer = setTimeout(() => {
      this.stageRelocationTimer = null
      if (this.stageFullscreenTransition === 'settling') this.stageFullscreenTransition = null
      this.reconcileStagePlacement()
      this.options.onChanged()
    }, delay)
  }

  private reconcileStagePlacement(): void {
    if (!this.stageOpen || !this.stage || !this.stagePlacement) return
    if (this.stageFullscreenTransition) return

    const stage = this.stage
    const placement = this.stagePlacement
    const display = screen.getAllDisplays().find((candidate) => candidate.id === placement.displayId)
      ?? screen.getPrimaryDisplay()

    if (this.stageNativeFullscreen) {
      if (placement.fullscreen && this.stageActualDisplayId === display.id) {
        stage.setFocusable(false)
        return
      }
      this.stageFullscreenTransition = 'leaving'
      stage.setFullScreen(false)
      return
    }

    const primaryId = screen.getPrimaryDisplay().id
    stage.setFocusable(display.id === primaryId && !placement.fullscreen)
    stage.setBounds(
      placement.fullscreen ? rectangle(display.bounds) : windowedStageBounds(display),
      false,
    )
    this.stageActualDisplayId = display.id

    if (placement.fullscreen) {
      this.stageFullscreenTransition = 'entering'
      stage.setFullScreen(true)
    }
  }

  private installDisplayListeners(): void {
    if (this.displayListenersInstalled) return
    this.displayListenersInstalled = true

    screen.on('display-added', () => this.emitDisplays())
    screen.on('display-metrics-changed', (_event, changedDisplay) => {
      if (
        changedDisplay.id === this.selectedDisplayId &&
        this.stageOpen &&
        this.stage &&
        !this.stageNativeFullscreen &&
        !this.stageFullscreenTransition &&
        !this.stageFullscreenDesired
      ) {
        this.stage.setBounds(windowedStageBounds(changedDisplay), false)
      }
      this.emitDisplays()
    })
    screen.on('display-removed', (_event, removed) => {
      if (removed.id === this.selectedDisplayId) {
        const disconnectedId = removed.id
        const fallback = screen.getPrimaryDisplay()
        this.selectedDisplayId = fallback.id
        // A vanished projector falls back to a stable window so it cannot
        // cover the Presenter Console on the laptop.
        if (this.stageOpen) this.requestStagePlacement(fallback, false)
        this.options.onDisplayDisconnected(disconnectedId)
      }
      this.emitDisplays()
    })
  }

  private emitDisplays(): void {
    this.broadcast(IPC.displaysChanged, this.getDisplays())
    this.options.onChanged()
  }

  private webPreferences(): Electron.WebPreferences {
    return {
      // Sandboxed Electron preload scripts execute as CommonJS even when the
      // application package itself uses ESM.
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      devTools: this.options.isDevelopment,
    }
  }

  private installLoadFailureHandling(window: BrowserWindow, surface: 'Presenter' | 'Stage'): void {
    window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _url, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return
      void this.showLoadFailure(window, surface, `${errorDescription} (${errorCode})`)
    })
    window.webContents.on('render-process-gone', (_event, details) => {
      if (details.reason === 'clean-exit') return
      void this.showLoadFailure(window, surface, `Renderer stopped: ${details.reason}`)
    })
  }

  private async showLoadFailure(
    window: BrowserWindow,
    surface: 'Presenter' | 'Stage',
    detail: string,
  ): Promise<void> {
    if (window.isDestroyed() || this.failedWindows.has(window.id)) return
    this.failedWindows.add(window.id)
    console.error(`${surface} failed to load: ${detail}`)

    const safeDetail = detail
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
    const html = `<!doctype html><html><head><meta charset="UTF-8"><meta name="color-scheme" content="dark"><title>Rocket Fuel — ${surface} fault</title><style>html,body{min-height:100%;margin:0}body{display:grid;place-content:center;padding:8vw;background:radial-gradient(circle at 20% 10%,#15355b,#050817 52%);color:#f7f8ff;font:18px system-ui,sans-serif}main{max-width:760px}p:first-child{color:#7be8ff;font-size:13px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}h1{font-size:clamp(36px,6vw,72px);line-height:1;margin:.25em 0}code{display:block;padding:16px;border:1px solid #7d4057;border-radius:12px;background:#2c1020;color:#ffd5df;overflow-wrap:anywhere}</style></head><body><main><p>Launch system fault</p><h1>${surface} could not load.</h1><p>Your saved show is still safe. Close this window and start Rocket Fuel again.</p><code>${safeDetail}</code></main></body></html>`

    try {
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      if (!window.isVisible()) window.show()
    } catch (error) {
      console.error(`Could not display the ${surface} recovery page`, error)
    }
  }

  private async loadSurface(window: BrowserWindow, surface: 'presenter' | 'stage'): Promise<void> {
    const developmentUrl = process.env.ELECTRON_RENDERER_URL
    if (developmentUrl) {
      const base = developmentUrl.endsWith('/') ? developmentUrl : `${developmentUrl}/`
      const url = new URL(`${surface}/index.html`, base)
      await window.loadURL(url.toString())
      return
    }
    await window.loadFile(join(__dirname, `../renderer/${surface}/index.html`))
  }
}
