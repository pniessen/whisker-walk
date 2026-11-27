// The Echo Deep, milestone C5: the whole second story end to end with a scripted cat, alone and in a room of two, the prize once only, the journal pages, and the words in both editions.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { sanitizeSave } from '../src/progression.js';
import { phrase } from '../src/clanphrases.js';
import { bannedIn, withOffWords } from './helpers/offwords.js';
import { setCrystalDeep } from '../src/crystalflag.js';
import { WING_LIVE, wingPageShown, CRYSTAL_HINTS } from '../src/crystalpages.js';
import * as D from '../src/world/crystaldeepplan.js';
import * as M from '../src/world/crystaldeepmission.js';
import * as PR from '../src/world/crystaldeepprism.js';
import * as WL from '../src/world/crystaldeepwall.js';

stubCanvasDocument();
setCrystalDeep(true);
await import('../src/world/crystalstagedeep.js');
const { createDeepLife } = await import('../src/world/crystaldeeplive.js');
const { withLiving } = await import('../src/world/crystaldeeptinklive.js');
const { CRYSTAL_DEEP_WALL_LINES } = await import('../src/world/crystaldeepwallwords.js');
const { TINK_LINES } = await import('../src/world/crystaldeeptinkwords.js');

const at = (x, z) => ({ x, z, y: 0 });
// one cat's walk: the hall shell with the wall and prisms (C3) and Tink (C4), made the way the stage makes them
function cat(crystal = { step: 7, songs: 7, album: 3 }, outbox = []) {
  const state = sanitizeSave({ version: 4, crystal });
  const seen = []; const paid = []; const colliders = [];
  const pr = { state, addPoints() {}, recordSighting: (id) => seen.push(id) };
  const log = { awardOnce: (type, key) => { if (paid.includes(key)) return 0; paid.push(key); return 40; } };
  const send = (e) => outbox.push(e);
  const ctx = { scene: new THREE.Scene(), tier: null, reducedMotion: true, progression: pr, log, audio: null, send, sendEvent: send, colliders };
  const live = withLiving(ctx, createDeepLife(ctx));
  let pos = at(-28, -19.6);
  const run = (secs, p = pos, t0 = 0) => { pos = p; for (let t = 0; t < secs; t += 0.05) live.update(0.05, t0 + t, p); };
  const walkTo = (path, t0 = 0) => { let t = t0; let a = pos; for (const b of path) { const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.15); for (let k = 1; k <= n; k++) { pos = at(a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n); live.update(0.05, t, pos); t += 0.05; } a = b; } return t; };
  const press = (p) => { run(0.1, p); const w = live.promptAt(p); const t = live.tink.promptAt(p); const line = w ?? t; const r = line ? (live.interact() ?? live.tink.interact()) : null; return { line, r }; };
  const credit = (e) => live.credit(e) ?? live.tink.credit(e);
  return { credit, pr, seen, paid, live, outbox, run, walkTo, press, get pos() { return pos; }, deep: () => M.deepBits(state.crystal) };
}
const hum = (c) => {
  expect(c.press(at(-28, -19.6)).r).toBe('hum');
  c.run(8);
  for (const pad of WL.WELCOME) { c.run(0.1, at(D.PADS[pad].x, D.PADS[pad].z)); c.run(0.1, at(-28, -19.6)); }
};
const turnPrisms = (c) => {
  for (let i = 0; i < 3; i++) for (let k = 0; k < ((PR.TARGET[i] - PR.START[i]) % 3 + 3) % 3; k++) expect(c.press(at(D.STANDS[i].x, D.STANDS[i].z + 0.9)).r).toBe('turn');
};
const OUT = [at(-28, -23), at(-28, -19), at(-22, -8), at(-12, 2), at(D.NOOK.x - 1.4, D.NOOK.z - 0.8)];

