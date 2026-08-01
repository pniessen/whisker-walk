# Whisker Walk v2 — "Spice" Feature Wave — Design Spec

**Date:** 2026-07-31
**Status:** Approved by user
**Base:** v1 game (see 2026-07-31-whisker-walk-design.md). All five features below were
user-selected. They reuse existing systems (brain states, discovery log, critter
spawner, HUD, home base) — no architectural changes.

## 1. Toys — throw & fetch

- Player always carries a yarn ball. **T** throws it from the hand in the facing
  direction: it arcs under gravity, bounces, and rolls with friction, clamped to
  area bounds. Only one throw at a time; auto-retrieved after ~15s idle or when
  the player walks over it.
- On throw, the walking cat enters a `fetch` state (driven by the controller via
  `brain.set('fetch', ...)` — no brain-module changes): it runs to the ball and
  **bats** it (impulse away from the cat, ball skitters) twice.
- After batting: **playful breeds** (specials `pouncer`, `chaser`) nose the ball
  back toward the player; when it gets within 2 units of the player the fetch
  completes — `play` award (+5), ball retrieved, purr. **Other breeds** lose
  interest and resume; the ball stays where it lies until picked up (no award).

## 2. Villager quests

- One villager per walk is the quest giver: a bobbing **❗** marker floats above
  them. Within 2.5 units an `E — talk to the neighbor` prompt appears (priority
  below collectibles, above stray-greets).
- Accepting shows a persistent HUD **objective pill** and spawns the quest
  object at a target position chosen from the area's POIs:
  - **kitten** — a tiny (0.5-scale, random breed) kitten idles at the target;
    `E — scoop up the kitten` completes.
  - **letter** — a sparkling drop-off marker at the target; `E — deliver the
    letter` completes.
  - **glasses** — small spectacles at the target, visible within 10 units;
    `E — pick up the glasses` completes.
- Completion: `quest` award (+25), completion toast, objective cleared, object
  despawned. One quest max per walk; declining is just walking away.

## 3. Photo mode + album

- **C** toggles camera mode: a viewfinder overlay (corner brackets + hint text)
  appears; the game keeps running. Clicking (while pointer-locked) snaps a photo.
- A snap captures the **centered subject**: nearest critter / stray cat / secret
  (see §5) / active little-moment location / scenic spot within 12 units and
  facing-dot > 0.75. No subject → "just scenery" toast, no award, no photo.
- Captured photos store a real 160×120 JPEG thumbnail (offscreen-canvas downscale
  of the rendered frame) plus subject label and area, in `localStorage` under
  `whisker-walk-album` (separate from the save; corrupt data → empty album with
  a console.warn). Album caps at 24 photos, oldest rotated out.
- First photo of each subject key: `photo` award (+8). The home base gains a
  **Photo Album** section rendering the thumbnails with labels.
- Shutter click sound; `M` mute governs it like everything else.

## 4. Weather + day cycle

- Each walk rolls a condition (seeded per walk): **clear** 50%, **rain** 30%,
  **golden sunset** 20%. The glow-collar dusk toggle overrides the roll (dusk
  walks stay as in v1).
- **Rain:** grey sky + closer fog, ~600 recycled particle streaks falling around
  the camera, 3 extra temporary puddles, bird-type spawns halved. Rain stops
  after 60–120s: sky brightens and a **rainbow** (concentric colored arcs, far
  away) appears for ~30s — being outdoors facing it awards `rainbow` (+15) once.
  Booties/steady interactions with puddles work as in v1 (more puddles = more
  splash opportunities).
- **Sunset:** warm orange-pink sky, warm low sun, long ambience — purely
  atmospheric, plus it enables the UFO easter egg (§5).

## 5. Easter eggs + the unicorn

- **🦄 Unicorn** (~1/8 walks): a pastel low-poly unicorn with a golden horn and
  a sparkle halo grazes near the POI farthest from spawn. It wanders slowly.
  If the player approaches fast it trots away; creeping up slowly lets you get
  close. Spotting it (within 12, facing) awards `legend` (+50). It is a prime
  photo subject.
- **🛸 UFO** (~1/5 dusk or sunset walks): a small saucer glides across the sky
  once at a random moment, 15-second flyover; spotting it awards `secret` (+12).
- **🧙 Gnome** (every walk): a tiny red-hatted garden gnome hides at a random
  POI offset, different each walk; spotting awards `secret` (+12) once per walk.

## Award additions

`play: 5, quest: 25, photo: 8, secret: 12, legend: 50, rainbow: 15` — appended to
`AWARDS`; all flow through the existing discovery log (repeat-halving/once rules
unchanged).

## Controls after this wave

Arrows walk · mouse looks · **E** interact · **T** throw toy · **C** camera ·
M mute · Esc pause. README updated.

## Module additions

```
src/toy.js        // throwable yarn ball physics (pure-testable core)
src/quests.js     // quest FSM (pure-testable) — controller wires visuals
src/album.js      // photo store on localStorage (pure-testable)
src/weather.js    // roll + rain schedule (pure-testable) + scene effects
src/secrets.js    // secret roll (pure-testable) + unicorn/ufo/gnome actors
```

Main.js wiring per feature; HUD gains objective pill + viewfinder; home base
gains the album section. Vitest covers every pure module; visual behavior is
verified in-browser.

## Out of scope

Toy selection (only the yarn ball), multi-quest chains, photo sharing/export,
weather forecasts, seasonal cycles, unicorn riding (no matter how tempting).
