# Whisker Walk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Whisker Walk, a first-person browser cat-walking game with 6 personality-driven cats, 6 perk accessories, 3 unlockable low-poly areas, and whisker-point discovery progression.

**Architecture:** Vite + Three.js vanilla ES modules, one system per file. `main.js` owns the game loop and switches between two modes (home-base DOM overlay / 3D walk). Systems communicate through a tiny event bus. Pure-logic systems (progression, cat brain, discoveries) are TDD'd with Vitest; rendering systems are verified manually in the browser.

**Tech Stack:** Node 18+, Vite, Three.js (latest 0.1xx), Vitest. No backend, no downloaded assets, no framework.

**Spec:** `docs/superpowers/specs/2026-07-31-whisker-walk-design.md` — read it before starting.

## Global Constraints

- All 3D geometry is procedural Three.js primitives; flat-shaded look via `MeshLambertMaterial` with `flatShading: true` where it matters. No external models, textures, or fonts.
- Save data is one versioned JSON blob in `localStorage` under key `whisker-walk-save`; corrupt/missing/incompatible saves reset to defaults with a `console.warn`, never a crash.
- UI (HUD, home base) is plain HTML/CSS overlaying the canvas — no UI framework.
- Systems talk via the event bus (`src/events.js`) — no direct cross-imports between peer systems.
- Controls: WASD + mouse look (Pointer Lock), `E` to interact/pet, `Esc` releases pointer → pause overlay.
- Target 60fps on a typical laptop; keep per-frame allocations out of hot loops.
- Run all commands from the repo root `/Users/pniessen/Documents/cat-game`.
- Commit after every task (messages given per task). Never commit `node_modules/` or `dist/` (already gitignored).

## File Structure

