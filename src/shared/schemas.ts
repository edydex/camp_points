import { z } from 'zod'

import { SHOW_SCHEMA_VERSION, type RocketShow, type ShowCommand } from './types'

const id = z.string().trim().min(1).max(120)
const timestamp = z.string().datetime({ offset: true })
const scoreMap = z.record(z.string(), z.number().int().nonnegative())

export const TeamSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(60),
    color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Expected a six-digit hex color'),
    icon: z.enum([
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
    ]),
    rocketModel: z.enum(['scout', 'booster', 'orbiter']),
  })
  .strict()

export const ScoreConfigSchema = z
  .object({
    tankCapacity: z.number().int().min(1).max(100_000),
    overflowEnabled: z.boolean(),
    awardPresets: z.array(z.number().int().min(1).max(100_000)).min(1).max(5),
    majorInterval: z.number().int().min(1).max(100_000),
    minorSubdivisions: z.number().int().min(0).max(9),
    maxLabel: z.string().trim().min(1).max(20),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.awardPresets).size !== value.awardPresets.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['awardPresets'],
        message: 'Award presets must be unique',
      })
    }
  })

export const AudioSettingsSchema = z
  .object({
    masterVolume: z.number().min(0).max(1),
    sfxVolume: z.number().min(0).max(1),
    ambienceVolume: z.number().min(0).max(1),
    muted: z.boolean(),
    ambienceEnabled: z.boolean(),
  })
  .strict()

export const DisplaySettingsSchema = z
  .object({
    reducedMotion: z.boolean(),
    particleLevel: z.enum(['full', 'low', 'off']),
  })
  .strict()

export const FinaleConfigSchema = z
  .object({
    mishapCount: z.number().int().min(0).max(10),
    targetDurationMs: z.number().int().min(10_000).max(300_000),
    countdownSeconds: z.number().int().min(0).max(30),
  })
  .strict()

export const ScoreCueSchema = z
  .object({
    id,
    type: z.literal('score'),
    title: z.string().trim().min(1).max(100),
    notes: z.string().max(1_000).optional(),
    deltas: z
      .array(
        z
          .object({
            teamId: id,
            delta: z.number().int().min(-100_000).max(100_000),
          })
          .strict(),
      )
      .min(1)
      .max(10),
    mode: z.enum(['simultaneous', 'sequential']),
    teamOrder: z.array(id).max(10),
    stepDelayMs: z.number().int().min(0).max(60_000),
  })
  .strict()
  .superRefine((cue, context) => {
    const deltaIds = cue.deltas.map((delta) => delta.teamId)
    if (new Set(deltaIds).size !== deltaIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deltas'],
        message: 'A score cue may only update each team once',
      })
    }
    if (new Set(cue.teamOrder).size !== cue.teamOrder.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['teamOrder'],
        message: 'Team order may not contain duplicates',
      })
    }
    if (cue.mode === 'sequential') {
      const order = new Set(cue.teamOrder)
      for (const teamId of deltaIds) {
        if (!order.has(teamId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['teamOrder'],
            message: `Sequential cue order is missing team ${teamId}`,
          })
        }
      }
    }
  })

export const AnnouncementCueSchema = z
  .object({
    id,
    type: z.literal('announcement'),
    title: z.string().trim().min(1).max(100),
    notes: z.string().max(1_000).optional(),
    message: z.string().trim().min(1).max(500),
    durationMs: z.number().int().min(500).max(120_000),
  })
  .strict()

export const FinaleCueSchema = z
  .object({
    id,
    type: z.literal('finale'),
    title: z.string().trim().min(1).max(100),
    notes: z.string().max(1_000).optional(),
  })
  .strict()

export const CueSchema = z.discriminatedUnion('type', [
  ScoreCueSchema,
  AnnouncementCueSchema,
  FinaleCueSchema,
])

export const FinaleEntrySchema = z
  .object({
    teamId: id,
    score: z.number().int().nonnegative(),
    power: z.number().min(0.55).max(1),
    flameScale: z.number().min(0.55).max(1),
    ascentDurationMs: z.number().int().positive(),
    mishap: z.boolean(),
  })
  .strict()

export const FinaleGroupSchema = z
  .object({
    score: z.number().int().nonnegative(),
    teamIds: z.array(id).min(1).max(10),
    power: z.number().min(0.55).max(1),
    flameScale: z.number().min(0.55).max(1),
    ascentDurationMs: z.number().int().positive(),
    launchAtMs: z.number().int().nonnegative(),
    mishap: z.boolean(),
  })
  .strict()

