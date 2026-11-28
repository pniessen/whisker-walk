// Cat two on an area's own rides (split-screen couch play, docs/split-screen-s5-audit.md). The places' own prompts, rides and missions read cat one (session.perched, the one
// player), and their stage-A chunks are pinned to the byte, so cat two's way onto them lives HERE, in the couch walk's lazy files, and reaches a place only through what its life
// already shows (its rover, its seals, its claim events). One file per place, fetched only for that place; a place with no row has no seat for cat two (it is "forCats: one").
//
// loadSeat(areaId, host) -> Promise<{ promptAt(pos), interact(), carry(dt, body, player), release(body, player) } | null>
//   host = { life, session: () => the walk's session, log, progression, say(text) }
// A seat file exports createSeat(host) -> { sources: [prompt sources for cat two, forCats: 'two'], carry, release }; the prompts go through the per-cat arbiter
// (src/world/promptarbitercat.js) on cat two's slot, so a seat is one source in a list and a later offer is added to it, never fought over.
export const SEATS = { moon: () => import('./seatmoon.js'), reef: () => import('./seatreef.js') };

export async function loadSeat(areaId, host) {
  const row = SEATS[areaId];
  if (!row) return null;
  const [m, { createPromptArbiter }] = await Promise.all([row(), import('../world/promptarbitercat.js')]);
  const seat = m.createSeat(host);
  const arb = createPromptArbiter(seat.sources);
  return { promptAt: (pos) => arb.promptAt(pos, 1), interact: () => arb.interact(1), carry: seat.carry, release: seat.release, get riding() { return !!seat.riding?.(); } };
}
