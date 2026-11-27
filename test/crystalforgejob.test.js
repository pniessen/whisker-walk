// The Crystal Cave, wing C milestone C3: the forge job and the Crystal Circlet. The pure rules (any order, open at step 7, the third makes the circlet, a partner's step credited, hostile
// input), the three finds on foot (flood, clear of everything, out of the boat's reach), the walk (carry endings, boarding the boat, the glow, 40 paws once, the prize on her head,
// partner credit), the guide's line, the circlet's drawing, and both word sets.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { memoryStorage } from './helpers/storage.js';
import { floodFrom } from './helpers/flood.js';
import * as P from '../src/world/crystalplan.js';
import * as S from '../src/world/crystalstory.js';
import * as G from '../src/world/crystalgrottoplan.js';
import * as R from '../src/world/crystalriverplan.js';
import { CRYSTAL_FIND_ZONES, CRYSTAL_GOLD, CRYSTAL_COLLECTIBLES } from '../src/world/crystalfindsplan.js';
import { SPOTS, STONE, BUG, SPARK } from '../src/world/crystalerrand.js';
import { posAt } from '../src/world/pathride.js';
import { AWARDS } from '../src/discoveries.js';
import { phrase } from '../src/clanphrases.js';
import { isWalkableAt } from '../src/player.js';
import { createProgression, sanitizeSave, CATALOG } from '../src/progression.js';
import { buildCat } from '../src/cat/model.js';
import { buildHat } from '../src/cat/hats.js';
import { goalWords, chipWords } from '../src/world/crystalguide.js';

await import('../src/world/crystalstagewingc.js');
const { build } = await import('../src/world/crystal.js');
const J = await import('../src/world/crystalforgejob.js');
const D = await import('../src/world/crystalforgejobplan.js');
const { createForgeJobLive, circletGeometry } = await import('../src/world/crystalforgejoblive.js');
const { CRYSTAL_FORGE_LINES } = await import('../src/world/crystalforgejobwords.js');
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

const open = (forge = 0, step = 7) => ({ step, sparks: 7, album: 0, forge, songs: 0 });

