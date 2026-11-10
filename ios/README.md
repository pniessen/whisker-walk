# Whisker Walk 2 on iPhone and iPad

The app in this folder puts Whisker Walk on the home screen of your family's
iPhones and iPads: tap the cat icon and you're in the game, full screen, with
no Safari around it. It carries its own copy of the game, so it starts without
the internet (walking together still needs it).

It is signed with a free Apple ID, which has two limits:

- **Every install stops opening after 7 days.** Run the weekly refresh (below)
  and it's good for another 7 days.
- **At most 3 of your own apps on one device.** Hello World counts; delete it
  from a device if you need the room.

Design and plan: `docs/superpowers/specs/2026-11-09-ios-app-design.md` and
`docs/superpowers/plans/2026-11-09-ios-app.md`.

## Every week: the refresh

1. Wake the devices, unlock them, and make sure they're on the home Wi-Fi
   (or plugged into this Mac).
2. In Terminal, in the main `cat-game` folder, on `main` with nothing
   uncommitted:

   ```bash
   npm run ios:refresh
   ```

3. Read the last lines. Each device gets one:
   - `✓ installed`: done.
   - `– skipped`: it was asleep, locked or out of range. Wake it and run the
     refresh again (devices already done are simply done again).
   - `– not set up yet`: a new device; follow "Setting up a new device".
   - `✗ failed: …`: the reason is on the line. Unlock it and try again.

   The last line says when this install expires and the day to refresh by.

It takes a few minutes: it runs the game's tests, builds the game and the app,
and asks Apple for a fresh 7-day signing permit.

**Never delete the app to "fix" it.** Deleting the app deletes that device's
save. The refresh always installs over the top, which keeps it.

## Setting up a new device (once per iPhone or iPad)

1. **Plug it into this Mac** with a cable and unlock it. If it asks
   **Trust This Computer?**, tap **Trust** and enter its passcode.
2. **Wait a minute** while the Mac prepares it.
3. **Turn on Developer Mode:** on the device, **Settings → Privacy &
   Security**, scroll to the bottom, **Developer Mode** → on. It restarts;
   after unlocking, tap **Turn On** and enter the passcode.
   (If Developer Mode isn't listed, open Xcode → **Window → Devices and
   Simulators**, select the device, wait for it to finish preparing, then
   look again.)
4. **Run the refresh** with the device still plugged in and unlocked:
   `npm run ios:refresh`. It registers the new device and installs the app.
5. **Trust the developer certificate:** on the device, **Settings → General →
   VPN & Device Management** → under *Developer App*, tap
   **Apple Development: …** → **Trust**.
6. **Turn on Wi-Fi refreshes:** in Xcode → **Window → Devices and
   Simulators**, select the device and tick **Connect via network**. From now
   on it can be refreshed over the home Wi-Fi without the cable.
7. **Bring the cat across** (next section).

**If an iPad can't run iPadOS 17 or later,** the app can't go on it. That
child plays in Safari instead: open https://pniessen.github.io/whisker-walk/,
tap **Share → Add to Home Screen**.

## Bringing a cat across from Safari

The app keeps its own save, separate from Safari's. To bring a cat from
Safari into the app:

1. In **Safari**, open the game, tap **☰ Menu → Save → Save to cloud**, and
   write down the save code it shows (it looks like `WORD-WORD-WORD-00`).
2. In the **app**, tap **☰ Menu → Save**, type the code, and tap
   **Load from cloud**.

Keep a save code linked on every device. If an app is ever deleted, install
it again with the refresh and load the save back with its code.

## For developers

- `npm run build:ios` builds the app's copy of the game into `ios/web/`
  (gitignored). The website build (`npm run build`) is unchanged.
- `ios/WhiskerWalk.xcodeproj` is the app. `xcodebuild test -project
  ios/WhiskerWalk.xcodeproj -scheme WhiskerWalk -destination 'platform=iOS
  Simulator,name=iPhone 18 Pro' -derivedDataPath ios/build` runs its unit
  tests (build `ios/web` first).
- `npm run ios:refresh -- --dev` runs the refresh from a branch or worktree.
- Debug builds can be inspected from Safari on the Mac (Develop menu).
