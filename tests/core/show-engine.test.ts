import { describe, expect, it } from 'vitest'

import {
  RocketShowSchema,
  ShowEngine,
  createDefaultShow,
  createDefaultTeams,
  type RocketShow,
} from '../../src/shared'

function engineFor(show: RocketShow = createDefaultShow()): ShowEngine {
  let id = 0
  return new ShowEngine(show, {
    mode: 'baseline',
    now: () => '2026-07-11T08:00:00.000Z',
    idFactory: () => `transaction-${++id}`,
  })
}

describe('manual score commands', () => {
  it('records every real rapid input as its own exact transaction', () => {
    const engine = engineFor()
    for (let index = 1; index <= 7; index += 1) {
      expect(
        engine.dispatch({
          type: 'score.adjust',
          commandId: `rapid-${index}`,
          teamId: 'team-1',
          delta: 1,
        }).accepted,
      ).toBe(true)
    }

    expect(engine.getSnapshot().scores['team-1']).toBe(7)
    expect(engine.getCheckpoint().undoStack).toHaveLength(7)
    expect(engine.getCheckpoint().undoStack.map((entry) => entry.revision)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ])
  })

  it('clamps at zero/primary capacity and expands to exactly two tanks with overflow', () => {
    const engine = engineFor()
    const capped = engine.dispatch({
      type: 'score.set',
      commandId: 'set-high',
      teamId: 'team-1',
      value: 99,
    })
    expect(capped.snapshot.scores['team-1']).toBe(10)
    expect(
      engine.dispatch({
        type: 'score.adjust',
        commandId: 'at-limit',
        teamId: 'team-1',
        delta: 1,
      }).accepted,
    ).toBe(false)

    expect(
      engine.dispatch({
        type: 'show.update',
        commandId: 'enable-overflow',
        patch: { scoreConfig: { overflowEnabled: true } },
      }).accepted,
    ).toBe(true)
    expect(
      engine.dispatch({
        type: 'score.set',
        commandId: 'set-overflow',
        teamId: 'team-1',
        value: 99,
      }).snapshot.scores['team-1'],
    ).toBe(20)
  })

  it('deduplicates accepted command IDs without applying them twice', () => {
    const engine = engineFor()
    const command = {
      type: 'score.adjust' as const,
      commandId: 'remote-command-123',
      teamId: 'team-1',
      delta: 3,
    }
    expect(engine.dispatch(command, 'remote').duplicate).toBe(false)
    const duplicate = engine.dispatch(command, 'remote')

    expect(duplicate.accepted).toBe(true)
    expect(duplicate.duplicate).toBe(true)
    expect(duplicate.messages).toEqual([])
    expect(duplicate.snapshot.scores['team-1']).toBe(3)
    expect(duplicate.snapshot.revision).toBe(1)
  })
})