describe('the pure rules', () => {
  it('is closed before Lumi\'s story is told and nothing can be taken', () => {
    for (const step of [0, 3, 6]) {
      expect(J.isOpen(open(0, step))).toBe(false);
      expect(J.apply(open(0, step), { kind: 'bring', item: 0 }).changed).toBe(false);
      expect(J.canPick(open(0, step), 0)).toBe(false);
      expect(J.nextGoal(open(0, step)).kind).toBe('rest');
    }
    expect(J.isOpen(open(0, 7))).toBe(true);
  });
  it('takes the three ingredients in any order; the third is ready, "make" makes the circlet and implies all three', () => {
    for (const order of [[0, 1, 2], [2, 1, 0], [1, 2, 0], [2, 0, 1]]) {
      let r = open();
      for (const item of order) { const a = J.apply(r, { kind: 'bring', item }); expect(a.changed).toBe(true); expect(a.effect).toBe('bring'); r = a.crystal; }
      expect(r.forge).toBe(7);
      expect(J.ready(r)).toBe(true);
      expect(J.nextGoal(r).kind).toBe('make');
      const m = J.apply(r, { kind: 'make' });
      expect(m.effect).toBe('circlet');
      expect(m.crystal.forge).toBe(15);
      expect(J.made(m.crystal)).toBe(true);
      expect(J.apply(m.crystal, { kind: 'make' }).changed).toBe(false);
      expect(J.nextGoal(m.crystal).kind).toBe('rest');
    }
  });
  it('"make" before all three are in does nothing; an ingredient twice does nothing; the record\'s other keys are kept', () => {
    expect(J.apply(open(3), { kind: 'make' }).changed).toBe(false);
    expect(J.apply(open(1), { kind: 'bring', item: 0 }).changed).toBe(false);
    const a = J.apply(open(0), { kind: 'bring', item: 2 }).crystal;
    expect(a).toEqual({ step: 7, sparks: 7, album: 0, forge: 4, songs: 0 });
  });
  it('credit: a partner\'s ingredient is taken, "made" takes every ingredient before it, and a step she is past changes nothing', () => {
    expect(J.credit(open(0), { kind: 'bring', item: 1 }).crystal.forge).toBe(2);
    const m = J.credit(open(1), { kind: 'make' });
    expect(m.effect).toBe('circlet');
    expect(m.crystal.forge).toBe(15);
    expect(J.credit(open(15), { kind: 'make' }).changed).toBe(false);
    expect(J.credit(open(0, 4), { kind: 'make' }).changed).toBe(false);
  });
  it('the nearest goal: the lowest unfound item, then "give" with one in her mouth, "make" at 7, rest at 15', () => {
    expect(J.nextGoal(open(0))).toEqual({ kind: 'find', item: 0 });
    expect(J.nextGoal(open(1))).toEqual({ kind: 'find', item: 1 });
    expect(J.nextGoal(open(0), 2)).toEqual({ kind: 'give', item: 2 });
    expect(J.canPick(open(0), 1, null)).toBe(true);
    expect(J.canPick(open(0), 1, 0)).toBe(false);
    expect(J.canPick(open(2), 1, null)).toBe(false);
    expect(J.canPick(open(15), 0, null)).toBe(false);
  });
  it('is repaired from any hostile record or event', () => {
    for (const rec of [null, undefined, 'x', 7, [], { forge: 'x' }, { forge: -3 }, { forge: 1e12 }, { forge: NaN }, { forge: {}, step: 'x' }]) {
      expect(() => J.apply(rec, { kind: 'bring', item: 0 })).not.toThrow();
      expect(J.forgeBits(rec)).toBeLessThanOrEqual(15);
      expect(J.apply(rec, { kind: 'bring', item: 0 }).changed).toBe(false); // (no step: closed)
    }
    expect(J.forgeBits({ forge: 8 })).toBe(15);
    expect(J.forgeBits({ forge: 9 })).toBe(15);
    for (const ev of [null, 5, 'bring', {}, { kind: 'bring' }, { kind: 'bring', item: 3 }, { kind: 'bring', item: '1' }, { kind: 'bring', item: -1 }, { kind: 'make', item: 0 }, { kind: 'wc-forge' }, { kind: 'wc-forge', item: 9 }]) {
      expect(() => J.credit(open(0), ev)).not.toThrow();
      if (ev?.kind !== 'make') expect(J.credit(open(0), ev).changed, JSON.stringify(ev)).toBe(false);
    }
    expect(J.toStep({ kind: 'wc-forge', item: 1 })).toEqual({ kind: 'bring', item: 1 });
    expect(J.toStep({ kind: 'wc-forge', made: true })).toEqual({ kind: 'make' });
    expect(J.toStep({ kind: 'wc-forge', item: 7 })).toBeNull();
    expect(J.toStep({ kind: 'wc-song', item: 1 })).toBeNull();
    expect(J.toStep(null)).toBeNull();
    expect(J.wire({ kind: 'bring', item: 2 })).toEqual({ kind: 'wc-forge', item: 2 });
    expect(J.wire({ kind: 'make' })).toEqual({ kind: 'wc-forge', made: true });
  });
  it('is pure: no THREE, no clock, no random number', () => {
    const code = read('src/world/crystalforgejob.js') + read('src/world/crystalforgejobplan.js');
    expect(code).not.toMatch(/from 'three'|Math\.random|Date\.now|performance\.now/);
  });
});

describe('the save: the circlet is owned only when bit 3 is set', () => {
  const fresh = (o = {}) => sanitizeSave({ version: 4, ...o });
  it('forge 7 is three ingredients and no circlet; 8 and 15 own it; a hostile forge never does', () => {
    expect(fresh({ crystal: { step: 7, forge: 7 } }).unlocked.accessories).not.toContain('crystalcirclet');
    expect(fresh({ crystal: { step: 7, forge: 15 } }).unlocked.accessories).toContain('crystalcirclet');
    for (const junk of ['x', null, -1, NaN, [8], {}, 1e12]) {
      const s = fresh({ crystal: { forge: junk } });
      expect(s.unlocked.accessories.includes('crystalcirclet'), String(junk)).toBe((s.crystal.forge & 8) !== 0);
    }
  });
  it('pays 40 paws, in the awards table', () => { expect(AWARDS.crystalforge).toBe(40); });
});

