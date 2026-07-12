import gsap from 'gsap'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  EngineSnapshot,
  FinaleRuntimeState,
  ScoreChangeEvent,
  ScoreMap,
  StageEvent,
  StageMessage,
} from '../../shared/types'
import { finaleCountdownRemainingMs } from '../../shared/finale'
import { soundEngine } from '../audio/SoundEngine'
import { runtime } from '../lib/local-runtime'
import { Stage } from './Stage'
import {
  announcementFromStageMessage,
  stagePropsFromSnapshot,
} from './adapter'
import type { StageAnnouncement, StageMode } from './types'

interface StageSurfaceProps {
  mode?: StageMode
  controlDock?: ReactNode
  showHud?: boolean
}

const safeSound = (name: Parameters<typeof soundEngine.play>[0]): void => {
  void soundEngine.play(name).catch(() => {
    // Audio can be gesture-blocked on a newly attached projector. The visual
    // sequence deliberately continues; the next user gesture retries unlock.
  })
}

const scoreSound = (change: ScoreChangeEvent['changes'][number], snapshot: EngineSnapshot): void => {
  if (change.delta < 0) {
    safeSound('drain')
    return
  }
  const maximum = snapshot.scoreConfig.tankCapacity * (snapshot.scoreConfig.overflowEnabled ? 2 : 1)
  safeSound(change.after >= maximum ? 'max' : 'fuel')
}

const syncSoundSettings = (snapshot: EngineSnapshot, active: boolean): void => {
  soundEngine.setTheme(snapshot.theme)
  soundEngine.setMix({
    master: snapshot.audio.masterVolume,
    sfx: snapshot.audio.sfxVolume,
    ambience: snapshot.audio.ambienceVolume,
    muted: snapshot.audio.muted,
  })
  if (
    active &&
    snapshot.audio.ambienceEnabled &&
    !snapshot.audio.muted &&
    snapshot.audio.masterVolume > 0 &&
    snapshot.audio.ambienceVolume > 0
  ) {
    soundEngine.startAmbience()
  } else {
    soundEngine.stopAmbience()
  }
}

