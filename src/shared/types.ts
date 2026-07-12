export const SHOW_SCHEMA_VERSION = 1 as const

/** Cartoon Sci-Fi is the single supported presentation world. */
export type ThemeId = 'cartoon'
export type RocketModel = 'scout' | 'booster' | 'orbiter'
export type TeamIcon =
  | 'star'
  | 'planet'
  | 'comet'
  | 'moon'
  | 'satellite'
  | 'alien'
  | 'meteor'
  | 'galaxy'
  | 'sun'
  | 'flag'

export interface Team {
  id: string
  name: string
  color: string
  icon: TeamIcon
  rocketModel: RocketModel
}

export interface ScoreConfig {
  tankCapacity: number
  overflowEnabled: boolean
  awardPresets: number[]
  majorInterval: number
  minorSubdivisions: number
  maxLabel: string
}

export interface AudioSettings {
  masterVolume: number
  sfxVolume: number
  ambienceVolume: number
  muted: boolean
  ambienceEnabled: boolean
}

export interface DisplaySettings {
  reducedMotion: boolean
  particleLevel: 'full' | 'low' | 'off'
}

export interface FinaleConfig {
  mishapCount: number
  targetDurationMs: number
  countdownSeconds: number
}

interface CueBase {
  id: string
  title: string
  notes?: string
}

export interface ScoreDelta {
  teamId: string
  delta: number
}

export interface ScoreCue extends CueBase {
  type: 'score'
  deltas: ScoreDelta[]
  mode: 'simultaneous' | 'sequential'
  teamOrder: string[]
  stepDelayMs: number
}

export interface AnnouncementCue extends CueBase {
  type: 'announcement'
  message: string
  durationMs: number
}

export interface FinaleCue extends CueBase {
  type: 'finale'
}

export type Cue = ScoreCue | AnnouncementCue | FinaleCue
export type ScoreMap = Record<string, number>

export interface FinaleEntry {
  teamId: string
  score: number
  power: number
  flameScale: number
  ascentDurationMs: number
  mishap: boolean
}

export interface FinaleGroup {
  score: number
  teamIds: string[]
  power: number
  flameScale: number
  ascentDurationMs: number
  launchAtMs: number
  mishap: boolean
}

export interface FinalePlan {
  frozenScores: ScoreMap
  winnerTeamIds: string[]
  winningScore: number
  groups: FinaleGroup[]
  entries: FinaleEntry[]
  requestedMishapCount: number
  actualMishapTeamIds: string[]
  targetDurationMs: number
  estimatedDurationMs: number
}

export type FinaleStatus =
  | 'idle'
  | 'countdown'
  | 'running'
  | 'paused'
  | 'complete'
  | 'cancelled'

export interface FinaleRuntimeState {
  status: FinaleStatus
  plan: FinalePlan | null
  currentGroupIndex: number
  pausedFrom?: 'countdown' | 'running'
  /**
   * Wall-clock deadline shared by the main-process timer and every Stage.
   * Without it, a Stage that opens/reloads during the countdown starts its own
   * fresh five seconds even though the authoritative launch timer is already
   * part-way through.
   */
  countdownEndsAt?: string
  /** Remaining countdown budget while paused. */
  countdownRemainingMs?: number
}

export interface AnimationState {
  status: 'idle' | 'playing' | 'paused'
  sequenceId: string | null
  sequenceType: 'score' | 'announcement' | 'finale' | null
}

/** The complete portion of engine state captured by score/cue transactions. */
export interface ReversibleState {
  scores: ScoreMap
  cueIndex: number
  finale: FinaleRuntimeState
}

export type CommandSource = 'presenter' | 'remote' | 'keyboard' | 'script' | 'system'
export type TransactionKind = 'manual-score' | 'cue'

export interface Transaction {
  id: string
  commandId: string
  kind: TransactionKind
  source: CommandSource
  timestamp: string
  revision: number
  cueId?: string
  before: ReversibleState
  after: ReversibleState
}

export interface RuntimeCheckpoint {
  scores: ScoreMap
  cueIndex: number
  revision: number
  selectedTeamId: string | null
  activePresetIndex: number
  audio: AudioSettings
  animation: AnimationState
  finale: FinaleRuntimeState
  undoStack: Transaction[]
  redoStack: Transaction[]
  recentCommandIds: string[]
  updatedAt: string
}

