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
import { suitKit } from './cat/model.js'; // (through model.js, so the build adds no shared chunk to start-up)
import * as ui from './teleui.js';
import { addTeleGates, discTint } from './world/telegate.js';

export const TELE_SWIRL_MS = 1200; // the swirl, full motion
export const TELE_FADE_MS = 400; // the gentle fade, reduced motion
export const TELE_SLOW_MS = 1500; // a place still not here by now: "Nearly there!"
export const TELE_PAIR_CAP = 8; // gate pairs per release (a test constant)
// Park walks before the Moon gate wakes (the Moon plan's rule: 2). CATALOG.areas.moon.requires says it too; the number lives here; a test keeps the rule honest.
export const MOON_NEED_WALKS = 2;
// Park walks before the Greenhouse's archway wakes (the same rule; CATALOG.areas.greenhouse.requires says it too, and a test keeps them equal).
export const GREENHOUSE_NEED_WALKS = 2;
// Seaside walks before the rock cleft at the pier foot wakes (the Reef plan's D3: 2; CATALOG.areas.reef.requires says it too, and a test keeps them equal).
export const REEF_NEED_WALKS = 2;
// Docks walks before the Crystal Cave's gate wakes (the plan's D3: 2; CATALOG.areas.crystal.requires says it too). No gate end yet (milestone C6).
export const CRYSTAL_NEED_WALKS = 2;

let H = null;
// host: { teleOn, greenhouseOn, placeName, walkOnMove, lower, padTag, escapeHtml, coopReady, catalog, isClan, couch }
// (catalog: CATALOG; isClan(state): Clan Edition; couch(): couch play is on this page load)
export function setup(host) {
  H = host;
  ui.setup(host);
}

// A teleport gate's row: gatewayEnd's, plus kind 'tele' and these, defaulted so a row names only what it needs:
//   suit      null | 'space' | 'dive': the look the place beyond draws her in (milestone 2: see suitOf below)
//   wake      true: her first touch is a find (milestone 5)
//   edition   'canon' (the default: the main edition only) | 'all' (both editions)
//   needWalks host-place walks before it is awake (0: always)
//   own       true: the place draws this gate's stones itself (the Moon's return ring, src/world/moonparts.js), so the gate
//             draws nothing and adds no pillars: only the prompt, the card and the walk-on are the gate's
const LOOKS = ['stonering', 'archway', 'hollow', 'cleft', 'grotto', 'hatch'];
export function teleRow({ suit = null, wake = false, edition = 'canon', needWalks = 0, own = false, ...row }) {
  const id = row.id;
  if (![null, 'space', 'dive'].includes(suit)) throw new Error(`tele gate ${id}: suit "${suit}" is not space, dive or null`);
  if (edition !== 'canon' && edition !== 'all') throw new Error(`tele gate ${id}: edition "${edition}" is not canon or all`);
  if (!Number.isInteger(needWalks) || needWalks < 0) throw new Error(`tele gate ${id}: needWalks must be a whole number, 0 or more`);
  if (!LOOKS.includes(row.look)) throw new Error(`tele gate ${id}: look "${row.look}" is not one of ${LOOKS.join(', ')}`);
  if (row.placement !== 'inside' || !row.arrive) throw new Error(`tele gate ${id}: stands inside a place, with an explicit arrive`);
  return gatewayEnd({ ...row, kind: 'tele', suit, wake: wake === true, edition, needWalks, own: own === true });
}
const end = teleRow;

