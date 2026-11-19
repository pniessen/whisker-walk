# Found outfits, step 1: the machinery with one outfit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Park and Woods walk hides one find at a hand-placed spot, chosen from the walk's seed. The find is a find-only outfit she does not own yet (step 1 models one, the Acorn Cap), or a 5 🐾 pouch once she owns the area's set. The find twinkles, chimes, and a Twitchy Nose cat smells it. Picking it up shows a card with Wear it / Later, and Wear it dresses her cat mid-walk on both screens. It is kept for good in the save, shown as a silhouette in the dress-up until found, and listed under "Things to wear" in the Journal. Both children get one on a co-walk.

**Architecture:**
- **Data and rules, pure (no THREE):** `src/foundwear/`. Five record files, one per slot group (`head.js`, `face.js`, `neck.js`, `body.js`, `feet.js`). `index.js` holds the registry, the catalog entries and the checks. `spots/` holds one data file per area plus `spots/index.js` (the table and its fingerprint `FIND_KEY`). `rules.js` holds the seeded pick, the capability check, the reach tests and the chime arming. `play.js` grants a find and builds the card's HTML. `journal.js` draws "Things to wear".
- **The thing on the ground (THREE):** `src/foundwear/display.js` builds the outfit, the pouch and the twinkle. `src/foundwear/live.js` places them, runs the per-frame check (no allocation), plays the chime and lays the Twitchy Nose trail. `NO_FIND` is used everywhere else.
- **Wearing it mid-walk:** `src/cat/redress.js` rebuilds the local cat's insides in place, so the cat object every system holds stays the same. `src/game/findcard.js` is the card (the crossing card's pattern: it pauses the walk). Then `rooms.retrackProfile()` runs. On the partner's screen, `remotecats.upsert` already rebuilds a cat whose accessories changed. This plan makes that rebuild keep her place and what she is carrying.
- **Two players:** the spot comes from `mulberry32((seed ^ FIND_SALT) >>> 0)`, where the seed is the room seed or the solo seed, never `walkRng`. A partner's arrival is read from the co-walk position she already sends. The only room change is `finds: FIND_KEY` in the room profile. Finds are on only when every member's key matches.

**Tech Stack:** Plain ES modules, Three.js 0.185, Vite 8, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-11-19-found-outfits-design.md` (owner approved 2026-11-19). This plan is "Build order" item 1 only. Steps 2 (the 44 outfits, by slot file) and 3 (spots for every area, by area file) get their own plans. They follow the seams in "Seams for steps 2 and 3" below.

## Global Constraints

- **Work only in** `/Users/pniessen/CLAUDE-CODE/projects/cat-game/.claude/worktrees/found-outfits`, on branch `found-outfits`. Never touch the main checkout. Never merge, never push (the owner's yes is needed for both).
- **Tests:** the worktree has no `node_modules`. Once, from the worktree root: `ln -s ../../../node_modules node_modules`. Run single files: `npx vitest run test/<file>`. Other agents share this machine: the full suite (`npx vitest run`) runs **once**, in Task 11, and only after `uptime` shows a 1-minute load under `sysctl -n hw.ncpu`. Otherwise wait, or report rather than run.
- **Commits:** `git add <exact paths>`, never `-A` or `.`. Every message ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **No database, no `.env` files read.** Offline-first: nothing here needs the network.
- **`SAVE_VERSION` stays 4.** `foundWear` is additive with a default, as every field since v15.
- **No new network message.** The room profile gains one field, `finds`. The state message stays exactly `{ v, id, pos: [x, z], yaw, pose, speed, … }`.
- **Deterministic for two players:** no `Math.random`, no `walkRng`, no `Date.now`/`performance.now` in `src/foundwear/` or `src/game/findcard.js`. Task 9 adds a source-scan test for this.
- **No per-frame allocation:** `createFind().update` and `tickFindNose` allocate nothing. They use closure scratch and return `null` or one reused arrival object.
- **Reduced motion** (`session.reducedMotion`, read once per walk): the twinkle is steady (no pulse, no spin) and still shows from the same range. The chime, the card and the trail behave the same.
- **Text:** every player-facing line is a `phrase()` id in the later table of `src/clanphrases.js` (Task 2 adds them all). The words are short and plain, for a 9-year-old. No series word. Outfit names are read through `phrase()` when shown, never fixed at load.
- **Spec values, verbatim:**
  - "twinkles from about 20 m"; "a soft chime when she is within about 6 m"; "standing still near it draws the buried-treasure paw prints to it"; "No marker on the map, no arrow, no prompt."
  - "the same pick-up distance as a golden mouse" (`goldmice.js` `checkFind`: under 1.0 m sideways and 0.9 m up or down).
  - "a small coin pouch instead (Claude's call: 5 coins)" (the game's coins are 🐾 points).
  - "10-15 hiding spots per area"; "At least a third reachable without climbing; a few up a short perch chain; none needs a skill"; "A find never sits within 15 m of the spawn".
  - "Not on: the den … and the guided first walk"; "A walk that began with a border crossing is an ordinary walk and has its find."
  - "Never twice in one walk: one find per walk; once found, that walk has no more."
  - "finds are off for the whole walk unless every member has it".
  - "an unowned one shows as a silhouette with 'Found in the Woods' … never a price".
  - "Hagrid the hen wears only the head, face, neck and collar ones; a find of another slot still counts as found for him".
- **Fixtures. Only these change, each in the task named:**
  - `test/fixtures/accessory-mesh-delta.json` gains one key, `"acorncap": 1`, at the end (Task 2). `catpose.test.js` requires its keys to equal `CATALOG.accessories`' keys, in order.
  - `test/fixtures/series-words-on-later.json` gains the new later-table rows and nothing else (Task 2). Re-record: `UPDATE_OFF_SNAPSHOT=1 npx vitest run test/offwords.test.js`.
  - `test/fixtures/series-words-off-home.json` gains the Journal sheet's "Things to wear" rows and nothing else (Task 10). Re-record: `UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords.home.test.js`.
  - After every re-record, read `git diff` on the fixture. Rows are only added, none changed or removed. If anything else moved, stop and report.
- **Existing tests edited (only these):** `test/progression.visits.test.js` line 39: the visit-prize filter also skips `find`. `test/hagrid.test.js` `DELTA` gains `acorncap: 2`. `test/rooms.test.js` line 454: the room-profile string gains `,"finds":<FIND_KEY>`, and the cloud push string stays byte-identical. `test/dressingroom.test.js`, `test/backstack.test.js`, `test/hud.test.js`, `test/discoveries.test.js`, `test/audio.test.js`, `test/cathats.test.js`, `test/remotecats.test.js` and `test/netevents.test.js` only gain new `it`s.
- **Legacy Edition** is still shipped (owner decision 8 is not built). The Park is in both editions, so its finds ship to everyone. The Woods is Clan-Edition-only for a solo walk. A Legacy child walks it only by a co-walk's `areaOverride` (`edition.js roomAreaMove`), and then she gets the Woods find like her partner. Her dress-up and Journal hide the not-yet-found silhouettes of places her edition hides, and always show what she owns. When Legacy is retired, nothing in this code changes.
- **Line numbers** below are from `fadd4520`. Find each site by the quoted code.
- **Headless stub:** a test that builds a world (`src/world/park.js`, `woods.js`) stubs `document` exactly as `test/wanderspot.test.js` lines 5–19 do, then imports `src/` with `await import(...)`. Cat-only tests (`buildCat`, `buildHat`) need no stub (`test/cathats.test.js` has none).

## Review Focus

1. **The walk is closed and picked up again after the find, or while the card is up.**
   - Expected: no second find that walk. The outfit stays owned. A card left unanswered is gone, the same as Later.
   - Tests: Task 8, `restoreFind takes the find when the log already holds it`; Task 3, `a found outfit survives a reload with unlocked.accessories wiped`.
2. **She leaves the card without a button:** Back (an iPad edge-swipe), Escape, or a click on the game that re-locks the pointer.
   - Expected: the same as Later. The outfit is kept but not worn, and the pause card comes back.
   - Tests: Task 8, `Back with the card up is Later` and `re-locking the pointer with the card up is Later`.
3. **She reaches the spot while busy:** a fight, the crossing card, the fight sheet, or before the first engage.
   - Expected: no card then. The find stays until she is free and walks onto it. A partner's arrival still gives her outfit, with a toast.
   - Tests: Task 6, `a busy cat on the spot is not an arrival; a partner still is`; Task 8, `findBusy`.
4. **Her partner's look changes mid-walk while he is carrying something.**
   - Expected: on her screen his cat is rebuilt where it stood, facing the same way, still holding it. No jump to the map's origin, no dropped stick.
   - Tests: Task 7, `a look change rebuilds the cat where it stood` and `a rebuilt partner keeps what he was carrying`.
5. **A cloud load (or an older cloud save without `foundWear`) mid-session.**
   - Expected: found outfits are never lost. The kept list is the union of this device's and the loaded save's.
   - Test: Task 3, `Load from cloud keeps every outfit either side found`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/foundwear/head.js` | create | `HEAD_WEAR`: head-slot found-outfit records (step 1: the Acorn Cap). |
| `src/foundwear/face.js`, `neck.js`, `body.js`, `feet.js` | create | `FACE_WEAR`, `NECK_WEAR` (neck + collar), `BODY_WEAR` (body + back), `FEET_WEAR`. All empty in step 1, one file per step-2 agent. |
| `src/foundwear/index.js` | create | `FOUND_WEAR`, `SLOT_GROUPS`, `foundWearIn`, `foundRecord`, `validateFoundWear`, `FOUND_CATALOG`. |
| `src/foundwear/spots/park.js`, `spots/woods.js` | create | `PARK_SPOTS`, `WOODS_SPOTS`: hand-placed spots `{ id, x, z, y, look }`. |
| `src/foundwear/spots/index.js` | create | `FIND_SPOTS`, `FIND_LOOKS`, `SPOT_ID`, `spotsIn`, `findSpotsKey`, `FIND_KEY`. |
| `src/foundwear/rules.js` | create | Constants, `planFind`, `findsAgreed`, `pickFindItem`, `catReaches`, `partnerReaches`, `createChime`, `canWearNow`. |
| `src/foundwear/display.js` | create | `buildFindDisplay`, `DISPLAY_BY_SLOT`, `buildPouch`, `buildTwinkle`, `LOOK_POSE`. |
| `src/foundwear/live.js` | create | `createFind`, `NO_FIND`, `tickFindNose`, `fixedWobble`. |
| `src/foundwear/play.js` | create | `grantFind`, `restoreFind`, `findBusy`, `handleFindArrival`, `findCardHtml`. |
| `src/foundwear/journal.js` | create | `renderThingsToWearHtml`. |
| `src/cat/redress.js` | create | `redressCat`. |
| `src/game/findcard.js` | create | `createFindCard`, `redressSessionCat`. |
| `src/cat/hats.js` | modify | The Acorn Cap: `acorncap(simple)`, `ACORN`, `HAT_IDS`, `BUILD`, `HAT_SHAPES`. |
| `src/cat/model.js` | modify | Hagrid's Acorn Cap in `addPrizeHead`. |
| `src/progression.js` | modify | `...FOUND_CATALOG` in `CATALOG.accessories`; `foundWear` in the save; `recordFoundWear`; the cloud union. |
| `src/clanphrases.js` | modify | The later-table block "found outfits". |
| `src/discoveries.js` | modify | `AWARDS.pouch = 5`. |
| `src/ui/hud.js` | modify | `discoveryText`: `pouch` says its own whole line. |
| `src/ui/backstack.js` | modify | `walkBackAction`: `findCard` → `'find-later'`. |
| `src/audio.js` | modify | `findChime()`. |
| `src/remotecats.js` | modify | A look-change rebuild keeps the place, the facing and the water state. |
| `src/game/netevents.js` | modify | `takeHeldItemsWithRemotes`: a rebuilt remote keeps its held item. |
| `src/game/rooms.js` | modify | `roomProfile()` carries `finds: FIND_KEY`. |
| `src/game/session.js` | modify | Fields `find`, `findCard`, `findNoseAt`. |
| `src/game/walk.js` | modify | Plan and build the find; restore it on resume; dispose it. |
| `src/main.js` | modify | The per-frame check, the nose, the card, the buttons, lock change, Back. |
| `src/ui/dressingroom.js` | modify | The silhouette tile. |
| `src/ui/homebase.js` | modify | The Journal sheet adds "Things to wear". |
| `src/style.css` | modify | `.found-silhouette`, `.wear-section`, `.find-card`. |
| `verify-finds.html`, `.gitignore` | create / modify | The picture page for the owner (kept in the repo). |
| `test/foundwear.test.js`, `foundwear.save.test.js`, `foundspots.test.js`, `foundrules.test.js`, `foundlive.test.js`, `redress.test.js`, `foundplay.test.js`, `findcard.test.js`, `foundwiring.test.js`, `foundjournal.test.js` | create | The tests named below. |
| `test/helpers/findreach.js` | create | `perchHops`: the perch-chain search, for this step and step 3. |

