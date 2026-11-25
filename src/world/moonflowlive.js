// =============================================================================
// THE MOON'S STORY FLOW ON A WALK (story-flow pass). Made once a walk by world/moonlife.js; update(dt, t, catPos, camera, session) every frame. The table and the
// small machines are world/moonflow.js; this watches the story (four looks a second) and does four things, each one a page DOM or a toast, never a mesh or a draw call:
//   * CONNECTS the steps: when a step is done it says what comes next and why, one toast at a time with a gap (the existing toasts of the step come first, at once;
//     this pass's lines follow). The "Next:" line is chosen from base.goal(), the same goal the gold light, the arrow and the written goal line stand on.
//   * CELEBRATES a posted postcard: Pip beeps and dances, a chirp, a short sparkle at the rocket's slot.
//   * ASKS, near the rocket's slot and the big red button, with a pill ("Press the big red button!") that shows 6 s, rests 4 s and comes back while she is there, and a
//     pulse on the action button's own prompt. It is not a dialog: it takes no input and hides for any page, the flight and the wake-up beat.
//   * WAITS with her on Earthrise Rock: a calm line now and then ("Earth is still reading..."), and a nudge toward the rock if she is not there.
// Nothing is saved or sent and nothing is drawn from a random number or a clock of its own. What it said is per walk: it starts looking at the story as it is when the walk
// begins, so a walk that resumes says nothing about the steps already done. Reduced motion: no sparkle, no pulse (a steady gold edge instead).
// =============================================================================

import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import { tvState, padHtml, onTv } from '../tvseam.js';
import * as P from './moonplan.js';
import * as M from './moonmission.js';
import { createMoonSound } from './moonsound.js';
import { tvScale } from './moontv.js';
import { FINALE_LENGTH } from './moondeeplive.js';
import { FLOW, rowLines, diff, createQueue, createCta, ctaFor, CTA, WAIT_EVERY, WAIT_MAX, RESEND } from './moonflow.js';

