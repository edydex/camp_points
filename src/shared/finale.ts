import type {
  FinaleConfig,
  FinaleEntry,
  FinaleGroup,
  FinalePlan,
  FinaleRuntimeState,
  ScoreMap,
  Team,
} from './types'

const MIN_LAUNCH_POWER = 0.55
const BASE_ASCENT_MS = 6_000
const RESULTS_HOLD_MS = 6_000

/**
 * Freezes the score table and creates deterministic launch choreography. Ties
 * remain in the same launch group and therefore receive identical performance.
 */
export function computeFinalePlan(
  teams: Team[],
  scores: ScoreMap,
  config: FinaleConfig,
): FinalePlan {
  if (teams.length < 2 || teams.length > 10) {
    throw new RangeError('A finale requires between 2 and 10 teams')
  }

  const frozenScores = Object.fromEntries(
    teams.map((team) => [team.id, Math.max(0, Math.trunc(scores[team.id] ?? 0))]),
  )
  const teamPosition = new Map(teams.map((team, index) => [team.id, index]))
  const ranked = teams
    .map((team) => ({ teamId: team.id, score: frozenScores[team.id] }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        (teamPosition.get(left.teamId) ?? 0) - (teamPosition.get(right.teamId) ?? 0),
    )

  const winningScore = ranked[0].score
  const winnerTeamIds = ranked
    .filter((entry) => entry.score === winningScore)
    .map((entry) => entry.teamId)
  const requestedMishapCount = Math.min(
    teams.length,
    Math.max(0, Math.trunc(config.mishapCount)),
  )
  const mishapIds = selectMishapTeams(ranked, requestedMishapCount)

  const grouped = new Map<number, typeof ranked>()
  for (const entry of ranked) {
    const group = grouped.get(entry.score) ?? []
    group.push(entry)
    grouped.set(entry.score, group)
  }

  const scoreGroups = [...grouped.entries()]
  const countdownMs = Math.max(0, Math.trunc(config.countdownSeconds)) * 1_000
  const targetDurationMs = Math.max(10_000, Math.trunc(config.targetDurationMs))
  const slowestAscentMs = Math.round(BASE_ASCENT_MS / MIN_LAUNCH_POWER)
  const launchWindow = Math.max(
    0,
    targetDurationMs - countdownMs - slowestAscentMs - RESULTS_HOLD_MS,
  )
  const groupIntervalMs =
    scoreGroups.length <= 1
      ? 0
      : clamp(Math.round(launchWindow / (scoreGroups.length - 1)), 2_500, 40_000)

  const groups: FinaleGroup[] = scoreGroups.map(([score, members], index) => {
    const power = computeLaunchPower(score, winningScore)
    return {
      score,
      teamIds: members.map((entry) => entry.teamId),
      power,
      flameScale: power,
      ascentDurationMs: Math.round(BASE_ASCENT_MS / power),
      launchAtMs: countdownMs + index * groupIntervalMs,
      mishap: members.every((entry) => mishapIds.has(entry.teamId)),
    }
  })

  const groupByTeam = new Map(
    groups.flatMap((group) => group.teamIds.map((teamId) => [teamId, group] as const)),
  )
  const entries: FinaleEntry[] = ranked.map((entry) => {
    const group = groupByTeam.get(entry.teamId)!
    return {
      teamId: entry.teamId,
      score: entry.score,
      power: group.power,
      flameScale: group.flameScale,
      ascentDurationMs: group.ascentDurationMs,
      mishap: mishapIds.has(entry.teamId),
    }
  })

  const estimatedDurationMs = Math.max(
    ...groups.map((group) => group.launchAtMs + group.ascentDurationMs + RESULTS_HOLD_MS),
  )

  return {
    frozenScores,
    winnerTeamIds,
    winningScore,
    groups,
    entries,
    requestedMishapCount,
    actualMishapTeamIds: entries.filter((entry) => entry.mishap).map((entry) => entry.teamId),
    targetDurationMs,
    estimatedDurationMs,
  }
}

export function computeLaunchPower(score: number, winningScore: number): number {
  if (winningScore <= 0) return 1
  return round4(clamp(MIN_LAUNCH_POWER + 0.45 * (Math.max(0, score) / winningScore), 0.55, 1))
}

/**
 * Returns the authoritative countdown budget. The deadline keeps the Stage,
 * main-process coordinator, and a newly opened projector window on the same
 * clock; old v1 checkpoints without clock metadata retain the plan fallback.
 */
export function finaleCountdownRemainingMs(
  finale: FinaleRuntimeState,
  nowMs = Date.now(),
): number {
  const fallback = finale.plan?.groups[0]?.launchAtMs ?? 0
  if (finale.status === 'paused' && finale.pausedFrom === 'countdown') {
    return Math.max(0, Math.trunc(finale.countdownRemainingMs ?? fallback))
  }
  if (finale.countdownEndsAt) {
    const deadline = Date.parse(finale.countdownEndsAt)
    if (Number.isFinite(deadline)) return Math.max(0, Math.ceil(deadline - nowMs))
  }
  return Math.max(0, Math.trunc(finale.countdownRemainingMs ?? fallback))
}

function selectMishapTeams(
  ranked: Array<{ teamId: string; score: number }>,
  count: number,
): Set<string> {
  if (count <= 0) return new Set()
  if (count >= ranked.length) return new Set(ranked.map((entry) => entry.teamId))

  const cutoffIndex = ranked.length - count
  const cutoffScore = ranked[cutoffIndex].score
  let tiedGroupStart = cutoffIndex
  while (tiedGroupStart > 0 && ranked[tiedGroupStart - 1].score === cutoffScore) {
    tiedGroupStart -= 1
  }

  // A group crossing the cutoff is protected as a whole. Lower-ranked groups
  // can still receive the comic mishap, so the resulting count may be smaller.
  const firstMishapIndex = tiedGroupStart < cutoffIndex
    ? ranked.findIndex((entry, index) => index > cutoffIndex && entry.score < cutoffScore)
    : cutoffIndex
  if (firstMishapIndex < 0) return new Set()
  return new Set(ranked.slice(firstMishapIndex).map((entry) => entry.teamId))
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000
}
