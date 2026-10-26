import { describe, it, expect } from 'vitest';
import { createFrameStats, createRenderCounter } from '../src/render/perfstats.js';

function steady(stats, t0, n, dt) {
  let t = t0;
  for (let i = 0; i < n; i++) { stats.tick(t); t += dt; }
  return t;
}

describe('frame stats', () => {
  it('60 ticks 16.667 ms apart → fps near 60, frameMs near 16.67', () => {
    const s = createFrameStats();
    steady(s, 1000, 61, 1000 / 60);
    expect(Math.abs(s.fps() - 60)).toBeLessThan(0.5);
    expect(Math.abs(s.frameMs() - 16.67)).toBeLessThan(0.2);
  });

  it('worst frame is remembered for the window, then ages out', () => {
    const s = createFrameStats();
    let t = steady(s, 0, 30, 16.7);
    // steady() returns the time of the next, not-yet-taken tick
    t = t - 16.7 + 50;
    s.tick(t);
    t = steady(s, t + 16.7, 10, 16.7);
    expect(s.worstMs(t)).toBeCloseTo(50, 5);
    // 3.1 s of ordinary frames later the spike is outside the 3 s window
    t = steady(s, t, Math.ceil(3100 / 16.7), 16.7);
    expect(s.worstMs(t)).toBeLessThan(17);
  });

  it('a 4000 ms gap is dropped', () => {
    const s = createFrameStats();
    let t = steady(s, 0, 20, 16.7);
    t += 4000;
    t = steady(s, t, 40, 16.7);
    expect(s.worstMs(t)).toBeLessThan(17);
    expect(s.fps()).toBeGreaterThan(55);
  });

  it('first tick records nothing', () => {
    const s = createFrameStats();
    s.tick(500);
    expect(s.fps()).toBe(0);
    expect(s.frameMs()).toBe(0);
    expect(s.worstMs(500)).toBe(0);
  });

  it('reset forgets everything', () => {
    const s = createFrameStats();
    steady(s, 0, 20, 16.7);
    s.reset();
    expect(s.fps()).toBe(0);
    expect(s.worstMs(400)).toBe(0);
  });

  it('work(6) repeatedly → workMs near 6', () => {
    const s = createFrameStats();
    for (let i = 0; i < 200; i++) s.work(6);
    expect(Math.abs(s.workMs() - 6)).toBeLessThan(0.1);
  });

  it('tick() allocates no arrays, and the ring wraps correctly', () => {
    const s = createFrameStats({ capacity: 64 });
    const RealF64 = globalThis.Float64Array;
    let made = 0;
    globalThis.Float64Array = new Proxy(RealF64, {
      construct(target, args) { made++; return new target(...args); },
    });
    let t;
    try {
      t = steady(s, 0, 2000, 16.7);
    } finally {
      globalThis.Float64Array = RealF64;
    }
    expect(made).toBe(0);
    expect(s.worstMs(t)).toBeGreaterThan(16);
    expect(s.worstMs(t)).toBeLessThan(17.5);
  });
});

function fakeInfo(autoReset = true) {
  return {
    autoReset,
    render: { calls: 0, triangles: 0 },
    reset() { this.render.calls = 0; this.render.triangles = 0; },
  };
}
// Reads r.info and r.shadowMap live, as three does, so a test can swap them.
function fakeShadowMap(r, perPass = 3) {
  return { render() { r.info.render.calls += perPass; } };
}
function fakeRenderer() {
  const r = {
    info: fakeInfo(),
    shadowMap: null,
    render(scene, cam) {
      if (scene.isScene) this.shadowMap.render([], scene, cam);
      this.info.render.calls += scene.drawCalls;
      this.info.render.triangles += scene.drawCalls * 100;
    },
  };
  r.shadowMap = fakeShadowMap(r);
  return r;
}
// What three r185's onContextRestore does: initGLContext() builds a new info
// and a new shadowMap, then copies autoReset across from the old info.
function contextRestore(r, perPass = 5) {
  const autoReset = r.info.autoReset;
  r.info = fakeInfo(autoReset);
  r.shadowMap = fakeShadowMap(r, perPass);
  return r.shadowMap.render;
}
const scene = { isScene: true, drawCalls: 10 };
const quad = { isMesh: true, drawCalls: 1 };

