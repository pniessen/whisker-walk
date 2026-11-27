# Snowville: skis and a snowmobile (design only, 2026-11-27)

Players: a girl of 11 and a boy of 9. Gentle: no crash, no fail screen, no timer that scolds, no way to be stuck. Both additions copy the sled run's build (`snowvillesledplan/parts/live/words.js`): pure plan file, a live that swaps `session.fair` hooks on first frame, `pathride.js` for motion, `session.fair.riding` for the co-walk view, a "Hop off" anywhere onto a precomputed free spot, never-stuck sweep test, reduced motion holds the effects still. Nothing is saved except the find.

Budget facts (row `snowville` in `test/fixtures/area-budgets.json`): 6 meshes / 3 casters / 47,400 triangles; built 42,308 + holiday decor 1,400 = 43,708, so **about 3,700 triangles of headroom**. Draws are 6 (8 with decor), and the row's 6/3 caps held only because new drawing joins the merged buckets. So: **no new mesh, no new caster, no new draw.** All new static geometry goes into the existing paint/glow/tree buckets (stage chunks); anything that moves (the snowmobile body, the skis) must ride a bucket-neutral path (see cost lines). If a moving prop cannot fit, the fallback is one extra non-casting mesh (+1 mesh, 7 draws), which is an owner decision (D3).

## A. Skis (recommended first)

**Sees/does.** A bright flagged slope on the sled hill's WEST flank (the sled run is east; both never cross), with a rack of two little skis and poles at its top, a gate arch of two stakes and a pennant, and a green/blue marked line of stakes down to a "Finish" flag at the foot. Stand at the rack: "Put on the skis". The cat's feet get two thin skis (visible on her, in the sit/stand pose she already has) and she glides down the marked track by `pathride.js` (open run like the sled, 2.0 to 5.0 m/s, 2 m either side of the line). Stick left/right swings her through gentle S-turns and gives a little speed; it never speeds her past the cap. A row of 6 small gold "gates" (flag pairs) lie along the line; gliding through one makes a soft chime and a snow puff. The run always ends at the foot with a cheer ("Swish! Lovely turns!"), the skis come off and hang on the rack again. Action button anywhere = "Take the skis off" (hop-off spot). No timer, no score shown; gates are praise only.

**Controls.** Touch: the existing stick steers, the existing action button boards/hops off; no new button. Pad: left stick steers, A (action) boards/hops off. Same as the sled.

**Where.** Sled hill, west flank, clear of the summit rock, lantern, cottages, firs (tests check each, as for the sled).

**Reward.** Find-only prize in the Snow Parka's style: **Ski Goggles** (one shell-free face accessory, hand-placed, folded on the ground? No: awarded once when she clears 6/6 gates on any single run, then also findable on the rack's bench for a child who never gets 6/6, so nobody is locked out). Goes through the same found-outfit path as the parka (mesh-delta fixture row, catdrape, record count, off-words snapshot). Cost = what an existing found accessory costs (about 400 triangles on the cat, not on Snowville's row). Also 3 paws once per day.

**Cost against the row.** Meshes +0, casters +0, draws +0. Triangles about **+1,400**: slope stakes and 6 gate flag pairs (~600), rack with skis and poles (~300), pennant arch and Finish flag (~200), packed-track ribbon on the ground in vertex colour (0) and a cut of 200 for snow-spray points. The skis ON the cat are a cat accessory (layer on the cat, counted in the cat mesh delta, not the place). Resulting about 45,100 built, under 47,400.

**Chunk.** Lazy stage chunk `snowvillestageb` (where the sled lives): +about **9 kB gz** (plan 2 kB, parts 3 kB, live 3 kB, words 0.5 kB, goggles 0.5 kB). Stage b is 24.1 kB today. Start-up unchanged (pin 674.83 unchanged is the target).

**Co-walk.** One skier at a time on the slope (the slope has two rack positions, so each cat may ski their own line side by side on a 3 m wide run: lane A and lane B, no collision). Lowest-risk first cut: one lane, partner sees the skier via `fair.riding = { id: 'snow-skis' }`.

**Tests.** `test/snowvilleskis.test.js`: plan geometry (track clear of colliders, inside bounds, never-stuck sweep over every point, hop-off spots free); run always ends under 12 s at slowest speed; words lint (no series or banned word, both word sets); gate count is 6 and gates are reachable at slowest speed; goggles obtainable both ways; reduced-motion still; budget test row; start-up pin unchanged; found-outfit fixtures. Picture page `tools/verify/verify-snowville-skis.html`.

**Milestones (small builders).**
1. S1 Plan: track, gates, rack, hop-off spots, tests (no drawing).
2. S2 Parts: static drawing into the merged buckets; triangle count measured; picture page.
3. S3 Live: boarding, glide, steering, end, hop-off, words, never-stuck test.
4. S4 Skis on the cat (accessory) and the goggles find; fixtures.
5. S5 Co-walk riding view; reduced motion; gamepad pass; row re-measured and updated in `area-budgets.json`.
6. S6 Owner review from pictures (and one iPhone run).

## B. Snowmobile

**Sees/does.** A chunky friendly red snowmobile with a long two-person seat waits beside the Square's garage lean-to (the village's north-east corner, off the lantern lanes). "Hop on". She sits at the front seat; a second prompt on a partner cat (or, solo, a friendly passenger snowman figure already in the village decor is NOT used: solo is a single seat). The ride is a closed loop of the village's packed lanes around the pond and back (about 160 m, `pathride.js` closed loop, 3 to 6.5 m/s, 1.8 m either side of the line), with a slow chugging hum that is sound-only and off in reduced sound. Stick nudges speed and weaves a little inside the lane; a headlight glow is part of the snowmobile's emissive paint. It makes one loop, stops back at the garage and she hops off with "Brrrm! Cosy ride!". Action button = "Hop off" anywhere onto a free spot.

