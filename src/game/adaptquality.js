// Adaptive Auto quality at runtime: the glue between the frame governor and
// rung memory (render/adaptive.js) and the renderer/composer.
//
// beginWalk() picks the walk's tier and sets the pixel ratio in every mode
// (manual too). frame() is called once per rendered frame; on a sustained
// slow stretch it steps down one rung. What changes live and what waits:
//   rung 1  pixel ratio cap 2 → 1.5          live, the very next frame
//   rung 2  post-fx off                      live: bloom fades to 0 over
//                                            1.5 s, then the composer is
//                                            dropped, so nothing pops
//   rung 3  shadow map, normal maps, env,    next walk: they are baked into
//           stray count (today's LOW)        materials and the area build
// Every step is written to storage at once, so the next walk starts there,
// with one exception: if the live steps bought under ADAPT.minGain by the
// time the floor is due, the frames are capped (Low Power Mode, 30 Hz), so
// the start-of-walk memory is put back and adapting stops for the walk.
// The governor's warm-up is armed by the first frame, not by beginWalk.
// frame() must run BEFORE the frame's draw: a pixel-ratio change clears the
// canvas, and after the draw that would present a blank frame.
// Manual High/Low and reduced motion never adapt and never touch storage.

import { resolveQuality, isAdaptive, LADDER, FLOOR_RUNG } from '../render/quality.js';
import {
  ADAPT, createFrameGovernor, readMemory, writeMemory, planWalkStart, noteStepDown,
  noteRetryHeld,
} from '../render/adaptive.js';
import { BLOOM_STRENGTH } from './composer.js';

export const BLOOM_FADE_MS = 1500;

export function createQualityAdapter({
  renderer,
  composerRig,
  storage,
  devicePixelRatio = () => window.devicePixelRatio,
  wallClock = () => Date.now(),
}) {
  const governor = createFrameGovernor();
  // One object, mutated in place, so a HUD can hold on to it.
  const status = { mode: 'auto', rung: 0, startRung: 0, startReason: 'top', change: '' };
  let adaptive = false;
  let mem = null;
  let startMem = null;     // the memory beginWalk wrote, restored on a frame-cap skip
  let armPending = false;  // the warm-up starts at the first frame, after the area build
  let halted = false;      // a frame-cap skip ends adapting for this walk
  let retryPending = false; // a retry walk not yet judged
  let baselineMeanMs = 0;  // mean frame time at this walk's first trigger (0: none yet)
  let fadeSession = null; // the session a bloom fade belongs to, or null
  let fadeStart = 0;

  // setPixelRatio reassigns canvas.width, which clears the drawing buffer, so
  // an unchanged ratio (a dpr-1 desktop stepping to rung 1) touches neither.
  // The composer is only ever set here, beside the renderer, and is built
  // from the renderer's ratio, so the two cannot drift apart while skipped.
  function applyPixelRatio(tier) {
    const pr = Math.min(devicePixelRatio(), tier.pixelRatioCap);
    if (pr === renderer.getPixelRatio()) return;
    renderer.setPixelRatio(pr);
    composerRig.setPixelRatio(renderer.getPixelRatio());
  }

  function beginWalk({ override, reducedMotion, nowMs }) {
    // A fade left over from the last walk belongs to that walk.
    fadeSession = null;
    adaptive = isAdaptive({ override, reducedMotion });

    let tier;
    if (adaptive) {
      const plan = planWalkStart(readMemory(storage), wallClock());
      mem = plan.mem;
      startMem = { ...mem };
      writeMemory(storage, mem);
      retryPending = plan.reason === 'retry';
      tier = resolveQuality({ reducedMotion, override, rung: plan.rung });
      status.mode = 'auto';
      status.startReason = plan.reason;
    } else {
      mem = null;
      startMem = null;
      retryPending = false;
      tier = resolveQuality({ reducedMotion, override });
      status.mode = override === 'auto' ? 'reduced-motion' : 'manual';
      status.startReason = status.mode;
    }
    status.rung = tier.rung;
    status.startRung = tier.rung;
    status.change = '';

    applyPixelRatio(tier);
    composerRig.setBloomStrength(BLOOM_STRENGTH);
    // beginWalk runs before the area build, which can take seconds on a
    // phone; the warm-up is armed by the first frame instead (see frame()).
    armPending = true;
    halted = false;
    baselineMeanMs = 0;
    governor.restart(nowMs, ADAPT.warmupMs);
    return tier;
  }

  function stepDown(session, nowMs) {
    const from = status.rung;
    const to = from + 1;
    const mean = governor.lastMeanMs();
    if (baselineMeanMs === 0) baselineMeanMs = mean;
    // The live steps are judged as a whole at the floor step: if they bought
    // less than minGain, the frames are capped (Low Power Mode, a 30 Hz
    // display), and the floor would be remembered for weeks for nothing.
    if (to === FLOOR_RUNG && status.startRung < 2 && mean > baselineMeanMs * (1 - ADAPT.minGain)) {
      mem = { ...startMem };
      writeMemory(storage, mem);
      retryPending = false;
      halted = true;
      status.change = `${from}→${to} skipped: no gain from stepping down (frame cap?)`;
      return;
    }
    const tier = LADDER[to];
    if (to === 1) {
      applyPixelRatio(tier);
    } else if (to === 2) {
      fadeSession = session;
      fadeStart = nowMs;
    }
    // to === FLOOR_RUNG: nothing live; the next walk starts there.
    mem = noteStepDown(mem, to, wallClock());
    writeMemory(storage, mem);
    retryPending = false;
    const pct = Math.round(governor.lastSlowFraction() * 100);
    status.rung = to;
    status.change = `${from}→${to}: ${pct}% of frames over ${ADAPT.slowMs} ms for ${ADAPT.windowMs / 1000} s` +
      (to === FLOOR_RUNG ? ' (next walk)' : '');
    governor.restart(nowMs, ADAPT.settleMs);
  }

  // Allocates nothing except at a step-down.
  function frame(session, nowMs) {
    if (!adaptive || !session || halted) return;
    if (armPending) {
      armPending = false;
      governor.restart(nowMs, ADAPT.warmupMs);
    }
    if (fadeSession) {
      // Finish the fade before anything else, even at the floor.
      if (session !== fadeSession) return;
      const k = (nowMs - fadeStart) / BLOOM_FADE_MS;
      if (k >= 1) {
        composerRig.setBloomStrength(0);
        session.useComposer = false;
        fadeSession = null;
        governor.restart(nowMs, ADAPT.settleMs);
      } else {
        composerRig.setBloomStrength(BLOOM_STRENGTH * (1 - Math.max(0, k)));
      }
      return;
    }
    if (status.rung >= FLOOR_RUNG) return;
    if (governor.sample(nowMs)) {
      stepDown(session, nowMs);
    } else if (retryPending && governor.judged()) {
      retryPending = false;
      mem = noteRetryHeld(mem);
      writeMemory(storage, mem);
    }
  }

  return { beginWalk, frame, status };
}