```
index.html               # canvas + UI mount points, loads src/main.js
src/
  main.js                # bootstrap, WebGL guard, loop, mode switching, walk controller
  events.js              # tiny pub/sub emitter (bus singleton)
  progression.js         # catalog, whisker points, unlocks, equip, save/load
  player.js              # first-person controller (pointer lock, WASD, colliders)
  cat/
    model.js             # procedural cat mesh per breed (named parts for animator)
    animator.js          # walk/sit/nap/tail procedural animation
    brain.js             # personalities + FSM
  leash.js               # verlet rope + tension + forces
  world/
    builder.js           # shared prop builders (house, tree, bench, ground, sky...)
    neighborhood.js      # area 1 layout + POIs + spawns
    park.js              # area 2
    seaside.js           # area 3
  critters.js            # birds/squirrels/butterflies/dog/villagers... spawn + behavior
  discoveries.js         # award logic (per-walk repeat halving, once-only awards)
  ui/
    hud.js               # points, toasts, prompts, pause overlay
    homebase.js          # cat/accessory/area selection + shop + start walk
  audio.js               # WebAudio synth: meow, purr, bell, chime, ambient loops
  style.css              # all UI styling
test/
  events.test.js
  progression.test.js
  brain.test.js
  discoveries.test.js
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `index.html`, `src/main.js`, `src/style.css`, `test/smoke.test.js`

**Interfaces:**
- Produces: a running Vite dev server showing a sky-gradient 3D scene with a ground plane; `npm test` runs Vitest.

- [ ] **Step 1: Initialize the project and install dependencies**

```bash
npm init -y
npm install three
npm install -D vite vitest
```

- [ ] **Step 2: Set package.json scripts and module type**

Edit `package.json` so it contains (keep the generated `dependencies`/`devDependencies` versions):

```json
{
  "name": "whisker-walk",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Write a smoke test**

`test/smoke.test.js`:

```js
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run tests to verify the toolchain**

Run: `npm test`
Expected: PASS (1 test)

- [ ] **Step 5: Create index.html**

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Whisker Walk</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <div id="app">
      <canvas id="game"></canvas>
      <div id="hud" class="hidden"></div>
      <div id="homebase" class="hidden"></div>
      <div id="overlay" class="hidden"></div>
    </div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 6: Create src/style.css**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #app { width: 100%; height: 100%; overflow: hidden; }
body { font-family: 'Avenir', 'Trebuchet MS', sans-serif; background: #1c2431; color: #fff; }
#game { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
#hud, #homebase, #overlay { position: absolute; inset: 0; }
.hidden { display: none !important; }
```

- [ ] **Step 7: Create src/main.js with the base scene**

```js
import * as THREE from 'three';

const canvas = document.getElementById('game');

export function createRenderer() {
  try {
    return new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch {
    return null;
  }
}

const renderer = createRenderer();
if (!renderer) {
  document.getElementById('overlay').classList.remove('hidden');
  document.getElementById('overlay').innerHTML =
    '<div style="display:grid;place-items:center;height:100%"><p>Sorry — your browser could not start WebGL, which Whisker Walk needs. Try updating your browser or enabling hardware acceleration.</p></div>';
} else {
  init(renderer);
}

function init(renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd4e8); // placeholder sky, area builders replace it
  scene.fog = new THREE.Fog(0x9fd4e8, 40, 120);

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(0, 1.6, 5);

  const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
  sun.position.set(30, 50, 20);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbfd8ff, 0.9));

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshLambertMaterial({ color: 0x7cb860 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    void dt; // game systems consume this in later tasks
    renderer.render(scene, camera);
  });
}
```

- [ ] **Step 8: Verify in the browser**

Run: `npm run dev` and open the printed localhost URL.
Expected: light-blue sky, green ground plane, no console errors. Resize the window — the canvas follows.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite + Three.js + Vitest project with base scene"
```

---

### Task 2: Event bus

**Files:**
- Create: `src/events.js`
- Test: `test/events.test.js`

**Interfaces:**
- Produces: `createEmitter() -> { on(event, fn) -> unsubscribe, emit(event, payload) }` and a shared singleton `bus`. All later systems import `{ bus }` from `src/events.js`.

- [ ] **Step 1: Write the failing tests**

`test/events.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { createEmitter } from '../src/events.js';

describe('createEmitter', () => {
  it('delivers payloads to subscribers', () => {
    const bus = createEmitter();
    const fn = vi.fn();
    bus.on('ping', fn);
    bus.emit('ping', { a: 1 });
    expect(fn).toHaveBeenCalledWith({ a: 1 });
  });

  it('supports multiple subscribers on one event', () => {
    const bus = createEmitter();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('x', a);
    bus.on('x', b);
    bus.emit('x');
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('returns an unsubscribe function', () => {
    const bus = createEmitter();
    const fn = vi.fn();
    const off = bus.on('x', fn);
    off();
    bus.emit('x');
    expect(fn).not.toHaveBeenCalled();
  });

  it('is safe to emit events nobody listens to', () => {
    const bus = createEmitter();
    expect(() => bus.emit('nobody-home', 42)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `../src/events.js`

- [ ] **Step 3: Implement src/events.js**

```js
export function createEmitter() {
  const handlers = new Map();
  return {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
      return () => handlers.get(event).delete(fn);
    },
    emit(event, payload) {
      const set = handlers.get(event);
      if (set) for (const fn of [...set]) fn(payload);
    },
  };
}

export const bus = createEmitter();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add src/events.js test/events.test.js
git commit -m "feat: add event bus"
```

---

### Task 3: Progression, catalog, and saves

**Files:**
- Create: `src/progression.js`
- Test: `test/progression.test.js`

**Interfaces:**
- Produces:
  - `CATALOG` — `{ cats, accessories, areas }`; each entry `{ name, price }`; accessories add `slot: 'collar'|'outfit'`; areas add optional `requires: { area, walks }`.
  - `createProgression(storage) -> progression` with: `state` getter (`{ version, points, walks, unlocked: {cats, accessories, areas}, equipped: {cat, collar, outfit}, area }`), `addPoints(n)`, `isUnlocked(kind, id)`, `canBuy(kind, id)`, `buy(kind, id) -> bool`, `equipCat(id)`, `equipAccessory(id)`, `unequip(slot)`, `setArea(id)`, `completeWalk()`, `reset()`.
  - `storage` is anything with `getItem/setItem` (tests pass a fake; game passes `window.localStorage`).
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests**

`test/progression.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createProgression, CATALOG } from '../src/progression.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    dump: () => Object.fromEntries(map),
  };
}

describe('createProgression', () => {
  let storage, p;
  beforeEach(() => {
    storage = fakeStorage();
    p = createProgression(storage);
  });

  it('starts fresh with tabby and neighborhood unlocked', () => {
    expect(p.state.points).toBe(0);
    expect(p.state.unlocked.cats).toEqual(['tabby']);
    expect(p.state.unlocked.areas).toEqual(['neighborhood']);
    expect(p.state.equipped).toEqual({ cat: 'tabby', collar: null, outfit: null });
  });

  it('adds points and persists', () => {
    p.addPoints(25);
    const reloaded = createProgression(storage);
    expect(reloaded.state.points).toBe(25);
  });

  it('buys an affordable locked item and deducts points', () => {
    p.addPoints(CATALOG.cats.siamese.price);
    expect(p.canBuy('cats', 'siamese')).toBe(true);
    expect(p.buy('cats', 'siamese')).toBe(true);
    expect(p.state.points).toBe(0);
    expect(p.isUnlocked('cats', 'siamese')).toBe(true);
  });

  it('refuses to buy unaffordable or already-owned items', () => {
    expect(p.buy('cats', 'siamese')).toBe(false); // no points
    p.addPoints(999);
    p.buy('cats', 'siamese');
    expect(p.buy('cats', 'siamese')).toBe(false); // already owned
  });

  it('gates park behind 2 neighborhood walks even with enough points', () => {
    p.addPoints(999);
    expect(p.canBuy('areas', 'park')).toBe(false);
    p.completeWalk(); // area defaults to neighborhood
    p.completeWalk();
    expect(p.canBuy('areas', 'park')).toBe(true);
  });

  it('equips only unlocked cats and accessories into the right slot', () => {
    p.equipCat('persian');
    expect(p.state.equipped.cat).toBe('tabby'); // locked → ignored
    p.addPoints(999);
    p.buy('accessories', 'bell');
    p.buy('accessories', 'bandana');
    p.equipAccessory('bell');
    p.equipAccessory('bandana');
    expect(p.state.equipped.collar).toBe('bell');
    expect(p.state.equipped.outfit).toBe('bandana');
    p.unequip('collar');
    expect(p.state.equipped.collar).toBe(null);
  });

  it('recovers from corrupt save data with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = fakeStorage({ 'whisker-walk-save': '{not json!!' });
    const p2 = createProgression(bad);
    expect(p2.state.points).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('discards saves with a different version', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const old = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 0, points: 900 }) });
    const p2 = createProgression(old);
    expect(p2.state.points).toBe(0);
    warn.mockRestore();
  });

  it('survives a storage that throws on write', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    const p2 = createProgression(broken);
    expect(() => p2.addPoints(5)).not.toThrow();
    expect(p2.state.points).toBe(5);
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `../src/progression.js`

- [ ] **Step 3: Implement src/progression.js**

```js
const SAVE_KEY = 'whisker-walk-save';
const SAVE_VERSION = 1;

export const CATALOG = {
  cats: {
    tabby: { name: 'Tabby', price: 0 },
    siamese: { name: 'Siamese', price: 30 },
    persian: { name: 'Persian', price: 30 },
    black: { name: 'Black Cat', price: 45 },
    calico: { name: 'Calico', price: 45 },
    mainecoon: { name: 'Maine Coon', price: 60 },
  },
  accessories: {
    bell: { name: 'Bell Collar', slot: 'collar', price: 20 },
    glow: { name: 'Glow Collar', slot: 'collar', price: 40 },
    bandana: { name: 'Bandana', slot: 'outfit', price: 20 },
    booties: { name: 'Rain Booties', slot: 'outfit', price: 25 },
    backpack: { name: 'Tiny Backpack', slot: 'outfit', price: 35 },
    crown: { name: 'Flower Crown', slot: 'outfit', price: 35 },
  },
  areas: {
    neighborhood: { name: 'Cozy Neighborhood', price: 0 },
    park: { name: 'City Park', price: 50, requires: { area: 'neighborhood', walks: 2 } },
    seaside: { name: 'Seaside', price: 100, requires: { area: 'park', walks: 2 } },
  },
};

function defaultState() {
  return {
    version: SAVE_VERSION,
    points: 0,
    walks: { neighborhood: 0, park: 0, seaside: 0 },
    unlocked: { cats: ['tabby'], accessories: [], areas: ['neighborhood'] },
    equipped: { cat: 'tabby', collar: null, outfit: null },
    area: 'neighborhood',
  };
}

export function createProgression(storage) {
  let state = defaultState();
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === SAVE_VERSION) state = parsed;
      else console.warn('Whisker Walk: incompatible save, starting fresh');
    }
  } catch (err) {
    console.warn('Whisker Walk: could not read save, starting fresh', err);
  }

  const save = () => {
    try {
      storage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('Whisker Walk: could not write save', err);
    }
  };

  const api = {
    get state() {
      return state;
    },
    addPoints(n) {
      state.points += n;
      save();
    },
    isUnlocked(kind, id) {
      return state.unlocked[kind].includes(id);
    },
    canBuy(kind, id) {
      const item = CATALOG[kind][id];
      if (!item || api.isUnlocked(kind, id) || state.points < item.price) return false;
      if (item.requires && state.walks[item.requires.area] < item.requires.walks) return false;
      return true;
    },
    buy(kind, id) {
      if (!api.canBuy(kind, id)) return false;
      state.points -= CATALOG[kind][id].price;
      state.unlocked[kind].push(id);
      save();
      return true;
    },
    equipCat(id) {
      if (api.isUnlocked('cats', id)) {
        state.equipped.cat = id;
        save();
      }
    },
    equipAccessory(id) {
      const item = CATALOG.accessories[id];
      if (item && api.isUnlocked('accessories', id)) {
        state.equipped[item.slot] = id;
        save();
      }
    },
    unequip(slot) {
      state.equipped[slot] = null;
      save();
    },
    setArea(id) {
      if (api.isUnlocked('areas', id)) {
        state.area = id;
        save();
      }
    },
    completeWalk() {
      state.walks[state.area] += 1;
      save();
    },
    reset() {
      state = defaultState();
      save();
    },
  };
  return api;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add src/progression.js test/progression.test.js
git commit -m "feat: add progression system with catalog, unlock gating, and resilient saves"
```

---

### Task 4: Cat personalities and brain FSM

**Files:**
- Create: `src/cat/brain.js`
- Test: `test/brain.test.js`

**Interfaces:**
- Produces:
  - `PERSONALITIES` — per-breed config `{ speed, pull, weights: {sniff, distracted, nap, requestPet}, sniffRange, special }`. Breed keys match `CATALOG.cats`. `special` is one of `'keenNose'|'chaser'|'napper'|'fearless'|'pouncer'|'steady'`.
  - `weightedChoice(weights, roll)` — pure helper, `roll` in `[0,1)`.
  - `createBrain(breed, rng?) -> brain` with: `state` getter (one of `'follow'|'sniff'|'distracted'|'nap'|'requestPet'|'scared'`), `personality`, `set(state, duration)`, `pet() -> bool`, `scare() -> bool`, `update(dt, ctx) -> state` where `ctx = { leashTension, critterNearby, poiNearby }` (tension is `distance/maxLeashLength`; nearby flags are booleans).
- Consumes: nothing (pure logic; the walk controller in `main.js` supplies ctx).

- [ ] **Step 1: Write the failing tests**

`test/brain.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createBrain, weightedChoice, PERSONALITIES } from '../src/cat/brain.js';

const CALM_CTX = { leashTension: 0, critterNearby: true, poiNearby: true };

// rng stub that returns queued values then 0.5 forever
function rngQueue(...vals) {
  return () => (vals.length ? vals.shift() : 0.5);
}

describe('weightedChoice', () => {
  it('picks proportionally to weights', () => {
    const w = { a: 1, b: 1 }; // a covers [0, .5), b covers [.5, 1)
    expect(weightedChoice(w, 0.1)).toBe('a');
    expect(weightedChoice(w, 0.9)).toBe('b');
  });
  it('skips zero-weight entries', () => {
    expect(weightedChoice({ a: 0, b: 1 }, 0.0)).toBe('b');
  });
});

describe('PERSONALITIES', () => {
  it('covers all six breeds with required fields', () => {
    const breeds = ['tabby', 'siamese', 'persian', 'black', 'calico', 'mainecoon'];
    for (const b of breeds) {
      const p = PERSONALITIES[b];
      expect(p.speed).toBeGreaterThan(0);
      expect(p.weights).toHaveProperty('nap');
      expect(p.special).toBeTruthy();
    }
  });
});

describe('createBrain', () => {
  it('starts in follow', () => {
    expect(createBrain('tabby').state).toBe('follow');
  });

  it('eventually leaves follow when its decision timer expires', () => {
    // rng: first call sets initial timer, second picks the state.
    // roll 0.99 lands on the last non-zero weighted option.
    const brain = createBrain('persian', rngQueue(0, 0.99, 0));
    let state = 'follow';
    for (let i = 0; i < 100 && state === 'follow'; i++) state = brain.update(0.1, CALM_CTX);
    expect(state).not.toBe('follow');
  });

  it('taut leash forces any away-state back to follow', () => {
    const brain = createBrain('siamese');
    brain.set('distracted', 10);
    brain.update(0.016, { ...CALM_CTX, leashTension: 1.2 });
    expect(brain.state).toBe('follow');
  });

  it('petting works only during requestPet or nap', () => {
    const brain = createBrain('tabby');
    expect(brain.pet()).toBe(false);
    brain.set('nap', 10);
    expect(brain.pet()).toBe(true);
    expect(brain.state).toBe('follow');
  });

  it('scare frightens most cats but not fearless or steady ones', () => {
    const scaredy = createBrain('calico');
    expect(scaredy.scare()).toBe(true);
    expect(scaredy.state).toBe('scared');
    expect(createBrain('black').scare()).toBe(false);
    expect(createBrain('mainecoon').scare()).toBe(false);
  });

  it('never picks distracted when no critter is nearby', () => {
    // roll 0.99 would hit the tail of the weight table; with distracted
    // zeroed the choice must be something else.
    const brain = createBrain('siamese', rngQueue(0, 0.6, 0));
    let state = 'follow';
    for (let i = 0; i < 100 && state === 'follow'; i++) {
      state = brain.update(0.1, { leashTension: 0, critterNearby: false, poiNearby: true });
    }
    expect(state).not.toBe('distracted');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `../src/cat/brain.js`

- [ ] **Step 3: Implement src/cat/brain.js**

```js
export const PERSONALITIES = {
  tabby:     { speed: 2.0, pull: 5, weights: { sniff: 3, distracted: 2, nap: 0.5, requestPet: 1 }, sniffRange: 8, special: 'keenNose' },
  siamese:   { speed: 2.8, pull: 9, weights: { sniff: 1, distracted: 5, nap: 0.2, requestPet: 0.7 }, sniffRange: 5, special: 'chaser' },
  persian:   { speed: 1.2, pull: 3, weights: { sniff: 1, distracted: 0.5, nap: 4, requestPet: 2 }, sniffRange: 4, special: 'napper' },
  black:     { speed: 2.0, pull: 5, weights: { sniff: 2, distracted: 1.5, nap: 1, requestPet: 1 }, sniffRange: 6, special: 'fearless' },
  calico:    { speed: 2.3, pull: 6, weights: { sniff: 2, distracted: 4, nap: 0.7, requestPet: 1 }, sniffRange: 6, special: 'pouncer' },
  mainecoon: { speed: 1.8, pull: 3, weights: { sniff: 2, distracted: 1, nap: 1, requestPet: 1.5 }, sniffRange: 6, special: 'steady' },
};

export function weightedChoice(weights, roll) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let acc = 0;
  for (const [key, w] of entries) {
    acc += w / total;
    if (roll < acc) return key;
  }
  return entries[entries.length - 1][0];
}

export function createBrain(breed, rng = Math.random) {
  const p = PERSONALITIES[breed];
  let state = 'follow';
  let timer = 2 + rng() * 3;

  const api = {
    breed,
    personality: p,
    get state() {
      return state;
    },
    set(next, duration) {
      state = next;
      timer = duration;
    },
    pet() {
      if (state === 'requestPet' || state === 'nap') {
        api.set('follow', 3 + rng() * 3);
        return true;
      }
      return false;
    },
    scare() {
      if (p.special === 'fearless' || p.special === 'steady') return false;
      api.set('scared', 2.5);
      return true;
    },
    update(dt, ctx) {
      if (ctx.leashTension > 1 && state !== 'follow' && state !== 'scared') {
        api.set('follow', 2);
      }
      timer -= dt;
      if (timer > 0) return state;

      if (state === 'follow') {
        const weights = { follow: 4, ...p.weights };
        if (!ctx.critterNearby) weights.distracted = 0;
        if (!ctx.poiNearby) weights.sniff = 0;
        const next = weightedChoice(weights, rng());
        const durations = {
          follow: 2 + rng() * 3,
          sniff: 2 + rng() * 2,
          distracted: 4 + rng() * 3,
          nap: 6 + rng() * 6,
          requestPet: 5,
        };
        api.set(next, durations[next]);
      } else {
        api.set('follow', 2 + rng() * 4);
      }
      return state;
    },
  };
  return api;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add src/cat/brain.js test/brain.test.js
git commit -m "feat: add cat personalities and FSM brain"
```

---

### Task 5: First-person player controller

**Files:**
- Create: `src/player.js`
- Modify: `src/main.js` (wire the controller into the loop)

**Interfaces:**
- Produces: `createPlayer(camera, canvas) -> player` with:
  - `update(dt, colliders, bounds)` — applies WASD movement with collision push-out; `colliders` is `[{x, z, r}]`, `bounds` is `{minX, maxX, minZ, maxZ}`.
  - `position` — the camera's `THREE.Vector3` (eye height stays 1.6).
  - `forward()` — normalized horizontal facing `THREE.Vector3`.
  - `speedFactor` — settable number (leash drag sets this in Task 7; default 1).
  - `locked` — boolean, true while pointer lock is active.
  - `enable()` / `disable()` — attach/detach input listeners (home base disables).
- Consumes: nothing from other systems. Emits `player:lockchange { locked }` on the bus.

- [ ] **Step 1: Implement src/player.js**

```js
import * as THREE from 'three';
import { bus } from './events.js';

const WALK_SPEED = 4.2;

export function createPlayer(camera, canvas) {
  let yaw = 0;
  let pitch = 0;
  let enabled = false;
  const keys = new Set();
  const velocity = new THREE.Vector3();

  const api = {
    position: camera.position,
    speedFactor: 1,
    locked: false,
    forward() {
      return new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    },
    enable() {
      enabled = true;
    },
    disable() {
      enabled = false;
      keys.clear();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
    update(dt, colliders = [], bounds = null) {
      if (!enabled) return;
      const dir = new THREE.Vector3();
      if (keys.has('KeyW')) dir.z -= 1;
      if (keys.has('KeyS')) dir.z += 1;
      if (keys.has('KeyA')) dir.x -= 1;
      if (keys.has('KeyD')) dir.x += 1;
      dir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const speed = WALK_SPEED * api.speedFactor;
      velocity.lerp(dir.multiplyScalar(speed), 1 - Math.pow(0.001, dt));
      camera.position.addScaledVector(velocity, dt);
      camera.position.y = 1.6;

      for (const c of colliders) {
        const dx = camera.position.x - c.x;
        const dz = camera.position.z - c.z;
        const d = Math.hypot(dx, dz);
        const min = c.r + 0.4;
        if (d < min && d > 0.0001) {
          camera.position.x = c.x + (dx / d) * min;
          camera.position.z = c.z + (dz / d) * min;
        }
      }
      if (bounds) {
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, bounds.minX, bounds.maxX);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, bounds.minZ, bounds.maxZ);
      }
    },
  };

  canvas.addEventListener('click', () => {
    if (enabled && !api.locked) canvas.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    api.locked = document.pointerLockElement === canvas;
    bus.emit('player:lockchange', { locked: api.locked });
  });
  document.addEventListener('mousemove', (e) => {
    if (!api.locked || !enabled) return;
    yaw -= e.movementX * 0.0022;
    pitch -= e.movementY * 0.0022;
    pitch = THREE.MathUtils.clamp(pitch, -1.2, 1.2);
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  });
  document.addEventListener('keydown', (e) => {
    if (enabled) keys.add(e.code);
  });
  document.addEventListener('keyup', (e) => keys.delete(e.code));

  return api;
}
```

- [ ] **Step 2: Wire into src/main.js**

In `init()`, after creating the camera, add:

```js
import { createPlayer } from './player.js';   // top of file
import { bus } from './events.js';            // top of file

// after camera creation:
const player = createPlayer(camera, canvas);
player.enable(); // temporary — Task 11's home base takes over enabling

// temporary pause overlay behavior:
const overlay = document.getElementById('overlay');
overlay.innerHTML = '<div class="pause-card"><h1>Paused</h1><p>Click the game to resume</p></div>';
overlay.classList.remove('hidden');
bus.on('player:lockchange', ({ locked }) => {
  overlay.classList.toggle('hidden', locked);
});
```

And inside the animation loop, before `renderer.render`:

```js
player.update(dt, [], { minX: -90, maxX: 90, minZ: -90, maxZ: 90 });
```

Add to `src/style.css`:

```css
.pause-card {
  display: grid; place-items: center; height: 100%;
  background: rgba(20, 26, 38, 0.55); text-align: center;
  cursor: pointer; pointer-events: none;
}
.pause-card h1 { font-size: 2.2rem; margin-bottom: 0.4rem; }
```

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`
Expected: "Paused / Click the game to resume" overlay; clicking locks the mouse and hides it; WASD walks, mouse looks around, horizon stays level, you cannot leave the 90-unit bounds; Esc shows the overlay again. No console errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add first-person pointer-lock player controller with pause overlay"
```

---

### Task 6: Procedural cat models and animator

**Files:**
- Create: `src/cat/model.js`, `src/cat/animator.js`
- Modify: `src/main.js` (spawn a cat, debug breed switcher)

**Interfaces:**
- Produces:
  - `buildCat(breed, accessories?) -> THREE.Group` — `accessories` is `{ collar, outfit }` (ids from `CATALOG.accessories` or null). The group has `userData.parts = { body, head, tail, legs: [fl, fr, bl, br], earL, earR }` for the animator, and `userData.breed`.
  - `animateCat(cat, state, t, moveSpeed)` — mutates part transforms; `state` is a brain state string, `t` is elapsed seconds, `moveSpeed` is current horizontal speed (drives leg cycle).
- Consumes: breed ids from `PERSONALITIES` / `CATALOG.cats`.

- [ ] **Step 1: Implement src/cat/model.js**

```js
import * as THREE from 'three';

const STYLE = {
  tabby:     { base: 0x9c7a4f, belly: 0xd8c39a, accent: 0x6f5636, scale: 1.0, stripes: true },
  siamese:   { base: 0xe8dcc8, belly: 0xf2ead9, accent: 0x4a3b32, scale: 0.95, points: true },
  persian:   { base: 0xcfcfd4, belly: 0xe8e8ec, accent: 0xb5b5bc, scale: 1.05, fluffy: true },
  black:     { base: 0x2a2a30, belly: 0x3a3a42, accent: 0x1c1c22, scale: 1.0 },
  calico:    { base: 0xf0ead8, belly: 0xf8f4e8, accent: 0xd88030, scale: 1.0, patches: true },
  mainecoon: { base: 0x7a5b3a, belly: 0xb99a72, accent: 0x5a4028, scale: 1.3, tufts: true },
};

function mat(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function box(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
}

export function buildCat(breed, accessories = { collar: null, outfit: null }) {
  const s = STYLE[breed];
  const g = new THREE.Group();
  const c = s.points ? s.accent : s.base; // siamese extremities are dark

  const bodyW = s.fluffy ? 0.34 : 0.26;
  const body = box(bodyW, 0.24, 0.62, s.base);
  body.position.y = 0.3;
  g.add(body);

  const belly = box(bodyW * 0.8, 0.1, 0.5, s.belly);
  belly.position.set(0, 0.2, 0);
  g.add(belly);

  const head = new THREE.Group();
  const skull = box(0.22, 0.2, s.fluffy ? 0.16 : 0.22, s.points ? s.accent : s.base);
  head.add(skull);
  const muzzle = box(0.1, 0.08, 0.06, s.belly);
  muzzle.position.set(0, -0.05, -0.12);
  head.add(muzzle);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, s.tufts ? 0.14 : 0.1, 4), mat(c));
    ear.position.set(side * 0.08, 0.14, 0);
    head.add(ear);
    if (side === -1) head.userData.earL = ear;
    else head.userData.earR = ear;
    const eye = box(0.03, 0.03, 0.01, 0x2e4a2e);
    eye.position.set(side * 0.06, 0.02, -0.115);
    head.add(eye);
  }
  head.position.set(0, 0.44, -0.36);
  g.add(head);

  const legs = [];
  const legPositions = [
    [-0.09, -0.22], [0.09, -0.22], // front L, R
    [-0.09, 0.22], [0.09, 0.22],   // back L, R
  ];
  for (const [x, z] of legPositions) {
    const leg = box(0.07, 0.22, 0.07, s.points ? s.accent : s.base);
    leg.geometry.translate(0, -0.11, 0); // pivot at hip
    leg.position.set(x, 0.28, z);
    g.add(leg);
    legs.push(leg);
  }

  const tail = new THREE.Group();
  let prev = tail;
  for (let i = 0; i < 3; i++) {
    const seg = box(0.06 - i * 0.012, 0.06 - i * 0.012, 0.16, s.points || s.stripes ? s.accent : s.base);
    seg.position.z = 0.08;
    const pivot = new THREE.Group();
    pivot.position.z = i === 0 ? 0.3 : 0.15;
    pivot.add(seg);
    prev.add(pivot);
    prev = pivot;
  }
  tail.position.set(0, 0.36, 0);
  tail.rotation.x = -0.7;
  g.add(tail);

  if (s.stripes) {
    for (let i = 0; i < 3; i++) {
      const stripe = box(bodyW + 0.01, 0.03, 0.06, s.accent);
      stripe.position.set(0, 0.41, -0.18 + i * 0.18);
      g.add(stripe);
    }
  }
  if (s.patches) {
    const p1 = box(0.12, 0.04, 0.18, s.accent);
    p1.position.set(0.08, 0.43, -0.1);
    g.add(p1);
    const p2 = box(0.12, 0.04, 0.16, 0x333333);
    p2.position.set(-0.08, 0.43, 0.12);
    g.add(p2);
  }

  // accessories
  if (accessories.collar) {
    const collarColor = accessories.collar === 'glow' ? 0x7ef2c0 : 0xd84040;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 12), mat(collarColor));
    ring.rotation.x = Math.PI / 2 + 0.5;
    ring.position.set(0, 0.42, -0.28);
    g.add(ring);
    if (accessories.collar === 'bell') {
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), mat(0xf2c14e));
      bell.position.set(0, 0.36, -0.4);
      g.add(bell);
    }
  }
  if (accessories.outfit === 'bandana') {
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.16, 3), mat(0x3a6ea5));
    tri.rotation.x = Math.PI;
    tri.position.set(0, 0.36, -0.3);
    g.add(tri);
  }
  if (accessories.outfit === 'booties') {
    for (const leg of legs) {
      const boot = box(0.09, 0.06, 0.09, 0xf2c14e);
      boot.position.y = -0.19;
      leg.add(boot);
    }
  }
  if (accessories.outfit === 'backpack') {
    const pack = box(0.16, 0.12, 0.08, 0x3a6ea5);
    pack.position.set(0, 0.46, 0.1);
    g.add(pack);
  }
  if (accessories.outfit === 'crown') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 5), mat([0xf2a0c0, 0xf2e04e, 0xffffff][i % 3]));
      petal.position.set(Math.cos(a) * 0.1, 0.56, -0.36 + Math.sin(a) * 0.06);
      g.add(petal);
    }
  }

  g.scale.setScalar(s.scale);
  g.userData.breed = breed;
  g.userData.parts = { body, head, tail, legs, earL: head.userData.earL, earR: head.userData.earR };
  return g;
}
```

- [ ] **Step 2: Implement src/cat/animator.js**

```js
export function animateCat(cat, state, t, moveSpeed) {
  const { body, head, tail, legs } = cat.userData.parts;
  const walking = moveSpeed > 0.1;

  // reset per-frame poses (positions/rotations we animate)
  cat.rotation.z = 0;
  body.position.y = 0.3;
  head.position.y = 0.44;
  head.rotation.x = 0;

  if (state === 'nap') {
    body.position.y = 0.18;
    head.position.y = 0.26;
    head.rotation.x = 0.5;
    for (const leg of legs) leg.scale.y = 0.3;
    tail.rotation.x = -1.4;
    return;
  }
  for (const leg of legs) leg.scale.y = 1;

  if (state === 'requestPet') {
    head.rotation.x = -0.35; // look up at player
    tail.rotation.x = -0.2;  // tail high
  } else {
    tail.rotation.x = state === 'scared' ? -1.5 : -0.7;
  }

  if (walking) {
    const cycle = t * (4 + moveSpeed * 2);
    legs[0].rotation.x = Math.sin(cycle) * 0.6;
    legs[3].rotation.x = Math.sin(cycle) * 0.6;
    legs[1].rotation.x = Math.sin(cycle + Math.PI) * 0.6;
    legs[2].rotation.x = Math.sin(cycle + Math.PI) * 0.6;
    body.position.y = 0.3 + Math.abs(Math.sin(cycle)) * 0.02;
  } else {
    for (const leg of legs) leg.rotation.x = 0;
    if (state === 'sniff') head.rotation.x = 0.55; // nose to the ground
  }

  // idle tail sway, layered on top
  tail.rotation.z = Math.sin(t * 2.2) * 0.25;
  tail.children[0]?.children[0] && (tail.children[0].rotation.z = Math.sin(t * 2.2 + 0.5) * 0.2);
}
```

- [ ] **Step 3: Wire a debug cat into src/main.js**

Add imports and, in `init()`:

```js
import { buildCat } from './cat/model.js';
import { animateCat } from './cat/animator.js';

// after scene setup:
let cat = buildCat('tabby');
cat.position.set(0, 0, 2);
scene.add(cat);

// debug breed/state switcher — REMOVED in Task 11
const breeds = ['tabby', 'siamese', 'persian', 'black', 'calico', 'mainecoon'];
let debugState = 'follow';
document.addEventListener('keydown', (e) => {
  if (e.code.startsWith('Digit') && breeds[+e.code.slice(5) - 1]) {
    scene.remove(cat);
    cat = buildCat(breeds[+e.code.slice(5) - 1], { collar: 'bell', outfit: 'bandana' });
    cat.position.set(0, 0, 2);
    scene.add(cat);
  }
  if (e.code === 'KeyN') debugState = debugState === 'nap' ? 'follow' : 'nap';
});
```

In the loop:

```js
animateCat(cat, debugState, clock.elapsedTime, 0.5);
```

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`
Expected: a low-poly cat stands in front of you wearing a bell collar and bandana; legs swing in a trot, tail sways. Keys 1–6 swap all six breeds (tabby striped, siamese cream with dark points, persian wide and grey, black cat dark, calico patched, maine coon visibly bigger). `N` toggles a curled-up nap pose. No console errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add procedural cat models for six breeds with accessories and animator"
```

---

### Task 7: Leash physics

**Files:**
- Create: `src/leash.js`
- Modify: `src/main.js` (make the cat a real companion: follow movement + leash)

**Interfaces:**
- Produces: `createLeash(scene) -> leash` with:
  - `update(handPos, catPos)` — simulates the verlet rope between the two `THREE.Vector3`s and updates the rendered line; returns `tension` (`distance / MAX_LEN`, unclamped).
  - `MAX_LEN` export (6).
  - `setVisible(v)`.
- Consumes: player position/facing (Task 5), cat group position (Task 6), `PERSONALITIES[breed].pull` and brain state (Task 4) — the movement integration lives in `main.js`'s walk update.

- [ ] **Step 1: Implement src/leash.js**

```js
import * as THREE from 'three';

export const MAX_LEN = 6;
const SEGMENTS = 14;

export function createLeash(scene) {
  const points = [];
  for (let i = 0; i <= SEGMENTS; i++) points.push(new THREE.Vector3(0, 1, i * 0.1));
  const prev = points.map((p) => p.clone());

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x8a3324 }));
  line.frustumCulled = false;
  scene.add(line);

  return {
    setVisible(v) {
      line.visible = v;
    },
    update(handPos, catPos) {
      const dist = handPos.distanceTo(catPos);
      const segLen = Math.min(dist, MAX_LEN) / SEGMENTS;

      // verlet integrate with gravity for sag
      for (let i = 1; i < SEGMENTS; i++) {
        const p = points[i];
        const v = p.clone().sub(prev[i]).multiplyScalar(0.96);
        prev[i].copy(p);
        p.add(v);
        p.y -= 0.015;
      }
      points[0].copy(handPos);
      points[SEGMENTS].copy(catPos);

      // constraint relaxation
      for (let iter = 0; iter < 3; iter++) {
        for (let i = 0; i < SEGMENTS; i++) {
          const a = points[i];
          const b = points[i + 1];
          const delta = b.clone().sub(a);
          const d = delta.length() || 0.0001;
          const diff = (d - segLen) / d;
          const pinnedA = i === 0;
          const pinnedB = i + 1 === SEGMENTS;
          if (!pinnedA) a.addScaledVector(delta, pinnedB ? diff : diff * 0.5);
          if (!pinnedB) b.addScaledVector(delta, pinnedA ? -diff : -diff * 0.5);
        }
      }

      geometry.setFromPoints(points);
      return dist / MAX_LEN;
    },
  };
}
```

- [ ] **Step 2: Turn the debug cat into a leashed companion in src/main.js**

Replace the Task 6 debug-state code with a walk update. Keep the breed switcher keys for now. Add:

```js
import { createLeash, MAX_LEN } from './leash.js';
import { createBrain, PERSONALITIES } from './cat/brain.js';

// after cat creation:
let brain = createBrain(cat.userData.breed);
const leash = createLeash(scene);
const catVelocity = new THREE.Vector3();

function handPosition() {
  // just below and right of the camera
  const hand = player.forward().multiplyScalar(0.3);
  hand.add(camera.position).add(new THREE.Vector3(0, -0.5, 0));
  return hand;
}

function updateCat(dt, t) {
  const p = PERSONALITIES[cat.userData.breed];
  const toPlayer = camera.position.clone().sub(cat.position);
  toPlayer.y = 0;
  const distToPlayer = toPlayer.length();
  const tension = distToPlayer / MAX_LEN;

  brain.update(dt, { leashTension: tension, critterNearby: false, poiNearby: false });

  // pick a target by state
  let target = null;
  const state = brain.state;
  if (state === 'follow' || state === 'scared') {
    target = camera.position.clone().add(player.forward().multiplyScalar(2)).add(
      player.forward().clone().cross(new THREE.Vector3(0, 1, 0)).multiplyScalar(0.8)
    );
  }
  // sniff/nap/requestPet: stay put; distracted gets a real target in Task 9

  const desired = new THREE.Vector3();
  if (target) {
    desired.copy(target).sub(cat.position);
    desired.y = 0;
    if (desired.length() > 0.4) desired.normalize().multiplyScalar(p.speed * (state === 'scared' ? 1.8 : 1));
    else desired.set(0, 0, 0);
  }
  // taut leash drags the cat toward the player regardless of state
  if (tension > 1) desired.add(toPlayer.normalize().multiplyScalar((tension - 1) * 20));

  catVelocity.lerp(desired, 1 - Math.pow(0.001, dt));
  cat.position.addScaledVector(catVelocity, dt);
  cat.position.y = 0;
  const speed = catVelocity.length();
  if (speed > 0.15) {
    const heading = Math.atan2(catVelocity.x, catVelocity.z) + Math.PI;
    cat.rotation.y = heading;
  }
  animateCat(cat, state, t, speed);

  // leash drags the player when the cat pulls
  const leashTension = leash.update(handPosition(), cat.position.clone().add(new THREE.Vector3(0, 0.4, 0)));
  player.speedFactor = leashTension > 0.9 ? Math.max(0.35, 1 - (leashTension - 0.9) * (p.pull / 4)) : 1;
}
```

In the loop replace the `animateCat` call with:

```js
updateCat(dt, clock.elapsedTime);
```

When the breed switcher rebuilds the cat, also rebuild the brain: `brain = createBrain(newBreed)`.

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`
Expected: the cat trots to a point ahead-right of you and keeps station as you walk; a sagging leash line connects your hand to its collar; walk away fast and the rope goes taut and visibly slows you (more with Siamese `2`, barely with Maine Coon `6`); the cat occasionally stops to sniff or naps (Persian `3` naps a lot). No console errors, smooth 60fps.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add verlet leash with tension drag and leashed cat movement"
```

---

### Task 8: World builder and Neighborhood area

**Files:**
- Create: `src/world/builder.js`, `src/world/neighborhood.js`
- Modify: `src/main.js` (build the neighborhood instead of the bare ground)

**Interfaces:**
- Produces:
  - `builder.js` prop builders, each returning a positioned `THREE.Group`: `ground(size, color)`, `house(x, z, bodyColor, roofColor)`, `tree(x, z, scale?)`, `bush(x, z)`, `fenceRun(x1, z1, x2, z2)`, `mailbox(x, z)`, `car(x, z, color, rotY?)`, `bench(x, z, rotY?)`, `lampPost(x, z)`, `puddle(x, z, r?)`, `rock(x, z)`, `flowerPatch(x, z)`, `path(x1, z1, x2, z2, w?)`. Also `applySky(scene, top, horizon)` (sets `scene.background` + fog).
  - Every area module exports `build(scene) -> areaData` where `areaData = { name, colliders: [{x,z,r}], bounds: {minX,maxX,minZ,maxZ}, spawn: {x,z}, pois: [{x,z}], collectibles: [{id,x,z,label}], scenics: [{id,x,z,label}], critterSpawns: [{type,x,z,...extra}], moments: [{id,label,x,z,from:{x,z}}], puddles: [{x,z,r}], skyDusk: {top,horizon} }`.
- Consumes: nothing beyond Three.js.

- [ ] **Step 1: Implement src/world/builder.js**

```js
import * as THREE from 'three';

const mat = (color) => new THREE.MeshLambertMaterial({ color });
const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));

export function applySky(scene, top, horizon) {
  scene.background = new THREE.Color(top);
  scene.fog = new THREE.Fog(horizon, 40, 130);
}

export function ground(size, color) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat(color));
  m.rotation.x = -Math.PI / 2;
  return m;
}

export function path(x1, z1, x2, z2, w = 2) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), mat(0xcbb8a0));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = -Math.atan2(x2 - x1, z2 - z1);
  m.position.set((x1 + x2) / 2, 0.01, (z1 + z2) / 2);
  return m;
}

export function house(x, z, bodyColor = 0xe8d8b0, roofColor = 0xb05a4a) {
  const g = new THREE.Group();
  const body = box(5, 3, 4, bodyColor);
  body.position.y = 1.5;
  g.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.9, 2, 4), mat(roofColor));
  roof.position.y = 4;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  const door = box(0.9, 1.8, 0.1, 0x7a5230);
  door.position.set(0, 0.9, 2.01);
  g.add(door);
  for (const wx of [-1.6, 1.6]) {
    const win = box(0.9, 0.9, 0.1, 0xa8d8e8);
    win.position.set(wx, 1.8, 2.01);
    g.add(win);
  }
  g.position.set(x, 0, z);
  return g;
}

export function tree(x, z, scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2, 6), mat(0x7a5230));
  trunk.position.y = 1;
  g.add(trunk);
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 0), mat(0x4e9440));
  leaves.position.y = 2.8;
  g.add(leaves);
  g.scale.setScalar(scale);
  g.position.set(x, 0, z);
  return g;
}

export function bush(x, z) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), mat(0x5aa04e));
  m.position.set(x, 0.5, z);
  return m;
}

export function fenceRun(x1, z1, x2, z2) {
  const g = new THREE.Group();
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.floor(len / 0.8);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = box(0.1, 1, 0.1, 0xc8b088);
    p.position.set(x1 + (x2 - x1) * t, 0.5, z1 + (z2 - z1) * t);
    g.add(p);
  }
  const rail = box(0.06, 0.08, len, 0xc8b088);
  rail.position.set((x1 + x2) / 2, 0.8, (z1 + z2) / 2);
  rail.rotation.y = Math.atan2(x2 - x1, z2 - z1);
  g.add(rail);
  return g;
}

export function mailbox(x, z) {
  const g = new THREE.Group();
  const post = box(0.08, 1, 0.08, 0x7a5230);
  post.position.y = 0.5;
  g.add(post);
  const boxTop = box(0.3, 0.25, 0.5, 0x4a6ea5);
  boxTop.position.y = 1.1;
  g.add(boxTop);
  g.position.set(x, 0, z);
  return g;
}

export function car(x, z, color = 0xd06048, rotY = 0) {
  const g = new THREE.Group();
  const body = box(1.8, 0.6, 4, color);
  body.position.y = 0.6;
  g.add(body);
  const cabin = box(1.6, 0.55, 2, 0xa8d8e8);
  cabin.position.set(0, 1.15, -0.2);
  g.add(cabin);
  for (const [wx, wz] of [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 8), mat(0x2a2a30));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.35, wz);
    g.add(wheel);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

export function bench(x, z, rotY = 0) {
  const g = new THREE.Group();
  const seat = box(1.6, 0.08, 0.5, 0x9a7048);
  seat.position.y = 0.5;
  g.add(seat);
  const back = box(1.6, 0.5, 0.08, 0x9a7048);
  back.position.set(0, 0.85, -0.25);
  g.add(back);
  for (const lx of [-0.7, 0.7]) {
    const leg = box(0.08, 0.5, 0.4, 0x5a4028);
    leg.position.set(lx, 0.25, 0);
    g.add(leg);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

export function lampPost(x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6), mat(0x3a3a42));
  pole.position.y = 1.6;
  g.add(pole);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8),
    new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0x8a7a40 }));
  lamp.position.y = 3.3;
  g.add(lamp);
  g.position.set(x, 0, z);
  return g;
}

export function puddle(x, z, r = 0.8) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 12), mat(0x8ab8d8));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.02, z);
  return m;
}

export function rock(x, z) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), mat(0x9a9aa2));
  m.position.set(x, 0.3, z);
  return m;
}

export function flowerPatch(x, z) {
  const g = new THREE.Group();
  const colors = [0xf2a0c0, 0xf2e04e, 0xffffff, 0xe07040];
  for (let i = 0; i < 6; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 5), mat(colors[i % 4]));
    f.position.set((Math.sin(i * 2.4) * 0.5), 0.25, (Math.cos(i * 1.7) * 0.5));
    g.add(f);
    const stem = box(0.03, 0.25, 0.03, 0x4e9440);
    stem.position.set(f.position.x, 0.12, f.position.z);
    g.add(stem);
  }
  g.position.set(x, 0, z);
  return g;
}
```

- [ ] **Step 2: Implement src/world/neighborhood.js**

```js
import * as b from './builder.js';

export function build(scene) {
  b.applySky(scene, 0x9fd4e8, 0xcfe8f0);
  scene.add(b.ground(120, 0x7cb860));

  const colliders = [];
  const addC = (x, z, r) => colliders.push({ x, z, r });

  // main street running north-south, side street east-west
  scene.add(b.path(0, -50, 0, 50, 5));
  scene.add(b.path(-50, 0, 50, 0, 5));

  // houses along the streets
  const lots = [
    [-12, -30, 0xe8d8b0], [-12, -15, 0xd8c8e8], [-12, 15, 0xf2e0c0], [-12, 30, 0xc8e0d0],
    [12, -30, 0xf0d8c8], [12, -15, 0xe0e8c8], [12, 15, 0xd8d0f0], [12, 30, 0xe8e0b8],
  ];
  for (const [x, z, color] of lots) {
    scene.add(b.house(x, z, color));
    addC(x, z, 3.4);
    scene.add(b.mailbox(x + (x < 0 ? 4 : -4), z + 2));
    scene.add(b.flowerPatch(x + (x < 0 ? 5 : -5), z - 2));
  }

  // trees, bushes, parked cars, lamps
  for (const [x, z] of [[-6, -40], [7, -22], [-8, 8], [6, 40], [-20, 22], [20, -8], [24, 18], [-24, -18]]) {
    scene.add(b.tree(x, z, 0.9 + ((x * z) % 5) * 0.08));
    addC(x, z, 0.6);
  }
  for (const [x, z] of [[-4, -12], [5, 25], [18, 4], [-18, -4]]) scene.add(b.bush(x, z));
  scene.add(b.car(4, -35, 0xd06048, 0));
  addC(4, -35, 1.8);
  scene.add(b.car(-4, 20, 0x4a6ea5, 0));
  addC(-4, 20, 1.8);
  for (const [x, z] of [[3, -10], [-3, 10], [10, 3], [-10, -3]]) scene.add(b.lampPost(x, z));

  // small playground: slide-ish ramp + swing frame
  scene.add(b.bench(28, 28, Math.PI / 4));
  scene.add(b.bench(32, 24, Math.PI / 4));
  const puddles = [{ x: -7, z: -8, r: 0.9 }, { x: 9, z: 12, r: 0.8 }];
  for (const p of puddles) scene.add(b.puddle(p.x, p.z, p.r));

  // fenced yard with the dog (scare event source)
  scene.add(b.fenceRun(18, -28, 26, -28));
  scene.add(b.fenceRun(18, -28, 18, -20));
  scene.add(b.fenceRun(26, -28, 26, -20));

  return {
    name: 'Cozy Neighborhood',
    colliders,
    bounds: { minX: -55, maxX: 55, minZ: -55, maxZ: 55 },
    spawn: { x: 0, z: 45 },
    pois: [
      { x: -8, z: 4 }, { x: 4, z: -35 }, { x: 16, z: 2 }, { x: -12, z: 32 },
      { x: 8, z: 27 }, { x: -6, z: -40 }, { x: 20, z: -8 }, { x: 28, z: 28 },
    ],
    collectibles: [
      { id: 'yarn-1', x: -14, z: 33.5, label: 'a red yarn ball' },
      { id: 'yarn-2', x: 5.5, z: -36.5, label: 'a blue yarn ball' },
      { id: 'yarn-3', x: 25, z: 21, label: 'a golden yarn ball' },
      { id: 'yarn-4', x: -21, z: -19, label: 'a green yarn ball' },
    ],
    scenics: [
      { id: 'playground', x: 30, z: 26, label: 'the little playground' },
      { id: 'crossroads', x: 0, z: 0, label: 'the sunny crossroads' },
    ],
    critterSpawns: [
      { type: 'bird', x: -6, z: -40 }, { type: 'bird', x: 6, z: 40 }, { type: 'bird', x: 24, z: 18 },
      { type: 'squirrel', x: -20, z: 22, x2: 7, z2: -22 },
      { type: 'squirrel', x: 20, z: -8, x2: -8, z2: 8 },
      { type: 'butterfly', x: -12, z: 28 }, { type: 'butterfly', x: 12, z: -12 },
      { type: 'dog', x: 22, z: -24 },
      { type: 'villager', x: -16, z: 12 }, { type: 'villager', x: 14, z: 34 },
    ],
    moments: [
      { id: 'feeder-raid', label: 'a squirrel raiding the bird feeder!', x: -12, z: 30, from: { x: -20, z: 22 } },
      { id: 'mail-nap', label: 'a delivery drone bothering the mailbox birds', x: 12, z: 32, from: { x: 6, z: 40 } },
    ],
    puddles,
    skyDusk: { top: 0x2a3a5e, horizon: 0x6a5a7e },
  };
}
```

- [ ] **Step 3: Use the area in src/main.js**

Remove the Task 1 placeholder ground and sky lines. After scene setup:

```js
import * as neighborhood from './world/neighborhood.js';

const area = neighborhood.build(scene);
camera.position.set(area.spawn.x, 1.6, area.spawn.z);
cat.position.set(area.spawn.x + 1, 0, area.spawn.z - 2);
```

And pass the real colliders/bounds to the player update:

```js
player.update(dt, area.colliders, area.bounds);
```

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`
Expected: you spawn at the south end of a street lined with pastel houses, mailboxes, flowers, trees, parked cars, lamp posts, benches, a fenced yard, and two puddles. You collide with houses/trees/cars instead of walking through them. Framerate smooth. No console errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add world prop builders and neighborhood area with colliders"
```

---

### Task 9: Critters and scare events

**Files:**
- Create: `src/critters.js`
- Modify: `src/main.js` (spawn critters, feed the brain real context, chase targets)

**Interfaces:**
- Produces: `createCritters(scene, spawns, opts) -> critters` with:
  - `update(dt, t, playerPos, catPos)` — behavior tick.
  - `list` — active critters `[{ id, type, group, spottable, fleeing }]`; `group.position` is world position.
  - `nearest(pos, maxDist)` — nearest chaseable critter (bird/squirrel/butterfly/seagull/crab/duck/firefly) or null.
  - `catchAt(pos)` — if a butterfly/firefly is within 0.8 of `pos`, despawn it and return it (for Calico pounce), else null.
  - `playMoment(moment)` — runs a scripted dash from `moment.from` to the moment location and back (~6s); returns nothing.
  - `dispose()` — removes all critter meshes from the scene.
  - Emits on the bus: `critter:scare` (dog bark, `{ x, z }`), `villager:wave` (`{ id }`, once per approach).
  - `opts = { fleeScale (1 = normal, 0.5 with bell), spawnFireflies (bool, dusk) }`.
- Consumes: `spawns` array from an area's `critterSpawns`.

- [ ] **Step 1: Implement src/critters.js**

```js
import * as THREE from 'three';
import { bus } from './events.js';

const mat = (color) => new THREE.MeshLambertMaterial({ color });
const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));

const CHASEABLE = new Set(['bird', 'squirrel', 'butterfly', 'seagull', 'crab', 'duck', 'firefly']);

function buildCritter(type) {
  const g = new THREE.Group();
  if (type === 'bird' || type === 'seagull') {
    const s = type === 'seagull' ? 1.6 : 1;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.09 * s, 6, 6), mat(type === 'seagull' ? 0xf0f0f0 : 0x8a5a3a));
    body.position.y = 0.09 * s;
    g.add(body);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03 * s, 0.08 * s, 4), mat(0xf2a04e));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.1 * s, -0.1 * s);
    g.add(beak);
  } else if (type === 'squirrel') {
    const body = box(0.12, 0.12, 0.22, 0xa06a3a);
    body.position.y = 0.1;
    g.add(body);
    const tailS = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 5), mat(0xb87a4a));
    tailS.position.set(0, 0.2, 0.16);
    g.add(tailS);
  } else if (type === 'butterfly' || type === 'firefly') {
    const color = type === 'firefly' ? 0xf2e04e : 0xe070b0;
    for (const side of [-1, 1]) {
      const wing = box(0.08, 0.01, 0.06, color);
      wing.position.x = side * 0.05;
      g.add(wing);
    }
    if (type === 'firefly') {
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 5),
        new THREE.MeshLambertMaterial({ color: 0xf2e04e, emissive: 0xb8a820 }));
      g.add(glow);
    }
  } else if (type === 'duck') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), mat(0x6a9a4a));
    body.position.y = 0.1;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), mat(0x3a7a3a));
    head.position.set(0, 0.28, -0.1);
    g.add(head);
  } else if (type === 'crab') {
    const body = box(0.2, 0.08, 0.14, 0xe06848);
    body.position.y = 0.06;
    g.add(body);
    for (const side of [-1, 1]) {
      const claw = box(0.06, 0.05, 0.08, 0xe06848);
      claw.position.set(side * 0.14, 0.08, -0.06);
      g.add(claw);
    }
  } else if (type === 'dog') {
    const body = box(0.3, 0.28, 0.6, 0xc8a060);
    body.position.y = 0.3;
    g.add(body);
    const head = box(0.22, 0.2, 0.22, 0xc8a060);
    head.position.set(0, 0.55, -0.32);
    g.add(head);
  } else if (type === 'villager') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.1, 8), mat(0x6a8ac0));
    body.position.y = 0.55;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), mat(0xe8c8a8));
    head.position.y = 1.3;
    g.add(head);
    const arm = box(0.08, 0.5, 0.08, 0x6a8ac0);
    arm.geometry.translate(0, 0.25, 0);
    arm.position.set(0.3, 0.9, 0);
    arm.rotation.z = 0.4;
    g.add(arm);
    g.userData.arm = arm;
  }
  return g;
}

let nextId = 1;

export function createCritters(scene, spawns, opts = {}) {
  const fleeScale = opts.fleeScale ?? 1;
  const list = [];

  function spawn(def) {
    const group = buildCritter(def.type);
    group.position.set(def.x, def.type === 'butterfly' || def.type === 'firefly' ? 1 : 0, def.z);
    scene.add(group);
    const c = {
      id: `${def.type}-${nextId++}`,
      type: def.type,
      def,
      group,
      spottable: def.type !== 'firefly',
      fleeing: false,
      phase: Math.random() * Math.PI * 2,
      cooldown: 0,
      waved: false,
    };
    list.push(c);
    return c;
  }

  for (const def of spawns) spawn(def);
  if (opts.spawnFireflies) {
    for (let i = 0; i < 8; i++) {
      spawn({ type: 'firefly', x: (Math.random() - 0.5) * 60, z: (Math.random() - 0.5) * 60 });
    }
  }

  function remove(c) {
    scene.remove(c.group);
    list.splice(list.indexOf(c), 1);
  }

  const api = {
    list,
    nearest(pos, maxDist) {
      let best = null;
      let bestD = maxDist;
      for (const c of list) {
        if (!CHASEABLE.has(c.type) || c.fleeing) continue;
        const d = c.group.position.distanceTo(pos);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      return best;
    },
    catchAt(pos) {
      for (const c of list) {
        if ((c.type === 'butterfly' || c.type === 'firefly') &&
            c.group.position.distanceTo(pos) < 0.8) {
          remove(c);
          return c;
        }
      }
      return null;
    },
    playMoment(moment) {
      const runner = spawn({ type: 'squirrel', x: moment.from.x, z: moment.from.z });
      runner.moment = { target: new THREE.Vector3(moment.x, 0, moment.z), t: 0 };
    },
    dispose() {
      for (const c of [...list]) remove(c);
    },
    update(dt, t, playerPos, catPos) {
      for (const c of [...list]) {
        const p = c.group.position;
        const dPlayer = p.distanceTo(playerPos);
        const dCat = p.distanceTo(catPos);
        const threat = Math.min(dPlayer, dCat);

        if (c.moment) {
          // scripted dash: out 3s, back 3s, then despawn
          c.moment.t += dt;
          const target = c.moment.t < 3 ? c.moment.target
            : new THREE.Vector3(c.def.x, 0, c.def.z);
          const dir = target.clone().sub(p).setY(0);
          if (dir.length() > 0.2) p.addScaledVector(dir.normalize(), dt * 5);
          if (c.moment.t > 6) remove(c);
          continue;
        }

        if (c.type === 'bird' || c.type === 'seagull') {
          if (c.fleeing) {
            p.y += dt * 6;
            p.x += Math.sin(c.phase) * dt * 4;
            p.z += Math.cos(c.phase) * dt * 4;
            c.cooldown -= dt;
            if (c.cooldown <= 0) {
              p.set(c.def.x, 0, c.def.z);
              c.fleeing = false;
            }
          } else {
            p.y = Math.abs(Math.sin(t * 3 + c.phase)) * 0.08; // hop
            if (threat < 2.5 * fleeScale * (c.type === 'seagull' ? 1.4 : 1)) {
              c.fleeing = true;
              c.cooldown = 18;
            }
          }
        } else if (c.type === 'squirrel') {
          const a = new THREE.Vector3(c.def.x, 0, c.def.z);
          const bPt = new THREE.Vector3(c.def.x2 ?? c.def.x + 6, 0, c.def.z2 ?? c.def.z);
          const k = (Math.sin(t * 0.6 + c.phase) + 1) / 2;
          p.lerpVectors(a, bPt, k);
        } else if (c.type === 'butterfly' || c.type === 'firefly') {
          const cx = c.trail ? catPos.x : c.def.x;
          const cz = c.trail ? catPos.z : c.def.z;
          p.x = cx + Math.sin(t * 0.8 + c.phase) * 1.5;
          p.z = cz + Math.cos(t * 0.6 + c.phase) * 1.5;
          p.y = 0.8 + Math.sin(t * 2 + c.phase) * 0.3;
        } else if (c.type === 'duck') {
          const r = 2;
          p.x = c.def.x + Math.cos(t * 0.3 + c.phase) * r;
          p.z = c.def.z + Math.sin(t * 0.3 + c.phase) * r;
          c.group.rotation.y = -(t * 0.3 + c.phase);
        } else if (c.type === 'crab') {
          p.x = c.def.x + Math.sin(t * 1.5 + c.phase) * 1.2;
        } else if (c.type === 'dog') {
          c.cooldown -= dt;
          if (dCat < 8 && c.cooldown <= 0) {
            c.cooldown = 12;
            bus.emit('critter:scare', { x: p.x, z: p.z });
          }
          c.group.rotation.y = Math.atan2(catPos.x - p.x, catPos.z - p.z);
        } else if (c.type === 'villager') {
          const arm = c.group.userData.arm;
          if (dPlayer < 5) {
            arm.rotation.z = 2.6 + Math.sin(t * 6) * 0.3; // wave
            if (!c.waved) {
              c.waved = true;
              bus.emit('villager:wave', { id: c.id });
            }
          } else {
            arm.rotation.z = 0.4;
            if (dPlayer > 8) c.waved = false;
          }
        }
      }
    },
  };
  return api;
}
```

- [ ] **Step 2: Wire critters and chasing into src/main.js**

```js
import { createCritters } from './critters.js';

// after area build:
const critters = createCritters(scene, area.critterSpawns, {});
```

In `updateCat`, replace the brain context and add chase/scare behavior:

```js
const nearCritter = critters.nearest(cat.position, 8);
const nearPoi = area.pois.some((poi) => Math.hypot(poi.x - cat.position.x, poi.z - cat.position.z) < p.sniffRange);
brain.update(dt, { leashTension: tension, critterNearby: !!nearCritter, poiNearby: nearPoi });
```

In the target selection, handle `distracted`:

```js
if (state === 'distracted' && nearCritter) {
  target = nearCritter.group.position.clone();
} else if (state === 'distracted') {
  brain.set('follow', 2); // critter got away
}
```

After movement, let pouncers catch things:

```js
if (state === 'distracted') {
  const caught = critters.catchAt(cat.position.clone().setY(0.8));
  if (caught && p.special === 'pouncer') bus.emit('cat:pounce', { critter: caught });
}
```

Subscribe to scares (near the brain setup):

```js
bus.on('critter:scare', () => {
  brain.scare(); // returns false for fearless/steady cats — that's fine
});
```

And in the loop, before `updateCat`:

```js
critters.update(dt, clock.elapsedTime, camera.position, cat.position);
```

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`
Expected: birds hop and fly off when you or the cat get close; squirrels shuttle between trees; butterflies loop around flower patches; the fenced dog turns to face your cat and, within ~8 units, "barks" — most breeds freeze (tail tucked) for a couple of seconds, but Black Cat (`4`) and Maine Coon (`6`) ignore it; villagers wave as you pass. A Siamese (`2`) visibly bolts after birds and drags you. No console errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add critters with flee/scare/wave behaviors and cat chasing"
```

---

### Task 10: Discoveries, HUD, and interactions

**Files:**
- Create: `src/discoveries.js`, `src/ui/hud.js`
- Modify: `src/main.js`, `src/style.css`
- Test: `test/discoveries.test.js`

**Interfaces:**
- Produces:
  - `AWARDS` — `{ critter: 5, collectible: 10, pet: 4, scenic: 8, moment: 12, perk: 3 }`.
  - `createDiscoveryLog(progression) -> log` with `startWalk()`, `award(type, key, label) -> points` (repeats after the first award of `key` this walk give `max(1, round(base/2))`), `awardOnce(type, key, label) -> points|0` (0 if `key` already awarded this walk), `count(key)`. Every successful award calls `progression.addPoints` and emits `discovery { type, key, label, points, repeat }` on the bus.
  - `createHud() -> hud` with `show()`, `hide()`, `setPoints(n)`, `setArea(name)`, `setPrompt(text|null)`, `toast(text, points?)`. Subscribes to `discovery` events itself.
- Consumes: `progression` (Task 3), bus (Task 2).

- [ ] **Step 1: Write the failing tests**

`test/discoveries.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDiscoveryLog, AWARDS } from '../src/discoveries.js';
import { bus } from '../src/events.js';

describe('createDiscoveryLog', () => {
  let progression, log;
  beforeEach(() => {
    progression = { addPoints: vi.fn() };
    log = createDiscoveryLog(progression);
    log.startWalk();
  });

  it('awards full points on first discovery, half on repeats', () => {
    expect(log.award('critter', 'bird-1', 'a songbird')).toBe(AWARDS.critter);
    expect(log.award('critter', 'bird-1', 'a songbird')).toBe(Math.max(1, Math.round(AWARDS.critter / 2)));
    expect(progression.addPoints).toHaveBeenCalledTimes(2);
  });

  it('awardOnce pays only the first time per walk', () => {
    expect(log.awardOnce('scenic', 'overlook', 'the overlook')).toBe(AWARDS.scenic);
    expect(log.awardOnce('scenic', 'overlook', 'the overlook')).toBe(0);
    expect(progression.addPoints).toHaveBeenCalledTimes(1);
  });

  it('startWalk resets repeat tracking', () => {
    log.award('critter', 'bird-1', 'a songbird');
    log.startWalk();
    expect(log.award('critter', 'bird-1', 'a songbird')).toBe(AWARDS.critter);
  });

  it('emits discovery events on the bus', () => {
    const fn = vi.fn();
    const off = bus.on('discovery', fn);
    log.award('pet', 'pet-1', 'a happy purr');
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'pet', points: AWARDS.pet, repeat: false })
    );
    off();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `../src/discoveries.js`

- [ ] **Step 3: Implement src/discoveries.js**

```js
import { bus } from './events.js';

export const AWARDS = { critter: 5, collectible: 10, pet: 4, scenic: 8, moment: 12, perk: 3 };

export function createDiscoveryLog(progression) {
  let seen = new Map();

  function pay(type, key, label, points, repeat) {
    progression.addPoints(points);
    bus.emit('discovery', { type, key, label, points, repeat });
    return points;
  }

  return {
    startWalk() {
      seen = new Map();
    },
    count(key) {
      return seen.get(key) || 0;
    },
    award(type, key, label) {
      const n = seen.get(key) || 0;
      seen.set(key, n + 1);
      const base = AWARDS[type];
      const points = n === 0 ? base : Math.max(1, Math.round(base / 2));
      return pay(type, key, label, points, n > 0);
    },
    awardOnce(type, key, label) {
      if (seen.has(key)) return 0;
      seen.set(key, 1);
      return pay(type, key, label, AWARDS[type], false);
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all)

- [ ] **Step 5: Implement src/ui/hud.js**

```js
import { bus } from '../events.js';

export function createHud() {
  const root = document.getElementById('hud');
  root.innerHTML = `
    <div class="hud-top">
      <div class="hud-points">🐾 <span id="hud-points-value">0</span></div>
      <div class="hud-area" id="hud-area"></div>
    </div>
    <div class="hud-toasts" id="hud-toasts"></div>
    <div class="hud-prompt hidden" id="hud-prompt"></div>
    <div class="hud-crosshair">·</div>
  `;
  const pointsEl = root.querySelector('#hud-points-value');
  const areaEl = root.querySelector('#hud-area');
  const toastsEl = root.querySelector('#hud-toasts');
  const promptEl = root.querySelector('#hud-prompt');

  const api = {
    show() { root.classList.remove('hidden'); },
    hide() { root.classList.add('hidden'); },
    setPoints(n) { pointsEl.textContent = String(n); },
    setArea(name) { areaEl.textContent = name; },
    setPrompt(text) {
      promptEl.classList.toggle('hidden', !text);
      if (text) promptEl.textContent = text;
    },
    toast(text, points) {
      const el = document.createElement('div');
      el.className = 'toast';
      el.textContent = points ? `${text}  +${points} 🐾` : text;
      toastsEl.appendChild(el);
      setTimeout(() => el.classList.add('fade'), 2600);
      setTimeout(() => el.remove(), 3400);
    },
  };

  bus.on('discovery', ({ label, points, repeat }) => {
    api.toast(`${repeat ? 'Again — ' : 'You spotted '}${label}`, points);
  });

  return api;
}
```

Add to `src/style.css`:

```css
#hud { pointer-events: none; }
.hud-top {
  position: absolute; top: 16px; left: 16px; right: 16px;
  display: flex; justify-content: space-between; font-size: 1.2rem;
  text-shadow: 0 1px 3px rgba(0,0,0,0.5);
}
.hud-points { background: rgba(20,26,38,0.55); padding: 6px 14px; border-radius: 999px; }
.hud-area { background: rgba(20,26,38,0.55); padding: 6px 14px; border-radius: 999px; }
.hud-toasts {
  position: absolute; bottom: 110px; left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 6px;
}
.toast {
  background: rgba(20,26,38,0.75); padding: 8px 18px; border-radius: 999px;
  transition: opacity 0.8s; font-size: 1.05rem;
}
.toast.fade { opacity: 0; }
.hud-prompt {
  position: absolute; bottom: 60px; left: 50%; transform: translateX(-50%);
  background: rgba(242,193,78,0.92); color: #3a2a10; font-weight: 700;
  padding: 8px 18px; border-radius: 10px;
}
.hud-crosshair {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  font-size: 1.6rem; opacity: 0.7;
}
```

- [ ] **Step 6: Wire discoveries and interactions into src/main.js**

Add near the top of `init()`:

```js
import { createProgression } from './progression.js';
import { createDiscoveryLog } from './discoveries.js';
import { createHud } from './ui/hud.js';

const progression = createProgression(window.localStorage);
const log = createDiscoveryLog(progression);
const hud = createHud();
hud.show();
hud.setArea(area.name);
hud.setPoints(progression.state.points);
log.startWalk();
bus.on('discovery', () => hud.setPoints(progression.state.points));
```

Create collectible + scenic markers after area build:

```js
const collectibleMeshes = new Map();
for (const c of area.collectibles) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 8),
    new THREE.MeshLambertMaterial({ color: 0xf25c8a, emissive: 0x5a1a30 })
  );
  m.position.set(c.x, 0.2, c.z);
  scene.add(m);
  collectibleMeshes.set(c.id, m);
}
```

Add a per-walk state object and an interaction pass, called every frame from the loop as `updateInteractions(dt)`:

```js
const walk = { carried: 0, carryCap: 2 }; // backpack raises cap in Task 14
let currentPrompt = null;

function updateInteractions() {
  // 1. critter spotting: within 6, roughly in front of the player
  for (const c of critters.list) {
    if (!c.spottable || c.fleeing) continue;
    const to = c.group.position.clone().sub(camera.position).setY(0);
    if (to.length() < 6 && to.normalize().dot(player.forward()) > 0.5) {
      log.awardOnce('critter', `spot-${c.id}`, labelFor(c.type));
    }
  }
  // 2. nearest collectible
  currentPrompt = null;
  for (const c of area.collectibles) {
    if (!collectibleMeshes.has(c.id)) continue;
    if (Math.hypot(c.x - camera.position.x, c.z - camera.position.z) < 1.6) {
      currentPrompt = { kind: 'collect', data: c };
      hud.setPrompt(walk.carried >= walk.carryCap ? 'Paws full! (carry limit reached)' : `E — pick up ${c.label}`);
    }
  }
  // 3. petting
  if (!currentPrompt && (brain.state === 'requestPet' || brain.state === 'nap') &&
      cat.position.distanceTo(camera.position) < 2.8) {
    currentPrompt = { kind: 'pet' };
    hud.setPrompt(brain.state === 'nap' ? 'E — pet the sleepy cat' : 'E — your cat wants pets!');
  }
  if (!currentPrompt) hud.setPrompt(null);

  // 4. scenic spots
  for (const s of area.scenics) {
    if (Math.hypot(s.x - camera.position.x, s.z - camera.position.z) < 4) {
      log.awardOnce('scenic', `scenic-${s.id}`, s.label);
    }
  }
}

function labelFor(type) {
  return { bird: 'a songbird', squirrel: 'a busy squirrel', butterfly: 'a butterfly',
    duck: 'a paddling duck', seagull: 'a seagull', crab: 'a sideways crab',
    dog: 'the neighbor’s dog', villager: 'a friendly neighbor' }[type] ?? 'something interesting';
}

document.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyE' || !currentPrompt) return;
  if (currentPrompt.kind === 'collect' && walk.carried < walk.carryCap) {
    const c = currentPrompt.data;
    scene.remove(collectibleMeshes.get(c.id));
    collectibleMeshes.delete(c.id);
    walk.carried += 1;
    log.awardOnce('collectible', `col-${c.id}`, c.label);
  } else if (currentPrompt.kind === 'pet' && brain.pet()) {
    log.award('pet', 'pet', 'a rumbling purr');
  }
});
```

Little moments — add a timer in the loop:

```js
let momentTimer = 40;
// in the loop:
momentTimer -= dt;
if (momentTimer <= 0 && area.moments.length) {
  momentTimer = 45 + Math.random() * 30;
  const m = area.moments[Math.floor(Math.random() * area.moments.length)];
  critters.playMoment(m);
  activeMoment = { m, timeLeft: 6 };
}
if (activeMoment) {
  activeMoment.timeLeft -= dt;
  const { m } = activeMoment;
  const to = new THREE.Vector3(m.x, 0, m.z).sub(camera.position).setY(0);
  if (to.length() < 15 && to.normalize().dot(player.forward()) > 0.4) {
    log.awardOnce('moment', `moment-${m.id}`, m.label);
  }
  if (activeMoment.timeLeft <= 0) activeMoment = null;
}
```

(declare `let activeMoment = null;` alongside `momentTimer`). Also toast scares — extend the scare subscription:

```js
bus.on('critter:scare', () => {
  if (brain.scare()) hud.toast('Woof! Your cat got spooked!');
});
```

(replace the Task 9 subscription with this one).

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev`
Expected: HUD shows paw-point count and area name; looking at a bird within range pops "You spotted a songbird +5 🐾" and the count rises; pink yarn balls glow near houses — `E` picks them up (only 2 per walk, then "Paws full!"); when the cat naps or stops to ask, an `E — pet` prompt appears and petting awards points; standing at the playground or crossroads fires a scenic award; occasionally a squirrel dashes across to raid the feeder and watching it awards a moment. Points persist across a page reload. No console errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add discovery awards, HUD, and E-key interactions"
```

---

### Task 11: Home base UI, shop, and walk lifecycle

This task restructures `main.js` into a proper home-base ⇄ walk state machine. The debug breed switcher goes away; cat, area, and accessories now come from progression state.

**Files:**
- Create: `src/ui/homebase.js`
- Modify: `src/main.js` (full rewrite below), `src/style.css`

**Interfaces:**
- Produces: `createHomeBase(progression, onStartWalk) -> { show(), hide() }`. `onStartWalk` is called with `{ duskMode: boolean }`. Home base renders from `progression.state` and calls `buy/equipCat/equipAccessory/unequip/setArea/reset` directly.
- Consumes: `CATALOG`, progression API (Task 3).
- Produces (main.js): `startWalk(opts)` / `endWalk()` lifecycle; a `session` object holding all per-walk state; `endWalk` calls `progression.completeWalk()`. Later tasks hook into `startWalk` (perks, audio) and the `AREAS` registry (`{ neighborhood }` for now; park/seaside register in Tasks 12–13).

- [ ] **Step 1: Implement src/ui/homebase.js**

```js
import { CATALOG } from '../progression.js';

const CAT_BLURBS = {
  tabby: 'Curious — sniffs out hidden treasures',
  siamese: 'Hyper — fast, loud, chases everything',
  persian: 'Lazy — naps often, loves pets',
  black: 'Brave — nothing spooks this cat',
  calico: 'Playful — pounces butterflies for points',
  mainecoon: 'Steady — big, calm, unbothered',
};
const ACC_BLURBS = {
  bell: 'Birds come closer',
  glow: 'Unlocks dusk walks with fireflies',
  bandana: 'Neighbors wave back (+points)',
  booties: 'Puddles become splash discoveries',
  backpack: 'Carry one extra collectible',
  crown: 'Butterflies trail your cat',
};

export function createHomeBase(progression, onStartWalk) {
  const root = document.getElementById('homebase');

  function card(kind, id, item, ownedLabel) {
    const s = progression.state;
    const owned = progression.isUnlocked(kind, id);
    const selected =
      (kind === 'cats' && s.equipped.cat === id) ||
      (kind === 'accessories' && s.equipped[item.slot] === id) ||
      (kind === 'areas' && s.area === id);
    const blurb = kind === 'cats' ? CAT_BLURBS[id] : kind === 'accessories' ? ACC_BLURBS[id] : '';
    let action;
    if (owned) {
      action = selected
        ? `<div class="tag on">${ownedLabel}</div>` +
          (kind === 'accessories' ? `<button data-action="unequip">Take off</button>` : '')
        : `<button data-action="equip">${kind === 'areas' ? 'Walk here' : 'Choose'}</button>`;
    } else if (progression.canBuy(kind, id)) {
      action = `<button data-action="buy">Unlock — ${item.price} 🐾</button>`;
    } else {
      let need = `${item.price} 🐾`;
      if (item.requires) {
        const req = item.requires;
        need += ` · ${s.walks[req.area]}/${req.walks} walks in ${CATALOG.areas[req.area].name}`;
      }
      action = `<div class="tag">${need}</div>`;
    }
    return `<div class="card ${selected ? 'selected' : ''} ${owned ? '' : 'locked'}"
      data-kind="${kind}" data-id="${id}">
      <div class="card-name">${item.name}</div>
      ${blurb ? `<div class="card-sub">${blurb}</div>` : ''}
      ${action}
    </div>`;
  }

  function render() {
    const s = progression.state;
    const glowReady = s.equipped.collar === 'glow';
    root.innerHTML = `
      <div class="homebase-scroll">
        <header class="hb-header">
          <h1>🐈 Whisker Walk</h1>
          <div class="hb-points">🐾 ${s.points} whisker points</div>
        </header>
        <section><h2>Your cat</h2><div class="cards">
          ${Object.entries(CATALOG.cats).map(([id, c]) => card('cats', id, c, 'walking today')).join('')}
        </div></section>
        <section><h2>Accessories</h2><div class="cards">
          ${Object.entries(CATALOG.accessories).map(([id, a]) => card('accessories', id, a, `on (${a.slot})`)).join('')}
        </div></section>
        <section><h2>Where to?</h2><div class="cards">
          ${Object.entries(CATALOG.areas).map(([id, a]) => card('areas', id, a, 'today’s walk')).join('')}
        </div></section>
        <footer class="hb-footer">
          ${glowReady ? `<label class="dusk"><input type="checkbox" id="dusk-toggle" /> Dusk walk ✨</label>` : ''}
          <button id="btn-start" class="primary">Start the walk 🐾</button>
          <button id="btn-reset" class="danger">Start over</button>
        </footer>
      </div>`;
  }

  root.addEventListener('click', (e) => {
    if (e.target.id === 'btn-start') {
      const dusk = root.querySelector('#dusk-toggle');
      onStartWalk({ duskMode: !!(dusk && dusk.checked) });
      return;
    }
    if (e.target.id === 'btn-reset') {
      if (window.confirm('Erase all progress and start over?')) {
        progression.reset();
        render();
      }
      return;
    }
    const cardEl = e.target.closest('.card');
    const action = e.target.dataset.action;
    if (!cardEl || !action) return;
    const { kind, id } = cardEl.dataset;
    if (action === 'buy') progression.buy(kind, id);
    else if (action === 'unequip') progression.unequip(CATALOG.accessories[id].slot);
    else if (action === 'equip') {
      if (kind === 'cats') progression.equipCat(id);
      else if (kind === 'accessories') progression.equipAccessory(id);
      else if (kind === 'areas') progression.setArea(id);
    }
    render();
  });

  return {
    show() {
      render();
      root.classList.remove('hidden');
    },
    hide() {
      root.classList.add('hidden');
    },
  };
}
```

- [ ] **Step 2: Add home-base and pause styles to src/style.css**

```css
#homebase { background: linear-gradient(#2a3550, #1c2431); overflow-y: auto; }
.homebase-scroll { max-width: 900px; margin: 0 auto; padding: 32px 20px 60px; }
.hb-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 18px; }
.hb-header h1 { font-size: 2rem; }
.hb-points { font-size: 1.2rem; color: #f2c14e; }
#homebase section { margin-bottom: 22px; }
#homebase h2 { font-size: 1.1rem; margin-bottom: 10px; color: #a8c0e0; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
.card {
  background: rgba(255,255,255,0.07); border-radius: 12px; padding: 12px;
  display: flex; flex-direction: column; gap: 6px; border: 2px solid transparent;
}
.card.selected { border-color: #f2c14e; }
.card.locked { opacity: 0.75; }
.card-name { font-weight: 700; }
.card-sub { font-size: 0.8rem; color: #a8c0e0; min-height: 2em; }
.card button, .hb-footer button, .pause-card button {
  border: 0; border-radius: 8px; padding: 8px 12px; cursor: pointer;
  background: #4a6ea5; color: #fff; font-weight: 700;
}
.card button:hover { background: #5a7eb5; }
.tag { font-size: 0.85rem; color: #c0ccdd; }
.tag.on { color: #f2c14e; font-weight: 700; }
.hb-footer { display: flex; gap: 12px; align-items: center; margin-top: 10px; }
.hb-footer .primary { background: #f2c14e; color: #3a2a10; font-size: 1.15rem; padding: 12px 22px; }
.hb-footer .danger { background: transparent; color: #d08080; margin-left: auto; }
.dusk { color: #c8b8f0; }
.pause-card { display: grid; place-items: center; align-content: center; gap: 12px;
  height: 100%; background: rgba(20, 26, 38, 0.55); text-align: center; }
.pause-card h1 { font-size: 2.2rem; }
```

(Replace the Task 5 `.pause-card` rule — buttons need pointer events, so drop `pointer-events: none`.)

- [ ] **Step 3: Rewrite src/main.js as the walk lifecycle**

Replace the whole file with:

```js
import * as THREE from 'three';
import { bus } from './events.js';
import { createPlayer } from './player.js';
import { buildCat } from './cat/model.js';
import { animateCat } from './cat/animator.js';
import { createBrain, PERSONALITIES } from './cat/brain.js';
import { createLeash, MAX_LEN } from './leash.js';
import * as neighborhood from './world/neighborhood.js';
import { createCritters } from './critters.js';
import { createProgression } from './progression.js';
import { createDiscoveryLog } from './discoveries.js';
import { createHud } from './ui/hud.js';
import { createHomeBase } from './ui/homebase.js';

const AREAS = { neighborhood }; // park (Task 12) and seaside (Task 13) register here

const canvas = document.getElementById('game');
const overlay = document.getElementById('overlay');

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch {
  renderer = null;
}

if (!renderer) {
  overlay.classList.remove('hidden');
  overlay.innerHTML =
    '<div class="pause-card"><p>Sorry — your browser could not start WebGL, which Whisker Walk needs. Try updating your browser or enabling hardware acceleration.</p></div>';
} else {
  init();
}

function init() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 300);
  const player = createPlayer(camera, canvas);
  const progression = createProgression(window.localStorage);
  const log = createDiscoveryLog(progression);
  const hud = createHud();
  const clock = new THREE.Clock();

  let session = null;

  const homebase = createHomeBase(progression, startWalk);
  homebase.show();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  bus.on('discovery', () => hud.setPoints(progression.state.points));
  bus.on('player:lockchange', ({ locked }) => {
    if (session) overlay.classList.toggle('hidden', locked);
  });
  bus.on('critter:scare', () => {
    if (session && session.brain.scare()) hud.toast('Woof! Your cat got spooked!');
  });
  overlay.addEventListener('click', (e) => {
    if (e.target.id === 'btn-resume') canvas.requestPointerLock();
    if (e.target.id === 'btn-end') endWalk();
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE' && session) handleInteract(session);
  });

  function startWalk({ duskMode = false } = {}) {
    const state = progression.state;
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
    sun.position.set(30, 50, 20);
    scene.add(sun, new THREE.AmbientLight(0xbfd8ff, 0.9));

    const areaData = AREAS[state.area].build(scene);
    camera.position.set(areaData.spawn.x, 1.6, areaData.spawn.z);

    const cat = buildCat(state.equipped.cat, {
      collar: state.equipped.collar,
      outfit: state.equipped.outfit,
    });
    cat.position.set(areaData.spawn.x + 1, 0, areaData.spawn.z - 2);
    scene.add(cat);

    const critters = createCritters(scene, areaData.critterSpawns, {});

    const collectibleMeshes = new Map();
    for (const c of areaData.collectibles) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 8),
        new THREE.MeshLambertMaterial({ color: 0xf25c8a, emissive: 0x5a1a30 })
      );
      m.position.set(c.x, 0.2, c.z);
      scene.add(m);
      collectibleMeshes.set(c.id, m);
    }

    session = {
      scene, areaData, cat, critters, collectibleMeshes, duskMode,
      brain: createBrain(state.equipped.cat),
      leash: createLeash(scene),
      catVelocity: new THREE.Vector3(),
      walk: { carried: 0, carryCap: 2 },
      momentTimer: 40,
      activeMoment: null,
      prompt: null,
    };

    log.startWalk();
    hud.show();
    hud.setArea(areaData.name);
    hud.setPoints(state.points);
    homebase.hide();
    overlay.innerHTML = `<div class="pause-card"><h1>Ready?</h1>
      <button id="btn-resume">Start walking (click)</button>
      <button id="btn-end">End walk &amp; head home</button></div>`;
    overlay.classList.remove('hidden');
    player.enable();
  }

  function endWalk() {
    if (!session) return;
    progression.completeWalk();
    session.critters.dispose();
    session = null;
    player.disable();
    hud.hide();
    hud.setPrompt(null);
    overlay.classList.add('hidden');
    homebase.show();
  }

  function handPosition() {
    const hand = player.forward().multiplyScalar(0.3);
    hand.add(camera.position).add(new THREE.Vector3(0, -0.5, 0));
    return hand;
  }

  function updateCat(s, dt, t) {
    const { cat, brain } = s;
    const p = PERSONALITIES[cat.userData.breed];
    const toPlayer = camera.position.clone().sub(cat.position).setY(0);
    const tension = toPlayer.length() / MAX_LEN;

    const nearCritter = s.critters.nearest(cat.position, 8);
    const nearPoi = s.areaData.pois.some(
      (poi) => Math.hypot(poi.x - cat.position.x, poi.z - cat.position.z) < p.sniffRange
    );
    brain.update(dt, { leashTension: tension, critterNearby: !!nearCritter, poiNearby: nearPoi });

    let target = null;
    const state = brain.state;
    if (state === 'follow' || state === 'scared') {
      target = camera.position.clone()
        .add(player.forward().multiplyScalar(2))
        .add(player.forward().clone().cross(new THREE.Vector3(0, 1, 0)).multiplyScalar(0.8));
    } else if (state === 'distracted') {
      if (nearCritter) target = nearCritter.group.position.clone();
      else brain.set('follow', 2);
    }

    const desired = new THREE.Vector3();
    if (target) {
      desired.copy(target).sub(cat.position).setY(0);
      if (desired.length() > 0.4) desired.normalize().multiplyScalar(p.speed * (state === 'scared' ? 1.8 : 1));
      else desired.set(0, 0, 0);
    }
    if (tension > 1) desired.add(toPlayer.normalize().multiplyScalar((tension - 1) * 20));

    s.catVelocity.lerp(desired, 1 - Math.pow(0.001, dt));
    cat.position.addScaledVector(s.catVelocity, dt);
    cat.position.y = 0;
    const speed = s.catVelocity.length();
    if (speed > 0.15) cat.rotation.y = Math.atan2(s.catVelocity.x, s.catVelocity.z) + Math.PI;
    animateCat(cat, state, t, speed);

    if (state === 'distracted') {
      const caught = s.critters.catchAt(cat.position.clone().setY(0.8));
      if (caught && p.special === 'pouncer') bus.emit('cat:pounce', { critter: caught });
    }

    const leashTension = s.leash.update(
      handPosition(),
      cat.position.clone().add(new THREE.Vector3(0, 0.4, 0))
    );
    player.speedFactor = leashTension > 0.9 ? Math.max(0.35, 1 - (leashTension - 0.9) * (p.pull / 4)) : 1;
  }

  function updateInteractions(s) {
    for (const c of s.critters.list) {
      if (!c.spottable || c.fleeing) continue;
      const to = c.group.position.clone().sub(camera.position).setY(0);
      if (to.length() < 6 && to.normalize().dot(player.forward()) > 0.5) {
        log.awardOnce('critter', `spot-${c.id}`, labelFor(c.type));
      }
    }
    s.prompt = null;
    for (const c of s.areaData.collectibles) {
      if (!s.collectibleMeshes.has(c.id)) continue;
      if (Math.hypot(c.x - camera.position.x, c.z - camera.position.z) < 1.6) {
        s.prompt = { kind: 'collect', data: c };
        hud.setPrompt(s.walk.carried >= s.walk.carryCap
          ? 'Paws full! (carry limit reached)'
          : `E — pick up ${c.label}`);
      }
    }
    if (!s.prompt && (s.brain.state === 'requestPet' || s.brain.state === 'nap') &&
        s.cat.position.distanceTo(camera.position) < 2.8) {
      s.prompt = { kind: 'pet' };
      hud.setPrompt(s.brain.state === 'nap' ? 'E — pet the sleepy cat' : 'E — your cat wants pets!');
    }
    if (!s.prompt) hud.setPrompt(null);

    for (const sc of s.areaData.scenics) {
      if (Math.hypot(sc.x - camera.position.x, sc.z - camera.position.z) < 4) {
        log.awardOnce('scenic', `scenic-${sc.id}`, sc.label);
      }
    }
  }

  function handleInteract(s) {
    if (!s.prompt) return;
    if (s.prompt.kind === 'collect' && s.walk.carried < s.walk.carryCap) {
      const c = s.prompt.data;
      s.scene.remove(s.collectibleMeshes.get(c.id));
      s.collectibleMeshes.delete(c.id);
      s.walk.carried += 1;
      log.awardOnce('collectible', `col-${c.id}`, c.label);
    } else if (s.prompt.kind === 'pet' && s.brain.pet()) {
      log.award('pet', 'pet', 'a rumbling purr');
    }
  }

  function updateMoments(s, dt) {
    s.momentTimer -= dt;
    if (s.momentTimer <= 0 && s.areaData.moments.length) {
      s.momentTimer = 45 + Math.random() * 30;
      const m = s.areaData.moments[Math.floor(Math.random() * s.areaData.moments.length)];
      s.critters.playMoment(m);
      s.activeMoment = { m, timeLeft: 6 };
    }
    if (s.activeMoment) {
      s.activeMoment.timeLeft -= dt;
      const { m } = s.activeMoment;
      const to = new THREE.Vector3(m.x, 0, m.z).sub(camera.position).setY(0);
      if (to.length() < 15 && to.normalize().dot(player.forward()) > 0.4) {
        log.awardOnce('moment', `moment-${m.id}`, m.label);
      }
      if (s.activeMoment.timeLeft <= 0) s.activeMoment = null;
    }
  }

  function labelFor(type) {
    return {
      bird: 'a songbird', squirrel: 'a busy squirrel', butterfly: 'a butterfly',
      duck: 'a paddling duck', seagull: 'a seagull', crab: 'a sideways crab',
      dog: 'the neighbor’s dog', villager: 'a friendly neighbor',
      firefly: 'a glowing firefly',
    }[type] ?? 'something interesting';
  }

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (!session) return;
    player.update(dt, session.areaData.colliders, session.areaData.bounds);
    session.critters.update(dt, t, camera.position, session.cat.position);
    updateCat(session, dt, t);
    updateInteractions(session);
    updateMoments(session, dt);
    renderer.render(session.scene, camera);
  });
}
```

- [ ] **Step 4: Run the unit tests (regression check)**

Run: `npm test`
Expected: PASS — nothing in this task touches tested modules, confirm no accidental breakage.

- [ ] **Step 5: Verify the full loop in the browser**

Run: `npm run dev`
Expected: the home-base screen appears with your points, six cat cards (five locked with prices), six accessory cards, three area cards (two gated), Start the walk. Starting a walk drops you into the neighborhood with your chosen cat; Esc opens the pause card; "End walk & head home" returns to home base and increments the walk counter (after 2 walks + 50 points, City Park becomes buyable — verify the button appears). Buy and equip flow works and survives reload. "Start over" resets after confirm.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add home base shop UI and walk lifecycle state machine"
```

---

### Task 12: City Park area

**Files:**
- Create: `src/world/park.js`
- Modify: `src/main.js` (register in `AREAS`)

**Interfaces:**
- Produces: `build(scene) -> areaData` (same shape as neighborhood — see Task 8).
- Consumes: `src/world/builder.js` props.

- [ ] **Step 1: Implement src/world/park.js**

```js
import * as THREE from 'three';
import * as b from './builder.js';

export function build(scene) {
  b.applySky(scene, 0xaee0d0, 0xd8f0e0);
  scene.add(b.ground(120, 0x6cb058));

  const colliders = [];
  const addC = (x, z, r) => colliders.push({ x, z, r });

  // winding path: south gate → fountain → pond → north meadow
  scene.add(b.path(0, 48, 0, 20, 3));
  scene.add(b.path(0, 20, -14, 6, 3));
  scene.add(b.path(-14, 6, -8, -18, 3));
  scene.add(b.path(-8, -18, 12, -30, 3));
  scene.add(b.path(0, 20, 16, 10, 3));

  // fountain at the path junction
  const fountain = new THREE.Group();
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.6, 12),
    new THREE.MeshLambertMaterial({ color: 0xb8b8c0 }));
  basin.position.y = 0.3;
  fountain.add(basin);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.1, 12),
    new THREE.MeshLambertMaterial({ color: 0x8ab8d8 }));
  water.position.y = 0.62;
  fountain.add(water);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.4, 8),
    new THREE.MeshLambertMaterial({ color: 0xb8b8c0 }));
  spire.position.y = 1.2;
  fountain.add(spire);
  fountain.position.set(0, 0, 20);
  scene.add(fountain);
  addC(0, 20, 3);

  // pond (duck home)
  const pond = new THREE.Mesh(new THREE.CircleGeometry(7, 20),
    new THREE.MeshLambertMaterial({ color: 0x7ab0d8 }));
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(-14, 0.02, 2);
  scene.add(pond);

  // big trees ring the lawns
  const treeSpots = [[-24, 30], [-30, 10], [-26, -14], [-16, -34], [8, -38], [22, -22],
    [28, 0], [24, 24], [12, 36], [-6, 34], [6, -8], [16, -6]];
  for (const [x, z] of treeSpots) {
    scene.add(b.tree(x, z, 1.2 + ((x + z) % 4) * 0.15));
    addC(x, z, 0.7);
  }
  for (const [x, z] of [[-10, 26], [10, 18], [-20, -6], [4, -24]]) scene.add(b.bush(x, z));
  scene.add(b.bench(3, 26, -0.5));
  scene.add(b.bench(-4, 14, 0.7));
  scene.add(b.bench(-10, -20, 2.2));
  scene.add(b.bench(14, -28, -2.4));
  for (const [x, z] of [[2, 40], [-12, 10], [-4, -14], [10, -32]]) scene.add(b.lampPost(x, z));
  for (const [x, z] of [[-18, 22], [20, 12], [6, -16]]) scene.add(b.flowerPatch(x, z));
  const puddles = [{ x: 2, z: 32, r: 0.9 }, { x: -10, z: -8, r: 0.8 }];
  for (const p of puddles) scene.add(b.puddle(p.x, p.z, p.r));

  return {
    name: 'City Park',
    colliders,
    bounds: { minX: -45, maxX: 45, minZ: -50, maxZ: 52 },
    spawn: { x: 0, z: 45 },
    pois: [
      { x: 0, z: 20 }, { x: -14, z: 2 }, { x: 3, z: 26 }, { x: -10, z: -20 },
      { x: 12, z: -30 }, { x: 22, z: -22 }, { x: -18, z: 22 }, { x: 16, z: 10 },
    ],
    collectibles: [
      { id: 'feather-1', x: -25, z: 29, label: 'a jay feather' },
      { id: 'feather-2', x: 27, z: 1.5, label: 'a dove feather' },
      { id: 'feather-3', x: -15.5, z: -33, label: 'a golden feather' },
      { id: 'feather-4', x: 11, z: 35, label: 'a tiny down feather' },
    ],
    scenics: [
      { id: 'fountain', x: 3, z: 23, label: 'the old fountain' },
      { id: 'pond-shore', x: -14, z: 10, label: 'the duck pond' },
      { id: 'meadow', x: 12, z: -30, label: 'the quiet meadow' },
    ],
    critterSpawns: [
      { type: 'bird', x: -24, z: 30 }, { type: 'bird', x: 22, z: -22 }, { type: 'bird', x: 12, z: 36 },
      { type: 'bird', x: -26, z: -14 },
      { type: 'squirrel', x: -30, z: 10, x2: -16, z2: -34 },
      { type: 'squirrel', x: 28, z: 0, x2: 8, z2: -38 },
      { type: 'butterfly', x: -18, z: 22 }, { type: 'butterfly', x: 20, z: 12 }, { type: 'butterfly', x: 6, z: -16 },
      { type: 'duck', x: -14, z: 2 }, { type: 'duck', x: -12, z: 0 }, { type: 'duck', x: -16, z: 4 },
      { type: 'villager', x: 4, z: 27 }, { type: 'villager', x: -8, z: -22 },
    ],
    moments: [
      { id: 'duck-parade', label: 'a duckling parade crossing the path!', x: -8, z: 8, from: { x: -14, z: 2 } },
      { id: 'picnic-thief', label: 'a squirrel making off with a picnic sandwich', x: 3, z: 26, from: { x: -30, z: 10 } },
    ],
    puddles,
    skyDusk: { top: 0x2a3a5e, horizon: 0x6a5a7e },
  };
}
```

- [ ] **Step 2: Register the area in src/main.js**

```js
import * as park from './world/park.js';
// ...
const AREAS = { neighborhood, park };
```

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`
Expected: unlock City Park (use "Start over" + a couple of quick walks if needed, or temporarily give yourself points via the console: `localStorage` editing is fine for testing — reset after). Walking the park: winding paths, fountain junction with collider, pond with three circling ducks, big trees, benches, feathers to collect, duckling-parade moment. No console errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add City Park area"
```

---

### Task 13: Seaside area

**Files:**
- Create: `src/world/seaside.js`
- Modify: `src/main.js` (register in `AREAS`)

**Interfaces:**
- Produces: `build(scene) -> areaData` (same shape as neighborhood — see Task 8).
- Consumes: `src/world/builder.js` props.

- [ ] **Step 1: Implement src/world/seaside.js**

```js
import * as THREE from 'three';
import * as b from './builder.js';

const mat = (color) => new THREE.MeshLambertMaterial({ color });

export function build(scene) {
  b.applySky(scene, 0x9fc8e8, 0xe8e0d0);
  scene.add(b.ground(140, 0xe0d0a0)); // sand

  const colliders = [];
  const addC = (x, z, r) => colliders.push({ x, z, r });

  // the sea: everything east of x = 25
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(80, 140), mat(0x4a90c0));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(65, 0.05, 0);
  scene.add(sea);

  // boardwalk running north-south along the shore
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(4, 90), mat(0xa08050));
  walk.rotation.x = -Math.PI / 2;
  walk.position.set(20, 0.03, 0);
  scene.add(walk);
  // pier heading out over the water
  const pier = new THREE.Mesh(new THREE.PlaneGeometry(3, 24), mat(0xa08050));
  pier.rotation.x = -Math.PI / 2;
  pier.rotation.z = Math.PI / 2;
  pier.position.set(34, 0.25, -10);
  scene.add(pier);

  // fishing boats bobbing offshore
  for (const [x, z, color] of [[40, 8, 0xd06048], [50, -22, 0x4a6ea5], [44, 28, 0x6a9a4a]]) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 4.5), mat(color));
    hull.position.y = 0.4;
    boat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), mat(0x7a5230));
    mast.position.y = 2;
    boat.add(mast);
    boat.position.set(x, 0, z);
    scene.add(boat);
  }

  // cliff at the north end with a switchback path up
  const cliff = new THREE.Mesh(new THREE.BoxGeometry(60, 8, 18), mat(0xb09878));
  cliff.position.set(-10, 4, -46);
  scene.add(cliff);
  for (let i = 0; i < 12; i++) addC(-38 + i * 5, -37, 2.5); // cliff face blocks walking through
  const overlook = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 10), mat(0xb09878));
  overlook.position.set(-40, 4, -40);
  scene.add(overlook);
  addC(-40, -40, 6);

  // beach props
  for (const [x, z] of [[-8, 10], [-20, -2], [4, 24], [-28, 18]]) scene.add(b.rock(x, z));
  scene.add(b.bench(18, 14, Math.PI / 2));
  scene.add(b.bench(18, -18, Math.PI / 2));
  for (const [x, z] of [[20, 30], [20, -30]]) scene.add(b.lampPost(x, z));
  // beach grass tufts
  for (const [x, z] of [[-14, 30], [-2, -14], [-24, -20], [8, 2]]) scene.add(b.bush(x, z));

  return {
    name: 'Seaside',
    colliders,
    bounds: { minX: -48, maxX: 36, minZ: -34, maxZ: 48 },
    spawn: { x: 18, z: 42 },
    pois: [
      { x: 20, z: 14 }, { x: 34, z: -10 }, { x: -8, z: 10 }, { x: -20, z: -2 },
      { x: 4, z: 24 }, { x: -28, z: 18 }, { x: 18, z: -18 }, { x: -2, z: -14 },
    ],
    collectibles: [
      { id: 'fish-1', x: 33, z: -14, label: 'a shiny little fish' },
      { id: 'fish-2', x: -9, z: 8.5, label: 'a striped shell-fish' },
      { id: 'fish-3', x: -29, z: 16.5, label: 'a silver sardine' },
      { id: 'fish-4', x: 19, z: -31, label: 'a lost lure-fish' },
    ],
    scenics: [
      { id: 'pier-end', x: 34, z: -18, label: 'the end of the pier' },
      { id: 'overlook', x: -33, z: -32, label: 'the cliffside overlook' },
      { id: 'shoreline', x: 24, z: 20, label: 'the crashing shoreline' },
    ],
    critterSpawns: [
      { type: 'seagull', x: 22, z: 8 }, { type: 'seagull', x: 30, z: -6 },
      { type: 'seagull', x: 16, z: -26 }, { type: 'seagull', x: 8, z: 30 },
      { type: 'crab', x: -6, z: 14 }, { type: 'crab', x: -18, z: 2 }, { type: 'crab', x: 2, z: -10 },
      { type: 'butterfly', x: -14, z: 30 },
      { type: 'villager', x: 18, z: 16 }, { type: 'villager', x: 32, z: -10 },
    ],
    moments: [
      { id: 'gull-heist', label: 'a seagull stealing someone’s sandwich!', x: 18, z: 14, from: { x: 30, z: -6 } },
      { id: 'crab-race', label: 'two crabs racing across the boardwalk', x: 20, z: 0, from: { x: -6, z: 14 } },
    ],
    puddles: [],
    skyDusk: { top: 0x22304e, horizon: 0x7a5a6e },
  };
}
```

- [ ] **Step 2: Register the area in src/main.js**

```js
import * as seaside from './world/seaside.js';
// ...
const AREAS = { neighborhood, park, seaside };
```

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`
Expected: sandy beach with the sea to the east, boardwalk and pier, three bobbing-still boats, a cliff wall you cannot walk through with an overlook block, seagulls that flee bigger, crabs side-stepping, fish collectibles, pier-end and overlook scenic awards. No console errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add Seaside area"
```

---

### Task 14: Accessory perks and breed specials

**Files:**
- Modify: `src/critters.js` (trailing butterflies, spottable fireflies), `src/main.js` (perk wiring)

**Interfaces:**
- Consumes: equipped accessory ids from `progression.state.equipped`, `PERSONALITIES[breed].special`, `log.award/awardOnce` (perk type), `critters` opts.
- Produces: `createCritters` opts gains `trailButterflies: boolean`; all six accessory perks + keenNose/pouncer/napper specials live.

- [ ] **Step 1: Extend src/critters.js**

In `createCritters`, make fireflies spottable (they are a dusk discovery) — change the `spottable` line to:

```js
      spottable: true,
