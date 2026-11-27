// =============================================================================
// THE REEF: THE MORAY EEL, DRAWN (the polish round; it lives in the ride stage, so the base chunk does not carry it). The plan and the pose are reefmore.js's (eelPose, eelSpine,
// in the Reef's base chunk); the life (reefmorelive.js) hands in the soup's own pieces once, { tube, ellipsoid, bodyMatrix, eelSpine }, and gets back the drawing:
//   a long body that tapers to a fine tail, with a ridge fin down its back, a deeper head with a rounded snout, a jaw line, small teeth, raised nostril tubes, a big eye with a
//   pupil and a glint, a gill spot, and a mottled coat of olive, brown and cream (the colour of each vertex comes from a pattern over the rings, no random number).
//   It swims slowly (a wave runs down its body from the head, the head sways as before) and opens and closes its mouth gently, all from the clock the life hands in; with no clock
//   (reduced motion) the picture is drawn once and stays. The low rungs draw a shorter body, no fin, no teeth and no gill spot. The vertex count never changes from frame to frame.
// This stage file imports nothing (a ride-stage file stays out of the base chunk).
// =============================================================================

const DARK = [24, 18, 16];
const WHITE = [255, 255, 255];
const OLIVE = [150, 128, 60];
const BROWN = [86, 62, 32];
const CREAM = [236, 222, 170];
const GOLD = [214, 184, 84];
const flat = (c) => ({ top: c, bot: c });
const sm = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
// a small integer hash to 0..1 (so the mottling is a pure function of the vertex, with no random number)
const h01 = (n) => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
// the body's radius at s (0 the tail's tip, 1 where it meets the head): a long taper
const BODY = [[0, 0.012], [0.2, 0.05], [0.5, 0.105], [0.8, 0.135], [1, 0.125]];
const prof = (s) => { for (let i = 1; i < BODY.length; i++) if (s <= BODY[i][0]) { const a = BODY[i - 1]; return a[1] + (BODY[i][1] - a[1]) * ((s - a[0]) / (BODY[i][0] - a[0])); } return BODY[BODY.length - 1][1]; };

