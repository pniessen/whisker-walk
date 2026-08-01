# Whisker Walk v3 "Cat Life" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plush-style cat model + rich animation + shadows, and four new interaction systems: tippables, climbing/perching, boxes + stalk mode, scent trails + meow.

**Architecture:** Two rewrites (`cat/model.js`, `cat/animator.js` — same public contracts, richer internals), two new modules (`tippables.js`, `scent.js`), three area-data extensions (`perches`, `boxes`, tippable spots), small `player.js`/`critters.js` API additions, wiring in `main.js`'s updateAvatar/updateInteractions/keydown.

**Tech Stack:** unchanged. **Spec:** `docs/superpowers/specs/2026-08-01-whisker-walk-v3-catlife.md` — read it first.

## Global Constraints

- All geometry procedural; flat-shaded low-poly style preserved (segment counts ≤ 12).
- New award values exactly: `mischief: 4, sits: 8, treasure: 12` added to `AWARDS`.
- `buildCat(breed, accessories)` and `animateCat(cat, state, t, moveSpeed)` signatures unchanged; `userData.parts` keeps `{body, head, tail, legs, earL, earR}` and adds `tailPivots`, `whiskers`. Animator states in play: `follow, nap, requestPet (sit), scared, sniff, stalk, perch, groom, stretch, pounce`.
- Controls: Shift stalk, Space pounce/climb, V meow, E context (paw over / dig / sniff fallback). Existing keys unchanged.
- All per-frame work inside the `player.locked` gate; all new scene objects created in `startWalk` (disposed by the existing traversal); modules with state expose `dispose()` if they track scene objects outside it (none should need to — attach everything to the scene).
- `npm test` and `npx vite build` green at every commit. Run from repo root. Baseline: 58 tests.

---

### Task 1: Cat model overhaul + shadows

**Files:**
- Rewrite: `src/cat/model.js`
- Modify: `src/main.js` (renderer/sun/traverse shadow config)

**Interfaces:**
- Produces: `buildCat(breed, accessories?)` — same signature/contract; `userData.parts = { body, head, tail, tailPivots, legs, earL, earR, whiskers }` where `tail` is the root pivot group and `tailPivots` is an array of 5 nested pivot groups; `legs` are groups pivoted at the hip with a paw sphere child. All accessories parented to track their body part (collar/bell/bandana/crown under `head`).
- Consumes: STYLE identities per breed (colors preserved from v1).

- [ ] **Step 1: Rewrite src/cat/model.js**

