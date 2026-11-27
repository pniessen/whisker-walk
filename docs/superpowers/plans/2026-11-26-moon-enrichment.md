# The Moon: enrichment plan

Status: **plan (2026-11-26).** Owner agreed the layer approach. Nothing here is built. Merge when the full suite passes, push, check the deploy. Builds on `2026-11-23-moon.md`.

**The binding constraint: size.** The Moon chunk is about **96.7 kB gz against the 100 kB guard** (the build's number; 90 kB by the builder's count). Any addition fails the guard until the Moon is split into stages that load on demand. **Task 1 is the split, before anything else.**

## Layers

| # | Layer | Today | To do |
|---|---|---|---|
| 0 | **Chunk split** | one big lazy chunk | Stage the Moon like the Reef/Crystal (stage A: base, landing, rover; wing B: Star Hill, ridge, massif; wing C: lava, launch; new wings load on demand). Measure each; keep the first load small. |
| 1 | Clarity | written guide, Pip bubbles, light column, arrival card (area-intros) | Strong; verify the guide covers the Deep Cell and the later steps. |
| 2 | Beauty | rounds 1-6 | Buildings and interiors (dome, tunnel, desk), the suit's look, the lander, the lit base at Earthrise. |
| 3 | Decor density | ground texture, rocks, craterlets | Base props: antennas, solar panels, crates, flags, tracks, old landers, cable runs, signs, lamps. Instanced, few draws. |
| 4 | Life | Pip, Dot | Friendly robots: small survey drones, a dusty cleaner bot, a rover convoy, flying drones, a lunar "moth" of light. Photo targets and journal cards (the Reef's `spottable` pattern). No animals. |
| 5 | New wings | base, Star Hill, massif, lava, ridge, pad, Deep Cell | Far-side crater with a quiet garden dome, a glass moon farm, a crater lake of dust, an old station ruin. Advisor window first. |
| 6 | Play and rides | rover, hop board, beam hops | Hover sled / moon-buggy lane, a low-gravity bounce park, a telescope game. Reuse the shared mount design (see the Reef planning window). |
| 7 | People and story | one arc: Pip, power cells, postcard, launch | A second arc after launch (a signal from another station); astronaut crew visitors. |
| 8 | Sound | spare ambience | A Moon theme: slow pads and sparse bells (the music pass). |
| 9 | Replay | job, postcard | Daily missions, a stamp album, a found outfit, a mouse or two (totals move together). |

## Order

1. **Task 1: split the chunk (L)** with the size guard test. Nothing else until this is done.
2. Batch 2: decor + buildings beauty (layers 2-3).
3. Batch 3: robot life (layer 4).
4. Advisor window: one new wing + the ride + the second arc (saves, mice, journal ids, mount design).
5. Build those; then sound and replay.

## Rules

Same as the Crystal plan: pure plan files, seeded streams, reduced motion, LOW/LITE lighter, word tables in both editions, banned words, the full suite on the rebased branch before every merge (one at a time), pinned journal tests by first id.
