// =============================================================================
// WING B ON A WALK (milestone C5: chapters two and three of the story, mission steps 3 to 7; the stones are Lumi's, world/crystallife.js, and so is the one save).
//   * THE BLUE POOL glows and breathes softly; its stepping crystals are low perches (an optional climb: the floor goes round).
//   * THE GOLD NOOK is ringed by a halo of glints. THE PASSAGES' LAMPS come on a moment after the gold stone is set (step 5) and stay on.
//   * THE HEART CRYSTAL sleeps (dull) until step 6, then glows for good. Interact beside it at step 5 or 6 wakes it and begins the LIGHT SHOW: 20 s, a PURE
//     FUNCTION OF ONE START TIME (world/crystalshow.js showAt(k), k = the walk's clock minus T0). Anyone's start is everyone's in a room: credit({ kind: 'show',
//     elapsed }) starts it for a partner too (elapsed = how long ago it began on the sender's clock, so two devices agree whatever their clocks say), and at the
//     pay moment each device takes the steps in order (src/crystalmission.js credit()) and pays its own save: crystalstory (40 paws, once ever) and the Glimmer
//     Collar's gem (the collar is added to what she owns and put on if her collar is bare). After step 7 the Heart offers the show again for fun: nothing is paid.
//   * REDUCED MOTION: the Heart and the halos hold a gentle still glow for the show's whole length; no motes move; the pay moment is the same.
// No fail state; nothing is timed that she can lose. Draws no random number and reads no clock of its own (the walk's dt only).
// =============================================================================

import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as M from '../crystalmission.js';
import * as S from './crystalstory.js';
import * as W from './crystalwingplan.js';
import { showAt, SHOW, MOTE_HUES } from './crystalshow.js';
import { HEART_DORMANT } from './crystalwingparts.js';
import { crystalY, HUE_COLOURS } from './crystalplan.js';
import { humNote } from './crystallife.js';

export const GEM_ID = 'glimmercollar';
export const PAY_SEQ = Object.freeze({ gem: 2.6 }); // seconds after the pay moment that Lumi's gem line shows
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const smooth = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };
const FLAGS = Object.freeze({ noMerge: true, noCast: true, noContactShadow: true });
const HUE_IDX = Object.freeze({ rose: 0, blue: 1, gold: 2 });