// ---- OWNER DECISIONS (milestone 1): the look of each gate, and which way she faces when she lands ----
// Each end's look, by id: 'stonering' (five mossy standing stones round a light disc), 'archway' (a little stone arch in a
// hedge, with a lantern) or 'hollow' (a trunk with a glowing hole) or 'cleft' (the same in rock, with a ladder and a ring buoy). Pictures of all three in the Park and the Greenhouse:
// verify-teleport-gates-m1.html. The plan's recommendation for the real pairs: stones for the Moon, hollow for the Reef.
export const TELE_LOOK = Object.freeze({ 'park-greenhouse': 'archway', 'greenhouse-park': 'archway', 'park-moon': 'stonering', 'moon-park': 'stonering', 'seaside-reef': 'hatch', 'reef-seaside': 'cleft', 'docks-crystal': 'grotto', 'crystal-docks': 'grotto' });
// Where she lands, and facing which way: 'toward' (the milestone 0 choice: 3.6 m out, FACING the gate she stepped out of; the
// camera stands 4.4 m behind her, so it looks at the way home) or 'away' (the spec's "facing in": 7 m out, looking into
// the place, the gate behind her; further, so the camera does not stand inside the stones).
export const TELE_ARRIVAL_FACING = 'toward';
export const ARRIVAL_FACINGS = Object.freeze({ toward: Object.freeze({ dist: 3.6, turn: false }), away: Object.freeze({ dist: 7, turn: true }) });
const INWARD = { north: [0, 1], south: [0, -1], east: [-1, 0], west: [1, 0] }; // the way she lands from a gate that faces so
const FACING_YAW = { north: 0, south: Math.PI, east: -Math.PI / 2, west: Math.PI / 2 };
// Her landing spot beside the gate at (x, z) that faces `faces`: `dist` metres out on the side she came from.
export function arriveFor(faces, x, z, mode = TELE_ARRIVAL_FACING) {
  const m = ARRIVAL_FACINGS[mode];
  if (!m) throw new Error(`tele arrival "${mode}" is not one of ${Object.keys(ARRIVAL_FACINGS).join(', ')}`);
  const [dx, dz] = INWARD[faces];
  const yaw = FACING_YAW[faces] + (m.turn ? Math.PI : 0);
  return { x: x + dx * m.dist, z: z + dz * m.dist, yaw: yaw > Math.PI ? yaw - 2 * Math.PI : yaw };
}

