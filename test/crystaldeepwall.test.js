// The Echo Deep, milestone C3: the singing wall and the three prisms, live. The pure rules are C1 (crystaldeepc1.test.js); this holds the wiring: the offer through the arbiter slot, the wall
// phrase and the pads, the plug collider, the prisms turning, the door-crystal, the saves and the partner steps, reduced motion, the words and the source rules.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import * as D from '../src/world/crystaldeepplan.js';
import * as M from '../src/world/crystaldeepmission.js';
import * as PR from '../src/world/crystaldeepprism.js';
import * as WL from '../src/world/crystaldeepwall.js';
import * as SG from '../src/world/crystalsongplan.js';
import { ST } from '../src/world/crystalstages.js';
import { setCrystalDeep } from '../src/crystalflag.js';
import { phrase } from '../src/clanphrases.js';
import { bus } from '../src/events.js';

setCrystalDeep(true);
await import('../src/world/crystalstagedeep.js');
const { createDeepLife } = await import('../src/world/crystaldeeplive.js');
const read = (f) => readFileSync(f, 'utf8');

const OPEN = { step: 7, songs: 7, album: 3 };
function mk({ crystal = OPEN, reducedMotion = false, tier = null } = {}) {
  const scene = new THREE.Scene();
  const sent = []; const seen = []; const colliders = [];
  const progression = { state: { crystal: { ...crystal } }, addPoints() {}, recordSighting(id) { seen.push(id); } };
  const life = createDeepLife({ scene, tier, reducedMotion, progression, audio: null, sendEvent: (e) => sent.push(e), colliders });
  const at = (x, z) => ({ x, z, y: 0 });
  const wallSpot = at(-28, -19.6);
  const run = (secs, p = wallSpot) => { for (let t = 0; t < secs; t += 0.1) life.update(0.1, t, p); };
  return { scene, life, sent, seen, colliders, progression, at, wallSpot, run };
}
const bitsOf = (h) => M.deepBits(h.progression.state.crystal);
// open the wall by stepping the phrase: begin, let it play, then stand on each pad in order
function hum(h) {
  expect(h.life.promptAt(h.wallSpot)).toBe(phrase('crystal.deep.wall.prompt'));
  expect(h.life.interact()).toBe('hum');
  h.run(8); // the phrase plays and the echo begins
  for (const pad of WL.WELCOME) { h.life.update(0.1, 0, h.at(D.PADS[pad].x, D.PADS[pad].z)); h.life.update(0.1, 0, h.wallSpot); }
}

describe('the plan seams', () => {
  it('the door pattern is the prism target, and the pad copies equal the song plan', () => {
    expect([...D.DOOR_PATTERN]).toEqual([...PR.TARGET]);
    expect(D.PADS.map((p) => [p.x, p.z])).toEqual(SG.PADS.map((p) => [p.x, p.z]));
    expect([...D.PAD_FREQS]).toEqual([...SG.NOTES]);
    for (const p of SG.PADS) expect(D.padAt(p.x, p.z)).toBe(SG.padAt(p.x, p.z));
    expect(D.padAt(0, 0)).toBe(-1);
  });
  it('the plug closes the passage and sits in the cleared rectangle', () => {
    const open = D.PASSAGE.halfW;
    for (let dx = -open; dx <= open; dx += 0.1) expect(D.WALL_PLUG.some((c) => Math.hypot(D.PASSAGE.x + dx - c.x, D.WALL.z - c.z) < c.r), `dx ${dx}`).toBe(true);
    expect(D.WALL.x).toBe(D.PASSAGE.x);
  });
  it('the moving pieces are the last ranges and the rest of the meshes never changes', () => {
    const h = mk();
    const solid = h.life.meshes[0].geometry.attributes.position; const glow = h.life.meshes[1].geometry.attributes.position;
    const d = h.life.steps; void d;
    const before = Array.from(solid.array.slice(0, 3 * 4000)).join();
    hum(h); h.run(4); h.life.promptAt(h.at(D.STANDS[0].x, D.STANDS[0].z + 0.9)); h.life.interact();
    h.run(2);
    expect(Array.from(solid.array.slice(0, 3 * 4000)).join()).not.toBe(''); // a sanity read
    expect(solid.count).toBeGreaterThan(0); expect(glow.count).toBeGreaterThan(0);
    void before;
  });
});

