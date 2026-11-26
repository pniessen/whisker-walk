// =============================================================================
// MARLO AND CHAPTER ONE ON A WALK (milestone R2). The little hermit crab, the two shells of chapter 1, the coral ledge, the first air pockets and the
// meow's ring of bubbles, all drawn here and run by the pure rules (src/reefmission.js for the steps, world/reefstory.js for the places and his moves).
//   * MARLO waves on the sand by the ladder; the Interact button says hello (step 1). Then he follows her at a shy distance and waits. His
//     talk is a picture over his head (a shell, a question mark, a heart), never text; the words below are only the toast line beside it.
//   * THE SHELLS: the too-small one in the Kelp Garden (walk the sand, find the glint), the too-big one on the coral ledge, 1.4 m up (float to it).
//     Interact picks one up (one at a time, in her mouth in front of her, like the Moon's power cells; it is the story's own item and never touches
//     the walk's mouth, so it never goes to the den); Interact beside Marlo gives it. A carried shell is NEVER SAVED: however a walk ends (leaving
//     through the arch, a resume, a warm bubble's lift, the cat's own end), the next walk finds it at its own spot, and nothing is lost.
//   * SHELL THREE (milestone R5): the just-right one lies in the shallow cave behind the coral, ringed by an air pocket; given to Marlo, he steps into it by himself a
//     moment later (step 5, the wobble), his old shell comes off and is left as a sea snail's home. The lantern corals and the parade are world/reefhouse.js's.
//   * THE MEOW calls him: he shows the next goal's picture and a ring of bubbles rises where it is (a column over the spot, a trail from him). No fail.
//   * THE AIR POCKETS: columns of bubbles; swimming into one fills the gauge (the life says how); one gives its air again after a while.
// Draws no random number and reads no clock of its own (the walk's dt only).
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as M from '../reefmission.js';
import * as S from './reefstory.js';
import * as K from './reefparts.js';
import { reefY } from './reefplan.js';
import { LANTERNS, SNAIL_HOME } from './reefwing.js';

export const RING = Object.freeze({ secs: 6, bubble: 4, points: 30 });
export const TRYON = Object.freeze({ near: 4.5, wait: 1.8 }); // seconds after shell three is given (and she is near) before he steps into it // how long the meow's ring and the picture stay
export const GLINT = Object.freeze({ color: 0xfff2c0, size: 0.55 });
const COLORS = Object.freeze({
  marlo: 0xf08a4b, marloDark: 0xc4622f, eye: 0x1c2a30, white: 0xf2efe6, crack: 0x4a3a30, old: 0xd9c8a8,
  small: 0xf4a6c0, smallDark: 0xd9809e, big: 0x9e8be8, bigDark: 0x7864c8, right: 0x7fd6c2, rightDark: 0x3fa890, snail: 0xd9b27a, ledge: 0xc4622f, ledgeTop: 0xe8c34a,
});
const PAGE_OF_EFFECT = Object.freeze({ third: 'rfshells', lit: 'rflanterns', parade: 'rfparade' });
const ICON_BY_KIND = Object.freeze({ question: 'question', shell: 'shell', heart: 'heart' });
const smooth = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
// ('greenhousenote' is the whole-sentence, no-points toast type the start-up HUD already knows.)

// ---- the ledge (static, drawn with the seabed's kit by world/reef.js) -------------------------------------------------------
export function drawLedge(kit, M2) {
  const { x, z, r, h } = S.LEDGE;
  const col = (rt, rb, hh, y0, hex) => K.at(K.paint(new THREE.CylinderGeometry(rt, rb, hh, 10, 1), hex), x, z, y0 + hh / 2);
  kit.put('paint', M2.paint, col(r * 0.92, r * 1.25, h + 0.4, -0.4, COLORS.ledge));
  kit.put('paint', M2.paint, col(r * 1.02, r * 0.92, 0.16, h - 0.16, COLORS.ledgeTop));
  for (const [dx, dz, s] of [[-0.55, 0.3, 0.3], [0.5, -0.45, 0.24], [0.1, 0.7, 0.2]]) {
    kit.put('paint', M2.paint, K.at(K.paint(new THREE.SphereGeometry(s, 7, 5), COLORS.ledgeTop), x + dx, z + dz, h + 0.02, 0));
  }
}

