# Whisker Walk v2 "Spice" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five user-approved features to the finished v1 game: throwable toy with fetch, villager quests, photo mode + album, weather + rainbows, and secrets (unicorn/UFO/gnome).

**Architecture:** Five new modules (`toy.js`, `quests.js`, `album.js`, `weather.js`, `secrets.js`) with pure-testable cores, each wired into `src/main.js`'s existing session lifecycle. HUD gains an objective pill and viewfinder; home base gains a Photo Album section. No changes to the brain module (fetch is controller-driven via `brain.set`).

**Tech Stack:** unchanged — Vite, Three.js, Vitest, vanilla ES modules.

**Spec:** `docs/superpowers/specs/2026-07-31-whisker-walk-v2-spice.md`. **Read it before starting.**

## Global Constraints

- All geometry procedural Three.js primitives; no external assets; no UI framework.
- New award values exactly: `play: 5, quest: 25, photo: 8, secret: 12, legend: 50, rainbow: 15` (added to `AWARDS` in `src/discoveries.js`).
- Album storage key exactly `whisker-walk-album`, cap 24, corrupt data → empty album + `console.warn`, never a crash. The game save (`whisker-walk-save`, version 2) is untouched by this wave.
- Keys: `T` throw toy, `C` camera toggle — both only while `session && player.locked`. Existing E/M/Esc/arrows unchanged.
- All per-frame work happens inside the existing `if (player.locked)` simulation gate; all new session objects are created in `startWalk` and cleaned up by the existing scene-traversal disposal in `endWalk` (dispose runs BEFORE detach — preserve that ordering; new actors just need `scene.add` at build time).
- Run commands from repo root. Commit per task with the given messages. `npm test` and `npx vite build` must be green at every commit.

---

### Task 1: Toy system — throw, physics, fetch

**Files:**
- Create: `src/toy.js`
- Modify: `src/discoveries.js` (AWARDS), `src/main.js`, `src/audio.js` (shutter for Task 3 comes later; not here)
- Test: `test/toy.test.js`, extend `test/discoveries.test.js`

**Interfaces:**
- Produces: `createToy(scene) -> toy` with `mesh`, `active` (bool), `idleTime` (seconds settled), `throwFrom(pos, dir, power=9)`, `bat(fromPos)`, `nudgeToward(targetPos, dt)`, `retrieve()`, `update(dt, bounds)`.
- Produces: `AWARDS` gains all six v2 keys (play/quest/photo/secret/legend/rainbow) in this task.
- Consumes: session lifecycle, `brain.set('fetch', n)`, `PERSONALITIES[breed].special`.

- [ ] **Step 1: Write failing tests**

`test/toy.test.js`:

```js
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createToy } from '../src/toy.js';

const scene = { add() {}, remove() {} };
const BOUNDS = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };

describe('createToy', () => {
  it('starts inactive and hidden', () => {
    const toy = createToy(scene);
    expect(toy.active).toBe(false);
    expect(toy.mesh.visible).toBe(false);
  });

  it('throwFrom activates and flies forward under gravity', () => {
    const toy = createToy(scene);
    toy.throwFrom(new THREE.Vector3(0, 1.1, 0), new THREE.Vector3(0, 0, -1));
    expect(toy.active).toBe(true);
    const z0 = toy.mesh.position.z;
    toy.update(0.05, BOUNDS);
    expect(toy.mesh.position.z).toBeLessThan(z0); // moved forward (-z)
    const yAfterOne = toy.mesh.position.y;
    for (let i = 0; i < 40; i++) toy.update(0.05, BOUNDS);
    expect(toy.mesh.position.y).toBeLessThan(yAfterOne); // gravity pulled it down
  });

  it('lands, slows to rest, and accrues idleTime', () => {
    const toy = createToy(scene);
    toy.throwFrom(new THREE.Vector3(0, 1.1, 0), new THREE.Vector3(0, 0, -1));
    for (let i = 0; i < 200; i++) toy.update(0.05, BOUNDS);
    expect(toy.mesh.position.y).toBeLessThanOrEqual(0.14);
    expect(toy.idleTime).toBeGreaterThan(0);
    expect(toy.mesh.position.z).toBeGreaterThanOrEqual(BOUNDS.minZ);
  });

  it('bat pushes the ball away from the batter', () => {
    const toy = createToy(scene);
    toy.throwFrom(new THREE.Vector3(0, 0.13, 0), new THREE.Vector3(0, 0, 0), 0);
    for (let i = 0; i < 40; i++) toy.update(0.05, BOUNDS); // settle
    toy.bat(new THREE.Vector3(-1, 0, 0)); // cat to the west → ball flies east
    toy.update(0.05, BOUNDS);
    expect(toy.mesh.position.x).toBeGreaterThan(0);
    expect(toy.idleTime).toBe(0);
  });

  it('retrieve deactivates and hides', () => {
    const toy = createToy(scene);
    toy.throwFrom(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1));
    toy.retrieve();
    expect(toy.active).toBe(false);
    expect(toy.mesh.visible).toBe(false);
  });
});
```

Extend `test/discoveries.test.js` with:

```js
  it('defines the v2 award values', () => {
    expect(AWARDS.play).toBe(5);
    expect(AWARDS.quest).toBe(25);
    expect(AWARDS.photo).toBe(8);
    expect(AWARDS.secret).toBe(12);
    expect(AWARDS.legend).toBe(50);
    expect(AWARDS.rainbow).toBe(15);
  });
```

- [ ] **Step 2: Run tests — verify the new ones fail** (`npm test`)

- [ ] **Step 3: Implement src/toy.js**