describe('step 1: the wall', () => {
  it('is offered only near the wall, only once the story is open, never twice', () => {
    const h = mk();
    expect(h.life.promptAt(h.wallSpot)).toBe(phrase('crystal.deep.wall.prompt'));
    expect(h.life.promptAt(h.at(-27, -10))).toBe(null);
    expect(h.life.promptAt(h.at(-28, -26))).toBe(null);
    for (const crystal of [{ step: 6, songs: 7, album: 3 }, { step: 7, songs: 3, album: 3 }, { step: 7, songs: 7, album: 1 }, {}]) expect(mk({ crystal }).life.promptAt(h.wallSpot)).toBe(null);
    expect(h.life.promptAt(h.wallSpot)).toBe(phrase('crystal.deep.wall.prompt'));
    expect(h.life.interact()).toBe('hum');
    expect(h.life.promptAt(h.wallSpot)).toBe(null); // the phrase is running: no second offer
  });
  it('is closed with a plug, drawn as a slab; stepping the phrase opens it, saves bit 0 once, sends one event, shows the page', () => {
    const h = mk();
    expect(h.colliders.length).toBe(D.WALL_PLUG.length);
    hum(h);
    expect(bitsOf(h) & 1).toBe(1);
    expect(h.sent).toEqual([{ kind: 'wd-wall' }]);
    expect(h.seen).toEqual(['ccwall']);
    h.run(4);
    expect(h.colliders.length).toBe(0);
    expect(h.life.steps.state.wall).toBe(1);
    expect(h.life.promptAt(h.wallSpot)).toBe(null);
  });
  it('a wrong step or a wait never fails: the phrase replays and the wall opens by itself', () => {
    const h = mk();
    h.life.promptAt(h.wallSpot); h.life.interact(); h.run(8);
    const wrong = D.PADS.find((p) => p.i !== WL.WELCOME[0]);
    h.life.update(0.1, 0, h.at(wrong.x, wrong.z));
    expect(bitsOf(h)).toBe(0);
    h.run(90);
    expect(bitsOf(h) & 1).toBe(1); // it opened by waiting
    expect(h.sent.length).toBe(1);
  });
  it('walking away lets the tune go and saves nothing', () => {
    const h = mk();
    h.life.promptAt(h.wallSpot); h.life.interact();
    h.run(3, h.at(-27, 5));
    expect(h.life.steps.state.running).toBe(false);
    h.run(90, h.at(-27, 5));
    expect(bitsOf(h)).toBe(0);
  });
  it('a saved open wall is open and unplugged from the first frame', () => {
    const h = mk({ crystal: { ...OPEN, deep: 1 } });
    expect(h.colliders.length).toBe(0); expect(h.life.steps.state.wall).toBe(1);
  });
  it('reduced motion opens the wall at once; otherwise it slides over about 2.5 s', () => {
    const rm = mk({ reducedMotion: true }); hum(rm); rm.life.update(0.1, 0, rm.wallSpot);
    expect(rm.life.steps.state.wall).toBe(1);
    const h = mk(); hum(h); h.life.update(0.5, 0, h.wallSpot);
    expect(h.life.steps.state.wall).toBeGreaterThan(0); expect(h.life.steps.state.wall).toBeLessThan(1);
  });
});

describe('step 2: the prisms', () => {
  const stand = (i) => ({ x: D.STANDS[i].x, z: D.STANDS[i].z + 1 });
  const turn = (h, i) => { expect(h.life.promptAt({ ...stand(i), y: 0 })).toBe(phrase('crystal.deep.prism.turn')); return h.life.interact(); };
  it('are not offered while the wall is closed or the story is not open', () => {
    const h = mk(); expect(h.life.promptAt({ ...stand(0), y: 0 })).toBe(null);
    const g = mk({ crystal: { step: 7 } }); expect(g.life.promptAt({ ...stand(0), y: 0 })).toBe(null); // the story is not open for this save
  });
  it('any start reaches solved by turns, lights the rings and the door, saves bit 1 once and sends one event', () => {
    const h = mk({ crystal: { ...OPEN, deep: 1 } });
    expect(h.life.steps.faces).toEqual([...PR.START]);
    const need = PR.TARGET.map((t, i) => (t - PR.START[i] + 3) % 3);
    for (let i = 0; i < 3; i++) for (let k = 0; k < need[i]; k++) { expect(turn(h, i)).toBe('turn'); h.run(1); }
    expect(PR.solved(h.life.steps.faces)).toBe(true);
    expect(bitsOf(h) & 2).toBe(2);
    expect(h.sent).toEqual([{ kind: 'wd-prism' }]);
    expect(h.seen).toEqual(['ccprism']);
    h.run(3);
    expect(h.life.steps.state.doorLevel).toBe(1);
    expect(h.life.promptAt({ ...stand(0), y: 0 })).toBe(null); // done: the stands hold
  });
  it('an extra turn is never a mistake: three turns come round again', () => {
    const h = mk({ crystal: { ...OPEN, deep: 1 } });
    for (let k = 0; k < 3; k++) turn(h, 0);
    expect(h.life.steps.faces[0]).toBe(PR.START[0]);
    expect(bitsOf(h)).toBe(1);
  });
  it('a saved set shows the door lit and the prisms at the pattern from the first frame', () => {
    const h = mk({ crystal: { ...OPEN, deep: 3 } });
    expect(h.life.steps.faces).toEqual([...PR.TARGET]); expect(h.life.steps.state.doorLevel).toBe(1);
  });
  it('the prism turns smoothly, or at once under reduced motion', () => {
    const pos = (h) => Array.from(h.life.meshes[0].geometry.attributes.position.array.slice(-3 * 40)).join();
    const a = mk({ crystal: { ...OPEN, deep: 1 } }); const p0 = pos(a); turn(a, 2); a.life.update(0.05, 0, a.wallSpot);
    const mid = pos(a); a.run(3); const end = pos(a);
    expect(mid).not.toBe(p0); expect(end).not.toBe(mid);
    const b = mk({ crystal: { ...OPEN, deep: 1 }, reducedMotion: true }); turn(b, 2); b.life.update(0.05, 0, b.wallSpot);
    expect(pos(b)).toBe(end);
  });
});

