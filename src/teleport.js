// The teleport gates' rules (milestone 0 of docs/superpowers/plans/2026-11-23-teleport-gates.md), the one door to
// everything of theirs. LAZY: it, src/teleui.js (the swirl, the card, the words) and src/world/telegate.js (the look)
// are one chunk that src/telehook.js fetches only behind ?gates=1, so the start-up download carries none of it.
//
// It imports nothing from start-up but the row constructor (gateways.js) and the phrase table: what else it needs (the
// two switches, a place's shown name, how a walk-on lands on a save, the pad's button tags, couch play's ready
// places) the hook hands it in `setup(host)`, which keeps this chunk from pulling start-up modules out into chunks of
// their own (the start-up size is the one hard cap). A test calls setup with the real ones (test/helpers/tele.js).
//
// A gate is a gateways.js row of kind 'tele': an 'inside' end with an explicit arrival whose twin is the other place's
// end. They are in a table of their own (TELE_ENDS), never in GATEWAY_ENDS, so nothing that reads the map's gates (the
// map, the walk's gate dressing, a room's walk-on) can see one; teleRow defaults and checks the fields only they have.
import { gatewayEnd, endById, arrivalFor, GATE_REACH, GATE_PREFETCH_REACH } from './gateways.js';
import { phrase } from './clanphrases.js';
import * as ui from './teleui.js';
import { addTeleGates } from './world/telegate.js';

export const TELE_SWIRL_MS = 1200; // the swirl, full motion
export const TELE_FADE_MS = 400; // the gentle fade, reduced motion
export const TELE_SLOW_MS = 1500; // a place still not here by now: "Nearly there!"
export const TELE_PAIR_CAP = 6; // gate pairs per release (a test constant)

let H = null;
// host: { teleOn, greenhouseOn, placeName, walkOnMove, lower, padTag, escapeHtml, coopReady, catalog, isClan, couch }
// (catalog: CATALOG; isClan(state): Clan Edition; couch(): couch play is on this page load)
export function setup(host) {
  H = host;
  ui.setup(host);
}

// A teleport gate's row: gatewayEnd's, plus kind 'tele' and these, defaulted so a row names only what it needs:
//   suit      null | 'space' | 'dive': the look the place beyond draws her in (milestone 2; null until then)
//   wake      true: her first touch is a find (milestone 5)
//   edition   'canon' (the default: the main edition only) | 'all' (both editions)
//   needWalks host-place walks before it is awake (0: always)
const LOOKS = ['stonering', 'archway', 'hollow'];
export function teleRow({ suit = null, wake = false, edition = 'canon', needWalks = 0, ...row }) {
  const id = row.id;
  if (![null, 'space', 'dive'].includes(suit)) throw new Error(`tele gate ${id}: suit "${suit}" is not space, dive or null`);
  if (edition !== 'canon' && edition !== 'all') throw new Error(`tele gate ${id}: edition "${edition}" is not canon or all`);
  if (!Number.isInteger(needWalks) || needWalks < 0) throw new Error(`tele gate ${id}: needWalks must be a whole number, 0 or more`);
  if (!LOOKS.includes(row.look)) throw new Error(`tele gate ${id}: look "${row.look}" is not one of ${LOOKS.join(', ')}`);
  if (row.placement !== 'inside' || !row.arrive) throw new Error(`tele gate ${id}: stands inside a place, with an explicit arrive`);
  return gatewayEnd({ ...row, kind: 'tele', suit, wake: wake === true, edition, needWalks });
}
const end = teleRow;

