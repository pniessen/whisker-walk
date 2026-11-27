# Couch play with two controllers: honest assessment (2026-11-28)

Scope: the owner has two separate game controllers and wants the two kids (girl 11, boy 9) to play together on one screen. Read-only on `src/` and `test/`. Branch `couch-assess` (from main 8f715dcd), report only, not merged, not pushed.

How things were checked, so you can weigh each claim:
- **RAN (tests)**: 12 test files, 203 tests, all green (`coophub, coopplay, coopm2, coopm4, coopm4fights, coopframing, coopwords, gamepad-menu, gamepad-hooks, fightpad, coopseam, coopm5jungle`). These use fake pads on a real `createPlayer` plus real `createGamepad`, so they pin the two-pad logic.
- **RAN (live page, fake pads)**: the dev server in the browser pane at `/?coop=1&tv=1`, with `navigator.getGamepads` replaced by two fake DualSense pads. Caveat: the pane rendered at about 1.5 fps, so anything that needs real movement over time is not a valid reading; seat/menu/join/pause/disconnect logic is frame-count based and was fine.
- **READ**: everything else, from `src/coop/*`, `src/gamepad*.js`, the design specs and the frame-cost doc. Marked "read" below.
- **NOT KNOWABLE here**: anything about real DualSense/Xbox pads, Bluetooth, Safari, iPad, AirPlay, TV, feel, fun.

## Verdict

| Question | Verdict | One line |
|---|---|---|
| Does it WORK? | **Yes, on a Mac in Chrome** (hidden flag) | Two pads join, walk two cats under one shared camera, pause, lose and regain a pad; verified in tests and with fake pads on the live page. Real pads untested. |
| Is it EASY (kids, no keyboard)? | **Partly, not yet** | Nobody can start it without typing `?coop=1` in the address bar; the second kid must know to press A during a walk; menus, map and dressing room belong to one pad. |
| Is it FUN? | **Partly (likely, unproven)** | Two cats under a good shared camera with leash and follow-when-idle is a gentle "walk together"; almost nothing needs two players, so it is two cats side by side. |

## What I verified (by running)

1. **Tests**: 203 of 203 pass (list above). They pin: seat by press order, two pads with the same `id` string, index change on reconnect, lost-seat reclaim, L1/R1 turns, Start on either pad, join only after cat one is seated, per-cat hop/meow, pause ownership, "controller went to sleep" card, place change keeps both cats, camera framing and leash, 24/20 px TV type floors, no network requests in a couch walk, both word sets.
2. **Live, two fake pads**, `?coop=1&tv=1`, Mac Chrome profile `tv`:
   - Home base: either pad's first press wakes the pad system; `state.pads=2`, `ready=true`, seat 0 given to the first pad that pressed.
   - Ready card ("Start exploring"): the pad that pressed FIRST (I made it pad index 1) became seat 0, "cat one" and the menu owner. The other pad's A did nothing there. So the kid who touches a button first owns cat one and the Ready card, whichever pad number that is.
   - Join: after the walk went live, the join pill showed ("Press [A glyph] on a second controller to play together"); A on the other pad joined it, a toast "Siamese is here too!" appeared, cat two (a simple local co-walker, key `siamese`) stood 1.6 m to cat one's right, leash about 19.6 m at this 800x600 view.
   - Pause: Start on the second pad paused the walk and made that pad the menu owner (`owner=1`). Start on cat one's pad did NOT resume. Start on the owner pad resumed.
   - Disconnect: removing pad two (replacing it with `null`) paused the walk and showed "Siamese's controller went to sleep. Press any button on it to wake it up." with buttons "Wait for it" / "Play without it". The same pad coming back under a different index (2) and pressing a button took its old seat and closed the card. Seats are by press, not by index.
   - One visual finding from a screenshot of the pause card: the per-cat prompt chip ("left to groom Tabby") stays drawn on top of the Pause card, bottom-right. Cosmetic.
3. Movement distance and framerate over time: **not** valid in the pane (1.5 fps), so I make no claim about stick feel or camera smoothness.

## What I could only read (code and docs)

