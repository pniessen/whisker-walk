# The Market Square, steps 3 and 4: the rest, and into the game — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- **Step 3, the rest.** The fruit and flower stalls become playable: the apple crate tips and its apples roll, a bucket of flowers knocks off its trestle, and both stalls have a hide. Their two lamp posts move out of the way. Crates lead up onto the awnings. The square gets three golden mice, its found-outfit spots, six discoveries (each a journal page), a street musician, market sounds, and a cat who looks up at a stallholder cooing at her. The café front, the flower tubs and the close-up cobbles get more character.
- **Step 4, into the game.** The Market opens for 150 🐾 after 2 town walks. It gets a place in the town on the world map, a gate from the town into the 3.2 m gap in the square's south row, a first-visit hint and its four found outfits. Two children can walk it together. `?market=1` becomes a developer shortcut. The Market is live after step 4.

**Architecture:**
- **Start-up learns only data and tiny leaf modules** (rule V20). That means one catalog row, word-table lines, page ids, gold-mouse rows, find spots, prop rows, gateway rows, map rows and one hint row. It also means three tiny leaves: `src/marketpages.js`, `src/foundwear/spots/market.js` and `src/cat/headaim.js`. The found outfits' cat-side meshes are the one bigger start-up piece, and they have to be: the cat model is start-up.
- **Everything that behaves goes in the Market's lazy chunk** (`AREA_LOADERS.market` in `src/world/areas.js`). That covers the apples and petals (`src/world/marketfruit.js`), the finds (`src/world/marketfinds.js`), the musician (`src/world/marketfolk.js`), the sounds (`src/world/marketsound.js`) and the per-walk area life that runs them all (`src/world/marketlife.js`). `market.js`'s `life` hook calls that life. The life is handed `log`, `progression`, `critters` and `audio` once (`walk.js` already passes these) and the `session` every frame (`main.js` already calls `areaLife.update(dt, t, catPos, camera, session)`).
- **People come through one figure function.** `src/marketkeeper.js` gains `export const marketFigure = twolegKeeper`. The stallholders (`createMarketLive`'s `opts.figure` default) and the street musician are built through `marketFigure`, so the lifelike-people branch replaces one line. Nothing imports from the `people` branch.

**Tech Stack:** Plain ES modules, Three.js 0.185, Vite 8, Vitest 4, Web Audio (synthesised, no samples), headless Chrome through `scripts/record-page.mjs`, ffmpeg.

**Spec:** `docs/superpowers/specs/2026-11-20-market-square-design.md`, approved 2026-11-20. Sections used: "Also here, like every place", "Fit with the game", "Look and feel", "Build order" items 3 and 4, "Anti-goals", "Constraints". Also the steps 3–4 outline and "Updates (2026-11-21)" U1–U9 at the end of `docs/superpowers/plans/2026-11-20-market-square-steps1-2.md`. Its rulings M1–M12 still hold where U1–U9 and this plan do not change them.

**Binding order:** the owner's answers below, then the spec, then the steps 1–2 outline, then what steps 1–2 built (`src/world/marketplan.js` is the source of every position).

## The owner's answers this plan builds on (2026-11-21)

- Steps 1–2 look right. Do step 3, then step 4. The Market goes live after step 4.
- Step 3 includes the fruit and flower stalls made playable. It also moves the two lamp posts that stand in front of them: (0, −10.4) in the fruit stall's lane and (5.5, 1) in the flower stall's lane.
- Step 4 puts the town gateway in the 3.2 m gap at the south edge (`GATEWAY_GAP`).
- Strays: keep about 22, as built.
- The cat looks UP at a stallholder who is cooing at her. This needs an opt-in head-aim target that does nothing unless set. The flat trace stays unchanged, and a test shows that every other place's cat poses are unchanged.
- Treats and their names stand as built.
- Coordinator's calls:
  - the café front gets more character: an awning, window boards and a menu chalkboard, with pictures only (M12);
  - the flower tubs read as flowers;
  - the close-up cobble grid is broken up;
  - all of it inside 280 meshes / 210 casters / 62,000 triangles.
- Start-up is at 691.5 of 700 kB gz. The Market's start-up cost stays minimal.
- The stallholders and every new person are built through one small figure function.

## Rulings (Claude's calls, each with why; the owner can overturn each)

- **V1. The fruit stall's crate tips, and its apples roll.**
  - **What:** the apple crate (`FRUIT_CRATE`, at `MARKET_ANCHORS.apples`) becomes a tippable. She paws it over with the action button, through the existing tippable prompt and the existing `tip` net event. It pays the ordinary mischief award, as every tippable does. When it goes over, six apples roll out of its mouth along fixed paths and lie on the cobbles for the rest of the walk.
  - **Determinism:** each apple's path comes from `hash01(i, 0, MARKET_APPLE_SALT)` at build time. A path stops at the first point that is not walkable (`isWalkableAt(marketArea(), …)`).
  - **Start-up cost:** one line in `src/tippables.js`. A spot may carry `build: () => Group`, used in place of `buildTippable(kind)`.
  - **Why:** the spec says "a fruit that rolls if she bumps the crate". The tippable path already reaches the partner (`tipById`), so both screens tip the same crate. The apple paths are data, so both screens roll the same apples. The crate tips with the button, not by her walking into it: every tippable in the game works that way, and a bump would need a new send. No treat is added.
- **V2. The flower stall: a bucket of flowers she knocks off.**
  - **What:** a knockable `bucket` (`market-flowers-bucket-1`) stands on the flower stall's trestle top (y 0.75). She hops onto the trestle (a perch, V5) and knocks it off with the existing knock. Where it lands, about twelve petals scatter in a flat ring and stay.
  - **Where the code lives:** the petals are drawn by the Market's life (chunk) when it sees that knockable land. There is no new knockable kind.
  - **Why:** it is "something she can do" at a stall with no treat. It reaches the partner by the existing knock event, and the landing spot is curated data (`fallTo`), so both screens show the same petals.
- **V3. Both stalls have a hide.** The flower stall keeps its hide under its trestle. The fruit stall gets one under a trestle on the side away from the apple crate. Each stall gets its own `hideSide` (default 1; the fruit stall's is −1). The builder may move `stack-fruit` up to 1.5 m to make room. Neither hide joins `MARKET_KEEPOUT`, because neither stall is watched.
- **V4. The two lamp posts move.**
  - **What:** `MARKET_LAMPS[1]` (0, −10.4) and `MARKET_LAMPS[3]` (5.5, 1) move out of every stall's view lane. The lane test in `test/marketplan.test.js` (9 m out, `w/2 + 1.6` either side) runs over all six stalls, not only the four treat stalls. There are still four posts, ringing the fountain.
  - **Why:** a playable stall needs the chase camera's view to its front as much as a treat stall does.
- **V5. Climbing.**
  - **What:** beside each of the six stalls, on its side away from its hide and outside its watch zone, a solid crate stack stands about 0.9–1.0 m high. It is one hop up from the cobbles, and from its top the stall's awning is one hop up. The awning perch is at the awning's own height at the stall's middle (`AWNING`, `market.js`), at or above `MARKET.HIGH_Y` (1.8). The flower trestle's top is a perch too (V2), as is the bicycle basket (V8).
  - **Rules:** every perch follows `src/climbing.js`'s `BASE_CLIMB_BUDGET` (no skill needed). She can drop down from any awning.
  - **Why:** the spec says "onto crates and up onto the awnings … where nobody notices her". The awning-top rule is already live (`isHidden` reads `high`). The precedent is `fair.js`'s `stallPerches`: a crate perch, then a roof perch.
- **V6. Six discoveries, each a journal page, found automatically.**
  - **The six:** the spec's five (the fountain, the pigeons, the flour sacks, the street musician, the bicycle basket), plus one the spec lets the builder add: the rolling apples (V1).
  - **How each is found:** no prompt points at any of them (R3 of the Rooftops' step 5).
    - fountain: drinking at its rest;
    - pigeons: a pigeon takes flight within 3 m of her while she runs;
    - sacks: napping on the baker's flour sacks;
    - musician: standing or sitting still near the musician for 2 s;
    - basket: perched in the bicycle basket;
    - apples: the crate goes over while she is within 2.5 m of it.
  - **Pay:** the first find ever pays `AWARDS.marketfind = 12` (the same as `fairfind` and `roofsfind`) and says its line. Every walk on which it is found counts once on its page, by key `market-find-<id>`, and says nothing more. A resumed walk pays and counts nothing twice.
  - **Why:** this is the Fairground's and the Rooftops' shape, and the journal is where a child looks.
- **V7. The street musician.**
  - **Who:** one person, built through `marketFigure`. They stand inside a solid circle (r 0.45: their pitch and an open fiddle case) by the fountain, out of every stall's view lane, watch zone and hide line. They never move from that spot, never face her, and never follow her (anti-goal "people in the way").
  - **Their arm:** the figure's `arm` bows the fiddle on walk seconds.
  - **The tune:** a short tune of soft synthesised notes plays near them (V9).
  - **Why:** the spec lists "a street musician". The figure seam keeps the people-branch switch to one line.
- **V8. The bicycle basket "ride" is a rock and a bell.** A perch sits in the parked bicycle's basket (`MARKET_ANCHORS.basket`). When she lands in it, the bicycle rocks on its stand (±2°, 1.5 s) and its bell rings twice. The bicycle never moves and nobody wheels it, because a person pushing a bike with the cat in it breaks "never follows her" (owner question 5).
- **V9. The market's sounds, in the chunk, per device.**
  - **What:** `src/world/marketsound.js` makes its own short tones on `audio.getContext()` and `audio.getMaster()`. They are pigeons' coos near the pigeons, the musician's tune (heard within 14 m), the bicycle bell (V8), and a soft murmur of chatter near the four treat stalls (filtered noise bursts at gain ≤ 0.012). The fountain's water and the town hum stay in `audio.js`'s `market` ambience.
  - **Mute:** nothing plays, and the AudioContext is never asked for, while `audio.isMuted?.() !== false` (the Rooftops' R10).
  - **Reuse:** the coo is `CALLS` and `loudness` from `src/world/roofssound.js`. Vite puts that file in a small shared chunk, as `parkfountain.js` is shared by the Park and the Market today.
  - **Schedule:** `hash01`, never `Math.random`.
- **V10. She looks up at a stallholder cooing at her (the owner's answer).**
  - **The leaf:** `src/cat/headaim.js` (start-up, tiny) holds `aimHead(cat, target, dt, pose)`. It runs AFTER `animateCat` and adds a clamped yaw and an upward pitch to `parts.head.rotation`, eased in and out by a weight kept in `cat.userData.headAim`. With no target, and a weight that is 0 or was never made, it returns at once and writes nothing. So every pose everywhere is exactly `animateCat`'s. `src/cat/animator.js` is not edited.
  - **The target:** `session.lookAt` (a reused `{ x, y, z }`, or null). `marketlive.js` sets it while a stall is cooing at `'me'` and clears it when the coo ends. `avatar.js` passes it to `aimHead`.
  - **The partner's cat:** `marketlive.js` also sets `remote.lookAt` on the partner's entry when this device's stall is cooing at that remote, and `remotecats.js` passes it to `aimHead`. So she looks up on both screens, from each device's own coo. Nothing is sent.
  - **Poses:** the aim applies only in `follow` and `requestPet` (standing and sitting). While cooed at, `marketlive.js` holds `s.idleTime = 0`, as it does for a treat in her mouth, so a napper's 3 s groom never interrupts the look-up.
  - **Flat trace:** unchanged. The trace records the walk's play, not head angles, and nothing new draws a random number.
- **V11. The look polish (the coordinator's calls), inside the aim.**
  - **Café front:** a scalloped striped awning with a valance, painted window boards under its windows, and an A-frame menu chalkboard on the cobbles by its door. The board shows pictures only (a cup, a slice of cake, a croissant in chalk), drawn into two new atlas cells, so there are no letters (M12).
  - **Flower tubs:** each of the seven tubs gets 5–7 stems and petal clusters in vertex colours, merged into the clutter meshes it already has. That is at most 140 triangles a tub, and no new draw call.
  - **Cobbles:** a Market-own cobble texture (`createCobbleTexture`, a `DataTexture` painted from `hash01`, no canvas). Its rows are offset (running bond), each stone's width varies ±20% along its row, and each stone's tone varies ±8%. It replaces the shared `cobble` surface on the ground only. Meshes and triangles are unchanged.
  - **Atlas:** it grows from 4 × 4 to 8 × 4 cells of 32 px (256 × 128). Cells 0–15 keep their pictures. Cells 16 (the chalkboard) and 17 (a window board) are new.
- **V12. Three golden mice.**
  - **Where:** `gm-market-1` on an awning (the cheese stall's), `gm-market-2` on a crate stack's top, and `gm-market-3` hidden low in a nook by the west shop fronts. None is beside a find spot, a collectible or a discovery.
  - **Counts:** `GOLD_TOTAL` goes from 39 to 42. The Clan Edition count goes to 42. The Legacy count stays 21 (V16).
- **V13. Found outfits are on main** (`src/foundwear/`). The system's rules shape them, not the brief's "four spots".
  - **Spots (step 3):** an area hides one find a walk at one of **10–15 spots** (`test/foundspots.test.js`), so the Market gets 12 spots in `src/foundwear/spots/market.js`.
  - **Records (step 4):** **4 outfit records** (`WEAR_PER_AREA` = 4) come after the catalog row, because `validateFoundWear` requires `find` to be a `CATALOG.areas` id. Until then a Market find is the coin pouch, as a Woods find is today.
  - **Names:** placeholder, market-flavoured, through the word tables (owner question 1). Each is drawn by reusing a shipped builder's shape in new colours.
  - **FIND_KEY:** adding spots changes `FIND_KEY`. That is the system's intent: builds with different spots never share finds in a room.
- **V14. The tour hint exists on main** (`src/hints.js`, "A PLACE'S OWN HINT").
  - **Row:** `{ id: 'market', max: 1, ring: null, when: (f) => f.place === 'market' }`, second in `HINTS`, right after `roofs`. The two place hints can never be due on the same walk.
  - **Line:** `'hint.market'`: `same('Wait till they turn around…')`, the same in both word sets.
  - **Picture:** `'🧺'`.
- **V15. The unlock is the spec's.**
  - **The row:** `{ name: 'The Market Square', price: 150, requires: { area: 'neighborhood', walks: 2 }, edition: 'canon' }`, after `roofs` in `CATALOG.areas`, through `areaOffer`. It is not in `KEPT_OFFERS`.
  - **Why the map does not say otherwise:** main's world map orders places by map neighbours (`requires.area` is the place a gateway leads from), and the Market's gate leads from the town. The Rooftops opens after the Fairground only because R1 held it back until co-walkers could see height.
  - **The home line:** rule 7 of `src/ui/nextthing.js` still names the free Woods alone at 1 town walk (free first). So the Market changes no home line.
  - **Owner question 2:** keep this, or open it after 2 Rooftops walks instead?
- **V16. Clan Edition only (`edition: 'canon'`).** The spec says "Editions: Clan Edition with both word sets. … Legacy is being retired", and steps 1–2 were Clan Edition only. A Legacy save has no card, no gate and no gold count change. A Legacy partner in a room walks it by override (`roomAreaMove`), as with every Clan-only place.
- **V17. `?market=1` becomes a developer shortcut**, as Rooftops step 4's T3 did for `?roofs=1`.
  - **What changes:** `marketResumable(ids)` returns `ids` unchanged, so a Market walk note resumes with the switch or without.
  - **What stays:** the switch still starts a solo Market walk in Clan Edition, never in a room, for the owner and the picture pages, and still prefetches at boot. Only comments, the resume filter and the turned tests change.
- **V18. The gateway pair.**
  - **Town end:** `town-market`, a `signpost` on the Neighborhood's south edge at (30, 52), facing south, `sign: true` (the painted board with the place's name, the phrase `'gate.sign'`). On the map the Market sits on the town's south-east rim (V19), so a south-east street end matches it. The builder may move x within 20..45 to pass G1/G5, and says so in the commit.
  - **Square end:** `market-town`, `placement: 'inside'`, at (0, 23.6) in `GATEWAY_GAP`, facing south, look `signpost` (its posts at ±1.4 sit inside the 3.2 m gap). It arrives at `{ x: 0, z: 19.9, yaw: 0 }`: facing north, 3.7 m in front of it.
  - **Why 'inside':** an `edge` end must stand 2.5–3.5 m inside the bounds (G5), which is z 19.5–20.5, on the spawn (0, 20.5). The gap is behind the spawn, by the owner's answer.
- **V19. The world map.** `TOWN_PLACES` gains `{ id: 'market', areaId: 'market', x: 958, y: 646, r: 42 }`, on the town's south-east rim, and `TOWN_LAND.market` is `'#d8b48a'` (warm cobble). `GATEWAYS` gains the road `town-market`, from the town's rim to that circle. The builder may move the circle up to 25 units to pass the map tests. Its name comes from `PLACE_WORDS.market`: 'The Market Square' in both sets.
- **V20. Where each new module lives.**

  | module | joins | why |
  |---|---|---|
  | `src/marketpages.js` | start-up | `journal.js` shows every page: ids and phrase lookups only (as `roofspages.js`) |
  | `src/foundwear/spots/market.js` | start-up | `src/foundwear/rules.js` plans a find before the walk loads (as every area's spots) |
  | `src/cat/headaim.js` | start-up | `game/avatar.js` and `remotecats.js` pose every cat: about 40 lines, no THREE |
  | the four outfits' cat-side pieces | start-up | the cat model (`src/cat/*`) is start-up; each reuses a shipped builder in new colours |
  | rows in `progression.js`, `journal.js`, `discoveries.js`, `hud.js`, `goldmice.js`, `propsets.js`, `clanphrases.js`, `clanwords.js`, `offclanwords.js`, `gateways.js`, `worldmap.js`, `hints.js`, `tutorialwords.js`, `game/tips.js`, `ui/territorymap.js` | start-up | data only |
  | one line in `src/tippables.js` | start-up | the `spot.build` hook (V1) |
  | `src/world/marketlife.js`, `marketfruit.js`, `marketfinds.js`, `marketfolk.js`, `marketsound.js`; changes to `market.js`, `marketparts.js`, `marketplan.js`, `marketlive.js`, `marketkeeper.js` | Market chunk | imported only from `market.js` / `marketlive.js` (`AREA_LOADERS.market`) |

  - **Gates:** start-up ≤ **693.5 kB** after step 3 (Task 9) and ≤ **696.0 kB** after step 4 (Task 14). Over a gate: stop and report. Never trim silently; the words go first.
  - **Chunk:** the Market chunk stays under `AREA_GZIP_CEILING_KB` (100).
- **V21. Strays stay as built** (about 22, kept out of the counters' zones by `MARKET_KEEPOUT`). The new apples, petals and perches do not change `MARKET_KEEPOUT`.
- **V22. Two children together (step 4).**
  - **Already true:** the room path reads `CATALOG.areas`, so the row is the switch. The stall rhythm runs from the room seed (`roomSeed ?? soloSeed`, as built). Treats are per device, with the partner's munch over the existing `carry-pick` (M7, M8). Tips and knocks travel by their existing events. Finds and gold mice are per save. A found outfit follows `findsAgreed` and `planFind` on the room seed.
  - **The wire:** no new message type and no new field.

## Questions only the owner can answer

1. **The found outfits' names** (he and his daughter pick them; placeholders until then):
   - 'Market Trader's Cap' 🧢 (head);
   - 'Shopping-Bag Scarf' 🛍️ (neck);
   - 'Apple Charm' 🍎 (collar);
   - 'Flower Basket' 🧺 (back).
2. **The unlock:** 150 🐾 after 2 town walks (the spec's proposal, V15), or after 2 Rooftops walks?
3. **Clan Edition only** (V16): fine that Legacy never gets the Market?
4. **The six pages' words** (Task 4's table), and the clan words' line "One of the Twolegs plays a fiddle just for you" ('townspeople' in the everyday words).
5. **The bicycle basket** is a rock and a bell, not a ride (V8). Enough?
6. **The sounds** need ears: after a walk with sound on, are the coos, the tune, the bell and the chatter the right loudness?
7. **The pictures:**
   - the look-up;
   - the café front;
   - the tubs;
   - the cobbles;
   - the fruit and flower stalls (the tumble and the petals);
   - the six discoveries;
   - the gate in the gap and the town's new signpost;
   - the map card.

## Global Constraints

- **Work only in** `/Users/pniessen/CLAUDE-CODE/projects/cat-game/.claude/worktrees/market`, branch `market`. Never touch the main checkout. Never merge into main, never push, never touch the database or any `.env` file.
- **Commits:** `git add <exact paths>`, never `-A` or `.`. Every message ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Determinism:**
  - `test/fixtures/flat-trace.gameplay.json` must not move. After every task: `git diff --exit-code test/fixtures/flat-trace.gameplay.json`.
  - New randomness comes from its own salted stream or from `hash01(x, z, salt)` (`src/world/warehouselook.js`). The salts are `MARKET_APPLE_SALT`, `MARKET_SOUND_SALT` and `MARKET_PETAL_SALT`, each distinct from every salt in `walk.js`, `marketrules.js` and `foundwear/rules.js`.
  - No `Math.random`, `Date.now` or `performance.now` in the plan, the parts, the build or the life. The life runs on walk seconds.
  - `build` runs inside `withLocalUuids`.
  - Loading any chunk module paints no canvas and draws no random number (F6's `test/areaimport.test.js`).
- **Text:**
  - Every player-facing line goes through the word tables: phrases in `src/clanphrases.js`'s `LATER` table under `// ---- the Market Square, steps 3 and 4 (2026-11-21) ----`, hint lines in `src/tutorialwords.js`, place names in `PLACE_WORDS`.
  - Lines read the same in both word sets except where a line takes a word from the set (`words().OUTSIDE_WORDS.people`). No series word goes in a string literal outside the word tables.
  - Refresh snapshots with `UPDATE_SERIES_SNAPSHOT=1 UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords`, plus `UPDATE_OFF_SNAPSHOT=1 npx vitest run test/offwords.test.js` for the later-phrases fixture. Keep only the task's own lines. Revert unrelated drift, including spurious `notReached` entries in `test/fixtures/series-words-on-source.json`.
- **Tests:**
  - No test reads `src/` as text (rule S1).
  - Whole-walk tests get explicit 60–90 s timeouts.
  - CI runs on Linux, so float fixtures use closeDiffs (`test/helpers/closeto.js`) or `toBeCloseTo`.
  - Run only the files a task names, and skip a named file that does not exist. A full suite is running in this worktree as this plan is written: **no full suite** until the owner says so, and then one run at the end, after a load check (`uptime` against `sysctl -n hw.ncpu`).
- **Offline-first:** nothing contacts the database.
- **The wire:** no new network message type and no new field (V22).
- **Shared files** get small, local edits: `src/game/walk.js`, `src/main.js`, `src/world/areas.js`, `src/game/avatar.js`, `src/cat/animator.js` (not edited at all, V10), `test/budget.test.js`, `src/game/interactions.js`, `src/game/netevents.js`, `src/propsets.js`, `src/gateways.js`, `src/worldmap.js`, `src/progression.js`, `src/remotecats.js`, `src/tippables.js`. The `people`, `house` and other branches change them too.
- **Budget:**
  - The Market stays inside `test/budget.test.js`'s 280 meshes, 210 casters and 62,000 triangles, built and merged, gates included.
  - Its own aim stays 180 / 110 / 45,000 (`test/market.test.js` pins the exact counts; today 101 / 27 / 37,943 built).
  - The life adds at most 10 meshes, no casters and at most 3,500 triangles (`test/marketlife.test.js`).
- **Real-game and test-page checks:** port **5407** (`npx vite --port 5407 --strictPort`), muted (seed `muted: true`, `--mute-audio`, never press M). Stop only the vite you started. Pictures go in `/private/tmp/claude-501/-Users-pniessen--claude-spares-spare-gcns3j/e37e3895-a9b0-4a89-9360-a15387ffb2e4/scratchpad/market/step3/` and `…/market/step4/`.
- **Pictures for the owner** at the end of each step (Tasks 9 and 14).
- **Line numbers** are not given. Find each site by its quoted code.

## Review Focus

1. **The head aim leaks.** The risks: a cat in another place, Hagrid, a cat that was cooed at and then walked off, or a remote cat poses differently from before.
   - Expected: with no target, or once the weight has eased back to 0, every transform is exactly what `animateCat` wrote.
   - Tests: Task 7, `with no target ever set, every cat in every pose is exactly animateCat's` and `once it has eased out it writes nothing`.
2. **The partner tips the apple crate while she stands where the apples roll.**
   - Expected: apples never enter a collider, never move her, and land at the same spots on both screens. A remote tip pays her nothing (as any remote tip).
   - Tests: Task 2, `every apple's path stays on walkable cobbles` and `two devices roll the same apples to the same spots`.
3. **A walk resumed after finds, or a find on a co-walk.**
   - Expected: no second award, line or page count that walk. Each child is paid on her own save.
   - Tests: Task 6, `a resumed walk pays and counts nothing twice` and `two players each find it on their own save`.
4. **A save that walked `?market=1` before step 4** (`walks.market` 2, not owned, 0 points).
   - Expected: she does not own it. It is offered at 150 🐾 once she has 2 town walks. Its walk note resumes.
   - Tests: Task 11, `a save that walked the Market with the switch keeps nothing it did not buy`.
5. **The gate in the gap behind the spawn.**
   - Expected: arriving through it lands her at (0, 19.9) facing north, clear of the spawn and the race pad. A Legacy town has no Market gate.
   - Tests: Task 12, `the square's gate stands in the south row's gap` and `a Legacy town has no Market gate`.
6. **Start-up size.**
   - Expected: ≤ 693.5 kB after step 3 and ≤ 696.0 kB after step 4.
   - Tests: Tasks 9 and 14, `npm run build`.

---

## File Structure

| File | Status | Responsibility (task) |
|---|---|---|
| `src/world/marketplan.js` | modify | lamps moved, `hideSide`, the fruit hide; `MARKET_RESTS`, `MARKET_KNOCKS`, markables, carryables (1); `MARKET_PERCHES`, `MARKET_REGISTRATION.goldMice` (3); the musician's pitch and the pigeons' patch (5); `MARKET_MOMENT_SHOTS` (9); `MARKET_REGISTRATION.catalog` (11) |
| `src/world/market.js` | modify | the fruit trestle (1); the tippable crate, the life hook (2); the climbing stacks, `record.perches` (3); the pigeons' spawns (6); café, tubs, cobbles (8) |
| `src/world/marketparts.js` | modify | `createCobbleTexture`, atlas 8 × 4 (8) |
| `src/world/marketlife.js` | create | `createMarketLife(area, ctx)`: the dusk look, apples, petals (2), musician and sound (5), finds and the basket's rock (6) |
| `src/world/marketfruit.js` | create | `buildAppleCrate`, `applePaths`, `createApples`, `createPetals` (2) |
| `src/world/marketfolk.js` | create | `createMusician(scene, spot, { figure, reducedMotion })` (5) |
| `src/world/marketsound.js` | create | `createMarketSound(audio, …)` (5) |
| `src/world/marketfinds.js` | create | `MARKET_FIND_WORDS`, `noteMarketFind` (4); `FIND_RULES`, `findAt` (6) |
| `src/marketpages.js` | create | `MARKET_FIND_IDS`, `marketPageId`, `MARKET_JOURNAL_TYPES`, `MARKET_PAGE_WORDS` (4) |
| `src/marketkeeper.js` | modify | `marketFigure` (5) |
| `src/marketlive.js` | modify | `figure` default `marketFigure` (5); `session.lookAt`, `remote.lookAt`, idle held (7) |
| `src/cat/headaim.js` | create | `HEAD_AIM`, `aimHead` (7) |
| `src/game/avatar.js`, `src/remotecats.js`, `src/game/session.js` | modify | one `aimHead` call each; the `lookAt` field (7) |
| `src/tippables.js` | modify | `spot.build` (2) |
| `src/propsets.js` | modify | `SETS.market` rows (1, 3) |
| `src/goldmice.js` | modify | `GOLD_MICE.market` (3) |
| `src/foundwear/spots/market.js`, `src/foundwear/spots/index.js` | create, modify | 12 find spots (3) |
| `src/progression.js`, `src/journal.js`, `src/discoveries.js`, `src/ui/hud.js`, `src/clanphrases.js`, `src/clanwords.js`, `src/offclanwords.js` | modify | pages, award, words, people word, `PLACE_WORDS.market` (4); catalog row (11) |
| `src/hints.js`, `src/tutorialwords.js`, `src/game/tips.js` | modify | the hint (10) |
| `src/marketflag.js`, `src/worldmap.js`, `src/ui/territorymap.js`, `src/world/areas.js` | modify | opens, map, shortcut (11) |
| `src/gateways.js` | modify | the pair (12) |
| `src/foundwear/head.js`, `neck.js`, `body.js`, `src/cat/hats.js`, `src/cat/foundhead.js`, `src/cat/foundneck.js`, `src/cat/backitems.js` | modify | four outfits (13) |
| `verify-market.html`, `verify-places.html`, `public/places/market.jpg` | modify | moment shots (9); the card picture (14) |
| tests | create / modify | named in each task |

---

### Task 0: Start

**Files:** none changed.

- [ ] **Step 1:** Confirm `git log -1 --format=%h` is `0bacf66e` or later on `market`, and `git status` is clean.
- [ ] **Step 2:** Confirm the names this plan uses exist on the branch: `audio.isMuted` (`src/audio.js`); `labelAs` on critter spawns (`src/world/roofsflock.js`); `FIND_SPOTS` and `WEAR_PER_AREA` (`src/foundwear/`); the `roofs` row first in `HINTS`; `noteRoofsFind` (`src/world/roofsfinds.js`); `liveEndsFor` (`src/gateways.js`); `lifecycle` (`test/helpers/walklife.js`). If a name differs, use the real name everywhere below and say so in Task 1's commit.
- [ ] **Step 3:** Wait for the owner's word that the running suite is done before any long run.

## Step 3: the rest

### Task 1: Clear lanes, a hide at the fruit stall, and the square's props

**Files:**
- Modify: `src/world/marketplan.js`, `src/world/market.js` (the fruit trestle), `src/propsets.js` (`SETS.market`)
- Test: `test/marketplan.test.js`, `test/market.test.js`

**Precedent:** Rooftops step 2's `ROOFS_REGISTRATION.propSet` (`src/world/roofsplan.js`) and `test/market.test.js`'s `each registration row is in its table`. Rests follow `src/rests.js` (`mesh: false` rows); knockables follow the Park's and the Farm's rows in `src/propsets.js`.

**Interfaces:**
- `RAW` rows take an optional `hideSide` (default 1). `fruit` gets `hide: true, hideSide: -1`. `treatSpot` and `hideSpot` take the side.
- `MARKET_LAMPS`: four posts. [1] and [3] are moved (V4). [0] and [2] move only if a test needs it.
- `MARKET_REGISTRATION.propSet`:
  - `rests`:
    - `{ id: 'market-drink-1', kind: 'drink', x: 0, z: 3.8, mesh: false }` (the fountain's south rim, on the collider's edge);
    - `{ id: 'market-nap-1', kind: 'nap', x: MARKET_ANCHORS.flourSacks.x, z: …z, mesh: false }`. The sacks are drawn already; their coordinates move into `marketplan.js` as `FLOUR_SACKS`, and `market.js` reads them from there.
  - `knockables`:
    - `{ id: 'market-flowers-bucket-1', kind: 'bucket', x, z, y: 0.75, fallTo: { x, z, y: 0.01 } }` on the flower trestle's top, falling toward the cobbles in front of the trestle (V2);
    - `{ id: 'market-cafe-cup-1', kind: 'cup', x, z, y: <table top>, fallTo }` on café table 2.
  - `markables`: two (a lamp post's foot, the noticeboard's post), in the Fair's row shape.
  - `carryables`: two (a paper bag by the barrow-w, a dropped glove by the bench-east), in the Fair's row shape.
- `SETS.market` copies them. `MARKET_HIDES` gains the fruit's hide.

- [ ] **Step 1: Write the failing tests**
  - `test/marketplan.test.js`:
    - `both playable stalls have a hide a short dash from their front`: the flower and fruit hides are walkable at their centres, within 3 m of their counter's front middle, and on a walkable straight line to it.
    - `the fruit stall's hide is on the side away from its crate`: the hide's local `lx` and `FRUIT_CRATE.lx` have opposite signs.
    - Turn the lamp lane check (inside `the clutter stands clear of …`) to loop over all six stalls with a counter (`s.w > 0`), with the message `lamp … in front of <id>'s counter`.
    - `no lamp stands where it stood in front of the fruit and flower stalls`: neither (0, −10.4) nor (5.5, 1) is in `MARKET_LAMPS`.
    - `the rests are reached from the cobbles, the knockables sit on their ledge and land on free cobbles`: each rest has a walkable point within 0.8 m of it. Each `fallTo` is walkable, 0.3 m clear of every collider and outside every treat counter's watch zone.
  - `test/market.test.js`:
    - `each registration row is in its table` covers the new rows;
    - `the fruit stall's trestle is drawn over its hide`;
    - re-pin `MEASURED_BUILT` / `MEASURED_MERGED` with the measured numbers, as its comment block does.
- [ ] **Step 2: Run** `npx vitest run test/marketplan.test.js test/market.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Write the header line in `marketplan.js` for V3 and V4, and update the ASCII map.
- [ ] **Step 4: Run** the same command, plus `npx vitest run test/propsets.test.js test/rests.test.js test/knockables.test.js test/budget.test.js test/marketlive.test.js test/marketrules.test.js test/flattrace.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** the five files, with the message "Market step 3: the fruit and flower stalls' lanes cleared of lamp posts, a hide at the fruit stall, and the square's props (a drink at the fountain, a nap on the flour sacks, a bucket of flowers and a café cup to knock off, two things to carry, two to mark)".

### Task 2: The apple crate tips and its apples roll; the flower bucket's petals scatter

**Files:**
- Create: `src/world/marketfruit.js`, `src/world/marketlife.js`, `test/marketfruit.test.js`
- Modify: `src/tippables.js` (one line), `src/world/market.js` (the `tippables` row; it stops drawing the static crate into the fruit stall's mesh; `life: (ctx) => createMarketLife(area, ctx)`)
- Test: `test/tippables.test.js`, `test/market.test.js`

**Precedent:** `createTippables` / `tipById` (`src/tippables.js`); `createKnockables` (`src/knockables.js`, its pure fall and fixed decal); `createRoofsLife` (`src/roofslife.js`) for the life's shape.

**Interfaces:**
- `tippables.js`: `const group = typeof spot.build === 'function' ? spot.build() : buildTippable(spot.kind);`. The rest of the module is unchanged.
- `market.js` `tippables`: `[{ x: <apples.x>, z: <apples.z>, kind: 'applecrate', build: buildAppleCrate }]`. The crate's collider stays in `MARKET_COLLIDERS`.
- `marketfruit.js`:
  - `MARKET_APPLE_SALT`;
  - `APPLES = { n: 6, r: 0.045, roll: { min: 0.8, max: 2.2 }, time: 1.4, spread: 0.9 }`;
  - `buildAppleCrate() → THREE.Group`: a slatted crate heaped with apples, under 300 triangles, origin at its base, noCast;
  - `applePaths(area, crateAt, mouthYaw) → [{ x0, z0, x1, z1 }]` × 6: pure; each end is the last walkable point along the ray (0.05 m steps), with distance and angle from `hash01(i, 0, MARKET_APPLE_SALT)`;
  - `createApples(scene, paths, { reducedMotion }) → { start(), update(dt), mesh, dispose() }`: one `InstancedMesh` (1 draw call). The apples ease out with a spin, then stay;
  - `createPetals(scene, at) → { show(), mesh, dispose() }`: about 12 flat petals in a ring, r ≤ 0.6, one merged noCast mesh, hidden until shown.
- `marketlife.js`:
  - `createMarketLife(area, ctx) → { update(dt, t, catPos, camera, session), dispose() }`. It calls `setMarketDusk(area, ctx.dusk ? 1 : 0)` once, as `createMarketLook` did, and `createMarketLook` goes.
  - Each frame it watches `session.tippables.list` for the `applecrate` entry turning `tipped`, which starts the apples. The mouth's yaw is read from that entry's `group.rotation.y` (the same on both devices: `tippables.js` derives it from x, z).
  - It watches `session.knockables` for `market-flowers-bucket-1` landing, which shows the petals.
  - No allocation per frame.

- [ ] **Step 1: Write the failing tests**
  - `test/tippables.test.js`: `a spot may bring its own model` (with `build`, that group is the entry's, at the spot; without it the old kinds build as before).
  - `test/marketfruit.test.js`:
    - `every apple's path stays on walkable cobbles` (every 0.05 m sample along each path is walkable on `marketArea()`, and each end is at least 0.3 m from the crate);
    - `two devices roll the same apples to the same spots` (two builds and `applePaths` called twice are deep-equal; a `Math.random` spy counts 0);
    - `the apples lie still once rolled, and nothing allocates per frame`;
    - `a tipped crate on either device starts the apples`: a stand-in session whose entry is tipped by `tip(e)` or by `tipById('tip-0')` starts them both;
    - `the petals show where the bucket lands, once, and stay`;
    - `the crate, the apples and the petals cast nothing; the life adds at most 3 meshes for them`.
  - `test/market.test.js`: `the apple crate is a tippable, still solid, and no longer in the fruit stall's own mesh`; `the look hook lights the lanterns on a dusk walk only` passes through `createMarketLife`.
- [ ] **Step 2: Run** `npx vitest run test/tippables.test.js test/marketfruit.test.js test/market.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command, plus `npx vitest run test/interactions.test.js test/netevents.test.js test/knockables.test.js test/areaimport.test.js test/budget.test.js test/fair.test.js test/farm.test.js test/flattrace.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** the seven files, with the message "Market step 3: paw the apple crate over and six apples roll across the cobbles; knock the flower stall's bucket off and its petals scatter; the same on both screens".

### Task 3: Up onto the awnings, three golden mice, and the find spots

**Files:**
- Modify: `src/world/marketplan.js` (`MARKET_PERCHES`, `MARKET_REGISTRATION.goldMice`), `src/world/market.js` (the six crate stacks, `record.perches = MARKET_PERCHES`), `src/goldmice.js` (`GOLD_MICE.market`, header count)
- Create: `src/foundwear/spots/market.js`
- Modify: `src/foundwear/spots/index.js` (one import, one key)
- Test: `test/marketplan.test.js`, `test/market.test.js`, `test/marketlive.test.js`, `test/foundspots.test.js` (`ALL_BUILDERS.market`), `test/goldedition.test.js`, `test/docks.test.js`, `test/farm.test.js`, `test/fair.test.js`, `test/roofs.test.js` (their 39 pins)

**Precedent:**
- `fair.js` `stallPerches` (a crate perch, then the roof perch);
- `src/climbing.js` `canReach` / `BASE_CLIMB_BUDGET`;
- Rooftops step 5 Task 2 (gold mice and their pins);
- found-outfits step 2 Tasks 14–18 and `src/foundwear/spots/fair.js` (spots read off the built area).

**Interfaces:**
- `MARKET_PERCHES` (frozen `{ x, z, y, kind, label? }`):
  - per stall, a `crate` perch on its stack (y 0.9–1.0) and a `roof` perch on its awning (`label: 'the <stall> awning'` for the four treat stalls, the words plain, `vantage: true`);
  - the flower trestle's top (`crate`, y 0.75, V2);
  - the bicycle basket (`crate`, at `MARKET_ANCHORS.basket`, V8);
  - one rim perch on each of `stack-w` and `stack-e`.
- The six stacks are solid (r 0.3 each, added to `MARKET_COLLIDERS`). Each is beside its stall on the side away from its hide, outside every watch zone, every lane and every hide-to-treat line.
- `GOLD_MICE.market` = `MARKET_REGISTRATION.goldMice` (V12). `GOLD_TOTAL` = 42.
- `MARKET_SPOTS` (12 rows, `fw-market-1..12`, `look` from `FIND_LOOKS`): all at least 15 m from the spawn, 2 m from a golden mouse or a collectible, 3 m from both `YARN_SPOTS.market`; at least 4 on the ground; any raised one on a perch's top.

- [ ] **Step 1: Write the failing tests**
  - `test/marketplan.test.js`:
    - `every awning is two hops from the cobbles, with no skill`: from a walkable point, `canReach` with `BASE_CLIMB_BUDGET` reaches the stall's crate perch, and from it its roof perch. Each roof perch's y is at least `MARKET.HIGH_Y`.
    - `the stacks stand beside each stall, never in a watch zone, a lane or on a hide's line`.
    - `the basket, the trestle and the rims are one hop from the cobbles`.
  - `test/marketlive.test.js`: `perched on a real awning she is never shooed and never cooed at` (`marketRig`, `player.perchY` at the roof perch's y, walking across the zone below while watched).
  - `test/market.test.js`: `the record's perches are the plan's`; `three golden mice on the square's own spots, reached as the plan says` (`gm-market-1` within 0.1 m of a roof perch's height, `gm-market-3` on the ground, every mouse clear of every collider and 1.5 m from every find spot, collectible and discovery anchor); `the gold rows are the registration's`.
  - Counts: turn the 39 pins in `goldedition`, `docks`, `farm`, `fair` and `roofs` to 42 for Clan Edition, with Legacy unchanged at 21. Each comment says "39 until the Market added its three".
  - `test/foundspots.test.js`: `ALL_BUILDERS.market = '../src/world/market.js'`. Its `describe.each` then holds the 12 spots to every rule.
  - Re-pin `MEASURED_BUILT` / `MEASURED_MERGED`.
- [ ] **Step 2: Run** `npx vitest run test/marketplan.test.js test/market.test.js test/marketlive.test.js test/foundspots.test.js test/goldedition.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** One comment line per perch chain, mouse and spot says where it is and how she gets there.
- [ ] **Step 4: Run** the Step 2 files plus `npx vitest run test/docks.test.js test/farm.test.js test/fair.test.js test/roofs.test.js test/climbing.test.js test/foundrules.test.js test/foundplay.test.js test/journal.test.js test/budget.test.js test/flattrace.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** the exact files, with the message "Market step 3: crates up onto every awning (where nobody notices her), the flower trestle and the bicycle basket to hop on, three golden mice (one on an awning) and twelve hiding spots for a found outfit".

### Task 4: Six journal pages, their words and their award

**Files:**
- Create: `src/marketpages.js` (start-up), `src/world/marketfinds.js` (chunk: the lines and `noteMarketFind`; Task 6 adds the rules), `test/marketfinds.test.js`
- Modify:
  - `src/progression.js` (`JOURNAL_TYPES`);
  - `src/journal.js` (`CRITTER_INFO`, as it maps `ROOFS_FIND_IDS`);
  - `src/discoveries.js` (`AWARDS.marketfind = 12`);
  - `src/ui/hud.js` (`discoveryText`: `marketfind` says its label);
  - `src/clanphrases.js` (LATER);
  - `src/clanwords.js` (`OUTSIDE_WORDS.people: 'Twolegs'`, `PLACE_WORDS.market: 'The Market Square'`);
  - `src/offclanwords.js` (`PLACE_WORDS.market: 'The Market Square'`; its `people` stays 'townspeople').
- Test: `test/marketfinds.test.js`, `test/docks.test.js` (journal lengths 50 → 56), the series-words fixtures

**Precedent:** Rooftops step 5 Task 3: `src/roofspages.js` and `src/world/roofsfinds.js` (`noteRoofsFind`), and `test/roofsfinds.test.js`.

**Interfaces:**
- `MARKET_FIND_IDS = ['fountain', 'pigeons', 'sacks', 'musician', 'basket', 'apples']`; `marketPageId(id) → 'market' + id`; `MARKET_JOURNAL_TYPES`; `MARKET_PAGE_WORDS[pageId] = { name, hint }`, each id spelled in full.
- `MARKET_FIND_WORDS[id]`; `marketFindKey(id) → 'market-find-' + id`; `noteMarketFind(id, { log, progression }) → { fresh, first, points }`, with `noteRoofsFind`'s rules.
- The words (phrase ids `market.page.<id>.name`, `market.page.<id>.hint`, `market.find.<id>`). Emoji: 💧 🕊️ 🌾 🎻 🚲 🍎.

  | id | page name | page hint | first-find line |
  |---|---|---|---|
  | fountain | The Market Fountain | Where can a thirsty cat get a drink in the square? | A cool drink from the fountain. Splish! 💧 |
  | pigeons | Pigeon Scatter | Some birds in the square peck at crumbs. | Whoosh! The pigeons flap off in a flurry. 🕊️ |
  | sacks | Warm Flour Sacks | The baker's sacks look soft and warm. | A nap on warm flour sacks. Soft and toasty. 😴 |
  | musician | The Street Musician | Somebody in the square plays a happy tune. | `` (people) => `Music! One of the ${people} plays a fiddle just for you. 🎻` ``, called with `words().OUTSIDE_WORDS.people` |
  | basket | Bicycle Basket | A bicycle is parked by the shops. Is there room for a cat? | A bicycle basket! It rocks, and the bell goes ding ding! 🚲 |
  | apples | Rolling Apples | What happens if a cat paws the apple crate? | Oops! Apples everywhere, rolling over the cobbles. 🍎 |

- [ ] **Step 1: Write the failing tests** (`test/marketfinds.test.js`):
  - `six pages after the Rooftops', each with its name and hint`: `JOURNAL_TYPES.slice(-6)` equals `MARKET_JOURNAL_TYPES`, and `renderJournalHtml` shows each hint and no name.
  - `the first find ever pays 12 and says its line once; a later walk counts the page and says nothing` (real `createProgression` on memory storage, `createDiscoveryLog`, a `bus` spy; the Rooftops' test, word for word).
  - `the musician's line says Twolegs in the clan words and townspeople in the everyday words` (`withStandInWords` for each set), and `no other market line or page holds a series word` (`seriesFilter`).
  - `an old save without the pages loads with each at 0`.
  - `AWARDS.marketfind equals AWARDS.roofsfind`; `discoveryText({ type: 'marketfind', label: 'X' })` is `'X'`.
  - `test/docks.test.js`: `JOURNAL_TYPES` and `CRITTER_INFO` lengths 56.
- [ ] **Step 2: Run** `npx vitest run test/marketfinds.test.js test/docks.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement**, then refresh the snapshots (Global Constraints). Keep only `market.page.*`, `market.find.*`, `PLACE_WORDS.market` and `OUTSIDE_WORDS.people` lines.
- [ ] **Step 4: Run** the Step 2 files plus `npx vitest run test/journal.test.js test/clanphrases.test.js test/clanwords.test.js test/catbuilder.test.js test/discoveries.test.js test/hud.test.js test/serieswords test/offwords.test.js test/wordset.test.js test/roofsfinds.test.js test/fairsim.test.js test/fairgames.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** the files, with the message "Market step 3: six journal pages for the square's discoveries, their words in both sets (the musician is one of the Twolegs in the clan words), 12 🐾 the first time each is found".

### Task 5: The street musician and the market's sounds

**Files:**
- Create: `src/world/marketfolk.js`, `src/world/marketsound.js`, `test/marketfolk.test.js`, `test/marketsound.test.js`
- Modify:
  - `src/marketkeeper.js` (`export const marketFigure = twolegKeeper;`, header);
  - `src/marketlive.js` (the `figure` default is `marketFigure`);
  - `src/world/marketplan.js` (`MUSICIAN = { x, z, yaw, r: 0.45 }` in `MARKET_COLLIDERS`; `PIGEON_PATCH = { x, z, r }`);
  - `src/world/marketlife.js` (makes both when its context has `scene` and `audio`).
- Test: `test/marketplan.test.js`, `test/marketlive.test.js`

**Precedent:** `twolegKeeper` (`src/marketkeeper.js`) and its use in `createMarketLive`; `createRoofsSound` (`src/world/roofssound.js`), whose `CALLS` and `loudness` this file imports (V9).

**Interfaces:**
- `createMusician(scene, spot, { figure = marketFigure, reducedMotion }) → { group, update(t), dispose() }`. It builds `figure({ x, y, z, yaw })`, parents a fiddle and a bow (under 200 triangles, noCast) to `arm` at `hand`, and bows on walk seconds (`arm.rotation.z` = rest + 0.25 sin(2.4 t); 0.08 under reduced motion). It never moves `group` after it is placed.
- `MUSIC = { ear: 14, gain: 0.03, notes: [...] }` (a 16-note tune, triangle wave, each note ≤ 0.35 s, a 6 s rest between plays). `BELL = { gain: 0.04 }`. `CHATTER = { ear: 9, gain: 0.012 }`. Pigeons coo within `EAR.pigeon` (`roofssound.js`).
- `createMarketSound(audio, { pigeons, musician, stalls }) → { update(dt, catPos, t), bell(), dispose() }`. It plays nothing, and never calls `getContext`, while `audio.isMuted?.() !== false`. The schedule comes from `hash01(n, k, MARKET_SOUND_SALT)`.

- [ ] **Step 1: Write the failing tests**
  - `test/marketplan.test.js`:
    - `the musician stands where no cat can, out of every lane, zone and hide line, 3 m from every point of interest`;
    - `the pigeons' patch is free cobbles, off every lane and zone`.
  - `test/marketfolk.test.js`:
    - `the musician is built through the one figure function` (a spy `figure` passed in is called once with the plan's spot; default `marketFigure === twolegKeeper`);
    - `bows on walk seconds, never moves, casts nothing, and goes on dispose`;
    - `draws nothing from Math.random`.
  - `test/marketlive.test.js`: `the stallholders are built through the one figure function`: with `opts.figure` a spy, it is called once per stall with a keeper, at the keeper's spot. With no `figure`, every keeper group is `marketFigure`'s, named `'marketKeeper'` as `twolegKeeper` names it, and `marketFigure === twolegKeeper`.
  - `test/marketsound.test.js` (the Rooftops' fake audio):
    - `muted: no sound, and no AudioContext asked for`;
    - `muted mid-walk: silent from the next frame`;
    - `an audio without isMuted plays nothing`;
    - `by the musician she hears the tune, louder nearer; 20 m away, none`;
    - `the bell rings twice when asked`;
    - `every tone is quiet before the master` (every gain ≤ 0.05);
    - `the same walk makes the same sounds, and nothing draws on Math.random`.
- [ ] **Step 2: Run** `npx vitest run test/marketplan.test.js test/marketfolk.test.js test/marketsound.test.js test/marketlive.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** No audio node is made until the first sound is due. `dispose()` stops anything still sounding.
- [ ] **Step 4: Run** the same command, plus `npx vitest run test/market.test.js test/areaimport.test.js test/roofssound.test.js test/audio.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** the files, with the message "Market step 3: a street musician by the fountain (made through the one figure function the stallholders use), bowing a fiddle; pigeons cooing, a happy tune, a bicycle bell and market chatter, silent when muted".

### Task 6: Where the six are found

**Files:**
- Modify:
  - `src/world/marketfinds.js` (`FIND_RULES`, `findAt`);
  - `src/world/marketlife.js` (tracks `still`, calls `findAt` and `noteMarketFind`; the basket's rock and bell);
  - `src/world/market.js` (the pigeons: `critterSpawns` becomes the two birds plus five `type: 'bird'` spawns with `labelAs: 'pigeon'` at `PIGEON_PATCH`; the bicycle is its own child so it can rock).
- Test: `test/marketfinds.test.js`, `test/marketlife.test.js` (create)

**Precedent:** `FIND_RULES` / `findAt` (`src/world/roofsfinds.js`); `createRoofsMoments` (`src/world/roofsmoments.js`), with `still` and its `session` stand-in; pigeon spawns with `labelAs` (`src/world/roofsflock.js`).

**Interfaces:**
- `findAt(anchors, spot) → id | null`, with `spot = { x, y, z, speed, still, perched, rest, pigeonFlush, crateTipped }`. In `MARKET_FIND_IDS` order:
  - fountain: `rest?.kind === 'drink'` within 0.8 m of the drink rest;
  - pigeons: `pigeonFlush` (a pigeon whose `fleeing` turned true this frame within 3 m of her) while `speed ≥ 1.5`;
  - sacks: `rest?.kind === 'nap'` within 0.8 m of the nap rest, for `rest.t ≥ 2`;
  - musician: within 3 m of `MUSICIAN`, `still ≥ 2`;
  - basket: `perched` within 0.05 m of the basket perch;
  - apples: `crateTipped` this frame within 2.5 m of the crate.
- The life builds `spot` from `session` (`rest`, `perched`, `player` speed through `session.player?.speed ?? 0`), from `ctx.critters` (birds with `def.labelAs === 'pigeon'`, `fleeing` edge) and from its own crate watch (Task 2).
- `basket`: on landing, the bicycle child rocks (±2°, 1.5 s; held still under reduced motion) and `sound.bell()` rings.
- Without `log` or `progression` (the picture pages) nothing is noted; the moments still play.

- [ ] **Step 1: Write the failing tests**
  - `test/marketfinds.test.js`:
    - `each discovery is found at its own spot, and only there` (one case per row, plus the same spot 4 m off giving null);
    - `the pigeons want her running when they take off`: a flush at speed 1.0 gives null, at 2.0 `'pigeons'`;
    - `the musician wants her still for 2 s`;
    - `the basket from its perch, not beside it`.
  - `test/marketlife.test.js` (a built square, a stand-in session and critters):
    - `drinking at the fountain writes its page once a walk`;
    - `running at the pigeons scatters them and finds them`;
    - `a resumed walk pays and counts nothing twice` (`log.restore([['market-find-sacks', 1]])`);
    - `two players each find it on their own save` (two progressions and logs);
    - `landing in the basket rocks the bicycle and rings its bell; still under reduced motion`;
    - `no log, no progression: nothing is noted and nothing throws`;
    - `the life adds at most 10 meshes, no casters, under 3,500 triangles`, and `update allocates nothing`.
- [ ] **Step 2: Run** `npx vitest run test/marketfinds.test.js test/marketlife.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command, plus `npx vitest run test/market.test.js test/critters.test.js test/labels.test.js test/marketgame.test.js test/flattrace.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** the files, with the message "Market step 3: the six discoveries found where she drinks, naps, listens, perches, scatters pigeons and tips the apples; the bicycle rocks and rings its bell".

### Task 7: She looks up at a stallholder cooing at her

**Files:**
- Create: `src/cat/headaim.js`, `test/headaim.test.js`
- Modify:
  - `src/game/avatar.js` (one call after `animateCat`);
  - `src/remotecats.js` (one call after each `animateCat`);
  - `src/marketlive.js` (`session.lookAt`, `remote.lookAt`, `s.idleTime = 0` while cooed);
  - `src/game/session.js` (`['lookAt', "where her head turns to look (the Market's coo, marketlive.js), or null"]`).
- Test: `test/marketlive.test.js`, `test/remotecats.test.js`

**Precedent:** `animateCat` (`src/cat/animator.js`, which resets `head.rotation` every frame, so a later write is that frame's only); `PRESETS`, `STATES` and `buildFor` (`test/helpers/catfingerprint.js`); `test/catpose.test.js` and `test/catgolden.test.js` (they must stay green untouched).

**Interfaces:**
- `HEAD_AIM = { maxYaw: 0.9, maxUp: 0.55, rate: 5, poses: ['follow', 'requestPet'] }`.
- `aimHead(cat, target, dt, pose) → void`:
  - if `!target` and `!(cat.userData.headAim?.w > 0)`, it returns and writes nothing;
  - otherwise `w` eases toward 1 (a target and an allowed pose) or toward 0, at `rate` per second;
  - the yaw (the target's bearing from the head, relative to `cat.rotation.y`, wrapped and clamped to ±`maxYaw`) and the up-pitch (the target's elevation, clamped to `maxUp`, written as a negative `rotation.x`) are added × `w` to `parts.head.rotation`;
  - `cat.userData.headAim = { w }` is made on the first target only;
  - no allocation.
- `avatar.js`: `aimHead(cat, s.lookAt, dt, drawn)` right after `animateCat(...)`.
- `remotecats.js`: `aimHead(entry.group, entry.lookAt, dt, <its drawn state>)` after each call.
- `marketlive.js`:
  - while a stall's `cooing.who === 'me'`: `session.lookAt` is one reused `{ x, y, z }` at the keeper's head (keeper spot, ground + `headY · 0.92`), and `s.idleTime = 0`; `null` on `endCoo`;
  - for a remote: the same on that entry's `lookAt`.

- [ ] **Step 1: Write the failing tests**
  - `test/headaim.test.js`:
    - `with no target ever set, every cat in every pose is exactly animateCat's`: for each of `PRESETS` and Hagrid, each of `STATES`, at t 0.4, 1.3 and 2.9, the dump of every `Object3D`'s position, quaternion and scale (r4) after `animateCat` then `aimHead(cat, null, 1/60, state)` equals the dump after `animateCat` alone.
    - `a target above and to her left turns her head up and left, never past the limits` (a target 5 m up gives an up-pitch of exactly `maxUp`; one behind her a yaw of exactly ±`maxYaw`).
    - `it eases in over about a fifth of a second, and out the same`.
    - `once it has eased out it writes nothing` (target cleared, 2 s of frames, then the dump equals `animateCat`'s).
    - `walking, stalking, napping, grooming or perched, the target is ignored`.
    - `nothing random and nothing allocated per frame`.
  - `test/marketlive.test.js`:
    - `while she is cooed at she looks up at the stallholder, and stops when the coo ends`;
    - `cooed, she stays standing: no groom or sit` (`idleTime` stays 0 across the coo, for a napper too);
    - `the partner's cat cooed at on this screen looks up too` (`remote.lookAt` set, then null).
  - `test/remotecats.test.js`: `a remote with lookAt looks up; one without poses as before`.
- [ ] **Step 2: Run** `npx vitest run test/headaim.test.js test/marketlive.test.js test/remotecats.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Write a header in `headaim.js`: opt-in, after `animateCat`, why `animator.js` is untouched.
- [ ] **Step 4: Run** the same command, plus `npx vitest run test/catpose.test.js test/catgolden.test.js test/animator.test.js test/avatarwater.test.js test/session.test.js test/hagrid.test.js test/flattrace.test.js test/flattrace.offwords.test.js`. Expected: PASS, the catpose and golden fixtures untouched, and `git diff --exit-code test/fixtures/`.
- [ ] **Step 5: Commit** the files, with the message "Market step 3: cooed at, she looks up at the stallholder (an opt-in head aim after the pose; nothing changes anywhere else), on both screens, and stays standing till the coo ends".

### Task 8: The café front, the flower tubs, the cobbles

**Files:**
- Modify: `src/world/marketparts.js` (atlas 8 × 4, cells 16–17; `createCobbleTexture`), `src/world/market.js` (`drawCafe`, the `tub` branch of `drawClutter`, `drawGround`)
- Test: `test/marketparts.test.js`, `test/market.test.js`, `test/budget.test.js` (the comment's measured numbers only)

**Precedent:** `createMarketAtlas` and `atlasCell` (fixed pixel tables, no canvas); `drawClutter`'s buckets (one merged mesh per material for the whole square); the shared cobble surface in `drawGround` (`COBBLE_TILE`, `COBBLE_TONE`).

**Interfaces:**
- `createMarketAtlas() → { texture, w: 256, h: 128, cells: 32 }`; `atlasCell(i)` keeps cells 0–15's pictures; cell 16 is the chalkboard (a cup, a cake slice and a croissant in chalk on slate); cell 17 is a painted window board.
- `createCobbleTexture() → THREE.DataTexture` (128 × 128, one 0.6 m tile, `RepeatWrapping`): four rows of setts, each row offset half a stone from the last, stone widths ±20% (`hash01`), tones ±8%, dark joints.
- The café front adds at most 1,500 triangles, 2 meshes and no casters. The chalkboard is an A-frame on the cobbles by the café door, solid (r 0.25), out of every lane, with no letters (M12). The tubs add at most 140 triangles each, in the existing clutter meshes.

- [ ] **Step 1: Write the failing tests**
  - `test/marketparts.test.js`:
    - `the atlas is the same twice and paints no canvas` (kept, at the new size);
    - `every old cell keeps its picture` (cells 0–15's pixels equal a fixture of their sums, recorded before the change: write the fixture from the current code first, in the same commit);
    - `the cobble texture: rows offset, stones varied, the same twice, no canvas` (in no two neighbouring rows do the joints line up; the stone tones' spread is over 0.04; a `document.createElement` spy is never called).
  - `test/market.test.js`:
    - `the café has its awning, window boards and a chalkboard of pictures, casting nothing`;
    - `every flower tub has stems and blooms, and the clutter is still two meshes`;
    - `the ground uses the square's own cobbles`;
    - re-pin the counts, inside the aim (180 / 110 / 45,000).
- [ ] **Step 2: Run** `npx vitest run test/marketparts.test.js test/market.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command, plus `npx vitest run test/budget.test.js test/mergeprops.test.js test/contactshadows.test.js test/marketlive.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** the files, with the message "Market step 3: a café front with a scalloped awning, window boards and a chalkboard of pictures; flower tubs full of blooms; cobbles laid in offset rows of uneven stones".

### Task 9: Step 3's pictures, sizes and checks

**Files:**
- Modify: `src/world/marketplan.js` (`MARKET_MOMENT_SHOTS`), `verify-market.html` (`__shot` takes a moment name, as `verify-places.html` does `ROOFS_MOMENT_SHOTS`), `test/market.test.js`

**Precedent:** Rooftops step 5 Task 9 (`ROOFS_MOMENT_SHOTS`, before/after sets, `perf.md`); Market step 2 Task 14 (`verify-market.html?live=1&drive=1`, `MARKET_TOURS`).

**Interfaces:**
- `MARKET_MOMENT_SHOTS`: `{ lookup, cafe, tubs, cobbles, fruit, apples, flowers, petals, awning, fountain, pigeons, sacks, musician, basket, mice }`, each `{ view: 'px,py,pz,lx,ly,lz', t }`. The page builds the life with a stand-in cat at that moment's spot (cooed at for `lookup`, with a real `buildCat` and `aimHead`; the crate tipped for `apples`; the bucket knocked for `petals`) and runs it to `t`.

- [ ] **Step 1: Write the failing test** `has its moment views, each six numbers and a walk second, inside the square`. Run: FAIL. Implement. Run: PASS.
- [ ] **Step 2: Pictures** (port 5407, muted): every `MARKET_MOMENT_SHOTS` view at 1280 × 720, and `lookup`, `cafe`, `fruit` and `flowers` at 390 × 844; day and `?dusk=1`. Re-shoot step 1's `spawn`, `card` and `overview` for before/after. Look at every picture yourself. Fix anything that floats, clips, hides the bubble or reads as text.
- [ ] **Step 3: The real game, muted.** Seed a Clan Edition save with `muted: true` and open `http://localhost:5407/?market=1` headless. Picture `album-market.png` (six silhouettes, `🥇 Golden mice: 0/42`) and `console.txt` (no errors over a 60 s walk).
- [ ] **Step 4: Worst spots and sizes.** Record `__info()` calls and triangles for every shot beside step 2's table. If a shot's draws are more than 5 above step 2's, find out why before going on. Run `npm run build`: start-up ≤ 693.5 kB (V20) and the Market chunk under 100 kB. Record both in `perf.md` in the pictures folder.
- [ ] **Step 5:** `npx vitest run test/flattrace.test.js test/flattrace.offwords.test.js test/budget.test.js test/market.test.js test/marketlife.test.js test/marketlive.test.js test/areaimport.test.js test/lazybuild.test.js`. Expected: PASS; `git diff --stat test/fixtures/flat-trace.gameplay.json` empty.
- [ ] **Step 6: Commit** `src/world/marketplan.js verify-market.html test/market.test.js`, with the message "Market step 3: picture views for the look-up, the café, the tubs, the cobbles, the fruit and flower stalls and the six discoveries".
- [ ] **Step 7: The report for the owner** (step 3 ends here): the pictures' paths, `perf.md`, the sizes, and owner questions 4–7.

## Step 4: into the game

### Task 10: The Market's first-visit hint

**Files:**
- Modify: `src/hints.js` (a row second in `HINTS`, the seam comment), `src/tutorialwords.js`, `src/game/tips.js` (`HINT_PICS`)
- Test: `test/hints.test.js`, the series-words fixtures

**Precedent:** Rooftops step 4 Task 2.

**Interfaces:** V14.

- [ ] **Step 1: Write the failing tests** (`test/hints.test.js`):
  - `the Market's hint goes up on a Market walk, once ever` (`{ place: 'market', walkNo: 5, t: 0 }` shows it; with `count('market')` 1 never again; `{ place: 'park' }` never);
  - `it wins over any other hint due then`;
  - `HINT_IDS.slice(0, 2)` is `['roofs', 'market']`, and `hintMax('market')` is 1.
- [ ] **Step 2: Run** `npx vitest run test/hints.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** The seam comment says both place hints lead the table and why.
- [ ] **Step 4: Run** the same command, plus `npx vitest run test/tips.test.js test/tutorialwords.test.js test/progression.tutorial.test.js`. Snapshots: only `hint.market` lines. Then `npx vitest run test/serieswords.tutorial.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Market step 4: a first-visit hint, 'Wait till they turn around…'".

### Task 11: The Market opens

**Files:**
- Modify:
  - `src/progression.js` (`CATALOG.areas.market`, after `roofs`; the `walks` comment);
  - `src/world/marketplan.js` (`MARKET_REGISTRATION.catalog`);
  - `src/marketflag.js` (V17: header, `marketResumable` keeps every id);
  - `src/worldmap.js` (`TOWN_PLACES`, `TOWN_LAND`, `GATEWAYS` road, header);
  - `src/ui/territorymap.js` (an icon, `'🧺'`, where it gives the Rooftops `'🕊️'`);
  - `src/world/areas.js` (header comment only).
- Test: `test/marketgame.test.js` (turned), `test/marketplan.test.js`, `test/worldmap.test.js`, `test/dressingroom.test.js`, `test/nextthing.test.js`, `test/unlockorder.test.js`, `test/roofs.test.js` (catalog order), the series-words fixtures

**Precedent:** Rooftops step 4 Task 3, test for test: its turned R1 tests, `withRoofs`, the map's town place, Legacy's list.

**Interfaces:** V15, V16, V17, V19.
- `CATALOG.areas.market = { name: 'The Market Square', price: 150, requires: { area: 'neighborhood', walks: 2 }, edition: 'canon' }`, deep-equal to `MARKET_REGISTRATION.catalog`.

- [ ] **Step 1: Turn the step-1 tests round, failing:**
  - `test/marketgame.test.js`:
    - `nothing offers the Market` becomes `the catalog has the Market, after the Rooftops, in Clan Edition only`;
    - `is dropped without the flag` becomes `a Market walk note resumes, with the flag or without`;
    - `never in a room` stays for the flag, and a new `a room walks the Market like any place` (the members, a proposal naming the Market starts the walk on both; a guest who does not own it walks it by `'override'`; a Legacy guest by override, never set);
    - Review Focus 4, `a save that walked the Market with the switch keeps nothing it did not buy`;
    - `the real catalog offers it as the world map orders it`: `placeState` with 1 town walk is locked with `opensAfterLine`'s line; with 2 walks and 150 points `canOpen`; with 2 walks and 100 points `short`;
    - `two devices in one room see the same stallholders turn` (two `lifecycle` walks with one `roomSeed`: at one clock every stall's phase is equal; 90 s timeout).
  - `test/marketplan.test.js`: `nothing offers it yet` becomes `its catalog row is the registration's`.
  - `test/worldmap.test.js`:
    - `the Market is on the map on the town's rim, open to unlock` (`TOWN_PLACES` has both rows; region `kind: 'town'`, name 'The Market Square' in both sets, locked for a fresh save, `status: 'built'`; it straddles the town's rim; it clears the Rooftops', the Docks' and the Park's circles and every other road by 8);
    - an owned save's card has `action: 'go'`;
    - the `town-market` road runs from the town's edge to the Market's.
  - `test/dressingroom.test.js`: Clan Edition lists the Market; Legacy's list is unchanged.
  - `test/nextthing.test.js`: `at 1 town walk the home line still names the Woods alone`.
- [ ] **Step 2: Run** `npx vitest run test/marketgame.test.js test/marketplan.test.js test/worldmap.test.js test/dressingroom.test.js test/nextthing.test.js`. Expected: FAIL on exactly the turned and new tests.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the Step 2 files plus `npx vitest run test/placecard.test.js test/homebase.map.test.js test/homebase.edition.test.js test/territories.test.js test/unlockorder.test.js test/gifts.test.js test/rooms.test.js test/lobby.test.js test/walkresume.test.js test/walkready.test.js test/progression.test.js test/edition.test.js test/spendconfirm.test.js test/goldedition.test.js test/foundwear.test.js test/foundjournal.test.js test/roofs.test.js test/roofsgame.test.js test/areas.test.js test/flattrace.test.js`. Expected: PASS.
- [ ] **Step 5: Snapshots.** Refresh. The added lines name the Market (its card, its map label, its Get it?, its lock lines) and nothing else moves. Then `npx vitest run test/serieswords test/offwords.test.js test/clanwords.test.js test/wordset.test.js`. Expected: PASS.
- [ ] **Step 6: Commit** with the message "Market step 4: the Market Square opens in Clan Edition, 150 🐾 after 2 town walks; a place on the town's rim on the world map; rooms walk it; ?market=1 stays as a developer shortcut".

### Task 12: The gateway pair, and a room through it together

**Files:**
- Modify: `src/gateways.js` (`GATEWAY_ENDS.neighborhood` and `.market`, the header's reserve sentence)
- Test: `test/gateways.test.js`, `test/gatewayspots.test.js`, `test/gatecross.test.js`, `test/walkon.test.js`, `test/budget.test.js` ("with the gateways"), `test/marketcowalk.test.js` (create)

**Precedent:** Rooftops step 4 Task 5 (the rows, the road, the gate states, the walk-on) and Task 6 (`decideWalkOnHave`, `pickOnCrossing`); the alley door's own placement test in `test/gatewayspots.test.js`.

**Interfaces:**
- `neighborhood`: `end({ id: 'town-market', gateway: 'town-market', x: 30, z: 52, faces: 'south', to: 'market', twin: 'market-town', look: 'signpost', sign: true })`.
- `market`: `end({ id: 'market-town', gateway: 'town-market', x: 0, z: 23.6, faces: 'south', to: 'neighborhood', twin: 'town-market', look: 'signpost', placement: 'inside', arrive: { x: 0, z: 19.9, yaw: 0 } })`.

- [ ] **Step 1: Write the failing tests**
  - `test/gateways.test.js`:
    - the rows are in the table;
    - `arrivalFor('town-market')` is `{ areaId: 'market', x: 0, z: 19.9, yaw: 0 }`;
    - `arrivalFor('market-town')` is 3.6 m inside (30, 52), facing north.
  - `test/gatewayspots.test.js`:
    - the end count becomes fourteen: twelve on an edge, two inside, in eight areas;
    - G1 and G5 hold for the town's new signpost;
    - Review Focus 5, `the square's gate stands in the south row's gap`: x within 0.01 of `GATEWAY_GAP.x`; both posts (`GATE_HALF + GATE_POST_R`) inside `GATEWAY_GAP.w / 2`; z within 0.3 of `GATEWAY_GAP.z`; a walkable spot within `GATE_REACH`; posts 1.2 m from every collider; 3 m from the spawn and every POI, collectible, scenic, perch, golden mouse and find spot;
    - the arrival rule covers both new arrivals.
  - `test/gatecross.test.js`:
    - `gateMomentHtml({ name: 'The Market Square' })` holds "Off to the Market Square!" (as `gate.moment` words it);
    - the town gate is `shut` with 1 town walk, `buy` with 2 and 150 🐾, `short` with 2 and 100 🐾, and `go` owned;
    - the square's gate is always `go`.
  - `test/walkon.test.js` (90 s timeouts):
    - a town walk walks on through `town-market` and the Market walk starts at (0, 19.9) facing north;
    - back through `market-town` the town walk starts 3.6 m inside (30, 52);
    - `a Legacy town has no Market gate` (no prompt at (30, 51)).
  - `test/marketcowalk.test.js`:
    - `a room walks on into the Market only when every device has it`;
    - `a guest who does not own the Market walks it as an override, and a crossing never buys it`;
    - `in a room each child's treats are her own, and only carry-pick crosses the wire` (two `marketRig`s with one seed: A's grab leaves B's treat out; B shows A munching from A's `carry-pick`);
    - `a tip and a knock on one device tip and knock on the other, and the apples and petals land alike`;
    - `a room's find is the same spot on both devices` (`planFind` with the room seed and `roomFindRoster`).
  - `test/budget.test.js`: the "with the gateways" block covers the Market's gate and the Neighborhood's four signposts inside the same ceilings, built and merged.
- [ ] **Step 2: Run** `npx vitest run test/gateways.test.js test/gatewayspots.test.js test/gatecross.test.js test/walkon.test.js test/marketcowalk.test.js test/budget.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the two rows. If a clearance rule fails at (30, 52), move x within 20..45 and say so in the commit. The road is Task 11's.
- [ ] **Step 4: Run** the Step 2 files plus `npx vitest run test/worldmap.test.js test/crossing.test.js test/crossinglock.test.js test/gatewaylook.test.js test/roofscowalk.test.js test/flattrace.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** with the message "Market step 4: a signposted gate at the town's south-east and its twin in the gap behind the Market's spawn; walk through either and go straight on, together in a room".

### Task 13: The Market's four found outfits

**Files:**
- Modify:
  - `src/foundwear/head.js`, `src/foundwear/neck.js`, `src/foundwear/body.js` (four records);
  - `src/clanphrases.js` (four `wear.<id>.name` rows);
  - `src/cat/hats.js` (`tradercap`: `paperboycap`'s shape with its colours as parameters, a flat cap in a brown-and-green check);
  - `src/cat/foundhead.js` (Hagrid's cap);
  - `src/cat/foundneck.js` (`stringbagscarf` in `FOUND_NECKS`, the neckerchief's shape in a string-bag weave; `applecharm` in `FOUND_COLLARS`, the anchor charm's hang with a small red apple and leaf; Hagrid's for both);
  - `src/cat/backitems.js` (`flowerbasket`: the hay-bale pack's shape as a little wicker basket of blooms);
  - `test/fixtures/accessory-mesh-delta.json` (four entries, in `CATALOG.accessories`' order);
  - `test/hagrid.test.js` (`DELTA`).
- Test: `test/foundwear.test.js`, `test/foundwearfit.test.js`, `test/foundlive.test.js`, `test/catpose.test.js`, `test/hagrid.test.js`, the later-phrases fixture

**Precedent:** `src/foundwear/index.js` "ADDING ONE", steps 1–5; found-outfits step 2 Tasks 2, 5, 6 and 8 (`docs/superpowers/plans/2026-11-19-found-outfits-step2-outfits.md`).

**Interfaces:** V13. The records:
- `{ id: 'tradercap', slot: 'head', find: 'market', emoji: '🧢' }`;
- `{ id: 'stringbagscarf', slot: 'neck', find: 'market', emoji: '🛍️' }`;
- `{ id: 'applecharm', slot: 'collar', find: 'market', emoji: '🍎' }`;
- `{ id: 'flowerbasket', slot: 'back', find: 'market', emoji: '🧺' }`.

The names are 'Market Trader's Cap', 'Shopping-Bag Scarf', 'Apple Charm' and 'Flower Basket', the same in both sets (owner question 1).

- [ ] **Step 1: Write the failing test** `the Market hides four outfits, one per slot group it uses` (`foundWearIn('market').map((r) => r.id)` is the four ids; `validateFoundWear` over all records is `[]`). Every `it.each` in `foundwearfit` and `foundlive` then covers the four with no edit.
- [ ] **Step 2: Run** `npx vitest run test/foundwear.test.js test/foundwearfit.test.js test/foundlive.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement**, reusing each shipped builder's shape (no new builder). Each piece casts as its siblings do, under 600 triangles on the ground.
- [ ] **Step 4: Run** the Step 2 files plus `npx vitest run test/catpose.test.js test/catgolden.test.js test/hagrid.test.js test/dressingroom.test.js test/foundjournal.test.js test/foundplay.test.js test/offwords.test.js`. Snapshots: only the four `wear.*` rows. Expected: PASS, `catgolden.json` and `catpose-baseline.json` untouched.
- [ ] **Step 5: Picture sheets** (port 5407): the four on the tabby, Robbie, D2, Digit and Hagrid (where he wears it), front and side, plus each one's ground look. Look at every sheet yourself.
- [ ] **Step 6: Commit** with the message "Market step 4: four found outfits hidden in the square (placeholder names: Market Trader's Cap, Shopping-Bag Scarf, Apple Charm, Flower Basket), drawn from the shipped shapes in market colours".

### Task 14: Step 4's pictures, builds and checks

**Files:** `public/places/market.jpg` (re-made after Task 8's look), and nothing else in the repo unless a picture shows a fault (the fix then goes back to its task's files, with a test where one can pin it).

**Precedent:** Rooftops step 4 Task 7.

- [ ] **Step 1: Builds.** `npm run build`: start-up ≤ 696.0 kB (V20), the `market` chunk under 100 kB, each place under its ceiling. Then `npm run build:ios`. Record start-up, `market` and `neighborhood` sizes in `perf.md`.
- [ ] **Step 2: The card picture.** Re-shoot `verify-places.html?area=market` as `public/places/market.jpg` (JPEG, about 30 KB). Look at it.
- [ ] **Step 3: Pictures** on port 5407 (`--strictPort`, muted save, `--mute-audio`), phone size (375 × 812) unless said, in `…/market/step4/`:
  - `map-locked.png` (1 town walk);
  - `map-open.png` (owned);
  - `map-card-offer.png` and `getit-offer.png` (2 town walks, 200 🐾);
  - `gate-town-shut.png`, `gate-town-buy.png` and `gate-town-open.png`;
  - `gate-market.png` (the gap behind the spawn, from the square);
  - `moment-off-to-market.png`;
  - `arrived-market.png`;
  - `hint-market.png`;
  - `lookup-ingame.png` (cooed at in the real game);
  - `outfit-found.png` (a find shown, with the Market's outfit);
  - `everyday-words.png` (the map and the gate in the everyday set);
  - `dressingroom-legacy.png` (no Market card).
  Look at every picture.
- [ ] **Step 4:** `npx vitest run test/flattrace.test.js test/flattrace.offwords.test.js test/budget.test.js test/marketgame.test.js test/marketcowalk.test.js test/walkon.test.js`. Expected: PASS; flat trace unchanged.
- [ ] **Step 5: Commit** `public/places/market.jpg`, with the message "Market step 4: a fresh place card picture of the square".
- [ ] **Step 6: The report** for the controller and the owner: the pictures' paths, `perf.md`, the sizes, owner questions 1–3 and 7, and the note that the full suite waits for the owner's word (one run, load check first) before anything is offered for merge.

---

## Self-review (done while writing)

- **Spec coverage:**
  - "Also here, like every place": golden mice (Task 3); discoveries, the spec's five plus one (Tasks 4–6); four found outfits (spots in Task 3, records in Task 13); the yarn ball (`YARN_SPOTS.market` is on the branch since step 2's fix wave, and Task 3's spot rules hold it); climbing onto crates and awnings, where nobody notices her (Task 3).
  - "Look and feel": the sounds (Task 5); the café, tubs and cobbles (Task 8). Dusk packing up and lanterns are step 1's.
  - "Fit with the game":
    - the world map (Task 11);
    - the unlock (Task 11, V15);
    - the gateway, with map step 3 on main (Task 12);
    - Clan Edition with both word sets (V16, Tasks 4 and 11);
    - co-walk (V22, Tasks 11–12);
    - the guided tour hint (Task 10).
  - "Build order" 3 and 4: every item, plus the owner's 2026-11-21 answers: the fruit and flower stalls (Tasks 1–2), the lamp posts (Task 1), the gap gateway (Task 12), the look-up (Task 7), the figure seam (Task 5), the coordinator's calls (Task 8), the start-up rule (V20).
  - Anti-goals:
    - the musician never moves (V7);
    - the basket bike never moves (V8);
    - the look-up is gentle and opt-in (V10);
    - nothing crowds the square (the life's budget, Task 6).
- **What main lacked:** nothing this plan needs. Found outfits (`src/foundwear/`) and tour hints (`src/hints.js`'s place-hint seam) are both on main, so both are in, not left out.
- **Type consistency:**
  - `MARKET_PERCHES`, `MUSICIAN`, `PIGEON_PATCH`, `FLOUR_SACKS` and `hideSide` (Tasks 1, 3, 5) are read by Tasks 6, 9 and 12.
  - `createMarketLife` (Task 2) is extended in Tasks 5 and 6.
  - `MARKET_FIND_IDS`, `noteMarketFind` and `marketFindKey` (Task 4) are used in Task 6.
  - `marketFigure` (Task 5) is used by `createMarketLive` and `createMusician`.
  - `aimHead` and `session.lookAt` (Task 7) are used by `avatar.js`, `remotecats.js` and `marketlive.js`.
  - `CATALOG.areas.market` (Task 11) is needed by Tasks 12 and 13 (`liveEndsFor`, `validateFoundWear`).
- **Proportion:** the blocks are values, signatures and test names. The shapes, colours and exact positions are the builder's, under named tests.