**Two names to keep apart:** `src/outfits.js` is the *saved outfits* (her own combinations). Nothing here touches it. This feature is **found wear** in code: `foundWear`, `src/foundwear/`. "Find" is the thing on the ground, and "spot" is where it sits. The Farm and the Fairground already call their journal cards "finds". Their keys (`findeggs`, `fairfortune`) are journal types this plan does not touch.

## Seams for steps 2 and 3

Steps 2 and 3 run in parallel agents. Each follows only these rules.

- **An outfit record** (step 2, one slot-group file per agent):
  `Object.freeze({ id, slot, find, emoji, name: () => phrase('wear.<id>.name') })`.
  - `id` matches `WEAR_ID` (`/^[a-z]{3,20}$/`), unique across the whole catalog.
  - `slot` is in the file's group (`SLOT_GROUPS`).
  - `find` is a `CATALOG.areas` id.
  - `emoji` is the silhouette shape.
  - `name` reads the phrase table when called. The id is written out in full: `test/clanphrases.test.js` wants a literal id in every `phrase(` call.
  - At most `WEAR_PER_AREA` (4) per area, across all five files.
  - `validateFoundWear` (Task 2) is the gate. `test/foundwear.test.js` runs it over the real files.
- **The catalog entry** is made from the record, never typed into `progression.js`: `FOUND_CATALOG[id] = { get name(), slot, price: 0, prize: true, find, emoji }`. `prize: true` keeps it out of the shop, trades and gift codes.
- **The model** (step 2): the cat wears it through that slot's existing builder file (`hats.js` `BUILD`/`HAT_IDS`; `glasses.js`; `neck.js`/`model.js` `buildCollar`; `backitems.js`/`cape.js`; feet in `model.js`). Hagrid's head/face/neck/collar pieces go in `model.js` (`addPrizeHead`, `addPrizeFace`, `addPrizeNeck`, `buildCollar`). The ground display is one line in `display.js` `DISPLAY_BY_SLOT` per slot (step 1 fills `head`).
- **The shared lines** each step-2 agent adds (on merge, keep both sides, as the Fairground and grow-areas merges did):
  - one `wear.<id>.name` row per outfit in `src/clanphrases.js`'s later table, and the same rows in `test/fixtures/series-words-on-later.json`;
  - one key per outfit in `test/fixtures/accessory-mesh-delta.json` (catalog order) and in `test/hagrid.test.js` `DELTA`.
- **A spot file** (step 3, one area per agent): `src/foundwear/spots/<area>.js` exports `<AREA>_SPOTS = Object.freeze([{ id: 'fw-<area>-<n>', x, z, y, look }])`.
  - `y` is metres above the ground under the spot (as golden mice).
  - `look` is in `FIND_LOOKS`.
  - Then add one import and one key to `spots/index.js`, and one area id to the `describe.each` list in `test/foundspots.test.js`.
  - The spot tests (Task 4) are the gate, with `test/helpers/findreach.js`.
  - Adding or moving any spot changes `FIND_KEY`. That is intended: builds with different spots never share finds.
- **What turns an area on:** an area has finds when `spotsIn(area).length > 0`. With spots but no outfits yet, every find there is the pouch.

---

### Task 1: The Acorn Cap on the cat

**Files:**
- Modify: `src/cat/hats.js` (`HAT_IDS` line 21, `BUILD` line 690, `HAT_SHAPES` line 698)
- Test: `test/cathats.test.js`

**Interfaces:**
- Produces: `buildHat('acorncap', { simple })` returns one vertex-coloured mesh named `hat:acorncap`, with `userData.hat === 'acorncap'`, made through `finish()`. `HAT_SHAPES.ACORN`. `'acorncap'` is the last entry of `HAT_IDS`.

**The shape.** An acorn's cup worn as a cap. It is built like `beanie(simple)`:
- **The cup:** a shell on the skull's radii × `ACORN.shell`, from the crown down to a rim at `ACORN.rimFront` (front, high on the brow) and `ACORN.rimBack` (back). The rim height varies with `cos(phi)`, like `beanieRim`.
- **The scales:** checker-coloured by `(i + j) % 2` between `ACORN_CUP` and `ACORN_SCALE`.
- **The lip:** a narrow band draped on the skull under the rim (3 mm out, `drape(q, 0.003)`), so its lower edge lies on the head. This is what the seat sweep measures.
- **The stalk:** a short `tube()` from the crown, tipped toward +x by `ACORN.tilt`, coloured `ACORN_STALK`.
- Segments: 24 around and 7 rows (12 and 5 when simple), like the beanie.

Values: `ACORN = { shell: 1.05, rimFront: 0.11, rimBack: 0.06, lipH: 0.018, stalkR: 0.011, stalkL: 0.05, tilt: 0.35 }`; `ACORN_CUP = 0x8a5a2b`, `ACORN_SCALE = 0x6b4220`, `ACORN_STALK = 0x5a3a1c`.

- [ ] **Step 1: Write the failing tests.** Append a `describe('the Acorn Cap (found outfits step 1)', …)` to `test/cathats.test.js`:

```js
it('is in HAT_IDS, so every hat sweep above covers it', () => {
  expect(HAT_IDS.at(-1)).toBe('acorncap');
});
it('its stalk is the top, near the middle of the crown, under the old top hat', () => {
  for (const simple of [false, true]) {
    const V = verts(buildHat('acorncap', { simple }));
    const top = V.reduce((a, b) => (b.y > a.y ? b : a));
    expect(Math.hypot(top.x, top.z)).toBeLessThan(0.06);
    expect(top.y).toBeGreaterThan(0.22);
    expect(top.y).toBeLessThan(OLD_TOPHAT_TOP);
  }
});
it('is browns: the cup and its darker scales', () => {
  const c = buildHat('acorncap').geometry.attributes.color;
  const hexes = new Set();
  for (let i = 0; i < c.count; i++) hexes.add(new THREE.Color(c.getX(i), c.getY(i), c.getZ(i)).getHex());
  expect(hexes.size).toBeGreaterThanOrEqual(2);
  for (const h of hexes) { const col = new THREE.Color(h); expect(col.r).toBeGreaterThan(col.g); expect(col.g).toBeGreaterThan(col.b); }
});
it('sits on the crown, clear of the eyes on every cat', () => {
  // the wreath test's measure (lines 154-174), for this hat: the front half's lowest point is well above the eye's top
  // ...same loop over BREEDS, with id 'acorncap', expecting lowFront > eyeTop + 0.04
});
```

- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run test/cathats.test.js`. Expected: FAIL. `HAT_IDS.at(-1)` is `'papercrown'`, and `buildHat('acorncap')` is `null`.
- [ ] **Step 3: Implement `acorncap(simple) → THREE.Mesh`** in `src/cat/hats.js` as described. Add it to `BUILD`, append `'acorncap'` to `HAT_IDS`, and add `ACORN` to `HAT_SHAPES`.
- [ ] **Step 4: Run the hat tests to verify they pass.** Run: `npx vitest run test/cathats.test.js test/catface3.test.js test/catmodel.test.js`. Expected: PASS. This includes the existing sweeps the new id joins: the seat on four breeds, the budget (≤ 900 / ≤ 450 triangles), below the ear tips, and under the thumbnail top.
- [ ] **Step 5: Commit** `src/cat/hats.js test/cathats.test.js` with message "Found outfits step 1: the Acorn Cap, seated on the skull like the beanie".

---

### Task 2: The records, the catalog entry, Hagrid's cap and every line of text

**Files:**
- Create: `src/foundwear/head.js`, `face.js`, `neck.js`, `body.js`, `feet.js`, `src/foundwear/index.js`
- Modify: `src/progression.js` (the end of `CATALOG.accessories`, after `tailballoon` line 296)
- Modify: `src/cat/model.js` (`addPrizeHead`, line 527)
- Modify: `src/clanphrases.js` (the later table)
- Modify: `test/progression.visits.test.js:39`, `test/hagrid.test.js:20-27`
- Modify: `test/fixtures/accessory-mesh-delta.json`, `test/fixtures/series-words-on-later.json`
- Test: `test/foundwear.test.js`

**Interfaces:**
- Consumes: `phrase` from `src/clanphrases.js`.
- Produces (`src/foundwear/index.js`):
  - `FOUND_WEAR: readonly Record[]`: head, face, neck, body and feet, in that order.
  - `FOUND_WEAR_IDS: readonly string[]`.
  - `SLOT_GROUPS = { head: ['head'], face: ['face'], neck: ['neck', 'collar'], body: ['body', 'back'], feet: ['feet'] }`.
  - `WEAR_ID = /^[a-z]{3,20}$/`, `WEAR_PER_AREA = 4`.
  - `foundWearIn(areaId) → Record[]` (registry order; `[]` for an unknown or prototype id).
  - `foundRecord(id) → Record | null`.
  - `validateFoundWear(groups, { areaIds, takenIds }) → string[]`. `groups` is `{ head, face, neck, body, feet }` arrays. It returns one line per problem: a bad id, a duplicate id (within the records or against `takenIds`), a slot outside its file's group, an unknown `find`, an empty emoji, a name that is not a non-empty string, or more than `WEAR_PER_AREA` in one area.
  - `FOUND_CATALOG: { [id]: { get name(): string, slot, price: 0, prize: true, find, emoji } }`. Each entry's getter calls `record.name()`.
- Produces (records): `HEAD_WEAR = [{ id: 'acorncap', slot: 'head', find: 'park', emoji: '🌰', name: () => phrase('wear.acorncap.name') }]`. `FACE_WEAR`, `NECK_WEAR`, `BODY_WEAR` and `FEET_WEAR` are frozen empty arrays, each with a header comment naming its slots and the seam rules above.
- Produces (phrases, later table, one block headed `// ---- found outfits (2026-11-19) ----`):

```js
'wear.acorncap.name': 'Acorn Cap',
'wear.card.title': 'You found something to wear! ✨',
'wear.card.kept': 'It’s in the dress-up at home now, for good.',
'wear.card.wear': 'Wear it',
'wear.card.later': 'Later',
'wear.card.henNo': (catName) => `${catName} can’t wear this one, but your other cats can.`,
'wear.partner.found': (partnerName, thing) => `${partnerName} found it, and there was one for you too: ${thing}! It’s in the dress-up at home. 🎁`,
'wear.pouch.found': 'You found a little pouch of 🐾!',
'wear.pouch.partner': (partnerName) => `${partnerName} found it, and there was a little pouch of 🐾 for you too!`,
'wear.foundIn': (place) => `Found in ${place}`,
'wear.notYet': 'Not found yet',
'wear.journal.title': 'Things to wear',
```

- [ ] **Step 1: Write the failing tests** in `test/foundwear.test.js`:

```js
it('the registry passes its own checks', () => {
  const takenIds = Object.keys(CATALOG.accessories).filter((id) => !CATALOG.accessories[id].find);
  expect(validateFoundWear({ head: HEAD_WEAR, face: FACE_WEAR, neck: NECK_WEAR, body: BODY_WEAR, feet: FEET_WEAR },
    { areaIds: Object.keys(CATALOG.areas), takenIds })).toEqual([]);
});
it('the checks catch each kind of mistake', () => {
  const ok = { id: 'mosscap', slot: 'head', find: 'woods', emoji: '🌿', name: () => 'Moss Cap' };
  const run = (head) => validateFoundWear({ head, face: [], neck: [], body: [], feet: [] }, { areaIds: ['park', 'woods'], takenIds: ['bell'] });
  expect(run([ok])).toEqual([]);
  expect(run([{ ...ok, id: 'Bad-Id' }])).toHaveLength(1);
  expect(run([ok, ok])).toHaveLength(1);                           // duplicate
  expect(run([{ ...ok, id: 'bell' }])).toHaveLength(1);           // a shop id
  expect(run([{ ...ok, slot: 'neck' }])).toHaveLength(1);          // not this file's slot
  expect(run([{ ...ok, find: 'mars' }])).toHaveLength(1);
  expect(run([{ ...ok, emoji: '' }])).toHaveLength(1);
  expect(run([{ ...ok, name: () => '' }])).toHaveLength(1);
  expect(run(['a', 'b', 'c', 'd', 'e'].map((c) => ({ ...ok, id: `moss${c}aa` })))).toHaveLength(1); // five in the Woods
});
it('the Acorn Cap is a find-only prize from the Park', () => {
  const a = CATALOG.accessories.acorncap;
  expect([a.name, a.slot, a.price, a.prize, a.find, a.emoji]).toEqual(['Acorn Cap', 'head', 0, true, 'park', '🌰']);
  expect(isPrizeAccessory('acorncap')).toBe(true);
  expect(isTradeableAccessory('acorncap')).toBe(false);
  expect(Object.keys(CATALOG.accessories).at(-1)).toBe('acorncap');
});
it('the name is read when asked, through the phrase table', () => {
  expect(Object.getOwnPropertyDescriptor(CATALOG.accessories.acorncap, 'name').get).toBeTypeOf('function');
  expect(withOffWords(() => CATALOG.accessories.acorncap.name)).toBe('Acorn Cap');
});
it('cannot be bought, even with points to spare', () => {
  const p = createProgression(fakeStorage()); p.addPoints(999);
  expect(p.canBuy('accessories', 'acorncap')).toBe(false);
  expect(p.buy('accessories', 'acorncap')).toBe(false);
});
it('foundWearIn lists an area\'s records in order, and nothing for junk', () => {
  expect(foundWearIn('park').map((r) => r.id)).toEqual(['acorncap']);
  for (const id of ['woods', 'den', '__proto__', 'toString', null]) expect(foundWearIn(id)).toEqual([]);
  expect(foundRecord('acorncap').find).toBe('park');
  expect(foundRecord('bell')).toBe(null);
});
```

  `withOffWords` comes from `test/helpers/offwords.js`. `fakeStorage` is the `Map`-backed `{ getItem, setItem }` the progression tests use.
  Also add to `test/hagrid.test.js`, inside `describe('his items still fit')`:

```js
it('the Acorn Cap sits on his head round the comb', () => {
  const top = Math.max(...comb().pts.map((v) => v.y));
  const c = hen({ ...BARE, head: 'acorncap' });
  const { head } = c.userData.parts;
  const cap = head.children.filter((o) => o.isMesh && [0x8a5a2b, 0x5a3a1c].includes(hex(o)));
  expect(cap).toHaveLength(2);
  const b = boxOf(cap.flatMap((m) => pointsIn(m, head)));
  expect(b.min.y).toBeLessThanOrEqual(top);
  expect(b.max.y).toBeLessThanOrEqual(top + 0.13);
});
```

- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run test/foundwear.test.js test/hagrid.test.js`. Expected: FAIL, because `src/foundwear/index.js` does not exist.
- [ ] **Step 3: Implement the five record files and `src/foundwear/index.js`.** Then put `...FOUND_CATALOG,` at the end of `CATALOG.accessories`. The spread is shallow, so each entry object, getter included, is kept as made. In `src/clanphrases.js`, add the phrase block to `LATER`.
- [ ] **Step 4: Implement Hagrid's cap**, an `id === 'acorncap'` branch in `model.js addPrizeHead`, in the beanie's manner for a hen:
  - the cup: `ball(0.105 * k, 0x8a5a2b, 1, 0.6, 1, 8, 6)` at `(0, y - 0.01, 0)`;
  - the stalk: `CylinderGeometry(0.011 * k, 0.014 * k, 0.05 * k, 6)` in `mat(0x5a3a1c)`, at `(0.012, y + 0.075 * k, 0)`, tipped `rotation.z = -0.35`.
  - That is two meshes. Add `acorncap: 2` to `test/hagrid.test.js` `DELTA`.
- [ ] **Step 5: Edit the two named tests and record the two fixtures.**
  - `test/progression.visits.test.js` line 39 filter becomes `CATALOG.accessories[id].prize && !CATALOG.accessories[id].fair && !CATALOG.accessories[id].find`. The found outfits are flagged `prize`, but they are not visit prizes.
  - Append `"acorncap": 1` to `test/fixtures/accessory-mesh-delta.json` (one hat mesh, as every hat).
  - Run `UPDATE_OFF_SNAPSHOT=1 npx vitest run test/offwords.test.js`. Then `git diff test/fixtures/series-words-on-later.json`. Expected: only the 12 new `wear.*` rows were added.
- [ ] **Step 6: Run the tests to verify they pass.** Run: `npx vitest run test/foundwear.test.js test/hagrid.test.js test/progression.visits.test.js test/catpose.test.js test/catmodel.test.js test/offwords.test.js test/clanphrases.test.js test/fairgames.test.js test/dressingroom.test.js test/progression.test.js test/colony.test.js test/serieswords.test.js`. Expected: PASS.
- [ ] **Step 7: Commit** every file above with message "Found outfits step 1: the records (one file per slot group), the Acorn Cap in the catalog as a find-only prize, Hagrid's cap, and every line of text".

---

### Task 3: The durable record in the save

**Files:**
- Modify: `src/progression.js`: `defaultState` (around line 590), `sanitizeState` (after the Fairground rebuild, line 1001; the result object), `replaceFromPayload` (line 2451), and a new method beside `winFairGame` (line 1893).
- Test: `test/foundwear.save.test.js`

**Interfaces:**
- Consumes: `FOUND_CATALOG` (through `CATALOG.accessories[id].find`).
- Produces:
  - `state.foundWear: string[]`: every found-outfit id ever found, oldest first. Additive (`SAVE_VERSION` stays 4). It is the durable record: `sanitizeState` puts each id into `unlocked.accessories` before the equipped checks, as `prizesWonBy` does.
  - `FOUND_WEAR_MAX = 96`. The cap is for a hostile payload; there are 48 outfits at most once the Rooftops has its four.
  - `progression.recordFoundWear(id) → boolean`. It is true when she did not own `id` before. A known found-outfit id ends up in both `foundWear` and `unlocked.accessories`, with one `save()`. A shop or prize id, or junk, returns false and writes nothing. It never equips.

- [ ] **Step 1: Write the failing tests** in `test/foundwear.save.test.js`:

```js
it('a new save and an old save start with none', () => {
  expect(createProgression(fakeStorage()).state.foundWear).toEqual([]);
  const old = fakeStorage(); old.setItem('whisker-walk-save', JSON.stringify({ version: 4, points: 3 }));
  expect(createProgression(old).state.foundWear).toEqual([]);
});
it('recordFoundWear owns it once, does not put it on, and says whether it was new', () => {
  const p = createProgression(fakeStorage());
  expect(p.recordFoundWear('acorncap')).toBe(true);
  expect(p.recordFoundWear('acorncap')).toBe(false);
  expect(p.state.foundWear).toEqual(['acorncap']);
  expect(p.state.unlocked.accessories.filter((id) => id === 'acorncap')).toHaveLength(1);
  expect(p.state.equipped.head).toBe(null);
  for (const bad of ['bell', 'partycrown', 'nope', '__proto__', null, 7]) expect(p.recordFoundWear(bad)).toBe(false);
  expect(p.state.foundWear).toEqual(['acorncap']);
});
it('a found outfit survives a reload with unlocked.accessories wiped, and stays worn', () => {
  const s = fakeStorage(); const p = createProgression(s);
  p.recordFoundWear('acorncap'); p.equipAccessory('acorncap');
  const raw = JSON.parse(s.getItem('whisker-walk-save'));
  raw.unlocked.accessories = ['bell'];
  s.setItem('whisker-walk-save', JSON.stringify(raw));
  const q = createProgression(s);
  expect(q.state.unlocked.accessories).toContain('acorncap');
  expect(q.state.equipped.head).toBe('acorncap');
});
it('junk in foundWear is dropped: unknown ids, shop ids, repeats, non-strings, and past the cap', () => {
  const s = fakeStorage();
  s.setItem('whisker-walk-save', JSON.stringify({ version: 4, foundWear: ['acorncap', 'acorncap', 'bell', 'x', 3, null, ...Array(200).fill('acorncap')] }));
  expect(createProgression(s).state.foundWear).toEqual(['acorncap']);
});
it('Load from cloud keeps every outfit either side found', () => {
  const p = createProgression(fakeStorage()); p.recordFoundWear('acorncap');
  p.replaceFromPayload({ version: 4, points: 1 });             // an older build's payload: no foundWear
  expect(p.state.foundWear).toEqual(['acorncap']);
  expect(p.state.unlocked.accessories).toContain('acorncap');
  const q = createProgression(fakeStorage());
  q.replaceFromPayload({ version: 4, foundWear: ['acorncap'] }); // the cloud has one this device lacks
  expect(q.state.foundWear).toEqual(['acorncap']);
});
```

- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run test/foundwear.save.test.js`. Expected: FAIL (`foundWear` is `undefined`).
- [ ] **Step 3: Implement** the following in `src/progression.js`:
  - `sanitizeFoundWear(v) → string[]`: an array of strings, each an own key of `CATALOG.accessories` with `find`, deduped, the first `FOUND_WEAR_MAX`.
  - In `sanitizeState`: the rebuild loop and the result field.
  - `defaultState().foundWear = []`, with a comment in the house style ("Additive, so SAVE_VERSION stays 4").
  - `recordFoundWear`.
  - In `replaceFromPayload`: capture `localFound` before the load, then set `state.foundWear` to the union, local first, sanitized again. Every id goes into `unlocked.accessories`, beside the visit-prize loop.
