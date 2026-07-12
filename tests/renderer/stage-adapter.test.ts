import { describe, expect, it } from 'vitest'
import { createDefaultShow, ShowEngine } from '../../src/shared'
import { snapshotToStageProps } from '../../src/renderer/presenter/stage-adapter'

describe('snapshotToStageProps', () => {
  it('maps exact scores, gauge config, and team identities into the read-only Stage', () => {
    const engine = new ShowEngine(createDefaultShow({ teamCount: 4 }), { mode: 'baseline' })
    const snapshot = engine.getSnapshot()
    const props = snapshotToStageProps(snapshot)

    expect(props.teams).toHaveLength(4)
    expect(props.teams[0]).toMatchObject({
      id: snapshot.teams[0].id,
      name: snapshot.teams[0].name,
      score: 0,
      model: snapshot.teams[0].rocketModel,
    })
    expect(props.scoreConfig).toEqual({
      capacity: 10,
      overflow: false,
      majorInterval: 1,
      minorSubdivisions: 0,
      maxLabel: 'MAX',
    })
  })
})
