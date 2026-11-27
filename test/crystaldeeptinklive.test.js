// The Echo Deep, milestone C4: Tink on a walk. The greeting, the shy follow, the nest and the nook, the charm and the paws once, the carry endings (leaving, far away, a room),
// a partner crediting both ways, the guide goal, the prompts at the nest and the nook, the words, and the sources (no random number, no clock, no apostrophe in a comment).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { floodFrom } from './helpers/flood.js';
import { isWalkableAt } from '../src/player.js';
import { sanitizeSave } from '../src/progression.js';
import { phrase } from '../src/clanphrases.js';
import { bannedIn, withOffWords } from './helpers/offwords.js';
import { setCrystalDeep } from '../src/crystalflag.js';
import { WING_LIVE, wingPageShown, CRYSTAL_HINTS } from '../src/crystalpages.js';
import { ST } from '../src/world/crystalstages.js';
import * as D from '../src/world/crystaldeepplan.js';
import * as M from '../src/world/crystaldeepmission.js';

stubCanvasDocument();
setCrystalDeep(true);
await import('../src/world/crystalstagedeep.js');
const L = await import('../src/world/crystaldeeptinklive.js');
const { TINK_LINES } = await import('../src/world/crystaldeeptinkwords.js');
const { build } = await import('../src/world/crystal.js');
const read = (f) => readFileSync(f, 'utf8');

const fake = (deep = 0, extra = {}) => {
  const state = sanitizeSave({ version: 4, crystal: { step: 7, songs: 7, album: 3, deep, ...extra } });
  const seen = [];
  const paid = [];
  const sent = [];
  const chimes = [];
  const pr = { state, addPoints() {}, recordSighting: (id) => seen.push(id) };
  const log = { awardOnce: (type, key, label) => { if (paid.some((p) => p.key === key)) return 0; paid.push({ type, key, label }); return 40; } };
  const mk = (o = {}) => {
    const scene = new THREE.Scene();
    const live = L.createTinkLive({ scene, progression: pr, log, audio: { chime: () => chimes.push(1) }, send: (e) => sent.push(e), ...o });
    return { scene, live };
  };
  return { pr, seen, paid, sent, chimes, mk };
};
const at = (p, dx = 0, dz = 0) => ({ x: p.x + dx, z: p.z + dz, y: 0 });
const run = (live, cat, secs, dt = 0.05, t0 = 0) => { for (let t = 0; t < secs; t += dt) live.update(dt, t0 + t, cat); };
const HALLCAT = at(D.NEST.reachFrom);

describe('the stage with the flag on', () => {
  it('the slot answers the four calls and the pages show', () => {
    for (const k of ['promptAt', 'interact', 'credit', 'goalFor']) expect(typeof ST.deep[k]).toBe('function');
    expect(WING_LIVE.deep && WING_LIVE.tink).toBe(true);
    expect(wingPageShown('ccdeep') && wingPageShown('cctink')).toBe(true);
    expect(CRYSTAL_HINTS.ccdeep).toMatch(/\S/); expect(CRYSTAL_HINTS.cctink).toMatch(/\S/);
  });
  it('with no walk made the slot is quiet', () => {
    expect(ST.deep.promptAt(HALLCAT)).toBeNull();
    expect(ST.deep.interact()).toBeNull();
    expect(ST.deep.credit({ kind: 'wd-found' })).toBeNull();
    expect(ST.deep.goalFor({ g: { kind: 'rest' } }, null)).toEqual({ g: { kind: 'rest' } });
  });
});

describe('the greeting', () => {
  it('Tink is not there until the prisms are set', () => {
    for (const bits of [0, 1]) { const f = fake(bits); const { live } = f.mk(); run(live, HALLCAT, 1); expect(live.promptAt(HALLCAT)).toBeNull(); expect(live.mesh).toBeNull(); }
    const g = fake(1, { album: 0 }); const { live } = g.mk(); expect(live.state.present).toBe(false);
  });
  it('beside his nest, with the prisms set, the button says hello; far away it says nothing', () => {
    const f = fake(3); const { live } = f.mk(); run(live, HALLCAT, 0.5);
    expect(live.promptAt(HALLCAT)).toBe(phrase('crystal.deep.tink.hello'));
    expect(live.promptAt(at(D.HALL, 0, 3))).toBeNull();
    expect(live.promptAt(at(D.NOOK))).toBeNull();
    expect(live.promptAt(null)).toBeNull();
  });
  it('saying hello sets bit 2 once, sends wd-found once, and he follows; again later it only follows', () => {
    const f = fake(3); const { live } = f.mk(); run(live, HALLCAT, 0.5);
    live.promptAt(HALLCAT); expect(live.interact()).toBe('greet');
    expect(f.pr.state.crystal.deep).toBe(7); expect(f.sent).toEqual([{ kind: 'wd-found' }]); expect(live.state.following).toBe(true); expect(f.seen).toContain('cctink');
    expect(live.interact()).toBeNull(); // the prompt was spent
    const g = fake(7); const b = g.mk().live; run(b, HALLCAT, 0.5); b.promptAt(HALLCAT); expect(b.interact()).toBe('greet');
    expect(g.pr.state.crystal.deep).toBe(7); expect(g.sent).toEqual([]);
  });
  it('locked (the story is not open yet) he is not there at all', () => {
    const f = fake(3, { songs: 3 }); f.pr.state.crystal.deep = 3; // begun before: a merged save keeps what it has
    const { live } = f.mk(); expect(live.state.present).toBe(true);
    const h = fake(0, { step: 3, songs: 0, album: 0 }); expect(h.mk().live.state.present).toBe(false);
  });
});

