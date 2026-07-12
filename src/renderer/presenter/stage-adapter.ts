import type { EngineSnapshot } from '../../shared'
import type { StageFinaleView, StageProps } from '../stage'

export const snapshotToStageProps = (
  snapshot: EngineSnapshot,
  extras: Partial<Pick<StageProps, 'announcement' | 'finale' | 'mode' | 'showHud'>> = {},
): StageProps => {
  const runtime = snapshot.finale
  let finale: StageFinaleView | null = null
  if (runtime.plan && runtime.status !== 'idle') {
    const groups = runtime.plan.groups
    const activeGroup = groups[Math.max(0, runtime.currentGroupIndex)]
    const launchedTeamIds = groups
      .slice(0, Math.max(0, runtime.currentGroupIndex))
      .flatMap((group) => group.teamIds)
    finale = {
      status:
        runtime.status === 'countdown' ||
        (runtime.status === 'paused' && runtime.pausedFrom === 'countdown')
          ? 'countdown'
          : runtime.status === 'complete'
            ? 'results'
            : runtime.status === 'cancelled'
              ? 'idle'
              : 'launching',
      activeTeamIds: activeGroup?.teamIds ?? [],
      launchedTeamIds,
      mishapTeamIds: runtime.plan.actualMishapTeamIds,
      landedTeamIds: runtime.status === 'complete' ? runtime.plan.actualMishapTeamIds : [],
      winnerTeamIds: runtime.plan.winnerTeamIds,
      launchPowerByTeamId: Object.fromEntries(
        runtime.plan.entries.map((entry) => [entry.teamId, entry.power]),
      ),
    }
  }

  return {
    title: snapshot.title,
    theme: snapshot.theme,
    teams: snapshot.teams.map((team) => ({
      id: team.id,
      name: team.name,
      color: team.color,
      icon: team.icon,
      model: team.rocketModel,
      score: snapshot.scores[team.id] ?? 0,
    })),
    scoreConfig: {
      capacity: snapshot.scoreConfig.tankCapacity,
      overflow: snapshot.scoreConfig.overflowEnabled,
      majorInterval: snapshot.scoreConfig.majorInterval,
      minorSubdivisions: snapshot.scoreConfig.minorSubdivisions,
      maxLabel: snapshot.scoreConfig.maxLabel,
    },
    selectedTeamId: snapshot.selectedTeamId,
    reducedMotion: snapshot.display.reducedMotion,
    lowParticles: snapshot.display.particleLevel !== 'full',
    muted: snapshot.audio.muted,
    paused: snapshot.animation.status === 'paused' || snapshot.finale.status === 'paused',
    finale,
    mode: 'preview',
    ...extras,
  }
}