/** makeEel({ tube, ellipsoid, bodyMatrix, eelSpine }) -> drawEel(soup, e, pose, groundY, t = 0, rung = 'high') */
export function makeEel({ tube, ellipsoid, bodyMatrix, eelSpine }) {
  const sp = { x: 0, y: 0, z: 0, r: 0 };
  const hd = { x: 0, y: 0, z: 0, r: 0 };
  return function drawEel(soup, e, pose, groundY, t = 0, rung = 'high') {
    const full = rung === 'high';
    const m = bodyMatrix(e.x, groundY(e.x, e.z), e.z, e.yaw, 0, 0, 1);
    const seed = e.id * 53 + 7;
    const wave = (s) => (0.02 + 0.09 * (1 - s) ** 1.2) * Math.sin(1.7 * t + 5.2 * s + e.id * 1.9); // a wave runs from the head toward the tail
    eelSpine(e, pose, 1, hd);
    const hx = hd.x + wave(1);
    const hy = hd.y;
    const hz = hd.z;
    // the coat: belly cream, back olive with brown blotches and a few gold spots, the tail end browner
    const coat = {
      top: OLIVE,
      bot: CREAM,
      mot: (k, i, w) => {
        if (w < 0.32) return CREAM;
        const n = h01(k * 31 + i * 7 + seed * 101);
        const band = Math.sin(k * 1.15 + seed) + Math.sin(i * 2.3 + k * 0.45 + seed * 0.7);
        if (band > 0.5) return n > 0.4 ? BROWN : mixc(BROWN, OLIVE, 0.45);
        if (n > 0.85) return GOLD;
        return mixc(OLIVE, BROWN, 0.12 * n);
      },
    };
    const rings = full ? 14 : 9;
    const sides = full ? 8 : 6;
    const sOf = (s) => -0.45 + 1.43 * s; // along eelSpine's own line, from inside the crack to the head's base
    tube(soup, (s, o) => { eelSpine(e, pose, sOf(s), sp); o.x = sp.x + wave(s); o.y = sp.y; o.z = sp.z; }, (s) => { const r = prof(s); return [r, r * 1.08]; }, rings, sides, m, coat);
    // the ridge fin: a thin tall strip along the back, from near the tail to the neck (it stays in the full rung only)
    if (full) {
      tube(soup, (u, o) => { const s = 0.18 + 0.68 * u; eelSpine(e, pose, sOf(s), sp); o.x = sp.x + wave(s); o.y = sp.y + prof(s) * 1.0; o.z = sp.z; },
        (u) => [0.007, 0.012 + 0.05 * Math.sin(Math.PI * (0.08 + 0.84 * u)) ** 0.8], 10, 4, m, { top: [128, 104, 50], bot: [176, 150, 78] });
    }
    // the head: deeper than the body, a rounded snout in front of it
    const headCol = { ...coat, mot: (k, i, w) => (w < 0.3 ? CREAM : mixc(OLIVE, BROWN, 0.18 * h01(k * 17 + i + seed))) };
    ellipsoid(soup, m, hx, hy + 0.03, hz + 0.12, 0.125, 0.155, 0.26, headCol, 6, full ? 8 : 6);
    ellipsoid(soup, m, hx, hy + 0.0, hz + 0.36, 0.078, 0.072, 0.12, headCol, 4, full ? 7 : 6);
    // the mouth: a lower jaw hinged at the head's back that drops a little, the dark inside, the jaw line on each side
    const gape = 0.5 + 0.5 * Math.sin(1.0 * t + e.id * 2.1);
    const jawY = hy - 0.085 - 0.075 * gape;
    tube(soup, (u, o) => { o.x = hx; o.y = hy - 0.075 + (jawY - (hy - 0.075)) * u + 0.0; o.z = hz + 0.02 + 0.42 * u; }, (u) => [0.092 * (1 - 0.5 * u) + 0.012, 0.036 * (1 - 0.35 * u) + 0.01], 5, full ? 6 : 5, m, { top: mixc(CREAM, OLIVE, 0.3), bot: CREAM });
    ellipsoid(soup, m, hx, hy - 0.07 - 0.03 * gape, hz + 0.2, 0.075, 0.014 + 0.04 * gape, 0.17, flat([74, 26, 28]), 3, 6); // the dark inside
    for (const sx of [-1, 1]) {
      tube(soup, (u, o) => { o.x = hx + sx * (0.115 - 0.075 * u); o.y = hy - 0.055 + 0.01 * u; o.z = hz + 0.04 + 0.4 * u; }, () => [0.01, 0.01], 6, 3, m, flat([66, 40, 30])); // the jaw line
      // the nostril: a small raised tube on the snout
      tube(soup, (u, o) => { o.x = hx + sx * 0.032; o.y = hy + 0.066 + 0.036 * u; o.z = hz + 0.42; }, (u) => [0.018 - 0.006 * u, 0.018 - 0.006 * u], 2, 5, m, flat([150, 126, 70]));
      // the eye: a big pale ball with a dark pupil and a glint (it closes in a blink)
      const open = 1 - 0.9 * pose.blink;
      ellipsoid(soup, m, hx + sx * 0.1, hy + 0.1, hz + 0.2, 0.06, 0.06 * open, 0.06, flat([236, 224, 150]), full ? 4 : 3, 6);
      ellipsoid(soup, m, hx + sx * 0.13, hy + 0.102, hz + 0.215, 0.032, 0.036 * open, 0.032, flat(DARK), 3, 5);
      if (full) {
        ellipsoid(soup, m, hx + sx * 0.142, hy + 0.116, hz + 0.232, 0.011, 0.011 * open, 0.011, flat(WHITE), 3, 4);
        ellipsoid(soup, m, hx + sx * 0.12, hy + 0.0, hz - 0.1, 0.018, 0.045, 0.04, flat([70, 48, 30]), 3, 5); // the gill spot
        // small teeth: three in the upper lip, standing down (they are on the head), two in the lower jaw, standing up (they follow it)
        for (let q = 0; q < 3; q++) tube(soup, (u, o) => { o.x = hx + sx * (0.085 - 0.03 * q * 0.5); o.y = hy - 0.052 - 0.03 * u; o.z = hz + 0.2 + 0.075 * q; }, (u) => [0.009 * (1 - u), 0.009 * (1 - u)], 2, 3, m, flat([250, 246, 230]));
        for (let q = 0; q < 2; q++) tube(soup, (u, o) => { o.x = hx + sx * 0.05; o.y = jawY + 0.035 + 0.025 * u + 0.012 * q; o.z = hz + 0.2 + 0.1 * q; }, (u) => [0.008 * (1 - u), 0.008 * (1 - u)], 2, 3, m, flat([250, 246, 230]));
      }
    }
  };
}
