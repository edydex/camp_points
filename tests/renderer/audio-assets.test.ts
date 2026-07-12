import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const names = [
  'sfx-select.wav',
  'sfx-fuel.wav',
  'sfx-drain.wav',
  'sfx-max.wav',
  'sfx-undo.wav',
  'sfx-announce.wav',
  'sfx-launch.wav',
  'sfx-mishap.wav',
  'sfx-win.wav',
  'accent-cartoon.wav',
] as const

describe('bundled audio assets', () => {
  it('ships every core sound and the Cartoon Sci-Fi accent as valid PCM WAV', async () => {
    const directory = resolve(process.cwd(), 'src/renderer/audio/assets')
    const files = await Promise.all(names.map((name) => readFile(resolve(directory, name))))

    for (const file of files) {
      expect(file.subarray(0, 4).toString('ascii')).toBe('RIFF')
      expect(file.subarray(8, 12).toString('ascii')).toBe('WAVE')
      expect(file.readUInt16LE(20)).toBe(1)
      expect(file.readUInt16LE(22)).toBe(1)
      expect(file.readUInt32LE(24)).toBe(32_000)
      expect(file.readUInt16LE(34)).toBe(16)
      expect(file.length).toBeGreaterThan(12_000)
      expect(file.readUInt32LE(40)).toBe(file.length - 44)
    }
  })

  it('bundles the credited seamless space-music loop as MP3', async () => {
    const file = await readFile(resolve(process.cwd(), 'src/renderer/audio/assets/mesmerizing-galaxy.mp3'))
    expect(file.subarray(0, 3).toString('ascii')).toBe('ID3')
    expect(file.length).toBeGreaterThan(2_000_000)
  })
})
