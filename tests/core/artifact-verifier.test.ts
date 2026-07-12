import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

import { afterEach, describe, expect, it } from 'vitest'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('release artifact verifier', () => {
  it('accepts electron-builder Linux x64 architecture names', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rocket-artifacts-'))
    temporaryDirectories.push(directory)
    const payload = Buffer.alloc(1024 * 1024 + 1)
    await Promise.all([
      writeFile(join(directory, 'Rocket Fuel Camp Points-0.1.0-linux-x86_64.AppImage'), payload),
      writeFile(join(directory, 'Rocket Fuel Camp Points-0.1.0-linux-amd64.deb'), payload),
    ])

    const result = spawnSync(process.execPath, [resolve('scripts/verify-release-artifacts.mjs'), 'linux'], {
      encoding: 'utf8',
      env: { ...process.env, ROCKET_RELEASE_DIR: directory },
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Verified Linux x64 AppImage')
    expect(result.stdout).toContain('Verified Linux x64 Debian package')
  })
})
