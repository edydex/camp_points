import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

import { parseRocketShow, type RocketShow } from '../shared'

export class ShowPersistence {
  readonly autosavePath: string

  constructor(userDataPath: string) {
    this.autosavePath = join(userDataPath, 'shows', 'autosave.rocketshow')
  }

  async loadAutosave(): Promise<RocketShow | null> {
    try {
      return await this.readShow(this.autosavePath)
    } catch (primaryError) {
      // During the Windows replacement fallback, a crash can leave the last
      // valid file at `.previous`. Prefer recovery over opening a blank show.
      try {
        return await this.readShow(`${this.autosavePath}.previous`)
      } catch (backupError) {
        if (
          (primaryError as NodeJS.ErrnoException).code === 'ENOENT' &&
          (backupError as NodeJS.ErrnoException).code === 'ENOENT'
        ) return null
        throw primaryError
      }
    }
  }

  async saveAutosave(show: RocketShow): Promise<void> {
    await this.writeShow(this.autosavePath, show)
  }

  async readShow(path: string): Promise<RocketShow> {
    const source = await readFile(path, 'utf8')
    return parseRocketShow(JSON.parse(source) as unknown)
  }

  async writeShow(path: string, show: RocketShow): Promise<void> {
    const normalizedPath = extname(path).toLowerCase() === '.rocketshow' ? path : `${path}.rocketshow`
    const payload = `${JSON.stringify(show, null, 2)}\n`
    await atomicWrite(normalizedPath, payload)
  }
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  const handle = await open(temporaryPath, 'wx', 0o600)
  try {
    await handle.writeFile(contents, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }

  try {
    await rename(temporaryPath, path)
  } catch (error) {
    // Some Windows file systems do not replace an existing destination with rename.
    if (!['EEXIST', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      await rm(temporaryPath, { force: true })
      throw error
    }
    const backupPath = `${path}.previous`
    await rm(backupPath, { force: true })
    try {
      await rename(path, backupPath)
    } catch (backupError) {
      if ((backupError as NodeJS.ErrnoException).code !== 'ENOENT') throw backupError
    }
    try {
      await rename(temporaryPath, path)
      await rm(backupPath, { force: true })
    } catch (replacementError) {
      try {
        await rename(backupPath, path)
      } catch {
        // Preserve the original replacement error; the backup remains recoverable.
      }
      throw replacementError
    }
  }
}