```

And after the firefly spawn block, add trailing butterflies:

```js
  if (opts.trailButterflies) {
    for (let i = 0; i < 2; i++) {
      const c = spawn({ type: 'butterfly', x: 0, z: 0 });
      c.trail = true; // butterfly wander centers on the cat (see update)
    }
  }
```

- [ ] **Step 2: Wire perks in src/main.js**

In `startWalk`, replace the critters creation with:

```js
    const equipped = state.equipped;
    const critters = createCritters(scene, areaData.critterSpawns, {
      fleeScale: equipped.collar === 'bell' ? 0.5 : 1,        // bell: birds tolerate you closer
      spawnFireflies: duskMode && equipped.collar === 'glow', // glow: dusk fireflies
      trailButterflies: equipped.outfit === 'crown',           // crown: butterflies trail the cat
    });
```

After the area build in `startWalk`, apply dusk sky when active:

```js
    if (duskMode && equipped.collar === 'glow') {
      const { top, horizon } = areaData.skyDusk;
      scene.background = new THREE.Color(top);
      scene.fog = new THREE.Fog(horizon, 30, 110);
      sun.intensity = 0.7;
    }
```

Backpack — in the session creation, replace the walk line:

```js
      walk: { carried: 0, carryCap: equipped.outfit === 'backpack' ? 3 : 2 },
