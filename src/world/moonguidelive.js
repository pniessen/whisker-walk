// =============================================================================
// THE MOON'S WRITTEN GUIDE ON A WALK (guide cues). Made once a walk by world/moonlife.js; update(dt, t, catPos, camera) every frame. Three small pieces of
// the page's own DOM (no mesh, no draw call, no texture), all reading ONE goal, base.goal() (world/moonbaselive.js: the same point the gold ring and the
// light column stand on), so the words, the arrow and the beacon always agree:
//   * THE GOAL LINE under the top row, left of the corner map, where the daily goals sit on other places (the Moon has none): what to do and where, in words
//     (world/moonguide.js goalWords). It stays up for the whole walk and changes the moment the goal does.
//   * THE EDGE ARROW: a small arrow at the screen's edge turning toward the goal as she turns, with the metres to the nearest 5 ("40 m"). Hidden when the
//     goal is on screen or within 8 m. It only turns: nothing pulses, so reduced motion is the same.
//   * THE WORDS BESIDE PIP'S PICTURE: a small chip next to his bubble whenever it shows ("Pip needs a power cell").
// Everything steps aside while a page (telescope, stamp picker, binoculars) is open, the launch plays, the Core's wake-up beat or Earth's finale plays, and
// while the walk is paused (the walk stops calling this life: a watchdog hides the DOM). Sizes follow the couch scale (world/moontv.js): 28 px words and
// 5 % safe margins on a TV. The goal line is looked at four times a second; the arrow and the chip are moved each frame without building anything but
// one short style string when they have really moved. Never saved, never sent, no random number; the only clock is the watchdog's.
// =============================================================================

import * as M from './moonmission.js';
import { onTv } from '../tvseam.js';
import { tvScale } from './moontv.js';
import { FINALE_LENGTH } from './moondeeplive.js';
import { goalWords, chipWords, round5, makeView, viewOf, makeArrow, arrowFor, edgePoint, projectPoint } from './moonguide.js';

export const LOOK_EVERY = 0.25; // s: the goal line, the pages and the quiet times are looked at this often
export const WATCH_MS = 900; // ms without a frame (the walk is paused) before the guide hides itself
const GOLD = '#ffd45a';
const INK = 'rgba(20,26,38,.86)';

