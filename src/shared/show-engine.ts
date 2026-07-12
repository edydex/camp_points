import { IDLE_FINALE, makeScoreMap } from './defaults'
import { computeFinalePlan } from './finale'
import { RocketShowSchema, ShowCommandSchema, parseRocketShow } from './schemas'
import {
  applyScoreDeltas,
  clampScore,
  diffScores,
  normalizeScores,
} from './scoring'
import type {
  AnimationState,
  CommandResult,
  CommandSource,
  Cue,
  EngineSnapshot,
  FinaleRuntimeState,
  ReversibleState,
  RocketShow,
  RuntimeCheckpoint,
  ScoreChangeEvent,
  ShowCommand,
  StageEvent,
  StageMessage,
  Transaction,
  TransactionKind,
} from './types'

const IDLE_ANIMATION: AnimationState = {
  status: 'idle',
  sequenceId: null,
  sequenceType: null,
}

const MAX_RECENT_COMMANDS = 256
const MAX_HISTORY_TRANSACTIONS = 5_000

export interface ShowEngineOptions {
  mode?: 'resume' | 'baseline'
  now?: () => string | Date
  idFactory?: () => string
}

/**
 * Authoritative, deterministic show state. The Electron main process owns one
 * instance and broadcasts the returned StageMessages to every renderer.
 */
export class ShowEngine {
  private document: RocketShow
  private runtime: RuntimeCheckpoint
  private readonly now: () => string | Date
  private readonly idFactory: () => string
  private generatedId = 0

  constructor(show: RocketShow, options: ShowEngineOptions = {}) {
    this.document = clone(parseRocketShow(show))
    this.now = options.now ?? (() => new Date())
    this.idFactory = options.idFactory ?? (() => `tx-${++this.generatedId}`)

    if ((options.mode ?? 'resume') === 'resume' && this.document.runtime) {
      this.runtime = clone(this.document.runtime)
    } else {
      this.runtime = this.createBaselineCheckpoint()
    }
  }

  getSnapshot(): EngineSnapshot {
    const lastTransaction = this.runtime.undoStack.at(-1) ?? null
    return clone({
      showId: this.document.id,
      title: this.document.title,
      theme: this.document.theme,
      teams: this.document.teams,
      scoreConfig: this.document.scoreConfig,
      finaleConfig: this.document.finale,
      display: this.document.display,
      cues: this.document.cues,
      baselineScores: this.document.baselineScores,
      scores: this.runtime.scores,
      cueIndex: this.runtime.cueIndex,
      cueCount: this.document.cues.length,
      revision: this.runtime.revision,
      selectedTeamId: this.runtime.selectedTeamId,
      activePresetIndex: this.runtime.activePresetIndex,
      audio: this.runtime.audio,
      animation: this.runtime.animation,
      finale: this.runtime.finale,
      canUndo: this.runtime.undoStack.length > 0,
      canRedo: this.runtime.redoStack.length > 0,
      lastTransaction,
    })
  }

  snapshot(): EngineSnapshot {
    return this.getSnapshot()
  }

  getCheckpoint(): RuntimeCheckpoint {
    return clone(this.runtime)
  }

  exportShow(includeCheckpoint = true): RocketShow {
    const exported = clone(this.document)
    exported.updatedAt = this.runtime.updatedAt
    if (includeCheckpoint) exported.runtime = this.getCheckpoint()
    else delete exported.runtime
    return exported
  }

  cloneForRehearsal(): ShowEngine {
    return new ShowEngine(this.exportShow(true), { mode: 'resume' })
  }