describe('the three finds are on plain floor, reachable on foot, and clear', () => {
  const area = build(new THREE.Scene());
  const flood = floodFrom(area, area.spawn, (x, z) => isWalkableAt(area, x, z));
  const lumiish = [...Object.values(CRYSTAL_FIND_ZONES).flat(), ...CRYSTAL_COLLECTIBLES, ...S.STONES, S.HEART, S.LUMI.start, P.CRYSTAL_SPAWN, ...SPOTS, STONE, BUG, SPARK.start, SPARK.ring];
  it('each find and the anvil is reached on foot within its own reach (no hop, no skill)', () => {
    for (const s of D.ITEMS) { expect(isWalkableAt(area, s.x, s.z), s.key).toBe(true); expect(flood.reachesWithin(s.x, s.z, s.reach - 0.4), s.key).toBe(true); }
    expect(flood.reachesWithin(D.ANVIL_AT.x, D.ANVIL_AT.z, D.FORGE_REACH - 0.4)).toBe(true);
  });
  it('each is inside the bounds and clear of every solid piece, find, mouse, stone, errand spot and wander point', () => {
    const B = P.CRYSTAL_BOUNDS;
    for (const s of D.ITEMS) {
      expect(s.x).toBeGreaterThan(B.minX + 1); expect(s.x).toBeLessThan(B.maxX - 1); expect(s.z).toBeGreaterThan(B.minZ + 1); expect(s.z).toBeLessThan(B.maxZ - 1);
      for (const c of area.colliders) expect(Math.hypot(s.x - c.x, s.z - c.z), `${s.key} by ${c.x},${c.z}`).toBeGreaterThan(c.r + 0.7);
      for (const a of [...lumiish, ...P.CRYSTAL_POIS]) expect(Math.hypot(s.x - a.x, s.z - a.z), `${s.key} by ${a.x},${a.z}`).toBeGreaterThan(2.6);
      for (const a of CRYSTAL_GOLD) expect(Math.hypot(s.x - a.x, s.z - a.z), `${s.key} by ${a.id}`).toBeGreaterThan(2.2); // (the grotto's mouse sits in the middle of the ring)
      for (const other of D.ITEMS) if (other !== s) expect(Math.hypot(s.x - other.x, s.z - other.z)).toBeGreaterThan(8);
    }
  });
  it('the offers never compete: no find is within the boat\'s reach of any point on its path, and none is within the anvil\'s', () => {
    for (const s of D.ITEMS) {
      for (let d = 0; d < R.BOAT_LEN; d += 0.5) { const p = posAt(R.BOAT_PATH, d, 0, true); expect(Math.hypot(s.x - p.x, s.z - p.z), `${s.key} at ${d}`).toBeGreaterThan(R.BOAT.reach + 0.2); }
      expect(Math.hypot(s.x - D.ANVIL_AT.x, s.z - D.ANVIL_AT.z)).toBeGreaterThan(D.FORGE_REACH + 2.2);
    }
  });
  it('the cap is in the grotto and the shard is at the track\'s end', () => {
    expect(Math.hypot(D.ITEMS[0].x - G.GROTTO.x, D.ITEMS[0].z - G.GROTTO.z)).toBeLessThan(G.GROTTO.r);
    expect(Math.hypot(D.ITEMS[1].x - R.PLUNGE.x, D.ITEMS[1].z - R.PLUNGE.z)).toBeLessThan(7);
    expect(D.ITEMS[2].x).toBeLessThan(-30);
    expect(D.ITEMS[2].z).toBeLessThan(-8);
  });
});