```js
import * as THREE from 'three';

const STYLE = {
  tabby:     { base: 0x9c7a4f, belly: 0xd8c39a, accent: 0x6f5636, scale: 1.0, stripes: true },
  siamese:   { base: 0xe8dcc8, belly: 0xf2ead9, accent: 0x4a3b32, scale: 0.95, points: true },
  persian:   { base: 0xcfcfd4, belly: 0xe8e8ec, accent: 0xb5b5bc, scale: 1.05, fluffy: true },
  black:     { base: 0x2a2a30, belly: 0x3a3a42, accent: 0x1c1c22, scale: 1.0 },
  calico:    { base: 0xf0ead8, belly: 0xf8f4e8, accent: 0xd88030, scale: 1.0, patches: true },
  mainecoon: { base: 0x7a5b3a, belly: 0xb99a72, accent: 0x5a4028, scale: 1.3, fluffy: true, tufts: true },
};
const INNER_EAR = 0xe8a0a8;
const EYE_COLORS = { siamese: 0x68a8d8, black: 0xd8b830 };

const mat = (color) => new THREE.MeshLambertMaterial({ color });

function ball(r, color, sx = 1, sy = 1, sz = 1, wSeg = 10, hSeg = 8) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, wSeg, hSeg), mat(color));
  m.scale.set(sx, sy, sz);
  return m;
}

export function buildCat(breed, accessories = { collar: null, outfit: null }) {
  const s = STYLE[breed];
  const g = new THREE.Group();
  const pointColor = s.points ? s.accent : s.base;

  // body: plush ellipsoid + belly + chest
  const body = ball(0.32, s.base, 0.85, 0.75, 1.35);
  body.position.y = 0.34;
  g.add(body);
  const belly = ball(0.26, s.belly, 0.78, 0.6, 1.15);
  belly.position.set(0, 0.26, -0.02);
  g.add(belly);

  // head
  const head = new THREE.Group();
  const skull = ball(0.21, pointColor, 1, 0.92, 0.95);
  head.add(skull);
  const muzzle = ball(0.09, s.belly, 1.25, 0.75, 0.9);
  muzzle.position.set(0, -0.06, -0.16);
  head.add(muzzle);
  const nose = ball(0.024, INNER_EAR, 1, 0.8, 0.8, 6, 5);
  nose.position.set(0, -0.02, -0.245);
  head.add(nose);
  for (const side of [-1, 1]) {
    const cheek = ball(0.065, s.belly, 1, 0.9, 0.8, 8, 6);
    cheek.position.set(side * 0.085, -0.07, -0.14);
    head.add(cheek);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.075, s.tufts ? 0.19 : 0.15, 4), mat(pointColor));
    ear.position.set(side * 0.12, 0.18, 0.01);
    ear.rotation.z = -side * 0.22;
    head.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.09, 4), mat(INNER_EAR));
    inner.position.set(side * 0.115, 0.16, -0.015);
    inner.rotation.z = -side * 0.22;
    head.add(inner);
    if (side === -1) head.userData.earL = ear;
    else head.userData.earR = ear;

    const eye = ball(0.036, EYE_COLORS[breed] ?? 0x4e9440, 1, 1.15, 0.7, 8, 6);
    eye.position.set(side * 0.083, 0.03, -0.165);
    head.add(eye);
    const pupil = ball(0.017, 0x1a1a1e, 0.7, 1.2, 0.6, 6, 5);
    pupil.position.set(side * 0.083, 0.03, -0.19);
    head.add(pupil);
    const shine = ball(0.007, 0xffffff, 1, 1, 1, 4, 3);
    shine.position.set(side * 0.07, 0.05, -0.195);
    head.add(shine);
  }
  // whiskers
  const whiskers = [];
  const whiskerMat = new THREE.LineBasicMaterial({ color: 0xf8f8f8, transparent: true, opacity: 0.65 });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const y = -0.05 - i * 0.018;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(side * 0.07, y, -0.19),
        new THREE.Vector3(side * 0.28, y + (i - 1) * 0.035, -0.14),
      ]);
      const w = new THREE.Line(geo, whiskerMat);
      head.add(w);
      whiskers.push(w);
    }
  }
  head.position.set(0, 0.56, -0.44);
  g.add(head);

  if (s.fluffy) {
    const ruff = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.075, 6, 12), mat(s.belly));
    ruff.rotation.x = Math.PI / 2 - 0.35;
    ruff.position.set(0, 0.46, -0.32);
    g.add(ruff);
  }

  // legs: hip-pivoted groups with paw spheres
  const legs = [];
  const legSpots = [
    [-0.11, -0.3], [0.11, -0.3], // front L, R
    [-0.11, 0.28], [0.11, 0.28], // back L, R
  ];
  for (const [x, z] of legSpots) {
    const leg = new THREE.Group();
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.26, 6), mat(pointColor));
    limb.position.y = -0.13;
    leg.add(limb);
    const paw = ball(0.062, s.points ? s.accent : s.belly, 1, 0.8, 1.1, 8, 6);
    paw.position.y = -0.27;
    leg.add(paw);
    leg.userData.paw = paw;
    leg.position.set(x, 0.3, z);
    g.add(leg);
    legs.push(leg);
  }

  // tail: 5 tapered segments on nested pivots
  const tail = new THREE.Group();
  const tailPivots = [];
  let parent = tail;
  for (let i = 0; i < 5; i++) {
    const pivot = new THREE.Group();
    pivot.position.z = i === 0 ? 0 : 0.13;
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042 - i * 0.006, 0.048 - i * 0.006, 0.14, 6),
      mat(i >= 3 && (s.stripes || s.points) ? s.accent : s.base)
    );
    seg.rotation.x = Math.PI / 2;
    seg.position.z = 0.065;
    pivot.add(seg);
    parent.add(pivot);
    tailPivots.push(pivot);
    parent = pivot;
  }
  tail.position.set(0, 0.44, 0.42);
  tail.rotation.x = -0.6;
  g.add(tail);

  // breed markings
  if (s.stripes) {
    for (let i = 0; i < 3; i++) {
      const stripe = ball(0.16, s.accent, 1.4, 0.16, 0.32, 8, 6);
      stripe.position.set(0, 0.55, -0.2 + i * 0.2);
      g.add(stripe);
    }
  }
  if (s.patches) {
    const p1 = ball(0.14, s.accent, 1.1, 0.35, 1.1, 8, 6);
    p1.position.set(0.12, 0.54, -0.08);
    g.add(p1);
    const p2 = ball(0.12, 0x333333, 1.1, 0.35, 1.0, 8, 6);
    p2.position.set(-0.12, 0.54, 0.14);
    g.add(p2);
    const p3 = ball(0.07, 0xd88030, 1, 0.8, 1, 6, 5);
    p3.position.set(0.09, 0.62, -0.5); // head patch, parent below
    head.add(p3);
    p3.position.set(0.09, 0.14, -0.05);
  }

  // accessories — head-parented so they track poses
  if (accessories.collar) {
    const collarColor = accessories.collar === 'glow' ? 0x7ef2c0 : 0xd84040;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.028, 6, 12), mat(collarColor));
    ring.rotation.x = Math.PI / 2 + 0.35;
    ring.position.set(0, -0.14, 0.1);
    head.add(ring);
    if (accessories.collar === 'bell') {
      const bell = ball(0.038, 0xf2c14e, 1, 1, 1, 8, 6);
      bell.position.set(0, -0.2, -0.02);
      head.add(bell);
    }
  }
  if (accessories.outfit === 'bandana') {
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.17, 3), mat(0x3a6ea5));
    tri.rotation.x = Math.PI;
    tri.position.set(0, -0.18, 0.02);
    head.add(tri);
  }
  if (accessories.outfit === 'booties') {
    for (const leg of legs) {
      leg.userData.paw.material = mat(0xf2c14e);
      leg.userData.paw.scale.multiplyScalar(1.15);
    }
  }
  if (accessories.outfit === 'backpack') {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.13, 0.1), mat(0x3a6ea5));
    pack.position.set(0, 0.56, 0.12);
    g.add(pack);
  }
  if (accessories.outfit === 'crown') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const petal = ball(0.026, [0xf2a0c0, 0xf2e04e, 0xffffff][i % 3], 1, 1, 1, 5, 4);
      petal.position.set(Math.cos(a) * 0.11, 0.24, Math.sin(a) * 0.07);
      head.add(petal);
    }
  }

  g.scale.setScalar(s.scale);
  g.userData.breed = breed;
  g.userData.parts = {
    body, head, tail, tailPivots, legs,
    earL: head.userData.earL, earR: head.userData.earR, whiskers,
  };
  return g;
}
```

- [ ] **Step 2: Enable shadows in src/main.js**

After `renderer.setSize(...)` in `init()`:

```js
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
```

In `startWalk`, configure the sun and flip shadow flags on everything, right after `areaData` is built and the cat is added (put it after the strayCats/toy creation so it catches every mesh; quest objects and secrets built earlier are covered by the same traverse):

```js
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    sun.shadow.camera.far = 160;
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
```

(Place the traverse as the LAST thing before the `session = {...}` assignment so every walk object is covered. `THREE.Points` and `THREE.Line` are unaffected by the isMesh guard.)

- [ ] **Step 3: Verify** — `npm test` (58, none touch the model), `npx vite build`. Browser: home base → start walk → the cat is rounded and plush with eyes/whiskers, shadow pooled beneath it and every house/tree; all six breeds via the shop still have their color identities; accessories sit correctly. Watch the framerate — if visibly choppy, set `sun.shadow.mapSize.set(1024, 1024)`.

- [ ] **Step 4: Commit** — `git commit -m "feat: plush procedural cat model and scene shadows"`

---