  dispatch(commandInput: ShowCommand | unknown, source: CommandSource = 'presenter'): CommandResult {
    const parsed = ShowCommandSchema.safeParse(commandInput)
    if (!parsed.success) {
      return this.reject(`Invalid command: ${parsed.error.issues[0]?.message ?? 'unknown error'}`)
    }
    const command = parsed.data as ShowCommand

    if (this.runtime.recentCommandIds.includes(command.commandId)) {
      return {
        accepted: true,
        duplicate: true,
        reason: 'Command was already applied',
        snapshot: this.getSnapshot(),
        messages: [],
      }
    }

    if (
      source === 'remote' &&
      (command.type === 'show.update' ||
        command.type === 'teams.replace' ||
        command.type === 'cues.replace' ||
        command.type === 'show.reset' ||
        command.type === 'finale.start' ||
        command.type === 'finale.replay')
    ) {
      return this.reject('This command is only available from the desktop presenter')
    }

    const finaleRunning = this.isFinaleActive()
    const finaleResultsVisible = this.runtime.finale.status === 'complete'
    if (
      (finaleRunning || finaleResultsVisible) &&
      ((command.type === 'show.update' && Boolean(command.patch.scoreConfig || command.patch.finale)) ||
        command.type === 'teams.replace' ||
        command.type === 'cues.replace' ||
        command.type === 'show.reset' ||
        command.type === 'score.adjust' ||
        command.type === 'score.set' ||
        command.type === 'cue.execute' ||
        command.type === 'cue.rewind' ||
        command.type === 'history.undo' ||
        command.type === 'history.redo')
    ) {
      // Finale timing/cutoff settings may deliberately be corrected between a
      // completed run and Replay. The visible frozen scoreboard itself must
      // remain immutable until results are exited, or winner IDs and displayed
      // ranks can contradict each other.
      if (finaleResultsVisible && command.type === 'show.update' &&
        !command.patch.scoreConfig && command.patch.finale) {
        // Continue to the normal administrative update path below.
      } else {
        return this.reject(finaleResultsVisible
          ? 'Final results are displayed. End or cancel the finale before changing scores.'
          : 'The finale is active. Pause or cancel it before changing the show.')
      }
    }

    switch (command.type) {
      case 'show.update':
        return this.updateShow(command)
      case 'teams.replace':
        return this.replaceTeams(command)
      case 'cues.replace':
        return this.replaceCues(command)
      case 'show.reset':
        return this.resetShow(command)
      case 'score.adjust':
        return this.adjustScore(command, source)
      case 'score.set':
        return this.setScore(command, source)
      case 'cue.execute':
        return this.executeCue(command, source)
      case 'cue.rewind':
        return this.rewindCue(command)
      case 'history.undo':
        return this.undo(command)
      case 'history.redo':
        return this.redo(command)
      case 'team.select':
        return this.selectTeam(command)
      case 'preset.select':
        return this.selectPreset(command)
      case 'audio.set':
        return this.setAudio(command)
      case 'audio.mute':
        return this.setMuted(command)
      case 'animation.pause':
        return this.pauseAnimation(command)
      case 'animation.resume':
        return this.resumeAnimation(command)
      case 'animation.skip':
        return this.finishAnimation(command, true)
      case 'animation.complete':
        return this.finishAnimation(command, false)
      case 'finale.start':
        return this.startFinale(command, source)
      case 'finale.pause':
        return this.pauseFinale(command)
      case 'finale.resume':
        return this.resumeFinale(command)
      case 'finale.skip':
        return this.skipFinaleGroup(command)
      case 'finale.cancel':
        return this.cancelFinale(command)
      case 'finale.replay':
        return this.replayFinale(command)
    }
  }

  private updateShow(command: Extract<ShowCommand, { type: 'show.update' }>): CommandResult {
    const nextDocument = clone(this.document)
    if (command.patch.title !== undefined) nextDocument.title = command.patch.title
    if (command.patch.theme !== undefined) nextDocument.theme = command.patch.theme
    if (command.patch.scoreConfig) {
      nextDocument.scoreConfig = { ...nextDocument.scoreConfig, ...command.patch.scoreConfig }
    }
    if (command.patch.audio) {
      nextDocument.audio = { ...nextDocument.audio, ...command.patch.audio }
    }
    if (command.patch.display) {
      nextDocument.display = { ...nextDocument.display, ...command.patch.display }
    }
    if (command.patch.finale) {
      nextDocument.finale = { ...nextDocument.finale, ...command.patch.finale }
    }

    if (
      command.patch.scoreConfig &&
      this.hasTransactionHistory() &&
      !this.historyFitsScoreConfig(nextDocument.scoreConfig)
    ) {
      return this.reject('The new score cap conflicts with saved history. Reset to a clean baseline first.')
    }

    nextDocument.baselineScores = normalizeScores(
      nextDocument.baselineScores,
      nextDocument.teams,
      nextDocument.scoreConfig,
    )
    // Cosmetic and audio changes are safe during a show and must not destroy
    // exact undo/redo history. Score-scale changes are guarded above because
    // their caps can invalidate historical before/after values.
    const nextRuntime = clone(this.runtime)
    nextRuntime.scores = normalizeScores(
      this.runtime.scores,
      nextDocument.teams,
      nextDocument.scoreConfig,
    )
    nextRuntime.activePresetIndex = Math.min(
      nextRuntime.activePresetIndex,
      nextDocument.scoreConfig.awardPresets.length - 1,
    )
    if (command.patch.audio) {
      nextRuntime.audio = { ...nextRuntime.audio, ...command.patch.audio }
    }

    return this.commitAdministrative(command.commandId, nextDocument, nextRuntime)
  }