- [ ] **Step 4: Run the tests to verify they pass.** Run: `npx vitest run test/foundwear.save.test.js test/progression.test.js test/progression.visits.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `src/progression.js test/foundwear.save.test.js` with message "Found outfits step 1: foundWear, the durable record that rebuilds them on every load and survives a cloud load".

---

### Task 4: The spots for the Park and the Woods, and their tests

**Files:**
- Create: `src/foundwear/spots/park.js`, `src/foundwear/spots/woods.js`, `src/foundwear/spots/index.js`
- Create: `test/helpers/findreach.js`
- Test: `test/foundspots.test.js`

**Interfaces:**
- Consumes: `seedFromCode` from `src/rng.js`; `canReach`, `BASE_CLIMB_BUDGET` from `src/climbing.js` (the helper only).
- Produces (`spots/index.js`):
  - `FIND_LOOKS = ['post', 'branch', 'grass', 'water', 'perch']`, `SPOT_ID = /^fw-[a-z]{2,12}-\d{1,2}$/`.
  - `FIND_SPOTS = { park: PARK_SPOTS, woods: WOODS_SPOTS }` (frozen).
  - `spotsIn(areaId) → Spot[]` (own-property; `[]` otherwise).
  - `FIND_RULES = 1`.
  - `findSpotsKey(spots = FIND_SPOTS, rules = FIND_RULES) → number`, a uint32. It is `(seedFromCode(text) ^ rules) >>> 0`. `text` is the area ids sorted, each as `area:` followed by its spots' `id,x,z,y` joined by `;`, with the areas joined by `|`. `look` is left out: it changes how the find looks, not where it is.
  - `FIND_KEY = findSpotsKey()`.
- Produces (helper): `perchHops(perches, target, { budget = BASE_CLIMB_BUDGET, groundOk = () => true } = {}) → number`.
  - It is the fewest hops to stand on a perch inside the pick-up window of `target`: under 1.0 m sideways and 0.9 m up or down, with `target.y` measured from the ground.
  - The search runs as `test/climbing.test.js` `hopsFromGround` (lines 491–511) does. A first hop counts only from a perch with `groundOk(p.x, p.z)`.
  - It returns 0 for `target.y === 0`, and `Infinity` when no chain reaches the target.

**Placing the spots (hand work, by reading the area files).** For each area, place 10–15 spots in nooks worth reaching, read off the area's own records:
- **Park** (`src/world/park.js`, spawn `(0, 45)`): behind the bandstand or shed, the low wall, among the bushes, at the pond's reeds, on the oak chain's bench step.
- **Woods** (`src/world/woods.js`, spawn `(44, 12)`): under the fallen log's end, among the bluebells, on the mossy boulder of the Great Oak chain, at the lake's edge, by the river deck.
- At least `ceil(n/3)` have `y: 0`. A few sit up a chain of at most 3 hops, at the perch's own numbers, as the golden mice do. None is within 15 m of the spawn.
- **Do not edit `woods.js`**, and in particular do not add spots to its `KEEP_CLEAR`. That list moves the procedural trees and ferns, and with them the area's pinned budgets. Put Woods spots where the layout is already open. The test below checks against the layout's own generators.
- Each spot gets a one-line comment saying where it is, as `goldmice.js` does.

- [ ] **Step 1: Write the failing tests** in `test/foundspots.test.js` (the headless `document` stub first):

```js
const BUILDERS = { park: '../src/world/park.js', woods: '../src/world/woods.js' };
describe.each(Object.keys(BUILDERS))('%s find spots', (areaId) => {
  let area, flood;
  beforeAll(async () => {
    area = (await import(BUILDERS[areaId])).build(new THREE.Scene());
    const stand = (x, z) => isWalkableAt(area, x, z) || isWadeableAt(area, x, z);
    flood = floodFrom(area, area.spawn, stand);
  });
  const spots = () => spotsIn(areaId);
  it('10 to 15 spots, ids fw-<area>-<n>, unique, each with a known look', () => {
    expect(spots().length).toBeGreaterThanOrEqual(10); expect(spots().length).toBeLessThanOrEqual(15);
    for (const s of spots()) { expect(s.id).toMatch(SPOT_ID); expect(s.id.startsWith(`fw-${areaId}-`)).toBe(true); expect(FIND_LOOKS).toContain(s.look); }
    expect(new Set(spots().map((s) => s.id)).size).toBe(spots().length);
  });
  it('none within 15 m of the spawn', () => {
    for (const s of spots()) expect(Math.hypot(s.x - area.spawn.x, s.z - area.spawn.z), s.id).toBeGreaterThanOrEqual(SPAWN_CLEAR);
  });
  it('inside the shared core of the map, 1.5 m in', () => {
    const b = area.core ?? area.bounds;
    for (const s of spots()) { expect(s.x).toBeGreaterThanOrEqual(b.minX + 1.5); expect(s.x).toBeLessThanOrEqual(b.maxX - 1.5); expect(s.z).toBeGreaterThanOrEqual(b.minZ + 1.5); expect(s.z).toBeLessThanOrEqual(b.maxZ - 1.5); }
  });
  it('every ground spot stands on open or wading ground and is reached on foot from the spawn', () => {
    for (const s of spots().filter((t) => t.y === 0)) {
      expect(isWalkableAt(area, s.x, s.z) || isWadeableAt(area, s.x, s.z), s.id).toBe(true);
      expect(flood.reachesWithin(s.x, s.z, PICKUP.r), s.id).toBe(true);
    }
  });
  it('every raised spot is at most 3 hops up a chain that starts on reached ground, with no skills', () => {
    for (const s of spots().filter((t) => t.y > 0)) {
      const hops = perchHops(area.perches, s, { groundOk: (x, z) => flood.reachesWithin(x, z, 1.5) });
      expect(hops, s.id).toBeGreaterThanOrEqual(1); expect(hops, s.id).toBeLessThanOrEqual(3);
    }
  });
  it('at least a third need no climbing', () => {
    expect(spots().filter((s) => s.y === 0).length).toBeGreaterThanOrEqual(Math.ceil(spots().length / 3));
  });
});
it('the Woods spots sit in the open: no trunk within 2 m, no fern or bramble within 1.2 m, none in the camp', async () => {
  const { woodsTreeSpots, woodsUndergrowth } = await import('../src/world/woods.js');
  const trees = woodsTreeSpots(); const { ferns, brambles } = woodsUndergrowth(); const camp = DISCS.woods;
  for (const s of spotsIn('woods')) {
    for (const t of trees) expect(Math.hypot(s.x - t.x, s.z - t.z), s.id).toBeGreaterThanOrEqual(2);
    for (const f of [...ferns, ...brambles]) expect(Math.hypot(s.x - f.x, s.z - f.z), s.id).toBeGreaterThanOrEqual(1.2);
    expect(Math.hypot(s.x - camp.cx, s.z - camp.cz), s.id).toBeGreaterThan(camp.r);
  }
});
it('the spot key is a uint32 that moves when any spot moves, and not when a look changes', () => {
  expect(Number.isInteger(FIND_KEY) && FIND_KEY >= 0 && FIND_KEY < 2 ** 32).toBe(true);
  const moved = { ...FIND_SPOTS, park: FIND_SPOTS.park.map((s, i) => (i ? s : { ...s, x: s.x + 0.5 })) };
  const relooked = { ...FIND_SPOTS, park: FIND_SPOTS.park.map((s, i) => (i ? s : { ...s, look: 'grass' })) };
  expect(findSpotsKey(moved)).not.toBe(FIND_KEY);
  expect(findSpotsKey(relooked)).toBe(FIND_KEY);
  expect(findSpotsKey(FIND_SPOTS, 2)).not.toBe(FIND_KEY);
});
it('perchHops: 0 on the ground, Infinity out of reach, and counts a two-step chain', () => {
  const chain = [{ x: 0, z: 0, y: 0.72 }, { x: 1.2, z: 0, y: 1.9 }];
  expect(perchHops(chain, { x: 5, z: 5, y: 0 })).toBe(0);
  expect(perchHops(chain, { x: 1.2, z: 0, y: 1.9 })).toBe(2);
  expect(perchHops(chain, { x: 30, z: 0, y: 4 })).toBe(Infinity);
});
```

  `SPAWN_CLEAR` and `PICKUP` are imported from `src/foundwear/rules.js`. This task creates that file with only those two exports: `SPAWN_CLEAR = 15` and `PICKUP = Object.freeze({ r: 1.0, dy: 0.9 })`. Task 5 adds the rest.
- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run test/foundspots.test.js`. Expected: FAIL (no `spots/index.js`).
- [ ] **Step 3: Implement** `spots/index.js`, the two-constant `rules.js` and the helper. Then place the spots, re-running the test until every line is green. Move a spot rather than loosen a test.
- [ ] **Step 4: Run the tests to verify they pass.** Run: `npx vitest run test/foundspots.test.js test/woods.test.js test/budget.test.js`. Expected: PASS, with the Woods' own counts unchanged.
- [ ] **Step 5: Commit** `src/foundwear/spots/ src/foundwear/rules.js test/helpers/findreach.js test/foundspots.test.js` with message "Found outfits step 1: hand-placed find spots for the Park and the Woods, each proven reachable from the spawn".

---

### Task 5: The rules: the seeded pick, the agreement, the reach and the chime

**Files:**
- Modify: `src/foundwear/rules.js` (Task 4 made it with `SPAWN_CLEAR` and `PICKUP`)
- Test: `test/foundrules.test.js`

**Interfaces:**
- Consumes: `mulberry32` (`src/rng.js`); `FIND_SPOTS`, `FIND_KEY`, `spotsIn` (Task 4).
- Produces:
  - `FIND_SALT = 0x5eedf1d0`, `FIND_LOG_KEY = 'wear-find'`, `PICKUP = { r: 1.0, dy: 0.9 }`, `TWINKLE_RANGE = 20`, `CHIME_RANGE = 6`, `CHIME_REARM = 10`, `NOSE_RANGE = 20`, `SPAWN_CLEAR = 15`, `POUCH_COINS = 5`, `HEN_SLOTS = ['head', 'face', 'neck', 'collar']`.
  - `planFind({ areaId, isDen = false, lessonKind = null, seed, roster = null, key = FIND_KEY, spots = FIND_SPOTS }) → { areaId, spot, roll } | null`.
    - It returns null in the den, on a guided first walk (`lessonKind === 'first'`), in an area with no spots, when `seed` is not a finite number, or on a room walk (`roster` not null) without `findsAgreed(roster, key)`.
    - Otherwise, with `r = mulberry32((seed ^ FIND_SALT) >>> 0)`: `spot = list[Math.floor(r() * list.length)]` and `roll = r()`. Those are the only two draws, in that order.
  - `findsAgreed(roster, key = FIND_KEY) → boolean`: `roster` is an array with at least one entry, and every entry's `finds === key`.
  - `pickFindItem(records, owned, roll) → { kind: 'wear', id } | { kind: 'pouch' }`.
    - With `n = records.length` and `start = Math.floor(roll * n) % n`, walk the ring from `start`. The first record whose id is not in `owned` (an array or a Set) is the find.
    - When every record is owned, or there are none (`n === 0`), it is the pouch.
  - `catReaches(spot, spotWorldY, x, z, pawsY) → boolean`: `hypot < PICKUP.r && |pawsY - spotWorldY| < PICKUP.dy`.
  - `partnerReaches(spot, x, z) → boolean`: `hypot < PICKUP.r` (flat, because the co-walk message carries no height: spec, "Playing together").
  - `createChime() → { step(dist) → boolean }`. Armed at first. It returns true once, when an armed chime meets `dist < CHIME_RANGE`. It re-arms when `dist > CHIME_REARM`.
  - `canWearNow(breed, slot) → boolean`: Hagrid only for `HEN_SLOTS`.

- [ ] **Step 1: Write the failing tests** in `test/foundrules.test.js`:

```js
const roster = (...keys) => keys.map((finds, i) => ({ playerId: `p${i}`, finds }));
it('the same seed picks the same spot and roll, twice', () => {
  const a = planFind({ areaId: 'park', seed: 12345 }), b = planFind({ areaId: 'park', seed: 12345 });
  expect(a).toEqual(b); expect(spotsIn('park')).toContain(a.spot);
});
it('the spot comes from the salted seed only: two draws, in order', () => {
  const r = mulberry32((777 ^ FIND_SALT) >>> 0); const list = spotsIn('park');
  const want = list[Math.floor(r() * list.length)]; const roll = r();
  expect(planFind({ areaId: 'park', seed: 777 })).toEqual({ areaId: 'park', spot: want, roll });
});
it('over many seeds every spot of the area gets picked', () => {
  const seen = new Set(); for (let s = 0; s < 4000; s++) seen.add(planFind({ areaId: 'woods', seed: s }).spot.id);
  expect(seen.size).toBe(spotsIn('woods').length);
});
it('no find in the den, on the guided first walk, in an area with no spots, or without a seed', () => {
  expect(planFind({ areaId: 'den', isDen: true, seed: 1 })).toBe(null);
  expect(planFind({ areaId: 'park', lessonKind: 'first', seed: 1 })).toBe(null);
  expect(planFind({ areaId: 'park', lessonKind: 'camp', seed: 1 })).not.toBe(null); // the first camp walk is an ordinary walk
  expect(planFind({ areaId: 'seaside', seed: 1 })).toBe(null);
  for (const seed of [undefined, NaN, '7']) expect(planFind({ areaId: 'park', seed })).toBe(null);
});
it('a room walk has a find only when every member carries the same key', () => {
  expect(planFind({ areaId: 'park', seed: 9, roster: roster(FIND_KEY, FIND_KEY) })).not.toBe(null);
  expect(planFind({ areaId: 'park', seed: 9, roster: roster(FIND_KEY, undefined) })).toBe(null);   // an older build
  expect(planFind({ areaId: 'park', seed: 9, roster: roster(FIND_KEY, FIND_KEY ^ 1) })).toBe(null); // different spots
  expect(planFind({ areaId: 'park', seed: 9, roster: [] })).toBe(null);                            // nobody listed yet
  expect(findsAgreed([null, { finds: FIND_KEY }])).toBe(false);
});
it('both partners pick the same spot from the room seed, whatever they own', () => {
  const r = roster(FIND_KEY, FIND_KEY);
  expect(planFind({ areaId: 'park', seed: 4242, roster: r }).spot).toBe(planFind({ areaId: 'park', seed: 4242, roster: r }).spot);
});
it('pickFindItem: the first not-owned from the seed\'s start, then the pouch', () => {
  const recs = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  expect(pickFindItem(recs, [], 0)).toEqual({ kind: 'wear', id: 'a' });
  expect(pickFindItem(recs, [], 0.6)).toEqual({ kind: 'wear', id: 'c' });
  expect(pickFindItem(recs, new Set(['c']), 0.6)).toEqual({ kind: 'wear', id: 'd' });
  expect(pickFindItem(recs, ['d', 'c'], 0.6)).toEqual({ kind: 'wear', id: 'a' });   // wraps round
  expect(pickFindItem(recs, ['a', 'b', 'c', 'd'], 0.3)).toEqual({ kind: 'pouch' });
  expect(pickFindItem([], [], 0.3)).toEqual({ kind: 'pouch' });                     // spots, no outfits yet (the Woods in step 1)
  expect(pickFindItem(recs, [], 0.9999999)).toEqual({ kind: 'wear', id: 'd' });
});
it('reach: the golden mouse\'s window for her, flat for a partner', () => {
  const s = { x: 0, z: 0, y: 1.9 };
  expect(catReaches(s, 1.9, 0.9, 0, 1.9)).toBe(true);
  expect(catReaches(s, 1.9, 1.0, 0, 1.9)).toBe(false);
  expect(catReaches(s, 1.9, 0, 0, 0)).toBe(false);   // under the perch
  expect(partnerReaches(s, 0.5, 0.5)).toBe(true);    // under the perch counts for a partner (Claude's call)
  expect(partnerReaches(s, 1, 0.2)).toBe(false);
});
it('the chime: once on coming within 6 m, again only after leaving 10 m', () => {
  const c = createChime();
  expect([25, 7, 5.9, 3, 8, 5, 11, 5.5].map((d) => c.step(d))).toEqual([false, false, true, false, false, false, false, true]);
});
it('Hagrid wears head, face, neck and collar only; every cat wears everything', () => {
  for (const slot of ['head', 'face', 'neck', 'collar']) expect(canWearNow('hagrid', slot)).toBe(true);
  for (const slot of ['body', 'back', 'feet']) expect(canWearNow('hagrid', slot)).toBe(false);
  for (const slot of ['body', 'feet']) expect(canWearNow('tabby', slot)).toBe(true);
});
```

- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run test/foundrules.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement `src/foundwear/rules.js`.**
- [ ] **Step 4: Run the tests to verify they pass.** Run: `npx vitest run test/foundrules.test.js test/foundspots.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `src/foundwear/rules.js test/foundrules.test.js` with message "Found outfits step 1: the seeded pick off its own salted stream, the room agreement, the reach and the chime".

---

### Task 6: The find on the ground: the outfit, the twinkle, the chime, the nose

**Files:**
- Create: `src/foundwear/display.js`, `src/foundwear/live.js`
- Modify: `src/audio.js` (beside `whiskerPing`, line 753)
- Test: `test/foundlive.test.js`, `test/audio.test.js`

**Interfaces:**
- Consumes: `buildHat` (Task 1); `foundRecord` (Task 2); everything in Task 5; `FLAT_GROUND` (`src/ground.js`); `seedFromCode`; `hasSkill` (`src/skills.js`); `AUTO_SNIFF_STILL_S`, `AUTO_SNIFF_EVERY_S` (`src/game/autosniff.js`).
- Produces (`display.js`):
  - `LOOK_POSE = { post: { tilt: 0, lift: 0 }, branch: { tilt: 0.45, lift: 0 }, grass: { tilt: 0.3, lift: -0.02 }, water: { tilt: 0.15, lift: 0 }, perch: { tilt: 0.1, lift: 0 } }`.
  - `DISPLAY_BY_SLOT = { head: (id) => buildHat(id, { simple: true }) }`. Step 2 adds the other slots.
  - `buildFindDisplay(item) → THREE.Object3D`: a wear item's slot builder, or `buildPouch()` for the pouch, or for a slot with no builder yet.
  - `buildPouch() → THREE.Mesh`: one vertex-coloured mesh named `find:pouch`, ≤ 200 triangles. A squashed cloth bag in `0xc9a46a`, a tie in `0x8a5a2b`, a gold paw-coin peeping out in `0xf2c14e`.
  - `buildTwinkle() → THREE.Mesh`: a flat four-point star named `find:twinkle`, ≤ 16 triangles. `MeshBasicMaterial({ color: 0xfff2a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })`.
  - Every display and twinkle mesh has `castShadow = false`.
- Produces (`live.js`):
  - `NO_FIND`: frozen `{ spot: null, item: null, taken: true, worldY: 0, update: () => null, take() {}, dispose() {} }`.
  - `createFind(scene, { plan, item, ground = FLAT_GROUND, reducedMotion = false, onNear = () => {} }) → Find`.
    - Find: `{ spot, item, worldY, taken, group, update(dt, t, frame) → Arrival | null, take(), dispose() }`.
    - `frame`: `{ x, z, pawsY, camera, remotes, busy }`. The caller reuses this one object. `remotes` is `remotecats` entries.
    - `Arrival` is ONE object made at creation and reused: `{ by: 'me' | 'partner', playerId, petName }`.
    - Placement:
      - The group sits at `(spot.x, ground.y(spot.x, spot.z) + spot.y + LOOK_POSE[look].lift, spot.z)`. `worldY` is that height without the lift.
      - The display's `rotation.z = tilt`, and `rotation.y = (seedFromCode(spot.id) / 2 ** 32) * 2π`.
      - The twinkle is 0.3 m above the group.
    - `update` per frame:
      - Nothing when `taken`.
      - The twinkle shows only within `TWINKLE_RANGE` of her. It faces the camera (`quaternion.copy(camera.quaternion)`). It pulses unless `reducedMotion`: scale `0.6 + 0.4·s` and opacity `0.4 + 0.5·s` with `s = 0.5 + 0.5·sin(3.1·t)`. Under reduced motion it is steady: scale 0.8, opacity 0.7.
      - `onNear()` runs when the chime steps true.
      - Then her arrival (`catReaches`, only when `!frame.busy`). Then each remote whose `water.placed` is true (`partnerReaches` on `toPos.x/z`).
    - `take()`: `taken = true`. Removes the group from the scene and disposes its geometries and materials. Idempotent.
    - `dispose()`: as `take()`.
  - `fixedWobble() → () => number`: `scent.js standSniff`'s fixed pattern, as a factory.
  - `tickFindNose(session, dt, state) → boolean`.
    - It lays `session.scent.trailTo(catPos, find.spot, { maxDist: 6, rand: fixedWobble() })` and sets `session.sniffTime = 1` and `session.findNoseAt = session.walkTime`.
    - Only when all of these hold: `hasSkill(state, 'twitchy-nose')`; the find is not taken; `idleTime ≥ AUTO_SNIFF_STILL_S`; within `NOSE_RANGE`; `walkTime - findNoseAt ≥ AUTO_SNIFF_EVERY_S`; `autoSniffAt !== walkTime` (never on the same frame as a treasure sniff); and none of autosniff's busy gates (`prompt.kind === 'dig'`, `perched`, `cameraMode`, `fight`, `rest`, `chasing`, `freezeTime > 0`).
    - `session.walkTime` is advanced by `tickAutoSniff`, which runs first in the frame.
- Produces (`audio.js`): `findChime()`. Three soft rising sine notes, `[1568, 1976, 2349]`, each 0.16 s and 0.09 s apart, gain 0.03. Quieter than `chime()` (0.07). Silent when muted.

- [ ] **Step 1: Write the failing tests** in `test/foundlive.test.js`. Use a stub camera `{ quaternion: new THREE.Quaternion() }`, a frame object, and `remote(x, z)` that returns `{ playerId: 'sib', petName: 'Robin', toPos: new THREE.Vector3(x, 0, z), water: { placed: true } }`.

```js
const plan = { areaId: 'park', spot: { id: 'fw-park-1', x: 10, z: 0, y: 0, look: 'grass' }, roll: 0 };
it('shows the outfit at its spot, tipped by its look, casting no shadow', () => {
  const scene = new THREE.Scene(); const f = createFind(scene, { plan, item: { kind: 'wear', id: 'acorncap' } });
  expect(scene.children).toContain(f.group);
  expect(f.group.getObjectByName('hat:acorncap')).toBeTruthy();
  f.group.traverse((o) => { if (o.isMesh) expect(o.castShadow).toBe(false); });
  expect(f.group.position.toArray()).toEqual([10, LOOK_POSE.grass.lift, 0]);
});
it('the pouch when the item is the pouch', () => {
  const f = createFind(new THREE.Scene(), { plan, item: { kind: 'pouch' } });
  expect(f.group.getObjectByName('find:pouch')).toBeTruthy();
});
it('twinkles only within 20 m, and steadily under reduced motion', () => { /* spot at x 10: frame.x 35 (25 m) → twinkle hidden, frame.x 25 (15 m) → shown; t 0.1 and t 0.6 give two scales normally, one scale (0.8) under reducedMotion */ });
it('chimes once on coming within 6 m', () => { /* onNear spy: walk the frame 20 → 5 → 3 → 12 → 4: two calls */ });
it('her arrival, at the golden mouse\'s distance; a raised spot needs her paws up there', () => { /* y 1.9 spot: pawsY 0 under it is null; pawsY 1.9 at 0.9 m is { by: 'me' } */ });
it('a busy cat on the spot is not an arrival; a partner still is', () => {
  const f = createFind(new THREE.Scene(), { plan, item: { kind: 'pouch' } });
  const frame = { x: 10, z: 0, pawsY: 0, camera, remotes: [], busy: true };
  expect(f.update(0.016, 1, frame)).toBe(null);
  frame.remotes = [remote(10.5, 0.2)];
  expect(f.update(0.016, 1, frame)).toEqual({ by: 'partner', playerId: 'sib', petName: 'Robin' });
});
it('a partner not yet placed (no state yet) never counts', () => { /* water.placed false at the spot → null */ });
it('take() removes and disposes it once; after that nothing arrives', () => { /* geometry dispose listeners fire once; update returns null; take() twice is fine */ });
it('allocates nothing over 60 s of updates', () => {
  const scene = new THREE.Scene(); const f = createFind(scene, { plan, item: { kind: 'wear', id: 'acorncap' } });
  const frame = { x: 30, z: 0, pawsY: 0, camera, remotes: [remote(40, 0)], busy: false };
  const n = scene.children.length; const kids = f.group.children.slice(); const mats = kids.map((k) => k.material);
  let first = null;
  for (let i = 0; i < 3600; i++) { frame.x = 30 - i * 0.0055; const a = f.update(1 / 60, i / 60, frame); if (a) { first ??= a; expect(a).toBe(first); } }
  expect(scene.children.length).toBe(n);
  expect(f.group.children).toEqual(kids); expect(f.group.children.map((k) => k.material)).toEqual(mats);
});
it('NO_FIND does nothing', () => { expect(NO_FIND.update(0, 0, {})).toBe(null); expect(() => { NO_FIND.take(); NO_FIND.dispose(); }).not.toThrow(); });
it('the nose: a Twitchy Nose cat standing still near it gets the trail, once per 20 s', () => {
  // session: { find, scent: { trailTo: vi.fn(() => ({})) }, cat: { position }, idleTime: 3, walkTime: 30, autoSniffAt: -Infinity }
  // with skills ['twitchy-nose']: true once, false again at walkTime 40, true at 51; trailTo got the spot and a rand function
  // without the skill, moving (idleTime 0.5), 25 m off, perched, or the find taken: false
});
```

  In `test/audio.test.js`, inside `describe('v18 cues')` or a new `describe('found outfits')`:

```js
it('findChime is three soft notes, rising, quieter than chime', () => {
  const ctx = fakeCtx(); createAudio({ contextFactory: () => ctx }).findChime();
  const f = freqsOf(ctx); expect(f).toHaveLength(3); expect(f[1]).toBeGreaterThan(f[0]); expect(f[2]).toBeGreaterThan(f[1]);
  const peak = (c) => Math.max(...c.created.oscs.map((o) => o.connections[0].gain.scheduled[0])); // each note's own gain, not the bus
  const b = fakeCtx(); createAudio({ contextFactory: () => b }).chime();
  expect(peak(ctx)).toBeLessThan(peak(b));
});
it('findChime is silent when muted', () => { /* setMuted(true) then findChime(): no oscillators */ });
```

  (`freqsOf` is the file's helper at line 512. Lift it out of its `describe` if the new tests sit outside it.)
- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run test/foundlive.test.js test/audio.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `display.js`, `live.js` and `findChime()`. Reuse closure scratch (no `new` in `update` or `tickFindNose`). The twinkle and display materials belong to this find alone, so `take()` may dispose them.
- [ ] **Step 4: Run the tests to verify they pass.** Run: `npx vitest run test/foundlive.test.js test/audio.test.js test/autosniff.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** the four files with message "Found outfits step 1: the find on the ground, its twinkle from 20 m, a soft chime at 6 m and the Twitchy Nose trail".