function rig(rec = open(), extra = {}) {
  const progression = createProgression(memoryStorage());
  progression.state.crystal = { ...progression.state.crystal, ...rec };
  const scene = new THREE.Scene();
  const awards = [];
  const sent = [];
  const log = { awardOnce: (kind, key, text) => { awards.push({ kind, key, text }); return AWARDS[kind] ?? 0; } };
  const riding = { on: false };
  const live = createForgeJobLive({ scene, progression, log, send: (e) => sent.push(e), isRiding: () => riding.on, reducedMotion: false, ...extra });
  return { progression, scene, awards, sent, live, riding };
}
const at = (x, z) => ({ x, z, y: P.crystalY(x, z) });
const near = (s) => at(s.x + 0.8, s.z);
const nearAnvil = at(D.ANVIL_AT.x, D.ANVIL_AT.z + 2.0);
const tick = (r, cat, n = 1, dt = 0.05) => { for (let i = 0; i < n; i++) r.live.update(dt, i * dt, cat, null, null); };
const press = (r, cat) => { tick(r, cat); const line = r.live.promptAt(cat); return { line, k: line ? r.live.interact() : null }; };
const forgeOf = (r) => r.progression.state.crystal.forge;

describe('the walk', () => {
  it('offers nothing before step 7, and nothing is drawn', () => {
    const r = rig(open(0, 6));
    for (const s of D.ITEMS) expect(r.live.promptAt(near(s))).toBeNull();
    tick(r, near(D.ITEMS[0]));
    expect(r.live.meshes.every((m) => !m.visible)).toBe(true);
    expect(r.live.circlet.visible).toBe(false);
    r.live.dispose();
  });
  it('picks each find with the action button, carries it, puts it in at the anvil; the third makes the circlet', () => {
    const r = rig();
    for (const i of [1, 2, 0]) {
      const s = D.ITEMS[i];
      expect(press(r, near(s)).k, `pick ${i}`).toBe('pick');
      expect(r.live.state.carrying).toBe(i);
      expect((forgeOf(r) ?? 0) & (1 << i), 'a carried thing is never saved').toBe(0);
      expect(r.live.goalNow().g.kind).toBe('forge');
      expect(r.live.promptAt(near(s))).toBeNull(); // (a second find while one is in her mouth: not offered)
      expect(press(r, nearAnvil).k, `give ${i}`).toBe('give');
      expect(r.live.state.carrying).toBe(null);
      expect(forgeOf(r) & (1 << i)).toBe(1 << i);
    }
    expect(forgeOf(r)).toBe(15);
    expect(r.awards).toEqual([{ kind: 'crystalforge', key: 'crystal-forge', text: phrase('crystal.wc.forge.pay') }]);
    expect(r.progression.state.unlocked.accessories).toContain('crystalcirclet');
    expect(r.progression.state.equipped.head).toBe('crystalcirclet');
    // her partner is told the ingredients and then the circlet (the last bring is the circlet)
    expect(r.sent).toEqual([{ kind: 'wc-forge', item: 1 }, { kind: 'wc-forge', item: 2 }, { kind: 'wc-forge', made: true }]);
    expect(r.live.promptAt(nearAnvil)).toBeNull();
    for (const s of D.ITEMS) expect(r.live.promptAt(near(s))).toBeNull();
    r.live.dispose();
  });
  it('the circlet\'s glow is short and gentle; reduced motion holds a still glow of the same length', () => {
    for (const reducedMotion of [false, true]) {
      const r = rig(open(7), { reducedMotion });
      expect(r.live.state.goal.kind).toBe('make');
      expect(press(r, nearAnvil).k).toBe('make');
      tick(r, nearAnvil);
      expect(r.live.circlet.visible).toBe(true);
      const seen = [];
      for (let i = 0; i < 90; i++) { tick(r, nearAnvil, 1, 0.05); seen.push(r.live.glow.visible ? r.live.glow.material.opacity : 0); }
      expect(Math.max(...seen)).toBeGreaterThan(0.3);
      expect(Math.max(...seen)).toBeLessThanOrEqual(0.85);
      expect(seen[seen.length - 1]).toBe(0); // 4.5 s on: the glow is over
      if (reducedMotion) expect(new Set(seen.filter((v) => v > 0)).size).toBe(1);
      r.live.dispose();
    }
  });
  it('the paws are paid once; a second circlet event, a replay and a resumed walk pay nothing', () => {
    const r = rig(open(7));
    press(r, nearAnvil);
    expect(r.awards.length).toBe(1);
    expect(r.live.credit({ kind: 'wc-forge', made: true })).toBeNull();
    press(r, nearAnvil);
    expect(r.awards.length).toBe(1);
    const again = rig(open(15));
    tick(again, nearAnvil, 3);
    expect(again.awards.length).toBe(0);
    expect(again.live.circlet.visible).toBe(true);
    expect(again.live.promptAt(nearAnvil)).toBeNull();
  });
  it('carry endings: leaving the walk forgets what was in her mouth; the next walk finds it at its own spot and the save never had it', () => {
    const r = rig();
    const s = D.ITEMS[1];
    expect(press(r, near(s)).k).toBe('pick');
    tick(r, near(s), 2);
    expect(r.live.meshes[1].position.distanceTo(new THREE.Vector3(s.x, P.crystalY(s.x, s.z), s.z))).toBeGreaterThan(0.05); // (it is in her mouth, not at home)
    r.live.dispose();
    expect(forgeOf(r)).toBe(0);
    expect(JSON.stringify(r.progression.state)).not.toMatch(/carrying/);
    const next = createForgeJobLive({ scene: new THREE.Scene(), progression: r.progression, reducedMotion: false });
    expect(next.state.carrying).toBe(null);
    expect(next.promptAt(near(s))).toBe(phrase('crystal.wc.forge.pick.water'));
    next.dispose();
  });
  it('carry endings: an ingredient held while boarding the boat is set down (back at its own spot), never kept', () => {
    const r = rig();
    const s = D.ITEMS[0];
    expect(press(r, near(s)).k).toBe('pick');
    r.riding.on = true;
    tick(r, near(s), 2);
    expect(r.live.state.carrying).toBe(null);
    expect(r.live.meshes[0].visible).toBe(true);
    expect([r.live.meshes[0].position.x, r.live.meshes[0].position.z]).toEqual([s.x, s.z]);
    expect(r.live.promptAt(nearAnvil)).toBeNull(); // (nothing to give)
    r.riding.on = false;
    expect(r.live.promptAt(near(s))).toBe(phrase('crystal.wc.forge.pick.cap'));
    r.live.dispose();
  });
  it('partner credit: an ingredient from the room is taken and the one in her mouth is let go; "made" makes it on this save too and pays once', () => {
    const r = rig();
    expect(press(r, near(D.ITEMS[2])).k).toBe('pick');
    expect(r.live.credit({ kind: 'wc-forge', item: 2 })).toBe('bring');
    expect(r.live.state.carrying).toBe(null);
    expect(forgeOf(r)).toBe(4);
    expect(r.live.credit({ kind: 'wc-forge', made: true })).toBe('circlet');
    expect(forgeOf(r)).toBe(15);
    expect(r.awards.length).toBe(1);
    expect(r.progression.state.unlocked.accessories).toContain('crystalcirclet');
    for (const bad of [null, 3, 'x', {}, { kind: 'wc-forge', item: 8 }, { kind: 'wc-song', item: 0 }, { kind: 'show' }]) expect(r.live.credit(bad)).toBeNull();
    expect(forgeOf(r)).toBe(15);
    r.live.dispose();
    const closed = rig(open(0, 5));
    expect(closed.live.credit({ kind: 'wc-forge', item: 1 })).toBeNull();
    expect(forgeOf(closed) ?? 0).toBe(0);
    closed.live.dispose();
  });
  it('a resumed save with all three in and no circlet (two devices merged): the anvil offers "Make the circlet"', () => {
    const r = rig(open(7));
    expect(r.live.promptAt(nearAnvil)).toBe(phrase('crystal.wc.forge.make'));
    expect(r.live.interact()).toBe('make');
    expect(forgeOf(r)).toBe(15);
    r.live.dispose();
  });
  it('the goal for the guide: Lumi\'s own wins; the forge shows when hers is "rest" and no errand waits', () => {
    const r = rig();
    const lumiRest = { g: { kind: 'rest' }, x: 0, z: 0, y: 0 };
    const goal = r.live.goalFor(lumiRest);
    expect(goal.g.kind).toBe('forge');
    expect(goalWords({ goal, metres: 20, step: 7, errand: false })).toMatch(/glow-cap/);
    expect(chipWords(goal.g)).toBe(phrase('crystal.wc.guide.chip.find'));
    const lumiStone = { g: { kind: 'stone', stone: 1 }, x: 1, z: 1, y: 0 };
    expect(r.live.goalFor(lumiStone)).toBe(lumiStone);
    const busy = rig(open(), { errand: { state: { eligible: true, done: false } } });
    expect(busy.live.goalFor(lumiRest)).toBe(lumiRest);
    const done = rig(open(15));
    expect(done.live.goalFor(lumiRest)).toBe(lumiRest);
    for (const x of [r, busy, done]) x.live.dispose();
  });
  it('adds no light, no random number, one draw per find and at most six in all; disposing leaves nothing in the scene', () => {
    const r = rig();
    let lights = 0; let draws = 0;
    r.scene.traverse((o) => { if (o.isLight) lights++; if (o.isMesh || o.isPoints || o.isSprite) draws++; });
    expect(lights).toBe(0);
    expect(draws).toBeLessThanOrEqual(6);
    r.live.dispose();
    expect(r.scene.children.length).toBe(0);
    expect(read('src/world/crystalforgejoblive.js')).not.toMatch(/Math\.random|PointLight|SpotLight|Date\.now|performance\.now/);
  });
});

