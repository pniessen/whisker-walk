// =============================================================================
// THE TREEHOUSE VILLAGE: A RARE SURPRISE (beauty pass 4, 2026-11-28). About one walk in five, once, a little while after the walk begins, the village does something unasked:
//   * LANTERNS (at dusk): a flock of paper lanterns lets go from the village and rises slowly through the canopy, glowing, swaying and drifting off to the north;
//   * RAINBOW (by day, most often after rain): a soft rainbow lies across the leaves and walls to the north for about forty seconds (the village's shader, treehouseglow.js `setRain`);
//   * OWL: the barn owl leaves her ledge, glides over the Bell Tower, the far platform, the Bookshop and the Bakery and sweeps back, with a soft hoot as she goes and again as she lands;
//   * HEART: the fireflies drift together and form a glowing heart in front of the cat for a few seconds, then scatter.
// No new mesh: the lanterns and the heart are slots of the village's existing fireflies and falling-leaves Points, the rainbow is a uniform, the owl is the owl that is already there. Nothing is ever a
// rule, a find or a danger. Reduced motion has no surprise at all (it is a motion); the lanterns and the heart keep to fewer points on the lower rungs. Which one, and when, is decided by the walk's
// own seed and its visit count (hash, no random number, no clock); `forced` (a picture page or a test) picks the kind and the moment. Every pose here is a pure function of the age.
// =============================================================================

const TAU = Math.PI * 2;
export const KINDS = Object.freeze(['lanterns', 'rainbow', 'owl', 'heart']);
export const DUR = Object.freeze({ lanterns: 62, rainbow: 44, owl: 14, heart: 9 }); // seconds each one lasts
export const CHANCE = 0.2; // a walk in five
export const WINDOW = Object.freeze({ from: 25, span: 60 }); // seconds into the walk it begins
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
export const hash = (n, s) => { let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul((s | 0) + 0x7f4a7c15, 0x85ebca6b)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };

// What happens on this walk, if anything: { kind, at } or null. `forced` (a kind name) always happens, `forcedAt` seconds in.
export function planSurprise({ seed = 0, visits = 0, dusk = false, raining = false, forced = null, forcedAt = 1 } = {}) {
  if (forced && KINDS.includes(forced)) return { kind: forced, at: forcedAt };
  const s = (Math.imul(seed | 0, 31) + (visits | 0)) | 0;
  if (hash(s, 301) >= CHANCE) return null;
  const r = hash(s, 302);
  const kind = dusk ? (r < 0.5 ? 'lanterns' : r < 0.75 ? 'owl' : 'heart') : raining ? (r < 0.8 ? 'rainbow' : 'heart') : (r < 0.4 ? 'rainbow' : r < 0.7 ? 'owl' : 'heart');
  return { kind, at: WINDOW.from + WINDOW.span * hash(s, 303) + (raining ? 25 : 0) };
}

// ---- lanterns: lantern i of n, `age` seconds after the start --------------------------------------------------------------------------------
export const LANTERN = Object.freeze({ release: 20, rise: 40, top: 15, hues: Object.freeze([[1.0, 0.62, 0.22], [1.0, 0.8, 0.38], [1.0, 0.45, 0.3], [0.95, 0.7, 0.5]]) });
const HOMES = Object.freeze([[-8, 14], [0, 19], [8, 5], [-3, 6], [1, -10], [-14, 4]]); // where lanterns are let go
export function lanternAt(i, n, age, out = {}) {
  const a = age - (i / n) * LANTERN.release - hash(i, 311) * 2.5;
  const u = a / LANTERN.rise;
  const a0 = hash(i, 312) * TAU; const r0 = 0.5 + 2.5 * Math.sqrt(hash(i, 313));
  const home = HOMES[i % HOMES.length];
  out.x = home[0] + Math.cos(a0) * r0 + 6 * u * u + 0.7 * Math.sin(a * 0.6 + i); // up out of the village's squares (the roots, the Bakery, the Bookshop, the oak, the Crown), drifting east
  out.z = home[1] + Math.sin(a0) * r0 - 12 * u * u + 0.6 * Math.cos(a * 0.5 + i * 1.3); // and north
  out.y = 1.6 + LANTERN.top * smooth(u * 0.9) + 0.5 * u;
  out.fade = a < 0 ? 0 : smooth(a / 2) * (1 - smooth((u - 0.78) / 0.22));
  out.hue = LANTERN.hues[i % LANTERN.hues.length];
  return out;
}

