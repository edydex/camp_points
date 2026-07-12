import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ShowTitleEditor } from '../../src/renderer/presenter/ShowTitleEditor'

describe('editable show header', () => {
  it('commits a trimmed camp name with Enter', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn(async () => true)
    render(<ShowTitleEditor title="Rocket Fuel Camp Points" onCommit={onCommit} />)

    const input = screen.getByRole('textbox', { name: 'Show title' })
    await user.clear(input)
    await user.type(input, '  Pine Ridge Kids Camp  {Enter}')

    expect(onCommit).toHaveBeenCalledOnce()
    expect(onCommit).toHaveBeenCalledWith('Pine Ridge Kids Camp')
    expect(input).toHaveValue('Pine Ridge Kids Camp')
  })

  it('cancels an edit with Escape without changing the show', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn(async () => true)
    render(<ShowTitleEditor title="Rocket Fuel Camp Points" onCommit={onCommit} />)

    const input = screen.getByRole('textbox', { name: 'Show title' })
    await user.clear(input)
    await user.type(input, 'Temporary title{Escape}')

    expect(onCommit).not.toHaveBeenCalled()
    expect(input).toHaveValue('Rocket Fuel Camp Points')
  })

  it('rejects a blank heading and restores the saved title', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn(async () => true)
    render(<ShowTitleEditor title="Rocket Fuel Camp Points" onCommit={onCommit} />)

    const input = screen.getByRole('textbox', { name: 'Show title' })
    await user.clear(input)
    await user.tab()

    expect(onCommit).not.toHaveBeenCalled()
    expect(input).toHaveValue('Rocket Fuel Camp Points')
    expect(screen.getByRole('status')).toHaveTextContent('Camp name cannot be blank')
  })

  it('disables persistent renaming while rehearsal uses a disposable show clone', () => {
    const onCommit = vi.fn(async () => true)
    render(<ShowTitleEditor title="Rocket Fuel Camp Points" onCommit={onCommit} disabled />)

    expect(screen.getByRole('textbox', { name: 'Show title' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('End rehearsal to rename')
  })
})
