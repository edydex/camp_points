import { describe, expect, it } from 'vitest'

import { createDefaultShow, ShowEngine } from '../../src/shared'
import { rocketFinaleThrustProfile } from '../../src/renderer/components/RocketStage'
import { finaleViewFromSnapshot } from '../../src/renderer/stage/adapter'
import { finalePhaseForTeam } from '../../src/renderer/stage/types'

describe('Stage finale pipeline', () => {
  it('makes successful-launch thrust substantially larger while preserving score power', () => {
    const minimum = rocketFinaleThrustProfile(0.55)
    const typical = rocketFinaleThrustProfile(0.75)
    const winning = rocketFinaleThrustProfile(1)

    expect(minimum.length).toBeCloseTo(1.98)
    expect(typical.length).toBeCloseTo(2.7)
    expect(winning.length).toBeCloseTo(3.6)
    expect(typical.length).toBeGreaterThan(2.5)
    expect(winning.length / minimum.length).toBeCloseTo(1 / 0.55)
    expect(winning.width).toBeGreaterThan(minimum.width)
  })

  it('renders a configured unique bottom team as mishap, then safely landed', () => {
    const engine = new ShowEngine(createDefaultShow())
    const scores = [10, 7, 4, 1]
    scores.forEach((value, index) => {
      engine.dispatch({
        type: 'score.set',
        commandId: `finale-stage-score-${index}`,
        teamId: `team-${index + 1}`,
        value,
      })
    })
    engine.dispatch({
      type: 'finale.start',
      commandId: 'finale-stage-start',
      confirmed: true,
    })
    engine.dispatch({ type: 'finale.skip', commandId: 'finale-stage-countdown' })
    engine.dispatch({ type: 'finale.skip', commandId: 'finale-stage-group-1' })
    engine.dispatch({ type: 'finale.skip', commandId: 'finale-stage-group-2' })
    engine.dispatch({ type: 'finale.skip', commandId: 'finale-stage-group-3' })

    const activeView = finaleViewFromSnapshot(engine.getSnapshot())
    expect(activeView.activeTeamIds).toEqual(['team-4'])
    expect(finalePhaseForTeam('team-4', activeView)).toBe('mishap')

    engine.dispatch({ type: 'finale.skip', commandId: 'finale-stage-results' })
    const resultsView = finaleViewFromSnapshot(engine.getSnapshot())
    expect(finalePhaseForTeam('team-4', resultsView)).toBe('landed')
  })
})
