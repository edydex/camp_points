import { useEffect, useRef, useState } from 'react'
import type { EngineSnapshot, ShowCommand, Team } from '../../shared'
import { Stage, StageSurface } from '../stage'
import { soundEngine } from '../audio/SoundEngine'
import { commandId } from '../lib/commands'
import { snapshotToStageProps } from './stage-adapter'
import type { RuntimeStatus } from '../../preload/contracts'

interface RunPanelProps {
  snapshot: EngineSnapshot
  dispatch: (command: ShowCommand) => Promise<unknown>
  onOpenCues: () => void
  onOpenSettings: () => void
}

function TeamControl({ team, index, snapshot, dispatch, locked }: { team: Team; index: number; snapshot: EngineSnapshot; dispatch: RunPanelProps['dispatch']; locked: boolean }) {
  const score = snapshot.scores[team.id] ?? 0
  const active = snapshot.selectedTeamId === team.id
  const [exact, setExact] = useState(score)
  useEffect(() => setExact(score), [score])
  return (
    <article className={`score-card ${active ? 'is-selected' : ''}`} style={{ '--team': team.color } as React.CSSProperties}>
      <button className="score-select" onClick={() => void dispatch({ type: 'team.select', commandId: commandId(), teamId: team.id } as ShowCommand)}>
        <span className="team-number">{index === 9 ? 0 : index + 1}</span><span><small>{team.rocketModel}</small><strong>{team.name}</strong></span><b>{score}</b>
      </button>
      <div className="score-actions">
        {snapshot.scoreConfig.awardPresets.map((preset) => (
          <span key={preset} className="score-pair"><button disabled={locked} onClick={() => void dispatch({ type: 'score.adjust', commandId: commandId(), teamId: team.id, delta: -preset } as ShowCommand)}>−{preset}</button><button className="positive" disabled={locked} onClick={() => void dispatch({ type: 'score.adjust', commandId: commandId(), teamId: team.id, delta: preset } as ShowCommand)}>+{preset}</button></span>
        ))}
      </div>
      <div className="exact-correction">
        <label>
          <span className="sr-only">Exact score for {team.name}</span>
          <input
            type="number"
            min={0}
            max={snapshot.scoreConfig.tankCapacity * (snapshot.scoreConfig.overflowEnabled ? 2 : 1)}
            value={exact}
            disabled={locked}
            onChange={(event) => setExact(Number(event.target.value))}
          />
        </label>
        <button disabled={locked || exact === score} onClick={() => void dispatch({ type: 'score.set', commandId: commandId(), teamId: team.id, value: exact } as ShowCommand)}>Set exact</button>
      </div>
    </article>
  )
}

