// =============================================================================
// WING B ON A WALK (milestone T5: chapters two and three of the story, mission steps 5 to 7; the letters and the houses are Nutmeg's, world/treehouselife.js, and so is the one save).
//   * THE BELL: when the third letter is delivered (step 4), Interact on the Crown deck by the Bell Tower rings it (step 5, sent to the room as 'th-ring'): one soft ring, every window
//     glows a little brighter for a moment, and the rope bridges' STRINGS OF LIGHTS come on and stay on. She can ring it again for fun any time after.
//   * THE FIREFLY SUPPER: Interact at the supper table on the Crown deck at step 5 or 6 begins it: 20 s, a PURE FUNCTION OF ONE START TIME (world/treeshow.js supperAt(k), k = the walk's clock
//     minus T0). Anyone's start is everyone's in a room: credit({ kind: 'th-supper', elapsed }) starts it for a partner too (elapsed = how long ago it began on the sender's clock, so two
//     devices agree whatever their clocks say), and at the pay moment each device takes the steps in order (world/treehousemission.js credit()) and pays its own save: treestory (40 paws,
//     once ever) and Nutmeg's Acorn Locket (added to what she owns and put on if her collar is bare). The table's ring of lanterns stays lit for good once the story is told. After step 7 the
//     table offers the supper again for fun: nothing is paid.
//   * REDUCED MOTION: the supper is frozen at its END state (every light and window lit, no fireflies, no flicker) for its whole length; the pay moment is the same.
//   * LOW and LITE rungs: fewer lanterns and fireflies (LITE: no fireflies and every other bridge bulb). One PointLight only (the village's, made at build): the supper moves it to the table.
// No fail state; nothing is timed that she can lose. Draws no random number and reads no clock of its own (the walk's dt only). Stage chunk code (treehousestagebranches.js).
// =============================================================================

import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as M from './treehousemission.js';
import * as W from './treehousewingplan.js';
import { supperAt, SUPPER, FLY_HUES } from './treeshow.js';
import { isLowTier } from './treehouselight.js';
import './treehousewingwords.js';

export const LOCKET_ID = 'acornlocket';
export const PAY_SEQ = Object.freeze({ locket: 2.6 }); // seconds after the pay moment that Nutmeg's locket line shows
export const BULBS = Object.freeze({ lamps: W.LAMP_RING.n, lampsLow: 6 });
export const RING_SECS = 2.4; // how long the bell's glow lasts
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const smooth = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };
const FLAGS = Object.freeze({ noMerge: true, noCast: true, noContactShadow: true });

