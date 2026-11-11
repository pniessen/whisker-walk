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
//
// The device profile (render/deviceprofile.js; only the iPhone and iPad app
// supplies one) adds four things, none of which exist in Safari or on desktop:
//   - a first walk with no memory starts on the profile's table rung;
//   - running hot (thermal serious or critical) and a memory warning each
//     drop ONE rung at once, live where the rung allows, and TEMPORARILY:
//     nothing is written, so when the device has cooled the next walk
//     starts back on the remembered rung (a memory warning lasts until the
//     page is reloaded);
//   - Low Power Mode says outright that the display is held at 30, so the
//     governor judges against that instead of inferring a cap;
//   - the profile is shown in the ?perf readout.
// Neither does a forced rung (?rung=N, quality.js parseForcedRung): with the
// setting on Auto, every walk of the page load starts on that rung and stays
// there. It is how a rung is looked at on a device too fast to reach it.

import { resolveQuality, isAdaptive, LADDER, LOW_RUNG, FLOOR_RUNG, CAP_RUNG } from '../render/quality.js';
import {
  ADAPT, ADAPT_CAPPED, CAP30, DEFAULT_MEMORY, createFrameGovernor, createFramePacer, hasMemory, readMemory,
  writeMemory, planWalkStart, noteStepDown, noteRetryHeld,
} from '../render/adaptive.js';
import { sanitizeProfile, startRungFor, isHot, describeProfile } from '../render/deviceprofile.js';
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
  device: deviceAtBoot = null,
}) {
  // Two governors, one in use: the ordinary one, and the one for a display
  // the app says is held at 30 (Low Power Mode). See ADAPT_CAPPED.
  const openGovernor = createFrameGovernor();
  const cappedGovernor = createFrameGovernor(ADAPT_CAPPED);
  let device = sanitizeProfile(deviceAtBoot); // null in Safari and on desktop
  let governor = device?.lowPower ? cappedGovernor : openGovernor;
  let limits = device?.lowPower ? ADAPT_CAPPED : ADAPT;
  const pacer = createFramePacer();
  // One object, mutated in place, so a HUD can hold on to it. `rung` runs to
  // CAP_RUNG (the lite rung with the 30 fps cap on); `cap30` says the same
  // thing as a flag, for the render loop and the readout.
  // `device` is the profile as one line of text ('' without one).
  const status = {
    mode: 'auto', rung: 0, startRung: 0, startReason: 'top', change: '', cap30: false,
    device: describeProfile(device),
  };
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
  // Temporary rungs: taken because of the device's state right now, never
  // written to the memory. memoryPressed is "iOS warned about memory during
  // this page load". tempDrop is how many temporary rungs this walk is
  // carrying on top of the remembered one; pendingDrops are temporary steps
  // asked for mid-walk (deviceChanged has no session), taken one a frame.
  let memoryPressed = false;
  let tempDrop = 0;
  let pendingDrops = 0;
  let pendingWhy = '';
  let walking = false; // between an Auto beginWalk and the next beginWalk

  const tempWanted = () => (isHot(device?.thermal) ? 1 : 0) + (memoryPressed ? 1 : 0);
  const tempWhy = () => [isHot(device?.thermal) ? 'running hot' : '', memoryPressed ? 'memory warning' : '']
    .filter(Boolean).join(', ');

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
    tempDrop = 0;
    pendingDrops = 0;
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
      // No memory yet: the device profile's table says where to start (0
      // without a profile, which is the top, as it always was). From this
      // walk on the memory exists, so the table is never asked again and
      // what the frames say is what is remembered. steppedAt stays 0, so
      // the retry tries one rung higher as soon as five walks have started:
      // the table is a guess, and this is how a low guess is corrected.
      const fresh = !hasMemory(storage);
      const seeded = fresh ? startRungFor(device) : 0;
      const remembered = fresh ? { ...DEFAULT_MEMORY, rung: seeded } : readMemory(storage);
      const plan = planWalkStart(remembered, wallClock());
      mem = plan.mem;
      startMem = { ...mem };
      writeMemory(storage, mem);
      retryPending = plan.reason === 'retry';
      // Running hot, or warned about memory: one rung lower each for this
      // walk, on top of the remembered rung and never written to it.
      tempDrop = Math.min(tempWanted(), CAP_RUNG - plan.rung);
      startRung = plan.rung + tempDrop;
      tier = resolveQuality({ reducedMotion, override, rung: startRung });
      status.mode = 'auto';
      status.startReason = (seeded > 0 ? 'device' : plan.reason) + (tempDrop > 0 ? ` +${tempDrop} ${tempWhy()}` : '');
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
    walking = adaptive;
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

  // What the memory holds after a step the frames earned: one rung below what
  // it held. That is `to` itself on an ordinary walk; on a walk carrying a
  // temporary rung (hot, memory warning) it is one less, so the heat is not
  // remembered along with the slowness.
  const rememberedAfterStep = () => Math.min(CAP_RUNG, mem.rung + 1);

  // A temporary step: the same live changes as a step the frames earned,
  // with nothing judged and nothing written. On the floor rung the step is
  // the 30 fps cap, taken without the evenness test (nothing was measured).
  function tempStep(session, nowMs, why) {
    const from = status.rung;
    if (from >= CAP_RUNG) return;
    const to = from + 1;
    if (to === CAP_RUNG) {
      status.cap30 = true;
      pacer.reset();
    } else {
      applyLive(to, session, nowMs);
    }
    tempDrop += 1;
    status.rung = to;
    status.change = `${from}→${to === CAP_RUNG ? '30 fps' : to}: ${why} (not remembered` +
      (to === LOW_RUNG ? ', next walk)' : ')');
    governor.restart(nowMs, ADAPT.settleMs);
  }

  // The app's 'whisker-device' event (main.js passes event.detail straight
  // in). Running hot and a memory warning each ask for one temporary rung,
  // once: a second 'serious' while already hot, or a second warning in the
  // same page load, asks for nothing more. Cooling down changes nothing in
  // the walk that is on (nothing pops back); the next walk starts without
  // the rung. A change of Low Power Mode swaps the governor and gives it a
  // fresh warm-up, since every frame time has just changed meaning.
  function deviceChanged(detail) {
    const next = sanitizeProfile(detail);
    if (!next) return;
    const wasHot = isHot(device?.thermal);
    const wasCapped = device?.lowPower === true;
    device = next;
    status.device = describeProfile(device);
    if (next.lowPower !== wasCapped) {
      governor = next.lowPower ? cappedGovernor : openGovernor;
      limits = next.lowPower ? ADAPT_CAPPED : ADAPT;
      armPending = true;
    }
    const asks = [];
    if (isHot(next.thermal) && !wasHot) asks.push('running hot');
    if (detail.memoryWarning === true && !memoryPressed) {
      memoryPressed = true;
      asks.push('memory warning');
    }
    // Never more temporary rungs than there are reasons for right now: a
    // device that cools and heats again within one walk already has its rung.
    const room = tempWanted() - tempDrop - pendingDrops;
    if (walking && asks.length > 0 && room > 0) {
      pendingDrops += Math.min(asks.length, room);
      pendingWhy = asks.join(', ');
    }
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
      mem = noteStepDown(mem, rememberedAfterStep(), wallClock());
      writeMemory(storage, mem);
      retryPending = false;
      status.rung = to;
      status.change = `${from}→30 fps: ${pct}% of frames over ${limits.slowMs} ms for ${limits.windowMs / 1000} s`;
      return;
    }
    applyLive(to, session, nowMs);
    mem = noteStepDown(mem, rememberedAfterStep(), wallClock());
    writeMemory(storage, mem);
    retryPending = false;
    status.rung = to;
    status.change = `${from}→${to}: ${pct}% of frames over ${limits.slowMs} ms for ${limits.windowMs / 1000} s` +
      (to === LOW_RUNG ? ' (next walk)' : to === FLOOR_RUNG ? ' (fewer strays, no clouds, thinner grass next walk)' : '');
    // LOW changes nothing in this walk, so this walk can say nothing about
    // it: adapting rests until the next walk has been built on it.
    if (to === LOW_RUNG) halted = true;
    governor.restart(nowMs, ADAPT.settleMs);
  }

  // Allocates nothing except at a step-down.
  function frame(session, nowMs) {
    if (!adaptive || !session) return;
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
    // A temporary step asked for since the last frame (the device ran hot,
    // or iOS warned about memory). After any fade, one a frame, and even on
    // a walk that has stopped judging its frames.
    if (pendingDrops > 0) {
      pendingDrops -= 1;
      tempStep(session, nowMs, pendingWhy);
      return;
    }
    if (halted || status.rung >= CAP_RUNG) return;
    // On a display already held at 30 the cap has nothing to even out.
    if (limits === ADAPT_CAPPED && status.rung >= FLOOR_RUNG) return;
    if (governor.sample(nowMs)) {
      stepDown(session, nowMs);
    } else if (retryPending && tempDrop === 0 && governor.judged()) {
      // (A retry judged while a temporary rung is on was not judged on the
      // rung being retried: it stays pending and the next walk tries again.)
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

  return { beginWalk, frame, shouldRender, deviceChanged, status };
}
