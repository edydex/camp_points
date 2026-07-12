import { describe, expect, it } from 'vitest'

import {
  ShowEngine,
  createDefaultShow,
  type EngineSnapshot,
  type ScoreCue,
} from '../../src/shared'
import { nextAnimationTimer } from '../../src/main/animation-schedule'

function baseSnapshot(): EngineSnapshot {
  return new ShowEngine(
    createDefaultShow({ now: '2026-07-11T00:00:00.000Z' }),
  ).getSnapshot()
}

describe('authoritative animation scheduling', () => {
  it('settles simultaneous and sequential score cues after their visual window', () => {
    const snapshot = baseSnapshot()
    const teamIds = snapshot.teams.slice(0, 3).map((team) => team.id)
    const scoreCue: ScoreCue = {
      id: 'score-cue',
      type: 'score',
      title: 'Fuel awards',
      deltas: teamIds.map((teamId) => ({ teamId, delta: 1 })),
      mode: 'simultaneous',
      teamOrder: teamIds,
      stepDelayMs: 400,
    }
    snapshot.cues = [scoreCue]
    snapshot.animation = { status: 'playing', sequenceId: 'score-cue', sequenceType: 'score' }

    expect(nextAnimationTimer(snapshot)).toEqual({
      action: 'animation.complete',
      remainingMs: 900,
    })

    snapshot.cues[0] = { ...scoreCue, mode: 'sequential' }
    expect(nextAnimationTimer(snapshot)).toEqual({
      action: 'animation.complete',
      remainingMs: 1_800,
    })
  })

  it('uses the authored announcement duration', () => {
    const snapshot = baseSnapshot()
    snapshot.cues = [{
      id: 'announcement-cue',
      type: 'announcement',
      title: 'Mission update',
      message: 'Prepare for launch.',
      durationMs: 7_500,
    }]
    snapshot.animation = {
      status: 'playing',
      sequenceId: 'announcement-cue',
      sequenceType: 'announcement',
    }

    expect(nextAnimationTimer(snapshot)).toEqual({
      action: 'animation.complete',
      remainingMs: 7_500,
    })
  })

  it('moves from countdown through every finale group and preserves the results hold', () => {
    const engine = new ShowEngine(
      createDefaultShow({ now: '2026-07-11T00:00:00.000Z' }),
    )
    engine.getSnapshot().teams.forEach((team, index) => {
      engine.dispatch({
        type: 'score.set',
        commandId: `score-${index}`,
        teamId: team.id,
        value: 10 - index,
      })
    })
    engine.dispatch({ type: 'finale.start', commandId: 'start-finale', confirmed: true })

    let snapshot = engine.getSnapshot()
    const plan = snapshot.finale.plan!
    const countdownStartedAt = Date.parse(snapshot.finale.countdownEndsAt!) -
      plan.groups[0].launchAtMs
    expect(nextAnimationTimer(snapshot, countdownStartedAt)).toEqual({
      action: 'finale.skip',
      remainingMs: plan.groups[0].launchAtMs,
    })

    engine.dispatch({ type: 'finale.pause', commandId: 'pause-countdown' }, 'system')
    expect(engine.getSnapshot().finale.pausedFrom).toBe('countdown')
    const pausedSnapshot = engine.getSnapshot()
    expect(nextAnimationTimer(pausedSnapshot)).toEqual({
      action: 'finale.skip',
      remainingMs: pausedSnapshot.finale.countdownRemainingMs,
    })
    engine.dispatch({ type: 'finale.resume', commandId: 'resume-countdown' }, 'system')

    engine.dispatch({ type: 'finale.skip', commandId: 'begin-first-group' }, 'system')
    snapshot = engine.getSnapshot()
    expect(snapshot.finale.currentGroupIndex).toBe(0)
    expect(nextAnimationTimer(snapshot)?.remainingMs).toBe(
      plan.groups[1].launchAtMs - plan.groups[0].launchAtMs,
    )

    for (let index = 1; index < plan.groups.length; index += 1) {
      engine.dispatch({ type: 'finale.skip', commandId: `advance-${index}` }, 'system')
    }
    snapshot = engine.getSnapshot()
    const last = plan.groups.at(-1)!
    expect(snapshot.finale.currentGroupIndex).toBe(plan.groups.length - 1)
    expect(nextAnimationTimer(snapshot)).toEqual({
      action: 'finale.skip',
      remainingMs: plan.estimatedDurationMs - last.launchAtMs,
    })

    engine.dispatch({ type: 'finale.skip', commandId: 'finish-finale' }, 'system')
    expect(engine.getSnapshot().finale.status).toBe('complete')
    expect(nextAnimationTimer(engine.getSnapshot())).toBeNull()
  })
})
