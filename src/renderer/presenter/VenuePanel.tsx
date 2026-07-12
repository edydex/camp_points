import { useEffect, useState } from 'react'
import type { DisplayInfo, RemoteStatus, RuntimeStatus } from '../../preload/contracts'
import type { EngineSnapshot, ShowCommand } from '../../shared'
import { soundEngine } from '../audio/SoundEngine'
import { commandId } from '../lib/commands'

interface VenuePanelProps { snapshot: EngineSnapshot; dispatch: (command: ShowCommand) => Promise<unknown> }

export function VenuePanel({ snapshot, dispatch }: VenuePanelProps) {
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [remote, setRemote] = useState<RemoteStatus | null>(null)
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null)
  const [gpu, setGpu] = useState<'unknown' | 'ready' | 'fallback'>('unknown')
  const [keyboardTest, setKeyboardTest] = useState<'idle' | 'waiting' | 'ready'>('idle')
  const [capturedKey, setCapturedKey] = useState('')
  const [soundTest, setSoundTest] = useState<'idle' | 'playing' | 'ready' | 'error'>('idle')
  const [soundTestMessage, setSoundTestMessage] = useState('Uses the system-selected output device.')

  useEffect(() => {
    if (!window.rocketFuel) return
    void Promise.all([window.rocketFuel.getDisplays(), window.rocketFuel.getRemoteStatus(), window.rocketFuel.getRuntimeStatus()]).then(([nextDisplays, nextRemote, nextRuntime]) => { setDisplays(nextDisplays); setRemote(nextRemote); setRuntime(nextRuntime) })
    const cleanups = [window.rocketFuel.subscribeDisplays(setDisplays), window.rocketFuel.subscribeRemoteStatus(setRemote), window.rocketFuel.subscribeRuntimeStatus(setRuntime)]
    return () => cleanups.forEach((cleanup) => cleanup())
  }, [])

  useEffect(() => {
    if (keyboardTest !== 'waiting') return
    const capture = (event: KeyboardEvent) => {
      event.preventDefault()
      setCapturedKey(event.key === ' ' ? 'Space' : event.key)
      setKeyboardTest('ready')
    }
    window.addEventListener('keydown', capture, { once: true })
    return () => window.removeEventListener('keydown', capture)
  }, [keyboardTest])

  const testGpu = () => {
    const canvas = document.createElement('canvas')
    setGpu(canvas.getContext('webgl2') || canvas.getContext('webgl') ? 'ready' : 'fallback')
  }

  const testSound = async () => {
    setSoundTest('playing')
    setSoundTestMessage('Opening the Presenter audio output…')
    soundEngine.setTheme(snapshot.theme)
    soundEngine.setMix({
      master: snapshot.audio.masterVolume,
      sfx: snapshot.audio.sfxVolume,
      ambience: snapshot.audio.ambienceVolume,
      muted: false,
    })
    try {
      await soundEngine.unlock()
      const diagnostics = soundEngine.getDiagnostics()
      if (diagnostics.contextState !== 'running') {
        throw new Error(`Audio context is ${diagnostics.contextState}`)
      }
      await soundEngine.play('launch')
      setSoundTest('ready')
      setSoundTestMessage(`Audio running · launch signal sent · ${soundEngine.getDiagnostics().loadedAssets} bundled assets ready`)
    } catch (error) {
      setSoundTest('error')
      setSoundTestMessage(error instanceof Error ? error.message : 'The audio output could not be opened.')
    }
  }

  return (
    <div className="venue-grid">
      <section className="panel venue-hero"><div><p className="eyebrow">Preflight</p><h2>Venue readiness</h2><p>Run this check on the exact laptop, projector, network, and speakers used at camp.</p></div><span className={`readiness ${runtime?.lastError ? 'has-error' : ''}`}>{runtime?.lastError ? 'Needs attention' : 'Ready to test'}</span></section>

      <section className="panel venue-card">
        <div className="venue-icon">01</div><p className="eyebrow">Display</p><h3>Projector output</h3>
        <div className="display-list">{displays.length ? displays.map((display) => <button key={display.id} className={display.isSelectedForStage ? 'is-active' : ''} onClick={() => void window.rocketFuel?.openStage(display.id)}><span>{display.isPrimary ? 'Laptop' : 'External display'}</span><strong>{display.bounds.width} × {display.bounds.height}</strong><small>{display.scaleFactor}× scale {display.isSelectedForStage ? '· selected' : ''}</small></button>) : <p>Desktop display information appears in the packaged app.</p>}</div>
        <button className="secondary-button full-button" onClick={() => void window.rocketFuel?.setStageFullscreen(!(runtime?.stageFullscreen ?? false))}>{runtime?.stageFullscreen ? 'Leave Stage fullscreen' : 'Make Stage fullscreen'}</button>
      </section>

      <section className="panel venue-card">
        <div className="venue-icon">02</div><p className="eyebrow">Audio and graphics</p><h3>Feedback test</h3>
        <div className="test-row"><span><strong>Stage sound</strong><small>{soundTestMessage}</small></span><button onClick={() => void testSound()}>{soundTest === 'playing' ? 'Starting…' : soundTest === 'ready' ? 'Play again' : soundTest === 'error' ? 'Retry audio' : 'Play launch test'}</button></div>
        <div className="test-row"><span><strong>WebGL particles</strong><small>Falls back to SVG-only effects if unavailable.</small></span><button onClick={testGpu}>{gpu === 'unknown' ? 'Run test' : gpu === 'ready' ? 'Ready' : 'Fallback mode'}</button></div>
        <div className="test-row"><span><strong>Presenter keyboard</strong><small>{keyboardTest === 'waiting' ? 'Press any number, arrow, Space, or shortcut key.' : keyboardTest === 'ready' ? `Captured “${capturedKey}” successfully.` : 'Confirms venue keyboard events reach the private console.'}</small></span><button onClick={() => { setCapturedKey(''); setKeyboardTest('waiting') }}>{keyboardTest === 'waiting' ? 'Listening…' : keyboardTest === 'ready' ? 'Test again' : 'Run test'}</button></div>
        <label className="toggle-row"><span><strong>Mute all sound</strong></span><input type="checkbox" checked={snapshot.audio.muted} onChange={(e) => void dispatch({ type: 'audio.mute', commandId: commandId(), muted: e.target.checked } as ShowCommand)} /></label>
      </section>

      <section className="panel venue-card remote-card">
        <div className="venue-icon">03</div><p className="eyebrow">Phone remote</p><h3>Offline LAN pairing</h3>
        {remote?.lastError && <p className="remote-error" role="alert"><strong>Remote needs attention:</strong> {remote.lastError}</p>}
        {remote?.running ? (
          <div className="pairing-layout">
            {remote.qrDataUrl && <img src={remote.qrDataUrl} alt="QR code for the local phone remote" />}
            <div><span className="pair-label">Pairing PIN</span><strong className="pair-pin">{remote.pairingPin ?? '— — — —'}</strong><small>{remote.connected ? `Connected: ${remote.activeClientLabel ?? 'phone'}` : 'Scan from iPhone Safari or Android Chrome.'}</small>{remote.addresses.map((address) => <code key={address}>{address}</code>)}</div>
          </div>
        ) : <div className="remote-empty"><strong>No remote server is running.</strong><span>Start it only when you are ready to pair on a trusted camp network or hotspot.</span></div>}
        <div className="button-row">{remote?.running ? <><button className="secondary-button" onClick={() => void window.rocketFuel?.refreshRemotePairing()}>New PIN</button><button className="danger-button" onClick={() => void window.rocketFuel?.stopRemote()}>Stop remote</button></> : <button className="primary-button" onClick={() => void window.rocketFuel?.startRemote()}>Start phone remote</button>}</div>
      </section>

      <section className="panel venue-card checklist-card">
        <div className="venue-icon">04</div><p className="eyebrow">Operator checklist</p><h3>Before children enter</h3>
        <ul><li>Connect power and disable system notifications.</li><li>Extend—not mirror—the desktop for Presenter mode.</li><li>Confirm speaker volume with a launch sound.</li><li>Pair the phone on the same Wi-Fi or hotspot.</li><li>Run one score cue, undo it, and verify the projector.</li><li>Preview which bottom team would receive the comic recovery.</li></ul>
      </section>
    </div>
  )
}
