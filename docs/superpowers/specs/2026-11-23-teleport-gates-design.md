# Teleport gates: design

Status: design for owner approval (2026-11-23). Plan: `docs/superpowers/plans/2026-11-23-teleport-gates.md`.
Design only: nothing here is built. Numbers marked "start" are starting values the builder tunes from pictures.
Concept pictures: `verify-teleport-gates.html` (`?c=1|2|3`), pictures in the session scratchpad.

## Summary for a parent (half a page)

A **teleport gate** is a glowing, storybook doorway standing in a place the cat already knows. She walks up, a button says "Go through", a one-second swirl of light, and she arrives in a far-off place with a gate waiting to bring her home. It is how she will get to **the Moon** (and a spacesuit puts itself on her for the trip) and to **the Reef under the sea** (a diving suit), and later to other places that are not a clan's land.

- **What it looks like.** Three ideas, all gentle: a ring of old standing stones around a shimmering disc (A), a little glowing stone arch in a hedge (B), a hollow tree or sea-cave mouth glowing blue (C). Your note said doors live in natural things, so I recommend **A for the Moon** (it is the Meeting Ring on the Pines island, stones are already there) and **C for the Ocean** (a glowing cleft at the foot of the Seaside pier). B is kept for later street places.
- **Where.** No separate "gate garden": each gate stands in the place that already fits its story. Two gate pairs now (Moon, Reef), room for about four more later.
- **How it feels.** The gate hums softly when she is near, wakes the first time she touches it (a chime and a journal page, worth the usual 12 paws once), and from then on works any time. The swirl lasts about 1.2 seconds (a gentle fade if she has "reduce motion" on). The suit puts itself on during the swirl and is simply not drawn when she is home again: her own clothes were never touched. Going through is free. Every destination has a gate home, and the pause menu's home button still works, so nobody is ever stranded.
- **Friends.** Online: the host walks through and everyone in the room comes along together (a guest who lacks the place borrows a suit and the place for that walk). Two cats on one couch: gates stay closed (a kind "not yet for two cats") until a destination is made ready for two, then both go together.
- **Size.** Nothing new at start-up beyond about 0.8 kB; the swirl, the stones, the suit and each place download only when she walks near a gate.
- **Build.** Six small steps, the first a one-gate spike behind a switch, so you can see the swirl before anything else is drawn. Seven decisions for you are in section 9, each with my recommended answer.

## 1. Facts this design stands on

