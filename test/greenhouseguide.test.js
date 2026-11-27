// The Greenhouse's written guide: the pure goal and words, the arrow's rule, and the live ring and line.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
stubCanvasDocument();

const G = await import('../src/world/greenhouseguide.js');
const { createGreenhouseGuideLive } = await import('../src/world/greenhouseguidelive.js');
const P = await import('../src/world/greenhouseplan.js');
const L = await import('../src/world/greenhouselife.js');
const { phrase } = await import('../src/clanphrases.js');
const { withOffWords, bannedIn } = await import('./helpers/offwords.js');

const base = { seeds: 0, seedState: 'looking', held: false, watered: 0, allWatered: false };
const info = (o = {}) => ({ state: { ...base, ...(o.state ?? {}) }, packets: o.packets ?? [], pots: o.pots ?? [], cat: o.cat ?? { x: 0, z: 30 }, arrived: o.arrived ?? false });
const packets = [{ x: 5, z: 5, visible: true }, { x: 1, z: 1, visible: true }, { x: -9, z: 0, visible: false }];
const asMeshes = (l) => l.map((p) => ({ position: { x: p.x, z: p.z }, visible: p.visible }));
const pots = [{ x: 3, z: 3, visible: true }, { x: -3, z: 3, visible: false }, { x: 10, z: 10, visible: true }];

describe('the goal, from the life\'s own state', () => {
  it('the bench first, from the spawn; the seed job once she has been to it; the nearest unpicked packet', () => {
    expect(G.goalOf(info())).toMatchObject({ kind: 'bench', x: P.POTTING.x, z: P.POTTING.z });
    const g = G.goalOf(info({ arrived: true, packets, cat: { x: 0, z: 0 } }));
    expect(g).toMatchObject({ kind: 'packet', x: 1, z: 1, n: 0, total: 5 });
    expect(G.goalOf(info({ arrived: true, packets, state: { seeds: 2 } }))).toMatchObject({ n: 2, total: 5 });
  });
  it('five packets lead to the tray; sown leads to the can, then the nearest thirsty pot; both done is nothing', () => {
    expect(G.goalOf(info({ arrived: true, state: { seeds: 5 } }))).toMatchObject({ kind: 'tray', x: P.POTTING.tray.x });
    expect(G.goalOf(info({ arrived: true, state: { seeds: 5, seedState: 'sown' } }))).toMatchObject({ kind: 'can', x: P.POTTING.canHome.x, total: 4 });
    expect(G.goalOf(info({ arrived: true, pots, cat: { x: 0, z: 0 }, state: { seedState: 'sown', held: true, watered: 1 } }))).toMatchObject({ kind: 'pot', x: 3, n: 1, total: 4 });
    expect(G.goalOf(info({ arrived: true, state: { seedState: 'sown', allWatered: true, watered: 4 } }))).toBeNull();
    expect(G.goalOf(null)).toBeNull();
  });
  it('a can in her mouth keeps her on the watering job even before the seeds are sown', () => {
    expect(G.goalOf(info({ pots, state: { held: true } })).kind).toBe('pot');
  });
});

describe('the goal line, in both word sets', () => {
  const goals = [{ kind: 'bench' }, { kind: 'packet', n: 2, total: 5 }, { kind: 'tray' }, { kind: 'can' }, { kind: 'pot', n: 3, total: 4 }];
  it('says the real counts, and says nothing for no goal', () => {
    expect(G.goalWords(goals[0])).toBe('Go to the potting bench: the seed job and the watering job are there.');
    expect(G.goalWords(goals[1])).toBe('Find the seed packets (2 of 5)');
    expect(G.goalWords(goals[4])).toBe('Water the thirsty plants (3 of 4)');
    expect(G.goalWords(null)).toBe('');
  });
  it('every line is the same in both sets and has no banned or series word', () => {
    const clan = goals.map((g) => G.goalWords(g));
    const plain = withOffWords(() => goals.map((g) => G.goalWords(g)));
    expect(plain).toEqual(clan);
    for (const t of [...clan, ...plain]) { expect(t).not.toBe(''); expect(bannedIn(t), t).toBeNull(); expect(t).not.toMatch(/dark|lost forever|trapped|stuck|collapse/i); }
  });
});