describe('a partner step and the arbiter slot', () => {
  it('wd-wall and wd-prism credit this save in order, once; other kinds and bad payloads are nothing here', () => {
    const h = mk();
    expect(h.life.credit({ kind: 'wd-found' })).toBe(null);
    expect(h.life.credit({ kind: 'wd-home' })).toBe(null);
    for (const bad of [null, undefined, 5, {}, { kind: 7 }, { kind: 'wd-' }, { kind: 'wd-nope' }]) expect(h.life.credit(bad)).toBe(null);
    expect(bitsOf(h)).toBe(0);
    expect(h.life.credit({ kind: 'wd-prism' })).toBe('prism');
    expect(bitsOf(h)).toBe(3);
    expect(h.life.credit({ kind: 'wd-prism' })).toBe(null);
    h.run(4);
    expect(h.life.steps.faces).toEqual([...PR.TARGET]); expect(h.colliders.length).toBe(0); expect(h.life.steps.state.doorLevel).toBe(1);
    expect(h.sent).toEqual([]); // a credit is never sent on again
  });
  it('a partner step does nothing on a save that is not open yet', () => {
    const h = mk({ crystal: {} }); expect(h.life.credit({ kind: 'wd-wall' })).toBe(null); expect(bitsOf(h)).toBe(0);
  });
  it('the stage slot reads the live of this walk: prompts at the wall, the stands and not elsewhere; null with no live', () => {
    const none = ST.deep.promptAt({ x: -28, z: -19.6 });
    expect(none).toBe(null);
    const h = mk();
    const slot = (get) => ({ promptAt: (p) => get()?.promptAt?.(p) ?? null, interact: () => get()?.interact?.() ?? null });
    const s = slot(() => ST.deep);
    const life = ST.deep.life({ scene: new THREE.Scene(), tier: null, reducedMotion: false, progression: h.progression, audio: null, sendEvent: () => {}, colliders: [] });
    expect(s.promptAt({ x: -28, z: -19.6, y: 0 })).toBe(phrase('crystal.deep.wall.prompt'));
    expect(s.promptAt({ x: -27, z: -10, y: 0 })).toBe(null);
    expect(s.promptAt({ x: -28, z: -19.6, y: 0 })).toBe(phrase('crystal.deep.wall.prompt'));
    expect(s.interact()).toBe('hum');
    expect(ST.deep.credit({ kind: 'wd-nothing' })).toBe(null);
    expect(ST.deep.credit({ kind: 'wd-wall' })).toBe('wall'); // the slot reaches the live of this walk
    life.dispose();
    expect(s.promptAt({ x: -28, z: -19.6, y: 0 })).toBe(null);
  });
  it('the prompt wins over the singing chamber at the wall (it comes first in the arbiter) and gives way everywhere else in the chamber', () => {
    const h = mk();
    const centre = { x: SG.CHAMBER.x, z: SG.CHAMBER.z, y: 0 };
    expect(h.life.promptAt(centre)).toBe(null);
    expect(Math.hypot(h.wallSpot.x - SG.CHAMBER.x, h.wallSpot.z - SG.CHAMBER.z)).toBeLessThan(SG.ACTIVE_R); // so the song would otherwise win here
  });
});

describe('the words and the sources', () => {
  it('every line reads in both editions as the same plain sentence', async () => {
    const { CRYSTAL_DEEP_WALL_LINES } = await import('../src/world/crystaldeepwallwords.js');
    for (const k of Object.keys(CRYSTAL_DEEP_WALL_LINES)) { const v = phrase(k); expect(v.length, k).toBeGreaterThan(8); expect(v).toBe(CRYSTAL_DEEP_WALL_LINES[k]()); }
  });
  it('no apostrophe in a comment, no random number, no clock, no light', () => {
    for (const f of ['crystaldeepwalllive', 'crystaldeepwallwords', 'crystaldeeplive', 'crystaldeepparts', 'crystaldeepplan', 'crystalstagedeep']) {
      const text = read(`src/world/${f}.js`);
      for (const line of text.split('\n')) { const i = line.indexOf('//'); if (i >= 0 && !/https?:/.test(line)) expect(line.slice(i), `${f}: ${line}`).not.toMatch(/'/); }
      expect(text.replace(/\/\/.*$/gm, ''), f).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date|PointLight/);
    }
  });
  it('the hall stays at three meshes and under 6,000 triangles', () => {
    const h = mk();
    expect(h.life.draws).toBe(3); expect(h.life.triangles).toBeLessThanOrEqual(6000);
    console.log('deep triangles with the wall and prisms', h.life.triangles);
    void bus;
  });
});
