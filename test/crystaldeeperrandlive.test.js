// The Echo Deep, milestone C6: Tink errand of the day on a walk. The four kinds pay once a walk and never twice, the album takes the lowest bit, two walks give different errands, the
// prompts, a partner credit, the guide goal, the drawing (one mesh, only after the story) and the words and the sources.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { sanitizeSave } from '../src/progression.js';
import { phrase } from '../src/clanphrases.js';
import { bannedIn, withOffWords } from './helpers/offwords.js';
import { setCrystalDeep } from '../src/crystalflag.js';
import { CRYSTAL_HINTS } from '../src/crystalpages.js';
import { ST } from '../src/world/crystalstages.js';
import * as D from '../src/world/crystaldeepplan.js';
import * as E from '../src/world/crystaldeeperrand.js';

stubCanvasDocument();
setCrystalDeep(true);
await import('../src/world/crystalstagedeep.js');
const L = await import('../src/world/crystaldeeperrandlive.js');
const { DEEP_ERRAND_LINES } = await import('../src/world/crystaldeeperrandwords.js');
const read = (f) => readFileSync(f, 'utf8');

const visitsFor = (kind, skip = 0) => { let n = 0; for (let v = 0; v < 400; v++) if (E.planDeepErrand(undefined, v).kind === kind && n++ === skip) return v; throw new Error(kind); };
const fake = (visits, o = {}) => {
  const state = sanitizeSave({ version: 4, crystal: { step: 7, songs: 7, album: 3, deep: 15, chimes: 0, ...(o.crystal ?? {}) } });
  const paid = []; const sent = []; const seen = []; const chimes = [];
  const pr = { state, addPoints() {}, recordSighting: (id) => seen.push(id) };
  const log = { awardOnce: (type, key, label) => { if (paid.some((p) => p.key === key)) return 0; paid.push({ type, key, label }); return 25; }, count: (k) => paid.filter((p) => p.key === k).length };
  const walk = (extra = {}) => {
    const scene = new THREE.Scene();
    const life = ST.deep.life({ scene, progression: pr, log, audio: { chime: () => chimes.push(1) }, reducedMotion: false, tier: { name: 'high' }, roomSeed: undefined, visits, sendEvent: (e) => sent.push(e), ...extra });
    return { scene, life };
  };
  return { pr, paid, sent, seen, chimes, walk };
};
const at = (p, dx = 0, dz = 0) => ({ x: p.x + dx, z: p.z + dz, y: 0 });
const run = (life, cat, secs, dt = 0.05, t0 = 0) => { for (let t = 0; t < secs; t += dt) life.update(dt, t0 + t, cat); };
const press = (cat) => { const p = ST.deep.promptAt(cat); return p ? [p, ST.deep.interact()] : [null, null]; };

