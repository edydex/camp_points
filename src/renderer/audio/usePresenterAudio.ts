import { useEffect, useRef } from 'react'
import type { EngineSnapshot, ScoreChangeEvent, StageEvent } from '../../shared'
import { runtime } from '../lib/local-runtime'
import { soundEngine, type SoundName } from './SoundEngine'

export function scoreSoundName(
  change: ScoreChangeEvent['changes'][number],
  snapshot: EngineSnapshot,
): SoundName {
  if (change.delta < 0) return 'drain'
  const maximum = snapshot.scoreConfig.tankCapacity *
    (snapshot.scoreConfig.overflowEnabled ? 2 : 1)
  return change.after >= maximum ? 'max' : 'fuel'
}

const playSafely = (name: SoundName): void => {
  void soundEngine.play(name).catch(() => {
    // Visual operation remains authoritative if an output device disappears.
  })
}

/**
 * Owns Electron desktop audio in the private Presenter renderer.
 *
 * The projector Stage is intentionally non-focusable in Extended mode, so its
 * renderer cannot reliably receive the user gesture Chromium requires to
 * resume Web Audio. Start Show unlocks this Presenter context instead, and this
 * bridge follows the same authoritative transient events used by the Stage.
 */
export function usePresenterAudio(
  snapshot: EngineSnapshot | null,
  active: boolean,
): void {
  const snapshotRef = useRef(snapshot)
  const activeRef = useRef(active)
  const timersRef = useRef<Array<ReturnType<typeof globalThis.setTimeout>>>([])
  const priorFinaleStatusRef = useRef(snapshot?.finale.status ?? 'idle')
  const priorFinaleGroupRef = useRef(snapshot?.finale.currentGroupIndex ?? 0)
  snapshotRef.current = snapshot
  activeRef.current = active

  useEffect(() => {
    if (!snapshot) return
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
  }, [
    active,
    snapshot?.audio.ambienceEnabled,
    snapshot?.audio.ambienceVolume,
    snapshot?.audio.masterVolume,
    snapshot?.audio.muted,
    snapshot?.audio.sfxVolume,
    snapshot?.theme,
  ])

  useEffect(() => {
    const playScoreEvent = (event: ScoreChangeEvent): void => {
      const current = snapshotRef.current
      if (!current || event.changes.length === 0) return
      const ordered = event.delivery === 'sequential'
        ? [...event.changes].sort((left, right) => {
            const leftIndex = event.teamOrder.indexOf(left.teamId)
            const rightIndex = event.teamOrder.indexOf(right.teamId)
            return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
              (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
          })
        : event.changes

      if (event.delivery === 'simultaneous') {
        const names = ordered.map((change) => scoreSoundName(change, current))
        playSafely(names.includes('max') ? 'max' : names.every((name) => name === 'drain') ? 'drain' : 'fuel')
        return
      }

      ordered.forEach((change, index) => {
        const timer = globalThis.setTimeout(() => {
          if (activeRef.current && snapshotRef.current) {
            playSafely(scoreSoundName(change, snapshotRef.current))
          }
        }, index * Math.max(100, event.stepDelayMs))
        timersRef.current.push(timer)
      })
    }

    const handleEvent = (event: StageEvent): void => {
      if (event.type === 'audio-change') {
        soundEngine.setMix({
          master: event.audio.masterVolume,
          sfx: event.audio.sfxVolume,
          ambience: event.audio.ambienceVolume,
          muted: event.audio.muted,
        })
        return
      }
      if (!activeRef.current) return

      if (event.type === 'score-change') {
        playScoreEvent(event)
      } else if (event.type === 'announcement') {
        playSafely('announce')
      } else if (event.type === 'cue-rewind') {
        playSafely('undo')
      } else if (event.type === 'finale-state') {
        const priorStatus = priorFinaleStatusRef.current
        const priorGroup = priorFinaleGroupRef.current
        if (
          event.finale.status === 'running' &&
          priorStatus !== 'paused' &&
          (priorStatus !== 'running' || priorGroup !== event.finale.currentGroupIndex)
        ) {
          const group = event.finale.plan?.groups[event.finale.currentGroupIndex]
          playSafely(group?.mishap ? 'mishap' : 'launch')
        } else if (event.finale.status === 'complete' && priorStatus !== 'complete') {
          playSafely('win')
        }
        priorFinaleStatusRef.current = event.finale.status
        priorFinaleGroupRef.current = event.finale.currentGroupIndex
      }
      // Selection feedback is audience-visible/audible only in mirrored mode;
      // the mirrored dock plays it directly from its user gesture.
    }

    const unsubscribe = runtime.subscribeStageEvent((message) => {
      if (message.type === 'event') handleEvent(message.event)
    })
    return () => {
      unsubscribe()
      timersRef.current.forEach((timer) => globalThis.clearTimeout(timer))
      timersRef.current = []
      soundEngine.stopAmbience()
    }
  }, [])
}
