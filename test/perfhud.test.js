import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatPerfLines, formatDiagHtml, createPerfHud, DIAG_SHOWN } from '../src/ui/perfhud.js';
import { createDiagnostics } from '../src/diagnostics.js';

const sample = {
  fps: 58.2, frameMs: 17.2, worstMs: 41.04, workMs: 6.1,
  tierName: 'high', quality: 'auto', coarse: false,
  shadowMapSize: 2048, postFx: true, normalMaps: true,
  pixelRatio: 2, bufferW: 2560, bufferH: 1440, strays: 22,
  adapt: 'auto rung 0/5 · start 0 (top)',
  frame: { calls: 1110, triangles: 109402, shadowCalls: 412, sceneCalls: 690, otherCalls: 8, sceneRenders: 1, renders: 3 },
};

describe('formatPerfLines', () => {
  it('formats the eight readout lines', () => {
    expect(formatPerfLines(sample)).toEqual([
      '58 fps · 17.2 ms · worst 41.0 ms (3 s)',
      'cpu 6.1 ms',
      'tier high · setting auto · touch no',
      'shadow 2048 · postFx on · normals on',
      'auto rung 0/5 · start 0 (top)',
      'px ratio 2 · 2560×1440 · strays 22',
      'draws 1110 · shadow 412 · scene 690 · other 8',
      'tris 109,402 · scene passes 1',
    ]);
  });

  it('appends the build stamp to the cpu line only when one is given', () => {
    expect(formatPerfLines({ ...sample, build: 'a1b2c3d · 2026-11-11' })[1]).toBe('cpu 6.1 ms · build a1b2c3d · 2026-11-11');
    expect(formatPerfLines({ ...sample, build: '' })[1]).toBe('cpu 6.1 ms');
  });

  it('adds the device line only when the app supplied a profile', () => {
    const lines = formatPerfLines({ ...sample, device: 'iPad7,11 · 2.9 GB · thermal nominal · low power off' });
    expect(lines).toHaveLength(9);
    expect(lines[8]).toBe('iPad7,11 · 2.9 GB · thermal nominal · low power off');
    expect(formatPerfLines({ ...sample, device: '' })).toHaveLength(8);
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
    Object.assign(adapter.status, { mode: 'auto', rung: 0, startRung: 0, startReason: 'top', change: '', cap30: false });
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
    expect(line(4)).toBe('auto rung 0/5 · start 0 (top)');
    Object.assign(adapter.status, { rung: 1, change: '0→1: 72% of frames over 20 ms for 4 s' });
    hud.frameStart(1600, session);
    hud.frameEnd(session, 1602);
    expect(line(4)).toBe('auto rung 1/5 · start 0 (top) · 0→1: 72% of frames over 20 ms for 4 s');
  });

  it('says a forced rung is forced', () => {
    hud.setEnabled(true);
    Object.assign(adapter.status, { mode: 'forced', rung: 2, startRung: 2, startReason: 'forced' });
    hud.frameStart(1000, session);
    hud.frameEnd(session, 1002);
    expect(line(4)).toBe('forced rung 2/5 (?rung)');
  });

  it('names the rungs below LOW by their label, and says when the shadow pass is off', () => {
    hud.setEnabled(true);
    const lite = { ...session, useComposer: false, tier: { name: 'low', label: 'lite', shadowMapSize: 0, postFx: false, normalMaps: false } };
    hud.frameStart(1000, lite);
    hud.frameEnd(lite, 1002);
    expect(line(2)).toBe('tier lite · setting auto · touch no');
    expect(line(3)).toBe('shadow off · postFx off · normals off');
  });

  it('shows the 30 fps cap as the floor rung plus the cap, never a seventh rung', () => {
    hud.setEnabled(true);
    Object.assign(adapter.status, { rung: 6, startRung: 5, startReason: 'remembered', cap30: true, change: '5→30 fps: 62% of frames over 20 ms for 4 s' });
    hud.frameStart(1000, session);
    hud.frameEnd(session, 1002);
    expect(line(4)).toBe('auto rung 5/5 + 30 fps cap · start 5 (remembered) · 5→30 fps: 62% of frames over 20 ms for 4 s');
    Object.assign(adapter.status, { rung: 6, startRung: 6, change: '' });
    hud.frameStart(1600, session);
    hud.frameEnd(session, 1602);
    expect(line(4)).toBe('auto rung 5/5 + 30 fps cap · start 5 + cap (remembered)');
    Object.assign(adapter.status, { mode: 'forced', startReason: 'forced' });
    hud.frameStart(2200, session);
    hud.frameEnd(session, 2202);
    expect(line(4)).toBe('forced rung 5/5 + 30 fps cap (?rung)');
    Object.assign(adapter.status, { cap30: false });
  });

  it('prints the device profile from the adapter, live', () => {
    hud.setEnabled(true);
    hud.frameStart(1000, session);
    hud.frameEnd(session, 1002);
    expect(el.textContent.split('\n')).toHaveLength(8);
    adapter.status.device = 'iPad7,11 · 2.9 GB · thermal serious · low power off';
    hud.frameStart(1600, session);
    hud.frameEnd(session, 1602);
    expect(line(8)).toBe('iPad7,11 · 2.9 GB · thermal serious · low power off');
    adapter.status.device = '';
  });

  it('shows the build stamp on the live cpu line when the hud is given one', () => {
    const stamped = createPerfHud({ renderer, settings, coarse: false, adapter, build: 'a1b2c3d' });
    stamped.setEnabled(true);
    stamped.frameStart(1000, session);
    stamped.frameEnd(session, 1002);
    expect(el.textContent.split('\n')[1]).toBe('cpu 2.0 ms · build a1b2c3d');
    stamped.setEnabled(false);
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

describe('formatDiagHtml', () => {
  const at = (h, m, sec) => new Date(2026, 10, 11, h, m, sec).getTime();
  const entry = (over) => ({ time: at(9, 5, 7), kind: 'frame', message: 'TypeError: x', source: '', line: 0, count: 1, ...over });

  it('is nothing at all while nothing has gone wrong', () => {
    expect(formatDiagHtml([], 0, false)).toBe('');
    expect(formatDiagHtml([], 0, true)).toBe('');
  });

  it('is one line, closed', () => {
    expect(formatDiagHtml([entry()], 1, false)).toBe('<div class="diag-head">⚠ 1 error ▸</div>');
    expect(formatDiagHtml([entry({ count: 3 })], 3, false)).toBe('<div class="diag-head">⚠ 3 errors ▸</div>');
  });

  it('opens on the last few entries, newest first, escaped', () => {
    const list = [
      entry({ message: 'oldest' }),
      ...Array.from({ length: DIAG_SHOWN }, (_, i) => entry({ message: `m${i}`, time: at(10, i, 0) })),
      entry({ kind: 'gl', message: '<b>lost</b>', source: 'main.js', line: 12, count: 2, time: at(23, 59, 59) }),
    ];
    const html = formatDiagHtml(list, 9, true);
    expect(html.startsWith('<div class="diag-head">⚠ 9 errors ▾</div>')).toBe(true);
    const lines = html.match(/<div class="diag-line">[^]*?<\/div>/g);
    expect(lines).toHaveLength(DIAG_SHOWN);
    expect(lines[0]).toBe('<div class="diag-line">23:59:59 gl ×2 · &lt;b&gt;lost&lt;/b&gt; (main.js:12)</div>');
    expect(lines[1]).toBe(`<div class="diag-line">10:0${DIAG_SHOWN - 1}:00 frame · m${DIAG_SHOWN - 1}</div>`);
    expect(html).not.toContain('oldest');
  });
});

describe('createPerfHud with diagnostics', () => {
  let made;
  const settings = { get: () => 'auto' };
  const session = { scene: { isScene: true }, tier: { name: 'high' }, strayCats: { strays: [] } };

  function fakeEl() {
    const classes = new Set();
    const listeners = {};
    return {
      id: '', textContent: '', innerHTML: '', attrs: {}, listeners,
      set className(v) { classes.clear(); v.split(' ').forEach((c) => c && classes.add(c)); },
      classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
      get hidden() { return classes.has('hidden'); },
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(type, fn) { listeners[type] = fn; },
    };
  }

  beforeEach(() => {
    made = [];
    vi.stubGlobal('document', {
      createElement: () => { const e = fakeEl(); made.push(e); return e; },
      body: { appendChild: vi.fn() },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const setup = () => {
    const diagnostics = createDiagnostics({ now: () => 0 });
    const hud = createPerfHud({ renderer: fakeRenderer(), settings, coarse: false, adapter: { status: null }, diagnostics });
    hud.setEnabled(true);
    return { diagnostics, hud };
  };
  const diagEl = () => made.find((e) => e.id === 'perf-diag');

  it('adds no element while nothing has gone wrong', () => {
    const { hud } = setup();
    hud.frameStart(1000, session);
    hud.frameEnd(session, 1002);
    hud.frameStart(1600, null);
    hud.frameEnd(null, 1602);
    expect(diagEl()).toBeUndefined();
  });

  it('shows one line once something has, on the home screen too, and opens on a tap', () => {
    const { diagnostics, hud } = setup();
    diagnostics.note('frame', new Error('boom'));
    hud.frameStart(1000, null);
    hud.frameEnd(null, 1002);
    const el = diagEl();
    expect(el.hidden).toBe(false);
    expect(el.attrs.role).toBe('button');
    expect(el.innerHTML).toBe('<div class="diag-head">⚠ 1 error ▸</div>');
    el.listeners.click();
    expect(el.innerHTML).toContain('frame · Error: boom');
    el.listeners.click();
    expect(el.innerHTML).toBe('<div class="diag-head">⚠ 1 error ▸</div>');
  });

  it('redraws only when the record changed, at most every 500 ms', () => {
    const { diagnostics, hud } = setup();
    diagnostics.note('save', 'quota');
    hud.frameStart(1000, session);
    hud.frameEnd(session, 1002);
    const el = diagEl();
    let writes = 0;
    let html = el.innerHTML;
    Object.defineProperty(el, 'innerHTML', { get: () => html, set: (v) => { html = v; writes++; } });
    hud.frameStart(1600, session);
    hud.frameEnd(session, 1602);
    expect(writes).toBe(0);
    diagnostics.note('save', 'quota');
    hud.frameStart(1700, session);
    hud.frameEnd(session, 1702);
    expect(writes).toBe(0);
    hud.frameStart(2200, session);
    hud.frameEnd(session, 2202);
    expect(writes).toBe(1);
    expect(html).toBe('<div class="diag-head">⚠ 2 errors ▸</div>');
  });

  it('draws on demand once the loop has stopped, only while the readout is on', () => {
    const { diagnostics, hud } = setup();
    diagnostics.note('gl', 'graphics context lost');
    hud.showDiagnostics();
    expect(diagEl().innerHTML).toBe('<div class="diag-head">⚠ 1 error ▸</div>');
    hud.setEnabled(false);
    diagnostics.note('gl', 'again');
    hud.showDiagnostics();
    expect(diagEl().innerHTML).toBe('<div class="diag-head">⚠ 1 error ▸</div>');
  });

  it('hides with the readout', () => {
    const { diagnostics, hud } = setup();
    diagnostics.note('gl', 'graphics context lost');
    hud.frameStart(1000, session);
    hud.frameEnd(session, 1002);
    hud.setEnabled(false);
    expect(diagEl().hidden).toBe(true);
  });
});
