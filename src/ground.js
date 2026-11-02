// =============================================================================
// THE GROUND (Gorge part 1). One pure module: ground.y(x, z), 0 on every map
// that exists today, real only where an area returns `ground: createGround(..)`.
//
// Shapes, not a heightmap (ruling R1): a STRIP is a centreline segment with a
// half-width each side and a height that runs linearly from y0 to y1; a DISC is
// a flat landing. y() is the MAX over every shape that contains the point, else
// `base`, so shapes may overlap with no seam and no authoring order. A CEILING
// is a strip-shaped lid; ceil() is the MIN over the ceilings that contain the
// point, else Infinity.
//
// Edges come from the heights alone (R2): canStep() walks the segment in
// sub-steps and a rim of ~0.3 m or more is a wall in both directions.
//
// y, ceil, canStep, slide, sameLevel and gradient allocate nothing: they run
// per actor per frame.
// =============================================================================

export const STEP_MAX = 0.12; // a legal step may jump this much...
export const MAX_GRADE = 0.5; // ...plus this much per metre walked
export const SUBSTEP = 0.25; // canStep's longest sub-step, so a fast frame can't tunnel
export const MAX_PATH_GRADE = 1 / 3; // no walkable strip is steeper than 1 in 3
export const LEVEL_TOL = 0.5; // "the same level" for proximity checks
export const TILT_MAX = 0.35; // rad, cap on a cat's pitch and roll to a slope
export const TILT_RATE = 10; // 1/s, how fast her cat's and a co-walker's lean eases to the slope

// validateGround: every ceiling must clear the ground under it by this much
// (MIN_CAMERA_Y 0.5 + CAM_CEIL_CLEAR 0.3, ruling R8).
const CEIL_MIN_CLEAR = 0.8;

// A strip-like record with its derived numbers precomputed.
function prep(s) {
  const dx = s.x1 - s.x0;
  const dz = s.z1 - s.z0;
  const len2 = dx * dx + dz * dz;
  const y0 = s.y0 ?? s.y;
  const y1 = s.y1 ?? y0;
  return { x0: s.x0, z0: s.z0, dx, dz, len2, hw2: (s.width / 2) * (s.width / 2), y0, dy: y1 - y0, y: s.y };
}

// Projection parameter t of (x, z) on the segment when the point is inside the
// strip (square ends), else -1.
function stripT(s, x, z) {
  const px = x - s.x0;
  const pz = z - s.z0;
  let t = s.len2 > 0 ? (px * s.dx + pz * s.dz) / s.len2 : 0;
  if (t < 0 || t > 1) return -1;
  const ex = px - t * s.dx;
  const ez = pz - t * s.dz;
  return ex * ex + ez * ez <= s.hw2 ? t : -1;
}

export const FLAT_GROUND = Object.freeze({
  flat: true,
  y: () => 0,
  ceil: () => Infinity,
  canStep: () => true,
  slide: () => false,
  sameLevel: () => true,
  gradient(x, z, out) {
    out.x = 0;
    out.z = 0;
    return out;
  },
  tilt(x, z, yaw, out) {
    out.pitch = 0;
    out.roll = 0;
    return out;
  },
});

// A strip-like record's bounding box, as [minX, maxX, minZ, maxZ].
function stripBox(s) {
  const len = Math.sqrt(s.len2);
  const hw = Math.sqrt(s.hw2);
  // the half-width runs along the unit normal (-dz, dx) / len
  const ox = len > 0 ? Math.abs((s.dz / len) * hw) : hw;
  const oz = len > 0 ? Math.abs((s.dx / len) * hw) : hw;
  const xa = s.x0;
  const xb = s.x0 + s.dx;
  const za = s.z0;
  const zb = s.z0 + s.dz;
  return [Math.min(xa, xb) - ox, Math.max(xa, xb) + ox, Math.min(za, zb) - oz, Math.max(za, zb) + oz];
}

// The bucket grid (Gorge ruling G12): with more than INDEX_MIN shapes, every
// shape is listed in each BUCKET-metre cell its bounding box (padded by
// BUCKET_PAD, well past any rounding in stripT) touches, so a lookup scans
// only the cell under the point. Each cell keeps its shapes in their original
// order, so ties fall the same way and every answer is identical to a full
// scan. A point off the grid is in no shape. Flat cells are packed into one
// Int32Array (cell start offsets, then shape indices), so lookups allocate
// nothing.
const INDEX_MIN = 16;
const BUCKET = 4;
const BUCKET_PAD = 1e-6;

