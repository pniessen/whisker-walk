# Whisker Walk 2 on iPhone and iPad

The app in this folder puts Whisker Walk on the home screen of your family's
iPhones and iPads: tap the cat icon and you're in the game, full screen, with
no Safari around it. It carries its own copy of the game, so it starts without
the internet (walking together still needs it).

It is signed with a free Apple ID, which has two limits:

- **Every install stops opening after 7 days.** The nightly refresh (below)
  renews each device before then; you can also refresh by hand.
- **At most 3 of your own apps on one device.** Hello World counts; delete it
  from a device if you need the room.

Design and plan: `docs/superpowers/specs/2026-11-09-ios-app-design.md` and
`docs/superpowers/plans/2026-11-09-ios-app.md`.

## Every night: the automatic refresh

Turn it on once, in Terminal, in the main `cat-game` folder:

```bash
npm run ios:schedule
```

From then on, every evening at 7 pm this Mac (on and logged in; if it's
asleep, it runs when it wakes):

- **renews only devices on their last 3 nights**, so in a normal week each
  device is reinstalled once;
- **waits while Whisker Walk is open** on a device (installing closes the
  game; a game left paused in the background counts as open), until that
  device's last night;
- **keeps trying every 30 minutes until 11 pm** for an iPad that's asleep or
  off the Wi-Fi;
- installs the latest `main` if its tests pass, and otherwise (tests failing,
  uncommitted changes, not on `main`) **reinstalls the last version that
  passed**, so the app never stops opening because of unfinished work;
- shows **one Mac notification** when it did something: a quiet "Renewed
  Kid B's iPad, good until …", or an alert with a sound when something
  needs you (an install failed on a device's last 2 nights, an iPad has been
  unreachable into its last 2 nights, the device list `ios/installs.json` is
  missing, nothing could be built, or the job itself crashed).