export interface RocketShow {
  schemaVersion: typeof SHOW_SCHEMA_VERSION
  id: string
  title: string
  createdAt: string
  updatedAt: string
  theme: ThemeId
  teams: Team[]
  scoreConfig: ScoreConfig
  audio: AudioSettings
  display: DisplaySettings
  finale: FinaleConfig
  cues: Cue[]
  baselineScores: ScoreMap
  runtime?: RuntimeCheckpoint
}

/** Friendly alias used by file import/export code. */
export type ShowDocument = RocketShow

interface CommandBase {
  commandId: string
}

export type ShowCommand =
  | (CommandBase & {
      type: 'show.update'
      patch: {
        title?: string
        theme?: ThemeId
        scoreConfig?: Partial<ScoreConfig>
        audio?: Partial<AudioSettings>
        display?: Partial<DisplaySettings>
        finale?: Partial<FinaleConfig>
      }
    })
  | (CommandBase & { type: 'teams.replace'; teams: Team[] })
  | (CommandBase & { type: 'cues.replace'; cues: Cue[] })
  | (CommandBase & { type: 'show.reset'; mode: 'baseline' | 'zero' })
  | (CommandBase & { type: 'score.adjust'; teamId: string; delta: number })
  | (CommandBase & { type: 'score.set'; teamId: string; value: number })
  | (CommandBase & { type: 'cue.execute' })
  | (CommandBase & { type: 'cue.rewind' })
  | (CommandBase & { type: 'history.undo' })
  | (CommandBase & { type: 'history.redo' })
  | (CommandBase & { type: 'team.select'; teamId: string })
  | (CommandBase & { type: 'preset.select'; presetIndex: number })
  | (CommandBase & {
      type: 'audio.set'
      channel: 'master' | 'sfx' | 'ambience'
      value: number
    })
  | (CommandBase & { type: 'audio.mute'; muted?: boolean })
  | (CommandBase & { type: 'animation.pause' })
  | (CommandBase & { type: 'animation.resume' })
  | (CommandBase & { type: 'animation.skip' })
  | (CommandBase & { type: 'animation.complete' })
  | (CommandBase & { type: 'finale.start'; confirmed: boolean })
  | (CommandBase & { type: 'finale.pause' })
  | (CommandBase & { type: 'finale.resume' })
  | (CommandBase & { type: 'finale.skip' })
  | (CommandBase & { type: 'finale.cancel' })
  | (CommandBase & { type: 'finale.replay'; confirmed: boolean })

export interface EngineSnapshot {
  showId: string
  title: string
  theme: ThemeId
  teams: Team[]
  scoreConfig: ScoreConfig
  finaleConfig: FinaleConfig
  display: DisplaySettings
  cues: Cue[]
  baselineScores: ScoreMap
  scores: ScoreMap
  cueIndex: number
  cueCount: number
  revision: number
  selectedTeamId: string | null
  activePresetIndex: number
  audio: AudioSettings
  animation: AnimationState
  finale: FinaleRuntimeState
  canUndo: boolean
  canRedo: boolean
  lastTransaction: Transaction | null
}

export interface ScoreChangeEvent {
  type: 'score-change'
  reason: 'manual' | 'cue' | 'undo' | 'redo' | 'rewind'
  cueId?: string
  changes: Array<{ teamId: string; before: number; after: number; delta: number }>
  delivery: 'simultaneous' | 'sequential'
  teamOrder: string[]
  stepDelayMs: number
}

export type StageEvent =
  | ScoreChangeEvent
  | {
      type: 'announcement'
      cueId: string
      title: string
      message: string
      durationMs: number
    }
  | { type: 'cue-rewind'; cueId: string }
  | { type: 'selection-change'; teamId: string }
  | { type: 'audio-change'; audio: AudioSettings }
  | { type: 'animation-state'; animation: AnimationState; settle: boolean }
  | { type: 'finale-state'; finale: FinaleRuntimeState }

export type StageMessage =
  | { type: 'snapshot'; snapshot: EngineSnapshot }
  | { type: 'event'; revision: number; event: StageEvent }

export interface CommandResult {
  accepted: boolean
  duplicate: boolean
  reason?: string
  snapshot: EngineSnapshot
  transaction?: Transaction
  messages: StageMessage[]
}

export interface TankTick {
  value: number
  positionPercent: number
  kind: 'zero' | 'major' | 'minor' | 'max'
  label: string | null
}