```js
import * as THREE from 'three';

const GRAVITY = -14;
const BOUNCE = 0.45;
const RADIUS = 0.13;

export function createToy(scene) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS, 8, 8),
    new THREE.MeshLambertMaterial({ color: 0xe05c8a })
  );
  const wrap = new THREE.Mesh(
    new THREE.TorusGeometry(RADIUS * 0.95, 0.018, 6, 12),
    new THREE.MeshLambertMaterial({ color: 0xc03060 })
  );
  wrap.rotation.x = 1.1;
  mesh.add(wrap);
  mesh.visible = false;
  scene.add(mesh);

  const velocity = new THREE.Vector3();

  const api = {
    mesh,
    active: false,
    idleTime: 0,
    throwFrom(pos, dir, power = 9) {
      mesh.position.copy(pos);
      velocity.copy(dir).setY(0).multiplyScalar(power);
      velocity.y = 4;
      mesh.visible = true;
      api.active = true;
      api.idleTime = 0;
    },
    bat(fromPos) {
      const dir = mesh.position.clone().sub(fromPos).setY(0);
      if (dir.lengthSq() < 0.0001) dir.set(1, 0, 0);
      velocity.add(dir.normalize().multiplyScalar(3 + Math.random() * 2));
      velocity.y = Math.max(velocity.y, 2);
      api.idleTime = 0;
    },
    nudgeToward(target, dt) {
      const dir = target.clone().sub(mesh.position).setY(0);
      if (dir.lengthSq() < 0.0001) return;
      mesh.position.addScaledVector(dir.normalize(), 1.8 * dt);
      api.idleTime = 0;
    },
    retrieve() {
      api.active = false;
      mesh.visible = false;
      velocity.set(0, 0, 0);
    },
    update(dt, bounds) {
      if (!api.active) return;
      velocity.y += GRAVITY * dt;
      mesh.position.addScaledVector(velocity, dt);
      if (mesh.position.y < RADIUS) {
        mesh.position.y = RADIUS;
        if (Math.abs(velocity.y) > 1) velocity.y = -velocity.y * BOUNCE;
        else velocity.y = 0;
        const f = Math.pow(0.15, dt); // ground friction
        velocity.x *= f;
        velocity.z *= f;
      }
      if (bounds) {
        mesh.position.x = THREE.MathUtils.clamp(mesh.position.x, bounds.minX, bounds.maxX);
        mesh.position.z = THREE.MathUtils.clamp(mesh.position.z, bounds.minZ, bounds.maxZ);
      }
      const speed = velocity.length();
      if (speed < 0.2 && mesh.position.y <= RADIUS + 0.01) api.idleTime += dt;
      else api.idleTime = 0;
      mesh.rotation.x += speed * dt * 2;
    },
  };
  return api;
}
```

And in `src/discoveries.js` extend AWARDS to exactly:

```js
export const AWARDS = {
  critter: 5, collectible: 10, pet: 4, scenic: 8, moment: 12, perk: 3, friend: 6,
  play: 5, quest: 25, photo: 8, secret: 12, legend: 50, rainbow: 15,
};
```

- [ ] **Step 4: Run tests — verify pass** (`npm test`)

- [ ] **Step 5: Wire into src/main.js**

In `startWalk`, after the strayCats creation: `const toy = createToy(scene);` and add to the session object: `toy, toyPlay: { bats: 0, returning: false },` (import `createToy` at top).

Key handler — add to the existing keydown listener in `init()`:

```js
    if (e.code === 'KeyT' && session && player.locked && !session.toy.active) {
      session.toy.throwFrom(handPosition(), player.forward());
      session.toyPlay = { bats: 0, returning: false };
      session.brain.set('fetch', 14);
    }
```

In `updateCat`'s state target chain, add a `fetch` branch after the `distracted` branch:

```js
    } else if (state === 'fetch') {
      if (!s.toy.active) {
        brain.set('follow', 2);
      } else {
        target = s.toy.mesh.position.clone();
        if (cat.position.distanceTo(s.toy.mesh.position) < 0.6) {
          if (s.toyPlay.bats < 2) {
            s.toyPlay.bats += 1;
            s.toy.bat(cat.position);
          } else if (p.special === 'pouncer' || p.special === 'chaser') {
            s.toyPlay.returning = true;
            s.toy.nudgeToward(camera.position, dt);
          } else {
            brain.set('follow', 3); // lost interest — ball stays put
          }
        }
        if (s.toyPlay.returning && s.toy.mesh.position.distanceTo(camera.position) < 2) {
          log.award('play', 'fetch', 'a perfect fetch!');
          audio.purr();
          s.toy.retrieve();
          brain.set('follow', 3);
        }
      }
    }
```

In the locked-simulation block of the animation loop, after `session.strayCats.update`:

```js
      session.toy.update(dt, session.areaData.bounds);
      if (session.toy.active &&
          (session.toy.idleTime > 15 ||
           (session.toy.idleTime > 0.5 && session.toy.mesh.position.distanceTo(camera.position) < 1.2))) {
        session.toy.retrieve(); // walked over it, or everyone lost interest
      }
```

- [ ] **Step 6: Verify** — `npm test`, `npx vite build`, dev-server boot. Browser (controller or reviewer): press T on a walk → ball arcs out, cat runs to it and bats it; with Siamese it pushes the ball back and a "+5 a perfect fetch!" toast fires.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: add throwable yarn ball with personality-driven fetch"`

---

### Task 2: Villager quests

**Files:**
- Create: `src/quests.js`
- Modify: `src/ui/hud.js` (objective pill), `src/style.css`, `src/main.js`
- Test: `test/quests.test.js`

**Interfaces:**
- Produces: `QUEST_TYPES = ['kitten', 'letter', 'glasses']`; `createQuest(rng, targetSpots) -> quest` with `type`, `target` ({x,z} picked from targetSpots), `state` getter (`'offered'|'active'|'complete'`), `texts` (`{offer, objective, prompt, done}`), `accept()`, `tryComplete(pos, radius=2) -> bool`.
- Produces: `hud.setObjective(text|null)`.
- Consumes: `area.pois` as targetSpots, first villager critter as giver, prompt/interact pipeline.

- [ ] **Step 1: Write failing tests**

