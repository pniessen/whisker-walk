// THE OLD HOUSE'S SIX DISCOVERIES, AT RUN TIME (Old House step 2, rulings D6-D9).
// house life runs this every frame with her position. Where each find is, and what
// sets it off, is housethings.js's HOUSE_FINDS; the parts that move are houseparts.js's
// findParts (house.js hands them over as house.parts). No button: she finds them by
// being there (D6).
//   clock     she stays at its foot: it strikes the hour on her device's clock, 1-12
//             bongs (D7), and again only once she has walked off and come back. Its
//             pendulum swings at 1 Hz, still under reduced motion.
//   piano     her paws on the keys' ledge: each key she steps onto plays its note, C4
//             to C5 west to east (D8); six different keys since she stepped up is a tune.
//   window    her paws on the attic window seat's ledge.
//   bookcase  she stays at the shut bookcase, from either side: it swings open onto the
//             secret stair (D9), away from her (rough edge 3): from the library into the
//             stair, about its back west corner, from the stair into the library, about its
//             hinge (houseplan.js secretPivot). Its shut colliders hold her out of the swing
//             and swap for the open ones in the walk's own live list once it has swung (at
//             once under reduced motion), and its fade shape (treefade.js) follows the leaf.
//             It stays open; a walk picked up again finds it shut. Shut, swinging or
//             open, it is held solid (treefade.js fadeHold) unless, seen from above, the
//             line from the camera to her passes it: the tree fade's line runs on past
//             her (PAST_LOOK), and so faded the shut bookcase she walked up to, the stair
//             showing through it, and hid its swing (Task 10, from the pictures).
//   cushion   she stays still on the hearth cushion: a purr.
//   toys      she stays at the toy box: its lid tips and three toys tumble out.
// Each pays once a walk by the log's own rule (awardOnce: a walk picked up again has its
// entries back, so nothing pays twice); a strike, a note or a purr may come again.
// Speed is measured from her position between frames, as critters.js measures it.
// update allocates only when something happens (a strike's notes, a find's line).
// Draws on no stream (D19).
// Step 4 (W13): on a co-walk the finds watch every cat on the walk, hers first and each
// partner (a remotecats.js entry, at entry.group.position) after: each its own holds, arming,
// speed and piano keys, made when the entry is first seen and dropped once a new list no
// longer holds it (an unchanged list allocates nothing). A find a partner makes pays this
// child too (awardOnce); the bookcase swings away from the cat whose hold completed; the
// clock strikes only when it is not striking (n bongs and a second more), so two cats at its
// foot hear one strike; a partner's cushion purrs at 0.6. A once-only find (the toys, the
// window) is done for every cat once one has found it. No message, no field.

import { phrase } from '../clanphrases.js';
import { fadeEntryOf } from '../treefade.js';
import { HOUSE_LEDGES, LEDGE_ON, SECRET_BOOKCASE, SECRET_OPEN_ROT_Y, SECRET_STAIR_ROT_Y, secretPivot } from './houseplan.js';
import { LID_OPEN, pianoKeyAt } from './houseparts.js';

export const FIND_KEY = (id) => `house-find-${id}`;
// The piano's eight keys, C4 to C5, west to east (Hz).
export const PIANO_SCALE = Object.freeze([262, 294, 330, 349, 392, 440, 494, 523]);
export const STILL = 0.25; // m/s: slower than this is still (the cushion)
const AWAY = 1; // m past its r she must go before the clock strikes again
const TUNE = 6; // different keys
const BONG_HZ = 196;
const BONG_GAP = 1.1; // s between bongs
const NONE = Object.freeze([]);
const SWING = 0.12; // rad: the pendulum's swing, 1 Hz
const TOYS_S = 0.8;
const LID_SHARE = 0.4; // of TOYS_S, the lid's tip
const TOYS_WAIT = 0.25; // of TOYS_S, before the toys tumble (the lid is well up by then)
const DIP = 0.01; // m: a key under her paws
const TOY_HOP = 0.5; // m: how high a toy tumbles over the rim
// m past a fading piece's footprint (the leaf's: past its half depth) that a sight line may
// pass and fade it; house life's furniture hold uses the same (houselife.js imports it)
export const HOLD_PAD = 0.1;

