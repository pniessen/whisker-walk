// Cat two on an area's own rides (split-screen couch play, docs/split-screen-s5-audit.md). The places' own prompts, rides and missions read cat one (session.perched, the one
// player), and their stage-A chunks are pinned to the byte, so cat two's way onto them lives HERE, in the couch walk's lazy files, and reaches a place only through what its life
// already shows (its rover, its seals, its claim events). One file per place, fetched only for that place; a place with no row has no seat for cat two (it is "forCats: one").
//
// loadSeat(areaId, host) -> Promise<{ promptAt(pos), interact(), carry(dt, body, player), release(body, player) } | null>
//   host = { life, session: () => the walk's session, log, progression, say(text) }
// A seat file exports createSeat(host) -> { sources: [prompt sources for cat two, forCats: 'two'], carry, release }; the prompts go through the per-cat arbiter
// (src/world/promptarbitercat.js) on cat two's slot, so a seat is one source in a list and a later offer is added to it, never fought over.
const moon = () => import('./seatmoon.js'), reef = () => import('./seatreef.js'), pillion = () => import('./seatpillion.js'), lend = () => import('./seatlend.js');
// a row is a list of seat files for the place (their sources join one arbiter; the first one that carries cat two holds it)
export const SEATS = { moon: [moon, pillion], reef: [reef], crystal: [pillion, lend], snowville: [pillion, lend], greenhouse: [lend], lighthouse: [lend], jungle: [lend], treehouse: [lend] };

export async function loadSeat(areaId, host) {
  const row = SEATS[areaId];
  if (!row) return null;
  const [mods, { createPromptArbiter }] = await Promise.all([Promise.all(row.map((f) => f())), import('../world/promptarbitercat.js')]);
  const seats = mods.map((m) => m.createSeat(host));
  const arb = createPromptArbiter(seats.flatMap((x) => x.sources));
  return {
    promptAt: (pos) => arb.promptAt(pos, 1),
    interact: () => arb.interact(1),
    carry(dt, body, player) { let held = false; for (const x of seats) { if (x.carry(dt, body, player)) { held = true; break; } } return held; },
    release(body, player) { for (const x of seats) x.release(body, player); },
    get riding() { return seats.some((x) => !!x.riding?.()); },
  };
}