---

### Task 7: Wearing it mid-walk on both screens

**Files:**
- Create: `src/cat/redress.js`
- Modify: `src/remotecats.js` (`upsert`, lines 99–141)
- Modify: `src/game/netevents.js` (`takeHeldItemsWithRemotes`, lines 36–57)
- Test: `test/redress.test.js`, `test/remotecats.test.js`, `test/netevents.test.js`

**Interfaces:**
- Consumes: `buildCat` (`src/cat/model.js`).
- Produces:
  - `redressCat(cat, breed, accessories, opts = {}) → cat`. The same object comes back.
    - It builds `fresh = buildCat(breed, accessories, opts)`.
    - It **keeps** every child of `cat` that is a Sprite or a Light. That is her own name tag (`owntag.js`), a chat bubble (`chatbubble.js`), and the dusk collar glow (`dusk.js` `collarGlow`).
    - It **removes** every other child and disposes their geometries and materials (not a map whose name starts `surface:`, as `endWalk` skips them).
    - It moves `fresh`'s children into `cat` in order, then the kept ones after them.
    - It sets `cat.userData = { ...cat.userData, ...fresh.userData }`: the new parts win, and runtime keys like `ownTag`, `custom` and `customName` are kept.
    - It sets `cat.scale.copy(fresh.scale)`. Position and rotation are untouched.
  - `remotecats.upsert`: when an existing entry's profile changed, the rebuilt entry starts where the old one stood. It copies `group.position`, `group.rotation.y`, `fromPos`, `toPos`, `fromYaw`, `toYaw`, `pose`, `speed`, `stateAt`, `lastSeenAt` and the `water` state object (`placed` stays true), and starts `tilt` at null.
  - `takeHeldItemsWithRemotes`: its `upsert` wrapper notes the entry's group before the call. If the call returned the same player with a different group, every item whose `holder` was the old group is handed to the new one with `items.hold(item.id, newGroup)`, before `release()` runs.

- [ ] **Step 1: Write the failing tests.**

  In `test/redress.test.js`:

```js
const BARE = { collar: 'bell', head: null, face: null, neck: null, body: null, back: null, feet: null };
it('dresses the same cat object: new hat on, her tag, bubble and glow kept, where she stood', () => {
  const cat = buildCat('tabby', BARE); cat.position.set(3, 0, 4); cat.rotation.y = 1.2;
  const tag = new THREE.Sprite(); cat.add(tag); cat.userData.ownTag = tag;
  const glow = new THREE.PointLight(); glow.name = 'collarGlow'; cat.add(glow);
  const out = redressCat(cat, 'tabby', { ...BARE, head: 'acorncap' });
  expect(out).toBe(cat);
  expect(cat.userData.parts.head.children.some((o) => o.userData.hat === 'acorncap')).toBe(true);
  expect(cat.children).toContain(tag); expect(cat.children).toContain(glow); expect(cat.userData.ownTag).toBe(tag);
  expect([cat.position.toArray(), cat.rotation.y]).toEqual([[3, 0, 4], 1.2]);
  let inside = false; cat.traverse((o) => { if (o === cat.userData.parts.head) inside = true; }); expect(inside).toBe(true);
});
it('throws away the old build: its geometries are disposed and none is left on the cat', () => {
  const cat = buildCat('tabby', BARE); const old = []; cat.traverse((o) => { if (o.isMesh) old.push(o); });
  let disposed = 0; for (const m of old) m.geometry.addEventListener('dispose', () => { disposed += 1; });
  redressCat(cat, 'tabby', { ...BARE, head: 'acorncap' });
  expect(disposed).toBe(old.length);
  const now = new Set(); cat.traverse((o) => now.add(o)); for (const m of old) expect(now.has(m)).toBe(false);
});
it('poses like a fresh build afterwards', () => {
  const a = redressCat(buildCat('persian', BARE), 'persian', { ...BARE, head: 'acorncap' });
  const b = buildCat('persian', { ...BARE, head: 'acorncap' });
  for (const c of [a, b]) { animateCat(c, 'follow', 0, 0, false); c.updateMatrixWorld(true); }
  expect(fingerprintCat(a)).toEqual(fingerprintCat(b));
});
it('works for Hagrid and a builder cat', () => { /* hagrid head acorncap: the two cap meshes are there; a custom look keeps its coat (fingerprint equals buildCat with the same look) */ });
it.each([...Object.keys(CATALOG.cats)])('buildCat makes no Sprite or Light for %s, so the keep rule is safe', (breed) => {
  const c = buildCat(breed, BARE); c.traverse((o) => { expect(o.isSprite || o.isLight).toBeFalsy(); });
});
```

  In `test/remotecats.test.js`:

```js
it('a look change rebuilds the cat where it stood', () => {
  const rc = createRemoteCats(new THREE.Scene());
  rc.upsert({ playerId: 'sib', petName: 'Robin', breed: 'tabby', accessories: {} }, 0);
  rc.applyState({ id: 'sib', pos: [5, -7], yaw: 0.8, pose: 'follow', speed: 0 }, 0); rc.update(0.5, 0.5);
  const before = rc.list[0].group;
  const after = rc.upsert({ playerId: 'sib', petName: 'Robin', breed: 'tabby', accessories: { head: 'acorncap' } }, 0.6);
  expect(after.group).not.toBe(before);
  expect([after.group.position.x, after.group.position.z, after.group.rotation.y]).toEqual([5, -7, 0.8]);
  expect(after.water.placed).toBe(true);
});
```

  In `test/netevents.test.js`, beside "my own held item stays mine when a remote leaves" (line 395):

```js
it('a rebuilt partner keeps what he was carrying', () => {
  // remotes + carryables as that test builds them; items.hold('stick-1', sibGroup);
  // remotes.upsert(the same profile with a new head) → the item's holder is the new group, and it is not gone
});
```

- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run test/redress.test.js test/remotecats.test.js test/netevents.test.js`. Expected: FAIL. `redress.js` does not exist, the rebuilt group sits at the origin, and the stick is gone.
- [ ] **Step 3: Implement** `redressCat`, the carry-over in `upsert` (keep a reference to the old entry before `remove`), and the hand-over in the wrapper.
- [ ] **Step 4: Run the tests to verify they pass.** Run: `npx vitest run test/redress.test.js test/remotecats.test.js test/netevents.test.js test/carryables.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** the six files with message "Found outfits step 1: dressing her cat mid-walk in place, and a partner rebuilt for a new look stays where he stood with what he carried".

---

### Task 8: Granting the find and the card

**Files:**
- Create: `src/foundwear/play.js`, `src/game/findcard.js`
- Modify: `src/discoveries.js` (`AWARDS`), `src/ui/hud.js` (`discoveryText` line 40), `src/ui/backstack.js` (`walkBackAction` line 131)
- Test: `test/foundplay.test.js`, `test/findcard.test.js`, `test/discoveries.test.js`, `test/hud.test.js`, `test/backstack.test.js`

