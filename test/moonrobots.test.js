// The Moon's friendly robots and light (world/moonrobots.js plan and poses, moonrobotsparts.js drawing, moonrobotslive.js on a walk): the plans (deterministic, in bounds, clear of the
// colliders, finds, story points, decor and the rover's lane), the pure poses, reduced motion, the rungs, the convoy's wait for her rover, the pixel visitor's rules and its never
// entering a collider, the moonling's moods, the journal and photo registration for all six kinds, both word sets and the source rules.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { withOffWords, bannedIn } from './helpers/offwords.js';

const R = await import('../src/world/moonrobots.js');
const D = await import('../src/world/moonrobotsparts.js');
const { createRobotsLive } = await import('../src/world/moonrobotslive.js');
const { LINES, HINTS } = await import('../src/world/moonlifewords.js');
const P = await import('../src/world/moonplan.js');
const { clear } = await import('../src/world/moonbeautyplan.js');
const { BASE_ROWS } = await import('../src/world/moondecorbase.js');
const { HILL_ROWS } = await import('../src/world/moonstagehill.js');
const { phrase, hasPhrase } = await import('../src/clanphrases.js');
const { CRITTER_INFO } = await import('../src/journal.js');
const { JOURNAL_TYPES, createProgression } = await import('../src/progression.js');
const { MOON_LIFE_PAGES, MOON_HINTS, MOON_PAGE_WORDS } = await import('../src/moonpages.js');
const { memoryStorage } = await import('./helpers/storage.js');

const read = (f) => readFileSync(f, 'utf8');
const decor = [...BASE_ROWS, ...HILL_ROWS].filter((r) => r[0] !== 'trail' && r[0] !== 'cable');
const decorGap = (x, z) => Math.min(...decor.map((q) => Math.hypot(x - q[1], z - q[2])));
const allColliders = [...P.MOON_COLLIDERS];
const ring = (n, f) => { for (let i = 0; i < n; i++) f(i / n); };
const make = (o = {}) => { const scene = new THREE.Scene(); const life = createRobotsLive({ scene, roomSeed: 5, visits: 2, ...o }); return { scene, life }; };
const cam = () => { const c = new THREE.PerspectiveCamera(); return c; };
const catAt = (x, z) => ({ x, z, y: 0 });