let _dot = null;
function dotTexture() {
  if (_dot) return _dot;
  const n = 32;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
    const k = (y * n + x) * 4;
    data[k] = data[k + 1] = data[k + 2] = 255; data[k + 3] = Math.round(255 * (r >= 1 ? 0 : (1 - r) ** 1.4));
  }
  _dot = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  _dot.needsUpdate = true;
  return _dot;
}
function points(n, { size, colors = null, color = 0xffffff, name, map, opacity = 0.9 }) {
  const pos = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (colors) geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const p = new THREE.Points(geo, new THREE.PointsMaterial({ map, alphaTest: 0.02, size, sizeAttenuation: true, color, vertexColors: !!colors, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
  p.name = name;
  p.frustumCulled = false;
  Object.assign(p.userData, FLAGS);
  return { p, pos, geo };
}
const glowSprite = (map, color, opacity, scale, name) => {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
  sp.scale.setScalar(scale);
  sp.name = name;
  sp.visible = false;
  Object.assign(sp.userData, FLAGS);
  return sp;
};

// createWing(ctx) -> { promptAt, interact, credit, update, start, ringBell, supperOn, state, dispose }
// ctx: { scene, nutmeg (world/treehouselife.js's), light (treehouselight's), progression, log, audio, tier, reducedMotion, send (tells the room a step or a supper began) }
export function createWing(ctx) {
  const { scene, nutmeg, reducedMotion = false } = ctx;
  const progression = ctx.progression ?? null;
  const audio = ctx.audio ?? null;
  const log = ctx.log ?? null;
  const light = ctx.light ?? null;
  const low = isLowTier(ctx.tier);
  const lite = !!ctx.tier && ctx.tier.shadows === false;
  const rec = () => M.normalize(progression?.state?.treehouse);
  const tex = dotTexture();

  let clock = 0;
  let disposed = false;
  let par = null; // { t0, paid }
  let target = null; // what the action button would do now
  let ringT = -100;
  let stringLevel = rec().step >= M.STEP.bell ? 1 : 0;
  const later = [];

  // the bridges' strings of lights (every other bulb on the low rungs)
  const all = W.bridgeBulbs();
  const bridgeOn = low ? all.filter((_, i) => i % 2 === 0) : all;
  const tint = new THREE.Color();
  const sCol = new Float32Array(bridgeOn.length * 3);
  bridgeOn.forEach((_, i) => { tint.setHex(FLY_HUES[i % 4]); sCol.set([tint.r, tint.g, tint.b], i * 3); });
  const strings = points(bridgeOn.length, { size: 0.3, colors: sCol, name: 'treehouse:strings', map: tex });
  bridgeOn.forEach((b, i) => strings.pos.set([b.x, b.y, b.z], i * 3));
  strings.p.visible = stringLevel > 0;

  // the table's ring of hanging lanterns (a lit glow at each; the low rungs keep half of them)
  const lampAll = W.supperBulbs();
  const lampIdx = lampAll.map((_, i) => i).filter((i) => !low || i % 2 === 0);
  const lamps = lampIdx.map((i) => { const sp = glowSprite(tex, 0xffd9a0, 0, 1.5, `treehouse:lampGlow${i}`); sp.position.set(lampAll[i].x, lampAll[i].y, lampAll[i].z); return sp; });
  // the three candles on the table
  const candles = [0, 1, 2].map((i) => {
    const a = i * 2.1 + 0.4 + 0.9;
    const sp = glowSprite(tex, 0xffb04a, 0, 0.55, `treehouse:candle${i}`);
    sp.position.set(W.TABLE.x + Math.cos(a) * 0.22, W.TABLE.y + 1.08, W.TABLE.z + Math.sin(a) * 0.22);
    return sp;
  });
  // the fireflies that glide in over the table (none on the lowest rung or in reduced motion)
  const flyN = lite || reducedMotion ? 0 : low ? SUPPER.flies / 2 : SUPPER.flies;
  const fCol = new Float32Array(Math.max(1, flyN) * 3);
  for (let i = 0; i < flyN; i++) { tint.setHex(FLY_HUES[i % 4]); fCol.set([tint.r, tint.g, tint.b], i * 3); }
  const flies = points(Math.max(1, flyN), { size: 0.34, colors: fCol, name: 'treehouse:supperFlies', map: tex, opacity: 0 });
  flies.p.visible = false;
  // the bell's sound ring: a soft ring of light that grows from the bell and fades
  const bellRing = glowSprite(tex, 0xfff0c0, 0, 1, 'treehouse:bellRing');

  scene.add(...lamps, ...candles, strings.p, flies.p, bellRing);

  // ---- the supper ---------------------------------------------------------------------------------------------------------------
  function giveStoryRewards() {
    const st = progression?.state;
    if (st?.unlocked?.accessories && !st.unlocked.accessories.includes(LOCKET_ID)) st.unlocked.accessories.push(LOCKET_ID);
    if (st?.equipped && st.equipped.collar == null) st.equipped.collar = LOCKET_ID;
    if (log) log.awardOnce('treestory', 'treehouse-story', phrase('treehouse.supper.pay'));
    progression?.addPoints?.(0); // the save's own "persist now": it adds nothing
    later.push({ at: clock + PAY_SEQ.locket, fn: () => say('treehouse-locket', phrase('treehouse.locket')) });
  }
  function pay() {
    if (!par || par.paid) return;
    par.paid = true;
    if (!log || (log.count?.('treehouse-supper') ?? 0) === 0) { log?.mark?.('treehouse-supper'); progression?.recordSighting?.('th8'); } // the journal's supper page, once a walk
    if (rec().step >= M.STEP.done) return; // a replay: nothing is paid
    const effect = nutmeg.step({ kind: 'done' }, true); // takes every step before it in order too
    if (effect === 'done') { audio?.chime?.(); giveStoryRewards(); }
  }
  // start the supper (T0 = now); `elapsed` (a partner's start, some seconds ago on their clock) joins one already going
  function start({ own = true, elapsed = 0 } = {}) {
    if (disposed || par) return false;
    const e = Number.isFinite(elapsed) ? Math.min(Math.max(0, elapsed), SUPPER.secs) : 0;
    par = { t0: clock - e, paid: false };
    if (e < 3) { audio?.chime?.(); say('treehouse-supper-start', phrase('treehouse.supper.start')); }
    if (own) ctx.send?.({ kind: 'th-supper', elapsed: 0 });
    return true;
  }
  function ringBell() {
    ringT = clock;
    audio?.chime?.();
  }

  const onDeck = (catPos, p) => (catPos.y ?? p.minY) >= p.minY;
  function decide(catPos) {
    if (disposed || !catPos) return null;
    const { step } = rec();
    if (step >= M.STEP.third && dist(catPos, W.RING_AT) < W.RING_AT.reach && onDeck(catPos, W.RING_AT)) return { kind: 'ring', line: phrase('treehouse.bell.prompt') };
    if (par || step < M.STEP.bell) return null;
    if (dist(catPos, W.TABLE) >= W.TABLE.reach || !onDeck(catPos, W.TABLE)) return null;
    if (step < M.STEP.done) return { kind: 'begin', line: phrase('treehouse.supper.prompt') };
    return { kind: 'replay', line: phrase('treehouse.supper.replay') };
  }

  // ---- placing things each frame ----------------------------------------------------------------------------------------------------
  function placeSupper(k, t, step) {
    const p = supperAt(k);
    const on = p.active;
    const done = rec().step >= M.STEP.done;
    // the bridges' strings: on from step 5 for good
    const wantStrings = rec().step >= M.STEP.bell || on ? 1 : 0;
    stringLevel += Math.sign(wantStrings - stringLevel) * Math.min(Math.abs(wantStrings - stringLevel), reducedMotion ? 1 : step / 1.6);
    strings.p.visible = stringLevel > 0.001;
    strings.p.material.opacity = 0.95 * smooth(stringLevel) * (reducedMotion ? 1 : 0.88 + 0.12 * Math.sin(t * 2.4));
    // the ring of lanterns: the supper lights them one after another; once the story is told they stay on
    lamps.forEach((sp, j) => {
      const g = on ? p.bulbs[lampIdx[j]] : done ? 0.8 : 0;
      sp.visible = g > 0.01;
      sp.material.opacity = 0.75 * g * (reducedMotion || !on ? 1 : 0.9 + 0.1 * Math.sin(t * 3.1 + j));
    });
    candles.forEach((sp, j) => {
      const g = on ? p.candles : done ? 1 : 0;
      sp.visible = g > 0.01;
      sp.material.opacity = 0.85 * g * (reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 9.1 + j * 2));
    });
    // the three houses' windows flare in turn (a still glow in reduced motion: the end state), and again for the bell
    const halos = nutmeg.halos ?? [];
    const rk = clock - ringT;
    const bump = rk >= 0 && rk < RING_SECS ? smooth(rk / 0.3) * (1 - smooth((rk - 0.3) / (RING_SECS - 0.3))) : 0;
    for (let i = 0; i < halos.length; i++) {
      const h = halos[i];
      const f = on ? p.windows[i] ?? 0 : 0;
      h.scale.setScalar(3.2 + (reducedMotion ? 0 : 1.8 * Math.max(0, f - 0.75) * 4 + 1.2 * bump));
      if (h.visible !== false) {
        if (on && f > 0) h.material.opacity = Math.max(h.material.opacity, Math.min(0.95, 0.5 + 0.45 * f));
        if (bump > 0) h.material.opacity = Math.min(0.95, h.material.opacity + 0.3 * bump);
      }
    }
    // the bell's ring
    bellRing.visible = bump > 0.01 && !reducedMotion;
    if (bellRing.visible) {
      bellRing.position.set(W.BELL.x, W.BELL.y, W.BELL.z + 0.3);
      bellRing.scale.setScalar(1 + 3.5 * (1 - bump));
      bellRing.material.opacity = 0.5 * bump;
    }
    // the fireflies
    const showFlies = on && flyN > 0 && p.flyOpacity > 0.01;
    flies.p.visible = showFlies;
    if (showFlies) {
      flies.p.material.opacity = 0.9 * p.flyOpacity;
      for (let i = 0; i < flyN; i++) { const m = p.flies[i]; flies.pos[i * 3] = m.x; flies.pos[i * 3 + 1] = m.y; flies.pos[i * 3 + 2] = m.z; }
      flies.geo.attributes.position.needsUpdate = true;
    }
    // the village's one light moves to the table for the supper (not on the low rungs: the glows are enough there); Nutmeg's windows take it back when it ends
    if (light && !low && on) light.setGlow(W.TABLE.x, W.TABLE.y + 1.8, W.TABLE.z, 1.3 * smooth(p.k / 1.5) * smooth((SUPPER.secs - p.k) / 1.5));
    return p;
  }

  return {
    get state() { return { clock, supper: par ? { ...par, k: clock - par.t0 } : null, stringLevel, record: rec(), lamps: lamps.length, bulbs: { lamps: lampIdx.length, strings: bridgeOn.length, flies: flyN } }; },
    get strings() { return strings.p; },
    get lamps() { return lamps; },
    get candles() { return candles; },
    get flies() { return flies.p; },
    get bellRing() { return bellRing; },
    supperOn: () => !!par,
    start,
    ringBell,
    promptAt(catPos) {
      target = decide(catPos);
      return target ? target.line : null;
    },
    interact() {
      if (!target || disposed) return null;
      const t = target;
      target = null;
      if (t.kind === 'ring') {
        if (rec().step === M.STEP.third) { nutmeg.step({ kind: 'ring' }); say('treehouse-bell-rung', phrase('treehouse.bell.rung')); } // saved as step 5 (a step she is already past changes nothing)
        ringBell();
      } else if (t.kind === 'begin') {
        nutmeg.step({ kind: 'supper' }, true); // saved as step 6
        start({ own: true });
      } else if (t.kind === 'replay') start({ own: true });
      return t.kind;
    },
    // a supper begun by anyone in the room starts ours (the shared T0), and takes the steps up to it in order
    credit(ev) {
      if (!ev || typeof ev !== 'object' || ev.kind !== 'th-supper' || !Number.isFinite(ev.elapsed) || disposed) return null;
      if (rec().step < M.STEP.supper) nutmeg.step({ kind: 'supper' }, true);
      return start({ own: false, elapsed: ev.elapsed }) ? 'supper-start' : null;
    },
    update(dt, t) {
      if (disposed) return;
      const step = dt > 0 ? dt : 0;
      clock += step;
      while (later.length && later[0].at <= clock) later.shift().fn();
      let k = -1;
      if (par) {
        const real = clock - par.t0;
        if (real >= SUPPER.payAt) pay();
        if (real > SUPPER.secs) { par = null; k = -1; } else k = reducedMotion ? SUPPER.secs : real; // reduced motion holds the end state
      }
      placeSupper(k, t, step);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      par = null;
      scene.remove(...lamps, ...candles, strings.p, flies.p, bellRing);
      for (const s of [...lamps, ...candles, bellRing]) s.material.dispose();
      for (const o of [strings, flies]) { o.geo.dispose(); o.p.material.dispose(); }
    },
  };
}