  private replaceTeams(command: Extract<ShowCommand, { type: 'teams.replace' }>): CommandResult {
    if (this.hasTransactionHistory()) {
      return this.reject('Reset to a clean baseline before changing the team lineup')
    }
    const nextDocument = clone(this.document)
    nextDocument.teams = clone(command.teams)
    nextDocument.baselineScores = Object.fromEntries(
      command.teams.map((team) => [team.id, this.document.baselineScores[team.id] ?? 0]),
    )
    nextDocument.finale.mishapCount = Math.min(
      nextDocument.finale.mishapCount,
      command.teams.length,
    )

    const nextRuntime = this.freshAdministrativeRuntime()
    nextRuntime.scores = normalizeScores(
      Object.fromEntries(
        command.teams.map((team) => [team.id, this.runtime.scores[team.id] ?? 0]),
      ),
      command.teams,
      nextDocument.scoreConfig,
    )
    if (
      !nextRuntime.selectedTeamId ||
      !command.teams.some((team) => team.id === nextRuntime.selectedTeamId)
    ) {
      nextRuntime.selectedTeamId = command.teams[0]?.id ?? null
    }

    return this.commitAdministrative(command.commandId, nextDocument, nextRuntime)
  }

  private replaceCues(command: Extract<ShowCommand, { type: 'cues.replace' }>): CommandResult {
    if (this.hasTransactionHistory()) {
      return this.reject('Reset to a clean baseline before editing or reordering the cue deck')
    }
    const nextDocument = clone(this.document)
    nextDocument.cues = clone(command.cues)
    const nextRuntime = this.freshAdministrativeRuntime()
    nextRuntime.cueIndex = Math.min(this.runtime.cueIndex, command.cues.length)
    return this.commitAdministrative(command.commandId, nextDocument, nextRuntime)
  }

  private resetShow(command: Extract<ShowCommand, { type: 'show.reset' }>): CommandResult {
    this.runtime.scores =
      command.mode === 'baseline'
        ? normalizeScores(
            this.document.baselineScores,
            this.document.teams,
            this.document.scoreConfig,
          )
        : makeScoreMap(this.document.teams)
    this.runtime.cueIndex = 0
    this.runtime.finale = clone(IDLE_FINALE)
    this.runtime.animation = clone(IDLE_ANIMATION)
    this.runtime.undoStack = []
    this.runtime.redoStack = []
    this.bumpRevision()
    return this.finish(command.commandId, [])
  }

  private adjustScore(
    command: Extract<ShowCommand, { type: 'score.adjust' }>,
    source: CommandSource,
  ): CommandResult {
    if (!this.hasTeam(command.teamId)) return this.reject(`Unknown team ${command.teamId}`)
    const beforeScore = this.runtime.scores[command.teamId]
    const afterScore = clampScore(beforeScore + command.delta, this.document.scoreConfig)
    if (afterScore === beforeScore) return this.reject('Score is already at its configured limit')

    const before = this.reversibleState()
    const after = clone(before)
    after.scores[command.teamId] = afterScore
    const transaction = this.commitTransaction(command, source, 'manual-score', before, after)
    const event: ScoreChangeEvent = {
      type: 'score-change',
      reason: 'manual',
      changes: [
        {
          teamId: command.teamId,
          before: beforeScore,
          after: afterScore,
          delta: afterScore - beforeScore,
        },
      ],
      delivery: 'simultaneous',
      teamOrder: [command.teamId],
      stepDelayMs: 0,
    }
    return this.finish(command.commandId, [event], transaction)
  }

  private setScore(
    command: Extract<ShowCommand, { type: 'score.set' }>,
    source: CommandSource,
  ): CommandResult {
    if (!this.hasTeam(command.teamId)) return this.reject(`Unknown team ${command.teamId}`)
    const beforeScore = this.runtime.scores[command.teamId]
    const afterScore = clampScore(command.value, this.document.scoreConfig)
    if (afterScore === beforeScore) return this.reject('Score is unchanged')

    const before = this.reversibleState()
    const after = clone(before)
    after.scores[command.teamId] = afterScore
    const transaction = this.commitTransaction(command, source, 'manual-score', before, after)
    return this.finish(
      command.commandId,
      [
        {
          type: 'score-change',
          reason: 'manual',
          changes: [
            {
              teamId: command.teamId,
              before: beforeScore,
              after: afterScore,
              delta: afterScore - beforeScore,
            },
          ],
          delivery: 'simultaneous',
          teamOrder: [command.teamId],
          stepDelayMs: 0,
        },
      ],
      transaction,
    )
  }