```

Bandana — subscribe once in `init()` beside the other bus handlers:

```js
  bus.on('villager:wave', ({ id }) => {
    if (session && progression.state.equipped.outfit === 'bandana') {
      log.award('perk', `wave-${id}`, 'a friendly wave back');
    }
  });
  bus.on('cat:pounce', () => {
    if (session) log.award('perk', 'pounce', 'a perfect pounce!');
  });
```

Booties — add a puddle check inside `updateCat`, after the cat moves (needs a per-session balk memory; add `balkedPuddles: new Set()` to the session object):

```js
    for (const pd of s.areaData.puddles) {
      const inPuddle = Math.hypot(pd.x - cat.position.x, pd.z - cat.position.z) < pd.r + 0.2;
      if (!inPuddle) continue;
      const key = `puddle-${pd.x}-${pd.z}`;
      if (progression.state.equipped.outfit === 'booties') {
        log.awardOnce('perk', key, 'a joyful puddle splash');
      } else if (p.special !== 'steady' && !s.balkedPuddles.has(key)) {
        s.balkedPuddles.add(key);
        brain.set('follow', 2);
        hud.toast('Your cat balks at the puddle! 💦');
      }
    }
```

KeenNose (Tabby) — hidden collectibles only glow when you're close; Tabby senses them from farther. In `updateInteractions`, at the top:

```js
    const reveal = PERSONALITIES[s.cat.userData.breed].special === 'keenNose' ? 14 : 7;
    for (const [id, m] of s.collectibleMeshes) {
      const c = s.areaData.collectibles.find((x) => x.id === id);
      m.visible = Math.hypot(c.x - camera.position.x, c.z - camera.position.z) < reveal;
    }