**Interfaces:**
- Consumes: Tasks 2, 3, 5, 6 and 7; `pauseCardFor` (`src/game/walk.js`); `herCatPortrait` (`src/thumbnails.js`); `activeCat`, `scarKey` (`src/customcats.js`); `assignShadowCastersFor` (`src/render/rig.js`); `escapeHtml`; `CATALOG`.
- Produces (`discoveries.js`): `AWARDS.pouch = 5`, with a comment naming the spec's "5 coins". `POUCH_COINS === AWARDS.pouch` is tested.
- Produces (`hud.js`): `discoveryText({ type: 'pouch', label })` returns `label` (it says its own whole line, like the Farm's).
- Produces (`backstack.js`): `walkBackAction({ …, findCard })` returns `'find-later'` when walking with `findCard` true. It is checked after `shop` and before `crossing`.
- Produces (`play.js`):
  - `grantFind(find, arrival, { progression, log }) → Grant | null`.
    - Null when `log.count(FIND_LOG_KEY) > 0` (never twice in a walk).
    - A wear item: `isNew = progression.recordFoundWear(id)`. If `isNew`, the grant is `{ kind: 'wear', id, by, petName }` and the log is marked (`log.mark(FIND_LOG_KEY)`).
    - If she already owned it (say a cloud load mid-walk), it becomes the pouch.
    - The pouch: `points = log.awardOnce('pouch', FIND_LOG_KEY, by === 'me' ? phrase('wear.pouch.found') : phrase('wear.pouch.partner', petName))`, and the grant is `{ kind: 'pouch', points, by, petName }`.
    - Every non-null grant calls `find.take()`.
  - `restoreFind(find, { log })`: `find.take()` when the log already holds `FIND_LOG_KEY`.
  - `findBusy(s) → boolean`: `!s.started || !!s.fight || !!s.crossing || !!s.clanFight?.uiShowing || !!s.findCard`.
  - `handleFindArrival(s, arrival, { progression, log, hud, audio, card }) → Grant | null`.
    - It calls `grantFind`, then `s.fx?.burst(s.cat.position, 0xf2c14e, 14)`.
    - A wear grant plays `audio.fanfare?.()`. If `by === 'me'`, it calls `card.show(s, id)`. Otherwise it shows `hud.toast(phrase('wear.partner.found', petName, CATALOG.accessories[id].name))`.
    - The pouch's sound, floater and toast come from the discovery event.
  - `findCardHtml({ title, name, portrait, emoji, canWear, catName }) → string`. A `<div class="pause-card find-card">` holding:
    - the title (`phrase('wear.card.title')`);
    - the picture (`<img class="find-portrait">` when `portrait`, else `<span class="find-emoji">`);
    - the name;
    - `phrase('wear.card.kept')`;
    - when `canWear`, `<button id="btn-find-wear" class="btn primary">Wear it</button>`; otherwise `phrase('wear.card.henNo', catName)`;
    - `<button id="btn-find-later" class="btn secondary">Later</button>`.
    - Every value is escaped.
- Produces (`findcard.js`):
  - `createFindCard({ getSession, overlay, releaseControl, resumeWalk, progression, getIsTouch, onLookChanged = () => {}, portrait = herCatPortrait, redress = redressSessionCat, catalog = CATALOG }) → { show(s, id), wear(), later(), onLockChange(locked) }`. The card shows Wear it only when `canWearNow(activeCat(state).breed, catalog.accessories[id].slot)`.
    - `show`: sets `s.findCard = { id }`. The portrait is `portrait({ ...state, equipped: { ...state.equipped, [slot]: id } })`. Writes the card into `overlay.innerHTML` and calls `releaseControl()`.
    - `wear`: only with a card up. `progression.equipAccessory(id)`, then `redress(s, progression)`, then `onLookChanged()`. Then it closes the card and calls `resumeWalk()`.
    - `later`: closes the card and calls `resumeWalk()`.
    - Closing means: `overlay.innerHTML = pauseCardFor(s, getIsTouch())` and `s.findCard = null`.
    - `onLockChange(true)` with a card up closes it, the same as Later.
  - `redressSessionCat(s, progression)`: `const a = activeCat(state)`, then `redressCat(s.cat, a.breed, <the seven equipped slots>, { look: a.look, scars: progression.catScars(scarKey(state)) })`, then `assignShadowCastersFor(s.cat)`.

- [ ] **Step 1: Write the failing tests.**

  In `test/foundplay.test.js`, with `createDiscoveryLog(progression)` and a real `createProgression(fakeStorage())`:

```js
const findOf = (item) => ({ item, taken: false, take: vi.fn(function () { this.taken = true; }) });
it('her own find of a new outfit: owned, not worn, marked, the find taken', () => {
  const g = grantFind(findOf({ kind: 'wear', id: 'acorncap' }), { by: 'me' }, { progression, log });
  expect(g).toEqual({ kind: 'wear', id: 'acorncap', by: 'me', petName: undefined });
  expect(progression.state.foundWear).toEqual(['acorncap']); expect(progression.state.equipped.head).toBe(null);
  expect(log.count(FIND_LOG_KEY)).toBe(1);
});
it('never twice in one walk', () => { /* a second grantFind (or one for a partner) returns null and changes nothing */ });
it('the pouch pays 5 🐾 once, in her words or her partner\'s', () => {
  const g = grantFind(findOf({ kind: 'pouch' }), { by: 'partner', petName: 'Robin' }, { progression, log });
  expect(g).toEqual({ kind: 'pouch', points: 5, by: 'partner', petName: 'Robin' }); expect(progression.state.points).toBe(5);
  // the discovery event's label is phrase('wear.pouch.partner', 'Robin')
});
it('an outfit she already owns turns into the pouch', () => { /* recordFoundWear first, then grantFind → kind 'pouch' */ });
it('restoreFind takes the find when the log already holds it', () => {
  log.restore([[FIND_LOG_KEY, 1]]); const f = findOf({ kind: 'pouch' }); restoreFind(f, { log }); expect(f.take).toHaveBeenCalled();
});
it('findBusy', () => {
  expect(findBusy({ started: true })).toBe(false);
  for (const s of [{ started: false }, { started: true, fight: {} }, { started: true, crossing: {} }, { started: true, clanFight: { uiShowing: 'challenge' } }, { started: true, findCard: { id: 'x' } }]) expect(findBusy(s)).toBe(true);
});
it('handleFindArrival: her outfit opens the card, a partner\'s gives a toast', () => { /* card.show spy called with (s, 'acorncap'); partner: hud.toast got 'Robin found it, and there was one for you too: Acorn Cap! It’s in the dress-up at home. 🎁' */ });
it('the card\'s words, with and without Wear it, escaped', () => {
  const html = findCardHtml({ title: 'T', name: '<b>Cap</b>', portrait: null, emoji: '🌰', canWear: false, catName: 'Hagrid' });
  expect(html).toContain('&lt;b&gt;Cap&lt;/b&gt;'); expect(html).not.toContain('btn-find-wear'); expect(html).toContain('Hagrid can’t wear this one');
  expect(findCardHtml({ title: 'T', name: 'Cap', portrait: 'data:x', emoji: '🌰', canWear: true })).toContain('id="btn-find-wear"');
});
```

  In `test/findcard.test.js` (the `test/crossing.test.js` `setup()` shape: a fake overlay, release and resume counters):

```js
it('show pauses the walk with the card; Later puts the pause card back and walks on, not worn', () => { /* s.findCard {id}; overlay has btn-find-later; release 1; later → s.findCard null, resume 1, overlay is pauseCardFor(s, false), equipped.head null */ });
it('Wear it puts it on, dresses her cat in place, re-publishes the profile, then walks on', () => {
  // progression owns acorncap; redress spy; onLookChanged spy → equipped.head 'acorncap', redress called with (s, progression), onLookChanged once, resume 1
});
it('Wear it twice, or with no card, does nothing more', () => {});
it('re-locking the pointer with the card up is Later', () => { /* onLockChange(true) → s.findCard null, not worn */ });
it('Hagrid and a back item: no Wear it on the card', () => { /* equipped.cat 'hagrid', a stand-in record slot 'back' through a stand-in catalog option */ });
```

  The last test passes a stand-in `catalog` with a `back`-slot record. In `test/backstack.test.js`:

```js
it('Back with the card up is Later', () => {
  expect(walkBackAction({ walking: true, findCard: true, engaged: false })).toBe('find-later');
  expect(walkBackAction({ walking: true, shop: true, findCard: true })).toBe('shop-done');
});
```

  In `test/discoveries.test.js`: `expect(AWARDS.pouch).toBe(5); expect(POUCH_COINS).toBe(AWARDS.pouch);`. In `test/hud.test.js`: `expect(discoveryText({ type: 'pouch', label: 'You found a little pouch of 🐾!' })).toBe('You found a little pouch of 🐾!')`.
- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run test/foundplay.test.js test/findcard.test.js test/backstack.test.js test/discoveries.test.js test/hud.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `play.js`, `findcard.js` and the three one-line additions.
- [ ] **Step 4: Run the tests to verify they pass.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** the files with message "Found outfits step 1: giving the find (once a walk, the pouch when she has the set) and the card with Wear it / Later".

---

### Task 9: Wiring it into the walk, the frame, the room profile

**Files:**
- Modify: `src/game/rooms.js` (`roomProfile`, lines 76–79)
- Modify: `src/game/session.js` (`FIELDS`, the "Things in the world" group)
- Modify: `src/game/walk.js`:
  - after `session.goldMice = …` (line 1672), build the find;
  - after `if (resume) restoreFairGames(fairLive, { log });` (line 2272), restore it;
  - after `session.goldMice.dispose();` (line 2540), dispose it.
- Modify: `src/main.js`:
  - the find card beside `crossing = createCrossing(…)` (line 489);
  - the frame check after the golden-mouse block (lines 1158–1164);
  - `tickFindNose` after `tickAutoSniff(session, dt);` (line 1224);
  - the overlay buttons (line 694);
  - `findCard?.onLockChange(locked)` beside `crossing?.onLockChange(locked)` (line 652);
  - `walkBack` (lines 715–733).
- Modify: `test/rooms.test.js:454`
- Test: `test/foundwiring.test.js`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `roomProfile()` returns `{ playerId, petName, ...catProfileFields(...), finds: FIND_KEY }`. `pushProfileNow` (the cloud profile) is unchanged.
  - `FIELDS` gains `['find', "late (walk.js): this walk's find (foundwear/live.js), or NO_FIND"]`, `['findCard', 'late (findcard.js): the find card being shown { id }, or null']` and `['findNoseAt', 'late (foundwear/live.js): walkTime of the last Twitchy Nose trail to the find']`.
  - In `walk.js`:

```js
const findPlan = planFind({
  areaId, isDen, lessonKind: lessonPlan?.kind ?? null, seed: roomSeed ?? soloSeed,
  roster: roomSeed !== undefined ? (roomAtStart?.roster ?? []) : null,
});
session.find = findPlan
  ? createFind(scene, { plan: findPlan, item: pickFindItem(foundWearIn(areaId), progression.state.unlocked.accessories, findPlan.roll), ground, reducedMotion, onNear: () => audio.findChime?.() })
  : NO_FIND;
```

    It is built after the shadow sweep (line 1419), so it is never a caster. On resume: `if (resume) restoreFind(session.find, { log });`. In `endWalk`: `session.find.dispose();`.
  - In `main.js`:
    - `const findFrame = { x: 0, z: 0, pawsY: 0, camera, remotes: null, busy: false }` in `init()` beside `const pawState` (line 862), filled each frame (no allocation). `busy` is `findBusy(session)`;
    - `const arrival = session.find.update(dt, t, findFrame); if (arrival) handleFindArrival(session, arrival, { progression, log, hud, audio, card: findCard });`
    - `tickFindNose(session, dt, progression.state);`
    - `findCard = createFindCard({ getSession: () => session, overlay, releaseControl: () => handleTouchAction('pause'), resumeWalk, progression, getIsTouch: () => isTouch, onLookChanged: () => { rooms.retrackProfile(); pushProfileNow(); } })`;
    - overlay `btn-find-wear` → `findCard.wear()`, `btn-find-later` → `findCard.later()`;
    - `walkBack` passes `findCard: !!session?.findCard` and maps `'find-later'` to `findCard.later()`.

- [ ] **Step 1: Write the failing tests.**

  In `test/foundwiring.test.js` (source scans, comments stripped as `test/clanphrases.test.js` `noComments` does):

```js
it('walk.js plans the find from the room seed or the solo seed, never walkRng, and restores and disposes it', () => {
  const w = noComments(read('src/game/walk.js'));
  expect(w).toMatch(/planFind\(\{[^}]*seed: roomSeed \?\? soloSeed/);
  expect(w).toMatch(/lessonKind: lessonPlan\?\.kind/);
  expect(w).toContain('restoreFind(session.find, { log })');
  expect(w).toContain('session.find.dispose()');
  expect(w.indexOf('session.find = ')).toBeGreaterThan(w.indexOf('assignShadowCasters(scene)'));
});
it('main.js checks the find each frame, after the golden mice, and runs the nose after the treasure sniff', () => {
  const m = noComments(read('src/main.js'));
  expect(m.indexOf('session.find.update(')).toBeGreaterThan(m.indexOf('session.goldMice.checkFind('));
  expect(m.indexOf('tickFindNose(session, dt, progression.state)')).toBeGreaterThan(m.indexOf('tickAutoSniff(session, dt)'));
  for (const s of ["'btn-find-wear'", "'btn-find-later'", 'findCard?.onLockChange(locked)', "'find-later'", 'rooms.retrackProfile()']) expect(m).toContain(s);
});
it('nothing in the find code throws its own dice or reads the clock', () => {
  for (const f of ['src/foundwear/rules.js', 'src/foundwear/live.js', 'src/foundwear/play.js', 'src/foundwear/display.js', 'src/foundwear/spots/index.js', 'src/game/findcard.js']) {
    expect(noComments(read(f)), f).not.toMatch(/Math\.random|walkRng|Date\.now|performance\.now/);
  }
});
it('the room profile carries the spot key; the state message is unchanged', async () => {
  // createRooms as test/rooms.test.js pushing() does: made.roomProfile().finds === FIND_KEY
  // and read('src/main.js') still sends pos: [session.cat.position.x, session.cat.position.z] (no third number)
});
```

  Edit `test/rooms.test.js` line 454: the expected room-profile string ends `…"accessories":{${SLOTS}},"finds":${FIND_KEY}}`. Import `FIND_KEY` from `../src/foundwear/spots/index.js`. Line 456, the cloud push string, stays exactly as it is.
- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run test/foundwiring.test.js test/rooms.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the wiring as listed. Use the quoted code to find each site.
- [ ] **Step 4: Run the tests to verify they pass.** Run: `npx vitest run test/foundwiring.test.js test/rooms.test.js test/session.test.js test/walk.edition.test.js test/walk.visitprize.test.js test/crossing.test.js test/crossinglock.test.js test/walkresume.test.js test/backstack.test.js`. Expected: PASS. `session.test.js` scans for session fields and so catches a missing `FIELDS` entry.
- [ ] **Step 5: Commit** the files with message "Found outfits step 1: the find in every Park and Woods walk, the room profile's spot key, and the card wired into the walk".

---

### Task 10: The dress-up silhouette and "Things to wear" in the Journal

**Files:**
- Create: `src/foundwear/journal.js`
- Modify: `src/ui/dressingroom.js` (`renderSlotPickerHtml`, line 235, before the `a.prize && !owned` branch)
- Modify: `src/ui/homebase.js` (the `journal` case, line 1432)
- Modify: `src/style.css` (beside `.journal-emoji.silhouette`, line 564, and `.pause-card`, line 813)
- Modify: `test/fixtures/series-words-off-home.json`
- Test: `test/dressingroom.test.js`, `test/foundjournal.test.js`

**Interfaces:**
- Consumes: `placeName`, `areaInEdition` (`src/edition.js`); `lower` (`src/bordercross.js`); `phrase`; `escapeHtml`; `foundWearIn` is not used here. Both renderers read `catalog.accessories[id].find` so a stand-in catalog drives the tests.
- Produces:
  - **The dress-up tile**, in `renderSlotPickerHtml`, for an `a.find` item not owned:
    - empty (`''`) when `!areaInEdition(catalog.areas[a.find], state.edition)`;
    - otherwise `<div class="dr-pick locked found-silhouette" role="group" aria-label="${phrase('wear.notYet')}"><span class="found-shape" aria-hidden="true">${emoji}</span><span>${phrase('wear.foundIn', lower(placeName(a.find, edition, catalog)))}</span></div>`.
    - No `data-dr-acc`, no price, no try-on. Owned, it is an ordinary tile.
  - `renderThingsToWearHtml(state, catalog) → string`.
    - Returns `''` when no found outfit is listed.
    - Otherwise `<section class="wear-section"><h3>${phrase('wear.journal.title')} 👒</h3>`, then one `<div class="wear-area"><h4>${placeName}</h4><div class="journal-grid">…</div></div>` per area, in `CATALOG.areas` order.
    - A card is `journal-card spotted` (the emoji and the name) when owned. It is `journal-card unspotted` (a `silhouette` emoji and `wear.foundIn`) when not.
    - An area whose place the edition hides shows only her owned cards, and is left out when she has none.
    - No counts ("1 of 4"): the spec's anti-goal is a list to tick off.
  - `homebase.js` journal case: `${renderThingsToWearHtml(s, CATALOG)}` after `renderJournalHtml(…)`.
  - CSS:
    - `.dr-pick.found-silhouette .found-shape { font-size: 30px; filter: brightness(0); opacity: 0.55; }` (the journal's silhouette look);
    - `.wear-section h3`, `.wear-area h4` in the journal's sizes;
    - `.find-card .find-portrait { width: 160px; height: 160px; }`, and `.find-emoji` at 64px.

- [ ] **Step 1: Write the failing tests.**

  In `test/dressingroom.test.js`, `describe('slot picker')`:

```js
it('an unfound outfit is a silhouette saying where it is found, never a price', () => {
  const html = renderSlotPickerHtml(defaultishState(), CATALOG, 'head', null);
  const tile = html.match(/<div class="dr-pick locked found-silhouette"[^>]*>.*?<\/div>/)[0];
  expect(tile).toContain('Found in City Park'); expect(tile).toContain('🌰');
  for (const no of ['data-dr-acc', '🐾', 'Try on', 'Unlock']) expect(tile).not.toContain(no);
});
it('a found outfit is an ordinary owned tile', () => {
  const s = defaultishState(); s.unlocked.accessories.push('acorncap');
  expect(renderSlotPickerHtml(s, CATALOG, 'head', null)).toContain('data-dr-acc="acorncap" data-dr-act="wear"');
});
it('Legacy hides an unfound outfit of a Clan-only place, and keeps a found one', () => {
  const cat = { ...CATALOG, accessories: { ...CATALOG.accessories, mosscap: { name: 'Moss Cap', slot: 'head', price: 0, prize: true, find: 'woods', emoji: '🌿' } } };
  const s = { ...defaultishState(), edition: 'legacy' };
  expect(renderSlotPickerHtml(s, cat, 'head', null)).not.toContain('🌿');
  expect(renderSlotPickerHtml({ ...s, edition: 'canon' }, cat, 'head', null)).toContain('Found in the Woods');
  s.unlocked.accessories.push('mosscap');
  expect(renderSlotPickerHtml(s, cat, 'head', null)).toContain('data-dr-acc="mosscap"');
});
```

  (The existing "lists every accessory in the slot" test keeps passing: the silhouette's class starts `dr-pick `.)

  In `test/foundjournal.test.js`:

```js
it('a section of its own, the Park\'s cap as a silhouette until found', () => {
  const html = renderThingsToWearHtml({ unlocked: { accessories: [] } }, CATALOG);
  expect(html).toContain('<section class="wear-section">'); expect(html).toContain('Things to wear');
  expect(html).toContain('City Park'); expect(html).toContain('journal-card unspotted'); expect(html).toContain('Found in City Park');
  expect(html).not.toMatch(/\d+\s*(of|\/)\s*\d+/);
});
it('found, it shows its name', () => { /* owned acorncap → 'journal-card spotted' and 'Acorn Cap' */ });
it('Legacy leaves out a Clan-only place unless she found something there', () => { /* the stand-in mosscap catalog */ });
it('nothing to list: nothing drawn', () => { /* a catalog with no find items → '' */ });
it('the home Journal sheet shows it', () => { /* read('src/ui/homebase.js') contains 'renderThingsToWearHtml(s, CATALOG)' */ });
```

- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run test/dressingroom.test.js test/foundjournal.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the tile, `journal.js`, the homebase line and the CSS.
- [ ] **Step 4: Record the everyday-words home fixture and read its diff.** Run `UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords.home.test.js`, then `git diff test/fixtures/series-words-off-home.json`. Expected: only added rows in the `journal` sheets: "Things to wear 👒", the Park's name, "Found in City Park". Then run `npx vitest run test/serieswords.home.test.js test/serieswords.test.js test/offwords.test.js` without the variable. Expected: PASS, with `series-words-on-home.json` unchanged (the new lines carry no series word).
- [ ] **Step 5: Run the tests to verify they pass.** Run: `npx vitest run test/dressingroom.test.js test/dressingroomview.test.js test/dressingroomcontroller.test.js test/foundjournal.test.js test/journal.test.js test/homebase.edition.test.js`. Expected: PASS.
- [ ] **Step 6: Commit** the files with message "Found outfits step 1: an unfound outfit is a silhouette in the dress-up with where it is found, and the Journal's Things to wear".

---

### Task 11: Pictures for the owner, and the full suite

**Files:**
- Create: `verify-finds.html`
- Modify: `.gitignore` (add `!verify-finds.html` with a one-line comment, as the other kept pages have)

**Interfaces:**
- Consumes: everything above, through `/src/...` imports, as `verify-park.html` and `verify-visits.html` do.

The page has five views, picked by buttons in a bottom bar (the `verify-visits.html` `#bar` pattern):
1. **The cap on every cat:** `buildCat` with `head: 'acorncap'` for every `CATALOG.cats` breed and one builder cat, standing and sitting (`defaultPoseCat`), lit by `createSun`/`createFill`. Hagrid wears his own cap.
2. **The find at every spot:** for the Park and the Woods, the real area built, `createFind` at each spot in turn, the camera 6 m off at cat height. Then once more at 20 m, to show the twinkle. Also the pouch at one spot.
3. **The card:** `findCardHtml` with her portrait (`herCatPortrait`), over the pause overlay's CSS. Also Hagrid's card for a back item (a stand-in record).
4. **The dress-up head picker** before and after the find.
5. **The Journal's "Things to wear"** before and after.

- [ ] **Step 1: Write `verify-finds.html`.** Check it in the browser through the Vite dev server: `npx vite --port 5179`, then open `/verify-finds.html`. Each view should draw with no console error.
- [ ] **Step 2: Take the pictures.** Save each view as a PNG under `/private/tmp/…/scratchpad/found-outfits-step1/`. Use the session's browser tools, or `preserveDrawingBuffer` and `canvas.toDataURL()`.
- [ ] **Step 3: Make the short recording** (10–20 s) of the real game. Start a Park walk with `npx vite`. Read `session.find.spot` in the console to know where to walk. Walk up to it: the twinkle, the chime, the card, Wear it, and the cap on the cat walking on. Use the session's screen or browser recording tool. If none is available, take a numbered still sequence instead, and say so in the report.
- [ ] **Step 4: Run the full suite once.** First `uptime` and `sysctl -n hw.ncpu`; if the 1-minute load is over the core count, wait or report. Run: `npx vitest run`. Expected: PASS, every file. If a test outside this plan fails, read it before touching anything. A fixture other than the three named means stop and report.
- [ ] **Step 5: Commit** `verify-finds.html .gitignore` with message "Found outfits step 1: the picture page for the owner (the cap on every cat, the find at every spot, the card, the dress-up and the Journal)". Report the picture and recording paths to the owner. Merge and push wait for his yes.

---

## Self-review (done while writing)

- **Spec coverage:**
  - item records `find: '<area>'`: Task 2;
  - spots for the Park and the Woods: Task 4;
  - the seeded pick, solo and partner: Tasks 5 and 9;
  - glint/twinkle, chime, Twitchy Nose: Task 6;
  - pick-up: Tasks 6 and 8;
  - the celebration with Wear it / Later and mid-walk wearing: Tasks 7–9;
  - the coin pouch: Tasks 5 and 8;
  - the wardrobe silhouette: Task 10;
  - "Things to wear" and its durable record: Tasks 3 and 10;
  - the capability flag: Tasks 4, 5 and 9;
  - one new outfit modelled: Tasks 1 and 2;
  - pictures and a recording: Task 11;
  - not in the den or the guided first walk, but on a crossing walk: Task 5 (`planFind`); a crossing starts an ordinary walk through `startWalk`;
  - never within 15 m of the spawn: Task 4;
  - no map marker: nothing touches `minimap.js`;
  - Hagrid: Tasks 2, 5 and 8;
  - names in the word tables: Task 2.
- **Types:**
  - `Arrival { by, playerId, petName }` is made in Task 6 and read in Task 8.
  - `Grant` is made and read in Task 8.
  - `plan { areaId, spot, roll }` is made in Task 5 and read in Tasks 6 and 9.
  - `FIND_LOG_KEY` is the one key in Tasks 5, 8 and 9.
  - `findCard` is the session field in Tasks 8 and 9 and in `walkBackAction`.
- **Proportion:** code blocks are tests and the few bodies the spec fixes (phrases, the walk.js call). Model geometry, the card's markup and the CSS are left to the implementer, with their values pinned.
