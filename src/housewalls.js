// Which walls sink between the camera and the cat, and how calmly they ease (Old House, H1/H2).
// Pure and THREE-free: sections come from houseplan.js, the view is plain {x, y, z} points.
import { WALL_T } from './world/houseplan.js';

export const SINK = Object.freeze({
  downS: 0.2, holdS: 0.5, upS: 0.6, linePad: 0.25, nearCamera: 1.2,
  cutawayDist: 5.75, frontMargin: 0.5, paneHide: 0.5, stubPad: 0.05,
});
export const PAWS_Y = 0.2;

// Does the segment a-b touch the section's box? The box runs along the section's centreline,
// WALL_T / 2 + pad either side (and past each end), from base up to base + height.
export function segmentMeetsSection(a, b, s, pad = 0, height = s.height) {
  if (!(height > 0)) return false;
  const dx = s.x1 - s.x0;
  const dz = s.z1 - s.z0;
  const len = Math.hypot(dx, dz);
  if (len === 0) return false;
  const ux = dx / len;
  const uz = dz / len;
  const half = WALL_T / 2 + pad;
  // The segment in the section's frame: u along, v across, y up.
  const au = (a.x - s.x0) * ux + (a.z - s.z0) * uz;
  const av = -(a.x - s.x0) * uz + (a.z - s.z0) * ux;
  const bu = (b.x - s.x0) * ux + (b.z - s.z0) * uz;
  const bv = -(b.x - s.x0) * uz + (b.z - s.z0) * ux;
  let t0 = 0;
  let t1 = 1;
  // Clip against each slab (Liang-Barsky).
  for (let k = 0; k < 3; k++) {
    let p0, p1, lo, hi;
    if (k === 0) { p0 = au; p1 = bu; lo = -half; hi = len + half; }
    else if (k === 1) { p0 = av; p1 = bv; lo = -half; hi = half; }
    else { p0 = a.y; p1 = b.y; lo = s.base; hi = s.base + height; }
    const d = p1 - p0;
    if (Math.abs(d) < 1e-12) {
      if (p0 < lo || p0 > hi) return false;
    } else {
      let ta = (lo - p0) / d;
      let tb = (hi - p0) / d;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
  }
  return true;
}

export function makeView(cat, cam, lookY, out = {}) {
  if (!out.cam) { out.cam = { x: 0, y: 0, z: 0 }; out.look = { x: 0, y: 0, z: 0 }; out.paws = { x: 0, y: 0, z: 0 }; out.cat = { x: 0, y: 0, z: 0 }; }
  out.cam.x = cam.x; out.cam.y = cam.y; out.cam.z = cam.z;
  out.cat.x = cat.x; out.cat.y = cat.y; out.cat.z = cat.z;
  out.look.x = cat.x; out.look.y = cat.y + lookY; out.look.z = cat.z;
  out.paws.x = cat.x; out.paws.y = cat.y + PAWS_Y; out.paws.z = cat.z;
  out.cutaway = Math.hypot(cam.x - cat.x, cam.z - cat.z) >= SINK.cutawayDist;
  return out;
}

// Horizontal distance from (px, pz) to the section's centreline segment.
function distToCentreline(s, px, pz) {
  const dx = s.x1 - s.x0;
  const dz = s.z1 - s.z0;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - s.x0) * dx + (pz - s.z0) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (s.x0 + t * dx), pz - (s.z0 + t * dz));
}

export function wantsDown(s, view) {
  const { cam, look, paws, cat } = view;
  if (segmentMeetsSection(cam, look, s, SINK.linePad) || segmentMeetsSection(cam, paws, s, SINK.linePad)) return true;
  const near = distToCentreline(s, cam.x, cam.z);
  if (near < SINK.nearCamera && cam.y < s.base + s.height + 0.5) return true;
  if (view.cutaway) {
    const catDist = Math.hypot(cam.x - cat.x, cam.z - cat.z);
    if (near < catDist - SINK.frontMargin) return true;
  }
  return false;
}

// Does the section's own stub still stand in the line to her paws or her look point? Only when
// she is below the stub's floor: on a stair just under the upper room's floor, or on the ground
// beside a raised room, with the camera over that floor. On her own floor it never does: her
// colliders keep her 0.43 m from a wall's face, and the lowest camera's line to her paws is
// above a stub's top that far out (stubPad keeps it so).
function stubInLine(s, view) {
  if (!(s.stub > 0)) return false;
  return segmentMeetsSection(view.cam, view.paws, s, SINK.stubPad, s.stub) || segmentMeetsSection(view.cam, view.look, s, SINK.stubPad, s.stub);
}

export function createWallSink(sections, { reducedMotion = false } = {}) {
  const n = sections.length;
  const index = new Map();
  const frac = new Float64Array(n);
  const lo = new Float64Array(n);
  // the floor it is sinking to: its stub, or 0 once that stub itself was in the line (Task 6);
  // kept at 0 until the wall rises again, so a stub never pumps as she walks
  const floor = new Float64Array(n);
  const unwanted = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = sections[i];
    index.set(s.id, i);
    lo[i] = s.height > 0 ? Math.min(1, (s.stub || 0) / s.height) : 0;
    floor[i] = lo[i];
    frac[i] = 1;
    unwanted[i] = SINK.holdS; // standing and settled
  }
  return {
    update(dt, view) {
      for (let i = 0; i < n; i++) {
        const span = 1 - lo[i];
        if (wantsDown(sections[i], view)) {
          unwanted[i] = 0;
          if (floor[i] > 0 && stubInLine(sections[i], view)) floor[i] = 0;
          // never up while wanted (caught rising from below its stub, it holds there)
          frac[i] = Math.min(frac[i], reducedMotion ? floor[i] : Math.max(floor[i], frac[i] - (span / SINK.downS) * dt));
        } else {
          unwanted[i] += dt;
          if (unwanted[i] >= SINK.holdS - 1e-9 && frac[i] < 1) {
            floor[i] = lo[i];
            frac[i] = reducedMotion ? 1 : Math.min(1, frac[i] + (span / SINK.upS) * dt);
          }
        }
      }
    },
    fraction(id) { const i = index.get(id); return i === undefined ? 1 : frac[i]; },
    isDown(id) { const i = index.get(id); return i !== undefined && frac[i] < 1; },
  };
}

export function blockers(sections, sink, view) {
  const out = [];
  for (const s of sections) {
    const h = sink.fraction(s.id) * s.height;
    if (segmentMeetsSection(view.cam, view.look, s, 0, h) || segmentMeetsSection(view.cam, view.paws, s, 0, h)) out.push(s.id);
  }
  return out;
}
