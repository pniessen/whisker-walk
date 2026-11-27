# Whisker Walk on Android: design (2026-11-28)

Design only; no app code. Status: owner has one Android phone (model/Android version unknown, to be read in step 0 below). Parked since 2026-11-21.

## What we start from
- The game is a web app: WebGL (three.js), Web Audio, touch controls, gamepad (`src/gamepadnav.js`), localStorage saves (`KEPT_KEYS` in `src/ui/freshcat.js`), cloud saves via Supabase (baked from `.env.local`), and an offline-first service worker (`public/sw.js`, cache `whisker-v2`, precache list per build).
- Public site: GitHub Pages at `/whisker-walk/` (vite base); whiskerwalk.org switch is prepared (branch custom-domain) but waits for the owner. A TWA or any URL-bound wrapper must wait for that decision, or be rebuilt after it.
- `public/manifest.webmanifest` has `display: standalone`, `orientation: any`, `start_url: "."`, and **only an SVG icon**. Chrome Android wants PNG 192 and 512 (plus a maskable one) for a clean install prompt and for any TWA. Small fix, needed for (a) and (b).
- iOS app: WKWebView over a `vite build --mode ios` copy (relative base, `ios/web`), free signing renewed nightly by launchd (`ios/refresh.mjs`), device profile fed from the shell (`DeviceProfile.swift` into `src/render/deviceprofile.js`), haptics and nearby joining through the shell. Cloud keys only exist in the main checkout.
- Android needs none of the signing treadmill: a sideloaded APK signed once with our own key never expires.

## Options compared

**(a) Install the PWA from Chrome ("Add to home screen" / Install app).**
Cost: about 1 hour (PNG icons, test). Ongoing: none; updates arrive with every deploy via the service worker, exactly like the website. Risks: Chrome can evict site storage under pressure when the app is NOT installed (installed apps are exempt from eviction heuristics; call `navigator.storage.persist()` to be safe, check it is already called); saves live in Chrome's storage, so "Clear browsing data" wipes the cat (cloud save is the safety net); no haptics-from-shell (the Vibration API works on Android Chrome, so haptics may be a free win); Samsung Internet and Firefox behave differently. Kids' phones need only a link or QR code. Reaches every Android device with no store and no Mac.

**(b) Trusted Web Activity via Bubblewrap (sideloaded APK).**
Cost: about half a day. Needs Node, JDK 17, Android SDK (Bubblewrap downloads them), our own keystore (keep it backed up, losing it means no updates over the install), and Digital Asset Links (`/.well-known/assetlinks.json`) on the origin. **Blocker:** GitHub Pages serves a project site under `/whisker-walk/`; assetlinks must be at the domain root, so the TWA only verifies fully-screen (no URL bar) on whiskerwalk.org (custom domain) and not on `pniessen.github.io/whisker-walk`. Without verification it shows a browser bar. It is still Chrome underneath, so the same saves, service worker and updates as (a); gain is a real app icon, fullscreen, listed in app drawer, and a path to Play. Sideload on family phones: allow "install unknown apps" for the file source, tap APK. Play Protect may warn once.

**(c) Capacitor Android mirroring the iOS wrapper.**
Cost: 2-3 days plus upkeep. Bundles `build:ios` output (relative base) in an Android WebView; works offline from file/`https://localhost` origin; shell can feed device profile (RAM via `ActivityManager`, `Build.VERSION`), haptics, wake lock, immersive mode and back-button handling. Risks: WebView is the system "Android System WebView" (Chrome engine, updated via Play) so it matches Chrome; a second storage origin (app saves are separate from Chrome saves, same as iOS, move with cloud code); a second copy of the game to keep fresh (needs a refresh script like `ios/refresh.mjs`, but a plain `adb install -r`, no expiry); Capacitor's `https://localhost` origin breaks the relative-path service worker assumptions unless the SW is skipped as in iOS mode. Nearby joining (iOS Multipeer) has no Android counterpart; needs a separate decision.

**(d) Play Store release.**
Cost: one-time $25 developer account; since late 2023 new personal accounts must run a closed test with 12+ testers for 14 days before production. Identity verification, privacy policy URL (`docs/PRIVACY.md` draft exists), Data Safety form, content rating questionnaire. Child audience: if the app targets under-13s, Play's Families policy applies (no ads, no unsupported SDKs, COPPA-style data rules; cloud saves and Supabase need a careful Data Safety answer; the cat code login stores no personal data, to be confirmed). Review takes days and is repeated for every update. The repo is "all rights reserved" and going private: that is compatible, since the store holds the binary and the source never ships; a TWA or Capacitor APK does include the web assets, so anti-copying notes in `docs/` public-launch checklist apply equally. Trademark risk: Warrior Cats words in the Series switch default must be 'off' (everyday set) for a public store listing. Overkill for a family of four phones; revisit with the public launch.

