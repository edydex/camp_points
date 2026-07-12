import { readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const platform = process.argv[2]
const expected = {
  mac: [{ label: 'universal macOS DMG', pattern: /-mac-universal\.dmg$/i }],
  windows: [{ label: 'Windows x64 installer', pattern: /-windows-x64\.exe$/i }],
  linux: [
    { label: 'Linux x64 AppImage', pattern: /-linux-(?:x64|x86_64)\.AppImage$/ },
    { label: 'Linux x64 Debian package', pattern: /-linux-(?:x64|amd64)\.deb$/i },
  ],
}

if (!(platform in expected)) {
  console.error('Usage: npm run verify:artifacts -- <mac|windows|linux>')
  process.exit(2)
}

const releaseDir = resolve(process.env.ROCKET_RELEASE_DIR || 'release')
let names
try {
  names = await readdir(releaseDir)
} catch (error) {
  console.error(`Release directory is unavailable: ${releaseDir}`)
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

const failures = []
for (const artifact of expected[platform]) {
  const matches = names.filter((name) => artifact.pattern.test(name))
  if (matches.length !== 1) {
    failures.push(`${artifact.label}: expected exactly one file, found ${matches.length}`)
    continue
  }

  const name = matches[0]
  const details = await stat(resolve(releaseDir, name))
  if (!details.isFile() || details.size < 1024 * 1024) {
    failures.push(`${artifact.label}: ${name} is missing or unexpectedly small`)
    continue
  }

  console.log(`Verified ${artifact.label}: ${name} (${Math.ceil(details.size / 1024 / 1024)} MiB)`)
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure)
  process.exit(1)
}
