import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

// No Fairground ride stands on another ride's ground. Each ride's footprint is the ground it
// occupies or sweeps (its base, frame, stage, queue steps, and for the coaster every metre of
// track with its supports), a little generous. Two rides' footprints may never touch.
// (Owner feedback 2026-11-28: the Viking boat had been put in the middle of the coaster.)

stubCanvasDocument();

const F = await import('../src/world/fair.js');
const R = await import('../src/world/fairrides.js');
const { RIDE } = await import('../src/fairsim.js');
const area = F.build(new THREE.Scene());

const circle = (x, z, r) => ({ c: [x, z, r] });
const box = (minX, maxX, minZ, maxZ) => ({ b: [minX, maxX, minZ, maxZ] });
const around = (at, hx, hz) => box(at.x - hx, at.x + hx, at.z - hz, at.z + hz);

// distance between two shapes (negative when they overlap)
function gap(a, b) {
  if (a.c && b.c) return Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]) - a.c[2] - b.c[2];
  if (a.b && b.b) {
    const dx = Math.max(a.b[0] - b.b[1], b.b[0] - a.b[1]);
    const dz = Math.max(a.b[2] - b.b[3], b.b[2] - a.b[3]);
    return dx > 0 && dz > 0 ? Math.hypot(dx, dz) : Math.max(dx, dz);
  }
  const [k, r] = a.c ? [a, b] : [b, a];
  const [x, z, rad] = k.c;
  const [x0, x1, z0, z1] = r.b;
  const dx = Math.max(x0 - x, 0, x - x1);
  const dz = Math.max(z0 - z, 0, z - z1);
  return Math.hypot(dx, dz) - rad;
}

const D = F.STATION_DECK;
const footprints = {
  merryGoRound: [circle(F.MGR_AT.x, F.MGR_AT.z, R.MGR.canopyR)],
  bigWheel: [around(F.FERRIS_AT, R.FERRIS.legX + 0.6, 3.2)],
  teacups: [circle(F.TEACUPS_AT.x, F.TEACUPS_AT.z, R.TEACUPS.baseR)],
  helterSkelter: [circle(F.HELTER_AT.x, F.HELTER_AT.z, 3.2)],
  coaster: [
    box(17.4, D.maxX + 0.5, D.minZ, D.maxZ), // the steps, the platform and the queue in front
    ...area.rides.coaster.track.points.map((p) => circle(p.x, p.z, 0.7)), // every metre of rail, with its supports
  ],
  vikingBoat: [
    around(F.BOAT_AT, R.BOAT.legX + 0.4, R.BOAT.legZ + 0.4), // the feet
    around(F.BOAT_AT, R.BOAT.stageX, R.BOAT.stageZ), // the planks and the ticket post
    around(F.BOAT_AT, RIDE.BOAT_SWEEP_X, RIDE.BOAT_SWEEP_Z), // the ground the swing sweeps
    box(F.BOAT_AT.x - 4, F.BOAT_AT.x - 2.5, F.BOAT_AT.z - 1, F.BOAT_AT.z + 1), // the way in, by the ticket post
  ],
};

describe('the Fairground rides keep to their own ground', () => {
  const names = Object.keys(footprints);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      it(`${names[i]} and ${names[j]} do not overlap (5 m or more apart, room to walk between)`, () => {
        let least = Infinity;
        for (const a of footprints[names[i]]) for (const b of footprints[names[j]]) least = Math.min(least, gap(a, b));
        expect(least).toBeGreaterThan(5);
      });
    }
  }

  it('the Viking boat is nowhere near the coaster\'s track (clear)', () => {
    let least = Infinity;
    for (const p of area.rides.coaster.track.points) {
      for (const s of footprints.vikingBoat) least = Math.min(least, gap(s, circle(p.x, p.z, 0)));
    }
    expect(least).toBeGreaterThan(2);
  });

  it('every ride sits inside the fair', () => {
    const B = F.FAIR_BOUNDS;
    for (const n of names) for (const s of footprints[n]) {
      const r = s.c ? [s.c[0] - s.c[2], s.c[0] + s.c[2], s.c[1] - s.c[2], s.c[1] + s.c[2]] : s.b;
      expect(r[0], n).toBeGreaterThanOrEqual(B.minX);
      expect(r[1], n).toBeLessThanOrEqual(B.maxX);
      expect(r[2], n).toBeGreaterThanOrEqual(B.minZ);
      expect(r[3], n).toBeLessThanOrEqual(B.maxZ);
    }
  });
});
