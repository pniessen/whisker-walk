# Border Crossings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Where a path or the river meets the edge of a territory map, a border post stands; walking up to it asks "Head to the Moor?", and yes ends this walk the normal way and opens the home-screen territory map with that neighbour picked, ready to start.

**Architecture:** Post positions are pure data (`src/borderposts.js`), proven against the built maps by one test. A small THREE builder (`src/world/borderpost.js`) draws them and adds their colliders from each world file, the same way `addCamp` does, so every device and both editions build the same world. Pure rules (`src/bordercross.js`) decide what a post says and whether a co-walk event is honoured; a thin controller (`src/game/crossing.js`) shows the yes/no card, sends the co-walk event and calls `endWalk({ crossTo })`. Nothing new is saved: the pick is today's `state.area`.

**Tech Stack:** Vanilla JS (ES modules), Three.js, Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-editions-and-territories-design.md`: §3 "How separate maps share borders" item 3 and "What I recommend", "The three paths out of Twolegplace", "Unlocking territories", §8 step 6, and the owner's answers 1, 4, 5, 6 and 8 at the top.

## Global Constraints

- Direct crossings (the next territory starts straight away) are **not** in scope (§8 step 10).
- "yes ends this walk the normal way, with its summary and points, and opens the home-screen territory map with the Moor picked, ready to start" (§3). The kid still presses Start.
- "a neighbour that isn't built yet says 'The Moor: not explored yet'" (§3). The Gorge is the only one today.
- "It cannot break a co-walk: a walk ends for both, and the next one is started together through today's 'host proposes, both start' flow" (§3).
- **An area is built the same way in both editions** (§1, "The rule that keeps both kids safe"): posts, their colliders and their places never depend on the edition, the picks or the device. Only the prompt is edition-dependent.
- No book names in any `src/` string (`test/clanwords.test.js`'s borrowed-word scan): never write "Twolegplace", "clan", "warrior", "kit", "kittypet", "loner" or "rogue" in a string literal; place names come from `placeName` (`src/edition.js`) or `TERRITORIES` (`src/territories.js`).
- No new save field and no `SAVE_VERSION` change. The pick is `state.area`, set through the same unlock rules the map uses.
- Budget: every map stays inside `test/budget.test.js`'s ceilings (built 450 meshes / 380 casters, merged 260 / 205 for the Neighborhood and the four territories). A post is at most 3 meshes after `mergeStaticProps`.
- Posts never stand in water or a wade band, never inside a camp disc or its scent-mark ring, never on the island, and are reachable from the spawn by a cat that cannot swim.
- `walkRng` is never drawn from. Nothing here adds randomness.
- Don't touch `.worktrees/clan-life-2` or `.worktrees/kittypets`. If clan-life-2 (intruders) has merged to main before this is built, Task 1's intruder-route check runs; otherwise it skips (see Task 1).

## Rulings (the planner's calls, 2026-11-01)

- **R1. Which ends get posts.** One post wherever a built map's path or its river leaves the map through an edge that faces a named place: a clan territory, Twolegplace or the Gorge. River ends that leave toward nowhere named (the River's far west, the Pines' Black Mire north and west) get none, and so does the lakeshore (the island is reached by the Pines' bridge). The post names the place **directly over that edge** (the Woods' long path going east leads to Twolegplace; the River's long path going east leads to the Woods).
- **R2. Twolegplace gets posts too**, two of them, at the west and north ends of its main roads (to the Woods and the Moor): book one's way out of Twolegplace. It gets no River post: the long path runs through the Woods, so the River is reached from the Woods (owner question 3). The Neighborhood is built the same in both editions, so **Legacy's Cozy Neighborhood gains two plain wooden signposts that never prompt** (owner question 1).
- **R3. The Gorge post.** One post on the Moor's east edge, where the Moor's horizon is already the Gorge's grey rock. No path reaches it on purpose: an unexplored place has no path yet. It always says "The Gorge: not explored yet". When the Gorge is built, its own plan adds the path and the twin post.
- **R4. No post between the Pines and the Moor.** No path or river crosses that border (pines.js header: "No path crosses this border yet"). Adding one is the owner's call (owner question 4).
- **R5. Placement rules** (pinned by Task 1's test): 2.5–3.5 m inside the nearest bounds edge; 2.0 m or more off every path centreline (beside the path, never on it; Neighborhood roads 3.0 m, being 5 m wide); 1.2 m or more from every other collider's edge; 2.0 m or more outside every water footprint (so never in a wade band); 3.0 m or more from every POI, collectible, scenic and golden mouse, and 2.0 m from every perch; `r + 3` m or more from its area's camp disc centre (outside the camp and its scent-mark ring, which sits on the disc's rim); POST_REACH + 2 m or more from the spawn, so no prompt greets a cat as it arrives; and a cell within 1.2 m of it is reached by flooding `isWalkableAt` (no wading, no swimming) from the spawn.
- **R6. Twins line up.** Where both sides of a border are built territories sharing a frame (`lake.js` `FRAMES`), a post and its twin on the neighbour's map are 5 m apart across the border line and within 1 m of each other along it, so walking up to one map's edge and out of the next's looks like one crossing.
- **R7. The post's look** (our own design): a stout weathered wooden post 1.15 m tall with an arrow-shaped board at 0.95 m pointing out over the border, a band of cloth tied round the post under the board in the neighbour's map colour (the same colours the home-screen territory map paints the lands; `LAND` moves from `ui/territorymap.js` to `src/territories.js` so a world file never imports UI), and two small stones at its foot. No words on it: the prompt says where it goes. One collider, r 0.2. Not a perch. Not a markable (no scratch prompt).
- **R8. The prompt** (plain, kid-friendly). Clan Edition only; Legacy shows no post prompt anywhere.
  - can go: `E — Head to the Moor?` (the touch HUD drops the `E — `). A leading "The" in a place name is lowercased mid-sentence: "Head to the River and Marshes?", "Head to Twolegplace?" (that word comes from `placeName`).
  - still locked after this walk counts: `🔒 The River and Marshes opens after 2 walks in The Woods · 1/2 so far` (the map's own `opensAfterLine`, which names the gate's place with `placeName`, so "The" stays capital, counting this walk when it is in the gate's area). No E action.
  - not built: `The Gorge: not explored yet`. No E action.
  - a room walk, and I am not its host: `The Moor is this way 🧭 Pip leads the way`. No E action.
  - E on "can go" opens a small card (it pauses the walk like ⏸):
    - title `Head to the Moor?`, then `This walk ends here, and you keep everything you found.`;
    - one line for each thing still going: `Your race stops here.` (race running), `Your quest stops here.` (quest active), `The sock comes home to your den.` (something in the mouth; that is what endWalk already does), `Bramble walks home.` (a patrol together), and in a room walk `Pip comes too.` (every remote's pet name, joined with "and"; `come` for two or more: `Pip and Max come too.`);
    - buttons `Yes, let's go!` and `Keep exploring`.
  - **During a clan-life-2 fight** (if that has merged) the post slot is skipped and the card refuses to open: the fight's challenge pill takes the prompt's place, and a post must never pull a kid out mid-fight. A guest mid-fight when the host's event lands is fine: `endWalk` calls `clanFight.abort()` under that plan.