- **Gateways already exist and already walk a cat through.** `src/gateways.js`: `GATEWAY_ENDS` rows (`id, gateway, x, z, faces, to, twin, look, placement 'edge'|'inside', arrive, lane, wings, sign`), `GATE_REACH` 1.6 m, `GATE_PREFETCH_REACH` 12 m, `liveEndsFor` (a row is live once its place has a catalog row), `arrivalFor`. `src/gatecross.js`: `gateStatus` (kind go / buy / short / shut), `gatePrompt` (guests get `gate-info`), `gateCardHtml`, `gateMomentHtml`, `walkOnMove`, and the room protocol (`walk-on-ask`, `walk-on-have`, `walk-on`, `decideWalkOn*`, `roomWalksOn`). `src/game/walk.js` `walkOn({via, ledBy, guest})` banks the walk quietly, shows "Off to X!" for `GATE_MOMENT_MS` 1200 ms while `areas.ensure(to)` loads, then `startWalk({arrive, roomSeed})`; a failed load returns her to her walk with one line. Doors with `placement: 'inside'`, an explicit `arrive` and `look: 'none'` are precedent (Old House door, Rooftops fire escape, Market signpost).
- **The map.** `src/worldmap.js` `GATEWAYS` are cubic roads between neighbouring circles; `worldMapModel`, tap targets and the "Change place" card already exist. Nothing draws a road between two non-neighbours.
- **Places and unlocks.** A place is a lazy chunk (`AREA_LOADERS`, `AREA_ENTRY_MODULES`, 100 kB gz ceiling) plus a `CATALOG.areas` row (`price`, `requires: {area, walks}`) and a `state.walks[place]` key (additive, `SAVE_VERSION` stays 4). A price-0 place is taken free by a walk-on (`walkOnMove` 'take'). Lighthouse and Greenhouse are flag-gated precedents (`lighthouseflag.js`, `greenhouseflag.js`: a `?x=1` switch read at call time, never at import).
- **Suit seams (unmerged).** `suit-kit-m0` holds `src/suithook.js` (`effectiveWear(equipped, place, look)`, a hook slot `registerSuitKit`, nothing saved) and the lazy `src/cat/suitkit.js`. The suit is drawn from the place, never worn: leaving a suit place needs no undo. Design `suit-dive-moon-design` (63d68c8a) defers to its M2 the door kind, the map mark, place physics, phrase ids and the reef / moon catalog rows. This design supplies the door machinery; that design supplies the two destinations and the suit.
- **Couch co-op** (`src/coop/`): `COOP_READY` per place, only `neighborhood` true; an online net session and couch play exclude each other; `test/coopseam.test.js` fails if a catalog place has no row.
- **Editions and word sets.** Gates are drawn only in Clan Edition today (walk.js `gateEnds = ... isClanEdition`). Words: `phrase()` with the Clan table as default and the everyday set overriding ids in its `PHRASES`; new ids go in the "later" table and the off-snapshot fixture is re-recorded (`UPDATE_OFF_SNAPSHOT=1`).
- **Start-up budget:** 708.9 of 720 kB gz, never raised (about 11 kB left, TV mode wants a share). Per-place ceilings: 100 kB gz, meshes / casters / triangles in `test/budget.test.js`.
- **Memory (owner, 2026-11-21):** doors are FOUND, not bought, and live in natural features (hollow tree, sett, rock cleft, hollow log, gap under roots).
- **Not found in the tree:** the memory note calls the Moon / Ocean places "the suit/dive/moon design"; neither place exists yet. The Moon and Reef builds are other work. M3 and M4 here are only their hand-offs.

## 2. What a gate IS

A gate is **a gateway end pair whose two places are not neighbours**, drawn by a place-specific natural-looking feature, found by the child, and reached by pressing one button next to it. In data it is one more row kind in the same table (section 6), so it inherits prompts, the room protocol, prefetch, arrival, banking and failure handling for free; what is new is the look, the "wake" beat, the swirl, the suit, the map mark and a few phrases.

### 2.1 Three looks (pictures in `verify-teleport-gates.html`)

| | Look | Feels like | Cost (start, in the host place) | Fits |
|---|---|---|---|---|
| A | **Stone ring** `stonering`: 5 leaning stones and a lintel around a soft disc: one additive quad with a scrolled swirl texture, 4 faint motes | a fairy ring at dusk; the stones are old and mossy | 6 meshes, 480 triangles, 1 transparent draw | the Meeting Ring on the Pines island, the Moor |
| B | **Hedge arch** `archway`: little stone arch, ivy, a lantern, warm light | a garden door; cosy, but it is a made thing | 5 meshes, 360 triangles | town / street places later |
| C | **Hollow** `hollow`: a great trunk (or a rock cleft) with a glowing hole, fireflies / sparkle bubbles | nearest to "doors live in natural things" | 5 meshes, 420 triangles, 1 transparent draw | trees in the Woods, a cleft by the pier; later: a sett, a hollow log |

Every look: no scary imagery, no eyes, no dark void; the disc is always light and warm; its sound is a soft hum that rises as she nears (and a "ting" on wake). Colour is also carried by shape (stones tilt, hollow arches) so it does not rely on colour alone. Reduced motion: the disc does not scroll, the motes stand still, the hum stays.

### 2.2 Where the gates stand (recommendation)

| Gate | Host place | Spot | Destination | Look |
|---|---|---|---|---|
| Moon | Pines island | the Meeting Ring (hand-placed, clear of the Old Ash and the Watch Rock) | The Moon | A, stones |
| Ocean | Seaside | the foot of the pier, a rock cleft with a ladder and ring buoy, as the dive design draws the door | The Reef | C, sea-cave glow, blue |
| (return) | each destination | beside its spawn: a mirror of the host look, in that place's own style (moon rock ring; coral arch in the Reef) | back to the host spot | same look |