### Task 2: Animator rewrite + pose wiring

**Files:**
- Rewrite: `src/cat/animator.js`
- Modify: `src/main.js` (updateAvatar pose selection: groom/stretch/pounce/stalk/perch hooks — stalk/perch state arrives fully in Tasks 4-5; wire what exists)

**Interfaces:**
- Produces: `animateCat(cat, state, t, moveSpeed)` handling states `follow, nap, requestPet, scared, sniff, stalk, perch, groom, stretch, pounce` with 4-beat gait, tail chain, ear twitches, breathing idle.
- Consumes: the Task 1 parts contract (`tailPivots`, paw-bearing `legs`).

- [ ] **Step 1: Rewrite src/cat/animator.js**

```js
const GAIT_PHASE = [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5]; // 4-beat: FL, FR, BL, BR

export function animateCat(cat, state, t, moveSpeed) {
  const { body, head, tail, tailPivots, legs, earL, earR } = cat.userData.parts;
  const walking = moveSpeed > 0.1;

  // base pose reset
  body.position.y = 0.34;
  body.scale.set(0.85, 0.75, 1.35);
  body.rotation.set(0, 0, 0);
  head.position.set(0, 0.56, -0.44);
  head.rotation.set(0, 0, 0);
  tail.rotation.set(-0.6, 0, 0);
  for (const leg of legs) {
    leg.rotation.set(0, 0, 0);
    leg.scale.set(1, 1, 1);
  }
  for (const p of tailPivots) p.rotation.set(0, 0, 0);

  // ear twitches: brief, occasional, alternating
  const twitchWindow = Math.sin(t * 0.37) > 0.965 ? 1 : 0;
  const twitch = twitchWindow * Math.max(0, Math.sin(t * 9)) * 0.3;
  earL.rotation.z = 0.22 + twitch;
  earR.rotation.z = -0.22 - (twitchWindow ? 0 : Math.max(0, Math.sin(t * 9 + 2)) * (Math.sin(t * 0.53) > 0.97 ? 0.3 : 0));

  if (state === 'nap') {
    body.position.y = 0.24;
    body.scale.set(0.95, 0.55, 1.2);
    head.position.set(0.08, 0.32, -0.3);
    head.rotation.set(0.55, 0.5, 0);
    for (const leg of legs) leg.scale.y = 0.25;
    tail.rotation.set(-0.12, 0, 0);
    for (const p of tailPivots) p.rotation.y = 0.55; // wrap around the body
    body.scale.y += Math.sin(t * 1.4) * 0.015; // slow sleepy breathing
    return;
  }

  if (state === 'stretch') {
    // classic wake-up: front down, butt up
    body.rotation.x = 0.35;
    body.position.y = 0.38;
    head.position.set(0, 0.32, -0.5);
    head.rotation.x = 0.25;
    legs[0].rotation.x = 0.9;
    legs[1].rotation.x = 0.9;
    legs[2].scale.y = 1.1;
    legs[3].scale.y = 1.1;
    tail.rotation.x = -1.15;
    return;
  }

  if (state === 'groom') {
    head.rotation.set(0.5, 0.65, 0.1);
    head.position.y = 0.5 + Math.sin(t * 7) * 0.02; // little licks
    legs[1].rotation.x = -1.15; // raised front paw
    tail.rotation.x = -0.35;
    for (const p of tailPivots) p.rotation.y = Math.sin(t * 1.6) * 0.12;
    return;
  }

  if (state === 'requestPet' || state === 'perch') {
    // upright sit
    body.rotation.x = -0.5;
    body.position.y = 0.32;
    legs[2].scale.y = 0.45;
    legs[3].scale.y = 0.45;
    legs[2].rotation.x = -0.5;
    legs[3].rotation.x = -0.5;
    head.position.set(0, 0.62, -0.34);
    head.rotation.x = state === 'perch' ? 0.05 : -0.18;
    tail.rotation.set(-0.1, 0, 0);
    for (const p of tailPivots) p.rotation.y = 0.5; // tail curled round the front
    tailPivots[0].rotation.y = 0.2 + Math.sin(t * 2.2) * 0.15; // tip flicks
    return;
  }

  if (state === 'sniff') {
    head.position.set(0, 0.38, -0.5);
    head.rotation.x = 0.6 + Math.sin(t * 10) * 0.04; // snuffling
  }

  if (state === 'stalk') {
    body.position.y = 0.24;
    head.position.set(0, 0.4, -0.52);
    head.rotation.x = 0.15;
    for (const leg of legs) leg.scale.y = 0.7;
    tail.rotation.set(-0.12, 0, 0);
  }

  if (state === 'pounce') {
    body.scale.set(0.8, 0.62, 1.55); // stretched mid-leap
    body.position.y = 0.36;
    legs[0].rotation.x = 0.8;
    legs[1].rotation.x = 0.8;
    legs[2].rotation.x = -0.8;
    legs[3].rotation.x = -0.8;
    tail.rotation.x = -0.2;
    return;
  }

  if (state === 'scared') {
    body.position.y = 0.28;
    tail.rotation.set(-1.35, 0, 0);
    for (const p of tailPivots) p.rotation.y = 0.35; // tucked
    earL.rotation.z = 0.6;
    earR.rotation.z = -0.6;
  }

  if (walking) {
    const freq = 4.5 + moveSpeed * 1.4;
    const amp = Math.min(0.6, 0.25 + moveSpeed * 0.09);
    for (let i = 0; i < 4; i++) {
      legs[i].rotation.x = Math.sin(t * freq + GAIT_PHASE[i]) * amp;
    }
    body.position.y += Math.abs(Math.sin(t * freq)) * 0.028;
    body.rotation.z = Math.sin(t * freq * 0.5) * 0.03;
  } else if (state === 'follow') {
    body.scale.y += Math.sin(t * 1.8) * 0.012; // breathing
  }

  // lively lagged tail chain
  const sway = walking ? 0.1 + moveSpeed * 0.03 : 0.16;
  tail.rotation.x = (state === 'scared' ? -1.35 : -0.6) + Math.sin(t * 2.1) * 0.08;
  for (let i = 0; i < tailPivots.length; i++) {
    tailPivots[i].rotation.y += Math.sin(t * 2.6 - i * 0.65) * sway;
  }
}
```