export const FinalePlanSchema = z
  .object({
    frozenScores: scoreMap,
    winnerTeamIds: z.array(id).min(1).max(10),
    winningScore: z.number().int().nonnegative(),
    groups: z.array(FinaleGroupSchema).min(1).max(10),
    entries: z.array(FinaleEntrySchema).min(2).max(10),
    requestedMishapCount: z.number().int().min(0).max(10),
    actualMishapTeamIds: z.array(id).max(10),
    targetDurationMs: z.number().int().positive(),
    estimatedDurationMs: z.number().int().positive(),
  })
  .strict()

export const FinaleRuntimeStateSchema = z
  .object({
    status: z.enum(['idle', 'countdown', 'running', 'paused', 'complete', 'cancelled']),
    plan: FinalePlanSchema.nullable(),
    currentGroupIndex: z.number().int().nonnegative(),
    pausedFrom: z.enum(['countdown', 'running']).optional(),
    countdownEndsAt: timestamp.optional(),
    countdownRemainingMs: z.number().int().nonnegative().optional(),
  })
  .strict()

export const AnimationStateSchema = z
  .object({
    status: z.enum(['idle', 'playing', 'paused']),
    sequenceId: z.string().nullable(),
    sequenceType: z.enum(['score', 'announcement', 'finale']).nullable(),
  })
  .strict()

const reversibleState = z
  .object({
    scores: scoreMap,
    cueIndex: z.number().int().nonnegative(),
    finale: FinaleRuntimeStateSchema,
  })
  .strict()

export const TransactionSchema = z
  .object({
    id,
    commandId: id,
    kind: z.enum(['manual-score', 'cue']),
    source: z.enum(['presenter', 'remote', 'keyboard', 'script', 'system']),
    timestamp,
    revision: z.number().int().positive(),
    cueId: id.optional(),
    before: reversibleState,
    after: reversibleState,
  })
  .strict()

export const RuntimeCheckpointSchema = z
  .object({
    scores: scoreMap,
    cueIndex: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    selectedTeamId: id.nullable(),
    activePresetIndex: z.number().int().nonnegative(),
    audio: AudioSettingsSchema,
    animation: AnimationStateSchema,
    finale: FinaleRuntimeStateSchema,
    undoStack: z.array(TransactionSchema).max(5_000),
    redoStack: z.array(TransactionSchema).max(5_000),
    recentCommandIds: z.array(id).max(256),
    updatedAt: timestamp,
  })
  .strict()

export const RocketShowSchema = z
  .object({
    schemaVersion: z.literal(SHOW_SCHEMA_VERSION),
    id,
    title: z.string().trim().min(1).max(100),
    createdAt: timestamp,
    updatedAt: timestamp,
    theme: z.literal('cartoon'),
    teams: z.array(TeamSchema).min(2).max(10),
    scoreConfig: ScoreConfigSchema,
    audio: AudioSettingsSchema,
    display: DisplaySettingsSchema,
    finale: FinaleConfigSchema,
    cues: z.array(CueSchema).max(1_000),
    baselineScores: scoreMap,
    runtime: RuntimeCheckpointSchema.optional(),
  })
  .strict()
  .superRefine((show, context) => {
    const teamIds = show.teams.map((team) => team.id)
    const teamSet = new Set(teamIds)
    if (teamSet.size !== teamIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['teams'],
        message: 'Team IDs must be unique',
      })
    }

    const cueIds = show.cues.map((cue) => cue.id)
    const cueSet = new Set(cueIds)
    if (cueSet.size !== cueIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cues'],
        message: 'Cue IDs must be unique',
      })
    }

    const maxScore = show.scoreConfig.tankCapacity * (show.scoreConfig.overflowEnabled ? 2 : 1)
    validateScoreMap(show.baselineScores, ['baselineScores'], teamSet, maxScore, context)

    show.cues.forEach((cue, cueIndex) => {
      if (cue.type !== 'score') return
      cue.deltas.forEach((delta, deltaIndex) => {
        if (!teamSet.has(delta.teamId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['cues', cueIndex, 'deltas', deltaIndex, 'teamId'],
            message: `Unknown team ${delta.teamId}`,
          })
        }
      })
      cue.teamOrder.forEach((teamId, orderIndex) => {
        if (!teamSet.has(teamId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['cues', cueIndex, 'teamOrder', orderIndex],
            message: `Unknown team ${teamId}`,
          })
        }
      })
    })

    if (show.finale.mishapCount > show.teams.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['finale', 'mishapCount'],
        message: 'Mishap count cannot exceed the number of teams',
      })
    }

    if (show.runtime) {
      validateScoreMap(show.runtime.scores, ['runtime', 'scores'], teamSet, maxScore, context)
      if (show.runtime.cueIndex > show.cues.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['runtime', 'cueIndex'],
          message: 'Cue position is past the end of the cue deck',
        })
      }
      if (show.runtime.selectedTeamId && !teamSet.has(show.runtime.selectedTeamId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['runtime', 'selectedTeamId'],
          message: 'Selected team does not exist',
        })
      }
      if (show.runtime.activePresetIndex >= show.scoreConfig.awardPresets.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['runtime', 'activePresetIndex'],
          message: 'Active preset is out of range',
        })
      }
      if (new Set(show.runtime.recentCommandIds).size !== show.runtime.recentCommandIds.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['runtime', 'recentCommandIds'],
          message: 'Recent command IDs must be unique',
        })
      }
      for (const [stackName, stack] of [
        ['undoStack', show.runtime.undoStack],
        ['redoStack', show.runtime.redoStack],
      ] as const) {
        stack.forEach((transaction, transactionIndex) => {
          const transactionPath = ['runtime', stackName, transactionIndex] as Array<string | number>
          if (transaction.revision > show.runtime!.revision) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...transactionPath, 'revision'],
              message: 'Transaction revision is newer than the checkpoint',
            })
          }
          if (transaction.kind === 'cue' && !transaction.cueId) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...transactionPath, 'cueId'],
              message: 'Cue transactions must identify their cue',
            })
          }
          if (transaction.cueId && !cueSet.has(transaction.cueId)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...transactionPath, 'cueId'],
              message: `Transaction references unknown cue ${transaction.cueId}`,
            })
          }
          for (const frameName of ['before', 'after'] as const) {
            const frame = transaction[frameName]
            validateScoreMap(
              frame.scores,
              [...transactionPath, frameName, 'scores'],
              teamSet,
              maxScore,
              context,
            )
            if (frame.cueIndex > show.cues.length) {
              context.addIssue({
                code: z.ZodIssueCode.custom,
                path: [...transactionPath, frameName, 'cueIndex'],
                message: 'Transaction cue position is past the end of the cue deck',
              })
            }
            validateFinaleTeamReferences(
              frame.finale,
              [...transactionPath, frameName, 'finale'],
              teamSet,
              context,
            )
          }
        })
      }
      validateFinaleTeamReferences(
        show.runtime.finale,
        ['runtime', 'finale'],
        teamSet,
        context,
      )
    }
  })