describe('render counter', () => {
  it('install sets autoReset false; uninstall restores originals and autoReset true', () => {
    const r = fakeRenderer();
    const origRender = r.render;
    const origShadow = r.shadowMap.render;
    const c = createRenderCounter(r);
    c.install();
    expect(c.installed).toBe(true);
    expect(r.info.autoReset).toBe(false);
    expect(r.render).not.toBe(origRender);
    expect(r.shadowMap.render).not.toBe(origShadow);
    c.uninstall();
    expect(c.installed).toBe(false);
    expect(r.render).toBe(origRender);
    expect(r.shadowMap.render).toBe(origShadow);
    expect(r.info.autoReset).toBe(true);
  });

  it('install twice then one uninstall → originals restored', () => {
    const r = fakeRenderer();
    const origRender = r.render;
    const origShadow = r.shadowMap.render;
    const c = createRenderCounter(r);
    c.install();
    c.install();
    c.uninstall();
    expect(r.render).toBe(origRender);
    expect(r.shadowMap.render).toBe(origShadow);
    c.uninstall();
    expect(r.render).toBe(origRender);
  });

  it('scene render + two quad renders are split into buckets', () => {
    const r = fakeRenderer();
    const c = createRenderCounter(r);
    c.install();
    c.beginFrame(scene);
    r.render(scene, {});
    r.render(quad, {});
    r.render(quad, {});
    c.endFrame();
    expect(c.frame).toMatchObject({
      calls: 15, shadowCalls: 3, sceneCalls: 10, otherCalls: 2, sceneRenders: 1, renders: 3,
    });
    expect(c.frame.triangles).toBe(1200);
  });

  it('calls made before beginFrame are not in the next frame', () => {
    const r = fakeRenderer();
    const c = createRenderCounter(r);
    c.install();
    r.render(scene, {});
    c.beginFrame(scene);
    r.render(quad, {});
    c.endFrame();
    expect(c.frame.calls).toBe(1);
    expect(c.frame.otherCalls).toBe(1);
    expect(c.frame.renders).toBe(1);
    expect(c.frame.shadowCalls).toBe(0);
  });

  it('frame is the same object across endFrame calls', () => {
    const r = fakeRenderer();
    const c = createRenderCounter(r);
    c.install();
    const f = c.frame;
    c.beginFrame(scene); r.render(scene, {}); c.endFrame();
    c.beginFrame(scene); c.endFrame();
    expect(c.frame).toBe(f);
    expect(f.calls).toBe(0);
  });

  it('wrapped render passes this, arguments and the return value through', () => {
    const r = fakeRenderer();
    const seen = [];
    r.render = function (s, cam) { seen.push(this, s, cam); return 'ok'; };
    const c = createRenderCounter(r);
    c.install();
    c.beginFrame(scene);
    const cam = {};
    expect(r.render(quad, cam)).toBe('ok');
    expect(seen).toEqual([r, quad, cam]);
  });

  it('after a context restore the next frame counts on the new info and shadowMap', () => {
    const r = fakeRenderer();
    const c = createRenderCounter(r);
    c.install();
    c.beginFrame(scene); r.render(scene, {}); c.endFrame();
    expect(c.frame.shadowCalls).toBe(3);
    contextRestore(r, 5);
    c.beginFrame(scene);
    r.render(scene, {});
    r.render(quad, {});
    c.endFrame();
    expect(c.frame).toMatchObject({
      calls: 16, shadowCalls: 5, sceneCalls: 10, otherCalls: 1, sceneRenders: 1, renders: 2,
    });
    expect(r.info.autoReset).toBe(false);
  });

  it('after a context restore uninstall leaves the new shadowMap its own render', () => {
    const r = fakeRenderer();
    const origRender = r.render;
    const c = createRenderCounter(r);
    c.install();
    c.beginFrame(scene); r.render(scene, {}); c.endFrame();
    const newShadowRender = contextRestore(r);
    c.beginFrame(scene); r.render(scene, {}); c.endFrame(); // re-wraps
    expect(r.shadowMap.render).not.toBe(newShadowRender);
    c.uninstall();
    expect(r.shadowMap.render).toBe(newShadowRender);
    expect(r.render).toBe(origRender);
    expect(r.info.autoReset).toBe(true);
  });

  it('a restore with no frame in between: uninstall still leaves the new shadowMap alone', () => {
    const r = fakeRenderer();
    const c = createRenderCounter(r);
    c.install();
    const newShadowRender = contextRestore(r);
    c.uninstall();
    expect(r.shadowMap.render).toBe(newShadowRender);
    expect(r.info.autoReset).toBe(true);
  });

  it('a later wrapper of renderer.render survives uninstall', () => {
    const r = fakeRenderer();
    const c = createRenderCounter(r);
    c.install();
    const ours = r.render;
    const later = function (s, cam) { return ours.call(this, s, cam); };
    r.render = later;
    c.uninstall();
    expect(r.render).toBe(later);
    expect(r.info.autoReset).toBe(true);
  });
});