## Gotchas to expect (this game)
- **Audio unlock:** Chrome and WebView need a user gesture before `AudioContext` runs; the launch tap should already resume it; test after backgrounding the app and after a phone call (context goes `interrupted`/`suspended`; resume on `visibilitychange`). Capacitor WebView: `mediaPlaybackRequiresUserGesture` default is true.
- **WebGL context loss** when the app is backgrounded on low-RAM phones; confirm the game recovers or reloads (the walk-resume feature, 12 h, covers a reload).
- **Fullscreen and orientation:** a PWA with `orientation: any` follows the rotation lock; `requestFullscreen` is not needed in standalone. Gesture navigation bars and display cutouts: `viewport-fit=cover` is set; check safe-area on the HUD. Back button leaves the app (handle with the pause card, or accept).
- **Gamepad:** Chrome Android exposes Bluetooth pads through the Gamepad API after a first button press; mapping can differ from iOS' "standard" layout.
- **GPU spread:** Mali/Adreno drivers vary; very old Adreno 3xx and Mali-400 fail shaders or precision. Use the device profile: add an Android branch in `deviceprofile.js` (Android major version, `navigator.deviceMemory`, `hardwareConcurrency`, renderer string via `WEBGL_debug_renderer_info`).
- **Thermals:** phones throttle after 10 to 15 minutes; the adaptive Auto rung must step down, and the 30 fps cap should apply.
- **Storage:** localStorage quota is generous (about 5 MB per origin); `KEPT_KEYS` reset logic unchanged. Service worker precache is ~25 files; Android storage is not a concern.
- **Refresh rate:** 90/120 Hz screens: the game must not assume 60.

## Performance expectation vs iPad 7
iPad 7 (A10, 3 GB) is our weakest measured device and starts at a low rung. A mid-range 2022+ Android (Snapdragon 7-series, Dimensity 700+, 6 GB) should match or beat it on CPU and roughly match on GPU, so expect rung 2 (HIGH minus some) there; a flagship (Snapdragon 8 Gen 2+) should reach HIGH like the iPhone 18. A budget phone (Helio G-series, Mali-G52, 3-4 GB) will sit near rung 4-5 and the 30 fps cap. Chrome's JS speed is on par with Safari; WebGL draw-call overhead is somewhat higher in the Android GPU process, so draw count (shadows are ~73% of draws) matters more.

## 10-minute checklist on the owner's phone (Chrome, any Android 9+)
1. (1 min) Chrome menu, Settings, About: note Android version, Chrome version, phone model. Open `chrome://gpu` and copy the renderer line and "WebGL: Hardware accelerated".
2. (2 min) Open `https://pniessen.github.io/whisker-walk/` (or the whiskerwalk.org address once live). Make a cat, walk the Neighborhood. Note touch controls, tap sizes, sound after the first tap.
3. (2 min) Add `?perf` to the URL, e.g. `.../whisker-walk/?perf`; read the fps/cpu readout after a minute. Then `?rung=2&perf`, `?rung=4&perf` to see what a forced step down costs. Note which rung Auto picked.
4. (2 min) Offline test: menu, Install app (or Add to home screen). Open it from the home icon (fullscreen?). Turn on airplane mode, kill the app from recents, reopen: does it start, does walking into the Farm and the House work?
5. (1 min) Rotate to portrait and back; pull down the notification shade; switch away 30 seconds and return: sound, picture, walk still there?
6. (1 min) Menu, Save: note the cloud code; clear nothing. Confirm the cat is still there after force-stop.
7. (1 min) If a Bluetooth pad is handy: press a button, walk with the stick, open the map.
Report: model, Android and Chrome versions, fps at HIGH and Auto's rung, whether install was fullscreen and offline, any black screen, sound dropout or lost cat.

## Recommendation
Do **(a) first, then (b) only if the chrome bar or home-icon feel bothers the owner**. Defaults, per owner decision:
- Decision 1, the family is happy with an installed web app: ship (a). Fix the manifest (PNG + maskable icons, `id`, `screenshots` optional), call `storage.persist()`, add an Android branch to the device profile. About 1 day total.
- Decision 2, they want a real icon and no browser feel, and whiskerwalk.org goes live: add (b) Bubblewrap APK, sideloaded; not before the domain switch.
- Decision 3, the owner wants offline guarantee or the Mac-built shell with haptics and pad: (c). Not recommended unless a measured gap in (a) and (b) appears; it copies the iOS maintenance burden.
- (d) Play Store: only with the public launch (checklist item), via the (b) APK; budget the $25, the 14-day, 12-tester closed test, and the Families review.
Default if no answer: (a) now, revisit (b) after the domain switch.

## Milestones (small builders)
1. Owner runs the checklist; builder records results in this spec (no code).
2. Manifest: PNG 192/512 + maskable icons from `ios/AppIcon.svg`, `id`, test with Lighthouse installability. Test: manifest unit test.
3. Android branch in `src/render/deviceprofile.js` (UA, `deviceMemory`, GPU renderer string); tests with fake profiles; starting-rung table marked estimate.
4. Audio resume on `visibilitychange`/`pageshow` check and WebGL context-loss recovery test; Vibration API haptics mirror of the iOS ones (optional).
5. Install guide for kids' phones (`docs/family/android.md`: link, QR, "Install app", cloud code to move the cat).
6. After the domain switch: Bubblewrap project in `android/` (gitignored keystore), assetlinks.json in `public/.well-known/`, `npm run android:build` script, sideload doc.
7. Only if chosen: Capacitor Android (`android/` shell, `build:ios`-style `build:android` mode, `adb install -r` refresh script).
8. Only for public launch: Play listing (account, privacy policy, Data Safety, closed test).