describe('the plans', () => {
  it('the salts are all different', () => { expect(new Set(Object.values(R.SALTS)).size).toBe(Object.values(R.SALTS).length); });
  it('every pose reads the same twice', () => {
    for (const d of R.DRONES) expect(R.dronePose(d, 31.7, {})).toEqual(R.dronePose(d, 31.7, {}));
    expect(R.cleanerPose(13.3, {})).toEqual(R.cleanerPose(13.3, {}));
    for (let i = 0; i < 3; i++) expect(R.convoyPose(i, 77, {})).toEqual(R.convoyPose(i, 77, {}));
    for (const m of R.MOTHS) expect(R.mothPose(m, 9.9, {})).toEqual(R.mothPose(m, 9.9, {}));
    expect(R.pixelStop(R.PIXEL_SPOTS[1], 4, {})).toEqual(R.pixelStop(R.PIXEL_SPOTS[1], 4, {}));
    expect(R.moonlingPose(5, {})).toEqual(R.moonlingPose(5, {}));
    expect(R.pixelSpotIndex(3, 4)).toBe(R.pixelSpotIndex(3, 4));
  });
  it('the drones loop over open dust, 2 to 4 m up, clear of colliders and of every prop', () => {
    for (const d of R.DRONES) {
      ring(96, (f) => {
        const o = R.dronePose(d, f * d.period * (d.dir > 0 ? 1 : -1) - d.phase * d.period * d.dir / (2 * Math.PI), {});
        expect(R.inBounds(o.x, o.z, 2)).toBe(true);
        expect(clear(o.x, o.z, 0.8, 0.4, 0), `${o.x},${o.z}`).toBe(true);
        expect(decorGap(o.x, o.z)).toBeGreaterThan(1.7);
        expect(o.h).toBeGreaterThan(1.9); expect(o.h).toBeLessThan(3.8);
      });
    }
  });
  it('the cleaner bot\'s lane and the moths\' lamps are in bounds, and the lane is clear of everything', () => {
    for (let s = 0; s <= 1; s += 0.05) {
      const x = R.CLEANER.ax + (R.CLEANER.bx - R.CLEANER.ax) * s; const z = R.CLEANER.az + (R.CLEANER.bz - R.CLEANER.az) * s;
      expect(clear(x, z, 1.2, 0.5, 0), `${x},${z}`).toBe(true); expect(decorGap(x, z)).toBeGreaterThan(3);
    }
    ring(40, (f) => { const o = R.cleanerPose(f * R.CLEANER_CYCLE, {}); expect(Math.hypot(o.x - R.CLEANER.ax, o.z - R.CLEANER.az)).toBeLessThanOrEqual(7); });
    for (const h of R.MOTH_HOMES) expect(R.inBounds(h.x, h.z, 1)).toBe(true);
  });
  it('the convoy line is its own line beside the track (about 2 m off), clear of colliders, finds and her parked rover', () => {
    const pts = R.CONVOY_PATH;
    expect(pts.length).toBeGreaterThan(5);
    for (let i = 0; i < pts.length - 1; i++) for (let s = 0; s <= 40; s++) {
      const x = pts[i].x + (pts[i + 1].x - pts[i].x) * s / 40; const z = pts[i].z + (pts[i + 1].z - pts[i].z) * s / 40;
      expect(clear(x, z, 0.6, 0.3, 0, 1.2), `${x},${z}`).toBe(true);
      const td = P.trackDistance(x, z);
      expect(td).toBeGreaterThan(1.7); expect(td).toBeLessThan(2.9);
      expect(Math.hypot(x - P.DOT_PARK.x, z - P.DOT_PARK.z)).toBeGreaterThan(1.9);
    }
  });
  it('the four quiet corners are open discs, in bounds, clear of colliders, finds, decor and the track', () => {
    expect(R.PIXEL_SPOTS).toHaveLength(4);
    for (const s of R.PIXEL_SPOTS) {
      expect(R.inBounds(s.x, s.z, 5)).toBe(true);
      expect(clear(s.x, s.z, 4.2, 0.5, 0.15), `${s.x},${s.z}`).toBe(true);
      expect(decorGap(s.x, s.z)).toBeGreaterThan(5);
    }
  });
  it('the corner changes with the walk, and the moonling never shares the pixel visitor\'s corner', () => {
    const seen = new Set();
    for (let v = 0; v < 40; v++) { const a = R.pixelSpotIndex(7, v); seen.add(a); expect(R.moonlingSpotIndex(7, v, a)).not.toBe(a); }
    expect(seen.size).toBeGreaterThan(1);
  });
  it('every stop the pixel visitor can hop to is within reach of its corner\'s middle, and the flee point is too', () => {
    for (const s of R.PIXEL_SPOTS) {
      for (let k = 0; k < 300; k++) { const o = R.pixelStop(s, k, {}); expect(Math.hypot(o.x - s.x, o.z - s.z)).toBeLessThanOrEqual(R.PIXEL.reach + 1e-6); }
      const f = R.pixelFlee(s, { x: s.x + 1, z: s.z }, {}); expect(Math.hypot(f.x - s.x, f.z - s.z)).toBeLessThanOrEqual(R.PIXEL.reach);
    }
  });
});

