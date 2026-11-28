// The device performance log sampler (lazy chunk; main.js loads it after start-up and the For grown-ups
// settings load it on a tap). While a walk is on screen it keeps one tally of frame gaps (one add per frame) and,
// about every 30 s, writes ONE small row. Draw calls and triangles come from the Performance readout's counter
// when that is on, else from one measured frame at sample time. Nothing is sent from here: onSample hands each finished walk row to src/perfupload.js, which sends only when the grown-up's switch is on.
import { createRenderCounter } from './render/perfstats.js';
import {
  createGapTally, addRow, loadRows, saveRows, minuteStamp, cleanRow, SAMPLE_MS, MIN_FRAMES,
} from './perflogcore.js';

export * from './perflogcore.js';

const PAUSE_MS = 1000; // a longer gap is a backgrounded page, not a slow frame (perfstats.js does the same)

/**
 * deps: storage, renderer, build, now() clock, rung() -> { rung, tier }, device() -> the app's profile or null,
 * paint() -> seconds to the first paint or null. Returns { frame, end, onDevice }.
 */
export function startPerfLog({ storage, renderer = null, build = '', now = () => Date.now(), rung = () => ({}), device = () => null, paint = () => null, isApp = false, onSample = null, boot = () => performance.now() }) {
  const tally = createGapTally();
  const launch = Math.floor(now() / 1000);
  let last = -1;
  let windowStart = -1;
  let place = '';
  let live = { thermal: 'nominal', lowPower: false };
  let counter = null;
  let pending = null;
  let firstWalkDone = false;

  const profile = () => { try { return device(); } catch { return null; } };
  const mem = () => profile()?.memoryGB ?? (typeof globalThis.navigator?.deviceMemory === 'number' ? globalThis.navigator.deviceMemory : null);
  const model = () => profile()?.model ?? '';
  const write = (row) => {
    const rows = addRow(loadRows(storage), row);
    saveRows(storage, rows);
    if (onSample && row.kind === 'walk') { try { onSample(rows[rows.length - 1]); } catch { /* the upload is optional */ } }
  };

  write({ kind: 'start', time: minuteStamp(now()), device: model(), build, memoryGB: mem(), app: isApp, firstFrameS: paint(), launch });

  function markFirstWalk() {
    if (firstWalkDone) return;
    firstWalkDone = true;
    const rows = loadRows(storage);
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].kind === 'start' && rows[i].launch === launch) {
        rows[i].firstWalkS = boot() / 1000;
        if (rows[i].firstFrameS === null) rows[i].firstFrameS = rows[i].firstWalkS;
        saveRows(storage, rows.map(cleanRow).filter(Boolean));
        return;
      }
    }
  }

  function finish(calls, tris) {
    const p = pending;
    pending = null;
    if (!p) return;
    write({ ...p, draws: calls, triangles: tris });
  }

  function release() {
    if (counter) { try { counter.uninstall(); } catch { /* the renderer is gone */ } counter = null; }
  }

  function sample(nowMs, session) {
    const r = rung();
    const row = {
      kind: 'walk', time: minuteStamp(now()), device: model(), build, memoryGB: mem(), place,
      rung: r.rung, tier: r.tier ?? '', medianMs: tally.percentile(0.5), p95Ms: tally.percentile(0.95),
      slowShare: tally.slowShare(), frames: tally.count, thermal: live.thermal, lowPower: live.lowPower,
    };
    tally.reset();
    windowStart = nowMs;
    const info = renderer?.info;
    if (!info) { write(row); return; }
    if (info.autoReset === false) {
      // the Performance readout's counter is running: its last whole frame is still here
      write({ ...row, draws: info.render.calls, triangles: info.render.triangles });
      return;
    }
    // Otherwise measure this one frame, then let go again.
    pending = row;
    try {
      counter = createRenderCounter(renderer);
      counter.install();
      counter.beginFrame(session.scene);
    } catch { release(); finish(0, 0); }
  }

  return {
    /** At the start of each walk frame (after the 30 fps cap's skip), with the clock and the walk (null at home). */
    frame(nowMs, session) {
      if (pending) { release(); finish(0, 0); } // the measured frame never finished: keep the row without counts
      const prev = last;
      last = nowMs;
      if (!session) { windowStart = -1; return; }
      markFirstWalk();
      const id = session.areaId ?? '';
      if (id !== place || windowStart < 0) {
        if (windowStart >= 0 && tally.count >= MIN_FRAMES) sample(nowMs, session);
        tally.reset();
        place = typeof id === 'string' ? id : '';
        windowStart = nowMs;
        return;
      }
      const dt = nowMs - prev;
      if (prev >= 0 && dt > 0 && dt <= PAUSE_MS) tally.add(dt);
      if (nowMs - windowStart >= SAMPLE_MS) {
        if (tally.count >= MIN_FRAMES) sample(nowMs, session);
        else { tally.reset(); windowStart = nowMs; }
      }
    },
    /** After the frame is drawn: finishes the one measured frame, if there is one. */
    end() {
      if (!pending || !counter) return;
      counter.endFrame();
      const { calls, triangles } = counter.frame;
      release();
      finish(calls, triangles);
    },
    /** The app's 'whisker-device' event detail: heat and Low Power Mode. */
    onDevice(d) {
      if (!d || typeof d !== 'object') return;
      if (['nominal', 'fair', 'serious', 'critical'].includes(d.thermal)) live = { ...live, thermal: d.thermal };
      if (typeof d.lowPower === 'boolean') live = { ...live, lowPower: d.lowPower };
    },
    /** Take the app's current heat state as the starting point. */
    seed() {
      const p = profile();
      if (p) live = { thermal: p.thermal, lowPower: p.lowPower };
    },
  };
}
