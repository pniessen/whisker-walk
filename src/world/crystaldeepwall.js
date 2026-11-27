// =============================================================================
// THE ECHO DEEP: THE WALL WELCOME PHRASE (second story, C1). Pure, built on world/crystalsongplan.js (the singing chamber"s pads and matcher). After the unlock a fourth, very small tune hums: the pads
// light a five-note phrase, she steps them in order and the wall slides open. A wrong step, or a long wait, only lets the pads fade and the phrase plays again (no fail sound, no count); after
// a few replays the wall opens by itself, so nothing can hold her. Reduced motion: the wall just appears open (the drawing"s job).
// =============================================================================
// (it imports nothing: the deep stage then shares no chunk with stage A. The matcher below is the singing chamber one in small, with the same timing.)
const PAD_COUNT = 7;
const T = { lead: 0.9, gap: 0.8, tail: 0.9, wait: 14, fade: 1.4 };

export const WELCOME = Object.freeze([1, 3, 5, 2, 4]); // pad numbers, five notes, no pad twice in a row
export const PATIENCE = 2; // the phrase has played this many extra times when the wall opens on its own

/** A fresh run: { run (a crystalsongplan run), replays, open }. */
export const newWall = () => ({ run: { tune: WELCOME, phase: 'phrase', t: 0, shown: 0, got: 0, idle: 0 }, replays: 0, open: false });

/** Time moves on: the events the song plan gives, plus { k: 'open', by: 'wait' } once the phrase has been played PATIENCE extra times. */
export function tick(w, dt) {
  if (w.open) return [];
  const ev = advance(w.run, dt);
  for (const e of ev) if (e.k === 'replay') w.replays++;
  if (w.replays >= PATIENCE && w.run.phase === 'echo') { w.open = true; w.run.phase = 'done'; ev.push({ k: 'open', by: 'wait' }); }
  return ev;
}
/** She steps onto pad `pad` (0 to 6): { k: 'ok' | 'miss' } events, and { k: 'open', by: 'steps' } when the phrase is echoed. */
export function step(w, pad) {
  if (w.open || !Number.isInteger(pad) || pad < 0 || pad >= PAD_COUNT) return [];
  const ev = stepPad(w.run, pad);
  if (ev.some((e) => e.k === 'done')) { w.open = true; return [...ev.filter((e) => e.k !== 'done'), { k: 'open', by: 'steps' }]; }
  return ev;
}

// ---- the matcher (same rules as crystalsongplan.js advance and stepPad) ----------------------------------------------------------------------------------------
function advance(run, dt) {
  const out = [];
  if (!(dt > 0) || run.phase === 'done') return out;
  const n = run.tune.length;
  if (run.phase === 'phrase') {
    run.t += dt;
    while (run.shown < n && run.t >= T.lead + run.shown * T.gap) out.push({ k: 'phrase', pad: run.tune[run.shown++] });
    if (run.shown === n && run.t >= T.lead + (n - 1) * T.gap + T.tail) { run.phase = 'echo'; run.got = 0; run.idle = 0; out.push({ k: 'listen' }); }
  } else if (run.phase === 'echo') {
    run.idle += dt;
    if (run.idle >= T.wait) { run.phase = 'fade'; run.t = 0; run.got = 0; out.push({ k: 'timeout' }); }
  } else if (run.phase === 'fade') {
    run.t += dt;
    if (run.t >= T.fade) { run.phase = 'phrase'; run.t = 0; run.shown = 0; run.got = 0; out.push({ k: 'replay' }); }
  }
  return out;
}
function stepPad(run, pad) {
  if (run.phase !== 'echo') return [];
  if (pad === run.tune[run.got]) {
    run.got++;
    run.idle = 0;
    if (run.got === run.tune.length) { run.phase = 'done'; return [{ k: 'ok', pad, n: run.got }, { k: 'done' }]; }
    return [{ k: 'ok', pad, n: run.got }];
  }
  run.phase = 'fade'; run.t = 0; run.got = 0;
  return [{ k: 'miss' }];
}
