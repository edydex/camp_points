import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'

import type { ImportShowRequest } from '../preload/contracts'
import { IPC } from './ipc-channels'
import type { AppRuntime } from './runtime'

const ImportShowRequestSchema = z
  .object({
    token: z.string().uuid().optional(),
    mode: z.enum(['resume', 'baseline']).optional(),
  })
  .strict()

export function registerIpc(runtime: AppRuntime): void {
  handle(IPC.snapshotGet, (event) => {
    assertAppWindow(runtime, event)
    return runtime.getSnapshot()
  })
  handle(IPC.commandDispatch, (event, command: unknown) => {
    assertPresenter(runtime, event)
    return runtime.dispatch(command, 'presenter')
  })
  handle(IPC.displaysGet, (event) => {
    assertAppWindow(runtime, event)
    return runtime.windows.getDisplays()
  })
  handle(IPC.stageOpen, (event, rawDisplayId?: unknown) => {
    assertPresenter(runtime, event)
    const displayId = optionalDisplayId(rawDisplayId)
    runtime.windows.openStage(displayId)
    return runtime.getRuntimeStatus()
  })
  handle(IPC.stageClose, (event) => {
    assertPresenter(runtime, event)
    runtime.windows.closeStage()
    return runtime.getRuntimeStatus()
  })
  handle(IPC.stageFullscreenSet, (event, fullscreen: unknown) => {
    assertPresenter(runtime, event)
    if (typeof fullscreen !== 'boolean') throw new TypeError('fullscreen must be a boolean')
    runtime.windows.setStageFullscreen(fullscreen)
    return runtime.getRuntimeStatus()
  })
  handle(IPC.showImport, (event, request?: ImportShowRequest) => {
    assertPresenter(runtime, event)
    return runtime.importShow(request === undefined ? undefined : ImportShowRequestSchema.parse(request))
  })
  handle(IPC.showExport, (event, includeCheckpoint?: unknown) => {
    assertPresenter(runtime, event)
    if (includeCheckpoint !== undefined && typeof includeCheckpoint !== 'boolean') {
      throw new TypeError('includeCheckpoint must be a boolean')
    }
    return runtime.exportShow(includeCheckpoint ?? true)
  })
  handle(IPC.remoteStart, (event) => {
    assertPresenter(runtime, event)
    return runtime.startRemote()
  })
  handle(IPC.remoteStop, (event) => {
    assertPresenter(runtime, event)
    return runtime.stopRemote()
  })
  handle(IPC.remoteRefreshPairing, (event) => {
    assertPresenter(runtime, event)
    return runtime.refreshRemotePairing()
  })
  handle(IPC.remoteStatusGet, (event) => {
    assertPresenter(runtime, event)
    return runtime.getRemoteStatus()
  })
  handle(IPC.liveSet, (event, live: unknown) => {
    assertPresenter(runtime, event)
    if (typeof live !== 'boolean') throw new TypeError('live must be a boolean')
    return runtime.setShowLive(live)
  })
  handle(IPC.rehearsalSet, (event, active: unknown) => {
    assertPresenter(runtime, event)
    if (typeof active !== 'boolean') throw new TypeError('active must be a boolean')
    return runtime.setRehearsal(active)
  })
  handle(IPC.runtimeStatusGet, (event) => {
    assertAppWindow(runtime, event)
    return runtime.getRuntimeStatus()
  })
}

function handle(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown,
): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, listener)
}

function assertAppWindow(runtime: AppRuntime, event: IpcMainInvokeEvent): void {
  if (!runtime.windows.roleForWebContents(event.sender.id)) throw new Error('IPC sender is not an application window')
}

function assertPresenter(runtime: AppRuntime, event: IpcMainInvokeEvent): void {
  if (runtime.windows.roleForWebContents(event.sender.id) !== 'presenter') {
    throw new Error('This operation is only available to the private Presenter Console')
  }
}

function optionalDisplayId(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new TypeError('displayId must be an integer')
  return value
}
