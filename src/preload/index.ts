import { contextBridge, ipcRenderer } from 'electron'

import { IPC } from '../main/ipc-channels'
import type {
  DisplayInfo,
  ImportShowRequest,
  RemoteStatus,
  RocketFuelApi,
  RuntimeStatus,
} from './contracts'
import type {
  EngineSnapshot,
  ShowCommand,
  StageMessage,
} from '../shared'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: RocketFuelApi = Object.freeze({
  getSnapshot: () => ipcRenderer.invoke(IPC.snapshotGet),
  dispatch: (command: ShowCommand) => ipcRenderer.invoke(IPC.commandDispatch, command),
  subscribeSnapshot: (listener: (snapshot: EngineSnapshot) => void) =>
    subscribe(IPC.snapshotChanged, listener),
  subscribeStageEvent: (listener: (message: StageMessage) => void) =>
    subscribe(IPC.stageMessage, listener),

  getDisplays: () => ipcRenderer.invoke(IPC.displaysGet),
  subscribeDisplays: (listener: (displays: DisplayInfo[]) => void) =>
    subscribe(IPC.displaysChanged, listener),
  openStage: (displayId?: number) => ipcRenderer.invoke(IPC.stageOpen, displayId),
  closeStage: () => ipcRenderer.invoke(IPC.stageClose),
  setStageFullscreen: (fullscreen: boolean) =>
    ipcRenderer.invoke(IPC.stageFullscreenSet, fullscreen),

  importShow: (request?: ImportShowRequest) => ipcRenderer.invoke(IPC.showImport, request),
  exportShow: (includeCheckpoint = true) =>
    ipcRenderer.invoke(IPC.showExport, includeCheckpoint),

  startRemote: () => ipcRenderer.invoke(IPC.remoteStart),
  stopRemote: () => ipcRenderer.invoke(IPC.remoteStop),
  refreshRemotePairing: () => ipcRenderer.invoke(IPC.remoteRefreshPairing),
  getRemoteStatus: () => ipcRenderer.invoke(IPC.remoteStatusGet),
  subscribeRemoteStatus: (listener: (status: RemoteStatus) => void) =>
    subscribe(IPC.remoteStatusChanged, listener),

  setShowLive: (live: boolean) => ipcRenderer.invoke(IPC.liveSet, live),
  setRehearsal: (active: boolean) => ipcRenderer.invoke(IPC.rehearsalSet, active),
  getRuntimeStatus: () => ipcRenderer.invoke(IPC.runtimeStatusGet),
  subscribeRuntimeStatus: (listener: (status: RuntimeStatus) => void) =>
    subscribe(IPC.runtimeStatusChanged, listener),
})

contextBridge.exposeInMainWorld('rocketFuel', api)