**One hub or many?** I recommend **many, each in the place whose story it belongs to**, no gate garden. Reasons: the Moon is "reached from the island's moonlit ring" and the Reef from the pier, which a hub would cut in half; a hub is one more place to build and keep inside the budget; a child who finds a gate in the wild gets the find beat the owner described. The costs: two hosts must be edited (Pines and Seaside, both already near their budgets: see section 7.4) and each gate is hand-placed. A later optional **gate garden** (a small hub inside an existing late place) can list every discovered gate on one board if there are more than about six; I do not recommend building it now.

Now / later: **now** two pairs (Moon, Reef). **Later** (not designed here): other non-clan places the owner names (a Fairground rocket? a Farm silo? not decided), at most one pair per new place, with a cap test (section 8).

Legacy Edition: the two destinations are in both editions (suit design 3.1), so the gate ends stand in both editions (the gate rows set `edition: 'all'`; existing gates stay Clan-only). This needs one small change to the walk's `gateEnds` filter; the spike checks it.

## 3. Gameplay

### 3.1 Find, wake, go through

1. **Find.** The gate is always drawn, but dormant until she has walked its host place `walks[host] >= 2` times (the unlock rules of the suit design). Dormant: stones grey, no disc, no hum. Awake-able: after two walks the disc glows faintly and, within `TWINKLE_RANGE` 20 m, twinkles and chimes at `CHIME_RANGE` 6 m (the found-outfit machinery, reused through one tiny function). This is the discovery beat: it is a "something is over there" sparkle she can follow, not a map marker.
2. **Wake.** The first touch within `GATE_REACH` plays a 1.5 s moment (stones brighten one by one, a rising chime, the disc fills; reduced motion: it simply appears with one chime) and writes a journal entry. It is a golden-mouse-class beat: the same chime and toast style, a "Gate found!" line, and the destination's first discovery page (paid once, 12 paws, the existing mechanism) is credited to her here, not on arrival.
3. **Prompt.** Near an awake gate the walk shows the usual gate prompt (`gatePrompt`, `kind: 'gate'`): touch gets a big **Go through** button (>= 44 px) next to the pounce button; keyboard E; pad X (the interact action), exactly as gates today. The card (`gateCardHtml` variant) asks "Go through to the Moon?" with **Go through** and **Not now** (`btn-cross-yes` / `btn-cross-no`, pad tags `⟦confirm⟧` / `⟦back⟧`). In TV mode the text uses `padText()` glyph tokens at couch size.
4. **Swirl.** One full-screen overlay, 1.2 s start (up to 1.5 s if the load is slow, with the swirl keeping going and a line "Nearly there!"): a conic-gradient swirl turning and closing to the disc colour, then opening on the arrival. Pure CSS from a lazy style string; it is the same overlay `walkOn` already shows as "Off to X!" with a different body. Reduced motion: a 0.4 s cross-fade to the disc colour and the same text.
5. **Arrive.** She appears at the destination's gate `arrive` spot facing in, the swirl opens, the suit is already on (below), and one toast line names the place and says how to go home ("Take the stones home when you're ready").
6. **Back.** The destination's gate is the same machinery in reverse: awake from the first arrival (it is her way home), never locked. She arrives at the host spot, her own clothes drawn again.

Also through the map: once a destination is hers (`walks[dest] >= 1`) the map's "Change place" card for that place starts a walk **at the destination's gate** (the swirl is replaced by the normal start; the suit is on). Going home from there is the gate, or the pause menu. A gate that is not yet found has no map route; the map card says "Find the gate on the Pines island" in a hint line (section 3.5).

### 3.2 Suit handling

The suit is draw-time only (suit design 4.2): `effectiveWear(equipped, place, look)` returns what she is drawn with when the place has a look, and `walk.js` / `avatar.js` already will call it after suit M0 merges. Therefore:

- **Auto put on**: arriving in a suit place draws the suit; the swirl hides the change. One toast: "Your suit is on!" (everyday set: the same; Clan set: nothing series-specific).
- **Auto restore**: leaving the place draws her saved wear again; there is nothing to restore and nothing that can be lost. A test pins that her saved wear is byte-identical before and after a round trip.
- **No suit yet**: the first visit **is** the grant. The gate wake plays the 1.2 s montage from the suit design (the pieces pop on one by one) once, as the swirl closes, and nothing is saved (first visit is `walks[dest] === 0`). If she skips the wake and goes through, the montage plays on the first arrival. There is no locker to find and nothing to buy. Hagrid takes the helmet only (suit design 4.2).
- **A partner in a room**: each device draws every cat suited from the place it sees; nothing extra is sent.

### 3.3 Co-walk online

**Recommendation: the host chooses, everyone goes.** A guest sees "This way to the Moon" (existing `gate.thisWay` / `gate-info`) and the host's Go through starts the existing ask/have/walk-on exchange: every device must say it has the place (here, "has the chunk and the suit kit"); the room stays together through the swirl (a `walkOn` with `keepRoom`), and the next room seed is derived as for any gate (`nextRoomSeed`). A guest whose build lacks the gate (older build) answers no and the host's yes is refused with the usual line (existing `walk-on-have ok:false`), so the room never splits. A guest who has not unlocked the destination uses the guest rule (a free place, `walkOnMove` 'override'), and is lent a suit; her `walks[dest]` is not counted unless she is on her own save's rule (she is not: a room walk counts for her own save as any room walk does; for a gate, this means being carried counts, which wakes her own gate). I think that is a nice surprise, and Q5 offers the alternative.
The gate itself being refused in a room is the fallback only if any member cannot take the place: the host gets "Your friend isn't ready for the Moon yet" and stays.

### 3.4 Couch co-op (two cats on one device)

`COOP_READY` only has the neighbourhood true, so a gate is **closed to couch play** until the destination place has `COOP_READY[dest] === true` and the host place is ready too. The prompt then says "The gate is waiting. Two cats go together when we're ready!" (kind, no error). When both are ready, one Go through moves both cats: the session (not the cat) crosses, and the coop chunk's two cats are placed side by side on arrival at the destination's `arrive` spot plus 1.2 m. Couch play is therefore not a blocker for M0-M4; its readiness rows flip with each place's coop milestone.

### 3.5 Map

- A small **gate mark** (a gold dot-ring; the Moon's is a crescent, the Reef's a shell) on the host place's circle where its gate stands, shown awake or dim; the pair is joined by a dotted curve (no road) drawn from `TELE_LINKS`; tap the destination for its card. The card reads: name, a one-line picture, **Go there** (when hers) or "Find the gate in <host>" (when not found), never "Get it?" (price 0).
- A destination needs no map circle until it is hers; it appears as a small pennant off the coast (Reef) and off the top margin (Moon), placed by the builder from a map picture, hit target >= 44 px on touch; drawn lazily in `mapkit` code (no start-up cost beyond the two coordinate rows).
- Pad: the map's existing focus order covers the new targets.

### 3.6 Economy, journal, discoveries, golden mice

- **Paws:** going through is free; finding the gate pays the destination's first discovery page once (12 paws); nothing is bought, no paws are charged, ever. No pricing for suits.
- **Journal:** one new line when she wakes the gate: "The Moon Gate: found on the Pines island" (journal.js, existing line style; both word sets). Visits and "places seen" use `walks[dest]` as any place.
- **Discoveries:** the first of each destination's six pages is "arrive through the gate"; no new page count.
- **Golden mice:** the 3 mice per destination are the destination's own (suit design: 48 total). The gate adds one **hint**: the first golden mouse of each destination sits a short stroll from its gate, in sight of the arrival spot, so the first trip ends in a find. Her golden mouse counter is unchanged by the gate itself (no fourth mouse), pinned by the existing total test.
- **Found outfits:** each destination's found outfit (`pearlcollar`, `moonglasses`) is unchanged.

### 3.7 Cases that must not strand a cat

