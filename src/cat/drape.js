// CLOTHES OVER THE HAUNCH (2026-11-16). Sitting and napping, the hind thigh is
// a haunch that stands out of the torso's side (limbs.js FOLDS.sit, loaf). A
// coat is the torso's own shape a little inflated and a cape is cloth hung on
// it, so the haunch came through both. Here the cloth is laid over the haunch:
// each cloth point is moved straight out from the torso's centre until it
// clears every haunch point near its line, as cloth lying on a thigh does.
//
//   clear  the cloth rests this far (m) over the haunch's surface;
//   flat, slope, ease  the cloth leaves the haunch as taut cloth does: level
//          for `flat` metres round a point of it, then coming down toward
//          the torso at `slope` (metres per metre), rounded over `ease` metres;
//   upTo   the haunch is the limb's upper part: its points up to curve
//          parameter upTo[0] carry the cloth in full, easing out by upTo[1]
//          (the shin and the foot come out from under the cloth);
//   sink   how far (m) a point past upTo[1] would be let down: the ease's depth;
//   grid   each face of the haunch is sampled grid x grid (its corners alone
//          are 7 cm apart round a thigh, and cloth would dip between them);
//   floor  a moved point is left at least this far (m) over the ground.
//
// Only points that would lie under the haunch move; every other point is
// exactly where it was. No vertex is added. Worked out when a cat first sits
// or naps (model.js clothFit), kept, and written only on the way down and
// the way up (animator.js wearClothes), never per frame.
export const DRAPE = Object.freeze({ clear: 0.012, flat: 0.03, slope: 1.6, ease: 0.015, upTo: Object.freeze([0.5, 0.8]), sink: 0.08, grid: 4, floor: 0.006 });

// The haunch as the cloth sees it: the folded limb `pos` (flat xyz, its own
// frame; faces `idx`, curve parameters `t`) carried by `m` (a Matrix4's
// elements: the limb's frame into the posed torso's) and the posed body's
// `scale` into metres about the torso's centre, each face sampled DRAPE.grid
// a side. Pushes flat [x, y, z, lift] per sample onto `out`, lift the height
// the cloth keeps over it.
export function haunchPoints(pos, idx, t, m, scale, out = [], D = DRAPE) {
  const P = new Float64Array(pos.length), lift = new Float64Array(t.length);
  for (let i = 0; i < t.length; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    P[i * 3] = (m[0] * x + m[4] * y + m[8] * z + m[12]) * scale[0];
    P[i * 3 + 1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) * scale[1];
    P[i * 3 + 2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) * scale[2];
    const k = Math.min(1, Math.max(0, (t[i] - D.upTo[0]) / (D.upTo[1] - D.upTo[0])));
    lift[i] = D.clear - D.sink * k * k * (3 - 2 * k);
  }
  const n = D.grid;
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f], b = idx[f + 1], c = idx[f + 2];
    if (t[a] >= D.upTo[1] && t[b] >= D.upTo[1] && t[c] >= D.upTo[1]) continue;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      const u = i / n, v = j / n, w = 1 - u - v;
      out.push(
        P[a * 3] * w + P[b * 3] * u + P[c * 3] * v,
        P[a * 3 + 1] * w + P[b * 3 + 1] * u + P[c * 3 + 1] * v,
        P[a * 3 + 2] * w + P[b * 3 + 2] * u + P[c * 3 + 2] * v,
        lift[a] * w + lift[b] * u + lift[c] * v,
      );
    }
  }
  return out;
}

// How far out along unit direction (nx, ny, nz) from the torso's centre the
// cloth must lie to clear the haunch `pts` (haunchPoints): metres, -Infinity
// where no haunch point is near the line.
export function drapeRadius(nx, ny, nz, pts, D = DRAPE) {
  let need = -Infinity;
  for (let j = 0; j < pts.length; j += 4) {
    const hx = pts[j], hy = pts[j + 1], hz = pts[j + 2];
    const s = hx * nx + hy * ny + hz * nz;
    if (s <= 0 || s + pts[j + 3] <= need) continue;
    const e = Math.sqrt(Math.max(0, hx * hx + hy * hy + hz * hz - s * s)) - D.flat;
    const r = s + pts[j + 3] - (e > 0 ? D.slope * e * e / (e + D.ease) : 0);
    if (r > need) need = r;
  }
  return need;
}

// Lay the cloth `pos` (flat xyz, the torso mesh's own frame; `scale` the
// posed body's) over the haunch `pts`. `toCat` (a Matrix4's elements: the
// posed torso mesh's frame into the cat's) keeps moved points over the
// ground. `pieces` (optional, a vertex count): the cloth is small rigid
// pieces of that many points each lying `lift` over a cloth of their own (a
// cape's dots), and each moves as one, by what the cloth under its middle
// moves. Returns a new array, or null when no point moves.
export function drapeOver(pos, scale, pts, toCat, { pieces = 0, lift = 0 } = {}, D = DRAPE) {
  if (!pts.length) return null;
  const out = pos.slice();
  let moved = 0;
  const [sx, sy, sz] = scale;
  const push = (x, y, z, under) => {
    const qx = x * sx, qy = y * sy, qz = z * sz;
    const r = Math.hypot(qx, qy, qz);
    if (r < 1e-9) return 0;
    const nx = qx / r, ny = qy / r, nz = qz / r;
    let need = drapeRadius(nx, ny, nz, pts, D);
    const at = r - under;
    if (!(need > at)) return 0;
    // a point over the ground stays over it: y in the cat's frame is linear in the radius
    const gy = (toCat[1] * nx / sx + toCat[5] * ny / sy + toCat[9] * nz / sz);
    if (gy < 0) need = Math.min(need, (D.floor - toCat[13]) / gy);
    return need > at ? need - at : 0;
  };
  if (pieces) {
    for (let a = 0; a < pos.length / 3; a += pieces) {
      let cx = 0, cy = 0, cz = 0;
      for (let i = a; i < a + pieces; i++) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2]; }
      cx /= pieces; cy /= pieces; cz /= pieces;
      const d = push(cx, cy, cz, lift);
      if (!d) continue;
      const r = Math.hypot(cx * sx, cy * sy, cz * sz);
      const dx = cx * d / r, dy = cy * d / r, dz = cz * d / r; // along the middle's line, in the mesh's own frame
      for (let i = a; i < a + pieces; i++) { out[i * 3] += dx; out[i * 3 + 1] += dy; out[i * 3 + 2] += dz; }
      moved += pieces;
    }
    return moved ? out : null;
  }
  for (let i = 0; i < pos.length; i += 3) {
    const d = push(pos[i], pos[i + 1], pos[i + 2], 0);
    if (!d) continue;
    const r = Math.hypot(pos[i] * sx, pos[i + 1] * sy, pos[i + 2] * sz);
    const k = (r + d) / r;
    out[i] = pos[i] * k; out[i + 1] = pos[i + 1] * k; out[i + 2] = pos[i + 2] * k;
    moved++;
  }
  return moved ? out : null;
}