// The spike pair, Park <-> Greenhouse, in the stone-ring look. Each stands on open lawn in sight of its place's
// spawn (Park (0, 45), Greenhouse (0, 30)), clear of every collider, point of interest and golden mouse
// (test/teleport.test.js). The cat walks up heading west; she lands 3.6 m east of the other end, FACING the ring she
// stepped out of (rotation.y +pi/2, west): the camera stands 4.4 m behind her, which with her back to the stones would
// put it inside them (seen in the first pictures); facing them it looks at the way home. A deviation from the spec's
// "facing in"; milestone 1 may turn it round again once the real art is in.
export const TELE_ENDS = Object.freeze({
  park: Object.freeze([
    end({ id: 'park-greenhouse', gateway: 'tele-park-greenhouse', x: -10, z: 44, faces: 'west', to: 'greenhouse', twin: 'greenhouse-park', look: 'stonering',
      placement: 'inside', arrive: { x: -6.4, z: 44, yaw: Math.PI / 2 }, edition: 'all' }),
  ]),
  greenhouse: Object.freeze([
    end({ id: 'greenhouse-park', gateway: 'tele-park-greenhouse', x: -10, z: 29, faces: 'west', to: 'park', twin: 'park-greenhouse', look: 'stonering',
      placement: 'inside', arrive: { x: -6.4, z: 29, yaw: Math.PI / 2 }, edition: 'all' }),
  ]),
});

export const teleEnds = (areaId) => (typeof areaId === 'string' && Object.hasOwn(TELE_ENDS, areaId) ? TELE_ENDS[areaId] : []);

// A place behind its own switch (the Greenhouse, until its milestone 4 gives it a catalog row) counts as built while
// that switch is on, and has no name in the catalog, so its name is here.
const NAMES = { greenhouse: 'The Greenhouse' };
export function placeLive(to, catalog) {
  const areas = catalog && catalog.areas;
  return (!!areas && Object.hasOwn(areas, to)) || (to === 'greenhouse' && H.greenhouseOn());
}
export const teleName = (to, edition, catalog) => H.placeName(to, edition, catalog) || NAMES[to] || '';

// The gates this walk draws and offers: none without ?gates=1; a row whose place beyond is not built is dormant for
// good (as liveEndsFor); a 'canon' row only in the main edition, an 'all' row in both.
export function liveTeleEnds(areaId, catalog, { clan = true } = {}) {
  if (!H.teleOn()) return [];
  return teleEnds(areaId).filter((e) => placeLive(e.to, catalog) && (e.edition === 'all' || clan));
}

export function teleNear(areaId, x, z, catalog, { clan = true, reach = GATE_REACH } = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  let best = null;
  let bestD = Infinity;
  for (const e of liveTeleEnds(areaId, catalog, { clan })) {
    const d = Math.hypot(e.x - x, e.z - z);
    if (d <= reach && d < bestD) { best = e; bestD = d; }
  }
  return best;
}

// { kind: 'go' | 'dormant' | 'room' | 'coop', to, name, lineId } for one gate. 'dormant': the host place has not been
// walked `needWalks` times (a row's default 0 is always awake). 'room': a gate is refused in an online room (milestone
// 0 keeps it simple). 'coop': couch play stays out of a gate until both places have their couch row true. lineId is
// the phrase the refusal says.
export function teleStatus(end, state, catalog, { inRoom = false, couch = false } = {}) {
  const to = end.to;
  const base = { to, name: teleName(to, state && state.edition, catalog), lineId: null };
  const host = endById(end.twin, TELE_ENDS)?.end.to;
  const walks = state && state.walks && typeof state.walks === 'object' && Number.isFinite(state.walks[host]) ? state.walks[host] : 0;
  if (walks < end.needWalks) return { ...base, kind: 'dormant' };
  if (inRoom) return { ...base, kind: 'room', lineId: 'tele.room' };
  if (couch && !(H.coopReady(to) && H.coopReady(host))) return { ...base, kind: 'coop', lineId: 'tele.coop' };
  return { ...base, kind: 'go' };
}

// The walk-on's plan through a gate id, as gatecross.viaPlan's: { via, from, to, arrive, tele }, or null.
export function planFor(via) {
  const hit = typeof via === 'string' ? endById(via, TELE_ENDS) : null;
  const arrival = hit && arrivalFor(via, TELE_ENDS);
  if (!arrival) return null;
  return { via, from: hit.areaId, to: hit.end.to, arrive: { x: arrival.x, z: arrival.z, yaw: arrival.yaw }, tele: hit.end };
}

