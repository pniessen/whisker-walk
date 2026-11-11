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
import { escapeHtml } from '../game/util.js';

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
    // The build stamp rides on this line (when given), so a ?perf screenshot
    // from a child's device says which build it came from.
    `cpu ${s.workMs.toFixed(1)} ms${s.build ? ` · build ${s.build}` : ''}`,
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

// The diagnostics line (src/diagnostics.js): nothing at all while nothing has
// gone wrong, one line ("⚠ 3 errors ▸") once something has, and the last few
// entries, newest first, when that line is tapped open. Its own element, so
// the readout above it is never taller than before.
export const DIAG_SHOWN = 4;
const pad2 = (n) => String(n).padStart(2, '0');
function clockOf(ms) {
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}` : '--:--:--';
}
export function formatDiagHtml(entries, total, open, shown = DIAG_SHOWN) {
  if (!total || !entries.length) return '';
  const head = `<div class="diag-head">⚠ ${total} ${total === 1 ? 'error' : 'errors'} ${open ? '▾' : '▸'}</div>`;
  if (!open) return head;
  const lines = entries.slice(-shown).reverse().map((e) => {
    const where = e.source ? ` (${e.source}${e.line ? `:${e.line}` : ''})` : '';
    const times = e.count > 1 ? ` ×${e.count}` : '';
    return `<div class="diag-line">${clockOf(e.time)} ${escapeHtml(e.kind)}${times} · ${escapeHtml(e.message)}${escapeHtml(where)}</div>`;
  });
  return head + lines.join('');
}

export function createPerfHud({ renderer, settings, coarse, adapter, diagnostics = null, build = '' }) {
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
    build: String(build || ''),
    frame: counter.frame,
  };

  let el = null;
  let enabled = false;
  let startedAt = 0;
  let lastRefresh = 0;
  // The diagnostics line: drawn again only when the record or the open state
  // changed (diagnostics.version), and only on the 500 ms refresh.
  let diagEl = null;
  let diagDrawn = -1;
  let diagOpen = false;

  function refreshDiag() {
    if (!diagnostics || diagnostics.version === diagDrawn) return;
    diagDrawn = diagnostics.version;
    const html = formatDiagHtml(diagnostics.entries(), diagnostics.total, diagOpen);
    if (!html) { if (diagEl) diagEl.classList.add('hidden'); return; }
    if (!diagEl) {
      diagEl = document.createElement('div');
      diagEl.id = 'perf-diag';
      diagEl.setAttribute('role', 'button');
      diagEl.addEventListener('click', () => {
        diagOpen = !diagOpen;
        diagDrawn = -1;
        refreshDiag();
      });
      document.body.appendChild(diagEl);
    }
    diagEl.innerHTML = html;
    diagEl.classList.remove('hidden');
  }

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
      if (diagEl) diagEl.classList.add('hidden');
      diagDrawn = -1; // drawn afresh when the readout comes back
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
    if (!session) {
      el.classList.add('hidden');
      // The home screen too: a walk that ended on errors lands here.
      if (diagnostics && now - lastRefresh >= REFRESH_MS) { lastRefresh = now; refreshDiag(); }
      return;
    }
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
    refreshDiag();
  }

  // Draws the diagnostics line now: for when the render loop has stopped
  // (main.js stopLoop) and frameEnd will not come again.
  function showDiagnostics() {
    if (enabled) refreshDiag();
  }

  return { setEnabled, frameStart, frameEnd, showDiagnostics, get enabled() { return enabled; } };
}