  private executeCue(
    command: Extract<ShowCommand, { type: 'cue.execute' }>,
    source: CommandSource,
  ): CommandResult {
    if (this.runtime.animation.status !== 'idle') {
      return this.reject('Finish or skip the current animation before advancing')
    }
    const cue = this.document.cues[this.runtime.cueIndex]
    if (!cue) return this.reject('The cue deck is complete')
    if (cue.type === 'finale') {
      return this.reject('Arm and hold the Finale control to execute this cue safely')
    }

    const before = this.reversibleState()
    const after = clone(before)
    after.cueIndex += 1
    const events: StageEvent[] = []

    if (cue.type === 'score') {
      const applied = applyScoreDeltas(after.scores, cue.deltas, this.document.scoreConfig)
      after.scores = applied.scores
      const teamOrder = cue.mode === 'sequential'
        ? cue.teamOrder
        : cue.deltas.map((delta) => delta.teamId)
      events.push({
        type: 'score-change',
        reason: 'cue',
        cueId: cue.id,
        changes: applied.changes,
        delivery: cue.mode,
        teamOrder,
        stepDelayMs: cue.stepDelayMs,
      })
    } else if (cue.type === 'announcement') {
      events.push({
        type: 'announcement',
        cueId: cue.id,
        title: cue.title,
        message: cue.message,
        durationMs: cue.durationMs,
      })
    }

    const transaction = this.commitTransaction(command, source, 'cue', before, after, cue.id)
    this.runtime.animation = {
      status: 'playing',
      sequenceId: cue.id,
      sequenceType: cue.type === 'announcement' ? 'announcement' : cue.type,
    }
    return this.finish(command.commandId, events, transaction)
  }

  private rewindCue(command: Extract<ShowCommand, { type: 'cue.rewind' }>): CommandResult {
    const transaction = this.runtime.undoStack.at(-1)
    if (!transaction || transaction.kind !== 'cue' || !transaction.cueId) {
      return this.reject('The latest score change is not a cue; undo newer changes first')
    }

    this.runtime.undoStack.pop()
    this.runtime.redoStack.push(transaction)
    this.trimRedoHistory()
    const beforeScores = clone(this.runtime.scores)
    this.applyReversibleState(transaction.before)
    this.runtime.animation = clone(IDLE_ANIMATION)
    this.bumpRevision()
    const events: StageEvent[] = [
      this.historyScoreEvent(beforeScores, this.runtime.scores, 'rewind'),
      { type: 'cue-rewind', cueId: transaction.cueId },
    ]
    if (!equalFinale(transaction.after.finale, transaction.before.finale)) {
      events.push({ type: 'finale-state', finale: clone(this.runtime.finale) })
    }
    return this.finish(command.commandId, events)
  }

  private undo(command: Extract<ShowCommand, { type: 'history.undo' }>): CommandResult {
    const transaction = this.runtime.undoStack.pop()
    if (!transaction) return this.reject('There is nothing to undo')

    this.runtime.redoStack.push(transaction)
    this.trimRedoHistory()
    const beforeScores = clone(this.runtime.scores)
    this.applyReversibleState(transaction.before)
    this.runtime.animation = clone(IDLE_ANIMATION)
    this.bumpRevision()
    const events: StageEvent[] = [
      this.historyScoreEvent(beforeScores, this.runtime.scores, 'undo'),
    ]
    if (transaction.kind === 'cue' && transaction.cueId) {
      events.push({ type: 'cue-rewind', cueId: transaction.cueId })
    }
    if (!equalFinale(transaction.after.finale, transaction.before.finale)) {
      events.push({ type: 'finale-state', finale: clone(this.runtime.finale) })
    }
    return this.finish(command.commandId, events)
  }

  private redo(command: Extract<ShowCommand, { type: 'history.redo' }>): CommandResult {
    const transaction = this.runtime.redoStack.pop()
    if (!transaction) return this.reject('There is nothing to redo')

    this.runtime.undoStack.push(transaction)
    if (this.runtime.undoStack.length > MAX_HISTORY_TRANSACTIONS) {
      this.runtime.undoStack = this.runtime.undoStack.slice(-MAX_HISTORY_TRANSACTIONS)
    }
    const beforeScores = clone(this.runtime.scores)
    this.applyReversibleState(transaction.after)
    this.runtime.animation = clone(IDLE_ANIMATION)
    this.bumpRevision()
    const events: StageEvent[] = [
      this.historyScoreEvent(beforeScores, this.runtime.scores, 'redo'),
    ]
    if (transaction.kind === 'cue' && transaction.cueId) {
      const cue = this.document.cues.find((item) => item.id === transaction.cueId)
      if (cue?.type === 'announcement') {
        events.push({
          type: 'announcement',
          cueId: cue.id,
          title: cue.title,
          message: cue.message,
          durationMs: cue.durationMs,
        })
      }
    }
    if (!equalFinale(transaction.after.finale, transaction.before.finale)) {
      events.push({ type: 'finale-state', finale: clone(this.runtime.finale) })
    }
    return this.finish(command.commandId, events)
  }