function bucketGrid(boxes) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b[0] - BUCKET_PAD);
    maxX = Math.max(maxX, b[1] + BUCKET_PAD);
    minZ = Math.min(minZ, b[2] - BUCKET_PAD);
    maxZ = Math.max(maxZ, b[3] + BUCKET_PAD);
  }
  if (!boxes.length) {
    minX = maxX = minZ = maxZ = 0;
  }
  const nx = Math.max(1, Math.floor((maxX - minX) / BUCKET) + 1);
  const nz = Math.max(1, Math.floor((maxZ - minZ) / BUCKET) + 1);
  const lists = Array.from({ length: nx * nz }, () => []);
  boxes.forEach((b, k) => {
    const i0 = Math.floor((b[0] - BUCKET_PAD - minX) / BUCKET);
    const i1 = Math.min(nx - 1, Math.floor((b[1] + BUCKET_PAD - minX) / BUCKET));
    const j0 = Math.floor((b[2] - BUCKET_PAD - minZ) / BUCKET);
    const j1 = Math.min(nz - 1, Math.floor((b[3] + BUCKET_PAD - minZ) / BUCKET));
    for (let i = Math.max(0, i0); i <= i1; i++) {
      for (let j = Math.max(0, j0); j <= j1; j++) lists[i * nz + j].push(k);
    }
  });
  const start = new Int32Array(nx * nz + 1);
  for (let c = 0; c < lists.length; c++) start[c + 1] = start[c] + lists[c].length;
  const items = new Int32Array(start[lists.length]);
  for (let c = 0; c < lists.length; c++) items.set(lists[c], start[c]);
  return { minX, minZ, maxX, maxZ, nx, nz, start, items };
}

// The cell of `grid` under (x, z), or -1 off the grid.
function cellOf(grid, x, z) {
  if (!(x >= grid.minX && x <= grid.maxX && z >= grid.minZ && z <= grid.maxZ)) return -1;
  const i = Math.min(grid.nx - 1, Math.floor((x - grid.minX) / BUCKET));
  const j = Math.min(grid.nz - 1, Math.floor((z - grid.minZ) / BUCKET));
  return i * grid.nz + j;
}

