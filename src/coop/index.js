// Couch play chunk: reached only through import('./coop/index.js') from
// main.js (src/coopseam.js has the start-up side). Milestone 0 is the
// foundation: the per-place ready table and a poll that reads the pads and
// does nothing visible. The pad hub, join card and second cat are milestone 1.
import { coop } from '../coopseam.js';
import { coopReady } from './table.js';

/** The standard-mapped pads the page can see, in the order the browser lists them. */
export function standardPads(nav) {
  let all;
  try { all = nav?.getGamepads?.() || []; } catch { return []; }
  return [...all].filter((p) => p && p.connected && p.mapping === 'standard');
}

/**
 * Starts the chunk. ctx: { nav, getSession }. Couch play and an online
 * co-walk exclude each other, so a session with a net is never ready.
 * Returns { stop, state }; state is what a test or the browser pane reads.
 */
export function start(ctx) {
  const state = { pads: 0, ready: false };
  coop.poll = () => {
    const s = ctx.getSession?.();
    state.pads = standardPads(ctx.nav).length;
    state.ready = !!s && !s.net && coopReady(s.areaId);
  };
  return { state, stop() { if (coop.poll) coop.poll = null; } };
}