```

Napper (Persian) — bonus on sleepy pets. In `handleInteract`, replace the pet branch:

```js
    } else if (s.prompt.kind === 'pet') {
      const wasNapping = s.brain.state === 'nap';
      if (s.brain.pet()) {
        log.award('pet', 'pet', 'a rumbling purr');
        if (wasNapping && PERSONALITIES[s.cat.userData.breed].special === 'napper') {
          log.award('perk', 'nap-pet', 'a deep sleepy purr');
        }
      }
    }
```

- [ ] **Step 3: Run the unit tests (regression check)**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Verify each perk in the browser**

Run: `npm run dev`. Unlock/equip via play (or temporarily set points by editing the save in devtools, then "Start over" when done). Check:
- Bell: you can walk visibly closer to birds before they flee.
- Glow + dusk toggle: darker sky, 8 glowing fireflies, spotting them awards points.
- Bandana: villager waves now award "+3 a friendly wave back".
- Booties: walking the cat through a puddle awards a splash; without booties most cats balk with a toast (Maine Coon doesn't).
- Backpack: three collectibles per walk instead of two.
- Crown: two butterflies loop around the cat; a Calico eventually pounces one for bonus points.
- Tabby: yarn balls appear from much farther than with other cats.
- Persian: petting it mid-nap gives the extra sleepy-purr award.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire all accessory perks and breed specials"
```

