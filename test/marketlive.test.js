import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { marketRig, buildSquare } from './helpers/marketrig.js';

// =============================================================================
// The Market's life (step 2): the stallholders behind their counters, turning
// to the back shelf in their own rhythm, the "busy" bubble over each stall's
// roof (Task 11). Task 12 adds everything a cat does; Tasks 13 and 14 the walk and
// the film. Positions come from the plan (marketplan.js), the rhythm from the
// rules (marketrules.js): nothing here is hard-coded.
// =============================================================================

const { createMarketLive } = await import('../src/marketlive.js');
const { marketFigure, personKeeper } = await import('../src/marketkeeper.js');
const { createPeopleKit } = await import('../src/people/index.js');
const { TREAT_ITEM_PREFIX, treatItemId, treatStallOf, NO_MARKET } = await import('../src/marketnone.js');
const { STALLS, TREAT_STALLS, stallById, toStall, fromStall, MARKET_SPAWN, MARKET_REGISTRATION, stallClimb } = await import('../src/world/marketplan.js');
const { MARKET, STALL_TIMES, stallOffsets, stallPhase, periodOf } = await import('../src/marketrules.js');
const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
const { TREAT_WORDS } = await import('../src/marketwords.js');
const { assignShadowCasters } = await import('../src/render/rig.js');
const { createContactShadows } = await import('../src/render/contactshadows.js');
const { AREA_LOADERS, AREA_ENTRY_MODULES } = await import('../src/world/areas.js');
const { ZOOM_STEPS, DEFAULT_ZOOM_STEP, cameraPullScale, MIN_CAMERA_Y } = await import('../src/camzoom.js');
const { cameraOffset } = await import('../src/catcam.js');
const { DEFAULT_PITCH } = await import('../src/player.js');
const { CAT_LOOK_Y } = await import('../src/cat/model.js');

const DT = 1 / 30;
const KEEPER_IDS = STALLS.filter((s) => s.keeper).map((s) => s.id);
const SERVE_IDS = STALLS.filter((s) => s.kind === 'serve').map((s) => s.id);
// which way a keeper's group faces: its local +z (marketkeeper.js's contract)
const frontOf = (group) => new THREE.Vector3(0, 0, 1).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion()));
const faceDot = (group, s) => { const f = frontOf(group); return f.x * s.face.x + f.z * s.face.z; };

describe('the treat ids and the no-market stand-in (marketnone.js)', () => {
  it('know the five treats and nothing else', () => {
    const ids = [...TREAT_STALLS, 'cafe'];
    for (const id of ids) {
      expect(treatItemId(id)).toBe(`${TREAT_ITEM_PREFIX}${id}`);
      expect(treatStallOf(treatItemId(id))).toBe(id);
    }
    expect(TREAT_ITEM_PREFIX).toBe('market-treat-');
    for (const bad of ['market-treat-flowers', 'market-treat-fruit', 'market-treat-__proto__', '__proto__', 'market-treat-',
      'market-treat-constructor', 'sock', '', null, undefined, 3, {}]) {
      expect(treatStallOf(bad), String(bad)).toBeNull();
    }
    expect(NO_MARKET.stalls).toEqual([]);
    expect(NO_MARKET.treats).toBeNull();
    expect(NO_MARKET.actionFor({})).toBeNull();
    expect(NO_MARKET.act({}, {}, {})).toBe(false);
    expect(NO_MARKET.remotePick({}, 'market-treat-fish')).toBe(false);
    expect(Object.isFrozen(NO_MARKET)).toBe(true);
    expect(() => { NO_MARKET.update(); NO_MARKET.restore(); NO_MARKET.dispose(); }).not.toThrow();
  });

  it('NO_MARKET has everything a caller reads of the live one, of the same kind', () => {
    const r = marketRig();
    for (const [k, v] of Object.entries(r.live)) {
      expect(Object.hasOwn(NO_MARKET, k), k).toBe(true);
      if (k === 'treats') { expect(NO_MARKET.treats).toBeNull(); continue; }
      expect(typeof NO_MARKET[k], k).toBe(typeof v);
      expect(Array.isArray(NO_MARKET[k]), k).toBe(Array.isArray(v));
    }
    expect(NO_MARKET.groups).toEqual([]);
    expect(NO_MARKET.keepers).toEqual({});
    r.live.dispose();
  });

  it("the Market's loader hands over its life", async () => {
    const pack = await AREA_LOADERS.market();
    expect(pack.life.createMarketLive).toBe(createMarketLive);
    expect(AREA_ENTRY_MODULES.market).toContain('src/marketlive.js');
  });
});