- **R9. What happens to an active race, carry, quest or patrol:** exactly what "End walk & head home" does today. The card names each one first (R8), so nothing stops by surprise. Points already earned are kept; the race and quest simply end with the walk.
- **R10. How the map receives the pick.** Inside `endWalk`, right after `completeWalk` (so this walk counts toward the gate), a Clan Edition device calls `progression.pickPlace(to)`: set it if owned, otherwise take it if it is open and affordable (every territory is free). Continue on the summary then opens the home screen on the **Where to** pill with no sheet open, and the map shows the neighbour as "today's walk". A Legacy device never picks.
- **R11. Co-walks: only the room's host crosses.** The host is the smallest player id in the room (`net.isHost()`, the same rule `pickRoomStart` and the roster sort use).
  - **Host:** the post works as solo; the card adds `Pip comes too.` On yes the host sends `{ v: 1, id, type: 'border-cross', from: areaId, to }` twice (0 and 150 ms), shows "Off we go! 🧭" and calls `endWalk({ crossTo: to })` 400 ms after the first send, so the broadcast leaves before the room is closed.
  - **Guest:** the post only says which way it goes and who leads (R8). When the host's event arrives (validated: from the walk's host as this device computes it, `from` is this walk's area, `to` is a target of one of this area's posts and is built), the guest sees the toast `Pip is leading the way to the Moor! 🧭` and 1.5 s later `endWalk({ crossTo: to, ledBy: 'Pip' })` runs, once. The guest's summary says `Pip led the way to the Moor! 🧭`; a Clan guest's map picks it too if they can have it (R10), a Legacy guest's never does.
  - **Who to walk on with is snapshotted when the event arrives.** The host's `endWalk` leaves the room at 400 ms, and the guest's `net.onRoster` then drops the host's cat (walk.js:1537-1543) before the guest's own `endWalk` at 1.5 s, so `walkedWith` (walk.js:1682) would be empty. `onRemote` captures the remote pet names on arrival and passes them as `endWalk({ crossTo, ledBy, together })`; `endWalk` prefers `together` over `walkedWith` for the "walked with" line and the crossing lines.
  - **Starting the next walk together.** Rooms are per-walk (endWalk leaves the room), so the kids rejoin ("Walk with partner" or the code). A Start proposes the presser's own `state.area` (rooms.js:181-200), and the smallest id's proposal wins only among the proposals heard (lobby.js:107-118). So the neighbour is walked when the host presses Start, or when either presses and both maps have it picked. The summaries (Clan) say so: the host's `Walk together again from the home screen to head there with Pip.`; a guest whose map picked it gets the same line; a guest whose map could not pick it (still locked for them) gets `Ask Pip to press Start on the home screen to head there together.`
  - A guest on an older build ignores the unknown event (`applyRemoteEvent` drops unknown types) and keeps walking alone, as when a host ends a walk today.
  - A Legacy host sees no post prompt, so cannot cross.
- **R12. The corner map** shows each post as a small brown arrow pointing out over its edge, Clan Edition only, so the kids can find them.

## Posts per map (R1–R6; measured on main 105c95e)

| Map | id | x | z | faces | to | Notes |
|---|---|---|---|---|---|---|
| Neighborhood | `town-woods` | -52 | 3.6 | west | woods | west end of the east-west road |
| Neighborhood | `town-moor` | 3.6 | -52 | north | moor | north end of the main road |
| Woods | `woods-town-short` | 47.5 | 14.5 | east | neighborhood | the short path, through the garden fence; 4.3 m from the spawn |
| Woods | `woods-town-long` | 47.5 | 37.6 | east | neighborhood | the long path's east end |
| Woods | `woods-river-long` | -47.5 | 37.6 | west | river | the long path's west end; twin `river-woods-long` |
| Woods | `woods-river-pond` | -47.5 | 5.5 | west | river | south of the pond, where the river leaves; twin `river-woods-pond` |
| Woods | `woods-moor-path` | 43.4 | -47.5 | north | moor | the north path; twin `moor-woods-path` |
| Woods | `woods-moor-river` | 25.5 | -47.5 | north | moor | east bank of river-north; twin `moor-woods-river` |
| River | `river-woods-long` | 47.5 | 37.6 | east | woods | the long path; 4.2 m from the spawn |
| River | `river-woods-pond` | 47.5 | 5.5 | east | woods | south of the pond, where river-east leaves |
| River | `river-pines-path` | -23 | -47.5 | north | pines | the north path, past the log bridge; twin `pines-river-path` |
| Moor | `moor-woods-path` | 43.4 | 47.5 | south | woods | the north path; 4.4 m from the spawn |
| Moor | `moor-woods-river` | 25.5 | 47.5 | south | woods | east bank of river-south |
| Moor | `moor-gorge` | 47.5 | -14 | east | gorge | R3: always "not explored yet" |
| Pines | `pines-river-path` | -23 | 47.5 | south | river | beside the truce path; 4.6 m from the spawn, 10.35 m beyond the camp disc's rim |

