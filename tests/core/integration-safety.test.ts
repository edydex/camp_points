import { describe, expect, it } from 'vitest'
import {
  createDefaultShow,
  RocketShowSchema,
  ShowEngine,
  type AnnouncementCue,
} from '../../src/shared'

describe('show integration safety', () => {
  it('preserves exact history and live mix across non-structural show updates', () => {
    const engine = new ShowEngine(createDefaultShow())
    const teamId = engine.getSnapshot().teams[0].id
    engine.dispatch({ type: 'score.adjust', commandId: 'score-1', teamId, delta: 1 })
    engine.dispatch({ type: 'audio.set', commandId: 'live-master', channel: 'master', value: 0.25 })

    const updated = engine.dispatch({
      type: 'show.update',
      commandId: 'display-change',
      patch: { theme: 'cartoon', display: { particleLevel: 'low' } },
    })
    expect(updated.accepted).toBe(true)
    expect(updated.snapshot.canUndo).toBe(true)
    expect(updated.snapshot.audio.masterVolume).toBe(0.25)

    const configured = engine.dispatch({
      type: 'show.update',
      commandId: 'audio-config',
      patch: { audio: { ambienceEnabled: false, ambienceVolume: 0.1 } },
    })
    expect(configured.snapshot.audio).toMatchObject({
      masterVolume: 0.25,
      ambienceEnabled: false,
      ambienceVolume: 0.1,
    })
    expect(engine.exportShow(false).audio).toMatchObject({
      ambienceEnabled: false,
      ambienceVolume: 0.1,
    })
  })

  it('requires a clean baseline for conflicting caps, lineup, and deck edits', () => {
    const engine = new ShowEngine(createDefaultShow())
    const snapshot = engine.getSnapshot()
    engine.dispatch({
      type: 'score.adjust',
      commandId: 'make-history',
      teamId: snapshot.teams[0].id,
      delta: 2,
    })

    expect(engine.dispatch({
      type: 'show.update',
      commandId: 'scale-edit',
      patch: { scoreConfig: { tankCapacity: 1 } },
    }).accepted).toBe(false)
    expect(engine.dispatch({
      type: 'teams.replace',
      commandId: 'lineup-edit',
      teams: snapshot.teams,
    }).accepted).toBe(false)
    expect(engine.dispatch({
      type: 'cues.replace',
      commandId: 'deck-edit',
      cues: [],
    }).accepted).toBe(false)
  })

  it('freezes score and history mutations while the finale is active', () => {
    const engine = new ShowEngine(createDefaultShow())
    const teamId = engine.getSnapshot().teams[0].id
    engine.dispatch({ type: 'score.adjust', commandId: 'seed-score', teamId, delta: 1 })
    engine.dispatch({ type: 'finale.start', commandId: 'start-finale', confirmed: true })

    const score = engine.dispatch({ type: 'score.adjust', commandId: 'blocked-score', teamId, delta: 1 })
    const undo = engine.dispatch({ type: 'history.undo', commandId: 'blocked-undo' })
    expect(score.accepted).toBe(false)
    expect(undo.accepted).toBe(false)
    expect(engine.getSnapshot().scores[teamId]).toBe(1)
    expect(engine.getSnapshot().finale.status).toBe('countdown')
  })

  it('caps checkpoint history at the schema limit during long shows', () => {
    const engine = new ShowEngine(createDefaultShow())
    const teamId = engine.getSnapshot().teams[0].id
    for (let index = 0; index < 5_010; index += 1) {
      engine.dispatch({
        type: 'score.adjust',
        commandId: `history-${index}`,
        teamId,
        delta: index % 2 === 0 ? 1 : -1,
      })
    }
    expect(engine.getCheckpoint().undoStack).toHaveLength(5_000)
    expect(RocketShowSchema.safeParse(engine.exportShow(true)).success).toBe(true)
  })

  it('clears an undone announcement and replays it on redo', () => {
    const show = createDefaultShow()
    const cue: AnnouncementCue = {
      id: 'announcement-1',
      type: 'announcement',
      title: 'Listen up',
      message: 'Mission briefing!',
      durationMs: 2_000,
    }
    show.cues = [cue]
    const engine = new ShowEngine(show)
    engine.dispatch({ type: 'cue.execute', commandId: 'announce' })
    engine.dispatch({ type: 'animation.skip', commandId: 'settle-announce' })

    const undone = engine.dispatch({ type: 'history.undo', commandId: 'undo-announce' })
    expect(undone.messages.some((message) =>
      message.type === 'event' && message.event.type === 'cue-rewind')).toBe(true)

    const redone = engine.dispatch({ type: 'history.redo', commandId: 'redo-announce' })
    expect(redone.messages.some((message) =>
      message.type === 'event' && message.event.type === 'announcement')).toBe(true)
  })

  it('requires the armed hold command for a scripted finale cue', () => {
    const show = createDefaultShow()
    show.cues = [{ id: 'finale-cue', type: 'finale', title: 'Launch finale' }]
    const engine = new ShowEngine(show)

    const arrowAttempt = engine.dispatch({ type: 'cue.execute', commandId: 'unsafe-arrow' })
    expect(arrowAttempt.accepted).toBe(false)
    expect(arrowAttempt.snapshot.cueIndex).toBe(0)

    const armed = engine.dispatch({
      type: 'finale.start',
      commandId: 'armed-finale',
      confirmed: true,
    })
    expect(armed.accepted).toBe(true)
    expect(armed.snapshot).toMatchObject({ cueIndex: 1, canUndo: true })
    expect(armed.transaction).toMatchObject({ kind: 'cue', cueId: 'finale-cue' })
  })
})