describe('the stallholders (Task 11)', () => {
  it('each stallholder stands behind its counter, where no cat can stand', () => {
    const r = marketRig();
    r.step(DT);
    expect(Object.keys(r.live.keepers).sort()).toEqual([...KEEPER_IDS].sort());
    expect(KEEPER_IDS).toHaveLength(6);
    expect(r.live.keepers.cafe).toBeUndefined(); // nobody watches the café's crumbs
    for (const id of KEEPER_IDS) {
      const s = stallById(id);
      const { group } = r.live.keepers[id];
      const p = group.getWorldPosition(new THREE.Vector3());
      expect(p.x, id).toBeCloseTo(r.area.keepers[id].x, 9);
      expect(p.z, id).toBeCloseTo(r.area.keepers[id].z, 9);
      expect(p.y, id).toBe(0);
      const { lx, lz } = toStall(s, p.x, p.z);
      expect(Math.abs(lx), id).toBeLessThan(s.w / 2);
      expect(lz, id).toBeLessThan(s.d / 2); // behind the counter's front line
      expect(lz, id).toBeGreaterThan(-s.d / 2); // in front of the back shelf
      expect(isWalkableAt(r.area, p.x, p.z), id).toBe(false);
      // a person's height (what shows: the broom in the hand is hidden until a shoo)
      const box = shownBox(group);
      expect(box.max.y - box.min.y, id).toBeGreaterThan(1.5);
      expect(box.max.y - box.min.y, id).toBeLessThan(1.9);
    }
    // the stalls the life knows: the four guarded treats and the café's crumbs
    expect(r.live.stalls.map((s) => s.id)).toEqual([...TREAT_STALLS, 'cafe']);
    for (const s of r.live.stalls) {
      for (const k of ['id', 'phase', 'watching', 'bubble', 'cooing', 'shooT', 'treatOut', 'refillT']) expect(s, `${s.id}.${k}`).toHaveProperty(k);
      expect(s.cooing).toBeNull();
      expect(s.treatOut).toBe(true);
    }
    const cafe = r.stall('cafe');
    expect(cafe.watching).toBe(false);
    expect(cafe.bubble).toBe(false);
    r.live.dispose();
  });

  it('the stallholder turns to the back shelf when the rhythm says, and back again', () => {
    const r = marketRig({ seed: 11, clock: 5e8 });
    const offsets = stallOffsets(11);
    const look = {};
    for (const id of TREAT_STALLS) {
      const s = stallById(id);
      const { group } = r.live.keepers[id];
      const seen = [];
      let worst = 0;
      const frames = Math.ceil(periodOf(id) / DT) + 30;
      for (let i = 0; i < frames; i++) {
        r.step(DT);
        stallPhase(id, offsets[id], r.clock, look);
        worst = Math.max(worst, Math.abs(faceDot(group, s) - Math.cos(look.facing * Math.PI)));
        if (seen[seen.length - 1] !== look.phase) seen.push(look.phase);
        if (look.phase === 'serve' || look.phase === 'busy') expect(faceDot(group, s), `${id} ${look.phase}`).toBeGreaterThan(0.999999);
        if (look.phase === 'away') expect(faceDot(group, s), `${id} away`).toBeLessThan(-0.999999);
        expect(r.stall(id).phase).toBe(look.phase);
        expect(r.stall(id).watching).toBe(look.watching);
      }
      expect(worst, id).toBeLessThan(1e-9);
      // round the whole cycle: serving, busy, the turn, away, the turn back
      const cycle = ['serve', 'busy', 'turn', 'away', 'back'];
      const start = cycle.indexOf(seen[0]);
      for (let k = 0; k < 5; k++) expect(seen[k], id).toBe(cycle[(start + k) % 5]);
      // halfway through the turn they are side-on to the counter
      const s0 = r.clock;
      for (let c = s0; c < s0 + periodOf(id); c += 0.01) {
        stallPhase(id, offsets[id], c, look);
        if (look.phase === 'turn' && Math.abs(look.k - 0.5) < 0.02) {
          r.setClock(c - DT);
          r.step(DT);
          expect(Math.abs(faceDot(group, s)), id).toBeLessThan(0.1);
          break;
        }
      }
    }
    // the two serve-only stallholders face front all the while, and serve
    for (const id of SERVE_IDS) {
      const s = stallById(id);
      const { group, arm } = r.live.keepers[id];
      const swings = new Set();
      for (let i = 0; i < 120; i++) {
        r.step(DT);
        expect(faceDot(group, s), id).toBeGreaterThan(0.999999);
        swings.add(arm.rotation.z.toFixed(3));
      }
      expect(swings.size, `${id}'s serving sway`).toBeGreaterThan(10);
      expect(r.live.keepers[id].bubble).toBeNull();
      expect(r.live.keepers[id].broom).toBeNull();
    }
    r.live.dispose();
  });

  it('the bubble is up exactly when the rhythm says', () => {
    const r = marketRig({ seed: 3, clock: 2e9, reducedMotion: true });
    const offsets = stallOffsets(3);
    const look = {};
    const ups = Object.fromEntries(TREAT_STALLS.map((id) => [id, 0]));
    const heights = Object.fromEntries(TREAT_STALLS.map((id) => [id, new Set()]));
    const frames = Math.ceil(Math.max(...TREAT_STALLS.map(periodOf)) / DT) + 10;
    for (let i = 0; i < frames; i++) {
      r.step(DT);
      for (const id of TREAT_STALLS) {
        const { bubble } = r.live.keepers[id];
        stallPhase(id, offsets[id], r.clock, look);
        expect(bubble.visible, `${id} ${look.phase}`).toBe(look.bubble);
        expect(r.stall(id).bubble).toBe(look.bubble);
        if (bubble.visible) ups[id]++;
        heights[id].add(bubble.position.y.toFixed(6));
      }
    }
    for (const id of TREAT_STALLS) {
      expect(ups[id], id).toBeGreaterThan(0);
      const { group, bubble } = r.live.keepers[id];
      const s = stallById(id);
      // 0.6 m in front of the stallholder, toward the counter: 0.5 m wide, its
      // middle 0.35 m over the top of the stall's roof and sign, and over the stallholder's crown
      expect(bubble.isSprite).toBe(true);
      expect(bubble.scale.x).toBeCloseTo(0.5, 9);
      const { lx, lz } = toStall(s, bubble.position.x, bubble.position.z);
      const kl = toStall(s, r.area.keepers[id].x, r.area.keepers[id].z);
      expect(lx, id).toBeCloseTo(kl.lx, 9);
      expect(lz - kl.lz, id).toBeCloseTo(0.6, 9);
      expect(bubble.position.y - r.area.keepers[id].roof, id).toBeCloseTo(0.35, 9);
      expect(bubble.position.y - 0.25, `${id}: its bottom over the crown`).toBeGreaterThan(shownBox(group).max.y);
      // and the roof is the stall's: nothing of the awning or the sign above it
      // over the counter (the back post that holds the bunting is the stall's one taller thing)
      const stallTop = topOver(r.scene, id, s);
      expect(r.area.keepers[id].roof, id).toBeGreaterThanOrEqual(stallTop - 1e-6);
      expect(r.area.keepers[id].roof, id).toBeLessThan(stallTop + 0.05);
      expect(bubble.renderOrder).toBeGreaterThan(0);
      expect(bubble.material.depthTest).toBe(true);
      expect(heights[id].size, `${id}: reduced motion, no bob`).toBe(1);
      expect(bubble.material.transparent).toBe(true);
      expect(bubble.material.map).toBeTruthy();
    }
    // one material for all four
    expect(new Set(TREAT_STALLS.map((id) => r.live.keepers[id].bubble.material)).size).toBe(1);
    r.live.dispose();
    // without reduced motion it bobs, gently
    const b = marketRig({ seed: 3, clock: 2e9, scene: r.scene, area: r.area });
    const ys = [];
    for (let i = 0; i < 90; i++) { b.step(DT); ys.push(b.live.keepers.fish.bubble.position.y); }
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.01);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.12);
    b.live.dispose();
  });

  it("the bubble is in sight from a cat's camera in front of every guarded stall", () => {
    // The walk's chase camera, as player.js places it: catcam.js cameraOffset at
    // DEFAULT_PITCH for each of camzoom.js's steps, pulled in by cameraPullScale
    // and kept over MIN_CAMERA_Y, behind a cat 0.5..5 m out from the counter,
    // across its width, facing it. Nothing of the stall (awning, valance, sign,
    // posts) or its lanterns may cross the line from the camera to:
    //   at the default step, the bubble's middle and eight points round its rim
    //   (0.2 m out, the inner 80% of its disc, in the camera's own plane), at
    //   rest and at either end of its bob; and the bubble on screen, in a
    //   landscape frame and on a phone held upright;
    //   at every other step, its middle.
    const r = marketRig({ reducedMotion: true });
    const lanterns = r.scene.getObjectByName('marketLanterns');
    const ray = new THREE.Raycaster();
    const cam = new THREE.Vector3();
    const to = new THREE.Vector3();
    const off = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const frames = [16 / 9, 390 / 844].map((aspect) => new THREE.PerspectiveCamera(70, aspect, 0.1, 300));
    const RIM = [[0, 0], ...Array.from({ length: 8 }, (_, i) => [0.2 * Math.cos((i * Math.PI) / 4), 0.2 * Math.sin((i * Math.PI) / 4)])];
    const blocked = (stall, from, at) => {
      const d = at.clone().sub(from);
      const far = d.length();
      ray.set(from, d.normalize());
      ray.far = far - 0.01;
      return ray.intersectObjects([stall, lanterns], true).map((h) => h.object.name || h.object.type);
    };
    for (const id of TREAT_STALLS) {
      const s = stallById(id);
      const stall = r.scene.children.find((o) => o.userData.stall === id);
      expect(stall, id).toBeTruthy();
      const { bubble } = r.live.keepers[id];
      const yaw = Math.atan2(s.face.x, s.face.z); // the cat faces the counter; the camera is behind her
      for (const [step, view] of ZOOM_STEPS.entries()) {
        const full = step === DEFAULT_ZOOM_STEP;
        for (const lx of [-s.w / 2, 0, s.w / 2]) {
          for (const out of [0.5, 1, 2, 3, 4, 5]) {
            const c = fromPlan(s, lx, s.d / 2 + out);
            const catPos = new THREE.Vector3(c.x, 0, c.z);
            cameraOffset(yaw, DEFAULT_PITCH, view.dist, view.height, off);
            off.multiplyScalar(cameraPullScale(catPos, off, view.dist, r.area.colliders, r.area.bounds));
            cam.copy(catPos).add(off);
            if (cam.y < MIN_CAMERA_Y) cam.y = MIN_CAMERA_Y;
            const f = frames[0];
            f.position.copy(cam);
            f.lookAt(c.x, CAT_LOOK_Y, c.z);
            f.updateMatrixWorld(true);
            right.setFromMatrixColumn(f.matrixWorld, 0);
            up.setFromMatrixColumn(f.matrixWorld, 1);
            for (const bob of full ? [0, -0.025, 0.025] : [0]) {
              for (const [i, j] of full ? RIM : RIM.slice(0, 1)) {
                to.copy(bubble.position).addScaledVector(right, i).addScaledVector(up, j);
                to.y += bob;
                expect(blocked(stall, cam, to), `${id} zoom ${step} cat at (${lx}, +${out}) point (${i.toFixed(2)}, ${j.toFixed(2)}) bob ${bob}`).toEqual([]);
              }
            }
            if (!full) continue;
            for (const fr of frames) {
              fr.position.copy(cam);
              fr.lookAt(c.x, CAT_LOOK_Y, c.z);
              fr.updateMatrixWorld(true);
              const p = bubble.position.clone().project(fr);
              expect(Math.abs(p.x), `${id} on screen across, aspect ${fr.aspect.toFixed(2)}, cat at (${lx}, +${out})`).toBeLessThan(1);
              expect(Math.abs(p.y), `${id} on screen up, aspect ${fr.aspect.toFixed(2)}, cat at (${lx}, +${out})`).toBeLessThan(1);
            }
          }
        }
      }
    }
    r.live.dispose();
  });

  it('the arms sway calmly: no phase change makes one jump', () => {
    const r = marketRig({ seed: 5, clock: 3e8 });
    const prev = {};
    let worst = 0;
    let moved = 0;
    const frames = Math.ceil(Math.max(...TREAT_STALLS.map(periodOf)) / DT) * 2;
    for (let i = 0; i < frames; i++) {
      r.step(DT);
      for (const id of KEEPER_IDS) {
        const z = r.live.keepers[id].arm.rotation.z;
        if (id in prev) { worst = Math.max(worst, Math.abs(z - prev[id])); moved += Math.abs(z - prev[id]); }
        prev[id] = z;
      }
    }
    expect(worst).toBeLessThan(0.05); // under 3 degrees a frame at 30 fps
    expect(moved).toBeGreaterThan(1);
    r.live.dispose();
  }, 60_000);

  it('a stall with a stallholder and no keeper spot is a mistake, not a silent gap', () => {
    const { scene, area } = buildSquare();
    const before = scene.children.length;
    for (const id of ['fish', 'flowers']) {
      const keepers = { ...area.keepers };
      delete keepers[id];
      expect(() => createMarketLive(scene, { ...area, keepers }, { people: createPeopleKit, seed: 1, now: () => 0 }), id).toThrow(id);
    }
    // a guarded stall needs its roof's height for the bubble (a serve-only one has no bubble)
    for (const roof of [undefined, NaN, Infinity, '2.8']) {
      const keepers = { ...area.keepers, milk: { ...area.keepers.milk, roof } };
      expect(() => createMarketLive(scene, { ...area, keepers }, { people: createPeopleKit, seed: 1, now: () => 0 }), String(roof)).toThrow('milk');
    }
    const keepers = { ...area.keepers, fruit: { ...area.keepers.fruit, roof: undefined } };
    createMarketLive(scene, { ...area, keepers }, { people: createPeopleKit, seed: 1, now: () => 0 }).dispose();
    expect(scene.children).toHaveLength(before);
  });

  it('a figure that fails half way leaves nothing behind', () => {
    const { scene, area } = buildSquare();
    const before = scene.children.length;
    const made = [];
    let n = 0;
    const figure = (spot) => {
      if (++n === 4) throw new Error('no fourth figure');
      const k = marketFigure({ ...spot, people: createPeopleKit });
      const dispose = vi.fn(k.dispose);
      made.push(dispose);
      return { ...k, dispose };
    };
    expect(() => createMarketLive(scene, area, { people: createPeopleKit, seed: 1, now: () => 0, figure })).toThrow('no fourth figure');
    expect(scene.children).toHaveLength(before);
    expect(made).toHaveLength(3);
    for (const d of made) expect(d).toHaveBeenCalledTimes(1);
  });

  it('two rigs with one seed and one clock pose every stallholder alike', () => {
    const pose = (r) => KEEPER_IDS.map((id) => {
      const k = r.live.keepers[id];
      return [id, k.group.rotation.y, k.arm.rotation.z, k.bubble ? k.bubble.visible : null, k.bubble ? k.bubble.position.y : null];
    });
    const a = marketRig({ seed: 7, clock: 1e9 });
    const b = marketRig({ seed: 7, clock: 1e9 });
    const c = marketRig({ seed: 8, clock: 1e9 });
    let differ = false;
    for (let i = 0; i < 300; i++) {
      a.step(DT); b.step(DT); c.step(DT);
      expect(pose(b)).toEqual(pose(a));
      if (JSON.stringify(pose(c)) !== JSON.stringify(pose(a))) differ = true;
    }
    expect(differ, 'another seed, another rhythm').toBe(true);
    for (const r of [a, b, c]) r.live.dispose();
  }, 60_000);

  it('the people are added after the build, cast no shadow but their own contact shadow, and go on dispose', () => {
    const { scene, area } = buildSquare();
    const before = new Set(scene.children);
    const count = () => { let n = 0; scene.traverse(() => n++); return n; };
    const nodes = count();
    const live = createMarketLive(scene, area, { people: createPeopleKit, seed: 7, now: () => 1e9 });
    live.update(DT, DT, { cat: new THREE.Group(), player: { speed: 0 }, session: { remotes: { list: [] } } });
    const added = scene.children.filter((o) => !before.has(o));
    // six people and four bubbles, nothing else; the build's own children are untouched
    expect(added).toHaveLength(10);
    expect(added.filter((o) => o.isSprite)).toHaveLength(4);
    expect([...before].every((o) => o.parent === scene)).toBe(true);
    expect(live.groups).toHaveLength(6);
    for (const g of live.groups) expect(added).toContain(g);
    // the walk's caster sweep runs after the life is made: it must not make them cast
    assignShadowCasters(scene);
    const theirs = [];
    for (const o of added) o.traverse((m) => { if (m.isMesh) theirs.push(m); });
    expect(theirs.length).toBeGreaterThanOrEqual(6 * 1 + 4 * 3); // one skinned mesh a person, a broom of three for each treat stall
    for (const m of theirs) {
      expect(m.castShadow, m.name).toBe(false);
      expect(m.userData.noCast, m.name).toBe(true);
    }
    // and at most this much, the square with its people under the Market's own
    // ceilings (never raised). Re-pinned for the lifelike people (U7, measured
    // 2026-11-21: 18 meshes, 13,980 triangles, nothing cast; six people at the
    // kit's near detail, about 2,300 each, and four brooms; the old blocky
    // figure was 30 meshes and 3,056). With the square's 108 meshes and 38,341
    // triangles that is 126 / 52,321 of the 280 / 62,000 ceilings.
    const tri = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    const people = { meshes: theirs.length, casters: theirs.filter((m) => m.castShadow).length, tris: theirs.reduce((n, m) => n + tri(m), 0) };
    expect(people.meshes).toBeLessThanOrEqual(20);
    expect(people.casters).toBe(0);
    expect(people.tris).toBeLessThanOrEqual(14000);
    const square = { meshes: 0, tris: 0 };
    for (const o of before) o.traverse((m) => { if (m.isMesh) { square.meshes++; square.tris += tri(m); } });
    const [maxMeshes, , maxTris] = MARKET_REGISTRATION.budget.built;
    expect(square.meshes + people.meshes).toBeLessThanOrEqual(maxMeshes);
    expect(square.tris + people.tris).toBeLessThanOrEqual(maxTris);
    // each person's contact shadow: the walk's decals follow live.groups
    const decals = createContactShadows(scene);
    const movers = decals.moverCount;
    for (const g of live.groups) decals.follow(g);
    expect(decals.moverCount - movers).toBe(6);
    decals.dispose();
    // the brooms are in the people's hands, hidden until a shoo
    for (const id of TREAT_STALLS) {
      const { broom, arm, group } = live.keepers[id];
      expect(broom.visible).toBe(false);
      let up = broom.parent;
      while (up && up !== arm) up = up.parent;
      expect(up, `${id}'s broom is held by the arm`).toBe(arm);
      let top = arm;
      while (top.parent && top !== group) top = top.parent;
      expect(top).toBe(group);
    }
    // dispose frees everything it made, and leaves the square as it was
    const freed = new Set();
    const watch = (x) => { if (x && !freed.has(x)) x.addEventListener('dispose', () => freed.add(x)); };
    const things = new Set();
    for (const o of added) {
      o.traverse((m) => {
        if (m.isMesh) { things.add(m.geometry); things.add(m.material); }
        if (m.isSprite) { things.add(m.material); things.add(m.material.map); }
      });
    }
    for (const x of things) watch(x);
    live.dispose();
    for (const x of things) expect(freed.has(x)).toBe(true);
    expect(scene.children.filter((o) => !before.has(o))).toEqual([]);
    expect(count()).toBe(nodes);
    expect(() => { live.update(DT, DT, {}); live.dispose(); }).not.toThrow();
    // the square's own treats and keepers' spots are not the life's to free
    for (const id of [...TREAT_STALLS, 'cafe']) expect(area.treatMeshes[id].parent).toBe(scene);
  });

  it('update reuses its own objects', () => {
    const r = marketRig();
    r.step(DT);
    const stalls = r.live.stalls;
    const records = stalls.map((s) => s);
    const looks = stalls.map((s) => s.look);
    const groups = KEEPER_IDS.map((id) => r.live.keepers[id].group);
    const bubbles = TREAT_STALLS.map((id) => r.live.keepers[id].bubble);
    const kids = scene0(r.scene);
    r.walk(0, -1, 1.5);
    r.step(DT, 600);
    expect(r.live.stalls).toBe(stalls);
    r.live.stalls.forEach((s, i) => {
      expect(s).toBe(records[i]);
      expect(s.look).toBe(looks[i]);
    });
    for (const s of r.live.stalls.slice(0, 4)) expect(s.look).toBeTruthy(); // the four guarded stalls keep a phase record
    KEEPER_IDS.forEach((id, i) => expect(r.live.keepers[id].group).toBe(groups[i]));
    TREAT_STALLS.forEach((id, i) => expect(r.live.keepers[id].bubble).toBe(bubbles[i]));
    expect(scene0(r.scene)).toEqual(kids);
    r.live.dispose();
  }, 60_000);

  it('a stallholder stands on the ground it is given, and the life gives it the walk\'s', () => {
    const k = marketFigure({ x: 1, y: 0.7, z: 2, yaw: 0, people: createPeopleKit });
    expect(k.group.position.y).toBe(0.7);
    k.dispose();
    const flat = marketFigure({ x: 1, z: 2, yaw: 0, people: createPeopleKit }); // no y: the flat ground's
    expect(flat.group.position.y).toBe(0);
    flat.dispose();
    const { scene, area } = buildSquare();
    const seen = [];
    const ground = { flat: false, y: (x, z) => 0.25 + 0.01 * (x + z), slide() {}, sameLevel: () => true };
    const figure = (spot) => { seen.push(spot.y); return marketFigure({ ...spot, people: createPeopleKit }); };
    const live = createMarketLive(scene, area, { people: createPeopleKit, seed: 1, now: () => 0, ground, figure });
    KEEPER_IDS.forEach((id, i) => {
      const { x, z } = area.keepers[id];
      expect(seen[i], id).toBeCloseTo(ground.y(x, z), 12);
      expect(live.keepers[id].group.position.y, id).toBeCloseTo(ground.y(x, z), 12);
    });
    live.dispose();
  });

  it('each stallholder is one grown-up from the people kit, its look from the spot, its feet on the ground', () => {
    const { area } = buildSquare();
    expect(() => marketFigure({ x: 1, z: 2 })).toThrow('people factory'); // the pack's createPeopleKit, or nothing
    for (const id of KEEPER_IDS) {
      const spot = area.keepers[id];
      const a = marketFigure({ ...spot, y: 0.3, people: createPeopleKit });
      const b = marketFigure({ ...spot, y: 0.3, people: createPeopleKit });
      const meshes = [];
      a.group.traverse((m) => { if (m.isMesh) meshes.push(m); });
      expect(meshes, id).toHaveLength(1);
      expect(meshes[0].isSkinnedMesh, id).toBe(true);
      expect(a.person.look.kind, id).not.toBe('child');
      expect(b.person.look).toEqual(a.person.look); // the spot's look, every time
      // the feet on the ground it was given, the head (and the bubble's floor) a person's height up
      const box = new THREE.Box3().setFromObject(a.group);
      expect(box.min.y, id).toBeCloseTo(0.3, 2);
      expect(a.headY, id).toBeCloseTo(box.max.y - 0.3, 6);
      expect(a.headY, id).toBeGreaterThan(1.4);
      // the broom's grip is at the hand, a forearm and more down from the shoulder
      expect(a.hand.y, id).toBeLessThan(-0.45);
      a.dispose();
      b.dispose();
    }
  });

  it('the stallholders are built through the one figure function', () => {
    const { scene, area } = buildSquare();
    const figure = vi.fn((spot) => marketFigure(spot));
    const live = createMarketLive(scene, area, { people: createPeopleKit, seed: 1, now: () => 0, figure });
    expect(figure).toHaveBeenCalledTimes(KEEPER_IDS.length);
    KEEPER_IDS.forEach((id, i) => {
      const k = area.keepers[id];
      const spot = figure.mock.calls[i][0];
      expect({ x: spot.x, z: spot.z, yaw: spot.yaw }, id).toEqual({ x: k.x, z: k.z, yaw: k.yaw });
      expect(spot.people, id).toBe(createPeopleKit); // the pack's factory, handed on
      expect(live.keepers[id].group, id).toBe(figure.mock.results[i].value.group);
    });
    live.dispose();
    // with no figure, every keeper is marketFigure's: personKeeper names its
    // group 'marketKeeper', and the life adds the stall's id to it
    const one = marketFigure({ x: 1, z: 2, yaw: 0, people: createPeopleKit });
    expect(one.group.name).toBe('marketKeeper');
    one.dispose();
    const plain = createMarketLive(scene, area, { people: createPeopleKit, seed: 1, now: () => 0 });
    for (const id of KEEPER_IDS) {
      expect(plain.keepers[id].group.name, id).toBe(`marketKeeper:${id}`);
      expect(plain.keepers[id].group.children[0].isSkinnedMesh || plain.keepers[id].group.getObjectByProperty('isSkinnedMesh', true), id).toBeTruthy();
    }
    plain.dispose();
    expect(marketFigure).toBe(personKeeper);
  });

  it('creating the stallholders draws nothing from Math.random', () => {
    const { scene, area } = buildSquare();
    const ctx = { cat: new THREE.Group(), player: { speed: 0, stalking: false, perchY: 0 }, session: { remotes: { list: [] } } };
    const random = vi.spyOn(Math, 'random');
    try {
      let clock = 1e9;
      const live = createMarketLive(scene, area, { people: createPeopleKit, seed: 7, now: () => clock });
      for (let i = 0; i < 300; i++) { clock += DT; live.update(DT, i * DT, ctx); }
      live.dispose();
      // and the figure on its own
      marketFigure({ x: 1, z: 2, yaw: 0.5, people: createPeopleKit }).dispose();
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });
});

