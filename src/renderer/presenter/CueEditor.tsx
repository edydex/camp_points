import { useEffect, useMemo, useRef, useState } from 'react'
import { applyScoreDeltas, type Cue, type EngineSnapshot, type ShowCommand } from '../../shared'
import { commandId } from '../lib/commands'

interface CueEditorProps {
  snapshot: EngineSnapshot
  dispatch: (command: ShowCommand) => Promise<unknown>
}

const cueId = () => `cue-${commandId()}`

export function CueEditor({ snapshot, dispatch }: CueEditorProps) {
  const [draftType, setDraftType] = useState<'score' | 'announcement'>('score')
  const [title, setTitle] = useState('Award points')
  const [message, setMessage] = useState('Get ready for the next launch update!')
  const [notes, setNotes] = useState('')
  const [delta, setDelta] = useState(snapshot.scoreConfig.awardPresets[0] ?? 1)
  const [teamDeltas, setTeamDeltas] = useState<Record<string, number>>({})
  const [selected, setSelected] = useState<string[]>(snapshot.teams.slice(0, 1).map((team) => team.id))
  const [mode, setMode] = useState<'simultaneous' | 'sequential'>('simultaneous')
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [stepDelayMs, setStepDelayMs] = useState(850)
  const [editingId, setEditingId] = useState<string | null>(null)
  const finaleBlocksEditing = snapshot.finale.status !== 'idle' && snapshot.finale.status !== 'cancelled'
  const deckLocked = snapshot.cueIndex > 0 || snapshot.canUndo || snapshot.canRedo || finaleBlocksEditing
  const [preview, setPreview] = useState<{
    title: string
    activeTeamIds: string[]
    displayTeamIds: string[]
  } | null>(null)
  const previewTimers = useRef<number[]>([])

  const clearPreview = () => {
    previewTimers.current.forEach((timer) => window.clearTimeout(timer))
    previewTimers.current = []
    setPreview(null)
  }

  useEffect(() => () => {
    previewTimers.current.forEach((timer) => window.clearTimeout(timer))
  }, [])

  const previewDelivery = (
    previewTitle: string,
    teamIds: string[],
    delivery: 'simultaneous' | 'sequential',
    delayMs: number,
  ) => {
    clearPreview()
    if (teamIds.length === 0) return
    if (delivery === 'simultaneous') {
      setPreview({ title: previewTitle, activeTeamIds: teamIds, displayTeamIds: teamIds })
      previewTimers.current.push(window.setTimeout(() => setPreview(null), 1_400))
      return
    }
    teamIds.forEach((teamId, index) => {
      previewTimers.current.push(window.setTimeout(() => {
        setPreview({ title: previewTitle, activeTeamIds: [teamId], displayTeamIds: teamIds })
      }, index * Math.max(100, delayMs)))
    })
    previewTimers.current.push(window.setTimeout(
      () => setPreview(null),
      Math.max(0, teamIds.length - 1) * Math.max(100, delayMs) + 1_100,
    ))
  }

  const predictedScores = useMemo(() => {
    const scores = { ...snapshot.scores }
    for (const cue of snapshot.cues.slice(snapshot.cueIndex)) {
      if (cue.type !== 'score') continue
      Object.assign(scores, applyScoreDeltas(scores, cue.deltas, snapshot.scoreConfig).scores)
    }
    return scores
  }, [snapshot])

  const replace = (cues: Cue[]) => dispatch({ type: 'cues.replace', commandId: commandId(), cues } as ShowCommand)

  const addCue = async () => {
    let cue: Cue
    if (draftType === 'score') {
      if (!selected.length) return
      cue = {
        id: editingId ?? cueId(),
        type: 'score',
        title: title.trim() || 'Score update',
        notes: notes.trim() || undefined,
        deltas: selected.map((teamId) => ({ teamId, delta: Math.round(teamDeltas[teamId] ?? delta) })),
        mode,
        teamOrder: selected,
        stepDelayMs: Math.max(100, Math.min(5_000, Math.round(stepDelayMs))),
      }
    } else {
      cue = {
        id: editingId ?? cueId(),
        type: 'announcement',
        title: title.trim() || 'Announcement',
        notes: notes.trim() || undefined,
        message: message.trim(),
        durationMs: 5000,
      }
    }
    await replace(editingId ? snapshot.cues.map((item) => item.id === editingId ? cue : item) : [...snapshot.cues, cue])
    setEditingId(null)
    setNotes('')
    setTitle(draftType === 'score' ? 'Award points' : 'Camp announcement')
  }

  const editCue = (cue: Cue) => {
    if (cue.type === 'finale') return
    setEditingId(cue.id)
    setDraftType(cue.type)
    setTitle(cue.title)
    setNotes(cue.notes ?? '')
    if (cue.type === 'score') {
      setSelected(cue.deltas.map((change) => change.teamId))
      setDelta(cue.deltas[0]?.delta ?? 1)
      setTeamDeltas(Object.fromEntries(cue.deltas.map((change) => [change.teamId, change.delta])))
      setMode(cue.mode)
      setStepDelayMs(cue.stepDelayMs)
    } else {
      setMessage(cue.message)
    }
  }

  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= snapshot.cues.length) return
    const cues = [...snapshot.cues]
    const [item] = cues.splice(index, 1)
    cues.splice(nextIndex, 0, item)
    void replace(cues)
  }

  const dropAt = (targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null)
      return
    }
    const cues = [...snapshot.cues]
    const [item] = cues.splice(draggedIndex, 1)
    cues.splice(targetIndex, 0, item)
    setDraggedIndex(null)
    void replace(cues)
  }

  const duplicate = (cue: Cue) => {
    const copy = { ...cue, id: cueId(), title: `${cue.title} copy` }
    void replace([...snapshot.cues, copy])
  }

  return (
    <div className="cue-layout">
      <section className="panel cue-guide">
        <div><p className="eyebrow">Optional automation</p><h2>Prepared cues are completely optional</h2><p>Use these only when you know an award or announcement ahead of time. For normal camp scoring, ignore this screen and use <strong>Run Show</strong>.</p></div>
        <ol><li><span>1</span>Create an action</li><li><span>2</span>Arrange the sequence</li><li><span>3</span>Return to Run Show and press Right Arrow</li></ol>
      </section>
      <section className="panel cue-builder">
        <p className="eyebrow">Add an action</p>
        <h2>What should happen next?</h2>
        {deckLocked && <div className="callout">Prepared actions are locked after scoring begins so undo and cue positions remain exact. Reset scores/history to the baseline before changing this sequence.</div>}
        <fieldset className="cue-builder-fields" disabled={deckLocked}>
        <div className="segmented"><button className={draftType === 'score' ? 'is-active' : ''} onClick={() => setDraftType('score')}>Award points</button><button className={draftType === 'announcement' ? 'is-active' : ''} onClick={() => setDraftType('announcement')}>Show announcement</button></div>
        <label className="field"><span>Action name</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="field"><span>Presenter notes (optional)</span><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Not shown to the audience" /></label>
        {draftType === 'score' ? (
          <>
            <div className="team-pick-grid">
              {snapshot.teams.map((team) => {
                const checked = selected.includes(team.id)
                return <label key={team.id} style={{ '--team': team.color } as React.CSSProperties}><input type="checkbox" checked={checked} onChange={(event) => { setSelected((current) => event.target.checked ? [...current, team.id] : current.filter((id) => id !== team.id)); if (event.target.checked) setTeamDeltas((current) => ({ ...current, [team.id]: current[team.id] ?? delta })) }} /><span>{team.name}</span>{checked && mode === 'sequential' && <b className="cue-order" title="Animation order">{selected.indexOf(team.id) + 1}</b>}{checked && <input className="team-delta-input" aria-label={`Points for ${team.name}`} type="number" value={teamDeltas[team.id] ?? delta} onChange={(event) => setTeamDeltas((current) => ({ ...current, [team.id]: Number(event.target.value) }))} />}</label>
              })}
            </div>
            <div className="field-row"><label className="field"><span>Default points for newly selected teams</span><input type="number" value={delta} onChange={(e) => setDelta(Number(e.target.value))} /></label><label className="field"><span>Animate</span><select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="simultaneous">All together</option><option value="sequential">One at a time</option></select></label></div>
            {mode === 'sequential' && <><label className="field"><span>Seconds between rockets</span><input type="number" min={0.1} max={5} step={0.1} value={Number((stepDelayMs / 1000).toFixed(1))} onChange={(event) => setStepDelayMs(Number(event.target.value) * 1000)} /></label><small className="cue-order-note">Teams animate in the numbered order shown above. Uncheck and reselect a team to move it to the end.</small></>}
          </>
        ) : (
          <label className="field"><span>Message</span><textarea rows={5} value={message} onChange={(event) => setMessage(event.target.value)} /></label>
        )}
        {draftType === 'score' && (
          <div className="cue-delivery-preview" aria-live="polite">
            <span>{preview?.title ?? 'Order preview'}</span>
            <div>{snapshot.teams.filter((team) => (preview?.displayTeamIds ?? selected).includes(team.id)).map((team) => <i key={team.id} className={preview?.activeTeamIds.includes(team.id) ? 'is-active' : ''} style={{ '--team': team.color } as React.CSSProperties}>{team.name}</i>)}</div>
          </div>
        )}
        <div className="button-row"><button className="primary-button full-button" onClick={() => void addCue()}>{editingId ? 'Save action changes' : 'Add to show sequence'}</button>{draftType === 'score' && <button className="secondary-button" onClick={() => previewDelivery(`${mode === 'simultaneous' ? 'Together' : 'One at a time'} · ${Math.abs(delta)} points`, selected, mode, stepDelayMs)}>Preview order</button>}{editingId && <button className="secondary-button" onClick={() => { setEditingId(null); setNotes('') }}>Cancel</button>}</div>
        </fieldset>
      </section>

      <section className="panel cue-deck">
        <div className="section-heading"><div><p className="eyebrow">Show sequence</p><h2>{snapshot.cues.length} prepared action{snapshot.cues.length === 1 ? '' : 's'}</h2></div></div>
        {snapshot.cues.length === 0 ? <div className="empty-state"><strong>No prepared actions—and that is okay.</strong><span>Score manually in Run Show, or add an optional action on the left.</span></div> : (
          <ol className="cue-list">
            {snapshot.cues.map((cue, index) => (
              <li
                key={cue.id}
                draggable={!deckLocked}
                className={`${index === snapshot.cueIndex ? 'is-next' : ''} ${index < snapshot.cueIndex ? 'is-done' : ''} ${draggedIndex === index ? 'is-dragging' : ''}`}
                onDragStart={() => { if (!deckLocked) setDraggedIndex(index) }}
                onDragEnd={() => setDraggedIndex(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => dropAt(index)}
              >
                <span className="cue-index">{index + 1}</span>
                <div className="cue-copy"><small>{cue.type === 'score' ? 'points' : cue.type}</small><strong>{cue.title}</strong><span>{cue.type === 'score' ? `${cue.deltas.map((change) => { const team = snapshot.teams.find((item) => item.id === change.teamId); return `${team?.name ?? 'Team'} ${change.delta > 0 ? '+' : ''}${change.delta}` }).join(' · ')} — ${cue.mode === 'simultaneous' ? 'together' : 'one at a time'}` : cue.type === 'announcement' ? cue.message : 'End-of-show launch'}</span></div>
                <div className="cue-actions"><button disabled={deckLocked} aria-label="Move up" onClick={() => move(index, -1)}>↑</button><button disabled={deckLocked} aria-label="Move down" onClick={() => move(index, 1)}>↓</button>{cue.type === 'score' && <button onClick={() => previewDelivery(cue.title, cue.teamOrder.length ? cue.teamOrder : cue.deltas.map((item) => item.teamId), cue.mode, cue.stepDelayMs)}>Preview</button>}{cue.type !== 'finale' && <button disabled={deckLocked} onClick={() => editCue(cue)}>Edit</button>}<button disabled={deckLocked} onClick={() => duplicate(cue)}>Copy</button><button disabled={deckLocked} className="danger-text" onClick={() => void replace(snapshot.cues.filter((item) => item.id !== cue.id))}>Delete</button></div>
              </li>
            ))}
          </ol>
        )}
        <div className="prediction-strip"><strong>Predicted finish</strong>{snapshot.teams.map((team) => <span key={team.id}><i style={{ background: team.color }} />{team.name} {predictedScores[team.id] ?? 0}</span>)}</div>
      </section>
    </div>
  )
}
