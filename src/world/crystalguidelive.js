// =============================================================================
// THE CRYSTAL CAVE'S WRITTEN GUIDE ON A WALK (the Reef's way, world/reefguidelive.js). Made once a walk by world/crystal.js; update(dt, t, catPos, camera) every frame. Small pieces of
// the page's own DOM (no mesh, no draw call, no texture), all reading ONE goal, lumi.goalNow() (the point the meow's ring and the stones' glints stand on), so the words, the
// arrow and the beacon always agree:
//   * THE GOAL LINE under the top row: what to do and where, in words (world/crystalguide.js goalWords). It changes the moment the goal does.
//   * THE EDGE ARROW: a small arrow at the screen's edge turning toward the goal as she turns, with the metres to the nearest 5. Hidden when the goal is on screen or within 8 m.
//     It only turns: nothing pulses, so reduced motion is the same.
//   * THE WORDS BESIDE LUMI'S PICTURE: a small chip next to her bubble whenever it shows ("Lumi needs a spark stone").
// The arrival card is world/crystalintro.js and the light column is the existing ring and glint: nothing is drawn twice. DOM only. Never saved, never sent, no random number.
// =============================================================================

import { onTv } from '../tvseam.js';
import { phrase } from '../clanphrases.js';
import { goalWords, chipWords, round5, makeView, viewOf, makeArrow, arrowFor, edgePoint, projectPoint } from './crystalguide.js';

export const LOOK_EVERY = 0.25; // s
export const WATCH_MS = 900; // ms without a frame (the walk is paused) before the guide hides itself
// the couch scale (the Moon's world/moontv.js tvScale, without the Moon's pad bar): on a TV the words are bigger, from the page's own font size
function tvScale(doc, win) {
  const el = doc?.documentElement;
  if (!el?.classList?.contains?.('tv')) return { tv: false, s: 1 };
  let px = NaN;
  try { px = parseFloat(win?.getComputedStyle?.(el)?.fontSize); } catch { /* none */ }
  return { tv: true, s: Number.isFinite(px) && px > 0 ? Math.min(3, Math.max(1, px / 24)) : 1 };
}
const AQUA = '#f4a6d0';
const INK = 'rgba(48,18,44,.88)';

