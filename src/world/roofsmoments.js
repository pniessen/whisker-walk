// =============================================================================
// THE ROOFTOPS' MOMENTS (Rooftops step 5). Made by the area life
// (src/roofslife.js) where the place has its discoveries (area.anchors
// .discoveries), updated every frame after the flock, disposed with the life.
// Chunk code: start-up never imports it.
//
// FINDING (Task 4, R3). Every frame it reads her paws (catPos), her session's
// perch (session.perched) and how long she has stood still, and asks
// roofsfinds.js findAt which of the six she is at. A find not yet seen this
// walk is noted on her save (noteRoofsFind: the first time ever pays
// AWARDS.roofsfind and says its line; every walk counts once on its page, by
// the discovery log's key, so a walk picked up again counts nothing twice),
// then start(id) runs its once-a-walk part (Task 6); the looks below follow
// where she is every frame.
//   * Without a log or a progression (the picture pages) nothing is noted;
//     the moments still play.
//   * In a room each device runs its own walk, so each player is noted on her
//     own save, once.
//
// STILL. She is still while her paws stay within STILL_EPS of where she came
// to rest; a step further starts the count again from there. Measured from
// that spot rather than frame to frame, so a slow stalk never counts as still
// whatever the frame rate. A nap is still. Walk seconds only: no clock, no
// random stream.
//
// WHAT EACH LOOKS LIKE (Task 5). Three of the finds have a look of their own,
// and each follows where she is every frame, not her page: it plays the first
// time and on every later visit and walk (R2: the moment is the repeat
// pleasure). start(id) is only the once-a-walk hook (the loft's pigeon,
// Task 6).
//   * The telescope (R7): while she is perched on its crate the moon fills
//     the screen, a picture over the game (createMoonOverlay): in over
//     MOON_VIEW.fadeIn, held to MOON_VIEW.hold, out over .fadeOut, and out at
//     once when she hops down (moonOpacity). Under reduced motion it only
//     fades. No page (headless): no moon, and the rest runs on.
//   * The warm chimney (R6): once she has sat still there SIT seconds (the
//     find's own rule) its pot puffs a ring (roofsair.js createSmokeRing), then
//     one every RING.every while she stays still or naps (the nap rest
//     roofs-nap-2 is on the stack). Moving stops it.
//   * The vane (R8): stood still TOWER_VIEW.settle on the tower top, not
//     mid-hop, the camera eases round behind her to look out over the town
//     (towerView), blended over the follow camera player.update placed:
//     weight viewWeight eases toward 1 at TOWER_VIEW.rate per second, and
//     back to 0 when she moves. The blend is in angles round her (yaw the
//     short way, distance, height and pitch by lerp: viewBlend), never
//     turning faster than TOWER_BLEND.turn on top of the follow camera's own
//     turn, and it eases in only while the stick is not turning it.
//     Settled there, her own view heading (the context's `viewYaw`, walk.js:
//     player.viewYaw / setViewYaw) eases round to the view's at most
//     TOWER_TURN.rate, so the follow camera comes round with the blend (the
//     only way up ends climbing north, about 160 degrees from the view: fix
//     wave, I2). A turn of hers while settled wins: the turn and the blend
//     wait until she has left the camera alone TOWER_TURN.hold. Without a
//     `viewYaw` (the picture pages) the blend alone swings round her.
//     While the view is in, the vane (area.vane) fades out (vaneFade): she
//     stands just south of its mast, on the view's line of sight (fix wave,
//     I1); it is whole again as the view eases out.
//     Never more than max(the follow camera's own pitch, maxPitch) down, no
//     roll, no lens change; none at all under reduced motion.
//   * The garden and the loft have no extra look (their lights are the
//     build's; the loft's pigeon is Task 6). The skylight's look is always
//     there: the attic's painted pane under the glass (R9, createAtticPane),
//     made with the moments where there is a page, disposed with them.
// =============================================================================
import * as THREE from 'three';
import { findAt, noteRoofsFind } from './roofsfinds.js';
import { SKYLIGHT, SMOKE_POTS } from './roofsplan.js';
import { RING, createSmokeRing } from './roofsair.js';
import { withLocalUuids } from './localuuids.js';

export const STILL_EPS = 0.05; // m

// --- the view from the vane (R8) --------------------------------------------

