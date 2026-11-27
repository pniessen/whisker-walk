# Couch co-op: two cats, one area, one screen

Date: 2026-11-22. Status: design for owner approval, nothing built. Branch `couch-coop-design` (from main 0480aa7c).
Plan: `docs/superpowers/plans/2026-11-22-couch-coop.md`.
Builds on TV mode (`2026-11-22-tv-mode-design.md`), the controller layer (`src/gamepad*.js`), the device-profiles design (branch `device-profiles`, section "Two-cat couch mode") and the cat-login work that just merged.

Everything under "What the code does today" was read in this worktree. Numbers marked *computed* come from formulas in the code, not from a run. Nothing was built, run or measured; section 15 lists what only two real pads can settle.

## 0. The ask, in the kids' words

"Me and my brother want to play together on the TV. Two cats, same place, each with our own controller."

Today co-walk is two devices online (`src/net.js`, `src/remotecats.js`). The owner's TV design (decision 2) said: one player, and nothing may make two pads impossible later. This is that later.

Anti-goals (from the players, as the other specs have them): the 9-year-old is never stuck waiting for his sister's cat; the 11-year-old is never dragged along by the camera; nobody loses a find to the other kid's sync; nothing says "Player 2"; no text under 24 px on the TV.

## 1. Answers at a glance

