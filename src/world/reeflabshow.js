// =============================================================================
// THE SEALAB'S DOME LIGHT SHOW: A PURE FUNCTION OF ONE START TIME (milestone R15). 20 seconds on the sea side of the observation dome's glass: three slow
// ribbons of light (teal, violet, rose) swell and drift like an aurora, six soft jellyfish and a loose school of glow fish drift past, and one gentle ray
// glides through. No THREE, no clock, no random number: labShowAt(k) takes the seconds since the start (the walk's own clock minus T0) and answers where
// everything is, so two cats in a room who start from the same T0 see the same show whatever their frame rates, and a late joiner starts at the right second
// (the same way as world/crystalshow.js showAt and world/reefparade.js paradeAt; world/reeflabshowlive.js carries it out). The "seen" moment is SHOW.seenAt.
// Heights are metres over the seabed; the dome is at x 15.6, z -32.4 and its glass looks east, so everything is east of x 19 (north is -z).
// =============================================================================

export const SHOW = Object.freeze({ secs: 20, seenAt: 6, ribbons: 3, ribbonPts: 12, jellies: 6, fish: 10, still: 10 });
export const RIBBON_HUES = Object.freeze([0x5fe0d0, 0xa58cff, 0xff9ac4]);
export const JELLY_HUES = Object.freeze([0xffb3d9, 0xb7e8ff, 0xd9c2ff]);

const clamp01 = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const smooth = (t) => { const k = clamp01(t); return k * k * (3 - 2 * k); };
const lerp = (a, b, t) => a + (b - a) * t;
const FADE = 1.8;
// a creature on a line (z north to south) that is there from t0 to t1, faded at both ends
const present = (t0, t1, k) => smooth((k - t0 + 0.6) / FADE) * smooth((t1 + 0.6 - k) / FADE);

const JELLY_LINE = (i) => ({ t0: 0.5 + i * 1.7, t1: 12 + i * 1.7, x: 20.5 + ((i * 7) % 5) * 1.9, y: 1.8 + (i % 3) * 0.9, zFrom: -40 + i * 1.5, zTo: -24 - i });
const FISH_LEAD = Object.freeze({ t0: 3, t1: 19.4, from: Object.freeze({ x: 29, z: -41 }), to: Object.freeze({ x: 22, z: -24 }), y: 2.6 });
const RAY = Object.freeze({ t0: 1.5, t1: 19, from: Object.freeze({ x: 33, z: -25 }), to: Object.freeze({ x: 21, z: -40 }), y: 4.6 });

// labShowAt(k) -> { active, k, glow, seen, ribbons: [{ hue, alpha, width, pts: [{x,y,z}] }], jellies: [{x,y,z,pulse,hue,show}], fish: [{x,y,z,yaw,show}], ray: {x,y,z,yaw,show} | null }
// `glow` (0..1) is the dome's own soft brightening, the one the Sealab's light follows. `active` is false before the start and after SHOW.secs.
// Everything is finite for any input (a NaN or a negative k is "not started").
export function labShowAt(kRaw) {
  const k = Number.isFinite(kRaw) ? kRaw : -1;
  const active = k >= 0 && k <= SHOW.secs;
  if (!active) return { active: false, k: Math.min(Math.max(k, -1), SHOW.secs + 1), glow: 0, seen: k >= SHOW.seenAt, ribbons: [], jellies: [], fish: [], ray: null };
  const edge = smooth(k / 3) * smooth((SHOW.secs - k) / 3.5);
  const ribbons = [];
  for (let i = 0; i < SHOW.ribbons; i++) {
    const own = smooth((k - i * 1.2) / 3) * smooth((SHOW.secs - k) / 3.5);
    const pts = [];
    for (let j = 0; j < SHOW.ribbonPts; j++) {
      const u = j / (SHOW.ribbonPts - 1);
      pts.push({
        x: 21 + i * 3.2 + 1.6 * Math.sin(u * 5 + k * 0.45 + i * 2.1),
        y: 3.4 + i * 0.8 + 1.2 * Math.sin(u * 4 - k * 0.55 + i * 1.7) + u * 1.2,
        z: -42 + u * 20 + 0.8 * Math.sin(k * 0.3 + i),
      });
    }
    ribbons.push({ hue: RIBBON_HUES[i], alpha: own, width: 0.55 + 0.25 * Math.sin(k * 0.6 + i * 2), pts });
  }
  const jellies = [];
  for (let i = 0; i < SHOW.jellies; i++) {
    const l = JELLY_LINE(i);
    const t = clamp01((k - l.t0) / (l.t1 - l.t0));
    jellies.push({ x: l.x + 0.6 * Math.sin(k * 0.5 + i), y: l.y + 0.35 * Math.sin(k * 0.9 + i * 1.3), z: lerp(l.zFrom, l.zTo, t), pulse: 0.5 + 0.5 * Math.sin(k * 1.6 + i), hue: JELLY_HUES[i % 3], show: present(l.t0, l.t1, k) });
  }
  const lead = { t: clamp01((k - FISH_LEAD.t0) / (FISH_LEAD.t1 - FISH_LEAD.t0)) };
  const lx = lerp(FISH_LEAD.from.x, FISH_LEAD.to.x, lead.t); const lz = lerp(FISH_LEAD.from.z, FISH_LEAD.to.z, lead.t);
  const yaw = Math.atan2(FISH_LEAD.to.x - FISH_LEAD.from.x, FISH_LEAD.to.z - FISH_LEAD.from.z);
  const fshow = present(FISH_LEAD.t0, FISH_LEAD.t1, k);
  const fish = [];
  for (let i = 0; i < SHOW.fish; i++) {
    const ph = i * 2.399963;
    const ring = 0.7 + 1.9 * ((i * 0.618) % 1);
    const wob = k * 1.2 + ph;
    fish.push({ x: lx + Math.cos(ph) * ring + Math.sin(wob) * 0.4, y: FISH_LEAD.y + Math.sin(ph * 1.7) * 0.6 + 0.2 * Math.sin(wob), z: lz + Math.sin(ph) * ring * 1.3 + Math.cos(wob * 0.8) * 0.3, yaw: yaw + 0.25 * Math.sin(wob), show: fshow });
  }
  const rt = clamp01((k - RAY.t0) / (RAY.t1 - RAY.t0));
  const ray = { x: lerp(RAY.from.x, RAY.to.x, rt), y: RAY.y + 0.3 * Math.sin(k * 0.8), z: lerp(RAY.from.z, RAY.to.z, rt), yaw: Math.atan2(RAY.to.x - RAY.from.x, RAY.to.z - RAY.from.z), show: present(RAY.t0, RAY.t1, k) };
  return { active: true, k, glow: edge, seen: k >= SHOW.seenAt, ribbons, jellies, fish, ray };
}

// The still picture reduced motion shows instead: the peak moment's ribbons, nothing moving (the same numbers, so the test can compare).
export const labStill = () => { const s = labShowAt(SHOW.still); return { ...s, jellies: [], fish: [], ray: null }; };
