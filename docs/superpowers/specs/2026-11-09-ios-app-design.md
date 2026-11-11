# Whisker Walk on iPhone and iPad: the app shell (2026-11-09)

Source: a conversation with the owner on 2026-11-09, after the Mac was set up
for iOS work (Xcode 27.2, a Hello World built and run on the owner's iPhone).

## Why

Whisker Walk already plays well on phones in Safari (the owner has measured
60+ fps on an iPhone) and already has touch controls. What is missing is
**starting it**. A real app is "easier to start": one tap on an icon and you
are in the game, with no Safari, no typing the address, no bookmark, no
browser bars.

The players are the owner (iPhone 18 Pro, iOS 27.2) and their two children,
two young playtesters, who **each have an iPad**. Model and iPadOS
version of the iPads are not yet known.

## Goals

1. A home-screen app, **Whisker Walk 2**, that opens straight into the game,
   full screen, on iPhone and iPad.
2. The game is **bundled inside the app**: it starts without a network and is
   not a link to the website. Walking together (Supabase Realtime) still uses
   the network, as it does today.
3. **Saves are kept** across launches and across the weekly refresh (below).
4. **The screen stays awake** while the app is in the foreground.
5. **Nothing browser-like can happen**: no swipe-back, no page pinch-zoom, no
   rubber-band bounce or pull-to-refresh, no address bar, no link previews or
   text-selection callouts on long-press.
6. **A one-command weekly refresh** that rebuilds the game and reinstalls the
   app over the top on every family device it can reach, plugged in or over
   Wi-Fi.
7. **The children bring their Safari cats into the app** with the game's
   existing cloud save and save codes (the "Sync ☁️" panel,
   `src/game/cloudsync.js`). The owner wants this (2026-11-09), partly so
   each child stays the same player to the others for walking together and
   partner colonies. The Sync panel must work inside the app, which runs on
   a different origin from the website.

## Non-goals (this round)

- **Mid-walk resume** ("pick up where you left off" after iPadOS closes the
  app in the background). Agreed as the next change, to the game itself, in
  its own design.
- Haptics, Game Center, the App Store, TestFlight.
- Any new way of moving saves. Saves move only through the existing cloud
  save and save codes (goal 7); nothing copies Safari's local storage.
- A scheduled, unattended refresh. The refresh is a command the owner runs
  (Claude's call; can be revisited later).
- Any change to how the game looks or plays.

## Anti-goals (a failure even if it technically works)

- **A dead icon a child taps.** The free Apple ID makes installs expire after
  7 days; the refresh must be quick enough that it actually happens.
- **A refresh that wipes a save.** Reinstalling must always go over the top
  (same bundle id, same team). Deleting the app deletes that device's save,
  and the refresh must never do that.
- **Breaking the web game.** The GitHub Pages build, `npm run dev`, the
  deploy workflow, the test suite and `test/fixtures/flat-trace.json` must be
  unaffected.
- A shell that feels like a browser in disguise (see goal 5).

## Constraints

- **Free route.** The owner chose the free Apple ID (Personal Team
  `CWCZY9U9A8`) for now, not the $99/year program. Consequences the design
  must live with:
  - every install expires 7 days after it was signed;
  - each device must be connected to this Mac once (USB, "Trust", Developer
    Mode on) before it can be installed to, and can then be reached over
    Wi-Fi when on the same network;
  - a free team can have at most 3 of its apps on one device at a time.
- **Toolchain on this Mac:** Xcode 27.2, iOS 27.2 SDK, Swift 6.4, macOS 26.6.2,
  Node from mise (non-interactive shells need `zsh -ic`). No Homebrew.
- **Devices:** iPhone and iPad, all orientations, **iOS/iPadOS 17.0 or later**
  (the oldest Xcode 27.2 can install to). The iPads' models and versions are
  unknown; the owner will check them later. **If an iPad can't run iPadOS 17,
  that child stays on the Safari version** (Share → Add to Home Screen), and
  `ios/README.md` says how. Nothing is designed around an older iPad.
- **The iPads are not locked down** (owner, 2026-11-09): no Screen Time block
  on installing apps, no school or management profile, no filter or VPN app,
  no separate kids' Wi-Fi. The plan can assume Developer Mode, certificate
  trust and Wi-Fi installs are all allowed.
- **No new npm dependencies** and **no third-party iOS frameworks** (no
  Capacitor, no CocoaPods/SPM packages). A small hand-written Swift app.
- **Secrets:** the build bakes in `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` from `.env.local`, exactly as the deploy workflow
  does from repo secrets. The anon key is public by design. `.env.local` is
  never committed.

## Decided (by the owner)

- Free route, weekly refresh.
- iPhone and iPad.
- The children bring their Safari cats in with save codes (goal 7).
- Extras this round: screen stays awake; no browser accidents.
- Mid-walk resume later, as a separate game change.
- The overall shape below (an `ios/` folder, a Swift shell around the bundled
  game, the name and icon) was played back and approved.

## The shape (Claude's calls, approved in outline by the owner)

### Where it lives

A new `ios/` folder at the root of this repo with a small Xcode project. The
web game's code stays where it is. Bundle id `com.pniessen.WhiskerWalk`,
display name **Whisker Walk 2** (matching the splash screen and page title),
icon from the existing `public/icon.svg` rendered to a 1024×1024 PNG.

### A build of the game for the app

A second Vite build of the same code for the app, separate from the Pages
build:

- relative base (`./`) instead of `/whisker-walk/`. The game already routes
  asset URLs through `import.meta.env.BASE_URL` (`src/main.js` samples and
  service worker, `src/ui/dressingroom.js` place pictures), so this should be
  a configuration change, not a code hunt; the builder confirms nothing else
  assumes an absolute path;
- **no service worker** in the app build. `src/main.js` registers `sw.js`
  under `import.meta.env.PROD`; the app build must not register it (it would
  only fail, and the app is already offline);
- `public/clan-edition.html` (a promo page that links to the website) is not
  needed in the app;
- output goes to a gitignored folder that the Xcode project copies into the
  app **with its folder structure intact** (`places/`, `sounds/`, assets).

How the app build is selected (a Vite `mode`, an env flag, a separate config)
is the builder's call, as long as the default `npm run build` output is
byte-for-byte what it is today.

### The Swift shell

One full-screen web view showing the bundled game.

- **Serving the files:** from a custom URL scheme handler, not `file://`, so
  the game has one stable origin (its `localStorage` save survives launches
  and reinstalls) and ES modules, `fetch` and audio files load with correct
  MIME types.
- **Saves:** the web view uses the persistent default data store. The save
  lives in the app's own data, so reinstalling over the top keeps it.
- **No browser accidents:** scrolling and bounce off, page zoom off,
  back/forward swipe gestures off, link previews off, content insets left to
  the page (the page already uses `viewport-fit=cover` and safe-area insets).
  Any navigation that leaves the bundled game (an external link) opens in
  Safari instead of inside the app.
- **Screen awake:** the idle timer is disabled while the app is in the
  foreground.
- **Edges:** status bar hidden; the home indicator auto-hides; system
  gestures at the screen edges are deferred, so a thumb on the joystick near
  an edge doesn't trigger Home or Control Center by accident.
- **Sound:** web audio plays without an extra tap beyond what the game
  already needs, and inline media is allowed. Whether the iPhone's silent
  switch mutes the game is the builder's call (Claude's default: it does,
  like most casual games).
- **iPad:** full screen, all orientations; split-screen multitasking is not
  needed.
- **Launch:** while the web view loads, the app's launch screen matches the
  game's splash background (`#1c2431`) so there is no white flash before the
  game's own splash appears.

### The weekly refresh

A single script in `ios/` that:

1. checks it is building **`main` as committed** in the main checkout (not a
   worktree), and refuses to run if there are uncommitted changes, so
   unfinished work never reaches the children (Claude's call);
2. runs `npm test`, as the deploy workflow does, and stops if it fails
   (Claude's call);
3. builds the app version of the game;
4. builds and signs the app with the Personal Team
   (`-allowProvisioningUpdates`);
5. finds every paired physical iPhone/iPad this Mac can reach (USB or Wi-Fi)
   and installs over the top on each;
6. prints, per device, whether it worked, and the date the new install
   expires (signing date + 7 days), so the owner knows when the next refresh
   is due.

It never uninstalls. A device that is asleep or out of range is reported and
skipped, not treated as a failure of the whole run.

First-time setup for each child's iPad (connect, Trust, Developer Mode, trust
the developer certificate in Settings → General → VPN & Device Management)
is written down as plain steps in `ios/README.md`, along with how to turn on
"Connect via network" so later refreshes can happen over Wi-Fi.

The README also has a **"bring your cat across"** step: in Safari, open
Sync ☁️ and note the save code; in the app, enter it. Every family member
keeps a save code linked, so an app that does get deleted can be restored.

## Left to the builder

- The project layout inside `ios/`, file names, and how the web build is
  wired into the Xcode build (a copy phase, a folder reference, a pre-build
  script).
- The custom scheme's name.
- Tests: any change to the game's JavaScript (the app build mode, the service
  worker guard) gets Vitest coverage in the repo's usual style; the full
  suite must stay green. Swift-side testing is the builder's call; at minimum
  the app is run on the iPhone simulator and on the owner's iPhone, and a
  walk is played.
- Checking each iPad's model and iPadOS version on first setup, and a quick
  frame-rate look with the game's own `?perf` readout. The game's **Auto**
  graphics quality is expected to cope with a slower iPad; a real problem
  there is reported to the owner, not designed around in advance.

## Done when

- Tapping **Whisker Walk 2** on the owner's iPhone opens the game full screen
  with no browser chrome, plays a walk, and a whisker-point change is still
  there after quitting and relaunching.
- The same holds after running the refresh script (the install goes over the
  top and the save survives).
- A save made in Safari comes into the app through its save code, and a
  walk-together room works between the app and a browser.
- The screen does not dim during a walk, and swipe-back, pinch-zoom and
  bounce do nothing.
- The web build, deploy workflow, `npm run dev` and `npm test` are unchanged
  in behaviour.
- `ios/README.md` lets the owner set up a child's iPad and run the weekly
  refresh without help.
