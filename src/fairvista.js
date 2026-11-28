// =============================================================================
// THE FAIRGROUND: BEAUTY PASS 7, PHOTOGENIC VISTAS. No mesh, no triangle, no caster, no collider, no rule: slots in the glow pool (fairalive.js), the walk's own sun and
// fill light (a small warm shift), and one event. Five spots where the play camera finds a picture (the gate looking down the midway to the big wheel, the carousel,
// the Viking boat with the sky behind it, the booths' row, the hay-bale corner). Standing at one and facing its focal point (she needs to be near it and look at it),
//   * the light warms (sun, fill and the lawn's bounce, a little) and the picture gets a COLOUR TRIAD: gold in the lights, the sky's own colour in the middle, a cool
//     blue-violet in the near haze;
//   * HAZE in three bands (near, middle, far) lies across the view, and a SHAFT of warm light runs from the focal point down to her;
//   * a warm HALO stands just behind her, so her fur is read against the picture (a rim);
//   * the focal point gets a soft glow of its own (the wheel, the carousel, the boat, the lit stalls, the bales);
//   * THE GOLDEN MOMENT: stand still 3 s and sparkles rise round her with a soft chime (the 'golden' event), once per spot per visit, an invitation to take a photo.
// Reduced motion: only the warm light (nothing moves, nothing is drawn). Lite: fewer points. Hash of counters only; no Math.random.
// =============================================================================
const hash = (n, s) => { let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(s | 0, 0x85ebca6b)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const frac = (x) => x - Math.floor(x);

// each spot: where she stands, where she looks, the focal point (x, z, height above the ground) and how big its glow is
export const VISTAS = Object.freeze([
  Object.freeze({ id: 'gate', x: 0, z: 43, ax: 0, az: -30, fx: 0, fz: -30, fy: 8.5, glow: 14 }),
  Object.freeze({ id: 'carousel', x: 1.5, z: 10.5, ax: 0, az: 0, fx: 0, fz: 0, fy: 3.2, glow: 4.5 }),
  Object.freeze({ id: 'boat', x: 33, z: 46, ax: 29, az: 38.5, fx: 29, fz: 38.5, fy: 3.4, glow: 3.2 }),
  Object.freeze({ id: 'booths', x: -0.8, z: 31, ax: -5.7, az: 26, fx: -5.7, fz: 26, fy: 2.6, glow: 2.8 }),
  Object.freeze({ id: 'hay', x: -18.2, z: 35.6, ax: -21.9, az: 40.1, fx: -21.9, fz: 40.1, fy: 0.9, glow: 1.4 }),
]);
export const VISTA = Object.freeze({ near: 2.5, far: 7.5, still: 3, stillSpeed: 0.35, face: 0.55, goldenLen: 5, sparkle: 14 });
const WARM = [0.2, 0.07, -0.2]; // the warm shift of the sun's colour at a spot (the fill and the lawn's bounce take less)

/** How much a spot is in the picture: 1 close to it and facing it, 0 away or looking elsewhere. yaw: her heading (she faces -z at 0), or null. */
export function vistaWeight(v, x, z, yaw = null) {
  const d = Math.hypot(x - v.x, z - v.z); const w = 1 - smooth(VISTA.near, VISTA.far, d);
  if (yaw === null || !Number.isFinite(yaw)) return w;
  const ax = v.ax - v.x; const az = v.az - v.z; const l = Math.hypot(ax, az) || 1;
  return w * smooth(0.2, 0.75, (-Math.sin(yaw) * ax - Math.cos(yaw) * az) / l);
}
/** The strongest spot for where she stands: { v, w } (w 0 when none). */
export function bestVista(x, z, yaw = null) {
  let best = null; let bw = 0;
  for (const v of VISTAS) { const w = vistaWeight(v, x, z, yaw); if (w > bw) { bw = w; best = v; } }
  return { v: best, w: bw };
}
/** How many glow slots the spots take: haze, shaft, focal glow, her halo, sparkles (none with reduced motion, fewer when lite). */
export function vistaCounts(k, reducedMotion) {
  if (reducedMotion) return 0;
  return k < 0.5 ? 3 + 3 + 2 + 6 : 9 + 6 + 2 + VISTA.sparkle;
}

export function createVistas({ scene, glow, pts = null, geo = null, k = 1, reducedMotion = false, ground, onEvent = () => {} }) {
  const lite = k < 0.5; const nSpark = lite ? 6 : VISTA.sparkle; const nLat = lite ? 1 : 3; const nShaft = lite ? 3 : 6;
  const gy = (x, z) => (ground?.flat === false ? ground.y(x, z) : 0);
  let sun = null; let fill = null; let w = 0; let still = 0; let last = null; let gold = -99; let goldV = null; const had = new Set(); let lastV = null;
  const wrote = { sun: [0, 0, 0], fill: [0, 0, 0], bounce: [0, 0, 0] };
  const put = (i, x, y, z, r, g, b, s) => { const p = glow; const o = (p.at + i) * 3; p.pos[o] = x; p.pos[o + 1] = y; p.pos[o + 2] = z; p.col[o] = r; p.col[o + 1] = g; p.col[o + 2] = b; p.siz[p.at + i] = s / 0.6; };
  const off = (i) => { const p = glow; const o = (p.at + i) * 3; p.col[o] = p.col[o + 1] = p.col[o + 2] = 0; p.pos[o + 1] = -999; };
  // the light moves by a small warm delta, undone before the next one (and not undone if something else has set the colour since: the weather and the dusk own the base)
  const lights = () => {
    if (!scene?.children) return;
    if (!sun || !sun.parent) sun = scene.children.find((o) => o.isDirectionalLight) ?? null;
    if (!fill || !fill.parent) fill = scene.children.find((o) => o.isHemisphereLight) ?? null;
  };
  const delta = { sun: [0, 0, 0], fill: [0, 0, 0], bounce: [0, 0, 0] };
  function grade(wt, lit) {
    lights();
    const m = wt * (0.7 + 0.3 * lit);
    for (const [key, c, f] of [['sun', sun?.color, 1], ['fill', fill?.color, 0.8], ['bounce', fill?.groundColor, 0.9]]) {
      if (!c) continue;
      const q = wrote[key]; const d = delta[key];
      if (Math.abs(c.r - q[0]) + Math.abs(c.g - q[1]) + Math.abs(c.b - q[2]) < 1e-5) { c.r -= d[0]; c.g -= d[1]; c.b -= d[2]; } // (ours, still: take it back)
      d[0] = WARM[0] * f * m; d[1] = WARM[1] * f * m; d[2] = WARM[2] * f * m;
      c.r += d[0]; c.g = Math.max(0, c.g + d[1]); c.b = Math.max(0, c.b + d[2]);
      q[0] = c.r; q[1] = c.g; q[2] = c.b;
    }
  }

  return {
    // update(dt, T, me {x, z} or null, yaw, lit 0..1, speed m/s)
    update(dt, T, me, yaw, lit = 0, speed = 0) {
      const b = me ? bestVista(me.x, me.z, yaw) : { v: null, w: 0 };
      w += (b.w - w) * Math.min(1, dt / 0.8); if (b.w === 0 && w < 0.004) w = 0;
      if (b.v) lastV = b.v;
      grade(w, lit);
      if (reducedMotion) return { w };
      const v = b.v ?? lastV;
      // the golden moment: still, close and facing it, 3 s; once per spot per visit
      const moved = me && last ? Math.hypot(me.x - last.x, me.z - last.z) / Math.max(dt, 1e-3) : 99;
      still = b.w > 0.7 && me && moved < VISTA.stillSpeed ? still + dt : 0;
      if (me) last = last ? Object.assign(last, { x: me.x, z: me.z }) : { x: me.x, z: me.z };
      if (still >= VISTA.still && v && !had.has(v.id) && T - gold > VISTA.goldenLen) { had.add(v.id); gold = T; goldV = v; onEvent({ type: 'golden', id: v.id }); }
      let i = 0;
      const on = w > 0.01 && v && me;
      const dx = on ? v.ax - v.x : 0; const dz = on ? v.az - v.z : 1; const dl = Math.hypot(dx, dz) || 1; const ux = dx / dl; const uz = dz / dl; // the way she looks, a unit vector
      const cx = me ? me.x : 0; const cz = me ? me.z : 0; const A = on ? w : 0;
      const fog = scene?.fog?.color; const fr = fog ? fog.r : 0.9; const fg = fog ? fog.g : 0.7; const fb = fog ? fog.b : 0.5;
      // three bands of haze: near (cool), middle (the sky's colour), far (gold), each a few soft puffs across the view
      for (let band = 0; band < 3; band++) {
        const dist = [13, 27, 46][band]; const size = [6.5, 11, 18][band]; const lvl = [0.3, 0.32, 0.34][band] * A * (0.8 + 0.2 * Math.sin(T * 0.3 + band));
        const col = band === 0 ? [0.55 * lvl, 0.65 * lvl, 1.15 * lvl] : band === 1 ? [fr * lvl * 1.1, fg * lvl * 1.1, fb * lvl * 1.1] : [1.1 * lvl, 0.8 * lvl, 0.4 * lvl];
        for (let s = 0; s < nLat; s++, i++) {
          if (A < 0.01) { off(i); continue; }
          const lat = (s - (nLat - 1) / 2) * dist * 0.42 + (nLat > 1 ? Math.sin(T * 0.11 + band * 2 + s) * 1.2 : 0);
          const x = cx + ux * dist - uz * lat; const z = cz + uz * dist + ux * lat;
          const mid = nLat > 1 && s === 1 ? 0.55 : 1; // (the puff on her line of sight is the one that stacks: kept soft)
          put(i, x, gy(x, z) + [2.3, 4.2, 6.5][band], z, col[0] * mid, col[1] * mid, col[2] * mid, size);
        }
      }
      // a shaft of light from the focal point down to her
      const fxz = on ? [v.fx, v.fz] : [0, 0]; const fy = on ? gy(v.fx, v.fz) + v.fy : 0;
      for (let s = 0; s < nShaft; s++, i++) {
        if (A < 0.01) { off(i); continue; }
        const u = 0.1 + (s / Math.max(1, nShaft - 1)) * 0.55; const x = fxz[0] + (cx - fxz[0]) * u; const z = fxz[1] + (cz - fxz[1]) * u;
        const l = 0.28 * A * (0.78 + 0.22 * Math.sin(T * 0.8 + s * 1.3)) * (1 - 0.45 * u);
        put(i, x, fy + (gy(cx, cz) + 2.4 - fy) * u, z, 1.1 * l, 0.72 * l, 0.32 * l, 3 + 6 * u);
      }
      // the focal point's own glow, and her halo (a warm rim: it stands just behind her, so her fur is read against it)
      if (A < 0.01) { off(i); off(i + 1); } else {
        const f = A * (0.15 + 0.04 * Math.sin(T * 1.1 + 1) + 0.1 * lit);
        put(i, v.fx, fy, v.fz, 1.1 * f, 0.7 * f, 0.3 * f, v.glow);
        const h = A * (0.38 + 0.15 * lit);
        put(i + 1, cx + ux * 0.5, gy(cx, cz) + 0.5, cz + uz * 0.5, 1.2 * h, 0.78 * h, 0.35 * h, 2.4);
      }
      i += 2;
      // the golden moment: sparkles rise round her and drift, then go
      const g = T - gold; const env = g >= 0 && g < VISTA.goldenLen ? smooth(0, 0.6, g) * (1 - smooth(3.6, VISTA.goldenLen, g)) : 0;
      for (let s = 0; s < nSpark; s++, i++) {
        if (env < 0.01 || !goldV) { off(i); continue; }
        const q = g * (0.18 + 0.1 * hash(s, 2)) + hash(s, 3); const u = frac(q); const a = hash(s, 4) * 6.283 + g * 0.35; const r = 0.5 + hash(s, 5) * 1.7;
        const tw = (0.35 + 0.65 * Math.max(0, Math.sin(g * (4 + 3 * hash(s, 6)) + s * 2.3))) * env;
        const x = cx + Math.cos(a) * r; const z = cz + Math.sin(a) * r;
        put(i, x, gy(x, z) + 0.3 + u * 2.4, z, 1.4 * tw, 1.0 * tw, 0.45 * tw, 0.3 + 0.25 * hash(s, 7));
      }
      if (pts) pts.visible = A >= 0.01 || env >= 0.01;
      if (geo) geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = geo.attributes.aSize.needsUpdate = true;
      return { w, still, golden: env };
    },
    counts: nSpark + 3 * nLat + nShaft + 2,
  };
}