// The distance, seen from above, from (px, pz) to the segment a-b.
function pointSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const k = l2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - (ax + dx * k), pz - (az + dz * k));
}
// The least distance, seen from above, between the segments a-b and c-d (0 when they cross).
export function segSeg(ax, az, bx, bz, cx, cz, dx, dz) {
  const side = (px, pz, qx, qz, rx, rz) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
  const d1 = side(cx, cz, dx, dz, ax, az), d2 = side(cx, cz, dx, dz, bx, bz);
  const d3 = side(ax, az, bx, bz, cx, cz), d4 = side(ax, az, bx, bz, dx, dz);
  if (((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))) return 0;
  return Math.min(pointSeg(ax, az, cx, cz, dx, dz), pointSeg(bx, bz, cx, cz, dx, dz),
    pointSeg(cx, cz, ax, az, bx, bz), pointSeg(dx, dz, ax, az, bx, bz));
}

// The lines, by literal id (clanphrases.js wants every phrase id literal).
const SAY = {
  clock: (n) => phrase('house.find.clock', n),
  piano: () => phrase('house.find.piano'),
  window: () => phrase('house.find.window'),
  bookcase: () => phrase('house.find.bookcase'),
  cushion: () => phrase('house.find.cushion'),
  toys: () => phrase('house.find.toys'),
};

const ease = (k) => k * k * (3 - 2 * k);