describe('the life on a walk', () => {
  it('three draws, and the drones, moths, cleaner, convoy, pixel visitor and moonling are all there on a full device', () => {
    const { scene, life } = make();
    expect(life.counts).toMatchObject({ rung: 'high', drones: 4, convoy: 3, moths: 6, pixel: 1, cleaner: 1, moonling: 1, meshes: 3 });
    expect(['moon:robots', 'moon:droneGlow', 'moon:moths'].map((n) => !!scene.getObjectByName(n))).toEqual([true, true, true]);
    life.update(0.1, 0.1, catAt(0, 20), cam());
    const m = scene.getObjectByName('moon:robots');
    expect(m.geometry.drawRange.count).toBeGreaterThan(300);
    expect(m.geometry.drawRange.count / 3).toBeLessThan(2400);
    life.dispose();
    expect(scene.children).toHaveLength(0);
  });
  it('the low and lite rungs keep fewer', () => {
    expect(make({ tier: { name: 'low', rung: 3, shadows: true } }).life.counts).toMatchObject({ rung: 'low', drones: 3, convoy: 2, moths: 4 });
    expect(make({ tier: { name: 'lite', shadows: false } }).life.counts).toMatchObject({ rung: 'lite', drones: 2, convoy: 2, moths: 4 });
  });
  it('reduced motion draws it once and nothing moves after', () => {
    const { scene, life } = make({ reducedMotion: true });
    life.update(0.1, 0.1, catAt(0, 20), cam());
    const pos = scene.getObjectByName('moon:robots').geometry.getAttribute('position').array.slice();
    const mp = scene.getObjectByName('moon:moths').geometry.getAttribute('position').array.slice();
    for (let i = 0; i < 100; i++) life.update(0.1, i, catAt(-13, 2 + i * 0.01), cam());
    expect(Array.from(scene.getObjectByName('moon:robots').geometry.getAttribute('position').array)).toEqual(Array.from(pos));
    expect(Array.from(scene.getObjectByName('moon:moths').geometry.getAttribute('position').array)).toEqual(Array.from(mp));
    expect(life.state.clock).toBe(0);
  });
  it('the same walk draws the same robots every time', () => {
    const run = () => { const { scene, life } = make(); for (let i = 0; i < 200; i++) life.update(1 / 30, i / 30, catAt(0, 20), cam()); return Array.from(scene.getObjectByName('moon:robots').geometry.getAttribute('position').array.slice(0, 600)); };
    expect(run()).toEqual(run());
  });
  it('the convoy rolls, and halts while her driven rover is within 4 m of any of it, and goes on when she drives away', () => {
    let rv = null;
    const { life } = make({ roverAt: () => rv });
    for (let i = 0; i < 60; i++) life.update(1 / 30, i / 30, catAt(0, 20), cam());
    const d0 = life.state.convoyD; expect(d0).toBeGreaterThan(1);
    const p = life.spottable.find((e) => e.type === 'mlconvoy').pos;
    rv = { riding: true, x: p.x + 2, z: p.z };
    for (let i = 0; i < 60; i++) life.update(1 / 30, 2 + i / 30, catAt(0, 20), cam());
    expect(life.state.convoyD).toBe(d0);
    rv = { riding: true, x: p.x + 30, z: p.z };
    for (let i = 0; i < 60; i++) life.update(1 / 30, 4 + i / 30, catAt(0, 20), cam());
    expect(life.state.convoyD).toBeGreaterThan(d0);
    rv = { riding: false, x: p.x, z: p.z }; // parked: it drives past
    const d1 = life.state.convoyD; life.update(0.5, 6, catAt(0, 20), cam());
    expect(life.state.convoyD).toBeGreaterThan(d1);
  });
  it('the pixel visitor never enters a collider or leaves its corner, whatever she does', () => {
    const { life } = make();
    const sp = life.state.spot;
    const c = cam();
    let hops = 0; let last = null;
    for (let i = 0; i < 6000; i++) {
      const phase = Math.floor(i / 600) % 3;
      const cat = phase === 0 ? catAt(sp.x + 9, sp.z) : phase === 1 ? catAt(sp.x + 1.5 + Math.sin(i * 0.02), sp.z + 1) : catAt(sp.x - 6, sp.z + 6);
      c.position.set(cat.x, 1, cat.z); c.lookAt(sp.x, 0.5, sp.z); c.updateMatrixWorld();
      life.update(1 / 30, i / 30, cat, c);
      const e = life.spottable.find((q) => q.type === 'mlpixel').pos;
      expect(Math.hypot(e.x - sp.x, e.z - sp.z)).toBeLessThanOrEqual(R.PIXEL.reach + 0.01);
      for (const k of allColliders) expect(Math.hypot(e.x - k.x, e.z - k.z)).toBeGreaterThan(k.r);
      expect(clear(e.x, e.z, 0.3, 0.2, 0.15)).toBe(true);
      const hp = life.state.pixel.hopT >= 0;
      if (last === false && hp) hops++;
      last = hp;
    }
    expect(hops).toBeGreaterThan(10);
  });
  it('the pixel visitor freezes while she looks at it within 12 m, and hops away when she is within 3 m', () => {
    const { life } = make();
    const sp = life.state.spot; const c = cam();
    const look = (cat) => { c.position.set(cat.x, 1, cat.z); c.lookAt(sp.x, 1, sp.z); c.updateMatrixWorld(); };
    let t = 0; const far = catAt(sp.x + 11, sp.z);
    look(far);
    for (let i = 0; i < 900 && !life.state.pixel.frozen; i++) life.update(1 / 30, t += 1 / 30, far, c);
    expect(life.state.pixel.frozen).toBe(true); // at rest and looked at
    const at = { ...life.state.pixel.from };
    let moved = false;
    for (let i = 0; i < 15; i++) { life.update(1 / 30, t += 1 / 30, far, c); if (life.state.pixel.hopT >= 0 && life.state.pixel.shown) moved = true; }
    expect(moved).toBe(false); expect(life.state.pixel.from).toEqual(at);
    // she comes within 3 m: a hop to a point farther from her, never a chase
    const near = catAt(at.x + 1.2, at.z);
    c.position.set(near.x, 1, near.z); c.updateMatrixWorld();
    let hopped = false;
    for (let i = 0; i < 400 && life.state.pixel.hopT >= 0; i++) life.update(1 / 30, t += 1 / 30, near, c);
    const at2 = { ...life.state.pixel.from };
    for (let i = 0; i < 400; i++) { life.update(1 / 30, t += 1 / 30, near, c); if (life.state.pixel.hopT >= 0) { hopped = true; break; } }
    expect(hopped).toBe(true);
    const to = life.state.pixel.to;
    expect(Math.hypot(to.x - near.x, to.z - near.z)).toBeGreaterThan(Math.hypot(at2.x - near.x, at2.z - near.z) - 1e-9);
  });
  it('the moonling peeks when she is near, greets her when she sits (with a chime), and drifts back when she runs at it', () => {
    let chimes = 0;
    const { life } = make({ audio: { chime: () => { chimes++; } } });
    const home = life.state.mlSpot; const c = cam();
    let t = 0;
    const step = (cat, n) => { for (let i = 0; i < n; i++) life.update(1 / 30, t += 1 / 30, cat, c); };
    step(catAt(home.x + 40, home.z), 60);
    expect(life.state.moonling.peek).toBeLessThan(0.05);
    expect(life.spottable.find((e) => e.type === 'mlmoonling').range).toBe(0);
    step(catAt(home.x + 5, home.z), 150);
    expect(life.state.moonling.peek).toBeGreaterThan(0.9);
    expect(life.spottable.find((e) => e.type === 'mlmoonling').range).toBeGreaterThan(0);
    expect(chimes).toBe(1); // she stands still near it: one greeting, then a rest of 25 s
    // she runs at it: 6 m/s for a second
    let x = home.x + 6;
    for (let i = 0; i < 30; i++) { x -= 0.2; life.update(1 / 30, t += 1 / 30, catAt(x, home.z), c); }
    expect(life.state.moonling.shy).toBeGreaterThan(0);
    step(catAt(x, home.z), 120);
    expect(life.state.moonling.peek).toBeLessThan(0.3);
  });
});

