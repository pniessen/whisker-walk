// =============================================================================
// THE HOUSEWARMING ON A WALK (milestone R5: chapters 2 and 3 of the story, mission steps 6 and 7). Made once a walk by world/reefstorylife.js on top of Marlo
// (world/reefmarlo.js owns the shells, the try-on, the action button and the save; this asks him to apply the steps, so there is one machine and one save):
//   * THE LANTERN CORALS (step 6): three tall corals with dark orbs, touched in order (just stand beside one; the next one pulses gently). Each glows in its
//     own colour; the third lights the whole garden and starts the parade. Which lantern she is on is not saved: a new walk starts them again.
//   * THE PARADE (step 7): the manta, Sela the turtle and the shoal glide past the new home while the coral glows: 20 s, a PURE FUNCTION of one start time
//     (world/reefparade.js paradeAt(k), k = the walk's clock minus T0). Anyone's start is everyone's in a room: credit({ kind: 'parade', elapsed }) starts it
//     for a partner too (elapsed = how long ago it began on the sender's clock, so two devices agree whatever their clocks say), and at the pay moment each
//     device credits the steps in order (src/reefmission.js credit()) and pays its own save. It pays `reefstory` (40 paws, once ever) and gives the Pearl
//     Collar's pearl: the collar is added to what she owns (and put on if her collar is bare). After step 7 Marlo offers it again for fun: nothing is paid.
// No fail state, nothing timed that she can lose. Draws no random number and reads no clock of its own (the walk's dt only).
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as M from '../reefmission.js';
import * as W from './reefwing.js';
import * as K from './reefparts.js';
import { paradeAt, PARADE } from './reefparade.js';
import { reefY } from './reefplan.js';

export const PEARL_ID = 'pearlcollar';
export const PAY_SEQ = Object.freeze({ pearl: 2.6 }); // seconds after the pay moment the pearl's line shows
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const smooth = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };
const _glow = new THREE.Color();
const FLAGS = Object.freeze({ noMerge: true, noCast: true, noContactShadow: true });

function haloTexture() {
  const doc = globalThis.document;
  const cv = doc?.createElement?.('canvas');
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

// A lantern's light: an open column of colour that fades out towards its top (so it reads from across the garden) and a flat ring of the same colour on the
// sea floor, ONE merged additive mesh each (no caster, no light). Vertex colours carry the fade; the material's opacity is the strength.
function makeBeacon(hex, baseY) {
  const L = W.LANTERN_LOOK;
  const c = new THREE.Color(hex);
  const col = (g, f) => { const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const k = f(g.attributes.position.getY(i)); a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const column = col(new THREE.CylinderGeometry(0.7, 1.15, L.column, 10, 1, true).translate(0, L.column / 2, 0), (y) => Math.max(0, 1 - y / L.column) ** 1.4 * 0.9);
  const ring = col(new THREE.RingGeometry(L.ringIn, L.ringOut, 18).rotateX(-Math.PI / 2).translate(0, 0.07, 0), (y) => (y >= 0 ? 1 : 0));
  const m = new THREE.Mesh(mergeGeometries([column.toNonIndexed(), ring.toNonIndexed()]), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true }));
  m.position.y = baseY;
  m.castShadow = false; m.receiveShadow = false;
  Object.assign(m.userData, FLAGS);
  m.frustumCulled = false;
  m.visible = false;
  return m;
}