---

### Task 15: Audio, polish, and release check

**Files:**
- Create: `src/audio.js`, `README.md`
- Modify: `src/main.js` (audio wiring)

**Interfaces:**
- Produces: `createAudio() -> audio` with `meow()`, `purr()`, `bell()`, `chime()`, `bark()`, `startAmbient(areaKey)`, `stopAmbient()`, `toggleMute() -> muted`. All synthesized via WebAudio — the context is created lazily on first use (satisfies the browser user-gesture rule since walks start from a click).
- Consumes: bus events, session state.

- [ ] **Step 1: Implement src/audio.js**

```js
export function createAudio() {
  let ctx = null;
  let muted = false;
  let ambient = null;

  function ensure() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function tone(freq, dur, { type = 'sine', gain = 0.12, slideTo = null, delay = 0 } = {}) {
    if (muted) return;
    const ac = ensure();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    const t0 = ac.currentTime + delay;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  const api = {
    toggleMute() {
      muted = !muted;
      if (muted) api.stopAmbient();
      return muted;
    },
    meow() {
      tone(520, 0.22, { type: 'square', gain: 0.05, slideTo: 780 });
      tone(760, 0.25, { type: 'square', gain: 0.04, slideTo: 430, delay: 0.2 });
    },
    purr() {
      for (let i = 0; i < 8; i++) tone(72, 0.06, { type: 'sawtooth', gain: 0.07, delay: i * 0.08 });
    },
    bell() {
      tone(1800, 0.14, { gain: 0.045 });
      tone(2400, 0.1, { gain: 0.03, delay: 0.02 });
    },
    chime() {
      tone(880, 0.12, { gain: 0.07 });
      tone(1320, 0.18, { gain: 0.07, delay: 0.1 });
    },
    bark() {
      tone(230, 0.12, { type: 'sawtooth', gain: 0.09, slideTo: 140 });
      tone(210, 0.12, { type: 'sawtooth', gain: 0.09, slideTo: 120, delay: 0.18 });
    },
    startAmbient(areaKey) {
      if (muted) return;
      const ac = ensure();
      api.stopAmbient();
      if (areaKey === 'seaside') {
        // filtered looping noise swelled by an LFO = waves
        const size = ac.sampleRate * 2;
        const buffer = ac.createBuffer(1, size, ac.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
        const src = ac.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        const filter = ac.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        const g = ac.createGain();
        g.gain.value = 0.05;
        const lfo = ac.createOscillator();
        const lfoGain = ac.createGain();
        lfo.frequency.value = 0.14;
        lfoGain.gain.value = 0.035;
        lfo.connect(lfoGain).connect(g.gain);
        src.connect(filter).connect(g).connect(ac.destination);
        src.start();
        lfo.start();
        ambient = { stop: () => { src.stop(); lfo.stop(); } };
      } else {
        // occasional distant birdsong
        const id = setInterval(() => {
          if (!muted && Math.random() < 0.45) {
            tone(1500 + Math.random() * 700, 0.1, { gain: 0.025, slideTo: 1900 });
            tone(1700 + Math.random() * 500, 0.08, { gain: 0.02, delay: 0.14 });
          }
        }, 2600);
        ambient = { stop: () => clearInterval(id) };
      }
    },
    stopAmbient() {
      if (ambient) {
        ambient.stop();
        ambient = null;
      }
    },
  };
  return api;
}
```