`test/quests.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createQuest, QUEST_TYPES } from '../src/quests.js';

const SPOTS = [{ x: 10, z: 0 }, { x: -5, z: 20 }, { x: 0, z: -30 }];
const rngQueue = (...vals) => () => (vals.length ? vals.shift() : 0.5);

describe('createQuest', () => {
  it('picks a type and a target from the provided spots deterministically', () => {
    const q = createQuest(rngQueue(0, 0), SPOTS);
    expect(q.type).toBe(QUEST_TYPES[0]);
    expect(q.target).toEqual(SPOTS[0]);
    const q2 = createQuest(rngQueue(0.99, 0.99), SPOTS);
    expect(q2.type).toBe(QUEST_TYPES[2]);
    expect(q2.target).toEqual(SPOTS[2]);
  });

  it('walks offered → active → complete', () => {
    const q = createQuest(rngQueue(0, 0), SPOTS);
    expect(q.state).toBe('offered');
    expect(q.tryComplete({ x: 10, z: 0 })).toBe(false); // not accepted yet
    q.accept();
    expect(q.state).toBe('active');
    expect(q.tryComplete({ x: 30, z: 30 })).toBe(false); // too far
    expect(q.tryComplete({ x: 10.5, z: 0.5 })).toBe(true);
    expect(q.state).toBe('complete');
    expect(q.tryComplete({ x: 10, z: 0 })).toBe(false); // already done
  });

  it('has full text for every quest type', () => {
    for (let i = 0; i < QUEST_TYPES.length; i++) {
      const q = createQuest(rngQueue(i / QUEST_TYPES.length + 0.01, 0), SPOTS);
      expect(q.texts.offer.length).toBeGreaterThan(0);
      expect(q.texts.objective.length).toBeGreaterThan(0);
      expect(q.texts.prompt.startsWith('E — ')).toBe(true);
      expect(q.texts.done.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run tests — verify fail**

- [ ] **Step 3: Implement src/quests.js**

```js
export const QUEST_TYPES = ['kitten', 'letter', 'glasses'];

const TEXTS = {
  kitten: {
    offer: '"My kitten ran off again! Could you find her for me?"',
    objective: 'Find the lost kitten 🐾',
    prompt: 'E — scoop up the kitten',
    done: 'You found the kitten! She purrs and scampers home.',
  },
  letter: {
    offer: '"Could you deliver this letter to the sparkly drop-off for me?"',
    objective: 'Deliver the letter 📨 (look for the sparkle)',
    prompt: 'E — deliver the letter',
    done: 'Letter delivered! The neighbor will be thrilled.',
  },
  glasses: {
    offer: '"I lost my glasses on my walk… I can barely see you!"',
    objective: 'Find the lost glasses 👓',
    prompt: 'E — pick up the glasses',
    done: 'Found them! Barely a scratch.',
  },
};

export function createQuest(rng, targetSpots) {
  const type = QUEST_TYPES[Math.floor(rng() * QUEST_TYPES.length)];
  const target = targetSpots[Math.floor(rng() * targetSpots.length)];
  let state = 'offered';

  return {
    type,
    target,
    texts: TEXTS[type],
    get state() {
      return state;
    },
    accept() {
      if (state === 'offered') state = 'active';
    },
    tryComplete(pos, radius = 2) {
      if (state !== 'active') return false;
      if (Math.hypot(pos.x - target.x, pos.z - target.z) > radius) return false;
      state = 'complete';
      return true;
    },
  };
}
```

- [ ] **Step 4: Run tests — verify pass**

- [ ] **Step 5: HUD objective pill**

In `src/ui/hud.js`, add to the template after the `.hud-top` div: `<div class="hud-objective hidden" id="hud-objective"></div>`, grab it, and add to the api:

```js
    setObjective(text) {
      const el = root.querySelector('#hud-objective');
      el.classList.toggle('hidden', !text);
      if (text) el.textContent = text;
    },
```

`src/style.css`:

```css
.hud-objective {
  position: absolute; top: 64px; left: 50%; transform: translateX(-50%);
  background: rgba(242,193,78,0.9); color: #3a2a10; font-weight: 700;
  padding: 6px 16px; border-radius: 999px; font-size: 0.95rem;
}
```

- [ ] **Step 6: Wire quests into src/main.js**

Imports: `createQuest` from `./quests.js`, `buildCat` is already imported.

In `startWalk` after critters creation:

```js
    let questGiver = null;
    let quest = null;
    let questObject = null;
    const giver = critters.list.find((c) => c.type === 'villager');
    if (giver) {
      questGiver = giver;
      quest = createQuest(Math.random, areaData.pois);
      const marker = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.4, 6),
        new THREE.MeshLambertMaterial({ color: 0xf2c14e, emissive: 0x6a5010 })
      );
      marker.rotation.x = Math.PI;
      marker.position.y = 2.1;
      giver.group.add(marker);
      questGiver.marker = marker;
      // quest object at the target, revealed on accept
      const t = quest.target;
      if (quest.type === 'kitten') {
        questObject = buildCat(['tabby', 'calico', 'black'][Math.floor(Math.random() * 3)]);
        questObject.scale.multiplyScalar(0.5);
      } else if (quest.type === 'letter') {
        questObject = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.25, 0),
          new THREE.MeshLambertMaterial({ color: 0xf2e04e, emissive: 0x8a7a20 })
        );
        questObject.position.y = 1;
      } else {
        questObject = new THREE.Group();
        for (const side of [-0.12, 0.12]) {
          const lens = new THREE.Mesh(
            new THREE.TorusGeometry(0.09, 0.02, 6, 12),
            new THREE.MeshLambertMaterial({ color: 0x4a4a52 })
          );
          lens.position.x = side;
          questObject.add(lens);
        }
        questObject.position.y = 0.15;
      }
      questObject.position.x = t.x;
      questObject.position.z = t.z;
      questObject.visible = false;
      scene.add(questObject);
    }
```

Add to the session object: `quest, questGiver, questObject,`.

In `updateInteractions`, insert quest prompts between the collectible loop and the stray-greet block:

```js
    if (!s.prompt && s.quest && s.questGiver) {
      if (s.quest.state === 'offered' &&
          s.questGiver.group.position.distanceTo(camera.position) < 2.5) {
        s.prompt = { kind: 'quest-accept' };
        hud.setPrompt('E — talk to the neighbor');
      } else if (s.quest.state === 'active' &&
          Math.hypot(s.quest.target.x - camera.position.x, s.quest.target.z - camera.position.z) < 2) {
        s.prompt = { kind: 'quest-complete' };
        hud.setPrompt(s.quest.texts.prompt);
      }
    }
