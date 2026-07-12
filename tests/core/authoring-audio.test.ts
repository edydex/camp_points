import { describe, expect, it } from 'vitest'
import { createDefaultShow, ShowEngine } from '../../src/shared'

describe('show audio authoring', () => {
  it('stores ambience preference in the authoritative snapshot and exported file', () => {
    const engine = new ShowEngine(createDefaultShow())
    const result = engine.dispatch({
      type: 'show.update',
      commandId: 'update-audio-0001',
      patch: { audio: { ambienceEnabled: false, ambienceVolume: 0.1 } },
    })

    expect(result.accepted).toBe(true)
    expect(result.snapshot.audio).toMatchObject({ ambienceEnabled: false, ambienceVolume: 0.1 })
    expect(engine.exportShow(true).audio).toMatchObject({ ambienceEnabled: false, ambienceVolume: 0.1 })
  })
})
