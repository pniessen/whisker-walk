// Frame timing and per-frame draw-call counting for the performance readout.
// No DOM and no three import — this stays a leaf module so it can be
// unit-tested headless in vitest's node environment (same reason as
// quality.js). The readout overlay builds on top of it and owns all strings.
//
// Why the counter turns info.autoReset off: three.js resets renderer.info at
// the top of every renderer.render(). The EffectComposer's bloom and output
// passes each call renderer.render(fullscreenQuad, camera), so after
// composer.render() the info holds only the last full-screen pass, not the
// frame. That is the double-count trap in reverse: read info naively and the
// scene's real cost vanishes. With autoReset off we reset once per frame
// ourselves and the counts accumulate across the scene render, the shadow
// pass and every composer pass.
//
// Shadow draws happen inside renderer.render() (shadowMap.render is called
// from it), so they are already in the enclosing delta; wrapping
// shadowMap.render lets us split them back out. Nothing on a per-frame path
// here allocates: typed arrays, one preallocated frame object, and wrappers
// built once with explicit parameters (no rest args).
//
// A WebGL context loss and restore (iOS Safari does this under memory
// pressure) runs three's initGLContext(), which builds a NEW renderer.info and
// a NEW renderer.shadowMap. beginFrame notices either swap with two identity
// compares and re-attaches to the live objects; uninstall only puts back what
// is still ours, so it never writes a dead closure onto a live object or
// clobbers a wrapper someone installed after us.

// Frame timing. tick(now) once per animation frame, work(ms) with the CPU
// time of the tick body.
export function createFrameStats({
  capacity = 512,
  windowMs = 3000,
  smoothing = 0.1,
  pauseMs = 1000,
} = {}) {
  const stamps = new Float64Array(capacity);
  const gaps = new Float64Array(capacity);
  let head = 0;       // next slot to write
  let count = 0;      // valid slots, up to capacity
  let last = -1;      // previous tick time; -1 means none yet
  let ema = 0;        // 0 means no interval recorded yet
  let workEma = 0;

  function tick(nowMs) {
    const prev = last;
    last = nowMs;
    if (prev < 0) return;
    const dt = nowMs - prev;
    // A backgrounded tab or a debugger pause is not a slow frame: drop the
    // interval and let the average start over from the next real one.
    if (dt > pauseMs || dt < 0) { ema = 0; return; }
    stamps[head] = nowMs;
    gaps[head] = dt;
    head = (head + 1) % capacity;
    if (count < capacity) count++;
    ema = ema === 0 ? dt : ema + (dt - ema) * smoothing;
  }

  function work(ms) {
    workEma = workEma === 0 ? ms : workEma + (ms - workEma) * smoothing;
  }

  function worstMs(nowMs) {
    const from = nowMs - windowMs;
    let worst = 0;
    for (let i = 0; i < count; i++) {
      if (stamps[i] >= from && gaps[i] > worst) worst = gaps[i];
    }
    return worst;
  }

  function reset() {
    head = 0;
    count = 0;
    last = -1;
    ema = 0;
    workEma = 0;
  }

  return {
    tick,
    work,
    fps() { return ema > 0 ? 1000 / ema : 0; },
    frameMs() { return ema; },
    worstMs,
    workMs() { return workEma; },
    reset,
  };
}

// Per-frame draw-call counting. Call beginFrame(scene) before the frame's
// first render and endFrame() after its last; read `frame` afterwards.
export function createRenderCounter(renderer) {
  let info = renderer.info;
  const frame = {
    calls: 0,
    triangles: 0,
    shadowCalls: 0,
    sceneCalls: 0,
    otherCalls: 0,
    sceneRenders: 0,
    renders: 0,
  };

  let walkScene = null;
  let shadowTotal = 0;   // shadow draws this frame
  let shadowInRender = 0; // shadow draws inside the render currently running
  let sceneCalls = 0;
  let otherCalls = 0;
  let sceneRenders = 0;
  let renders = 0;

  let origRender = null;
  let origShadowRender = null;
  let installed = false;

  const wrappedShadow = function (lights, scene, camera) {
    const before = info.render.calls;
    origShadowRender.call(renderer.shadowMap, lights, scene, camera);
    const d = info.render.calls - before;
    shadowTotal += d;
    shadowInRender += d;
  };

  const wrappedRender = function (scene, camera) {
    const before = info.render.calls;
    shadowInRender = 0;
    const out = origRender.call(renderer, scene, camera);
    const d = info.render.calls - before;
    renders++;
    if (scene === walkScene) {
      sceneCalls += d - shadowInRender;
      sceneRenders++;
    } else {
      otherCalls += d;
    }
    return out;
  };

  const counter = {
    frame,
    get installed() { return installed; },
    install() {
      if (installed) return;
      installed = true;
      origRender = renderer.render;
      origShadowRender = renderer.shadowMap.render;
      info = renderer.info;
      info.autoReset = false;
      renderer.render = wrappedRender;
      renderer.shadowMap.render = wrappedShadow;
    },
    uninstall() {
      if (!installed) return;
      installed = false;
      // Put back only what is still ours: a later wrapper stays, and a
      // shadowMap rebuilt by a context restore keeps its own render.
      if (renderer.render === wrappedRender) renderer.render = origRender;
      if (renderer.shadowMap.render === wrappedShadow) {
        renderer.shadowMap.render = origShadowRender;
      }
      renderer.info.autoReset = true;
    },
    beginFrame(scene) {
      if (installed) {
        // After a context restore, info and shadowMap are new objects.
        if (renderer.info !== info) {
          info = renderer.info;
          info.autoReset = false;
        }
        if (renderer.shadowMap.render !== wrappedShadow) {
          origShadowRender = renderer.shadowMap.render;
          renderer.shadowMap.render = wrappedShadow;
        }
      }
      info.reset();
      walkScene = scene;
      shadowTotal = 0;
      shadowInRender = 0;
      sceneCalls = 0;
      otherCalls = 0;
      sceneRenders = 0;
      renders = 0;
    },
    endFrame() {
      frame.calls = info.render.calls;
      frame.triangles = info.render.triangles;
      frame.shadowCalls = shadowTotal;
      frame.sceneCalls = sceneCalls;
      frame.otherCalls = otherCalls;
      frame.sceneRenders = sceneRenders;
      frame.renders = renders;
    },
  };
  return counter;
}
