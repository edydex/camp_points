import type { ScoreConfig, ScoreDelta, ScoreMap, Team } from './types'

export function getScoreLimit(config: ScoreConfig): number {
  return config.tankCapacity * (config.overflowEnabled ? 2 : 1)
}

export function clampScore(value: number, config: ScoreConfig): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(getScoreLimit(config), Math.max(0, Math.trunc(value)))
}

export function normalizeScores(scores: ScoreMap, teams: Team[], config: ScoreConfig): ScoreMap {
  return Object.fromEntries(
    teams.map((team) => [team.id, clampScore(scores[team.id] ?? 0, config)]),
  )
}

export function applyScoreDeltas(
  scores: ScoreMap,
  deltas: ScoreDelta[],
  config: ScoreConfig,
): {
  scores: ScoreMap
  changes: Array<{ teamId: string; before: number; after: number; delta: number }>
} {
  const nextScores = { ...scores }
  const changes: Array<{ teamId: string; before: number; after: number; delta: number }> = []

  for (const update of deltas) {
    const before = nextScores[update.teamId] ?? 0
    const after = clampScore(before + update.delta, config)
    nextScores[update.teamId] = after
    if (before !== after) {
      changes.push({ teamId: update.teamId, before, after, delta: after - before })
    }
  }

  return { scores: nextScores, changes }
}

export function diffScores(
  before: ScoreMap,
  after: ScoreMap,
  teamOrder: string[] = Object.keys(after),
): Array<{ teamId: string; before: number; after: number; delta: number }> {
  const seen = new Set<string>()
  const allIds = [...teamOrder, ...Object.keys(before), ...Object.keys(after)]
  const changes: Array<{ teamId: string; before: number; after: number; delta: number }> = []
  for (const teamId of allIds) {
    if (seen.has(teamId)) continue
    seen.add(teamId)
    const oldScore = before[teamId] ?? 0
    const newScore = after[teamId] ?? 0
    if (oldScore !== newScore) {
      changes.push({ teamId, before: oldScore, after: newScore, delta: newScore - oldScore })
    }
  }
  return changes
}