describe('cue playback and history', () => {
  it('executes a simultaneous cue atomically and locks deck advancement until settled', () => {
    const show = createDefaultShow()
    show.cues = [
      {
        id: 'cue-score',
        type: 'score',
        title: 'Both teams score',
        deltas: [
          { teamId: 'team-1', delta: 3 },
          { teamId: 'team-2', delta: 2 },
        ],
        mode: 'simultaneous',
        teamOrder: [],
        stepDelayMs: 0,
      },
      {
        id: 'cue-news',
        type: 'announcement',
        title: 'Mission update',
        message: 'Prepare for launch!',
        durationMs: 2_000,
      },
    ]
    const engine = engineFor(show)

    const scoreCue = engine.dispatch({ type: 'cue.execute', commandId: 'cue-go-1' })
    expect(scoreCue.accepted).toBe(true)
    expect(scoreCue.snapshot.scores).toMatchObject({ 'team-1': 3, 'team-2': 2 })
    expect(scoreCue.snapshot.cueIndex).toBe(1)
    expect(scoreCue.snapshot.animation).toMatchObject({
      status: 'playing',
      sequenceId: 'cue-score',
      sequenceType: 'score',
    })
    expect(engine.dispatch({ type: 'cue.execute', commandId: 'too-soon' }).accepted).toBe(false)

    engine.dispatch({ type: 'animation.complete', commandId: 'score-settled' })
    const announcement = engine.dispatch({ type: 'cue.execute', commandId: 'cue-go-2' })
    expect(announcement.accepted).toBe(true)
    expect(announcement.snapshot.cueIndex).toBe(2)
    expect(
      announcement.messages.some(
        (message) => message.type === 'event' && message.event.type === 'announcement',
      ),
    ).toBe(true)
  })

  it('preserves sequential order and timing in the transient animation event', () => {
    const show = createDefaultShow()
    show.cues = [
      {
        id: 'cue-sequential',
        type: 'score',
        title: 'One at a time',
        deltas: [
          { teamId: 'team-1', delta: 1 },
          { teamId: 'team-3', delta: 4 },
        ],
        mode: 'sequential',
        teamOrder: ['team-3', 'team-1'],
        stepDelayMs: 750,
      },
    ]
    const result = engineFor(show).dispatch({ type: 'cue.execute', commandId: 'sequence' })
    const event = result.messages.find(
      (message) => message.type === 'event' && message.event.type === 'score-change',
    )

    expect(event).toMatchObject({
      type: 'event',
      event: {
        type: 'score-change',
        delivery: 'sequential',
        teamOrder: ['team-3', 'team-1'],
        stepDelayMs: 750,
      },
    })
  })

  it('undoes and redoes mixed manual and cue transactions exactly', () => {
    const show = createDefaultShow()
    show.cues = [
      {
        id: 'cue-points',
        type: 'score',
        title: 'Cue points',
        deltas: [
          { teamId: 'team-1', delta: 2 },
          { teamId: 'team-2', delta: 4 },
        ],
        mode: 'simultaneous',
        teamOrder: [],
        stepDelayMs: 0,
      },
    ]
    const engine = engineFor(show)

    engine.dispatch({
      type: 'score.adjust',
      commandId: 'manual-before',
      teamId: 'team-1',
      delta: 3,
    })
    engine.dispatch({ type: 'cue.execute', commandId: 'cue-execute' })
    engine.dispatch({ type: 'animation.complete', commandId: 'cue-settle' })
    engine.dispatch({
      type: 'score.adjust',
      commandId: 'manual-after',
      teamId: 'team-2',
      delta: -1,
    })
    expect(engine.getSnapshot()).toMatchObject({
      scores: { 'team-1': 5, 'team-2': 3 },
      cueIndex: 1,
    })

    engine.dispatch({ type: 'history.undo', commandId: 'undo-manual' })
    expect(engine.getSnapshot().scores).toMatchObject({ 'team-1': 5, 'team-2': 4 })

    engine.dispatch({ type: 'history.undo', commandId: 'undo-cue' })
    expect(engine.getSnapshot()).toMatchObject({
      scores: { 'team-1': 3, 'team-2': 0 },
      cueIndex: 0,
      canRedo: true,
    })

    engine.dispatch({ type: 'history.redo', commandId: 'redo-cue' })
    expect(engine.getSnapshot()).toMatchObject({
      scores: { 'team-1': 5, 'team-2': 4 },
      cueIndex: 1,
    })
  })

  it('only rewinds a cue when it is the newest transaction', () => {
    const show = createDefaultShow()
    show.cues = [
      {
        id: 'cue-points',
        type: 'score',
        title: 'Cue points',
        deltas: [{ teamId: 'team-1', delta: 5 }],
        mode: 'simultaneous',
        teamOrder: [],
        stepDelayMs: 0,
      },
    ]
    const engine = engineFor(show)
    engine.dispatch({ type: 'cue.execute', commandId: 'play' })
    engine.dispatch({ type: 'animation.complete', commandId: 'settle' })
    engine.dispatch({
      type: 'score.adjust',
      commandId: 'newer-change',
      teamId: 'team-2',
      delta: 1,
    })

    expect(engine.dispatch({ type: 'cue.rewind', commandId: 'bad-rewind' }).accepted).toBe(false)
    engine.dispatch({ type: 'history.undo', commandId: 'undo-newer' })
    expect(engine.dispatch({ type: 'cue.rewind', commandId: 'good-rewind' }).accepted).toBe(true)
    expect(engine.getSnapshot()).toMatchObject({
      scores: { 'team-1': 0, 'team-2': 0 },
      cueIndex: 0,
    })
  })
})