Measured clearances (probe on main 105c95e, re-measured by the reviewer; Task 1's test re-proves them): nearest other collider edge 1.51 m (Pines, a pine at (-21, 47.8)) to 41.9 m; nearest water footprint 2.5 m (the two river-bank posts) or more; nearest find 8.2 m or more, nearest perch 2.79 m or more; every camp disc 10.35 m or more beyond its rim; every post 2.5–3.0 m inside its edge; spawn 4.24 m or more; every one flood-reached from its spawn without wading.

The island has no post: it is inside the Pines walk, has no edge to another map, and is a truce place.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/borderposts.js` | create, pure | `BORDER_POSTS`, `POST_R`, `POST_REACH`, `postsFor`, `postNear` |
| `src/world/borderpost.js` | create | `addBorderPosts(scene, area, areaId)`: meshes + colliders |
| `src/world/{neighborhood,woods,river,moor,pines}.js` | modify | one `addBorderPosts` call each, after `addCamp` (the Neighborhood: before its return) |
| `src/territories.js`, `src/ui/territorymap.js` | modify | `LAND` moves to territories.js (exported, frozen); territorymap.js imports it |
| `src/bordercross.js` | create, pure | `postStatus`, `promptFor`, `crossCardHtml`, `crossExtras`, `crossingOutcome`, `decideBorderCross` |
| `src/progression.js` | modify | `pickPlace(id)` |
| `src/ui/dressingroomview.js` | modify | `onPlace` calls `pickPlace`; `setPill(pill)` |
| `src/ui/homebase.js` | modify | `show({ pill })` |
| `src/game/crossing.js` | create | the card, the send, the receive, the hand-off to `endWalk` |
| `src/game/interactions.js` | modify | the post prompt slot and its E |
| `src/game/walk.js` | modify | `pauseCardHtml`, `endWalk({ crossTo, ledBy, together })`, `takeCrossing()`, `session.postMarkers` |
| `src/game/netevents.js` | modify | route `'border-cross'` to an injected `onBorderCross` |
| `src/main.js` | modify | wiring, card buttons, lock change, Continue |
| `src/ui/minimapmath.js`, `src/ui/minimap.js` | modify | the `post` marker |
| `src/style.css` | modify | the card's two buttons |
| tests | create/modify | `test/borderposts.test.js`, `test/borderpost.world.test.js`, `test/bordercross.test.js`, `test/crossing.test.js`, plus `interactions`, `progression`, `dressingroomview`, `homebase.map`, `netevents`, `minimapmath`, `walk.edition`, `moor` and `pines` (collider counts), `budget` (comment table) |

## Review Focus

1. **A guest on the summary or the pause card when the host's event lands.** The guest's walk must end once, never twice, and a second event (the duplicate send) must do nothing: `crossing.test.js` `a duplicate or late border-cross ends the walk once`, and the guest's summary still names the host after the host's leave has emptied the remotes list: `the guest keeps who it walked with`.
2. **A post on the line between the race's last ring and the finish, or by a quest target.** The card must name the race/quest before ending it, and "Keep exploring" must put the pause card back and resume with the race still running: `crossing.test.js` `keep exploring restores the pause card and leaves the race running`.
3. **Escape (or ⏸) while the crossing card is up, then resuming.** Re-engaging must drop the pending crossing and restore the pause card, or the next pause would show a stale "Head to…?" card: `crossing.test.js` `re-engaging without answering drops the card`.
4. **A neighbour that opens with this very walk** (second Woods walk, River post). The prompt must say "Head to the River and Marshes?" (not locked), and the map must show it picked after Continue: `bordercross.test.js` `this walk counts toward the gate` and `progression.test.js` `pickPlace takes a free place whose gate this walk just met`.
5. **A forged or stale `border-cross`** (from a non-host, for another area, to an unbuilt or non-neighbour place, `'__proto__'`): ignored, nothing ends: `bordercross.test.js` `decideBorderCross refuses…`.

---

### Task 1: Where the posts stand

**Files:**
- Create: `src/borderposts.js`
- Test: `test/borderposts.test.js`

**Interfaces:**
- Produces:
  - `POST_R = 0.2`, `POST_REACH = 1.6` (metres, cat centre to post centre).
  - `BORDER_POSTS: Readonly<Record<areaId, ReadonlyArray<{ id: string, x: number, z: number, faces: 'north'|'south'|'east'|'west', to: string }>>>`: exactly the table above, keyed `neighborhood`, `woods`, `river`, `moor`, `pines`, deep-frozen.
  - `postsFor(areaId) -> post[]` (own-key read; `[]` for any other id, `'__proto__'` included).
  - `postNear(areaId, x, z, reach = POST_REACH) -> post | null` (the nearest within reach; non-finite input → null).

- [ ] **Step 1: Write the failing test** `test/borderposts.test.js`. It builds each of the five maps (the headless canvas stub every world test uses, copied from `test/moor.test.js`), floods `isWalkableAt` from each map's `SPAWN` on a 0.5 m grid (the flood in `test/moor.test.js`), and for every post asserts R5:

```js
it('every post stands where R5 says', () => {
  for (const [areaId, posts] of Object.entries(BORDER_POSTS)) {
    const { area, spawn, paths } = maps[areaId]; // paths: WOODS_PATHS etc.; the Neighborhood's two roads are [0,-50,0,50] and [-50,0,50,0], 5 m wide, written in the test with that comment
    for (const p of posts) {
      const at = `${areaId}/${p.id}`;
      const edge = Math.min(p.x - area.bounds.minX, area.bounds.maxX - p.x, p.z - area.bounds.minZ, area.bounds.maxZ - p.z);
      expect(edge, at).toBeGreaterThanOrEqual(2.5); expect(edge, at).toBeLessThanOrEqual(3.5);
      expect(nearestSide(area.bounds, p), at).toBe(p.faces);
      for (const s of paths) expect(segDist(p.x, p.z, s), at).toBeGreaterThanOrEqual(areaId === 'neighborhood' ? 3.0 : 2.0);
      for (const c of others(area.colliders, p)) expect(Math.hypot(p.x - c.x, p.z - c.z) - c.r, at).toBeGreaterThanOrEqual(1.2);
      for (const w of area.waters ?? []) expect(waterGap(w, p.x, p.z), at).toBeGreaterThanOrEqual(2.0);
      for (const t of [...area.pois, ...area.collectibles, ...area.scenics, ...(GOLD_MICE[areaId] ?? [])]) expect(Math.hypot(p.x - t.x, p.z - t.z), at).toBeGreaterThanOrEqual(3.0);
      for (const t of area.perches) expect(Math.hypot(p.x - t.x, p.z - t.z), at).toBeGreaterThanOrEqual(2.0);
      const d = DISCS[areaId];
      if (d) expect(Math.hypot(p.x - d.cx, p.z - d.cz), at).toBeGreaterThanOrEqual(d.r + 3);
      expect(Math.hypot(p.x - spawn.x, p.z - spawn.z), at).toBeGreaterThanOrEqual(POST_REACH + 2);
      expect(reachesWithin(area, p.x, p.z, 1.2), at).toBe(true);
    }
  }
});
```

`others(colliders, p)` drops the post's own collider (same x, z and `r === POST_R`), so the test passes before and after Task 2 adds them. Also in this file:
  - `it('names the place over the edge')`: the `to` of every post is in `['neighborhood', 'woods', 'river', 'moor', 'pines', 'gorge']`, never its own area; the multiset of `(area, to)` is exactly the table's; ids are unique.
  - `it('twins line up across each border')` (R6): for every post in a territory whose `to` is a territory with a twin in the table, convert both to Woods coordinates (`x - FRAMES[a][0], z - FRAMES[a][1]`, `src/world/lake.js`); along the border they differ by ≤ 1 m and across it by exactly 5 m ± 0.01.
  - `it('keeps clear of the Pines island and the truce stones')`: no Pines post is inside `PINES_KEEP_OUT`'s rects/capsules (`keepOutPoint` returns it unchanged).
  - `it('postsFor and postNear')`: `postsFor('woods')` has 6; `postsFor('island')`, `postsFor('__proto__')`, `postsFor(7)` are `[]`; `postNear('woods', 47.5, 13.0)` is `woods-town-short`; `postNear('woods', 47.5, 12.8)` is null (1.7 m); `postNear('woods', NaN, 0)` is null.
  - `it('keeps off the intruders\' routes')`: `const mod = existsSync('src/intruders.js') ? await import('../src/intruders.js') : null`; skipped (`it.skipIf(!mod)`) when clan-life-2 hasn't merged; otherwise every segment of every `INTRUDER_ROUTES` route in an area stays ≥ 0.8 m from each of its posts. If it fails, move the **post** along its edge (re-run this file) rather than a route.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/borderposts.test.js`
Expected: FAIL, `Cannot find module '../src/borderposts.js'`.

- [ ] **Step 3: Implement `src/borderposts.js`.** A header comment states R1–R6 in plain words and that every value was probed on the built maps. Pure: no THREE, no DOM, no imports beyond none.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/borderposts.test.js`
Expected: PASS (the intruder case skipped unless clan-life-2 has merged).

- [ ] **Step 5: Commit**

```bash
git add src/borderposts.js test/borderposts.test.js
git commit -m "feat(borders): where the border posts stand, proven on the built maps"
```

### Task 2: The post, built into every map

**Files:**
- Create: `src/world/borderpost.js`
- Modify: `src/territories.js` (`LAND` moves here), `src/ui/territorymap.js` (imports it), `src/world/woods.js`, `src/world/river.js`, `src/world/moor.js`, `src/world/pines.js`, then (own commit) `src/world/neighborhood.js`
- Test: `test/borderpost.world.test.js`; modify `test/moor.test.js:746`, `test/pines.test.js:1557`, `test/budget.test.js` (comment table only)

**Interfaces:**
- Consumes: `postsFor`, `POST_R` (Task 1).
- Produces: `addBorderPosts(scene, area, areaId) -> void`. For each post, one `THREE.Group` named `borderPost` with `userData.postId`, added to `scene`, and `area.colliders.push({ x, z, r: POST_R })`. World files call it as `addBorderPosts(scene, { colliders }, '<id>')`. No new area-record field: later tasks read `postsFor(areaId)` directly. `clothKey(to)` (`'neighborhood'` → `'town'`, else `to`) is exported. `LAND` is `Object.freeze`d in `src/territories.js` with the same six hexes territorymap.js has today.

- [ ] **Step 1: Write the failing test** `test/borderpost.world.test.js`:
  - for each of the five maps: `scene.children.filter((o) => o.name === 'borderPost')` has `postsFor(id).length` groups, each at its post's `(x, 0, z)`; `area.colliders` holds one `{ x, z, r: 0.2 }` per post;
  - each group has the meshes R7 describes: one wood material (post, board, arrow tip), one cloth material whose colour is `LAND[clothKey(to)]`, one stone material; its tallest point is 1.15 m ± 0.05; the arrow tip's world position is further toward `faces` than the post;
  - after `mergeStaticProps(scene)`, each `borderPost` group holds at most 3 meshes (post, board and tip share one merge key, since `surfaceProps` returns only roughness/metalness; the two stones share another);
  - two builds of the same map give identical post colliders (no randomness).
  - Update the two collider-count pins: `test/moor.test.js:746` becomes `thorns.length + pines.length + 4 + 5 + 2 + postsFor('moor').length` and `test/pines.test.js:1557` becomes `near.length + stand.length + 19 + 2 + postsFor('pines').length`, each with "and its border posts" added to the comment above it.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/borderpost.world.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `addBorderPosts` in `src/world/borderpost.js`** with `litMaterial` and `surfaceProps` (`bark` for wood `0x8a6a48`, `cobble` for stones `0x8e8c88`, flat cloth). Sizes: post `CylinderGeometry(0.08, 0.1, 1.15, 7)`; board `BoxGeometry(0.5, 0.14, 0.04)` centred 0.22 m out from the post toward `faces`, at y 0.95; tip a 3-sided `CylinderGeometry(0, 0.1, 0.04, 3)` laid flat at the board's outer end; cloth `CylinderGeometry(0.105, 0.105, 0.12, 8)` at y 0.78; stones two `DodecahedronGeometry(0.12, 0)` at the foot. Move `LAND` to `src/territories.js` and import it in territorymap.js (no behaviour change). Add the call after `addCamp(...)` in woods/river/moor/pines. Do **not** touch any `KEEP_CLEAR` list or scatter: posts stand in ground already kept clear (Task 1 proves it), and changing those lists would reshuffle seeded scenery.

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run`
Expected: PASS (several world, lake, wading and clan-cat tests loop over colliders). Budget, measured on 105c95e before posts: Woods 176 built / 174 merged, River 162 / 160, Moor 79 / 78, Pines 115 / 112. After: Woods ≤ 212 / ≤ 192, all far under 450 / 260. Record the new readings in `test/budget.test.js`'s comment table (ceilings unchanged).

- [ ] **Step 5: Commit the territories**

```bash
git add src/world/borderpost.js src/territories.js src/ui/territorymap.js src/world/woods.js src/world/river.js src/world/moor.js src/world/pines.js test/borderpost.world.test.js test/moor.test.js test/pines.test.js test/budget.test.js
git commit -m "feat(borders): a waymark post at every path and river end of the four territories"
```

- [ ] **Step 6: The Neighborhood's two posts, in their own commit** (so owner question 1 can drop them by reverting one commit, together with their two rows in `BORDER_POSTS`). Add the call just before `return` in `neighborhood.js` (it has `colliders` and no camp). The Neighborhood goes from 381 / 218 meshes to ≤ 393 / ≤ 224, under 450 / 260; it is the iPhone yardstick, so Task 9 re-reads it.

Run: `npx vitest run`
Expected: PASS.

```bash
git add src/world/neighborhood.js test/budget.test.js
git commit -m "feat(borders): two signposts out of the Neighborhood, to the Woods and the Moor"
```

### Task 3: What a post says, and picking the place

**Files:**
- Create: `src/bordercross.js`
- Modify: `src/progression.js`, `src/ui/dressingroomview.js`
- Test: `test/bordercross.test.js`, `test/progression.test.js`, `test/dressingroomview.test.js`

**Interfaces:**
- Consumes: `postsFor` (Task 1); `placeName`, `isClanEdition` (`src/edition.js`); `TERRITORIES`, `opensAfterLine` (`src/territories.js`); `CATALOG`.
- Produces (all pure, total over garbage):
  - `targetName(to, edition, catalog) -> string`: `placeName(to, edition, catalog)`, else the `TERRITORIES` entry whose `areaId === to` or `id === to`, else `''`.
  - `lower(name) -> string`: a leading `The ` becomes `the `.
  - `postStatus(post, state, catalog, fromArea) -> { kind: 'go'|'locked'|'unexplored', to, name, line }`. `unexplored` when `to` has no own-key `catalog.areas` entry. `go` when owned, or when its gate `{ area, walks }` is met counting this walk (`have = (finite walks[req.area] or 0) + (req.area === fromArea ? 1 : 0)`) and `points >= price`. Else `locked`, `line = '🔒 ' + name + ' ' + opensAfterLine(req, have, edition, catalog)`, or for a price shortfall `` `🔒 ${name} needs ${price} 🐾` ``.
  - `headTo(name) -> string`: `'Head to ' + lower(name) + '?'`.
  - `promptFor(status, { inRoom, isHost, hostName }) -> { text, kind: 'border'|'border-info' }`. R8's four texts. `kind: 'border'` only for `go` when solo or host. (Legacy is decided by the caller: it never asks.)
  - `crossCardHtml({ name, extras }) -> string`: title `headTo(name)`, the line, each extra escaped in its own `<p>`, buttons `#btn-cross-yes` "Yes, let's go!" and `#btn-cross-no` "Keep exploring", root `div.pause-card.cross-card`.
  - `joinNames(names) -> string`: `'Pip'`, `'Pip and Max'`, `'Pip, Max and Tig'`.
  - `crossExtras({ raceRunning, questActive, carried, buddyName, together }) -> string[]` in R8's order and wording; `together` is a names array (`comes` for one, `come` for more).
  - `crossingOutcome({ crossTo, ledBy, together, clan, pickPlace, catalog, edition }) -> { picked: boolean, lines: string[] }`, the end-of-walk half as a pure helper (`pickPlace` is injected): `picked = clan && !!pickPlace(crossTo)`; lines are `ledBy ? `${ledBy} led the way to ${lower(name)}! 🧭`` : `` `Next stop: ${lower(name)}! 🧭` ``, then `It's picked on your map.` when `picked`, then when `clan && together.length`: if `ledBy && !picked` `` `Ask ${ledBy} to press Start on the home screen to head there together.` ``, else `` `Walk together again from the home screen to head there with ${joinNames(together)}.` ``. A Legacy device (`clan` false) gets only the first line; its place name is the Legacy `placeName` (a Legacy guest reads "the Moor": acceptable, it is a plain place word).
  - `decideBorderCross(ev, { areaId, selfId, remoteIds, catalog }) -> { to } | null`: non-null only when `ev.type === 'border-cross'`, `ev.from === areaId`, `typeof ev.to === 'string'`, `postsFor(areaId).some((p) => p.to === ev.to)`, `Object.hasOwn(catalog.areas, ev.to)`, `remoteIds.includes(ev.id)`, and `ev.id` is the smallest of `[selfId, ...remoteIds]`.
  - `progression.pickPlace(id) -> 'set' | 'bought' | false`: when `isUnlocked('areas', id)`, `setArea(id)` and outcome `'set'`; else when `buy('areas', id)`, `setArea(id)` and outcome `'bought'`; then `return state.area === id ? outcome : false` (`setArea` returns nothing and refuses a Clan-only place in Legacy). Saves through the existing paths only.
  - `dressingroomview.onPlace` keeps its edition guard and becomes `if (progression.pickPlace(id) === 'bought') autoSync();`.

- [ ] **Step 1: Write the failing tests.** In `test/bordercross.test.js` (plain `state` objects and the real `CATALOG`):
  - `this walk counts toward the gate`: state `{ walks: { woods: 1 }, unlocked: { areas: ['neighborhood', 'woods'] }, points: 0 }`, post `woods-river-long`, fromArea `'woods'` → `kind: 'go'`; the same with `walks.woods: 0` → `locked`, line `'🔒 The River and Marshes opens after 2 walks in The Woods · 1/2 so far'` (capital "The": `opensAfterLine` names the gate's place with the catalog name, as `test/dressingroom.test.js:288` shows); `walks` missing entirely → counted as 0.
  - an owned target is `go`; `moor-gorge` is `unexplored` with name `'The Gorge'`, and its prompt text is `'The Gorge: not explored yet'`.
  - `town-woods` in a fresh save on its first Neighborhood walk → `locked`, ending `· 1/2 so far`.
  - `targetName('neighborhood', 'canon', CATALOG)` equals `PLACE_WORDS.town`; `headTo('The Moor')` is `'Head to the Moor?'` and `headTo(PLACE_WORDS.town)` is `` `Head to ${PLACE_WORDS.town}?` ``.
  - `promptFor` returns `{ text: 'E — Head to the Moor?', kind: 'border' }` solo and for a host, and for a guest `{ text: 'The Moor is this way 🧭 Pip leads the way', kind: 'border-info' }`; `locked` and `unexplored` are `border-info`.
  - `crossCardHtml` escapes a name with `<b>`; `crossExtras` order and exact strings, `Pip comes too.` and `Pip and Max come too.`; `joinNames` for 1, 2 and 3 names.
  - `crossingOutcome`: solo Clan with `pickPlace` → `'bought'`: `picked: true`, lines `['Next stop: the Moor! 🧭', "It's picked on your map."]`; host with `together: ['Pip']`: adds `Walk together again from the home screen to head there with Pip.`; guest `ledBy: 'Pip'` whose `pickPlace` returns false: `['Pip led the way to the Moor! 🧭', 'Ask Pip to press Start on the home screen to head there together.']`; Legacy: `pickPlace` never called, one line.
  - `decideBorderCross refuses…`: from a non-host remote, from an id not in the walk, `from` another area, `to` `'gorge'`, `'__proto__'`, a built area that is not one of this map's targets, a non-string `to`; and accepts the host's well-formed event.
  - `test/clanwords.test.js`'s `src/` sweep already covers the new file; it must stay green.

In `test/progression.test.js`: `pickPlace takes a free place whose gate this walk just met` (after `completeWalk('woods')` twice, `pickPlace('river')` → `'bought'`, `state.area === 'river'`); on an owned place → `'set'`; on a locked one → `false` and `state.area` unchanged; in Legacy on `'woods'` → `false`. In `test/dressingroomview.test.js`: the existing place-tap cases stay green.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/bordercross.test.js test/progression.test.js test/dressingroomview.test.js`
Expected: FAIL (module not found; `pickPlace is not a function`).

- [ ] **Step 3: Implement** `src/bordercross.js`, `progression.pickPlace` and the `onPlace` change.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run test/bordercross.test.js test/progression.test.js test/dressingroomview.test.js test/clanwords.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bordercross.js src/progression.js src/ui/dressingroomview.js test/bordercross.test.js test/progression.test.js test/dressingroomview.test.js
git commit -m "feat(borders): what a post says, and picking the place on the map"
```

### Task 4: The post prompt and the crossing card

**Files:**
- Create: `src/game/crossing.js`
- Modify: `src/game/interactions.js`
- Test: `test/crossing.test.js`, `test/interactions.test.js`

**Interfaces:**
- Consumes: Tasks 1 and 3.
- Produces:
  - `interactions`: a new prompt slot **after `rest` and before `gift-leave`** (so a held thing never hides a post, and anything a kid walked up to comes first). Only when `isClanEdition(progression.state)`, not `s.perched`, not `player.swimming`, not `s.fight` and not `s.clanFight?.uiShowing` (clan-life-2; harmless `undefined` before it merges), and `postNear(s.areaId, x, z)` finds a post. It sets `s.prompt = { kind, data: { post, status } }` from `promptFor(postStatus(post, progression.state, CATALOG, s.areaId), { inRoom: !!s.net, isHost: !!s.net?.isHost?.(), hostName })`, where `hostName` is the `petName` of the remote with the smallest `playerId`. `handleInteract` on `'border'` calls the injected `askCrossing(s, s.prompt.data)`; on `'border-info'` it does nothing. `createInteractions` takes `askCrossing = () => {}`.
  - `createCrossing({ getSession, overlay, hud, releaseControl, resumeWalk, endWalk, getIsTouch, catalog = CATALOG, setTimeout = globalThis.setTimeout })` in `src/game/crossing.js` → `{ ask(s, data), confirm(), cancel(), onLockChange(locked), onRemote(s, ev) }` (`onRemote` and the room branches are Task 7's; here `onRemote` returns).
    - `ask`: only when `data.status.kind === 'go'`, no `s.crossing` and no `s.fight`. Sets `s.crossing = { to, name }`, writes `crossCardHtml({ name, extras: crossExtras({ raceRunning: s.race?.state === 'running', questActive: s.quest?.state === 'active', carried: held ? carryLabel(held.kind) : null, buddyName: s.clanBuddy?.name ?? null, together: [] }) })` (`held = s.carry?.mouth?.held`) into `overlay.innerHTML`, then `releaseControl()`.
    - `confirm`: with `s.crossing` set, solo → `endWalk({ crossTo: s.crossing.to })`.
    - `cancel` and `onLockChange(true)` with `s.crossing` set: `overlay.innerHTML = pauseCardHtml({ welcome: s.welcome, touch: getIsTouch() })` (rebuilt, not a stored string: a mid-walk touch upgrade relabels the live resume button, main.js `onFirstTouch`), `s.crossing = null`; `cancel` then calls `resumeWalk()`.

- [ ] **Step 1: Write the failing tests.**
  - `test/interactions.test.js`, `the border post prompt`: a Clan session at `woods-moor-path` with a save that owns the Moor shows `E — Head to the Moor?` and `kind: 'border'`; E calls `askCrossing` with the post; Legacy (`state.edition = 'legacy'`) shows no border prompt at the same spot; perched, swimming, or `s.fight` set shows none; a `rest` spot in reach wins over the post, and the post wins over `gift-leave` and `drop`; at `moor-gorge` the prompt is `The Gorge: not explored yet` and E calls nothing.
  - `test/crossing.test.js` (fake overlay `{ innerHTML }`, fake session with `welcome`, `race`, `quest`, `carry`, fake timers; `pauseCardHtml` is the real export this task adds to walk.js):
    - `ask then yes ends the walk with the crossing`: `endWalk` called once with `{ crossTo: 'moor' }`.
    - `keep exploring restores the pause card and leaves the race running`: after `ask` with `race.state === 'running'` the card contains `Your race stops here.`; `cancel()` restores the pause card, calls `resumeWalk`, never `endWalk`, and the race is untouched.
    - `re-engaging without answering drops the card`: `onLockChange(true)` restores the pause card and clears `s.crossing`; a later `confirm()` does nothing.
    - `ask` on a `locked` status, or with `s.fight` set, does nothing.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/crossing.test.js test/interactions.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** as in Interfaces (export `pauseCardHtml` from `walk.js` first: today's inline card at walk.js:1615-1622 moved verbatim into `export function pauseCardHtml({ welcome, touch })`, keeping the `${welcome ? `<p class="home-welcome">` text that `test/walk.edition.test.js:157` pins; startWalk keeps `session.welcome = welcome`).

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run test/crossing.test.js test/interactions.test.js test/walk.edition.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/crossing.js src/game/interactions.js src/game/walk.js test/crossing.test.js test/interactions.test.js
git commit -m "feat(borders): a post asks where to go, and a card asks if you're sure"
```

### Task 5: The walk ends with a crossing

**Files:**
- Modify: `src/game/walk.js`
- Test: `test/walk.edition.test.js` (source pins, as that file already does), `test/bordercross.test.js` (already covers `crossingOutcome`)

**Interfaces:**
- Consumes: `crossingOutcome`, `targetName` (Task 3); `pauseCardHtml` (Task 4).
- Produces:
  - `endWalk({ crossTo = null, ledBy = null, together = null } = {})`. Right after `progression.completeWalk(...)`: when `crossTo`, `const out = crossingOutcome({ crossTo, ledBy, together: together ?? walkedWithNames, clan: isClanEdition(progression.state), pickPlace: (id) => progression.pickPlace(id), catalog: CATALOG, edition: progression.state.edition })`, where `walkedWithNames` is today's `session.remotes.list.map((r) => r.petName)`, read before teardown. The "walked with" line uses `together ?? walkedWith` too, so a guest whose host already left still says who it walked with. `out.lines` go into the summary as `.best-line`s (escaped), above Continue. The lifecycle keeps `lastCrossing = { to: crossTo, picked: out.picked, clan }`.
  - `takeCrossing() -> { to, picked, clan } | null`: returns it once and clears it. Added to the lifecycle's returned object.
  - `session.postMarkers` (for Task 8) is **not** added here.

- [ ] **Step 1: Write the failing test** in `test/walk.edition.test.js` (its builds throw on purpose, so no session can end; pin by source, as its existing cases do): `endWalk` takes `{ crossTo, ledBy, together }`; `crossingOutcome(` appears after `progression.completeWalk(` and before `const summaryHtml`; `takeCrossing` is in the returned object; a plain `endWalk()` path computes no outcome (`if (crossTo)` guards it).

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/walk.edition.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/walk.edition.test.js test/walk.visitprize.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/walk.js test/walk.edition.test.js
git commit -m "feat(borders): a crossing ends the walk the normal way and picks the place"
```

### Task 6: Wiring, and the home screen opens on the map

**Files:**
- Modify: `src/main.js`, `src/ui/homebase.js`, `src/ui/dressingroomview.js` (`setPill`), `src/style.css`
- Test: `test/dressingroomview.test.js`, `test/homebase.map.test.js`

**Interfaces:**
- Consumes: Tasks 4 and 5.
- Produces:
  - **main.js order:** `let crossing = null;` declared before `createNetEvents` (main.js:271), so both `createInteractions` (main.js:315, `askCrossing: (s, d) => crossing?.ask(s, d)`) and Task 7's `onBorderCross` can close over it. After `createWalkLifecycle` (main.js:361), destructure `takeCrossing` with the others and set `crossing = createCrossing({ getSession: () => session, overlay, hud, releaseControl: () => handleTouchAction('pause'), resumeWalk, endWalk, getIsTouch: () => isTouch })` (the den shop already releases control this way, main.js:353).
  - **overlay click handler** (main.js:546): `btn-cross-yes` → `crossing.confirm()`, `btn-cross-no` → `crossing.cancel()`.
  - **`player:lockchange`** (main.js:533): also `crossing?.onLockChange(locked)`.
  - **Continue** (main.js:549): `const c = takeCrossing(); homebase.show(c && c.clan ? { pill: 'where' } : undefined);` then today's `sync.autoSync()` and `pullThenNews()` (autoSync also carries a free place `pickPlace` just bought).
  - `homebase.show({ pill } = {})`: with `pill`, `openSheet = null` and `ensureDressing().setPill(pill)` before `render()`, then `root.querySelector('.dr-where')?.scrollIntoView?.({ block: 'start' })`. `dressingroomview` gains `setPill(pill)`, which dispatches `{ type: 'pill', pill }`.
  - `style.css`: `.cross-card` reuses `.pause-card`; `#btn-cross-yes` gets the `.primary` look; both buttons at least 48 px tall.

- [ ] **Step 1: Write the failing tests:** `test/dressingroomview.test.js` `setPill('where') switches the panel and ignores junk`; `test/homebase.map.test.js` (it already mounts the home screen) `show({ pill: 'where' }) opens the dressing room on Where to with no sheet open`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/dressingroomview.test.js test/homebase.map.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main.js src/ui/homebase.js src/ui/dressingroomview.js src/style.css test/dressingroomview.test.js test/homebase.map.test.js
git commit -m "feat(borders): after a crossing the home screen opens on the map with the place picked"
```

### Task 7: Crossing together

**Files:**
- Modify: `src/game/crossing.js`, `src/game/netevents.js`, `src/main.js`
- Test: `test/crossing.test.js`, `test/netevents.test.js`

**Interfaces:**
- Consumes: `decideBorderCross`, `crossExtras`, `joinNames` (Task 3); `createCrossing` (Task 4); `endWalk({ crossTo, ledBy, together })` (Task 5).
- Produces:
  - `crossing.ask` in a room walk: only when `s.net.isHost()`; `together` = the remotes' pet names, so the card says `Pip comes too.`
  - `crossing.confirm` in a room walk: `ev = { v: 1, id: s.playerId, type: 'border-cross', from: s.areaId, to }`; `s.net.sendEvent(ev)` now and again at `CROSS_RESEND_MS = 150`; the overlay shows `<div class="pause-card cross-card"><h1>Off we go! 🧭</h1></div>`; `endWalk({ crossTo: to })` at `CROSS_END_MS = 400`, only if `getSession() === s` (so the broadcast leaves before endWalk closes the room).
  - `crossing.onRemote(s, ev)`: `decideBorderCross(ev, { areaId: s.areaId, selfId: s.playerId, remoteIds: s.remotes.list.map((r) => r.playerId), catalog })`; when non-null and `!s.crossLed`: `s.crossLed = true`; snapshot `together = s.remotes.list.map((r) => r.petName)` and `name` = the sender's `petName`; `hud.toast(`${name} is leading the way to ${lower(targetName(to, …))}! 🧭`)`; at `LED_DELAY_MS = 1500`, if `getSession() === s`, `endWalk({ crossTo: to, ledBy: name, together })`. A guest with the crossing card or the pause card up is fine: `endWalk` replaces the overlay with the summary.
  - `netevents.applyRemoteEvent`: `else if (ev.type === 'border-cross') onBorderCross(s, ev);` with `onBorderCross = () => {}` a new optional dep of `createNetEvents`; main.js passes `(s, ev) => crossing?.onRemote(s, ev)`.

- [ ] **Step 1: Write the failing tests** in `test/crossing.test.js`:
  - `the host's yes tells the room, then ends`: a room session (`net.isHost() === true`, a `sendEvent` spy, one remote `{ playerId: 'b', petName: 'Pip' }`); the card contains `Pip comes too.`; `confirm()` sends the event at 0 and 150 ms, and `endWalk({ crossTo: 'moor' })` runs once at 400 ms.
  - `a guest's post never crosses`: `ask` with `isHost() === false` does nothing.
  - `the guest follows the host`: `onRemote` with the host's event toasts `Pip is leading the way to the Moor! 🧭` and at 1500 ms calls `endWalk({ crossTo: 'moor', ledBy: 'Pip', together: ['Pip'] })`.
  - `the guest keeps who it walked with`: the remotes list is emptied (the host left) before the timer fires; `endWalk` still gets `together: ['Pip']`.
  - `a duplicate or late border-cross ends the walk once`: two events → one `endWalk`; an event after the session is gone or replaced (`getSession()` returns another object) → no `endWalk`.
  - `test/netevents.test.js`: `'border-cross'` reaches `onBorderCross` with `(s, ev)`; an unknown type still does nothing.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/crossing.test.js test/netevents.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/crossing.js src/game/netevents.js src/main.js test/crossing.test.js test/netevents.test.js
git commit -m "feat(borders): in a walk together the host leads the way across, and the walk ends for both"
```

### Task 8: Posts on the corner map

**Files:**
- Modify: `src/ui/minimapmath.js`, `src/ui/minimap.js`, `src/game/walk.js`, `src/main.js`
- Test: `test/minimapmath.test.js`

**Interfaces:**
- Produces: `mapMarkers(frame)` reads `frame.posts` (array of `{ x, z, faces }`, may be null) and pushes `{ kind: 'post', x, z, faces }` after the camp and before the race. `walk.js` sets `session.postMarkers = isClanEdition(state) ? postsFor(areaId).map(({ x, z, faces }) => ({ x, z, faces })) : null`. `main.js` sets `mapFrame.posts = session.postMarkers` beside `mapFrame.camp` (and `posts: null` in the initial `mapFrame`, main.js:636). The painter draws a small brown (`#8a6a48`, white 1.2 px edge) arrow head 7 px long at the post's map point, pointing toward `faces`. The direction is a world vector (`north` = (0, -1) in x/z, etc.) turned by the same heading the map applies to positions, so in "turning" mode the arrow turns with the map (positions alone don't carry direction). Add `faceAngle(faces, view) -> radians` to `minimapmath.js` for that.

- [ ] **Step 1: Write the failing test** in `test/minimapmath.test.js`: `mapMarkers({ ...base, posts: [{ x: 1, z: 2, faces: 'north' }] })` contains `{ kind: 'post', x: 1, z: 2, faces: 'north' }`, after a camp marker when both are given; `posts: null` adds none; `faceAngle('north', northUpView)` points up the map and `faceAngle('north', view turned 90°)` points sideways, consistent with `toMap` for a point 1 m north of the post.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/minimapmath.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/minimapmath.test.js test/minimap.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/minimapmath.js src/ui/minimap.js src/game/walk.js src/main.js test/minimapmath.test.js
git commit -m "feat(borders): the posts on the corner map, so the kids can find them"
```

### Task 9: Live check

**Files:**
- Modify: `docs/VISUAL-PASS.md` (one short "Border posts" note with the readings)

- [ ] **Step 1: Desktop run** (`npm run dev`, Clan Edition, a save with the Woods and the Moor open): walk to `woods-moor-path`; the prompt reads "E — Head to the Moor?"; E shows the card; "Keep exploring" resumes; E then "Yes, let's go!" shows the summary with "Next stop: the Moor! 🧭"; Continue opens the home screen on Where to with the Moor as today's walk; Start walks the Moor. Check the Gorge post's line, a locked post's line, and that each post looks right (no fern or reed through it; the board points out over the edge; the cloth matches the map colour). Flip to Legacy: the Neighborhood's two posts stand there and say nothing.
- [ ] **Step 2: Co-walk check** with two browser windows paired: the guest's post line names the host; the host crosses; both summaries come up (the guest's with "led the way" and "walked with"); both maps have the Moor picked; rejoin and the host's Start lands both in the Moor.
- [ ] **Step 3: iPhone 18 reading** in the Neighborhood and the Woods (HIGH, Auto off, the Stream 4 protocol): draws recorded beside the earlier readings; 60 fps held. If not, stop and report.
- [ ] **Step 4: Commit**

```bash
git add docs/VISUAL-PASS.md
git commit -m "docs(borders): live check and draw readings"
```

## Questions only the owner can answer

1. Legacy's Cozy Neighborhood gains two plain wooden signposts (at the west and north road ends) that never prompt, because both editions build the same Neighborhood. Is that all right, given decision 5 says Legacy keeps the Neighborhood "exactly as it is"? (They are one commit, Task 2 Step 6, so dropping them is easy.)
2. In a walk together only the host (the room's first player) can lead the way across, and it ends the walk for both. Would the kids rather either of them could?
3. Answer 8 gives Twolegplace a third path, west to the River and Marshes. This plan reaches the River through the Woods and gives the Neighborhood no River post (it has no road that way). Should it get one?
4. Should the Pines and the Moor get a path across their border (and so a post each)? Today no path or river crosses it.