  private selectTeam(command: Extract<ShowCommand, { type: 'team.select' }>): CommandResult {
    if (!this.hasTeam(command.teamId)) return this.reject(`Unknown team ${command.teamId}`)
    this.runtime.selectedTeamId = command.teamId
    this.bumpRevision()
    return this.finish(command.commandId, [
      { type: 'selection-change', teamId: command.teamId },
    ])
  }

  private selectPreset(command: Extract<ShowCommand, { type: 'preset.select' }>): CommandResult {
    if (command.presetIndex >= this.document.scoreConfig.awardPresets.length) {
      return this.reject('Preset index is out of range')
    }
    this.runtime.activePresetIndex = command.presetIndex
    this.bumpRevision()
    return this.finish(command.commandId, [])
  }

  private setAudio(command: Extract<ShowCommand, { type: 'audio.set' }>): CommandResult {
    const key = `${command.channel}Volume` as 'masterVolume' | 'sfxVolume' | 'ambienceVolume'
    this.runtime.audio[key] = command.value
    this.bumpRevision()
    return this.finish(command.commandId, [
      { type: 'audio-change', audio: clone(this.runtime.audio) },
    ])
  }

  private setMuted(command: Extract<ShowCommand, { type: 'audio.mute' }>): CommandResult {
    this.runtime.audio.muted = command.muted ?? !this.runtime.audio.muted
    this.bumpRevision()
    return this.finish(command.commandId, [
      { type: 'audio-change', audio: clone(this.runtime.audio) },
    ])
  }

  private pauseAnimation(command: Extract<ShowCommand, { type: 'animation.pause' }>): CommandResult {
    if (this.runtime.animation.status !== 'playing') return this.reject('No animation is playing')
    this.runtime.animation.status = 'paused'
    if (this.runtime.finale.status === 'running' || this.runtime.finale.status === 'countdown') {
      if (this.runtime.finale.status === 'countdown') this.pauseFinaleCountdownClock()
      this.runtime.finale.pausedFrom = this.runtime.finale.status
      this.runtime.finale.status = 'paused'
    }
    this.bumpRevision()
    return this.finish(command.commandId, [
      { type: 'animation-state', animation: clone(this.runtime.animation), settle: false },
    ])
  }

  private resumeAnimation(command: Extract<ShowCommand, { type: 'animation.resume' }>): CommandResult {
    if (this.runtime.animation.status !== 'paused') return this.reject('No animation is paused')
    this.runtime.animation.status = 'playing'
    if (this.runtime.finale.status === 'paused') {
      const phase = this.runtime.finale.pausedFrom ?? 'running'
      this.runtime.finale.status = phase
      delete this.runtime.finale.pausedFrom
      if (phase === 'countdown') this.resumeFinaleCountdownClock()
    }
    this.bumpRevision()
    return this.finish(command.commandId, [
      { type: 'animation-state', animation: clone(this.runtime.animation), settle: false },
    ])
  }

  private finishAnimation(
    command: Extract<ShowCommand, { type: 'animation.skip' | 'animation.complete' }>,
    skipped: boolean,
  ): CommandResult {
    if (this.runtime.animation.status === 'idle') return this.reject('No animation is active')
    if (
      this.runtime.animation.sequenceType === 'finale' &&
      (this.runtime.finale.status === 'countdown' ||
        this.runtime.finale.status === 'running' ||
        this.runtime.finale.status === 'paused')
    ) {
      this.runtime.finale.status = 'complete'
      this.runtime.finale.currentGroupIndex = this.runtime.finale.plan?.groups.length ?? 0
      delete this.runtime.finale.pausedFrom
      this.clearFinaleCountdownClock()
    }
    this.runtime.animation = clone(IDLE_ANIMATION)
    this.bumpRevision()
    const events: StageEvent[] = [
      { type: 'animation-state', animation: clone(this.runtime.animation), settle: skipped },
    ]
    if (this.runtime.finale.status === 'complete') {
      events.push({ type: 'finale-state', finale: clone(this.runtime.finale) })
    }
    return this.finish(command.commandId, events)
  }

