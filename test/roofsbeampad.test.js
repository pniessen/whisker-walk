import { describe, it, expect } from 'vitest';
import { stubCanvasDocument } from './helpers/canvas.js';
import { mulberry32 } from '../src/rng.js';

stubCanvasDocument({ measureText: 10, pointerLock: true });

const { roofsArea, ROOFS_TRAVERSAL, LEVELS } = await import('../src/world/roofsplan.js');
const { yardWalk } = await import('./helpers/traversalwalk.js');
const { BASE_ABILITIES, balanceStep, createTraversal, crossingToMount } = await import('../src/traversal.js');

// =============================================================================
// The beam from the tank to the pigeon loft (pipe-1), walked with a wandering
// pad stick. A crossing is a rail: once she is on it she cannot fall, and only
// the push ALONG it counts, so the sideways wander of a stick costs nothing
// there. What a wandering stick costs is the MOUNT: the pipe's end lies near
// the middle of the round tank lid, and a thumb aimed at the loft meets the
// rim well off that end, where the 0.5 m mount reach does not take her.
// pipe-1 therefore carries a `reach` and a short edge grace.
// =============================================================================

const pipe = ROOFS_TRAVERSAL.crossings.find((c) => c.id === 'pipe-1');
const A = pipe.points[0];
const B = pipe.points[pipe.points.length - 1];

// The same area with pipe-1 as it was: the default reach, no grace.
function areaBefore() {
  const area = roofsArea();
  const spec = { ...ROOFS_TRAVERSAL, crossings: ROOFS_TRAVERSAL.crossings.map((c) => (c.id === 'pipe-1' ? (({ reach, ...rest }) => rest)(c) : c)) };
  return { ...area, traversal: createTraversal(spec, area.ground) };
}

// A pad thumb: aims at the loft beyond the far end (or, aimA, at the near end
// first), its angle wandering as an AR(1) walk (sigma rad, remembered ~0.3 s)
// and its depth varying between 0.75 and 1.
function padTry(seed, { sigma, aimA = false, steady = false, start = [-26, -33], before = false, back = false }) {
  const rng = mulberry32(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(rng() || 1e-9)) * Math.cos(2 * Math.PI * rng());
  const abilities = steady ? () => ({ ...BASE_ABILITIES, steady: true }) : () => BASE_ABILITIES;
  const area = before ? areaBefore() : roofsArea();
  const w = yardWalk({ area, at: start, face: back ? [0.4, 0.9] : [0, -1], colliders: area.colliders, abilities });
  const dt = 1 / 60;
  const k = Math.exp(-dt / 0.3);
  let ang = 0;
  let mounted = false;
  let minY = Infinity;
  // back: from the loft's roof, toward the tank beyond A (aimA then aims at B first)
  const goal = back ? { x: A.x + (A.x - B.x) * 0.3, z: A.z + (A.z - B.z) * 0.3 } : { x: B.x + (B.x - A.x) * 0.3, z: B.z + (B.z - A.z) * 0.3 };
  const near = back ? B : A;
  for (let i = 0; i < 60 * 25; i++) {
    const p = w.cat.position;
    ang = ang * k + sigma * Math.sqrt(1 - k * k) * gauss();
    const g = aimA && !mounted ? near : goal;
    let dx = g.x - p.x;
    let dz = g.z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const mag = Math.min(1, 0.75 + 0.25 * rng());
    w.push((dx * c - dz * s) * mag, (dx * s + dz * c) * mag);
    w.frame(dt);
    if (w.live.crossing) mounted = true;
    minY = Math.min(minY, p.y);
    if (back) {
      if (mounted && !w.live.busy && Math.abs(w.area.ground.y(p.x, p.z) - LEVELS.TANK) < 0.2 && Math.hypot(p.x + 26, p.z + 34) < 1.3 && p.z > -34.6) return { ok: true, minY };
      continue;
    }
    if (mounted && !w.live.busy && Math.abs(w.area.ground.y(p.x, p.z) - LEVELS.TANK) < 0.2 && p.z < -43.2 && p.x < -30.3) return { ok: true, minY };
  }
  return { ok: false, minY };
}

const rate = (opts, n = 200) => {
  let ok = 0;
  let minY = Infinity;
  for (let s = 1; s <= n; s++) { const r = padTry(s, opts); if (r.ok) ok++; minY = Math.min(minY, r.minY); }
  return { ok, n, minY };
};

// the thumbs: a steady aim from the tank's climb-up spot, aiming at the near end first, and from the far side of the lid
const THUMBS = [
  { name: 'aimed at the loft from the climb-up spot', sigma: 0.4, start: [-26, -33] },
  { name: 'aimed at the near end first', sigma: 0.4, aimA: true, start: [-26, -33] },
  { name: 'aimed at the loft from the lid\'s west side', sigma: 0.4, start: [-27.1, -34.6] },
  { name: 'a shakier thumb at the near end', sigma: 0.6, aimA: true, start: [-26, -33] },
];

