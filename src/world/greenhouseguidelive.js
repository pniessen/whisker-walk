// =============================================================================
// THE GREENHOUSE'S WRITTEN GUIDE ON A WALK (the Moon's and the Reef's way). Made once a walk by world/greenhouse.js around the life; update(dt, t, catPos, camera) every frame.
// ONE goal (world/greenhouseguide.js goalOf, read four times a second from the life's own state) feeds three things:
//   * a gold ring on the ground at the goal (the Moon's ring: one flat additive ring, no light, culled by the view like any mesh; it grows with the distance so the court's
//     far bench is a visible mark; it breathes unless reduced motion, which holds it still);
//   * THE GOAL LINE under the top row (what to do, with the count);
//   * THE EDGE ARROW with the metres to the nearest 5: shown only when the goal is off screen and more than 8 m away; it only turns, so reduced motion is the same.
// The DOM is small pieces of the page's own (no draw call, no texture) and exists only in this lazy chunk. Never saved, never sent, no random number.
// =============================================================================

import * as THREE from 'three';
import { onTv } from '../tvseam.js';
import { goalOf, goalWords, round5, makeView, viewOf, makeArrow, arrowFor, edgePoint, OFFER_R } from './greenhouseguide.js';
import * as P from './greenhouseplan.js';
import { withLocalUuids } from './localuuids.js';

export const LOOK_EVERY = 0.25; // s
export const WATCH_MS = 500; // ms between looks: a look with no frame since the last one (the walk is paused) hides the guide (a frame counter, no clock)
export const RING_NEAR = 80; // m: the ring is drawn within this
const GOLD = '#ffd45a';
const INK = 'rgba(40,34,10,.88)';

function tvScale(doc, win) {
  const el = doc?.documentElement;
  if (!el?.classList?.contains?.('tv')) return { tv: false, s: 1 };
  let px = NaN;
  try { px = parseFloat(win?.getComputedStyle?.(el)?.fontSize); } catch { /* none */ }
  return { tv: true, s: Number.isFinite(px) && px > 0 ? Math.min(3, Math.max(1, px / 24)) : 1 };
}

