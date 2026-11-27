# The Crystal Cave, second story: "Tink and the Echo Deep" (design)

Status: **DRAFT for the owner (2026-11-27). Docs only; nothing here is built.** Every name below is a placeholder in ONE table (`NAMES`, see D17); the daughter names things. The build plan is `docs/superpowers/plans/2026-11-27-crystal-story2.md`. Same spirit as the Reef's Sealab wing and the Moon's Old Relay Station: a later chapter, opened only after the first story, with its own small prize.

## 0. For a parent

When the first story is over (Lumi's light is back) and the cave's singing chamber has taught all three tunes, a few visits later the singing wall hums a fourth, very small tune. The wall slides open on a short passage to a **hidden hall**, the Echo Deep: warm, glowing, nothing dark. Lumi's shy cousin **Tink**, a baby chime-bat (placeholder), wandered in after the hum and cannot find the way home. The child follows Tink's glints, sets three colour **prisms** (rose, blue, gold) until the hall's door-crystal lights, finds Tink curled in a nest, and walks him home to the hanging-crystal nook above the Rose hall. Tink sings a thank-you chime and gives a **Prism Charm** to wear. Afterwards Tink has one small errand each walk, like Lumi's.

Nothing can go wrong. No timers, no failing, no dark, no chasing, nothing scary. A wrong prism turn just turns it again.

## 1. Decisions (one line each; each has a recommended default, answer "yes" or change it)

| # | Question | Recommended default |
|---|---|---|
| D1 | Story beat | **A lost baby cave creature is walked home** (Tink), through a hidden hall behind the singing wall, with one gentle colour-prism puzzle on the way. Not a new mechanic: carry/follow like Lumi, plus one tap-to-turn prism. |
| D2 | Length | **Four steps**, bits not counters (D6). |
| D3 | The four steps | 1 The wall hums and opens; 2 the three prisms in the Deep are set; 3 Tink is found in his nest; 4 Tink is walked home and gives the charm. |
| D4 | Where | A **new Deep Hall** (about (-28, -27), radius 4.5 plus a 6 m passage from the singing chamber's south side), inside the existing 72 x 64 m bounds, in a **new lazy stage**. Tink's home nook is the entry-hall side of the Rose hall (existing floor). No change to `CRYSTAL_BOUNDS`. If C0's flood shows the south-west corner too tight, fall back to the free pocket near (31, -8), same plan. |
| D5 | How a child unlocks it | `step >= 7` (first story told) AND `songs === 7` (all three tunes) AND **at least 2 of Lumi's rubbings in `album`** (two paid Lumi errands, so two walks after the story; needs no new save key). |
| D6 | Save | One additive key `state.crystal.deep` (bitmask 0..15, defaults 0) and one more, `state.crystal.chimes` (12-bit album, defaults 0). Bits: 0 wall open, 1 prisms set (implies 0), 2 Tink found (implies 1), 3 Tink home and charm given (implies all). Both keys go in the sanitiser AND `MERGE_RULES.crystal` (OR) on day one. `SAVE_VERSION` stays 4. |
| D7 | Prizes | **Prism Charm**, a neck accessory (`prismcharm`, `prize: true`, owned when `deep & 8`, never found on the ground), plus **40 paws once** (`AWARDS.crystaldeep`). |
| D8 | Gold mice | **Two** (`gm-crystal-6` in the Deep Hall on foot behind the prism arch; `gm-crystal-7` on Tink's nest ledge, one hop). Counts move by +2 in both editions; the mouse-list scatters must keep reading the first three ids by name. |
| D9 | Journal pages | **Five**, reserved in C0 in a new `CRYSTAL_DEEP_PAGES` list appended at the END of the journal types: `ccwall` (the singing wall), `ccdeep` (the Echo Deep), `ccprism` (the prisms), `cctink` (Tink), `ccchimes` (the Chime Charms). Each shows only when its piece is live (`WING_LIVE` pattern). |
| D10 | Replay | **Tink's errand of the day** (day-after pattern): from the walk after the story, one small errand, 25 paws once a walk (`AWARDS.deepjob`), and one more **chime charm** in a 12-bit album (`state.crystal.chimes`). The errand is never saved, only what it pays. |
| D11 | Errand kinds | **Four**: `tune` (copy a 3-note phrase on the Deep's chime bars; no fail sound), `prisms` (set the three prisms to the day's colours; the day's colours are shown by Tink's glow), `moss` (carry a soft moss pad to Tink's nest; picked from one of six spots the seed chooses), `hide` (Tink hides at one of six nooks; a ring of glints shows it; no timer). Same `planDeepErrand(roomSeed, visits)` shape as `snowvillejob.js` so every cat in a room gets the same errand. |
| D12 | Co-walk | **Both cats get credit**: every step done by anyone in the room is credited on both saves (`credit()`), partner events `wd-wall`, `wd-prism`, `wd-found`, `wd-home` (and `wd-errand`, one per paid errand). Tink follows the cat who greeted him; a second cat can walk with them. The prize and paws go to each cat. |
| D13 | Prompts | One prompt source for the Deep goes in the Crystal's existing arbiter list (after the song pads), reading a `ST.deep` slot that answers null until filled, so `crystal.js` is edited once, in C0. |
| D14 | Anti-goals | No scary, no dark, no chase, no timers, no countdown, no fail sound, no losing anything. Prism colours also carry a **shape** (circle, diamond, star) so colour alone is never the clue. Carried things (the moss pad) are never saved and are back at their spot on the next walk. Tink is never lost: he waits in the nest or at his nook. |
| D15 | Reduced motion | Prism beams, Tink's bob and the wall's slide are **instant or still**; the wall appears open; glows hold their gentle peak. LOW keeps half the glints and drops the spray. |
| D16 | Devices | iPad 7 is the floor: the Deep's detail is drawn only within `near` (26 m, like the Moon's Lava Tube wing), with a low stand-in shape beyond; zero new PointLights (the cave's one is untouched; the hall's light is emissive vertex colour plus a light pool disc). |
| D17 | Names | One frozen `NAMES` table in `src/world/crystaldeepnames.js` (a start-up-free lazy file): `place: 'The Echo Deep'`, `creature: 'Tink'`, `kin: 'Lumi'`, `charm: 'Prism Charm'`, `album: 'Chime Charms'`. Everything reads it; rename = one file. The daughter names Tink and the hall. |
| D18 | Word sets | Both editions get the same plain lines (`phrase('crystal.deep....')`); no series word, no banned word ("trapped", "stuck", "dark", "collapse", "lost forever"); Tink is "a lost baby chime-bat", never "stuck". Clan may add a Clan-flavoured line for the nook ("the nest-ledge") only if it keeps the same meaning. |
| D19 | Teleport | **No new gate.** The Deep is inside the Cave. |
| D20 | Found outfit | **None new**: the Glimmer Collar's four spots stay. The prize pattern is the Circlet's and the Signal Tag's (bitmask-owned, `prize: true`). |

## 2. The story in beats

1. **The wall hums (step 1, `deep` bit 0).** After the unlock (D5) a faint fourth note joins the singing chamber's pads. Standing on any pad and pressing the action button plays a five-note "welcome phrase" with the pads lighting in order; stepping them in order (or just waiting) opens the wall, which slides back over a few seconds (instant under reduced motion). A wrong step lets the pads fade and the phrase plays again: no fail sound, no count.
2. **The prisms (step 2, bit 1).** The passage opens to the Deep Hall: a ring of low prism stands (circle / diamond / star) around a door-crystal. Each prism has three faces (rose / blue / gold); the action button turns it. The door-crystal's three sockets show the colour AND shape each prism must show. Any order, unlimited turns; a correct prism stays lit. When all three match, the door-crystal lights.
3. **Tink (step 3, bit 2).** Past the door-crystal, a nest on a ledge: Tink, a baby chime-bat the size of a teapot, sleepy and shy, chiming softly. Interact greets him: he follows like Lumi (shy distance, never rushed).
4. **Home (step 4, bit 3).** Walk him to the hanging-crystal nook above the Rose hall; he flutters up, sings a three-note thank-you, and a Prism Charm appears on the ledge for her to take. Pay: 40 paws once, charm owned, `ccdeep` and `cctink` pages. The story is over and Tink's errands begin from the next walk.

## 3. Places it uses

- Existing: the singing chamber (the wall, pads, welcome phrase), the Rose hall (the nook).
- New, in the `crystaldeep` lazy stage: the passage, the Deep Hall (floor under the hall is the existing `crystalY`; nothing in `crystalY` changes), the door-crystal, three prism stands, Tink's nest and ledge, the chime bars (errand `tune`).
- Rim rocks, clusters and pebbles in the footprints are removed AFTER scattering through `CRYSTAL_CLEARS` (never `KEEP_OUT`), so every other scatter is byte-identical.
- No finite `ceil`; the hall's roof is the cave's dome (13 m or more up); the walls stand 9 m or more beyond the walkable edge; the passage walls are low collider chains; zoom stays capped at step 2 (`camzoom.js`).

## 4. Rewards and their rules

- First time only: 40 paws (`AWARDS.crystaldeep`), the Prism Charm, journal `ccdeep`, `cctink`.
- Replay: 25 paws once a walk (`AWARDS.deepjob`), one chime charm per paid errand (album 12 bits; 12 total).
- Gold mice 6 and 7 (D8), journal pages (D9).
- Journal pages and the album never lock: all are optional.

## 5. Size cost (planning, kB gz; measured in each milestone, then ceiling set at +12 percent)

| Piece | kB | Notes |
|---|---|---|
| Seams in start-up (ids, award, charm, save keys, word stubs) | 0.4 to 0.6 | Start-up is 672.5 of 720: keep growth at or below 0.6. |
| Stage A (`crystal.js`) | 0.1 | one `ST.deep` read and one prompt-source line; stage A stays 43.8 + 0.1 of 65. |
| Pure plan, mission rules and Tink follower | 3 to 4 | |
| Hall, passage, prisms, nest, door-crystal drawing | 6 to 8 | merged geometry, three meshes at most |
| Prism puzzle and wall phrase live | 2 to 3 | |
| Tink (body, flutter, chime) | 2 to 3 | |
| Errand and album | 2 to 3 | |
| Words (both editions) and journal text | 1 to 2 | |
| **New stage `crystaldeep`** | **16 to 22** | under the 65 stage ceiling |

Crystal total: 57.7 of 120 at C5; plus about 20 gives about 78 of 120. No ceiling change. Worst-spot triangles: the Deep is drawn only inside its `near`, so the worst-spot count is unchanged elsewhere; the hall itself is held to 6,000 triangles or fewer. **Draw row (full): the Deep adds no per-frame passes**; it adds at most three meshes, all inside `near`, so the row is unchanged at the old worst spot; if C3's measure at the hall exceeds the existing row, stop and ask (decision 8 below).

## 6. Tests (all pure where possible)

Mission rules: bits imply (hostile payload, any order, partner credit). Unlock rule (D5). Prism puzzle: any start state reaches solved, never a fail, never a stuck state. Welcome phrase: pure, no fail. Errand plan: same seed gives same errand and spot, every spot reachable on foot from the spawn (floor flood), no errand needs a hop. Seams: the Deep's footprints are clear; the decor and finds scatters are byte-identical before and after (the mouse lists read the first three ids by name). Save: both keys in the sanitiser and `MERGE_RULES.crystal`, `savekeys` SENTINELS include `crystal: { step: 1, deep: 1, chimes: 1 }`, `areacoverage` stays green. Words: both editions, banned-word scan. Reduced motion and LOW: drawing helpers have still variants. Co-walk: partner events credit both saves. Budgets: the build's staged-download check reports `crystaldeep`.

## 7. Open owner decisions (answer yes or change)

1. D1 story: Tink the lost chime-bat, hidden hall, prisms. Yes?
2. D5 unlock: story done + all three tunes + two paid Lumi errands. Yes?
3. D4 site: south-west pocket at (-28, -27) (fallback east pocket). Yes?
4. D7 prize: Prism Charm (neck) + 40 paws. Yes?
5. D8 gold mice: two. Yes?
6. D10/D11 replay: Tink's errand, 4 kinds, 25 paws, 12-charm album. Yes?
7. D17 names: Tink, Echo Deep, Prism Charm as placeholders; daughter names later. Yes?
8. If the hall's draw measure exceeds the draw row, we stop and ask before raising it. Yes?
