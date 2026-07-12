import { describe, expect, it } from 'vitest'

import {
  computeFinalePlan,
  computeLaunchPower,
  createDefaultShow,
} from '../../src/shared'

describe('finale choreography', () => {
  it('ranks teams high-to-low and uses the specified score-to-power mapping', () => {
    const show = createDefaultShow()
    const plan = computeFinalePlan(
      show.teams,
      { 'team-1': 10, 'team-2': 5, 'team-3': 0, 'team-4': 8 },
      { ...show.finale, mishapCount: 0 },
    )

    expect(plan.entries.map((entry) => entry.teamId)).toEqual([
      'team-1',
      'team-4',
      'team-2',
      'team-3',
    ])
    expect(plan.entries.map((entry) => entry.power)).toEqual([1, 0.91, 0.775, 0.55])
    expect(plan.entries[0].ascentDurationMs).toBeLessThan(plan.entries[2].ascentDurationMs)
    expect(plan.groups[0].launchAtMs).toBe(show.finale.countdownSeconds * 1_000)
  })

  it('launches tied teams together with identical performance', () => {
    const show = createDefaultShow()
    const plan = computeFinalePlan(
      show.teams,
      { 'team-1': 8, 'team-2': 4, 'team-3': 8, 'team-4': 1 },
      { ...show.finale, mishapCount: 0 },
    )

    expect(plan.winnerTeamIds).toEqual(['team-1', 'team-3'])
    expect(plan.groups[0].teamIds).toEqual(['team-1', 'team-3'])
    expect(plan.entries.find((entry) => entry.teamId === 'team-1')?.power).toBe(
      plan.entries.find((entry) => entry.teamId === 'team-3')?.power,
    )
  })

  it('marks the uniquely lowest team for the default bottom-one comic recovery', () => {
    const show = createDefaultShow()
    const plan = computeFinalePlan(
      show.teams,
      { 'team-1': 10, 'team-2': 7, 'team-3': 4, 'team-4': 1 },
      show.finale,
    )

    expect(plan.requestedMishapCount).toBe(1)
    expect(plan.actualMishapTeamIds).toEqual(['team-4'])
    expect(plan.groups.at(-1)).toMatchObject({
      teamIds: ['team-4'],
      mishap: true,
    })
  })

  it('protects a tied group crossing the bottom-X mishap cutoff', () => {
    const show = createDefaultShow()
    const plan = computeFinalePlan(
      show.teams,
      { 'team-1': 10, 'team-2': 5, 'team-3': 5, 'team-4': 1 },
      { ...show.finale, mishapCount: 2 },
    )

    // The two teams on five points straddle the bottom-two cutoff, so both are
    // protected. The uniquely last team can still receive the comic landing.
    expect(plan.requestedMishapCount).toBe(2)
    expect(plan.actualMishapTeamIds).toEqual(['team-4'])
    expect(plan.groups.find((group) => group.score === 5)?.mishap).toBe(false)
  })

  it('applies a mishap to an entire tied group when the group sits wholly below the cutoff', () => {
    const show = createDefaultShow()
    const plan = computeFinalePlan(
      show.teams,
      { 'team-1': 10, 'team-2': 8, 'team-3': 2, 'team-4': 2 },
      { ...show.finale, mishapCount: 2 },
    )
    expect(plan.actualMishapTeamIds).toEqual(['team-3', 'team-4'])
    expect(plan.groups.at(-1)?.mishap).toBe(true)
  })

  it('gives every team full launch power when all scores are zero', () => {
    const show = createDefaultShow()
    const plan = computeFinalePlan(show.teams, show.baselineScores, {
      ...show.finale,
      mishapCount: 0,
    })

    expect(plan.winnerTeamIds).toHaveLength(4)
    expect(plan.entries.every((entry) => entry.power === 1)).toBe(true)
    expect(computeLaunchPower(0, 0)).toBe(1)
  })

  it('adapts launch spacing toward the target duration', () => {
    const show = createDefaultShow({ teamCount: 10 })
    const scores = Object.fromEntries(show.teams.map((team, index) => [team.id, 10 - index]))
    const plan = computeFinalePlan(show.teams, scores, show.finale)

    expect(plan.groups).toHaveLength(10)
    expect(plan.estimatedDurationMs).toBeGreaterThanOrEqual(50_000)
    expect(plan.estimatedDurationMs).toBeLessThanOrEqual(70_000)
  })

  it('also stretches a short, two-group finale toward the configured target', () => {
    const show = createDefaultShow()
    const plan = computeFinalePlan(
      show.teams,
      { 'team-1': 10, 'team-2': 10, 'team-3': 2, 'team-4': 2 },
      { ...show.finale, mishapCount: 0 },
    )
    expect(plan.groups).toHaveLength(2)
    expect(plan.estimatedDurationMs).toBeGreaterThanOrEqual(55_000)
    expect(plan.estimatedDurationMs).toBeLessThanOrEqual(65_000)
  })
})
