# Rocket Fuel Camp Points

A fully offline, dual-display point tracker for kids camp. Teams are represented by animated rockets whose visible fuel tanks fill as points are awarded. The desktop Presenter Console controls a clean projector Stage and can optionally serve a paired phone remote over local Wi-Fi or a hotspot.

## What is included

- Two to ten fixed-position team rockets with exact score labels, dynamic major/minor tank markings, and an optional same-capacity reserve tank.
- A focused Cartoon Sci-Fi presentation world with playful rockets, particles, and sound.
- Scout, Booster, and Orbiter SVG rocket models with team colors and built-in badges.
- Live scoring, keyboard control, exact unified undo/redo, and pre-scripted relative score cues.
- Announcement cards, simultaneous or sequential cue delivery, project files, autosave, and crash recovery.
- Ranked launch finale with tied launch groups, score-relative power, protected cutoff ties, comic parachute recovery, and winner tableau.
- Hardened Electron Presenter/Stage windows and an offline LAN phone remote with QR/PIN pairing.

## Development

Requirements: Node.js 22.12 or newer.

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Sound effects and theme accents are original local WAV files. The bundled,
offline background loop is “Mesmerizing Galaxy” by Kevin MacLeod, used under
CC BY 4.0; see [Third-Party Notices](THIRD_PARTY_NOTICES.md). To regenerate the
original synthesized assets after changing the generator, run `npm run assets:audio`.

## Packaging

```bash
npm run dist:win   # Windows x64 NSIS installer; run on Windows
npm run dist:mac   # Universal Intel/Apple Silicon DMG; run on macOS
npm run dist:linux # Linux x64 AppImage and Debian package; run on Linux
```

Each operating system should build its own distributable; the local Mac can
produce the universal macOS DMG, while GitHub Actions supplies clean Windows
and Linux build machines. The **Build desktop installers** workflow is manual
or version-tag triggered and stores its unsigned outputs as workflow artifacts
for 14 days. A pushed `v*` tag additionally creates a GitHub Release containing
the macOS DMG, Windows installer, Linux packages, and SHA-256 checksums. A
manual workflow run builds artifacts without publishing a release.

The camp-team builds are intentionally unsigned. Windows may show a SmartScreen warning. On macOS, Control-click the app, choose **Open**, and confirm the first launch. On Linux, mark the AppImage executable before opening it (`chmod +x Rocket\ Fuel*.AppImage`), or install the Debian package with your normal package installer. No updater, cloud service, login, or telemetry is present. See [Packaging and Internal Distribution](docs/PACKAGING.md) for build and artifact details.

## Presenter shortcuts

| Shortcut | Action |
| --- | --- |
| `1`–`9`, `0` | Select teams 1–10 |
| `Enter` or `+` | Add the active award preset |
| `-` | Subtract the active preset |
| `[` / `]` | Previous / next preset |
| `Right Arrow` | Execute next cue |
| `Left Arrow` | Rewind latest cue when safe |
| `Ctrl/Cmd+Z` | Undo latest score or cue transaction |
| `Ctrl/Cmd+Shift+Z`, `Ctrl+Y` | Redo |
| `Space` | Pause/resume current animation |
| `M` | Mute/unmute |
| `F` | Toggle Stage fullscreen |

See [Operator Guide](docs/OPERATOR_GUIDE.md) for venue setup and [Show File Format](docs/SHOW_FILE.md) for persistence details.