export const LOOK_EVERY = 0.25; // s
const GOLD = '#ffd45a';
const INK = 'rgba(20,26,38,.9)';
const OWN_STEP = new Set(['wake', 'awake', 'aimed', 'stamp', 'posted', 'liftoff']); // lines of these go stale when the story moves past the step
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function createFlowLive(ctx) {
  const { doc, win, base, launch, star, job, deep, progression, reducedMotion = false } = ctx;
  const sound = createMoonSound(ctx.audio ?? null);
  const q = createQueue();
  const cta = createCta();
  const live = { said: [], fired: [], cta: '', shown: false, quiet: false };
  const fired = new Set();
  const rec = () => M.normalize(progression?.state?.moon);
  const kindNow = () => base.goal()?.g?.kind ?? '';
  let prev = null;
  let acc = LOOK_EVERY;
  let walk = 0;
  let waitT = 0;
  let waitN = 0;
  let sinceLift = -1;
  let nudged = false;
  let errandTold = false;
  let disposed = false;
  let spot = null;
  const near = { rocket: false, button: false };
  const ledge = P.ROCK_LEDGES[2];

  // ---- the pill (page DOM, built once) -----------------------------------------------------------------------------------------------
  const make = (css) => { const e = doc.createElement('div'); Object.assign(e.style, css); return e; };
  let root = null; let icon = null; let text = null; let chip = null; let styleEl = null; let promptEl = null;
  if (doc?.body && typeof doc.createElement === 'function') {
    const host = doc.getElementById?.('hud') ?? doc.body;
    root = make({ position: 'absolute', left: '50%', top: '34%', transform: 'translate(-50%,-50%)', display: 'none', alignItems: 'center', gap: '12px', maxWidth: '92vw', boxSizing: 'border-box', pointerEvents: 'none', zIndex: '2', color: '#fff', fontWeight: '800', background: INK, border: `3px solid ${GOLD}`, textShadow: '0 1px 2px rgba(0,0,0,.6)' });
    root.setAttribute?.('role', 'status');
    root.setAttribute?.('data-moon-flow', '1');
    icon = make({ flex: '0 0 auto', borderRadius: '50%', border: '3px solid #fff', background: 'radial-gradient(circle at 35% 30%,#ff8a7a,#d8201c 60%,#8e0e0c)', boxShadow: '0 3px 0 #5a0a08' });
    text = make({});
    chip = make({ flex: '0 0 auto', display: 'none', background: '#fff', color: '#1f2a3d', borderRadius: '8px', fontWeight: '900', textAlign: 'center' });
    root.appendChild(icon); root.appendChild(text); root.appendChild(chip);
    host.appendChild(root);
    promptEl = doc.getElementById?.('hud-prompt') ?? null;
    if (promptEl && doc.createElement) {
      styleEl = doc.createElement('style');
      styleEl.textContent = '@keyframes moonflowpulse{0%,100%{box-shadow:0 0 0 0 rgba(255,212,90,.95)}50%{box-shadow:0 0 0 12px rgba(255,212,90,0)}}.moon-flow-pulse{outline:3px solid #ffd45a;outline-offset:2px}'
        + (reducedMotion ? '' : '.moon-flow-pulse{animation:moonflowpulse 1.1s ease-in-out infinite}');
      try { (doc.head ?? host).appendChild(styleEl); } catch { styleEl = null; }
    }
  }
  function layout() {
    if (!root) return;
    const sc = tvScale(doc, win);
    const touch = !!doc.body?.classList?.contains?.('touch-mode');
    const narrow = (win?.innerWidth || 960) <= 520;
    const f = sc.tv ? 34 * sc.s : narrow ? 17 : touch ? 19 : 22;
    Object.assign(root.style, { fontSize: `${f}px`, lineHeight: '1.2', padding: `${Math.round(f * 0.4)}px ${Math.round(f * 0.9)}px`, borderRadius: `${Math.round(f * 1.1)}px`, top: narrow ? '38%' : '34%' });
    Object.assign(icon.style, { width: `${Math.round(f * 1.5)}px`, height: `${Math.round(f * 1.5)}px` });
    Object.assign(chip.style, { fontSize: `${Math.round(f * 0.9)}px`, minWidth: `${Math.round(f * 1.5)}px`, padding: `${Math.round(f * 0.15)}px ${Math.round(f * 0.4)}px` });
  }
  const offTv = root ? onTv?.(() => { layout(); if (live.cta) paintCta(live.cta); }) : null;
  layout();
  function paintCta(kind) {
    if (!root) return;
    const on = !!kind;
    if (on !== live.shown) root.style.display = on ? 'flex' : 'none';
    live.shown = on;
    live.cta = kind;
    if (!on) return;
    const line = kind === 'rocket' ? phrase('moon.flow.cta.rocket') : phrase('moon.flow.cta.button');
    if (text.textContent !== line) text.textContent = line;
    icon.style.display = kind === 'button' ? 'block' : 'none';
    const pad = tvState.input === 'pad';
    const touch = !!doc.body?.classList?.contains?.('touch-mode');
    if (pad) { const h = padHtml('⟦interact⟧'); if (h != null) chip.innerHTML = h; else chip.textContent = ''; chip.style.display = h != null ? 'block' : 'none'; } else if (!touch) { chip.textContent = 'E'; chip.style.display = 'block'; } else chip.style.display = 'none';
  }
  let pulsed = false;
  const pulse = (on) => { if (on === pulsed) return; pulsed = on; try { promptEl?.classList?.[on ? 'add' : 'remove']?.('moon-flow-pulse'); } catch { /* no page */ } };

  // ---- the lines ---------------------------------------------------------------------------------------------------------------------
  const lfState = () => launch.state;
  function fire(key, second) {
    const id = second ? `${key}2` : key;
    if (fired.has(id)) return;
    fired.add(id);
    live.fired.push(id);
    const row = FLOW[key];
    const ok = () => (second ? (key === 'count' ? !!lfState().flight : true) : key === 'count' ? !!lfState().flight : OWN_STEP.has(key) ? rec().step <= row.step : true);
    for (const l of rowLines(key, { second })) q.push({ at: l.at, k: l.k, valid: ok, text: () => l.text(kindNow()) });
    if (key === 'posted') celebrate();
  }
  // a posted postcard is a moment: Pip beeps and dances, a chirp, a short sparkle at the slot
  function celebrate() {
    sound.chirp();
    base.pip?.beep?.();
    base.pip?.dance?.();
    const s = spot?.session;
    if (!reducedMotion && s?.fx?.burst) s.fx.burst({ x: P.ROCKET_SLOT.x, y: (ctx.ground?.y?.(P.ROCKET_SLOT.x, P.ROCKET_SLOT.z) ?? 0) + 1.1, z: P.ROCKET_SLOT.z }, 0xffe27a, 14, { ttl: 1.2, gravity: -0.15, speed: 1.1, size: 0.16 });
  }

  function look(catPos, session) {
    const r = rec();
    const lf = lfState();
    const second = launch.second ?? null;
    const now = {
      step: r.step, deep: (r.cells & (1 << M.DEEP)) !== 0, card: lf.carryingCard >= 0, stage: second ? second.stage : -1,
      flight: lf.flight && !lf.flight.demo && lf.clock - lf.flight.t0 < 1.5 ? 2 : lf.flight ? 1 : 0, done: !!job?.state?.done,
    };
    spot = { session };
    if (prev === null) { prev = now; return; } // the walk starts looking at the story as it is
    const keys = diff(prev, now);
    prev = now;
    const sec = now.step >= M.STEP.replied;
    for (const k of keys) fire(k, sec && (k === 'stamp' || k === 'posted' || k === 'count'));
    // a calm word while she waits for Earth (the reply itself is the launch life's)
    const waiting = r.step === M.STEP.sent && lf.lastLaunchAt !== null && !lf.reply;
    const onRock = !!catPos && dist(catPos, ledge) <= P.REPLY_NEAR;
    if (waiting && onRock) {
      waitT += LOOK_EVERY;
      if (waitT >= WAIT_EVERY * (waitN + 1) && waitN < WAIT_MAX) { waitN++; q.push({ at: 0, k: 'more', valid: () => rec().step === M.STEP.sent, text: () => phrase('moon.flow.wait') }); }
    }
    if (waiting) {
      sinceLift = sinceLift < 0 ? 0 : sinceLift + LOOK_EVERY;
      if (!nudged && sinceLift >= RESEND && !onRock) { nudged = true; q.push({ at: 0, k: 'more', valid: () => rec().step === M.STEP.sent && !lfState().reply, text: () => phrase('moon.flow.rock') }); }
    }
    // the day's errand, told once in the first few walks (the errand's own line says what; this says why)
    if (!errandTold && walk > 6 && r.step >= M.STEP.replied && job?.state?.eligible && !job.state.done && (progression?.state?.walks?.moon ?? 0) <= 6) { errandTold = true; fire('errand', false); }
    // the call to action
    const lfNear = (p, reach) => !!catPos && dist(catPos, p) < reach;
    near.rocket = lfNear(P.ROCKET_SLOT, CTA.near);
    near.button = lfNear(P.LAUNCH_DESK, CTA.near);
    const fin = deep?.state?.finale;
    live.quiet = !!(star?.state?.open || lf.open || base.state.beat || (fin !== null && fin !== undefined && fin < FINALE_LENGTH));
  }

  return {
    state: live,
    els: { root, icon, text, chip },
    queue: q,
    look,
    update(dt, t, catPos, camera, session) {
      if (disposed) return;
      const step = dt > 0 ? dt : 0;
      walk += step;
      acc += step;
      if (acc >= LOOK_EVERY) { acc = 0; look(catPos, session); }
      const lf = lfState();
      const want = live.quiet ? '' : ctaFor({ step: rec().step, card: lf.carryingCard >= 0, stage: launch.second ? launch.second.stage : -1, flight: !!lf.flight, open: false, near });
      const shown = cta.update(step, want);
      if (shown !== live.cta || (shown && !live.shown)) paintCta(shown);
      pulse(!!want);
      const line = q.update(step, live.quiet);
      if (line) { live.said.push(line); say(`moon-flow-${live.said.length}`, line); }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { offTv?.(); } catch { /* none */ }
      pulse(false);
      root?.remove?.();
      styleEl?.remove?.();
      sound.dispose();
    },
  };
}
