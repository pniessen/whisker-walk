import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatPerfLines, createPerfHud } from '../src/ui/perfhud.js';

const sample = {
  fps: 58.2, frameMs: 17.2, worstMs: 41.04, workMs: 6.1,
  tierName: 'high', quality: 'auto', coarse: false,
  shadowMapSize: 2048, postFx: true, normalMaps: true,
  pixelRatio: 2, bufferW: 2560, bufferH: 1440, strays: 22,
  adapt: 'auto rung 0/3 · start 0 (top)',
  frame: { calls: 1110, triangles: 109402, shadowCalls: 412, sceneCalls: 690, otherCalls: 8, sceneRenders: 1, renders: 3 },
};

describe('formatPerfLines', () => {
  it('formats the eight readout lines', () => {
    expect(formatPerfLines(sample)).toEqual([
      '58 fps · 17.2 ms · worst 41.0 ms (3 s)',
      'cpu 6.1 ms',
      'tier high · setting auto · touch no',
      'shadow 2048 · postFx on · normals on',
      'auto rung 0/3 · start 0 (top)',
      'px ratio 2 · 2560×1440 · strays 22',
      'draws 1110 · shadow 412 · scene 690 · other 8',
      'tris 109,402 · scene passes 1',
    ]);
  });

  it('shows dashes before any frame data exists', () => {
    const lines = formatPerfLines({ ...sample, fps: 0, frameMs: 0, worstMs: 0 });
    expect(lines[0]).toBe('– fps · – ms · worst – ms (3 s)');
  });

  it('says off and yes for the other branches', () => {
    const lines = formatPerfLines({ ...sample, postFx: false, normalMaps: false, coarse: true });
    expect(lines[2]).toContain('touch yes');
    expect(lines[3]).toBe('shadow 2048 · postFx off · normals off');
  });

  it('prints a fractional pixel ratio cleanly', () => {
    expect(formatPerfLines({ ...sample, pixelRatio: 2.625 })[5]).toContain('px ratio 2.63 ');
    expect(formatPerfLines({ ...sample, pixelRatio: 1.5000001 })[5]).toContain('px ratio 1.5 ');
  });
});

function fakeRenderer() {
  const info = {
    autoReset: true,
    render: { calls: 0, triangles: 0 },
    reset() { this.render.calls = 0; this.render.triangles = 0; },
  };
  return {
    info,
    shadowMap: { render() {} },
    render() { info.render.calls += 5; },
    getPixelRatio: () => 2,
    domElement: { width: 800, height: 600 },
  };
}

describe('createPerfHud', () => {
  let el;
  let renderer;
  let hud;
  const session = { scene: { isScene: true }, tier: { name: 'high', shadowMapSize: 2048, postFx: true, normalMaps: true }, strayCats: { strays: [1, 2] } };
  const settings = { get: () => 'auto' };
  const adapter = { status: { mode: 'auto', rung: 0, startRung: 0, startReason: 'top', change: '' } };

  beforeEach(() => {
    const classes = new Set(['hidden']);
    el = {
      id: '', textContent: '',
      set className(v) { classes.clear(); v.split(' ').forEach((c) => c && classes.add(c)); },
      classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
      get hidden() { return classes.has('hidden'); },
      writes: 0,
    };
    let text = '';
    Object.defineProperty(el, 'textContent', { get: () => text, set: (v) => { text = v; el.writes++; } });
    vi.stubGlobal('document', { createElement: () => el, body: { appendChild: vi.fn() } });
    renderer = fakeRenderer();
    Object.assign(adapter.status, { mode: 'auto', rung: 0, startRung: 0, startReason: 'top', change: '' });
    session.useComposer = true;
    hud = createPerfHud({ renderer, settings, coarse: false, adapter });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('does nothing while disabled', () => {
    const orig = renderer.render;
    hud.frameStart(1000, session);
    hud.frameEnd(session, 1010);
    hud.frameEnd(null, 1020);
    expect(hud.enabled).toBe(false);
    expect(renderer.render).toBe(orig);
    expect(renderer.info.autoReset).toBe(true);
    expect(el.writes).toBe(0);
  });

  it('installs on enable and fully uninstalls on disable', () => {
    const orig = renderer.render;
    hud.setEnabled(true);
    expect(renderer.render).not.toBe(orig);
    expect(renderer.info.autoReset).toBe(false);
    hud.frameStart(1000, session);
    hud.frameEnd(session, 1010);
    hud.setEnabled(false);
    expect(renderer.render).toBe(orig);
    expect(renderer.info.autoReset).toBe(true);
    expect(el.hidden).toBe(true);
  });

  it('hides the element when there is no session', () => {
    hud.setEnabled(true);
    hud.frameStart(1000, session);
    hud.frameEnd(session, 1010);
    expect(el.hidden).toBe(false);
    hud.frameStart(1016, null);
    hud.frameEnd(null, 1017);
    expect(el.hidden).toBe(true);
  });

  it('refreshes the text at most every 500 ms', () => {
    hud.setEnabled(true);
    const run = (t) => { hud.frameStart(t, session); hud.frameEnd(session, t + 2); };
    run(1000);
    expect(el.writes).toBe(1);
    for (let t = 1016; t < 1450; t += 16) run(t);
    expect(el.writes).toBe(1);
    run(1600);
    expect(el.writes).toBe(2);
  });

  it('feeds frameEnd minus frameStart to the cpu line', () => {
    hud.setEnabled(true);
    hud.frameStart(1000, session);
    hud.frameEnd(session, 1007.5);
    expect(el.textContent.split('\n')[1]).toBe('cpu 7.5 ms');
    expect(el.textContent).toContain('strays 2');
    expect(el.textContent).toContain('800×600');
  });

  const line = (n) => el.textContent.split('\n')[n];

  it('prints the adaptive rung, its start and the last change', () => {
    hud.setEnabled(true);
    hud.frameStart(1000, session);
    hud.frameEnd(session, 1002);
    expect(line(4)).toBe('auto rung 0/3 · start 0 (top)');
    Object.assign(adapter.status, { rung: 1, change: '0→1: 72% of frames over 20 ms for 4 s' });
    hud.frameStart(1600, session);
    hud.frameEnd(session, 1602);
    expect(line(4)).toBe('auto rung 1/3 · start 0 (top) · 0→1: 72% of frames over 20 ms for 4 s');
  });

  it('says manual or reduced motion with no rung', () => {
    hud.setEnabled(true);
    Object.assign(adapter.status, { mode: 'manual', rung: 3, startRung: 3, startReason: 'manual' });
    hud.frameStart(1000, session);
    hud.frameEnd(session, 1002);
    expect(line(4)).toBe('manual');
    Object.assign(adapter.status, { mode: 'reduced-motion', startReason: 'reduced-motion' });
    hud.frameStart(1600, session);
    hud.frameEnd(session, 1602);
    expect(line(4)).toBe('reduced motion');
  });

  it('reads postFx live from session.useComposer, not the walk-start tier', () => {
    hud.setEnabled(true);
    hud.frameStart(1000, session);
    hud.frameEnd(session, 1002);
    expect(line(3)).toContain('postFx on');
    session.useComposer = false;
    hud.frameStart(1600, session);
    hud.frameEnd(session, 1602);
    expect(line(3)).toContain('postFx off');
  });
});