describe('photo targets and journal cards', () => {
  const KINDS = ['mldrone', 'mlcleaner', 'mlconvoy', 'mlmoth', 'mlpixel', 'mlmoonling'];
  it('all six kinds are spottable with a label and a range, and each is a journal page', () => {
    const { life } = make();
    for (const k of KINDS) {
      const es = life.spottable.filter((e) => e.type === k);
      expect(es.length, k).toBeGreaterThan(0);
      for (const e of es) { expect(e.pos).toBeInstanceOf(THREE.Vector3); expect(e.label).toMatch(/^a /); expect(typeof e.range).toBe('number'); }
      expect(JOURNAL_TYPES).toContain(k);
    }
    expect(MOON_LIFE_PAGES.map((p) => p[0])).toEqual(KINDS);
    expect(JOURNAL_TYPES.slice(JOURNAL_TYPES.indexOf('mldrone'), JOURNAL_TYPES.indexOf('mldrone') + 6)).toEqual(KINDS); // appended in a row (later wings follow)
  });
  it('the cards carry their names from start-up and their hints from the lazy words, and the progression saves the ids', () => {
    for (const [id, , , name] of MOON_LIFE_PAGES) {
      const card = CRITTER_INFO.find((c) => c.id === id);
      expect(card.moon).toBe(true); expect(card.name).toBe(name); expect(card.hint).toBe(HINTS[id]); expect(MOON_HINTS[id]).toBe(HINTS[id]);
      expect(MOON_PAGE_WORDS[id].name()).toBe(name);
      withOffWords(() => expect(bannedIn(`${card.name} ${card.hint}`)).toBeNull());
    }
    expect(HINTS.mlpixel).toBe('A tiny visitor from a very old game.');
    const p = createProgression(memoryStorage());
    p.recordSighting('mlpixel'); p.recordSighting('mlmoonling'); p.recordSighting('mlmoonling');
    expect(p.state.journal).toMatchObject({ mlpixel: 1, mlmoonling: 2 });
  });
});

