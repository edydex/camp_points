import { useEffect, useRef, useState } from 'react'
import type { RuntimeStatus } from '../../preload/contracts'
import type { ShowCommand } from '../../shared'
import { usePresenterAudio } from '../audio/usePresenterAudio'
import { useShowRuntime } from '../hooks/useShowRuntime'
import { commandId } from '../lib/commands'
import { AdvancedPanel } from './AdvancedPanel'
import { describeAutosaveStatus } from './autosave-status'
import { CueEditor } from './CueEditor'
import { RunPanel } from './RunPanel'
import { SetupPanel } from './SetupPanel'
import { ShowTitleEditor } from './ShowTitleEditor'
import { useKeyboardControls } from './useKeyboardControls'
import { VenuePanel } from './VenuePanel'

type Workspace = 'setup' | 'advanced' | 'deck' | 'run' | 'venue'
type PrimaryWorkspace = Exclude<Workspace, 'advanced'>

const nav: Array<{ id: PrimaryWorkspace; label: string; hint: string }> = [
  { id: 'setup', label: 'Quick Setup', hint: 'Title & teams' },
  { id: 'run', label: 'Run Show', hint: 'Score & present' },
  { id: 'deck', label: 'Cues', hint: 'Optional automation' },
  { id: 'venue', label: 'Venue Check', hint: 'Screens & remote' },
]

const advancedMeta = { label: 'Advanced settings', hint: 'Scale, effects & finale' }