// ---- the parade's three kinds of creature (each one small merged mesh; the shoal one InstancedMesh) -----------------------------------------------
function makeManta(mat) {
  const g = new THREE.Group();
  g.name = 'reef:manta';
  const body = new THREE.SphereGeometry(0.9, 8, 5); body.scale(1.1, 0.22, 1.5); // a flat diamond of a body
  const head = new THREE.ConeGeometry(0.28, 0.9, 5); head.rotateX(Math.PI / 2); head.translate(0, 0, 1.55);
  const tail = new THREE.CylinderGeometry(0.01, 0.05, 2.4, 4); tail.rotateX(Math.PI / 2); tail.translate(0, 0, -2.4);
  const belly = new THREE.SphereGeometry(0.7, 6, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); belly.scale(1.0, 0.14, 1.3); belly.translate(0, -0.02, 0.05);
  const parts = [K.paint(body, 0x2f4a5c), K.paint(head, 0x2f4a5c), K.paint(tail, 0x2f4a5c), K.paint(belly, 0xf2efe6)];
  const main = new THREE.Mesh(mergeGeometries(parts), mat);
  main.name = 'reef:manta:body';
  // a wing: a swept, drooping strip of three spans out to a pointed tip, dark above and pale below (leading edge ahead, trailing edge behind; tips curl down)
  const wing = (sx) => {
    const cols = [[0, 0.9, -0.9, 0], [1.1, 0.75, -0.75, -0.05], [2.1, 0.3, -0.62, -0.2]]; // [span, leading z, trailing z, droop]
    const tip = [3.1, -0.5, -0.5, -0.42];
    const v = []; const idx = []; const col = [];
    const top = new THREE.Color(0x2f4a5c); const edge = new THREE.Color(0x4f7189); const pale = new THREE.Color(0xf2efe6);
    cols.forEach(([x, zl, zt, y]) => { v.push(sx * x, y + 0.1, zl, sx * x, y + 0.1, zt); });
    v.push(sx * tip[0], tip[3] + 0.1, tip[1]);
    cols.forEach(([x, zl, zt, y]) => { v.push(sx * x, y, zl, sx * x, y, zt); });
    v.push(sx * tip[0], tip[3], tip[1]);
    const up = [0, 1, 2, 3, 4, 5, 6]; const dn = up.map((i) => i + 7);
    const tris = (L, flip) => {
      const q = (a, b2, c, d) => (flip ? [a, c, b2, a, d, c] : [a, b2, c, a, c, d]);
      return [...q(L[0], L[1], L[3], L[2]), ...q(L[2], L[3], L[5], L[4]), ...(flip ? [L[4], L[6], L[5]] : [L[4], L[5], L[6]])];
    };
    const f = sx > 0;
    idx.push(...tris(up, f), ...tris(dn, !f));
    for (let i = 0; i < 14; i++) { const c = i < 7 ? (i < 2 ? top : i < 4 ? top : edge) : pale; col.push(c.r, c.g, c.b); }
    const w = new THREE.BufferGeometry();
    w.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
    w.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    w.setIndex(idx);
    w.computeVertexNormals();
    const m = new THREE.Mesh(w, mat);
    m.name = `reef:manta:wing${sx > 0 ? 'R' : 'L'}`;
    return m;
  };
  const wl = wing(-1); const wr = wing(1);
  g.add(main, wl, wr);
  g.userData.wings = [wl, wr];
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; Object.assign(o.userData, FLAGS); } });
  g.visible = false;
  return g;
}

function makeTurtle(mat) {
  const parts = [];
  const shell = new THREE.SphereGeometry(0.55, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2); shell.scale(1.2, 0.8, 1.45); parts.push(K.paint(shell, 0x5a8f4a));
  const plate = new THREE.SphereGeometry(0.42, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2); plate.scale(1.1, 0.85, 1.35); plate.translate(0, 0.08, 0); parts.push(K.paint(plate, 0x8fbf6a));
  const belly = new THREE.CylinderGeometry(0.62, 0.5, 0.1, 8); belly.scale(1.1, 1, 1.35); belly.translate(0, -0.02, 0); parts.push(K.paint(belly, 0xe8d9a8));
  const head = new THREE.SphereGeometry(0.2, 6, 5); head.translate(0, 0.06, 0.95); parts.push(K.paint(head, 0xa6c97a));
  for (const [x, z] of [[-0.62, 0.45], [0.62, 0.45], [-0.5, -0.5], [0.5, -0.5]]) {
    const f = new THREE.SphereGeometry(0.2, 5, 4); f.scale(1.9, 0.25, 0.9); f.translate(x, -0.05, z); parts.push(K.paint(f, 0xa6c97a));
  }
  const m = new THREE.Mesh(mergeGeometries(parts), mat);
  m.name = 'reef:sela';
  m.castShadow = false; m.receiveShadow = false;
  Object.assign(m.userData, FLAGS);
  m.visible = false;
  return m;
}