// The Greenhouse pair (Greenhouse milestone G4; the spike pair made real), Park <-> Greenhouse, both editions. Each stands on
// open ground in sight of its place's spawn (Park (0, 45), Greenhouse (0, 30)), clear of every collider, point of interest and
// golden mouse (test/teleport.test.js). The cat walks up heading west and lands 3.6 m east of the other end, facing it
// (arriveFor). The Park's archway is awake after two Park walks; the Greenhouse's own return arch (greenhouseparts.js
// returnArch, `own`) is always awake, as the Moon's ring is.
export const TELE_ENDS = Object.freeze({
  park: Object.freeze([
    end({ id: 'park-greenhouse', gateway: 'tele-park-greenhouse', x: -10, z: 44, faces: 'west', to: 'greenhouse', twin: 'greenhouse-park', look: TELE_LOOK['park-greenhouse'],
      placement: 'inside', arrive: arriveFor('west', -10, 44), edition: 'all', needWalks: GREENHOUSE_NEED_WALKS }),
    // The Moon gate (milestone 3): the Park's stone ring, east of the spawn (12, 44), awake after two Park walks; she lands
    // 3.6 m west of it, facing it, when she comes home. Both editions. Its twin is the Moon's own return ring.
    end({ id: 'park-moon', gateway: 'tele-park-moon', x: 12, z: 44, faces: 'east', to: 'moon', twin: 'moon-park', look: TELE_LOOK['park-moon'],
      placement: 'inside', arrive: arriveFor('east', 12, 44), edition: 'all', suit: 'space', needWalks: MOON_NEED_WALKS }),
  ]),
  moon: Object.freeze([
    // The way home: the Moon's own return ring (RETURN_GATE (-10, 41), drawn by the Moon: `own`, so nothing is drawn twice),
    // always awake. It faces north, so she lands 3.6 m south of it (-10, 44.6), 10 m from the lander's spawn, facing it with
    // the camera behind her over open dust (an east landing put the camera inside the lander's steps): the same pair, the same
    // look. The first golden mouse (0, 40.6) is in sight, 10.8 m away.
    end({ id: 'moon-park', gateway: 'tele-park-moon', x: -10, z: 41, faces: 'north', to: 'park', twin: 'park-moon', look: TELE_LOOK['moon-park'],
      placement: 'inside', arrive: arriveFor('north', -10, 41), edition: 'all', own: true }),
  ]),
  // The Reef pair (Reef milestone R6): the Seaside's rock cleft at the pier foot, awake after two Seaside walks, both editions, and the
  // Reef's own return arch (reefparts.js drawSpawn, `own`: the gate draws nothing there). She lands 3.6 m out from the other end, facing it.
  seaside: Object.freeze([
    end({ id: 'seaside-reef', gateway: 'tele-seaside-reef', x: 21.5, z: -14.5, faces: 'east', to: 'reef', twin: 'reef-seaside', look: TELE_LOOK['seaside-reef'],
      placement: 'inside', arrive: arriveFor('east', 21.5, -14.5), edition: 'all', suit: 'dive', needWalks: REEF_NEED_WALKS }),
  ]),
  reef: Object.freeze([
    // The arch stands at (0, 31) in the Reef's spawn court, 5 m north of the spawn (0, 36); she walks north into it and lands 3.6 m south of it.
    end({ id: 'reef-seaside', gateway: 'tele-seaside-reef', x: 0, z: 31, faces: 'north', to: 'seaside', twin: 'seaside-reef', look: TELE_LOOK['reef-seaside'],
      placement: 'inside', arrive: arriveFor('north', 0, 31), edition: 'all', own: true }),
  ]),
  // The Crystal Cave pair (Crystal milestone C6): a grotto in the rock at the Old Docks' south edge, awake after two Docks walks, both editions, no suit,
  // and the cave's own return arch (the cave draws it: `own`).
  docks: Object.freeze([
    end({ id: 'docks-crystal', gateway: 'tele-docks-crystal', x: 10, z: -37.5, faces: 'north', to: 'crystal', twin: 'crystal-docks', look: TELE_LOOK['docks-crystal'],
      placement: 'inside', arrive: arriveFor('north', 10, -37.5), edition: 'all', needWalks: CRYSTAL_NEED_WALKS }),
  ]),
  crystal: Object.freeze([
    end({ id: 'crystal-docks', gateway: 'tele-docks-crystal', x: 0, z: 24.5, faces: 'north', to: 'docks', twin: 'docks-crystal', look: TELE_LOOK['crystal-docks'],
      placement: 'inside', arrive: arriveFor('north', 0, 24.5), edition: 'all', own: true }),
  ]),
  greenhouse: Object.freeze([
    end({ id: 'greenhouse-park', gateway: 'tele-park-greenhouse', x: -10, z: 29, faces: 'west', to: 'park', twin: 'park-greenhouse', look: TELE_LOOK['greenhouse-park'],
      placement: 'inside', arrive: arriveFor('west', -10, 29), edition: 'all', own: true }),
  ]),
});

export const teleEnds = (areaId) => (typeof areaId === 'string' && Object.hasOwn(TELE_ENDS, areaId) ? TELE_ENDS[areaId] : []);

