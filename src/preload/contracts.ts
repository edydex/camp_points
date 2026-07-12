import type {
  CommandResult,
  EngineSnapshot,
  ShowCommand,
  StageMessage,
} from '../shared'

export interface DisplayBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface DisplayInfo {
  id: number
  label: string
  bounds: DisplayBounds
  workArea: DisplayBounds
  scaleFactor: number
  rotation: number
  isPrimary: boolean
  isSelectedForStage: boolean
}

export interface RuntimeStatus {
  isLive: boolean
  isRehearsal: boolean
  presenterOpen: boolean
  stageOpen: boolean
  stageFullscreen: boolean
  selectedDisplayId: number | null
  powerSaveBlocked: boolean
  autosaveAvailable: boolean
  lastAutosaveAt: string | null
  lastError: string | null
}

export interface RemoteStatus {
  running: boolean
  addresses: string[]
  port: number | null
  pairingPin: string | null
  pairingExpiresAt: string | null
  qrDataUrl: string | null
  activeClientId: string | null
  activeClientLabel: string | null
  connected: boolean
  lastError: string | null
}

export interface ImportShowRequest {
  /** Supplied after an initial import reports that a checkpoint is available. */
  token?: string
  mode?: 'resume' | 'baseline'
}

export type ImportShowResult =
  | { status: 'cancelled' }
  | {
      status: 'needs-mode'
      token: string
      title: string
      updatedAt: string
      teamCount: number
    }
  | { status: 'imported'; snapshot: EngineSnapshot }

export type ExportShowResult =
  | { status: 'cancelled' }
  | { status: 'exported'; path: string }

type Unsubscribe = () => void

export interface RocketFuelApi {
  getSnapshot(): Promise<EngineSnapshot>
  dispatch(command: ShowCommand): Promise<CommandResult>
  subscribeSnapshot(listener: (snapshot: EngineSnapshot) => void): Unsubscribe
  subscribeStageEvent(listener: (message: StageMessage) => void): Unsubscribe

  getDisplays(): Promise<DisplayInfo[]>
  subscribeDisplays(listener: (displays: DisplayInfo[]) => void): Unsubscribe
  openStage(displayId?: number): Promise<RuntimeStatus>
  closeStage(): Promise<RuntimeStatus>
  setStageFullscreen(fullscreen: boolean): Promise<RuntimeStatus>

  importShow(request?: ImportShowRequest): Promise<ImportShowResult>
  exportShow(includeCheckpoint?: boolean): Promise<ExportShowResult>

  startRemote(): Promise<RemoteStatus>
  stopRemote(): Promise<RemoteStatus>
  refreshRemotePairing(): Promise<RemoteStatus>
  getRemoteStatus(): Promise<RemoteStatus>
  subscribeRemoteStatus(listener: (status: RemoteStatus) => void): Unsubscribe

  setShowLive(live: boolean): Promise<RuntimeStatus>
  setRehearsal(active: boolean): Promise<RuntimeStatus>
  getRuntimeStatus(): Promise<RuntimeStatus>
  subscribeRuntimeStatus(listener: (status: RuntimeStatus) => void): Unsubscribe
}