export function createHouseFinds({
  finds, secret = null, colliders = [], parts = {}, log = null, audio = null, reducedMotion = false, now = () => new Date(),
}) {
  const B = SECRET_BOOKCASE;
  const state = finds.map((f) => ({ f, done: false, ledge: f.ledge ? HOUSE_LEDGES.find((l) => l.id === f.ledge) : null }));
  // a cat watched: its hold and arming at each find, its piano key and keys played (as bits),
  // where it was last frame (its speed), and how loud its purr is
  let made = 0;
  const watcher = (purr) => {
    made++;
    return { hold: finds.map(() => 0), armed: finds.map(() => true), key: -1, played: 0, x: 0, z: 0, t: 0, seen: false, purr };
  };
  const mine = watcher(1.2);
  let list = NONE; // the partners' list last seen
  let theirs = []; // their watchers, in list order
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
  let strikeLeft = 0; // s the strike now sounding has still to run
  const { pendulum = null, keys = [], lid = null, toys = [] } = parts;
  const pivot = secret?.group ?? null;
  const leaf = pivot?.userData.leaf ?? null;
  let open = false;
  let into = 'library'; // the side it swings to: away from her (rough edge 3)
  let swing = -1; // seconds into the bookcase's swing while it swings, else -1
  let tipped = -1; // seconds into the toys' tumble while they tumble, else -1
  let down = 0; // the keys under a cat's paws, as bits

  const pay = (id, ...a) => log?.awardOnce('housefind', FIND_KEY(id), SAY[id](...a));
  const onLedge = (l, p) => p.x >= l.minX && p.x <= l.maxX && p.z >= l.minZ && p.z <= l.maxZ && Math.abs(p.y - l.y) <= LEDGE_ON;

  function strike() {
    if (strikeLeft > 0) return;
    const n = now().getHours() % 12 || 12;
    strikeLeft = n * BONG_GAP + 1.0;
    const notes = [];
    for (let i = 0; i < n; i++) notes.push({ at: i * BONG_GAP, freq: BONG_HZ, dur: 1.0 });
    audio?.playTune(notes);
    pay('clock', n);
  }

  // The bookcase opens, swinging away from her: from the library side (her z past the wall
  // line) into the stair, else into the library. The swing starts; its colliders wait for it.
  function openBookcase(p) {
    open = true;
    into = p.z >= B.z ? 'stair' : 'library';
    swing = reducedMotion ? B.openS : 0;
    pay('bookcase');
  }
  // It has swung: the shut colliders out of the walk's live list, the open ones in.
  function swapColliders(list) {
    for (let i = colliders.length - 1; i >= 0; i--) if (colliders[i].secret) colliders.splice(i, 1);
    for (const c of list ?? []) colliders.push({ ...c });
  }

  // The leaf at angle a: the pivot turned about the side's own pivot (its group sits at the
  // hinge, so about the back corner it moves too), and its fade shape round the leaf's middle.
  const at = { x: 0, z: 0 };
  const PIVOTS = { library: secretPivot('library'), stair: secretPivot('stair') };
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

  function placeToys(k) {
    if (lid) lid.rotation.x = LID_OPEN * ease(Math.min(1, k / LID_SHARE));
    const kt = Math.max(0, (k - TOYS_WAIT) / (1 - TOYS_WAIT));
    for (const q of toys) {
      const m = q.mesh.position;
      m.lerpVectors(q.from, q.rest, ease(kt));
      m.y += TOY_HOP * 4 * kt * (1 - kt);
      q.mesh.rotation.y = q.yaw * kt;
    }
  }

  function trigger(i, w, p, dt, speed) {
    const s = state[i];
    const f = s.f;
    const d = Math.hypot(p.x - f.x, p.z - f.z);
    switch (f.trigger) {
      case 'stay':
      case 'still':
      case 'secret': {
        if (d > f.r) {
          w.hold[i] = 0;
          if (d > f.r + (f.id === 'clock' ? AWAY : 0)) w.armed[i] = true;
          return;
        }
        if (!w.armed[i] || (f.trigger === 'still' && speed >= STILL)) { w.hold[i] = 0; return; }
        w.hold[i] += dt;
        if (w.hold[i] < f.holdS) return;
        w.hold[i] = 0;
        if (f.id === 'clock') { w.armed[i] = false; strike(); } else if (f.id === 'cushion') {
          w.armed[i] = false;
          audio?.purr(w.purr);
          pay('cushion');
        } else if (f.trigger === 'secret') {
          w.armed[i] = false;
          if (!open) openBookcase(p);
        } else if (!s.done) {
          s.done = true;
          tipped = reducedMotion ? TOYS_S : 0;
          pay(f.id);
        }
        return;
      }
      case 'arrive':
        if (!s.done && onLedge(s.ledge, p)) { s.done = true; pay(f.id); }
        return;
      case 'along': {
        const l = s.ledge;
        if (!onLedge(l, p)) { w.key = -1; w.played = 0; return; }
        const k = pianoKeyAt(l.minX, l.maxX, p.x);
        down |= 1 << k;
        if (k === w.key) return;
        w.key = k;
        audio?.musicBoxNote(PIANO_SCALE[k]);
        w.played |= 1 << k;
        let n = 0;
        for (let b = w.played; b; b >>= 1) n += b & 1;
        if (n >= TUNE) pay('piano');
        return;
      }
      default:
    }
  }

  // Whether the leaf, at the pivot's angle, stands in the camera's line to her (from above).
  function leafInLine(cam, cat) {
    const a = pivot.rotation.y;
    const hx = pivot.position.x, hz = pivot.position.z;
    const tx = hx + B.w * Math.cos(a);
    const tz = hz - B.w * Math.sin(a);
    return segSeg(cam.x, cam.z, cat.x, cat.z, hx, hz, tx, tz) < B.d / 2 + HOLD_PAD;
  }

  // One cat's frame at every find: its speed from where it was last frame, then the triggers.
  function look(w, p, dt, t) {
    let speed = 0;
    if (w.seen) {
      const span = t > w.t ? t - w.t : dt;
      if (span > 0) speed = Math.hypot(p.x - w.x, p.z - w.z) / span;
    }
    w.seen = true;
    w.x = p.x; w.z = p.z; w.t = t;
    for (let i = 0; i < state.length; i++) trigger(i, w, p, dt, speed);
  }

  return {
    get open() { return open; },
    get striking() { return strikeLeft > 0; },
    get watching() { return 1 + theirs.length; },
    get watchersMade() { return made; }, // every watcher ever made, hers included (a test's count)
    // camPos: the camera, after player.update (house life hands it); without it the leaf's
    // fade is left to the tree fade alone. partners: the co-walkers (remotecats.js entries).
    update(dt, t, catPos, camPos = null, partners = NONE) {
      watch(partners);
      if (strikeLeft > 0) strikeLeft -= dt;
      down = 0;
      look(mine, catPos, dt, t);
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.water?.placed !== false) look(theirs[i], e.group.position, dt, t); // not drawn yet: not there
      }
      if (pendulum) pendulum.rotation.z = reducedMotion ? 0 : SWING * Math.sin(2 * Math.PI * t);
      for (let i = 0; i < keys.length; i++) keys[i].position.y = (down >> i) & 1 ? -DIP : 0;
      if (swing >= 0) {
        turnTo((into === 'stair' ? SECRET_STAIR_ROT_Y : SECRET_OPEN_ROT_Y) * ease(Math.min(1, swing / B.openS)));
        if (swing >= B.openS) { // there, it stays open, and she may walk through
          swing = -1;
          swapColliders(into === 'stair' ? secret?.stair : secret?.open);
        } else swing += dt;
      }
      if (tipped >= 0) {
        placeToys(Math.min(1, tipped / TOYS_S));
        tipped = tipped >= TOYS_S ? -1 : tipped + dt;
      }
      if (leaf && camPos) leaf.userData.fadeHold = !leafInLine(camPos, catPos);
    },
    // Everything back as it was built: the bookcase shut, its shut colliders back.
    dispose() {
      if (open) swapColliders(secret?.shut);
      turnTo(0);
      if (leaf) leaf.userData.fadeHold = false;
      if (pendulum) pendulum.rotation.z = 0;
      for (const k of keys) k.position.y = 0;
      placeToys(0);
    },
  };
}