| # | Question | Recommendation |
|---|---|---|
| 1 | Camera | **Shared camera** on the midpoint, zooming out through the existing steps as the cats part. Split screen not built. |
| 2 | When they separate | Zoom out to step 3 (computed about 23 m apart on a 16:9 TV), an idle cat trots to its friend, a soft rubber band from about 21 m, a hard stop at the frame edge, and **hold D-pad Down = "Hop to my friend"**. Off-frame cat gets an edge marker. |
| 3 | Who turns the camera | Nobody freely. In couch play the view has a fixed yaw; **L1 / R1 snap it a quarter turn** (either pad). A stick held through the turn keeps its direction. Free orbit stays solo only. |
| 4 | Pads | A pad **hub** in the lazy chunk owns two slots; `gamepad.js` is unchanged except one optional argument. Pad plus keyboard works (keyboard = player one). |
| 5 | Assign / reconnect | Join card: "Press ✕ to join" on each pad, in order. A disconnect pauses and asks that cat's kid to press any button; slots are never reshuffled silently. |
| 6 | Saves | **One save, two cats** (shared household) first. A second saved profile is milestone 7, only if the owner wants it. |
| 7 | Second cat's model | Reuse the co-walk partner model (`buildCat(..., { simple: true })`, name tag, water look, ground lean), driven by a **second local mover**, not by the wire. |
| 8 | HUD | Shared: paws, map, goals, area. Per player: prompt (two slots, left and right), a coloured ring and shape under each cat, finder chips on toasts. One toast at a time on TV, as today. |
| 9 | Menus | The pad that opened a card owns it. Start on either pad pauses. Confirms must come from the owner pad. |
| 10 | Fights | One fight at a time; the challenger's pad plays, the other cat sits and cheers. Co-walk's "sibling's win ends it" rule is reused. |
| 11 | Cost | Second cat is a **simple cat** (cap 5,500 triangles, same as today's co-walk partner). No place ceiling is raised. A new "place + two cats" test pins it. |
| 12 | Start-up | Seam at most 0.4 kB gzipped; start-up stays at 709.5 of 720, never raised; everything else in a new lazy `coop` chunk (ceiling 25 kB gz). |

## 2. What the code does today (facts that shape the design)

| Area | Fact | Where |
|---|---|---|
| Pad count | `pick()` takes the first connected `standard` pad and keeps one `activeIndex`; a second pad is ignored. Disconnect of another index is ignored. | `src/gamepad.js` |
| Pad math | `stepPad(state, pad, dt, opts)` is pure and per-pad (`createPadState` per call). It already supports two states. | `src/gamepadinput.js` |
| Pad modes | `walk` / `menu` / `none`, decided by one `modeNow()`; the menu navigator is a single DOM walker with one focus ring (`pad-focus`). | `src/gamepad.js`, `src/gamepadnav.js` |
| The player | `createPlayer(camera, canvas)` is one closure that does **movement, collisions, water, perches, pounce hop, zoomies and the camera**. It also hooks `document` keydown/keyup/mousemove and the canvas click at creation. A second instance would double-listen to the keyboard. | `src/player.js` (1,236 lines), listeners at the foot |
| Camera | Yaw changes only by orbit input and `setViewYaw`; there is no auto-follow. Movement is camera-relative. Distance and height come from four fixed steps `{3.0,1.5} {4.5,2.2} {7,3.8} {11,6.5}`; `PerspectiveCamera(70)` is the vertical FOV. Pull-in near buildings is `cameraPullScale`. Other systems already nudge the camera after `player.update` (Fairground rides, Rooftops vane). | `src/camzoom.js`, `src/player.js`, `src/fairlive.js`, `src/roofslife.js` |
| Held-stick lock | `player.setInputYaw(v)` holds the yaw a stick is turned by, independent of the camera (the balance walk uses it). | `src/player.js`, `src/traversallive.js` |
| Partner model | Remote cats are built `simple: true`, with accessories, a name tag marked `partner` (bigger text on phones), water and ground-lean looks, ride-seat lift and interpolation of 8 Hz state. | `src/remotecats.js` |
| Partner verbs detected locally | Pounce-tag landings and mutual grooming are detected from already-synced state, not from events. | `src/game/avatar.js` header |
| Co-walk events | `tip, knock, tip-gnome, dig, collect, meow, boop-request/confirm, duet, bat, yarn-authority, pounce-tag, tag-back, goal-progress, colony-feed, carry-pick/drop, clan-buddy, intruder-fight/done, patrol-fight/done, border-cross, walk-on*` | `src/game/netevents.js` |
| Single-cat systems | `session.cat` plus `player` are read by interactions (31 uses), traversal (35), avatar (31), walk (29), fairplay/fairlive, roofslife, denlive, marketlive. Each holds per-cat state (mouth, zoom charge, pounce timers, perch hold). | `src/game/*`, `src/*live.js` |
| Save | One save per device: `localStorage['whisker-walk-save']`, with up to 5 own cats (`customCats`) and **save-level** `equipped` accessories, `skills`, `golden`, `journal`, `points`, `outfits` (5 saved wear sets). The family build already shows a second key is possible (`IS_FAMILY`). `createProgression(storage)` takes the storage object, so a prefixed wrapper could give a second save without editing the module. | `src/progression.js`, `src/familyflag.js` |
| TV | `html.tv`, floors 24 px body and 20 px small, one toast at a time (`TV_MAX_TOASTS = 1`, 2.5 to 5 s), safe margins 5 %, glyph tokens by the last input. TV chunk ceiling 30 kB gz. | `src/tv/*`, `src/tvseam.js` |
| Budgets | Start-up 709.5 / 720 kB gz (`MAIN_GZIP_CEILING_KB = 720`). Simple cat cap 5,500 triangles, full cat cap 10,350 (`test/catfaces.test.js`). Place tests measure the **place only** (`test/budget.test.js` AREAS: neighborhood 70k, docks 90k, fair 75k, house and roofs 70k, market 62k, farm 62k triangles); the Fairground sits at 74.3k and its chunk at 95.8 / 100 kB. | `test/budget.test.js`, `test/fairgames.test.js`, `scripts/buildjson.mjs` |

Two consequences:

1. **The hard part is not the second cat, it is that the walk is one-cat all the way down.** Co-walk gets away with it because the partner's physics runs on the other device. Couch play must run the second cat's physics here.
2. **The partner model is the right thing to draw with**, and the existing partner-aware code (house finds and front door watch `session.remotes.list`, the Market keeper sees every entry, crossings ask "who walks on with me", the camera-facing tags declutter) will treat a local second cat as a partner for free if it appears in `session.remotes`.

## 3. Shape: the second cat is a local co-walker

```
pad 1 -> hub slot 1 -> player (today's, with the camera)  -> cat 1 (full build)
pad 2 -> hub slot 2 -> mover  (headless player, no camera) -> state -> remotes.applyState(local) -> cat 2 (simple build, partner tag)
```

- **Mover** = `createPlayer(dummyCamera, null, { headless: true })`. A new option that skips the document and canvas listeners and returns the same API (`setTouchMove`, `update`, `pounce`, `perchY`, `inWater`, `setSwim`, `setZoomTuning`). Its dummy camera is never rendered. This is the only edit to `player.js` (about 8 lines, under 0.2 kB gz). Collisions, water, perches, hop arcs, skills and ground slope are then identical to cat 1's, with no copy of the physics.
- **Drawing**: each frame the coop chunk builds a state message `{x, z, yaw, pose, speed, h, seat?}` from the mover and calls `session.remotes.applyState` with a zero-delay flag (a local cat needs no 150 ms interpolation window; one flag in `remotecats.js`' `INTERP_WINDOW`, lazy-safe). The entry has a local id (`local:2`), never sent anywhere.
- **No net**: couch play and online co-walk exclude each other for one walk (no three- or four-cat rooms, no id clash, no "friend request"). `session.net` stays null in a couch walk. Colony feeds and goals from cat 2 count as the household's, attributed to this device's player id.
- **Why not "a second `createPlayer` plus two sessions"**: the live systems (rides, traversal, market, house, fights) hold one `cat`/`player` in the session. Making them two-actor is the long pole, so it is staged by place (section 11), not attempted at once.

### Actor parity ladder (what cat 2 can do, by milestone)

| Level | Cat 2 can | Milestone |
|---|---|---|
| L0 | Walk, wade, swim (with the save's skills), hop, meow, be seen, be named, sit when idle | M1 to M2 |
| L1 | Collect paws and golden mice, catch critters, sniff and talk, carry and drop, wear a saved outfit; the household's goals and journal count it | M3 |
| L2 | Groom and pounce-tag with cat 1 (detected locally already), fights and border patrol | M4 |
| L3 | Place specials: Farm jobs, Market stalls and keeper, Fair rides (two riders), Rooftops climbs and crossings, House levels | M5 a to f |

A place that is not yet at L3 shows the join card with "Couch play is not ready here yet" and offers the open places. The list is a table in the coop chunk, and a test fails if a place in `CATALOG.areas` is missing from it (so a new place cannot be forgotten).

## 4. Camera

### Recommendation: one shared camera (split screen not built)

| | Shared camera | Split screen |
|---|---|---|
| Draw cost | one pass (same as today); a wider view draws more of the world | two passes, half height each; doubles draws and shadow passes |
| Pixel budget | unchanged | TV pixel budget (`adaptquality.js`) drops a rung per half |
| Interface | one HUD, one map, one toast queue | two HUDs, two safe areas, two maps |
| Code | one camera, a framing function | `player.js`, composer and every after-update camera nudge (Fair, Rooftops, House walls) done twice |
| Weakness | cats part, camera must widen or hold them | tiny views on a TV; cannot show the other kid's cat nearby |
| Fits kids | they are mostly together (the TV spec's sofa play) | useful only if they split far apart |

Split screen is revisited only if kids part so often that the leash annoys them (the device-profiles Q6 answer, unchanged). It is not in this plan.

### Framing

- Camera target = midpoint of the two cats (a cat in a ride, on a perch or on a beam counts at its drawn height).
- The player keeps its own camera code. A coop post-pass runs after `player.update` (the way `fairlive.js` already carries the camera) and re-places position and look-at for the midpoint and the extra distance. Frame order: cat 1 `player.update`, mover `update`, framing post-pass, then the place's after-update nudges.
- Extra distance comes from the existing steps, interpolated by `zoomView`, so nothing new in the camera maths. The safe box is 85 % of the width and 80 % of the height; the camera widens until both cats fit or step 3 (11 m, 6.5 m) is reached.

*Computed* from `PerspectiveCamera(70)` (vertical), 16:9, 15 % margin each side: both cats fit at about 9 m apart on step 1, 14 m on step 2, 23 m on step 3. On 4:3 or a phone the numbers fall; the limit is read from the live frustum, not hard-coded. Zoom easing follows `reducedMotion` (a snap, no ease).

### When they separate

| Gap | What happens |
|---|---|
| up to the frame at the chosen step (about 9 m) | camera stays at the step the kids chose (default 1), centred on the midpoint |
| wider | camera eases out through steps 2 and 3, easing back as they close (1 s in, 2 s out, so it does not pump) |
| over about 8 m and a stick idle for 3 s | **follow when idle**: the idle cat trots toward its friend and stops at 3 m; any stick input cancels it at once. Reuses the clan escort ("buddy") walking code. On by default; a Settings switch turns it off. |
| over about 21 m | **soft rubber band**: moving apart slows from full to 35 % over 3 m; moving closer is never slowed |
| at the frame edge at step 3 | moving apart stops; the stop is shown by a small "stretch" pose and a one-line hint ("Hold ↓ to hop to your friend", with the pad glyph) |
| any time | **hold D-pad Down for 0.8 s: hop to friend**. A ring fills over the cat; it lands beside the friend with a puff; either pad may do it for its own cat. Works across walls. |
| a cat out of frame (pull-in behind a building, indoors) | an **edge marker** (arrow in the cat's shape and colour) at the screen edge, at least 48 px |

A rubber band alone can trap two cats on either side of a wall (the straight line is short, the path is long, and "toward each other" is blocked). That is why hop-to-friend and follow-when-idle both exist, and why tight places (section 11) use a shorter leash plus the spotlight rule.

### Who turns the view

Camera-relative movement with two kids is the sharpest edge: if one kid orbits, the other's controls rotate under their thumb.

- Couch play locks the yaw to a **pair heading** (the view every walk starts with, yaw 0). Both sticks move the cats relative to the screen, so "push right = go right on the TV" holds for both.
- **L1 / R1 snap the view a quarter turn** (eased 0.5 s, snap if reduced motion). A stick held through the turn keeps its world direction until it is let go (`player.setInputYaw`, the balance walk's mechanism), so a turn can never reverse a cat mid-stride.
- Zoom buttons are not used in couch play (framing owns zoom). The right stick does nothing in v1 (a small look-around nudge is a later nicety).
- Photo mode: Y (triangle) on either pad, frames both cats; the photo is credited to no one.

## 5. Pads, assignment and reconnection

### Hub (lazy chunk)

`src/coop/padhub.js` owns up to two slots `{ index, id, state, held, prevDown, mode }`. Each frame it reads `navigator.getGamepads()` once and runs `stepPad` per slot with that slot's own state. A walk slot sends its outputs to its own actor: slot 1 to `player.setTouchMove/addOrbit`-free (the pad's orbit output is dropped in couch play, section 4), slot 2 to the mover. Both pads keep today's button map (A pounce/climb, B meow, X interact, Y photo, Start pause), plus L1/R1 turn, D-pad Down hold hop.

`gamepad.js` is not rewritten. It gains one optional argument, `poll(dt, forcePad)` (about 60 bytes), so the menu path (`menuFrame`) can be fed whichever pad owns the menu. In couch play the hub calls it; solo play never passes the argument. Solo behaviour, including every existing gamepad test, is untouched.

Chrome gives up to four standard-mapped pads. A non-standard pad is ignored as today ("unknown layout: do nothing rather than guess").

### Assignment (join card)

| Step | What the kids see | Rule |
|---|---|---|
| 1 | Home or the Change place card has a "Two cats" button, shown when two standard pads are connected, or one pad and a keyboard, or TV mode is on | never auto-starts |
| 2 | "Press ✕ to join" twice, left and right, each in a coloured ring with its own shape; first press = left slot | the **press**, not the pad's index, decides the slot |
| 3 | Each kid picks a cat with their own pad (left/right, ✕ to confirm) | cat 2 cannot be the same cat as cat 1; the picker greys it |
| 4 | Each picks an outfit: "Plain" or one of the household's saved outfits (`state.outfits`) | no new dressing UI |
| 5 | "Ready!" when both are confirmed | either kid can step back with ○ |

Last choices are remembered in localStorage `whisker-walk-coop` (per device, like `tvMode`): cat 2's id, both outfits, the follow-when-idle switch. They are **not** in the save or the cloud save, so there is no migration and no sanitiser change.

### Pad plus keyboard

Keyboard is always player one (today's arrows and WASD, E, Space, M ...); the first pad press joins as player two. That is the fallback when only one pad is connected. Pad-only for player one with a second pad is the main case. Two players on one keyboard is not built (letter keys collide with E, Q, V, M, T, C); noted as an optional extra in the last milestone.

### Disconnect and reconnect

| Event | Result |
|---|---|
| Either pad disconnects | The walk **pauses** at once (as TV mode does for a lost pad) with a card: "<cat name>'s controller went to sleep. Press any button on it." The cat sits. |
| A pad that is not owned sends a button press | It takes the empty slot. Identity is the **slot**, not `index` or `id` (two DualSenses share the same `id` string and Chrome may hand back a different `index`). |
| Both disconnect | Both slot prompts, left first. |
| Bluetooth idle sleep | DualSense switches off after a while with no input; same path, no scolding wording. |
| Pad 1 lost and keyboard present | Keyboard keeps player one; resume offered. |
| One pad left and the other kid has gone | "Keep playing together" (cat 2 sits and follows) or "Play alone" (cat 2 leaves with a wave; the walk continues solo). |

## 6. Two cats on one device: saves and ownership

### Option A, recommended first: one save, two cats ("shared household")

| Thing | Owner in couch play |
|---|---|
| Cat 1 | the save's current cat and wear (what today's walk uses) |
| Cat 2 | any other cat in the save: the three presets or any of the five `customCats`; the outfit is one of the save's `outfits` |
| Paw points, lifetime points | one pool, one HUD counter |
| Discoveries, journal, golden mice, friends, colony, tutorial | shared; found once is found for the household |
| Skills (`skills` and `feats`) | shared: cat 2 gets the same abilities (Sea Legs, Long Zoomies, Spring Paws ...) from the same save, so no kid has a worse cat |
| Walk counts, visits, clan pick | shared, counted once per walk |
| Scars | per cat (`scars[key]`) as today; cat 2 scars on its own key |
| "Who found it" | a per-walk tally in the summary card: "Mochi found 7, Pip found 5". Not saved. |

Why first: no save change, no cloud change, no cat-login change, no second 150 kB save, no merge, and the 9-year-old cannot lose something because of his sister's save. The cost is that the kids share one pot of paws; the summary tally is the fairness answer. If a kid wants "my own paws", that is Option B.

### Option B, milestone 7 only if asked: a second saved profile

- A second storage key (for example `whisker-walk-p2-save`, and the five backup keys derived from it), made by a prefixing storage wrapper passed to a second `createProgression`. `progression.js` is not edited; `IS_FAMILY` already proves a distinct key is fine.
- Local only: no cloud link, no pid, no cat login for this profile in v1 (the cat key work covers one save per device).
- Owns paws, discoveries, golden mice, skills, outfits, its own cats; shared only: the walk's world, goals' progress (counted in both), and a few household items (clan, edition).
- Sizes: the guarded 150 kB save cap applies to each save separately (about 101 kB measured today).
- Risks: two saves in one tab means every function that takes `progression` (many call sites in the walk; not counted) must take the right one per actor; the "who owns this find" rule for shared world objects; backups and "Start over" need a profile picker; the Settings "Save to cloud" must say which. This is why it comes last.

Recommendation is A, with B drawn only after the household has played A for a few weeks.

## 7. HUD, toasts and prompts

TV rules stay: 24 px body and 20 px small floors, 5 % safe margins, one toast at a time.

| Element | Shared or per player | Couch-play rule |
|---|---|---|
| Paw counter, rank | shared | one counter; a "+N" pop floats above the finder in the world, not as a toast |
| Area name and corner map | shared | one map, two dots in the players' shapes and colours; the dot of an off-screen cat doubles as its edge marker |
| Goals pill | shared | one list, either cat's progress counts; goal text says "we" |
| Objective | shared | as today |
| Interaction prompt | **per player** | today's single `hud-prompt` becomes two slots: left-bottom for player one, right-bottom for player two, each at most 30 % of the width, 24 px floor, hidden when nothing is in reach. Never merged into one line (two things in reach would be ambiguous). |
| Hint (first-time hints) | shared, once | hints already show a handful of times; they fire for the first kid to reach them and are then counted for the household |
| Toasts | shared queue | cap stays 1 on TV; each line carries the finder's colour bar and cat name ("Pip found a golden mouse"); two finds within 1.5 s merge ("You both found..."); the queue keeps the latest 4, older "found" lines drop so a toast is never stale |
| Roster (online partners) | none | off in couch play (no net) |
| Name tags | per cat | cat 1 own-tag, cat 2 partner tag (`PARTNER_TAG_PX_MIN` 30 px), declutter pass already handles two close tags |
| Player identity | per player | a ring and a shape under each cat: player one is a **blue circle**, player two an **orange diamond**; colour is never the only cue. The same pair marks the pad slot cards and the edge markers. |
| Control hints | per player | glyph tokens follow the *last pad of that player* (a Sony pad shows playstation glyphs); two small hint strips, one per side, shown for 10 s after join and on demand |

New strings go through word tables for both word sets, and none uses "Player 1/2" (they use cat names). Phrases: join, ready, hop to friend, controller asleep, follow-when-idle label, summary tally, "not ready here yet". Both sets are asserted by a test as `padwords.test.js` does today.

## 8. Menus and dialogs

| Moment | Who controls it | Rule |
|---|---|---|
| Pause | Start on **either** pad pauses; the card says "<name> paused" | the pausing pad owns the pause card; the other pad's A and B are ignored; Start on either resumes |
| Pause card actions (Resume, Settings, Quit) | owner pad | Quit and Start over need the confirm card from the same pad |
| Change place map | owner pad (the one that opened it) | the pick moves **both** cats to the new place; never one without the other |
| Place gateway, border crossing, "Off to ..." | the cat that reached it | the other cat is carried along (hop-to-friend behaviour on arrival); the existing "walk on with me" question is answered yes locally |
| Purchases, den shop, dressing room | owner pad | household pot; every spend has the confirm card |
| Delete, reset, cloud, save, restore | not in a couch walk | those screens open only from the home base, and from there the pad that is driving owns them; any destructive action needs a confirm from the same pad within 10 s |
| Home base after a walk | whichever pad pressed last holds the single focus ring (no two rings) | simultaneous presses: first wins for 400 ms |
| Fight card | the challenger's pad | section 9 |
| Letter picker (names) | not used in couch play (cats are picked, not built) | the cat builder stays a solo, home-base screen |

Gamepad navigator stays single. It learns one thing: an `ownerSlot` that tells it which pad's presses it obeys; the hub filters presses by slot before calling it.

## 9. Fights, hops, verbs

| Thing | Rule |
|---|---|
| **Pounce hop** | each cat has its own hop arc (mover's `pounce`), its own skills' height; nothing shared |
| **Pounce-tag and grooming** between the two | detected locally already (avatar.js reads the synced pose); the coop state is fed in, so both verbs work between the two local cats, M4 |
| **Meow** | each pad's B; the chat bubble goes over its cat; same ring colour |
| **Carry** | each cat has its own mouth (`createMouth`); items lie where dropped; a kid can drop one for the other. The co-walk `carry-pick` handler (what `takeHeldItemsWithRemotes` guards) is invoked locally for cat 2 |
| **Clan fight (intruder, patrol, away, border)** | one fight at a time. "Fight!" is pressed on the challenger's pad; that pad drives the fight sheet (the moves are menu buttons); the other cat sits and cheers; the fight camera frames both fighters and the intruder. The existing "sibling's win ends it" rule means if the other kid wins a second fight against the same intruder, the first is released. The fight's record (`fightsWon`, scars) writes to the challenger's cat key; the household's `fightsWon` count is one. |
| **Fair games, market buying** | per place, section 11 |
| **Zoomies** | each mover has its own charge; the framing widens as for any fast cat |
| **Water** | per cat (`waterState` is per mover); Sea Legs shared |

## 10. Cost: triangles and draw calls

Facts: a full cat is capped at 10,350 triangles and a simple cat at 5,500 (`test/catfaces.test.js`, `catcustom.test.js`). Place tests (`test/budget.test.js`) measure the place alone, so today's playing scene is place + one full cat + strays. The Fairground world is 74.3k of 75k, docks 90k, neighborhood 70k.

| Scene | Triangles in view, worst case (cap arithmetic, not measured) |
|---|---|
| Fair, solo today | about 74.3k + 10.35k = 84.7k |
| Fair, couch play | 84.7k + 5.5k = about 90.2k, plus accessories on cat 2 |
| Co-walk today | the same as couch play (a simple partner), so the cost is already shipped |

- **Rule: cat 2 is a simple cat**, always, like every co-walk partner (`remotecats.js`). A full second cat adds 10.35k (about 95k at the Fair), which the owner's "75,000 for the Fair" ruling did not cover.
- **No place ceiling is raised.** A new test, `test/coopbudget.test.js`, builds the place and both cats (full + simple, each with the heaviest outfit) and asserts triangles <= place ceiling + 17,000 and meshes and casters <= place ceiling + 100 and +60 (numbers set at M0 from a measurement plus 5 %). It runs for the three heaviest places (fair, docks, neighborhood) and every place the milestones enable.
- Draw calls: a cat is many small meshes; the shadow pass repeats them per caster. Cat 2 adds one cat's worth of draws plus its tag sprite. The adaptive rung (`adaptquality.js`) already steps down if frames stay slow; TV pixel budget applies once. Couch play adds one rule: when the rung drops to the lowest, cat 2 loses its accessories before cat 1 does.
- The wider framing (step 3 at 11 m) draws more of the place than step 1: the quality rung is checked at step 3 in the Fair and the Docks (the owner's real-pad measure, section 15).
- iPhone/iPad: couch play is a TV feature. It is not offered when the profile is phone or tablet unless two pads are connected; iPad AirPlay is later, as the TV spec says.

## 11. Per-place impacts

Order is "open and flat first". Each place has a row in the coop table; the default is "not ready".

| Place | Impact | Rule | Milestone |
|---|---|---|---|
| Neighborhood, Park, Seaside | open, flat, no live systems | first slice (neighborhood only in M1) | M1 to M2 |
| Woods, River, Moor, Pines | open, water, islands (swim) | needs L0 water for cat 2 (mover has it); bounds and pull-in checked | M3 |
| Docks | long piers, cobbles 120 m | leash length reads the frustum; checks camera pull | M3 |
| Gorge | raised ground, rock pull, caves (`caveView`) | camera cave blend belongs to **the cat that is under a ceiling**; if only one is in a cave, spotlight that cat, edge marker for the other | M5c |
| Farm | animals, jobs (single-actor `farmplay`) | cat 2 walks freely; jobs are cat 1's until the job code takes an actor; the job UI shows whose | M5b |
| Market Square | keeper, stalls, buying, shoo hop, `marketlive` already lists every `remotes` entry | cat 2 appears as a partner at once; buying stays owner-pad, confirm card; keeper's greeting covers both | M5b |
| Fairground | rides use one `session.perchHold`, one seat per cat, the camera is carried by the ride; chunk at 95.8 / 100 kB (4.2 kB headroom) | until M5e cat 2 cannot board (the interaction checks a flag), but it still walks; **two riders** = two seats of the same ride (horses 12, gondolas 8, cups 6, coaster cars 4), "ride together" by interacting within 3 m of the friend's ride; leash and framing are suspended while a ride runs; no fair-chunk growth over 1.5 kB gz (the rest lives in the coop chunk through the hook). Whether one coaster car or gondola may carry two cats is unverified (see section 15). | M5e |
| Rooftops | climbing (`canReach`, budgets), balance crossings (`traversallive` eases the camera behind **one** cat) and leaps | crossings are one at a time with the other cat waiting at the start; the camera spotlights the cat on the beam; both on beams: no ease-behind, both framed; the hop-to-friend lands on a safe perch only | M5f |
| Old House | walls sink between the camera and the cat (segments from camera to cat, `housewalls.js`), levels draw by her level, `camGround` is the floors without furniture | the sink test runs for **both** cats and the framing point; levels drawn = the union of both cats' levels (a cat on a stair can mean more levels drawn at once; `test/housebudget.test.js` is re-run with two cats to see whether the house still fits); leash 6 m; spotlight on the cat that moved last for 4 s with the other cat's edge marker; hop-to-friend is the way between floors | M5d |
| Den (home base walk) | 16 x 16 room, zoom capped at the default step | framing cannot zoom out past step 1 (`DEN_MAX_ZOOM_STEP`), so the leash is the room's own size | M3 |
| Tight places (lanes, hedge gaps, cave mouths) | camera pull-in can hide a cat | when `cameraPull` goes below 0.6 the leash tightens and the edge marker appears | M2 |

## 12. Cloud, cat-login, offline-first, words, accessibility

- **Cloud and cat-login**: Option A touches neither. The cat key (pid, psecret) is cat 1's; cat 2 is never sent anywhere, has no pid, and never appears in the colony as a second player (`clanRoles`' "fed by two players" counts real players only). A cat-login merge that moves an own cat into `sleepingCats` removes it from the picker; if cat 2's saved choice vanished, the picker falls back to a preset. The cloud push after a summary is the household's save, as today. Option B stays local-only until the cat-login design says how two cat keys live on one device (it does not today).
- **Offline-first**: every coop file is in the precache (automatic for `assets/`), nothing is fetched at play time, and `test/offlinefirst.test.js` is extended: with couch play on and the network blocked, a whole walk runs with zero requests. A couch walk makes no network calls of its own.
- **Both word sets**: all new text in a table keyed like `padwords.js`, set-aware, tested for both sets, with the "series off" set using everyday words. No new English in a `.js` UI file.
- **Accessibility**: no colour-only cues (shape plus colour, checked by eye on the owner's TV and in greyscale); reduced-motion snaps the camera and the hop puff; all prompts 24 px or more on the TV; hold-to-hop has a visible ring and a sound, and a "tap twice" alternative for a kid who finds holding hard; follow-when-idle is the help for a kid who cannot always steer; screen-reader labels for the join and disconnect cards (the game is mostly canvas, so these two cards are real buttons); vibration is not used.

## 13. Milestones

Every milestone is its own branch, merged with the owner's yes. Each lists its tests and the budget check that must pass before the merge. The start-up chunk is **709.5 of 720 kB gz** at the start; **it is never raised**. Stop and re-plan if start-up grows by more than 0.6 kB in total from M0 (seam only). Every other file is under `src/coop/` behind a dynamic `import()`.

| M | What | Tests | Budget check |
|---|---|---|---|
| M0 | Measure and seam: `src/coopseam.js` (flag, `coopPoll` slot, at most 0.4 kB gz), `createPlayer` `headless` option, `?coop=1` hidden flag, `poll(dt, forcePad)` argument; **the cost tests** (`test/coopbudget.test.js`); `COOP_ENTRY_MODULES` guard in `scripts/buildjson.mjs` (ceiling 25 kB gz) | seam is identity when off (a golden test of `main.js` startup calls); headless player emits no listeners (spy on `document.addEventListener`); two headless players on the same ground behave exactly like one (replay a path); solo gamepad tests unchanged | start-up measured before and after (target +0.4 kB at most); coop chunk not in start-up; place budgets unchanged |
| M1 | Pad hub, join card, mover, local partner entry, shared camera at fixed yaw, Neighborhood only | hub slot assignment from fake `getGamepads` (press-order, same `id` twice, index changes); disconnect pauses; hop and pounce per cat; framing unit tests (midpoint, extra distance from steps, safe box); keyboard plus pad | start-up unchanged since M0; coop chunk size; combined-scene triangle test for neighborhood |
| M2 | Camera completeness: widening, follow-when-idle, rubber band, hop to friend, edge markers, quarter-turn with stick lock; HUD with two prompts, finder chips, one toast queue; tight-place rule | pure tests of each rule with a fake clock; prompts keep 24/20 px floors (computed-style check as TV mode's tests do); edge marker >= 48 px; both word sets | start-up unchanged; coop chunk <= 25 kB; fair chunk untouched |
| M3 | Parity L1: collecting, pounce-catch, sniff, talk, carry; shared goals, journal, golden mice; skills and outfit for cat 2; summary tally; Woods, River, Moor, Pines, Docks, Den | household rules (finds credit once; skills shared); `economy` invariants unchanged (points counted once); save is byte-identical to a solo walk that finds the same things; cat 2 swims with Sea Legs | start-up unchanged; coop chunk size; `coopbudget` for each enabled place |
| M4 | Menus and fights: pause ownership, confirms, place change moves both, crossings carry the partner, fights and border patrol, grooming and pounce-tag between the two | ownership tests (only the owner pad moves focus; non-owner ignored); confirm needs same pad; fight record writes challenger's key; "sibling's win" | start-up unchanged; no growth in clan chunks beyond 0.5 kB each |
| M5 a to f | Place waves: a) open places check; b) Farm, Market; c) Gorge and caves; d) Old House; e) Fair rides, two riders; f) Rooftops | one new test file per place (camera rules, leash, no wall hides a cat, no cat stranded); each place's row flips to ready only with its tests green | the place's own ceilings unchanged and the new combined ceiling green; the fair chunk <= 97.3 / 100 kB |
| M6 | Owner's real-pad pass and polish: tune speeds, leash, hold times, hint lengths from the owner's notes | none new except those fixes needs | recheck of every number above on the device |
| M7 | Optional: second saved profile (Option B); split keyboard | as in section 6 | save size per profile under 150 kB |

Each milestone ends with: the named test files, `npm test` once (never between 18:30 and 19:30), a build to read the start-up size and the coop chunk size, and a report that says what was verified and what needs real pads.

## 14. Risks

| Risk | Handling |
|---|---|
| Single-cat systems quietly read cat 1 for cat 2 (rides, jobs, traversal, buying) | the per-place "ready" table; cat 2 cannot trigger what is not ready; interactions check a flag; a test that fails for any place not in the table |
| Camera pull-in hides a cat | leash tightens, edge marker shows, hop to friend; tested with a fake building ring |
| Rubber band traps cats either side of a wall | hop to friend, follow-when-idle, "can't reach" spotlight; tested in the House plan |
| Two DualSenses have the same `id`, indices change on reconnect | slot identity by press, never by id; reconnect asks again |
| Chrome merges or drops a pad after Bluetooth sleep | pause and re-ask; never silently reassign |
| Camera and sticks flip under a kid's thumb | fixed yaw, quarter turns only, stick direction held through the turn |
| One kid dominates the camera | no free orbit; framing is automatic; either pad turns the view |
| Performance at 4K with two cats and a wider camera | simple cat, pixel budget, rung order (cat 2 first loses extras); owner's reading |
| Fair chunk at 95.8 / 100 kB | rides' two-rider code in the coop chunk through a hook; stop if the fair chunk passes 97.3 |
| Start-up chunk | seam 0.4 kB; guard in the build; stop at +0.6 kB |
| Sibling fairness (shared pot) | summary tally; Option B available; the owner decides after play |
| Online co-walk and couch play exclusive | the join card says so in one line; no hidden mixing |
| Words and edition drift | both sets tested, both editions, as `padwords.test.js` |
| Scope: this is large (M1 to M5 is the work of several weeks) | M1 and M2 give a playable slice in one place; every later place is its own small merge |

## 15. What cannot be verified without two real pads

- Chrome's handling of **two DualSenses**: whether both appear with `mapping === 'standard'`, their `index` order, whether both `id` strings are identical, and what happens on a Bluetooth re-pair.
- Whether `gamepadconnected` fires for a second pad in the same order after sleep and wake, and how long a DualSense stays awake with no input.
- Real input latency and stick feel with two pads, hold-to-hop timing for a 9-year-old, and whether a quarter turn feels fair.
- The **frame budget**: milliseconds and fps on the TV Mac with two cats at step 3, at 1080p and 4K, in the Fair, Docks and Neighborhood. The computed triangle numbers above are cap arithmetic, not measurements.
- The real "both cats fit" distances (computed 9 / 14 / 23 m at 16:9; the TV's aspect and any overscan change them).
- Safari and the iOS WKWebView with two pads (pass-through unverified, as the TV spec says).
- Whether one gondola or coaster car can hold two cats (the seat model has one `perchHold` per cat; not read in depth).
- Whether the clan's role rule "fed by two players" can be gamed by a local second cat (not checked in `colony.js`).
- Anything the kids feel: whether follow-when-idle is helpful or annoying, whether "no free orbit" is acceptable to the 11-year-old.
- Agents can test with fake `navigator.getGamepads` and the browser pane, and will say so; nothing here was run.

## 16. Open questions for the owner (6)

| # | Question | Recommended answer |
|---|---|---|
| Q1 | One save with two cats (shared paws and finds), or a second saved profile for the other kid? | One save first (Option A). Offer Option B only after a few weeks of play. |
| Q2 | Camera: fixed view with quarter turns, or a free right-stick orbit like solo? | Fixed view with quarter turns (L1/R1) in couch play, so nobody's controls turn under them. |
| Q3 | When a cat is idle and far from its friend, should it trot over by itself? | Yes by default, with a Settings switch; a stick push cancels it. |
| Q4 | Which places for the first merge? | Neighborhood only (M1, M2), then the open places (M3); the Fair, House and Rooftops last. |
| Q5 | Should the second cat be a "simple cat" (about half the triangles) even on a strong TV Mac? | Yes, the same rule as a co-walk partner; revisit if the owner's reading shows spare frame time. |
| Q6 | Should couch play and online co-walk be allowed together (for example two kids on the TV with a cousin online)? | No; one or the other for each walk. |