  private startFinale(
    command: Extract<ShowCommand, { type: 'finale.start' }>,
    source: CommandSource,
  ): CommandResult {
    if (!command.confirmed) return this.reject('Finale start must be armed and confirmed')
    if (this.runtime.animation.status !== 'idle') {
      return this.reject('Finish or skip the current animation before starting the finale')
    }
    const finaleCue = this.document.cues[this.runtime.cueIndex]
    let transaction: Transaction | undefined
    if (finaleCue?.type === 'finale') {
      const before = this.reversibleState()
      const after = clone(before)
      after.cueIndex += 1
      after.finale = this.makeFinaleRuntime(after.scores)
      transaction = this.commitTransaction(command, source, 'cue', before, after, finaleCue.id)
    } else {
      this.runtime.finale = this.makeFinaleRuntime(this.runtime.scores)
      this.bumpRevision()
    }
    this.runtime.animation = {
      status: 'playing',
      sequenceId: `finale-${this.runtime.revision}`,
      sequenceType: 'finale',
    }
    return this.finish(command.commandId, [
      { type: 'finale-state', finale: clone(this.runtime.finale) },
    ], transaction)
  }

  private pauseFinale(command: Extract<ShowCommand, { type: 'finale.pause' }>): CommandResult {
    if (this.runtime.finale.status !== 'countdown' && this.runtime.finale.status !== 'running') {
      return this.reject('The finale is not running')
    }
    if (this.runtime.finale.status === 'countdown') this.pauseFinaleCountdownClock()
    this.runtime.finale.pausedFrom = this.runtime.finale.status
    this.runtime.finale.status = 'paused'
    this.runtime.animation.status = 'paused'
    this.bumpRevision()
    return this.finish(command.commandId, [
      { type: 'finale-state', finale: clone(this.runtime.finale) },
    ])
  }

  private resumeFinale(command: Extract<ShowCommand, { type: 'finale.resume' }>): CommandResult {
    if (this.runtime.finale.status !== 'paused') return this.reject('The finale is not paused')
    const phase = this.runtime.finale.pausedFrom ?? 'running'
    this.runtime.finale.status = phase
    delete this.runtime.finale.pausedFrom
    if (phase === 'countdown') this.resumeFinaleCountdownClock()
    this.runtime.animation.status = 'playing'
    this.bumpRevision()
    return this.finish(command.commandId, [
      { type: 'finale-state', finale: clone(this.runtime.finale) },
    ])
  }

  private skipFinaleGroup(command: Extract<ShowCommand, { type: 'finale.skip' }>): CommandResult {
    if (
      this.runtime.finale.status !== 'countdown' &&
      this.runtime.finale.status !== 'running' &&
      this.runtime.finale.status !== 'paused'
    ) {
      return this.reject('The finale is not active')
    }
    const groupCount = this.runtime.finale.plan?.groups.length ?? 0
    const paused = this.runtime.finale.status === 'paused'
    const phase = paused
      ? this.runtime.finale.pausedFrom ?? 'running'
      : this.runtime.finale.status
    if (phase === 'countdown') {
      // The coordinator's first tick ends the countdown and starts group zero.
      // Later ticks skip/complete the currently active launch group.
      this.runtime.finale.status = groupCount > 0
        ? paused ? 'paused' : 'running'
        : 'complete'
      if (paused && groupCount > 0) this.runtime.finale.pausedFrom = 'running'
      this.clearFinaleCountdownClock()
    } else {
      this.runtime.finale.currentGroupIndex += 1
      this.runtime.finale.status =
        this.runtime.finale.currentGroupIndex >= groupCount
          ? 'complete'
          : paused
            ? 'paused'
            : 'running'
      if (paused && this.runtime.finale.status === 'paused') {
        this.runtime.finale.pausedFrom = 'running'
      }
    }
    if (this.runtime.finale.status === 'complete') this.runtime.animation = clone(IDLE_ANIMATION)
    if (this.runtime.finale.status === 'complete') delete this.runtime.finale.pausedFrom
    this.bumpRevision()
    return this.finish(command.commandId, [
      { type: 'finale-state', finale: clone(this.runtime.finale) },
    ])
  }

  private cancelFinale(command: Extract<ShowCommand, { type: 'finale.cancel' }>): CommandResult {
    if (this.runtime.finale.status === 'idle') return this.reject('The finale has not started')
    this.runtime.finale.status = 'cancelled'
    delete this.runtime.finale.pausedFrom
    this.clearFinaleCountdownClock()
    this.runtime.animation = clone(IDLE_ANIMATION)
    this.bumpRevision()
    return this.finish(command.commandId, [
      { type: 'finale-state', finale: clone(this.runtime.finale) },
    ])
  }