/** Connected, projector-only surface. It never dispatches score commands. */
export function StageSurface({
  mode = 'projector',
  controlDock,
  showHud = true,
}: StageSurfaceProps = {}) {
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null)
  const [visualScores, setVisualScores] = useState<ScoreMap>({})
  const [announcement, setAnnouncement] = useState<StageAnnouncement | null>(null)
  const [countdown, setCountdown] = useState<number | undefined>()
  const latestSnapshotRef = useRef<EngineSnapshot | null>(null)
  const visualScoresRef = useRef<ScoreMap>({})
  const scoreTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const announcementTimerRef = useRef<gsap.core.Tween | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null)
  const countdownDeadlineRef = useRef<number | null>(null)
  const countdownPausedRemainingRef = useRef<number | null>(null)
  const pendingSnapshotRef = useRef<gsap.core.Tween | null>(null)
  const audioActiveRef = useRef(!window.rocketFuel)
  const priorFinaleStatusRef = useRef<FinaleRuntimeState['status']>('idle')

  const playSound = (name: Parameters<typeof soundEngine.play>[0]): void => {
    if (audioActiveRef.current) safeSound(name)
  }

  const syncSurfaceSoundSettings = (next: EngineSnapshot): void => {
    if (audioActiveRef.current) syncSoundSettings(next, true)
  }

  const commitVisualScores = (scores: ScoreMap): void => {
    const next = { ...scores }
    visualScoresRef.current = next
    setVisualScores(next)
  }

  const scheduleSnapshotSettle = (next: EngineSnapshot): void => {
    pendingSnapshotRef.current?.kill()
    pendingSnapshotRef.current = gsap.delayedCall(0.075, () => {
      commitVisualScores(next.scores)
      pendingSnapshotRef.current = null
    })
  }

  const runScoreEvent = (event: ScoreChangeEvent): void => {
    const authoritative = latestSnapshotRef.current
    if (!authoritative || event.changes.length === 0) return
    pendingSnapshotRef.current?.kill()
    pendingSnapshotRef.current = null
    scoreTimelineRef.current?.kill()

    const startingScores = { ...visualScoresRef.current }
    for (const change of event.changes) startingScores[change.teamId] = change.before
    commitVisualScores(startingScores)

    const order = event.delivery === 'sequential'
      ? [...event.changes].sort((left, right) => {
          const leftIndex = event.teamOrder.indexOf(left.teamId)
          const rightIndex = event.teamOrder.indexOf(right.teamId)
          return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
            (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
        })
      : event.changes
    const stepSeconds = event.delivery === 'sequential'
      ? Math.max(0.08, event.stepDelayMs / 1000)
      : 0
    const timeline = gsap.timeline()
    scoreTimelineRef.current = timeline

    order.forEach((change, index) => {
      timeline.call(() => {
        const nextScores = { ...visualScoresRef.current, [change.teamId]: change.after }
        commitVisualScores(nextScores)
        if (audioActiveRef.current) scoreSound(change, authoritative)
      }, undefined, 0.08 + index * stepSeconds)
    })
    timeline.call(() => {
      if (latestSnapshotRef.current) commitVisualScores(latestSnapshotRef.current.scores)
      scoreTimelineRef.current = null
    }, undefined, 0.8 + Math.max(0, order.length - 1) * stepSeconds)
  }

  const clearCountdownTimer = (): void => {
    if (countdownTimerRef.current !== null) {
      globalThis.clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
  }

  const renderCountdownFromClock = (): void => {
    const deadline = countdownDeadlineRef.current
    if (deadline === null) return
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      // Keep the countdown overlay in an honest GO state if the main process
      // is momentarily busy. The authoritative finale-state event removes it.
      setCountdown(undefined)
      clearCountdownTimer()
      return
    }
    setCountdown(Math.ceil(remainingMs / 1_000))
  }

  const beginCountdown = (finale: FinaleRuntimeState): void => {
    clearCountdownTimer()
    const now = Date.now()
    const parsedDeadline = finale.countdownEndsAt
      ? Date.parse(finale.countdownEndsAt)
      : Number.NaN
    const remainingMs = finaleCountdownRemainingMs(finale, now)
    countdownDeadlineRef.current = Number.isFinite(parsedDeadline)
      ? parsedDeadline
      : now + remainingMs
    countdownPausedRemainingRef.current = null
    renderCountdownFromClock()
    if (countdownDeadlineRef.current > now) {
      // Poll below one second and derive the numeral from wall time. Unlike a
      // chain of animation callbacks, this catches up correctly after a busy
      // renderer frame instead of showing stale 4/3/2 values late.
      countdownTimerRef.current = globalThis.setInterval(renderCountdownFromClock, 100)
    }
  }

  const pauseCountdown = (finale?: FinaleRuntimeState): void => {
    const now = Date.now()
    const remainingMs = finale
      ? finaleCountdownRemainingMs(finale, now)
      : Math.max(0, (countdownDeadlineRef.current ?? now) - now)
    clearCountdownTimer()
    countdownDeadlineRef.current = null
    countdownPausedRemainingRef.current = remainingMs
    setCountdown(remainingMs > 0 ? Math.ceil(remainingMs / 1_000) : undefined)
  }

  const resumeCountdown = (finale?: FinaleRuntimeState): void => {
    if (finale) {
      beginCountdown(finale)
      return
    }
    const remainingMs = countdownPausedRemainingRef.current
    if (remainingMs === null) return
    countdownPausedRemainingRef.current = null
    countdownDeadlineRef.current = Date.now() + remainingMs
    renderCountdownFromClock()
    if (remainingMs > 0) {
      countdownTimerRef.current = globalThis.setInterval(renderCountdownFromClock, 100)
    }
  }

  const finishCountdown = (): void => {
    clearCountdownTimer()
    countdownDeadlineRef.current = null
    countdownPausedRemainingRef.current = null
    setCountdown(undefined)
  }

  const syncCountdownState = (finale: FinaleRuntimeState): void => {
    if (finale.status === 'countdown') {
      // Re-anchor to the authoritative absolute deadline on every snapshot.
      // This also corrects the tiny local estimate used between a generic
      // animation-resume event and its following state snapshot.
      beginCountdown(finale)
    } else if (finale.status === 'paused' && finale.pausedFrom === 'countdown') {
      pauseCountdown(finale)
    } else if (
      countdownTimerRef.current !== null ||
      countdownDeadlineRef.current !== null ||
      countdownPausedRemainingRef.current !== null
    ) {
      finishCountdown()
    }
  }

  const handleEvent = (event: StageEvent, message: StageMessage): void => {
    if (event.type === 'score-change') {
      runScoreEvent(event)
      return
    }
    if (event.type === 'selection-change') {
      if (mode === 'mirrored') playSound('select')
      return
    }
    if (event.type === 'announcement') {
      const nextAnnouncement = announcementFromStageMessage(message)
      setAnnouncement(nextAnnouncement)
      playSound('announce')
      announcementTimerRef.current?.kill()
      announcementTimerRef.current = gsap.delayedCall(Math.max(1, event.durationMs / 1000), () => {
        setAnnouncement(null)
        announcementTimerRef.current = null
      })
      return
    }
    if (event.type === 'cue-rewind') {
      announcementTimerRef.current?.kill()
      announcementTimerRef.current = null
      setAnnouncement(null)
      playSound('undo')
      return
    }
    if (event.type === 'audio-change') {
      soundEngine.setMix({
        master: event.audio.masterVolume,
        sfx: event.audio.sfxVolume,
        ambience: event.audio.ambienceVolume,
        muted: event.audio.muted,
      })
      return
    }
    if (event.type === 'animation-state') {
      if (event.animation.status === 'paused') {
        scoreTimelineRef.current?.pause()
        announcementTimerRef.current?.pause()
        pauseCountdown()
      } else if (event.animation.status === 'playing') {
        scoreTimelineRef.current?.resume()
        announcementTimerRef.current?.resume()
        resumeCountdown()
      }
      if (event.settle) {
        scoreTimelineRef.current?.kill()
        scoreTimelineRef.current = null
        announcementTimerRef.current?.kill()
        announcementTimerRef.current = null
        if (latestSnapshotRef.current) commitVisualScores(latestSnapshotRef.current.scores)
        setAnnouncement(null)
      }
      return
    }
    if (event.type === 'finale-state') {
      const resumedFromPause = priorFinaleStatusRef.current === 'paused'
      if (event.finale.status === 'countdown') {
        resumeCountdown(event.finale)
      } else if (
        event.finale.status === 'paused' &&
        event.finale.pausedFrom === 'countdown'
      ) {
        pauseCountdown(event.finale)
      } else {
        finishCountdown()
      }
      if (event.finale.status === 'running' && !resumedFromPause) {
        const activeGroup = event.finale.plan?.groups[event.finale.currentGroupIndex]
        playSound(activeGroup?.mishap ? 'mishap' : 'launch')
      } else if (event.finale.status === 'complete') {
        playSound('win')
      }
      priorFinaleStatusRef.current = event.finale.status
    }
  }

  useEffect(() => {
    let active = true
    void runtime.getSnapshot().then((initial) => {
      if (!active) return
      if (
        latestSnapshotRef.current &&
        latestSnapshotRef.current.revision > initial.revision
      ) return
      latestSnapshotRef.current = initial
      priorFinaleStatusRef.current = initial.finale.status
      setSnapshot(initial)
      commitVisualScores(initial.scores)
      syncCountdownState(initial.finale)
      syncSurfaceSoundSettings(initial)
    })

    const unsubscribeSnapshot = runtime.subscribeSnapshot((next) => {
      priorFinaleStatusRef.current = latestSnapshotRef.current?.finale.status ?? 'idle'
      latestSnapshotRef.current = next
      setSnapshot(next)
      syncCountdownState(next.finale)
      syncSurfaceSoundSettings(next)
      if (!scoreTimelineRef.current) scheduleSnapshotSettle(next)
    })
    const unsubscribeEvents = runtime.subscribeStageEvent((message) => {
      if (message.type === 'snapshot') {
        latestSnapshotRef.current = message.snapshot
        setSnapshot(message.snapshot)
        syncCountdownState(message.snapshot.finale)
        syncSurfaceSoundSettings(message.snapshot)
        // Score events and their trailing authoritative snapshot arrive in one
        // result batch. Preserve the in-flight ordered fill timeline instead
        // of jumping every tank straight to its final score.
        if (!scoreTimelineRef.current) commitVisualScores(message.snapshot.scores)
      } else {
        handleEvent(message.event, message)
      }
    })

    const retryAudio = (): void => {
      void soundEngine.unlock().catch(() => undefined)
    }
    if (audioActiveRef.current) {
      window.addEventListener('pointerdown', retryAudio, { once: true })
      window.addEventListener('keydown', retryAudio, { once: true })
    }

    return () => {
      active = false
      unsubscribeSnapshot()
      unsubscribeEvents()
      window.removeEventListener('pointerdown', retryAudio)
      window.removeEventListener('keydown', retryAudio)
      scoreTimelineRef.current?.kill()
      announcementTimerRef.current?.kill()
      clearCountdownTimer()
      pendingSnapshotRef.current?.kill()
      if (audioActiveRef.current) soundEngine.stopAmbience()
    }
  }, [])

  const visualSnapshot = useMemo(() => snapshot ? { ...snapshot, scores: visualScores } : null, [snapshot, visualScores])

  if (!visualSnapshot) {
    return <div className="stage-loading" role="status"><i /><span>Initializing mission display…</span></div>
  }

  return (
    <Stage
      {...stagePropsFromSnapshot(visualSnapshot, {
        mode,
        announcement,
        finaleCountdown: countdown,
        showHud,
      })}
      controlDock={controlDock}
    />
  )
}
