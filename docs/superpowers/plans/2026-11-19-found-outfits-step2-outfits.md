# Found outfits, step 2: the outfits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Model, fit and register the 23 street-area found outfits (the Acorn Cap is already built), so each one is worn on every cat shape, on Hagrid where he can, as a little thing on the ground where it is found, and in picture sheets per cat for the owner and his daughter to approve.

**Architecture:**
- **One seam task first (Task 1), then five slot lanes in parallel.** Task 1 gives every slot group a cat-side file of its own (`src/cat/foundhead.js`, `foundface.js`, `foundneck.js`, `foundbody.js`, `foundfeet.js`) with empty tables, and puts one hook per slot into `src/cat/model.js` (cat and Hagrid). From then on a slot lane touches only its own files. Hats go through `src/cat/hats.js` (as the Acorn Cap did), the hay-bale pack through `src/cat/backitems.js`.
- **The ground look comes free.** Task 1 makes `wornPieces(id)` in `src/foundwear/display.js`: it dresses a simple tabby, keeps the pieces the hooks tagged `userData.foundWear`, and drops the rest. Every slot uses it, so a lane writes no ground code (one exception: the jumper's folded look).
- **Only what can be found shows as "not found yet".** An outfit whose place has no find spots yet stays out of sight in the dress-up and the Journal until step 3 gives the place its spots.

**Tech Stack:** Plain ES modules, Three.js 0.185, Vite 8, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-11-19-found-outfits-design.md`, "Build order" item 2. Step 1's plan, `docs/superpowers/plans/2026-11-19-found-outfits-step1.md`, "Seams for steps 2 and 3", is the contract this plan builds on. Read both.

## What this step makes findable

Only the Park and the Woods have find spots. Spots for every other place are step 3.

| | Outfits | Count |
|---|---|---|
| **Findable when step 2 merges** | **City Park:** Acorn Cap (built in step 1), Daisy Chain, Kite-tail Ribbon, Puddle Wellies | 4 (3 new) |
| Built here, findable once step 3 gives the place spots | **Neighborhood:** Paperboy Cap, Garden Glove Scarf, Bottle-top Collar, Doormat Cape. **Seaside:** Bucket Hat, Starfish Clip, Sailor's Shell Necklace, Beach-towel Cape. **Docks:** Sailor Cap, Rope Collar, Anchor Charm, Fisherman's Jumper. **Farm:** Straw Hat, Feather Plume, Gingham Neckerchief, Hay-bale Backpack. **Fairground:** Striped Boater, Heart-shaped Glasses, Ticket-stub Garland, Candyfloss Puff | 20 |
| **Held back: they wait for Legacy Edition's retirement** (spec, Build order 0) | **Woods:** Bird's-nest Hat, Moss Mantle, Pinecone Charm, Fern Fan. **River:** Lily-pad Hat, Reed Scarf, Pebble Collar, Kingfisher Feather. **Moor:** Heather Crown, Shepherd's Shawl, Peat-stone Charm, Bog-cotton Tufts. **Pines:** Woolly Bobble Hat, Pine-sprig Scarf, Snow Goggles, Sled Cape. **Gorge:** Climber's Helmet, Rope Harness, Crystal Charm, Eagle Feather | 20, not in this plan |

- **The Woods keeps giving the 5 🐾 pouch on every walk** (the owner's choice), because its four outfits are among those held back.
- The held-back twenty get their own short plan once Legacy is retired. It reuses this plan's seams unchanged: one record per outfit plus its slot file's entry.
- **Optional Task 14 (flagged; it needs the owner's yes):** the Neighborhood's find spots, the smallest piece of step 3. Without it, step 2 makes only three new outfits findable. With it, the home place every child starts in hides four more, in both editions.

## Questions only the owner can answer (none blocks Tasks 1–13)

1. **Names, looks and emoji**, from the sheets, with his daughter. An id is fixed once it ships; a name is one phrase row and can change any time. The draft names that most invite a change: Doormat Cape, Bottle-top Collar, Garden Glove Scarf, Candyfloss Puff.
2. **Task 14:** add the Neighborhood's spots now, so four more outfits are findable at merge? Or keep step 2 to the Park?
3. **The twenty territory outfits:** wait for Legacy's retirement as the spec says, or model them now and keep them unregistered until then?
4. **The Hay-bale Backpack is only a look.** It does not carry 3 as the Tiny Backpack does. Is that right?

## Global Constraints

- **Work only in** `/Users/pniessen/CLAUDE-CODE/projects/cat-game/.claude/worktrees/found-outfits-2`, on branch `found-outfits-2`. Never touch the main checkout. Never merge, never push. The owner's yes is needed for both.
- **Tests:** `node_modules` is already symlinked. Run single files with `npx vitest run test/<file>`. The full suite (`npx vitest run`) runs once, in Task 13, and only after `uptime` shows a 1-minute load under `sysctl -n hw.ncpu`.
- **Commits:** `git add <exact paths>`, never `-A` or `.`. Every message ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **No database, no `.env` files.** Offline-first. `SAVE_VERSION` stays 4. `foundWear` already takes any record with `find`, so the save needs no change.
- **No room or network change.** `FIND_KEY` stays as it is: records are not in it, only spots. Optional Task 14 changes it on purpose.
- **Ids:** 3 to **16** lowercase letters. `WEAR_ID` allows 20, but the colony's server check (`docs/supabase-colony.sql`, `colony_dress`: `p_item !~ '^[a-z]{1,16}$'`) refuses anything longer when a child dresses a colony cat. Ids are the table's below, exactly. They never change once shipped.
- **Names** are `phrase('wear.<id>.name')` rows in the later table of `src/clanphrases.js`. Task 1 adds all 22 new rows at once, so no lane touches the phrase table. They read the same in both word sets. None may use a series word (`test/helpers/offwords.js` `bannedIn` is the judge).
- **No perks.** A found outfit only looks. The perks keyed on exact shop ids (`'backpack'` carries 3 in `walk.js`, `'booties'` in `avatar.js`, `'bandana'` in `main.js`, the Glow Collar) stay on those ids alone. The Hay-bale Backpack carries 2, like no pack.
- **Cost of one worn outfit** (older iPads; the scene is draw-call bound): it adds **at most 4 meshes** to a cat, full and simple. A hat is exactly 1, as `test/cathats.test.js` already requires. It adds **at most 900 triangles full and 450 simple**, the hat rule, with two exceptions:
  - a coat shell (kind `'shell'`) adds no more than the Striped Sweater does;
  - a pack adds no more than the Tiny Backpack's budget (1200 full, 600 simple).
  On Hagrid it adds at most 4 meshes. Its ground look stays under 600 triangles (step 1's rule in `test/foundlive.test.js`). Task 1's `test/foundwearfit.test.js` checks all of it for every record.
- **Area ceilings stay** as `test/budget.test.js` has them. The ground look is not in an area's build. The Woods' static build is 68,810 of 70,000 triangles (`test/woodssouth.test.js` pins it), so the dearest ground look (< 600) still fits under the ceiling. Task 1 adds that sum as a test.
- **Never reads as something else on the walk** (step 1's `display.js` header). No material is emissive. No colour is the yarn ball's `0x5b7fc7` or the treasures' `0xf25c8a`.
- **Determinism:** no `Math.random`, `walkRng`, `Date.now` or `performance.now` in `src/foundwear/` or the new `src/cat/found*.js` files. Task 1 extends step 1's source scan to cover them.
- **Every cat shape** means the ten presets (`PRESETS` in `test/helpers/catfingerprint.js`: the slim Siamese, the small-eared Persian, the large Maine Coon, the four family cats and Digit's narrow, long-legged frame), builder cats (short, fluffy and long fur at sizes 0.85 to 1.15), and Hagrid for head, face, neck and collar. Kittens (`kitten.js`, Mochi) never wear outfits.
- **Fixtures. Only these change, each in the task named:**
  - `test/fixtures/series-words-on-later.json`: the 22 name rows, once (Task 1). Re-record with `UPDATE_OFF_SNAPSHOT=1 npx vitest run test/offwords.test.js`.
  - `test/fixtures/accessory-mesh-delta.json`: one key per new outfit, in `CATALOG.accessories` order, which is `FOUND_WEAR`'s order (Tasks 2–9).
  - `test/fixtures/series-words-off-home.json`: the Journal's Park rows, one emoji, one aria-label and one "Found in City Park" per Park outfit (Tasks 5, 8, 9), and the rows Task 10 removes (none today: the Woods has spots and no records). Re-record with `UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords.home.test.js`.
  - After every re-record, read `git diff` on the fixture. Rows are only added, none changed or removed (except where named). If anything else moved, stop and report.
  - `test/fixtures/catgolden.json` and `test/fixtures/catpose-baseline.json` must **not** change. Task 1 is a refactor, and the golden test proves it.
- **Merging parallel lanes:** `accessory-mesh-delta.json` is the one file every lane adds to.
  - On a conflict, take either side.
  - Then `rm test/fixtures/accessory-mesh-delta.json && RECORD_BASELINE=1 npx vitest run test/catpose.test.js`. It writes the file only when it is missing.
  - Check that `git diff` shows only the new keys.
  - `test/hagrid.test.js` `DELTA` and `series-words-off-home.json` conflicts: keep both sides, then re-record the home fixture.
- **Line numbers** below are from `474af1ab`. Find each site by the quoted code.

## Review Focus

1. **Her partner is on an older build** (step 1 only) when she wears a new found outfit on a co-walk.
   - Expected: on his screen her cat builds without it and nothing throws. An unknown collar shows as today's plain red ring.
   - Test: Task 1, `unknown ids in every slot build a plain cat and tag nothing`.
2. **She wears it mid-walk** with "Wear it", for a body, back or feet outfit. Step 1 only tried a hat.
   - Expected: `redressCat` gives exactly the fresh build, the cape's clasp included, and it keeps laying every frame.
   - Test: Task 1, `redressCat gives the fresh build for every found outfit` (it runs over every record, so each lane's records join it).
3. **A found outfit worn with the shop's items in the other slots:** a found cape under the Tiny Backpack, the jumper under the hay-bale pack, a found charm collar under any cape, a found neck piece with a found collar.
   - Expected: nothing pokes through. The cape's clasp hides under a charm, as it does for the bell. Fur tufts stay under a found coat or cape.
   - Tests: Task 7, `a found cape or the jumper is a cover`; Task 6, `a cape over the Anchor Charm hides its clasp`; Task 8, the hay-bale pack's cover sweep over the found covers.
4. **Hagrid picks up a body, back or feet outfit,** or a partner's arrival gives him one.
   - Expected: he gets the card's "can't wear this one" line, and his build is unchanged. A head, face, neck or collar outfit sits on him.
   - Tests: Task 1's Hagrid row in `test/foundwearfit.test.js`, and each lane's `DELTA` entries (0 for the slots he skips).
5. **The dress-up and the Journal before step 3.**
   - Expected: no "Found in the Seaside" for a place with no find spots, so no child hunts for something that is not there. What she owns always shows.
   - Test: Task 10.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/cat/wearkind.js` | create | `bodyKind`, `isPack`, `isCharmed`, `hasEntry`: what kind of cover or charm an id is, base and found. |
| `src/cat/foundhead.js` | create | `addFoundHenHead`: Hagrid's found hats. The cat's found hats live in `hats.js`. |
| `src/cat/foundface.js` | create | `addFoundFace`: found face pieces, cat and Hagrid. |
| `src/cat/foundneck.js` | create | `addFoundNeck` (neck pieces, cat and Hagrid) and `FOUND_COLLARS` (read by `buildCollar`). |
| `src/cat/foundbody.js` | create | `FOUND_BODY` (capes and coat shells), `FOUND_FLOATS` (things that float over the back), `buildFoldedJumper`. |
| `src/cat/foundfeet.js` | create | `FOUND_FEET`. |
| `src/cat/model.js` | modify | One hook per slot for the cat and Hagrid; `tagFound`; `capeOn` and `coatShell` take a painter; the kind checks read `wearkind.js`. |
| `src/cat/cape.js` | modify | `capeGeometry` records its grid (`userData.grid`). |
| `src/cat/tufts.js`, `src/thumbnails.js` | modify | Read `wearkind.js` in place of id lists. `thumbnails.js` also draws a found outfit's picture only once it is owned (Task 11). |
| `src/cat/hats.js` | modify | Seven hats (Tasks 2, 3). |
| `src/cat/backitems.js` | modify | The Hay-bale Backpack (Task 8). |
| `src/foundwear/head.js`, `face.js`, `neck.js`, `body.js`, `feet.js` | modify | The records, appended in their lane's order. |
| `src/foundwear/display.js` | modify | `wornPieces`, `isPieceOf`, `DISPLAY_BY_ID`; every slot in `DISPLAY_BY_SLOT`. |
| `src/clanphrases.js` | modify | The 22 name rows. |
| `src/ui/dressingroom.js`, `src/foundwear/journal.js` | modify | Hide "not found yet" for a place without spots (Task 10). |
| `src/ui/dressingroomview.js`, `src/ui/homebase.js` | modify | Fill owned found outfits' pictures (Task 11). |
| `verify-wear.html`, `.gitignore` | create / modify | The picture sheets (Task 12). |
| `test/foundwearfit.test.js` | create | Every record on every shape: cost, safety, Hagrid, redress, names (Task 1). |
| `test/catcape.{fur,sit,tail,tie}.{doormatcape,beachtowelcape}.test.js`, `test/catbackitems.haybalepack.test.js` | create | Existing sweeps, one file per item (Tasks 7, 8). |

---

## The outfits

The draft names are the spec's. The owner and his daughter may change any name, look or emoji from the picture sheets. A name change is one phrase row; the id stays.

| id | Name | Slot | Place | Emoji | Look (colours) | Hagrid |
|---|---|---|---|---|---|---|
| `paperboycap` | Paperboy Cap | head | neighborhood | 🧢 | soft eight-panel newsboy cap, puffed crown leaning forward, short stiff peak, button on top (panels `0x7d6b58`/`0x6b5a48`, peak and button `0x4e4136`) | yes |
| `buckethat` | Bucket Hat | head | seaside | 🪣 | round soft crown, sloping brim all round, two stitched rings on the brim, ears through holes (`0xe9c46a`, stitching `0xc89b3c`) | yes |
| `sailorcap` | Sailor Cap | head | docks | ⛵ | flat round white top, navy band, short black peak, a gold badge dot (`0xf2f2ee`, band `0x24365c`, peak `0x1c1c22`, badge `0xf2c14e`) | yes |
| `strawhat` | Straw Hat | head | farm | 👒 | wide-brimmed farmer's straw hat, round crown, red band (weave checker `0xe3c26b`/`0xcfa94e`, band `0xc0392b`) | yes |
| `stripedboater` | Striped Boater | head | fair | 🎪 | stiff boater: flat top, straight sides, flat brim, red-and-white striped band (`0xe8cf86`, band `0xe2433a`/`0xf5f5f5`) | yes |
| `starfishclip` | Starfish Clip | head | seaside | ⭐ | a small five-armed starfish clipped flat on the head beside the right ear (`0xf28a3c`, dots `0xf7c08a`) | yes |
| `featherplume` | Feather Plume | head | farm | 🪶 | one long russet feather tucked upright behind the left ear, curving back, with a little band (`0xa0522d` to tip `0x3b2a20`, quill `0xf2e6c8`) | yes |
| `heartglasses` | Heart-shaped Glasses | face | fair | 💕 | two heart lenses on a red frame with a bridge, built like the Star Sunglasses (frame `0xe2433a`, lens `0xffb3c8`) | yes |
| `daisychain` | Daisy Chain | neck | park | 🌼 | nine daisies round the neck on a thin green stem ring; the flowers are ONE vertex-coloured mesh (petals `0xf8f8f0`, centres `0xf2c14e`, stem `0x5a9a3c`) | yes |
| `gardenglovescarf` | Garden Glove Scarf | neck | neighborhood | 🧤 | a green check scarf knotted at the front, a flowered gardening glove tucked in the knot (`0x6a9a4a`/`0x88b868`, glove `0xf2d7a0`, flowers `0xe27a9a`) | yes |
| `shellnecklace` | Sailor's Shell Necklace | neck | seaside | 🐚 | a cord of small shells, one big scallop at the front (cord `0x8a6a4a`, shells `0xf6e7d2`/`0xf2c6b0`, scallop `0xf7d9c4`) | yes |
| `neckerchief` | Gingham Neckerchief | neck | farm | 🧣 | a gingham triangle tied at the throat, its point down the chest, laid like the bandana's (checks `0xd8403a`/`0xf5f0e8`) | yes |
| `ticketgarland` | Ticket-stub Garland | neck | fair | 🎟️ | little paper ticket stubs on a string round the neck (`0xf7c93b`, `0xe2433a`, `0x4eb86a`, `0xf08a2c`; string `0xf5f5f5`) | yes |
| `bottletopcollar` | Bottle-top Collar | collar | neighborhood | 🔘 | a dark band with crimped bottle caps all round, in the ring's plane like the studs (band `0x3a3a42`, caps `0xc8ccd4`/`0xd84040`). Not a charm. | yes |
| `ropecollar` | Rope Collar | collar | docks | 🪢 | a twisted two-tone rope ring with a knot at the throat (`0xc8a46a`/`0x9a7a48`). Not a charm. | yes |
| `anchorcharm` | Anchor Charm | collar | docks | ⚓ | a navy collar with a small silver anchor at the throat (band `0x24365c`, anchor `0xc8ccd4`). A charm. | yes |
| `doormatcape` | Doormat Cape | body | neighborhood | 🏠 | a cape of bristly coir doormat with a dark border (coir `0xb8864a`; border `0x6b4a2a` where `|a| > 0.85` or `s > 0.88`; clasp accent `0x6b4a2a`) | no |
| `beachtowelcape` | Beach-towel Cape | body | seaside | 🏖️ | a towel cape in broad stripes along `s` (`0xf28a3c`, `0xf7e7c6`, `0x2fa6a0`; accent `0xf2c14e`) | no |
| `fishermansjumper` | Fisherman's Jumper | body | docks | 🧶 | a cream cable-knit coat shell: raised-looking cables in darker bands along the back, ribbing at hem and neck (`0xece3cf`, cables and ribbing `0xd6cbb2`). On the ground: a folded jumper. | no |
| `kitetailribbon` | Kite-tail Ribbon | back | park | 🪁 | a kite's tail tied at the root of the tail, floating up and back like the Tail Balloon, four bows along the string (string `0xf5f5f5`, bows `0xe2433a`, `0xf7c93b`, `0x4eb86a`, `0xf08a2c`) | no |
| `haybalepack` | Hay-bale Backpack | back | farm | 🌾 | a little hay bale strapped on like the Tiny Backpack: rounded box, two twine bands, a few loose strands (`0xd9b75a`/`0xb8963e`, twine `0x8a6a3a`, straps `STRAP_GREY`) | no |
| `candyflosspuff` | Candyfloss Puff | back | fair | 🍭 | a pink candyfloss cloud on a paper stick, floating over the shoulders like the Party Balloon (`0xf7b6d2`, lumps `0xf2a0c0`, stick `0xf5f0e0`) | no |
| `puddlewellies` | Puddle Wellies | feet | park | 👢 | tall yellow wellies with a red sole band, taller than the Rain Boots (paw `0xf5c842` scaled `(1.15, 1.5, 1.15)`, band `0xd8403a` at `PAW_Y`) | no |

`FOUND_WEAR`'s order, and so `CATALOG.accessories`' tail and the mesh-delta fixture's order:
- `head.js`: `acorncap`, Task 2's five in the table's order, then Task 3's two.
- `face.js`: `heartglasses`.
- `neck.js`: Task 5's five necks, then Task 6's three collars.
- `body.js`: Task 7's three, then Task 8's three.
- `feet.js`: `puddlewellies`.

---

## The seam (Task 1's interfaces, used by every lane)

- **`src/cat/wearkind.js`** (imports `backitems.js`, `foundbody.js`, `foundneck.js`; no `model.js`):
  - `hasEntry(table, id) → boolean`: `typeof id === 'string' && Object.hasOwn(table, id)`.
  - `bodyKind(id) → 'shell' | 'cape' | null`: `hoodie`, `raincoat` and `sweater` are `'shell'`; `cape` and `confetticape` are `'cape'`; a `FOUND_BODY` entry gives its own `kind`.
  - `isPack(id) → boolean`: `BACK_ITEM_IDS.includes(id)` (`backitems.js`).
  - `isCharmed(style) → boolean`: `bell`, `heart`, `tag` and `sparklecollar` (today's `CHARMED`), or a `FOUND_COLLARS` entry with `charmed: true`.
- **`src/cat/foundhead.js`:** `addFoundHenHead(head, id, { k, y, rx, rz, ringY = y }) → void`. The same anchors as `addPrizeHead`. Unknown ids add nothing.
- **`src/cat/foundface.js`:** `addFoundFace(head, id, { k, x, y, z, starZ, skull }) → void`. The same anchors as `addPrizeFace`, for the cat and for Hagrid.
- **`src/cat/foundneck.js`:**
  - `addFoundNeck(head, id, { k, y, z, ringR, ringBack = 0, tilt }) → void`. The same anchors as `addPrizeNeck`, plus `tilt`: both call sites pass `NECK_RING_TILT` (it lives in `model.js`, which imports this file, so it comes in as an argument). **A piece that goes round the neck is a `TorusGeometry` mesh** tipped by `Math.PI / 2 - tilt`, as the scarf's band is, so Hagrid's `ringTheNeck` re-rings it.
  - `FOUND_COLLARS: { [style]: { ring: hex, charmed: boolean, dress(group, ring, { ringR, tubeR, charmPos }) → void } }`. `dress` adds the collar's pieces: on `ring` (in its plane, as the studs do) or on `group` at `charmPos` (as a charm).
- **`src/cat/foundbody.js`:**
  - `FOUND_BODY: { [id]: { kind: 'cape', colour, accent, paint?: (a, s) → hex } | { kind: 'shell', colour, paint?: (ux, uy, uz) → hex } }`. `a` runs across the cape (-1 to 1), `s` along it (0 at the neck, 1 at the hem). `ux, uy, uz` is the shell vertex's unit direction (`geo.userData.unit`).
  - `FOUND_FLOATS: { [id]: (kit) → void }`. `kit` is `{ onBack, floatOn, floatString, ball, mat }`, the closures `model.js` already uses for the balloons.
  - `buildFoldedJumper() → THREE.Mesh` (Task 7).
- **`src/cat/foundfeet.js`:** `FOUND_FEET: { [id]: (legs, { plainPaw, mat, PAW_Y }) → void }`. The paw lift for a taller paw (`model.js`, "A feet item that makes the paw taller") already runs after it.
- **`model.js` hooks** (Task 1). Each tags every mesh it adds with `userData.foundWear = id` through `tagFound(objs, id)`, a `traverse` that sets it on each mesh.
  - **Collar** (`buildCollar`): when `hasEntry(FOUND_COLLARS, style)`, the ring takes `ring` and `dress` runs after the built-in branches. The whole group is tagged. It is the same function for the cat and for Hagrid.
  - **Head:** the cat's found hats are `hats.js` `BUILD` entries, no hook (the hat mesh carries `userData.hat`). Hagrid gets `addFoundHenHead(head, accessories.head, { k: 0.82, y: 0.2, rx: 0.09, rz: 0.06, ringY: 0.115 })`, right after his `addPrizeHead`.
  - **Face:** `addFoundFace` right after each `addPrizeFace`, with that call's own anchors.
  - **Neck:** `addFoundNeck` right after each `addPrizeNeck`, with that call's own anchors.
    - The cat's goes inside the same `neckFrom` window, so the animator carries it as neckwear.
    - Hagrid's goes into the same `prizeNeck` group, before its tori are re-rung.
  - **Body:** after `else if (accessories.body === 'sweater')`, `else if (hasEntry(FOUND_BODY, id))`. A cape entry runs `capeOn(colour, accent, paint)`; a shell entry runs `coatShell(colour, paint)`.
  - **Back, packs:** `isPack(accessories.back)` replaces the three-id test at both sites (`tuck` and the build), so the hay-bale pack is built by `buildBackItem` like the others. Its meshes carry `userData.backItem` already.
  - **Back, floats:** after `else if (accessories.back === 'balloon')`, `else if (hasEntry(FOUND_FLOATS, id))`. It tags what it added to `g`.
  - **Feet:** after `else if (accessories.feet === 'socks')`, `else if (hasEntry(FOUND_FEET, id))`. It tags each leg's paw and what it added to the leg.
  - **The cover tests read `wearkind`:** `isCape`/`isShell` become `bodyKind(...) === 'cape'` / `'shell'`, and the cape clasp's `taken` is `isCharmed(collarStyle) || !!accessories.neck`.
- **`capeOn(color, accent, paint = null)`:** with a `paint`, both cloths (stand and sit) get a colour attribute from `paint(-1 + 2i/na, j/ns)` over the grid that `capeGeometry` now records as `geo.userData.grid = [na, ns]`. The material is then `litMaterial(0xffffff, { vertexColors: true })`, double-sided.
- **`coatShell(color, paint)`:** `paint === true` is today's sweater, unchanged. The sweater's painter becomes a named function. A function paints each vertex with `paint(ux, uy, uz)`.
- **`src/foundwear/display.js`:**
  - `isPieceOf(obj, id) → boolean`: `obj.isMesh` and one of `userData.foundWear`, `userData.hat` or `userData.backItem` equals `id`.
  - `wornPieces(id) → THREE.Group | null`. It does these steps:
    1. Build `buildCat('tabby', { ...BARE, [slot]: id }, { simple: true })`, where `slot` is `foundRecord(id).slot`.
    2. Pose it with `animateCat(cat, 'follow', 0, 0, false)` and `updateMatrixWorld(true)`, so a cape's clasp and bands are laid.
    3. `attach` each mesh where `isPieceOf` holds into a new group named `wear:<id>`. For `feet`, only the front pair: `legs[0]` and `legs[1]`.
    4. Return `null` when nothing is tagged. The rest of the cat is dropped; it was never drawn.
  - `DISPLAY_BY_SLOT` gains `face`, `neck`, `collar`, `body`, `back` and `feet`, each `wornPieces`. `head` stays `buildHat`.
  - `DISPLAY_BY_ID = Object.freeze({})`. `buildFindDisplay` checks it before `DISPLAY_BY_SLOT`. Task 7 adds the jumper.

---

### Task 1: The seams, the names and the gate every outfit passes

**Files:**
- Create: `src/cat/wearkind.js`, `src/cat/foundhead.js`, `src/cat/foundface.js`, `src/cat/foundneck.js`, `src/cat/foundbody.js`, `src/cat/foundfeet.js`. The tables are `Object.freeze({})`. Each file has a header naming its slot, its anchors and the rules above.
- Modify: `src/cat/model.js`:
  - `CHARMED` (line 114);
  - `buildCollar` (line 455);
  - `buildChicken`'s `addPrize*` calls (lines 946–951);
  - the cat's `addPrizeFace` and `addPrizeNeck` (lines 1941–1943);
  - `coatShell` (line 1978) and `tuck` (line 2012);
  - `capeOn`, `taken` (line 2061), the body chain (line 2088) and the back chain (line 2117), the balloons (line 2152);
  - the feet chain (line 2207).
- Modify: `src/cat/cape.js` (`capeGeometry`, line 65), `src/cat/tufts.js` (`tuftPlan`, line 91), `src/thumbnails.js` (`accessoryFraming`, line 61: `rotY` is `-2.4` when `isPack(id) && id !== 'wings'`, which keeps today's pictures and turns a found pack to its back).
- Modify: `src/foundwear/display.js`, `src/clanphrases.js` (the 22 rows after `'wear.acorncap.name'`), `test/fixtures/series-words-on-later.json`.
- Modify: `test/foundwear.test.js`:
  - line 78 becomes `expect(Object.keys(CATALOG.accessories).slice(-FOUND_WEAR_IDS.length)).toEqual([...FOUND_WEAR_IDS])`;
  - line 90 becomes `expect(foundWearIn('park')[0].id).toBe('acorncap')` plus every entry's `find` being `'park'`.
- Modify: `test/foundwiring.test.js` line 69: the scan list also takes every `src/cat/found*.js` (`globSync`).
- Test: `test/foundwearfit.test.js` (create), `test/foundlive.test.js`.

**Interfaces:**
- Consumes: `FOUND_WEAR`, `foundRecord` (`src/foundwear/index.js`); `HEN_SLOTS` (`rules.js`); `redressCat`; `PRESETS`, `meshCount`, `triangles`, `fingerprintCat` (`test/helpers/catfingerprint.js`); `withOffWords`, `bannedIn` (`test/helpers/offwords.js`); `DEFAULT_LOOK` (`customcats.js`).
- Produces: everything in "The seam" above.

- [ ] **Step 1: Write the failing tests** in `test/foundwearfit.test.js`. Every `it.each` runs over `FOUND_WEAR`, so each lane's records join it with no test edits.

```js
const BARE = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null };
const SHAPES = [...PRESETS.map((b) => [b, {}]),
  ['tabby', { look: { ...DEFAULT_LOOK, fur: 'short', size: 1 } }],
  ['tabby', { look: { ...DEFAULT_LOOK, fur: 'fluffy', size: 1.15 } }],
  ['tabby', { look: { ...DEFAULT_LOOK, fur: 'long', size: 0.85 } }]];
const IDS = FOUND_WEAR.map((r) => [r.id, r.slot]);
const pieces = (cat, id) => { const out = []; cat.traverse((o) => { if (isPieceOf(o, id)) out.push(o); }); return out; };
const kindCap = (id, slot, simple) => {
  if (slot === 'body' && bodyKind(id) === 'shell') return triangles(buildCat('tabby', { ...BARE, body: 'sweater' }, { simple })) - triangles(buildCat('tabby', BARE, { simple }));
  if (slot === 'back' && isPack(id)) return simple ? 600 : 1200;
  return simple ? 450 : 900;
};

it.each(IDS)('%s (%s): an id the colony server takes, a name clean in both word sets', (id) => {
  expect(id).toMatch(/^[a-z]{3,16}$/);
  const r = foundRecord(id);
  expect(bannedIn(r.name())).toBe(null);
  expect(withOffWords(() => r.name())).toBe(r.name());
});
it.each(IDS)('%s (%s): on every shape it builds, shows, and costs at most 4 meshes and its triangles', (id, slot) => {
  for (const [breed, opts] of SHAPES) for (const simple of [false, true]) {
    const bare = buildCat(breed, BARE, { ...opts, simple }), worn = buildCat(breed, { ...BARE, [slot]: id }, { ...opts, simple });
    expect(pieces(worn, id).length, `${breed} ${simple}`).toBeGreaterThan(0);
    expect(meshCount(worn) - meshCount(bare), `${breed} ${simple}`).toBeLessThanOrEqual(4);
    expect(triangles(worn) - triangles(bare), `${breed} ${simple}`).toBeLessThanOrEqual(kindCap(id, slot, simple));
  }
});
it.each(IDS)('%s (%s): standing, sitting and napping, nothing of it goes into the ground', (id, slot) => {
  for (const breed of PRESETS) for (const st of ['follow', 'perch', 'requestPet', 'nap']) {
    const cat = buildCat(breed, { ...BARE, [slot]: id }); animateCat(cat, st, 1.3, 0, false); cat.updateMatrixWorld(true);
    for (const m of pieces(cat, id)) expect(new THREE.Box3().setFromObject(m).min.y, `${breed} ${st}`).toBeGreaterThanOrEqual(-0.01);
  }
});
it.each(IDS)('%s (%s): Hagrid wears it only in his four slots, at most 4 meshes', (id, slot) => {
  const n = meshCount(buildCat('hagrid', BARE)) , d = meshCount(buildCat('hagrid', { ...BARE, [slot]: id })) - n;
  if (HEN_SLOTS.includes(slot)) { expect(d).toBeGreaterThan(0); expect(d).toBeLessThanOrEqual(4); } else expect(d).toBe(0);
});
it.each(IDS)('%s (%s): no glow, never the yarn ball\'s blue or a treasure\'s pink', (id, slot) => {
  const cat = buildCat('tabby', { ...BARE, [slot]: id });
  for (const m of pieces(cat, id)) {
    expect(m.material.emissive?.getHex() ?? 0).toBe(0);
    expect([0x5b7fc7, 0xf25c8a]).not.toContain(m.material.color?.getHex());
    const c = m.geometry.attributes.color;
    if (c) for (let i = 0; i < c.count; i++) expect([0x5b7fc7, 0xf25c8a]).not.toContain(new THREE.Color(c.getX(i), c.getY(i), c.getZ(i)).getHex());
  }
});
it.each(IDS)('%s (%s): redressCat gives the fresh build for every found outfit', (id, slot) => {
  for (const breed of ['tabby', 'digit', 'hagrid']) {
    const acc = { ...BARE, [slot]: id };
    expect(fingerprintCat(redressCat(buildCat(breed, BARE), breed, acc))).toEqual(fingerprintCat(buildCat(breed, acc)));
  }
});
it('unknown ids in every slot build a plain cat and tag nothing', () => {
  const junk = Object.fromEntries(Object.keys(BARE).map((k) => [k, 'nosuchthing']));
  for (const breed of ['tabby', 'hagrid']) {
    const cat = buildCat(breed, junk, { simple: true });
    expect(pieces(cat, 'nosuchthing')).toEqual([]);
  }
  const red = []; buildCat('tabby', { ...BARE, collar: 'nosuchthing' }).traverse((o) => { if (o.name === 'collarRing') red.push(o.material.color.getHex()); });
  expect(red).toEqual([0xd84040]);   // today's default ring, as an older build has always drawn it
});
it('the kinds, as today', () => {
  expect(['hoodie', 'raincoat', 'sweater', 'cape', 'confetticape', 'bell', null].map(bodyKind)).toEqual(['shell', 'shell', 'shell', 'cape', 'cape', null, null]);
  expect(['backpack', 'jetpack', 'wings', 'balloon', '__proto__'].map(isPack)).toEqual([true, true, true, false, false]);
  expect(['bell', 'heart', 'tag', 'sparklecollar', 'studded', 'glow', 'toString'].map(isCharmed)).toEqual([true, true, true, true, false, false, false]);
});
it('the dearest ground look still fits under the Woods\' ceiling', () => {
  const WOODS_STATIC = 68810; // test/woodssouth.test.js pins the Woods' build at exactly this
  const dearest = Math.max(...FOUND_WEAR.map((r) => trisIn(buildFindDisplay({ kind: 'wear', id: r.id }))));
  expect(WOODS_STATIC + dearest).toBeLessThan(70000);
});
it('wornPieces: a hat comes out as one group of its one mesh; an unknown id gives null', () => {
  const g = wornPieces('acorncap');
  expect(g.name).toBe('wear:acorncap');
  expect(g.children.map((m) => m.userData.hat)).toEqual(['acorncap']);
  expect(wornPieces('nosuchthing')).toBe(null);
});
```

  - `trisIn` is `triangles` from `test/helpers/catfingerprint.js` (index count / 3 over every mesh).
  - Add to `test/foundlive.test.js`: `DISPLAY_BY_SLOT` has exactly the keys `['head', 'face', 'neck', 'collar', 'body', 'back', 'feet']`, and `DISPLAY_BY_ID` is a frozen empty object.
- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run test/foundwearfit.test.js test/foundlive.test.js`. Expected: FAIL. `src/cat/wearkind.js` and `isPieceOf` do not exist.
- [ ] **Step 3: Implement the seam** exactly as "The seam" above says. Add the 22 name rows: `'wear.<id>.name': '<Name>'` in the table's order, each name as the table has it, with the apostrophes typed as `’` as the table's other rows have them ("Sailor’s Shell Necklace", "Fisherman’s Jumper").
- [ ] **Step 4: Re-record the later fixture.** Run: `UPDATE_OFF_SNAPSHOT=1 npx vitest run test/offwords.test.js`, then `git diff test/fixtures/series-words-on-later.json`. Expected: exactly 22 rows added.
- [ ] **Step 5: Run the tests to verify they pass, and that nothing moved.** Run: `npx vitest run test/foundwearfit.test.js test/foundlive.test.js test/foundwear.test.js test/foundwiring.test.js test/catgolden.test.js test/catmodel.test.js test/catpose.test.js test/catdrape.test.js test/cattufts.test.js test/hagrid.test.js test/catcape.test.js test/catbackitems.test.js test/catballoon.test.js test/redress.test.js test/offwords.test.js test/clanphrases.test.js test/serieswords.test.js`. Expected: PASS, with `catgolden.json` untouched (`git status` shows no fixture but the later one).
- [ ] **Step 6: Commit** every file above with message "Found outfits step 2: one seam per slot (the cat-side found files and their hooks), the ground look from the worn pieces, the 22 names, and the gate every outfit passes".

---

### Task 2: Five hats with brims (lane H)

**Files:**
- Modify: `src/cat/hats.js` (`HAT_IDS`, `BUILD`, `HAT_SHAPES`), `src/cat/foundhead.js`, `src/foundwear/head.js`
- Modify: `test/cathats.test.js` (line 211: `HAT_IDS.at(-1)` becomes `expect(HAT_IDS).toContain('acorncap')`), `test/hagrid.test.js` `DELTA`, `test/fixtures/accessory-mesh-delta.json`
- Test: `test/cathats.test.js`, `test/hagrid.test.js`

**Interfaces:**
- Consumes: Task 1's `addFoundHenHead` file and anchors; `hats.js`'s own `finish`, `drape`, `ringPoint`, the ear holes and the skull radii.
- Produces: `buildHat(id, { simple })` for `paperboycap`, `buckethat`, `sailorcap`, `strawhat` and `stripedboater`. Each is one vertex-coloured mesh named `hat:<id>`, appended to `HAT_IDS` in that order. Their records follow `acorncap` in `HEAD_WEAR`.

**The shapes.** Each is built in the beanie's or the top hat's manner, crown and brim seated on the skull with the ears through holes:
- `brimHat(spec, simple)`: one helper for the four round ones (`buckethat`, `sailorcap`, `strawhat`, `stripedboater`), so their shared parts are written once. `spec` has `crownH`, `crownTop` ('round' | 'flat'), `brimW`, `brimDroop`, `band` and the colours.
- The paperboy cap is the beanie's crown, puffed forward 15 %, with a front-only peak (`phi` within ±0.9 rad of the front).
- Hagrid's are simpler versions, built as `addPrizeHead`'s hats are, at his anchors: at most 4 meshes each.

- [ ] **Step 1: Write the failing tests.** Append `describe('found hats with brims (found outfits step 2)')` to `test/cathats.test.js`:
  - `it.each(['paperboycap', 'buckethat', 'sailorcap', 'strawhat', 'stripedboater'])` `'%s is in HAT_IDS'`;
  - `'%s: the brim or peak clears the eyes on every preset'`: the acorn test's `lowBrow > eyeTop + 0.015`, over `PRESETS`;
  - `'%s: its own colours'`: the vertex colours include the table's first colour.
  - Add each id to `test/hagrid.test.js` `DELTA` with its measured count (1 to 4), and an `it` that each one's meshes on him sit above his skull top and below `top + 0.15`, as the Acorn Cap's test does.
- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run test/cathats.test.js test/hagrid.test.js`. Expected: FAIL (`buildHat('paperboycap')` is `null`).
- [ ] **Step 3: Implement** the five hats, Hagrid's five and the five records. Add the five mesh-delta keys (`1` each) after `"acorncap"`.
- [ ] **Step 4: Run the tests to verify they pass.** Run: `npx vitest run test/cathats.test.js test/hagrid.test.js test/foundwearfit.test.js test/foundlive.test.js test/foundwear.test.js test/catpose.test.js test/catmodel.test.js test/catface3.test.js`. Expected: PASS. That includes the existing hat sweeps the new ids join: the seat on four breeds, ≤ 900 / ≤ 450 triangles, below the ear tips and under the thumbnail top. A wide brim that trips "below the ear tips" is lowered, not exempted.
- [ ] **Step 5: Commit** the files above with message "Found outfits step 2: the Paperboy Cap, Bucket Hat, Sailor Cap, Straw Hat and Striped Boater, on every cat and on Hagrid".

---

### Task 3: The Starfish Clip and the Feather Plume (lane H, after Task 2)

**Files:** as Task 2, for `starfishclip` and `featherplume`.

**Interfaces:**
- Produces: `buildHat('starfishclip' | 'featherplume', { simple })`, one mesh each, appended to `HAT_IDS`. The records come after Task 2's.

**The shapes.** Neither is a hat. Each is a small thing clipped on the skull:
- **The starfish** lies flat on the skull beside the right ear. It is five tapered arms (`tube()` on the skull surface, lifted 3 mm with `drape`), its centre at the skull direction `(0.55, 0.8, -0.1)` normalised. It must stay out of the ear's hole.
- **The feather** stands behind the left ear. The quill rises from a 2 cm band on the skull at the direction `(-0.45, 0.85, 0.3)` normalised, curving back by 0.5 rad over 0.16 m. The vane is a tapered strip coloured from `0xa0522d` to `0x3b2a20`.
- If the 5 % seat test does not fit an ornament (its lowest points are its seat, which it should be), it joins `WREATHS`' exemption only with its own seat test, as the wreaths have.

- [ ] **Step 1: Write the failing tests.** In `test/cathats.test.js`:
  - `'the starfish lies on the right of the crown, clear of the right ear'`: every vertex has `x > 0`, and none is within 1 cm of the ear tip's box on every preset;
  - `'the feather stands behind the left ear and is the hat's top'`: the highest vertex has `x < 0` and `z > 0`, and it is under `OLD_TOPHAT_TOP`.
  - Hagrid's `DELTA` entries.
- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run test/cathats.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** both, Hagrid's two and the two records. Add two mesh-delta keys (`1` each) after `"stripedboater"`.
- [ ] **Step 4: Run** Task 2's Step 4 command. Expected: PASS.
- [ ] **Step 5: Commit** with message "Found outfits step 2: the Starfish Clip and the Feather Plume, clipped beside the ears".

---

### Task 4: Heart-shaped Glasses (lane F)

**Files:**
- Modify: `src/cat/foundface.js`, `src/foundwear/face.js`, `test/hagrid.test.js` `DELTA`, `test/fixtures/accessory-mesh-delta.json`
- Test: `test/glasses.test.js`

**Interfaces:**
- Consumes: `addFoundFace`'s anchors from Task 1; `starGeometry`'s manner (a `THREE.Shape` extruded a hair). Write a `heartShape(r)` of your own in `foundface.js`: two arcs and a point.
- Produces: `heartglasses`. Per side, a red heart frame with a slightly smaller pink lens in front, yawed `-side * 0.4` to the cheek, at `(side * x, y, starZ)`. A red bridge between them. The lenses are merged into one vertex-coloured mesh, and the frames and bridge into another: 2 meshes.

- [ ] **Step 1: Write the failing tests** in `test/glasses.test.js`:
  - `'the heart glasses sit at eye level on every preset, both lenses in front of the eyes'`: each lens's centre is within 2 cm of its eye's centre in y, and in front of it (smaller z);
  - `'on Hagrid they sit in front of his eyes too'`.
  - Add `heartglasses` to `DELTA`.
- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run test/glasses.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the glasses and the record. Add the mesh-delta key after the head ids.
- [ ] **Step 4: Run** `npx vitest run test/glasses.test.js test/hagrid.test.js test/foundwearfit.test.js test/foundlive.test.js test/catpose.test.js test/catface3.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** with message "Found outfits step 2: the Heart-shaped Glasses, on every cat and on Hagrid".

---

### Task 5: Five neck pieces (lane N)

**Files:**
- Modify: `src/cat/foundneck.js` (`addFoundNeck`), `src/foundwear/neck.js`, `test/catmodel.test.js` (the two `CHEST_BREEDS` lists at lines 702 and 746, and `COLOURS`), `test/hagrid.test.js` `DELTA`, `test/fixtures/accessory-mesh-delta.json`, `test/fixtures/series-words-off-home.json` (the Daisy Chain's Park rows)
- Test: `test/catmodel.test.js`, `test/hagrid.test.js`

**Interfaces:**
- Consumes: `addFoundNeck(head, id, { k, y, z, ringR, ringBack, tilt })` and its call sites (Task 1).
- Produces: `daisychain`, `gardenglovescarf`, `shellnecklace`, `neckerchief` and `ticketgarland`.
  - Each goes round the neck with one `TorusGeometry` ring (the stem, the scarf's band, the cord, the string), plus at most 3 front pieces.
  - The many small things (daisies, shells, tickets) are merged into ONE vertex-coloured mesh placed round the ring's circle.
  - The neckerchief's triangle is the bandana's cone, gingham-painted.

- [ ] **Step 1: Write the failing tests.**
  - Add the five ids to both `CHEST_BREEDS` lists in `test/catmodel.test.js`, with their colours in `COLOURS`: their first plain-material colour; a vertex-coloured piece is found by `isPieceOf`, so give `itemMeshes` a fallback to `isPieceOf` when `COLOURS[id]` is missing.
  - In `test/hagrid.test.js`, add their `DELTA` counts and `'the found neck pieces ring his neck'`: each torus piece's centre is within 1.5 cm of the neck line at `HEN_SCARF_U`, measured as the streamer scarf's test does.
- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run test/catmodel.test.js test/hagrid.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the five pieces and the five records. Add the mesh-delta keys after `"heartglasses"`.
- [ ] **Step 4: Re-record the home fixture.** Run: `UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords.home.test.js`. Expected `git diff`: the Daisy Chain's three rows (🌼, its aria-label, "Found in City Park") added after the Acorn Cap's, both times the Journal appears.
- [ ] **Step 5: Run** `npx vitest run test/catmodel.test.js test/hagrid.test.js test/foundwearfit.test.js test/foundlive.test.js test/catneck.test.js test/catpose.test.js test/serieswords.home.test.js test/foundjournal.test.js`. Expected: PASS.
- [ ] **Step 6: Commit** with message "Found outfits step 2: the Daisy Chain, Garden Glove Scarf, Shell Necklace, Gingham Neckerchief and Ticket-stub Garland, round every neck and Hagrid's".

---

### Task 6: Three collars (lane N, after Task 5)

**Files:**
- Modify: `src/cat/foundneck.js` (`FOUND_COLLARS`), `src/foundwear/neck.js`, `test/catmodel.test.js` (`anchorcharm` in both `CHEST_BREEDS` lists), `test/hagrid.test.js` `DELTA`, `test/fixtures/accessory-mesh-delta.json`
- Test: `test/catmodel.test.js`, `test/catcape.test.js`

**Interfaces:**
- Consumes: `buildCollar`'s hook (Task 1); `isCharmed`.
- Produces: `FOUND_COLLARS` entries:
  - `bottletopcollar: { ring: 0x3a3a42, charmed: false }`: eight caps, fluted discs, alternating colours in the ring's plane. They are merged into one vertex-coloured mesh on `ring`.
  - `ropecollar: { ring: 0xc8a46a, charmed: false }`: a darker spiral painted on the ring, as vertex colours on a second torus 1 mm proud. The knot is one small ball at `charmPos`, of the ring's colour.
  - `anchorcharm: { ring: 0x24365c, charmed: true }`: an anchor (shank, stock, two flukes, a ring), merged into one silver mesh at `charmPos`.
  - Records `bottletopcollar`, `ropecollar` and `anchorcharm`, after Task 5's.

- [ ] **Step 1: Write the failing tests.**
  - In `test/catcape.test.js`, `'a cape over the Anchor Charm hides its clasp; over the Rope Collar it keeps it'`, read through the clasp geometry's own flag, as the bell's test does.
  - In `test/catmodel.test.js`, `anchorcharm` in both chest lists; `'Digit's built-in tag gives way to a found collar'`: exactly one `collarRing` on her.
  - `DELTA` entries.
- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run test/catcape.test.js test/catmodel.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the three entries and records. Add the mesh-delta keys after `"ticketgarland"`.
- [ ] **Step 4: Run** `npx vitest run test/catcape.test.js test/catmodel.test.js test/hagrid.test.js test/foundwearfit.test.js test/foundlive.test.js test/catneck.test.js test/catpose.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** with message "Found outfits step 2: the Bottle-top Collar, Rope Collar and Anchor Charm (a charm the cape's clasp gives way to)".

---

### Task 7: Two capes and the jumper (lane B)

**Files:**
- Modify: `src/cat/foundbody.js` (`FOUND_BODY`, `buildFoldedJumper`), `src/foundwear/body.js`, `src/foundwear/display.js` (`DISPLAY_BY_ID.fishermansjumper`)
- Modify: `test/helpers/cape.js` (`CAPES`), `test/catdrape.test.js` (`GARMENTS`; the `cloths(...)` count line 75 stays 1 for the new ones), `test/catmodel.test.js` (`SHELLS`, line 592: `['fishermansjumper', null]`), `test/helpers/backitems.js` (`COVERS` gains `'doormatcape'` and `'fishermansjumper'`), `test/hagrid.test.js` `DELTA` (0 each), `test/fixtures/accessory-mesh-delta.json`
- Create: `test/catcape.fur.doormatcape.test.js`, `test/catcape.sit.doormatcape.test.js`, `test/catcape.tail.doormatcape.test.js`, `test/catcape.tie.doormatcape.test.js`, and the same four for `beachtowelcape`. Each is one line, as `test/catcape.fur.cape.test.js` is.
- Test: the files above, `test/cattufts.test.js`

**Interfaces:**
- Consumes: `capeOn(colour, accent, paint)` and `coatShell(colour, paint)` through the body hook (Task 1); `bodyKind`.
- Produces:
  - `FOUND_BODY.doormatcape = { kind: 'cape', colour: 0xb8864a, accent: 0x6b4a2a, paint }`, its border as the table says. A bristle fleck is every third grid vertex 15 % darker.
  - `FOUND_BODY.beachtowelcape = { kind: 'cape', colour: 0xf28a3c, accent: 0xf2c14e, paint }`: stripes by `Math.floor(s * 6) % 3`.
  - `FOUND_BODY.fishermansjumper = { kind: 'shell', colour: 0xece3cf, paint }`: the cables are `|ux| < 0.12` or `|ux - ±0.4| < 0.08`; the ribbing is `uz > 0.85` or `uz < -0.75`.
  - `buildFoldedJumper() → THREE.Mesh`: a folded jumper about 0.24 × 0.05 × 0.18 m, with two folded sleeves across it, painted as the shell, under 300 triangles, named `wear:fishermansjumper`.
  - Records in that order.

- [ ] **Step 1: Write the failing tests.**
  - The eight sweep files, and the ids in `CAPES`, `GARMENTS`, `SHELLS` and `COVERS`.
  - In `test/cattufts.test.js`: `'a found cape or the jumper is a cover'`. `tuftPlan` for `doormatcape` equals `cape`'s, and for `fishermansjumper` equals `sweater`'s.
  - In `test/foundlive.test.js`: `'the jumper lies folded on the ground'`. `buildFindDisplay({ kind: 'wear', id: 'fishermansjumper' })` holds `wear:fishermansjumper`, under 300 triangles.
- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run test/catcape.fur.doormatcape.test.js test/catdrape.test.js test/cattufts.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the three entries, the folded jumper and the records. Add the mesh-delta keys after `"anchorcharm"`.
- [ ] **Step 4: Run** `npx vitest run test/catcape test/catdrape.test.js test/catmodel.test.js test/cattufts.test.js test/catbackitems test/foundwearfit.test.js test/foundlive.test.js test/catpose.test.js test/hagrid.test.js`. Expected: PASS. That includes the existing pose sweeps the capes now join: out of the fur, off the tail, the sit's cloth, the tie, and the backpack, jetpack and wings over the new covers.
- [ ] **Step 5: Commit** with message "Found outfits step 2: the Doormat Cape, Beach-towel Cape and Fisherman's Jumper (folded on the ground), swept like the capes and coats".

---

### Task 8: The hay-bale pack and two things that float (lane B, after Task 7)

**Files:**
- Modify: `src/cat/backitems.js` (`BACK_ITEM_IDS`, `buildBackItem`), `src/cat/foundbody.js` (`FOUND_FLOATS`), `src/foundwear/body.js`
- Modify: `test/catbackitems.test.js` (line 50 `BUDGET.haybalepack = 1000`), `test/catballoon.test.js` (`KITS` gains both floats), `test/catmodel.test.js` (line 385), `test/hagrid.test.js` `DELTA` (0 each), `test/fixtures/accessory-mesh-delta.json`, `test/fixtures/series-words-off-home.json` (the Kite-tail Ribbon's Park rows)
- Create: `test/catbackitems.haybalepack.test.js` (`coverSweep('haybalepack')`)
- Test: the files above

**Interfaces:**
- Consumes: `backAnchor`, `placeOnBack`, `STRAP` and the backpack's straps (`backitems.js`); `FOUND_FLOATS`' kit (Task 1).
- Produces:
  - `buildBackItem('haybalepack', opts)`: the bale is a rounded box `PACK.size × 1.1` on `PACK.dir`, painted straw with two twine bands; the straps are the backpack's. ≤ 1000 full, ≤ 500 simple. `isPack('haybalepack')` is true.
  - `FOUND_FLOATS.kitetailribbon(kit)`: `foot = onBack(0, 0.5, 0.31)`, `top = (0, 0.86, 0.44)`, one string, four bows (each two flattened cones meeting at a knot, merged into one vertex-coloured mesh) spaced along it; `floatOn` each piece. Under the whole-cat thumbnail's top (y < 1.1), as the Balloon Bunch is.
  - `FOUND_FLOATS.candyflosspuff(kit)`: `tie = onBack(0.05, 0.6, 0.2)`, a paper stick string to `(0.05, 0.86, 0.2)`, and the puff: four overlapping balls merged into one vertex-coloured mesh at `(0.05, 0.95, 0.2)`, radius about 0.09.
  - The records `kitetailribbon`, `haybalepack` and `candyflosspuff`, after Task 7's.
  - `accessoryFraming('haybalepack').rotY === -2.4` (Task 1's `isPack` rule).

- [ ] **Step 1: Write the failing tests.**
  - The cover sweep file.
  - `BUDGET.haybalepack`.
  - The two `KITS` ids. The existing balloon sweep checks that they float upright over their tie in every pose and come back after a sit.
  - In `test/catmodel.test.js`, beside `'balloon bunch stays inside the whole-cat thumbnail framing (top < 1.1)'` (line 385): `it.each(['kitetailribbon', 'candyflosspuff'])`, the same measure.
  - In `test/catbackitems.test.js`: `expect(accessoryFraming('haybalepack').rotY).toBe(-2.4)`, and `accessoryFraming('wings').rotY` still `-0.45`.
- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run test/catbackitems.test.js test/catballoon.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the pack, the two floats and the records. Add the mesh-delta keys after `"fishermansjumper"`.
- [ ] **Step 4: Re-record the home fixture** as Task 5 Step 4. Expected `git diff`: the Kite-tail Ribbon's rows only.
- [ ] **Step 5: Run** `npx vitest run test/catbackitems test/catballoon.test.js test/foundwearfit.test.js test/foundlive.test.js test/catpose.test.js test/hagrid.test.js test/cattufts.test.js test/serieswords.home.test.js`. Expected: PASS.
- [ ] **Step 6: Commit** with message "Found outfits step 2: the Hay-bale Backpack, the Kite-tail Ribbon and the Candyfloss Puff".

---

### Task 9: Puddle Wellies (lane P)

**Files:**
- Modify: `src/cat/foundfeet.js`, `src/foundwear/feet.js`, `test/catmodel.test.js` (`FEET`, line 26, and the list at line 481), `test/catrealposes.test.js` (`TALL`, line 352, and the list at line 46), `test/hagrid.test.js` `DELTA` (0), `test/fixtures/accessory-mesh-delta.json`, `test/fixtures/series-words-off-home.json` (the Wellies' Park rows)
- Test: the files above

**Interfaces:**
- Produces:
  - `FOUND_FEET.puddlewellies(legs, { plainPaw, mat, PAW_Y })`: each leg gets `plainPaw(leg)`, its material `mat(0xf5c842)` and `scale.set(1.15, 1.5, 1.15)`. A red band `CylinderGeometry(0.058, 0.058, 0.012, 8)` goes at `PAW_Y - 0.03`, as a leg child.
  - Four bands, merged per leg: that is 4 meshes, the cap.
  - The record.

- [ ] **Step 1: Write the failing tests.** Add the id to `FEET`, both lists, and `TALL`. The existing tests check that the sole stays on the ground (the paw lift) and that the stance is unchanged in every real pose.
- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run test/catmodel.test.js test/catrealposes.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the wellies and the record. Add the mesh-delta key last.
- [ ] **Step 4: Re-record the home fixture** as Task 5 Step 4. Expected: the Wellies' rows only.
- [ ] **Step 5: Run** `npx vitest run test/catmodel.test.js test/catrealposes.test.js test/foundwearfit.test.js test/foundlive.test.js test/catpose.test.js test/hagrid.test.js test/serieswords.home.test.js`. Expected: PASS.
- [ ] **Step 6: Commit** with message "Found outfits step 2: Puddle Wellies, the Park's fourth".

---

### Task 10: Only what can be found shows as "not found yet" (lane U, any time)

**Files:**
- Modify: `src/ui/dressingroom.js` (`renderSlotPickerHtml`, line 244), `src/foundwear/journal.js` (`renderThingsToWearHtml`)
- Test: `test/dressingroom.test.js`, `test/foundjournal.test.js`

**Interfaces:**
- Consumes: `spotsIn` (`src/foundwear/spots/index.js`).
- Produces: an unowned outfit whose `find` place has `spotsIn(place).length === 0` renders `''` in both. One she owns always shows. The Legacy rule stays as it is.

- [ ] **Step 1: Write the failing tests**, with a stand-in catalog of two find-only hats, one `find: 'park'` and one `find: 'seaside'`:
  - `'a find-only outfit from a place with no find spots stays out of sight until found'`: the picker and the Journal show "Found in City Park", and neither shows "Seaside";
  - `'once owned it shows, spots or not'`: owning the Seaside one shows it as a wearable tile and a Journal card.
- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run test/dressingroom.test.js test/foundjournal.test.js`. Expected: FAIL (the Seaside silhouette shows).
- [ ] **Step 3: Implement** the one guard in each, beside the existing `areaInEdition` guard.
- [ ] **Step 4: Run** `npx vitest run test/dressingroom.test.js test/foundjournal.test.js test/serieswords.home.test.js`. Expected: PASS, the home fixture unchanged.
- [ ] **Step 5: Commit** with message "Found outfits step 2: a find-only outfit shows as 'not found yet' only where it can be found".

---

### Task 11: A found outfit's picture is drawn only once she owns it (lane U)

**Files:**
- Modify: `src/thumbnails.js`, `src/ui/dressingroomview.js` (`getThumbs`, line 124), `src/ui/homebase.js` (`ensureDressing`, line 1214)
- Test: `test/thumbnails.test.js` (create if missing)

**Interfaces:**
- Produces:
  - `thumbnailIds(catalog) → string[]`: every accessory id without `find`. `renderAllUnsafe` draws only these. Today it draws all 42; with this plan it would draw 65.
  - `missingFoundThumbs(thumbs, owned, catalog) → string[]`: owned ids with `find` that have no `thumbs.accessories[id]`.
  - `fillFoundThumbs(thumbs, owned) → void`: draws those, with one throwaway renderer for the batch (as `renderAll` does), into `thumbs.accessories`. It does nothing, and makes no renderer, when none are missing.
  - `getThumbs()` and `ensureDressing()` call `fillFoundThumbs(thumbs, progression.state.unlocked.accessories)` after `menuThumbnails()`.

- [ ] **Step 1: Write the failing tests** for the two pure functions:
  - `thumbnailIds(CATALOG)` holds no id with `find` and every `BASE_ACCESSORY_IDS` id;
  - `missingFoundThumbs({ accessories: { acorncap: 'data:x' } }, ['acorncap', 'daisychain', 'bell', 'junk'], CATALOG)` is `['daisychain']`.
- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run test/thumbnails.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run test/thumbnails.test.js test/dressingroom.test.js test/dressingroomview.test.js test/dressingroomcontroller.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** with message "Found outfits step 2: the dress-up draws a found outfit's picture once it is hers, not 23 more at every opening".

---

### Task 12: Picture sheets per cat, for the owner and his daughter

**Files:**
- Create: `verify-wear.html`
- Modify: `.gitignore` (`!verify-wear.html`, with a one-line comment as the other kept pages have)

**Interfaces:**
- Consumes: everything above, through `/src/...` imports as `verify-finds.html` does. That includes its renderer settings and rig: `createSun`, `createFill`, `createShadowFit`.
- Produces the contract `scripts/record-page.mjs` drives:
  - `window.__ready === true` after the first frame;
  - `window.__shot(name) → name`, after it has drawn the sheet.

**The sheets.** Each sheet is one canvas with a 6 × 4 grid of tiles, drawn with `setScissor`/`setViewport`. The grid is the 24 outfits in `FOUND_WEAR` order (the Acorn Cap included), each tile labelled in HTML over the canvas: the name (`record.name()`), the slot and the place's name.
- Each tile frames the cat as `src/thumbnails.js` `makeSnapper` does for `accessoryFraming(id)`: close-up `(0.85, 0.99, -1.11)` looking at `(0, 0.64, -0.21)`, or whole cat `(1.35, 1.14, -1.7)` looking at `(0, 0.44, 0)`, its `rotY`. Camera offsets are times the cat's own `scale.x`.
- Shots:
  - `cat-<preset>` for each of the ten `PRESETS`, standing;
  - `cat-builder-short`, `cat-builder-fluffy`, `cat-builder-long`, at the looks Task 1's `SHAPES` uses;
  - `cat-hagrid`: his 16 tiles (head, face, neck and collar outfits);
  - `sit-tabby`, `sit-digit`, `sit-mainecoon`: `defaultPoseCat`, the dress-up's own sit;
  - `ground`: every outfit's `buildFindDisplay` on a grass plane, 1.2 m off at cat height, with no twinkle;
  - `park-finds`: the Park built, the Park's four outfits each at one real Park spot, `verify-finds.html`'s `spot()` framing.

- [ ] **Step 1: Write `verify-wear.html`.** Check it in the browser at `npx vite --port 5179`, `/verify-wear.html`, with no console error.
- [ ] **Step 2: Take the sheets.** Run: `node scripts/record-page.mjs --url http://localhost:5179/verify-wear.html --out <scratchpad>/found-outfits-step2 --size 1920x1280 --shots cat-tabby,cat-siamese,cat-persian,cat-black,cat-calico,cat-mainecoon,cat-zeetoo,cat-robbie,cat-d2,cat-digit,cat-builder-short,cat-builder-fluffy,cat-builder-long,cat-hagrid,sit-tabby,sit-digit,sit-mainecoon,ground,park-finds`. Expected: 19 PNGs.
- [ ] **Step 3: Look at every sheet yourself.** Read each PNG. Fix anything that floats, sinks into the fur, hides an eye, clips an ear or reads as the yarn ball or a treasure, in its lane's file. Re-run that lane's Step 4 command, and retake.
- [ ] **Step 4: Commit** `verify-wear.html .gitignore` with message "Found outfits step 2: the picture sheets (every outfit on every cat, Hagrid's, the sit, and each on the ground)".

---

### Task 13: The catalog pinned, the lanes merged, the cost measured and the full suite

**Files:**
- Modify: `test/foundwear.test.js`
- Test: the full suite

- [ ] **Step 1: Write the pin** in `test/foundwear.test.js`:

```js
it('step 2: every street place has its four, and the places held back have none yet', () => {
  const ids = (a) => foundWearIn(a).map((r) => r.id);
  expect(ids('neighborhood')).toEqual(['paperboycap', 'gardenglovescarf', 'bottletopcollar', 'doormatcape']);
  expect(ids('park')).toEqual(['acorncap', 'daisychain', 'kitetailribbon', 'puddlewellies']);
  expect(ids('seaside')).toEqual(['buckethat', 'starfishclip', 'shellnecklace', 'beachtowelcape']);
  expect(ids('docks')).toEqual(['sailorcap', 'ropecollar', 'anchorcharm', 'fishermansjumper']);
  expect(ids('farm')).toEqual(['strawhat', 'featherplume', 'neckerchief', 'haybalepack']);
  expect(ids('fair')).toEqual(['stripedboater', 'heartglasses', 'ticketgarland', 'candyflosspuff']);
  for (const a of ['woods', 'river', 'moor', 'pines', 'gorge']) expect(ids(a)).toEqual([]);   // Legacy's retirement first
  expect(FOUND_WEAR).toHaveLength(24);
});
```

- [ ] **Step 2: Run it.** Run: `npx vitest run test/foundwear.test.js`. Expected: PASS when every lane is in. If lanes ran apart, merge them first, by the "Merging parallel lanes" rule.
- [ ] **Step 3: Measure what one more worn outfit adds.** Write a throwaway `test/zz-wearcost.test.js`, never committed and deleted after. It logs one row per outfit: the meshes and triangles it adds to a full tabby and to a simple one (a partner's cat is simple), its ground look's triangles, and the dearest of each column. Run it with `npx vitest run test/zz-wearcost.test.js`, keep the table for the report, then `rm test/zz-wearcost.test.js`.
- [ ] **Step 4: Run the full suite once.** First `uptime` and `sysctl -n hw.ncpu`; if the 1-minute load is over the core count, wait or report. Run: `npx vitest run`. Expected: PASS, every file. If a test outside this plan fails, read it before touching anything. A changed fixture other than the three named means stop and report.
- [ ] **Step 5: Commit** `test/foundwear.test.js` with message "Found outfits step 2: the catalog pinned: four for every street place, none yet where Legacy's retirement comes first".
- [ ] **Step 6: Report** to the owner:
  - the sheets' path;
  - the cost table;
  - that the Park's four are findable now and twenty more wait for step 3's spots;
  - the names for his daughter to change.
  Merge and push wait for his yes.

---

### Task 14 (OPTIONAL, flagged: run only on the owner's yes): the Neighborhood's find spots

This is the smallest piece of step 3: its seam, applied to one place. With it, the home place every child starts in hides four more outfits, in both editions.

**Files:**
- Create: `src/foundwear/spots/neighborhood.js`
- Modify: `src/foundwear/spots/index.js` (one import, one key)
- Test: `test/foundspots.test.js` (it already lists the Neighborhood's builder and runs every spot test over any area with spots)

**Interfaces:**
- Produces: `NEIGHBORHOOD_SPOTS = Object.freeze([{ id: 'fw-neighborhood-<n>', x, z, y, look }])`. 10 to 15 spots, read off `src/world/neighborhood.js` (spawn `(0, 45)`): behind a shed, on a low wall, under a hedge, by the bins, on a porch step perch. Each has a one-line comment saying where, as `park.js` has.
- `FIND_KEY` changes. That is intended: a build before this task and one after never share finds on a co-walk.

- [ ] **Step 1: Write the spots.**
- [ ] **Step 2: Run** `npx vitest run test/foundspots.test.js test/foundrules.test.js test/foundwiring.test.js test/budget.test.js`. Move a spot rather than loosen a test. Expected: PASS, with the Neighborhood's budget counts unchanged.
- [ ] **Step 3: Re-record the home fixture** (`UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords.home.test.js`). Expected `git diff`: the Neighborhood's four "Found in …" groups added to the Journal, nothing else. Then re-run `test/dressingroom.test.js test/foundjournal.test.js`.
- [ ] **Step 4: Add** a `park-finds`-style `neighborhood-finds` shot to `verify-wear.html`, and take it as Task 12 Step 2 does.
- [ ] **Step 5: Run the full suite once** (Task 13 Step 4's rules).
- [ ] **Step 6: Commit** `src/foundwear/spots/neighborhood.js src/foundwear/spots/index.js test/fixtures/series-words-off-home.json verify-wear.html` with message "Found outfits step 2 (a piece of step 3): the Neighborhood's find spots, so its four outfits can be found".

---

## Lanes

- **Task 1 runs first, alone.**
- **Then five lanes can run side by side**, each in its own worktree branched from Task 1's commit:
  - H: Task 2, then Task 3;
  - F: Task 4;
  - N: Task 5, then Task 6;
  - B: Task 7, then Task 8;
  - P: Task 9.
- **Lane U** (Tasks 10 and 11) needs nothing from Task 1 and can run any time.
- **Then** Task 12, Task 13 and, on the owner's yes, Task 14.
- In one session, run them in task order.

## Self-review (done while writing)

- **Spec coverage:**
  - "The outfits, in parallel by slot file (hats, face, neck and collar, body and back, feet)": Tasks 2–9, in lanes H, F, N, B and P after Task 1's seam.
  - "fitted to every cat shape": Task 1's `test/foundwearfit.test.js` (presets, builder cats, Hagrid's slots) and each lane joining the existing per-slot sweeps.
  - "picture sheets per cat": Task 12.
  - "Names go through the word tables … none uses a series word": Task 1 (rows, fixture, `bannedIn` in both sets).
  - "Hagrid … only the head, face, neck and collar ones": Task 1's Hagrid row, the lanes' `DELTA`.
  - "Budget … per-item triangle rules for wearables": Global Constraints' cost rule, Task 1's test, Task 13's measure.
  - "Saves … old saves load cleanly": no save change; `foundWear` sanitises by `find`.
  - "Wardrobe … silhouette with 'Found in …'": kept, and gated to findable places (Task 10).
  - "Journal 'Things to wear'": same gate; Park rows re-recorded (Tasks 5, 8, 9).
  - "Depends on Legacy's retirement only for the territory outfits": the twenty held back, pinned empty in Task 13.
  - "Each step ends with the full suite green and pictures for the owner": Tasks 12–13.
- **Types:**
  - `addFoundNeck` takes `tilt` from Task 1 on; Task 5 only fills it in.
  - `isPieceOf` and `wornPieces` are the same names in Tasks 1, 7, 12 and 13.
  - `FOUND_BODY`, `FOUND_FLOATS`, `FOUND_FEET`, `FOUND_COLLARS`, `bodyKind`, `isPack` and `isCharmed` match across tasks.
- **Proportion:** the code blocks are tests and the one catalog pin. Models are described by shape, place and colour, and the geometry is left to the implementer. The owner approves from the sheets.
