import { finaleCountdownRemainingMs, type EngineSnapshot } from '../shared'

export type TimerAction = 'animation.complete' | 'finale.skip'

export interface AnimationTimerPlan {
  action: TimerAction
  remainingMs: number
}

/**
 * Returns the next authoritative main-process transition for an active visual
 * sequence. Renderers may disappear; this schedule keeps the engine movable.
 */
export function nextAnimationTimer(
  snapshot: EngineSnapshot,
  nowMs = Date.now(),
): AnimationTimerPlan | null {
  if (snapshot.animation.status === 'idle') return null

  if (snapshot.animation.sequenceType !== 'finale') {
    const cue = snapshot.cues.find((candidate) => candidate.id === snapshot.animation.sequenceId)
    if (cue?.type === 'announcement') {
      return { action: 'animation.complete', remainingMs: cue.durationMs }
    }
    if (cue?.type === 'score') {
      return {
        action: 'animation.complete',
        remainingMs: cue.mode === 'sequential'
          ? cue.stepDelayMs * Math.max(0, cue.teamOrder.length - 1) + 1_000
          : 900,
      }
    }
    return { action: 'animation.complete', remainingMs: 1_000 }
  }

  const plan = snapshot.finale.plan
  if (!plan || snapshot.finale.status === 'complete' || snapshot.finale.status === 'cancelled') {
    return null
  }
  const groups = plan.groups
  if (groups.length === 0) return { action: 'animation.complete', remainingMs: 500 }
  const finalePhase = snapshot.finale.status === 'paused'
    ? snapshot.finale.pausedFrom ?? 'running'
    : snapshot.finale.status
  if (finalePhase === 'countdown') {
    return {
      action: 'finale.skip',
      remainingMs: finaleCountdownRemainingMs(snapshot.finale, nowMs),
    }
  }

  const index = Math.max(0, Math.min(snapshot.finale.currentGroupIndex, groups.length - 1))
  const current = groups[index]
  const next = groups[index + 1]
  const remainingMs = next
    ? next.launchAtMs - current.launchAtMs
    : plan.estimatedDurationMs - current.launchAtMs
  return { action: 'finale.skip', remainingMs: Math.max(250, remainingMs) }
}
