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
// Milestone 3, the secret wonder room:
//   wardrobe  she stays at the shut kids' wardrobe 0.8 s, from either side: it swings open away from her (the library bookcase's way,
//             housefinds.js), its shut colliders swap for the open ones in the walk's live list once it has swung, the corner map shows the
//             stair and the room (the house hands `reveal`), the level drawing may join the two zones (`open`), and a soft chime plays. It
//             pays housefind's 12 and stays open the rest of the walk; a walk picked up again finds it shut. A faint crinkle comes from it
//             while it is shut and she is within 2 m.
//   tunnel    she walks through the crinkly tunnel from one mouth to the other (in it she moves at WING_TUNNEL.pace, a crinkle every half metre)
//   treetop   her paws on the cat tree's crown
//   scratch   she stays at the scratching post 1.5 s
//   feather   she walks into the feather on its spring: it dances while any cat is within 1.2 m and swings back at a pounce
// Each pays once a walk by the log's own rule (awardOnce, type `housewing`, key house-find-<id>: a walk picked up again has its
// entries back, so nothing pays twice). Co-walk: every cat on the walk is watched, hers first and each partner (a remotecats.js entry,
// at entry.group.position) after, each with its own holds; a find a partner makes pays this child too, and a slot lain in
// by either counts toward sunall. `calm` is true while HER cat lies in a slot (the air and the sound read it). update allocates
// nothing unless a find is made. Draws on no stream.

import { phrase } from '../clanphrases.js';
import { words } from '../wordset.js';
import './housewingwords.js';
import { fadeEntryOf } from '../treefade.js';
import {
  HOUSE_LEDGES, LEDGE_ON, HOUSE_LEVELS, SECRET_WARDROBE, SECRET_OPEN_ROT_Y, SECRET_STAIR_ROT_Y, WING_TUNNEL, wardrobePivot,
} from './houseplan.js';
import { FIND_KEY, STILL, HOLD_PAD, segSeg } from './housefinds.js';
import { WING_FEATHER } from './housewingthings.js';

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
  wardrobe: () => phrase('house.find.wardrobe'),
  tunnel: () => phrase('house.find.tunnel'),
  treetop: () => phrase('house.find.treetop'),
  scratch: () => phrase('house.find.scratch'),
  feather: () => phrase('house.find.feather'),
};
const ATTIC_Y = HOUSE_LEVELS.find((l) => l.id === 'attic').y;
const ease = (k) => k * k * (3 - 2 * k);
const CRINKLE_NEAR = 2; // m from the shut wardrobe a faint crinkle comes from it
const CRINKLE_GAP = 3.5; // s between those
const FLICK_S = 1.1; // s the feather swings back for
const inRect = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