- [ ] **Step 2: Wire audio into src/main.js**

In `init()`:

```js
import { createAudio } from './audio.js';

  const audio = createAudio();

  bus.on('discovery', () => audio.chime());       // merge with the existing setPoints handler
  bus.on('critter:scare', () => { if (session) audio.bark(); }); // add beside the scare handler
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') hud.toast(audio.toggleMute() ? 'Sound off 🔇' : 'Sound on 🔊');
  });
```

In `startWalk`, at the end: `audio.meow(); audio.startAmbient(state.area);`
In `endWalk`: `audio.stopAmbient();`
In `handleInteract`, when a pet succeeds: `audio.purr();`
In `updateCat`, bell jingle while a bell-collared cat trots (put after `animateCat`):

```js
    if (progression.state.equipped.collar === 'bell' && speed > 1 && Math.random() < dt * 1.6) {
      audio.bell();
    }
```

- [ ] **Step 3: Write README.md**

```markdown
# 🐈 Whisker Walk

A cozy first-person cat-walking game for your browser. Pick a cat, clip on the
leash, and wander — every bird spotted, yarn ball found, and purr earned pays
whisker points you can spend on new cats, accessories, and places to walk.

## Play

    npm install
    npm run dev

Open the printed localhost URL.

**Controls:** click to grab the mouse · WASD to walk · mouse to look ·
E to pet / pick up · M to mute · Esc to pause or end the walk.

## Develop

    npm test          # unit tests (Vitest)
    npm run build     # production build in dist/

Design spec: docs/superpowers/specs/2026-07-31-whisker-walk-design.md
```