- Button map, camera behaviour, per-player earning, missions, rides, fights, Safari/iOS behaviour (all below).
- The design spec (`docs/superpowers/specs/2026-11-22-couch-coop-design.md`) lists exactly what only two real pads can settle (its section 15). That list is still open: nobody has played this with two real pads, per the repo docs.

## How it works for two pads (answers to your specific questions)

**How a second controller joins.** There is no menu. During a live walk, A/Cross on a pad that is not seated joins it as cat two, but only once cat one's pad is seated and only while no second cat is in (`padhub.js`). Before the walk is live (home base, Ready card) a second pad cannot join; the pill ("Press X on a second controller...") only appears in a live walk. Works in 17 of the 18 places (Reef is `false`; `table.js`). In a place not ready, with two pads, the pill says "Two cats do not play here yet".
**Reaching couch play at all.** Only by adding `?coop=1` to the URL (`src/coopseam.js`, `main.js` line 393). It is not in Settings, not on the home screen, not saved, and does not survive a reload. The home screen's "Play together" button is the ONLINE co-walk, unrelated. It also needs the `tv` or `laptop` profile: `?tv=1` or plain desktop. Phones and tablets are excluded (code and test `coopplay`).
**Assignment.** Slot (seat) = order of first press, never `index` or `id`. First pad to show life (a button or a firm stick push) is slot 0 = cat one = the cat of the save's active cat; slot 1 = the A press on another pad. Two identical DualSenses are fine (tested). Seat is wiped on each new session unless the walk carries on into the next place (`carry`).
**Pad connected before page load.** The Gamepad API only reveals a pad after a button press, and the hub treats the first press as the seat. Fine, but see problem 3.
**Reconnect / sleep / one pad dropping mid-walk.** Walk pauses, a card names the cat, any button on any unseated pad takes the lost seat, "Wait for it" or "Play without it" (cat two waves and leaves; A on a pad rejoins). Cat one's pad lost: card names cat one; pad two can operate the card. Verified live and in tests. There is no deliberate "player two leaves" button: only the lost-pad card, an unready place, or a profile change removes cat two.
**Menus, Ready card, pause, dressing room, map: who acts.** Only ONE pad at a time ("the owner"). Pad one (slot 0) owns every menu by default, including home base, Ready card, dressing room, den shop, the world map and the confirm cards. The only way pad two owns a menu is by pressing Start itself to pause, then it owns the pause card until resume (verified). The other pad is ignored in menus, and its Start does nothing. In the clan-fight sheet the challenger's pad plays. So kid two can never choose a place, dress, or confirm anything unless kid one hands the controller over.
**Button map (both pads in a walk, from `gamepadinput.js`, `padhub.js`).** Left stick = walk (light push stalks). A/Cross = pounce hop (also climb, ride seat, photo shutter in photo mode). B/Circle = meow (and Back off in a fight pill). X/Square = interact (pick up, carry, dig, sniff, talk, fight pill "Fight"). Y/Triangle = photo mode. L1/R1 = turn the shared view a quarter (either pad); they are NOT zoom in a couch walk. Start = pause. D-pad Left = groom with the friend. D-pad Down hold (0.8 s) or tap twice = "hop to my friend". Right stick does nothing in a walk (no free orbit, by design). There is no sprint button, no yarn button, no gift button and no chat wheel on a pad, solo or couch; pad one's X is the walk's own interact.
**On-screen hints.** Mostly pad-aware: each cat has its own prompt slot (left for cat one, right for cat two) with a picture glyph per that player's own pad kind (PlayStation vs Xbox shapes via `glyphify`), 24 px floor on TV. Hint for hop-to-friend appears when a cat is pushing at the leash. After joining there is no standing "controls" strip; spec called for a 10 s hint strip, not built (read). The base walk's hints (keyboard/touch wording) were not audited for pad-only reading.
**Camera when cats are far apart.** One shared camera at the midpoint with a fixed heading; it zooms out through steps as they part, up to a leash (about 19.6 m at 16:9, live reading) with a rubber band over the last 3 m, an edge arrow marker (circle blue / diamond orange) for an off-screen cat, follow-when-idle (3 s no stick, farther than 8 m: the idle cat trots over), and hop-to-friend. In tight places the leash shortens to the current gap. Pinned in tests. Not seen at real frame rates.
**Per-player cat, outfit, paws, credit.** One household save, two cats: cat two is another cat of the same save (a bought ready-made or a builder cat), else a loaner breed (on a fresh save it was "Siamese", the breed word, not a kid-chosen name). Outfit = a saved outfit (`state.outfits`) not worn by cat one, or the one in `localStorage whisker-walk-coop`. All paws, golden mice, journal, skills, goals are ONE shared pot; "Mochi found 7, Pip found 5" is shown once at the end and never saved. Scars are per cat. Cat two is always a simple cat (about half the triangles).
**Missions.** Cat two collects, catches (while its own hop is up), sniffs, digs, carries, talks (meow), and does the Market's six missions and the Farm's offers/mice/eggs; the Farm's jobs' animals, fights record and the Fair's ride rewards stay cat one's ("a ride is for cat one to earn", `rides.js`). Fights: the challenger's pad plays and the other cat sits and cheers. Whole-walk summary/goals count either cat.
**TV / AirPlay.** `?tv=1&coop=1` on a Mac over HDMI is the intended path (read). iPad AirPlay mirrors a `tablet` profile, which never offers couch play (tested), and the TV spec says AirPlay/WKWebView is "a later step".
**iPad Safari / iPhone with Bluetooth pads vs Mac Chrome.** Not run. From the code: only `mapping === 'standard'` pads are used; the d-pad is read as buttons 12-15 and Start as button 9. Safari on iOS/iPadOS does expose DualSense/Xbox pads with standard mapping and a press-to-reveal rule; known quirks I am relying on memory for (UNVERIFIED): the system can take the Home/Share/PS button and sometimes the Menu button, the Back/View button is not delivered the way Chrome gives Select, and there is no rumble from Safari (the game uses none, so no loss). The gamepad-menus handcheck already lists iOS WKWebView pass-through as UNVERIFIED. Even if the pads work, the iPad is excluded from couch play by profile (`tablet`), so couch on iPad would need `?profile=laptop`/`tv` or a design change. The iOS app nightly build was not examined.