// The old shell: a cone with a dark crack (the same geometry whether it sits on his back or as the sea snail's home).
function makeOldShell(M2) {
  const parts = [];
  const put = (geo, hex, x, y, z, rx) => { geo.rotateX(rx); geo.translate(x, y, z); parts.push(K.paint(geo, hex)); };
  put(new THREE.ConeGeometry(0.17, 0.34, 7), COLORS.old, 0, 0.36, -0.1, -0.5);
  put(new THREE.BoxGeometry(0.02, 0.2, 0.02), COLORS.crack, 0.05, 0.38, -0.02, -0.5);
  return new THREE.Mesh(mergeGeometries(parts), M2.paint);
}

// The sea snail's home: the old shell on the sand with a small sleepy snail beside it (one mesh; shown once Marlo has tried the new shell on).
function makeSnailHome(M2) {
  const g = new THREE.Group();
  g.name = 'reef:snailhome';
  const old = makeOldShell(M2);
  old.scale.setScalar(2.2);
  const parts = [];
  const body = new THREE.SphereGeometry(0.1, 7, 5); body.scale(1.6, 0.7, 1); body.translate(0.05, 0.07, 0.42); parts.push(K.paint(body, COLORS.snail));
  for (const sx of [-1, 1]) { const eye = new THREE.SphereGeometry(0.025, 4, 3); eye.translate(sx * 0.05, 0.19, 0.48); parts.push(K.paint(eye, COLORS.eye)); }
  const snail = new THREE.Mesh(mergeGeometries(parts), M2.paint);
  snail.name = 'reef:snail';
  for (const m of [old, snail]) { m.castShadow = false; m.receiveShadow = false; Object.assign(m.userData, { noMerge: true, noCast: true, noContactShadow: true }); }
  g.add(old, snail);
  g.visible = false;
  return g;
}

// ---- Marlo ------------------------------------------------------------------------------------------------------------------
function makeMarlo(M2) {
  const g = new THREE.Group();
  g.name = 'reef:marlo';
  const parts = [];
  const put = (geo, hex, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0) => {
    if (rx) geo.rotateX(rx);
    geo.scale(sx, sy, sz);
    geo.translate(x, y, z);
    parts.push(K.paint(geo, hex));
  };
  put(new THREE.SphereGeometry(0.2, 8, 6), COLORS.marlo, 0, 0.2, 0.06, 1.1, 0.75, 1.25); // the body
  for (const s of [-1, 1]) {
    put(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 4), COLORS.marloDark, s * 0.07, 0.36, 0.2); // an eye stalk
    put(new THREE.SphereGeometry(0.04, 5, 4), COLORS.eye, s * 0.07, 0.45, 0.21); // an eye
    for (const k of [0, 1, 2]) put(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 3), COLORS.marloDark, s * 0.2, 0.08, 0.02 + k * 0.1, 1, 1, 1, 0); // legs
    put(new THREE.SphereGeometry(0.075, 6, 4), COLORS.marlo, s * 0.19, 0.12, 0.3, 1, 0.8, 1.2); // a claw on the ground
  }
  const body = new THREE.Mesh(mergeGeometries(parts), M2.paint);
  body.name = 'reef:marlo:body';
  // the waving claw (a separate small mesh turned by the life): one sphere on a short arm, held up
  const claw = new THREE.Mesh(K.paint(new THREE.SphereGeometry(0.085, 6, 4), COLORS.marlo), M2.paint);
  claw.name = 'reef:marlo:claw';
  claw.position.set(0.2, 0.3, 0.28);
  // his old, cracked shell on his back: a cone with a dark crack, too small for him now (its own mesh: it comes off when he tries the new one on, and is left as a sea snail's home)
  const old = makeOldShell(M2);
  old.position.set(0, 0, 0);
  old.name = 'reef:marlo:old';
  for (const m of [body, claw, old]) { m.castShadow = false; m.receiveShadow = false; m.userData.noMerge = true; m.userData.noCast = true; m.userData.noContactShadow = true; }
  g.add(body, claw, old);
  g.userData.claw = claw;
  g.userData.old = old;
  g.scale.setScalar(1.35);
  return g;
}

