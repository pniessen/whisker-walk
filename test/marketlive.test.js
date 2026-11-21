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
      const k = r.area.keepers[id];
      // over the stallholder's head: 0.5 m wide, its middle 0.45 m above the crown
      expect(bubble.isSprite).toBe(true);
      expect(bubble.scale.x).toBeCloseTo(0.5, 9);
      expect(bubble.position.x).toBeCloseTo(k.x, 9);
      expect(bubble.position.z).toBeCloseTo(k.z, 9);
      const crown = shownBox(group).max.y;
      expect(bubble.position.y - crown, id).toBeCloseTo(0.45, 2);
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

// the ids of the scene's top-level children, in order
function scene0(scene) {
  return scene.children.map((o) => o.id);
}
