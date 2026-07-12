import { mkdtemp, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createDefaultShow } from '../../src/shared'
import { ShowPersistence } from '../../src/main/persistence'

describe('atomic show persistence', () => {
  const temporaryDirectories: string[] = []

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    )
  })

  async function persistence() {
    const directory = await mkdtemp(join(tmpdir(), 'rocket-fuel-persistence-'))
    temporaryDirectories.push(directory)
    return new ShowPersistence(directory)
  }

  it('round-trips a validated UTF-8 rocketshow autosave', async () => {
    const store = await persistence()
    const show = createDefaultShow({
      title: 'Camp Mission — Año 1',
      now: '2026-07-11T00:00:00.000Z',
    })
    await store.saveAutosave(show)

    const loaded = await store.loadAutosave()
    expect(loaded?.title).toBe('Camp Mission — Año 1')
    expect(loaded?.teams).toHaveLength(4)
  })

  it('recovers the previous valid autosave after an interrupted Windows replacement', async () => {
    const store = await persistence()
    const show = createDefaultShow({ now: '2026-07-11T00:00:00.000Z' })
    await store.saveAutosave(show)
    await rename(store.autosavePath, `${store.autosavePath}.previous`)

    expect((await store.loadAutosave())?.id).toBe(show.id)
  })
})