export function createHouseWingFinds({
  finds = NONE, slots = NONE, log = null, audio = null, reducedMotion = false,
  wardrobe = null, colliders = [], wonder = null, reveal = null,
} = {}) {
  const B = SECRET_WARDROBE;
  const pivot = wardrobe?.group ?? null;
  const leaf = pivot?.userData.leaf ?? null;
  let open = false;
  let into = 'room'; // the side it swings to: away from her
  let swing = -1; // seconds into the swing while it swings, else -1
  let crinkleIn = 0;
  let flick = -1; // seconds into the feather's swing back, else -1
  let wake = 0; // 0..1: how awake the feather is
  let inTunnel = false;
  let tunnelStep = 0;
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
    return { hold: finds.map(() => 0), slot: slots.map(() => 0), x: 0, z: 0, t: 0, seen: false, purr, armed: true, tun: 0 };
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

  const pay = (id) => log?.awardOnce(id === 'wardrobe' ? 'housefind' : 'housewing', FIND_KEY(id), SAY[id]()); // the wardrobe's pays the old six's 12
  const onLedge = (l, p) => p.x >= l.minX && p.x <= l.maxX && p.z >= l.minZ && p.z <= l.maxZ && Math.abs(p.y - l.y) <= LEDGE_ON;

  function made1(i, w) {
    const s = state[i];
    if (s.done) return;
    s.done = true;
    if (s.f.id === 'sofa') audio?.purr?.(w.purr);
    else if (s.f.id === 'fishtank') audio?.musicBoxNote?.(988);
    else if (s.f.id === 'tap') { audio?.musicBoxNote?.(1319); audio?.musicBoxNote?.(1175); } else if (s.f.id === 'scratch') { audio?.hiss?.(0.3); audio?.hiss?.(0.2); } else if (s.f.id === 'tunnel') audio?.chime?.();
    pay(s.f.id);
  }

  // The wardrobe opens, swinging away from her: from the kids' room (her z past the wall line) into the stair, else into the room.
  function openWardrobe(p) {
    open = true;
    into = p.z >= B.z ? 'stair' : 'room';
    swing = reducedMotion ? B.openS : 0;
    audio?.chime?.();
    pay('wardrobe');
    reveal?.(true);
  }
  // It has swung: the shut colliders out of the walk's live list, the open ones in.
  function swapColliders(list) {
    for (let i = colliders.length - 1; i >= 0; i--) if (colliders[i].wardrobe) colliders.splice(i, 1);
    for (const c of list ?? []) colliders.push({ ...c });
  }
  const at = { x: 0, z: 0 };
  const PIVOTS = { room: wardrobePivot('room'), stair: wardrobePivot('stair') };
  // The leaf at angle a: the group turned about the side's own pivot (it sits at the hinge, so about the back corner it moves too), and its fade shape round the leaf's middle.
  function turnTo(a) {
    if (!pivot) return;
    const p = PIVOTS[into];
    const dx = B.hinge.x - p.x, dz = B.hinge.z - p.z;
    const c = Math.cos(a), s = Math.sin(a);
    at.x = p.x + dx * c + dz * s;
    at.z = p.z - dx * s + dz * c;
    pivot.rotation.y = a;
    pivot.position.x = at.x;
    pivot.position.z = at.z;
    const e = leaf && fadeEntryOf.get(leaf);
    if (!e) return;
    e.x = at.x + (B.w / 2) * c;
    e.z = at.z - (B.w / 2) * s;
    for (const sh of e.shapes) { sh.x = e.x; sh.z = e.z; }
  }
  // Whether the leaf, at its angle, stands in the camera's line to her (from above): then it may fade; otherwise it is held solid.
  function leafInLine(cam, cat) {
    const a = pivot.rotation.y;
    const hx = pivot.position.x, hz = pivot.position.z;
    return segSeg(cam.x, cam.z, cat.x, cat.z, hx, hz, hx + B.w * Math.cos(a), hz - B.w * Math.sin(a)) < B.d / 2 + HOLD_PAD;
  }
  const FEATHER_AT = { x: WING_FEATHER.x, z: WING_FEATHER.z };
  const mouthD = (p, k) => Math.hypot(p.x - WING_TUNNEL.mouths[k].x, p.z - WING_TUNNEL.mouths[k].z);
  const tunnelMouth = (p, k) => Math.hypot(p.x - WING_TUNNEL.mouths[k].x, p.z - WING_TUNNEL.mouths[k].z) <= WING_TUNNEL.mouths[k].r;
  const inTunnelAt = (p) => p.y < ATTIC_Y + 0.5 && p.y > ATTIC_Y - 0.5 && (inRect(WING_TUNNEL.inside[0], p.x, p.z) || inRect(WING_TUNNEL.inside[1], p.x, p.z));

  function look(w, p, dt, t, isMine) {
    let speed = 0;
    let moved = 0;
    if (w.seen) {
      const span = t > w.t ? t - w.t : dt;
      moved = Math.hypot(p.x - w.x, p.z - w.z);
      if (span > 0) speed = moved / span;
    }
    w.seen = true;
    w.x = p.x; w.z = p.z; w.t = t;
    const still = speed < STILL;
    for (let i = 0; i < state.length; i++) {
      const s = state[i];
      const f = s.f;
      if (f.trigger === 'arrive') {
        if (!s.done && s.ledge && onLedge(s.ledge, p)) made1(i, w);
      } else if (f.trigger === 'secret') {
        // the shut wardrobe: stay at it for holdS, from either side; it opens once for the walk (and a hold must start afresh after she has gone off)
        const d = Math.hypot(p.x - f.x, p.z - f.z);
        if (d > f.r) { w.hold[i] = 0; w.armed = true; continue; }
        if (!w.armed || open) { w.hold[i] = 0; continue; }
        w.hold[i] += dt;
        if (w.hold[i] >= f.holdS) { w.hold[i] = 0; w.armed = false; s.done = true; openWardrobe(p); }
      } else if (f.trigger === 'pounce') {
        if (!s.done && p.y < ATTIC_Y + 0.4 && Math.hypot(p.x - f.x, p.z - f.z) <= f.r) { flick = 0; made1(i, w); }
      } else if (f.trigger === 'stay' || f.trigger === 'nap') {
        const near = Math.hypot(p.x - f.x, p.z - f.z) <= f.r && (f.trigger === 'stay' || (p.y >= f.minY && still));
        if (!near) { w.hold[i] = 0; continue; }
        w.hold[i] += dt;
        if (w.hold[i] >= f.holdS) { w.hold[i] = 0; made1(i, w); }
      }
    }
    // the crinkly tunnel: in from one mouth and out of the other pays `tunnel`; inside she is slowed and crinkles every half metre
    const inside = inTunnelAt(p);
    if (isMine) {
      if (inside) tunnelStep += moved;
      if (tunnelStep >= WING_TUNNEL.crinkleEvery) { tunnelStep -= WING_TUNNEL.crinkleEvery; audio?.hiss?.(0.14); }
      if (!inside) tunnelStep = 0;
      inTunnel = inside;
    }
    if (inside) {
      if (w.tun === 0) w.tun = mouthD(p, 0) <= mouthD(p, 1) ? 1 : 2; // which mouth she came in by (the other is where she must come out)
    } else if (w.tun !== 0) {
      const far = w.tun === 1 ? 1 : 0;
      if (tunnelMouth(p, far)) { const i = finds.findIndex((q) => q.trigger === 'through'); if (i >= 0) made1(i, w); w.tun = 0; } else if (tunnelMouth(p, 1 - far) || !tunnelMouth(p, far)) w.tun = 0;
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
    get open() { return open; }, // the kids' wardrobe stands open (the level drawing may join the wonder room, the map shows it)
    get inTunnel() { return inTunnel; },
    /** her pace now, as a share of her walk: the tunnel slows her. */
    get pace() { return inTunnel ? WING_TUNNEL.pace : 1; },
    get slotsLain() { return slotMask; },
    get watching() { return 1 + theirs.length; },
    get watchersMade() { return made; },
    // the lit patch's brightness: 1, or breathing a little while she lies in a slot (not under reduced motion)
    pulse(t) { return calm && !reducedMotion ? 1 + 0.25 * Math.sin(t * BREATH) : calm ? 1.2 : 1; },
    update(dt, t, catPos, partners = NONE, camPos = null) {
      watch(partners);
      look(mine, catPos, dt, t, true);
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.water?.placed !== false) look(theirs[i], e.group.position, dt, t, false);
      }
      // the wardrobe's swing, its hold and its clue
      if (swing >= 0) {
        turnTo((into === 'stair' ? SECRET_STAIR_ROT_Y : SECRET_OPEN_ROT_Y) * ease(Math.min(1, swing / B.openS)));
        if (swing >= B.openS) { // there, it stays open, and she may walk through
          swing = -1;
          swapColliders(into === 'stair' ? wardrobe?.stair : wardrobe?.open);
        } else swing += dt;
      }
      if (leaf && camPos) leaf.userData.fadeHold = !leafInLine(camPos, catPos);
      if (!open && audio && Math.hypot(catPos.x - B.x, catPos.z - B.z) <= CRINKLE_NEAR) {
        crinkleIn -= dt;
        if (crinkleIn <= 0) { crinkleIn = CRINKLE_GAP; audio.hiss?.(0.07); }
      } else crinkleIn = 0;
      // the feather: awake while any cat is within its wake distance, flicked back by a pounce
      if (wonder?.wand) {
        let near = Math.hypot(catPos.x - FEATHER_AT.x, catPos.z - FEATHER_AT.z) <= WING_FEATHER.wake && catPos.y < ATTIC_Y + 1;
        for (let i = 0; i < list.length && !near; i++) {
          const q = list[i].group.position;
          near = Math.hypot(q.x - FEATHER_AT.x, q.z - FEATHER_AT.z) <= WING_FEATHER.wake && q.y < ATTIC_Y + 1;
        }
        wake += ((near ? 1 : 0) - wake) * Math.min(1, dt * 4);
        const g = wonder.wand;
        let fx = 0, fz = 0;
        if (flick >= 0) {
          const k = Math.min(1, flick / FLICK_S);
          fx = 0.9 * (1 - k) * Math.cos(k * 18);
          flick = flick >= FLICK_S ? -1 : flick + dt;
        }
        g.rotation.x = reducedMotion ? 0.12 * wake : fx + 0.28 * wake * Math.sin(t * 6.1);
        g.rotation.z = reducedMotion ? 0 : fz + 0.2 * wake * Math.sin(t * 4.3);
      }
      if (wonder?.lightMats && !reducedMotion) {
        wonder.lightMats[0].color.setRGB(1, 0.85 + 0.1 * Math.sin(t * 2.1), 0.54).multiplyScalar(0.85 + 0.15 * Math.sin(t * 3.3));
        wonder.lightMats[1].color.setRGB(1, 0.7, 0.62).multiplyScalar(0.85 + 0.15 * Math.sin(t * 3.3 + 2));
      }
      if (!allPaid && allBits > 0 && slotMask === allBits) {
        allPaid = true;
        const i = finds.findIndex((f) => f.trigger === 'slots');
        if (i >= 0) { state[i].done = true; audio?.chime?.(); pay('sunall'); }
      }
    },
    // Everything back as it was built: the wardrobe shut with its shut colliders, the feather still.
    dispose() {
      calm = false;
      if (open) swapColliders(wardrobe?.shut);
      open = false;
      swing = -1;
      turnTo(0);
      if (leaf) leaf.userData.fadeHold = false;
      if (wonder?.wand) { wonder.wand.rotation.x = 0; wonder.wand.rotation.z = 0; }
      inTunnel = false;
      reveal?.(false);
    },
  };
}
