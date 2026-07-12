import { describe, expect, it } from 'vitest'
import type { RuntimeStatus } from '../../src/preload/contracts'
import { describeAutosaveStatus } from '../../src/renderer/presenter/autosave-status'

const baseStatus: RuntimeStatus = {
  isLive: false,
  isRehearsal: false,
  presenterOpen: true,
  stageOpen: false,
  stageFullscreen: false,
  selectedDisplayId: null,
  powerSaveBlocked: false,
  autosaveAvailable: false,
  lastAutosaveAt: null,
  lastError: null,
}

describe('presenter autosave status', () => {
  it('shows the real successful save time', () => {
    const status = {
      ...baseStatus,
      autosaveAvailable: true,
      lastAutosaveAt: '2026-07-11T18:42:09.000Z',
    }

    expect(describeAutosaveStatus(status, () => 'Jul 11, 11:42:09 AM')).toMatchObject({
      label: 'Autosaved',
      detail: 'Saved Jul 11, 11:42:09 AM',
      title: 'Last autosave: 2026-07-11T18:42:09.000Z',
      tone: 'saved',
    })
  })

  it('surfaces a runtime error instead of claiming the show is saved', () => {
    const message = 'Autosave failed: disk is full'
    expect(describeAutosaveStatus({ ...baseStatus, lastError: message })).toMatchObject({
      label: 'Attention needed',
      detail: message,
      tone: 'error',
    })
  })

  it('does not claim an autosave before the first successful write', () => {
    expect(describeAutosaveStatus(baseStatus)).toMatchObject({
      label: 'Not saved yet',
      tone: 'pending',
    })
  })
})
