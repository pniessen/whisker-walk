# The Crystal Cave: enrichment plan

Status: **plan (2026-11-26).** Owner agreed the layer approach. Nothing here is built except where marked "done". Standing permission applies (merge behind nothing: the cave is live for everyone; merge when the full suite passes, push, check the deploy). Every number marked "start" is tuned from pictures; budgets are measured then set (+12 percent). Builds on `2026-11-26-crystal-cave.md` and the Reef's enrichment (the same layers).

Chunk today: **25.8 kB gz** (guard 100). Room is large; start-up must not rise more than 0.3 kB per batch.

## Layers

| # | Layer | Today | To do |
|---|---|---|---|
| 1 | Clarity | arrival card done (area-intros) | **Written guide** like the Reef's (goal line, chip beside Lumi, edge arrow, ring is the existing glint): copy `reefguide.js` / `reefguidelive.js` / `guidegeo.js`; steps: meet Lumi, rose stone, rose crystal, sky stone across the pool, sky crystal, gold stone, gold crystal, the Heart, the errand. |
| 2 | Beauty | rounds 1-4 done | Passage lights, dust motes, Lumi's look, how the three great crystals read lit vs unlit (a clear before/after), floor and wall tone per chamber, the Heart's halo. |
| 3 | Decor density | rocks, stones, clay patches | Mushroom clusters, small crystal gardens, glowing moss, stalagmite groups, pools of light, pebbles, clumped by chamber colour (rose, blue, gold, pink). Instanced; at most 3 new draw calls; clear of finds/colliders/story points. |
| 4 | Life | Lumi, glow-bugs, drips | Cave fish in the Blue Pool, a friendly bat colony (hanging, a slow fly-past), fireflies, moths, a cave salamander, crystal beetles, a small cave crab. Photo targets and journal cards (follow the Reef's `spottable` pattern, both word sets). Never chase, never block. |
| 5 | New wings | wing B (pool, gallery, Heart) | **Wing C** (own staged piece): underground river with a gentle boat ride, mushroom grotto, waterfall chamber, crystal forge workshop. One advisor window before building (saves, mice totals, journal ids). |
| 6 | Play and rides | none | Minecart ride on old mine tracks (shares the Reef's mount design: see the Reef/Sealab planning window), a "singing chamber" where stepping stones play notes (tuned to the crystals' notes). |
| 7 | People and story | Lumi arc (7 steps) | Friendly miners with lanterns; a second small story (light every crystal garden). |
| 8 | Sound | cave ambience | Tuned-chime theme (the music pass), echo and drip detail. |
| 9 | Replay | glow errand, rubbings album | A second daily errand, a found outfit, 1-2 more gold mice (totals tests move together). |

## Order

1. **Batch 1 (S-M):** guide (layer 1) + remaining beauty (layer 2). Two builders at most (different files).
2. **Batch 2 (M):** decor (3) + life (4).
3. **Advisor window (with the Reef Sealab/galleon window if timing fits):** wing C, minecart/mount design, second story, new journal ids, mice totals, save keys.
4. **Batch 3 (L):** wing C and the ride. Batch 4: people, sound, replay.

## Rules (all batches)

Pure plan file per addition, seeded streams with new salts (no Math.random, no clock reads), reduced motion freezes everything, LOW/LITE lighter, ONE PointLight total in the cave, walls stay 9 m+ beyond the walkable edge, zoom stays capped at step 2, every line a literal `phrase('...')` in both editions, banned words (dark, lost forever, trapped, stuck, collapse, cave-in, scary), full suite on the rebased branch before every merge (one at a time), journal pinned tests find their ids by first id (not from the end).
