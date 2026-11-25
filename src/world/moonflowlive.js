// =============================================================================
// THE MOON'S STORY FLOW ON A WALK (story-flow pass). Made once a walk by world/moonlife.js; update(dt, t, catPos, camera, session) every frame. The table and the
// small machines are world/moonflow.js; this watches the story (four looks a second) and does four things, each one a page DOM or a toast, never a mesh or a draw call:
//   * CONNECTS the steps: when a step is done it says what comes next and why, one toast at a time with a gap (the step's own toast comes first, at once; this pass's lines
//     follow). The "Next:" line is chosen from base.goal(), the same goal the gold light, the arrow and the written goal line stand on.
//   * CELEBRATES a posted postcard: Pip beeps and dances, a chirp, a short sparkle at the rocket's slot.
//   * ASKS, near the rocket's slot and the big red button, with a pill ("Press the big red button!") that shows 6 s, rests 4 s and comes back while she is there, and a gold
//     edge on the action button's own prompt. It is not a dialog: it takes no input and hides for any page, the flight and the wake-up beat.
//   * WAITS with her on Earthrise Rock: a calm line now and then ("Earth is still reading..."), and a nudge toward the rock if she is not there.
// Nothing is saved or sent and nothing is drawn from a random number or a clock of its own. What it said is per walk: it starts looking at the story as it is when the walk
// begins, so a walk that resumes says nothing about the steps already done. Reduced motion: no sparkle, a steady edge instead of a blink.
// =============================================================================

import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as P from './moonplan.js';
import * as M from './moonmission.js';
import { createMoonSound } from './moonsound.js';
import { tvScale } from './moontv.js';
import { FINALE_LENGTH } from './moondeeplive.js';
import { FLOW, rowLines, diff, createQueue, createCta, ctaFor, CTA, WAIT_EVERY, WAIT_MAX, RESEND } from './moonflow.js';

