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
//           stray count (today's LOW)        materials and the area build.
//                                            Nothing more is tried in the
//                                            walk that stepped here: LOW has
//                                            not been seen yet, and stepping
//                                            past it unseen would remember a
//                                            rung nobody measured
//   rung 4  small parts stop casting         live, the very next frame, and
//           shadows (a cat: 31 draws → 10)   nothing visibly changes
//   rung 5  pixel ratio cap 1                live, the very next frame
//           no shadow pass                   live: the shadows fade out over
//                                            1.5 s, then the pass stops
//           strays 8, no clouds, thinner     next walk: counts are baked
//           grass and ambient                into the area build
//   30 fps  after rung 5, the last resort:   live: every other display frame
//           a steady 30 (CAP_RUNG)           is skipped (shouldRender), game
//                                            time untouched. Taken only if
//                                            the slow frames were UNEVEN; a
//                                            walk already steady at 30 (a
//                                            capped display) gains nothing
//                                            and is left alone
// Every step is written to storage at once, so the next walk starts there,
// with one exception: if the live steps bought under ADAPT.minGain by the
// time the floor is due, the frames are capped (Low Power Mode, 30 Hz), so
// the start-of-walk memory is put back and adapting stops for the walk.
// The governor's warm-up is armed by the first frame, not by beginWalk.
// frame() must run BEFORE the frame's draw: a pixel-ratio change clears the
// canvas, and after the draw that would present a blank frame.
// Manual High/Low and reduced motion never adapt and never touch storage.
// Neither does a forced rung (?rung=N, quality.js parseForcedRung): with the
// setting on Auto, every walk of the page load starts on that rung and stays
// there. It is how a rung is looked at on a device too fast to reach it.

import { resolveQuality, isAdaptive, LADDER, LOW_RUNG, FLOOR_RUNG, CAP_RUNG } from '../render/quality.js';
import {
  ADAPT, CAP30, createFrameGovernor, createFramePacer, readMemory, writeMemory, planWalkStart, noteStepDown,
  noteRetryHeld,
} from '../render/adaptive.js';
import { BLOOM_STRENGTH } from './composer.js';
import { trimShadowCasters } from '../render/rig.js';

export const BLOOM_FADE_MS = 1500;
// The step to the lite rung fades the real shadows out the way rung 2 fades
// the bloom, and for the same reason: every shadow in view vanishing in one
// frame is a pop a child sees; a second and a half of them thinning is not.
export const SHADOW_FADE_MS = 1500;