// =============================================================================
// The sneak (Task 12): the grab and the munch, the shoo and the hop, the coo,
// the refill, the partner's pick and teamwork. Driven through the real rig.
// =============================================================================
const S = (id) => stallById(id);
const treatOf = (id) => S(id).treat;
const kindOf = (id) => S(id).treat.kind;
// a spot in reach of a stall's treat, straight out in front of it (her centre
// stops 0.55 m from the treat at its stand; this is 0.6)
const reachSpot = (id) => fromStall(S(id), S(id).w / 2 - 0.3, S(id).d / 2 + 0.95);
const ofType = (r, type) => r.events.filter((e) => e.type === type);
const pos = (o) => ({ x: o.position.x, z: o.position.z });
// displacement along the stall's face (away from the counter) and along its local +x
const along = (s, p0, p1) => (p1.x - p0.x) * s.face.x + (p1.z - p0.z) * s.face.z;
const across = (s, p0, p1) => (p1.x - p0.x) * -s.face.z + (p1.z - p0.z) * s.face.x;
// step until fn() holds or `max` seconds pass: the seconds it took, or Infinity
function until(r, fn, max) {
  for (let i = 0; i <= Math.round(max / DT); i++) {
    if (fn()) return i * DT;
    r.step(DT);
  }
  return Infinity;
}
// the signed angle from a stall's face to a direction (dx, dz), in the plane
const angleFromFace = (s, dx, dz) => Math.atan2(dx * -s.face.z + dz * s.face.x, dx * s.face.x + dz * s.face.z);
// the highest counter top (the milk cart's bed, 0.97 m; the counters are 0.9 m)
const COUNTER_TOP = 0.97;