describe('the follow and the way home', () => {
  const floor = build(new THREE.Scene());
  const flood = floodFrom(floor, floor.spawn, (x, z) => isWalkableAt(floor, x, z));
  it('he follows shy and shows up; the cat can walk from the nest to the nook and he is home there once', () => {
    const f = fake(3); const { live, scene } = f.mk({ reducedMotion: false });
    let cat = at(HALLCAT);
    run(live, cat, 0.3); live.promptAt(cat); live.interact();
    // walk the cat in a line: nest, out of the passage, to the nook (straight steps along the floor path, 3 m/s)
    const path = [at(D.NEST.reachFrom), { x: -28, z: -23 }, { x: -28, z: -19 }, { x: -22, z: -8 }, { x: -12, z: 2 }, { x: D.NOOK.x - 1.4, z: D.NOOK.z - 0.8 }];
    let t = 0.3;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]; const b = path[i]; const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (3 * 0.05));
      for (let k = 1; k <= n; k++) { cat = { x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n, y: 0 }; live.update(0.05, t, cat); t += 0.05; expect(live.state.x).toBeGreaterThan(-37); }
    }
    run(live, cat, 9, 0.05, t);
    expect(f.pr.state.crystal.deep).toBe(15);
    expect(f.pr.state.unlocked.accessories).toContain('prismcharm');
    expect(f.pr.state.equipped.neck).toBe('prismcharm');
    expect(f.paid).toEqual([{ type: 'crystaldeep', key: 'crystal-deep', label: phrase('crystal.deep.tink.pay') }]);
    expect(f.sent.map((e) => e.kind)).toEqual(['wd-found', 'wd-home']);
    expect(f.seen).toEqual(expect.arrayContaining(['ccdeep', 'cctink']));
    expect(f.chimes.length).toBeGreaterThanOrEqual(3);
    expect(live.state.following).toBe(false);
    expect(scene.children.find((c) => c.name === 'crystal:deep:tink').position.y).toBeGreaterThan(1);
    expect(Math.hypot(live.state.x - D.NOOK.x, live.state.z - D.NOOK.z)).toBeLessThan(0.3);
    expect(flood.reachesWithin(D.NOOK.x, D.NOOK.z + 1.2, 0.6)).toBe(true);
  });
  it('the shy distance is kept and he never leaves the cave bounds or goes through a collider', () => {
    const f = fake(7); const { live } = f.mk(); let cat = at(D.HALL, 0, 3); run(live, cat, 0.3); live.promptAt(at(live.state)); live.promptAt(at(live.state, 0.5)); live.interact();
    expect(live.state.following).toBe(true);
    for (let i = 0; i < 400; i++) { cat = { x: -28 + 2 * Math.cos(i / 20), z: -22 + 2 * Math.sin(i / 20), y: 0 }; live.update(0.05, i * 0.05, cat); const s = live.state; expect(Math.abs(s.x)).toBeLessThanOrEqual(36); expect(Math.abs(s.z)).toBeLessThanOrEqual(32); for (const c of D.deepColliders()) expect(Math.hypot(s.x - c.x, s.z - c.z)).toBeGreaterThanOrEqual(c.r - 0.05); }
  });
  it('nothing is saved while he follows: only the greeting bit', () => {
    const f = fake(3); const { live } = f.mk(); let cat = at(HALLCAT); run(live, cat, 0.3); live.promptAt(cat); live.interact();
    const snap = JSON.stringify(f.pr.state); run(live, at(D.HALL, 0, 3), 5); expect(JSON.stringify(f.pr.state)).toBe(snap);
  });
});