// ---- a shell ------------------------------------------------------------------------------------------------------------------
function makeShell(id, M2) {
  const big = id === 1;
  const right = id === 2;
  const hex = right ? COLORS.right : big ? COLORS.big : COLORS.small;
  const dark = right ? COLORS.rightDark : big ? COLORS.bigDark : COLORS.smallDark;
  const parts = [];
  const cone = new THREE.ConeGeometry(0.2, 0.5, 8); cone.rotateX(Math.PI / 2 + 0.25); cone.translate(0, 0.14, -0.08);
  parts.push(K.paint(cone, hex));
  const whorl = new THREE.SphereGeometry(0.19, 8, 6); whorl.scale(1, 0.85, 1.05); whorl.translate(0, 0.16, 0.1);
  parts.push(K.paint(whorl, dark));
  const lip = new THREE.TorusGeometry(0.11, 0.035, 5, 8); lip.translate(0, 0.16, 0.27);
  parts.push(K.paint(lip, COLORS.white));
  const mesh = new THREE.Mesh(mergeGeometries(parts), M2.paint);
  mesh.name = `reef:shell${id}`;
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.userData.noMerge = true; mesh.userData.noCast = true; mesh.userData.noContactShadow = true;
  const g = new THREE.Group();
  g.name = `reef:shellgroup${id}`;
  g.add(mesh);
  g.userData.base = right ? 1.05 : big ? 1.55 : 0.8; // the too-big shell is big, the too-small one small, the just-right one between
  g.scale.setScalar(g.userData.base);
  return g;
}

function glintTexture() {
  const doc = globalThis.document;
  const cv = doc?.createElement?.('canvas');
  const g = cv?.getContext?.('2d');
  if (!g) return null;
  cv.width = cv.height = 64;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,244,200,.7)'); grd.addColorStop(1, 'rgba(255,244,200,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Marlo's picture over his head: one emoji in a round white bubble.
function makeBubble() {
  const doc = globalThis.document;
  const cv = doc?.createElement?.('canvas');
  const g = cv?.getContext?.('2d') ? cv : null;
  if (g) cv.width = cv.height = 128;
  const tex = g ? new THREE.CanvasTexture(cv) : null;
  if (tex) tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, fog: false });
  const sprite = new THREE.Sprite(mat);
  sprite.name = 'reef:marlo:bubble';
  sprite.scale.set(0.75, 0.75, 1);
  sprite.visible = false;
  sprite.userData.noMerge = true; sprite.userData.noCast = true;
  let shown = null;
  return {
    sprite,
    get icon() { return shown; },
    show(name) {
      shown = name;
      if (!g) return;
      const c = cv.getContext('2d');
      c.clearRect(0, 0, 128, 128);
      c.fillStyle = 'rgba(255,255,255,.96)';
      c.beginPath(); c.arc(64, 60, 52, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(44, 100); c.lineTo(64, 126); c.lineTo(80, 98); c.fill();
      c.font = '64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#000';
      c.fillText(S.BUBBLE_ICON[ICON_BY_KIND[name] ?? 'heart'], 64, 64);
      tex.needsUpdate = true;
    },
    dispose() { tex?.dispose(); mat.dispose(); },
  };
}