- [ ] **Step 2: Pose selection in src/main.js updateAvatar**

Replace the existing pose block (`const sitAt ...` through `animateCat(...)`) with:

```js
    const napper = p.special === 'napper';
    const groomAt = napper ? 3 : 6;
    const sitAt = napper ? 5 : 10;
    const napAt = napper ? 8 : 16;

    if (s.stretchTime > 0) s.stretchTime -= dt;
    if (s.sniffTime > 0) s.sniffTime -= dt;
    const wasNapping = s.pose === 'nap';
    let pose = 'follow';
    if (s.freezeTime > 0) pose = 'scared';
    else if (s.pounceTime > 0) pose = 'pounce';
    else if (s.stretchTime > 0) pose = 'stretch';
    else if (s.sniffTime > 0) pose = 'sniff';
    else if (speed > 0.3 && player.stalking) pose = 'stalk';
    else if (s.idleTime > napAt) pose = 'nap';
    else if (s.idleTime > sitAt) pose = 'requestPet';
    else if (s.idleTime > groomAt) pose = 'groom';
    if (wasNapping && pose !== 'nap' && s.stretchTime <= 0) {
      s.stretchTime = 1; // wake-up stretch
      pose = 'stretch';
    }
    s.pose = pose;
    animateCat(cat, pose, t, speed);
```

Add `pose: 'follow', stretchTime: 0, sniffTime: 0,` to the session object. (`player.stalking` arrives in Task 5 — until then add a temporary `const stalking = false;`-safe reference: use `player.stalking ?? false`.)

- [ ] **Step 3: Verify** — tests + build + browser: gait looks like a trot with bob; stopping idles through groom (paw licks) → sit (tail curled, tip flicking) → curl-up nap (breathing); moving again plays the stretch first; tail sways as a chain; ears twitch occasionally.

- [ ] **Step 4: Commit** — `git commit -m "feat: rich cat animation with gait, tail chain, groom and stretch"`

---

### Task 3: Tippables

**Files:**
- Create: `src/tippables.js`
- Modify: `src/discoveries.js` (AWARDS), `src/world/neighborhood.js`, `src/world/park.js`, `src/world/seaside.js` (tippable spots in areaData), `src/critters.js` (villager dismay hook), `src/main.js`
- Test: `test/tippables.test.js`, extend `test/discoveries.test.js`

**Interfaces:**
- Produces: `createTippables(scene, spots)` where `spots = [{x, z, kind}]`, `kind ∈ 'pot'|'can'|'bin'` → `{ list, nearest(pos, maxDist), tip(t) -> bool, update(dt) }`. Each entry `{ id, kind, group, tipped }`. `tip()` starts a 0.5s topple (rotate ~1.75 rad around a ground axis with a small hop), returns false if already tipped.
- Produces: `AWARDS` gains `mischief: 4, sits: 8, treasure: 12` (all three v3 awards land here).
- Produces: areaData gains `tippables` (neighborhood 5, park 4, seaside 4).
- Produces: `critters.dismayNear(pos, range)` — villagers within range play their wave animation for ~1.5s (sets `c.meowWaveT = 1.5`, consumed by the villager update branch alongside the existing proximity wave).

- [ ] **Step 1: Write failing tests**

`test/tippables.test.js`:

```js
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createTippables } from '../src/tippables.js';

const scene = { add() {}, remove() {} };
const SPOTS = [
  { x: 0, z: 0, kind: 'pot' },
  { x: 5, z: 0, kind: 'can' },
  { x: 0, z: 5, kind: 'bin' },
];

describe('createTippables', () => {
  it('builds one entry per spot, untipped', () => {
    const tp = createTippables(scene, SPOTS);
    expect(tp.list).toHaveLength(3);
    expect(tp.list.every((e) => !e.tipped)).toBe(true);
  });

  it('nearest finds only untipped entries in range', () => {
    const tp = createTippables(scene, SPOTS);
    const near = new THREE.Vector3(0.5, 0, 0);
    expect(tp.nearest(near, 1.5)).toBe(tp.list[0]);
    tp.tip(tp.list[0]);
    expect(tp.nearest(near, 1.5)).toBe(null);
  });

  it('tip returns true once then false, and topples over time', () => {
    const tp = createTippables(scene, SPOTS);
    const e = tp.list[0];
    expect(tp.tip(e)).toBe(true);
    expect(tp.tip(e)).toBe(false);
    for (let i = 0; i < 40; i++) tp.update(0.05);
    expect(Math.abs(e.group.rotation.z) + Math.abs(e.group.rotation.x)).toBeGreaterThan(1.2);
  });
});
```

Extend `test/discoveries.test.js`:

```js
  it('defines the v3 award values', () => {
    expect(AWARDS.mischief).toBe(4);
    expect(AWARDS.sits).toBe(8);
    expect(AWARDS.treasure).toBe(12);
  });
```

- [ ] **Step 2: Run tests — verify fail**

- [ ] **Step 3: Implement src/tippables.js**