**Controls.** As the sled: stick nudges and steers, action boards/hops off. The partner presses the action button at the machine to take the back seat (co-walk seat 2); both stay seated through the loop.

**Reward.** **Snow Goggles** are skis' prize; the snowmobile's is the **Warm Scarf Cape?** No: a find-only **Snowmobile Helmet** (a rounded cap with a visor, one mesh, hand-placed on the machine's seat the first time, then on the garage bench). Also 3 paws per ride once a day.

**Cost against the row.** The body is moving, so it cannot sit in a static bucket. Triangles about **+1,900** (body ~1,100, skis/tracks ~400, seat ~200, headlight ~200), meshes **+1 (non-casting, own draw: 7 draws, 9 with decor)**, casters +0 (the machine casts no shadow while it moves; a flat blob only if the shadow budget allows, otherwise none). Resulting about 45,600 built; draws 7. This is the cost that makes the snowmobile second.

**Chunk.** `snowvillestagec` (where the wing lives): +about **11 kB gz** (body drawing is the bulk). Start-up unchanged.

**Co-walk.** Two seats are the headline feature: `session.fair.riding = { id: 'snow-mobile', seat: 0|1 }`; the partner's cat is placed at seat 1 from the host's seat record; if the partner joins a ride in progress, they take seat 1 for the rest of the loop. A test covers one-rider, two-rider and partner-leaves-midway (the machine keeps going and ends normally).

**Tests.** `test/snowvillemobile.test.js`: loop clear of colliders, never-stuck sweep, hop-off spots, loop ends in a bounded time, two-seat records for both co-walk cases, words lint, budget row (7 draws pinned), reduced motion, helmet found-outfit fixtures. Picture page.

**Milestones.**
1. M1 Plan: lane loop, garage, two seat records, hop-off spots, tests.
2. M2 Parts: machine mesh, measured against the row; decide D3 here.
3. M3 Live: solo ride, end, hop-off.
4. M4 Co-walk second seat, partner join/leave cases.
5. M5 Helmet find, paws, words.
6. M6 Row, fixtures, gamepad, owner review.

## Recommendation and owner decisions

Skis first: zero new mesh or draw, fits the headroom, smaller chunk (9 vs 11 kB), the reward and rider hooks are reused by the snowmobile later.

- D1. Reward for skis: Ski Goggles, with a bench fallback so nobody is locked out. Default: yes; alternative paws only.
- D2. Co-walk for skis: single lane first. Default: single lane, two lanes later.
- D3. Allow +1 non-casting mesh (7 draws, 9 with decor) for the snowmobile. Default: yes, but only after skis ships and the row is re-measured; otherwise cut the snowmobile to a static display.
- D4. Snowmobile solo: one seat, no passenger NPC. Default: yes.
- D5. Engine hum sound. Default: quiet hum, off in reduced sound.
