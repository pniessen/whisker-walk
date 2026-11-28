// The Treehouse, beauty pass 9 (2026-11-28): night life, by the real clock. Stars through the gaps, owls that turn their heads and hoot, a kind raccoon-like friend who peeks from the oak's hollow, moths
// round the lanterns, clouds of fireflies with trails, a flying squirrel gliding between the trees, a sleeper in the hammock, smoke from the Bakery's roof, lit windows and a lit bell with a gentle toll.
// All pooled Points (no mesh, no triangle): `big` slots are extra slots of the creatures Points (treehouseliving.js puts them), `small` slots are this module's own tiny additive Points.
// Reduced motion draws one still frame at time zero (no hoot, no toll). Pure numbers: draws no random number (a hash of the index) and reads no clock.
import * as THREE from 'three';
import * as P from './treehouseplan.js';

const TAU = Math.PI * 2;
const fr = (v) => v - Math.floor(v);
const sm = (u) => { const t = Math.min(1, Math.max(0, u)); return t * t * (3 - 2 * t); };
const hx = (i, k) => fr(Math.sin(i * 127.1 + k * 311.7) * 43758.5453);
export const NIGHT = Object.freeze({
  stars: Object.freeze({ high: 40, low: 24, lite: 12 }), owls: Object.freeze({ high: 2, low: 2, lite: 1 }), clouds: Object.freeze({ high: 3, low: 2, lite: 0 }),
  moths: Object.freeze({ high: 6, low: 4, lite: 2 }), smoke: Object.freeze({ high: 12, low: 8, lite: 5 }), squirrel: Object.freeze({ high: 1, low: 1, lite: 0 }),
});
const CLOUD_AT = Object.freeze([[-5, 2.5, 11], [6, 5.2, -2], [-2, 6.5, -12]]);
const GLIDE = Object.freeze({ every: 26, len: 4.2 }); // the flying squirrel: one glide each `every` seconds, `len` seconds in the air
const HUT = (id) => P.deckOf(id);
const WIN = (() => { // the lit windows (the huts' own glass spots, a little proud of the wall) and the bell
  const b = HUT('bakery'); const o = HUT('books'); const c = HUT('crown');
  return [
    { x: b.hut.x - b.hut.r * 0.55 - 0.12, y: b.y + b.hut.h * 0.62, z: b.hut.z + b.hut.r * 0.82 + 0.1 },
    { x: o.hut.x - o.hut.r * 0.55 - 0.12, y: o.y + o.hut.h * 0.62, z: o.hut.z + o.hut.r * 0.82 + 0.1 },
    { x: c.hut.x, y: c.y + c.hut.h * 0.62, z: c.hut.z + c.hut.r * 0.95 + 0.1 },
  ];
})();
const BELL_AT = (() => { const c = HUT('crown'); return { x: 0, y: c.y + c.hut.h - 0.9, z: c.hut.z + c.hut.r * 0.95 + 0.28 }; })();
const CHIMNEY = (() => { const b = HUT('bakery'); return { x: b.hut.x + 0.95, y: b.y + b.hut.h + 1.15, z: b.hut.z + 0.55 }; })();
const TRUNK_R = (y) => (P.OAK.r - ((P.OAK.r - P.OAK.r * 0.62) * y) / P.OAK.h) * 0.97; // the oak's radius at height y (treehouseparts.js drawOak: a tapering 14-sided post)
const OWLS = Object.freeze([{ a: 1.15, y: 7.4 }, { a: -0.95, y: 6.2 }].map((o) => Object.freeze({ ...o, x: P.OAK.x + (TRUNK_R(o.y) + 0.12) * Math.sin(o.a), z: P.OAK.z + (TRUNK_R(o.y) + 0.12) * Math.cos(o.a), tx: Math.cos(o.a), tz: -Math.sin(o.a), ox: Math.sin(o.a), oz: Math.cos(o.a) })));
export const HOLLOW = Object.freeze({ x: P.OAK.x - 0.5 * (TRUNK_R(1.7) + 0.04), y: 1.7, z: P.OAK.z + 0.866 * (TRUNK_R(1.7) + 0.04), ox: -0.5, oz: 0.866, every: 23 }); // the friend's knothole in the oak (the lift stage's shader darkens it: treehouseglow.js), facing the Bakery's stairs
export const BELL_EVERY = 64;

