import { describe, expect, it } from 'vitest'

import {
  RocketShowSchema,
  ShowCommandSchema,
  ShowEngine,
  createDefaultShow,
  createDefaultTeams,
  migrateRocketShow,
} from '../../src/shared'

describe('show document defaults and validation', () => {
  it('creates the documented four-team first-run show', () => {
    const show = createDefaultShow({ now: '2026-07-11T08:00:00.000Z' })

    expect(RocketShowSchema.safeParse(show).success).toBe(true)
    expect(show.theme).toBe('cartoon')
    expect(show.teams).toHaveLength(4)
    expect(show.scoreConfig).toMatchObject({
      tankCapacity: 10,
      overflowEnabled: false,
      awardPresets: [1],
      majorInterval: 1,
      minorSubdivisions: 0,
      maxLabel: 'MAX',
    })
    expect(show.finale.mishapCount).toBe(1)
    expect(show.baselineScores).toEqual({
      'team-1': 0,
      'team-2': 0,
      'team-3': 0,
      'team-4': 0,
    })
  })

  it('supports exactly two through ten teams', () => {
    expect(createDefaultTeams(2)).toHaveLength(2)
    expect(createDefaultTeams(10)).toHaveLength(10)
    expect(() => createDefaultTeams(1)).toThrow(/between 2 and 10/i)
    expect(() => createDefaultTeams(11)).toThrow(/between 2 and 10/i)
  })

  it('rejects duplicate IDs, missing scores, and unknown cue team references', () => {
    const duplicate = createDefaultShow()
    duplicate.teams[1].id = duplicate.teams[0].id
    expect(RocketShowSchema.safeParse(duplicate).success).toBe(false)

    const missingScore = createDefaultShow()
    delete missingScore.baselineScores['team-1']
    expect(RocketShowSchema.safeParse(missingScore).success).toBe(false)

    const unknownTeam = createDefaultShow()
    unknownTeam.cues.push({
      id: 'cue-1',
      type: 'score',
      title: 'Mystery points',
      deltas: [{ teamId: 'not-a-team', delta: 1 }],
      mode: 'simultaneous',
      teamOrder: [],
      stepDelayMs: 0,
    })
    expect(RocketShowSchema.safeParse(unknownTeam).success).toBe(false)
  })

  it('has an explicit migration boundary from schema version one', () => {
    const show = createDefaultShow()
    expect(migrateRocketShow(show)).toEqual(show)
    expect(migrateRocketShow({ ...show, theme: 'retro' }).theme).toBe('cartoon')
    expect(migrateRocketShow({ ...show, theme: 'cinematic' }).theme).toBe('cartoon')
    expect(() => migrateRocketShow({ ...show, schemaVersion: 2 })).toThrow(
      /unsupported rocket show schema version 2/i,
    )
    expect(() => migrateRocketShow({ title: 'Old file' })).toThrow(/missing a schemaVersion/i)
  })

  it('rejects checkpoints whose undo history could restore dangling state', () => {
    const engine = new ShowEngine(createDefaultShow(), {
      now: () => '2026-07-11T08:00:00.000Z',
    })
    engine.dispatch({
      type: 'score.adjust',
      commandId: 'record-transaction',
      teamId: 'team-1',
      delta: 2,
    })
    const corrupt = engine.exportShow(true)
    corrupt.runtime!.undoStack[0].after.scores['ghost-team'] = 4

    expect(RocketShowSchema.safeParse(corrupt).success).toBe(false)
    expect(() => migrateRocketShow(corrupt)).toThrow()
  })
})

describe('wire command schema', () => {
  it('accepts score and authoring commands and strips no unexpected data', () => {
    expect(
      ShowCommandSchema.safeParse({
        type: 'score.adjust',
        commandId: 'command-1',
        teamId: 'team-1',
        delta: 2,
      }).success,
    ).toBe(true)
    expect(
      ShowCommandSchema.safeParse({
        type: 'show.update',
        commandId: 'command-2',
        patch: { theme: 'cartoon', scoreConfig: { tankCapacity: 25 } },
      }).success,
    ).toBe(true)
    expect(
      ShowCommandSchema.safeParse({
        type: 'show.update',
        commandId: 'retired-theme',
        patch: { theme: 'retro' },
      }).success,
    ).toBe(false)
    expect(
      ShowCommandSchema.safeParse({
        type: 'history.undo',
        commandId: 'command-3',
        injected: true,
      }).success,
    ).toBe(false)
  })
})