describe('the four errands pay once a walk', () => {
  it('moss: pick up at the spot, set in the nest; 25 paws once, the first chime bit, the page, wd-errand once', () => {
    const v = visitsFor('moss'); const f = fake(v); const { life } = f.walk(); const plan = E.planDeepErrand(undefined, v); const spot = E.SPOTS[plan.spot];
    run(life, at(spot, 8, 0), 3);
    expect(ST.deep.promptAt(at(spot, 8, 0))).toBeNull();
    expect(press(at(spot, 0.5, 0))[0]).toBe(phrase('crystal.deep.errand.moss.pick'));
    run(life, D.NEST.reachFrom, 0.1);
    expect(ST.deep.promptAt(at(spot, 0.5, 0))).toBeNull(); // spent: the pad is carried now
    expect(ST.deep.promptAt(at(D.NEST, 1, 0.5))).toBe(phrase('crystal.deep.errand.moss.give'));
    expect(ST.deep.interact()).toBe('give');
    expect(f.paid).toEqual([{ type: 'deepjob', key: E.ERRAND_KEY, label: phrase('crystal.deep.errand.pay') }]);
    expect(f.pr.state.crystal.chimes).toBe(1); expect(f.seen).toContain('ccchimes'); expect(f.sent).toEqual([{ kind: 'wd-errand' }]);
    expect(ST.deep.promptAt(at(D.NEST, 1, 0.5))).toBeNull();
    life.dispose();
  });
  it('hide: the ring of glints, peek inside', () => {
    const v = visitsFor('hide'); const f = fake(v); const { life } = f.walk(); const spot = E.SPOTS[E.planDeepErrand(undefined, v).spot];
    run(life, at(spot, 6, 0), 3);
    expect(press(at(spot, 1, 0.5))[1]).toBe('peek');
    expect(f.pr.state.crystal.chimes).toBe(1); expect(f.paid.length).toBe(1);
    life.dispose();
  });
  it('tune: hear it, a wrong bar plays it again, the right three in a row pay', () => {
    const v = visitsFor('tune'); const f = fake(v); const { life } = f.walk(); const plan = E.planDeepErrand(undefined, v);
    const mid = L.BAR_AT[2];
    let t = 0; const go = (cat, s) => { run(life, cat, s, 0.05, t); t += s; };
    go(at(mid, 0, 1.6), 0.3);
    expect(press(at(mid, 0, 1.6))[1]).toBe('tune');
    go(at(mid, 0, 1.6), 0.4 + 3 * L.NOTE_GAP + 0.3);
    expect(life.errand?.state ?? true).toBeTruthy();
    const bars = (seq) => { for (const b of seq) { go(at(L.BAR_AT[b]), 0.2); go(at(mid, 0, 2.2), 0.1); } };
    const wrong = [0, 1, 2, 3, 4].find((b) => b !== plan.tune[0]);
    bars([wrong]); expect(f.paid.length).toBe(0);
    go(at(mid, 0, 2.2), L.REPLAY_AFTER + 0.4 + 3 * L.NOTE_GAP + 0.4); // played again
    bars(plan.tune);
    expect(f.paid.length).toBe(1); expect(f.pr.state.crystal.chimes).toBe(1);
    life.dispose();
  });
  it('prisms: the stands turn to the day faces, any order, and the door pattern is back afterwards', () => {
    const v = visitsFor('prisms'); const f = fake(v); const { life } = f.walk(); const plan = E.planDeepErrand(undefined, v);
    const near = at(D.STANDS[0], 0, 1);
    run(life, near, 1);
    expect(life.steps.errand.on).toBe(true);
    for (let k = 0; k < 12 && !f.paid.length; k++) {
      const faces = life.steps.faces; const i = [0, 1, 2].find((s) => faces[s] !== plan.faces[s]);
      expect(press(at(D.STANDS[i], 0, 1))[1]).toBe('turn');
    }
    expect(f.paid.length).toBe(1); expect(f.pr.state.crystal.chimes).toBe(1);
    expect(life.steps.errand.on).toBe(false);
    run(life, near, 2); expect(life.steps.faces).toEqual([1, 2, 0]);
    life.dispose();
  });
});

describe('once a walk, the album and the days', () => {
  it('a second hand-in in the same walk pays nothing more; a resumed walk that already paid takes no errand', () => {
    const v = visitsFor('hide'); const f = fake(v); const a = f.walk(); const spot = E.SPOTS[E.planDeepErrand(undefined, v).spot];
    run(a.life, at(spot, 5), 3); press(at(spot, 1, 0.5)); expect(ST.deep.credit({ kind: 'wd-errand' })).toBeNull();
    expect(f.paid.length).toBe(1); expect(f.pr.state.crystal.chimes).toBe(1);
    a.life.dispose();
    const b = f.walk(); run(b.life, at(spot, 1, 0.5), 3);
    expect(ST.deep.promptAt(at(spot, 1, 0.5))).toBeNull(); expect(f.paid.length).toBe(1); expect(f.pr.state.crystal.chimes).toBe(1);
    b.life.dispose();
  });
  it('the album fills the lowest unset bit, to twelve, and a full album still pays the paws', () => {
    for (const [have, want] of [[0, 1], [1, 3], [5, 7], [4094, 4095], [4095, 4095]]) {
      const f = fake(visitsFor('hide'), { crystal: { chimes: have } }); const { life } = f.walk(); const spot = E.SPOTS[E.planDeepErrand(undefined, visitsFor('hide')).spot];
      run(life, at(spot, 5), 3); press(at(spot, 1, 0.5));
      expect(f.pr.state.crystal.chimes).toBe(want); expect(f.paid.length).toBe(1); life.dispose();
    }
  });
  it('walks on different days give different errands, and the same seed gives the same errand to every cat', () => {
    const kinds = new Set(Array.from({ length: 12 }, (_, v) => E.planDeepErrand(undefined, v).kind)); expect(kinds.size).toBeGreaterThan(1);
    const a = fake(0).walk(); const b = fake(0).walk({ roomSeed: 77, visits: 9 }); const c = fake(5).walk({ roomSeed: 77, visits: 1 });
    expect(E.planDeepErrand(77, 9)).toEqual(E.planDeepErrand(77, 1));
    for (const w of [a, b, c]) w.life.dispose();
  });
  it('not eligible before the story is told (deep bit 3), and not before it is open: no mesh, no prompt, no pay', () => {
    const f = fake(visitsFor('hide'), { crystal: { deep: 7 } }); const { life, scene } = f.walk(); const spot = E.SPOTS[E.planDeepErrand(undefined, visitsFor('hide')).spot];
    run(life, at(spot, 1, 0.5), 3);
    expect(ST.deep.promptAt(at(spot, 1, 0.5))).toBeNull(); expect(ST.deep.credit({ kind: 'wd-errand' })).toBeNull();
    expect(f.paid.length).toBe(0); expect(scene.children.some((c) => c.name === 'crystal:deep:errand')).toBe(false);
    life.dispose();
  });
});