function validateScoreMap(
  value: Record<string, number>,
  path: Array<string | number>,
  teamIds: Set<string>,
  maxScore: number,
  context: z.RefinementCtx,
): void {
  for (const teamId of teamIds) {
    if (!(teamId in value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, teamId],
        message: `Missing score for team ${teamId}`,
      })
    }
  }
  for (const [teamId, score] of Object.entries(value)) {
    if (!teamIds.has(teamId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, teamId],
        message: `Score references unknown team ${teamId}`,
      })
    } else if (score > maxScore) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, teamId],
        message: `Score exceeds the configured maximum of ${maxScore}`,
      })
    }
  }
}

function validateFinaleTeamReferences(
  finale: z.infer<typeof FinaleRuntimeStateSchema>,
  path: Array<string | number>,
  teamIds: Set<string>,
  context: z.RefinementCtx,
): void {
  if (!finale.plan) {
    if (finale.status !== 'idle' && finale.status !== 'cancelled') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, 'plan'],
        message: 'An active or completed finale must include a frozen plan',
      })
    }
    return
  }

  validateScoreMap(
    finale.plan.frozenScores,
    [...path, 'plan', 'frozenScores'],
    teamIds,
    Number.MAX_SAFE_INTEGER,
    context,
  )
  const references = [
    ...finale.plan.winnerTeamIds,
    ...finale.plan.actualMishapTeamIds,
    ...finale.plan.groups.flatMap((group) => group.teamIds),
    ...finale.plan.entries.map((entry) => entry.teamId),
  ]
  references.forEach((teamId, index) => {
    if (!teamIds.has(teamId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, 'plan', index],
        message: `Finale plan references unknown team ${teamId}`,
      })
    }
  })
  if (finale.currentGroupIndex > finale.plan.groups.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...path, 'currentGroupIndex'],
      message: 'Finale group position is past the end of the plan',
    })
  }
}

const commandId = { commandId: id }

