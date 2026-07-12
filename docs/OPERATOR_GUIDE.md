# Operator Guide

## Prepare the show

1. Open **Quick Setup**, name the show, select one global theme, and configure two to ten teams.
2. Give every team a name, color, built-in badge, and one of the three rocket models.
3. In **Quick Setup**, set one to five award presets. In **Advanced**, set the tank capacity, markings, optional reserve tank, finale length/countdown, and bottom-team recovery count.
4. Build the **Cue Deck**. Each score cue stores relative changes, so a live correction does not invalidate later cues.
5. Rehearse score changes, undo/redo, announcements, and the finale before the event.
6. Export a `.rocketshow` checkpoint as an additional backup.

If the app finds an autosave at startup, the recovery screen offers **Resume saved position** or **Replay from baseline** before you continue.

## Connect the projector

Use an extended desktop when possible. Open **Venue Check**, select the external display, and make the Stage fullscreen. If the projector disconnects, scoring continues; reconnect it and reopen the Stage to receive a complete current snapshot.

With only one display connected, **Start show & open Stage** opens a stable,
windowed 16:9 Stage so the Presenter remains reachable. Use **Mirrored Stage**
when the audience and controls must share that single display. Automatic
fullscreen is reserved for a selected external projector; `F` still toggles it
manually.

The Stage is designed primarily for 16:9 at 1080p or 4K. It reflows for 16:10 and older 4:3 projectors. Use **Low particles** if a 4K display or older laptop cannot maintain smooth motion.

## Pair a phone without internet

1. Put the laptop and phone on the same trusted Wi-Fi network or personal hotspot.
2. In **Venue Check**, start the phone remote.
3. Scan the QR code and enter the six-digit PIN.
4. Only one phone controls the show. Pairing another requires an explicit replacement.

Some guest Wi-Fi networks isolate devices. If the page does not load, use a hotspot or operate from the desktop. The remote disables scoring while disconnected and never queues uncertain inputs.

On Windows, allow the app through Windows Defender Firewall on **Private networks only** if prompted. On macOS, allow incoming connections for the app in **System Settings → Network → Firewall**. If the QR code shows a VPN or virtual-network address that the phone cannot reach, use the first Wi-Fi/Ethernet address shown beneath it, turn off the VPN for the rehearsal, or use a personal hotspot. After changing networks, stop and restart the remote to generate a fresh address and PIN.

## Live operation

- Press a number first, then `Enter`/`+` to avoid accidental team awards.
- The desktop and phone use the same ordered command engine. Rapid score presses are recorded exactly even if the fuel animation is still catching up.
- `Ctrl/Cmd+Z` always reverses the newest transaction. Left Arrow only rewinds a cue when no newer manual edits are above it in history.
- If an animation must end immediately, use **Skip animation**; the authoritative score is already settled.
- Starting the finale freezes a non-destructive score snapshot. Hold the confirmation for two seconds.
- The optional background loop is “Mesmerizing Galaxy” by Kevin MacLeod and is bundled locally; no venue internet connection is needed.

## Five-minute venue preflight

- Connect laptop power and disable notifications.
- Confirm extended-display mode and projector resolution.
- Play the launch audio test through the venue speakers.
- Award one point, undo it, and redo it while watching the Stage.
- Execute one simultaneous and one sequential rehearsal cue.
- Disconnect/reconnect the phone once.
- Preview the finale cutoff; tied teams at its boundary will be protected.
- Verify that display sleep prevention activates when the show goes live.

## Unsigned internal builds

Windows may display **Windows protected your PC**. Choose **More info → Run anyway** only for the artifact produced from this repository. On macOS, Control-click the app, choose **Open**, then confirm. If macOS still blocks it, open **System Settings → Privacy & Security** and choose **Open Anyway** for Rocket Fuel Camp Points. Public distribution would require signing and notarization, which are intentionally outside this camp-only release.