- Load fails (offline, chunk missing): the existing `walkOn` 'failed' path returns her to her walk with one line; the swirl overlay is removed.
- App closed or crash on the far side: next launch starts a normal walk in her saved `state.area` (the destination, if she took it; it is hers and has its gate home).
- Reload while the swirl is up: the banked walk is already saved; the next start is a normal start (as for any gate).
- Guided first walk: gates are not drawn or awake (the suit design rule).
- Strays, critters, ghosts never use gates (existing `gateway` rule).

## 4. Technical design

### 4.1 Gateway data format

Additive to the existing rows (`src/gateways.js`); everything unchanged for current rows.

```
end({ id: 'pines-moon', gateway: 'pines-moon', x: .., z: .., faces: 'north', to: 'moon', twin: 'moon-pines',
      look: 'stonering', placement: 'inside', arrive: { x, z, yaw }, kind: 'tele', suit: 'space', wake: true,
      edition: 'all', needWalks: 2 })
```

New fields: `kind: 'edge' | 'tele'` (default 'edge', so every old row is unchanged), `suit: null | 'space' | 'dive'` (the look the destination draws; replaces `LOOK_OF_PLACE`), `wake: boolean` (first touch is a wake beat), `edition: 'clan' | 'all'` (default 'clan'), `needWalks: number` (host walks required; the destination's own `requires` row holds the same number, a test checks they agree). `GATE_LOOKS` gains `'stonering' | 'archway' | 'hollow'`. `GATEWAY_ENDS` stays one frozen table; a new helper `teleEnds(areaId)` filters `kind === 'tele'`. Validation in `gatewayEnd`: a tele row needs `placement: 'inside'`, an explicit `arrive`, a `twin` row that exists and points back, and `to !== neighbour in GATEWAYS` (not a map road). Tests walk the table.

### 4.2 Plan / area registry

A destination is an ordinary area-registry place (`AREA_LOADERS`, `AREA_ENTRY_MODULES`, a `CATALOG.areas` row `price: 0, requires: {area: host, walks: N}`, a `COOP_READY` row, `walks` key, per-place budget row, `placephysics` row). Its **home gate** is a `GATEWAY_ENDS[dest]` row. A gate with a missing destination row is dormant (`liveEndsFor` already requires it), so the table can run ahead of the places and M0-M2 ship with no destination built. A new file `src/teleport.js` (start-up, pure, under 0.6 kB gz) holds `isTele(end)`, `teleStatus(end, state, catalog)` (dormant / awake-able / wake / go / info-for-guest) and `teleHandoff` (below). `TELE_LINKS` for the map is derived from the same rows (no second table).

### 4.3 Loader and preload ("warm while she stands there")

- Existing: `GATE_PREFETCH_REACH` 12 m starts `areas.ensure(to)` once per gate per walk.
- New: the same trigger also warms the **suit kit** (`import('./cat/suitkit.js')`, the kit is lazy) and the **swirl chunk** (the CSS string and the optional sound), through one `warm(end)` in `src/teleport.js` that does three dynamic imports in parallel, each once, errors swallowed (the `walkOn` path reports the real failure).
- Standing at the prompt (card open) calls `warm` again (idempotent); by the time she taps, the load is usually done, so the 1.2 s swirl is pure show. If not, the overlay keeps turning and the "Nearly there!" line appears after 1.5 s. A failed load returns to the walk (existing).
- Offline: both destination chunks and the kit are in the precache list exactly like any `AREA_LOADERS` chunk (the offline-first gate from c5e2962 pins this); a test asserts every `to` of a tele row is in `AREA_ENTRY_MODULES` and the kit file is in the build's lazy list.

### 4.4 State handoff

A walk-on already banks the walk, sets the area and starts a new walk. A tele gate adds only these, in a pure `teleHandoff({state, via, room})` -> `{ to, arrive, suit, area, keepRoom, seedFrom }`:

| What | How |
|---|---|
| Position | not carried: she lands at the twin's `arrive` (as every gate) |
| Outfit | not carried and not changed: `suit` is a draw-time look keyed by the destination place (`suithook.effectiveWear`) |
| Partner cats (online) | the room is kept (`keepRoom`), the seed is `nextRoomSeed(roomSeed, via)`, every device draws every cat suited by the same place rule |
| Partner cat (couch) | the coop chunk spawns the second cat 1.2 m beside `arrive` when `COOP_READY` |
| Duskmode | carried (existing) |
| Save | `walks[dest]` increments when the walk is banked (existing); nothing else: no `gates` field, "found" is `walks[dest] >= 1` or this walk's session flag |

### 4.5 Place physics

`placephysics.js` rows (`reef`, `moon`) belong to the suit design (M2 there). The gate side is one read: when the destination has a physics row, `teleHandoff.suit` is that row's look. The player module needs no gate knowledge. The hop height or buoyancy are applied by place id as designed; the gate gives her a flat arrival (y 0 at the spawn) so the first frame is safe. A test: every tele destination has a physics-or-none decision explicitly stated in a table (absent is allowed and means today's numbers).

