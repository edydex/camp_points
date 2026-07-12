import { useEffect, useRef } from 'react'
import type { EngineSnapshot, ShowCommand } from '../../shared'
import { commandId, isEditableTarget } from '../lib/commands'

export function useKeyboardControls(
  snapshot: EngineSnapshot | null,
  dispatch: (command: ShowCommand) => Promise<unknown>,
  enabled = true,
) {
  const selectedTeamIdRef = useRef<string | null>(snapshot?.selectedTeamId ?? null)
  const presetIndexRef = useRef(snapshot?.activePresetIndex ?? 0)

  useEffect(() => {
    selectedTeamIdRef.current = snapshot?.selectedTeamId ?? null
    presetIndexRef.current = snapshot?.activePresetIndex ?? 0
  }, [snapshot?.activePresetIndex, snapshot?.selectedTeamId])

  useEffect(() => {
    if (!enabled || !snapshot) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      if (
        event.target instanceof HTMLElement &&
        event.target.matches('button, [role="button"], a[href]') &&
        (event.key === 'Enter' || event.code === 'Space')
      ) return
      const modifier = event.metaKey || event.ctrlKey
      const finaleLocksScores = snapshot.finale.status === 'countdown' ||
        snapshot.finale.status === 'running' ||
        snapshot.finale.status === 'paused' ||
        snapshot.finale.status === 'complete'
      let next: ShowCommand | null = null
      if (modifier && event.key.toLowerCase() === 'z') {
        if (!finaleLocksScores) next = { type: event.shiftKey ? 'history.redo' : 'history.undo', commandId: commandId() } as ShowCommand
      } else if (event.ctrlKey && event.key.toLowerCase() === 'y') {
        if (!finaleLocksScores) next = { type: 'history.redo', commandId: commandId() } as ShowCommand
      } else if (/^[0-9]$/.test(event.key)) {
        const index = event.key === '0' ? 9 : Number(event.key) - 1
        const team = snapshot.teams[index]
        if (team) {
          selectedTeamIdRef.current = team.id
          next = { type: 'team.select', commandId: commandId(), teamId: team.id } as ShowCommand
        }
      } else if (event.key === 'Enter' || event.key === '+') {
        const teamId = selectedTeamIdRef.current
        const delta = snapshot.scoreConfig.awardPresets[presetIndexRef.current] ?? 1
        if (teamId && !finaleLocksScores) next = { type: 'score.adjust', commandId: commandId(), teamId, delta } as ShowCommand
      } else if (event.key === '-') {
        const teamId = selectedTeamIdRef.current
        const delta = snapshot.scoreConfig.awardPresets[presetIndexRef.current] ?? 1
        if (teamId && !finaleLocksScores) next = { type: 'score.adjust', commandId: commandId(), teamId, delta: -delta } as ShowCommand
      } else if (event.key === '[' || event.key === ']') {
        const direction = event.key === ']' ? 1 : -1
        const count = snapshot.scoreConfig.awardPresets.length
        const presetIndex = (presetIndexRef.current + direction + count) % count
        presetIndexRef.current = presetIndex
        next = { type: 'preset.select', commandId: commandId(), presetIndex } as ShowCommand
      } else if (event.key === 'ArrowRight') {
        if (!finaleLocksScores && snapshot.cues[snapshot.cueIndex]) {
          next = { type: 'cue.execute', commandId: commandId() } as ShowCommand
        }
      } else if (event.key === 'ArrowLeft') {
        if (!finaleLocksScores && snapshot.cueIndex > 0) {
          next = { type: 'cue.rewind', commandId: commandId() } as ShowCommand
        }
      } else if (event.code === 'Space') {
        if (snapshot.animation.status === 'paused') {
          next = { type: 'animation.resume', commandId: commandId() } as ShowCommand
        } else if (snapshot.animation.status === 'playing') {
          next = { type: 'animation.pause', commandId: commandId() } as ShowCommand
        }
      } else if (event.key.toLowerCase() === 'm') {
        next = { type: 'audio.mute', commandId: commandId(), muted: !snapshot.audio.muted } as ShowCommand
      }
      if (next) {
        event.preventDefault()
        void dispatch(next)
      }
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault()
        const mirroredStage = document.querySelector<HTMLElement>('.mirrored-stage-shell')
        if (mirroredStage) {
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
          else void mirroredStage.requestFullscreen().catch(() => undefined)
        } else if (window.rocketFuel) {
          void window.rocketFuel.getRuntimeStatus().then((status) => window.rocketFuel?.setStageFullscreen(!status.stageFullscreen))
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch, enabled, snapshot])
}