```js
import * as THREE from 'three';

const mat = (color) => new THREE.MeshLambertMaterial({ color });
let nextId = 1;

function buildTippable(kind) {
  const g = new THREE.Group();
  if (kind === 'pot') {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.11, 0.24, 8), mat(0xc06a48));
    pot.position.y = 0.12;
    g.add(pot);
    const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), mat(0x4e9440));
    plant.position.y = 0.32;
    g.add(plant);
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), mat(0xf2a0c0));
    bloom.position.y = 0.44;
    g.add(bloom);
  } else if (kind === 'can') {
    const canBody = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.22, 8), mat(0x6a9ab8));
    canBody.position.y = 0.11;
    g.add(canBody);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.2, 6), mat(0x6a9ab8));
    spout.rotation.z = 0.9;
    spout.position.set(0.14, 0.16, 0);
    g.add(spout);
  } else {
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.4, 8), mat(0x8a8a92));
    bin.position.y = 0.2;
    g.add(bin);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.04, 8), mat(0x74747c));
    lid.position.y = 0.42;
    g.add(lid);
  }
  return g;
}

export function createTippables(scene, spots) {
  const list = [];
  for (const spot of spots) {
    const group = buildTippable(spot.kind);
    group.position.set(spot.x, 0, spot.z);
    group.rotation.y = (spot.x * 7 + spot.z * 13) % 6; // stable pseudo-random facing
    scene.add(group);
    list.push({ id: `tip-${nextId++}`, kind: spot.kind, group, tipped: false, anim: 0 });
  }

  return {
    list,
    nearest(pos, maxDist) {
      let best = null;
      let bestD = maxDist;
      for (const e of list) {
        if (e.tipped) continue;
        const d = e.group.position.distanceTo(pos);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      return best;
    },
    tip(e) {
      if (e.tipped) return false;
      e.tipped = true;
      e.anim = 0.5;
      return true;
    },
    update(dt) {
      for (const e of list) {
        if (!e.tipped || e.anim <= 0) continue;
        e.anim -= dt;
        const k = 1 - Math.max(0, e.anim) / 0.5; // 0 → 1
        e.group.rotation.z = -1.75 * k;
        e.group.position.y = Math.sin(k * Math.PI) * 0.12; // little hop
      }
    },
  };
}
```

- [ ] **Step 4: Run tests — verify pass** (add the AWARDS values in `src/discoveries.js` too: append `mischief: 4, sits: 8, treasure: 12` to the object)

- [ ] **Step 5: Area spots + villager dismay + wiring**

Add to each area's returned object (positions near houses/fences/benches, away from paths):
- `neighborhood.js`: `tippables: [{ x: -8, z: -32, kind: 'pot' }, { x: 9, z: -13, kind: 'pot' }, { x: -14, z: 17, kind: 'can' }, { x: 15, z: 32, kind: 'pot' }, { x: 5, z: 22, kind: 'bin' }],`
- `park.js`: `tippables: [{ x: 4, z: 27, kind: 'can' }, { x: -3, z: 15, kind: 'pot' }, { x: -9, z: -21, kind: 'bin' }, { x: 15, z: -27, kind: 'pot' }],`
- `seaside.js`: `tippables: [{ x: 17, z: 15, kind: 'pot' }, { x: 17, z: -17, kind: 'can' }, { x: 21, z: 29, kind: 'bin' }, { x: -7, z: 9, kind: 'pot' }],`

`src/critters.js` — in the villager update branch, extend the wave condition. Add to the critter creation defaults `meowWaveT: 0`, and change the villager branch to:

```js
        } else if (c.type === 'villager') {
          const arm = c.group.userData.arm;
          if (c.meowWaveT > 0) c.meowWaveT -= dt;
          if (dPlayer < 5 || c.meowWaveT > 0) {
            arm.rotation.z = 2.6 + Math.sin(t * 6) * 0.3; // wave
            if (!c.waved && dPlayer < 5) {
              c.waved = true;
              bus.emit('villager:wave', { id: c.id });
            }
          } else {
            arm.rotation.z = 0.4;
            if (dPlayer > 8) c.waved = false;
          }
        }
```

And add to the critters api: `dismayNear(pos, range) { for (const c of list) if (c.type === 'villager' && c.group.position.distanceTo(pos) < range) c.meowWaveT = 1.5; },`

`src/main.js`: import `createTippables`; in `startWalk` (before the shadow traverse): `const tippables = createTippables(scene, areaData.tippables ?? []);` — add `tippables` to the session. In the locked loop: `session.tippables.update(dt);`. Prompt (in `updateInteractions`, after the collectible loop, before quest):

```js
    if (!s.prompt) {
      const tippable = s.tippables.nearest(catP, 1.3);
      if (tippable) {
        s.prompt = { kind: 'tip', data: tippable };
        hud.setPrompt('E — paw it over');
      }
    }
```

`handleInteract` branch (before quest branches):

```js
    } else if (s.prompt.kind === 'tip') {
      if (s.tippables.tip(s.prompt.data)) {
        log.awardOnce('mischief', `tip-${s.prompt.data.id}`, 'Gravity check! 🐾');
        s.critters.dismayNear(s.prompt.data.group.position, 8);
      }
    }
```

Also make the gnome tippable: in `updateInteractions`'s secret-spotting loop nothing changes, but add to the prompt chain (same block as tippables, else-if): if the gnome secret (`s.secrets.list.find(e => e.key === 'gnome')`) is within 1.3 and not `userData.tipped`: prompt `E — paw over the gnome`; on E: set `gnome.group.rotation.z = -1.4; gnome.group.userData.tipped = true;` and `log.awardOnce('mischief', 'tip-gnome', 'Gnome down! 🧙')`.

- [ ] **Step 6: Verify** — tests + build + browser: pots/cans/bins visible in the neighborhood; pawing one topples it with a hop, +4 toast, nearby villager flails; gnome tips too.

- [ ] **Step 7: Commit** — `git commit -m "feat: tippable pots, cans, bins, and gnome with villager dismay"`

---

### Task 4: Climbing & perching

**Files:**
- Modify: `src/player.js` (perchY + stalking getter + inputActive getter), the three area files (`perches`), `src/critters.js` (setFleeModifier), `src/main.js`

**Interfaces:**
- Produces: areaData `perches: [{x, z, y, label?, vantage?}]`; `player.perchY` (number, default 0 — update() sets avatar y to it), `player.inputActive` (any arrow held), `player.stalking` (Shift held); `critters.setFleeModifier(m)` (multiplies flee trigger radii, default 1, reset per walk).
- Session gains `perched` (perch object or null).

- [ ] **Step 1: player.js additions**

In `createPlayer`: add `perchY: 0,` to the api object. In `update()`, change `avatar.position.y = 0;` to `avatar.position.y = api.perchY;`. Add getters:

```js
    get inputActive() {
      return keys.has('ArrowUp') || keys.has('ArrowDown') || keys.has('ArrowLeft') || keys.has('ArrowRight');
    },
    get stalking() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
```

Reset `api.perchY = 0;` inside `setAvatar`.

- [ ] **Step 2: Area perches**