describe('the sneak (Task 12)', () => {
  it('a treat is taken while the stallholder is turned away, in the mouth, then eaten within two seconds', () => {
    for (const id of TREAT_STALLS) {
      const r = marketRig();
      const kind = kindOf(id);
      const st = r.stall(id);
      r.setPhase(id, 'away', 0.2);
      const p = reachSpot(id);
      expect(isWalkableAt(r.area, p.x, p.z), id).toBe(true);
      r.place(p.x, p.z).step(DT);
      expect(st.watching).toBe(false);
      const action = r.live.actionFor(r.session);
      expect(action).toEqual({ kind: 'grab', stall: id, prompt: TREAT_WORDS[kind].prompt });
      expect(r.live.act(action, r.session, { dropHeld: r.dropHeld })).toBe(true);
      expect(r.dropHeld).not.toHaveBeenCalled();
      expect(r.session.carry.mouth.held).toEqual({ id: treatItemId(id), kind, treat: true });
      expect(st.treatOut).toBe(false);
      expect(st.refillT).toBe(MARKET.REFILL_S);
      expect(r.events).toContainEqual({ type: 'grab', stall: id });
      expect(r.live.actionFor(r.session), 'no second prompt while munching').toBeNull();
      const shown = r.area.treatMeshes[id];
      // in the mouth, by her head, for HOLD_S; the cream is lapped where it stands (M6)
      r.step(DT, Math.round(MARKET.HOLD_S / 2 / DT));
      const inMouth = r.scene.getObjectByName(`marketMouth:me:${kind}`);
      if (kind === 'cream') {
        expect(inMouth).toBeUndefined();
        expect(shown.visible, 'the saucer stays out while she laps it').toBe(true);
        expect(r.session.sniffTime).toBeCloseTo(MARKET.HOLD_S + MARKET.MUNCH_S, 9);
      } else {
        expect(shown.visible).toBe(false);
        expect(inMouth?.visible).toBe(true);
        const head = r.cat.userData.parts.head.getWorldPosition(new THREE.Vector3());
        expect(inMouth.position.distanceTo(head)).toBeLessThan(0.4);
        expect(r.session.sniffTime, 'no munch yet').toBe(0);
      }
      // then the munch, and eaten within two seconds of the grab
      const tEat = until(r, () => ofType(r, 'eat').length > 0, 3) + MARKET.HOLD_S / 2;
      expect(tEat).toBeLessThanOrEqual(2);
      expect(tEat).toBeGreaterThanOrEqual(MARKET.HOLD_S + MARKET.MUNCH_S - 2 * DT);
      if (kind !== 'cream') expect(r.session.sniffTime).toBe(MARKET.MUNCH_S);
      expect(ofType(r, 'eat')).toEqual([{ type: 'eat', stall: id, kind, teamWith: null }]);
      expect(r.session.carry.mouth.held).toBeNull();
      expect(r.live.treats).toBe(1);
      expect(shown.visible).toBe(false);
      if (inMouth) expect(inMouth.parent).toBeNull();
      expect(ofType(r, 'shoo')).toEqual([]);
      r.live.dispose();
    }
  }, 60_000);

  it('the action button while watched is a shoo and a hop back, and the treat stays out', () => {
    for (const id of TREAT_STALLS) {
      const s = S(id);
      const r = marketRig();
      const st = r.stall(id);
      r.setPhase(id, 'serve', 0.3);
      const p = reachSpot(id);
      r.place(p.x, p.z).step(DT);
      expect(st.watching).toBe(true);
      const action = r.live.actionFor(r.session);
      expect(action?.stall).toBe(id);
      expect(r.live.act(action, r.session, { dropHeld: r.dropHeld })).toBe(false);
      expect(ofType(r, 'shoo')).toEqual([{ type: 'shoo', stall: id, who: 'me', laugh: false, hopped: true }]);
      expect(st.treatOut).toBe(true);
      expect(r.area.treatMeshes[id].visible).toBe(true);
      expect(r.session.carry.mouth.held).toBeNull();
      expect(st.shooT).toBe(MARKET.SHOO_S);
      // a short hop back, over HOP_S, then she lands (from where she stood at
      // the press: the hop's first small step is taken with it)
      const p0 = { x: p.x, z: p.z };
      r.step(DT, Math.round(MARKET.HOP_S / 2 / DT));
      const half = along(s, p0, pos(r.cat));
      expect(half).toBeGreaterThan(0.3 * MARKET.HOP_DIST);
      expect(half).toBeLessThan(0.8 * MARKET.HOP_DIST);
      expect(r.session.landTime).toBe(0);
      r.step(DT, Math.round(MARKET.HOP_S / DT));
      const p1 = pos(r.cat);
      expect(along(s, p0, p1), id).toBeCloseTo(MARKET.HOP_DIST, 6);
      expect(Math.abs(across(s, p0, p1))).toBeLessThan(1e-9);
      expect(r.session.landTime).toBe(0.12);
      expect(r.live.treats).toBe(0);
      r.live.dispose();
    }
  }, 60_000);

  it('a cat walking toward the treat while watched is shooed; one walking across the front is not', () => {
    for (const id of TREAT_STALLS) {
      const s = S(id);
      const T = treatOf(id);
      // straight at the treat
      const r = marketRig();
      r.setPhase(id, 'serve', 0.2);
      const p = r.local(id, s.w / 2 - 0.3, s.d / 2 + 3.0);
      r.place(p.x, p.z).step(DT);
      r.walk(T.x - p.x, T.z - p.z, 1.2);
      expect(until(r, () => ofType(r, 'shoo').length > 0, 1.5), id).toBeLessThan(0.2);
      expect(ofType(r, 'shoo')[0]).toEqual({ type: 'shoo', stall: id, who: 'me', laugh: false, hopped: true });
      r.live.dispose();
      // across the whole front, from outside the zone on one side to outside it
      // on the other, both ways, near and far, slow and quick, at several
      // moments of the watching: never shooed (the review's ruling)
      const a = marketRig();
      const edge = s.w / 2 + MARKET.WATCH_SIDE + 0.4;
      for (const dir of [1, -1]) {
        for (const out of [1, 2, 3]) {
          for (const speed of [0.8, 1.5, 3.5]) {
            for (const into of [0, 1.5, 3.0]) {
              a.setPhase(id, 'serve', into);
              const q = a.local(id, -dir * edge, s.d / 2 + out);
              a.place(q.x, q.z).step(DT);
              a.walk(dir * -s.face.z, dir * s.face.x, speed);
              let seenFrames = 0;
              const n = Math.ceil((2 * edge) / speed / DT) + 2;
              for (let i = 0; i < n; i++) {
                a.step(DT);
                const { lx, lz } = toStall(s, a.cat.position.x, a.cat.position.z);
                if (a.stall(id).look.watching && Math.abs(lx) <= s.w / 2 + MARKET.WATCH_SIDE && lz >= s.d / 2) seenFrames++;
              }
              const label = `${id} way ${dir} ${out} m out at ${speed} m/s, ${into} s into serving`;
              expect(dir * across(s, q, pos(a.cat)), `${label}: crossed the whole front`).toBeGreaterThan(2 * edge - 0.1);
              expect(seenFrames, `${label}: watched as she crossed`).toBeGreaterThan(0);
              expect(ofType(a, 'shoo'), label).toEqual([]);
            }
          }
        }
      }
      a.live.dispose();
      // angling in toward the treat, 35 degrees in from along the front: shooed;
      // 20 degrees in, a pass that drifts closer: not
      for (const [deg, shooed] of [[35, true], [20, false]]) {
        const g = marketRig();
        g.setPhase(id, 'serve', 0.2);
        const q = g.local(id, -s.w / 2, s.d / 2 + 2.6);
        g.place(q.x, q.z).step(DT);
        const k = (deg * Math.PI) / 180;
        // along local +x (toward the treat's side) and in toward the counter (-face)
        g.walk(Math.cos(k) * -s.face.z - Math.sin(k) * s.face.x, Math.cos(k) * s.face.x - Math.sin(k) * s.face.z, 1.5);
        g.step(DT, Math.round(1.2 / DT));
        expect(g.stall(id).look.watching).toBe(true);
        expect(ofType(g, 'shoo').length > 0, `${id} ${deg} degrees in`).toBe(shooed);
        g.live.dispose();
      }
      // a partner walking at the treat gets the broom only
      const b = marketRig();
      b.setPhase(id, 'serve', 0.2);
      const ben = b.addRemote('ben', p.x, p.z);
      b.step(DT);
      b.walkRemote(ben, T.x - p.x, T.z - p.z, 1.2);
      const me0 = pos(b.cat);
      b.step(DT, 10);
      expect(ofType(b, 'shoo')).toEqual([{ type: 'shoo', stall: id, who: 'ben', laugh: false, hopped: false }]);
      expect(pos(b.cat)).toEqual(me0);
      b.live.dispose();
    }
  }, 60_000);

  it('a crouched cat is shooed only within half the distance', () => {
    const half = MARKET.WATCH_DEPTH * MARKET.STALK_SHARE;
    for (const id of TREAT_STALLS) {
      const s = S(id);
      const T = treatOf(id);
      for (const stalking of [true, false]) {
        // no hop (a refusing isFree): where she stands at the shoo is where she was noticed
        const r = marketRig({ isFree: () => false });
        r.setPhase(id, 'serve', 0);
        const p = r.local(id, s.w / 2 - 0.3, s.d / 2 + 3.1);
        r.place(p.x, p.z);
        r.player.stalking = stalking;
        r.step(DT);
        r.walk(T.x - p.x, T.z - p.z, 0.8);
        expect(until(r, () => ofType(r, 'shoo').length > 0, 3.5), `${id} stalking ${stalking}`).toBeLessThan(3.5);
        const out = toStall(s, r.cat.position.x, r.cat.position.z).lz - s.d / 2;
        if (stalking) {
          expect(out).toBeLessThanOrEqual(half + 0.03);
          expect(out).toBeGreaterThan(half - 0.1);
        } else expect(out).toBeGreaterThan(MARKET.WATCH_DEPTH - 0.2);
        r.live.dispose();
      }
    }
  }, 60_000);

  it('a still cat is cooed at, never shooed, and the stallholder faces her for COO_S', () => {
    const id = 'fish';
    const s = S(id);
    const r = marketRig();
    const st = r.stall(id);
    const keeper = r.live.keepers[id];
    // still in front of the counter late in the serving: the rhythm turns away during the coo
    r.setPhase(id, 'serve', STALL_TIMES[id].serve - 1.5);
    const p = r.local(id, 0, s.d / 2 + 1.5);
    r.place(p.x, p.z);
    let cooStart = null;
    let cooEnd = null;
    let sawAway = false;
    let backInStep = null;
    for (let i = 0; i < Math.round((2 * periodOf(id)) / DT); i++) {
      r.step(DT);
      if (cooStart === null && st.cooing) {
        cooStart = r.t;
        expect(st.cooing.who).toBe('me');
      }
      if (cooStart !== null && cooEnd === null && !st.cooing) cooEnd = r.t;
      if (st.cooing && r.t - cooStart > 0.4) {
        expect(faceDot(keeper.group, s)).toBeGreaterThan(Math.cos(Math.PI / 180));
        expect(keeper.bubble.visible).toBe(false);
        expect(st.bubble).toBe(false);
        if (st.look.facing === 1) sawAway = true;
      }
      if (cooEnd !== null && backInStep === null && r.t - cooEnd > 1) {
        backInStep = Math.abs(faceDot(keeper.group, s) - Math.cos(st.look.facing * Math.PI));
      }
    }
    expect(ofType(r, 'coo')).toEqual([{ type: 'coo', stall: id, who: 'me' }]);
    expect(Math.abs(cooStart - MARKET.STILL_S)).toBeLessThanOrEqual(2 * DT);
    expect(Math.abs(cooEnd - cooStart - MARKET.COO_S)).toBeLessThanOrEqual(1.5 * DT);
    expect(sawAway, 'the rhythm ran on underneath').toBe(true);
    expect(backInStep, 'back in step with the rhythm after the coo').toBeLessThan(1e-9);
    expect(ofType(r, 'shoo')).toEqual([]);
    r.live.dispose();

    // off to one side: she turns to face the cat, never more than 60 degrees off front
    for (const sid of TREAT_STALLS) {
      const ss = S(sid);
      const a = marketRig();
      a.setPhase(sid, 'serve', 0);
      const q = a.local(sid, ss.w / 2 + 0.95, ss.d / 2 + 0.6);
      a.place(q.x, q.z);
      expect(until(a, () => a.stall(sid).cooing, 1.5), sid).toBeLessThan(1.5);
      a.step(DT, 15);
      const spot = a.area.keepers[sid];
      const her = angleFromFace(ss, q.x - spot.x, q.z - spot.z);
      const f = frontOf(a.live.keepers[sid].group);
      const front = angleFromFace(ss, f.x, f.z);
      expect(Math.abs(front - Math.max(-Math.PI / 3, Math.min(Math.PI / 3, her))), sid).toBeLessThan(0.01);
      a.live.dispose();
    }
  }, 60_000);

  it('one coo per stop', () => {
    const id = 'fish';
    const s = S(id);
    const r = marketRig();
    r.setPhase(id, 'serve', 0);
    const p = r.local(id, 0, s.d / 2 + 1.0);
    r.place(p.x, p.z);
    r.step(DT, Math.round((2 * periodOf(id)) / DT));
    expect(ofType(r, 'coo')).toHaveLength(1);
    // she moves (away from the treat) and stops again: another coo
    r.walk(s.face.x, s.face.z, 1.0);
    r.step(DT, 12);
    r.walk(0, 0, 0);
    expect(until(r, () => ofType(r, 'coo').length === 2, periodOf(id) + 2)).toBeLessThan(periodOf(id) + 2);
    r.step(DT, Math.round(periodOf(id) / DT));
    expect(ofType(r, 'coo')).toHaveLength(2);
    expect(ofType(r, 'shoo')).toEqual([]);
    r.live.dispose();
  }, 60_000);

  it('while one cat is cooed at, the stall notices no other cat', () => {
    // she stops first, Ben a moment later: one coo, at her; Ben is never noticed while it lasts
    {
      const id = 'fish';
      const s = S(id);
      const r = marketRig();
      const st = r.stall(id);
      r.setPhase(id, 'serve', 0);
      const me = r.local(id, 0, s.d / 2 + 1.5);
      r.place(me.x, me.z);
      const b0 = r.local(id, s.w / 2 - 0.3, s.d / 2 + 2.6);
      const ben = r.addRemote('ben', b0.x, b0.z);
      r.walkRemote(ben, s.face.z, -s.face.x, 0.5);
      r.step(DT, 12);
      r.walkRemote(ben, 0, 0, 0);
      expect(until(r, () => st.cooing, 2)).toBeLessThan(2);
      expect(st.cooing.who).toBe('me');
      r.step(DT, Math.round(1.5 / DT)); // Ben still for well over STILL_S
      expect(ofType(r, 'coo')).toEqual([{ type: 'coo', stall: id, who: 'me' }]);
      // Ben walks at the treat while the rhythm says she is watching
      const T = treatOf(id);
      r.walkRemote(ben, T.x - ben.group.position.x, T.z - ben.group.position.z, 1.0);
      r.step(DT, 30);
      expect(st.cooing?.who).toBe('me');
      expect(st.look.watching).toBe(true);
      expect(ofType(r, 'shoo')).toEqual([]);
      r.live.dispose();
    }
    // Ben is cooed at; she walks right up and takes the sausage roll: teamwork
    {
      const id = 'baker';
      const s = S(id);
      const r = marketRig();
      const st = r.stall(id);
      r.setPhase(id, 'serve', 0);
      const b = r.local(id, 0, s.d / 2 + 1.5);
      r.addRemote('ben', b.x, b.z);
      expect(until(r, () => st.cooing, 2)).toBeLessThan(2);
      expect(st.cooing.who).toBe('ben');
      const p = r.local(id, s.w / 2 - 0.3, s.d / 2 + 2.8);
      r.place(p.x, p.z).step(DT);
      const T = treatOf(id);
      r.walk(T.x - p.x, T.z - p.z, 1.5);
      expect(until(r, () => r.live.actionFor(r.session), 2)).toBeLessThan(2);
      expect(st.look.watching).toBe(true);
      expect(r.grab()).toBe(true);
      r.walk(0, 0, 0);
      r.step(DT, Math.round(2 / DT));
      expect(ofType(r, 'shoo')).toEqual([]);
      expect(ofType(r, 'eat')).toEqual([{ type: 'eat', stall: id, kind: 'sausageroll', teamWith: 'ben' }]);
      r.live.dispose();
    }
  }, 60_000);

  it('the cooed cat who walks at the treat is shooed; one who walks off is not', () => {
    const id = 'fish';
    const s = S(id);
    const T = treatOf(id);
    for (const way of ['at', 'off']) {
      const r = marketRig();
      const st = r.stall(id);
      r.setPhase(id, 'serve', STALL_TIMES[id].serve - 1.2);
      const p = r.local(id, s.w / 2 - 0.3, s.d / 2 + 2.0);
      r.place(p.x, p.z);
      expect(until(r, () => st.cooing, 2)).toBeLessThan(2);
      r.step(DT, Math.round(2.5 / DT));
      expect(st.cooing?.who).toBe('me');
      expect(st.look.watching, 'turned away by the rhythm, but cooing at her').toBe(false);
      if (way === 'at') {
        r.walk(T.x - p.x, T.z - p.z, 1.0);
        r.step(DT, 3);
        expect(st.cooing).toBeNull();
        expect(ofType(r, 'shoo')).toEqual([{ type: 'shoo', stall: id, who: 'me', laugh: false, hopped: true }]);
      } else {
        r.walk(s.face.x, s.face.z, 1.0);
        r.step(DT, 3);
        expect(st.cooing).toBeNull();
        r.step(DT, Math.round(2 / DT));
        expect(ofType(r, 'shoo')).toEqual([]);
      }
      r.live.dispose();
    }
  }, 60_000);

  it('a cat with a treat in her mouth is laughed at, keeps it, and is not hopped', () => {
    const id = 'baker';
    const s = S(id);
    const T = treatOf(id);
    const C = treatOf('cafe');
    const r = marketRig();
    r.setPhase(id, 'serve', 0.3);
    r.place(C.x, C.z + 0.5).step(DT);
    expect(r.grab()).toBe(true);
    const p = r.local(id, s.w / 2 - 0.3, s.d / 2 + 2.5);
    r.place(p.x, p.z).step(DT);
    r.walk(T.x - p.x, T.z - p.z, 1.5);
    const p0 = pos(r.cat);
    const n = 6;
    r.step(DT, n);
    expect(ofType(r, 'shoo')).toEqual([{ type: 'shoo', stall: id, who: 'me', laugh: true, hopped: false }]);
    expect(r.session.carry.mouth.held).toMatchObject({ id: treatItemId('cafe'), treat: true });
    const p1 = pos(r.cat);
    expect(Math.hypot(p1.x - p0.x, p1.z - p0.z), 'only her own walk moved her').toBeCloseTo(1.5 * n * DT, 9);
    r.walk(0, 0, 0);
    r.step(DT, Math.round(2 / DT));
    expect(ofType(r, 'eat')).toEqual([{ type: 'eat', stall: 'cafe', kind: 'crumbs', teamWith: null }]);
    expect(r.live.treats).toBe(1);
    r.live.dispose();
    // a partner munching a treat is laughed at too
    const b = marketRig();
    b.setPhase(id, 'serve', 0.3);
    const ben = b.addRemote('ben', p.x, p.z);
    b.step(DT);
    expect(b.live.remotePick(ben, treatItemId('fish'))).toBe(true);
    b.walkRemote(ben, T.x - p.x, T.z - p.z, 1.5);
    b.step(DT, n);
    expect(ofType(b, 'shoo')).toEqual([{ type: 'shoo', stall: id, who: 'ben', laugh: true, hopped: false }]);
    b.live.dispose();
  }, 60_000);

  it('the hop goes away from the counter, stops at anything solid, and never takes the stick', () => {
    const id = 'fish';
    const s = S(id);
    const p = reachSpot(id);
    const hopFrames = Math.round(MARKET.HOP_S / DT) + 5;
    // something solid 0.5 m behind her: she stops short of it, never in it
    let start = null;
    const isFree = (x, z) => start === null || (x - start.x) * s.face.x + (z - start.z) * s.face.z < 0.5;
    const r = marketRig({ isFree });
    r.setPhase(id, 'serve', 0.3);
    r.place(p.x, p.z).step(DT);
    start = pos(r.cat);
    expect(r.grab()).toBe(false);
    for (let i = 0; i < hopFrames; i++) {
      r.step(DT);
      expect(isFree(r.cat.position.x, r.cat.position.z)).toBe(true);
    }
    const a = along(s, start, pos(r.cat));
    expect(a).toBeLessThan(0.5);
    expect(a).toBeGreaterThan(0.5 - (MARKET.HOP_DIST / MARKET.HOP_S) * DT - 1e-9);
    expect(r.session.landTime).toBe(0.12);
    r.live.dispose();
    // the stick keeps working through the hop: her own walk along the counter is all kept
    const w = marketRig();
    w.setPhase(id, 'serve', 0.3);
    w.place(p.x, p.z).step(DT);
    w.walk(s.face.z, -s.face.x, 1.0); // along the counter, away from the treat's side
    const q0 = pos(w.cat);
    expect(w.grab()).toBe(false);
    for (let i = 0; i < hopFrames; i++) {
      w.step(DT);
      expect(isWalkableAt(w.area, w.cat.position.x, w.cat.position.z)).toBe(true);
    }
    const q1 = pos(w.cat);
    expect(across(s, q0, q1)).toBeCloseTo(-1.0 * hopFrames * DT, 9);
    expect(along(s, q0, q1)).toBeCloseTo(MARKET.HOP_DIST, 9);
    expect(w.player).toEqual({ speed: 1.0, stalking: false, perchY: 0, inputActive: true });
    w.live.dispose();
  }, 60_000);

  it('the broom stays over the counter and never reaches the cat', () => {
    // the broom's tip: the lowest point of its own drawing, in its own frame
    const tipY = (broom) => {
      let min = 0;
      broom.traverse((m) => {
        if (!m.isMesh) return;
        m.geometry.computeBoundingBox();
        min = Math.min(min, m.position.y + m.geometry.boundingBox.min.y);
      });
      return min;
    };
    const watchShoo = (r, id) => {
      const s = S(id);
      const broom = r.live.keepers[id].broom;
      const ty = tipY(broom);
      expect(ty).toBeLessThan(-1);
      let shown = 0;
      for (let i = 0; i < Math.round((MARKET.SHOO_S + 0.6) / DT); i++) {
        r.step(DT);
        if (!broom.visible) continue;
        shown++;
        r.scene.updateMatrixWorld(true);
        const tip = broom.localToWorld(new THREE.Vector3(0, ty, 0));
        const { lx, lz } = toStall(s, tip.x, tip.z);
        expect(Math.abs(lx), id).toBeLessThanOrEqual(s.w / 2);
        expect(lz, id).toBeGreaterThanOrEqual(-s.d / 2);
        expect(lz, id).toBeLessThanOrEqual(s.d / 2 + 0.3);
        expect(tip.y, id).toBeGreaterThanOrEqual(COUNTER_TOP);
        expect(Math.hypot(tip.x - r.cat.position.x, tip.z - r.cat.position.z)).toBeGreaterThan(CAT_RADIUS);
      }
      expect(broom.visible, 'hidden again after the shoo').toBe(false);
      return shown;
    };
    for (const id of TREAT_STALLS) {
      // the action button while watched
      const r = marketRig();
      r.setPhase(id, 'serve', 0.3);
      const p = reachSpot(id);
      r.place(p.x, p.z).step(DT);
      expect(r.live.keepers[id].broom.visible).toBe(false);
      expect(r.grab()).toBe(false);
      expect(Math.abs(watchShoo(r, id) * DT - MARKET.SHOO_S)).toBeLessThanOrEqual(1.5 * DT);
      r.live.dispose();
      // cooed at from off to the side, then walking in at the treat: the stallholder turns back from her
      const s = S(id);
      const c = marketRig();
      c.setPhase(id, 'serve', 0);
      const q = c.local(id, s.w / 2 + 0.95, s.d / 2 + 1.4);
      c.place(q.x, q.z);
      expect(until(c, () => c.stall(id).cooing, 2)).toBeLessThan(2);
      c.step(DT, 10);
      const T = treatOf(id);
      c.walk(T.x - q.x, T.z - q.z, 1.0);
      c.step(DT);
      expect(ofType(c, 'shoo')).toHaveLength(1);
      c.walk(0, 0, 0);
      expect(watchShoo(c, id)).toBeGreaterThan(0);
      c.live.dispose();
    }
  }, 60_000);

  it('under a trestle or on an awning she is never shooed', () => {
    for (const id of TREAT_STALLS) {
      const s = S(id);
      const T = treatOf(id);
      const h = s.hide;
      // under the trestle, in the corner of the zone it covers
      const r = marketRig();
      r.setPhase(id, 'serve', 0.2);
      const p = r.local(id, s.w / 2 + 0.95, s.d / 2 + 0.15);
      expect(Math.hypot(p.x - h.x, p.z - h.z)).toBeLessThan(h.r - 0.05);
      r.place(p.x, p.z).step(DT);
      r.walk(T.x - p.x, T.z - p.z, 0.5);
      for (let i = 0; i < 3; i++) {
        r.step(DT);
        expect(Math.hypot(r.cat.position.x - h.x, r.cat.position.z - h.z)).toBeLessThan(h.r);
      }
      r.walk(0, 0, 0);
      r.step(DT, Math.round(2 / DT));
      expect(ofType(r, 'shoo'), id).toEqual([]);
      expect(ofType(r, 'coo'), id).toEqual([]);
      r.live.dispose();
      // up on an awning (perched high), walking at the treat and then still
      const a = marketRig();
      a.setPhase(id, 'serve', 0.2);
      const q = a.local(id, s.w / 2 - 0.3, s.d / 2 + 2.5);
      a.place(q.x, q.z);
      a.player.perchY = MARKET.HIGH_Y + 0.2;
      a.session.perched = { y: MARKET.HIGH_Y + 0.2 };
      a.step(DT);
      a.walk(T.x - q.x, T.z - q.z, 1.0);
      a.step(DT, Math.round(1.2 / DT));
      a.walk(0, 0, 0);
      a.step(DT, Math.round(2 / DT));
      expect(a.live.actionFor(a.session)).toBeNull();
      expect(ofType(a, 'shoo'), id).toEqual([]);
      expect(ofType(a, 'coo'), id).toEqual([]);
      a.live.dispose();
      // and a partner up there
      const b = marketRig();
      b.setPhase(id, 'serve', 0.2);
      const ben = b.addRemote('ben', q.x, q.z, { y: MARKET.HIGH_Y + 0.2 });
      b.step(DT);
      b.walkRemote(ben, T.x - q.x, T.z - q.z, 1.0);
      b.step(DT, Math.round(1.2 / DT));
      b.walkRemote(ben, 0, 0, 0);
      b.step(DT, Math.round(2 / DT));
      expect(ofType(b, 'shoo'), id).toEqual([]);
      expect(ofType(b, 'coo'), id).toEqual([]);
      b.live.dispose();
    }
  }, 60_000);

  // Step 3, Task 3 (V5): the real awning perch (marketplan.js stallClimb), its own
  // height, while the stall watches: across the whole zone below, then at the
  // treat, then still.
  it('perched on a real awning she is never shooed and never cooed at', () => {
    for (const id of TREAT_STALLS) {
      const s = S(id);
      const T = treatOf(id);
      const { roof } = stallClimb(id);
      const r = marketRig();
      r.setPhase(id, 'serve', 0.1);
      const p0 = r.local(id, -(s.w / 2 + 0.8), s.d / 2 + 1.2);
      const p1 = r.local(id, s.w / 2 + 0.8, s.d / 2 + 1.2);
      r.place(p0.x, p0.z);
      r.player.perchY = roof.y;
      r.session.perched = roof;
      r.step(DT);
      expect(r.stall(id).watching, id).toBe(true);
      r.walk(p1.x - p0.x, p1.z - p0.z, 1.2);
      r.step(DT, Math.round(Math.hypot(p1.x - p0.x, p1.z - p0.z) / 1.2 / DT));
      const q = pos(r.cat);
      r.walk(T.x - q.x, T.z - q.z, 1.0);
      r.step(DT, Math.round(1.0 / DT));
      r.walk(0, 0, 0);
      r.step(DT, Math.round(2 / DT));
      expect(r.live.actionFor(r.session), id).toBeNull();
      expect(ofType(r, 'shoo'), id).toEqual([]);
      expect(ofType(r, 'coo'), id).toEqual([]);
      r.live.dispose();
    }
  }, 60_000);

  it('a grabbed treat is laid out again after REFILL_S, on this device only', () => {
    const id = 'cheese';
    const a = marketRig();
    const b = marketRig();
    a.setPhase(id, 'away', 0.2);
    b.setPhase(id, 'away', 0.2);
    const p = reachSpot(id);
    a.place(p.x, p.z).step(DT);
    expect(a.grab()).toBe(true);
    const ana = b.addRemote('ana', p.x, p.z);
    b.step(DT);
    expect(b.live.remotePick(ana, treatItemId(id))).toBe(true);
    const sa = a.stall(id);
    const sb = b.stall(id);
    expect(sa.treatOut).toBe(false);
    expect(sb.treatOut).toBe(true);
    const far = MARKET_SPAWN;
    a.place(far.x, far.z);
    const n = Math.round((MARKET.REFILL_S - 0.5) / DT);
    a.step(DT, n);
    b.step(DT, n);
    expect(sa.treatOut).toBe(false);
    expect(a.area.treatMeshes[id].visible).toBe(false);
    expect(sb.treatOut).toBe(true);
    expect(b.area.treatMeshes[id].visible).toBe(true);
    a.step(DT, Math.round(1 / DT));
    expect(sa.treatOut).toBe(true);
    expect(sa.refillT).toBe(0);
    expect(a.area.treatMeshes[id].visible).toBe(true);
    a.place(p.x, p.z).step(DT);
    expect(a.live.actionFor(a.session)?.stall).toBe(id);
    a.live.dispose();
    b.live.dispose();
  }, 60_000);

  it('the café crumbs are never watched, and the first treat comes well inside a minute', () => {
    const r = marketRig();
    const cafe = r.stall('cafe');
    const C = treatOf('cafe');
    expect(r.live.keepers.cafe).toBeUndefined();
    expect(cafe.phase).toBeNull();
    expect(Math.hypot(C.x - MARKET_SPAWN.x, C.z - MARKET_SPAWN.z)).toBeLessThan(12);
    r.walk(C.x - r.cat.position.x, C.z - r.cat.position.z, 2.0);
    let grabbedAt = null;
    for (let i = 0; i < Math.round(15 / DT) && grabbedAt === null; i++) {
      r.step(DT);
      expect(cafe.watching).toBe(false);
      if (r.live.actionFor(r.session)?.stall === 'cafe') {
        expect(r.grab()).toBe(true);
        grabbedAt = r.t;
      }
    }
    expect(grabbedAt).not.toBeNull();
    expect(grabbedAt).toBeLessThan(15);
    r.walk(0, 0, 0);
    r.step(DT, Math.round(2 / DT));
    expect(ofType(r, 'eat')).toEqual([{ type: 'eat', stall: 'cafe', kind: 'crumbs', teamWith: null }]);
    expect(r.events.filter((e) => e.stall === 'cafe' && (e.type === 'shoo' || e.type === 'coo'))).toEqual([]);
    expect(cafe.cooing).toBeNull();
    expect(cafe.shooT).toBe(0);
    r.live.dispose();
  }, 60_000);

  it("a cat waiting at a stall's hide gets a safe window to its treat within one cycle", () => {
    const square = buildSquare();
    for (const id of TREAT_STALLS) {
      const s = S(id);
      const T = s.treat;
      const h = s.hide;
      const P = periodOf(id);
      // out in front of the counter's corner post, then at the treat
      const p1 = fromStall(s, s.w / 2 + 0.5, s.d / 2 + 0.6);
      expect(isWalkableAt(square.area, h.x, h.z), id).toBe(true);
      expect(isWalkableAt(square.area, p1.x, p1.z), id).toBe(true);
      for (let seed = 1; seed <= 20; seed++) {
        const r = marketRig({ seed, clock: 1e9 + seed * 7.3, ...square });
        r.place(h.x, h.z).step(DT);
        // she waits under the trestle until the stallholder turns to the back shelf
        let waited = 0;
        while (r.stall(id).look.phase !== 'turn' && waited < P) {
          r.step(DT);
          waited += DT;
        }
        expect(waited, `${id} seed ${seed}`).toBeLessThan(P);
        let leg = 0;
        let got = null;
        for (let i = 0; i < 90 && got === null; i++) {
          const c = r.cat.position;
          if (leg === 0 && Math.hypot(c.x - p1.x, c.z - p1.z) < 0.08) leg = 1;
          const g = leg === 0 ? p1 : T;
          r.walk(g.x - c.x, g.z - c.z, 2.0);
          r.step(DT);
          if (r.live.actionFor(r.session)?.stall === id) got = r.grab();
        }
        expect(got, `${id} seed ${seed}`).toBe(true);
        expect(ofType(r, 'shoo'), `${id} seed ${seed}`).toEqual([]);
        r.live.dispose();
        r.cat.removeFromParent();
      }
    }
  }, 90_000);

  it("the partner's treat pick shows a munch on her and leaves my treats and my mouth alone", () => {
    const id = 'fish';
    const r = marketRig();
    const p = reachSpot(id);
    const ben = r.addRemote('ben', p.x, p.z);
    r.step(DT);
    expect(r.live.remotePick(ben, 'sock-3')).toBe(false);
    expect(r.live.remotePick(ben, treatItemId('flowers'))).toBe(false);
    expect(r.live.remotePick({ playerId: 'stranger', group: new THREE.Group() }, treatItemId(id))).toBe(false);
    expect(r.events).toEqual([]);
    expect(r.live.remotePick(ben, treatItemId(id))).toBe(true);
    expect(ofType(r, 'remote-eat')).toEqual([{ type: 'remote-eat', stall: id, who: 'ben' }]);
    expect(r.stall(id).treatOut).toBe(true);
    expect(r.area.treatMeshes[id].visible).toBe(true);
    expect(r.session.carry.mouth.held).toBeNull();
    r.step(DT, 10);
    const m = r.scene.getObjectByName('marketMouth:ben:fishhead');
    expect(m?.visible).toBe(true);
    expect(m.position.distanceTo(ben.group.position)).toBeLessThan(0.8);
    r.step(DT, Math.round((MARKET.HOLD_S + MARKET.MUNCH_S) / DT) + 3);
    expect(m.parent).toBeNull();
    expect(r.session.carry.mouth.held).toBeNull();
    expect(r.live.treats).toBe(0);
    expect(r.stall(id).treatOut).toBe(true);
    expect(ofType(r, 'eat')).toEqual([]);
    expect(r.live.actionFor(r.session), 'my own fish head is still out for me').toBeNull(); // she is at the spawn
    // a partner who leaves mid-munch takes the munch with them
    expect(r.live.remotePick(ben, treatItemId('baker'))).toBe(true);
    r.step(DT, 5);
    const m2 = r.scene.getObjectByName('marketMouth:ben:sausageroll');
    expect(m2?.visible).toBe(true);
    r.removeRemote(ben);
    expect(() => r.step(DT, 30)).not.toThrow();
    expect(m2.parent).toBeNull();
    expect(r.live.remotePick(ben, treatItemId(id)), 'gone from the list').toBe(false);
    r.live.dispose();
  }, 60_000);

  it('teamwork: a pick from the stall cooing at me is my teamwork, and only from that stall', () => {
    const id = 'baker';
    const s = S(id);
    const r = marketRig();
    const st = r.stall(id);
    r.setPhase(id, 'serve', 0);
    const p = r.local(id, 0, s.d / 2 + 1.5);
    r.place(p.x, p.z);
    const ben = r.addRemote('ben', MARKET_SPAWN.x + 1, MARKET_SPAWN.z);
    expect(until(r, () => st.cooing, 2)).toBeLessThan(2);
    expect(st.cooing.who).toBe('me');
    expect(r.live.remotePick(ben, treatItemId('fish'))).toBe(true);
    expect(ofType(r, 'team')).toEqual([]);
    expect(r.live.remotePick(ben, treatItemId(id))).toBe(true);
    expect(ofType(r, 'team')).toEqual([{ type: 'team', stall: id, partner: 'ben' }]);
    // within TEAM_GRACE_S of the coo's end it still counts, after that it does not
    expect(until(r, () => !st.cooing, MARKET.COO_S + 0.5)).toBeLessThan(MARKET.COO_S + 0.5);
    r.step(DT, Math.round((0.5 * MARKET.TEAM_GRACE_S) / DT));
    r.live.remotePick(ben, treatItemId(id));
    expect(ofType(r, 'team')).toHaveLength(2);
    r.step(DT, Math.round(MARKET.TEAM_GRACE_S / DT));
    r.live.remotePick(ben, treatItemId(id));
    expect(ofType(r, 'team')).toHaveLength(2);
    expect(ofType(r, 'remote-eat')).toHaveLength(4);
    r.live.dispose();
  }, 60_000);

  it('a hop refused at its first step is no hop: she stays put, and the shoo says hopped: false', () => {
    for (const id of TREAT_STALLS) {
      // something solid right behind her (her back to a crate)
      const r = marketRig({ isFree: () => false });
      r.setPhase(id, 'serve', 0.3);
      const p = reachSpot(id);
      r.place(p.x, p.z).step(DT);
      expect(r.grab()).toBe(false);
      expect(ofType(r, 'shoo'), id).toEqual([{ type: 'shoo', stall: id, who: 'me', laugh: false, hopped: false }]);
      r.step(DT, Math.round(MARKET.HOP_S / DT) + 3);
      expect(pos(r.cat)).toEqual(p);
      expect(r.session.landTime, 'no landing: she never left the ground').toBe(0);
      // pressed again and again: still no hop
      expect(r.grab()).toBe(false);
      expect(ofType(r, 'shoo').map((e) => e.hopped)).toEqual([false, false]);
      expect(r.stall(id).treatOut).toBe(true);
      r.live.dispose();
    }
    // a hop that begins has moved her already, a little, along the stall's face
    const id = 'fish';
    const r = marketRig();
    r.setPhase(id, 'serve', 0.3);
    const p = reachSpot(id);
    r.place(p.x, p.z).step(DT);
    expect(r.grab()).toBe(false);
    expect(ofType(r, 'shoo')[0].hopped).toBe(true);
    const moved = along(S(id), p, pos(r.cat));
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(0.1);
    r.live.dispose();
  }, 60_000);

  it('the button pressed again mid-shoo keeps the broom waving where it is, and one hop at a time', () => {
    const id = 'fish';
    const s = S(id);
    const p = reachSpot(id);
    const again = (r) => r.live.act({ kind: 'grab', stall: id, prompt: '' }, r.session, { dropHeld: r.dropHeld });
    // the hop blocked at once (something solid behind her), so she is still in
    // reach with the broom up: pressed again, the wave keeps its age, no snap
    {
      const r = marketRig({ isFree: () => false });
      const st = r.stall(id);
      const arm = r.live.keepers[id].arm;
      r.setPhase(id, 'serve', 0.3);
      r.place(p.x, p.z).step(DT);
      expect(r.grab()).toBe(false);
      r.step(DT, 8);
      const shooT = st.shooT;
      const armUp = arm.rotation.z;
      expect(r.live.actionFor(r.session)?.stall).toBe(id);
      expect(again(r)).toBe(false);
      expect(st.shooT, 'the wave keeps its age').toBe(shooT);
      expect(ofType(r, 'shoo')).toHaveLength(2);
      r.step(DT);
      expect(Math.abs(arm.rotation.z - armUp), 'no snap of the arm').toBeLessThan(0.2);
      r.live.dispose();
    }
    // pressed again a frame into the hop: no second hop
    {
      const r = marketRig();
      r.setPhase(id, 'serve', 0.3);
      r.place(p.x, p.z).step(DT);
      expect(r.grab()).toBe(false);
      r.step(DT);
      expect(r.live.actionFor(r.session)?.stall).toBe(id);
      expect(again(r)).toBe(false);
      expect(ofType(r, 'shoo')[1]).toEqual({ type: 'shoo', stall: id, who: 'me', laugh: false, hopped: false });
      r.step(DT, Math.round(MARKET.HOP_S / DT) + 3);
      expect(along(s, p, pos(r.cat)), 'one hop, not two').toBeCloseTo(MARKET.HOP_DIST, 6);
      r.live.dispose();
    }
  });

  it('the button while she is being cooed at is a shoo, even with the stallholder turned away underneath (M4)', () => {
    const id = 'fish';
    const r = marketRig();
    const st = r.stall(id);
    r.setPhase(id, 'serve', STALL_TIMES[id].serve - 1.2);
    const p = reachSpot(id);
    r.place(p.x, p.z);
    expect(until(r, () => st.cooing, 2)).toBeLessThan(2);
    r.step(DT, Math.round(2.5 / DT));
    expect(st.cooing?.who).toBe('me');
    expect(st.look.watching, 'turned away by the rhythm').toBe(false);
    expect(r.grab()).toBe(false);
    expect(ofType(r, 'shoo')).toEqual([{ type: 'shoo', stall: id, who: 'me', laugh: false, hopped: true }]);
    expect(st.treatOut).toBe(true);
    expect(r.session.carry.mouth.held).toBeNull();
    expect(st.cooing).toBeNull();
    r.live.dispose();
  });

  it("the eater's teamwork counts within TEAM_GRACE_S of the partner's coo ending, and not after", () => {
    const id = 'baker';
    const s = S(id);
    for (const [wait, team] of [[0.5, 'ben'], [MARKET.TEAM_GRACE_S + 0.5, null]]) {
      const r = marketRig();
      const st = r.stall(id);
      r.setPhase(id, 'serve', STALL_TIMES[id].serve - 1.2);
      const b = r.local(id, 0, s.d / 2 + 1.5);
      const ben = r.addRemote('ben', b.x, b.z);
      expect(until(r, () => st.cooing, 2)).toBeLessThan(2);
      expect(st.cooing.who).toBe('ben');
      r.step(DT, Math.round(2.5 / DT)); // the rhythm has turned away underneath
      r.walkRemote(ben, s.face.x, s.face.z, 1.0); // Ben walks off: the coo ends, no shoo
      r.step(DT, 2);
      expect(st.cooing).toBeNull();
      r.walkRemote(ben, 0, 0, 0);
      r.step(DT, Math.round(wait / DT));
      expect(st.look.watching).toBe(false);
      const p = reachSpot(id);
      r.place(p.x, p.z);
      expect(r.grab()).toBe(true);
      r.step(DT, Math.round(2 / DT));
      expect(ofType(r, 'eat'), `after ${wait} s`).toEqual([{ type: 'eat', stall: id, kind: 'sausageroll', teamWith: team }]);
      expect(ofType(r, 'shoo')).toEqual([]);
      r.live.dispose();
    }
  }, 60_000);

  it('a partner who leaves the walk mid-coo ends it, and the stall notices again once it has turned back', () => {
    const id = 'fish';
    const s = S(id);
    const T = treatOf(id);
    const r = marketRig();
    const st = r.stall(id);
    r.setPhase(id, 'serve', 0);
    const b = r.local(id, 0, s.d / 2 + 1.5);
    const ben = r.addRemote('ben', b.x, b.z);
    expect(until(r, () => st.cooing, 2)).toBeLessThan(2);
    expect(st.cooing.who).toBe('ben');
    r.removeRemote(ben);
    expect(() => r.step(DT)).not.toThrow();
    expect(st.cooing).toBeNull();
    // and she, walking straight at the treat while it is watched, is shooed
    // once the stallholder has turned back (COO_BACK_S), not before
    const p = r.local(id, s.w / 2 - 0.3, s.d / 2 + 3.0);
    r.place(p.x, p.z).step(DT);
    r.walk(T.x - p.x, T.z - p.z, 1.2);
    const tShoo = until(r, () => ofType(r, 'shoo').length > 0, 2) + DT;
    expect(tShoo).toBeGreaterThanOrEqual(MARKET.COO_BACK_S - 2 * DT);
    expect(tShoo).toBeLessThan(MARKET.COO_BACK_S + 0.2);
    expect(ofType(r, 'shoo')[0].who).toBe('me');
    expect(r.live.remotePick(ben, treatItemId(id))).toBe(false);
    r.live.dispose();
  });

  it('a coo that ends turns the stallholder back noticing nobody for COO_BACK_S: a partner creeping in is not shooed in that second, and is after it', () => {
    const id = 'baker';
    const s = S(id);
    const T = treatOf(id);
    for (const ends of ['walks off', 'leaves']) {
      const r = marketRig();
      const st = r.stall(id);
      r.setPhase(id, 'serve', 0);
      // Ben stops off the counter's far side, in its zone: cooed at
      const b = r.local(id, -s.w / 2 - 0.5, s.d / 2 + 1.2);
      const ben = r.addRemote('ben', b.x, b.z);
      expect(until(r, () => st.cooing, 2)).toBeLessThan(2);
      expect(st.cooing.who).toBe('ben');
      // she creeps in at the treat, crouched, while they coo at Ben
      const p = r.local(id, s.w / 2 - 0.3, s.d / 2 + 1.55);
      r.player.stalking = true;
      r.place(p.x, p.z).step(DT);
      r.walk(T.x - p.x, T.z - p.z, 0.4);
      r.step(DT, 6);
      expect(ofType(r, 'shoo')).toEqual([]);
      // the coo ends with no shoo (Ben walks off, or leaves the walk); she keeps creeping
      if (ends === 'walks off') r.walkRemote(ben, s.face.x, s.face.z, 1.0);
      else r.removeRemote(ben);
      expect(until(r, () => !st.cooing, 1), ends).toBeLessThan(0.2);
      expect(st.look.watching, 'the rhythm is serving').toBe(true);
      expect(st.watching, `${ends}: turning back, noticing nobody`).toBe(false);
      const tShoo = until(r, () => ofType(r, 'shoo').length > 0, 3) + DT;
      expect(tShoo, ends).toBeGreaterThanOrEqual(MARKET.COO_BACK_S - 2 * DT);
      expect(tShoo, ends).toBeLessThan(MARKET.COO_BACK_S + 0.2);
      expect(ofType(r, 'shoo'), ends).toEqual([{ type: 'shoo', stall: id, who: 'me', laugh: false, hopped: true }]);
      r.live.dispose();
    }
    // and the button in that second is a grab, not a shoo: they are not looking
    const r = marketRig();
    const st = r.stall(id);
    r.setPhase(id, 'serve', 0);
    const b = r.local(id, -s.w / 2 - 0.5, s.d / 2 + 1.2);
    const ben = r.addRemote('ben', b.x, b.z);
    expect(until(r, () => st.cooing, 2)).toBeLessThan(2);
    const q = reachSpot(id);
    r.place(q.x, q.z).step(DT);
    r.walkRemote(ben, s.face.x, s.face.z, 1.0);
    expect(until(r, () => !st.cooing, 1)).toBeLessThan(0.2);
    r.step(DT, Math.round(0.5 / DT));
    expect(r.grab()).toBe(true);
    expect(ofType(r, 'shoo')).toEqual([]);
    r.live.dispose();
  }, 60_000);

  it('a treat in her mouth keeps the idle poses away: her idle clock is held at 0 from the grab to the eat', () => {
    for (const id of ['cafe', 'fish', 'milk']) {
      const r = marketRig();
      if (id !== 'cafe') r.setPhase(id, 'away', 0.2);
      const p = id === 'cafe' ? { x: treatOf(id).x - 0.5, z: treatOf(id).z } : reachSpot(id); // west of the crumbs, clear of the table's foot
      r.place(p.x, p.z).step(DT);
      // she has stood still long enough to nap (avatar.js counts idleTime up after the life each frame)
      r.session.idleTime = 30;
      expect(r.grab(), id).toBe(true);
      expect(r.session.idleTime, `${id}: the grab`).toBe(0);
      let most = 0;
      while (ofType(r, 'eat').length === 0 && r.t < 5) {
        r.session.idleTime += DT; // the avatar's own count, as in the walk
        r.step(DT);
        most = Math.max(most, r.session.idleTime);
      }
      expect(ofType(r, 'eat'), id).toHaveLength(1);
      expect(most, `${id}: never long enough to groom (6 s), let alone sit or nap`).toBeLessThanOrEqual(DT + 1e-9);
      r.live.dispose();
    }
  });

  it('the hop rises and falls (session.hopLift, which avatar.js draws her at), and is 0 once she lands', () => {
    const id = 'fish';
    const r = marketRig();
    r.setPhase(id, 'serve', 0.3);
    const p = reachSpot(id);
    r.place(p.x, p.z).step(DT);
    expect(r.session.hopLift ?? 0).toBe(0);
    expect(r.grab()).toBe(false);
    const lifts = [];
    for (let i = 0; i < Math.round(MARKET.HOP_S / DT) + 3; i++) { r.step(DT); lifts.push(r.session.hopLift); }
    const top = Math.max(...lifts);
    expect(top).toBeGreaterThan(0.15);
    expect(top).toBeLessThanOrEqual(0.2 + 1e-9);
    expect(lifts.indexOf(top)).toBeGreaterThan(0);
    expect(lifts.indexOf(top)).toBeLessThan(lifts.length - 3);
    expect(r.session.hopLift).toBe(0);
    expect(r.session.landTime).toBe(0.12);
    // a hop refused at its first step never lifts her
    const q = marketRig({ isFree: () => false });
    q.setPhase(id, 'serve', 0.3);
    q.place(p.x, p.z).step(DT);
    expect(q.grab()).toBe(false);
    q.step(DT, Math.round(MARKET.HOP_S / DT) + 3);
    expect(q.session.hopLift ?? 0).toBe(0);
    r.live.dispose();
    q.live.dispose();
  });

  it("a hop from against the treat's stand slides off it, never refused for touching it", () => {
    for (const id of TREAT_STALLS) {
      const s = S(id);
      const r = marketRig();
      r.setPhase(id, 'serve', 0.3);
      // touching the stand (as the walk leaves her), a little nearer the counter
      // than the treat, so a step straight back would brush the stand
      const T = treatOf(id);
      const t = toStall(s, T.x, T.z);
      const phi = -3 * Math.PI / 180;
      const k = 0.2 + CAT_RADIUS + 1e-6;
      const p = fromStall(s, t.lx + k * Math.cos(phi), t.lz + k * Math.sin(phi));
      expect(isWalkableAt(r.area, p.x, p.z), id).toBe(true);
      expect(isWalkableAt(r.area, p.x + s.face.x * 0.05, p.z + s.face.z * 0.05), `${id}: straight back brushes the stand`).toBe(false);
      r.place(p.x, p.z).step(DT);
      expect(r.grab()).toBe(false);
      expect(ofType(r, 'shoo'), id).toEqual([{ type: 'shoo', stall: id, who: 'me', laugh: false, hopped: true }]);
      for (let i = 0; i < Math.round(MARKET.HOP_S / DT) + 3; i++) {
        r.step(DT);
        expect(isWalkableAt(r.area, r.cat.position.x, r.cat.position.z), id).toBe(true);
      }
      expect(along(s, p, pos(r.cat)), id).toBeGreaterThan(0.8 * MARKET.HOP_DIST);
      expect(r.session.landTime).toBe(0.12);
      r.live.dispose();
    }
  }, 60_000);

  it('a resumed walk sets the tally to the treats it already paid for', () => {
    const r = marketRig();
    const log = { entries: () => [['market-treat-fish', 1], ['market-treat-cafe', 1], ['market-team-baker', 1], ['found-sock', 2]] };
    r.live.restore(log);
    expect(r.live.treats).toBe(2);
    r.live.restore({ entries: () => [] });
    expect(r.live.treats).toBe(0);
    r.live.dispose();
  });

  it('the life draws no Math.random and nothing but its seed', () => {
    const rigs = [0, 1].map(() => {
      const r = marketRig({ seed: 11 });
      return { r, ben: r.addRemote('ben', MARKET_SPAWN.x + 1, MARKET_SPAWN.z) };
    });
    const sneak = ({ r, ben }) => {
      const C = treatOf('cafe');
      r.place(C.x, C.z + 0.5).step(DT);
      r.grab();
      r.step(DT, 70);
      r.setPhase('baker', 'serve', 0.3);
      const p = reachSpot('baker');
      r.place(p.x, p.z).step(DT);
      r.grab();
      r.step(DT, 45);
      r.setPhase('fish', 'away', 0.2);
      const f = reachSpot('fish');
      r.place(f.x, f.z).step(DT);
      r.grab();
      r.step(DT, 70);
      r.setPhase('cheese', 'serve', 0);
      const c = r.local('cheese', 0, S('cheese').d / 2 + 1.5);
      r.place(c.x, c.z);
      r.step(DT, 45);
      r.live.remotePick(ben, treatItemId('milk'));
      r.live.remotePick(ben, treatItemId('cheese'));
      r.step(DT, 70);
      return r.events.map((e) => ({ ...e }));
    };
    const random = vi.spyOn(Math, 'random');
    const dateNow = vi.spyOn(Date, 'now');
    const perfNow = vi.spyOn(performance, 'now');
    let a;
    let b;
    try {
      a = sneak(rigs[0]);
      b = sneak(rigs[1]);
      for (const { r } of rigs) r.live.dispose();
      expect(random).not.toHaveBeenCalled();
      expect(dateNow).not.toHaveBeenCalled();
      expect(perfNow).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
      dateNow.mockRestore();
      perfNow.mockRestore();
    }
    expect(b).toEqual(a);
    const types = new Set(a.map((e) => e.type));
    for (const t of ['grab', 'eat', 'shoo', 'coo', 'remote-eat', 'team']) expect(types.has(t), t).toBe(true);
  }, 60_000);
});

