import { app, session } from 'electron'

import { registerIpc } from './ipc'
import { AppRuntime } from './runtime'
import { installSessionSecurity } from './security'

app.enableSandbox()
app.setAppUserModelId('org.camp.rocket-fuel-points')

let runtime: AppRuntime | null = null
let quitAfterShutdown = false

app.whenReady().then(async () => {
  installSessionSecurity(session.defaultSession, !app.isPackaged)
  runtime = await AppRuntime.create()
  registerIpc(runtime)
  runtime.windows.createPresenter()

  app.on('activate', () => {
    runtime?.windows.createPresenter()
  })
}).catch((error) => {
  console.error('Rocket Fuel failed to start', error)
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') {
    void runtime?.shutdown()
    return
  }
  app.quit()
})

app.on('before-quit', (event) => {
  if (quitAfterShutdown || !runtime) return
  event.preventDefault()
  const closingRuntime = runtime
  runtime = null
  void closingRuntime.shutdown().finally(() => {
    quitAfterShutdown = true
    app.quit()
  })
})