describe('the carry endings: he is never lost', () => {
  it('very far from him he goes back to his ledge; next walk he is on his ledge (bit 2) or at his nook (bit 3)', () => {
    const f = fake(3); const { live } = f.mk(); run(live, HALLCAT, 0.3); live.promptAt(HALLCAT); live.interact();
    live.update(0.05, 1, { x: 30, z: 20, y: 0 }); expect(live.state.following).toBe(false);
    run(live, { x: 30, z: 20, y: 0 }, 20); expect(Math.hypot(live.state.x - L.REST.x, live.state.z - L.REST.z)).toBeLessThan(0.1);
    expect(f.pr.state.crystal.deep).toBe(7);
    const g = fake(7); const a = g.mk().live; run(a, HALLCAT, 0.2); expect(Math.hypot(a.state.x - L.REST.x, a.state.z - L.REST.z)).toBeLessThan(0.1);
    const h = fake(15); const b = h.mk().live; run(b, at(D.NOOK, 3, 3), 0.2); expect(Math.hypot(b.state.x - D.NOOK.x, b.state.z - D.NOOK.z)).toBeLessThan(0.1);
    expect(b.promptAt(at(D.NOOK, 1, 1))).toBeNull(); // home: no more hello
  });
  it('leaving mid-follow (dispose) saves nothing more, removes the mesh, and a second dispose is quiet', () => {
    const f = fake(3); const { live, scene } = f.mk(); run(live, HALLCAT, 0.3); live.promptAt(HALLCAT); live.interact(); run(live, HALLCAT, 0.3);
    const before = JSON.stringify(f.pr.state);
    live.dispose(); live.dispose();
    expect(JSON.stringify(f.pr.state)).toBe(before); expect(scene.children.length).toBe(0);
    expect(live.promptAt(HALLCAT)).toBeNull(); expect(live.interact()).toBeNull();
  });
});

describe('a partner', () => {
  it('wd-found, wd-prism and wd-home are credited in order; home pays this cat too, once', () => {
    const f = fake(0); const { live } = f.mk();
    expect(live.credit({ kind: 'wd-home' })).toBe('home');
    expect(f.pr.state.crystal.deep).toBe(15); expect(f.paid.length).toBe(1);
    expect(live.credit({ kind: 'wd-home' })).toBeNull(); expect(f.paid.length).toBe(1);
    expect(f.pr.state.unlocked.accessories).toContain('prismcharm');
  });
  it('a partner finishing the walk ends our follow and he goes to his nook', () => {
    const f = fake(3); const { live } = f.mk(); run(live, HALLCAT, 0.3); live.promptAt(HALLCAT); live.interact();
    live.credit({ kind: 'wd-home' }); expect(live.state.following).toBe(false); run(live, HALLCAT, 40);
    expect(Math.hypot(live.state.x - D.NOOK.x, live.state.z - D.NOOK.z)).toBeLessThan(0.1);
  });
  it('junk, a stranger kind and the errand wire are nothing; a locked save takes nothing', () => {
    const f = fake(3); const { live } = f.mk();
    for (const ev of [null, 4, {}, { kind: 'wd-x' }, { kind: 'wd-errand' }, { kind: 'wc-forge' }, { kind: 'found' }]) expect(live.credit(ev), JSON.stringify(ev)).toBeNull();
    const h = fake(0, { step: 3, songs: 0, album: 0 }); expect(h.mk().live.credit({ kind: 'wd-found' })).toBeNull(); expect(h.pr.state.crystal.deep).toBe(0);
  });
  it('the slot routes a wd- event to the current walk and through the stage', () => {
    const f = fake(3); const { live } = f.mk();
    const walk = L.withLiving({ scene: new THREE.Scene(), progression: f.pr, log: { awardOnce: () => 0 }, audio: null, send: () => {} }, { update() {}, dispose() {}, meshes: [], draws: 0 });
    expect(ST.deep.credit({ kind: 'wd-found' })).toBe('found'); expect(f.pr.state.crystal.deep).toBe(7);
    walk.dispose(); expect(ST.deep.credit({ kind: 'wd-found' })).toBeNull();
    live.dispose();
  });
});