// the world box of what shows of an object (hidden parts left out)
function shownBox(obj) {
  const box = new THREE.Box3();
  obj.updateWorldMatrix(true, true);
  obj.traverseVisible((m) => {
    if (!m.isMesh) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)); // this mesh alone, not its children
  });
  return box;
}

// plan-local (lx, lz) of a stall to the world
function fromPlan(s, lx, lz) {
  return { x: s.at.x + lx * -s.face.z + lz * s.face.x, z: s.at.z + lx * s.face.x + lz * s.face.z };
}

// the highest point of a stall's own drawing over its counter and in front of
// it (plan-local |lx| <= w/2, lz from the keeper's spot forward): every vertex
// of the stall group's meshes there
function topOver(scene, id, s) {
  const stall = scene.children.find((o) => o.userData.stall === id);
  stall.updateWorldMatrix(true, true);
  const v = new THREE.Vector3();
  let top = -Infinity;
  stall.traverse((m) => {
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      const { lx, lz } = toStall(s, v.x, v.z);
      if (Math.abs(lx) <= s.w / 2 && lz >= -s.d / 2 + 0.45) top = Math.max(top, v.y);
    }
  });
  return top;
}

// the ids of the scene's top-level children, in order
function scene0(scene) {
  return scene.children.map((o) => o.id);
}