// `options.index: false` turns the bucket grid off (for the test that proves
// it changes no answer).
export function createGround({ base = 0, strips = [], discs = [], ceilings = [] } = {}, { index = true } = {}) {
  const S = strips.map(prep);
  const D = discs.map((d) => ({ x: d.x, z: d.z, r2: d.r * d.r, y: d.y }));
  const C = ceilings.map(prep);

  // Strips and discs share one grid (strip indices first, then discs at
  // S.length + k); ceilings have their own.
  const useIndex = index && S.length + D.length + C.length > INDEX_MIN;
  const G = useIndex
    ? bucketGrid([...S.map(stripBox), ...discs.map((d) => [d.x - d.r, d.x + d.r, d.z - d.r, d.z + d.r])])
    : null;
  const GC = useIndex ? bucketGrid(C.map(stripBox)) : null;

  // The highest shape at (x, z) is left in `top` (a strip, a disc, or null
  // for the base), so gradient shares the one scan with y.
  let top = null;
  function scan(x, z) {
    let best = base;
    top = null;
    let from = 0;
    let to = S.length + D.length;
    if (G) {
      const c = cellOf(G, x, z);
      if (c < 0) return best;
      from = G.start[c];
      to = G.start[c + 1];
    }
    for (let n = from; n < to; n++) {
      const k = G ? G.items[n] : n;
      if (k < S.length) {
        const s = S[k];
        const t = stripT(s, x, z);
        if (t >= 0) {
          const h = s.y0 + t * s.dy;
          if (h > best) {
            best = h;
            top = s;
          }
        }
      } else {
        const d = D[k - S.length];
        const dx = x - d.x;
        const dz = z - d.z;
        if (dx * dx + dz * dz <= d.r2 && d.y > best) {
          best = d.y;
          top = d;
        }
      }
    }
    return best;
  }

  function y(x, z) {
    return scan(x, z);
  }

  function ceil(x, z) {
    let best = Infinity;
    let from = 0;
    let to = C.length;
    if (GC) {
      const c = cellOf(GC, x, z);
      if (c < 0) return best;
      from = GC.start[c];
      to = GC.start[c + 1];
    }
    for (let n = from; n < to; n++) {
      const c = C[GC ? GC.items[n] : n];
      if (c.y < best && stripT(c, x, z) >= 0) best = c.y;
    }
    return best;
  }

  function canStep(ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len === 0) return true;
    const n = Math.max(1, Math.ceil(len / SUBSTEP - 1e-9));
    const seg = len / n;
    const tol = STEP_MAX + MAX_GRADE * seg;
    let prev = y(ax, az);
    for (let i = 1; i <= n; i++) {
      const cur = y(ax + (dx * i) / n, az + (dz * i) / n);
      if (Math.abs(cur - prev) > tol) return false;
      prev = cur;
    }
    return true;
  }

  // Leaves pos alone and returns false when the step from (px, pz) is legal;
  // otherwise keeps the x half, else the z half, else neither, and returns true.
  function slide(px, pz, pos) {
    if (canStep(px, pz, pos.x, pos.z)) return false;
    if (canStep(px, pz, pos.x, pz)) pos.z = pz;
    else if (canStep(px, pz, px, pos.z)) pos.x = px;
    else {
      pos.x = px;
      pos.z = pz;
    }
    return true;
  }

  function sameLevel(ax, az, bx, bz) {
    return Math.abs(y(ax, az) - y(bx, bz)) <= LEVEL_TOL;
  }

  // dy/dx, dy/dz of the highest containing strip; a disc or the base is 0.
  function gradient(x, z, out) {
    scan(x, z);
    const s = top;
    if (s && s.len2 !== undefined) {
      out.x = (s.dy * s.dx) / s.len2;
      out.z = (s.dy * s.dz) / s.len2;
    } else {
      out.x = 0;
      out.z = 0;
    }
    return out;
  }

  // groundTilt as a method, for the modules whose imports are pinned (clancats,
  // intruders) and so take the ground as given.
  const self = Object.freeze({
    flat: false, y, ceil, canStep, slide, sameLevel, gradient,
    tilt: (x, z, yaw, out) => groundTilt(self, x, z, yaw, out),
  });
  return self;
}

export function groundOf(areaData) {
  return areaData?.ground ?? FLAT_GROUND;
}

// Adds the ground under a placed prop's origin to its position.y. With
// children: true each direct child of a group at the origin is seated instead
// (addCamp builds such groups).
export function seatOnGround(obj, ground, { children = false } = {}) {
  if (ground.flat) return obj;
  if (children) {
    for (let i = 0; i < obj.children.length; i++) {
      const c = obj.children[i];
      c.position.y += ground.y(c.position.x, c.position.z);
    }
  } else {
    obj.position.y += ground.y(obj.position.x, obj.position.z);
  }
  return obj;
}

// Pitch and roll that lay a walking cat's paws on the slope under (x, z).
//
// CONVENTION (checked against three.js, see test/ground.test.js): the cat is a
// THREE.Group with rotation.order 'YXZ', rotation.y = yaw (player.js:
// atan2(vx, vz) + PI), so its nose is at local -z, which points at world
// (-sin yaw, -cos yaw), and local +x points at world (cos yaw, -sin yaw). In
// that order a POSITIVE rotation.x raises the nose (local -z) and a POSITIVE
// rotation.z raises the local +x flank. So write out.pitch to cat.rotation.x
// and out.roll to cat.rotation.z: pitch = atan(slope along the nose), roll =
// atan(slope along local +x), each capped at TILT_MAX.
const gradScratch = { x: 0, z: 0 };
export function groundTilt(ground, x, z, yaw, out = { pitch: 0, roll: 0 }) {
  if (ground.flat) {
    out.pitch = 0;
    out.roll = 0;
    return out;
  }
  const gr = ground.gradient(x, z, gradScratch);
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const along = gr.x * -s + gr.z * -c;
  const across = gr.x * c + gr.z * -s;
  out.pitch = Math.max(-TILT_MAX, Math.min(TILT_MAX, Math.atan(along))) + 0;
  // Exact plane under 'YXZ': local up = (-sin r, cos r cos p, cos r sin p) in
  // the yaw frame must be parallel to (-b, 1, a), so tan p = a and
  // tan r = b cos p = b / sqrt(1 + a^2). Derived, then verified in the tests.
  out.roll = Math.max(-TILT_MAX, Math.min(TILT_MAX, Math.atan(across / Math.sqrt(1 + along * along)))) + 0;
  return out;
}

