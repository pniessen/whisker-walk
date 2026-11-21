// =============================================================================
// The Market Square's life (step 2): the stallholders behind their counters,
// turning to the back shelf in their own rhythm, the "busy" bubble over their
// heads (Task 11). Task 12 adds everything a cat does here (the grab and the
// munch, the shoo and the hop, the coo, the refill); the walk (Task 13) makes
// one through the Market's loader (world/areas.js `life.createMarketLive`) and
// every other walk holds marketnone.js's NO_MARKET in its place.
//
// createMarketLive(scene, area, opts) → MarketLive
//   area   world/market.js's build record: `keepers` (where each stallholder
//          stands, its front yaw and its stall's roof top; every stall with a
//          stallholder must have one, and every guarded one a finite roof, or
//          this throws before adding anything), and `treatMeshes`
//          (Task 12 hides and shows them)
//   opts   { seed, now = () => Date.now() / 1000, reducedMotion = false, ground = FLAT_GROUND,
//            isFree = () => true, onEvent = () => {}, figure = twolegKeeper }
//
// MarketLive: { stalls, keepers, groups, treats, actionFor(s), act(action, s, ctx),
//               update(dt, t, { cat, player, session }), remotePick(remote, itemId),
//               restore(log), dispose() }
//   stalls   StallLive[]: the four guarded stalls (TREAT_STALLS order), then the
//            café. StallLive: { id, itemId, phase, watching, bubble, cooing, shooT,
//            treatOut, refillT, facing, look }:
//              look     the stall's own phase record, which stallPhase fills each
//                       frame (the rhythm, untouched by anything a cat does); null
//                       for the café, which has no rhythm;
//              phase, watching, bubble, facing   what the stall shows and does
//                       this frame. Task 11 copies them from `look`; Task 12's
//                       coo overrides them (the bubble down, the figure turned to
//                       the cat) while the rhythm runs on underneath in `look`;
//              cooing   null | { who, t }; shooT, treatOut, refillT: Task 12's.
//            The café: phase null, never watching, no bubble, no figure.
//   keepers  { [stallId]: { group, arm, bubble, broom } } for the six stalls with
//            a stallholder: the figure's group and arm, its bubble (a Sprite;
//            null for the two serve-only stalls) and the broom in its hand
//            (hidden until a shoo; null for the serve-only stalls).
//   groups   the six figures' groups, for the walk's contact shadows
//            (decals.follow, as fairshow.js's `groups`).
//   treats   the walk's tally of treats eaten (Task 12 counts, Task 13 restores).
//
// THE RHYTHM. Each guarded stall runs marketrules.js's stallPhase on the time
// of day (`now()`, seconds) plus its own offset from stallOffsets(seed), so two
// devices with one seed and one clock see every stallholder alike. The figure
// faces front (`area.keepers[id].yaw`) turned by facing * pi: 0 serving, pi
// turned to the back shelf, eased through the turn and the turn back.
//
// THE FIGURE (U7) is `opts.figure` (default marketkeeper.js's twolegKeeper),
// { group, arm, headY, hand?, dispose() }. This file touches only the group's
// position and yaw, the arm's swing (rotation.z, from where it rests) and the
// broom it parents to the arm at `hand`; the bubble never sits below headY.
// No stall logic reads inside the figure, so a new figure replaces one file.
//
// THE BUBBLE: one Sprite per guarded stall, one shared transparent material on
// marketparts.js's bubble texture (three dots, no letters: M12), 0.5 m wide.
// It floats BUBBLE_FORWARD (0.6 m) in front of the stallholder, toward the
// counter, so it reads as theirs, its middle 0.35 m above the top of the
// stall's roof and sign (`area.keepers[id].roof`, market.js's stallRoof), or
// above the stallholder's crown if that were higher. Under the awning (the
// first place it went) the awning, its valance and the sign hid it from every
// camera a cat has; up here a cat's camera looks past the sign's top edge to
// it. Over the counter's front line it was 1-1.5 m off the person and off
// screen from a cat 0.5 m out; 0.6 m forward keeps it in sight and on screen
// at the default zoom from every distance (test: the bubble's sightline). Drawn
// late (renderOrder) and still depth-tested. Shown exactly while the stall's
// `bubble` is up (busy, the turn, turned away: M3). It bobs a few cm; with
// reducedMotion it holds still (and the arms do not sway).
//
// THE ARMS sway while serving (the serve-only stallholders always), quicker
// and smaller while busy, and rest through the turns and while turned away.
// A guarded stallholder's sway grows in from rest over SWAY_RAMP at each
// phase's start and dies back to rest before its end, so no phase change
// makes an arm jump.
//
// WHAT IT ADDS (after the build, so the walk's static contact-shadow scan
// never sees them): six figures and four bubbles, top-level children; a broom
// of three meshes in each guarded stallholder's hand. Nothing casts. dispose()
// takes them all out and frees what this made (the figures, the brooms, the
// bubble's material and texture; the Sprite's geometry is three's own,
// shared). Everything is made inside withLocalUuids: making the life draws
// nothing from Math.random, and update() allocates nothing.
// =============================================================================
import * as THREE from 'three';
import { MARKET, STALL_TIMES, stallOffsets, stallPhase } from './marketrules.js';
import { STALLS, TREAT_STALLS, fromStall, toStall } from './world/marketplan.js';
import { createBubbleTexture, buildBroom } from './world/marketparts.js';
import { withLocalUuids } from './world/localuuids.js';
import { FLAT_GROUND } from './ground.js';
import { twolegKeeper } from './marketkeeper.js';
import { treatItemId } from './marketnone.js';