export function PresenterApp() {
  const { snapshot, error, dispatch } = useShowRuntime()
  const [workspace, setWorkspace] = useState<Workspace>('setup')
  const [settingsReturnWorkspace, setSettingsReturnWorkspace] = useState<PrimaryWorkspace>('run')
  const [toast, setToast] = useState<string | null>(null)
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null)
  const [recoveryPending, setRecoveryPending] = useState(false)
  const recoveryInitialized = useRef(false)

  useKeyboardControls(snapshot, dispatch, workspace === 'run')
  usePresenterAudio(snapshot, Boolean(runtimeStatus?.isLive || runtimeStatus?.isRehearsal))

  useEffect(() => {
    if (!error) return
    setToast(error)
    const timer = window.setTimeout(() => setToast(null), 5000)
    return () => window.clearTimeout(timer)
  }, [error])

  useEffect(() => {
    if (!window.rocketFuel) return
    let active = true
    const applyStatus = (status: RuntimeStatus) => {
      if (!active) return
      setRuntimeStatus(status)
      if (!recoveryInitialized.current) {
        recoveryInitialized.current = true
        setRecoveryPending(status.autosaveAvailable)
      }
    }
    const unsubscribe = window.rocketFuel.subscribeRuntimeStatus((status) => {
      applyStatus(status)
    })
    void window.rocketFuel.getRuntimeStatus().then((status) => {
      applyStatus(status)
    }).catch(() => {
      // Runtime failures surface through the engine error toast; leave save status unavailable.
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const importShow = async () => {
    if (!window.rocketFuel) return
    const result = await window.rocketFuel.importShow()
    if (result.status === 'needs-mode') {
      const resume = window.confirm(`“${result.title}” contains a saved show position. Resume it?\n\nChoose Cancel to replay from its baseline.`)
      await window.rocketFuel.importShow({ token: result.token, mode: resume ? 'resume' : 'baseline' })
    }
  }

  const exportShow = async () => {
    const result = await window.rocketFuel?.exportShow(true)
    if (result?.status === 'exported') setToast(`Saved to ${result.path}`)
  }

  const reset = () => {
    if (window.confirm('Reset scores and cue position to this show’s baseline?\n\nThis creates a new autosave and cannot be undone. Export a checkpoint first if you may need the current scores.')) {
      void dispatch({ type: 'show.reset', commandId: commandId(), mode: 'baseline' } as ShowCommand)
    }
  }

  const toggleAdvanced = () => {
    if (workspace === 'advanced') {
      setWorkspace(settingsReturnWorkspace)
      return
    }
    setSettingsReturnWorkspace(workspace)
    setWorkspace('advanced')
  }

  const updateShowTitle = async (title: string): Promise<boolean> => {
    const result = await dispatch({
      type: 'show.update',
      commandId: commandId(),
      patch: { title },
    } as ShowCommand)
    if (!result?.accepted) {
      setToast(result?.reason ?? 'The show title could not be saved.')
      return false
    }
    return true
  }

  if (!snapshot && error) {
    return (
      <main className="renderer-failure" role="alert">
        <p>Launch system fault</p>
        <h1>Presenter could not connect to the show engine.</h1>
        <p>Your autosave is still on this computer. Reload the Presenter to try the connection again.</p>
        <code>{error}</code>
        <button type="button" onClick={() => window.location.reload()}>Reload Presenter</button>
      </main>
    )
  }

  if (!snapshot) {
    return <main className="loading-screen"><span className="loading-orbit"><i /><i /><i /></span><strong>Warming the launch systems…</strong></main>
  }

  const autosave = describeAutosaveStatus(runtimeStatus)
  const currentMeta = workspace === 'advanced'
    ? advancedMeta
    : nav.find((item) => item.id === workspace) ?? nav[0]

  return (
    <div className={`presenter-shell presenter-shell--${snapshot.theme}`}>
      <aside className="sidebar">
        <div className="brand-lockup"><span className="brand-mark"><i /><i /></span><div><strong>Rocket Fuel</strong><small>Camp Points Studio</small></div></div>
        <nav aria-label="Presenter sections">{nav.map((item, index) => <button key={item.id} className={workspace === item.id ? 'is-active' : ''} onClick={() => setWorkspace(item.id)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item.label}</strong><small>{item.hint}</small></button>)}</nav>
        <div className="sidebar-footer"><div className={`autosave-state autosave-state--${autosave.tone}`} title={autosave.title}><i /><span><strong>{autosave.label}</strong><small>{autosave.detail}</small></span></div><button onClick={() => void importShow()}>Import</button><button onClick={() => void exportShow()}>Export</button></div>
      </aside>

      <main className="presenter-main">
        <header className="topbar">
          <div className="topbar-title">
            <p className="eyebrow">{currentMeta.hint}</p>
            {workspace === 'run'
              ? <ShowTitleEditor title={snapshot.title} onCommit={updateShowTitle} disabled={Boolean(runtimeStatus?.isRehearsal)} />
              : <h1>{currentMeta.label}</h1>}
          </div>
          <div className="topbar-actions">
            {snapshot.cueCount > 0 && <span className="show-meter"><i style={{ width: `${(snapshot.cueIndex / snapshot.cueCount) * 100}%` }} /><small>{snapshot.cueIndex}/{snapshot.cueCount} cues</small></span>}
            <button className={`settings-button ${workspace === 'advanced' ? 'is-active' : ''}`} aria-label={workspace === 'advanced' ? `Return to ${nav.find((item) => item.id === settingsReturnWorkspace)?.label}` : 'Open advanced settings'} title={workspace === 'advanced' ? 'Back to previous screen' : 'Advanced settings'} onClick={toggleAdvanced}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 2h5l.7 2.4 2 .8 2.2-1.1 2.5 4.3-1.8 1.5.3 2.1-.3 2.1 1.8 1.5-2.5 4.3-2.2-1.1-2 .8-.7 2.4h-5l-.7-2.4-2-.8-2.2 1.1-2.5-4.3 1.8-1.5-.3-2.1.3-2.1-1.8-1.5 2.5-4.3 2.2 1.1 2-.8L9.5 2Z" /><circle cx="12" cy="12" r="3.2" /></svg>
            </button>
            <button className="icon-button" title="Reset to baseline" onClick={reset}>Reset</button><button className={`mute-button ${snapshot.audio.muted ? 'is-muted' : ''}`} onClick={() => void dispatch({ type: 'audio.mute', commandId: commandId(), muted: !snapshot.audio.muted } as ShowCommand)}>{snapshot.audio.muted ? 'Sound off' : 'Sound on'}</button>
          </div>
        </header>

        <div className="workspace">
          {workspace === 'setup' && <SetupPanel snapshot={snapshot} dispatch={dispatch} />}
          {workspace === 'advanced' && <AdvancedPanel snapshot={snapshot} dispatch={dispatch} />}
          {workspace === 'deck' && <CueEditor snapshot={snapshot} dispatch={dispatch} />}
          {workspace === 'run' && <RunPanel snapshot={snapshot} dispatch={dispatch} onOpenCues={() => setWorkspace('deck')} onOpenSettings={toggleAdvanced} />}
          {workspace === 'venue' && <VenuePanel snapshot={snapshot} dispatch={dispatch} />}
        </div>
      </main>
      {toast && <div className="toast" role="status">{toast}<button onClick={() => setToast(null)}>×</button></div>}
      {recoveryPending && (
        <div className="recovery-gate" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
          <section className="recovery-card">
            <span className="recovery-orbit" aria-hidden="true"><i /><i /></span>
            <p className="eyebrow">Recovered mission</p>
            <h2 id="recovery-title">Resume “{snapshot.title}”?</h2>
            <p>The latest autosave is loaded with every score, cue position, and undo step intact.</p>
            <div className="recovery-summary"><span><small>Current cue</small><strong>{snapshot.cueIndex} / {snapshot.cueCount}</strong></span><span><small>Last saved</small><strong>{runtimeStatus?.lastAutosaveAt ? new Date(runtimeStatus.lastAutosaveAt).toLocaleString() : 'Saved locally'}</strong></span></div>
            <div className="recovery-actions"><button className="primary-button" onClick={() => setRecoveryPending(false)}>Resume saved position</button><button className="secondary-button" onClick={() => void dispatch({ type: 'show.reset', commandId: commandId(), mode: 'baseline' } as ShowCommand).then((result) => { if (result?.accepted) setRecoveryPending(false) })}>Replay from baseline</button></div>
            <small className="recovery-note">Nothing is stored in the cloud. You can export a .rocketshow checkpoint from the sidebar.</small>
          </section>
        </div>
      )}
    </div>
  )
}
