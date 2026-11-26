# The Crystal Cave: design and plan

Status: **plan for the production line (2026-11-26), queue place 3.** Nothing here is built. Standing permission applies (merge behind the flag when automatic checks pass, push, check the deploy; owner looks once at the release pass). Copies the Reef's machinery and keeps it smaller: **no new movement mechanic**, no gauge, no new save shape beyond the Reef's pattern.
Builds on: `2026-11-26-reef.md` and `2026-11-26-greenhouse-remaining.md` (flag, pure plan file, lazy chunk, staged wings, teleport gate, repeat job), `2026-11-23-teleport-gates-design.md`.
Every number marked "start" is tuned by the builder from pictures. Budgets are measured, then set (area row at measured +12 percent).

## 0. For a parent

A glowing crack in the old sea wall at the Docks leads down into a **warm, colourful cave of crystals**. Nothing is dark or scary: the crystals glow, hum a soft note when touched, and the floor is smooth stone with a little pool and pebbles. A shy baby glow-worm, **Lumi** (placeholder name; the daughter may name her), has lost her light. The cat carries three small spark stones, one to each of three great crystals (rose, sky blue, gold), and each chamber lights up in turn. At the end the Heart Crystal wakes and the whole cave plays a **light show** (20 s, shared in a room). Nobody can fail and nothing is timed. Six discoveries, three golden mice, one found outfit (the **Glimmer Collar**), and a daily reason to return (**Lumi's glow errand of the day**, 25 paws, plus an album of twelve crystal rubbings). Both editions.

## 1. Decisions in one table

| # | Question | Recommendation |
|---|---|---|
| D1 | Story | **Lumi's light**: three spark stones, three great crystals, one light show. (Reuses the Reef's carry-and-return code; no new puzzle type, nothing audio-only.) |
| D2 | Size | **72 x 64 m** (4,608 m2), three chambers joined by wide passages (no low tunnels: high cavern ceiling, nothing for the camera to clip). |
| D3 | Reaching it | Teleport gate at the **Old Docks** (host row `docks`, both editions, price 0, `needWalks 2`, own return arch, no suit). New gate look `grotto` (the `cleft` code path without ladder and ring buoy), or reuse `cleft` if the builder finds no clean way (advisor Q1). |
| D4 | Movement | Walking only; the existing perch climbs on a few stepping crystals. No `placephysics` row (the place uses defaults), so **no `floatY`-style reader list, no flat-trace risk**. |
| D5 | Light | Dark-warm cave look from emissive vertex colours, ~4 real point lights at most, fog; crystals pulse slowly (reduced motion: still). LOW/LITE drop pulse and half the glints. |
| D6 | Budget | Stage A (entry hall + Rose chamber), wing B (Blue Pool + Gold Gallery + the Heart), no deep wing. Expect about 22 kB chunk, 35,000 triangles at most; measured then set. |
| D7 | Gold mice | **3** (60 Clan / 36 everyday, from 57 / 33): one under the Rose arch, one on a stepping crystal, one behind the Heart. |
| D8 | Journal | 6 discoveries + 6 activity pages = 12 (`cc*` ids; builder checks the prefix is unused). |
| D9 | Outfit | Found outfit **Glimmer Collar**, 4 hand-placed spots, both editions. |
| D10 | Replay | **Lumi's glow errand of the day**, 25 paws once a walk (`AWARDS.cavejob`), postcard-style album of 12 rubbings. |
| D11 | Co-walk | Steps credited on both devices in a room; the light show is one shared event. Couch co-op later. |
| D12 | Save | `state.crystal = { step, sparks, album }`, `walks.crystal`, sanitised, one `catmerge` rule, `SAVE_VERSION` stays 4. |
| D13 | Start-up | Expect under 1 kB; reported per milestone. |

## 2. Mission (seven steps, three chapters)

1. Meet **Lumi** at the entrance (she glows only faintly, shows picture bubbles: a spark, a heart). 
2. Chapter 1, Rose hall: find the **rose spark stone** (glint behind a crystal cluster), carry it to the Rose crystal; it lights, hums, Lumi's tail glows pink.
3. Chapter 2 (wing B), Blue Pool: the **sky spark stone** lies across a pool on stepping crystals (perch climbs), carry it back across.
4. Gold Gallery: the **gold spark stone** is in a nook ringed by a little halo of glints.
5. Light all three; the passages light up.
6. The **Heart Crystal** wakes (the light show, a pure function of one start time, 20 s). 
7. `crystalstory` pays once (40 paws) and Lumi gives the Glimmer Collar's gem.