const SLEEP = (() => { const k = HUT('far'); return { x: k.x - k.w / 2 + 0.55, y: k.y + 0.66, z: k.z + 0.25 }; })(); // the hammock on the far platform (treehousetales.js hammockPlan, copied: the lift stage's file)

/** night slots a rung needs: { big, small } (the creatures Points' extra slots, this module's own Points) */
export function nightSlots(rung, still) {
  const o = still ? 0 : NIGHT.squirrel[rung] * 2;
  return { big: NIGHT.owls[rung] * 2 + WIN.length + 1 + 3 + 1 + o, small: NIGHT.stars[rung] + NIGHT.owls[rung] * 2 + 2 + NIGHT.moths[rung] + NIGHT.clouds[rung] * 8 + 1 + NIGHT.smoke[rung] };
}

// Where the owl's eyes and the raccoon's eyes are at time t (pure, tested): the head turns slowly one way then the other, and she blinks.
export function eyesAt(i, t, still) {
  const turn = still ? 0 : Math.sin(t * 0.21 + i * 2.4) * 0.8; const blink = still ? 1 : (fr(t / (6.5 + i) + i * 0.3) < 0.025 ? 0 : 1);
  return { turn, open: blink * (1 - 0.35 * Math.abs(turn)) };
}
/** the friend in the hollow: peeks for 6 of every 23 s (eyes open, a blink, then gone); k = how much of the eyes show 0..1 */
export function peekAt(t, still) {
  if (still) return { k: 1, blink: 1 };
  const u = fr(t / HOLLOW.every); const k = sm(u / 0.04) * (1 - sm((u - 0.26) / 0.04)); const b = fr(u * 9) < 0.12 && u > 0.08 && u < 0.2 ? 0 : 1;
  return { k, blink: b };
}
/** the flying squirrel's glide at time t: arc between the oak and the friend tree ({ on, x, y, z, yaw, spread }) */
export function glideAt(t, out = {}) {
  const c = Math.floor(t / GLIDE.every); const u = (t - c * GLIDE.every - 6) / GLIDE.len; out.on = u >= 0 && u <= 1;
  const dir = c % 2; const a = { x: P.OAK.x - 2.7, y: 11.5, z: P.OAK.z - 0.8 }; const b = { x: -23.2, y: 5.2, z: -6.5 };
  const s = dir ? 1 - u : u; out.x = a.x + (b.x - a.x) * s; out.z = a.z + (b.z - a.z) * s; out.y = a.y + (b.y - a.y) * s - 2.2 * Math.sin(Math.min(1, Math.max(0, u)) * Math.PI) + 1.3 * Math.sin(Math.min(1, Math.max(0, u)) * Math.PI) ** 2;
  out.spread = Math.sin(Math.min(1, Math.max(0, u)) * Math.PI);
  return out;
}