describe('the whole story, alone', () => {
  it('wall, prisms, hello, the walk home: four bits, one prize, one payment', () => {
    const c = cat();
    expect(c.deep()).toBe(0);
    hum(c); expect(c.deep()).toBe(1);
    c.run(4); turnPrisms(c); c.run(3); expect(c.deep()).toBe(3);
    expect(c.press(D.NEST.reachFrom).r).toBe('greet'); expect(c.deep()).toBe(7);
    c.run(0.5, D.NEST.reachFrom ? at(D.NEST.reachFrom.x, D.NEST.reachFrom.z) : c.pos);
    const t = c.walkTo([at(D.NEST.reachFrom.x, D.NEST.reachFrom.z), ...OUT], 1);
    c.run(9, c.pos, t);
    expect(c.deep()).toBe(15);
    expect(c.outbox.map((e) => e.kind)).toEqual(['wd-wall', 'wd-prism', 'wd-found', 'wd-home']);
    expect(c.pr.state.unlocked.accessories.filter((a) => a === 'prismcharm')).toHaveLength(1);
    expect(c.paid).toEqual(['crystal-deep']);
    expect(c.seen).toEqual(expect.arrayContaining(['ccwall', 'ccprism', 'ccdeep', 'cctink']));
  });
  it('a second walk after the end pays nothing and offers nothing', () => {
    const c = cat({ step: 7, songs: 7, album: 3, deep: 15 }); c.run(2);
    expect(c.press(at(-28, -19.6)).line).toBeNull(); expect(c.press(D.NEST.reachFrom).line).toBeNull();
    expect(c.paid).toEqual([]); expect(c.outbox).toEqual([]);
  });
  it('the story waits until the first story is told', () => {
    const c = cat({ step: 5, songs: 0, album: 0 }); expect(c.press(at(-28, -19.6)).line).toBeNull(); expect(c.deep()).toBe(0);
  });
});

describe('two cats in a room', () => {
  it('each step done by one cat is credited to the other, in any order; both get the charm and 40 paws once', () => {
    const aOut = []; const bOut = [];
    const a = cat(undefined, aOut); const b = cat(undefined, bOut);
    const relay = () => { while (aOut.length) { b.credit(aOut.shift()); } };
    hum(a); relay(); expect(b.deep()).toBe(1);
    turnPrisms(a); a.run(3); relay(); expect(b.deep()).toBe(3);
    expect(a.press(D.NEST.reachFrom).r).toBe('greet'); relay(); expect(b.deep()).toBe(7);
    a.run(0.5, at(D.NEST.reachFrom.x, D.NEST.reachFrom.z));
    const t = a.walkTo([...OUT], 1); a.run(9, a.pos, t); relay();
    expect(a.deep()).toBe(15); expect(b.deep()).toBe(15);
    for (const c of [a, b]) { expect(c.paid).toEqual(['crystal-deep']); expect(c.pr.state.unlocked.accessories).toContain('prismcharm'); }
    b.credit({ kind: 'wd-home' }); expect(b.paid).toEqual(['crystal-deep']);
  });
});

describe('the journal and the words', () => {
  it('all four story pages show and read, in both editions', () => {
    for (const k of ['wall', 'deep', 'prism', 'tink']) expect(WING_LIVE[k]).toBe(true);
    for (const id of ['ccwall', 'ccdeep', 'ccprism', 'cctink']) { expect(wingPageShown(id)).toBe(true); expect(CRYSTAL_HINTS[id]).toMatch(/\S/); expect(bannedIn(CRYSTAL_HINTS[id])).toBeFalsy(); }
    expect(wingPageShown('ccchimes')).toBe(false);
    const lines = () => [...Object.keys(CRYSTAL_DEEP_WALL_LINES), ...Object.keys(TINK_LINES)].map((id) => [id, phrase(id)]);
    const on = lines(); const off = withOffWords(lines);
    expect(off).toEqual(on);
    for (const [id, s] of off) { expect(s, id).toMatch(/\S/); expect(bannedIn(s), id).toBeFalsy(); expect(s).not.toMatch(/\bkind\b/i); }
  });
});