- [ ] **Step 4: Full regression + build check**

Run: `npm test` — Expected: PASS (all suites).
Run: `npm run build` — Expected: clean build, no errors.

- [ ] **Step 5: Final playtest checklist (manual, in the browser)**

Run: `npm run dev` and verify end to end:
- [ ] Fresh start (use "Start over"): 0 points, Tabby only, Neighborhood only.
- [ ] Sound: meow on walk start, chime on discoveries, purr on pets, birdsong ambience; M mutes.
- [ ] Earn enough for the Siamese in ~2–3 walks (tune `AWARDS` values if far off — they are the single tuning knob).
- [ ] Siamese pulls hard toward birds and drags your speed; leash line sags and goes taut.
- [ ] Persian naps; sleepy pets give the bonus purr award.
- [ ] Dog bark spooks the Calico but not the Black Cat.
- [ ] Park unlock gate: needs 2 neighborhood walks AND 50 points; Seaside needs 2 park walks AND 100.
- [ ] Seaside: wave ambience, seagulls, crabs, pier + overlook scenics.
- [ ] All six accessories behave per Task 14's checklist.
- [ ] Reload mid-progress: points, unlocks, and equipped loadout survive.
- [ ] Performance: smooth (roughly 60fps) in all three areas; no console errors anywhere.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add synthesized audio, README, and final polish"
```

---

## Plan Self-Review Notes

- **Spec coverage:** all spec sections map to tasks — cats/personalities (4, 6), leash (7), areas (8, 12, 13), critters + scare events (9), discoveries/points/moments/scenics/petting (10), progression/save/shop (3, 11), accessories & specials (6, 14), audio (15), error handling (5, 11 — pointer-lock pause, WebGL guard; 3 — save resilience), testing (Vitest tasks 2, 3, 4, 10 + manual checklists).
- **Types:** interfaces are declared per task in the **Interfaces** blocks; later tasks consume exactly those names (`createBrain`, `PERSONALITIES`, `MAX_LEN`, `areaData` shape, `critters.nearest/catchAt/playMoment/dispose`, `log.award/awardOnce`, `session` fields).
- **Known simplifications (intentional, spec-compliant):** critter "line of sight" is distance + facing-dot, no raycast; leash never tangles on obstacles (spec: out of scope); boats/fountain water are static.