function pointsOf(n, size, color, opacity) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.PointsMaterial({ size, sizeAttenuation: true, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  p.visible = false;
  p.userData.noMerge = true; p.userData.noCast = true; p.userData.noContactShadow = true;
  return p;
}

// createMarlo(ctx) -> { promptAt, interact, credit, update, goal, state, dispose }
// ctx: { scene, progression, audio, reducedMotion, pocket: () => boolean (the life fills the gauge; true when it did), colliders }
export function createMarlo(ctx) {
  const { scene, reducedMotion = false } = ctx;
  const progression = ctx.progression ?? null;
  const audio = ctx.audio ?? null;
  const colliders = ctx.colliders ?? S.marloColliders();
  const M2 = K.reefMaterials();
  const rec = () => M.normalize(progression?.state?.reef);

  let clock = 0;
  let disposed = false;
  let target = null; // what the action button would do now
  let carrying = null; // the shell in her mouth: 0, 1 or null (NEVER saved)
  let meowed = false;
  let ringT = -100;
  let bubbleT = -100;
  let wobble = -100; // when a shell was tried on (the sigh)
  let lit = 0; // the lantern corals glowing on this walk (never saved; world/reefhouse.js sets it)
  let tryT = 0; // seconds she has waited near Marlo with shell three given
  let goalCur = null;
  let goalAt = -100;
  const told = new Set();
  const marlo = { x: S.MARLO.start.x, z: S.MARLO.start.z, yaw: Math.PI, moving: false, chasing: false };
  const home = { ...marlo };

  const group = makeMarlo(M2);
  const shells = S.STORY_SHELLS.map((s) => makeShell(s.id, M2));
  const glints = S.STORY_SHELLS.map(() => null);
  const gtex = glintTexture();
  S.STORY_SHELLS.forEach((s, i) => {
    const mat = new THREE.SpriteMaterial({ map: gtex, color: GLINT.color, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
    const sp = new THREE.Sprite(mat);
    sp.name = `reef:glint${i}`;
    sp.scale.setScalar(GLINT.size);
    sp.userData.noMerge = true; sp.userData.noCast = true;
    glints[i] = sp;
  });
  const snail = makeSnailHome(M2);
  snail.position.set(SNAIL_HOME.x, reefY(SNAIL_HOME.x, SNAIL_HOME.z), SNAIL_HOME.z);
  snail.rotation.y = 0.7;
  const bubble = makeBubble();
  const ring = pointsOf(RING.points, 0.2, 0xcff8ff, 0.9);
  ring.name = 'reef:meowRing';
  const pockets = pointsOf(S.POCKETS.length * 8, 0.26, 0xfff0d0, 0.85);
  pockets.name = 'reef:pockets';
  pockets.visible = true;
  const pocketLeft = S.POCKETS.map(() => 0); // seconds until a pocket has air again
  for (const o of [group, snail, ...shells, ...glints, bubble.sprite, ring, pockets]) scene.add(o);

  const shellMode = (i) => (M.shellBrought(progression?.state?.reef, i) ? 'given' : carrying === i ? 'carried' : 'home');
  const marloAt = () => ({ x: marlo.x, z: marlo.z });
  const wanted = () => M.wantedShell(progression?.state?.reef);

  // The goal now: where the meow's ring rises and which picture Marlo shows. { g: { kind, shell?, icon }, x, z, y }
  function goalPoint() {
    const g = M.nextGoal(progression?.state?.reef, carrying, lit);
    if (g.kind === 'shell') {
      const s = S.STORY_SHELLS[g.shell];
      return { g, x: s.x, z: s.z, y: reefY(s.x, s.z) + s.y };
    }
    if (g.kind === 'lantern') {
      const l = LANTERNS[g.lantern];
      return { g, x: l.x, z: l.z, y: reefY(l.x, l.z) + 0.4 };
    }
    return { g, x: marlo.x, z: marlo.z, y: reefY(marlo.x, marlo.z) };
  }
  const goal = () => (goalCur ?? (goalCur = goalPoint()));

  function commit(next) {
    const pr = progression;
    if (!pr?.state) return;
    pr.state.reef = { ...(pr.state.reef ?? {}), step: next.step, shells: next.shells };
    pr.addPoints?.(0); // the save's own "persist now": it adds nothing
  }
  function perform(ev, { remote = false } = {}) {
    const r = remote ? M.credit(progression?.state?.reef, ev) : M.apply(progression?.state?.reef, ev);
    if (!r.changed) return null;
    commit(r.reef);
    goalCur = null;
    const page = PAGE_OF_EFFECT[r.effect];
    if (page) { try { progression?.recordSighting?.(page); } catch { /* a stand-in save */ } } // the journal's activity pages (ids in src/reefpages.js)
    return r.effect;
  }
  function showBubble(kind) { bubble.show(kind); bubbleT = clock; }
  function callMarlo() {
    const gp = goal();
    ringT = clock;
    showBubble(gp.g.icon);
    audio?.chime?.();
    if (!told.has('hint-' + gp.g.kind)) {
      told.add('hint-' + gp.g.kind);
      if (gp.g.kind === 'shell' && gp.g.shell === 1) say('reef-shell-float', phrase('reef.shell.float'));
      else if (gp.g.kind === 'shell' && gp.g.shell === 2) say('reef-shell-cave', phrase('reef.shell.cave'));
      else if (gp.g.kind === 'lantern') say('reef-lantern-hint', phrase('reef.lantern.hint'));
      else if (gp.g.kind === 'shell') say('reef-shell-find', phrase('reef.shell.find'));
    }
  }
  const offMeow = bus.on('tip:did', (e) => { if (e && e.id === 'call') meowed = true; });

  // ---- the action button -------------------------------------------------------------------------------------------------------
  function decide(catPos, lift) {
    if (disposed || !catPos) return null;
    const r = rec();
    if (r.step < M.STEP.met && dist(catPos, marlo) < S.MARLO.reach) return { kind: 'meet', line: phrase('reef.marlo.prompt') };
    if (carrying !== null && dist(catPos, marlo) < S.MARLO.give) return { kind: 'give', shell: carrying, line: phrase('reef.marlo.give') };
    if (carrying === null && wanted() >= 0) {
      const s = S.STORY_SHELLS[wanted()];
      if (dist(catPos, s) < s.reach && M.reachable({ minLift: s.minLift }, lift)) return { kind: 'pick', shell: s.id, line: phrase('reef.shell.prompt') };
    }
    if (r.step >= M.STEP.lit && ctx.onParade && !ctx.paradeOn?.() && dist(catPos, marlo) < S.MARLO.reach) {
      return { kind: 'parade', line: r.step >= M.STEP.done ? phrase('reef.parade.replay') : phrase('reef.parade.prompt') };
    }
    return null;
  }

  // ---- placing things each frame ---------------------------------------------------------------------------------------------
  function placeShell(i, t, catPos, session) {
    const s = S.STORY_SHELLS[i];
    const mode = shellMode(i);
    const g = shells[i];
    let x = s.x; let z = s.z; let y = reefY(s.x, s.z) + s.y;
    let scale = g.userData.base;
    if (mode === 'carried' && catPos) {
      const yaw = session?.cat?.rotation?.y ?? 0;
      x = catPos.x + Math.sin(yaw) * 0.5; z = catPos.z + Math.cos(yaw) * 0.5; y = catPos.y + 0.18;
      scale *= 0.8;
    } else if (mode === 'given' && i === 2 && rec().step >= M.STEP.tried) {
      // tried on: the just-right shell sits on his back (his old one is the sea snail's home now)
      const h = group.scale.x;
      x = marlo.x - Math.sin(marlo.yaw) * 0.12 * h; z = marlo.z - Math.cos(marlo.yaw) * 0.12 * h; y = reefY(marlo.x, marlo.z) + 0.3 * h;
      scale *= 0.42;
    } else if (mode === 'given') {
      x = marlo.x + (i === 0 ? -0.55 : 0.55); z = marlo.z - 0.25; y = reefY(x, z);
      scale *= 0.7;
    } else if (!reducedMotion) y += 0.04 * Math.sin(t * 1.6 + i);
    g.position.set(x, y, z);
    g.rotation.y = mode === 'home' ? (reducedMotion ? 0.6 : t * 0.35 + i) : (session?.cat?.rotation?.y ?? 0);
    g.scale.setScalar(scale);
    const gl = glints[i];
    gl.visible = mode === 'home' && wanted() === i;
    if (gl.visible) {
      gl.position.set(x, y + 0.45, z);
      gl.material.opacity = reducedMotion ? 0.75 : 0.45 + 0.4 * Math.sin(t * 3.1 + i * 2);
    }
  }

  function placePockets(t) {
    const pos = pockets.geometry.attributes.position;
    let k = 0;
    S.POCKETS.forEach((p, i) => {
      for (let j = 0; j < 8; j++, k++) {
        if (pocketLeft[i] > 0) { pos.setXYZ(k, p.x, -50, p.z); continue; }
        const ph = reducedMotion ? j / 8 : ((t * 0.35 + j / 8) % 1);
        const a = j * 2.4 + i;
        pos.setXYZ(k, p.x + Math.cos(a) * 0.35 * (0.4 + ph), reefY(p.x, p.z) + 0.2 + ph * S.POCKET.height, p.z + Math.sin(a) * 0.35 * (0.4 + ph));
      }
    });
    pos.needsUpdate = true;
  }

  function placeRing(t, catPos) {
    const rk = clock - ringT;
    if (rk < 0 || rk >= RING.secs) { ring.visible = false; return; }
    const gp = goal();
    const fade = smooth(rk / 0.4) * (1 - smooth((rk - (RING.secs - 1.2)) / 1.2));
    ring.material.opacity = 0.9 * fade;
    ring.visible = true;
    const pos = ring.geometry.attributes.position;
    let k = 0;
    const bob = reducedMotion ? 0 : t * 1.4;
    for (let i = 0; i < 12; i++, k++) { // a ring of bubbles round the goal
      const a = (i / 12) * Math.PI * 2 + bob * 0.4;
      pos.setXYZ(k, gp.x + Math.cos(a) * 0.9, gp.y + 0.35 + (reducedMotion ? 0 : 0.12 * Math.sin(bob * 2 + i)), gp.z + Math.sin(a) * 0.9);
    }
    for (let i = 0; i < 8; i++, k++) { // a column of them over it (so it shows from far)
      const ph = reducedMotion ? i / 8 : ((bob * 0.25 + i / 8) % 1);
      pos.setXYZ(k, gp.x + 0.1 * Math.sin(i * 2), gp.y + 0.3 + ph * 2.4, gp.z + 0.1 * Math.cos(i * 2));
    }
    const sx = catPos ? catPos.x : marlo.x; const sz = catPos ? catPos.z : marlo.z;
    const dx = gp.x - sx; const dz = gp.z - sz;
    const dd = Math.hypot(dx, dz) || 1;
    for (let i = 0; k < RING.points; i++, k++) { // a trail from her toward it
      const along = Math.min(dd, 1.6 + i * 1.3);
      pos.setXYZ(k, sx + (dx / dd) * along, reefY(sx + (dx / dd) * along, sz + (dz / dd) * along) + 0.5 + (reducedMotion ? 0 : 0.15 * Math.sin(bob * 2 + i)), sz + (dz / dd) * along);
    }
    pos.needsUpdate = true;
  }

  return {
    get state() { return { clock, carrying, marlo: { ...marlo }, record: rec(), shellModes: S.STORY_SHELLS.map((s) => shellMode(s.id)), bubble: bubble.icon, pocketLeft: pocketLeft.slice() }; },
    get marlo() { return marlo; },
    get group() { return group; },
    get shells() { return shells; },
    get bubble() { return bubble; },
    goalNow: goalPoint,
    goal,
    promptAt(catPos, lift = 0) {
      target = decide(catPos, lift);
      return target ? target.line : null;
    },
    interact() {
      if (!target || disposed) return null;
      const t = target;
      target = null;
      goalCur = null;
      if (t.kind === 'meet') {
        if (perform({ kind: 'meet' })) {
          audio?.chime?.();
          showBubble('shell');
          say('reef-marlo-met', phrase('reef.marlo.met'));
        }
      } else if (t.kind === 'pick') {
        carrying = t.shell;
        audio?.chime?.();
        say('reef-shell-got', phrase('reef.shell.got'));
        showBubble('heart');
      } else if (t.kind === 'give') {
        const id = t.shell;
        carrying = null;
        const effect = perform({ kind: 'bring', shell: id });
        wobble = clock;
        audio?.chime?.();
        if (effect === 'small') { say('reef-shell-small', phrase('reef.marlo.small')); showBubble('question'); }
        else if (effect === 'big') { say('reef-shell-big', phrase('reef.marlo.big')); showBubble('heart'); }
        else if (effect === 'third') { say('reef-shell-third', phrase('reef.marlo.third')); showBubble('heart'); tryT = 0; }
      } else if (t.kind === 'parade') {
        ctx.onParade?.();
      }
      return t.kind;
    },
    // the housewarming's own steps (the lantern corals lit, the parade paid) go through the same machine and the same save; world/reefhouse.js asks
    perform: (ev) => perform(ev),
    setLit(n) { lit = Number.isInteger(n) ? Math.max(0, Math.min(M.LANTERN_COUNT, n)) : 0; goalCur = null; },
    get lit() { return lit; },
    // a step done by anyone in the room: the same effects as her own; the shell she was holding is gone from her mouth if it was the one just brought
    credit(ev) {
      const effect = perform(ev, { remote: true });
      if (!effect) return null;
      if (carrying !== null && M.shellBrought(progression?.state?.reef, carrying)) carrying = null;
      if (effect === 'lit') lit = M.LANTERN_COUNT;
      wobble = clock;
      return effect;
    },
    update(dt, t, catPos = null, camera = null, session = null, lift = 0) {
      if (disposed) return;
      const step = dt > 0 ? dt : 0;
      clock += step;
      const r = rec();
      const near = catPos ? dist(catPos, marlo) : 1e9;

      // Marlo: waits until met, then follows; a shell for him in her mouth brings him close
      if (catPos) S.marloStep(marlo, catPos, step, { follow: r.step >= M.STEP.met, eager: carrying !== null, colliders });
      else marlo.moving = false;
      if (catPos && !told.has('seen') && r.step < M.STEP.met && near < S.MARLO.seen) { told.add('seen'); showBubble('heart'); say('reef-marlo-hello', phrase('reef.marlo.hello')); }
      const wob = clock - wobble < 1.4 && !reducedMotion ? Math.sin((clock - wobble) * 14) * 0.25 * (1 - (clock - wobble) / 1.4) : 0;
      const bobY = marlo.moving && !reducedMotion ? 0.03 * Math.abs(Math.sin(clock * 12)) : 0;
      group.position.set(marlo.x, reefY(marlo.x, marlo.z) + bobY, marlo.z);
      group.rotation.y = marlo.yaw + wob;
      const claw = group.userData.claw;
      if (claw) {
        const wave = reducedMotion ? 0 : (r.step < M.STEP.met || near < 6 ? Math.sin(clock * 6) * 0.35 : 0);
        claw.position.y = 0.3 + 0.06 * Math.sin(wave * 3);
        claw.rotation.z = wave;
      }
      group.visible = !catPos || near < 60;

      // shell three is given: a moment later (she is near and waiting) he steps into it, by himself
      if (r.step === M.STEP.third && carrying === null && catPos && near < TRYON.near) {
        tryT += step;
        if (tryT >= TRYON.wait && perform({ kind: 'tryon' })) {
          wobble = clock; tryT = 0;
          audio?.chime?.();
          showBubble('heart');
          say('reef-marlo-tried', phrase('reef.marlo.tried'));
        }
      } else tryT = 0;
      const rr = rec();
      const old = group.userData.old;
      if (old) old.visible = rr.step < M.STEP.tried;
      snail.visible = rr.step >= M.STEP.tried;
      if (!M.lanternsLit(lit) && rr.step >= M.STEP.lit) lit = M.LANTERN_COUNT;

      for (let i = 0; i < shells.length; i++) placeShell(i, t, catPos, session);

      // the first hint about the ledge: once a walk, when she comes near it for the second shell and is still on the sand
      if (catPos && r.step === M.STEP.small && carrying === null && !told.has('ledge') && dist(catPos, S.SHELLS[1]) < 7) {
        told.add('ledge');
        say('reef-shell-float', phrase('reef.shell.float'));
      }

      // the meow: Marlo shows the next picture and the ring rises
      if (meowed) { meowed = false; callMarlo(); }

      // the picture over his head
      const bk = clock - bubbleT;
      if (bk >= 0 && bk < RING.bubble) {
        bubble.sprite.visible = true;
        bubble.sprite.position.set(marlo.x, reefY(marlo.x, marlo.z) + 1.15 + (reducedMotion ? 0 : 0.05 * Math.sin(t * 4)), marlo.z);
        bubble.sprite.material.opacity = smooth(bk / 0.25) * (1 - smooth((bk - (RING.bubble - 0.6)) / 0.6));
      } else bubble.sprite.visible = false;

      placeRing(t, catPos);

      // the air pockets
      for (let i = 0; i < pocketLeft.length; i++) {
        if (pocketLeft[i] > 0) pocketLeft[i] = Math.max(0, pocketLeft[i] - step);
        else if (catPos && Math.hypot(catPos.x - S.POCKETS[i].x, catPos.z - S.POCKETS[i].z) < S.POCKET.r) {
          if (ctx.pocket?.() !== false) pocketLeft[i] = S.POCKET.again;
        }
      }
      placePockets(t);
      if (clock - goalAt > 0.5) { goalCur = null; goalAt = clock; }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      offMeow?.();
      carrying = null; // a shell in her mouth when the walk ends is not kept: the next walk finds it at its own spot
      bubble.dispose();
      gtex?.dispose();
      for (const o of [group, snail, ...shells, ...glints, bubble.sprite, ring, pockets]) {
        scene.remove(o);
        o.traverse?.((m) => {
          m.geometry?.dispose?.();
          if (m.material && m.material !== bubble.sprite.material) m.material.dispose?.();
        });
      }
      M2.paint.dispose?.(); M2.glow.dispose?.();
    },
  };
}