export function RunPanel({ snapshot, dispatch, onOpenCues, onOpenSettings }: RunPanelProps) {
  const [live, setLive] = useState(false)
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null)
  const [mirrored, setMirrored] = useState(false)
  const [holding, setHolding] = useState(false)
  const [audioStatus, setAudioStatus] = useState<'locked' | 'opening' | 'ready' | 'error'>('locked')
  const [audioError, setAudioError] = useState<string | null>(null)
  const holdTimer = useRef<number | null>(null)
  const mirroredOwnsLiveState = useRef(false)
  const currentCue = snapshot.cues[snapshot.cueIndex]
  const nextCue = snapshot.cues[snapshot.cueIndex + 1]
  const finaleActive = snapshot.finale.status === 'countdown' || snapshot.finale.status === 'running' || snapshot.finale.status === 'paused'
  const finaleResultsVisible = snapshot.finale.status === 'complete'
  const finaleScoreLocked = finaleActive || finaleResultsVisible
  const lastActionChanges = snapshot.lastTransaction
    ? snapshot.teams.flatMap((team) => {
        const before = snapshot.lastTransaction?.before.scores[team.id] ?? 0
        const after = snapshot.lastTransaction?.after.scores[team.id] ?? 0
        return before === after ? [] : [`${team.name} ${after - before > 0 ? '+' : ''}${after - before}`]
      })
    : []

  useEffect(() => {
    if (!window.rocketFuel) return () => {
      if (holdTimer.current) window.clearTimeout(holdTimer.current)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    }
    void window.rocketFuel.getRuntimeStatus().then((status) => {
      setRuntimeStatus(status)
      setLive(status.isLive)
      if (soundEngine.getDiagnostics().contextState === 'running') setAudioStatus('ready')
    })
    const unsubscribe = window.rocketFuel.subscribeRuntimeStatus((status) => { setRuntimeStatus(status); setLive(status.isLive) })
    return () => {
      unsubscribe()
      if (holdTimer.current) window.clearTimeout(holdTimer.current)
      if (mirroredOwnsLiveState.current) {
        mirroredOwnsLiveState.current = false
        void window.rocketFuel?.setShowLive(false)
      }
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    if (!mirrored) return
    const priorHtmlOverflow = document.documentElement.style.overflow
    const priorBodyOverflow = document.body.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = priorHtmlOverflow
      document.body.style.overflow = priorBodyOverflow
    }
  }, [mirrored])

  const unlockPresenterAudio = async () => {
    setAudioStatus('opening')
    setAudioError(null)
    soundEngine.setTheme(snapshot.theme)
    soundEngine.setMix({
      master: snapshot.audio.masterVolume,
      sfx: snapshot.audio.sfxVolume,
      ambience: snapshot.audio.ambienceVolume,
      muted: snapshot.audio.muted,
    })
    await soundEngine.unlock()
    const diagnostics = soundEngine.getDiagnostics()
    if (diagnostics.contextState !== 'running') {
      throw new Error(`Audio output remained ${diagnostics.contextState}`)
    }
    setAudioStatus('ready')
  }

  const start = async () => {
    try {
      await unlockPresenterAudio()
    } catch (error) {
      setAudioStatus('error')
      setAudioError(error instanceof Error ? error.message : 'Audio output could not be opened.')
    }
    if (window.rocketFuel) {
      await window.rocketFuel.openStage()
      await window.rocketFuel.setShowLive(true)
    }
    setLive(true)
  }

  const endPresentation = async () => {
    if (snapshot.finale.status !== 'idle' && snapshot.finale.status !== 'cancelled') {
      await dispatch({ type: 'finale.cancel', commandId: commandId() } as ShowCommand)
    }
    soundEngine.stopAmbience()
    if (window.rocketFuel) {
      await window.rocketFuel.setShowLive(false)
      await window.rocketFuel.closeStage()
    }
    setLive(false)
  }

  const toggleStageFullscreen = async () => {
    if (!window.rocketFuel) return
    const status = await window.rocketFuel.setStageFullscreen(!(runtimeStatus?.stageFullscreen ?? false))
    setRuntimeStatus(status)
  }

  const closeIdleStage = async () => {
    if (!window.rocketFuel) return
    const status = await window.rocketFuel.closeStage()
    setRuntimeStatus(status)
  }

  const toggleRehearsal = async () => {
    if (!window.rocketFuel) return
    const next = !(runtimeStatus?.isRehearsal ?? false)
    if (!next && !window.confirm('Exit rehearsal and restore the untouched live scores?')) return
    const status = await window.rocketFuel.setRehearsal(next)
    setRuntimeStatus(status)
    if (next) await window.rocketFuel.openStage()
  }

  const openMirrored = async () => {
    try {
      await unlockPresenterAudio()
    } catch (error) {
      setAudioStatus('error')
      setAudioError(error instanceof Error ? error.message : 'Audio output could not be opened.')
    }
    if (window.rocketFuel && !(runtimeStatus?.isLive ?? false)) {
      const status = await window.rocketFuel.setShowLive(true)
      mirroredOwnsLiveState.current = true
      setRuntimeStatus(status)
      setLive(true)
    }
    setMirrored(true)
    try { await document.documentElement.requestFullscreen() } catch { /* Electron may already be fullscreen. */ }
  }

  const closeMirrored = async () => {
    setMirrored(false)
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
    if (window.rocketFuel && mirroredOwnsLiveState.current) {
      const status = await window.rocketFuel.setShowLive(false)
      mirroredOwnsLiveState.current = false
      setRuntimeStatus(status)
      setLive(false)
    }
  }

  const startFinaleHold = () => {
    if (holdTimer.current !== null) return
    setHolding(true)
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null
      setHolding(false)
      const replay = Boolean(snapshot.finale.plan) &&
        snapshot.finale.status === 'complete' &&
        currentCue?.type !== 'finale'
      void (async () => {
        if (!(runtimeStatus?.isLive ?? false)) await start()
        await dispatch(replay
          ? { type: 'finale.replay', commandId: commandId(), confirmed: true } as ShowCommand
          : { type: 'finale.start', commandId: commandId(), confirmed: true } as ShowCommand)
      })()
    }, 2000)
  }
  const cancelFinaleHold = () => {
    setHolding(false)
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }

  const configuredAudioAudible = !snapshot.audio.muted &&
    snapshot.audio.masterVolume > 0 &&
    (snapshot.audio.sfxVolume > 0 ||
      (snapshot.audio.ambienceEnabled && snapshot.audio.ambienceVolume > 0))
  const audioReady = audioStatus === 'ready' && configuredAudioAudible
  const audioLabel = snapshot.audio.muted
    ? 'Sound muted'
    : snapshot.audio.masterVolume <= 0
      ? 'Master volume is zero'
      : audioStatus === 'error'
        ? 'Sound needs attention'
        : audioStatus === 'opening'
          ? 'Opening sound…'
          : audioStatus === 'ready' && !configuredAudioAudible
            ? 'Audio volumes are zero'
          : audioReady
            ? 'Sound ready'
            : 'Sound not started'

  return (
    <div className="run-layout">
      {runtimeStatus?.isRehearsal && <div className="rehearsal-banner"><strong>Rehearsal sandbox</strong><span>Score and cue changes here will be discarded when you exit.</span><button onClick={() => void toggleRehearsal()}>Exit &amp; restore live show</button></div>}
      <section className={`operator-console panel ${live ? 'is-live' : ''}`}>
        <div className="operator-summary">
          <p className="eyebrow">Presentation control</p>
          <h2>{live ? 'Presentation is live' : 'Ready for the audience'}</h2>
          <p>{live ? 'Presenter controls stay private here while the Stage runs on the selected display.' : 'Start once to open the external Stage, enable audio, and prevent display sleep.'}</p>
          <div className="operator-badges">
            <span className={live ? 'is-good' : ''}><i />{live ? 'Live' : 'Not live'}</span>
            <span className={runtimeStatus?.stageOpen ? 'is-good' : ''}><i />{runtimeStatus?.stageOpen ? runtimeStatus.stageFullscreen ? 'Stage fullscreen' : 'Stage windowed' : 'Stage closed'}</span>
            <span className={audioReady ? 'is-good' : ''} title={audioError ?? audioLabel}><i />{audioLabel}</span>
          </div>
          {audioError && <p className="operator-audio-warning">Audio did not open: {audioError}. The visual show can continue; use Venue Check → Play launch test after checking the Mac output device.</p>}
        </div>
        <div className="operator-actions">
          {live
            ? <button className="end-presentation-button" onClick={() => void endPresentation()}><strong>End presentation</strong><small>Stop audio and close Stage</small></button>
            : <button className="start-presentation-button" disabled={runtimeStatus?.isRehearsal} onClick={() => void start()}><strong>Start presentation</strong><small>Open Stage and enable sound</small></button>}
          <div className="operator-secondary-actions">
            <button onClick={() => void openMirrored()}>Single-screen / mirrored</button>
            <button disabled={!runtimeStatus?.stageOpen} onClick={() => void toggleStageFullscreen()}>{runtimeStatus?.stageFullscreen ? 'Leave Stage fullscreen' : 'Make Stage fullscreen'}</button>
            {!live && runtimeStatus?.stageOpen && <button onClick={() => void closeIdleStage()}>Close Stage</button>}
            <button onClick={onOpenSettings}>Show settings</button>
            {!live && <button onClick={() => void toggleRehearsal()}>{runtimeStatus?.isRehearsal ? 'Exit rehearsal' : 'Start rehearsal'}</button>}
          </div>
        </div>
      </section>
      <section className="score-grid-section panel">
        <div className="section-heading"><div><p className="eyebrow">Live scoring</p><h2>Adjust each team’s fuel</h2></div><div className="active-preset">Keyboard preset <strong>+{snapshot.scoreConfig.awardPresets[snapshot.activePresetIndex] ?? 1}</strong></div></div>
        {finaleScoreLocked && <div className="callout">{finaleResultsVisible ? 'Final results are frozen. End the presentation or cancel the finale before changing scores.' : 'Finale scores are frozen. Cancel the finale to resume scoring and history controls.'}</div>}
        <div className="score-grid">{snapshot.teams.map((team, index) => <TeamControl key={team.id} team={team} index={index} snapshot={snapshot} dispatch={dispatch} locked={finaleScoreLocked} />)}</div>
      </section>
      <section className="stage-preview panel">
        <div className="preview-toolbar"><span><i className={live ? 'live-dot' : ''} />{live ? 'Audience output preview' : runtimeStatus?.isRehearsal ? 'Rehearsal preview' : 'Stage preview'}</span><small>{runtimeStatus?.stageOpen ? 'Stage connected' : 'Stage is not open'}</small></div>
        <div className="preview-frame"><Stage {...snapshotToStageProps(snapshot)} /></div>
      </section>

      <aside className="run-sidebar">
        {snapshot.cueCount === 0 ? <section className="panel cue-now cue-now--manual">
          <p className="eyebrow">Optional automation</p>
          <h3>Manual scoring mode</h3>
          <p>No prepared moments are required. Use the team cards above throughout the show.</p>
          <button className="secondary-button" onClick={onOpenCues}>Prepare cues (optional)</button>
        </section> : <section className="panel cue-now">
          <p className="eyebrow">Cue control</p>
          <div className="cue-position"><span>{snapshot.cueCount === 0 ? 0 : Math.min(snapshot.cueIndex + 1, snapshot.cueCount)}</span><i /><span>{snapshot.cueCount}</span></div>
          <strong>{currentCue?.title ?? 'Deck complete'}</strong>
          <small>{currentCue ? currentCue.type : 'Use the finale controls or return to setup.'}</small>
          <button className="next-cue-button" disabled={finaleScoreLocked || !currentCue || currentCue.type === 'finale' || snapshot.animation.status !== 'idle'} onClick={() => void dispatch({ type: 'cue.execute', commandId: commandId() } as ShowCommand)}>{currentCue?.type === 'finale' ? 'Use finale hold below' : 'Play prepared moment'} <kbd>→</kbd></button>
          {snapshot.animation.status !== 'idle' && snapshot.animation.sequenceType !== 'finale' && <button className="skip-animation-button" onClick={() => void dispatch({ type: 'animation.skip', commandId: commandId() } as ShowCommand)}>Skip current animation</button>}
          <div className="next-preview"><span>After that</span><strong>{nextCue?.title ?? 'End of deck'}</strong></div>
        </section>}

        <section className="panel history-controls">
          <div className="recent-action"><span>Latest transaction</span><strong>{snapshot.lastTransaction ? snapshot.lastTransaction.kind === 'cue' ? 'Prepared cue' : 'Manual score' : 'No score actions yet'}</strong>{snapshot.lastTransaction && <small>{lastActionChanges.join(' · ') || `Cue position ${snapshot.lastTransaction.after.cueIndex}`}</small>}</div>
          <button disabled={finaleScoreLocked || !snapshot.canUndo} onClick={() => void dispatch({ type: 'history.undo', commandId: commandId() } as ShowCommand)}>Undo <kbd>⌘Z</kbd></button>
          <button disabled={finaleScoreLocked || !snapshot.canRedo} onClick={() => void dispatch({ type: 'history.redo', commandId: commandId() } as ShowCommand)}>Redo</button>
          <button disabled={finaleScoreLocked || snapshot.cueIndex === 0} onClick={() => void dispatch({ type: 'cue.rewind', commandId: commandId() } as ShowCommand)}>Rewind cue <kbd>←</kbd></button>
        </section>

        <section className="panel finale-control">
          <p className="eyebrow">Conclusion · {snapshot.finale.status}</p><h3>{snapshot.finale.status === 'complete' ? 'Replay finale' : 'Launch finale'}</h3><p>Ranks a frozen score snapshot. {snapshot.finaleConfig.mishapCount === 0 ? 'Comic landing mishaps are turned off.' : `The bottom ${snapshot.finaleConfig.mishapCount} unique lowest team${snapshot.finaleConfig.mishapCount === 1 ? '' : 's'} will sputter and land by parachute.`}</p>
          {snapshot.finaleConfig.mishapCount > 0 && <p className="finale-hint">Ties at the cutoff are protected. Give one team a uniquely lower score when testing the mishap.</p>}
          {(snapshot.finale.status === 'idle' || snapshot.finale.status === 'complete' || snapshot.finale.status === 'cancelled') ? (
            <><button className={`hold-button ${holding ? 'is-holding' : ''}`} onPointerDown={(event) => { try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Synthetic/test pointers may not be capturable. */ } startFinaleHold() }} onPointerUp={(event) => { try { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* The button may already have completed and released capture. */ } cancelFinaleHold() }} onPointerCancel={cancelFinaleHold} onBlur={cancelFinaleHold} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); startFinaleHold() } }} onKeyUp={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); cancelFinaleHold() } }}><span>{holding ? 'Keep holding…' : snapshot.finale.status === 'complete' ? 'Hold to replay' : 'Hold for 2 seconds'}</span><i /></button>{snapshot.finale.status === 'complete' && <button className="exit-results-button" onClick={() => void dispatch({ type: 'finale.cancel', commandId: commandId() } as ShowCommand)}>Exit results &amp; unlock scoring</button>}</>
          ) : (
            <div className="finale-transport">
              <button onClick={() => void dispatch({ type: snapshot.finale.status === 'paused' ? 'finale.resume' : 'finale.pause', commandId: commandId() } as ShowCommand)}>{snapshot.finale.status === 'paused' ? 'Resume' : 'Pause'}</button>
              <button disabled={snapshot.finale.status === 'paused'} onClick={() => void dispatch({ type: 'finale.skip', commandId: commandId() } as ShowCommand)}>Skip group</button>
              <button className="danger-text" onClick={() => void dispatch({ type: 'finale.cancel', commandId: commandId() } as ShowCommand)}>Cancel</button>
            </div>
          )}
        </section>
      </aside>

      {mirrored && (
        <div className="mirrored-stage-shell">
          <StageSurface
            mode="mirrored"
            showHud
            controlDock={(
              <div className="mirrored-dock-controls">
                <button className="dock-close" onClick={() => void closeMirrored()}>Exit Stage</button>
                <div className="dock-team-buttons">{snapshot.teams.map((team, index) => <button key={team.id} className={snapshot.selectedTeamId === team.id ? 'is-active' : ''} style={{ '--team': team.color } as React.CSSProperties} onClick={() => { void soundEngine.play('select'); void dispatch({ type: 'team.select', commandId: commandId(), teamId: team.id } as ShowCommand) }}><span>{index === 9 ? 0 : index + 1}</span>{team.name}</button>)}</div>
                <div className="dock-actions"><button disabled={finaleScoreLocked} onClick={() => snapshot.selectedTeamId && void dispatch({ type: 'score.adjust', commandId: commandId(), teamId: snapshot.selectedTeamId, delta: -(snapshot.scoreConfig.awardPresets[snapshot.activePresetIndex] ?? 1) } as ShowCommand)}>−</button><strong>± {snapshot.scoreConfig.awardPresets[snapshot.activePresetIndex] ?? 1}</strong><button className="dock-add" disabled={finaleScoreLocked} onClick={() => snapshot.selectedTeamId && void dispatch({ type: 'score.adjust', commandId: commandId(), teamId: snapshot.selectedTeamId, delta: snapshot.scoreConfig.awardPresets[snapshot.activePresetIndex] ?? 1 } as ShowCommand)}>+</button>{currentCue && <button className="dock-next" disabled={finaleScoreLocked || currentCue.type === 'finale'} onClick={() => void dispatch({ type: 'cue.execute', commandId: commandId() } as ShowCommand)}>Next cue →</button>}</div>
              </div>
            )}
          />
        </div>
      )}
    </div>
  )
}