It keeps the Mac awake while it runs. Turning it on sends a test
notification: if you don't see it, allow notifications for **Script Editor**
in System Settings → Notifications (that's how the job posts them).

On its last day, the app itself shows a banner: *"This game needs a refresh
soon — ask a grown-up! It stops opening tomorrow."* It only appears if the
last night's renewal didn't happen, so if the children mention it, run the
refresh by hand.

```bash
npm run ios:schedule -- status    # on or off, and what the last run said
npm run ios:schedule -- remove    # turn it off
```

The log is `~/Library/Logs/whisker-walk-refresh.log`. If Node is upgraded to
a new major version, run `npm run ios:schedule` again (`status` says so).

**Retiring a device** (an old iPad given away or wiped): delete its line from
`ios/installs.json`, or the nightly job keeps alerting that it can't reach
it. A refresh by hand while the nightly one is running waits its turn: it
stops with "Another refresh is running"; try again in a few minutes.

## By hand: the refresh

Use this for a new device, after a nightly alert, or any time.

1. Wake the devices, unlock them, and make sure they're on the home Wi-Fi
   (or plugged into this Mac).
2. In Terminal, in the main `cat-game` folder, on `main` with nothing
   uncommitted:

   ```bash
   npm run ios:refresh
   ```

3. Read the last lines. Each device gets one:
   - `✓ installed`: done.
   - `– skipped`: it was asleep, locked or out of range, so it still has
     last week's install; the line says the day that one stops opening. Wake
     it and run the refresh again (devices already done are simply done
     again). If that day is close, a **Warning** line names the device.
   - `– not set up yet`: a new device; follow "Setting up a new device".
   - `✗ failed: …`: the reason is on the line. Unlock it and try again. A new
     device that can't be set up yet fails on its own line; the others are
     still refreshed.

   After the device lines, "New installs expire …" gives the date for every
   device marked `✓ installed`, and the day to refresh by.

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
   (If Developer Mode isn't listed, leave the device plugged in and unlocked
   with Xcode open for a few minutes, then look again.)
4. **Run the refresh** with the device still plugged in and unlocked:
   `npm run ios:refresh`. It registers the new device and installs the app.
5. **Trust the developer certificate:** on the device, **Settings → General →
   VPN & Device Management** → under *Developer App*, tap
   **Apple Development: …** → **Trust**.
6. **Unplug it.** From now on it's refreshed over the home Wi-Fi, by the
   nightly refresh or by hand; no setting needed.
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

## Walking together in the same room: nearby joining

When two devices running the app are in the same room, starting a walk
together takes one tap and no code:

1. On one device: **👫 Play together → Host a walk**. The room shows its code
   as always, and under it **Nearby cats can join with one tap**.
2. On the other device, open **👫 Play together**. Within a few seconds a row
   appears above the code box: **"Mittens is starting a walk nearby"** with a
   big **Join** button. Tap it. (Once Play together has been opened on a
   device, even on an earlier day, that device also shows the offer as a card
   over the cat's screen: **"Mittens is starting a walk nearby. Join?"**
   **Not now** puts the card away for that room.)
3. Both cats are in the room. Either child taps **Start the walk together**.

What to know:

- **Both devices need the app and the internet.** Only the room's code is
  found locally; the walk itself runs over the internet exactly as before.
  Safari and computers can't find rooms nearby. They join with the code.
- **The typed code always works.** It is on the host's screen the whole time.
  Use it for a cousin in another house, for a device in Safari, or whenever
  nearby joining doesn't show up.
- **The cat needs a name** (Play together → the name box). Tapping Join
  without one opens the name box and says so.
- **iOS asks once: "Whisker Walk 2 would like to find and connect to devices
  on your local network."** It asks the first time a child opens
  **Play together** on that device, never when the app starts, and never for
  a child who only plays alone. Tap **Allow** on both devices.
- **If someone tapped Don't Allow,** nothing breaks: the game says nothing
  about it and rooms are joined with the typed code. To switch it on later:
  **Settings → Privacy & Security → Local Network → Whisker Walk 2** → on
  (or **Settings → Apps → Whisker Walk 2 → Local Network**). Then close Play
  together and open it again.
- **What other devices can see:** the room's 4-character code and the cat's
  name, only while a hosted room is waiting on screen. Never the device's
  name, and nothing from the save. Anyone close by with the app could see the
  offer and join, just as anyone who can read the code off the screen could;
  the room shows the name of every cat that joins, and **Leave room** ends it.
- Nothing is looked for or findable during a walk or while the app is closed
  or in the background.

## For developers

- Cloud saves (the Save tile) are switched on by `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` in `.env.local`, which is only in the main checkout
  and is baked into the game when it is built. The refresh refuses to build
  without them and checks the built game still has them, so the children
  never get an app they can't load a save into. On a nightly run that means
  the last good version goes on instead, with an alert.

- `npm run build:ios` builds the app's copy of the game into `ios/web/`
  (gitignored). The website build (`npm run build`) is unchanged.
- `ios/WhiskerWalk.xcodeproj` is the app. `xcodebuild test -project
  ios/WhiskerWalk.xcodeproj -scheme WhiskerWalk -destination 'platform=iOS
  Simulator,name=iPhone 18 Pro' -derivedDataPath ios/build` runs its unit
  tests (build `ios/web` first).
- `npm run ios:refresh -- --dev` runs the refresh from a branch or worktree.
- `node ios/refresh.mjs --auto` is the nightly run (`--window-minutes=0` for
  a single round, `--retry-minutes=N`; `WHISKERWALK_NO_NOTIFY=1` logs notices
  instead of posting them). Its decisions are in
  `ios/autorefresh-lib.mjs`, tested by `test/iosautorefresh.test.js`. The
  last version that passed lives in `ios/last-good/` (gitignored: the game
  bundle and its commit); every successful refresh from `main` updates it.
- **The device profile.** The app tells the game what it is running on, so
  a slow iPad starts on graphics it can hold instead of finding out by
  stuttering. `DeviceProfile.swift` reads the hardware model identifier
  (`utsname.machine`, for example `iPad7,11`), physical memory, the thermal
  state and Low Power Mode. A user script at document start sets one frozen
  object before any of the game's code runs:
  `window.__whiskerDevice = { haptics, model, memoryGB, thermal, lowPower }`.
  While the game is open, a thermal-state change, a Low Power Mode change and
  iOS's memory warning each replace that object and send a `whisker-device`
  `CustomEvent` on `window` with the new values (`memoryWarning: true` for a
  warning); the page is also told the current state after every load. The
  game's side is `src/render/deviceprofile.js` and `src/game/adaptquality.js`;
  what it does with each fact, and the starting-rung table, are in
  `docs/VISUAL-PASS.md` ("Below LOW"). In Safari the object is absent and the
  game behaves as it always has. Tests: `DeviceProfileTests.swift`,
  `test/deviceprofile.test.js`.
- **Haptics.** In the app the game posts one word to
  `window.webkit.messageHandlers.haptic` and `Haptics.swift` plays it:
  `tap` (light: a pounce landing, a treasure, tipping something over),
  `double` (two soft taps: a greeting or a nose boop), `success` (a goal, a
  rank up, a golden mouse), `hit` (rigid: a blow landed or taken in a clan
  fight) and `purr` (one soft beat; the game sends one every 0.42 s while a
  purr lasts and stops on its own, so nothing can keep buzzing in the app).
  Any other message is ignored. iPads have no Taptic Engine: the device
  profile says `haptics: false` there, so the game sends nothing and shows no
  switch. The game's side, the moments and the rate limit, is
  `src/haptics.js`; in a browser with `navigator.vibrate` (Android) the same
  moments use that, and in Safari and on desktop nothing happens. To switch it
  off: Menu → Sound & controls → Vibration (stored with the other settings
  on the device, never in the save). The simulator plays nothing; feel is
  checked on an iPhone. Tests: `HapticsTests.swift`, `test/haptics.test.js`.
- **Nearby joining.** `Nearby.swift` uses MultipeerConnectivity for discovery
  only (`MCNearbyServiceAdvertiser` / `MCNearbyServiceBrowser`, service type
  `whisker-walk`, so `_whisker-walk._tcp` and `._udp` under
  `NSBonjourServices` in `Info.plist`, with `NSLocalNetworkUsageDescription`).
  No session is ever opened, no data is sent, and an invitation is declined.
  The peer display name is the fixed string `Whisker Walk`, never the
  device's name. The advertiser's discovery info is `{ c: <code>, n: <name> }`.
  The page drives it. Page to app,
  `window.webkit.messageHandlers.nearby.postMessage(...)`:
  `{ op: 'advertise', code, name }`, `{ op: 'stopAdvertising' }`,
  `{ op: 'browse' }`, `{ op: 'stopBrowsing' }`; anything else is ignored. App
  to page, a `whisker-nearby` `CustomEvent` on `window` on every change of
  what is found, `detail: { rooms: [{ code, name }] }` (at most 6, one per
  code, empty when nothing is found or the search stops). The game's side is
  `src/game/nearby.js`, which holds the whole rule for when each is on:
  advertise while this device hosted a code room that is still waiting on the
  home base; browse while the cat's screen or Play together shows and there
  is no room; neither before Play together has been opened once on the device
  (the `whisker-walk-nearby-opted` flag in `localStorage`, which is what
  keeps iOS's local-network question away from a solo player), in a walk, or
  with the page hidden. The app also stops both in the background on its own
  and starts them again in the foreground, and drops everything if the web
  content process is lost. Both sides check a code against the typed-code
  pattern and a name against the pet-name shape before believing it; the
  event's JSON is made by `JSONSerialization` from strings already reduced to
  letters, digits, spaces and hyphens. The block list is keyed by player id,
  which is never advertised, so it cannot hide a nearby host. In Safari there
  is no handler and none of this exists. Two real devices are the only real
  test: host on one, look for the row and the card on the other, and try once
  with Local Network switched off in Settings. The unit tests use a stand-in
  radio and never touch the network. Tests: `NearbyTests.swift`,
  `test/nearby.test.js`, `test/homebase.nearby.test.js`.
- **Looking at one graphics rung** on any device: launch with `-rung N`
  (0 to 5; 6 is rung 5 with the 30 fps cap) and `-perf YES` for the readout.
  They become `?rung=N&perf` on the page (`AppScheme.startURL(rung:perf:)`),
  hold for that launch only, and nothing is remembered:
  `xcrun devicectl device process launch --terminate-existing --device "<name>" com.pniessen.WhiskerWalk -rung 4 -perf YES`
  (on the simulator: `xcrun simctl launch booted com.pniessen.WhiskerWalk -rung 4 -perf YES`).
- Debug builds preview the expiry banner on the simulator:
  `xcrun simctl launch booted com.pniessen.WhiskerWalk -PreviewExpiryWarning YES`.
- The refresh runs `npx vitest run --dir test`, not `npm test`: in the main
  checkout a bare `npm test` also collects the tests of every other worktree
  (`.worktrees/`, `.claude/worktrees/`).
- Debug builds can be inspected from Safari on the Mac (Develop menu).