- `neighborhood.js`: `perches: [{ x: 28, z: 28, y: 0.58 }, { x: 32, z: 24, y: 0.58 }, { x: 4, z: -35, y: 1.35, label: 'king of the car roof', vantage: true }, { x: -4, z: 20, y: 1.35 }],`
- `park.js`: `perches: [{ x: 3, z: 26, y: 0.58 }, { x: -4, z: 14, y: 0.58 }, { x: -10, z: -20, y: 0.58 }, { x: 2.8, z: 22.2, y: 0.75, label: 'fountain-edge lookout', vantage: true }],`
- `seaside.js`: `perches: [{ x: 18, z: 14, y: 0.58 }, { x: 18, z: -18, y: 0.58 }, { x: -8, z: 10, y: 0.72 }, { x: -28, z: 18, y: 0.72, label: 'overlook boulder', vantage: true }],`

- [ ] **Step 3: critters.setFleeModifier**

In `createCritters`, add `let fleeModifier = 1;` and api method `setFleeModifier(m) { fleeModifier = m; }`. Multiply into the two flee checks: bird/seagull `threat < 2.5 * fleeScale * fleeModifier * (...)`.

- [ ] **Step 4: main.js wiring**

Session gains `perched: null,`. Space handler becomes climb-aware — replace the pounce block:

```js
    if (e.code === 'Space' && session && player.locked && !e.repeat &&
        !session.cameraMode && session.freezeTime <= 0) {
      if (session.perched) {
        session.perched = null;                    // hop down
        player.perchY = 0;
      } else {
        const perch = (session.areaData.perches ?? []).find(
          (pp) => Math.hypot(pp.x - session.cat.position.x, pp.z - session.cat.position.z) < 1.2
        );
        if (perch) {
          session.perched = perch;
          player.perchY = perch.y;
          player.halt();
          session.cat.position.set(perch.x, perch.y, perch.z);
          audio.meow();
          if (perch.vantage) log.awardOnce('scenic', `perch-${perch.label}`, perch.label);
        } else if (session.pounceCooldown <= 0) {
          player.pounce();
          session.pounceTime = 0.3;
          session.pounceCooldown = 1.2;
        }
      }
    }
```

In `updateAvatar`, before pose selection: dismount on movement input, hold the perch pose, and drive the flee modifier:

```js
    if (s.perched && player.inputActive) {
      s.perched = null;
      player.perchY = 0;
    }
    s.critters.setFleeModifier(s.perched || player.stalking ? 0.5 : 1);
```

And in the pose chain insert `else if (s.perched) pose = 'perch';` right after the pounce line (perched wins over idle states). While perched, `player.speedFactor = 0` (add alongside the freeze branch: `player.speedFactor = s.freezeTime > 0 || s.perched ? 0 : 1;` replacing the existing freeze/else lines — but keep the stalk factor from Task 5 in mind; final form lands in Task 5).

- [ ] **Step 5: Verify** — tests + build + browser: Space by a bench hops the cat up into a sit; arrows hop off; Space on the car roof fires "king of the car roof +8"; birds let you watch from perches noticeably closer; Space in the open still pounces.

- [ ] **Step 6: Commit** — `git commit -m "feat: climbing and perching with vantage awards"`

---

### Task 5: Boxes + stalk mode

**Files:**
- Modify: `src/world/builder.js` (cardboardBox prop), the three area files (`boxes`), `src/main.js`

**Interfaces:**
- Produces: `builder.cardboardBox(x, z, rotY?)`; areaData `boxes: [{x, z}]` (2-3 per area); box-sit detection + `sits` award; Shift stalking (pose + 45% speed + flee modifier — modifier shared with Task 4).

- [ ] **Step 1: builder.cardboardBox**

Append to `src/world/builder.js`:

```js
export function cardboardBox(x, z, rotY = 0) {
  const g = new THREE.Group();
  const cardboard = mat(0xc8a678);
  const wallSpecs = [
    [0.55, 0.3, 0.03, 0, 0.15, 0.26], [0.55, 0.3, 0.03, 0, 0.15, -0.26],
    [0.03, 0.3, 0.55, 0.26, 0.15, 0], [0.03, 0.3, 0.55, -0.26, 0.15, 0],
  ];
  for (const [w, h, d, px, py, pz] of wallSpecs) {
    const wall = box(w, h, d, 0xc8a678);
    wall.position.set(px, py, pz);
    g.add(wall);
  }
  const bottom = box(0.55, 0.03, 0.55, 0xb89468);
  bottom.position.y = 0.015;
  g.add(bottom);
  for (const side of [-1, 1]) {
    const flap = box(0.55, 0.02, 0.2, 0xd8b688);
    flap.position.set(0, 0.31, side * 0.34);
    flap.rotation.x = side * -0.7;
    g.add(flap);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}
```