function haloTexture() {
  const cv = globalThis.document?.createElement?.('canvas');
  const g = cv?.getContext?.('2d');
  if (!g) return null;
  cv.width = cv.height = 64;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// createWing(ctx) -> { promptAt, interact, credit, update, start, showOn, state, dispose }
// ctx: { scene, lumi (world/crystallife.js's), progression, log, audio, tier, reducedMotion, send (optional: tells the room a show began) }
export function createWing(ctx) {
  const { scene, lumi, reducedMotion = false } = ctx;
  const progression = ctx.progression ?? null;
  const audio = ctx.audio ?? null;
  const log = ctx.log ?? null;
  const lowTier = !!ctx.tier && (ctx.tier.name === 'low' || ctx.tier.shadows === false || (ctx.tier.rung ?? 0) >= 3);
  const rec = () => M.normalize(progression?.state?.crystal);
  const pool = scene.getObjectByName?.('crystal:pool') ?? null;
  const heart = scene.getObjectByName?.('crystal:heartgreat') ?? null;
  const lamps = scene.getObjectByName?.('crystal:lamps') ?? null;

  let clock = 0;
  let disposed = false;
  let par = null; // { t0, paid }
  let target = null; // what the action button would do now
  let heartLevel = rec().step >= M.STEP.show ? 1 : 0; // awake, eased 0 to 1
  let lampLevel = rec().step >= M.STEP.lit ? 1 : 0;
  let flash = 0;
  const later = [];
  const heartY = crystalY(S.HEART.x, S.HEART.z);

  const tex = haloTexture();
  const heartHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: HUE_COLOURS.heart, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
  heartHalo.name = 'crystal:heart:halo';
  heartHalo.position.set(S.HEART.x, heartY + 3.2, S.HEART.z);
  heartHalo.scale.setScalar(12);
  heartHalo.visible = false;
  Object.assign(heartHalo.userData, FLAGS);

  // the nook's ring of glints (always there: it is the nook's own look), and the show's motes
  const nookPos = new Float32Array(W.NOOK.glints * 3);
  const nookGeo = new THREE.BufferGeometry();
  nookGeo.setAttribute('position', new THREE.BufferAttribute(nookPos, 3));
  const nook = new THREE.Points(nookGeo, new THREE.PointsMaterial({ map: tex, alphaTest: 0.02, size: 0.34, sizeAttenuation: true, color: 0xffd98a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
  nook.name = 'crystal:nook';
  nook.frustumCulled = false;
  Object.assign(nook.userData, FLAGS);
  const moteN = lowTier ? SHOW.motes / 2 : SHOW.motes;
  const motePos = new Float32Array(moteN * 3);
  const moteCol = new Float32Array(moteN * 3);
  const tint = new THREE.Color();
  for (let i = 0; i < moteN; i++) { tint.setHex(HUE_COLOURS[MOTE_HUES[i % 4]]).lerp(new THREE.Color(0xffffff), 0.3); moteCol.set([tint.r, tint.g, tint.b], i * 3); }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  moteGeo.setAttribute('color', new THREE.BufferAttribute(moteCol, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ map: tex, alphaTest: 0.02, size: 0.5, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
  motes.name = 'crystal:motes';
  motes.frustumCulled = false;
  motes.visible = false;
  Object.assign(motes.userData, FLAGS);
  scene.add(heartHalo, nook, motes);

  // ---- the show ------------------------------------------------------------------------------------------------------------
  function giveStoryRewards() {
    const st = progression?.state;
    if (st?.unlocked?.accessories && !st.unlocked.accessories.includes(GEM_ID)) st.unlocked.accessories.push(GEM_ID);
    if (st?.equipped && st.equipped.collar == null) st.equipped.collar = GEM_ID;
    if (log) log.awardOnce('crystalstory', 'crystal-story', phrase('crystal.show.pay'));
    later.push({ at: clock + PAY_SEQ.gem, fn: () => say('crystal-gem', phrase('crystal.gem')) });
  }
  function pay() {
    if (!par || par.paid) return;
    par.paid = true;
    flash = 1;
    if (rec().step >= M.STEP.done) return; // a replay: nothing is paid
    const effect = lumi.step({ kind: 'done' }, true); // takes every step before it in order too
    if (effect === 'done') { audio?.chime?.(); giveStoryRewards(); }
  }
  // start the show (T0 = now); `elapsed` (a partner's start, some seconds ago on their clock) joins one already going
  function start({ own = true, elapsed = 0 } = {}) {
    if (disposed || par) return false;
    const e = Number.isFinite(elapsed) ? Math.min(Math.max(0, elapsed), SHOW.secs) : 0;
    par = { t0: clock - e, paid: false };
    if (e < 3) { humNote(audio, 2); say('crystal-show-start', phrase('crystal.show.start')); }
    if (own) ctx.send?.({ kind: 'show', elapsed: 0 });
    return true;
  }

  function decide(catPos) {
    if (disposed || !catPos || par) return null;
    const r = rec();
    if (dist(catPos, S.HEART) >= S.HEART.reach) return null;
    if (r.step === M.STEP.lit || r.step === M.STEP.show) return { kind: 'wake', line: phrase('crystal.heart.prompt') };
    if (r.step >= M.STEP.done) return { kind: 'replay', line: phrase('crystal.heart.replay') };
    return null;
  }

  // ---- placing things each frame --------------------------------------------------------------------------------------------
  function placeNook(t) {
    const base = reducedMotion ? 0 : t * 0.5;
    for (let i = 0; i < W.NOOK.glints; i++) {
      const a = (i / W.NOOK.glints) * Math.PI * 2 + base * 0.3;
      const x = W.NOOK.x + Math.cos(a) * W.NOOK.glintR;
      const z = W.NOOK.z + Math.sin(a) * W.NOOK.glintR;
      nookPos[i * 3] = x; nookPos[i * 3 + 1] = crystalY(x, z) + 0.55 + (reducedMotion ? 0 : 0.12 * Math.sin(t * 1.7 + i)); nookPos[i * 3 + 2] = z;
    }
    nookGeo.attributes.position.needsUpdate = true;
    nook.material.opacity = reducedMotion ? 0.8 : 0.6 + 0.25 * Math.sin(t * 2.3);
  }

  function placeShow(k) {
    const p = showAt(k);
    const on = p.active;
    const h = on ? p.heart : 0;
    const wake = reducedMotion ? (on ? 0.6 : 0) : Math.max(h, 0);
    // the Heart: dull asleep, gently lit once woken for good, brilliant in the show
    const rest = rec().step >= M.STEP.show ? 1 : 0;
    heartLevel += (Math.max(rest, h) - heartLevel) * Math.min(1, reducedMotion ? 1 : 0.1);
    const peak = reducedMotion ? 0 : p.waves.heart * 0.12;
    heart?.material.color.setScalar(HEART_DORMANT + (1 - HEART_DORMANT) * heartLevel + peak + flash * 0.1);
    heartHalo.visible = heartLevel > 0.02 || on;
    heartHalo.material.opacity = Math.min(0.62, 0.5 * heartLevel + (reducedMotion ? 0.3 * wake : 0.4 * p.waves.heart) + flash * 0.2);
    heartHalo.scale.setScalar(12 + (reducedMotion ? 0 : 2.5 * p.waves.heart));
    // the three other great crystals flare in turn (a still glow in reduced motion)
    for (const [hue, i] of Object.entries(HUE_IDX)) {
      const hl = lumi.halos?.[i];
      if (!hl || !on) continue;
      const w = reducedMotion ? 0.7 * wake : p.waves[hue];
      hl.visible = true;
      hl.material.opacity = Math.max(hl.material.opacity, 0.85 * w);
      hl.scale.setScalar(9 + (reducedMotion ? 0 : 3 * w));
    }
    if (pool) pool.material.color.setScalar(on ? 1 + (reducedMotion ? 0.2 * wake : 0.45 * p.waves.blue) : 1);
    // the motes spiral up from the Heart (none in reduced motion)
    const showMotes = on && !reducedMotion && p.moteOpacity > 0.01;
    motes.visible = showMotes;
    if (showMotes) {
      motes.material.opacity = 0.9 * p.moteOpacity;
      for (let i = 0; i < moteN; i++) {
        const m = p.motes[i];
        motePos[i * 3] = m.x; motePos[i * 3 + 1] = heartY + m.y; motePos[i * 3 + 2] = m.z;
      }
      moteGeo.attributes.position.needsUpdate = true;
    }
    // the cave's one light stands by the Heart for the show
    lumi.holdLight?.(on ? { x: S.HEART.x + 1.5, y: heartY + 4, z: S.HEART.z + 2.5, color: HUE_COLOURS.heart, intensity: 2.2 * (reducedMotion ? 0.6 * wake : 0.5 + 0.5 * h) } : null);
    return p;
  }

  // each passage wakes as its great crystal lights (rose lights the way to the pool, sky the way to the gold, gold the way to the Heart); all the way on once the passages light
  const lampCol = lamps?.geometry?.attributes?.color ?? null;
  const lampBase = lampCol ? Float32Array.from(lampCol.array) : null;
  const lampPass = W.PASSAGES.flatMap((p, pi) => p.lamps.map(() => pi));
  const lampEase = [0, 0, 0];
  function placeLamps(t, dt) {
    const want = rec().step >= M.STEP.lit ? 1 : 0;
    lampLevel += Math.sign(want - lampLevel) * Math.min(Math.abs(want - lampLevel), reducedMotion ? 1 : dt / 1.6);
    if (!lamps) return;
    const gl = lumi.glows ?? [];
    let any = lampLevel;
    for (let pi = 0; pi < 3; pi++) {
      const w = Math.max(smooth(gl[pi] ?? 0), smooth(lampLevel));
      lampEase[pi] = reducedMotion ? w : lampEase[pi] + (w - lampEase[pi]) * Math.min(1, dt * 3);
      any = Math.max(any, lampEase[pi]);
    }
    lamps.visible = any > 0.001;
    lamps.material.opacity = 0.9 * (reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 2.6));
    if (lampCol) { // additive: a lamp's colour scaled down is a lamp turned down
      for (let i = 0; i < lampPass.length; i++) { const k = lampEase[lampPass[i]] * (reducedMotion ? 1 : 0.9 + 0.1 * Math.sin(t * 1.9 + i * 0.7)); for (let c = 0; c < 3; c++) lampCol.array[i * 3 + c] = lampBase[i * 3 + c] * k; }
      lampCol.needsUpdate = true;
    }
  }

  return {
    get state() { return { clock, show: par ? { ...par, k: clock - par.t0 } : null, heartLevel, lampLevel, record: rec() }; },
    get heartHalo() { return heartHalo; },
    get motes() { return motes; },
    get nook() { return nook; },
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
      if (t.kind === 'wake') {
        lumi.step({ kind: 'wake' }); // saved as step 6 (a step she is already past changes nothing)
        start({ own: true });
      } else if (t.kind === 'replay') start({ own: true });
      return t.kind;
    },
    // a show begun by anyone in the room starts ours (the shared T0), and takes the steps up to the waking in order
    credit(ev) {
      if (!ev || typeof ev !== 'object' || ev.kind !== 'show' || !Number.isFinite(ev.elapsed)) return null;
      if (rec().step < M.STEP.show) lumi.step({ kind: 'wake' }, true);
      return start({ own: false, elapsed: ev.elapsed }) ? 'show-start' : null;
    },
    update(dt, t, catPos = null) {
      if (disposed) return;
      const step = dt > 0 ? dt : 0;
      clock += step;
      if (flash > 0) flash = Math.max(0, flash - step * 0.5);
      while (later.length && later[0].at <= clock) later.shift().fn();
      let k = -1;
      if (par) {
        k = clock - par.t0;
        if (k >= SHOW.payAt) pay();
        if (k > SHOW.secs) { par = null; k = -1; }
      }
      placeShow(k);
      placeNook(t);
      placeLamps(t, step);
      void catPos;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      par = null;
      lumi.holdLight?.(null);
      heart?.material.color.setScalar(HEART_DORMANT);
      scene.remove(heartHalo, nook, motes);
      heartHalo.material.dispose(); nookGeo.dispose(); nook.material.dispose(); moteGeo.dispose(); motes.material.dispose();
      tex?.dispose();
    },
  };
}