describe('a partner, the guide and the drawing', () => {
  it('wd-errand pays this cat too, once, and sends nothing back', () => {
    const f = fake(visitsFor('moss')); const { life } = f.walk(); run(life, at(D.HALL), 1);
    expect(ST.deep.credit({ kind: 'wd-errand' })).toBe('errand');
    expect(f.paid.length).toBe(1); expect(f.pr.state.crystal.chimes).toBe(1); expect(f.sent).toEqual([]);
    expect(ST.deep.credit({ kind: 'wd-errand' })).toBeNull(); expect(f.pr.state.crystal.chimes).toBe(1);
    for (const ev of [null, 3, {}, { kind: 'wd-x' }, { kind: 'wd-found' }]) expect(ST.deep.credit(ev)).toBeNull();
    life.dispose();
  });
  it('the guide goal: Lumi errand first, then Tink; nothing once done', () => {
    const v = visitsFor('moss'); const f = fake(v); const { life } = f.walk(); const rest = { g: { kind: 'rest' } };
    expect(ST.deep.goalFor({ g: { kind: 'stone' } }, null).g.kind).toBe('stone');
    expect(ST.deep.goalFor(rest, { eligible: true, done: false })).toBe(rest);
    const g = ST.deep.goalFor(rest, { eligible: false }); expect(g.g.line).toContain('{at}'); expect(g.g.chip).toMatch(/\S/);
    expect(g).toMatchObject({ x: E.SPOTS[E.planDeepErrand(undefined, v).spot].x });
    ST.deep.credit({ kind: 'wd-errand' }); expect(ST.deep.goalFor(rest, null)).toBe(rest);
    life.dispose();
  });
  it('one mesh per kind, a few hundred triangles, finite, no light; none after the walk; a carried pad is not kept', () => {
    for (const kind of E.ERRAND_KINDS) {
      const v = visitsFor(kind); const f = fake(v); const { life, scene } = f.walk();
      let meshes = 0; let lights = 0; scene.traverse((o) => { if (o.isMesh && o.name === 'crystal:deep:errand') meshes++; if (o.isLight) lights++; });
      expect([kind, meshes, lights]).toEqual([kind, 1, 0]);
      const m = scene.children.find((c) => c.name === 'crystal:deep:errand'); const n = m.geometry.attributes.position.count / 3;
      expect(n).toBeLessThan(250); for (const x of m.geometry.attributes.position.array) expect(Number.isFinite(x)).toBe(true);
      console.log('errand', kind, 'triangles', n);
      life.dispose(); expect(scene.children.some((c) => c.name === 'crystal:deep:errand')).toBe(false);
    }
  });
  it('the bars are clear of the stands, the door, the nest and the hall wall, and on open floor', () => {
    for (const b of L.BAR_AT) {
      for (const c of [...D.STAND_COLLIDERS, ...D.DOOR_COLLIDERS, ...D.NEST_COLLIDERS, ...D.HALL_WALLS]) expect(Math.hypot(b.x - c.x, b.z - c.z), `bar ${b.i}`).toBeGreaterThan(c.r + 0.45);
      expect(Math.hypot(b.x - D.HALL.x, b.z - D.HALL.z)).toBeLessThan(D.HALL.r);
    }
    for (let i = 1; i < 5; i++) expect(Math.hypot(L.BAR_AT[i].x - L.BAR_AT[i - 1].x, L.BAR_AT[i].z - L.BAR_AT[i - 1].z)).toBeGreaterThan(L.BAR_TRIGGER * 2);
  });
});

describe('the words and the sources', () => {
  it('every line reads, is plain in both editions, and the album page has its hint', () => {
    const lines = () => Object.keys(DEEP_ERRAND_LINES).map((id) => [id, phrase(id)]);
    const on = lines(); const off = withOffWords(lines); expect(off).toEqual(on);
    for (const [id, s] of off) { expect(s).toMatch(/\S/); expect(bannedIn(s), id).toBeFalsy(); expect(s).not.toMatch(/stuck|trapped|dark|collapse|lost forever|scary/i); }
    expect(CRYSTAL_HINTS.ccchimes).toMatch(/\S/);
  });
  it('the sources draw no random number, read no clock and carry no apostrophe in a comment', () => {
    for (const f of ['crystaldeeperrandlive', 'crystaldeeperrandwords']) {
      const text = read(`src/world/${f}.js`);
      for (const line of text.split('\n')) { const i = line.indexOf('//'); if (i >= 0 && !/https?:/.test(line)) expect(line.slice(i), `${f}: ${line}`).not.toMatch(/'/); }
      expect(text.replace(/\/\/.*$/gm, ''), f).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date|PointLight/);
    }
  });
});
