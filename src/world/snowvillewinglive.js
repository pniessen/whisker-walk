// =============================================================================
// WING B ON A WALK (milestone V5: chapters two and three of the story, mission steps 5 to 7; the candles and lanterns are Tilly's, world/snowvillelife.js, and so is the one save).
//   * THE VILLAGE HEARTH crackles (a flame sprite that flickers). When the third lantern is lit (step 4), standing by the hearth for a moment warms her up (step 5, sent to the room as
//     'sv-warm'); the lane's STRINGS OF LIGHTS come on then and stay on.
//   * LANTERN NIGHT: Interact beside the village fir at step 5 or 6 begins it: 20 s, a PURE FUNCTION OF ONE START TIME (world/snowshow.js showAt(k), k = the walk's clock minus T0).
//     Anyone's start is everyone's in a room: credit({ kind: 'sv-show', elapsed }) starts it for a partner too (elapsed = how long ago it began on the sender's clock, so two devices agree
//     whatever their clocks say), and at the pay moment each device takes the steps in order (world/snowvillemission.js credit()) and pays its own save: snowstory (40 paws, once ever) and
//     Tilly's Snowflake Clasp (added to what she owns and put on if her collar is bare). The Great Fir keeps its lights on for good once the story is told. After step 7 the village offers
//     the show again for fun: nothing is paid.
//   * REDUCED MOTION: the show is frozen at its END state for its whole length (every lantern, window and the fir lit, no sparks, no flicker); the pay moment is the same.
//   * LOW and LITE rungs: fewer bulbs and sparks (LITE: no sparks and every other window glow). One PointLight only (the brazier's, made at build): the show only brightens it.
// No fail state; nothing is timed that she can lose. Draws no random number and reads no clock of its own (the walk's dt only). Stage chunk code (snowvillestageb.js).
// =============================================================================

import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as M from './snowvillemission.js';
import * as W from './snowvillewingplan.js';
import { SQUARE_FIR, snowY } from './snowvilleplan.js';
import { showAt, SHOW, MOTE_HUES } from './snowshow.js';
import { dotTexture } from './snowvilleparts.js';
import { isLowTier } from './snowvillelight.js';
import './snowvillewingwords.js';

export const CLASP_ID = 'snowclasp';
export const PAY_SEQ = Object.freeze({ clasp: 2.6 }); // seconds after the pay moment that Tilly's clasp line shows
export const WARM_SECS = 1.0; // she warms up after standing by the hearth this long
export const BULBS = Object.freeze({ fir: 40, firLow: 24 });
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const smooth = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };
const FLAGS = Object.freeze({ noMerge: true, noCast: true, noContactShadow: true });

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

