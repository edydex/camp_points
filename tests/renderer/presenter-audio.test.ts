import { describe, expect, it } from 'vitest'
import { createDefaultShow, ShowEngine } from '../../src/shared'
import { scoreSoundName } from '../../src/renderer/audio/usePresenterAudio'

describe('Presenter-owned show audio routing', () => {
  const snapshot = new ShowEngine(createDefaultShow()).getSnapshot()

  it('maps positive, draining, and full-tank score events to distinct feedback', () => {
    expect(scoreSoundName({ teamId: 'team-1', before: 0, after: 1, delta: 1 }, snapshot)).toBe('fuel')
    expect(scoreSoundName({ teamId: 'team-1', before: 2, after: 1, delta: -1 }, snapshot)).toBe('drain')
    expect(scoreSoundName({ teamId: 'team-1', before: 9, after: 10, delta: 1 }, snapshot)).toBe('max')
  })

  it('uses the overflow ceiling for the maximum sound when reserve fuel is enabled', () => {
    const show = createDefaultShow()
    show.scoreConfig.overflowEnabled = true
    const overflowSnapshot = new ShowEngine(show).getSnapshot()

    expect(scoreSoundName({ teamId: 'team-1', before: 9, after: 10, delta: 1 }, overflowSnapshot)).toBe('fuel')
    expect(scoreSoundName({ teamId: 'team-1', before: 19, after: 20, delta: 1 }, overflowSnapshot)).toBe('max')
  })
})