Meow calls Lumi; a ring of sparkles shows the way (no text, no fail). A carried stone returns to its spot at walk end and is never lost. Saved by step.

## 3. Place, look, camera

Bounds start `{ minX -36, maxX 36, minZ -32, maxZ 32 }`, one smooth floor function (up to 1.0 m, slopes under 0.5), a ceiling dome drawn as one unlit mesh (stalactites instanced), fog near 5 m far 38 m. Spawn court at (0, 28) with the return arch. Zones: Entry hall (0, 24); Rose hall (-18, 4); Blue Pool (14, -4); Gold Gallery (-6, -22); Heart Crystal (22, -22). Camera: chase as is; ceiling at least 9 m so no clamp needed (advisor Q2 confirms). Strays, critters, ghosts, weather, rivals, daily goals and clan cats off (as the Reef's R0 did).

## 4. Journal, finds, save

Six discoveries: Rose Crystal, Echo Wall (a wall that hums back), Glow Pool, Gold Vein, Crystal Garden (tiny crystals), Heart Crystal. Activity pages: the three stones, the light show, the errand, the rubbings album. Ids and names in start-up (`crystalpages.js`), hints in lazy `crystalwords.js`; both word sets; banned-word scan (no *dark, lost forever, trapped, stuck, collapse, cave-in, scary*). Totals: update `GOLD_TOTAL` and area-list tests in the same commit as the mice.

## 5. Budget and tests (every milestone)

Measured then set. Automatic guards: chunk under 100 kB gz, start-up under 720 kB. Area tests: builds, spawn clear, every plan coordinate in bounds and reachable with no skills, banned-word scan, flat/grow trace fixtures unchanged, door round trip, reduced-motion pass. **Full suite via lean-checker on the rebased branch before every merge** (lesson from the Greenhouse and Reef).

## 6. Milestones

| M | What | Size |
|---|---|---|
| **C0 Seams** | `crystalflag.js`, `state.crystal`, `walks.crystal`, journal ids, awards, `catmerge` rule, `COOP_READY.crystal: false`, stub `world/crystal.js` with strays/ghosts/weather/goals/clan cats off, `AREA_LOADERS` and `AREA_ENTRY_MODULES` lines, catalog row hidden by `gate: 'tele'`. | S-M |
| **C1 Cave world** | `crystalplan.js`, `crystalparts.js`, `crystallight.js`, entry hall, Rose hall, spawn arch, crystal glow/pulse. Budget row A. | L |
| **C2 Lumi and chapter 1** | Lumi (`crystallife.js`), carry and return, rose stone, `crystalmission.js` (pure steps) and tests. | M |
| **C3 Finds** | six pages, collectibles, three mice, Glimmer Collar spots, totals 60 / 36. | M |
| **C4 Life and sound** | glow-bugs, drips, soft crystal notes (silent when muted), dust motes. | M |
| **C5 Wing B** | Blue Pool with stepping crystals, Gold Gallery, Heart Crystal and light show (room clock), `crystalstory` award, co-walk credit. Budget row B. | L |
| **C6 Gate** | Docks `grotto` (or `cleft`) gate, own return arch, catalog row price 0, `requires docks walks 2`, `needWalks 2`; Docks re-measured. | S |
| **C7 Replay** | glow errand, `AWARDS.cavejob`, album. | S-M |
| **C8 Polish** | beauty rounds, iPhone/iPad/TV readings, iPad 7 smoke test, owner's one look. Needs the owner. | M |

Order: C0, then C1 and C6 can overlap (C6 needs only C1's return arch). C2 after C1; C3 after C0; C4 after C1; C5 after C2; C7 after C5. At most two builders at once; seams before everything.

## 7. Risks

Reused carry code (return on every walk end; test all endings). Dark mood (warm light, friendly, banned words). Docks budget (re-measure after the gate). Lighting cost on phones (few real lights, emissive colour elsewhere). Gold-mice totals pinned in several tests (update together).