describe('authoring, checkpoints, and finale runtime', () => {
  it('updates configuration and reconciles team-preserved scores in the authoritative engine', () => {
    const engine = engineFor()
    engine.dispatch({
      type: 'score.adjust',
      commandId: 'score-first',
      teamId: 'team-1',
      delta: 4,
    })
    const updated = engine.dispatch({
      type: 'show.update',
      commandId: 'configure',
      patch: {
        title: 'Galaxy Games',
        theme: 'cartoon',
        scoreConfig: { tankCapacity: 20, awardPresets: [1, 3, 5] },
        display: { particleLevel: 'low' },
      },
    })

    expect(updated.snapshot).toMatchObject({
      title: 'Galaxy Games',
      theme: 'cartoon',
      scoreConfig: { tankCapacity: 20, awardPresets: [1, 3, 5] },
      display: { particleLevel: 'low' },
      scores: { 'team-1': 4 },
      canUndo: true,
    })

    const newTeams = createDefaultTeams(5).map((team, index) => ({
      ...team,
      name: `Rocket Crew ${index + 1}`,
    }))
    const replaced = engine.dispatch({
      type: 'teams.replace',
      commandId: 'replace-teams',
      teams: newTeams,
    })
    expect(replaced.accepted).toBe(false)
    engine.dispatch({ type: 'show.reset', commandId: 'reset-before-lineup', mode: 'baseline' })
    const replacedAfterReset = engine.dispatch({
      type: 'teams.replace',
      commandId: 'replace-teams-clean',
      teams: newTeams,
    })
    expect(replacedAfterReset.snapshot.teams).toHaveLength(5)
    expect(replacedAfterReset.snapshot.scores).toMatchObject({ 'team-1': 0, 'team-5': 0 })
  })

  it('validates cue replacement against the active team roster', () => {
    const engine = engineFor()
    const invalid = engine.dispatch({
      type: 'cues.replace',
      commandId: 'bad-cues',
      cues: [
        {
          id: 'bad',
          type: 'score',
          title: 'Bad cue',
          deltas: [{ teamId: 'missing-team', delta: 1 }],
          mode: 'simultaneous',
          teamOrder: [],
          stepDelayMs: 0,
        },
      ],
    })
    expect(invalid.accepted).toBe(false)
    expect(engine.getSnapshot().cues).toEqual([])
  })

  it('rejects team removal when an existing cue would become dangling', () => {
    const show = createDefaultShow()
    show.cues = [
      {
        id: 'team-four-cue',
        type: 'score',
        title: 'Team four scores',
        deltas: [{ teamId: 'team-4', delta: 1 }],
        mode: 'sequential',
        teamOrder: ['team-4'],
        stepDelayMs: 500,
      },
    ]
    const engine = engineFor(show)
    const result = engine.dispatch({
      type: 'teams.replace',
      commandId: 'remove-team-four',
      teams: createDefaultTeams(3),
    })

    expect(result.accepted).toBe(false)
    expect(result.reason).toMatch(/unknown team/i)
    expect(engine.getSnapshot().teams).toHaveLength(4)
    expect(engine.getSnapshot().cues[0]).toMatchObject({ id: 'team-four-cue' })
  })

  it('exports an exact checkpoint and can resume or replay its baseline', () => {
    const engine = engineFor()
    engine.dispatch({
      type: 'score.adjust',
      commandId: 'score',
      teamId: 'team-3',
      delta: 6,
    })
    const exported = engine.exportShow(true)
    expect(RocketShowSchema.safeParse(exported).success).toBe(true)

    const resumed = new ShowEngine(exported, { mode: 'resume' })
    const replayed = new ShowEngine(exported, { mode: 'baseline' })
    expect(resumed.getSnapshot().scores['team-3']).toBe(6)
    expect(resumed.getSnapshot().canUndo).toBe(true)
    expect(replayed.getSnapshot().scores['team-3']).toBe(0)
    expect(replayed.getSnapshot().canUndo).toBe(false)
  })

  it('creates an independent rehearsal clone at the current checkpoint', () => {
    const engine = engineFor()
    engine.dispatch({
      type: 'score.adjust',
      commandId: 'live-score',
      teamId: 'team-2',
      delta: 4,
    })
    const rehearsal = engine.cloneForRehearsal()
    rehearsal.dispatch({
      type: 'score.adjust',
      commandId: 'rehearsal-only',
      teamId: 'team-2',
      delta: 3,
    })

    expect(rehearsal.getSnapshot().scores['team-2']).toBe(7)
    expect(engine.getSnapshot().scores['team-2']).toBe(4)
  })

  it('resets to either baseline or zero without changing the saved baseline', () => {
    const show = createDefaultShow()
    show.baselineScores['team-1'] = 2
    const engine = engineFor(show)
    engine.dispatch({
      type: 'score.set',
      commandId: 'change',
      teamId: 'team-1',
      value: 7,
    })
    expect(
      engine.dispatch({ type: 'show.reset', commandId: 'baseline-reset', mode: 'baseline' })
        .snapshot.scores['team-1'],
    ).toBe(2)
    expect(
      engine.dispatch({ type: 'show.reset', commandId: 'zero-reset', mode: 'zero' }).snapshot
        .scores['team-1'],
    ).toBe(0)
    expect(engine.getSnapshot().baselineScores['team-1']).toBe(2)
  })

  it('freezes finale scores, leaves real scores untouched, and replays the same scoreboard', () => {
    const engine = engineFor()
    engine.dispatch({
      type: 'score.set',
      commandId: 'leader',
      teamId: 'team-1',
      value: 9,
    })
    const started = engine.dispatch({
      type: 'finale.start',
      commandId: 'finale-start',
      confirmed: true,
    })
    const frozen = started.snapshot.finale.plan?.frozenScores
    expect(started.snapshot.finale.status).toBe('countdown')
    expect(frozen?.['team-1']).toBe(9)
    expect(started.snapshot.scores['team-1']).toBe(9)

    const lateCorrection = engine.dispatch({
      type: 'score.adjust',
      commandId: 'late-correction',
      teamId: 'team-1',
      delta: 1,
    })
    expect(lateCorrection.accepted).toBe(false)
    expect(engine.getSnapshot().scores['team-1']).toBe(9)
    expect(engine.getSnapshot().finale.plan?.frozenScores['team-1']).toBe(9)

    engine.dispatch({ type: 'animation.complete', commandId: 'finale-finished' })
    const replayed = engine.dispatch({
      type: 'finale.replay',
      commandId: 'finale-replay',
      confirmed: true,
    })
    expect(replayed.snapshot.finale.plan?.frozenScores).toEqual(frozen)
    expect(replayed.snapshot.scores['team-1']).toBe(9)
  })

  it('replays frozen scores with the latest finale cutoff and timing settings', () => {
    const engine = engineFor()
    const scores = [10, 6, 1, 1]
    scores.forEach((value, index) => {
      engine.dispatch({
        type: 'score.set',
        commandId: `replay-setting-score-${index}`,
        teamId: `team-${index + 1}`,
        value,
      })
    })
    const started = engine.dispatch({
      type: 'finale.start',
      commandId: 'replay-setting-start',
      confirmed: true,
    })
    expect(started.snapshot.finale.plan?.requestedMishapCount).toBe(1)
    expect(started.snapshot.finale.plan?.actualMishapTeamIds).toEqual([])
    engine.dispatch({ type: 'animation.complete', commandId: 'replay-setting-complete' })

    engine.dispatch({
      type: 'show.update',
      commandId: 'replay-setting-update',
      patch: {
        finale: {
          mishapCount: 2,
          countdownSeconds: 3,
          targetDurationMs: 45_000,
        },
      },
    })
    const replayed = engine.dispatch({
      type: 'finale.replay',
      commandId: 'replay-setting-replay',
      confirmed: true,
    })

    expect(replayed.snapshot.finale.plan?.frozenScores).toEqual(
      started.snapshot.finale.plan?.frozenScores,
    )
    expect(replayed.snapshot.finale.plan?.requestedMishapCount).toBe(2)
    expect(replayed.snapshot.finale.plan?.actualMishapTeamIds).toEqual(['team-3', 'team-4'])
    expect(replayed.snapshot.finale.plan?.groups[0].launchAtMs).toBe(3_000)
    expect(replayed.snapshot.finale.plan?.targetDurationMs).toBe(45_000)
  })

  it('keeps the scoreboard frozen while completed finale results are displayed', () => {
    const engine = engineFor()
    engine.dispatch({
      type: 'score.set',
      commandId: 'results-lock-leader',
      teamId: 'team-1',
      value: 8,
    })
    engine.dispatch({ type: 'finale.start', commandId: 'results-lock-start', confirmed: true })
    engine.dispatch({ type: 'animation.complete', commandId: 'results-lock-complete' })

    const rejected = engine.dispatch({
      type: 'score.adjust',
      commandId: 'results-lock-adjust',
      teamId: 'team-2',
      delta: 10,
    })
    expect(rejected.accepted).toBe(false)
    expect(rejected.reason).toMatch(/Final results are displayed/)
    expect(rejected.snapshot.scores['team-2']).toBe(0)

    engine.dispatch({ type: 'finale.cancel', commandId: 'results-lock-exit' })
    expect(engine.dispatch({
      type: 'score.adjust',
      commandId: 'results-lock-adjust-after-exit',
      teamId: 'team-2',
      delta: 1,
    }).accepted).toBe(true)
  })

  it('denies setup and finale arming commands from the mobile remote', () => {
    const engine = engineFor()
    expect(
      engine.dispatch(
        {
          type: 'show.update',
          commandId: 'remote-setup',
          patch: { title: 'Hijacked' },
        },
        'remote',
      ).accepted,
    ).toBe(false)
    expect(
      engine.dispatch(
        { type: 'finale.start', commandId: 'remote-finale', confirmed: true },
        'remote',
      ).accepted,
    ).toBe(false)
  })

  it('handles selection, presets, sound, and animation transport without polluting score undo', () => {
    const show = createDefaultShow()
    show.scoreConfig.awardPresets = [1, 3]
    show.cues = [
      {
        id: 'transport-cue',
        type: 'announcement',
        title: 'Transport test',
        message: 'Testing pause and skip',
        durationMs: 1_000,
      },
    ]
    const engine = engineFor(show)

    expect(
      engine.dispatch({ type: 'team.select', commandId: 'select', teamId: 'team-4' }).snapshot
        .selectedTeamId,
    ).toBe('team-4')
    expect(
      engine.dispatch({ type: 'preset.select', commandId: 'preset', presetIndex: 1 }).snapshot
        .activePresetIndex,
    ).toBe(1)
    expect(
      engine.dispatch({
        type: 'audio.set',
        commandId: 'volume',
        channel: 'ambience',
        value: 0.2,
      }).snapshot.audio.ambienceVolume,
    ).toBe(0.2)
    expect(
      engine.dispatch({ type: 'audio.mute', commandId: 'mute' }).snapshot.audio.muted,
    ).toBe(true)

    engine.dispatch({ type: 'cue.execute', commandId: 'play-transport-cue' })
    expect(
      engine.dispatch({ type: 'animation.pause', commandId: 'pause' }).snapshot.animation.status,
    ).toBe('paused')
    expect(
      engine.dispatch({ type: 'animation.resume', commandId: 'resume' }).snapshot.animation.status,
    ).toBe('playing')
    expect(
      engine.dispatch({ type: 'animation.skip', commandId: 'skip' }).snapshot.animation.status,
    ).toBe('idle')
    expect(engine.getSnapshot().canUndo).toBe(true) // Only the cue transaction is undoable.
    expect(engine.getCheckpoint().undoStack).toHaveLength(1)
  })

  it('supports finale pause, resume, group skip, cancel, and replay controls', () => {
    const engine = engineFor()
    engine.dispatch({ type: 'finale.start', commandId: 'start-controls', confirmed: true })
    expect(
      engine.dispatch({ type: 'finale.pause', commandId: 'pause-finale' }).snapshot.finale.status,
    ).toBe('paused')
    expect(
      engine.dispatch({ type: 'finale.resume', commandId: 'resume-finale' }).snapshot.finale.status,
    ).toBe('countdown')
    // First skip settles countdown into group zero; the next completes the one
    // tied all-zero group.
    expect(
      engine.dispatch({ type: 'finale.skip', commandId: 'skip-group' }).snapshot.finale.status,
    ).toBe('running')
    expect(
      engine.dispatch({ type: 'finale.skip', commandId: 'finish-group' }).snapshot.finale.status,
    ).toBe('complete')
    expect(
      engine.dispatch({ type: 'finale.cancel', commandId: 'cancel-finale' }).snapshot.finale.status,
    ).toBe('cancelled')
    expect(
      engine.dispatch({ type: 'finale.replay', commandId: 'replay-controls', confirmed: true })
        .snapshot.finale.status,
    ).toBe('countdown')
    const firstTimedTick = engine.dispatch({ type: 'finale.skip', commandId: 'countdown-ended' })
    expect(firstTimedTick.snapshot.finale).toMatchObject({
      status: 'running',
      currentGroupIndex: 0,
    })
    expect(
      engine.dispatch({ type: 'finale.skip', commandId: 'group-finished' }).snapshot.finale.status,
    ).toBe('complete')
  })
})
