import { describe, expect, it } from 'vitest'

import {
  applyScoreDeltas,
  clampScore,
  createDefaultShow,
  generateTankTicks,
  getScoreLimit,
} from '../../src/shared'

describe('score limits', () => {
  it('clamps normal scores to one tank and overflow scores to two tanks', () => {
    const config = createDefaultShow().scoreConfig
    expect(getScoreLimit(config)).toBe(10)
    expect(clampScore(-4, config)).toBe(0)
    expect(clampScore(14, config)).toBe(10)

    config.overflowEnabled = true
    expect(getScoreLimit(config)).toBe(20)
    expect(clampScore(14, config)).toBe(14)
    expect(clampScore(99, config)).toBe(20)
  })

  it('applies relative updates atomically and reports only real changes', () => {
    const config = createDefaultShow().scoreConfig
    const result = applyScoreDeltas(
      { alpha: 9, beta: 0 },
      [
        { teamId: 'alpha', delta: 5 },
        { teamId: 'beta', delta: -3 },
      ],
      config,
    )

    expect(result.scores).toEqual({ alpha: 10, beta: 0 })
    expect(result.changes).toEqual([
      { teamId: 'alpha', before: 9, after: 10, delta: 1 },
    ])
  })
})

describe('dynamic tank markings', () => {
  it('always includes zero, numeric major marks, and the customizable max label', () => {
    const ticks = generateTankTicks({
      tankCapacity: 10,
      overflowEnabled: false,
      awardPresets: [1],
      majorInterval: 3,
      minorSubdivisions: 0,
      maxLabel: 'FULL',
    })

    expect(ticks.map(({ value, kind, label }) => ({ value, kind, label }))).toEqual([
      { value: 0, kind: 'zero', label: '0' },
      { value: 3, kind: 'major', label: '3' },
      { value: 6, kind: 'major', label: '6' },
      { value: 9, kind: 'major', label: '9' },
      { value: 10, kind: 'max', label: 'FULL' },
    ])
    expect(ticks.at(-1)?.positionPercent).toBe(100)
  })

  it('places configured minor subdivisions evenly within every visible segment', () => {
    const ticks = generateTankTicks({
      tankCapacity: 4,
      overflowEnabled: true,
      awardPresets: [1],
      majorInterval: 2,
      minorSubdivisions: 1,
      maxLabel: 'MAX',
    })

    expect(ticks.map((tick) => tick.value)).toEqual([0, 1, 2, 3, 4])
    expect(ticks.filter((tick) => tick.kind === 'minor').map((tick) => tick.value)).toEqual([1, 3])
  })

  it('validates marking inputs independently of imported document validation', () => {
    const config = createDefaultShow().scoreConfig
    expect(() => generateTankTicks({ ...config, majorInterval: 0 })).toThrow(/major interval/i)
    expect(() => generateTankTicks({ ...config, minorSubdivisions: 10 })).toThrow(/0 through 9/i)
  })
})
