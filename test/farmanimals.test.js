import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';

// The headless canvas stub every world test uses (test/farm.test.js).
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { build } = await import('../src/world/farm.js');
const { createFarmAnimals, NO_FARM, SIZE, FARM_ANIMAL_TYPES } = await import('../src/farmanimals.js');
const { COW, GOAT, clearance } = await import('../src/farmsim.js');
const { bestPerch, BASE_CLIMB_BUDGET, canReach } = await import('../src/climbing.js');
const { assignShadowCasters } = await import('../src/render/rig.js');
const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
const { SESSION_FIELDS } = await import('../src/game/session.js');
const { createInteractions } = await import('../src/game/interactions.js');
const { createDiscoveryLog, AWARDS } = await import('../src/discoveries.js');
const { createProgression } = await import('../src/progression.js');
const { labelFor } = await import('../src/game/labels.js');

const DT = 1 / 30;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// A Farm with its animals, a cat and the two things update() reads off the
// game: the player (speed, zoomies, water) and the session (perched, pounce).
function world(opts = {}) {
  const scene = new THREE.Scene();
  const area = build(scene);
  const events = [];
  const farm = createFarmAnimals(scene, area, { onEvent: (e) => events.push(e), isFree: (x, z) => isWalkableAt(area, x, z), ...opts });
  for (const p of farm.perches) area.perches.push(p); // as game/walk.js does
  const cat = new THREE.Object3D();
  cat.position.set(0, 0, 46);
  scene.add(cat);
  const player = { speed: 0, zooming: false, inWater: false, perchY: 0 };
  const session = { perched: null, pounceTime: 0 };
  let t = 0;
  const run = (seconds, each = () => {}) => {
    for (let s = 0; s < seconds; s += DT) { t += DT; farm.update(DT, t, { cat, player, session }); each(); }
  };
  // What game/interactions.js doPounceOrClimb does with the jump key or the paw button.
  const jump = () => {
    const next = bestPerch(area.perches, cat.position, player.perchY, session.perched, BASE_CLIMB_BUDGET, {});
    if (next) {
      session.perched = next;
      player.perchY = next.y;
      cat.position.set(next.x, next.y, next.z);
    } else if (session.perched) {
      session.perched = null;
      player.perchY = 0;
    }
    return next;
  };
  // What game/avatar.js does when the stick is pushed: lets go of the perch.
  const push = (dx, dz) => {
    session.perched = null;
    player.perchY = 0;
    cat.position.x += dx; cat.position.z += dz; // one frame of walking
    cat.position.y = 0;
  };
  return { scene, area, farm, events, cat, player, session, run, jump, push };
}