// What one walk-on through a gate hands to the next walk, and nothing more. She is the same cat in the same clothes:
// no wear, no cat and no position is carried or changed (she lands at the twin's arrival spot, as at every gate); a
// walk banks as it always does. `move` is how the place beyond lands on this save (gatecross.walkOnMove: 'set',
// 'take' or 'override'; for the Greenhouse, free and with no catalog row, it says 'take' and the walk's buy() refuses,
// so it is walked as an override and nothing is bought);
// `suit` is the draw-time look the place beyond puts on her (null until the suit kit: milestone 2); a room is kept
// together and `seedFrom` is the id its next seed derives from (gatecross.nextRoomSeed), else null.
export function teleHandoff({ via, state, catalog, inRoom = false, guest = false } = {}) {
  const plan = planFor(via);
  if (!plan) return null;
  return {
    via, from: plan.from, to: plan.to, twin: plan.tele.twin, arrive: plan.arrive, suit: plan.tele.suit,
    move: H.walkOnMove(state, catalog, plan.to, { guest }),
    keepRoom: !!inRoom, seedFrom: inRoom ? via : null,
  };
}

export const swirlMs = (reducedMotion) => (reducedMotion ? TELE_FADE_MS : TELE_SWIRL_MS);

// ---- what the walk calls (walk.js, interactions.js, crossing.js reach these through tele.kit) ----

// The walk's per-frame look at the gates. Nearing one (GATE_PREFETCH_REACH, 12 m) fetches the place beyond, once per
// gate per walk, unless the gate is refused (nothing to fetch for). Within reach, and `free` (nothing else is prompting
// her), it returns { text, prompt }: a gate she can go through is a 'gate' prompt (the map gates' own card and E,
// the touch pill's tap and the pad's X all work), a refusal a 'gate-info' sign. Else null.
const fetched = new WeakMap();
export function prompt(s, catP, state, inRoom, prefetch, free) {
  const clan = H.isClan(state);
  const ends = liveTeleEnds(s.areaId, H.catalog, { clan });
  if (!ends.length) return null;
  const opts = { inRoom, couch: H.couch() };
  let done = fetched.get(s);
  for (const e of ends) {
    if (done?.has(e.id) || Math.hypot(e.x - catP.x, e.z - catP.z) > GATE_PREFETCH_REACH) continue;
    if (teleStatus(e, state, H.catalog, opts).kind !== 'go') continue;
    if (!done) { done = new Set(); fetched.set(s, done); }
    done.add(e.id);
    prefetch(e.to);
  }
  if (!free) return null;
  const near = teleNear(s.areaId, catP.x, catP.z, H.catalog, { clan });
  if (!near) return null;
  const status = teleStatus(near, state, H.catalog, opts);
  if (status.kind === 'dormant') return null;
  if (status.kind === 'go') return { text: `E — ${phrase('tele.go')}`, prompt: { kind: 'gate', data: { end: near, status, card: () => ui.cardHtml({ name: status.name }) } } };
  return { text: status.kind === 'room' ? phrase('tele.room') : phrase('tele.coop'), prompt: { kind: 'gate-info', data: { end: near, status } } };
}

// The gates of this place, drawn into the walk's scene; returns the pillars' colliders for walk.js to push.
export function draw(scene, areaId, state, ground) {
  return addTeleGates(scene, liveTeleEnds(areaId, H.catalog, { clan: H.isClan(state) }), { ground }).colliders;
}

// A walk-on through `via`, or null when it is not a teleport gate: the plan, the swirl as the moment, how long it
// shows, the line the arrival toasts, what to do when the place beyond is slow, and the swirl opening on arrival.
export function walkOn(via, state, calm = false) {
  const plan = planFor(via);
  if (!plan) return null;
  return {
    plan, twin: plan.tele.twin,
    html: ui.swirlHtml({ name: teleName(plan.to, state.edition, H.catalog), calm }),
    ms: swirlMs(calm),
    line: phrase('tele.home'),
    slowMs: TELE_SLOW_MS,
    slow: (root) => ui.nearly(root),
    opened: () => ui.opening({ calm }),
  };
}