## Problems found (ranked)

1. **No way to start it.** Couch play exists only behind `?coop=1` in the URL, per page load, with no Settings switch, no home-screen button, and no hint anywhere. A kid with two pads and no keyboard cannot reach it. (Verified: the home screen's "Play together" is the online mode.) On a Mac with a keyboard the owner has to type the URL each time (or bookmark `?coop=1&tv=1`).
2. **Menus, map, dressing room, Ready card, confirms are one-pad only.** The second kid is a spectator whenever anything but the walk is up. Verified: pad two's A on the Ready card and in pause does nothing unless it started the pause. Natural for safety (the design chose it), but it will feel unfair to the 9-year-old, and nothing tells him whose turn it is.
3. **Whoever touches a button first is cat one and owns menus.** Slot order is first-press, not pad number (verified: pad index 1 pressed first and got cat one; pad index 0 was ignored on the Ready card). If the kids press at once, or one pad was already pressed at the home screen, the wrong kid may end up "second". There is no swap-sides action.
4. **Second player must discover "press A mid-walk".** The join pill appears only in a live walk, at the top of the screen, with no sound, and says "a second controller". At the Ready card nothing mentions two players.
5. **Pad 2 leaving is not a choice.** No "I'm done" for kid two; the only exit is unplugging the pad and picking "Play without it". A walk also ends cat two on every trip home (the walk carries cat two only through place changes), so kid two re-presses A at each new walk.
6. **Cat two's identity is thin.** It is simply the next unlocked cat or a loaner by breed name, not the kid's choice; there is no picker (the spec's "pick a cat with your own pad" was not built). The outfit is chosen only through a hidden localStorage key.
7. **Cosmetic**: the per-cat prompt chip draws over the Pause card; the pause card still offers view size Close/Middle/Far/Farther, which couch framing overrides; no standing pad-button hints after joining.
8. **Fairness**: one shared pot and cat one earns ride rewards and farm-job credit; cat two does not. (Spec's Option B, a second profile, is not built.)
9. **Unknowns that could break it on real hardware**: two real DualSenses' `mapping`/`index`/`id` behaviour in Chrome, Bluetooth sleep, frame rate with two cats on the TV Mac (iPad 7 reading and TV reading never taken; per the frame-cost doc the Gorge and Old House are the worst scenes, about 95k triangles).

## Fun: judged from the design

- Good: shared camera with no split screen; no failure state, no punishment, leash and follow-when-idle keep the pair together and spare the 9-year-old from waiting; grooming, tag (pounce back), both cats carrying, "You both found" merged toasts, two-rider Fairground rides, per-cat colour+shape marks (blue circle, orange diamond), and the end tally.
- Thin: **nothing requires two players.** Goals, finds and paws are shared but any one cat can do them; the only two-player-only things are groom and tag (each pays once per walk via `awardOnce`) and sharing a ride. It is two cats walking in the same place. For an 11 and a 9 year old that may be exactly what "play together" means, but the game has no shared challenge, no "bring it to me" and no co-op finds.
- Risk: no free camera for either kid; shared camera and automatic framing reduce arguing but also control.

## Top 5 improvements (small and buildable)

1. **A visible start**: a "Two cats" button on the home screen (or a Settings switch) when two pads are connected, saved per device, so no URL is needed. Also add "Press a button on each controller" on the Ready card so seats are decided before the walk, with a one-tap swap.
2. **A two-pad join at the Ready card** (show two coloured slots, blue circle and orange diamond, and "Press A to join" for the second kid right there), instead of only mid-walk; keep the in-walk pill as backup and add a sound.
3. **Let either pad act in the safe menus** (Ready card, dress/outfit pick for its own cat, cat picker for cat two with its own pad). Keep confirms and the map to the owner pad but show whose turn it is ("Pip's turn to pick") and hand the owner to the other pad with Select.
4. **One real shared goal**: a "bring it to me" or "both on the paw" couch mission or find (a big golden mouse or a chest that opens only when both cats stand on its pads; or a shared tally of paws with a gentle two-star end card). It makes the second kid needed, which is what the 9-year-old will notice.
5. **Standing pad hints and a leave/join button**: a 10-second strip of "stick walk / A hop / D-pad down hop to friend / L1 R1 turn" right after joining (promised in the spec, not built), and a clear "play on without me" (a held Select) so kid two can leave and rejoin without unplugging.

## Hand-test checklist (in order, two real pads)

1. Pair both pads over Bluetooth to the Mac (or iPad) *before* opening the game; open `http://.../?coop=1&tv=1` (fullscreen, on the TV if possible). Press one button on each pad and note whether the game shows any message.
2. Press a button on pad A only. Start a walk (Explore) with pad A. Check which cat is "yours" and whether the Ready card works for pad A only.
3. In the live walk, press A (Cross) on pad B. Does the join pill appear, does cat two arrive beside cat one, and is the name sensible?
4. Walk both cats with both sticks at once for a minute; note frame rate, stick feel, and whether the camera ever makes anyone dizzy.
5. Walk them far apart (past 20 m); does the camera widen, the rubber band slow them, the edge arrow show, and does an idle cat trot to its friend after 3 s? Hold D-pad Down 1 s for hop-to-friend.
6. Meow (B), pick something up (X), pounce (A) on both pads; groom (D-pad Left near each other, both still); tag (hop beside the friend, friend hops back).
7. Press Start on pad B: the pause card should be pad B's to use; try pad A's buttons on it (should do nothing), then resume with pad B.
8. Switch pad A off (hold the PS button) mid-walk: expect a "went to sleep" card; wake it and check which cat it gets. Do the same for pad B.
9. Go home and try the Dress up and Change place map with pad B only (expected: does nothing), then with pad A.
10. Try the Fairground rides, the Farm and the Market with two cats, and a Gorge cave; note anything cat two cannot do or any place where a cat gets stuck. If you have an iPad and a pad, try the same on the iPad with `?coop=1&profile=laptop` and say what the pad does or does not do.