// ---- the heart: point i of n; `anchor` is { x, y, z, rx, rz } (the heart's middle and the unit vector along its width) ---------------------------------
export const HEART = Object.freeze({ gather: 2.8, scatter: 2.6, size: 0.14 });
export function heartAt(i, n, age, anchor, out = {}) {
  const t = (i / n) * TAU;
  const hx = 16 * Math.sin(t) ** 3; const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  const pulse = 1 + 0.07 * Math.sin(age * 5.5);
  const gather = smooth(age / HEART.gather);
  const sc = smooth((DUR.heart - age) / HEART.scatter);
  const k = gather * sc; // 1 while it holds
  const a0 = hash(i, 321) * TAU; const r0 = 0.8 + 2.4 * hash(i, 322);
  const hxm = hx * HEART.size * pulse; const hym = hy * HEART.size * pulse;
  const ox = Math.cos(a0 + age * 0.4) * r0 * (1 - k); const oy = (hash(i, 323) - 0.3) * 1.6 * (1 - k); const oz = Math.sin(a0 + age * 0.4) * r0 * (1 - k);
  out.x = anchor.x + anchor.rx * hxm * k + ox; out.z = anchor.z + anchor.rz * hxm * k + oz; out.y = anchor.y + hym * k + oy;
  out.glow = (0.25 + 0.75 * k) * Math.min(1, age / 0.8) * (0.8 + 0.2 * Math.sin(age * 7 + i));
  return out;
}

// ---- the rainbow: strength 0..1 ----------------------------------------------------------------------------------------------------------------
export const rainK = (age) => smooth(age / 8) * (1 - smooth((age - (DUR.rainbow - 10)) / 10)) * 0.9;

// ---- the owl: pose over her ledge `from` ({ x, y, z }) at `age` ---------------------------------------------------------------------------------
const ROUTE = Object.freeze([[3.4, -1.4, 3.5], [6.0, -2.8, 9.9], [8.0, -3.8, 17], [2.0, -4.2, 22.8], [-7, -4.4, 26.8], [-10, -3, 32.8], [-4, -0.5, 22.8], [-1, 0, 8.8]]); // offsets from the ledge: out over the village and back
const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
function routePoint(from, u, out) {
  const pts = [[0, 0, 0], ...ROUTE, [0, 0, 0]];
  const seg = pts.length - 1;
  const f = Math.min(seg - 1e-6, Math.max(0, u * seg)); const i = Math.floor(f); const t = f - i;
  const g = (j) => pts[Math.min(seg, Math.max(0, j))];
  out.x = from.x + cr(g(i - 1)[0], g(i)[0], g(i + 1)[0], g(i + 2)[0], t);
  out.y = from.y + cr(g(i - 1)[1], g(i)[1], g(i + 1)[1], g(i + 2)[1], t);
  out.z = from.z + cr(g(i - 1)[2], g(i)[2], g(i + 1)[2], g(i + 2)[2], t);
  return out;
}
const _a = {}; const _b = {};
// out: { x, y, z, yaw, pitch, bank, spread (0 folded .. 1 wings out), away (true while she is off the ledge) }
export function owlAt(age, from, out = {}) {
  const u = smooth(age / DUR.owl); // an easy start and landing
  routePoint(from, u, out);
  routePoint(from, Math.min(1, u + 0.01), _a); routePoint(from, Math.max(0, u - 0.01), _b);
  const dx = _a.x - _b.x; const dy = _a.y - _b.y; const dz = _a.z - _b.z;
  out.yaw = Math.atan2(dx, dz);
  out.pitch = Math.atan2(dy, Math.hypot(dx, dz) || 1) * -0.6;
  const mid = Math.sin(u * Math.PI);
  out.bank = 0.35 * Math.sin(u * TAU * 3) * mid;
  out.spread = smooth(mid * 3);
  out.away = age > 0.05 && age < DUR.owl - 0.05;
  return out;
}
export const OWL_HOOTS = Object.freeze([0.4, 5.5, DUR.owl - 0.5]); // when she calls (seconds into it)

// A soft owl hoot: two low sine notes ("hoo, hoo"), the second a touch lower, through a lowpass. Silent when muted.
export function hootNote(audio, k = 0) {
  if (!audio || typeof audio.getContext !== 'function' || audio.isMuted?.()) return false;
  const ac = audio.getContext();
  if (!ac) return false;
  const now = ac.currentTime;
  const flt = ac.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 700;
  flt.connect(audio.getMaster?.() ?? ac.destination);
  for (let n = 0; n < 2; n++) {
    const at = now + n * 0.42;
    const o = ac.createOscillator(); const g = ac.createGain();
    const f = (k % 2 ? 372 : 392) * (n ? 0.9 : 1);
    o.type = 'sine'; o.frequency.setValueAtTime(f * 1.04, at); o.frequency.exponentialRampToValueAtTime(f, at + 0.12);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.022, at + 0.07); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.38);
    o.connect(g); g.connect(flt); o.start(at); o.stop(at + 0.42);
  }
  return true;
}