describe('the Farm\'s animals in the walk: what they cost to draw', () => {
  const w = world();
  w.scene.updateMatrixWorld(true);
  const groups = w.farm.groups;

  it('is a handful of meshes each, on one material, and almost none of them cast a shadow', () => {
    assignShadowCasters(w.scene);
    let meshes = 0;
    let casters = 0;
    let triangles = 0;
    const materials = new Set();
    const per = {};
    // (step 3: the farmer's hat in one goat's mouth is counted with the jobs' things, below)
    const jobThings = new Set();
    for (const x of w.farm.extras) x.traverse((o) => { if (o.isMesh) jobThings.add(o); });
    for (const g of groups) {
      let own = 0;
      let ownCast = 0;
      g.traverse((o) => {
        if (!o.isMesh || jobThings.has(o)) return;
        meshes++; own++;
        if (o.castShadow) { casters++; ownCast++; }
        materials.add(o.material);
        const geo = o.geometry;
        triangles += (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
      });
      const type = w.farm.spottable.find((s) => s.pos === g.position).type;
      per[type] = { meshes: own, casters: ownCast };
    }
    // one cat is about 31 shadow draws; ALL the Farm's animals together are 9.
    // The lifelike pass gave them parts that move (a jaw, ears, lids, a cow's
    // shins, a tail): 109 meshes where there were 63, inside its ceiling of 110.
    expect(per).toEqual({
      cow: { meshes: 15, casters: 2 }, farmgoat: { meshes: 10, casters: 1 }, sheepdog: { meshes: 11, casters: 1 },
      hen: { meshes: 5, casters: 0 }, chick: { meshes: 1, casters: 0 }, duckling: { meshes: 1, casters: 0 },
    });
    expect(materials.size).toBe(1);
    expect(meshes).toBe(109);
    expect(meshes).toBeLessThanOrEqual(110);
    expect(casters).toBe(9);
    // shaped, not boxed (farmshapes.js): 18,852 triangles (15,949 before the
    // lifelike pass, and the boxes were 13,342)
    expect(triangles).toBe(18852);
    // with the place itself (244 meshes / 176 casters / 53,419 triangles, test/budget.test.js)
    // that is far inside the territories' 450 meshes / 380 casters. Triangles: the
    // Farm's own ceiling for place + animals + the jobs' things is 75,000 (the
    // territories' 70,000 was borrowed here before the animals were shaped; the
    // Docks' scenery alone is 76,914).
    expect(244 + meshes).toBeLessThan(450);
    expect(176 + casters).toBeLessThan(380);
    expect(53419 + triangles).toBeLessThan(75000);
  });

  // Step 3: the jobs' and the finds' own things (the two straw hats, the
  // saucer, five mice, the barn cat and three kittens, the eggs, the owl, two
  // windfall apples). Measured 18 meshes, 0 casters, 2,618 triangles.
  it('the jobs and the finds add a few small meshes on the same material, and none casts', () => {
    assignShadowCasters(w.scene);
    const seen = new Set();
    let casters = 0;
    let triangles = 0;
    const materials = new Set();
    for (const x of w.farm.extras) {
      x.traverse((o) => {
        if (!o.isMesh || seen.has(o)) return;
        seen.add(o);
        if (o.castShadow) casters++;
        materials.add(o.material);
        const geo = o.geometry;
        triangles += (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
      });
    }
    // the cat's try-on hat is made with them and is in no scene until she wears it
    expect(seen.size).toBe(18);
    expect(casters).toBe(0);
    expect(triangles).toBe(2618);
    expect([...materials]).toEqual([groups[0].children[0].children[0].material]);
    // the place (244 meshes with the scarecrow's hat its own mesh / 176 / 53,419), the
    // animals (109 / 9 / 18,852) and these: inside 450 / 380 / 75,000
    expect(244 + 109 + seen.size).toBeLessThan(450);
    expect(176 + 9 + casters).toBeLessThan(380);
    expect(53419 + 18852 + triangles).toBeLessThan(75000);
  });

  it('shares one geometry between all the chicks and one between all the ducklings', () => {
    const geo = (type) => new Set(groups.filter((g) => w.farm.spottable.find((s) => s.pos === g.position).type === type).map((g) => g.children[0].geometry));
    expect(geo('chick').size).toBe(1);
    expect(geo('duckling').size).toBe(1);
  });

  it('stands every animal on the ground: feet at 0, nothing sunk, nothing floating', () => {
    const box = new THREE.Box3();
    for (const g of groups) {
      const s = w.farm.spottable.find((x) => x.pos === g.position);
      box.setFromObject(g);
      if (s.type === 'duckling') { expect(box.min.y, s.id).toBeLessThan(0.02); expect(box.min.y, s.id).toBeGreaterThan(-0.1); continue; }
      if (s.type === 'sheepdog') continue; // he starts lying down (checked below)
      expect(box.min.y, s.id).toBeGreaterThan(-0.03);
      expect(box.min.y, s.id).toBeLessThan(0.03);
    }
  });

  it('draws the cows so their backs are where the perch is, and big enough to walk under', () => {
    const box = new THREE.Box3();
    for (const cow of w.farm.sim.cows) {
      const view = w.farm.views.find((v) => v.a === cow);
      // the body alone (no horns, no head)
      box.setFromObject(view.parts.body.children[0]);
      expect(box.max.y, cow.id).toBeCloseTo(cow.perch.y, 1);
      expect(view.group.scale.x).toBeCloseTo(cow.scale * COW.SIZE, 9);
    }
    expect(SIZE.cow).toBe(COW.SIZE);
    expect(COW.BACK_Y).toBeLessThanOrEqual(BASE_CLIMB_BUDGET.climb);
  });

  it('gives every animal its place in the list the journal and the camera read', () => {
    expect(w.farm.spottable).toHaveLength(w.farm.sim.all.length);
    expect(new Set(w.farm.spottable.map((s) => s.type))).toEqual(new Set(FARM_ANIMAL_TYPES));
    for (const s of w.farm.spottable) expect(s.pos.isVector3).toBe(true);
  });
});

describe('riding a cow, as the game drives it', () => {
  it('the jump puts the cat on her back, she is carried as the cow walks, and getting off puts her down beside the cow', () => {
    const w = world();
    const cow = w.farm.sim.cows[0];
    w.run(1);
    // beside her: the jump (Space, or the paw button) picks her back
    w.cat.position.set(cow.x - 1.6, 0, cow.z + 0.3);
    expect(canReach(cow.perch, w.cat.position, 0)).toBe(true);
    expect(w.jump()).toBe(cow.perch);
    w.run(DT);
    expect(w.farm.riding).toBe(cow.id);
    expect(w.events.filter((e) => e.type === 'ride')).toEqual([{ type: 'ride', id: cow.id }]);

    // carried for two minutes
    const from = { x: cow.x, z: cow.z };
    let turned = 0;
    let lastYaw = w.cat.rotation.y;
    w.run(120, () => {
      expect(w.cat.position.x).toBe(cow.x);
      expect(w.cat.position.z).toBe(cow.z);
      expect(w.player.perchY).toBe(cow.perch.y); // her height is the perch's: nothing else moves it
      expect(clearance(w.area.colliders, w.cat.position.x, w.cat.position.z)).toBeGreaterThan(CAT_RADIUS);
      turned += Math.abs(w.cat.rotation.y - lastYaw);
      lastYaw = w.cat.rotation.y;
    });
    expect(dist(cow, from)).toBeGreaterThan(1);
    expect(turned).toBeGreaterThan(0.3); // she turns with the cow
    expect(w.events.filter((e) => e.type === 'ride')).toHaveLength(1);

    // the stick is pushed toward the cow's left: off she gets, on that side
    const left = { x: -Math.cos(cow.yaw), z: Math.sin(cow.yaw) };
    w.push(left.x * 0.05, left.z * 0.05);
    w.run(DT);
    expect(w.farm.riding).toBe(null);
    expect(w.events.filter((e) => e.type === 'dismount')).toEqual([{ type: 'dismount', id: cow.id }]);
    const off = { x: w.cat.position.x - cow.x, z: w.cat.position.z - cow.z };
    expect(Math.hypot(off.x, off.z)).toBeGreaterThan(0.8);
    expect(Math.hypot(off.x, off.z)).toBeLessThan(4.2);
    expect(isWalkableAt(w.area, w.cat.position.x, w.cat.position.z)).toBe(true);
    expect(clearance(w.area.colliders, w.cat.position.x, w.cat.position.z)).toBeGreaterThanOrEqual(CAT_RADIUS);
    // and she is left alone there: the cow does not drag her along afterwards
    const there = w.cat.position.clone();
    w.run(20);
    expect(w.cat.position.x).toBe(there.x);
    expect(w.cat.position.z).toBe(there.z);
  });

  it('the jump key again hops her down beside the cow', () => {
    const w = world();
    const cow = w.farm.sim.cows[1];
    w.cat.position.set(cow.x + 1.5, 0, cow.z);
    expect(w.jump()).toBe(cow.perch);
    w.run(3);
    // nothing else is in reach from her back, so the same key is "hop down"
    expect(w.jump()).toBe(null);
    expect(w.session.perched).toBe(null);
    w.run(DT);
    expect(w.farm.riding).toBe(null);
    expect(dist(w.cat.position, cow)).toBeGreaterThan(0.8);
    expect(isWalkableAt(w.area, w.cat.position.x, w.cat.position.z)).toBe(true);
  });

  it('a hop from her back to another perch is left where that perch is', () => {
    const w = world();
    const cow = w.farm.sim.cows[0];
    w.cat.position.set(cow.x + 1.5, 0, cow.z);
    w.jump();
    w.run(1);
    // (what interactions.js does for a perch-to-perch hop)
    const other = { x: cow.x + 1.2, z: cow.z, y: 1.2, kind: 'fence' };
    w.session.perched = other;
    w.cat.position.set(other.x, other.y, other.z);
    w.run(1);
    expect(w.farm.riding).toBe(null);
    expect(w.cat.position.x).toBe(other.x);
    expect(w.cat.position.z).toBe(other.z);
  });

  it('rides the calf too, and from cow to cow', () => {
    const w = world();
    const calf = w.farm.sim.cows[2];
    w.cat.position.set(calf.x + 0.9, 0, calf.z);
    expect(w.jump()).toBe(calf.perch);
    w.run(2);
    expect(w.farm.riding).toBe(calf.id);
    expect(w.cat.position.x).toBe(calf.x);
  });

  it('a cow has no collider: the cat walks under her and is never moved by her', () => {
    const w = world();
    const before = w.area.colliders.length;
    const again = world();
    expect(again.area.colliders.length).toBe(before);
    const cow = w.farm.sim.cows[0];
    // standing right under her for a minute
    w.cat.position.set(cow.x, 0, cow.z);
    const at = w.cat.position.clone();
    w.run(60);
    expect(w.cat.position.equals(at)).toBe(true);
    expect(isWalkableAt(w.area, at.x, at.z)).toBe(true);
  });

  it('ends cleanly with the walk, riding or not', () => {
    const w = world();
    const cow = w.farm.sim.cows[0];
    w.cat.position.set(cow.x + 1.5, 0, cow.z);
    w.jump();
    w.run(2);
    const n = w.scene.children.length;
    // (step 3: the jobs' and finds' things that stand in the scene go with them)
    const things = w.farm.extras.filter((o) => o.parent === w.scene).length;
    expect(things).toBeGreaterThan(10);
    expect(() => w.farm.dispose()).not.toThrow();
    expect(w.scene.children.length).toBe(n - w.farm.sim.all.length - things);
    expect(w.farm.riding).toBe(null);
    expect(() => w.farm.dispose()).not.toThrow();
  });
});

describe('the rest of what the game hears from them', () => {
  it('a meow near a cow gets a moo', () => {
    const w = world();
    const cow = w.farm.sim.cows[0];
    expect(w.farm.reactToMeow({ x: cow.x + 2, z: cow.z })).toBe(cow);
    expect(w.events).toEqual([{ type: 'moo', id: cow.id }]);
    w.run(1);
    expect(w.events.filter((e) => e.type === 'moo')).toHaveLength(1); // once, not once a frame
    expect(w.farm.reactToMeow({ x: 0, z: 46 })).toBe(null);
  });

  it('the goat\'s head-butt moves the cat a nudge, and not at all where she may not stand', () => {
    for (const free of [true, false]) {
      const w = world({ isFree: () => free });
      w.cat.position.set(-31, 0, -22);
      const at = w.cat.position.clone();
      let moved = 0;
      let butts = 0;
      w.run(40, () => {
        const d = Math.hypot(w.cat.position.x - at.x, w.cat.position.z - at.z);
        if (d > 0) { moved += d; butts++; at.copy(w.cat.position); }
      });
      if (free) {
        expect(butts).toBeGreaterThanOrEqual(1);
        expect(moved / butts).toBeLessThanOrEqual(GOAT.NUDGE + 1e-9);
      } else {
        expect(moved).toBe(0);
      }
      expect(w.events.some((e) => e.type === 'goat-butt')).toBe(true);
    }
  });

  it('a pounce or a hop up near the goats is a jump they copy', () => {
    const w = world();
    const g = w.farm.sim.goats[0];
    g.timer = 999;
    w.cat.position.set(g.x + 6.4, 0, g.z); // outside the fence: no hello, just the hop
    w.run(1);
    w.session.pounceTime = 0.3;
    w.run(0.3);
    w.session.pounceTime = 0;
    w.run(2);
    expect(w.events.filter((e) => e.type === 'goat-copy' && e.id === g.id)).toHaveLength(1);
  });

  it('the ducklings are told where the pond\'s ducks are', () => {
    const duck = { x: -31, z: 33 };
    const w = world({ ducks: () => [duck] });
    w.run(30);
    for (const k of w.farm.sim.ducklings) expect(dist(k, duck)).toBeLessThan(3);
  });

  it('anywhere but the Farm there is nothing, and it does nothing', () => {
    expect(NO_FARM.spottable).toEqual([]);
    expect(NO_FARM.perches).toEqual([]);
    expect(NO_FARM.groups).toEqual([]);
    expect(NO_FARM.riding).toBe(null);
    expect(() => { NO_FARM.update(1, 1, {}); NO_FARM.dispose(); }).not.toThrow();
    expect(NO_FARM.reactToMeow({ x: 0, z: 0 })).toBe(null);
  });
});

describe('wired into the game', () => {
  const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

  it('the walk builds them for the Farm only, adds the cows\' backs to the perches, and frees them at the end', () => {
    const walk = read('game/walk.js');
    expect(walk).toMatch(/areaId !== 'farm' \? NO_FARM : createFarmAnimals\(/);
    expect(walk).toMatch(/for \(const p of farm\.perches\) areaData\.perches\.push\(p\)/);
    expect(walk).toMatch(/session\.farm\?\.dispose\(\)/);
    // built before the caster sweep, so the parts flagged noCast are honoured
    expect(walk.indexOf('createFarmAnimals(scene')).toBeLessThan(walk.indexOf('assignShadowCasters(scene)'));
    expect(SESSION_FIELDS).toContain('farm');
    // their dice are their own: never the walk's stream
    const call = walk.slice(walk.indexOf('createFarmAnimals(scene'), walk.indexOf('for (const p of farm.perches)'));
    expect(call).not.toMatch(/walkRng|Math\.random/);
  });

  it('the frame loop moves them after the player, and a meow reaches them', () => {
    const main = read('main.js');
    expect(main.indexOf('session.farm.update(')).toBeGreaterThan(main.indexOf('player.update(dt, session.areaData.colliders'));
    expect(read('game/interactions.js')).toMatch(/session\.farm\?\.reactToMeow\(session\.cat\.position\)/);
    expect(read('game/netevents.js')).toMatch(/s\.farm\?\.reactToMeow\(pos\)/);
  });

  it('nothing about them goes on the wire or into the save', () => {
    for (const file of ['farmsim.js', 'farmanimals.js', 'farmmodels.js']) {
      const src = read(file).split('\n').filter((line) => !line.trim().startsWith('//')).map((line) => line.replace(/\/\/.*$/, '')).join('\n');
      expect(src, file).not.toMatch(/sendEvent|net\.|localStorage|progression|cloud/);
      expect(src, file).not.toMatch(/Math\.random/);
    }
  });

  it('a cat on a cow sits, and naps there after lying still as long as an idle nap takes', () => {
    expect(read('game/avatar.js')).toMatch(/else if \(s\.perched\) pose = s\.perched\.ride && s\.idleTime > napAt \? 'nap' : 'perch';/);
  });

  // The real updateInteractions against a real progression: looking at an
  // animal from 6 m is its journal page and one critter award a walk for each
  // KIND of animal.
  it('meeting each kind of animal fills its journal page once a walk and pays one critter award', () => {
    const map = new Map();
    const progression = createProgression({ getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) });
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const w = world();
    const session = {
      areaId: 'farm', walkStamp: 'walk-0',
      cat: { position: new THREE.Vector3(0, 0, 46), userData: { breed: 'tabby' } },
      areaData: { collectibles: [], scenics: [] },
      collectibleMeshes: new Map(),
      critters: { list: [], dismayNear() {} },
      farm: w.farm,
      strayCats: { strays: [], nearest: () => null },
      ghosts: { list: [], nearest: () => null },
      remotes: { nearest: () => null },
      secrets: { list: [] },
      tippables: { nearest: () => null, list: [] },
      scent: { nearestMound: () => null },
      goldMice: null, race: { promptAt: () => null }, kittenEnc: null,
      quest: null, questGiver: null, questObject: null, gifts: null,
      perched: null, freezeTime: 0, catsGreeted: 0, walk: { carried: 0, carryCap: 2 },
      fx: { burst() {} }, prompt: null, lastPromptKind: null,
    };
    let facing = new THREE.Vector3(0, 0, -1);
    const api = createInteractions({
      MP: 1, pid: 'me', getCloud: () => null, getPsecret: () => null,
      getSession: () => session, getIsTouch: () => false,
      player: { forward: () => facing, perchY: 0, halt() {} },
      progression, log,
      hud: { toast() {}, setPrompt() {}, setPoints() {} },
      audio: { trill() {}, meow() {}, hiss() {}, fanfare() {} },
      catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
    });
    // far from everything: nothing
    api.updateInteractions(session);
    expect(progression.state.points).toBe(0);
    // walk up to each animal in turn, looking at it
    for (const s of w.farm.spottable) {
      session.cat.position.set(s.pos.x, 0, s.pos.z + 3);
      facing = new THREE.Vector3(0, 0, -1);
      api.updateInteractions(session);
      api.updateInteractions(session);
    }
    for (const type of FARM_ANIMAL_TYPES) expect(progression.state.journal[type], type).toBe(1);
    // six kinds (others stand near one another, so no more than these six)
    expect(progression.state.points).toBe(FARM_ANIMAL_TYPES.length * AWARDS.critter);
    expect(log.entries().map(([key]) => key).sort()).toEqual(FARM_ANIMAL_TYPES.map((t) => `spot-farm-${t}`).sort());
    // with her back to one, it is not met
    const fresh = createDiscoveryLog(progression);
    fresh.startWalk();
    const api2 = createInteractions({
      MP: 1, pid: 'me', getCloud: () => null, getPsecret: () => null,
      getSession: () => session, getIsTouch: () => false,
      player: { forward: () => new THREE.Vector3(0, 0, 1), perchY: 0, halt() {} },
      progression, log: fresh,
      hud: { toast() {}, setPrompt() {}, setPoints() {} },
      audio: { trill() {}, meow() {}, hiss() {}, fanfare() {} },
      catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
    });
    const cow = w.farm.sim.cows[0];
    session.cat.position.set(cow.x, 0, cow.z + 3);
    api2.updateInteractions(session);
    expect(progression.state.journal.cow).toBe(1);
  });
});