### 4.6 Words and both sets

New phrase ids (later table; both sets; off-snapshot re-recorded): `tele.prompt`, `tele.go`, `tele.notnow`, `tele.wake`, `tele.suit`, `tele.home`, `tele.coop`, `tele.hint`, `tele.guest`, `tele.slow`. Draft lines (every one a kind, short sentence; everyday set is the plain base, Clan set only adds light flavour):

| id | Everyday | Clan |
|---|---|---|
| tele.prompt | Go through to {place}? | The stones are glowing. Go through to {place}? |
| tele.go / tele.notnow | Go through / Not now | Go through / Not now |
| tele.wake | A gate! It's waking up. | A gate! The stones are waking. |
| tele.suit | Your suit is on! | Your suit is on! |
| tele.home | Take the gate home when you're ready. | Take the stones home when you're ready. |
| tele.hint | Find the gate in {host}. | Find the gate in {host}. |
| tele.guest | This way to {place}. | This way to {place}. |
| tele.coop | The gate is waiting. Two cats go together when we're ready! | same |
| tele.slow | Nearly there! | Nearly there! |

Ids in the Clan table must not use the everyday words; the structural series-vocabulary test covers this. The Moon's "Silverpelt" flavour (suit design) stays out of the gate lines.

### 4.7 Exclusion, offline, budget

- Exclusions: no tele gate in the guided first walk, in the den, in the tour, in photo mode, mid-fight or carrying (the existing `gateway` conditions), in a room walk the other members cannot take (3.3), or while the pause card is open.
- Offline-first: no network call anywhere (cloud saves are separate and the walk bank is local); everything is a lazy chunk in the precache.
- Budget: start-up +0.6 to 0.8 kB gz (table rows + `teleport.js`), asserted by the build's budget script (aim under 1 kB; never raise the 720 kB ceiling). Gate looks are lazy (`world/telegate.js`, one shared file for three looks, < 6 kB gz, loaded only when a host with a tele end builds). Per-host cost: <= 6 meshes, <= 480 triangles, <= 1 transparent draw, pinned in `test/budget.test.js`; Pines and Seaside show the headroom needed (Seaside has the tightest budget: the dive design already allots the pier 3 meshes / 400 triangles, this design uses that same allowance for the sea-cave look, it is not additional). Destination chunks stay under 100 kB gz (their own milestone).

## 5. Input