(uses the module's existing `mat`/`box` helpers)

- [ ] **Step 2: Area boxes**

- `neighborhood.js`: `boxes: [{ x: -10, z: -28 }, { x: 13, z: 18 }, { x: -18, z: 8 }],` plus `for (const b2 of [[-10, -28], [13, 18], [-18, 8]]) scene.add(b.cardboardBox(b2[0], b2[1], b2[0] * 0.7));`
- `park.js`: `boxes: [{ x: 5, z: 33 }, { x: -12, z: -14 }],` + matching `scene.add(b.cardboardBox(...))` calls
- `seaside.js`: `boxes: [{ x: 19, z: 24 }, { x: -14, z: 4 }, { x: 30, z: -6 }],` + matching calls

- [ ] **Step 3: main.js — box sitting + stalk**

Session gains `boxTime: 0,`. In `updateAvatar` after the puddle loop:

```js
    // if I fits, I sits
    const inBox = (s.areaData.boxes ?? []).findIndex(
      (bx) => Math.hypot(bx.x - cat.position.x, bx.z - cat.position.z) < 0.35
    );
    if (inBox >= 0 && speed < 0.3 && !s.perched) {
      s.boxTime += dt;
      if (s.boxTime > 1) log.awardOnce('sits', `box-${inBox}`, 'If I fits, I sits 📦');
    } else {
      s.boxTime = 0;
    }
```

Stalk speed — the speedFactor line reaches its final form (freeze/perch zero, stalk 45%, else 1):

```js
    if (s.freezeTime > 0) s.freezeTime -= dt;
    player.speedFactor = (s.freezeTime > 0 || s.perched) ? 0 : player.stalking ? 0.45 : 1;
```

(the pose chain from Task 2 already shows `stalk` when moving with Shift; box-sitting shows the sit pose naturally once idleTime accrues — force it sooner: in the pose chain, add `else if (s.boxTime > 1) pose = 'requestPet';` after the perch line.)

- [ ] **Step 4: Verify** — tests + build + browser: boxes render with open flaps; sitting in one pops "+8 If I fits, I sits"; holding Shift crouch-stalks at low speed and birds tolerate you much closer (combo a stalk-approach into a Space-pounce catch).

- [ ] **Step 5: Commit** — `git commit -m "feat: cardboard boxes and shift-stalk mode"`

---

### Task 6: Scent trails, meow, and release polish

**Files:**
- Create: `src/scent.js`
- Modify: `src/straycats.js` (meow reaction), `src/critters.js` (meow reactions), `src/main.js`, `README.md`
- Test: `test/scent.test.js`

**Interfaces:**
- Produces: `rollTreats(rng, pois, count=2) -> [{id, x, z}]` (poi + ±4 jitter); `trailPoints(from, to, rng, steps=7) -> [{x, z}]` (jittered lerp, excludes endpoints); `createScent(scene, area, rng)` → `{ treats, sniff(pos, range) -> treat|null` (spawns fading paw-print decals toward the treat, once per treat), `digAt(pos) -> treat|null` (within 1.2, undug → unearth: treat mesh pops up), `nearestMound(pos, maxDist)`, `update(dt)` (decal fade ~6s), `}`.
- Produces: `critters.reactToMeow(pos)` (villagers ≤6 wave via meowWaveT; birds ≤5 flee) and `strayCats.reactToMeow(pos) -> count` (strays ≤8 face the cat + greet pose 1.5s).
- Consumes: `E` fallback (no prompt → sniff), keenNose range 30 vs 18, `V` key.

- [ ] **Step 1: Write failing tests**

`test/scent.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { rollTreats, trailPoints, createScent } from '../src/scent.js';

const POIS = [{ x: 10, z: 0 }, { x: -10, z: 10 }, { x: 0, z: -20 }];
const rngQueue = (...vals) => () => (vals.length ? vals.shift() : 0.5);
const scene = { add() {}, remove() {} };
const AREA = { pois: POIS, bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } };

describe('rollTreats', () => {
  it('buries the requested number near distinct pois', () => {
    const treats = rollTreats(() => 0.3, POIS, 2);
    expect(treats).toHaveLength(2);
    expect(treats[0].id).not.toBe(treats[1].id);
  });
});

describe('trailPoints', () => {
  it('produces steps points progressing from from to to', () => {
    const pts = trailPoints({ x: 0, z: 0 }, { x: 10, z: 0 }, () => 0.5, 7);
    expect(pts).toHaveLength(7);
    expect(pts[0].x).toBeLessThan(pts[6].x);
    for (const p of pts) expect(Math.abs(p.z)).toBeLessThan(2); // jitter bounded
  });
});

describe('createScent', () => {
  it('sniff finds a treat in range once, digAt unearths within 1.2', () => {
    const scent = createScent(scene, AREA, () => 0.4);
    const treat = scent.treats[0];
    const near = { x: treat.x - 5, z: treat.z };
    expect(scent.sniff(near, 18)).toBe(treat);
    expect(scent.sniff(near, 18)).toBe(null); // trail already revealed
    expect(scent.digAt({ x: treat.x + 5, z: treat.z })).toBe(null); // too far
    expect(scent.digAt({ x: treat.x + 0.5, z: treat.z })).toBe(treat);
    expect(scent.digAt({ x: treat.x + 0.5, z: treat.z })).toBe(null); // already dug
  });

  it('sniff out of range finds nothing', () => {
    const scent = createScent(scene, AREA, () => 0.4);
    expect(scent.sniff({ x: 999, z: 999 }, 18)).toBe(null);
  });
});
```

- [ ] **Step 2: Run tests — verify fail**

- [ ] **Step 3: Implement src/scent.js**

```js
import * as THREE from 'three';

export function rollTreats(rng, pois, count = 2) {
  const treats = [];
  const used = new Set();
  while (treats.length < count && used.size < pois.length) {
    const i = Math.floor(rng() * pois.length);
    if (used.has(i)) continue;
    used.add(i);
    const poi = pois[i];
    treats.push({
      id: `treat-${treats.length}`,
      x: poi.x + (rng() - 0.5) * 8,
      z: poi.z + (rng() - 0.5) * 8,
    });
  }
  return treats;
}

export function trailPoints(from, to, rng, steps = 7) {
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const k = i / (steps + 1);
    pts.push({
      x: from.x + (to.x - from.x) * k + (rng() - 0.5) * 1.6,
      z: from.z + (to.z - from.z) * k + (rng() - 0.5) * 1.6,
    });
  }
  return pts;
}

export function createScent(scene, area, rng) {
  const treats = rollTreats(rng, area.pois, 2).map((tr) => ({
    ...tr,
    revealed: false,
    dug: false,
  }));

  // subtle mounds, visible when close
  for (const tr of treats) {
    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 5),
      new THREE.MeshLambertMaterial({ color: 0x8a6a48 })
    );
    mound.scale.y = 0.25;
    mound.position.set(tr.x, 0.02, tr.z);
    scene.add(mound);
    tr.mound = mound;
  }

  const decals = [];

  return {
    treats,
    sniff(pos, range) {
      let best = null;
      let bestD = range;
      for (const tr of treats) {
        if (tr.revealed || tr.dug) continue;
        const d = Math.hypot(tr.x - pos.x, tr.z - pos.z);
        if (d < bestD) {
          bestD = d;
          best = tr;
        }
      }
      if (!best) return null;
      best.revealed = true;
      for (const p of trailPoints(pos, best, rng)) {
        const decal = new THREE.Mesh(
          new THREE.CircleGeometry(0.14, 8),
          new THREE.MeshBasicMaterial({ color: 0xf2e04e, transparent: true, opacity: 0.85 })
        );
        decal.rotation.x = -Math.PI / 2;
        decal.position.set(p.x, 0.03, p.z);
        scene.add(decal);
        decals.push({ mesh: decal, life: 8 });
      }
      return best;
    },
    nearestMound(pos, maxDist) {
      for (const tr of treats) {
        if (!tr.dug && Math.hypot(tr.x - pos.x, tr.z - pos.z) < maxDist) return tr;
      }
      return null;
    },
    digAt(pos) {
      for (const tr of treats) {
        if (tr.dug) continue;
        if (Math.hypot(tr.x - pos.x, tr.z - pos.z) <= 1.2) {
          tr.dug = true;
          tr.mound.scale.y = 0.08;
          const fish = new THREE.Mesh(
            new THREE.SphereGeometry(0.12, 8, 6),
            new THREE.MeshLambertMaterial({ color: 0x9ab8d0 })
          );
          fish.scale.set(1.4, 0.7, 0.5);
          fish.position.set(tr.x, 0.4, tr.z);
          if (this.sceneRef) this.sceneRef.add(fish);
          else fish.position.y = 0.4; // attached below
          scene.add(fish);
          return tr;
        }
      }
      return null;
    },
    update(dt) {
      for (const d of [...decals]) {
        d.life -= dt;
        d.mesh.material.opacity = Math.min(0.85, d.life / 3);
        if (d.life <= 0) {
          scene.remove(d.mesh);
          decals.splice(decals.indexOf(d), 1);
        }
      }
    },
  };
}
```

(Remove the stray `this.sceneRef` lines when implementing — `scene.add(fish)` alone is correct; the reviewer should treat the duplicated add as a plan typo to fix, keep exactly one `scene.add(fish)`.)

- [ ] **Step 4: Run tests — verify pass**

- [ ] **Step 5: Meow reactions**

`src/critters.js` api addition:

```js
    reactToMeow(pos) {
      for (const c of list) {
        if (c.type === 'villager' && c.group.position.distanceTo(pos) < 6) c.meowWaveT = 1.5;
        if ((c.type === 'bird' || c.type === 'seagull') && !c.fleeing &&
            c.group.position.distanceTo(pos) < 5) {
          c.fleeing = true;
          c.cooldown = 18;
        }
      }
    },
```

`src/straycats.js` api addition:

```js
    reactToMeow(pos) {
      let count = 0;
      for (const s of strays) {
        if (s.group.position.distanceTo(pos) < 8) {
          s.state = 'greet';
          s.timer = 1.5;
          s.group.rotation.y = Math.atan2(pos.x - s.group.position.x, pos.z - s.group.position.z) + Math.PI;
          count += 1;
        }
      }
      return count;
    },
```

- [ ] **Step 6: main.js wiring**

Import `createScent`. In `startWalk`: `const scent = createScent(scene, areaData, Math.random);` — session gains `scent`. Loop adds `session.scent.update(dt);`.

Dig prompt in `updateInteractions` (after the tippable block):

```js
    if (!s.prompt) {
      const mound = s.scent.nearestMound(catP, 1.2);
      if (mound && mound.revealed) {
        s.prompt = { kind: 'dig' };
        hud.setPrompt('E — dig it up');
      }
    }
```

`handleInteract` gains (before the scratch branch):

```js
    } else if (s.prompt.kind === 'dig') {
      const treat = s.scent.digAt(s.cat.position);
      if (treat) log.awardOnce('treasure', treat.id, 'a buried treasure!');
    }
```

E-with-no-prompt = sniff — change the KeyE line in the keydown listener:

```js
    if (e.code === 'KeyE' && session && player.locked) {
      if (session.prompt) handleInteract(session);
      else {
        session.sniffTime = 1;
        const range = PERSONALITIES[session.cat.userData.breed].special === 'keenNose' ? 30 : 18;
        const found = session.scent.sniff(session.cat.position, range);
        hud.toast(found ? 'You smell something… follow the paw prints! 👃' : 'Nothing on the breeze.');
      }
    }
```

(and `handleInteract` keeps its internal `if (!s.prompt) return;` — harmless.)

V meow:

```js
    if (e.code === 'KeyV' && session && player.locked) {
      audio.meow();
      session.critters.reactToMeow(session.cat.position);
      if (session.strayCats.reactToMeow(session.cat.position) > 0) {
        setTimeout(() => audio.meow(), 350); // a reply from a friend
      }
    }
```

- [ ] **Step 7: README + controls hint**

README controls line becomes:

```markdown
**Controls:** click to grab the mouse · arrow keys to prowl · Shift to stalk ·
mouse orbits the camera · Space to pounce or climb · E to interact / sniff ·
V to meow · T yarn ball · C camera · M mute · Esc to pause or end the walk.
```

Ready-overlay hint: `Arrows move · Shift stalk · Space pounce/climb · E interact/sniff · V meow · T yarn · C camera`

- [ ] **Step 8: Full regression + playtest checklist** — `npm test`, `npm run build`, then browser: sniff→trail→dig loop (+12), meow reactions (villager wave, stray reply meow, birds scatter), every v3 system in one walk, framerate with shadows+rain acceptable, no console errors.

- [ ] **Step 9: Commit** — `git commit -m "feat: scent trails, buried treasure, and the meow button"`

---

## Plan Self-Review Notes

- Spec §1→Task 3, §2→Task 4, §3→Task 5, §4→Task 6, §5→Task 1, §6→Task 2, §7→Task 1. Awards land in Task 3.
- Ordering: graphics first (Tasks 1-2) so interaction tasks inherit the new poses (`stalk`, `perch` used by Tasks 4-5 exist from Task 2).
- Known cross-task contract: `player.stalking` is referenced (safely, via `?? false`) in Task 2 but implemented in Task 4's player.js additions — Task 4 removes the need for the guard; speedFactor's final form lands in Task 5.
- Plan typo flagged inline (scent.js duplicate `scene.add(fish)` / `sceneRef` remnant) — implementer keeps exactly one `scene.add(fish)`.

