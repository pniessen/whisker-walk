// =============================================================================
// THE OLD HOUSE: BEAUTY PASS 7 (2026-11-28), PHOTOGENIC VISTAS. No mesh, triangle, light or caster. Six spots where the default play camera frames a picture (the hall looking up the stairs, the
// parlour's hearth, the kitchen's range, the attic's window, the birdbath, the washing line). Standing near one she is in its VISTA (`out.k`, 0..1, eased), and the house reads a few numbers:
//   * the glow shader (houseglow.js, uVista and uVistaF): the edges of the frame go a little dim and cool, the foreground warms, and the focal point (the hearth, the window, the range) gets a warm
//     rim of light on the surfaces that face her: a warm centre, a cool edge and the rugs' own colours make the colour triad;
//   * the walk's fill light (an existing light, its intensity and its ground colour) warms her fur from behind, so she reads against the picture;
//   * the GOLDEN MOMENT: stood still 3 s at a vista, the dust motes (houseair.js, the pooled Points that were already there) gather round the focal point and sparkle, and a soft chime invites a photo.
//     Once per vista per visit; she moves and it fades. Reduced motion: the sparkle comes at once and holds still. LITE: half the motes, no fade tween.
// Audio calls are optional-safe and only on the game's own audio object. `out` is live and allocated once.
// =============================================================================

const freeze = Object.freeze;
const v = (id, x, y, z, fx, fy, fz, reach = 3.4) => freeze({ id, x, y, z, fx, fy, fz, reach, mx: x + (fx - x) * 0.7, mz: z + (fz - z) * 0.7, R: 0.35 * Math.hypot(fx - x, fz - z) + 1.2 });
export const VISTAS = freeze([
  v('hall', 0, 0, 7.6, 0, 1.6, 0.5),
  v('parlour', 10.6, 0, 7.0, 13.6, 1.0, 7.0),
  v('kitchen', 9.4, 0, -3.4, 9.25, 1.0, -7.6),
  v('attic', -18.2, 4.2, -10.8, -23.8, 5.8, -11.0),
  v('birdbath', -26.2, 0, 14.8, -29.8, 0.9, 17.8),
  v('washing', -15.8, 0, -18.0, -15.5, 1.3, -23.1),
]);
export const GOLD = freeze({ still: 3, rise: 1.2, hold: 7, fall: 2.5 }); // s: still before it comes, to full, how long it stays, to gone
export const CHIME = freeze([[784, 0], [988, 0.2], [1318, 0.42]].map(([freq, at]) => freeze({ freq, at, dur: 0.7 })));
const smooth = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };

/** vistaAt(x, y, z) -> { vista, k } the nearest vista she stands in (k 0..1: 1 within 1.4 m, 0 at its reach), or null. Pure. */
export function vistaAt(x, y, z) {
  let best = null, bk = 0;
  for (const s of VISTAS) {
    if (Math.abs(y - s.y) > 1.6) continue;
    const k = 1 - smooth((Math.hypot(x - s.x, z - s.z) - 1.4) / (s.reach - 1.4));
    if (k > bk) { bk = k; best = s; }
  }
  return best ? { vista: best, k: bk } : null;
}

// createHouseVista({ audio, reducedMotion, low, lights, air }) -> { out, update(dt, cat), rebase(), dispose() }. `lights`: the walk's { l, c, g } (houselife.js), whose fill gets the warm rim.
export function createHouseVista({ audio = null, reducedMotion = false, low = false, lights = [], air = null } = {}) {
  const out = { k: 0, mx: 0, mz: 0, R: 4, fx: 0, fy: 0, fz: 0, gold: 0 };
  const fills = lights.filter((x) => x.l.isHemisphereLight);
  const base = fills.map((x) => ({ g: x.l.groundColor.clone() })); // the mood (housemood.js) owns the intensity: it sets it afresh each frame, so the boost below never builds up
  const seen = new Set();
  let still = 0, at = null, age = -1, px = 0, pz = 0, has = false, k = 0;
  const ground = { r: 1, g: 0.62, b: 0.3 };
  return {
    out,
    // the day's colours were just put on the lights (houselife.js retone): keep them as the fill's own
    rebase() { fills.forEach((x, i) => base[i].g.copy(x.l.groundColor)); },
    update(dt, cat) {
      const hit = vistaAt(cat.x, cat.y, cat.z);
      const target = hit ? hit.k : 0;
      k = reducedMotion || low ? target : k + (target - k) * Math.min(1, dt * 3);
      if (hit && hit.k > 0.5) at = hit.vista; else if (!hit) at = null;
      if (at) { out.mx = at.mx; out.mz = at.mz; out.R = at.R; out.fx = at.fx; out.fy = at.fy; out.fz = at.fz; }
      out.k = at ? k : 0;
      const moved = has ? Math.hypot(cat.x - px, cat.z - pz) : 0;
      px = cat.x; pz = cat.z; has = true;
      still = dt > 0 && moved < 0.35 * dt ? still + dt : moved > 0.35 * dt ? 0 : still;
      // the golden moment: still 3 s at a vista, once for each vista this visit
      if (age < 0 && at && hit && hit.k > 0.7 && still >= GOLD.still && !seen.has(at.id)) { seen.add(at.id); age = 0; audio?.playTune?.(CHIME, 0.5); }
      let g = 0;
      if (age >= 0) {
        age += dt;
        const gone = moved > 0.35 * dt && dt > 0;
        if (gone && age < GOLD.rise + GOLD.hold) age = Math.max(age, GOLD.rise + GOLD.hold); // she walks off: it begins to fade
        const total = GOLD.rise + GOLD.hold + GOLD.fall;
        g = reducedMotion || low ? (age < GOLD.rise + GOLD.hold ? 1 : 0) : smooth(age / GOLD.rise) * (1 - smooth((age - GOLD.rise - GOLD.hold) / GOLD.fall));
        if (age >= total) age = -1;
      }
      out.gold = g;
      air?.setGold?.(g, out.fx, out.fy, out.fz, low);
      // her fur: the fill warms from beneath, a little stronger
      for (let i = 0; i < fills.length; i++) {
        const l = fills[i].l, b = base[i];
        l.intensity = l.intensity * (1 + 0.28 * out.k);
        l.groundColor.setRGB(b.g.r + (ground.r - b.g.r) * 0.45 * out.k, b.g.g + (ground.g - b.g.g) * 0.45 * out.k, b.g.b + (ground.b - b.g.b) * 0.45 * out.k);
      }
    },
    dispose() { fills.forEach((x, i) => x.l.groundColor.copy(base[i].g)); air?.setGold?.(0, 0, 0, 0, low); },
  };
}