// Eases `cur` toward `target` ({ pitch, roll }) at TILT_RATE, in place. An
// exponential ease: a frame never moves either angle by more than
// TILT_RATE * dt * |target - cur|, which is under TILT_RATE * dt (each angle
// is capped at TILT_MAX, so |target - cur| <= 2 * TILT_MAX < 1).
export function easeTilt(cur, target, dt) {
  const k = 1 - Math.exp(-TILT_RATE * dt);
  cur.pitch += (target.pitch - cur.pitch) * k;
  cur.roll += (target.roll - cur.roll) * k;
  return cur;
}

// An NPC cat leans to the slope under it, set outright (R7): order 'YXZ',
// rotation.x = pitch, rotation.z = roll for its own yaw. Call once its
// position and rotation.y are final for the frame. Flat ground: nothing is
// written, so every shipped map runs today's code.
const leanScratch = { pitch: 0, roll: 0 };
export function leanOnGround(obj, ground) {
  if (ground.flat) return;
  groundTilt(ground, obj.position.x, obj.position.z, obj.rotation.y, leanScratch);
  obj.rotation.order = 'YXZ';
  obj.rotation.x = leanScratch.pitch;
  obj.rotation.z = leanScratch.roll;
}

// validateGround(spec) -> string[] of problems: non-finite numbers, a strip
// steeper than 1 in 3, a ceiling under CEIL_MIN_CLEAR above the ground under it.
export function validateGround(spec = {}) {
  const problems = [];
  const { base = 0, strips = [], discs = [], ceilings = [] } = spec;
  // every key must be a finite number: a missing field would silently drop the shape
  const finite = (o, keys) => keys.every((k) => Number.isFinite(o[k]));
  let ok = Number.isFinite(base);
  if (!ok) problems.push('base is not finite');
  strips.forEach((s, i) => {
    if (!finite({ ...s, y0: s.y0 ?? s.y, y1: s.y1 ?? s.y0 ?? s.y }, ['x0', 'z0', 'x1', 'z1', 'width', 'y0', 'y1'])) {
      problems.push(`strip ${i} has a non-finite number`);
      ok = false;
      return;
    }
    const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
    const rise = Math.abs((s.y1 ?? s.y0) - s.y0);
    if (len === 0 ? rise > 0 : rise / len > MAX_PATH_GRADE + 1e-9) {
      problems.push(`strip ${i} is steeper than 1 in 3 (${rise} m over ${len} m)`);
    }
  });
  discs.forEach((d, i) => {
    if (!finite(d, ['x', 'z', 'r', 'y'])) {
      problems.push(`disc ${i} has a non-finite number`);
      ok = false;
    }
  });
  ceilings.forEach((c, i) => {
    if (!finite(c, ['x0', 'z0', 'x1', 'z1', 'width', 'y'])) {
      problems.push(`ceiling ${i} has a non-finite number`);
      ok = false;
    }
  });
  if (!ok) return problems;
  const ground = createGround(spec);
  ceilings.forEach((c, i) => {
    const len = Math.hypot(c.x1 - c.x0, c.z1 - c.z0);
    const n = Math.max(1, Math.ceil(len / 0.5));
    let worst = -Infinity;
    for (let k = 0; k <= n; k++) {
      const px = c.x0 + ((c.x1 - c.x0) * k) / n;
      const pz = c.z0 + ((c.z1 - c.z0) * k) / n;
      for (const side of [-1, 0, 1]) {
        const ox = len > 0 ? (-(c.z1 - c.z0) / len) * side * (c.width / 2) : side * (c.width / 2);
        const oz = len > 0 ? ((c.x1 - c.x0) / len) * side * (c.width / 2) : 0;
        worst = Math.max(worst, ground.y(px + ox, pz + oz));
      }
    }
    if (c.y - worst < CEIL_MIN_CLEAR - 1e-9) {
      problems.push(`ceiling ${i} is only ${(c.y - worst).toFixed(2)} m over the ground (needs ${CEIL_MIN_CLEAR})`);
    }
  });
  return problems;
}