export const MARKET_LOOK = Object.freeze({
  BUBBLE_W: 0.5,     // m, the bubble's width (and height: its texture is square)
  BUBBLE_UP: 0.35,   // m, from the top of the stall's roof and sign (or the crown, if higher) to the bubble's middle
  BUBBLE_ORDER: 10,  // its renderOrder: drawn after the square (still depth-tested)
  BUBBLE_FORWARD: 0.6, // m, from the stallholder's spot toward the counter
  BOB: 0.025,        // m, how far the bubble bobs either way
  BOB_W: 3.1,        // rad/s
  SWAY: 0.32,        // rad, how far a serving arm swings out from its rest
  SWAY_W: 1.7,       // rad/s, the serving sway
  BUSY_SWAY: 0.18,   // rad, the quicker, smaller sway of a busy stallholder (wrapping up)
  BUSY_W: 4.2,       // rad/s
  SWAY_RAMP: 0.4,    // s: a guarded stallholder's sway grows in from rest at each phase's start and dies away before its end
});

const smooth = (k) => { const c = Math.min(1, Math.max(0, k)); return c * c * (3 - 2 * c); };

const HAND = Object.freeze({ x: 0, y: -0.5, z: 0 }); // a figure with no `hand`: half a metre down the arm

export function createMarketLive(scene, area, opts = {}) {
  const {
    seed = 0, now = () => Date.now() / 1000, reducedMotion = false, ground = FLAT_GROUND,
    isFree = () => true, onEvent = () => {}, figure = twolegKeeper,
  } = opts;
  // isFree (the hop's free-step check) and onEvent (what the walk turns into
  // lines and pay) are Task 12's: nothing in the people's half reads them.
  void isFree; void onEvent;
  const offsets = stallOffsets(seed);
  const gy = (x, z) => (ground.flat ? 0 : ground.y(x, z));
  const spots = area.keepers ?? {};

  const keepers = {};
  const groups = [];
  const made = {};      // per stall with a stallholder: { k, yaw, rest, phi, bubble, base }
  const treatRows = []; // the guarded stalls: made[id] and its StallLive and offset
  const serveRows = []; // the serve-only stalls: made[id]
  const owned = { figures: [], brooms: [], bubbles: [], material: null, texture: null };

  // Every stall with a stallholder needs its spot, and every guarded one its
  // roof top (the bubble's height): checked before anything is added.
  for (const s of STALLS) {
    if (!s.keeper) continue;
    if (!spots[s.id]) throw new Error(`createMarketLive: the area has no keeper spot for the '${s.id}' stall`);
    if (TREAT_STALLS.includes(s.id) && !Number.isFinite(spots[s.id].roof)) {
      throw new Error(`createMarketLive: the area's keeper spot for the '${s.id}' stall has no roof height`);
    }
  }

  try {
    withLocalUuids('market-live', makePeople);
  } catch (err) {
    freeAll(); // a figure that throws half way leaves nothing behind
    throw err;
  }

  function makePeople() {
    const texture = createBubbleTexture();
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    owned.texture = texture;
    owned.material = material;
    STALLS.forEach((s, i) => {
      if (!s.keeper) return;
      const spot = spots[s.id];
      const k = figure({ x: spot.x, z: spot.z, yaw: spot.yaw });
      owned.figures.push(k);
      k.group.position.set(spot.x, gy(spot.x, spot.z), spot.z);
      k.group.rotation.y = spot.yaw;
      k.group.name = `marketKeeper:${s.id}`;
      k.group.userData.keeper = s.id;
      scene.add(k.group);
      groups.push(k.group);
      // the arm's rest, and each stallholder's sway on a beat of its own
      const row = { k, yaw: spot.yaw, rest: k.arm.rotation.z, phi: i * 1.37, bubble: null, base: 0 };
      made[s.id] = row;
      if (!TREAT_STALLS.includes(s.id)) {
        keepers[s.id] = { group: k.group, arm: k.arm, bubble: null, broom: null };
        serveRows.push(row);
        return;
      }
      // the broom, in the hand, hidden until a shoo (Task 12 swings it)
      const broom = buildBroom();
      owned.brooms.push(broom);
      broom.name = `marketBroom:${s.id}`;
      const hand = k.hand ?? HAND;
      broom.position.set(hand.x, hand.y, hand.z);
      broom.visible = false;
      k.arm.add(broom);
      // the bubble: a little in front of the stallholder, above the stall's
      // roof and sign (a cat's camera looks up past the sign's top edge to
      // it), or over the stallholder's crown if that were higher
      const bubble = new THREE.Sprite(material);
      bubble.name = `marketBubble:${s.id}`;
      bubble.scale.set(MARKET_LOOK.BUBBLE_W, MARKET_LOOK.BUBBLE_W, 1);
      bubble.renderOrder = MARKET_LOOK.BUBBLE_ORDER;
      const kl = toStall(s, spot.x, spot.z);
      const at = fromStall(s, kl.lx, kl.lz + MARKET_LOOK.BUBBLE_FORWARD);
      const feet = k.group.position.y;
      const roof = gy(at.x, at.z) + spot.roof;
      const base = Math.max(roof, feet + k.headY) + MARKET_LOOK.BUBBLE_UP;
      bubble.position.set(at.x, base, at.z);
      bubble.visible = false;
      bubble.userData.noCast = true;
      owned.bubbles.push(bubble);
      scene.add(bubble);
      row.bubble = bubble;
      row.base = base;
      keepers[s.id] = { group: k.group, arm: k.arm, bubble, broom };
    });
  }

  // takes out and frees everything made so far (dispose, and a failed creation)
  function freeAll() {
    for (const broom of owned.brooms) {
      broom.removeFromParent();
      broom.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
    }
    for (const k of owned.figures) { k.group.removeFromParent(); k.dispose(); }
    for (const b of owned.bubbles) b.removeFromParent();
    owned.material?.dispose();
    owned.texture?.dispose();
    owned.brooms.length = 0;
    owned.figures.length = 0;
    owned.bubbles.length = 0;
    groups.length = 0;
  }

  const stalls = [];
  for (const id of TREAT_STALLS) {
    const st = {
      id, itemId: treatItemId(id), phase: 'serve', watching: true, bubble: false, cooing: null,
      shooT: 0, treatOut: true, refillT: 0, facing: 0,
      look: { phase: 'serve', k: 0, watching: true, bubble: false, facing: 0 },
    };
    stalls.push(st);
    if (made[id]) treatRows.push({ ...made[id], st, offset: offsets[id], serveS: STALL_TIMES[id].serve });
  }
  stalls.push({
    id: 'cafe', itemId: treatItemId('cafe'), phase: null, watching: false, bubble: false, cooing: null,
    shooT: 0, treatOut: true, refillT: 0, facing: 0, look: null,
  });

  let disposed = false;

  function pose(clock) {
    for (let i = 0; i < treatRows.length; i++) {
      const r = treatRows[i];
      const st = r.st;
      const look = stallPhase(st.id, r.offset, clock, st.look);
      st.phase = look.phase;
      st.watching = look.watching;
      st.bubble = look.bubble;
      st.facing = look.facing;
      r.k.group.rotation.y = r.yaw + st.facing * Math.PI;
      r.bubble.visible = st.bubble;
      r.bubble.position.y = reducedMotion ? r.base : r.base + MARKET_LOOK.BOB * Math.sin(clock * MARKET_LOOK.BOB_W + r.phi);
      // serving and busy sway, each grown in from rest and back to it inside its
      // phase, so no phase change makes the arm jump; still through the turns
      let swing = 0;
      if (!reducedMotion && (st.phase === 'serve' || st.phase === 'busy')) {
        const len = st.phase === 'serve' ? r.serveS : MARKET.BUSY_S;
        const u = look.k * len;
        const env = smooth(Math.min(u, len - u) / MARKET_LOOK.SWAY_RAMP);
        swing = env * (st.phase === 'serve'
          ? MARKET_LOOK.SWAY * (0.5 - 0.5 * Math.cos(clock * MARKET_LOOK.SWAY_W + r.phi))
          : MARKET_LOOK.BUSY_SWAY * (0.5 - 0.5 * Math.cos(clock * MARKET_LOOK.BUSY_W + r.phi)));
      }
      r.k.arm.rotation.z = r.rest + swing;
    }
    for (let i = 0; i < serveRows.length; i++) {
      const r = serveRows[i];
      r.k.arm.rotation.z = reducedMotion ? r.rest
        : r.rest + MARKET_LOOK.SWAY * (0.5 - 0.5 * Math.cos(clock * MARKET_LOOK.SWAY_W + r.phi));
    }
  }

  pose(now());

  const live = {
    stalls,
    keepers,
    groups,
    treats: 0,
    // Task 12: the grab prompt, the grab, the partner's pick, and the walk's resume (Task 13)
    actionFor: () => null,
    act: () => false,
    remotePick: () => false,
    restore() {},
    update(dt, t, ctx) { // eslint-disable-line no-unused-vars
      if (disposed) return;
      pose(now());
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      freeAll();
    },
  };
  return live;
}
