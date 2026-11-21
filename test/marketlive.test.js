import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { marketRig, buildSquare } from './helpers/marketrig.js';

// =============================================================================
// The Market's life (step 2): the stallholders behind their counters, turning
// to the back shelf in their own rhythm, the "busy" bubble over their heads
// (Task 11). Task 12 adds everything a cat does; Tasks 13 and 14 the walk and
// the film. Positions come from the plan (marketplan.js), the rhythm from the
// rules (marketrules.js): nothing here is hard-coded.
// =============================================================================

const { createMarketLive } = await import('../src/marketlive.js');
const { twolegKeeper } = await import('../src/marketkeeper.js');
const { TREAT_ITEM_PREFIX, treatItemId, treatStallOf, NO_MARKET } = await import('../src/marketnone.js');
const { STALLS, TREAT_STALLS, stallById, toStall } = await import('../src/world/marketplan.js');
const { MARKET, stallOffsets, stallPhase, periodOf } = await import('../src/marketrules.js');
const { isWalkableAt } = await import('../src/player.js');
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
      expect(() => createMarketLive(scene, { ...area, keepers }, { seed: 1, now: () => 0 }), id).toThrow(id);
    }
    // a guarded stall needs its roof's height for the bubble (a serve-only one has no bubble)
    for (const roof of [undefined, NaN, Infinity, '2.8']) {
      const keepers = { ...area.keepers, milk: { ...area.keepers.milk, roof } };
      expect(() => createMarketLive(scene, { ...area, keepers }, { seed: 1, now: () => 0 }), String(roof)).toThrow('milk');
    }
    const keepers = { ...area.keepers, fruit: { ...area.keepers.fruit, roof: undefined } };
    createMarketLive(scene, { ...area, keepers }, { seed: 1, now: () => 0 }).dispose();
    expect(scene.children).toHaveLength(before);
  });

  it('a figure that fails half way leaves nothing behind', () => {
    const { scene, area } = buildSquare();
    const before = scene.children.length;
    const made = [];
    let n = 0;
    const figure = (spot) => {
      if (++n === 4) throw new Error('no fourth figure');
      const k = twolegKeeper(spot);
      const dispose = vi.fn(k.dispose);
      made.push(dispose);
      return { ...k, dispose };
    };
    expect(() => createMarketLive(scene, area, { seed: 1, now: () => 0, figure })).toThrow('no fourth figure');
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
    const live = createMarketLive(scene, area, { seed: 7, now: () => 1e9 });
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
    expect(theirs.length).toBeGreaterThanOrEqual(6 * 3 + 4 * 3); // three meshes a person, a broom of three for each treat stall
    for (const m of theirs) {
      expect(m.castShadow, m.name).toBe(false);
      expect(m.userData.noCast, m.name).toBe(true);
    }
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

  it('creating the stallholders draws nothing from Math.random', () => {
    const { scene, area } = buildSquare();
    const ctx = { cat: new THREE.Group(), player: { speed: 0, stalking: false, perchY: 0 }, session: { remotes: { list: [] } } };
    const random = vi.spyOn(Math, 'random');
    try {
      let clock = 1e9;
      const live = createMarketLive(scene, area, { seed: 7, now: () => clock });
      for (let i = 0; i < 300; i++) { clock += DT; live.update(DT, i * DT, ctx); }
      live.dispose();
      // and the figure on its own
      twolegKeeper({ x: 1, z: 2, yaw: 0.5 }).dispose();
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });
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