  private replayFinale(command: Extract<ShowCommand, { type: 'finale.replay' }>): CommandResult {
    if (!command.confirmed) return this.reject('Finale replay must be armed and confirmed')
    if (!this.runtime.finale.plan) return this.reject('There is no finale to replay')
    // Replay preserves the original frozen scoreboard, but it must honor any
    // deliberate finale-setting corrections made after the first run. Keeping
    // the entire old plan made a bottom-1 tied cutoff remain mishap-free even
    // after the presenter changed the setting to bottom 2 and replayed.
    this.runtime.finale.plan = computeFinalePlan(
      this.document.teams,
      this.runtime.finale.plan.frozenScores,
      this.document.finale,
    )
    this.runtime.finale.status = 'countdown'
    this.runtime.finale.currentGroupIndex = 0
    delete this.runtime.finale.pausedFrom
    this.startFinaleCountdownClock()
    this.runtime.animation = {
      status: 'playing',
      sequenceId: `finale-replay-${this.runtime.revision + 1}`,
      sequenceType: 'finale',
    }
    this.bumpRevision()
    return this.finish(command.commandId, [
      { type: 'finale-state', finale: clone(this.runtime.finale) },
    ])
  }

  private commitAdministrative(
    commandId: string,
    nextDocument: RocketShow,
    nextRuntime: RuntimeCheckpoint,
  ): CommandResult {
    nextRuntime.revision = this.runtime.revision + 1
    nextRuntime.updatedAt = this.nowIso()
    nextDocument.updatedAt = nextRuntime.updatedAt
    nextDocument.runtime = clone(nextRuntime)
    const validated = RocketShowSchema.safeParse(nextDocument)
    if (!validated.success) {
      return this.reject(validated.error.issues[0]?.message ?? 'Show update is invalid')
    }
    this.document = clone(validated.data as RocketShow)
    this.runtime = nextRuntime
    return this.finish(commandId, [])
  }

  private freshAdministrativeRuntime(): RuntimeCheckpoint {
    return {
      ...clone(this.runtime),
      animation: clone(IDLE_ANIMATION),
      finale: clone(IDLE_FINALE),
      undoStack: [],
      redoStack: [],
    }
  }

  private commitTransaction(
    command: ShowCommand,
    source: CommandSource,
    kind: TransactionKind,
    before: ReversibleState,
    after: ReversibleState,
    cueId?: string,
  ): Transaction {
    this.applyReversibleState(after)
    this.runtime.revision += 1
    const transaction: Transaction = {
      id: this.idFactory(),
      commandId: command.commandId,
      kind,
      source,
      timestamp: this.nowIso(),
      revision: this.runtime.revision,
      ...(cueId ? { cueId } : {}),
      before: clone(before),
      after: clone(after),
    }
    this.runtime.undoStack.push(transaction)
    if (this.runtime.undoStack.length > MAX_HISTORY_TRANSACTIONS) {
      this.runtime.undoStack = this.runtime.undoStack.slice(-MAX_HISTORY_TRANSACTIONS)
    }
    this.runtime.redoStack = []
    return clone(transaction)
  }

  private reversibleState(): ReversibleState {
    return clone({
      scores: this.runtime.scores,
      cueIndex: this.runtime.cueIndex,
      finale: this.runtime.finale,
    })
  }

  private applyReversibleState(state: ReversibleState): void {
    this.runtime.scores = clone(state.scores)
    this.runtime.cueIndex = state.cueIndex
    this.runtime.finale = clone(state.finale)
  }

  private makeFinaleRuntime(scores: Record<string, number>): FinaleRuntimeState {
    const finale: FinaleRuntimeState = {
      status: 'countdown',
      plan: computeFinalePlan(this.document.teams, scores, this.document.finale),
      currentGroupIndex: 0,
    }
    this.setFinaleCountdownDeadline(finale, finale.plan?.groups[0]?.launchAtMs ?? 0)
    return finale
  }

  private startFinaleCountdownClock(): void {
    const duration = this.runtime.finale.plan?.groups[0]?.launchAtMs ?? 0
    this.setFinaleCountdownDeadline(this.runtime.finale, duration)
  }

  private pauseFinaleCountdownClock(): void {
    const deadline = this.runtime.finale.countdownEndsAt
      ? Date.parse(this.runtime.finale.countdownEndsAt)
      : Number.NaN
    const fallback = this.runtime.finale.plan?.groups[0]?.launchAtMs ?? 0
    this.runtime.finale.countdownRemainingMs = Math.max(
      0,
      Math.ceil(Number.isFinite(deadline) ? deadline - this.nowMs() : fallback),
    )
    delete this.runtime.finale.countdownEndsAt
  }

