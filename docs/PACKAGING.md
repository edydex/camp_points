# Packaging and Internal Distribution

Rocket Fuel Camp Points is distributed as unsigned, internal camp-team builds.
It has no auto-updater. Release publishing occurs only when an intentional
`v*` version tag is pushed.

## Local macOS build

On an Intel or Apple Silicon Mac with Node.js 22.12 or newer:

```bash
npm ci
npm run dist:mac
npm run verify:artifacts -- mac
```

The result is a universal DMG in `release/` that contains both Intel and Apple
Silicon code. Building locally is the quickest path for testing the Mac app and
does not require GitHub Actions.

Because the build is unsigned, macOS Gatekeeper may block the first launch.
Control-click **Rocket Fuel Camp Points**, choose **Open**, then confirm. This is
appropriate for a known internal build; do not train recipients to bypass this
warning for apps from unknown sources.

## Native platform commands

Build each installer on its native operating system:

| Host | Command | Output |
| --- | --- | --- |
| macOS | `npm run dist:mac` | Universal `.dmg` |
| Windows x64 | `npm run dist:win` | NSIS `.exe` installer |
| Linux x64 | `npm run dist:linux` | Portable `.AppImage` and `.deb` package |

The package scripts first run the production build and TypeScript checks. Use
`npm run verify:artifacts -- mac`, `windows`, or `linux` afterward to confirm
that every expected distributable exists and is not an empty placeholder.

## GitHub Actions

The workflows have intentionally separate responsibilities:

- **CI** runs checks and Electron smoke tests for pushes and pull requests. It
  does not spend runner time creating installers.
- **Build desktop installers** validates the source, builds on macOS, Windows,
  and Linux in parallel, checks the resulting files, and uploads three private
  workflow artifacts. It runs only from **Run workflow** or a pushed `v*` tag.
  A version tag also publishes a GitHub Release containing all platform
  installers plus a `SHA256SUMS.txt` integrity file.

To prepare the workflow without running it, commit the workflow file normally
and do not use **Run workflow** or push a version tag. When a build is wanted,
open **Actions → Build desktop installers → Run workflow**. Download these
artifacts after the matrix completes:

- `rocket-fuel-macos-universal`
- `rocket-fuel-windows-x64`
- `rocket-fuel-linux-x64`

Manual-run artifacts are retained for 14 days and do not create a release. To
publish a version after updating `package.json`, push the matching tag, for
example `git tag v0.1.0 && git push origin v0.1.0`. The tag-triggered workflow
attaches the universal DMG, Windows installer, Linux AppImage and Debian
package to the GitHub Release. No signing certificates or custom publishing
secret is required; the workflow uses its narrowly scoped GitHub token.

## Unsigned-build expectations

- **Windows:** SmartScreen may show an unrecognized-app warning. Use **More
  info → Run anyway** only after confirming the file came from the camp team.
- **macOS:** use the Control-click **Open** flow described above.
- **Linux AppImage:** run `chmod +x <file>.AppImage` once, then open it. Desktop
  integration varies by distribution.
- **Linux Debian package:** install through the desktop package installer or
  `sudo apt install ./<file>.deb` on Debian-derived systems.

Code signing remains deliberately out of scope for this internal first
release. GitHub Releases inherit the repository's visibility.