// Every gate place has a catalog row now (its `gate: 'tele'` keeps it out of the cards while the switch is off); these names are the fallback.
const NAMES = { greenhouse: 'The Greenhouse', reef: 'The Reef', crystal: 'The Crystal Cave', moon: 'The Moon' };
export function placeLive(to, catalog) {
  const areas = catalog && catalog.areas;
  return !!areas && Object.hasOwn(areas, to);
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

// { kind: 'go' | 'dormant' | 'coop', to, name, lineId } for one gate. 'dormant': the host place has not been
// walked `needWalks` times (a row's default 0 is always awake). 'room': a gate is refused in an online room (milestone
// 0 keeps it simple). 'coop': couch play stays out of a gate until both places have their couch row true. lineId is
// the phrase the refusal says.
export function teleStatus(end, state, catalog, { couch = false } = {}) {
  const to = end.to;
  const base = { to, name: teleName(to, state && state.edition, catalog), lineId: null };
  const host = endById(end.twin, TELE_ENDS)?.end.to;
  const walks = state && state.walks && typeof state.walks === 'object' && Number.isFinite(state.walks[host]) ? state.walks[host] : 0;
  if (walks < end.needWalks) return { ...base, kind: 'dormant' };
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
// 'take' or 'override'; the Greenhouse is free with a catalog row, so it says 'take' and the walk takes it (price 0, as the
// Woods); the Moon has no row, so it is walked as an override and nothing is bought);
// `suit` is the draw-time look the place beyond puts on her (suitOf; never saved, never worn); a room is kept
// together and `seedFrom` is the id its next seed derives from (gatecross.nextRoomSeed), else null.
export function teleHandoff({ via, state, catalog, inRoom = false, guest = false } = {}) {
  const plan = planFor(via);
  if (!plan) return null;
  return {
    via, from: plan.from, to: plan.to, twin: plan.tele.twin, arrive: plan.arrive, suit: suitOf(plan.tele),
    move: H.walkOnMove(state, catalog, plan.to, { guest }),
    keepRoom: !!inRoom, seedFrom: inRoom ? via : null,
  };
}

// ---- the suit (milestone 2): drawn from the place, never worn ----
// The look a gate's far side draws her in is the row's `suit`. The spike pair has none of its own, so a test page can see
// either look on the Greenhouse side with `?suit=space` or `?suit=dive` (read here, in the lazy chunk, so start-up carries
// nothing): the row into the Greenhouse takes it, the row home never does, so going home puts her own clothes back.
export const SPIKE_SUIT_ROW = 'park-greenhouse';
function suitQuery() {
  try {
    const v = new URLSearchParams(globalThis.location?.search).get('suit');
    return v === 'space' || v === 'dive' ? v : null;
  } catch { return null; }
}
export const suitOf = (e) => e.suit ?? (e.id === SPIKE_SUIT_ROW ? suitQuery() : null);
const allEnds = () => Object.values(TELE_ENDS).flat();
// The look every cat in `areaId` is drawn in (her own and a co-walker's alike), or null: none, the gates off, or the suit
// kit not here yet (then nobody is drawn half-dressed: she keeps her own clothes).
export function suitFor(areaId) {
  if (!H.teleOn() || !suitKit()) return null;
  for (const e of allEnds()) {
    if (e.to !== areaId) continue;
    const look = suitOf(e);
    if (look) return look;
  }
  return null;
}
// Is a suit look wanted in this place? (the kit is worth fetching) and the kit, fetched once, errors swallowed.
export const suitWanted = (areaId) => H.teleOn() && allEnds().some((e) => e.to === areaId && suitOf(e));
let kitLoading = null;
export function loadSuitKit() {
  kitLoading ??= import('./cat/suitkit.js').catch(() => { kitLoading = null; return null; });
  return kitLoading.then((k) => { if (!k) return false; if (!suitKit()) k.installSuitKit(); return true; });
}
// The warm-up: the kit comes with the place when the place beyond wears one (a gate's prefetch, a start-up in such a place).
export function warm(areaId) { return suitWanted(areaId) ? loadSuitKit() : Promise.resolve(false); }

// The first-arrival montage: the body, the pack and the helmet pop on one by one as the swirl opens. Visibility only (the
// pieces are the cat's own meshes), nothing saved. Reduced motion: no montage, the suit is simply on. Returns the pieces.
export const SUIT_MONTAGE = Object.freeze(['body', 'pack', 'helmet']);
export function suitUp(cat, { calm = false, later = setTimeout, startMs = 300, gapMs = 220 } = {}) {
  if (calm || !cat || !cat.traverse) return 0;
  const steps = SUIT_MONTAGE.map(() => []);
  cat.traverse((o) => {
    const i = SUIT_MONTAGE.indexOf(o.userData?.suit === 'gauge' ? 'pack' : o.userData?.suit);
    if (o.isMesh && i >= 0) steps[i].push(o);
  });
  let n = 0;
  steps.forEach((meshes, i) => {
    if (!meshes.length) return;
    n += 1;
    for (const m of meshes) m.visible = false;
    later(() => { for (const m of meshes) m.visible = true; }, startMs + i * gapMs);
  });
  return n;
}

export const swirlMs = (reducedMotion) => (reducedMotion ? TELE_FADE_MS : TELE_SWIRL_MS);

// ---- what the walk calls (walk.js, interactions.js, crossing.js reach these through tele.kit) ----

// What a room's walk-on asks of the gates (gatecross.js `tele`): this place's live gates (either edition: a guest is never
// turned away for hers), and the place a gate id belongs to (null for an id that is none of ours).
export const roomLook = Object.freeze({
  ends: (areaId) => liveTeleEnds(areaId, H.catalog, { clan: true }),
  areaOf: (via) => (typeof via === 'string' ? endById(via, TELE_ENDS)?.areaId ?? null : null),
});

// The walk's per-frame look at the gates. Nearing one (GATE_PREFETCH_REACH, 12 m) fetches the place beyond, once per
// gate per walk, unless the gate is refused (nothing to fetch for). Within reach, and `free` (nothing else is prompting
// her), it returns { text, prompt }: a gate she can go through is a 'gate' prompt (the map gates' own card and E,
// the touch pill's tap and the pad's X all work), a refusal a 'gate-info' sign. Else null.
const fetched = new WeakMap();
export function prompt(s, catP, state, inRoom, prefetch, free, isHost = true) {
  const clan = H.isClan(state);
  const ends = liveTeleEnds(s.areaId, H.catalog, { clan });
  if (!ends.length) return null;
  const opts = { couch: H.couch() };
  let done = fetched.get(s);
  for (const e of ends) {
    if (done?.has(e.id) || Math.hypot(e.x - catP.x, e.z - catP.z) > GATE_PREFETCH_REACH) continue;
    if (teleStatus(e, state, H.catalog, opts).kind !== 'go') continue;
    if (!done) { done = new Set(); fetched.set(s, done); }
    done.add(e.id);
    prefetch(e.to);
    if (suitOf(e)) loadSuitKit();
  }
  if (!free) return null;
  const near = teleNear(s.areaId, catP.x, catP.z, H.catalog, { clan });
  if (!near) return null;
  const status = teleStatus(near, state, H.catalog, opts);
  if (status.kind === 'dormant') return null;
  // A room's guest reads the sign only: the host chooses (as at the map's gates).
  if (inRoom && !isHost && status.kind === 'go') return { text: phrase('tele.guest', status.name), prompt: { kind: 'gate-info', data: { end: near, status } } };
  if (status.kind === 'go') return { text: `E — ${phrase('tele.go')}`, prompt: { kind: 'gate', data: { end: near, status, card: () => ui.cardHtml({ name: status.name, look: near.look, tint: discTint(near) }) } } };
  return { text: phrase('tele.coop'), prompt: { kind: 'gate-info', data: { end: near, status } } };
}

// The gates of this place, drawn into the walk's scene; returns the pillars' colliders for walk.js to push.
// A gate whose host place she has not walked enough is drawn dormant (the body alone, greyer, no light); `calm`: reduced
// motion, nothing turns or drifts.
export function draw(scene, areaId, state, ground, calm = false) {
  return addTeleGates(scene, liveTeleEnds(areaId, H.catalog, { clan: H.isClan(state) }).filter((e) => !e.own),
    { ground, calm, awakeOf: (e) => teleStatus(e, state, H.catalog).kind !== 'dormant' }).colliders;
}

// A walk-on through `via`, or null when it is not a teleport gate: the plan, the swirl as the moment, how long it
// shows, the line the arrival toasts, what to do when the place beyond is slow, and the swirl opening on arrival.
export function walkOn(via, state, calm = false) {
  const plan = planFor(via);
  if (!plan) return null;
  const suit = suitOf(plan.tele);
  const visits = state && state.walks && Number.isFinite(state.walks[plan.to]) ? state.walks[plan.to] : 0;
  return {
    plan, twin: plan.tele.twin, suit,
    // the suit comes with this arrival: the kit (fetched with the place), the toast, and the montage on the first visit only
    kitReady: () => !suit || !!suitKit(),
    loadKit: () => (suit ? loadSuitKit() : Promise.resolve(true)),
    suitLine: suit ? phrase('tele.suit') : null,
    montage: !!suit && visits === 0,
    html: ui.swirlHtml({ name: teleName(plan.to, state.edition, H.catalog), calm, tint: discTint(plan.tele) }),
    ms: swirlMs(calm),
    line: phrase('tele.home', plan.tele.look),
    slowMs: TELE_SLOW_MS,
    slow: (root) => ui.nearly(root),
    opened: () => ui.opening({ calm }),
  };
}