export function createQualityAdapter({
  renderer,
  composerRig,
  storage,
  devicePixelRatio = () => window.devicePixelRatio,
  wallClock = () => Date.now(),
  forcedRung = null,
}) {
  const governor = createFrameGovernor();
  const pacer = createFramePacer();
  // One object, mutated in place, so a HUD can hold on to it. `rung` runs to
  // CAP_RUNG (the lite rung with the 30 fps cap on); `cap30` says the same
  // thing as a flag, for the render loop and the readout.
  const status = { mode: 'auto', rung: 0, startRung: 0, startReason: 'top', change: '', cap30: false };
  let adaptive = false;
  let mem = null;
  let startMem = null;     // the memory beginWalk wrote, restored on a frame-cap skip
  let armPending = false;  // the warm-up starts at the first frame, after the area build
  let halted = false;      // a frame-cap skip ends adapting for this walk
  let retryPending = false; // a retry walk not yet judged
  let baselineMeanMs = 0;  // mean frame time at this walk's first trigger (0: none yet)
  let fadeSession = null; // the session a fade belongs to, or null
  let fadeStart = 0;
  let fadeKind = 'bloom'; // 'bloom' (rung 2) or 'shadows' (rung 5)

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
    // The rung the walk starts on. The tier's own rung, except on CAP_RUNG,
    // which is the lite tier plus the 30 fps cap.
    let startRung = -1;
    if (adaptive && forcedRung != null) {
      // Forced: Auto's ladder, but no governor and no memory. `adaptive` off
      // is what keeps frame() from sampling; storage is not even read.
      adaptive = false;
      mem = null;
      startMem = null;
      retryPending = false;
      tier = resolveQuality({ reducedMotion, override, rung: forcedRung });
      startRung = forcedRung;
      status.mode = 'forced';
      status.startReason = 'forced';
    } else if (adaptive) {
      const plan = planWalkStart(readMemory(storage), wallClock());
      mem = plan.mem;
      startMem = { ...mem };
      writeMemory(storage, mem);
      retryPending = plan.reason === 'retry';
      tier = resolveQuality({ reducedMotion, override, rung: plan.rung });
      startRung = plan.rung;
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
    if (startRung < 0) startRung = tier.rung;
    status.rung = startRung;
    status.startRung = startRung;
    status.change = '';
    status.cap30 = startRung >= CAP_RUNG;
    pacer.reset();

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

  // What a step to rung `to` changes in the walk that is running (the table
  // at the top of this file). Everything else about the rung waits for the
  // next walk to be built on it.
  function applyLive(to, session, nowMs) {
    const tier = LADDER[to];
    if (to === 1) {
      applyPixelRatio(tier);
    } else if (to === 2) {
      fadeSession = session;
      fadeStart = nowMs;
      fadeKind = 'bloom';
    } else if (to === 4) {
      if (session.scene) trimShadowCasters(session.scene, tier.shadowMinPart);
    } else if (to === 5) {
      // The pixels at once (as rung 1 does), the shadows over SHADOW_FADE_MS.
      applyPixelRatio(tier);
      fadeSession = session;
      fadeStart = nowMs;
      fadeKind = 'shadows';
    }
    // to === LOW_RUNG: nothing live; the next walk starts there.
  }

  function stepDown(session, nowMs) {
    const from = status.rung;
    const to = from + 1;
    const mean = governor.lastMeanMs();
    if (baselineMeanMs === 0) baselineMeanMs = mean;
    // The live steps are judged as a whole at the step to LOW: if they bought
    // less than minGain, the frames are capped (Low Power Mode, a 30 Hz
    // display), and LOW would be remembered for weeks for nothing.
    if (to === LOW_RUNG && status.startRung < 2 && mean > baselineMeanMs * (1 - ADAPT.minGain)) {
      mem = { ...startMem };
      writeMemory(storage, mem);
      retryPending = false;
      halted = true;
      status.change = `${from}→${to} skipped: no gain from stepping down (frame cap?)`;
      return;
    }
    const pct = Math.round(governor.lastSlowFraction() * 100);
    if (to === CAP_RUNG) {
      // The cap evens out frames that alternate between making and missing
      // the display's refresh. A window with next to no fast frames in it
      // is not alternating: it is already steady at 30 or slower (Low Power
      // Mode, a 30 Hz display, or a device missing every refresh), and a
      // cap would change nothing on screen. Not taken, not remembered.
      if (governor.lastFastFraction() < CAP30.unevenMin) {
        halted = true;
        status.change = `${from}→30 fps skipped: frames already steady at 30 or slower (display cap?)`;
        return;
      }
      status.cap30 = true;
      pacer.reset();
      mem = noteStepDown(mem, to, wallClock());
      writeMemory(storage, mem);
      retryPending = false;
      status.rung = to;
      status.change = `${from}→30 fps: ${pct}% of frames over ${ADAPT.slowMs} ms for ${ADAPT.windowMs / 1000} s`;
      return;
    }
    applyLive(to, session, nowMs);
    mem = noteStepDown(mem, to, wallClock());
    writeMemory(storage, mem);
    retryPending = false;
    status.rung = to;
    status.change = `${from}→${to}: ${pct}% of frames over ${ADAPT.slowMs} ms for ${ADAPT.windowMs / 1000} s` +
      (to === LOW_RUNG ? ' (next walk)' : to === FLOOR_RUNG ? ' (fewer strays, no clouds, thinner grass next walk)' : '');
    // LOW changes nothing in this walk, so this walk can say nothing about
    // it: adapting rests until the next walk has been built on it.
    if (to === LOW_RUNG) halted = true;
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
      if (fadeKind === 'shadows') {
        // session.shadows is render/shadowfit.js's rig.
        const k = (nowMs - fadeStart) / SHADOW_FADE_MS;
        if (k >= 1) {
          session.shadows?.stop();
          fadeSession = null;
          governor.restart(nowMs, ADAPT.settleMs);
        } else {
          session.shadows?.setStrength(1 - Math.max(0, k));
        }
        return;
      }
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
    if (status.rung >= CAP_RUNG) return;
    if (governor.sample(nowMs)) {
      stepDown(session, nowMs);
    } else if (retryPending && governor.judged()) {
      retryPending = false;
      mem = noteRetryHeld(mem);
      writeMemory(storage, mem);
    }
  }

  // Asked once per display refresh, before anything else in the render loop:
  // false means "skip this one entirely" (no update, no draw, the clock not
  // read, so the next frame's dt covers both). Always true unless the 30 fps
  // cap is on. Time-based, so a display that is itself held at 30 (Low Power
  // Mode) is not halved again.
  function shouldRender(nowMs) {
    return !status.cap30 || pacer.due(nowMs);
  }

  return { beginWalk, frame, shouldRender, status };
}