  private resumeFinaleCountdownClock(): void {
    const fallback = this.runtime.finale.plan?.groups[0]?.launchAtMs ?? 0
    this.setFinaleCountdownDeadline(
      this.runtime.finale,
      this.runtime.finale.countdownRemainingMs ?? fallback,
    )
  }

  private setFinaleCountdownDeadline(finale: FinaleRuntimeState, durationMs: number): void {
    finale.countdownEndsAt = new Date(this.nowMs() + Math.max(0, Math.trunc(durationMs))).toISOString()
    delete finale.countdownRemainingMs
  }

  private clearFinaleCountdownClock(): void {
    delete this.runtime.finale.countdownEndsAt
    delete this.runtime.finale.countdownRemainingMs
  }

  private historyScoreEvent(
    before: Record<string, number>,
    after: Record<string, number>,
    reason: ScoreChangeEvent['reason'],
  ): ScoreChangeEvent {
    return {
      type: 'score-change',
      reason,
      changes: diffScores(
        before,
        after,
        this.document.teams.map((team) => team.id),
      ),
      delivery: 'simultaneous',
      teamOrder: this.document.teams.map((team) => team.id),
      stepDelayMs: 0,
    }
  }

  private createBaselineCheckpoint(): RuntimeCheckpoint {
    return {
      scores: normalizeScores(
        this.document.baselineScores,
        this.document.teams,
        this.document.scoreConfig,
      ),
      cueIndex: 0,
      revision: 0,
      selectedTeamId: this.document.teams[0]?.id ?? null,
      activePresetIndex: 0,
      audio: clone(this.document.audio),
      animation: clone(IDLE_ANIMATION),
      finale: clone(IDLE_FINALE),
      undoStack: [],
      redoStack: [],
      recentCommandIds: [],
      updatedAt: this.nowIso(),
    }
  }

  private bumpRevision(): void {
    this.runtime.revision += 1
  }

  private finish(
    commandId: string,
    events: StageEvent[],
    transaction?: Transaction,
  ): CommandResult {
    this.runtime.recentCommandIds = [
      ...this.runtime.recentCommandIds.filter((id) => id !== commandId),
      commandId,
    ].slice(-MAX_RECENT_COMMANDS)
    this.runtime.updatedAt = this.nowIso()
    this.document.updatedAt = this.runtime.updatedAt
    const snapshot = this.getSnapshot()
    const messages: StageMessage[] = [
      ...events.map(
        (event): StageMessage => ({
          type: 'event',
          revision: this.runtime.revision,
          event: clone(event),
        }),
      ),
      { type: 'snapshot', snapshot },
    ]
    return {
      accepted: true,
      duplicate: false,
      snapshot,
      ...(transaction ? { transaction } : {}),
      messages,
    }
  }

  private reject(reason: string): CommandResult {
    return {
      accepted: false,
      duplicate: false,
      reason,
      snapshot: this.getSnapshot(),
      messages: [],
    }
  }

  private hasTeam(teamId: string): boolean {
    return this.document.teams.some((team) => team.id === teamId)
  }

  private hasTransactionHistory(): boolean {
    return this.runtime.cueIndex > 0 ||
      this.runtime.undoStack.length > 0 ||
      this.runtime.redoStack.length > 0
  }

  private isFinaleActive(): boolean {
    return this.runtime.finale.status === 'countdown' ||
      this.runtime.finale.status === 'running' ||
      this.runtime.finale.status === 'paused'
  }

  private historyFitsScoreConfig(config: RocketShow['scoreConfig']): boolean {
    const maximum = config.tankCapacity * (config.overflowEnabled ? 2 : 1)
    const fits = (scores: Record<string, number>): boolean =>
      Object.values(scores).every((score) => score >= 0 && score <= maximum)
    return fits(this.runtime.scores) &&
      [...this.runtime.undoStack, ...this.runtime.redoStack].every((transaction) =>
        fits(transaction.before.scores) && fits(transaction.after.scores),
      )
  }

  private trimRedoHistory(): void {
    if (this.runtime.redoStack.length > MAX_HISTORY_TRANSACTIONS) {
      this.runtime.redoStack = this.runtime.redoStack.slice(-MAX_HISTORY_TRANSACTIONS)
    }
  }

  private nowIso(): string {
    return new Date(this.nowMs()).toISOString()
  }

  private nowMs(): number {
    const value = this.now()
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.valueOf())) throw new RangeError('ShowEngine now() returned an invalid date')
    return date.valueOf()
  }
}

function equalFinale(left: FinaleRuntimeState, right: FinaleRuntimeState): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