// =============================================================================
// The tours (Task 14): the owner's two films (verify-market.html ?live=1&drive=1),
// driven here headless through the rig with the page's own pilot.
// =============================================================================

const { createMarketPilot, MARKET_TOURS } = await import('../src/world/marketpilot.js');
const { handleMarketEvent, createMarketToasts } = await import('../src/game/marketplay.js');
const { createDiscoveryLog } = await import('../src/discoveries.js');
const { MARKET_LINES } = await import('../src/marketwords.js');

// One device's walk: the rig, a discovery log that pays into `points`, and the
// walk's handleMarketEvent on every event (its toasts kept).
function tourDevice(tour, square, x, z) {
  const paid = { points: 0 };
  const log = createDiscoveryLog({ addPoints: (p) => { paid.points += p; } });
  log.startWalk();
  const toasts = [];
  const hud = { toast: (t) => toasts.push(t) };
  let r = null;
  const marketToasts = createMarketToasts({ hud, now: () => r.t });
  r = marketRig({
    seed: tour.seed, clock: tour.clock, ...square,
    onEvent: (e) => handleMarketEvent(e, { hud, audio: null, log, session: r.session, ...marketToasts }),
  });
  r.place(x, z);
  return { r, log, paid, toasts };
}

// The tour as the page plays it: her device (A) and, for a tour with a
// partner, the partner's own device (B), each cat walked the same way on both
// (as the wire would show it), her grab reaching B as the carry-pick does.
function playTour(name) {
  const tour = MARKET_TOURS[name];
  const square = buildSquare();
  const A = tourDevice(tour, square, tour.start.x, tour.start.z);
  let B = null, partner = null, meOnB = null;
  if (tour.partner) {
    const p = tour.partner;
    partner = A.r.addRemote(p.id, p.start.x, p.start.z);
    partner.petName = p.name;
    B = tourDevice(tour, square, p.start.x, p.start.z);
    B.r.session.playerId = p.id;
    meOnB = B.r.addRemote(tour.me.id, tour.start.x, tour.start.z);
    meOnB.petName = tour.me.name;
  }
  const driver = {
    events: A.r.events,
    pos: (who) => (who === 'me' ? A.r.cat.position : partner.group.position),
    move(who, dx, dz, speed, crouch) {
      if (who === 'me') {
        A.r.walk(dx, dz, speed);
        A.r.player.stalking = crouch;
        if (B) { B.r.walkRemote(meOnB, dx, dz, speed); meOnB.pose = crouch ? 'stalk' : 'follow'; }
      } else {
        A.r.walkRemote(partner, dx, dz, speed);
        partner.pose = crouch ? 'stalk' : 'follow';
        B.r.walk(dx, dz, speed);
        B.r.player.stalking = crouch;
      }
    },
    stall: (id) => A.r.stall(id),
    reach: () => A.r.live.actionFor(A.r.session)?.stall ?? null,
    press() {
      const stall = driver.reach();
      const took = A.r.grab();
      if (took === true && B) B.r.live.remotePick(meOnB, treatItemId(stall));
      return took;
    },
  };
  const pilot = createMarketPilot(tour);
  let res = null;
  let frames = 0;
  for (; frames < 4000; frames++) {
    res = pilot.step(DT, driver);
    if (res.done) break;
    A.r.step(DT);
    B?.r.step(DT);
  }
  return { tour, A, B, res, frames };
}

