import { RocketShowSchema } from './schemas'
import {
  SHOW_SCHEMA_VERSION,
  type AudioSettings,
  type DisplaySettings,
  type FinaleConfig,
  type FinaleRuntimeState,
  type RocketModel,
  type RocketShow,
  type ScoreConfig,
  type ScoreMap,
  type Team,
  type TeamIcon,
} from './types'

export const DEFAULT_SCORE_CONFIG: Readonly<ScoreConfig> = Object.freeze({
  tankCapacity: 10,
  overflowEnabled: false,
  awardPresets: Object.freeze([1]) as unknown as number[],
  majorInterval: 1,
  minorSubdivisions: 0,
  maxLabel: 'MAX',
})

export const DEFAULT_AUDIO_SETTINGS: Readonly<AudioSettings> = Object.freeze({
  masterVolume: 0.85,
  sfxVolume: 0.9,
  ambienceVolume: 0.35,
  muted: false,
  ambienceEnabled: true,
})

export const DEFAULT_DISPLAY_SETTINGS: Readonly<DisplaySettings> = Object.freeze({
  reducedMotion: false,
  particleLevel: 'full',
})

export const DEFAULT_FINALE_CONFIG: Readonly<FinaleConfig> = Object.freeze({
  mishapCount: 1,
  targetDurationMs: 60_000,
  countdownSeconds: 5,
})

export const IDLE_FINALE: Readonly<FinaleRuntimeState> = Object.freeze({
  status: 'idle',
  plan: null,
  currentGroupIndex: 0,
})

const TEAM_COLORS = [
  '#37C7FF',
  '#FF4D8D',
  '#FFD43B',
  '#6EEB83',
  '#A78BFA',
  '#FF8A3D',
  '#2DD4BF',
  '#F472B6',
  '#93C5FD',
  '#FDE047',
] as const

const TEAM_ICONS: TeamIcon[] = [
  'star',
  'planet',
  'comet',
  'moon',
  'satellite',
  'alien',
  'meteor',
  'galaxy',
  'sun',
  'flag',
]

const ROCKET_MODELS: RocketModel[] = ['scout', 'booster', 'orbiter']

export interface CreateDefaultShowOptions {
  teamCount?: number
  title?: string
  now?: string | Date
}

export function createDefaultTeams(teamCount = 4): Team[] {
  if (!Number.isInteger(teamCount) || teamCount < 2 || teamCount > 10) {
    throw new RangeError('A show must contain between 2 and 10 teams')
  }

  return Array.from({ length: teamCount }, (_, index) => ({
    id: `team-${index + 1}`,
    name: `Team ${index + 1}`,
    color: TEAM_COLORS[index],
    icon: TEAM_ICONS[index],
    rocketModel: ROCKET_MODELS[index % ROCKET_MODELS.length],
  }))
}

export function makeScoreMap(teams: Team[], initialValue = 0): ScoreMap {
  return Object.fromEntries(teams.map((team) => [team.id, initialValue]))
}

export function createDefaultShow(options: CreateDefaultShowOptions = {}): RocketShow {
  const date = options.now instanceof Date ? options.now : options.now ? new Date(options.now) : new Date()
  if (Number.isNaN(date.valueOf())) throw new RangeError('now must be a valid date')
  const now = date.toISOString()
  const teams = createDefaultTeams(options.teamCount ?? 4)
  const document: RocketShow = {
    schemaVersion: SHOW_SCHEMA_VERSION,
    id: `rocket-show-${now.replace(/[^0-9]/g, '').slice(0, 17)}`,
    title: options.title?.trim() || 'Rocket Fuel Camp Points',
    createdAt: now,
    updatedAt: now,
    theme: 'cartoon',
    teams,
    scoreConfig: clone(DEFAULT_SCORE_CONFIG),
    audio: clone(DEFAULT_AUDIO_SETTINGS),
    display: clone(DEFAULT_DISPLAY_SETTINGS),
    finale: clone(DEFAULT_FINALE_CONFIG),
    cues: [],
    baselineScores: makeScoreMap(teams),
  }

  return RocketShowSchema.parse(document) as RocketShow
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
