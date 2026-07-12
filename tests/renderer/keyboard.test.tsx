import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultShow, ShowEngine, type ShowCommand } from '../../src/shared'
import { useKeyboardControls } from '../../src/renderer/presenter/useKeyboardControls'

function Harness({ dispatch, withCue = false }: { dispatch: (command: ShowCommand) => Promise<unknown>; withCue?: boolean }) {
  const show = createDefaultShow({ teamCount: 10 })
  show.scoreConfig.awardPresets = [1, 3]
  if (withCue) {
    show.cues = [{
      id: 'keyboard-cue',
      type: 'score',
      title: 'Prepared points',
      deltas: [{ teamId: 'team-1', delta: 1 }],
      mode: 'simultaneous',
      teamOrder: ['team-1'],
      stepDelayMs: 500,
    }]
  }
  const snapshot = new ShowEngine(show).getSnapshot()
  useKeyboardControls(snapshot, dispatch)
  return <><input aria-label="Editor" /><button type="button">Focused control</button></>
}

describe('presenter keyboard contract', () => {
  it('maps 0 to team ten and Ctrl+Z to unified undo', () => {
    const dispatch = vi.fn(async () => undefined)
    render(<Harness dispatch={dispatch} />)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))

    expect(dispatch).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: 'team.select', teamId: 'team-10' }))
    expect(dispatch).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: 'history.undo' }))
  })

  it('does not trigger show shortcuts while typing in a form field', () => {
    const dispatch = vi.fn(async () => undefined)
    const { getByLabelText } = render(<Harness dispatch={dispatch} />)
    getByLabelText('Editor').dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('does not double-handle Enter or Space used to activate a focused button', () => {
    const dispatch = vi.fn(async () => undefined)
    const { getByRole } = render(<Harness dispatch={dispatch} />)
    const control = getByRole('button', { name: 'Focused control' })
    control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    control.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }))
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('uses optimistic team and preset selection for rapid key sequences', () => {
    const dispatch = vi.fn(async () => undefined)
    render(<Harness dispatch={dispatch} />)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(dispatch).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: 'score.adjust', teamId: 'team-2', delta: 1,
    }))
    expect(dispatch).toHaveBeenNthCalledWith(3, expect.objectContaining({
      type: 'preset.select', presetIndex: 1,
    }))
    expect(dispatch).toHaveBeenNthCalledWith(4, expect.objectContaining({
      type: 'score.adjust', teamId: 'team-2', delta: 3,
    }))
  })

  it('keeps cue arrows inert in the default manual-scoring show', () => {
    const dispatch = vi.fn(async () => undefined)
    render(<Harness dispatch={dispatch} />)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('executes Right Arrow when a prepared cue actually exists', () => {
    const dispatch = vi.fn(async () => undefined)
    render(<Harness dispatch={dispatch} withCue />)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'cue.execute' }))
  })
})