export const TOWER_VIEW = Object.freeze({
  settle: 0.8, // s still on the tower top before it eases in
  rate: 1.6, // 1/s: how fast it eases in and out
  back: 2.4, // m behind her, away from the view (along the ground)
  up: 1.5, // m above her paws
  look: Object.freeze({ x: 8, y: 4, z: 30 }), // south over the terrace to the alley
  maxPitch: (18 * Math.PI) / 180, // never more than this far down
});
const TOWER_TOP = Object.freeze({ r: 1.6, dy: 0.4 }); // the tower top's disc, all of it, from the vane's anchor

// Where the view's camera is for her paws at `cat`, into outPos, and what it
// looks at, into outLook: TOWER_VIEW.back behind her on the far side from the
// look, TOWER_VIEW.up above her paws, looking at TOWER_VIEW.look, raised if
// need be so the look is never more than maxPitch down. Pure.
export function towerView(cat, outPos, outLook) {
  const L = TOWER_VIEW.look;
  const dx = L.x - cat.x;
  const dz = L.z - cat.z;
  const h = Math.hypot(dx, dz) || 1;
  outPos.x = cat.x - (dx / h) * TOWER_VIEW.back;
  outPos.y = cat.y + TOWER_VIEW.up;
  outPos.z = cat.z - (dz / h) * TOWER_VIEW.back;
  const lowest = outPos.y - (h + TOWER_VIEW.back) * Math.tan(TOWER_VIEW.maxPitch);
  outLook.x = L.x;
  outLook.y = Math.max(L.y, lowest);
  outLook.z = L.z;
  return outPos;
}

// How the view takes over from the follow camera (fix rounds 1 and 2): in
// angles round her, never in straight lines (which swing through her and
// look steeply down when the two cameras are on different sides of her).
// (The fix wave dropped the facing gate, 75 degrees: her view heading now
// turns round to the view, TOWER_TURN, so the blend eases in from any side.)
//   steady  the view eases in only while she is turning the camera slower
//           than this (her own turn: the follow camera's, less the moments'
//           own TOWER_TURN): the stick turning the camera lets the view go
//   turn    the most the blend itself turns the camera, per second, in or
//           out, on top of the follow camera's own turn
//   slack   how far past half a turn the two may drift apart before their
//           difference is taken the short way again (so two cameras on
//           opposite sides of her do not flip side every frame)
export const TOWER_BLEND = Object.freeze({
  steady: (20 * Math.PI) / 180,
  turn: (150 * Math.PI) / 180,
  slack: (15 * Math.PI) / 180,
});

// Her view heading turned round to the view's (fix wave, I2), on top of the blend:
//   rate  at most this, per second
//   hold  after a turn of hers while settled, the seconds she must leave the
//         camera alone before the turn (and the blend) go on
export const TOWER_TURN = Object.freeze({ rate: (45 * Math.PI) / 180, hold: 1.5 });