function makeShoal(mat, n) {
  const body = new THREE.ConeGeometry(0.11, 0.42, 5); body.rotateX(Math.PI / 2); // nose along +z
  const lobe = (sy) => { const g = new THREE.ConeGeometry(0.05, 0.2, 3); g.rotateX(-Math.PI / 2); g.rotateX(sy * 0.5); g.translate(0, sy * 0.05, -0.3); return K.paint(g, 0xdddddd); }; // a forked tail
  const geo = mergeGeometries([K.paint(body, 0xffffff), lobe(1), lobe(-1)]);
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.name = 'reef:shoal';
  const tint = new THREE.Color();
  const cols = [0xffb347, 0xff8f6b, 0xffd966, 0x8fd8ff];
  for (let i = 0; i < n; i++) { tint.setHex(cols[i % 4]); mesh.setColorAt(i, tint); }
  mesh.castShadow = false; mesh.receiveShadow = false;
  Object.assign(mesh.userData, FLAGS);
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}

// createHousewarming(ctx) -> { update, start, credit, paradeOn, state, dispose }
// ctx: { scene, marlo (world/reefmarlo.js's), progression, log, audio, tier, reducedMotion, send (optional: tells the room a parade began) }
export function createHousewarming(ctx) {
  const { scene, marlo, reducedMotion = false } = ctx;
  const progression = ctx.progression ?? null;
  const audio = ctx.audio ?? null;
  const log = ctx.log ?? null;
  const lowTier = !!ctx.tier && (ctx.tier.name === 'low' || ctx.tier.shadows === false || (ctx.tier.rung ?? 0) >= 3);
  const rec = () => M.normalize(progression?.state?.reef);

  let clock = 0;
  let disposed = false;
  const litNow = () => marlo.lit; // lantern corals touched on this walk (Marlo keeps the count: his goal ring points at the next one)
  let par = null; // { t0, paid }
  let flash = 0; // the pay moment's brightening
  let nudgeAt = -100; // when a coral touched out of order last flickered
  let nudged = -1; // which coral flickered
  const later = [];

  // the lantern orbs and their halos
  const halo = haloTexture();
  const orbs = W.LANTERNS.map((l, i) => {
    const mat = new THREE.MeshBasicMaterial({ color: 0x3b4a52 });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(W.LANTERN_LOOK.orb, 10, 7), mat);
    orb.name = `reef:lantern${i}`;
    orb.position.set(l.x, reefY(l.x, l.z) + l.h + 0.4, l.z);
    orb.castShadow = false; orb.receiveShadow = false; Object.assign(orb.userData, FLAGS);
    const hm = new THREE.SpriteMaterial({ map: halo, color: W.LANTERN_COLORS[i], transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
    const sp = new THREE.Sprite(hm);
    sp.name = `reef:lanternhalo${i}`;
    sp.position.copy(orb.position);
    sp.scale.setScalar(2.6);
    Object.assign(sp.userData, { noMerge: true, noCast: true, noContactShadow: true });
    const beam = makeBeacon(W.LANTERN_COLORS[i], reefY(l.x, l.z));
    beam.name = `reef:lanternlight${i}`;
    beam.position.x = l.x; beam.position.z = l.z;
    return { orb, sp, mat, beam, level: 0, pop: 0, wasOn: false };
  });
  for (const o of orbs) scene.add(o.orb, o.sp, o.beam);

  // the parade's creatures
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const fishMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const manta = makeManta(paint);
  const turtle = makeTurtle(paint);
  const fishN = lowTier ? Math.ceil(PARADE.fish / 2) : PARADE.fish;
  const shoal = makeShoal(fishMat, fishN);
  scene.add(manta, turtle, shoal);
  const dummy = new THREE.Object3D();

  // ---- the steps ------------------------------------------------------------------------------------------------------------
  function giveStoryRewards() {
    const st = progression?.state;
    if (st?.unlocked?.accessories && !st.unlocked.accessories.includes(PEARL_ID)) st.unlocked.accessories.push(PEARL_ID);
    if (st?.equipped && st.equipped.collar == null) st.equipped.collar = PEARL_ID;
    if (log) log.awardOnce('reefstory', 'reef-story', phrase('reef.parade.pay'));
    later.push({ at: clock + PAY_SEQ.pearl, fn: () => say('reef-pearl', phrase('reef.pearl')) });
  }
  function pay() {
    if (!par || par.paid) return;
    par.paid = true;
    flash = 1;
    if (rec().step >= M.STEP.done) return; // a replay: nothing is paid
    const effect = marlo.credit({ kind: 'parade' });
    if (effect === 'parade') { audio?.chime?.(); giveStoryRewards(); }
  }
  function touchLantern(i) {
    const was = litNow();
    const now = M.lanternTouch(was, i);
    if (now === was) return;
    marlo.setLit(now);
    audio?.chime?.();
    if (M.lanternsLit(now)) {
      marlo.perform({ kind: 'lit' });
      say('reef-lantern-all', phrase('reef.lantern.all'));
      start({ own: true });
    } else say('reef-lantern-lit', phrase('reef.lantern.lit'));
  }
  // start the parade (T0 = now); `elapsed` (a partner's start, some seconds ago on their clock) joins one already going
  function start({ own = true, elapsed = 0 } = {}) {
    if (disposed || par) return false;
    const e = Number.isFinite(elapsed) ? Math.min(Math.max(0, elapsed), PARADE.secs) : 0;
    par = { t0: clock - e, paid: false };
    if (e < 3) say('reef-parade-start', phrase('reef.parade.start'));
    if (own) ctx.send?.({ kind: 'parade', elapsed: 0 });
    return true;
  }

  let primed = false; let lastPlace = 0;
  function placeLanterns(t, catPos, k) {
    const r = rec();
    const popDt = Math.min(0.25, Math.max(0, clock - lastPlace)); lastPlace = clock;
    const g = paradeAt(k);
    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i];
      const lit = litNow();
      const on = r.step >= M.STEP.lit || i < lit ? 1 : 0;
      const target = Math.max(on, g.glow);
      o.level += (target - o.level) * Math.min(1, (reducedMotion ? 1 : 0.12));
      const next = r.step === M.STEP.tried && i === lit && !on;
      const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 2);
      const flick = clock - nudgeAt < 1.2 && i === nudged && !reducedMotion ? 0.5 * Math.abs(Math.sin((clock - nudgeAt) * 14)) * (1 - (clock - nudgeAt) / 1.2) : 0; // a small flicker, never a fail
      // the lit/unlit change: a pop of brightness the moment a lantern turns on, then it settles at full colour; an unlit one is a dull grey ball
      if (primed && on && !o.wasOn && !reducedMotion) o.pop = 1; // (a lantern already lit when the walk begins does not pop)
      o.wasOn = !!on;
      o.pop = Math.max(0, o.pop - popDt / 1.4);
      const slow = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 1.2 + i * 2.1); // the slow pulse of a lit lantern
      const strength = Math.min(1, o.level + (next ? 0.3 * pulse : 0) + flash * 0.4 + flick + o.pop * 0.5);
      o.mat.color.setHex(0x3b4a52).lerp(_glow.setHex(W.LANTERN_COLORS[i]), strength);
      o.sp.material.opacity = 0.6 * (o.level > 0.02 || next ? Math.min(1, o.level * (0.8 + 0.2 * slow) + (next ? 0.35 + 0.25 * pulse : 0) + flash * 0.3 + flick + o.pop * 0.3) : 0);
      o.sp.scale.setScalar(2.0 + 1.8 * strength + (reducedMotion ? 0 : (0.25 + 0.6 * o.pop) * Math.sin(t * 1.4 + i)) + 1.5 * o.pop);
      o.sp.visible = o.sp.material.opacity > 0.01;
      o.orb.scale.setScalar(1 + (reducedMotion ? 0 : 0.05 * Math.sin(t * 1.2 + i * 2.1) * (on ? 1 : 0)) + 0.35 * o.pop);
      // the column and the floor ring: strong once lit, a softer breathing one on the lantern she is to touch next, none on a lantern still waiting its turn
      const beamLevel = o.level * (0.55 + 0.25 * slow) + (next ? 0.22 + 0.2 * pulse : 0) + flash * 0.25 + o.pop * 0.35;
      o.beam.material.opacity = Math.min(0.42, beamLevel * 0.55);
      o.beam.visible = o.beam.material.opacity > 0.01;
    }
    primed = true;
    void catPos;
  }

  function placeParade(k) {
    const p = paradeAt(k);
    const on = p.active;
    manta.visible = on && p.manta.show > 0.02;
    turtle.visible = on && p.turtle.show > 0.02;
    shoal.visible = on && p.shoal.length > 0 && p.shoal[0].show > 0.02;
    if (!on) return p;
    const flap = reducedMotion ? 0 : p.manta.flap;
    manta.position.set(p.manta.x, reefY(p.manta.x, p.manta.z) + p.manta.y, p.manta.z);
    manta.rotation.set(0, p.manta.yaw, 0);
    manta.scale.setScalar(0.4 + 0.6 * p.manta.show);
    manta.userData.wings[0].rotation.z = -flap;
    manta.userData.wings[1].rotation.z = flap;
    turtle.position.set(p.turtle.x, reefY(p.turtle.x, p.turtle.z) + p.turtle.y, p.turtle.z);
    turtle.rotation.set(0, p.turtle.yaw, reducedMotion ? 0 : p.turtle.paddle * 0.08);
    turtle.scale.setScalar(0.4 + 0.6 * p.turtle.show);
    for (let i = 0; i < fishN; i++) {
      const f = p.shoal[i];
      dummy.position.set(f.x, reefY(f.x, f.z) + f.y, f.z);
      dummy.rotation.set(0, f.yaw + (reducedMotion ? 0 : 0.18 * Math.sin(k * 7 + i * 2.1)), 0); // the tail beat at each fish's own phase
      dummy.scale.setScalar((0.4 + 0.6 * f.show) * (0.85 + 0.3 * ((i * 0.618) % 1)));
      dummy.updateMatrix();
      shoal.setMatrixAt(i, dummy.matrix);
    }
    shoal.instanceMatrix.needsUpdate = true;
    return p;
  }

  return {
    get state() { return { clock, lit: litNow(), parade: par ? { ...par, k: clock - par.t0 } : null, record: rec() }; },
    get manta() { return manta; },
    get turtle() { return turtle; },
    get shoal() { return shoal; },
    get orbs() { return orbs; },
    paradeOn: () => !!par,
    start,
    // a step done by anyone in the room: a partner's parade starts ours too (the steps themselves are Marlo's credit)
    credit(ev) {
      if (!ev || typeof ev !== 'object' || ev.kind !== 'parade') return null;
      return start({ own: false, elapsed: ev.elapsed }) ? 'parade-start' : null;
    },
    update(dt, t, catPos = null) {
      if (disposed) return;
      clock += dt > 0 ? dt : 0;
      if (flash > 0) flash = Math.max(0, flash - (dt > 0 ? dt : 0) * 0.5);
      while (later.length && later[0].at <= clock) later.shift().fn();
      const r = rec();
      // the lantern corals: touched in order while Marlo is trying to light the coral (step 5); a later walk of step 6 or 7 finds them lit
      if (catPos && r.step === M.STEP.tried && litNow() < M.LANTERN_COUNT) {
        const l = W.LANTERNS[litNow()];
        if (dist(catPos, l) < l.touch) touchLantern(litNow());
        else for (let i = litNow() + 1; i < W.LANTERNS.length; i++) { // a later coral first: a gentle nudge toward the right one, no fail
          if (dist(catPos, W.LANTERNS[i]) < W.LANTERNS[i].touch && clock - nudgeAt > 6) {
            nudgeAt = clock; nudged = litNow();
            say('reef-lantern-try' + litNow(), litNow() === 0 ? phrase('reef.lantern.try.0') : litNow() === 1 ? phrase('reef.lantern.try.1') : phrase('reef.lantern.try.2'));
          }
        }
      }
      let k = -1;
      if (par) {
        k = clock - par.t0;
        if (k >= PARADE.payAt) pay();
        if (k > PARADE.secs) { par = null; k = -1; }
      }
      placeParade(k);
      placeLanterns(t, catPos, k);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      par = null;
      for (const o of orbs) { scene.remove(o.orb, o.sp, o.beam); o.orb.geometry.dispose(); o.mat.dispose(); o.sp.material.dispose(); o.beam.geometry.dispose(); o.beam.material.dispose(); }
      for (const o of [manta, turtle, shoal]) {
        scene.remove(o);
        o.traverse?.((m) => { m.geometry?.dispose?.(); });
      }
      halo?.dispose();
      paint.dispose(); fishMat.dispose();
    },
  };
}
