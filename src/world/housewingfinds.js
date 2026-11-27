// THE OLD HOUSE'S EAST WING, THE DISCOVERIES AT RUN TIME (Old House wing, Milestone 2). House life runs this every frame with
// her position; where each find is and what sets it off is housewingthings.js's HOUSE_WING_FINDS. No button: she finds
// them by being there, as the house's six (housefinds.js, whose key and still-speed it shares).
//   sofa      still on the sofa's seat 3 s (the seat's nap spot, E), a purr
//   fishtank  she stays at the tank 1 s
//   sunslot   still in a sunny slot 4 s (lying in it, E): the room goes calm, the patch glows and breathes, a purr
//   sunall    she has lain in all four slots, in one walk
//   bathtub   her paws on the tub's rim ledge
//   tap       she stays at the basin 1 s: plink, plink
//   bunk      her paws on the top bunk's ledge
//   fort      she stays in the blanket fort 1.5 s
// Each pays once a walk by the log's own rule (awardOnce, type `housewing`, key house-find-<id>: a walk picked up again has its
// entries back, so nothing pays twice). Co-walk: every cat on the walk is watched, hers first and each partner (a remotecats.js entry,
// at entry.group.position) after, each with its own holds; a find a partner makes pays this child too, and a slot lain in
// by either counts toward sunall. `calm` is true while HER cat lies in a slot (the air and the sound read it). update allocates
// nothing unless a find is made. Draws on no stream.

import { phrase } from '../clanphrases.js';
import { words } from '../wordset.js';
import './housewingwords.js';
import { HOUSE_LEDGES, LEDGE_ON } from './houseplan.js';
import { FIND_KEY, STILL } from './housefinds.js';

const NONE = Object.freeze([]);
const CALM_AFTER = 1; // s lying still in a slot before the room goes calm
const SLOT_FLOOR = 0.3; // m: a slot is on the floor, not a perch over it
const BREATH = 2.2; // rad/s: the lit patch's slow pulse while she lies in it

// The lines, by literal id (clanphrases.js wants every phrase id literal).
const SAY = {
  sofa: () => phrase('house.find.sofa'),
  fishtank: () => phrase('house.find.fishtank'),
  sunslot: () => phrase('house.find.sunslot'),
  sunall: () => phrase('house.find.sunall'),
  bathtub: () => phrase('house.find.bathtub'),
  tap: () => phrase('house.find.tap'),
  bunk: () => phrase('house.find.bunk', words().OUTSIDE_WORDS.kids),
  fort: () => phrase('house.find.fort'),
};

export function createHouseWingFinds({ finds = NONE, slots = NONE, log = null, audio = null, reducedMotion = false } = {}) {
  const state = finds.map((f) => ({ f, done: false, ledge: f.ledge ? HOUSE_LEDGES.find((l) => l.id === f.ledge) : null }));
  const slotFind = finds.find((f) => f.trigger === 'slot') ?? null;
  const allBits = (1 << slots.length) - 1;
  let slotMask = 0; // the slots lain in this walk, by any cat
  let allPaid = false;
  let slotPaid = false;
  let calm = false;
  let breath = 0;
  let made = 0;
  const watcher = (purr) => {
    made++;
    return { hold: finds.map(() => 0), slot: slots.map(() => 0), x: 0, z: 0, t: 0, seen: false, purr };
  };
  const mine = watcher(1.2);
  let list = NONE;
  let theirs = [];
  let byEntry = new Map();
  function watch(next) {
    if (next === list) return;
    list = next;
    const was = byEntry;
    byEntry = new Map();
    theirs = [];
    for (const e of next) {
      const w = was.get(e) ?? watcher(0.6);
      byEntry.set(e, w);
      theirs.push(w);
    }
  }

  const pay = (id) => log?.awardOnce('housewing', FIND_KEY(id), SAY[id]());
  const onLedge = (l, p) => p.x >= l.minX && p.x <= l.maxX && p.z >= l.minZ && p.z <= l.maxZ && Math.abs(p.y - l.y) <= LEDGE_ON;

  function made1(i, w) {
    const s = state[i];
    if (s.done) return;
    s.done = true;
    if (s.f.id === 'sofa') audio?.purr?.(w.purr);
    else if (s.f.id === 'fishtank') audio?.musicBoxNote?.(988);
    else if (s.f.id === 'tap') { audio?.musicBoxNote?.(1319); audio?.musicBoxNote?.(1175); }
    pay(s.f.id);
  }

  function look(w, p, dt, t, isMine) {
    let speed = 0;
    if (w.seen) {
      const span = t > w.t ? t - w.t : dt;
      if (span > 0) speed = Math.hypot(p.x - w.x, p.z - w.z) / span;
    }
    w.seen = true;
    w.x = p.x; w.z = p.z; w.t = t;
    const still = speed < STILL;
    for (let i = 0; i < state.length; i++) {
      const s = state[i];
      const f = s.f;
      if (f.trigger === 'arrive') {
        if (!s.done && s.ledge && onLedge(s.ledge, p)) made1(i, w);
      } else if (f.trigger === 'stay' || f.trigger === 'nap') {
        const near = Math.hypot(p.x - f.x, p.z - f.z) <= f.r && (f.trigger === 'stay' || (p.y >= f.minY && still));
        if (!near) { w.hold[i] = 0; continue; }
        w.hold[i] += dt;
        if (w.hold[i] >= f.holdS) { w.hold[i] = 0; made1(i, w); }
      }
    }
    let lying = false;
    for (let k = 0; k < slots.length; k++) {
      const sl = slots[k];
      const near = still && p.y < SLOT_FLOOR && Math.hypot(p.x - sl.x, p.z - sl.z) <= sl.r;
      if (!near) { w.slot[k] = 0; continue; }
      w.slot[k] += dt;
      if (w.slot[k] >= CALM_AFTER) lying = true;
      if (slotFind && w.slot[k] >= slotFind.holdS && !((slotMask >> k) & 1)) {
        slotMask |= 1 << k;
        audio?.purr?.(w.purr);
        if (!slotPaid) { slotPaid = true; state[finds.indexOf(slotFind)].done = true; pay('sunslot'); }
      }
    }
    if (isMine) calm = lying;
  }

  return {
    get calm() { return calm; },
    get slotsLain() { return slotMask; },
    get watching() { return 1 + theirs.length; },
    get watchersMade() { return made; },
    // the lit patch's brightness: 1, or breathing a little while she lies in a slot (not under reduced motion)
    pulse(t) { return calm && !reducedMotion ? 1 + 0.25 * Math.sin(t * BREATH) : calm ? 1.2 : 1; },
    update(dt, t, catPos, partners = NONE) {
      watch(partners);
      look(mine, catPos, dt, t, true);
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.water?.placed !== false) look(theirs[i], e.group.position, dt, t, false);
      }
      if (!allPaid && allBits > 0 && slotMask === allBits) {
        allPaid = true;
        const i = finds.findIndex((f) => f.trigger === 'slots');
        if (i >= 0) { state[i].done = true; audio?.chime?.(); pay('sunall'); }
      }
    },
    dispose() { calm = false; },
  };
}