// The vane's opacity for the view's weight w (fix wave, I1): whole at 0,
// gone by 0.6. Pure.
export function vaneFade(w) {
  const k = Math.min(1, Math.max(0, (w - 0.15) / 0.45));
  return 1 - k * k * (3 - 2 * k);
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clampAbs = (v, m) => (v > m ? m : v < -m ? -m : v);

// A camera as seen from her paws: where it is round her (yaw, along-ground
// distance r, height h over her paws) and which way it looks (face yaw,
// pitch down). from() reads a camera; at() a spot and the point it looks at.
function orbit() {
  const d = new THREE.Vector3();
  const o = {
    yaw: 0, r: 0, h: 0, face: 0, pitch: 0,
    set(px, py, pz, dx, dy, dz, p) {
      o.yaw = Math.atan2(px - p.x, pz - p.z);
      o.r = Math.hypot(px - p.x, pz - p.z);
      o.h = py - p.y;
      o.face = Math.atan2(dx, dz);
      o.pitch = Math.atan2(-dy, Math.hypot(dx, dz));
      return o;
    },
    from(camera, p) {
      camera.getWorldDirection(d);
      return o.set(camera.position.x, camera.position.y, camera.position.z, d.x, d.y, d.z, p);
    },
    at(pos, look, p) {
      return o.set(pos.x, pos.y, pos.z, look.x - pos.x, look.y - pos.y, look.z - pos.z, p);
    },
  };
  return o;
}

// The blend of two orbits by weight w.
//   * The difference from the follow camera to the view, in yaw round her and
//     in face yaw, is the short way: it keeps last frame's side only while it
//     is within half a turn and `slack` (two cameras on opposite sides of her
//     never flip side), and is taken the short way again beyond that, so it
//     never winds up however the stick spins the follow camera.
//   * The camera's own yaws follow the follow camera plus w times that
//     difference, the short way, never faster than the follow camera's own
//     turn plus TOWER_BLEND.turn a second: when the difference is taken the
//     short way again, the camera swings there smoothly, never snaps.
//   * Distance, height and pitch blend by lerp, the pitch never more than the
//     follow camera's own or maxPitch, whichever is more. lookAt keeps the
//     camera level (no roll); the lens is never touched.
function viewBlend() {
  let on = false;
  let dYaw = null;
  let dFace = null;
  let yawC = 0;
  let faceC = 0;
  const short = (d, prev) => {
    if (prev === null) return d;
    const kept = d + 2 * Math.PI * Math.round((prev - d) / (2 * Math.PI));
    return Math.abs(kept) <= Math.PI + TOWER_BLEND.slack ? kept : d;
  };
  const look = new THREE.Vector3();
  const b = {
    get on() { return on; },
    reset() { on = false; dYaw = null; dFace = null; },
    // the larger of the two turns the whole blend makes (radians)
    span(a, t) {
      return Math.max(Math.abs(short(wrapAngle(t.yaw - a.yaw), dYaw)), Math.abs(short(wrapAngle(t.face - a.face), dFace)));
    },
    // turnYaw, turnFace: how far the follow camera itself turned this frame
    apply(a, t, w, p, camera, dt, turnYaw, turnFace) {
      if (!on) {
        if (w === 0) return;
        on = true;
        yawC = a.yaw;
        faceC = a.face;
      }
      dYaw = short(wrapAngle(t.yaw - a.yaw), dYaw);
      dFace = short(wrapAngle(t.face - a.face), dFace);
      const most = TOWER_BLEND.turn * dt;
      const goYaw = wrapAngle(a.yaw + dYaw * w - yawC);
      const goFace = wrapAngle(a.face + dFace * w - faceC);
      yawC += clampAbs(goYaw, Math.abs(turnYaw) + most);
      faceC += clampAbs(goFace, Math.abs(turnFace) + most);
      if (w === 0 && Math.abs(goYaw) <= Math.abs(turnYaw) + most && Math.abs(goFace) <= Math.abs(turnFace) + most) {
        b.reset(); // all the follow camera's again: leave it as player.update placed it
        return;
      }
      const r = a.r + (t.r - a.r) * w;
      const h = a.h + (t.h - a.h) * w;
      const pitch = Math.min(a.pitch + (t.pitch - a.pitch) * w, Math.max(a.pitch, TOWER_VIEW.maxPitch));
      camera.position.set(p.x + Math.sin(yawC) * r, p.y + h, p.z + Math.cos(yawC) * r);
      const c = Math.cos(pitch);
      look.set(Math.sin(faceC) * c, -Math.sin(pitch), Math.cos(faceC) * c).add(camera.position);
      camera.lookAt(look);
    },
  };
  return b;
}

// --- the moon through the telescope (R7) ------------------------------------

export const MOON_VIEW = Object.freeze({ fadeIn: 0.8, hold: 6, fadeOut: 0.8 });

// How much of the moon is on the screen: `onFor` the seconds she has been
// (or, once she is down, was) on the crate, `offFor` the seconds since she
// hopped down, or null while she is still on it. In over fadeIn, held until
// `hold` seconds after she got up, then out over fadeOut; from the moment she
// hops down, whatever is showing goes over fadeOut. 0..1. Pure.
export function moonOpacity(onFor, offFor = null) {
  const t = Math.max(0, onFor ?? 0);
  const up = t < MOON_VIEW.fadeIn ? t / MOON_VIEW.fadeIn : t < MOON_VIEW.hold ? 1 : Math.max(0, 1 - (t - MOON_VIEW.hold) / MOON_VIEW.fadeOut);
  if (offFor === null || offFor === undefined) return up;
  return up * Math.max(0, 1 - Math.max(0, offFor) / MOON_VIEW.fadeOut);
}

// The eyepiece: clear in the middle, a deep night blue at the edge (never
// black); the moon: a pale disc with five soft craters. CSS only: no image,
// no words (the toast says the line).
const EYEPIECE = 'radial-gradient(circle at 50% 50%, rgba(12, 18, 44, 0) 0, rgba(12, 18, 44, 0.2) 36vmin, rgba(12, 18, 44, 0.88) 56vmin)';
const CRATERS = [[34, 36, 11], [60, 30, 7], [56, 60, 13], [30, 64, 6], [72, 52, 5]];
const MOON_FACE = [
  ...CRATERS.map(([x, y, r]) => `radial-gradient(circle at ${x}% ${y}%, rgba(168, 164, 150, 0.55) 0, rgba(168, 164, 150, 0.3) ${r * 0.6}%, rgba(168, 164, 150, 0) ${r}%)`),
  'radial-gradient(circle at 42% 38%, #fdfaee 0, #ece7d2 55%, #d9d3bc 100%)',
].join(', ');

// The moon over the screen, made on `doc` (null with none: headless): a
// fixed, full-screen element straight after the game's canvas, pointer-events
// none and z-index 0 (fix round 1: #hud makes no stacking context, so its
// children without a z-index, the find toast among them, would be under a
// z-index 1 overlay; at 0 every later HUD element paints over it), so the HUD
// and its toasts stay over it and every tap goes through. show() starts it (again), hide()
// takes it out from wherever it is, update(dt) runs it; hidden (display
// none) at 0.
export function createMoonOverlay(doc, { reducedMotion = false } = {}) {
  if (!doc?.createElement) return null;
  const el = doc.createElement('div');
  const disc = doc.createElement('div');
  if (!el?.style || !disc?.style || !el.appendChild) return null; // a stand-in page with no styles
  Object.assign(el.style, {
    position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '0', display: 'none', opacity: '0', background: EYEPIECE, overflow: 'hidden',
  });
  el.setAttribute?.('aria-hidden', 'true');
  Object.assign(disc.style, {
    position: 'absolute', left: '50%', top: '50%', width: '70vmin', height: '70vmin', borderRadius: '50%',
    background: MOON_FACE, boxShadow: '0 0 7vmin rgba(255, 248, 220, 0.45)', transform: 'translate(-50%, -50%) scale(1)',
  });
  el.appendChild(disc);
  const canvas = doc.getElementById?.('game');
  if (canvas?.parentNode) canvas.parentNode.insertBefore(el, canvas.nextSibling ?? null);
  else doc.body?.appendChild(el);

  let onFor = null; // null: not showing
  let offFor = null;
  function draw() {
    const a = onFor === null ? 0 : moonOpacity(onFor, offFor);
    el.style.opacity = String(a);
    el.style.display = a > 0 ? 'block' : 'none';
    const k = reducedMotion || onFor === null ? 1 : 0.92 + 0.08 * Math.min(1, onFor / MOON_VIEW.fadeIn);
    disc.style.transform = `translate(-50%, -50%) scale(${+k.toFixed(4)})`;
  }
  return {
    el,
    get opacity() { return onFor === null ? 0 : moonOpacity(onFor, offFor); },
    show() {
      onFor = 0;
      offFor = null;
      draw();
    },
    hide() {
      if (onFor !== null && offFor === null) offFor = 0;
    },
    update(dt) {
      if (onFor === null) return;
      if (offFor === null) onFor += dt;
      else offFor += dt;
      if (offFor !== null && offFor >= MOON_VIEW.fadeOut) {
        onFor = null;
        offFor = null;
      }
      draw();
    },
    dispose() {
      el.remove?.();
    },
  };
}

// --- the attic's bedtime story (R9) -----------------------------------------

export const ATTIC = Object.freeze({ w: 128, h: 160, lift: 0.035, inset: 0.08 });

// The attic under the skylight, painted once on a 2D context `w` x `h`: warm
// lamplight, a grown-up in an armchair reading from a book, a child tucked up
// in bed, the lamp's glow. Silhouettes in deep warm browns, never black. The
// picture's top is the skylight's north end.
export function paintAttic(ctx, w, h) {
  const X = (u) => u * w;
  const Y = (v) => v * h;
  const wall = ctx.createLinearGradient(0, 0, 0, h);
  wall.addColorStop(0, '#f6cf8a');
  wall.addColorStop(1, '#e3a25e');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, w, h);
  // the floor
  ctx.fillStyle = '#c47e48';
  ctx.fillRect(0, Y(0.76), w, h - Y(0.76));
  // the lamp's glow, left of the chair
  const glow = ctx.createRadialGradient(X(0.22), Y(0.3), 2, X(0.22), Y(0.3), X(0.62));
  glow.addColorStop(0, 'rgba(255, 244, 196, 0.95)');
  glow.addColorStop(1, 'rgba(255, 244, 196, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  const ink = '#5e3a2a'; // the silhouettes: a deep warm brown
  // the standard lamp: a stem and a pale shade
  ctx.fillStyle = ink;
  ctx.fillRect(X(0.21), Y(0.3), X(0.025), Y(0.46));
  ctx.fillStyle = '#fff1c4';
  ctx.beginPath();
  ctx.moveTo(X(0.14), Y(0.31));
  ctx.lineTo(X(0.3), Y(0.31));
  ctx.lineTo(X(0.26), Y(0.22));
  ctx.lineTo(X(0.18), Y(0.22));
  ctx.closePath();
  ctx.fill();
  // the armchair, and the grown-up in it, reading
  ctx.fillStyle = ink;
  ctx.fillRect(X(0.3), Y(0.42), X(0.3), Y(0.34)); // the chair's back and seat
  ctx.fillRect(X(0.26), Y(0.56), X(0.07), Y(0.2)); // its arms
  ctx.fillRect(X(0.57), Y(0.56), X(0.07), Y(0.2));
  ctx.fillStyle = '#4e3022';
  ctx.beginPath();
  ctx.arc(X(0.45), Y(0.37), X(0.075), 0, Math.PI * 2); // the head
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(X(0.45), Y(0.53), X(0.12), Y(0.11), 0, 0, Math.PI * 2); // the shoulders and the body
  ctx.fill();
  ctx.fillStyle = '#fbeed0'; // the open book, catching the lamplight
  ctx.beginPath();
  ctx.moveTo(X(0.47), Y(0.5));
  ctx.lineTo(X(0.56), Y(0.47));
  ctx.lineTo(X(0.65), Y(0.5));
  ctx.lineTo(X(0.65), Y(0.56));
  ctx.lineTo(X(0.56), Y(0.53));
  ctx.lineTo(X(0.47), Y(0.56));
  ctx.closePath();
  ctx.fill();
  // the bed, and the child tucked up in it
  ctx.fillStyle = ink;
  ctx.fillRect(X(0.68), Y(0.5), X(0.3), Y(0.28)); // the bed, its head to the north
  ctx.fillRect(X(0.68), Y(0.44), X(0.04), Y(0.34)); // the headboard post
  ctx.fillStyle = '#f3e2c4'; // the pillow
  ctx.fillRect(X(0.73), Y(0.5), X(0.2), Y(0.07));
  ctx.fillStyle = '#4e3022';
  ctx.beginPath();
  ctx.arc(X(0.8), Y(0.52), X(0.055), 0, Math.PI * 2); // the child's head on it
  ctx.fill();
  ctx.fillStyle = '#b8604c'; // the blanket, pulled up
  ctx.fillRect(X(0.72), Y(0.57), X(0.24), Y(0.19));
  ctx.fillStyle = '#d27a62'; // its turned-down edge
  ctx.fillRect(X(0.72), Y(0.57), X(0.24), Y(0.025));
}

// The attic pane: one flat plane just over the skylight's glass, painted by
// paintAttic on a canvas from `doc` (null headless, or with no 2D context),
// MeshBasicMaterial with tone mapping off (it is lamplight), two triangles, no
// caster. Its canvas texture goes with the mesh (disposeAtticPane).
export function createAtticPane(scene, area, doc) {
  const at = area?.anchors?.discoveries?.skylight;
  if (!doc?.createElement || !scene?.add || !at) return null;
  const canvas = doc.createElement('canvas');
  canvas.width = ATTIC.w;
  canvas.height = ATTIC.h;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;
  paintAttic(ctx, ATTIC.w, ATTIC.h);
  const mesh = withLocalUuids('roofs-attic', () => {
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(SKYLIGHT.w - ATTIC.inset, SKYLIGHT.d - ATTIC.inset),
      // drawn over the lit window quad 5 mm under it: pulled forward so the two never fight
      new THREE.MeshBasicMaterial({ map, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    );
    m.name = 'roofsAttic';
    m.castShadow = false;
    m.receiveShadow = false;
    m.userData.noCast = true;
    m.rotation.x = -Math.PI / 2; // facing up; the picture's top to the north
    m.position.set(at.x, at.y + ATTIC.lift, at.z);
    return m;
  });
  scene.add(mesh);
  return mesh;
}

function disposeAtticPane(scene, mesh) {
  scene.remove(mesh);
  mesh.geometry.dispose();
  mesh.material.map?.dispose();
  mesh.material.dispose();
}

// --- the moments -------------------------------------------------------------

// createRoofsMoments(area, { log, progression, birds, scene, reducedMotion,
// doc, ring, viewYaw }) → { update(dt, catPos, camera, session), viewWeight,
// dispose() }. Finding reads only the log and the progression. `viewYaw`
// ({ get(), set(v) }: her view heading) is the tower view's to turn; without
// it the blend alone does the turning.
// The ring is made where there is a scene and the place has its pots
// (area.potTops); `ring` stands in for it (a test's). The moon and the pane
// are made where there is a page (`doc`).
export function createRoofsMoments(area, opts = {}) {
  const { log = null, progression = null, scene = null, reducedMotion = false, doc = null, birds = null } = opts;
  const turner = typeof opts.viewYaw?.get === 'function' && typeof opts.viewYaw?.set === 'function' ? opts.viewYaw : null;
  const anchors = area?.anchors?.discoveries ?? null;
  const found = new Set(); // this walk's
  const spot = { x: 0, y: 0, z: 0, perched: null, still: 0 };
  const rest = { x: 0, y: 0, z: 0, set: false };

  const pot = area?.potTops?.[SMOKE_POTS[0]] ?? null;
  const ring = opts.ring ?? (scene?.add && pot ? createSmokeRing(scene, pot, { reducedMotion }) : null);
  let ringClock = null; // seconds since the last puff; null while she is not sat by the stack

  const moon = createMoonOverlay(doc, { reducedMotion });
  let onCrate = false;

  const pane = createAtticPane(scene, area, doc);

  const top = anchors?.vane ?? null;
  let viewW = 0;
  const viewPos = new THREE.Vector3();
  const viewLook = new THREE.Vector3();
  const follow = orbit();
  const target = orbit();
  const blend = viewBlend();
  const last = { yaw: 0, face: 0, set: false }; // the follow camera's yaws last frame
  let ownYaw = null; // her view heading as the moments left it last frame (with a turner)
  let calmFor = TOWER_TURN.hold; // seconds since she last turned the camera while settled
  const vane = area?.vane?.material ? area.vane : null;
  let vaneAt = 1;
  function fadeVane(a) {
    if (!vane || a === vaneAt) return;
    vaneAt = a;
    vane.material.opacity = a;
    vane.material.depthWrite = a > 0.98;
    vane.visible = a > 0.02;
  }

  // A find's once-a-walk moment, the first time it is found this walk: at the
  // loft, one pigeon comes along with her for a while (Task 6, roofsbirds.js
  // follow).
  function start(id, p) {
    if (id === 'loft') birds?.follow?.(p);
  }

  function stillness(dt, p) {
    if (!rest.set || Math.hypot(p.x - rest.x, p.y - rest.y, p.z - rest.z) >= STILL_EPS) {
      rest.x = p.x;
      rest.y = p.y;
      rest.z = p.z;
      rest.set = true;
      spot.still = 0;
    } else {
      spot.still += dt;
    }
  }

  // the warm chimney: a ring as she settles, then one every RING.every, each
  // tilted toward the camera where it is at the puff
  function chimney(dt, here, camera) {
    if (here !== 'chimney') {
      ringClock = null;
      return;
    }
    if (ringClock === null) {
      ringClock = 0;
      ring?.puff(camera?.position ?? null);
    } else if ((ringClock += dt) >= RING.every - 1e-9) {
      ringClock -= RING.every;
      ring?.puff(camera?.position ?? null);
    }
  }

  // the telescope: the moon while she is perched on its crate
  function telescope(here) {
    const on = here === 'telescope';
    if (on && !onCrate) moon?.show();
    else if (!on && onCrate) moon?.hide();
    onCrate = on;
  }

  const onTop = (p) => !!top && Math.hypot(p.x - top.x, p.z - top.z) <= TOWER_TOP.r && Math.abs(p.y - top.y) <= TOWER_TOP.dy;

  // the vane: the view eases in over the follow camera player.update placed,
  // blended in angles round her (viewBlend), her view heading turned round
  // to the view's (TOWER_TURN), the vane faded while it is in (vaneFade)
  function view(dt, p, camera, session) {
    if (!camera) {
      viewW = 0;
      blend.reset();
      last.set = false;
      ownYaw = null;
      fadeVane(1);
      return;
    }
    towerView(p, viewPos, viewLook);
    follow.from(camera, p);
    target.at(viewPos, viewLook, p);
    // how far the follow camera itself turned since last frame
    const turnYaw = last.set ? wrapAngle(follow.yaw - last.yaw) : 0;
    const turnFace = last.set ? wrapAngle(follow.face - last.face) : 0;
    last.yaw = follow.yaw;
    last.face = follow.face;
    last.set = true;
    // her own turn of the camera: with a turner, how far her view heading
    // moved from where the moments left it; else the follow camera's turn
    const yawNow = turner ? turner.get() : null;
    const hers = Number.isFinite(yawNow) && ownYaw !== null ? wrapAngle(yawNow - ownYaw) : turnFace;
    const steady = Math.abs(hers) <= TOWER_BLEND.steady * dt + 1e-9;
    // in only while she is settled there and not turning the camera (a turn
    // of hers while settled holds it off TOWER_TURN.hold); out whenever she
    // is not settled there
    const settled = !reducedMotion && onTop(p) && spot.still >= TOWER_VIEW.settle && !session?.traversal?.busy;
    if (!settled) calmFor = TOWER_TURN.hold;
    else if (!steady) calmFor = 0;
    else calmFor += dt;
    const calm = settled && steady && calmFor >= TOWER_TURN.hold - 1e-9;
    // her view heading eases round to the view's, so the follow camera comes round too
    if (turner && Number.isFinite(yawNow)) {
      ownYaw = yawNow;
      if (calm) {
        ownYaw = yawNow + clampAbs(wrapAngle(target.yaw - yawNow), TOWER_TURN.rate * dt);
        if (ownYaw !== yawNow) turner.set(ownYaw);
      }
    } else ownYaw = null;
    const want = calm ? 1 : 0;
    let dw = (want - viewW) * Math.min(1, dt * TOWER_VIEW.rate);
    // the blend never turns faster than TOWER_BLEND.turn, however far apart the two are
    const span = Math.max(blend.span(follow, target), 1e-6);
    const most = (TOWER_BLEND.turn * dt) / span;
    if (Math.abs(dw) > most) dw = Math.sign(dw) * most;
    viewW += dw;
    if (want === 0 && viewW < 0.002) viewW = 0;
    else if (want === 1 && viewW > 0.998) viewW = 1;
    fadeVane(vaneFade(viewW));
    if (viewW === 0 && !blend.on) return;
    blend.apply(follow, target, viewW, p, camera, dt, turnYaw, turnFace);
  }

  return {
    get viewWeight() { return viewW; },
    update(dt, catPos = null, camera = null, session = null) {
      ring?.update(dt);
      moon?.update(dt);
      if (!catPos) return;
      stillness(dt, catPos);
      spot.x = catPos.x;
      spot.y = catPos.y;
      spot.z = catPos.z;
      spot.perched = session?.perched ?? null;
      const here = findAt(anchors, spot);
      chimney(dt, here, camera);
      telescope(here);
      view(dt, catPos, camera, session);
      if (!here || found.has(here)) return;
      found.add(here);
      if (log && progression) noteRoofsFind(here, { log, progression });
      start(here, catPos);
    },
    dispose() {
      found.clear();
      if (!opts.ring) ring?.dispose();
      moon?.dispose();
      if (pane) disposeAtticPane(scene, pane);
      vaneAt = null;
      fadeVane(1); // the vane whole again: opacity 1, depthWrite on, shown
    },
  };
}
