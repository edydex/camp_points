# `.rocketshow` Format

Rocket Fuel shows are UTF-8 JSON documents validated before use. The current `schemaVersion` is `1`.

The document stores:

- Stable show and team IDs.
- Team names, colors, icons, and rocket models.
- Theme, score scale, audio, display, and finale configuration.
- Baseline scores and the ordered cue deck.
- An optional runtime checkpoint containing scores, cue position, revision, selection, audio state, and exact undo/redo transactions.

On import, a file with a checkpoint offers two choices:

- **Resume** restores the saved score position and transaction history.
- **Replay from baseline** keeps the prepared setup and deck but begins at cue zero and the baseline scores.

Every future schema change must add a deterministic migration in `src/shared/schemas.ts`. Invalid team counts, dangling cue team references, unsupported values, and malformed commands are rejected before they can enter the authoritative engine.

All visual and audio content is built into the app, so show files contain no external URLs and remain portable between supported computers.
