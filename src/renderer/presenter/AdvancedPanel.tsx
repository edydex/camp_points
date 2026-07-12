import { useEffect, useState } from 'react'
import type { CommandResult, EngineSnapshot, ShowCommand } from '../../shared'
import { commandId } from '../lib/commands'

interface AdvancedPanelProps {
  snapshot: EngineSnapshot
  dispatch: (command: ShowCommand) => Promise<CommandResult | null>
}

export function AdvancedPanel({ snapshot, dispatch }: AdvancedPanelProps) {
  const [capacity, setCapacity] = useState(snapshot.scoreConfig.tankCapacity)
  const [major, setMajor] = useState(snapshot.scoreConfig.majorInterval)
  const [minor, setMinor] = useState(snapshot.scoreConfig.minorSubdivisions)
  const [maxLabel, setMaxLabel] = useState(snapshot.scoreConfig.maxLabel)
  const [mishaps, setMishaps] = useState(snapshot.finaleConfig?.mishapCount ?? 1)
  const [durationSeconds, setDurationSeconds] = useState(Math.round(snapshot.finaleConfig.targetDurationMs / 1000))
  const [countdownSeconds, setCountdownSeconds] = useState(snapshot.finaleConfig.countdownSeconds)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (dirty) return
    setCapacity(snapshot.scoreConfig.tankCapacity)
    setMajor(snapshot.scoreConfig.majorInterval)
    setMinor(snapshot.scoreConfig.minorSubdivisions)
    setMaxLabel(snapshot.scoreConfig.maxLabel)
    setMishaps(snapshot.finaleConfig?.mishapCount ?? 1)
    setDurationSeconds(Math.round(snapshot.finaleConfig.targetDurationMs / 1000))
    setCountdownSeconds(snapshot.finaleConfig.countdownSeconds)
  }, [
    dirty,
    snapshot.finaleConfig.countdownSeconds,
    snapshot.finaleConfig.mishapCount,
    snapshot.finaleConfig.targetDurationMs,
    snapshot.scoreConfig.majorInterval,
    snapshot.scoreConfig.maxLabel,
    snapshot.scoreConfig.minorSubdivisions,
    snapshot.scoreConfig.tankCapacity,
  ])

  const saveScale = async () => {
    const result = await dispatch({
    type: 'show.update',
    commandId: commandId(),
    patch: {
      scoreConfig: {
        tankCapacity: Math.max(1, Math.round(capacity)),
        majorInterval: Math.max(1, Math.min(Math.round(major), Math.round(capacity))),
        minorSubdivisions: Math.max(0, Math.min(9, Math.round(minor))),
        maxLabel: maxLabel.trim().slice(0, 20) || 'MAX',
      },
      finale: {
        mishapCount: Math.max(0, Math.min(snapshot.teams.length, Math.round(mishaps))),
        targetDurationMs: Math.max(10, Math.min(300, Math.round(durationSeconds))) * 1000,
        countdownSeconds: Math.max(0, Math.min(30, Math.round(countdownSeconds))),
      },
    },
    } as ShowCommand)
    if (result?.accepted) setDirty(false)
  }

  return (
    <div className="advanced-grid">
      <section className="panel advanced-card">
        <p className="eyebrow">Fuel scale</p>
        <h3>Tank capacity and markings</h3>
        <div className="form-grid">
          <label className="field"><span>Primary capacity</span><input type="number" min={1} value={capacity} onChange={(e) => { setCapacity(Number(e.target.value)); setDirty(true) }} /></label>
          <label className="field"><span>Major label every</span><input type="number" min={1} value={major} onChange={(e) => { setMajor(Number(e.target.value)); setDirty(true) }} /></label>
          <label className="field"><span>Minor marks between</span><input type="number" min={0} max={9} value={minor} onChange={(e) => { setMinor(Number(e.target.value)); setDirty(true) }} /></label>
          <label className="field"><span>Maximum label</span><input maxLength={20} value={maxLabel} onChange={(e) => { setMaxLabel(e.target.value); setDirty(true) }} /></label>
        </div>
        <label className="toggle-row">
          <span><strong>Reserve overflow tank</strong><small>Raises the hard cap to {capacity * 2} and appears only when needed.</small></span>
          <input type="checkbox" checked={snapshot.scoreConfig.overflowEnabled} onChange={(e) => void dispatch({ type: 'show.update', commandId: commandId(), patch: { scoreConfig: { overflowEnabled: e.target.checked } } } as ShowCommand)} />
        </label>
      </section>

      <section className="panel advanced-card">
        <p className="eyebrow">Audience comfort</p>
        <h3>Motion and particle load</h3>
        <label className="toggle-row">
          <span><strong>Reduced motion</strong><small>Shorter transitions with no large shakes or sweeping camera movement.</small></span>
          <input type="checkbox" checked={snapshot.display.reducedMotion} onChange={(e) => void dispatch({ type: 'show.update', commandId: commandId(), patch: { display: { reducedMotion: e.target.checked } } } as ShowCommand)} />
        </label>
        <label className="field"><span>Particle density</span>
          <select value={snapshot.display.particleLevel} onChange={(e) => void dispatch({ type: 'show.update', commandId: commandId(), patch: { display: { particleLevel: e.target.value } } } as ShowCommand)}>
            <option value="full">Full spectacle</option>
            <option value="low">Low / 4K safe</option>
            <option value="off">Off / fallback</option>
          </select>
        </label>
      </section>

      <section className="panel advanced-card">
        <p className="eyebrow">Finale safety</p>
        <h3>Comic recovery cutoff</h3>
        <label className="field"><span>Bottom rockets with a mishap</span><input type="number" min={0} max={snapshot.teams.length} value={mishaps} onChange={(e) => { setMishaps(Number(e.target.value)); setDirty(true) }} /></label>
        <div className="field-row">
          <label className="field"><span>Target finale length (seconds)</span><input type="number" min={10} max={300} value={durationSeconds} onChange={(e) => { setDurationSeconds(Number(e.target.value)); setDirty(true) }} /></label>
          <label className="field"><span>Countdown (seconds)</span><input type="number" min={0} max={30} value={countdownSeconds} onChange={(e) => { setCountdownSeconds(Number(e.target.value)); setDirty(true) }} /></label>
        </div>
        <div className="callout">Boundary ties are always protected. If the cutoff would split a tied group, that group launches normally.</div>
      </section>

      <section className="panel advanced-card">
        <p className="eyebrow">Audio mix</p>
        <h3>Stage output</h3>
        {(['master', 'sfx', 'ambience'] as const).map((channel) => (
          <label className="range-row" key={channel}><span>{channel}</span><input type="range" min={0} max={1} step={0.05} value={snapshot.audio[`${channel}Volume` as keyof typeof snapshot.audio] as number} onChange={(e) => void dispatch({ type: 'show.update', commandId: commandId(), patch: { audio: { [`${channel}Volume`]: Number(e.target.value) } } } as ShowCommand)} /></label>
        ))}
        <label className="toggle-row"><span><strong>Space music loop</strong><small>“Mesmerizing Galaxy” plays quietly beneath score effects and loops seamlessly.</small></span><input type="checkbox" checked={snapshot.audio.ambienceEnabled} onChange={(e) => void dispatch({ type: 'show.update', commandId: commandId(), patch: { audio: { ambienceEnabled: e.target.checked } } } as ShowCommand)} /></label>
        <p className="music-credit">Music: “Mesmerizing Galaxy” by Kevin MacLeod (incompetech.com), licensed under CC BY 4.0.</p>
        <label className="toggle-row"><span><strong>Mute all sound</strong></span><input type="checkbox" checked={snapshot.audio.muted} onChange={(e) => void dispatch({ type: 'audio.mute', commandId: commandId(), muted: e.target.checked } as ShowCommand)} /></label>
      </section>

      <div className="advanced-save"><span>{dirty ? 'Advanced changes are not saved yet.' : 'Advanced settings are current.'}</span><button className="primary-button" disabled={!dirty} onClick={() => void saveScale()}>Apply advanced settings</button></div>
    </div>
  )
}