```

In `handleInteract`, add branches before the stray branch:

```js
    } else if (s.prompt.kind === 'quest-accept') {
      s.quest.accept();
      hud.toast(s.quest.texts.offer);
      hud.setObjective(s.quest.texts.objective);
      if (s.questObject) s.questObject.visible = true;
      if (s.questGiver.marker) s.questGiver.marker.visible = false;
    } else if (s.prompt.kind === 'quest-complete') {
      if (s.quest.tryComplete(camera.position)) {
        log.award('quest', 'quest', s.quest.texts.done);
        hud.setObjective(null);
        if (s.questObject) s.questObject.visible = false;
        audio.chime();
      }
    }
```

In the locked-simulation loop, bob the marker: `if (session.questGiver?.marker?.visible) session.questGiver.marker.position.y = 2.1 + Math.sin(t * 3) * 0.12;`. Glasses stay hidden until accepted AND you're within 10: in `updateInteractions` top add `if (s.quest?.state === 'active' && s.quest.type === 'glasses' && s.questObject) s.questObject.visible = Math.hypot(s.quest.target.x - camera.position.x, s.quest.target.z - camera.position.z) < 10;`. In `endWalk`, add `hud.setObjective(null);`.

- [ ] **Step 7: Verify** — tests + build + browser: villager has a bobbing ❗; E accepts (toast + objective pill); target object appears; E at target completes (+25, pill clears).

- [ ] **Step 8: Commit** — `git commit -m "feat: add villager quests with kitten/letter/glasses objectives"`

---

### Task 3: Photo mode + album

**Files:**
- Create: `src/album.js`
- Modify: `src/ui/hud.js` (viewfinder), `src/ui/homebase.js` (album section + signature), `src/style.css`, `src/audio.js` (shutter), `src/main.js`
- Test: `test/album.test.js`

**Interfaces:**
- Produces: `createAlbum(storage, cap = 24) -> album` with `photos` getter (array of `{key, label, area, thumb}`), `has(key)`, `add(photo) -> bool` (true if first photo of that key; enforces cap by dropping oldest), `clear()`. Storage key `whisker-walk-album`, JSON `{version: 1, photos}`.
- Produces: `hud.setCamera(on)`; `audio.shutter()`; `createHomeBase(progression, album, onStartWalk)` (NEW middle param — update the call in main.js).
- Consumes: renderer canvas for thumbnails, spotting-style subject detection.

- [ ] **Step 1: Write failing tests**

`test/album.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { createAlbum } from '../src/album.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

