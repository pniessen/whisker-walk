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
// Every step is written to storage at once, so the next walk starts there.
// Manual High/Low and reduced motion never adapt and never touch storage.

import { resolveQuality, isAdaptive, LADDER, FLOOR_RUNG } from '../render/quality.js';
import {
  ADAPT, createFrameGovernor, readMemory, writeMemory, planWalkStart, noteStepDown,
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
  let fadeSession = null; // the session a bloom fade belongs to, or null
  let fadeStart = 0;

  function applyPixelRatio(tier) {
    renderer.setPixelRatio(Math.min(devicePixelRatio(), tier.pixelRatioCap));
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
      writeMemory(storage, mem);
      tier = resolveQuality({ reducedMotion, override, rung: plan.rung });
      status.mode = 'auto';
      status.startReason = plan.reason;
    } else {
      mem = null;
      tier = resolveQuality({ reducedMotion, override });
      const manual = override === 'high' || override === 'low' || !reducedMotion;
      status.mode = manual ? 'manual' : 'reduced-motion';
      status.startReason = status.mode;
    }
    status.rung = tier.rung;
    status.startRung = tier.rung;
    status.change = '';

    applyPixelRatio(tier);
    composerRig.setBloomStrength(BLOOM_STRENGTH);
    governor.restart(nowMs, ADAPT.warmupMs);
    return tier;
  }

  function stepDown(session, nowMs) {
    const from = status.rung;
    const to = from + 1;
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
    const pct = Math.round(governor.lastSlowFraction() * 100);
    status.rung = to;
    status.change = `${from}→${to}: ${pct}% of frames over ${ADAPT.slowMs} ms for ${ADAPT.windowMs / 1000} s` +
      (to === FLOOR_RUNG ? ' (next walk)' : '');
    governor.restart(nowMs, ADAPT.settleMs);
  }

  // Allocates nothing except at a step-down.
  function frame(session, nowMs) {
    if (!adaptive || !session) return;
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
    if (governor.sample(nowMs)) stepDown(session, nowMs);
  }

  return { beginWalk, frame, status };
}