describe('she looks up at the stallholder cooing at her (Market step 3, Task 7)', () => {
  // the stallholder's face: over the keeper's spot, 0.92 of the way up its posed head
  const faceOf = (r, id) => {
    const g = r.live.keepers[id].group;
    const top = new THREE.Box3().setFromObject(g).max.y;
    return { x: g.position.x, y: g.position.y + (top - g.position.y) * 0.92, z: g.position.z };
  };

  it('while she is cooed at she looks up at the stallholder, and stops when the coo ends', () => {
    const id = 'fish';
    const s = S(id);
    const r = marketRig();
    const st = r.stall(id);
    r.setPhase(id, 'serve', 0);
    const p = r.local(id, 0.4, s.d / 2 + 1.5);
    r.place(p.x, p.z);
    r.step(DT);
    expect(r.session.lookAt ?? null, 'nobody cooing: nothing to look at').toBeNull();
    expect(until(r, () => st.cooing, 2)).toBeLessThan(2);
    expect(st.cooing.who).toBe('me');
    const look = r.session.lookAt;
    expect(look, 'cooed at: a target').toBeTruthy();
    const face = faceOf(r, id);
    expect(look.x).toBeCloseTo(face.x, 6);
    expect(look.z).toBeCloseTo(face.z, 6);
    expect(Math.abs(look.y - face.y), 'at the face').toBeLessThan(0.03);
    expect(look.y, 'up: above her').toBeGreaterThan(1.3);
    // the same object every frame of the coo (reused, nothing made per frame)
    for (let i = 0; i < 30; i++) {
      r.step(DT);
      if (!st.cooing) break;
      expect(r.session.lookAt).toBe(look);
    }
    // the coo runs out: no more target, and the next stop's coo has it again
    expect(until(r, () => !st.cooing, MARKET.COO_S + 1)).toBeLessThan(MARKET.COO_S + 1);
    expect(r.session.lookAt).toBeNull();
    r.step(DT, 30);
    expect(r.session.lookAt).toBeNull();
    // she walks off mid-coo: the look ends with it, that frame
    r.walk(s.face.x, s.face.z, 1.0);
    r.step(DT, 12);
    r.walk(0, 0, 0);
    expect(until(r, () => st.cooing, periodOf(id) + 2)).toBeLessThan(periodOf(id) + 2);
    expect(r.session.lookAt).toBe(look);
    r.walk(s.face.z, -s.face.x, 1.0);
    r.step(DT);
    expect(st.cooing).toBeNull();
    expect(r.session.lookAt).toBeNull();
    // and the shoo (the button while cooed at) ends it at once, too
    r.walk(0, 0, 0);
    const q = reachSpot(id);
    r.place(q.x, q.z);
    expect(until(r, () => st.cooing, periodOf(id) + 2)).toBeLessThan(periodOf(id) + 2);
    expect(r.session.lookAt).toBe(look);
    expect(r.grab()).toBe(false);
    expect(ofType(r, 'shoo').length).toBeGreaterThan(0);
    expect(r.session.lookAt).toBeNull();
    // dispose leaves no target behind
    r.step(DT, 60);
    r.live.dispose();
    expect(r.session.lookAt ?? null).toBeNull();
    expect(r.session.net.sendEvent, 'nothing is sent').not.toHaveBeenCalled();
  }, 60_000);

  it('cooed, she stays standing: no groom or sit', () => {
    const id = 'baker';
    const s = S(id);
    const r = marketRig();
    const st = r.stall(id);
    r.setPhase(id, 'serve', 0);
    const p = r.local(id, 0, s.d / 2 + 1.4);
    r.place(p.x, p.z);
    r.session.idleTime = 0;
    let most = 0;
    let cooFrames = 0;
    let ended = false;
    for (let i = 0; i < Math.round((MARKET.STILL_S + MARKET.COO_S + 1) / DT); i++) {
      r.session.idleTime += DT; // avatar.js counts it up after the life, every frame
      r.step(DT);
      if (st.cooing) {
        cooFrames++;
        most = Math.max(most, r.session.idleTime);
      } else if (cooFrames > 0) ended = true;
    }
    expect(cooFrames * DT).toBeGreaterThan(MARKET.COO_S - 2 * DT);
    expect(ended).toBe(true);
    // a napper grooms after 3 s still and an easy-going cat after 6: held at 0, neither ever comes
    expect(most, 'held at 0 the whole coo').toBeLessThanOrEqual(1e-9);
    // after the coo her idle clock runs again (no hold without a coo)
    const after = r.session.idleTime;
    r.session.idleTime += DT;
    r.step(DT);
    expect(r.session.idleTime).toBeGreaterThan(after);
    r.live.dispose();
  }, 60_000);

  it("the partner's cat cooed at on this screen looks up too", () => {
    const id = 'fish';
    const s = S(id);
    const r = marketRig();
    const st = r.stall(id);
    r.setPhase(id, 'serve', 0);
    const b = r.local(id, -0.3, s.d / 2 + 1.5);
    const ben = r.addRemote('ben', b.x, b.z);
    expect(until(r, () => st.cooing, 2)).toBeLessThan(2);
    expect(st.cooing.who).toBe('ben');
    const look = ben.lookAt;
    expect(look, "the partner's cat has a target").toBeTruthy();
    const face = faceOf(r, id);
    expect(look.x).toBeCloseTo(face.x, 6);
    expect(look.z).toBeCloseTo(face.z, 6);
    expect(Math.abs(look.y - face.y)).toBeLessThan(0.03);
    expect(r.session.lookAt ?? null, 'not me: my own cat looks nowhere').toBeNull();
    r.step(DT, 10);
    expect(ben.lookAt).toBe(look);
    // she walks off: the coo ends and so does the look
    r.walkRemote(ben, s.face.x, s.face.z, 1.0);
    expect(until(r, () => !st.cooing, 1)).toBeLessThan(0.2);
    expect(ben.lookAt).toBeNull();
    // cooed again, then she leaves the walk: the look goes with her
    r.walkRemote(ben, 0, 0, 0);
    expect(until(r, () => st.cooing, periodOf(id) + 2)).toBeLessThan(periodOf(id) + 2);
    expect(ben.lookAt).toBe(look);
    r.removeRemote(ben);
    r.step(DT);
    expect(ben.lookAt).toBeNull();
    expect(r.session.net.sendEvent, 'nothing is sent').not.toHaveBeenCalled();
    r.live.dispose();
  }, 60_000);
});

