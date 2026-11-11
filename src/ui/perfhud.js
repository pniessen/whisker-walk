// In-game performance readout: fps, frame time, draw calls, the render
// knobs in effect and the adaptive Auto rung, so the owner can take a real
// baseline on desktop and on a phone before any graphics work. Off by
// default — the children never see it. Enabled by the Settings checkbox or
// a ?perf URL flag (main.js).
//
// formatPerfLines is pure and DOM-free so it unit-tests headless. The hook
// path (frameStart / frameEnd) allocates nothing: it only ticks typed-array
// stats and reuses one snapshot object. Strings are built only in the 500 ms
// text refresh, so measuring does not disturb what is being measured.
import { createFrameStats, createRenderCounter } from '../render/perfstats.js';
import { FLOOR_RUNG } from '../render/quality.js';

const REFRESH_MS = 500;
const DASH = '–';

const onOff = (v) => (v ? 'on' : 'off');

export function formatPerfLines(s) {
  const f = s.frame;
  const hasData = s.fps > 0;
  const fps = hasData ? String(Math.round(s.fps)) : DASH;
  const ms = hasData ? s.frameMs.toFixed(1) : DASH;
  const worst = hasData ? s.worstMs.toFixed(1) : DASH;
  return [
    `${fps} fps · ${ms} ms · worst ${worst} ms (3 s)`,
    `cpu ${s.workMs.toFixed(1)} ms`,
    `tier ${s.tierName} · setting ${s.quality} · touch ${s.coarse ? 'yes' : 'no'}`,
    `shadow ${s.shadowMapSize > 0 ? s.shadowMapSize : 'off'} · postFx ${onOff(s.postFx)} · normals ${onOff(s.normalMaps)}`,
    s.adapt,
    `px ratio ${+s.pixelRatio.toFixed(2)} · ${s.bufferW}×${s.bufferH} · strays ${s.strays}`,
    `draws ${f.calls} · shadow ${f.shadowCalls} · scene ${f.sceneCalls} · other ${f.otherCalls}`,
    `tris ${f.triangles.toLocaleString('en-US')} · scene passes ${f.sceneRenders}`,
    // Only in the iPhone and iPad app, which says what it is running on
    // (render/deviceprofile.js): the model, memory, heat and Low Power Mode.
    ...(s.device ? [s.device] : []),
  ];
}

// The adaptive-quality line, from game/adaptquality.js's status object.
// Built only in the 500 ms refresh, never per frame.
export function formatAdapt(st) {
  if (!st) return DASH;
  if (st.mode === 'manual') return 'manual';
  if (st.mode === 'reduced-motion') return 'reduced motion';
  // ?rung=N: held there for the page load, nothing stepped or remembered.
  // The 30 fps cap is the step after the last rung (CAP_RUNG): shown as the
  // floor rung plus the cap, never as a seventh rung.
  const rung = (r) => `${Math.min(r, FLOOR_RUNG)}/${FLOOR_RUNG}${r > FLOOR_RUNG || (r === st.rung && st.cap30) ? ' + 30 fps cap' : ''}`;
  if (st.mode === 'forced') return `forced rung ${rung(st.rung)} (?rung)`;
  const start = `${Math.min(st.startRung, FLOOR_RUNG)}${st.startRung > FLOOR_RUNG ? ' + cap' : ''}`;
  const base = `auto rung ${rung(st.rung)} · start ${start} (${st.startReason})`;
  return st.change ? `${base} · ${st.change}` : base;
}

export function createPerfHud({ renderer, settings, coarse, adapter }) {
  const stats = createFrameStats();
  const counter = createRenderCounter(renderer);
  // One snapshot object, refilled on each refresh, so formatPerfLines gets a
  // plain value bag without a fresh allocation per update.
  const snap = {
    fps: 0, frameMs: 0, worstMs: 0, workMs: 0,
    tierName: '', quality: '', coarse: !!coarse,
    shadowMapSize: 0, postFx: false, normalMaps: false,
    pixelRatio: 1, bufferW: 0, bufferH: 0, strays: 0,
    adapt: '',
    device: '',
    frame: counter.frame,
  };

  let el = null;
  let enabled = false;
  let startedAt = 0;
  let lastRefresh = 0;

  function ensureEl() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'perf-readout';
    el.className = 'hidden';
    document.body.appendChild(el);
    return el;
  }

  function setEnabled(on) {
    on = !!on;
    if (on === enabled) return;
    enabled = on;
    if (on) {
      ensureEl();
      counter.install();
      stats.reset();
      lastRefresh = 0;
    } else {
      counter.uninstall();
      if (el) el.classList.add('hidden');
    }
  }

  // session is passed in beside the timestamp (null at the home base, where
  // there is nothing to count and we only keep the frame clock honest).
  function frameStart(now, session) {
    if (!enabled) return;
    stats.tick(now);
    startedAt = now;
    if (session) counter.beginFrame(session.scene);
  }

  function frameEnd(session, now) {
    if (!enabled) return;
    if (!session) { el.classList.add('hidden'); return; }
    counter.endFrame();
    stats.work(now - startedAt);
    if (now - lastRefresh < REFRESH_MS) return;
    lastRefresh = now;
    const tier = session.tier;
    snap.fps = stats.fps();
    snap.frameMs = stats.frameMs();
    snap.worstMs = stats.worstMs(now);
    snap.workMs = stats.workMs();
    // The label tells the rungs below LOW apart; their `name` is still 'low'.
    snap.tierName = tier?.label ?? tier?.name ?? '?';
    snap.quality = settings.get('quality');
    snap.shadowMapSize = tier?.shadowMapSize ?? 0;
    // Live, not tier.postFx: the adapter can drop the composer mid-walk.
    snap.postFx = !!session.useComposer;
    snap.normalMaps = !!tier?.normalMaps;
    snap.pixelRatio = renderer.getPixelRatio();
    snap.bufferW = renderer.domElement.width;
    snap.bufferH = renderer.domElement.height;
    snap.strays = session.strayCats?.strays?.length ?? 0;
    snap.adapt = formatAdapt(adapter?.status);
    snap.device = adapter?.status?.device ?? '';
    el.textContent = formatPerfLines(snap).join('\n');
    el.classList.remove('hidden');
  }

  return { setEnabled, frameStart, frameEnd, get enabled() { return enabled; } };
}