- Touch: one **Go through** button beside the pounce button, >= 44 px, only while an awake gate is in reach; the card is a normal pause card.
- Keyboard: E (as gates), Enter confirms, Esc cancels.
- Pad: X interacts (as today's gates), `⟦confirm⟧` and `⟦back⟧` on the card, the map targets in the pad's focus order; TV mode swaps tokens via `padText()`.
- The existing HUD gate prompt text is reused; the new kind is a styled variant of `gate`.

## 6. Test strategy

- `test/gateways.test.js` additions: the tele table (every tele row has a twin, both directions present, `to` has a catalog row or is dormant, `arrive` in bounds and not in a collider, `needWalks` equals the destination's `requires.walks`, ids unique, no tele row duplicates a map road, count cap <= 6 pairs).
- `test/teleport.test.js`: `teleStatus` truth table (dormant, awake-able, wake, go, guest, couch, shut); `teleHandoff` (suit look, keepRoom seed, nothing else), her saved wear unchanged after a round trip; `decideWalkOn*` accept a tele via exactly like an edge via; older-build refusal.
- Phrases: both sets define every `tele.*` id, no everyday text contains a series word, a banned-word scan over the strings (the suit design's list), `UPDATE_OFF_SNAPSHOT` fixtures re-recorded in one commit.
- Flat-trace fixtures: unchanged. Gate colliders are added to host places only at spots outside every fixture route; the test re-runs the existing flat traces for Pines and Seaside and requires byte equality.
- Budget: `test/budget.test.js` rows for the two hosts, the telegate chunk and the start-up delta.
- Coop seam: `test/coopseam.test.js` keeps passing (gate closed unless ready); couch refusal line tested.
- Picture-based checks (pictures, not asserts): the three looks in a place, the swirl in 5 frames, reduced-motion version, an iPhone width, a pad-card.
- Design-only step: this branch ran only the existing docs/lint tests (none relevant to specs were present), no full suite.

## 7. Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| The suit seams are unmerged (`suit-kit-m0`) and the Moon / Reef places do not exist | M2-M4 depend on other builds | M0 and M1 need neither: the spike uses two existing places; the destination rows are dormant until their catalog rows land (liveEndsFor) |
| Adding a gate end to a host changes its colliders and may move a fixture | golden traces and fixtures | place outside fixture routes; re-run the specific traces only |
| Seaside / Pines budgets | tightest places | allowance in 4.7; a 6-mesh cap test; fall back to the cheaper look |
| A child wanders into a gate and is moved unexpectedly | surprise | the move needs a deliberate Go through; no auto-walk-through |
| A partner on an older build in a room | room splits | existing have/ok:false path and the border-cross fallback; tested |
| A gate in Legacy | edition rule | `edition: 'all'` on tele rows only; spike confirms the `gateEnds` filter change |
| Gate read as a place the child can't leave | stranding | every destination has a home gate, a map "Change place" and the pause home; tests enforce twin existence |
| Reduced motion / sensitivity | swirl | 0.4 s fade, no scrolling disc; swirl is slow turning, no flashing (opacity change below 3 per second) |
| Scope creep into the Moon and Reef builds | those are their own plans | M3 and M4 here are hand-offs only (gate end + arrival + suit look + test) |

## 8. Cap on count

At most 6 tele pairs per release (a test constant). Beyond that the optional gate garden hub (a list board in one existing late place) is the next step, designed then.

## 9. Questions for you (with my recommended answers)

1. **Do the kids unlock a gate by paws, or by finding it?** Finding. It wakes after two walks in the place and a touch, and never costs paws; the destination's first page pays 12 paws once. (Alternative: also needing a number of golden mice found in the host.)
2. **Is the Moon gate always visible?** Always standing (grey and quiet from the start), glowing after two walks. A child can see it from the first day and wonder; nothing is hidden or missable.
3. **One hub or many gates?** Many, each in the place it belongs to (Pines island for the Moon, Seaside pier for the Reef). A tidy gate garden can come later if gates reach about six.
4. **How does the suit work?** Puts itself on during the swirl, vanishes when she is home, never touches her own clothes, free. The first trip plays the "suit up" montage once.
5. **What happens to a friend in a shared walk?** The host goes through and everyone comes along together; a friend without the place borrows it and a suit. Being carried through counts as a visit for her own save, which wakes her own gate. (Alternative: guests are carried but not credited.)
6. **Is it for both editions and both word sets?** Yes, both; the gate lines have an everyday version and a lightly flavoured Clan version, and no series words in the everyday set. (Existing street gates remain Clan only.)
7. **Which look first?** Stones for the Moon, a sea-cave glow for the Reef; the hedge arch is kept for town places later. If you prefer one look everywhere (simpler to keep, fewer chunks), pick hollow.