describe('the tours (Task 14)', () => {
  it('both tours finish and pay what the film shows', () => {
    const sneak = playTour('sneak');
    expect(sneak.res.failed).toBeNull();
    expect(sneak.res.done).toBe(true);
    const A = sneak.A;
    expect(A.r.live.treats).toBe(3);
    expect(ofType(A.r, 'eat').map((e) => [e.stall, e.teamWith])).toEqual([['cafe', null], ['fish', null], ['baker', null]]);
    const shoos = ofType(A.r, 'shoo');
    expect(shoos).toEqual([{ type: 'shoo', stall: 'baker', who: 'me', laugh: false, hopped: true }]);
    expect(A.paid.points).toBe(3 * 6);
    for (const id of ['cafe', 'fish', 'baker']) expect(A.log.count(`market-treat-${id}`), id).toBe(1);
    expect(A.toasts).toContain(MARKET_LINES.shoo());
    expect(sneak.res.tally).toBe(true); // the film's last caption carries the tally

    const team = playTour('team');
    expect(team.res.failed).toBeNull();
    const a = team.A, b = team.B;
    const p = team.tour.partner;
    // her device: the coo is at the partner, she eats the cheddar with her, the treat is paid
    expect(ofType(a.r, 'coo')).toEqual([{ type: 'coo', stall: 'cheese', who: p.id }]);
    expect(ofType(a.r, 'eat')).toEqual([{ type: 'eat', stall: 'cheese', kind: 'cheddar', teamWith: p.id }]);
    expect(ofType(a.r, 'shoo')).toEqual([]);
    expect(a.log.count('market-treat-cheese')).toBe(1);
    expect(a.log.count('market-team-cheese')).toBe(0);
    expect(a.paid.points).toBe(6);
    expect(a.toasts).toContain(MARKET_LINES.teamEater(p.name));
    // the partner's device: cooed at herself, then the teamwork, and no treat
    expect(ofType(b.r, 'coo')).toEqual([{ type: 'coo', stall: 'cheese', who: 'me' }]);
    expect(ofType(b.r, 'team')).toEqual([{ type: 'team', stall: 'cheese', partner: team.tour.me.id }]);
    expect(ofType(b.r, 'shoo')).toEqual([]);
    expect(b.log.count('market-team-cheese')).toBe(1);
    expect(b.log.count('market-treat-cheese')).toBe(0);
    expect(b.r.live.treats).toBe(0);
    expect(b.paid.points).toBe(6);
    expect(b.toasts).toContain(MARKET_LINES.coo());
    for (const t of [sneak, team]) { t.A.r.live.dispose(); t.B?.r.live.dispose(); }
  }, 90_000);
});