describe('pipe-1 with a wandering pad stick', () => {
  it('before: the thumb that aims at the loft meets the rim and does not get on', () => {
    const r = rate({ ...THUMBS[2], before: true });
    console.log('BEFORE', THUMBS[2].name, `${r.ok}/${r.n}`);
    expect(r.ok).toBeLessThan(r.n * 0.5);
  });

  for (const t of THUMBS) {
    it(`after: crosses over 95% of 200 seeded tries, ${t.name}`, () => {
      const r = rate(t);
      const rb = rate({ ...t, before: true });
      console.log('RATE', t.name, `before ${rb.ok}/${rb.n} after ${r.ok}/${r.n}`);
      expect(r.ok).toBeGreaterThanOrEqual(r.n * 0.95);
      expect(r.minY).toBeGreaterThan(LEVELS.TANK - 1e-6); // never below the lid: there is no fall to have
    });
  }

  it('with Tightrope Tail it crosses at least as often', () => {
    for (const t of THUMBS) expect(rate({ ...t, steady: true }, 100).ok).toBeGreaterThanOrEqual(95);
  });
});

// The way back, from the loft's roof to the tank: the same wandering thumbs (99 of 100).
describe('pipe-1 walked back from the loft with a wandering pad stick', () => {
  const BACK = [
    { name: 'aimed at the tank from the loft climb-down spot', sigma: 0.4, back: true, start: [-33, -43.5] },
    { name: 'aimed at the loft end first', sigma: 0.4, back: true, aimA: true, start: [-33, -45] },
    { name: 'a shakier thumb', sigma: 0.6, back: true, aimA: true, start: [-34, -45] },
  ];
  for (const t of BACK) {
    it(`crosses in at least 99 of 100 seeded tries, never below the roof, ${t.name}`, () => {
      const r = rate(t, 100);
      console.log('BACK', t.name, `${r.ok}/${r.n}`);
      expect(r.ok).toBeGreaterThanOrEqual(99);
      expect(r.minY).toBeGreaterThan(LEVELS.TANK - 1e-6);
    });
  }
});

describe('a clearly wrong move still does not get her on, and nothing else changed', () => {
  it('pushing away from the pipe, or sideways to it, never mounts it (200 seeds)', () => {
    const area = roofsArea();
    const trav = area.traversal;
    const out = { crossing: null, end: 0, u: 0 };
    const rng = mulberry32(7);
    const dir = { x: (A.x - B.x), z: (A.z - B.z) };
    for (let i = 0; i < 200; i++) {
      // from within the wider reach, pushing 100-180 degrees off the way onto the pipe
      const a = Math.atan2(-dir.z, -dir.x) + Math.sign(rng() - 0.5) * (1.75 + 1.39 * rng());
      const r = 0.2 + 0.9 * rng();
      const px = A.x + Math.cos(rng() * 6.283) * r;
      const pz = A.z + Math.sin(rng() * 6.283) * r;
      const got = crossingToMount(trav, px, pz, LEVELS.TANK, Math.cos(a), Math.sin(a), out);
      expect(got?.crossing?.id).not.toBe('pipe-1');
    }
  });

  it('a graze off the end (a push under reach / the walk speed) is forgiven; a firm push off steps her off', () => {
    const c = createTraversal(ROOFS_TRAVERSAL, roofsArea().ground).crossings.find((x) => x.id === 'pipe-1');
    const graze = { u: 0.001, v: 0 };
    for (let i = 0; i < 120; i++) expect(balanceStep(graze, c, -0.4, 1 / 60, false)).toBe(null);
    const far = { u: c.length - 0.001, v: 0 };
    for (let i = 0; i < 120; i++) expect(balanceStep(far, c, 0.4, 1 / 60, false)).toBe(null);
    expect(balanceStep({ u: 0.001, v: 0 }, c, -1, 1 / 60, false)).toBe(0);
    expect(balanceStep({ u: c.length - 0.001, v: 0 }, c, 1, 1 / 60, false)).toBe(1);
  });

  it('every other crossing keeps the old reach and steps off at once', () => {
    const trav = roofsArea().traversal;
    for (const c of trav.crossings) if (c.id !== 'pipe-1') expect(c.reach, c.id).toBe(0);
    const plank = trav.crossings.find((x) => x.id === 'plank-1');
    expect(balanceStep({ u: 0.01, v: 0 }, plank, -1, 0.1, false)).toBe(0);
  });
});