describe('the Crystal Circlet on the cat', () => {
  it('is a head prize drawn as one vertex-coloured mesh with a silver band and three crystals, low in triangles, and sits on the skull', () => {
    expect(CATALOG.accessories.crystalcirclet.slot).toBe('head');
    for (const simple of [false, true]) {
      const hat = buildHat('crystalcirclet', { simple });
      expect(hat.material.vertexColors).toBe(true);
      const tris = hat.geometry.index.count / 3;
      expect(tris).toBeLessThanOrEqual(simple ? 120 : 220);
    }
    const cat = buildCat('tabby', { head: 'crystalcirclet' });
    const hats = []; cat.traverse((o) => { if (o.isMesh && o.userData.hat === 'crystalcirclet') hats.push(o); });
    expect(hats).toHaveLength(1);
  });
  it('the ground piece on the anvil is one merged mesh', () => {
    expect(circletGeometry().attributes.color).toBeTruthy();
  });
});

describe('words', () => {
  const ids = Object.keys(CRYSTAL_FORGE_LINES);
  it('every line is in both word sets, whole, with no banned word, and the everyday set has no series word', () => {
    expect(ids.length).toBeGreaterThanOrEqual(18);
    for (const id of ids) { const clan = phrase(id); expect(clan, id).toMatch(/\S/); expect(bannedIn(clan), id).toBeNull(); }
    withOffWords(() => { for (const id of ids) { const t = phrase(id); expect(t, id).toMatch(/\S/); expect(bannedIn(t), id).toBeNull(); expect(t, id).not.toMatch(/StarClan|Clan|warrior|kit\b/i); } });
  });
  it('every id the live and the guide use is a literal in the words file', () => {
    const used = new Set();
    for (const f of ['src/world/crystalforgejoblive.js']) for (const m of read(f).matchAll(/'(crystal\.wc\.[a-z.]+)'/g)) used.add(m[1]);
    for (const id of used) expect(ids, id).toContain(id);
    for (const key of ['cap', 'water', 'shard']) for (const kind of ['pick', 'got', 'guide']) {
      const id = kind === 'guide' ? `crystal.wc.guide.${key}` : `crystal.wc.forge.${kind}.${key}`;
      expect(ids, id).toContain(id);
    }
  });
});
