// =============================================================================
// WING B ON A WALK (milestone J5: chapters two and three of the story, mission steps 3 to 7; the fruit and the table are Mossy's, world/junglelife.js, and so is the one save).
//   * THE BANANA AND THE CACAO are Mossy's own pick-up and set-down (junglelife.js reads their places from this stage); this file adds what she does that is not a pick-up.
//   * SET THE TABLE: when the third fruit is on it (step 4), Interact at the kitchen table (up on the veranda, not under it) sets the plates and the cloth out (step 5, sent to the room as
//     'jl-set'): the STRINGS OF LIGHTS along the log bridge's rope rail and the veranda's eave come on and stay on.
//   * THE RAIN SUPPER: Interact beside Mossy at step 5 or 6 begins it: 20 s, a PURE FUNCTION OF ONE START TIME (world/junglesupper.js supperAt(k), k = the walk's clock minus T0). Anyone's
//     start is everyone's in a room: credit({ kind: 'jl-supper', elapsed }) starts it for a partner too (elapsed = how long ago it began on the sender's clock, so two devices agree
//     whatever their clocks say), and at the pay moment each device takes the steps in order (world/junglemission.js credit()) and pays its own save: junglestory (40 paws, once ever)
//     and Mossy's Rain Lily Charm (added to what she owns and put on if her collar is bare). The shower itself is the light's (junglelight.js setShow: the supper's rain is added to the
//     seeded schedule, so the frogs sing and the patter plays through the same state; in a room the schedule's seed is the room's, jungle.js). The ring of lanterns stays lit for good once
//     the story is told. After step 7 Mossy offers the supper again for fun: nothing is paid.
//   * REDUCED MOTION: the supper is frozen at its END state (every light and window lit, no rain, no fireflies, no flicker, no sway) for its whole length; the pay moment is the same.
//   * LOW and LITE rungs: fewer lanterns and fireflies (LITE: no fireflies and every other string bulb). One PointLight only (the veranda lantern's, made at build): the supper lifts it.
// No fail state; nothing is timed that she can lose. Draws no random number and reads no clock of its own (the walk's dt only). Stage chunk code (junglestageb.js).
// =============================================================================

import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as M from './junglemission.js';
import * as S from './junglestory.js';
import * as P from './jungleplan.js';
import * as W from './junglewingplan.js';
import { supperAt, SUPPER, FLY_HUES } from './junglesupper.js';
import { isLowTier } from './junglelight.js';
import { slothMesh } from './junglewingparts.js';
import './junglewingwords.js';