/** createNight(ctx, env) -> { big, small, draw(t, night, put, away, catPos), sound(t, night, catPos, tone), dispose() }; env: { rung, reducedMotion, dotTexture } */
export function createNight(ctx, env) {
  const { scene } = ctx; const { rung, reducedMotion: still } = env;
  const N = nightSlots(rung, still); const ns = NIGHT.stars[rung]; const nOwl = NIGHT.owls[rung]; const nCloud = NIGHT.clouds[rung]; const nMoth = NIGHT.moths[rung]; const nSmoke = NIGHT.smoke[rung]; const nSq = still ? 0 : NIGHT.squirrel[rung];
  const pos = new Float32Array(N.small * 3); const col = new Float32Array(N.small * 3);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: env.dotTexture(), alphaTest: 0.02, size: 0.16, sizeAttenuation: true, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  pts.name = 'treehouse:nightsmall'; pts.frustumCulled = false; pts.castShadow = pts.receiveShadow = false; Object.assign(pts.userData, { noMerge: true, noCast: true, noContactShadow: true }); pts.visible = false; scene.add(pts);
  let n = 0; let nowK = 0;
  const S = (x, y, z, r, g, b, k = 1) => { const i = n++; pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; const m = k * nowK; col[i * 3] = r * m; col[i * 3 + 1] = g * m; col[i * 3 + 2] = b * m; };
  const stars = Array.from({ length: ns }, (_, i) => { const a = hx(i, 1) * TAU; const el = 0.17 + hx(i, 2) * 0.4; const r = 40; return [P.OAK.x + Math.cos(a) * Math.cos(el) * r, Math.sin(el) * r, P.OAK.z + Math.sin(a) * Math.cos(el) * r, 0.5 + 0.5 * hx(i, 3)]; });
  const gl = {}; const fly = (j, i, t, o) => { o.x = CLOUD_AT[j][0] + 2.6 * Math.sin(t * 0.09 + j * 2) + 1.1 * Math.sin(t * 0.7 + i * 1.9 + j); o.y = CLOUD_AT[j][1] + 0.55 * Math.sin(t * 0.5 + i * 2.3) + 0.3 * Math.sin(t * 0.13 + j); o.z = CLOUD_AT[j][2] + 2.6 * Math.cos(t * 0.07 + j * 2) + 1.1 * Math.cos(t * 0.6 + i * 1.3); return o; };

  function draw(t, night, put, away) { // `put(x, y, z, hex)` and `away()` fill the creatures Points' extra slots, in order, N.big of them
    nowK = night; n = 0; pts.visible = night > 0.02;
    const on = night > 0.04; const B = (x, y, z, hex, ok = true) => (on && ok ? put(x, y, z, hex) : away());
    for (let i = 0; i < ns; i++) { const s = stars[i]; const tw = still ? 0.8 : 0.65 + 0.35 * Math.sin(t * (0.6 + hx(i, 4)) + i * 3); S(s[0], s[1], s[2], 0.75, 0.85, 1.0, s[3] * tw); }
    for (let i = 0; i < nOwl; i++) { // owls on the oak: a body and a head of dots, two eyes that slide as the head turns and shut in a blink
      const o = OWLS[i]; const e = eyesAt(i, t, still); const br = still ? 0 : 0.012 * Math.sin(t * 1.2 + i);
      B(o.x, o.y + br, o.z, 0x5a4430); B(o.x + o.ox * 0.04, o.y + 0.2 + br, o.z + o.oz * 0.04, 0x9a7d5c);
      for (const sd of [-1, 1]) { const h = e.turn * 0.07 + sd * 0.085; S(o.x + o.ox * 0.2 + o.tx * h, o.y + 0.23 + br, o.z + o.oz * 0.2 + o.tz * h, 1.0, 0.8, 0.2, e.open); }
    }
    for (const w of WIN) B(w.x, w.y, w.z, 0xffc968); // every hut's window lit
    B(BELL_AT.x, BELL_AT.y, BELL_AT.z, 0xffe29a); // the lit bell
    { const k = SLEEP; const br = still ? 0 : 0.012 * Math.sin(t * 0.9); B(k.x, k.y + br, k.z - 0.4, 0x1a1c30); B(k.x, k.y - 0.02 + br, k.z, 0x1a1c30); B(k.x, k.y + 0.03 + br, k.z + 0.42, 0x23263c); } // the sleeper in the hammock
    B(CHIMNEY.x, CHIMNEY.y - 0.18, CHIMNEY.z, 0x7a5240); // the chimney's pot
    if (nSq) { const g = glideAt(t, gl); B(g.x, g.y, g.z, 0x4a3a30, g.on); B(g.x, g.y - 0.1, g.z, 0xa09078, g.on && g.spread > 0.2); } // the flying squirrel and its spread skin
    { const p = peekAt(t, still); const sh = p.k * p.blink; for (const sd of [-1, 1]) S(HOLLOW.x + HOLLOW.ox * 0.1 + sd * 0.13 * -HOLLOW.oz, HOLLOW.y, HOLLOW.z + HOLLOW.oz * 0.1 + sd * 0.13 * HOLLOW.ox, 0.35, 1.0, 0.45, sh * 1.3); } // glowing eyes, kind and curious
    for (let m = 0; m < nMoth; m++) { // moths round the lanterns nearest the oak's decks
      const L = MOTH_AT[m % MOTH_AT.length]; const a = still ? m : t * (1.6 + 0.3 * m) + m * 2; S(L.x + Math.cos(a) * 0.3, L.y + 0.12 * Math.sin(a * 1.7), L.z + Math.sin(a) * 0.3, 0.9, 0.9, 0.75, still ? 0.7 : 0.55 + 0.45 * Math.sin(a * 5));
    }
    for (let j = 0; j < nCloud; j++) for (let i = 0; i < 4; i++) { // clouds of fireflies, each with a faint trail
      const g = still ? 0.8 : 0.3 + 0.7 * Math.sin(t * 1.1 + i * 2 + j) ** 2; fly(j, i, t, gl); S(gl.x, gl.y, gl.z, 0.9, 1.0, 0.45, g);
      fly(j, i, t - 0.4, gl); S(gl.x, gl.y, gl.z, 0.55, 0.65, 0.2, g * 0.5);
    }
    for (let i = 0; i < nSmoke; i++) { // smoke curling up from the Bakery's roof and leaning down the wind, fading as it thins
      const u = still ? i / nSmoke : fr(t / 11 + i / nSmoke); const d = 0.5 * (1 - u) * Math.min(1, u * 6) * (1 - u * 0.5);
      S(CHIMNEY.x + Math.sin(u * 8 + i) * 0.3 * u + WIND_X * u * 1.6, CHIMNEY.y + u * 3.4, CHIMNEY.z + Math.cos(u * 7 + i) * 0.22 * u + WIND_Z * u * 1.6, 0.6, 0.68, 0.88, d * 3.2);
    }
    S(SLEEP.x + 0.1 + (still ? 0 : 0.08 * Math.sin(t * 0.4)), SLEEP.y + 0.55 + (still ? 0 : 0.4 * fr(t / 7)), SLEEP.z - 0.4, 0.5, 0.6, 1.0, still ? 0.5 : 0.8 * Math.sin(fr(t / 7) * Math.PI)); // a quiet z rising from the sleeper
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
  }
  let hootAt = 8; let tollAt = 20;
  function sound(t, night, catPos, tone) { // an owl's hoot now and then, a far bell, only at night and only near enough to hear (the caller's `tone(freq, at, dur, gain)` is the game's own audio)
    if (night < 0.5 || still || !catPos) return;
    if (t > hootAt) { const i = Math.floor(t / 20) % Math.max(1, nOwl); const o = OWLS[i] ?? OWLS[0]; hootAt = t + 14 + 12 * hx(Math.floor(t), 9); const near = Math.max(0, 1 - Math.hypot(catPos.x - o.x, catPos.z - o.z) / 34); if (near > 0.05) { tone(400, 0, 0.32, 0.03 * near, 0.85); tone(335, 0.42, 0.55, 0.03 * near, 0.9); } }
    if (t > tollAt) { tollAt = t + BELL_EVERY; const near = Math.max(0.15, 1 - Math.hypot(catPos.x - BELL_AT.x, catPos.z - BELL_AT.z) / 60); tone(262, 0, 2.6, 0.016 * near, 1); tone(723, 0, 1.3, 0.004 * near, 1); } // one soft stroke, far away
  }
  return { big: N.big, small: N.small, draw, sound, dispose() { scene.remove(pts); geo.dispose(); pts.material.dispose(); } };
}
const WIND_X = 0.8; const WIND_Z = 0.6; // (the village's one wind, treehouseliving.js WIND)
const MOTH_AT = Object.freeze([HUT('bakery'), HUT('crown'), HUT('books')].flatMap((k) => [{ x: k.x - k.w / 2, y: k.y + P.RAIL_H + 0.7, z: k.z - k.d / 2 }, { x: k.x + k.w / 2, y: k.y + P.RAIL_H + 0.7, z: k.z - k.d / 2 }]));
