import { describe, expect, it } from 'vitest'
import {
  createDefaultShow,
  finaleCountdownRemainingMs,
  ShowEngine,
} from '../../src/shared'

const commandId = (label: string) => `finale-pause-${label}-0001`

describe('finale pause phase preservation', () => {
  it('resumes the countdown without skipping launch group zero', () => {
    const engine = new ShowEngine(createDefaultShow())
    engine.dispatch({ type: 'finale.start', commandId: commandId('start'), confirmed: true })
    engine.dispatch({ type: 'finale.pause', commandId: commandId('pause') })

    const resumed = engine.dispatch({ type: 'finale.resume', commandId: commandId('resume') })
    expect(resumed.snapshot.finale.status).toBe('countdown')
    expect(resumed.snapshot.finale.currentGroupIndex).toBe(0)

    const firstLaunch = engine.dispatch({ type: 'finale.skip', commandId: commandId('first') })
    expect(firstLaunch.snapshot.finale.status).toBe('running')
    expect(firstLaunch.snapshot.finale.currentGroupIndex).toBe(0)
  })

  it('generic animation pause also restores countdown', () => {
    const engine = new ShowEngine(createDefaultShow())
    engine.dispatch({ type: 'finale.start', commandId: commandId('generic-start'), confirmed: true })
    engine.dispatch({ type: 'animation.pause', commandId: commandId('generic-pause') })
    const resumed = engine.dispatch({ type: 'animation.resume', commandId: commandId('generic-resume') })
    expect(resumed.snapshot.finale.status).toBe('countdown')
  })

  it('freezes and resumes the exact wall-clock countdown budget', () => {
    let nowMs = Date.parse('2026-07-11T08:00:00.000Z')
    const engine = new ShowEngine(createDefaultShow(), {
      now: () => new Date(nowMs),
    })

    const started = engine.dispatch({
      type: 'finale.start',
      commandId: commandId('clock-start'),
      confirmed: true,
    }).snapshot.finale
    expect(finaleCountdownRemainingMs(started, nowMs)).toBe(5_000)

    nowMs += 1_850
    const paused = engine.dispatch({
      type: 'finale.pause',
      commandId: commandId('clock-pause'),
    }).snapshot.finale
    expect(paused.countdownEndsAt).toBeUndefined()
    expect(paused.countdownRemainingMs).toBe(3_150)

    nowMs += 20_000
    expect(finaleCountdownRemainingMs(paused, nowMs)).toBe(3_150)
    const resumed = engine.dispatch({
      type: 'finale.resume',
      commandId: commandId('clock-resume'),
    }).snapshot.finale
    expect(Date.parse(resumed.countdownEndsAt!)).toBe(nowMs + 3_150)
    expect(finaleCountdownRemainingMs(resumed, nowMs + 2_150)).toBe(1_000)
  })
})
