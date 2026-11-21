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
//   bookcase  she stays at the shut bookcase, from either side: it swings open on its
//             hinge onto the secret stair (D9). Its colliders swap in the walk's own live
//             list at the swing's start, and its fade shape (treefade.js) follows the leaf.
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

import { phrase } from '../clanphrases.js';
import { fadeEntryOf } from '../treefade.js';
import { HOUSE_LEDGES, SECRET_BOOKCASE, SECRET_OPEN_ROT_Y } from './houseplan.js';
import { LID_OPEN, pianoKeyAt } from './houseparts.js';

export const FIND_KEY = (id) => `house-find-${id}`;
// The piano's eight keys, C4 to C5, west to east (Hz).
export const PIANO_SCALE = Object.freeze([262, 294, 330, 349, 392, 440, 494, 523]);
export const STILL = 0.25; // m/s: slower than this is still (the cushion)
const ON_LEDGE = 0.1; // m: her paws this near a ledge's top are on it
const AWAY = 1; // m past its r she must go before the clock strikes again
const TUNE = 6; // different keys
const BONG_HZ = 196;
const BONG_GAP = 1.1; // s between bongs
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
function segSeg(ax, az, bx, bz, cx, cz, dx, dz) {
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
  const state = finds.map((f) => ({ f, hold: 0, armed: true, done: false, ledge: f.ledge ? HOUSE_LEDGES.find((l) => l.id === f.ledge) : null }));
  const { pendulum = null, keys = [], lid = null, toys = [] } = parts;
  const pivot = secret?.group ?? null;
  const leaf = pivot?.userData.leaf ?? null;
  let open = false;
  let swing = -1; // seconds into the bookcase's swing while it swings, else -1
  let tipped = -1; // seconds into the toys' tumble while they tumble, else -1
  let key = -1; // the key under her paws
  let played = 0; // the keys played since she stepped up, as bits
  let lastX = 0, lastZ = 0, lastT = 0, seen = false;

  const pay = (id, ...a) => log?.awardOnce('housefind', FIND_KEY(id), SAY[id](...a));
  const onLedge = (l, p) => p.x >= l.minX && p.x <= l.maxX && p.z >= l.minZ && p.z <= l.maxZ && Math.abs(p.y - l.y) <= ON_LEDGE;

  function strike() {
    const n = now().getHours() % 12 || 12;
    const notes = [];
    for (let i = 0; i < n; i++) notes.push({ at: i * BONG_GAP, freq: BONG_HZ, dur: 1.0 });
    audio?.playTune(notes);
    pay('clock', n);
  }

  // The bookcase opens: the shut colliders out of the walk's live list, the open ones in.
  function openBookcase() {
    open = true;
    for (let i = colliders.length - 1; i >= 0; i--) if (colliders[i].secret) colliders.splice(i, 1);
    for (const c of secret?.open ?? []) colliders.push({ ...c });
    swing = reducedMotion ? B.openS : 0;
    pay('bookcase');
  }

  // The leaf at angle a: the pivot turned, and its fade shape round the leaf's middle.
  function turnTo(a) {
    if (!pivot) return;
    pivot.rotation.y = a;
    const e = leaf && fadeEntryOf.get(leaf);
    if (!e) return;
    e.x = B.hinge.x + (B.w / 2) * Math.cos(a);
    e.z = B.hinge.z - (B.w / 2) * Math.sin(a);
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

  function trigger(s, p, dt, speed) {
    const f = s.f;
    const d = Math.hypot(p.x - f.x, p.z - f.z);
    switch (f.trigger) {
      case 'stay':
      case 'still':
      case 'secret': {
        if (d > f.r) {
          s.hold = 0;
          if (d > f.r + (f.id === 'clock' ? AWAY : 0)) s.armed = true;
          return;
        }
        if (!s.armed || (f.trigger === 'still' && speed >= STILL)) { s.hold = 0; return; }
        s.hold += dt;
        if (s.hold < f.holdS) return;
        s.hold = 0;
        if (f.id === 'clock') { s.armed = false; strike(); } else if (f.id === 'cushion') {
          s.armed = false;
          audio?.purr(1.2);
          pay('cushion');
        } else if (f.trigger === 'secret') {
          s.armed = false;
          if (!open) openBookcase();
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
        if (!onLedge(l, p)) { key = -1; played = 0; return; }
        const k = pianoKeyAt(l.minX, l.maxX, p.x);
        if (k === key) return;
        key = k;
        audio?.musicBoxNote(PIANO_SCALE[k]);
        played |= 1 << k;
        let n = 0;
        for (let b = played; b; b >>= 1) n += b & 1;
        if (n >= TUNE) pay('piano');
        return;
      }
      default:
    }
  }

  // Whether the leaf, at the pivot's angle, stands in the camera's line to her (from above).
  function leafInLine(cam, cat) {
    const a = pivot.rotation.y;
    const tx = B.hinge.x + B.w * Math.cos(a);
    const tz = B.hinge.z - B.w * Math.sin(a);
    return segSeg(cam.x, cam.z, cat.x, cat.z, B.hinge.x, B.hinge.z, tx, tz) < B.d / 2 + HOLD_PAD;
  }

  return {
    get open() { return open; },
    // camPos: the camera, after player.update (house life hands it); without it the leaf's
    // fade is left to the tree fade alone.
    update(dt, t, catPos, camPos = null) {
      let speed = 0;
      if (seen) {
        const span = t > lastT ? t - lastT : dt;
        if (span > 0) speed = Math.hypot(catPos.x - lastX, catPos.z - lastZ) / span;
      }
      seen = true;
      lastX = catPos.x; lastZ = catPos.z; lastT = t;
      for (let i = 0; i < state.length; i++) trigger(state[i], catPos, dt, speed);
      if (pendulum) pendulum.rotation.z = reducedMotion ? 0 : SWING * Math.sin(2 * Math.PI * t);
      for (let i = 0; i < keys.length; i++) keys[i].position.y = i === key ? -DIP : 0;
      if (swing >= 0) {
        turnTo(SECRET_OPEN_ROT_Y * ease(Math.min(1, swing / B.openS)));
        swing = swing >= B.openS ? -1 : swing + dt; // there, it stays open
      }
      if (tipped >= 0) {
        placeToys(Math.min(1, tipped / TOYS_S));
        tipped = tipped >= TOYS_S ? -1 : tipped + dt;
      }
      if (leaf && camPos) leaf.userData.fadeHold = !leafInLine(camPos, catPos);
    },
    // Everything back as it was built: the bookcase shut, its shut colliders back.
    dispose() {
      if (open) {
        for (let i = colliders.length - 1; i >= 0; i--) if (colliders[i].secret) colliders.splice(i, 1);
        for (const c of secret?.shut ?? []) colliders.push({ ...c });
      }
      turnTo(0);
      if (leaf) leaf.userData.fadeHold = false;
      if (pendulum) pendulum.rotation.z = 0;
      for (const k of keys) k.position.y = 0;
      placeToys(0);
    },
  };
}
