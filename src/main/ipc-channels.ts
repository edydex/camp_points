export const IPC = {
  snapshotGet: 'rocket-fuel:snapshot:get',
  commandDispatch: 'rocket-fuel:command:dispatch',
  displaysGet: 'rocket-fuel:displays:get',
  stageOpen: 'rocket-fuel:stage:open',
  stageClose: 'rocket-fuel:stage:close',
  stageFullscreenSet: 'rocket-fuel:stage:fullscreen:set',
  showImport: 'rocket-fuel:show:import',
  showExport: 'rocket-fuel:show:export',
  remoteStart: 'rocket-fuel:remote:start',
  remoteStop: 'rocket-fuel:remote:stop',
  remoteRefreshPairing: 'rocket-fuel:remote:refresh-pairing',
  remoteStatusGet: 'rocket-fuel:remote:status:get',
  liveSet: 'rocket-fuel:live:set',
  rehearsalSet: 'rocket-fuel:rehearsal:set',
  runtimeStatusGet: 'rocket-fuel:runtime:status:get',
  snapshotChanged: 'rocket-fuel:event:snapshot',
  stageMessage: 'rocket-fuel:event:stage-message',
  displaysChanged: 'rocket-fuel:event:displays',
  remoteStatusChanged: 'rocket-fuel:event:remote-status',
  runtimeStatusChanged: 'rocket-fuel:event:runtime-status',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