export const ShowCommandSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...commandId,
      type: z.literal('show.update'),
      patch: z
        .object({
          title: z.string().trim().min(1).max(100).optional(),
          theme: z.literal('cartoon').optional(),
          scoreConfig: z
            .object({
              tankCapacity: z.number().int().min(1).max(100_000).optional(),
              overflowEnabled: z.boolean().optional(),
              awardPresets: z.array(z.number().int().min(1).max(100_000)).min(1).max(5).optional(),
              majorInterval: z.number().int().min(1).max(100_000).optional(),
              minorSubdivisions: z.number().int().min(0).max(9).optional(),
              maxLabel: z.string().trim().min(1).max(20).optional(),
            })
            .strict()
            .optional(),
          audio: z
            .object({
              masterVolume: z.number().min(0).max(1).optional(),
              sfxVolume: z.number().min(0).max(1).optional(),
              ambienceVolume: z.number().min(0).max(1).optional(),
              muted: z.boolean().optional(),
              ambienceEnabled: z.boolean().optional(),
            })
            .strict()
            .optional(),
          display: z
            .object({
              reducedMotion: z.boolean().optional(),
              particleLevel: z.enum(['full', 'low', 'off']).optional(),
            })
            .strict()
            .optional(),
          finale: z
            .object({
              mishapCount: z.number().int().min(0).max(10).optional(),
              targetDurationMs: z.number().int().min(10_000).max(300_000).optional(),
              countdownSeconds: z.number().int().min(0).max(30).optional(),
            })
            .strict()
            .optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ ...commandId, type: z.literal('teams.replace'), teams: z.array(TeamSchema).min(2).max(10) }).strict(),
  z.object({ ...commandId, type: z.literal('cues.replace'), cues: z.array(CueSchema).max(1_000) }).strict(),
  z.object({ ...commandId, type: z.literal('show.reset'), mode: z.enum(['baseline', 'zero']) }).strict(),
  z.object({ ...commandId, type: z.literal('score.adjust'), teamId: id, delta: z.number().int() }).strict(),
  z.object({ ...commandId, type: z.literal('score.set'), teamId: id, value: z.number().int() }).strict(),
  z.object({ ...commandId, type: z.literal('cue.execute') }).strict(),
  z.object({ ...commandId, type: z.literal('cue.rewind') }).strict(),
  z.object({ ...commandId, type: z.literal('history.undo') }).strict(),
  z.object({ ...commandId, type: z.literal('history.redo') }).strict(),
  z.object({ ...commandId, type: z.literal('team.select'), teamId: id }).strict(),
  z.object({ ...commandId, type: z.literal('preset.select'), presetIndex: z.number().int().nonnegative() }).strict(),
  z
    .object({
      ...commandId,
      type: z.literal('audio.set'),
      channel: z.enum(['master', 'sfx', 'ambience']),
      value: z.number().min(0).max(1),
    })
    .strict(),
  z.object({ ...commandId, type: z.literal('audio.mute'), muted: z.boolean().optional() }).strict(),
  z.object({ ...commandId, type: z.literal('animation.pause') }).strict(),
  z.object({ ...commandId, type: z.literal('animation.resume') }).strict(),
  z.object({ ...commandId, type: z.literal('animation.skip') }).strict(),
  z.object({ ...commandId, type: z.literal('animation.complete') }).strict(),
  z.object({ ...commandId, type: z.literal('finale.start'), confirmed: z.boolean() }).strict(),
  z.object({ ...commandId, type: z.literal('finale.pause') }).strict(),
  z.object({ ...commandId, type: z.literal('finale.resume') }).strict(),
  z.object({ ...commandId, type: z.literal('finale.skip') }).strict(),
  z.object({ ...commandId, type: z.literal('finale.cancel') }).strict(),
  z.object({ ...commandId, type: z.literal('finale.replay'), confirmed: z.boolean() }).strict(),
])

export const ShowDocumentSchema = RocketShowSchema

export function migrateRocketShow(input: unknown): RocketShow {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('Rocket show must be a JSON object')
  }

  const version = (input as { schemaVersion?: unknown }).schemaVersion
  if (version !== SHOW_SCHEMA_VERSION) {
    throw new Error(
      typeof version === 'number'
        ? `Unsupported rocket show schema version ${version}; this app supports version ${SHOW_SCHEMA_VERSION}`
        : 'Rocket show is missing a schemaVersion',
    )
  }

  // Version-one files from early builds may still name one of the retired
  // visual worlds. Keep those shows importable, but normalize immediately so
  // every live snapshot and subsequent autosave uses the supported Cartoon
  // Sci-Fi presentation world.
  const legacyTheme = (input as { theme?: unknown }).theme
  const normalized = legacyTheme === 'retro' || legacyTheme === 'cinematic'
    ? { ...(input as Record<string, unknown>), theme: 'cartoon' }
    : input

  return RocketShowSchema.parse(normalized) as RocketShow
}

export function parseRocketShow(input: unknown): RocketShow {
  return migrateRocketShow(input)
}

export function parseShowCommand(input: unknown): ShowCommand {
  return ShowCommandSchema.parse(input) as ShowCommand
}