export function createCrystalGuideLive(ctx) {
  const { doc, win, lumi, errand, progression } = ctx;
  const live = { text: '', lineOn: false, arrowOn: false, rel: 0, metres: 0, x: 0, y: 0, chip: '', chipOn: false, hidden: false };
  const els = { root: null, line: null, arrow: null, disc: null, tri: null, label: null, chip: null };
  if (!doc?.body || typeof doc.createElement !== 'function' || !lumi) return { state: live, els, update() {}, dispose() {}, look() {} };

  const make = (css) => { const e = doc.createElement('div'); Object.assign(e.style, css); return e; };
  const host = doc.getElementById?.('hud') ?? doc.body;
  const root = make({ position: 'absolute', left: '0', top: '0', right: '0', bottom: '0', pointerEvents: 'none', zIndex: '1', display: 'none' });
  root.setAttribute?.('data-crystal-guide', '1');
  const line = make({ position: 'absolute', margin: '0 auto', width: 'fit-content', textAlign: 'center', boxSizing: 'border-box', display: 'none', color: '#fff', fontWeight: '700', border: `2px solid ${AQUA}`, background: INK, textShadow: '0 1px 2px rgba(0,0,0,.6)' });
  line.setAttribute?.('role', 'status');
  line.setAttribute?.('aria-live', 'polite');
  const arrow = make({ position: 'absolute', left: '0', top: '0', width: '0', height: '0', display: 'none' });
  arrow.setAttribute?.('aria-hidden', 'true');
  const disc = make({ position: 'absolute', borderRadius: '50%', background: INK, border: `2px solid ${AQUA}`, boxSizing: 'border-box' });
  const tri = make({ position: 'absolute', width: '0', height: '0' });
  const label = make({ position: 'absolute', whiteSpace: 'nowrap', color: '#fff', fontWeight: '800', textShadow: '0 1px 3px rgba(0,0,0,.9), 0 0 6px rgba(0,0,0,.7)' });
  const chip = make({ position: 'absolute', left: '0', top: '0', display: 'none', whiteSpace: 'nowrap', color: '#10303f', background: 'rgba(255,255,255,.96)', fontWeight: '800', boxSizing: 'border-box' });
  chip.setAttribute?.('aria-hidden', 'true');
  arrow.appendChild(disc);
  arrow.appendChild(tri);
  arrow.appendChild(label);
  for (const e of [line, arrow, chip]) root.appendChild(e);
  host.appendChild(root);
  Object.assign(els, { root, line, arrow, disc, tri, label, chip });

  const view = makeView();
  const aOut = makeArrow();
  const eOut = { x: 0, y: 0 };
  const gOut = { x: 0, y: 0, z: 0 };
  const pOut = { ok: false, x: 0, y: 0, depth: 0 };
  const rect = { l: 0, t: 0, r: 0, b: 0 };
  let size = { W: win?.innerWidth || 960, H: win?.innerHeight || 540 };
  let U = { D: 44, font: 16, top: 64, edge: 28, touch: false, tv: false };
  let acc = LOOK_EVERY;
  let lastAt = Date.now();
  let shown = false;
  let disposed = false;
  let lineH = 0;
  let cat = null;
  let lastCam = null;
  let gp = null; // the goal as of the last look (four times a second): the arrow and the chip read it each frame
  const last = { deg: 1e9, x: 0, y: 0, m: 0, cx: 1e9, cy: 0, flip: 0, a: 0 };

  const css = (e, o) => Object.assign(e.style, o);
  function layout() {
    if (disposed) return;
    const sc = tvScale(doc, win);
    size = { W: win?.innerWidth || 960, H: win?.innerHeight || 540 };
    const tv = sc.tv;
    const s = sc.s;
    const touch = !!doc.body?.classList?.contains?.('touch-mode');
    const narrow = size.W <= 520;
    const f = tv ? 28 * s : narrow || touch ? 14 : 16;
    const D = tv ? 64 * s : touch ? 40 : 46;
    const a = tv ? 15 * s : touch ? 10 : 12;
    U = { font: f, D, top: tv ? size.H * 0.05 + 76 * s : narrow ? 16 + (touch ? 110 : 150) + 34 : 64, edge: tv ? size.W * 0.05 + 40 * s : 30, touch, tv };
    const pad = (k) => `${Math.round(f * k * 0.3)}px ${Math.round(f * k * 0.8)}px`;
    css(line, {
      top: tv ? 'calc(var(--tv-s, 1) * 76px)' : narrow ? 'calc(max(16px, env(safe-area-inset-top)) + var(--map-size, 110px) + 34px)' : 'calc(max(16px, env(safe-area-inset-top)) + 48px)',
      left: tv ? '0' : 'max(16px, env(safe-area-inset-left))',
      right: tv ? 'calc(var(--map-size, 220px) + 12px)' : narrow ? 'max(16px, env(safe-area-inset-right))' : 'calc(max(16px, env(safe-area-inset-right)) + var(--map-size, 150px) + 12px)',
      fontSize: `${f}px`, lineHeight: '1.28', padding: pad(1), borderRadius: `${f}px`,
    });
    css(disc, { width: `${D}px`, height: `${D}px`, left: `${-D / 2}px`, top: `${-D / 2}px` });
    css(tri, { left: `${-a}px`, top: `${-a * 0.8}px`, borderLeft: `${a}px solid transparent`, borderRight: `${a}px solid transparent`, borderBottom: `${a * 1.6}px solid ${AQUA}` });
    css(label, { fontSize: `${f - 2}px`, top: `${D / 2 + 3}px`, transform: 'translateX(-50%)' });
    css(chip, { fontSize: `${f}px`, lineHeight: '1.2', padding: pad(1), borderRadius: `${f}px`, border: `2px solid ${AQUA}` });
    last.deg = 1e9; last.cx = 1e9;
  }

  function show(on) {
    if (on === shown) return;
    shown = on;
    root.style.display = on ? 'block' : 'none';
    live.hidden = !on;
  }

  const stepOf = () => progression?.state?.crystal?.step ?? 0;
  const dist = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
  // the story is told, the errand was on offer when the walk began and is not done yet
  const errandWaits = () => stepOf() >= 7 && !!errand?.state?.eligible && !errand.state.done;

  // ---- the goal line (four times a second) ----------------------------------------------------------------------------------------------
  function look() {
    if ((win?.innerWidth || 960) !== size.W || (win?.innerHeight || 540) !== size.H) layout();
    gp = lumi.goalNow();
    if (lastCam) viewOf(lastCam, view);
    const text = goalWords({ goal: gp, cat, fx: view.fx, fz: view.fz, metres: cat ? dist(cat, gp) : 0, step: stepOf(), errand: errandWaits() });
    if (text !== live.text) {
      live.text = text;
      line.textContent = text;
      line.style.display = text ? 'block' : 'none';
      live.lineOn = !!text;
      lineH = 0;
    } else if (text && !lineH && line.offsetHeight) lineH = line.offsetHeight;
    show(true);
  }

  // ---- the arrow and the chip (each frame) ---------------------------------------------------------------------------------------------
  function paintArrow(on, rel, x, y, metres) {
    if (!on) { if (live.arrowOn) { arrow.style.display = 'none'; live.arrowOn = false; } return; }
    live.rel = rel; live.x = x; live.y = y;
    const deg = Math.round((rel * 180) / Math.PI);
    const px = Math.round(x);
    const py = Math.round(y);
    if (deg === last.deg && px === last.x && py === last.y && metres === last.m && live.arrowOn) return;
    last.deg = deg; last.x = px; last.y = py; last.m = metres;
    if (!live.arrowOn) { arrow.style.display = 'block'; live.arrowOn = true; }
    arrow.style.transform = `translate(${px}px,${py}px)`;
    tri.style.transform = `rotate(${deg}deg)`;
    if (live.metres !== metres) { label.textContent = `${metres} m`; live.metres = metres; }
  }
  function arrowRect() {
    const H = size.H;
    const W = size.W;
    const top = U.top + (lineH || line.offsetHeight || U.font * 1.28 + 14) + 12 + U.D / 2;
    rect.l = U.edge + U.D / 2;
    rect.r = W - U.edge - U.D / 2 - (U.touch && H < 500 ? 190 : 0);
    rect.t = top;
    rect.b = Math.max(top + U.D, U.tv ? H * 0.7 : U.touch ? H - 300 : H * 0.72 - 20);
    return rect;
  }
  function frameArrow(catPos, camera) {
    // no arrow when there is nothing to do (the story is told and no errand waits)
    if (!gp || !catPos || !camera || !live.text) return paintArrow(false);
    viewOf(camera, view);
    gOut.x = gp.x; gOut.y = gp.y + 1.2; gOut.z = gp.z;
    arrowFor(view, catPos, gOut, aOut);
    if (!aOut.show) return paintArrow(false);
    edgePoint(aOut.rel, arrowRect(), eOut);
    const mapW = U.touch ? 110 : 150;
    const mapB = (U.tv ? size.H * 0.05 : 16) + mapW + 30 + U.D / 2; // the corner map is in the top right: sit under it
    if (eOut.x > size.W - U.edge - mapW - U.D && eOut.y < mapB) eOut.y = mapB;
    return paintArrow(true, aOut.rel, eOut.x, eOut.y, Math.max(5, round5(aOut.dist)));
  }
  function frameChip(camera) {
    const sp = lumi.bubble?.sprite;
    const text = sp?.visible && camera && gp ? chipWords(gp.g, errandWaits()) : '';
    if (!text) { if (live.chipOn) { chip.style.display = 'none'; live.chipOn = false; live.chip = ''; last.cx = 1e9; } return; }
    viewOf(camera, view);
    projectPoint(view, sp.position.x, sp.position.y, sp.position.z, size.W, size.H, pOut);
    let x = size.W / 2;
    let y = size.H * 0.3;
    let flip = false;
    if (pOut.ok) {
      const half = (0.35 / (pOut.depth * 2 * view.tanV)) * size.H;
      const w = chip.offsetWidth || text.length * U.font * 0.56 + U.font * 1.4;
      x = pOut.x + half + 6;
      y = pOut.y - half * 0.35;
      if (x + w > size.W - U.edge) { flip = true; x = pOut.x - half - 6; }
      if (x - (flip ? w : 0) < 16) x = 16 + (flip ? w : 0);
    }
    const cx = Math.round(x);
    const cy = Math.round(y);
    const al = Math.round(Math.max(0, Math.min(1, sp.material?.opacity ?? 1)) * 20);
    if (cx === last.cx && cy === last.cy && (flip ? 1 : 0) === last.flip && al === last.a && text === live.chip && live.chipOn) return;
    last.cx = cx; last.cy = cy; last.flip = flip ? 1 : 0; last.a = al;
    if (text !== live.chip) { chip.textContent = text; live.chip = text; }
    if (!live.chipOn) { chip.style.display = 'block'; live.chipOn = true; }
    chip.style.transform = `translate(${cx}px,${cy}px) translate(${flip ? '-100%' : '0'},-50%)`;
    chip.style.opacity = String(al / 20);
  }

  layout();
  const offTv = onTv?.(layout);
  const watch = win?.setInterval?.(() => { if (!disposed && Date.now() - lastAt > WATCH_MS) show(false); }, 500);

  return {
    state: live,
    els,
    look,
    update(dt, t, catPos, camera) {
      if (disposed) return;
      lastAt = Date.now();
      cat = catPos ?? cat;
      lastCam = camera ?? lastCam;
      acc += dt > 0 ? dt : 0;
      if (acc >= LOOK_EVERY) { acc = 0; look(); } else if (!shown) show(true);
      frameArrow(catPos, camera);
      frameChip(camera);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { offTv?.(); } catch { /* none */ }
      if (watch !== undefined && watch !== null) win?.clearInterval?.(watch);
      root.remove?.();
    },
  };
}