describe('the arrow: off screen and more than 8 m away, to the nearest 5 m', () => {
  const cam = (x, z, yaw = 0) => ({ position: { x, y: 3, z }, quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), fov: 50, aspect: 1.6 });
  it('round5', () => { expect([0, 2, 2.6, 7.4, 12, 27.4].map(G.round5)).toEqual([0, 0, 5, 5, 10, 25]); });
  it('from the spawn looking away from the bench the arrow shows, turns to the bench\'s side, and says about 25 m', () => {
    const v = G.viewOf(cam(0, 33, 0)); // looking north (-z); the bench is east and north
    const out = G.arrowFor(v, { x: 0, z: 30 }, { x: P.POTTING.x, y: 1, z: P.POTTING.z });
    expect(out.show).toBe(true);
    expect(out.rel).toBeGreaterThan(0.3); // to her right (east)
    expect(G.round5(out.dist)).toBe(25);
  });
  it('hidden when it is on screen, or 8 m or less away', () => {
    const v = G.viewOf(cam(P.POTTING.x, P.POTTING.z + 10, 0));
    expect(G.arrowFor(v, { x: P.POTTING.x, z: P.POTTING.z + 12 }, { x: P.POTTING.x, y: 1, z: P.POTTING.z }).show).toBe(false);
    const w = G.viewOf(cam(0, 33, Math.PI)); // looking south, goal behind
    expect(G.arrowFor(w, { x: P.POTTING.x, z: P.POTTING.z + 6 }, { x: P.POTTING.x, y: 1, z: P.POTTING.z }).show).toBe(false);
  });
  it('edgePoint keeps the arrow inside the rectangle', () => {
    for (const rel of [0, 1, 2, 3, -1, -2.5]) { const e = G.edgePoint(rel, { l: 10, t: 20, r: 300, b: 200 }); expect(e.x).toBeGreaterThanOrEqual(10 - 1e-6); expect(e.x).toBeLessThanOrEqual(300 + 1e-6); expect(e.y).toBeLessThanOrEqual(200 + 1e-6); }
  });
});

describe('the live ring', () => {
  function rig(reducedMotion = false) {
    const scene = new THREE.Scene();
    const life = { state: { ...base }, meshes: { packets: asMeshes(packets), clouds: [] } };
    const guide = createGreenhouseGuideLive({ scene, life, reducedMotion, doc: null });
    return { scene, guide, life };
  }
  it('from the spawn the ring stands at the bench; with a camera looking away the arrow is on and says 25 m', () => {
    const { guide } = rig();
    const cat = { x: 0, y: 0, z: 30 };
    guide.update(0.3, 1, cat, { position: new THREE.Vector3(0, 3, 33), quaternion: new THREE.Quaternion(), fov: 50, aspect: 1.6 });
    expect(guide.ring.visible).toBe(true);
    expect(guide.ring.position.x).toBe(P.POTTING.x);
    expect(guide.ring.position.z).toBe(P.POTTING.z);
    expect(guide.state.text).toBe(phrase('greenhouse.guide.bench'));
    expect(guide.state.arrowOn).toBe(true);
    expect(guide.state.metres).toBe(25);
  });
  it('near the bench, the goal moves on to the packets and the line says 0 of 5', () => {
    const { guide } = rig();
    guide.update(0.3, 1, { x: P.POTTING.x, y: 0, z: P.POTTING.z + 5 }, null);
    guide.update(0.3, 2, { x: P.POTTING.x, y: 0, z: P.POTTING.z + 5 }, null);
    expect(guide.state.text).toBe('Find the seed packets (0 of 5)');
  });
  it('reduced motion holds the ring still', () => {
    const a = rig(true).guide;
    a.update(0.3, 0, { x: 0, y: 0, z: 30 }, null);
    const s1 = a.ring.scale.x; const o1 = a.ring.material.opacity;
    a.update(0.3, 0.7, { x: 0, y: 0, z: 30 }, null);
    expect([a.ring.scale.x, a.ring.material.opacity]).toEqual([s1, o1]);
    const b = rig(false).guide;
    b.update(0.3, 0, { x: 0, y: 0, z: 30 }, null);
    const s2 = b.ring.scale.x;
    b.update(0.3, 0.7, { x: 0, y: 0, z: 30 }, null);
    expect(b.ring.scale.x).not.toBe(s2);
  });
  it('dispose takes the ring out of the scene', () => {
    const { scene, guide } = rig();
    expect(scene.children).toContain(guide.ring);
    guide.dispose();
    expect(scene.children).not.toContain(guide.ring);
  });
  it('the real life: the spawn is far from the bench; the guide is part of area.life', async () => {
    const { build } = await import('../src/world/greenhouse.js');
    const area = build(new THREE.Scene());
    const life = area.life({ visits: 0 });
    expect(life.guide).toBeTruthy();
    life.update(0.3, 0, { x: 0, y: 0, z: 30 }, null, null);
    expect(life.guide.state.goal.kind).toBe('bench');
    expect(L.OFFER_R).toBe(G.OFFER_R);
    life.dispose();
  });
});