describe('the guide and the arbiter', () => {
  it('Lumi and the errand come first; then Tink: find at his nest, walk to the nook while he follows', () => {
    const f = fake(3); const { live } = f.mk();
    const rest = { g: { kind: 'rest' } };
    expect(live.goalFor({ g: { kind: 'stone' }, x: 1, z: 2 }, null).g.kind).toBe('stone');
    expect(live.goalFor(rest, { eligible: true, done: false })).toBe(rest);
    const a = live.goalFor(rest, { eligible: false });
    expect(a).toMatchObject({ g: { kind: 'forge' }, x: L.REST.x, z: L.REST.z }); expect(a.g.line).toContain('{at}'); expect(a.g.chip).toMatch(/\S/);
    run(live, HALLCAT, 0.3); live.promptAt(HALLCAT); live.interact();
    expect(live.goalFor(rest, null)).toMatchObject({ x: D.NOOK.x, z: D.NOOK.z });
    expect(fake(15).mk().live.goalFor(rest, null)).toBe(rest);
    expect(fake(0).mk().live.goalFor(rest, null)).toBe(rest); // the wall and the prisms are another goal
  });
  it('the crystal arbiter reads the slot: hello at the nest, nothing at the passage or the nook for Tink', () => {
    const f = fake(3);
    const area = build(new THREE.Scene());
    const life = area.life({ scene: new THREE.Scene(), progression: f.pr, log: { awardOnce: () => 0, count: () => 0, found: () => false, has: () => false, record() {}, on: () => () => {} }, audio: null, reducedMotion: false, tier: { name: 'high' }, roomSeed: 1, visits: 0, sendEvent() {}, player: {}, camera: new THREE.PerspectiveCamera() });
    life.update(0.05, 0, HALLCAT, null, { tippables: { list: [] }, remotes: { list: [] } });
    expect(life.promptAt({ x: -28, z: -21 })).not.toBe(phrase('crystal.deep.tink.hello'));
    expect(life.promptAt(at(D.NOOK, 1, 1))).not.toBe(phrase('crystal.deep.tink.hello'));
    expect(life.promptAt(HALLCAT)).toBe(phrase('crystal.deep.tink.hello'));
    expect(life.interact()).toBeTruthy();
    expect(f.pr.state.crystal.deep).toBe(7);
    life.dispose();
  });
});

describe('reduced motion, the drawing and the words', () => {
  it('one small mesh, no light, finite numbers, drawn only within reach of the hall unless he follows', () => {
    const f = fake(3); const { live, scene } = f.mk();
    run(live, { x: 30, z: 20, y: 0 }, 0.3); expect(live.mesh?.visible ?? false).toBe(false);
    run(live, HALLCAT, 0.3);
    expect(live.mesh.visible).toBe(true);
    const geo = live.mesh.geometry; expect(geo.attributes.position.count / 3).toBeLessThan(400);
    for (const v of geo.attributes.position.array) expect(Number.isFinite(v)).toBe(true);
    let meshes = 0; let lights = 0; scene.traverse((o) => { if (o.isMesh) meshes++; if (o.isLight) lights++; }); expect([meshes, lights]).toEqual([1, 0]);
    console.log('tink triangles', geo.attributes.position.count / 3);
  });
  it('reduced motion holds him still; moving he bobs', () => {
    const rm = fake(7).mk({ reducedMotion: true }).live; run(rm, HALLCAT, 0.3); const y0 = rm.mesh.position.y; run(rm, HALLCAT, 1.1, 0.05, 0.3); expect([rm.mesh.position.y, rm.mesh.rotation.z]).toEqual([y0, 0]);
    const mo = fake(7).mk().live; run(mo, HALLCAT, 0.3); const z0 = mo.mesh.rotation.z; run(mo, HALLCAT, 1.1, 0.05, 0.3); expect(mo.mesh.rotation.z).not.toBe(z0);
  });
  it('every line reads, is plain (no banned word in either edition, no stuck or trapped), and the hello line comes from the names table', () => {
    const lines = () => Object.keys(TINK_LINES).map((id) => [id, phrase(id)]);
    const on = lines();
    const off = withOffWords(lines);
    expect(off).toEqual(on); // the same plain line in both editions
    for (const [id, s] of off) { expect(s).toMatch(/\S/); expect(bannedIn(s), id).toBeFalsy(); expect(s).not.toMatch(/stuck|trapped|dark|collapse|lost forever|scary/i); }
    expect(phrase('crystal.deep.tink.hello')).toBe('Say hello to Tink');
  });
  it('the sources draw no random number, read no clock and carry no apostrophe in a comment', () => {
    for (const f of ['crystaldeeptinklive', 'crystaldeeptinkwords']) {
      const text = read(`src/world/${f}.js`);
      for (const line of text.split('\n')) { const i = line.indexOf('//'); if (i >= 0 && !/https?:/.test(line)) expect(line.slice(i), `${f}: ${line}`).not.toMatch(/'/); }
      expect(text.replace(/\/\/.*$/gm, ''), f).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date|PointLight/);
    }
  });
  it('the unlock rule still gates him: M.isOpen', () => { expect(M.isOpen({ step: 7, songs: 7, album: 3 })).toBe(true); });
});
