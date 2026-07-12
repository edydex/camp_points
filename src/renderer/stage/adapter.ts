import type { EngineSnapshot, StageMessage } from '../../shared/types'
import type {
  StageAnnouncement,
  StageFinaleView,
  StageMode,
  StageProps,
} from './types'

interface StageAdapterOptions {
  mode?: StageMode
  announcement?: StageAnnouncement | null
  finaleCountdown?: number
  showHud?: boolean
}

export const announcementFromStageMessage = (
  message: StageMessage,
): StageAnnouncement | null => {
  if (message.type !== 'event' || message.event.type !== 'announcement') return null
  return {
    id: `${message.event.cueId}-${message.revision}`,
    kicker: 'Mission update',
    title: message.event.title,
    message: message.event.message,
    tone: 'info',
  }
}

export const finaleViewFromSnapshot = (
  snapshot: EngineSnapshot,
  countdown?: number,
): StageFinaleView => {
  const { finale } = snapshot
  const plan = finale.plan

  if (finale.status === 'idle' || finale.status === 'cancelled' || !plan) {
    return { status: 'idle' }
  }

  const launchPowerByTeamId = Object.fromEntries(
    plan.entries.map((entry) => [entry.teamId, entry.power]),
  )

  if (
    finale.status === 'countdown' ||
    (finale.status === 'paused' && finale.pausedFrom === 'countdown')
  ) {
    return {
      status: 'countdown',
      countdown,
      mishapTeamIds: plan.actualMishapTeamIds,
      winnerTeamIds: plan.winnerTeamIds,
      launchPowerByTeamId,
    }
  }

  if (finale.status === 'complete') {
    return {
      status: 'results',
      launchedTeamIds: plan.entries.filter((entry) => !entry.mishap).map((entry) => entry.teamId),
      mishapTeamIds: plan.actualMishapTeamIds,
      landedTeamIds: plan.actualMishapTeamIds,
      winnerTeamIds: plan.winnerTeamIds,
      launchPowerByTeamId,
      headline: plan.winnerTeamIds.length > 1 ? 'Co-winners!' : 'Mission champion!',
    }
  }

  const activeGroup = plan.groups[finale.currentGroupIndex]
  const completedGroups = plan.groups.slice(0, Math.max(0, finale.currentGroupIndex))
  const completedTeamIds = completedGroups.flatMap((group) => group.teamIds)
  const landedTeamIds = completedTeamIds.filter((teamId) => plan.actualMishapTeamIds.includes(teamId))

  return {
    status: 'launching',
    activeTeamIds: activeGroup?.teamIds ?? [],
    launchedTeamIds: completedTeamIds.filter((teamId) => !plan.actualMishapTeamIds.includes(teamId)),
    mishapTeamIds: plan.actualMishapTeamIds,
    landedTeamIds,
    winnerTeamIds: plan.winnerTeamIds,
    launchPowerByTeamId,
  }
}

/** Convert an authoritative engine snapshot into read-only Stage props. */
export const stagePropsFromSnapshot = (
  snapshot: EngineSnapshot,
  options: StageAdapterOptions = {},
): StageProps => ({
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
  announcement: options.announcement,
  finale: finaleViewFromSnapshot(snapshot, options.finaleCountdown),
  mode: options.mode ?? 'projector',
  reducedMotion: snapshot.display.reducedMotion,
  particleLevel: snapshot.display.particleLevel,
  muted: snapshot.audio.muted,
  paused: snapshot.animation.status === 'paused' || snapshot.finale.status === 'paused',
  showHud: options.showHud ?? true,
})