// createWing(ctx) -> { promptAt, interact, credit, update, start, showOn, state, dispose }
// ctx: { scene, tilly (world/snowvillelife.js's), progression, log, audio, tier, reducedMotion, send (tells the room a show began) }
export function createWing(ctx) {
  const { scene, tilly, reducedMotion = false } = ctx;
  const progression = ctx.progression ?? null;
  const audio = ctx.audio ?? null;
  const log = ctx.log ?? null;
  const low = isLowTier(ctx.tier);
  const lite = !!ctx.tier && ctx.tier.shadows === false;
  const rec = () => M.normalize(progression?.state?.snowville);
  const tex = dotTexture();
  const light = scene.getObjectByName?.('snowville:light') ?? null;

  let clock = 0;
  let disposed = false;
  let par = null; // { t0, paid }
  let target = null; // what the action button would do now
  let warmT = 0;
  let flash = 0;
  let stringLevel = rec().step >= M.STEP.warm ? 1 : 0;
  const later = [];
  const fy = (x, z) => snowY(x, z);

  // the hearth's flame
  const flame = glowSprite(tex, 0xffa43c, 0.55, 2.4, 'snowville:hearthGlow');
  flame.visible = true;
  flame.position.set(W.HEARTH.x, fy(W.HEARTH.x, W.HEARTH.z) + 0.9, W.HEARTH.z);

  // the cottages' windows (Lantern Night lights them in turn; LITE every other one)
  const winIdx = W.WINDOWS.map((_, i) => i).filter((i) => !lite || i % 2 === 0);
  const windows = winIdx.map((i) => {
    const w = W.WINDOWS[i];
    const sp = glowSprite(tex, 0xffd9a0, 0, w.size, `snowville:windowGlow:${w.id}`);
    sp.position.set(w.x, w.y, w.z);
    return sp;
  });

  // the lane's strings of lights (every other bulb on the low rungs)
  const allStrings = W.lightStrings();
  const bulbsOnString = low ? allStrings.filter((_, i) => i % 2 === 0) : allStrings;
  const sCol = new Float32Array(bulbsOnString.length * 3);
  const tint = new THREE.Color();
  bulbsOnString.forEach((_, i) => { tint.setHex(MOTE_HUES[i % 4]); sCol.set([tint.r, tint.g, tint.b], i * 3); });
  const strings = points(bulbsOnString.length, { size: 0.3, colors: sCol, name: 'snowville:strings', map: tex });
  bulbsOnString.forEach((b, i) => strings.pos.set([b.x, b.y, b.z], i * 3));
  strings.p.visible = stringLevel > 0;

  // the Great Fir's bulbs (lit from the lowest up: the draw range is how many are on) and its star
  const nFir = low ? BULBS.firLow : BULBS.fir;
  const fCol = new Float32Array(nFir * 3);
  const fPts = W.firBulbs(nFir);
  fPts.forEach((_, i) => { tint.setHex(MOTE_HUES[i % 4]); fCol.set([tint.r, tint.g, tint.b], i * 3); });
  const fir = points(nFir, { size: 0.42, colors: fCol, name: 'snowville:firBulbs', map: tex });
  fPts.forEach((b, i) => fir.pos.set([b.x, b.y, b.z], i * 3));
  fir.geo.setDrawRange(0, rec().step >= M.STEP.done ? nFir : 0);
  const star = glowSprite(tex, 0xffe08a, 0, 3.4, 'snowville:firStar');
  star.position.set(W.FIR_STAR.x, W.FIR_STAR.y, W.FIR_STAR.z);

  // the sparks that rise from the Great Fir (none on the lowest rung or in reduced motion)
  const moteN = lite || reducedMotion ? 0 : low ? SHOW.motes / 2 : SHOW.motes;
  const mCol = new Float32Array(Math.max(1, moteN) * 3);
  for (let i = 0; i < moteN; i++) { tint.setHex(MOTE_HUES[i % 4]); mCol.set([tint.r, tint.g, tint.b], i * 3); }
  const motes = points(Math.max(1, moteN), { size: 0.5, colors: mCol, name: 'snowville:motes', map: tex, opacity: 0 });
  motes.p.visible = false;

  scene.add(flame, ...windows, strings.p, fir.p, star, motes.p);

  // ---- the show ------------------------------------------------------------------------------------------------------------
  function giveStoryRewards() {
    const st = progression?.state;
    if (st?.unlocked?.accessories && !st.unlocked.accessories.includes(CLASP_ID)) st.unlocked.accessories.push(CLASP_ID);
    if (st?.equipped && st.equipped.collar == null) st.equipped.collar = CLASP_ID;
    if (log) log.awardOnce('snowstory', 'snowville-story', phrase('snowville.show.pay'));
    progression?.addPoints?.(0); // the save's own "persist now": it adds nothing
    later.push({ at: clock + PAY_SEQ.clasp, fn: () => say('snowville-clasp', phrase('snowville.clasp')) });
  }
  function pay() {
    if (!par || par.paid) return;
    par.paid = true;
    flash = 1;
    if (!log || (log.count?.('snowville-night') ?? 0) === 0) { log?.mark?.('snowville-night'); progression?.recordSighting?.('sv8'); } // the journal's night page, once a walk
    if (rec().step >= M.STEP.done) return; // a replay: nothing is paid
    const effect = tilly.step({ kind: 'done' }, true); // takes every step before it in order too
    if (effect === 'done') { audio?.chime?.(); giveStoryRewards(); }
  }
  // start the show (T0 = now); `elapsed` (a partner's start, some seconds ago on their clock) joins one already going
  function start({ own = true, elapsed = 0 } = {}) {
    if (disposed || par) return false;
    const e = Number.isFinite(elapsed) ? Math.min(Math.max(0, elapsed), SHOW.secs) : 0;
    par = { t0: clock - e, paid: false };
    if (e < 3) { audio?.chime?.(); say('snowville-show-start', phrase('snowville.show.start')); }
    if (own) ctx.send?.({ kind: 'sv-show', elapsed: 0 });
    return true;
  }

  function decide(catPos) {
    if (disposed || !catPos || par) return null;
    if (dist(catPos, SQUARE_FIR) >= W.FIR_PROMPT) return null;
    const { step } = rec();
    if (step === M.STEP.warm || step === M.STEP.glow) return { kind: 'begin', line: phrase('snowville.show.prompt') };
    if (step >= M.STEP.done) return { kind: 'replay', line: phrase('snowville.show.replay') };
    return null;
  }

  // ---- placing things each frame --------------------------------------------------------------------------------------------
  function placeShow(k, t, step) {
    const p = showAt(k);
    const on = p.active;
    const done = rec().step >= M.STEP.done;
    // the lane's strings: on from step 5 for good, and always during the show
    const wantStrings = on || rec().step >= M.STEP.warm ? 1 : 0;
    stringLevel += Math.sign(wantStrings - stringLevel) * Math.min(Math.abs(wantStrings - stringLevel), reducedMotion ? 1 : step / 1.6);
    strings.p.visible = stringLevel > 0.001;
    strings.p.material.opacity = 0.95 * smooth(stringLevel) * (reducedMotion ? 1 : 0.88 + 0.12 * Math.sin(t * 2.4));
    // the Great Fir: the show lights it bulb by bulb; once the story is told it stays lit
    const firFrac = on ? p.fir : done ? 1 : 0;
    const lit = Math.round(firFrac * nFir);
    fir.geo.setDrawRange(0, lit);
    fir.p.visible = lit > 0;
    fir.p.material.opacity = 0.95 * (reducedMotion ? 1 : 0.9 + 0.1 * Math.sin(t * 3.1));
    const starL = on ? p.star : done ? 1 : 0;
    star.visible = starL > 0.01;
    star.material.opacity = 0.7 * starL * (reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 2.2));
    // the cottages' windows
    windows.forEach((sp, j) => {
      const g = on ? p.windows[winIdx[j]] : 0;
      sp.visible = g > 0.01;
      sp.material.opacity = 0.7 * g;
    });
    // the three lanterns flare in turn (a still glow in reduced motion: the end state)
    const halos = tilly.halos ?? [];
    for (let i = 0; i < halos.length; i++) {
      const h = halos[i];
      const f = on ? p.lanterns[i] ?? 0 : 0;
      h.scale.setScalar(5 + (reducedMotion ? 0 : 2.2 * Math.max(0, f - 0.75) * 4));
      if (on && f > 0 && h.visible !== false) h.material.opacity = Math.max(h.material.opacity, Math.min(0.95, 0.55 + 0.4 * f));
    }
    // the sparks
    const showMotes = on && moteN > 0 && p.moteOpacity > 0.01;
    motes.p.visible = showMotes;
    if (showMotes) {
      motes.p.material.opacity = 0.9 * p.moteOpacity;
      const y0 = snowY(W.GREAT_FIR.x, W.GREAT_FIR.z);
      for (let i = 0; i < moteN; i++) { const m = p.motes[i]; motes.pos[i * 3] = m.x; motes.pos[i * 3 + 1] = y0 + m.y; motes.pos[i * 3 + 2] = m.z; }
      motes.geo.attributes.position.needsUpdate = true;
    }
    // the brazier's one light stands a little brighter for the show (the light layer sets its own number first each frame)
    if (light) light.intensity *= 1 + (on ? 0.5 * smooth(p.k / 1.5) * smooth((SHOW.secs - p.k) / 1.5) : 0) + flash * 0.3;
    return p;
  }

  return {
    get state() { return { clock, show: par ? { ...par, k: clock - par.t0 } : null, stringLevel, warmT, record: rec(), windows: windows.length, bulbs: { fir: nFir, strings: bulbsOnString.length, motes: moteN } }; },
    get flame() { return flame; },
    get strings() { return strings.p; },
    get fir() { return fir.p; },
    get star() { return star; },
    get motes() { return motes.p; },
    get windows() { return windows; },
    showOn: () => !!par,
    start,
    promptAt(catPos) {
      target = decide(catPos);
      return target ? target.line : null;
    },
    interact() {
      if (!target || disposed) return null;
      const t = target;
      target = null;
      if (t.kind === 'begin') {
        tilly.step({ kind: 'glow' }); // saved as step 6 (a step she is already past changes nothing)
        start({ own: true });
      } else if (t.kind === 'replay') start({ own: true });
      return t.kind;
    },
    // a show begun by anyone in the room starts ours (the shared T0), and takes the steps up to it in order
    credit(ev) {
      if (!ev || typeof ev !== 'object' || ev.kind !== 'sv-show' || !Number.isFinite(ev.elapsed) || disposed) return null;
      if (rec().step < M.STEP.glow) tilly.step({ kind: 'glow' }, true);
      return start({ own: false, elapsed: ev.elapsed }) ? 'show-start' : null;
    },
    update(dt, t, catPos = null) {
      if (disposed) return;
      const step = dt > 0 ? dt : 0;
      clock += step;
      if (flash > 0) flash = Math.max(0, flash - step * 0.5);
      while (later.length && later[0].at <= clock) later.shift().fn();
      // standing by the hearth warms her up once the third lantern is lit (the cheeks theme teaches itself here)
      if (catPos && rec().step === M.STEP.third) {
        warmT = dist(catPos, W.HEARTH) < W.HEARTH_WARM ? warmT + step : 0;
        if (warmT >= WARM_SECS) {
          warmT = 0;
          if (tilly.step({ kind: 'warm' })) { audio?.chime?.(); say('snowville-hearth-warm', phrase('snowville.hearth.warm')); }
        }
      } else warmT = 0;
      let k = -1;
      if (par) {
        const real = clock - par.t0;
        if (real >= SHOW.payAt) pay();
        if (real > SHOW.secs) { par = null; k = -1; } else k = reducedMotion ? SHOW.secs : real; // reduced motion holds the end state
      }
      flame.material.opacity = reducedMotion ? 0.55 : 0.5 + 0.12 * Math.sin(t * 9.1) + 0.06 * Math.sin(t * 15.7 + 1);
      flame.scale.setScalar(reducedMotion ? 2.4 : 2.4 + 0.25 * Math.sin(t * 7.3));
      placeShow(k, t, step);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      par = null;
      scene.remove(flame, ...windows, strings.p, fir.p, star, motes.p);
      flame.material.dispose(); star.material.dispose();
      for (const w of windows) w.material.dispose();
      for (const o of [strings, fir, motes]) { o.geo.dispose(); o.p.material.dispose(); }
    },
  };
}