describe('createAlbum', () => {
  it('starts empty and reports first-photo status from add()', () => {
    const album = createAlbum(fakeStorage());
    expect(album.photos).toEqual([]);
    expect(album.add({ key: 'critter-bird', label: 'a songbird', area: 'X', thumb: 'data:1' })).toBe(true);
    expect(album.add({ key: 'critter-bird', label: 'a songbird', area: 'X', thumb: 'data:2' })).toBe(false);
    expect(album.photos).toHaveLength(2);
    expect(album.has('critter-bird')).toBe(true);
  });

  it('caps the album and rotates out the oldest', () => {
    const album = createAlbum(fakeStorage(), 3);
    for (let i = 0; i < 5; i++) album.add({ key: `k${i}`, label: `p${i}`, area: 'X', thumb: `t${i}` });
    expect(album.photos).toHaveLength(3);
    expect(album.photos[0].key).toBe('k2');
  });

  it('persists across instances', () => {
    const storage = fakeStorage();
    createAlbum(storage).add({ key: 'a', label: 'a', area: 'X', thumb: 't' });
    expect(createAlbum(storage).photos).toHaveLength(1);
  });

  it('recovers from corrupt data with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const album = createAlbum(fakeStorage({ 'whisker-walk-album': '{nope' }));
    expect(album.photos).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('survives a storage that throws on write', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const album = createAlbum({ getItem: () => null, setItem: () => { throw new Error('quota'); } });
    expect(() => album.add({ key: 'a', label: 'a', area: 'X', thumb: 't' })).not.toThrow();
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests — verify fail**

- [ ] **Step 3: Implement src/album.js**

```js
const KEY = 'whisker-walk-album';

export function createAlbum(storage, cap = 24) {
  let photos = [];
  try {
    const raw = storage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.photos)) photos = parsed.photos;
    }
  } catch (err) {
    console.warn('Whisker Walk: could not read album, starting empty', err);
  }

  const save = () => {
    try {
      storage.setItem(KEY, JSON.stringify({ version: 1, photos }));
    } catch (err) {
      console.warn('Whisker Walk: could not save album', err);
    }
  };

  return {
    get photos() {
      return photos;
    },
    has(key) {
      return photos.some((p) => p.key === key);
    },
    add(photo) {
      const first = !this.has(photo.key);
      photos.push(photo);
      while (photos.length > cap) photos.shift();
      save();
      return first;
    },
    clear() {
      photos = [];
      save();
    },
  };
}
```

- [ ] **Step 4: Run tests — verify pass**

- [ ] **Step 5: Viewfinder, shutter, album UI**

`src/ui/hud.js` — add to the template: `<div class="hud-viewfinder hidden" id="hud-viewfinder"><span>📷 click to snap · C to lower</span></div>`, and to the api:

```js
    setCamera(on) {
      root.querySelector('#hud-viewfinder').classList.toggle('hidden', !on);
    },
```

`src/style.css`:

```css
.hud-viewfinder {
  position: absolute; inset: 10%; border: 3px solid rgba(255,255,255,0.85);
  border-radius: 14px; pointer-events: none;
  box-shadow: 0 0 0 6px rgba(20,26,38,0.25);
}
.hud-viewfinder span {
  position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
  background: rgba(20,26,38,0.7); padding: 4px 12px; border-radius: 999px; font-size: 0.9rem;
}
.photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.photos figure { background: rgba(255,255,255,0.07); border-radius: 10px; padding: 8px; }
.photos img { width: 100%; border-radius: 6px; display: block; }
.photos figcaption { font-size: 0.8rem; color: #a8c0e0; margin-top: 6px; }
```

`src/audio.js` — add to the api object:

```js
    shutter() {
      tone(1300, 0.03, { type: 'square', gain: 0.09 });
      tone(700, 0.04, { type: 'square', gain: 0.07, delay: 0.05 });
    },
```

`src/ui/homebase.js` — change the signature to `createHomeBase(progression, album, onStartWalk)` and add before the footer in `render()`:

```js
        <section><h2>Photo album 📸</h2><div class="photos">
          ${album.photos.length
            ? album.photos.map((p) => `<figure><img src="${p.thumb}" alt="${p.label}"><figcaption>${p.label} — ${p.area}</figcaption></figure>`).join('')
            : '<div class="tag">No photos yet — press C on a walk to raise the camera!</div>'}
        </div></section>
```

- [ ] **Step 6: Wire camera mode into src/main.js**

Import `createAlbum`; create `const album = createAlbum(window.localStorage);` beside progression; update the home base call to `createHomeBase(progression, album, startWalk)`. Add `cameraMode: false,` to the session object.

Key + click handlers in `init()`:

```js
    // in the keydown listener:
    if (e.code === 'KeyC' && session && player.locked) {
      session.cameraMode = !session.cameraMode;
      hud.setCamera(session.cameraMode);
    }
    // new listener:
    document.addEventListener('mousedown', () => {
      if (session && player.locked && session.cameraMode) snapPhoto(session);
    });
```

Also `hud.setCamera(false)` in `endWalk`, and when pointer lock is lost turn the viewfinder off: extend the existing `player:lockchange` handler with `if (session && !locked) { session.cameraMode = false; hud.setCamera(false); }`.

Subject detection + snap (new functions in `init()`):

```js
  function findPhotoSubject(s) {
    const candidates = [];
    for (const c of s.critters.list) {
      if (c.spottable && !c.fleeing) candidates.push({ key: `critter-${c.type}`, label: labelFor(c.type), pos: c.group.position });
    }
    for (const st of s.strayCats.strays) candidates.push({ key: 'stray', label: 'a stray cat', pos: st.group.position });
    for (const sec of s.secrets?.list ?? []) {
      if (sec.group.visible) candidates.push({ key: sec.key, label: sec.label, pos: sec.group.position });
    }
    if (s.activeMoment) {
      candidates.push({ key: `moment-${s.activeMoment.m.id}`, label: s.activeMoment.m.label, pos: new THREE.Vector3(s.activeMoment.m.x, 0, s.activeMoment.m.z) });
    }
    for (const sc of s.areaData.scenics) candidates.push({ key: `scenic-${sc.id}`, label: sc.label, pos: new THREE.Vector3(sc.x, 0, sc.z) });
    let best = null;
    let bestDot = 0.75;
    for (const c of candidates) {
      const to = c.pos.clone().sub(camera.position).setY(0);
      if (to.length() > 12) continue;
      const dot = to.normalize().dot(player.forward());
      if (dot > bestDot) { bestDot = dot; best = c; }
    }
    return best;
  }

  function snapPhoto(s) {
    audio.shutter();
    const subject = findPhotoSubject(s);
    if (!subject) {
      hud.toast('Just scenery… get closer to something!');
      return;
    }
    renderer.render(s.scene, camera);
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 160;
    thumbCanvas.height = 120;
    thumbCanvas.getContext('2d').drawImage(renderer.domElement, 0, 0, 160, 120);
    const first = album.add({
      key: subject.key, label: subject.label, area: s.areaData.name,
      thumb: thumbCanvas.toDataURL('image/jpeg', 0.6),
    });
    hud.toast(`📸 ${subject.label}`);
    if (first) log.awardOnce('photo', `photo-${subject.key}`, `your first photo of ${subject.label}`);
  }
```

(`s.secrets` doesn't exist until Task 5 — the optional chain keeps this safe.)

- [ ] **Step 7: Verify** — tests + build + browser: C shows the viewfinder; snapping a bird pops "📸 a songbird" plus a first-photo award; the home-base album shows a real thumbnail; reload keeps it; snapping empty grass says "Just scenery…".

- [ ] **Step 8: Commit** — `git commit -m "feat: add photo mode with persistent album and first-photo awards"`

---

### Task 4: Weather + rainbows

**Files:**
- Create: `src/weather.js`
- Modify: `src/main.js`
- Test: `test/weather.test.js`

**Interfaces:**
- Produces: `rollWeather(rng) -> 'clear'|'rain'|'sunset'` (0.5/0.3/0.2); `createRainSchedule(rng) -> {stopAt (60–120), rainbowUntil (stopAt+30), phase(t) -> 'rain'|'rainbow'|'after'}`; `createWeather(scene, sun, condition, rng) -> weather` with `condition`, `update(dt, cameraPos)`, `rainbowVisible` (bool), `rainbowPos` ({x,z} or null).
- Consumes: called in `startWalk` BEFORE critters creation (rain halves bird spawns and adds puddles); rainbow award via the discovery log.

- [ ] **Step 1: Write failing tests**

`test/weather.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { rollWeather, createRainSchedule } from '../src/weather.js';

describe('rollWeather', () => {
  it('maps rng ranges to conditions 50/30/20', () => {
    expect(rollWeather(() => 0.1)).toBe('clear');
    expect(rollWeather(() => 0.49)).toBe('clear');
    expect(rollWeather(() => 0.55)).toBe('rain');
    expect(rollWeather(() => 0.79)).toBe('rain');
    expect(rollWeather(() => 0.85)).toBe('sunset');
  });
});

describe('createRainSchedule', () => {
  it('spans 60-120s of rain then a 30s rainbow window', () => {
    const early = createRainSchedule(() => 0);
    expect(early.stopAt).toBe(60);
    expect(early.rainbowUntil).toBe(90);
    const late = createRainSchedule(() => 1);
    expect(late.stopAt).toBe(120);
    expect(late.rainbowUntil).toBe(150);
  });

  it('phases correctly over time', () => {
    const s = createRainSchedule(() => 0);
    expect(s.phase(10)).toBe('rain');
    expect(s.phase(61)).toBe('rainbow');
    expect(s.phase(95)).toBe('after');
  });
});
```

- [ ] **Step 2: Run tests — verify fail**

- [ ] **Step 3: Implement src/weather.js**

```js
import * as THREE from 'three';

export function rollWeather(rng) {
  const r = rng();
  if (r < 0.5) return 'clear';
  if (r < 0.8) return 'rain';
  return 'sunset';
}

export function createRainSchedule(rng) {
  const stopAt = 60 + rng() * 60;
  const rainbowUntil = stopAt + 30;
  return {
    stopAt,
    rainbowUntil,
    phase(t) {
      return t < stopAt ? 'rain' : t < rainbowUntil ? 'rainbow' : 'after';
    },
  };
}

const RAINBOW_COLORS = [0xe05050, 0xe09a40, 0xe8d84e, 0x58b858, 0x5878d8, 0x8858c8];

export function createWeather(scene, sun, condition, rng) {
  const api = { condition, rainbowVisible: false, rainbowPos: null, update() {} };
  if (condition === 'clear') return api;

  if (condition === 'sunset') {
    scene.background = new THREE.Color(0xf0a060);
    scene.fog = new THREE.Fog(0xf8c890, 40, 130);
    sun.color.set(0xffb060);
    sun.intensity = 1.5;
    return api;
  }

  // rain
  const prevBackground = scene.background.clone();
  const prevFog = { color: scene.fog.color.clone(), near: scene.fog.near, far: scene.fog.far };
  scene.background = new THREE.Color(0x7a8a98);
  scene.fog = new THREE.Fog(0x8a9aa8, 20, 90);
  sun.intensity = 1.1;

  const COUNT = 600;
  const positions = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 40;
    positions[i * 3 + 1] = Math.random() * 25;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 40;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xaac8e0, size: 0.08, transparent: true, opacity: 0.7 }));
  rain.frustumCulled = false;
  scene.add(rain);

  const schedule = createRainSchedule(rng);
  let elapsed = 0;
  let rainbow = null;

  api.update = (dt, cameraPos) => {
    elapsed += dt;
    const phase = schedule.phase(elapsed);
    if (phase === 'rain') {
      rain.position.x = cameraPos.x;
      rain.position.z = cameraPos.z;
      const arr = geo.attributes.position.array;
      for (let i = 0; i < COUNT; i++) {
        arr[i * 3 + 1] -= 18 * dt;
        if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 25;
      }
      geo.attributes.position.needsUpdate = true;
    } else if (phase === 'rainbow') {
      if (!rainbow) {
        rain.visible = false;
        scene.background = prevBackground;
        scene.fog = new THREE.Fog(prevFog.color, prevFog.near, prevFog.far);
        sun.intensity = 2.2;
        rainbow = new THREE.Group();
        RAINBOW_COLORS.forEach((color, i) => {
          const arc = new THREE.Mesh(
            new THREE.TorusGeometry(24 - i * 0.7, 0.3, 6, 40, Math.PI),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 })
          );
          rainbow.add(arc);
        });
        rainbow.position.set(cameraPos.x, 0, cameraPos.z - 70);
        scene.add(rainbow);
        api.rainbowVisible = true;
        api.rainbowPos = { x: rainbow.position.x, z: rainbow.position.z };
      }
    } else if (rainbow && api.rainbowVisible) {
      rainbow.visible = false;
      api.rainbowVisible = false;
    }
  };
  return api;
}
```

- [ ] **Step 4: Run tests — verify pass**

- [ ] **Step 5: Wire into src/main.js**

In `startWalk`, REORDER so weather comes before critters. Right after the dusk-sky block:

```js
    let weather = { condition: 'clear', rainbowVisible: false, rainbowPos: null, update() {} };
    const duskActive = duskMode && equipped.collar === 'glow';
    if (!duskActive) {
      weather = createWeather(scene, sun, rollWeather(Math.random), Math.random);
      if (weather.condition === 'rain') {
        // extra puddles
        const extra = [];
        for (let i = 0; i < 3; i++) {
          const px = areaData.bounds.minX / 2 + Math.random() * (areaData.bounds.maxX - areaData.bounds.minX) / 2;
          const pz = areaData.bounds.minZ / 2 + Math.random() * (areaData.bounds.maxZ - areaData.bounds.minZ) / 2;
          extra.push({ x: px, z: pz, r: 0.8 });
          scene.add(puddleProp(px, pz, 0.8));
        }
        areaData.puddles = [...areaData.puddles, ...extra];
        // birds shelter from rain: halve bird-type spawns
        let keep = false;
        areaData.critterSpawns = areaData.critterSpawns.filter((c) => {
          if (c.type !== 'bird' && c.type !== 'seagull') return true;
          keep = !keep;
          return keep;
        });
      }
    }
```

Imports: `import { rollWeather, createWeather } from './weather.js';` and `import { puddle as puddleProp } from './world/builder.js';`. Move the existing `createCritters` call BELOW this block (it must see the filtered spawns). Add `weather,` to the session object.

In the locked-simulation loop: `session.weather.update(dt, camera.position);` and the rainbow award:

```js
      if (session.weather.rainbowVisible) {
        const to = new THREE.Vector3(session.weather.rainbowPos.x, 0, session.weather.rainbowPos.z).sub(camera.position).setY(0);
        if (to.normalize().dot(player.forward()) > 0.6) {
          log.awardOnce('rainbow', 'rainbow', 'a rainbow after the rain! 🌈');
        }
      }
```

- [ ] **Step 6: Verify** — tests + build + browser across several walk starts: grey rainy walks show falling streaks and extra puddles; after a while the sky clears and a rainbow arcs in the distance (award fires when you face it); sunset walks glow orange; dusk walks (glow collar) are unchanged.

- [ ] **Step 7: Commit** — `git commit -m "feat: add per-walk weather with rain, rainbows, and sunsets"`

---

### Task 5: Secrets — unicorn, UFO, gnome

**Files:**
- Create: `src/secrets.js`
- Modify: `src/main.js`
- Test: `test/secrets.test.js`

**Interfaces:**
- Produces: `rollSecrets(rng, {eveningLight}) -> {unicorn: bool (p=0.125), ufo: bool (eveningLight && p=0.2)}`; `createSecrets(scene, area, rolls, rng) -> secrets` with `list` (`[{key, label, group, award, spotRange}]` — gnome always present, unicorn/ufo per rolls) and `update(dt, t, playerPos, playerSpeed)`.
- Consumes: spotting loop + photo subjects (Task 3's optional chain goes live), `weather.condition`/dusk for `eveningLight`.

- [ ] **Step 1: Write failing tests**

`test/secrets.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { rollSecrets, createSecrets } from '../src/secrets.js';

const AREA = {
  spawn: { x: 0, z: 45 },
  bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
  pois: [{ x: 0, z: 40 }, { x: 10, z: 0 }, { x: 0, z: -45 }],
};
const scene = { add() {}, remove() {} };

describe('rollSecrets', () => {
  it('spawns the unicorn on rolls under 0.125', () => {
    expect(rollSecrets(() => 0.1, { eveningLight: false }).unicorn).toBe(true);
    expect(rollSecrets(() => 0.2, { eveningLight: false }).unicorn).toBe(false);
  });
  it('gates the ufo behind evening light', () => {
    expect(rollSecrets(() => 0.1, { eveningLight: false }).ufo).toBe(false);
    expect(rollSecrets(() => 0.1, { eveningLight: true }).ufo).toBe(true);
  });
});

describe('createSecrets', () => {
  it('always includes the gnome; unicorn/ufo only when rolled', () => {
    const none = createSecrets(scene, AREA, { unicorn: false, ufo: false }, () => 0.5);
    expect(none.list.map((s) => s.key)).toEqual(['gnome']);
    const all = createSecrets(scene, AREA, { unicorn: true, ufo: true }, () => 0.5);
    expect(all.list.map((s) => s.key).sort()).toEqual(['gnome', 'ufo', 'unicorn']);
  });

  it('places the unicorn near the poi farthest from spawn', () => {
    const s = createSecrets(scene, AREA, { unicorn: true, ufo: false }, () => 0.5);
    const unicorn = s.list.find((e) => e.key === 'unicorn');
    expect(Math.hypot(unicorn.group.position.x - 0, unicorn.group.position.z - -45)).toBeLessThan(6);
  });

  it('unicorn flees a fast approach but tolerates a slow one', () => {
    const s = createSecrets(scene, AREA, { unicorn: true, ufo: false }, () => 0.5);
    const unicorn = s.list.find((e) => e.key === 'unicorn');
    const near = unicorn.group.position.clone();
    near.x += 5;
    const before = unicorn.group.position.clone();
    for (let i = 0; i < 40; i++) s.update(0.05, i * 0.05, near, 5); // fast
    expect(unicorn.group.position.distanceTo(near)).toBeGreaterThan(before.distanceTo(near));
  });
});
```

- [ ] **Step 2: Run tests — verify fail**

- [ ] **Step 3: Implement src/secrets.js**

```js
import * as THREE from 'three';

const mat = (color) => new THREE.MeshLambertMaterial({ color });
const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));

export function rollSecrets(rng, { eveningLight }) {
  return {
    unicorn: rng() < 0.125,
    ufo: !!eveningLight && rng() < 0.2,
  };
}

function buildUnicorn() {
  const g = new THREE.Group();
  const body = box(0.5, 0.5, 1.1, 0xf2e8f8);
  body.position.y = 0.85;
  g.add(body);
  for (const [x, z] of [[-0.18, -0.4], [0.18, -0.4], [-0.18, 0.4], [0.18, 0.4]]) {
    const leg = box(0.12, 0.6, 0.12, 0xece0f2);
    leg.position.set(x, 0.3, z);
    g.add(leg);
  }
  const neck = box(0.22, 0.5, 0.22, 0xf2e8f8);
  neck.position.set(0, 1.25, -0.5);
  neck.rotation.x = 0.4;
  g.add(neck);
  const head = box(0.24, 0.24, 0.45, 0xf2e8f8);
  head.position.set(0, 1.5, -0.68);
  g.add(head);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.35, 6), new THREE.MeshLambertMaterial({ color: 0xf2c14e, emissive: 0x9a7a20 }));
  horn.position.set(0, 1.75, -0.72);
  g.add(horn);
  const maneColors = [0xf2a0c0, 0xa0c0f2, 0xc0f2a0];
  for (let i = 0; i < 3; i++) {
    const tuft = box(0.1, 0.16, 0.18, maneColors[i]);
    tuft.position.set(0, 1.45 - i * 0.14, -0.42 + i * 0.14);
    g.add(tuft);
  }
  const tail = box(0.1, 0.4, 0.1, 0xf2a0c0);
  tail.position.set(0, 0.9, 0.6);
  tail.rotation.x = 0.5;
  g.add(tail);
  // sparkle halo
  const sparkleGeo = new THREE.BufferGeometry();
  const sparkles = new Float32Array(36);
  for (let i = 0; i < 12; i++) {
    sparkles[i * 3] = (Math.random() - 0.5) * 1.6;
    sparkles[i * 3 + 1] = 0.8 + Math.random() * 1.2;
    sparkles[i * 3 + 2] = (Math.random() - 0.5) * 1.6;
  }
  sparkleGeo.setAttribute('position', new THREE.BufferAttribute(sparkles, 3));
  g.add(new THREE.Points(sparkleGeo, new THREE.PointsMaterial({ color: 0xfff2a0, size: 0.09 })));
  return g;
}

function buildGnome() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.35, 8), mat(0x4a6ea5));
  body.position.y = 0.18;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), mat(0xe8c8a8));
  head.position.y = 0.4;
  g.add(head);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 8), mat(0xd04040));
  hat.position.y = 0.58;
  g.add(hat);
  return g;
}

function buildUfo() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 6), mat(0x9aa2b0));
  disc.scale.y = 0.25;
  g.add(disc);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshLambertMaterial({ color: 0x9ae0e8, emissive: 0x2a6a70 }));
  dome.position.y = 0.2;
  g.add(dome);
  return g;
}

export function createSecrets(scene, area, rolls, rng) {
  const list = [];

  // gnome: hides at a random poi, offset a bit — different every walk
  const gnomePoi = area.pois[Math.floor(rng() * area.pois.length)];
  const gnome = buildGnome();
  gnome.position.set(gnomePoi.x + (rng() - 0.5) * 3, 0, gnomePoi.z + (rng() - 0.5) * 3);
  scene.add(gnome);
  list.push({ key: 'gnome', label: 'a sneaky garden gnome', group: gnome, award: 'secret', spotRange: 7 });

  let unicornState = null;
  if (rolls.unicorn) {
    const far = [...area.pois].sort((a, b) =>
      Math.hypot(b.x - area.spawn.x, b.z - area.spawn.z) - Math.hypot(a.x - area.spawn.x, a.z - area.spawn.z)
    )[0];
    const unicorn = buildUnicorn();
    unicorn.position.set(far.x, 0, far.z);
    scene.add(unicorn);
    list.push({ key: 'unicorn', label: 'a REAL unicorn?!', group: unicorn, award: 'legend', spotRange: 12 });
    unicornState = { group: unicorn, home: unicorn.position.clone(), fleeing: 0 };
  }

  let ufoState = null;
  if (rolls.ufo) {
    const ufo = buildUfo();
    ufo.visible = false;
    scene.add(ufo);
    list.push({ key: 'ufo', label: 'a tiny UFO?!', group: ufo, award: 'secret', spotRange: 60 });
    ufoState = { group: ufo, startAt: 30 + rng() * 60, t: 0, flying: false, done: false };
  }

  return {
    list,
    update(dt, t, playerPos, playerSpeed) {
      if (unicornState) {
        const u = unicornState.group;
        const d = u.position.distanceTo(playerPos);
        if (unicornState.fleeing > 0) {
          unicornState.fleeing -= dt;
          const away = u.position.clone().sub(playerPos).setY(0).normalize();
          u.position.addScaledVector(away, 3.5 * dt);
          u.rotation.y = Math.atan2(away.x, away.z);
        } else if (d < 10 && playerSpeed > 3) {
          unicornState.fleeing = 3;
        } else {
          // graze in a slow circle near home
          u.position.x = unicornState.home.x + Math.sin(t * 0.15) * 2;
          u.position.z = unicornState.home.z + Math.cos(t * 0.12) * 2;
          u.rotation.y = Math.sin(t * 0.1);
        }
      }
      if (ufoState && !ufoState.done) {
        ufoState.t += dt;
        if (!ufoState.flying && ufoState.t > ufoState.startAt) {
          ufoState.flying = true;
          ufoState.group.visible = true;
          ufoState.group.position.set(playerPos.x - 60, 26, playerPos.z - 30);
        }
        if (ufoState.flying) {
          ufoState.group.position.x += 8 * dt;
          ufoState.group.position.y = 26 + Math.sin(ufoState.t * 2) * 1.5;
          ufoState.group.rotation.y += dt * 3;
          if (ufoState.group.position.x > playerPos.x + 60) {
            ufoState.group.visible = false;
            ufoState.done = true;
          }
        }
      }
    },
  };
}
```

- [ ] **Step 4: Run tests — verify pass**

- [ ] **Step 5: Wire into src/main.js**

Imports: `import { rollSecrets, createSecrets } from './secrets.js';`. In `startWalk`, after the weather block (needs `weather.condition` and `duskActive`):

```js
    const secretRolls = rollSecrets(Math.random, { eveningLight: duskActive || weather.condition === 'sunset' });
    const secrets = createSecrets(scene, areaData, secretRolls, Math.random);
```

Add `secrets, lastPlayerPos: new THREE.Vector3().copy(camera.position),` to the session object.

In the locked-simulation loop, compute player speed and update secrets:

```js
      const playerSpeed = camera.position.distanceTo(session.lastPlayerPos) / Math.max(dt, 0.001);
      session.lastPlayerPos.copy(camera.position);
      session.secrets.update(dt, t, camera.position, playerSpeed);
```

In `updateInteractions`, add secret spotting after the stray-spotting loop:

```js
    for (const sec of s.secrets.list) {
      if (!sec.group.visible) continue;
      const to = sec.group.position.clone().sub(camera.position).setY(0);
      if (to.length() < sec.spotRange && to.normalize().dot(player.forward()) > 0.5) {
        log.awardOnce(sec.award, sec.key, sec.label);
      }
    }
```

(Task 3's `findPhotoSubject` already picks these up via `s.secrets?.list`.)

- [ ] **Step 6: Verify** — tests + build + browser: gnome findable each walk (+12 once); over repeated walk starts a unicorn eventually appears far away and flees if you sprint at it (+50 when spotted); on a sunset or dusk walk, occasionally a UFO glides overhead (+12).

- [ ] **Step 7: Commit** — `git commit -m "feat: add unicorn, UFO, and gnome secrets"`

---

### Task 6: Polish, docs, and release check

**Files:**
- Modify: `README.md`, `src/main.js` (controls hint)

- [ ] **Step 1: Update README controls line**

```markdown
**Controls:** click to grab the mouse · arrow keys to walk · mouse to look ·
E to pet / pick up / greet / talk · T to throw the yarn ball · C for camera ·
M to mute · Esc to pause or end the walk.
```

- [ ] **Step 2: Add a controls hint to the Ready overlay** — in `startWalk`'s overlay HTML, under the buttons add:

```html
      <p class="controls-hint">Arrows move · mouse looks · E interact · T toy · C camera · M mute</p>
```

with CSS: `.controls-hint { color: #a8c0e0; font-size: 0.9rem; }`

- [ ] **Step 3: Full regression** — `npm test` (all suites green) and `npm run build` (clean).

- [ ] **Step 4: Manual playtest checklist (browser)**
- [ ] Throw + fetch with Siamese (returns it) and Persian (bats then ignores).
- [ ] Accept and complete one quest of any type; objective pill lifecycle correct.
- [ ] Photograph a critter, a stray, and the gnome; album persists across reload; cap logic untested manually (trust unit test).
- [ ] See each weather: clear, rain→rainbow (award), sunset. Dusk walks unaffected.
- [ ] Find the gnome; hunt the unicorn across a few walks; UFO on an evening walk.
- [ ] No console errors anywhere; framerate still smooth in rain.

- [ ] **Step 5: Commit** — `git commit -m "docs: v2 controls and polish"`

---

## Plan Self-Review Notes

- Spec §1→Task 1, §2→Task 2, §3→Task 3, §4→Task 4, §5→Task 5, award table→Task 1, controls/README→Task 6. All covered.
- Cross-task contracts: `s.secrets?.list` optional-chain in Task 3 goes live in Task 5; weather must precede critters creation in `startWalk` (Task 4 reorder); `createHomeBase` signature change is contained in Task 3.
- Intentional simplifications: rainbow is camera-relative on spawn (not world-anchored to weather), UFO flies once per walk, quest giver is always the first villager in the list.