describe('the words, in both sets, and the source', () => {
  const scary = /\b(dark|lost forever|trapped|stuck|collapse\w*|scary|scared|afraid|danger\w*)\b/i;
  it('six short kind labels in the table, the same in both sets, and kind hints', () => {
    for (const id of Object.keys(LINES)) {
      expect(hasPhrase(id), id).toBe(true);
      expect(phrase(id)).toMatch(/^a /); expect(phrase(id)).not.toMatch(scary);
      withOffWords(() => { expect(bannedIn(phrase(id)), id).toBeNull(); });
    }
    for (const h of Object.values(HINTS)) { expect(h).not.toMatch(scary); expect(h.length).toBeLessThanOrEqual(90); }
    expect(phrase('moon.life.pixel')).toBe('a pixel visitor');
  });
  it('no clock, no Math.random, no brand name in the new files; every phrase() call is a literal id', () => {
    for (const f of ['moonrobots', 'moonrobotsparts', 'moonrobotslive', 'moonlifewords']) {
      const src = read(`src/world/${f}.js`).replace(/\/\/.*$/gm, '');
      expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date/);
      expect(src).not.toMatch(/mario|nintendo|pac-?man|sega|atari|minecraft/i);
    }
    for (const m of read('src/world/moonrobotslive.js').replace(/\/\/.*$/gm, '').matchAll(/\bphrase\(([^)]*)\)/g)) { expect(m[1]).toMatch(/^'[a-z0-9.]+'$/); expect(Object.keys(LINES)).toContain(m[1].slice(1, -1)); }
  });
  it('the soup writes whole boxes: 36 vertices each and unit normals', () => {
    const s = new D.Boxes(4); s.begin(); s.box(1, 2, 3, 1, 1, 1, 0.7, [255, 0, 0]);
    expect(s.k).toBe(36);
    for (let i = 0; i < 36; i++) expect(Math.hypot(s.n[i * 3], s.n[i * 3 + 1], s.n[i * 3 + 2])).toBeCloseTo(1, 5);
  });
});
