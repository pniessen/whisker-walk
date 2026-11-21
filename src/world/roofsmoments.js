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
//     (towerView), blended over the follow camera as fairlive.js blends a
//     ride's: weight viewWeight eases toward 1 at TOWER_VIEW.rate per second,
//     and back to 0 when she moves. Never more than maxPitch down, no roll, no
//     lens change; none at all under reduced motion.
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
// fixed, full-screen element just over the game's canvas, pointer-events
// none and z-index 1, so the HUD and its toasts (2 and up, src/style.css)
// stay over it and every tap goes through. show() starts it (again), hide()
// takes it out from wherever it is, update(dt) runs it; hidden (display
// none) at 0.
export function createMoonOverlay(doc, { reducedMotion = false } = {}) {
  if (!doc?.createElement) return null;
  const el = doc.createElement('div');
  const disc = doc.createElement('div');
  if (!el?.style || !disc?.style || !el.appendChild) return null; // a stand-in page with no styles
  Object.assign(el.style, {
    position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '1', display: 'none', opacity: '0', background: EYEPIECE, overflow: 'hidden',
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

// createRoofsMoments(area, { log, progression, hud, birds, scene,
// reducedMotion, doc, ring }) → { update(dt, catPos, camera, session),
// viewWeight, dispose() }. Finding reads only the log and the progression.
// The ring is made where there is a scene and the place has its pots
// (area.potTops); `ring` stands in for it (a test's). The moon and the pane
// are made where there is a page (`doc`).
export function createRoofsMoments(area, opts = {}) {
  const { log = null, progression = null, scene = null, reducedMotion = false, doc = null } = opts;
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
  const look = new THREE.Vector3();

  // A find's once-a-walk moment, the first time it is found this walk (Task 6).
  function start(_id) {}

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

  // the warm chimney: a ring as she settles, then one every RING.every
  function chimney(dt, here) {
    if (here !== 'chimney') {
      ringClock = null;
      return;
    }
    if (ringClock === null) {
      ringClock = 0;
      ring?.puff();
    } else if ((ringClock += dt) >= RING.every - 1e-9) {
      ringClock -= RING.every;
      ring?.puff();
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

  // the vane: the view eases in over the follow camera player.update placed
  function view(dt, p, camera, session) {
    const want = camera && !reducedMotion && onTop(p) && spot.still >= TOWER_VIEW.settle && !session?.traversal?.busy ? 1 : 0;
    viewW += (want - viewW) * Math.min(1, dt * TOWER_VIEW.rate);
    if (want === 0 && viewW < 0.002) viewW = 0;
    else if (want === 1 && viewW > 0.998) viewW = 1;
    if (viewW === 0 || !camera) return;
    // where the follow camera looks: along its own direction, as far off as she is
    camera.getWorldDirection(look);
    look.multiplyScalar(Math.max(0.5, camera.position.distanceTo(p))).add(camera.position);
    towerView(p, viewPos, viewLook);
    camera.position.lerp(viewPos, viewW);
    look.lerp(viewLook, viewW);
    camera.lookAt(look);
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
      chimney(dt, here);
      telescope(here);
      view(dt, catPos, camera, session);
      if (!here || found.has(here)) return;
      found.add(here);
      if (log && progression) noteRoofsFind(here, { log, progression });
      start(here);
    },
    dispose() {
      found.clear();
      if (!opts.ring) ring?.dispose();
      moon?.dispose();
      if (pane) disposeAtticPane(scene, pane);
    },
  };
}