// ctx: { scene, ground, life (createGreenhouseLife's), doc, win, reducedMotion }
export function createGreenhouseGuideLive(ctx) {
  const { scene, life, doc, win, reducedMotion = false } = ctx;
  const ground = ctx.ground ?? { y: () => 0 };
  const live = { text: '', lineOn: false, arrowOn: false, rel: 0, metres: 0, x: 0, y: 0, hidden: false, goal: null, ringOn: false };
  const els = { root: null, line: null, arrow: null, disc: null, tri: null, label: null };

  const ring = withLocalUuids('greenhouse-goalring', () => new THREE.Mesh(new THREE.RingGeometry(0.85, 1.12, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd45a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: true, forceSinglePass: true })));
  ring.name = 'ghGoalRing';
  ring.visible = false; ring.castShadow = false; ring.receiveShadow = false; ring.userData.noMerge = true; ring.userData.noCast = true;
  scene?.add(ring);

  let arrived = false;
  let gp = null;
  let cat = null;
  let lastCam = null;
  let acc = LOOK_EVERY;
  let frames = 0;
  let seenFrames = 0;
  let shown = false;
  let disposed = false;
  let lineH = 0;
  const view = makeView();
  const aOut = makeArrow();
  const eOut = { x: 0, y: 0 };
  const gOut = { x: 0, y: 0, z: 0 };
  const rect = { l: 0, t: 0, r: 0, b: 0 };
  let size = { W: win?.innerWidth || 960, H: win?.innerHeight || 540 };
  let U = { D: 44, font: 16, top: 64, edge: 28, touch: false, tv: false };
  const last = { deg: 1e9, x: 0, y: 0, m: 0 };
  let line = null; let arrow = null; let tri = null; let label = null; let root = null; let offTv = null; let watch;
  const css = (e, o) => Object.assign(e.style, o);

  const hasDom = !!(doc?.body && typeof doc.createElement === 'function');
  if (hasDom) {
    const make = (c) => { const e = doc.createElement('div'); Object.assign(e.style, c); return e; };
    const host = doc.getElementById?.('hud') ?? doc.body;
    root = make({ position: 'absolute', left: '0', top: '0', right: '0', bottom: '0', pointerEvents: 'none', zIndex: '1', display: 'none' });
    root.setAttribute?.('data-greenhouse-guide', '1');
    line = make({ position: 'absolute', margin: '0 auto', width: 'fit-content', textAlign: 'center', boxSizing: 'border-box', display: 'none', color: '#fff', fontWeight: '700', border: `2px solid ${GOLD}`, background: INK, textShadow: '0 1px 2px rgba(0,0,0,.6)' });
    line.setAttribute?.('role', 'status');
    line.setAttribute?.('aria-live', 'polite');
    arrow = make({ position: 'absolute', left: '0', top: '0', width: '0', height: '0', display: 'none' });
    arrow.setAttribute?.('aria-hidden', 'true');
    const disc = make({ position: 'absolute', borderRadius: '50%', background: INK, border: `2px solid ${GOLD}`, boxSizing: 'border-box' });
    tri = make({ position: 'absolute', width: '0', height: '0' });
    label = make({ position: 'absolute', whiteSpace: 'nowrap', color: '#fff', fontWeight: '800', textShadow: '0 1px 3px rgba(0,0,0,.9), 0 0 6px rgba(0,0,0,.7)' });
    arrow.appendChild(disc); arrow.appendChild(tri); arrow.appendChild(label);
    root.appendChild(line); root.appendChild(arrow);
    host.appendChild(root);
    Object.assign(els, { root, line, arrow, disc, tri, label });
  }

  function layout() {
    if (disposed || !hasDom) return;
    const sc = tvScale(doc, win);
    size = { W: win?.innerWidth || 960, H: win?.innerHeight || 540 };
    const tv = sc.tv; const s = sc.s;
    const touch = !!doc.body?.classList?.contains?.('touch-mode');
    const narrow = size.W <= 520;
    const f = tv ? 28 * s : narrow || touch ? 14 : 16;
    const D = tv ? 64 * s : touch ? 40 : 46;
    const a = tv ? 15 * s : touch ? 10 : 12;
    U = { font: f, D, top: tv ? size.H * 0.05 + 76 * s : narrow ? 16 + (touch ? 110 : 150) + 34 : 64, edge: tv ? size.W * 0.05 + 40 * s : 30, touch, tv };
    css(line, {
      top: tv ? 'calc(var(--tv-s, 1) * 76px)' : narrow ? 'calc(max(16px, env(safe-area-inset-top)) + var(--map-size, 110px) + 34px)' : 'calc(max(16px, env(safe-area-inset-top)) + 48px)',
      left: tv ? '0' : 'max(16px, env(safe-area-inset-left))',
      right: tv ? 'calc(var(--map-size, 220px) + 12px)' : narrow ? 'max(16px, env(safe-area-inset-right))' : 'calc(max(16px, env(safe-area-inset-right)) + var(--map-size, 150px) + 12px)',
      fontSize: `${f}px`, lineHeight: '1.28', padding: `${Math.round(f * 0.3)}px ${Math.round(f * 0.8)}px`, borderRadius: `${f}px`,
    });
    css(els.disc, { width: `${D}px`, height: `${D}px`, left: `${-D / 2}px`, top: `${-D / 2}px` });
    css(tri, { left: `${-a}px`, top: `${-a * 0.8}px`, borderLeft: `${a}px solid transparent`, borderRight: `${a}px solid transparent`, borderBottom: `${a * 1.6}px solid ${GOLD}` });
    css(label, { fontSize: `${f - 2}px`, top: `${D / 2 + 3}px`, transform: 'translateX(-50%)' });
    last.deg = 1e9;
  }
  function show(on) {
    if (on === shown) return;
    shown = on;
    if (root) root.style.display = on ? 'block' : 'none';
    live.hidden = !on;
  }

  const packetsOf = () => (life.meshes?.packets ?? []).map((m) => ({ x: m.position.x, z: m.position.z, visible: m.visible }));
  const potsOf = () => (life.meshes?.clouds ?? []).map((m) => ({ x: m.position.x, z: m.position.z, visible: m.visible }));
  function look() {
    if (hasDom && ((win?.innerWidth || 960) !== size.W || (win?.innerHeight || 540) !== size.H)) layout();
    const g = cat ? goalOf({ state: life.state, packets: packetsOf(), pots: potsOf(), cat, arrived }) : null;
    gp = g ? { ...g, y: ground.y(g.x, g.z) } : null;
    live.goal = gp;
    if (lastCam) viewOf(lastCam, view);
    const text = g ? goalWords(g, { cat, fx: view.fx, fz: view.fz }) : '';
    if (text !== live.text) {
      live.text = text;
      if (line) { line.textContent = text; line.style.display = text ? 'block' : 'none'; }
      live.lineOn = !!text;
      lineH = 0;
    } else if (text && !lineH && line?.offsetHeight) lineH = line.offsetHeight;
    show(true);
  }

  function paintArrow(on, rel, x, y, metres) {
    if (!on) { if (live.arrowOn) { if (arrow) arrow.style.display = 'none'; live.arrowOn = false; } return; }
    live.rel = rel; live.x = x; live.y = y;
    const deg = Math.round((rel * 180) / Math.PI);
    const px = Math.round(x); const py = Math.round(y);
    if (deg === last.deg && px === last.x && py === last.y && metres === last.m && live.arrowOn) return;
    last.deg = deg; last.x = px; last.y = py; last.m = metres;
    live.arrowOn = true;
    if (!arrow) { live.metres = metres; return; }
    arrow.style.display = 'block';
    arrow.style.transform = `translate(${px}px,${py}px)`;
    tri.style.transform = `rotate(${deg}deg)`;
    if (live.metres !== metres) { label.textContent = `${metres} m`; live.metres = metres; }
  }
  function arrowRect() {
    const top = U.top + (lineH || line?.offsetHeight || U.font * 1.28 + 14) + 12 + U.D / 2;
    rect.l = U.edge + U.D / 2;
    rect.r = size.W - U.edge - U.D / 2 - (U.touch && size.H < 500 ? 190 : 0);
    rect.t = top;
    rect.b = Math.max(top + U.D, U.tv ? size.H * 0.7 : U.touch ? size.H - 300 : size.H * 0.72 - 20);
    return rect;
  }
  function frameArrow(catPos, camera) {
    if (!gp || !catPos || !camera || !live.text) return paintArrow(false);
    viewOf(camera, view);
    gOut.x = gp.x; gOut.y = gp.y + 1.2; gOut.z = gp.z;
    arrowFor(view, catPos, gOut, aOut);
    if (!aOut.show) return paintArrow(false);
    edgePoint(aOut.rel, arrowRect(), eOut);
    const mapW = U.touch ? 110 : 150;
    const mapB = (U.tv ? size.H * 0.05 : 16) + mapW + 30 + U.D / 2;
    if (eOut.x > size.W - U.edge - mapW - U.D && eOut.y < mapB) eOut.y = mapB;
    return paintArrow(true, aOut.rel, eOut.x, eOut.y, Math.max(5, round5(aOut.dist)));
  }
  function frameRing(catPos, t) {
    if (!gp || !catPos) { ring.visible = false; live.ringOn = false; return; }
    const d = Math.hypot(catPos.x - gp.x, catPos.z - gp.z);
    live.ringOn = ring.visible = d < RING_NEAR;
    ring.position.set(gp.x, gp.y + 0.06, gp.z);
    const k = Math.min(3.2, Math.max(1, 0.9 + d / 12)); // far away it is a bigger mark, so the bench shows across the court
    ring.scale.setScalar(reducedMotion ? k : k * (1 + 0.1 * Math.sin(t * 3)));
    ring.material.opacity = reducedMotion ? 0.7 : 0.55 + 0.2 * Math.sin(t * 5);
  }

  layout();
  if (hasDom) { offTv = onTv?.(layout); watch = win?.setInterval?.(() => { if (!disposed) { if (frames === seenFrames) show(false); seenFrames = frames; } }, WATCH_MS); }

  return {
    state: live,
    els,
    ring,
    look,
    update(dt, t, catPos, camera) {
      if (disposed) return;
      frames++;
      cat = catPos ?? cat;
      lastCam = camera ?? lastCam;
      if (cat && !arrived && Math.hypot(cat.x - P.POTTING.x, cat.z - P.POTTING.z) < OFFER_R) arrived = true;
      acc += dt > 0 ? dt : 0;
      if (acc >= LOOK_EVERY) { acc = 0; look(); } else if (!shown) show(true);
      frameArrow(catPos, camera);
      frameRing(catPos, t);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { offTv?.(); } catch { /* none */ }
      if (watch !== undefined && watch !== null) win?.clearInterval?.(watch);
      root?.remove?.();
      scene?.remove(ring);
      ring.geometry.dispose();
      ring.material.dispose();
    },
  };
}
