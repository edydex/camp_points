import type { ReactNode } from 'react'

/**
 * The Stage intentionally consumes a small, structural view model instead of
 * importing the show engine. This keeps the projector renderer read-only and
 * lets both the Electron window and the embedded presenter preview reuse it.
 */
export type StageTheme = 'cartoon'

export type StageRocketModel = 'scout' | 'booster' | 'orbiter'

export type StageMode = 'projector' | 'mirrored' | 'preview'

export interface StageTeamView {
  id: string
  name: string
  color: string
  icon?: string
  model: StageRocketModel
  score: number
}

export interface StageScoreViewConfig {
  /** Capacity of the main, internal tank. */
  capacity: number
  overflow: boolean
  majorInterval: number
  minorSubdivisions: number
  maxLabel: string
}

export interface StageAnnouncement {
  id: string
  kicker?: string
  title: string
  message?: string
  tone?: 'info' | 'award' | 'warning' | 'celebration'
}

export type FinaleStatus = 'idle' | 'countdown' | 'launching' | 'results'

/**
 * Finale timing and ordering stay authoritative in the show engine. The Stage
 * only animates the current visual phase, which makes reconnecting safe: a new
 * Stage can render this snapshot without replaying an old transient event.
 */
export interface StageFinaleView {
  status: FinaleStatus
  countdown?: number
  activeTeamIds?: readonly string[]
  launchedTeamIds?: readonly string[]
  mishapTeamIds?: readonly string[]
  landedTeamIds?: readonly string[]
  winnerTeamIds?: readonly string[]
  launchPowerByTeamId?: Readonly<Record<string, number>>
  headline?: string
}

export interface StageProps {
  title?: string
  theme: StageTheme
  teams: readonly StageTeamView[]
  scoreConfig: StageScoreViewConfig
  selectedTeamId?: string | null
  announcement?: StageAnnouncement | null
  finale?: StageFinaleView | null
  mode?: StageMode
  reducedMotion?: boolean
  particleLevel?: 'full' | 'low' | 'off'
  lowParticles?: boolean
  muted?: boolean
  paused?: boolean
  showHud?: boolean
  /** Used by the audience-visible, auto-hiding mirrored controls. */
  controlDock?: ReactNode
  className?: string
}

export type RocketFinalePhase =
  | 'idle'
  | 'queued'
  | 'active'
  | 'launched'
  | 'mishap'
  | 'landed'

export interface TankTick {
  value: number
  ratio: number
  kind: 'major' | 'minor'
  label?: string
}

export const clampStageScore = (score: number, config: StageScoreViewConfig): number => {
  const hardMaximum = config.capacity * (config.overflow ? 2 : 1)
  return Math.min(Math.max(Math.round(score), 0), hardMaximum)
}

/** Generate stable visual ticks, always including zero and the primary max. */
export const makeStageTicks = (config: StageScoreViewConfig): TankTick[] => {
  const capacity = Math.max(1, Math.round(config.capacity))
  const majorInterval = Math.max(1, Math.round(config.majorInterval || 1))
  const subdivisions = Math.max(0, Math.round(config.minorSubdivisions || 0))
  const byValue = new Map<number, TankTick>()

  const addMajor = (value: number, label?: string): void => {
    const safeValue = Math.min(Math.max(value, 0), capacity)
    byValue.set(safeValue, {
      value: safeValue,
      ratio: safeValue / capacity,
      kind: 'major',
      label,
    })
  }

  addMajor(0, '0')
  for (let value = majorInterval; value < capacity; value += majorInterval) {
    addMajor(value, String(value))
  }
  addMajor(capacity, config.maxLabel.trim() || 'MAX')

  if (subdivisions > 0) {
    const majorValues = [...byValue.values()]
      .filter((tick) => tick.kind === 'major')
      .map((tick) => tick.value)
      .sort((a, b) => a - b)

    for (let index = 0; index < majorValues.length - 1; index += 1) {
      const start = majorValues[index]
      const end = majorValues[index + 1]
      const step = (end - start) / (subdivisions + 1)
      for (let part = 1; part <= subdivisions; part += 1) {
        const value = start + step * part
        if (!byValue.has(value)) {
          byValue.set(value, {
            value,
            ratio: value / capacity,
            kind: 'minor',
          })
        }
      }
    }
  }

  return [...byValue.values()].sort((a, b) => a.value - b.value)
}

export const finalePhaseForTeam = (
  teamId: string,
  finale?: StageFinaleView | null,
): RocketFinalePhase => {
  if (!finale || finale.status === 'idle') return 'idle'

  const active = finale.activeTeamIds?.includes(teamId) ?? false
  const launched = finale.launchedTeamIds?.includes(teamId) ?? false
  const mishap = finale.mishapTeamIds?.includes(teamId) ?? false
  const landed = finale.landedTeamIds?.includes(teamId) ?? false

  if (mishap && landed) return 'landed'
  if (mishap && active) return 'mishap'
  if (launched) return 'launched'
  if (active) return 'active'
  if (finale.status === 'launching') return 'queued'
  return 'idle'
}