export const LOOK_EVERY = 0.25; // s
const GOLD = '#ffd45a';
const OWN_STEP = new Set(['wake', 'awake', 'aimed', 'stamp', 'posted', 'liftoff']); // lines of these go stale when the story moves past the step
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function createFlowLive(ctx) {
  const { doc, win, base, launch, star, job, deep, progression, reducedMotion = false } = ctx;
  const sound = createMoonSound(ctx.audio ?? null);
  const q = createQueue();
  const cta = createCta();
  const live = { said: [], cta: '', shown: false, quiet: false };
  const fired = new Set();
  const rec = () => M.normalize(progression?.state?.moon);
  const kindNow = () => base.goal()?.g?.kind ?? '';
  let prev = null;
  let acc = LOOK_EVERY;
  let waitT = 0;
  let waitN = 0;
  let sinceLift = -1;
  let nudged = false;
  let disposed = false;
  let session = null;
  let blink = 0;
  let edge = '';
  const near = { rocket: false, button: false };
  const ledge = P.ROCK_LEDGES[2];

  // ---- the pill: one page element, built once, hidden until she is at the rocket slot or the big red button -------------------------------
  const root = doc?.body && typeof doc.createElement === 'function' ? doc.createElement('div') : null;
  const promptEl = doc?.getElementById?.('hud-prompt') ?? null;
  if (root) {
    root.setAttribute?.('role', 'status');
    Object.assign(root.style, { position: 'absolute', left: '50%', top: '34%', transform: 'translate(-50%,-50%)', display: 'none', maxWidth: '92vw', boxSizing: 'border-box', textAlign: 'center', pointerEvents: 'none', zIndex: '2', color: '#fff', fontWeight: '800', background: 'rgba(20,26,38,.9)', border: `3px solid ${GOLD}` });
    (doc.getElementById?.('hud') ?? doc.body).appendChild(root);
  }
  function layout() {
    if (!root) return;
    const sc = tvScale(doc, win);
    const f = sc.tv ? 34 * sc.s : (win?.innerWidth || 960) <= 520 ? 17 : 22;
    Object.assign(root.style, { fontSize: `${f}px`, lineHeight: '1.2', padding: `${Math.round(f * 0.4)}px ${Math.round(f * 0.9)}px`, borderRadius: `${Math.round(f * 1.1)}px` });
  }
  layout();

  // ---- the lines ---------------------------------------------------------------------------------------------------------------------
  function fire(key, second) {
    const id = second ? `${key}2` : key;
    if (fired.has(id)) return;
    fired.add(id);
    const ok = () => (key === 'count' ? !!launch.state.flight : second || !OWN_STEP.has(key) || rec().step <= FLOW[key].step);
    for (const l of rowLines(key, { second })) q.push({ at: l.at, k: l.k, valid: ok, text: () => l.text(kindNow()) });
    if (key === 'posted') { // a posted postcard is a moment: a chirp, Pip beeps and dances, a short sparkle at the slot
      sound.chirp();
      base.pip?.beep?.();
      base.pip?.dance?.();
      if (!reducedMotion) session?.fx?.burst?.({ x: P.ROCKET_SLOT.x, y: (ctx.ground?.y?.(P.ROCKET_SLOT.x, P.ROCKET_SLOT.z) ?? 0) + 1.1, z: P.ROCKET_SLOT.z }, 0xffe27a, 14, { ttl: 1.2, gravity: -0.15, speed: 1.1, size: 0.16 });
    }
  }
  const later = (k, text, valid) => q.push({ at: 0, k, valid, text: () => text });

  function look(catPos) {
    const r = rec();
    const lf = launch.state;
    const stage = launch.second ? launch.second.stage : -1;
    const now = { step: r.step, deep: (r.cells & (1 << M.DEEP)) !== 0, stage, flight: lf.flight && !lf.flight.demo && lf.clock - lf.flight.t0 < 1.5 ? 2 : lf.flight ? 1 : 0, done: !!job?.state?.done };
    const was = prev;
    prev = now;
    if (!was) return; // the walk starts looking at the story as it is
    for (const k of diff(was, now)) fire(k, r.step >= M.STEP.replied && (k === 'posted' || k === 'count'));
    // a calm word while she waits for Earth (the reply itself is the launch life's), and a nudge if she is not at the rock
    const waiting = r.step === M.STEP.sent && lf.lastLaunchAt !== null && !lf.reply;
    const onRock = !!catPos && dist(catPos, ledge) <= P.REPLY_NEAR;
    const still = () => waiting && !lf.reply;
    if (waiting && onRock && (waitT += LOOK_EVERY) >= WAIT_EVERY * (waitN + 1) && waitN < WAIT_MAX) { waitN++; later('more', phrase('moon.flow.wait'), still); }
    if (waiting && !nudged && (sinceLift += sinceLift < 0 ? 1 + LOOK_EVERY : LOOK_EVERY) >= RESEND && !onRock) { nudged = true; later('more', phrase('moon.flow.rock'), still); }
    near.rocket = !!catPos && dist(catPos, P.ROCKET_SLOT) < CTA.near;
    near.button = !!catPos && dist(catPos, P.LAUNCH_DESK) < CTA.near;
    const fin = deep?.state?.finale;
    live.quiet = !!(star?.state?.open || lf.open || base.state.beat || (fin !== null && fin !== undefined && fin < FINALE_LENGTH));
  }

  return {
    state: live,
    els: { root },
    queue: q,
    look,
    update(dt, t, catPos, camera, sess) {
      if (disposed) return;
      const step = dt > 0 ? dt : 0;
      session = sess ?? session;
      acc += step;
      if (acc >= LOOK_EVERY) { acc = 0; look(catPos); }
      const lf = launch.state;
      const want = live.quiet ? '' : ctaFor({ step: rec().step, card: lf.carryingCard >= 0, stage: launch.second ? launch.second.stage : -1, flight: !!lf.flight, open: false, near });
      const kind = cta.update(step, want);
      if (root && (kind !== live.cta || (kind && !live.shown))) {
        live.cta = kind;
        live.shown = !!kind;
        root.style.display = kind ? 'block' : 'none';
        if (kind) root.textContent = kind === 'rocket' ? `📮 ${phrase('moon.flow.cta.rocket')}` : `🔴 ${phrase('moon.flow.cta.button')}`;
      }
      // the action button's own prompt gets a gold edge while she is there: it blinks gently (under 2 a second), steady in reduced motion
      blink = (blink + step) % 1.2;
      const e = want ? (reducedMotion || blink < 0.7 ? `3px solid ${GOLD}` : '3px solid transparent') : '';
      if (e !== edge && promptEl) { edge = e; promptEl.style.outline = e; promptEl.style.outlineOffset = e ? '2px' : ''; }
      const line = q.update(step, live.quiet);
      if (line) { live.said.push(line); bus.emit('discovery', { type: 'greenhousenote', key: `moon-flow-${live.said.length}`, label: line, points: 0, repeat: false }); }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (promptEl && edge) { promptEl.style.outline = ''; promptEl.style.outlineOffset = ''; }
      root?.remove?.();
      sound.dispose();
    },
  };
}