export const CHARM_ID = 'rainlily';
export const PAY_SEQ = Object.freeze({ charm: 2.6 }); // seconds after the pay moment that Mossy's charm line shows
export const BULBS = Object.freeze({ lamps: W.LANTERN_COUNT, lampsLow: 5 });
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
function points(n, { size, colors = null, name, map, opacity = 0.9 }) {
  const pos = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (colors) geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const p = new THREE.Points(geo, new THREE.PointsMaterial({ map, alphaTest: 0.02, size, sizeAttenuation: true, color: 0xffffff, vertexColors: !!colors, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
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

// createWing(ctx) -> { promptAt, interact, credit, update, start, supperOn, state, dispose }
// ctx: { scene, mossy (world/junglelife.js's), light (junglelight's), progression, log, audio, tier, reducedMotion, send (tells the room a step or a supper began) }
export function createWing(ctx) {
  const { scene, mossy, reducedMotion = false } = ctx;
  const progression = ctx.progression ?? null;
  const audio = ctx.audio ?? null;
  const log = ctx.log ?? null;
  const light = ctx.light ?? null;
  const low = isLowTier(ctx.tier);
  const lite = !!ctx.tier && ctx.tier.shadows === false;
  const rec = () => M.normalize(progression?.state?.jungle);
  const tex = dotTexture();

  let clock = 0;
  let disposed = false;
  let par = null; // { t0, paid }
  let target = null; // what the action button would do now
  let stringLevel = rec().step >= M.STEP.set ? 1 : 0;
  const later = [];

  // the strings of lights along the log bridge and the eave (every other bulb on the lowest rung)
  const all = W.stringBulbs();
  const bulbsOn = lite ? all.filter((_, i) => i % 2 === 0) : all;
  const tint = new THREE.Color();
  const sCol = new Float32Array(bulbsOn.length * 3);
  bulbsOn.forEach((_, i) => { tint.setHex(FLY_HUES[i % 4]); sCol.set([tint.r, tint.g, tint.b], i * 3); });
  const strings = points(bulbsOn.length, { size: 0.3, colors: sCol, name: 'jungle:strings', map: tex });
  bulbsOn.forEach((b, i) => strings.pos.set([b.x, b.y, b.z], i * 3));
  strings.p.visible = stringLevel > 0;

  // the ring of hanging lanterns along the eave (a lit glow at each; the low rungs keep half of them)
  const lampAll = W.supperBulbs();
  const lampIdx = lampAll.map((_, i) => i).filter((i) => !low || i % 2 === 0);
  const lamps = lampIdx.map((i) => { const sp = glowSprite(tex, 0xffd9a0, 0, 1.4, `jungle:lampGlow${i}`); sp.position.set(lampAll[i].x, lampAll[i].y, lampAll[i].z); return sp; });
  // the three plates' candles on the table
  const candles = W.PLATES.map((p, i) => { const sp = glowSprite(tex, 0xffb04a, 0, 0.55, `jungle:candle${i}`); sp.position.set(p.x, p.y + 0.1, p.z); return sp; });
  // the lodge's two windows and its door glow in turn
  const windows = W.WINDOWS.map((p, i) => { const sp = glowSprite(tex, 0xffd78a, 0, 3.0, `jungle:window${i}`); sp.position.set(p.x, p.y, p.z); return sp; });
  // the fireflies that glide in over the yard (none on the lowest rung or in reduced motion)
  const flyN = lite || reducedMotion ? 0 : low ? SUPPER.flies / 2 : SUPPER.flies;
  const fCol = new Float32Array(Math.max(1, flyN) * 3);
  for (let i = 0; i < flyN; i++) { tint.setHex(FLY_HUES[i % 4]); fCol.set([tint.r, tint.g, tint.b], i * 3); }
  const flies = points(Math.max(1, flyN), { size: 0.34, colors: fCol, name: 'jungle:supperFlies', map: tex, opacity: 0 });
  flies.p.visible = false;
  // the sleepy sloth on its limb: it sways a very little (still in reduced motion)
  const sloth = slothMesh();
  sloth.position.set(W.SLOTH.x, P.jungleY(W.SLOTH.x, W.SLOTH.z) + W.SLOTH.limbY - 0.1, W.SLOTH.z); // its back on the limb, its face (+x) toward the find ring

  scene.add(...lamps, ...candles, ...windows, strings.p, flies.p, sloth);

  // ---- the table and the supper ----------------------------------------------------------------------------------------------
  function giveStoryRewards() {
    const st = progression?.state;
    if (st?.unlocked?.accessories && !st.unlocked.accessories.includes(CHARM_ID)) st.unlocked.accessories.push(CHARM_ID);
    if (st?.equipped && st.equipped.collar == null) st.equipped.collar = CHARM_ID;
    if (log) log.awardOnce('junglestory', 'jungle-story', phrase('jungle.supper.pay'));
    progression?.addPoints?.(0); // the save's own "persist now": it adds nothing
    later.push({ at: clock + PAY_SEQ.charm, fn: () => say('jungle-charm', phrase('jungle.charm')) });
  }
  function pay() {
    if (!par || par.paid) return;
    par.paid = true;
    if (!log || (log.count?.('jungle-supper') ?? 0) === 0) { log?.mark?.('jungle-supper'); progression?.recordSighting?.('jl8'); } // the journal's supper page, once a walk
    if (rec().step >= M.STEP.done) return; // a replay: nothing is paid
    const effect = mossy.step({ kind: 'done' }, true); // takes every step before it in order too
    if (effect === 'done') { audio?.chime?.(); giveStoryRewards(); }
  }
  // start the supper (T0 = now); `elapsed` (a partner's start, some seconds ago on their clock) joins one already going
  function start({ own = true, elapsed = 0 } = {}) {
    if (disposed || par) return false;
    const e = Number.isFinite(elapsed) ? Math.min(Math.max(0, elapsed), SUPPER.secs) : 0;
    par = { t0: clock - e, paid: false };
    if (e < 3) { audio?.chime?.(); say('jungle-supper-start', phrase('jungle.supper.start')); }
    if (own) ctx.send?.({ kind: 'jl-supper', elapsed: 0 });
    return true;
  }

  const onDeck = (catPos, p) => (catPos.y ?? p.minY) >= p.minY;
  function decide(catPos) {
    if (disposed || !catPos) return null;
    const { step } = rec();
    if (step === M.STEP.third && dist(catPos, S.TABLE) < S.TABLE.reach && onDeck(catPos, S.TABLE)) return { kind: 'set', line: phrase('jungle.table.set.prompt') };
    if (par || step < M.STEP.set) return null;
    if (dist(catPos, mossy.mossy) >= W.BEGIN_REACH) return null;
    return step < M.STEP.done ? { kind: 'begin', line: phrase('jungle.supper.prompt') } : { kind: 'replay', line: phrase('jungle.supper.replay') };
  }

  // ---- placing things each frame ----------------------------------------------------------------------------------------------------
  function placeSupper(k, t, step) {
    const p = supperAt(k);
    const on = p.active;
    const done = rec().step >= M.STEP.done;
    // the strings: on from step 5 for good
    const wantStrings = rec().step >= M.STEP.set || on ? 1 : 0;
    stringLevel += Math.sign(wantStrings - stringLevel) * Math.min(Math.abs(wantStrings - stringLevel), reducedMotion ? 1 : step / 1.6);
    strings.p.visible = stringLevel > 0.001;
    strings.p.material.opacity = 0.95 * smooth(stringLevel) * (reducedMotion ? 1 : 0.88 + 0.12 * Math.sin(t * 2.4));
    // the ring of lanterns: the supper lights them one after another (pulsing a little on the frogs' beat); once the story is told they stay on
    lamps.forEach((sp, j) => {
      const g = on ? p.bulbs[lampIdx[j]] : done ? 0.8 : 0;
      sp.visible = g > 0.01;
      sp.material.opacity = 0.75 * g * (reducedMotion || !on ? 1 : 0.9 + 0.1 * Math.sin(t * 3.1 + j) + 0.15 * p.beat);
    });
    candles.forEach((sp, j) => {
      const g = on ? p.candles : done ? 1 : 0;
      sp.visible = g > 0.01;
      sp.material.opacity = 0.85 * g * (reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 9.1 + j * 2));
    });
    windows.forEach((sp, j) => {
      const g = on ? p.windows[j] ?? 0 : done ? 0.6 : 0;
      sp.visible = g > 0.01;
      sp.material.opacity = 0.7 * g;
      sp.scale.setScalar(3.0 + (reducedMotion ? 0 : 0.6 * p.beat));
    });
    // the fireflies
    const showFlies = on && flyN > 0 && p.flyOpacity > 0.01;
    flies.p.visible = showFlies;
    if (showFlies) {
      flies.p.material.opacity = (0.8 + 0.2 * p.beat) * p.flyOpacity;
      for (let i = 0; i < flyN; i++) { const m = p.flies[i]; flies.pos[i * 3] = m.x; flies.pos[i * 3 + 1] = m.y; flies.pos[i * 3 + 2] = m.z; }
      flies.geo.attributes.position.needsUpdate = true;
    }
    // the shower and the rainbow are the light's: the supper's own are added to the schedule's; the veranda lantern's one real light lifts a little (not on the low rungs, not in reduced motion)
    if (light?.setShow) light.setShow(reducedMotion ? 0 : p.rain, reducedMotion ? 0 : p.rainbow, low || reducedMotion ? 0 : p.glow);
    return p;
  }

  return {
    get state() { return { clock, supper: par ? { ...par, k: clock - par.t0 } : null, stringLevel, record: rec(), lamps: lamps.length, bulbs: { lamps: lampIdx.length, strings: bulbsOn.length, flies: flyN } }; },
    get strings() { return strings.p; },
    get lamps() { return lamps; },
    get candles() { return candles; },
    get windows() { return windows; },
    get flies() { return flies.p; },
    get sloth() { return sloth; },
    supperOn: () => !!par,
    start,
    promptAt(catPos) {
      target = decide(catPos);
      return target ? target.line : null;
    },
    interact() {
      if (!target || disposed) return null;
      const t = target;
      target = null;
      if (t.kind === 'set') {
        if (mossy.step({ kind: 'set' })) { audio?.chime?.(); say('jungle-table-set', phrase('jungle.table.set')); } // saved as step 5, sent as jl-set
      } else if (t.kind === 'begin') {
        mossy.step({ kind: 'supper' }, true); // saved as step 6
        start({ own: true });
      } else if (t.kind === 'replay') start({ own: true });
      return t.kind;
    },
    // a supper begun by anyone in the room starts ours (the shared T0), and takes the steps up to it in order
    credit(ev) {
      if (!ev || typeof ev !== 'object' || ev.kind !== 'jl-supper' || !Number.isFinite(ev.elapsed) || disposed) return null;
      if (rec().step < M.STEP.supper) mossy.step({ kind: 'supper' }, true);
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
      if (!reducedMotion) sloth.rotation.z = 0.05 * Math.sin(t * 0.5);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      par = null;
      light?.setShow?.(0, 0, 0);
      scene.remove(...lamps, ...candles, ...windows, strings.p, flies.p, sloth);
      for (const s of [...lamps, ...candles, ...windows]) s.material.dispose();
      for (const o of [strings, flies]) { o.geo.dispose(); o.p.material.dispose(); }
      sloth.geometry.dispose(); sloth.material.dispose();
    },
  };
}