export function createGuideLive(ctx) {
  const { doc, win, base, job, launch, star, deep, rover, progression } = ctx;
  const live = { text: '', lineOn: false, arrowOn: false, rel: 0, metres: 0, x: 0, y: 0, chip: '', chipOn: false, quiet: false, hidden: false, font: 0 };
  const els = { root: null, line: null, arrow: null, disc: null, tri: null, label: null, chip: null };
  if (!doc?.body || typeof doc.createElement !== 'function' || !base) return { state: live, els, update() {}, dispose() {}, look() {} };

  const make = (css) => { const e = doc.createElement('div'); Object.assign(e.style, css); return e; };
  const host = doc.getElementById?.('hud') ?? doc.body;
  const root = make({ position: 'absolute', left: '0', top: '0', right: '0', bottom: '0', pointerEvents: 'none', zIndex: '1', display: 'none' });
  root.setAttribute?.('data-moon-guide', '1');
  const line = make({ position: 'absolute', margin: '0 auto', width: 'fit-content', textAlign: 'center', boxSizing: 'border-box', display: 'none', color: '#fff', fontWeight: '700', border: `2px solid ${GOLD}`, background: INK, textShadow: '0 1px 2px rgba(0,0,0,.6)' });
  line.setAttribute?.('role', 'status');
  line.setAttribute?.('aria-live', 'polite');
  const arrow = make({ position: 'absolute', left: '0', top: '0', width: '0', height: '0', display: 'none' });
  arrow.setAttribute?.('aria-hidden', 'true');
  const disc = make({ position: 'absolute', borderRadius: '50%', background: INK, border: `2px solid ${GOLD}`, boxSizing: 'border-box' });
  const tri = make({ position: 'absolute', width: '0', height: '0' });
  const label = make({ position: 'absolute', whiteSpace: 'nowrap', color: '#fff', fontWeight: '800', textShadow: '0 1px 3px rgba(0,0,0,.9), 0 0 6px rgba(0,0,0,.7)' });
  const chip = make({ position: 'absolute', left: '0', top: '0', display: 'none', whiteSpace: 'nowrap', color: '#1f2a3d', background: 'rgba(255,255,255,.96)', fontWeight: '800', boxSizing: 'border-box' });
  chip.setAttribute?.('aria-hidden', 'true');
  arrow.appendChild(disc);
  arrow.appendChild(tri);
  arrow.appendChild(label);
  root.appendChild(line);
  root.appendChild(arrow);
  root.appendChild(chip);
  host.appendChild(root);
  Object.assign(els, { root, line, arrow, disc, tri, label, chip });

  const view = makeView();
  const aOut = makeArrow();
  const eOut = { x: 0, y: 0 };
  const gOut = { x: 0, y: 0, z: 0 };
  const pOut = { ok: false, x: 0, y: 0, depth: 0 };
  const rect = { l: 0, t: 0, r: 0, b: 0 };
  const rec = () => M.normalize(progression?.state?.moon);
  const sc = { v: tvScale(doc, win) };
  let size = { W: win?.innerWidth || 960, H: win?.innerHeight || 540 };
  let U = { D: 44, tri: 11, font: 16, label: 14, chip: 17, top: 64, side: 16, edge: 28, mapW: 150 };
  let acc = LOOK_EVERY;
  let lastAt = Date.now();
  let quiet = false;
  let shown = false;
  let disposed = false;
  let lineH = 0;
  let badgeTop = null;
  const last = { deg: 1e9, x: 0, y: 0, m: 0, cx: 1e9, cy: 0, flip: 0, a: 0, text: '' }; // what the arrow and the chip were last drawn at: nothing is built while they stand still

  // ---- sizes: phone, laptop, TV --------------------------------------------------------------------------------------------------------
  function layout() {
    if (disposed) return;
    sc.v = tvScale(doc, win);
    size = { W: win?.innerWidth || 960, H: win?.innerHeight || 540 };
    const tv = sc.v.tv;
    const s = sc.v.s;
    const touch = !!doc.body?.classList?.contains?.('touch-mode');
    const narrow = size.W <= 520;
    const f = tv ? 28 * s : narrow ? 14 : touch ? 14 : 16;
    U = {
      font: f, label: tv ? 26 * s : 14, chip: tv ? 26 * s : touch ? 15 : 17, D: tv ? 64 * s : touch ? 40 : 46, tri: tv ? 15 * s : touch ? 10 : 12,
      top: tv ? size.H * 0.05 + 76 * s : narrow ? 16 + (touch ? 110 : 150) + 34 : 64, side: tv ? size.W * 0.05 : 16, edge: tv ? size.W * 0.05 + 40 * s : 30, mapW: tv ? Math.min(220 * s, size.W * 0.36) : touch ? 110 : 150, touch, tv, s,
    };
    live.font = f;
    Object.assign(line.style, {
      // beside the corner map, where the daily goals sit on other places; on a narrow phone (the band beside the map is 236 px) under the map instead, the full width, so two lines hold the longest
      top: tv ? 'calc(var(--tv-s, 1) * 76px)' : narrow ? 'calc(max(16px, env(safe-area-inset-top)) + var(--map-size, 110px) + 34px)' : 'calc(max(16px, env(safe-area-inset-top)) + 48px)',
      left: tv ? '0' : 'max(16px, env(safe-area-inset-left))',
      right: tv ? 'calc(var(--map-size, 220px) + 12px)' : narrow ? 'max(16px, env(safe-area-inset-right))' : 'calc(max(16px, env(safe-area-inset-right)) + var(--map-size, 150px) + 12px)',
      fontSize: `${f}px`, lineHeight: '1.28', padding: `${Math.round(f * 0.28)}px ${Math.round(f * 0.8)}px`, borderRadius: `${Math.round(f * 0.9)}px`,
    });
    Object.assign(disc.style, { width: `${U.D}px`, height: `${U.D}px`, left: `${-U.D / 2}px`, top: `${-U.D / 2}px` });
    const a = U.tri;
    Object.assign(tri.style, { left: `${-a}px`, top: `${-a * 0.8}px`, borderLeft: `${a}px solid transparent`, borderRight: `${a}px solid transparent`, borderBottom: `${a * 1.6}px solid ${GOLD}`, transformOrigin: '50% 50%' });
    Object.assign(label.style, { fontSize: `${U.label}px`, left: '0', top: `${U.D / 2 + 3}px`, transform: 'translateX(-50%)' });
    Object.assign(chip.style, { fontSize: `${U.chip}px`, lineHeight: '1.2', padding: `${Math.round(U.chip * 0.3)}px ${Math.round(U.chip * 0.7)}px`, borderRadius: `${Math.round(U.chip * 0.9)}px`, border: `2px solid ${GOLD}` });
    last.deg = 1e9; last.cx = 1e9;
    nudge();
  }

  // the skill badges sit 84 px down on the left; a two-line goal line would touch them: they move under it while it shows
  function nudge() {
    try {
      const bd = doc.querySelector?.('.hud-badges');
      if (!bd) return;
      if (live.lineOn && line.offsetHeight) {
        const want = `${Math.round(line.offsetTop + line.offsetHeight + 6)}px`;
        if (want !== bd.style.top) { if (badgeTop === null) badgeTop = bd.style.top; bd.style.top = want; }
      } else if (badgeTop !== null) { bd.style.top = badgeTop; badgeTop = null; }
    } catch { /* no badges */ }
  }

  function show(on) {
    if (on === shown) return;
    shown = on;
    root.style.display = on ? 'block' : 'none';
    live.hidden = !on;
    if (on) nudge();
  }

  // ---- the goal line and the quiet times (four times a second) ----------------------------------------------------------------------
  function look() {
    if ((win?.innerWidth || 960) !== size.W || (win?.innerHeight || 540) !== size.H) layout();
    const lf = launch?.state;
    const fin = deep?.state?.finale;
    quiet = !!(star?.state?.open || lf?.open || lf?.flight || base.state.beat || (fin !== null && fin !== undefined && fin < FINALE_LENGTH));
    live.quiet = quiet;
    const gp = base.goal();
    const js = job?.state;
    const text = quiet ? '' : goalWords({
      goal: gp, record: rec(), scope: progression?.state?.moon?.scope ?? 0,
      job: { kind: js?.kind, taken: js?.taken ?? 0, next: js?.next ?? 0, glove: js?.glove, stage: launch?.second?.stage ?? 0 }, riding: !!rover?.state?.riding,
    });
    if (text !== live.text) {
      live.text = text;
      line.textContent = text;
      line.style.display = text ? 'block' : 'none';
      live.lineOn = !!text;
      lineH = 0;
      nudge();
    } else if (text && !lineH && line.offsetHeight) { lineH = line.offsetHeight; nudge(); }
    show(!quiet);
  }

  // ---- the arrow and the chip (each frame) ---------------------------------------------------------------------------------------------
  function paintArrow(on, rel, x, y, metres) {
    if (!on) { if (live.arrowOn) { arrow.style.display = 'none'; live.arrowOn = false; } return; }
    live.rel = rel;
    live.x = x;
    live.y = y;
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
    // desktop and TV: above the toast stack and the prompt; touch: above the joystick and the buttons
    const bottom = Math.max(top + U.D, U.tv ? H * 0.7 : U.touch ? H - 300 : H * 0.72 - 20);
    rect.l = U.edge + U.D / 2;
    rect.r = W - U.edge - U.D / 2 - (U.touch && H < 500 ? 190 : 0); // a short touch screen: the right strip is the map and the buttons
    rect.t = top;
    rect.b = bottom;
    return rect;
  }
  function frameArrow(catPos, camera, gp) {
    if (!gp || !base.beacon || !catPos || !camera) return paintArrow(false); // the arrow is shown exactly when the light column is
    viewOf(camera, view);
    const pip = gp.g.kind === 'pip' && base.pip ? base.pip.position : null; // asleep, he lies where he lies: the base's beacon stands there too
    gOut.x = pip ? pip.x : gp.x; gOut.y = gp.y + 1.5; gOut.z = pip ? pip.z : gp.z;
    arrowFor(view, catPos, gOut, aOut);
    if (!aOut.show) return paintArrow(false);
    edgePoint(aOut.rel, arrowRect(), eOut);
    // the corner map is in the top right: sit under it
    const mapB = (U.tv ? size.H * 0.05 : 16) + U.mapW + 30 + U.D / 2;
    if (eOut.x > size.W - U.edge - U.mapW - U.D && eOut.y < mapB) eOut.y = mapB;
    return paintArrow(true, aOut.rel, eOut.x, eOut.y, Math.max(5, round5(aOut.dist)));
  }
  function frameChip(camera) {
    const b = base.bubble;
    if (!b.on || !camera || quiet) { if (live.chipOn) { chip.style.display = 'none'; live.chipOn = false; live.chip = ''; last.cx = 1e9; } return; }
    const text = chipWords(b.g, job?.plan?.kind);
    if (!text) { if (live.chipOn) { chip.style.display = 'none'; live.chipOn = false; } return; }
    viewOf(camera, view);
    projectPoint(view, b.x, b.y, b.z, size.W, size.H, pOut);
    let x = size.W / 2;
    let y = size.H * 0.3;
    let flip = false;
    if (pOut.ok) {
      const half = (0.35 / (pOut.depth * 2 * view.tanV)) * size.H; // the picture is 0.7 m across
      const w = chip.offsetWidth || text.length * U.chip * 0.56 + U.chip * 1.4;
      x = pOut.x + half + 6;
      y = pOut.y - half * 0.35;
      if (x + w > size.W - U.edge) { flip = true; x = pOut.x - half - 6; }
      if (x - (flip ? w : 0) < U.side) x = U.side + (flip ? w : 0);
    }
    const cx = Math.round(x);
    const cy = Math.round(y);
    const al = Math.round(Math.max(0, Math.min(1, b.a)) * 20);
    if (cx === last.cx && cy === last.cy && (flip ? 1 : 0) === last.flip && al === last.a && text === live.chip && live.chipOn) return;
    last.cx = cx; last.cy = cy; last.flip = flip ? 1 : 0; last.a = al;
    if (text !== live.chip) { chip.textContent = text; live.chip = text; }
    if (!live.chipOn) { chip.style.display = 'block'; live.chipOn = true; }
    chip.style.transform = `translate(${cx}px,${cy}px) translate(${flip ? '-100%' : '0'},-50%)`;
    chip.style.opacity = String(al / 20);
  }

  // ---- hooks: sizes follow the window (looked at with the goal line) and the TV class; the watchdog hides the guide when the walk stops calling update() (paused) ---------------------
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
      acc += dt > 0 ? dt : 0;
      if (acc >= LOOK_EVERY) { acc = 0; look(); } else if (!shown && !quiet) show(true);
      if (quiet) { paintArrow(false); frameChip(null); return; }
      frameArrow(catPos, camera, base.goal());
      frameChip(camera);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { offTv?.(); } catch { /* none */ }
      if (watch !== undefined && watch !== null) win?.clearInterval?.(watch);
      if (badgeTop !== null) { try { const bd = doc.querySelector?.('.hud-badges'); if (bd) bd.style.top = badgeTop; } catch { /* none */ } }
      root.remove?.();
    },
  };
}
