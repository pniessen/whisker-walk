// =============================================================================
// The Market Square's life (step 2): the stallholders behind their counters,
// turning to the back shelf in their own rhythm, the "busy" bubble over their
// heads (Task 11), and everything a cat does here (Task 12: the grab and the
// munch, the shoo and the hop, the coo, the refill); the walk (Task 13) makes
// one through the Market's loader (world/areas.js `life.createMarketLive`) and
// every other walk holds marketnone.js's NO_MARKET in its place.
//
// createMarketLive(scene, area, opts) → MarketLive
//   area   world/market.js's build record: `keepers` (where each stallholder
//          stands, its front yaw and its stall's roof top; every stall with a
//          stallholder must have one, and every guarded one a finite roof, or
//          this throws before adding anything), and `treatMeshes` (the
//          display treats: hidden when grabbed, shown again at the refill)
//   opts   { seed, now = () => Date.now() / 1000, reducedMotion = false, ground = FLAT_GROUND,
//            isFree = () => true, onEvent = () => {}, figure = twolegKeeper }
//          isFree(x, z): may her cat stand there (the hop's check; the walk
//          passes isWalkableAt); onEvent(e): the events below.
//
// MarketLive: { stalls, keepers, groups, treats, actionFor(s), act(action, s, ctx),
//               update(dt, t, { cat, player, session }), remotePick(remote, itemId),
//               restore(log), dispose() }
//   stalls   StallLive[]: the four guarded stalls (TREAT_STALLS order), then the
//            café. StallLive: { id, itemId, phase, watching, bubble, cooing, shooT,
//            treatOut, refillT, facing, look }:
//              look     the stall's own phase record, which stallPhase fills each
//                       frame (the rhythm, untouched by anything a cat does; its
//                       `cooing` flag is the live stall's, for stallSees); null
//                       for the café, which has no rhythm;
//              phase    the rhythm's phase;
//              watching noticing a sneaking cat now: the rhythm's watching,
//                       and never while cooing (M5);
//              bubble   the rhythm's bubble, down while cooing;
//              facing   how far the figure is turned off front this frame
//                       (0 front, 1 the back shelf), whatever turned it;
//              cooing   null | { who: 'me' | playerId, t } (one record, reused);
//              shooT    seconds of broom left (SHOO_S at a shoo);
//              treatOut this device's treat is out; refillT seconds until it is
//                       laid out again (REFILL_S after a grab).
//            The café: phase null, never watching, no bubble, no figure.
//   keepers  { [stallId]: { group, arm, bubble, broom } } for the six stalls with
//            a stallholder: the figure's group and arm, its bubble (a Sprite;
//            null for the two serve-only stalls) and the broom in its hand
//            (hidden until a shoo; null for the serve-only stalls).
//   groups   the six figures' groups, for the walk's contact shadows
//            (decals.follow, as fairshow.js's `groups`).
//   treats   the walk's tally of treats eaten (Task 12 counts, restore() sets it).
//   actionFor(s)  { kind: 'grab', stall, prompt } for the nearest treat out within
//            TREAT_REACH of her cat (s.cat), from the ground (not perched, not
//            swimming) with no treat in her mouth and none being munched; else
//            null. One action object per stall, reused; `prompt` is
//            TREAT_WORDS[kind].prompt (a string).
//   act(action, s, { dropHeld })  the action button on a grab. Seen now (M4,
//            being cooed at included): the shoo and the hop, the treat stays
//            out, false. Otherwise whatever the mouth holds is set down
//            (dropHeld), the treat goes in (carry.js pick, `treat: true`), it is
//            no longer out, the refill starts, 'grab', true.
//   remotePick(remote, itemId)  a partner's 'carry-pick' of 'market-treat-<stall>'
//            (M7): false unless the id names a treat here and `remote` is on
//            the remotes list; then her munch shows on that cat, 'remote-eat',
//            and 'team' when that stall is cooing at her cat (or did, within
//            TEAM_GRACE_S). Never touches this device's treats or mouth.
//   restore(log)  a resumed walk: treats = how many 'market-treat-' keys the
//            walk's discovery log has paid (log.entries()).
//
// EVENTS (onEvent), for the walk (Task 13) to turn into lines and pay:
//   { type: 'grab', stall }
//   { type: 'eat', stall, kind, teamWith }   teamWith: the partner the stall was
//            cooing at when she grabbed it (or within TEAM_GRACE_S), else null
//   { type: 'shoo', stall, who, laugh, hopped }   laugh: that cat holds a treat
//            (she keeps it); hopped: her cat's hop began
//   { type: 'coo', stall, who }
//   { type: 'remote-eat', stall, who }
//   { type: 'team', stall, partner }
//
// THE SNEAK (Task 12). The cats are her own (update's cat, player, session)
// and each entry of session.remotes.list, hers first: never a stray (U5).
// Each has a record of its own, reused (made when a partner first shows,
// dropped when she leaves the list): where she is, her speed, crouched or
// not, up high (HIGH_Y over the ground: an awning) or not, a treat in her
// mouth or not, how long she has been still, and her distance to each treat
// this frame and last (APPROACH). Each guarded stall, each frame:
//   * cooing: nobody else is noticed. The coo ends after COO_S, when she
//     leaves the zone (or hides, or goes up high), when she moves (over
//     STILL_SPEED) or when she leaves the walk; if she moved toward the
//     treat, she is shooed as it ends (the rhythm's watching or not).
//   * waving the broom (shooT): nobody else is noticed.
//   * otherwise, a cat the stall sees (marketrules.js stallSees): still for
//     STILL_S and not yet cooed at by it this stop (moving clears that) is
//     cooed at; moving with her distance to the treat falling by more than
//     APPROACH m/s, once the last shoo's SHOO_REST_S is over, is shooed.
// The shoo: the broom up and waving over the counter for SHOO_S (its tip held
// inside the stall's footprint, above the counters: BROOM_BOX), the
// stallholder turned to the front. Her cat with an empty mouth hops back
// HOP_DIST along the stall's face over HOP_S: one isFree-checked step a frame
// added to wherever her own walk took her (nothing of the player is
// touched, so the stick works throughout), stopping at the first refused
// step; session.landTime = 0.12 when it lands. A cat with a treat is laughed
// at and keeps it; a partner's cat gets the broom only. Nobody leaves the
// counter and nothing follows her.
// The figure turns at TURN_RATE: to the cooed cat (at most COO_TURN off
// front), to the front for a shoo, and afterwards back to wherever the
// rhythm has got to, then follows the rhythm exactly again. The bubble is
// down while cooing.
// The grab, per device: the treat in her mouth (marketparts.js's treat mesh at
// her head, carryables.js placeInMouth) for HOLD_S, then the munch
// (session.sniffTime = MUNCH_S, the treat shrinking away), and at
// HOLD_S + MUNCH_S it is eaten (carry.js eatHeld), treats + 1, 'eat'. The cream
// has no mouth mesh: it is lapped where it stands (M6), her head down
// (sniffTime) the whole HOLD_S + MUNCH_S, and its saucer goes when it is eaten.
// The display treat is laid out again REFILL_S after the grab, on this device.
// The café's crumbs have no stallholder and are never watched.
// A partner's munch (remotePick) is the same treat at her cat's mouth on a
// HOLD_S + MUNCH_S timer; it goes with her if she leaves.
// Two devices agree on the rhythm (the clock and the seed) and each starts a
// coo from the partner's cat as it sees her: no message, no Math.random. The
// mouth meshes are made on first use inside withLocalUuids.
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
// of three meshes in each guarded stallholder's hand; and, only while a treat
// is in a mouth, that treat (a top-level child, taken out when it is eaten).
// Nothing casts. dispose()
// takes them all out and frees what this made (the figures, the brooms, the
// bubble's material and texture, the mouth treats; the Sprite's geometry is
// three's own, shared) and leaves the square's display treats shown, as it
// found them. Everything is made inside withLocalUuids: making the life
// draws nothing from Math.random, and update() reuses its records (an
// object is made only when a partner first shows, and the rules' stallSees
// is asked only about a cat already in a watching stall's zone).
// =============================================================================
import * as THREE from 'three';
import { MARKET, STALL_TIMES, stallOffsets, stallPhase, isHidden, stallSees } from './marketrules.js';
import { STALLS, TREAT_STALLS, MARKET_HIDES, fromStall, toStall, stallById } from './world/marketplan.js';
import { createBubbleTexture, buildBroom, buildTreatMesh } from './world/marketparts.js';
import { withLocalUuids } from './world/localuuids.js';
import { FLAT_GROUND } from './ground.js';
import { twolegKeeper } from './marketkeeper.js';
import { treatItemId, treatStallOf, TREAT_ITEM_PREFIX } from './marketnone.js';
import { pick, eatHeld } from './carry.js';
import { placeInMouth } from './carryables.js';
import { TREAT_WORDS } from './marketwords.js';

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
  // the sneak (Task 12)
  TURN_RATE: 2 * Math.PI, // rad/s: how fast a stallholder turns to a cooed cat, to the front for a shoo, and back to the rhythm
  COO_TURN: Math.PI / 3,  // rad: the furthest a cooing stallholder turns off front to face her
  SHOO_ARM: 1.1,     // rad, the broom arm raised out from its rest
  SHOO_WIGGLE: 0.1,  // rad, its wave
  SHOO_IN: 0.15,     // s, the arm going up
  SHOO_OUT: 0.25,    // s, and coming down at the shoo's end
  WAVE_W: 9,         // rad/s, the broom's wave over the counter
  BROOM_Y: 1.7,      // m, the height its head is waved at
  BROOM_BOB: 0.06,   // m, up and down with the wave
  BROOM_MID: 0.25,   // the middle of its swing along the counter, a share of half the stall's width (her treat's side)
  BROOM_SWING: 0.4,  // and how far it swings either way, the same share
  BROOM_BACK: 0.15,  // m, behind the counter's front line: the head waves over the counter
});

// The broom's tip is kept inside this much of the stall's footprint: `side`
// in from each end, `back` in from the back, at most `front` out past the
// counter's front line (a cat's centre never comes closer than d/2 + 0.45).
const BROOM_BOX = Object.freeze({ side: 0.15, back: 0.1, front: 0.2 });
const IN_SHARE = 0.5;    // her step in toward a counter, as a share of her whole step (sin 30°): walking at its treat
const MAX_STEP = 1;      // m: more than this toward a treat in one frame is a teleport, not a walk
const LAND_S = 0.12;     // s, the landing squash after the hop (session.landTime)
const DOWN = new THREE.Vector3(0, -1, 0); // the broom's head end, in its own frame
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _grip = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _qArm = new THREE.Quaternion();
const _qW = new THREE.Quaternion();
const _view = { x: 0, z: 0, stalking: false, high: false };
const _slab = { in: 0, out: Infinity };
// narrows _slab to where g + s*u stays within [lo, hi] (one axis of a box)
function slab(g, u, lo, hi) {
  if (Math.abs(u) < 1e-9) { if (g < lo || g > hi) _slab.in = Infinity; return; }
  let a = (lo - g) / u;
  let b = (hi - g) / u;
  if (a > b) { const c = a; a = b; b = c; }
  if (a > _slab.in) _slab.in = a;
  if (b < _slab.out) _slab.out = b;
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const smooth = (k) => { const c = Math.min(1, Math.max(0, k)); return c * c * (3 - 2 * c); };

const HAND = Object.freeze({ x: 0, y: -0.5, z: 0 }); // a figure with no `hand`: half a metre down the arm

export function createMarketLive(scene, area, opts = {}) {
  const {
    seed = 0, now = () => Date.now() / 1000, reducedMotion = false, ground = FLAT_GROUND,
    isFree = () => true, onEvent = () => {}, figure = twolegKeeper,
  } = opts;
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
  const rowById = {}; // guarded stall id → its row (the café has none)
  for (const id of TREAT_STALLS) {
    const st = {
      id, itemId: treatItemId(id), phase: 'serve', watching: true, bubble: false, cooing: null,
      shooT: 0, treatOut: true, refillT: 0, facing: 0,
      look: { phase: 'serve', k: 0, watching: true, bubble: false, facing: 0, cooing: false },
    };
    stalls.push(st);
    if (!made[id]) continue;
    const row = {
      ...made[id], st, offset: offsets[id], serveS: STALL_TIMES[id].serve, plan: stallById(id), i: treatRows.length,
      // the sneak's own state (Task 12), all reused frame to frame
      coo: { who: null, t: 0 }, cooRec: null, graceT: 0, graceWho: null, restT: 0,
      shownYaw: made[id].yaw, held: made[id].yaw, chasing: false, armR: 0,
    };
    treatRows.push(row);
    rowById[id] = row;
  }
  stalls.push({
    id: 'cafe', itemId: treatItemId('cafe'), phase: null, watching: false, bubble: false, cooing: null,
    shooT: 0, treatOut: true, refillT: 0, facing: 0, look: null,
  });
  const stallLive = {};
  for (const st of stalls) stallLive[st.id] = st;
  const plans = {};
  for (const st of stalls) plans[st.id] = stallById(st.id);
  const N = treatRows.length;

  // ---- The cats it reads: hers, and each partner's (never a stray). ----------
  // One record a cat, reused every frame; a partner's is made when she first
  // shows on the remotes list and dropped when she leaves it.
  function catRecord(who) {
    return {
      who, entry: null, present: false, frame: 0,
      x: 0, z: 0, speed: 0, stalking: false, high: false, treat: false,
      stillT: 0,
      cooed: new Uint8Array(N),          // cooed at by that stall this stop
      cur: new Float64Array(N).fill(NaN),  // distance to each guarded treat this frame
      last: new Float64Array(N).fill(NaN), // and last frame (APPROACH)
      curLz: new Float64Array(N).fill(NaN),  // how far out from each counter's front this frame
      lastLz: new Float64Array(N).fill(NaN), // and last frame (her heading in toward it)
      x0: NaN, z0: NaN,                  // where she was last frame
      view: { x: 0, z: 0, stalking: false, high: false }, // what stallSees reads
      munch: { active: false, t: 0, kind: null, mesh: null }, // a partner's munch (remotePick)
      meshes: {},                        // treat kind → the mouth mesh, made on first use
    };
  }
  const me = catRecord('me');
  const remoteRecs = [];
  let frameNo = 0;
  // the walk's cat, player and session as the last update saw them
  const seen = { cat: null, player: null, session: null };

  function readCat(rec, x, z, y, speed, stalking, treat, dt) {
    rec.present = true;
    rec.x = x;
    rec.z = z;
    rec.speed = Number.isFinite(speed) ? speed : 0;
    rec.stalking = stalking === true;
    rec.high = y - gy(x, z) >= MARKET.HIGH_Y;
    rec.treat = treat;
    if (rec.speed > MARKET.STILL_SPEED) {
      rec.stillT = 0;
      rec.cooed.fill(0); // she moved: a new stop may be cooed at again
    } else rec.stillT += dt;
    const v = rec.view;
    v.x = x; v.z = z; v.stalking = rec.stalking; v.high = rec.high;
    for (let i = 0; i < N; i++) {
      const plan = treatRows[i].plan;
      const t = plan.treat;
      rec.cur[i] = Math.hypot(x - t.x, z - t.z);
      rec.curLz[i] = (x - plan.at.x) * plan.face.x + (z - plan.at.z) * plan.face.z - plan.d / 2;
    }
  }
  // end of the frame: this frame's numbers become last frame's
  function keepLast(rec) {
    rec.last.set(rec.cur);
    rec.lastLz.set(rec.curLz);
    rec.x0 = rec.x;
    rec.z0 = rec.z;
  }

  function readCats(dt) {
    const { cat, player, session } = seen;
    if (cat) {
      const perchUp = Number.isFinite(player?.perchY) ? player.perchY : 0;
      const y = Math.max(cat.position.y, gy(cat.position.x, cat.position.z) + perchUp);
      readCat(me, cat.position.x, cat.position.z, y, player?.speed, player?.stalking,
        session?.carry?.mouth?.held?.treat === true, dt);
    } else me.present = false;
    frameNo++;
    const list = session?.remotes?.list;
    if (list) {
      for (let j = 0; j < list.length; j++) {
        const e = list[j];
        if (!e || !e.group) continue;
        let rec = null;
        for (let k = 0; k < remoteRecs.length; k++) if (remoteRecs[k].who === e.playerId) { rec = remoteRecs[k]; break; }
        if (!rec) { rec = catRecord(e.playerId); remoteRecs.push(rec); }
        rec.entry = e;
        rec.frame = frameNo;
        const g = e.group.position;
        readCat(rec, g.x, g.z, g.y, e.speed, e.pose === 'stalk', rec.munch.active, dt);
      }
    }
    // a partner who left: her coo ends, her munch goes with her
    let w = 0;
    for (let k = 0; k < remoteRecs.length; k++) {
      const rec = remoteRecs[k];
      if (rec.frame === frameNo) { remoteRecs[w++] = rec; continue; }
      dropRemote(rec);
    }
    remoteRecs.length = w;
  }

  function dropRemote(rec) {
    rec.present = false;
    for (let i = 0; i < N; i++) if (treatRows[i].cooRec === rec) endCoo(treatRows[i]);
    endRemoteMunch(rec);
    freeMeshes(rec);
  }

  // Walking at the treat (controller's ruling on the Task 12 review): her
  // distance to that stall's treat falls by more than APPROACH m/s AND she is
  // heading in toward the counter, her distance out from its front falling by
  // at least IN_SHARE of how fast she really moved (about 30 degrees in, or
  // more). A pass along the front, however close it comes to the treat's
  // corner, never counts. A jump of a metre or more in one frame is a
  // teleport, not a walk.
  function approaching(rec, i, dt) {
    if (!(dt > 0)) return false;
    const fall = rec.last[i] - rec.cur[i];
    if (!Number.isFinite(fall) || fall >= MAX_STEP || fall / dt <= MARKET.APPROACH) return false;
    const inward = rec.lastLz[i] - rec.curLz[i];
    const moved = Math.hypot(rec.x - rec.x0, rec.z - rec.z0);
    return Number.isFinite(inward) && moved > 0 && inward >= IN_SHARE * moved;
  }

  // ---- Noticing, the coo and the shoo, per guarded stall per frame. ----------
  function think(row, dt) {
    const st = row.st;
    if (st.shooT > 0) {
      st.shooT = Math.max(0, st.shooT - dt);
      if (st.shooT === 0) row.restT = MARKET.SHOO_REST_S;
    } else if (row.restT > 0) row.restT = Math.max(0, row.restT - dt);
    if (row.graceT > 0) row.graceT = Math.max(0, row.graceT - dt);
    st.look.cooing = !!st.cooing;
    if (st.cooing) {
      // While cooing, the stall notices no other cat (M5).
      const rec = row.cooRec;
      st.cooing.t += dt;
      if (!rec || !rec.present) endCoo(row);
      else if (rec.speed > MARKET.STILL_SPEED) {
        endCoo(row);
        if (approaching(rec, row.i, dt)) shoo(row, rec);
      } else if (!inZone(row.plan, rec.x, rec.z, rec.stalking) || isHidden(MARKET_HIDES, rec.view)) endCoo(row);
      else if (st.cooing.t >= MARKET.COO_S) endCoo(row);
      return;
    }
    if (st.shooT > 0) return; // waving the broom: no coo, no second shoo
    // her cat first, then each partner's
    if (consider(row, me, dt)) return;
    for (let k = 0; k < remoteRecs.length; k++) if (consider(row, remoteRecs[k], dt)) return;
  }

  // The watch zone (marketrules.js inWatchZone's own sum) worked out here
  // without making an object, so a cat outside every zone, the usual case, never
  // costs one; the rules' stallSees still has the last word.
  function inZone(plan, x, z, stalking) {
    const dx = x - plan.at.x, dz = z - plan.at.z;
    const lx = dx * -plan.face.z + dz * plan.face.x;
    const lz = dx * plan.face.x + dz * plan.face.z;
    const depth = stalking === true ? MARKET.WATCH_DEPTH * MARKET.STALK_SHARE : MARKET.WATCH_DEPTH;
    return Math.abs(lx) <= plan.w / 2 + MARKET.WATCH_SIDE && lz >= plan.d / 2 && lz <= plan.d / 2 + depth;
  }

  function consider(row, rec, dt) {
    if (!rec.present || !row.st.look.watching || !inZone(row.plan, rec.x, rec.z, rec.stalking)) return false;
    if (!stallSees(row.plan, row.st.look, rec.view, MARKET_HIDES)) return false;
    if (rec.stillT >= MARKET.STILL_S && !rec.cooed[row.i]) { startCoo(row, rec); return true; }
    if (rec.speed > MARKET.STILL_SPEED && row.restT <= 0 && approaching(rec, row.i, dt)) { shoo(row, rec); return true; }
    return false;
  }

  function startCoo(row, rec) {
    const st = row.st;
    row.coo.who = rec.who;
    row.coo.t = 0;
    st.cooing = row.coo;
    st.look.cooing = true;
    row.cooRec = rec;
    rec.cooed[row.i] = 1;
    onEvent({ type: 'coo', stall: st.id, who: rec.who });
  }

  function endCoo(row) {
    const st = row.st;
    if (!st.cooing) return;
    row.graceWho = st.cooing.who;
    row.graceT = MARKET.TEAM_GRACE_S;
    st.cooing = null;
    st.look.cooing = false;
    row.cooRec = null;
  }

  // The broom goes up over the counter. Her cat with nothing in her mouth also
  // gets the short hop back; a cat with a treat is laughed at and keeps it; a
  // partner's cat gets the broom only.
  // A shoo already waving (the button pressed again) keeps its broom where it
  // is in its wave, and a hop already under way is not started again.
  function shoo(row, rec) {
    const st = row.st;
    if (st.cooing) endCoo(row);
    if (!(st.shooT > 0)) st.shooT = MARKET.SHOO_S;
    row.restT = 0;
    const laugh = rec.treat === true;
    const hopped = rec === me && !laugh ? startHop(row.plan) : false;
    onEvent({ type: 'shoo', stall: st.id, who: rec.who, laugh, hopped });
  }

  // ---- The hop: HOP_DIST along the stall's face over HOP_S, one isFree-checked
  // step a frame, added to her own movement (the stick is never taken). --------
  const hop = { active: false, t: 0, moved: 0, fx: 0, fz: 0 };
  function startHop(plan) {
    if (hop.active || !seen.cat) return false;
    hop.active = true;
    hop.t = 0;
    hop.moved = 0;
    hop.fx = plan.face.x;
    hop.fz = plan.face.z;
    return true;
  }
  function stepHop(dt) {
    if (!hop.active) return;
    const cat = seen.cat;
    if (!cat) { hop.active = false; return; }
    const step = Math.min(MARKET.HOP_DIST - hop.moved, (MARKET.HOP_DIST / MARKET.HOP_S) * dt);
    hop.t += dt;
    let done = false;
    if (step > 0) {
      const nx = cat.position.x + hop.fx * step;
      const nz = cat.position.z + hop.fz * step;
      if (isFree(nx, nz)) {
        cat.position.x = nx;
        cat.position.z = nz;
        hop.moved += step;
      } else done = true; // something solid: she stops short of it
    }
    if (hop.moved >= MARKET.HOP_DIST - 1e-9 || hop.t >= 2 * MARKET.HOP_S) done = true;
    if (done) {
      hop.active = false;
      if (seen.session) seen.session.landTime = LAND_S;
    }
  }

  // ---- What the stall shows: the figure's yaw, the bubble, the arm, the broom.
  function show(row, dt, clock) {
    const st = row.st;
    const look = st.look;
    const k = row.k;
    const rhythmYaw = row.yaw + look.facing * Math.PI;
    const override = st.cooing !== null || st.shooT > 0;
    let yaw = rhythmYaw;
    if (override || row.chasing) {
      // the coo turns her to the cat and the shoo to the front, at a steady
      // turn; afterwards she turns back to wherever the rhythm has got to
      if (!row.chasing) { row.chasing = true; row.held = row.shownYaw; }
      const target = st.cooing ? cooYaw(row) : st.shooT > 0 ? row.yaw : rhythmYaw;
      const d = wrap(target - row.held);
      const most = MARKET_LOOK.TURN_RATE * dt;
      if (!override && Math.abs(d) <= most) { row.chasing = false; yaw = rhythmYaw; }
      else {
        row.held = row.yaw + wrap(row.held + Math.max(-most, Math.min(most, d)) - row.yaw);
        yaw = row.held;
      }
    }
    row.shownYaw = yaw;
    k.group.rotation.y = yaw;
    st.phase = look.phase;
    st.watching = look.watching && !st.cooing;
    st.bubble = look.bubble && !st.cooing;
    st.facing = Math.abs(wrap(yaw - row.yaw)) / Math.PI;
    row.bubble.visible = st.bubble;
    row.bubble.position.y = reducedMotion ? row.base : row.base + MARKET_LOOK.BOB * Math.sin(clock * MARKET_LOOK.BOB_W + row.phi);
    // the arm: the rhythm's sway, or the shoo's raised, waving arm eased in and out
    const broom = keepers[st.id].broom;
    if (st.shooT > 0) {
      const age = MARKET.SHOO_S - st.shooT;
      const env = smooth(age / MARKET_LOOK.SHOO_IN) * smooth(st.shooT / MARKET_LOOK.SHOO_OUT);
      const wave = reducedMotion ? 0 : Math.sin(age * MARKET_LOOK.WAVE_W);
      const up = row.rest + MARKET_LOOK.SHOO_ARM + MARKET_LOOK.SHOO_WIGGLE * wave;
      k.arm.rotation.z = row.rest + row.armR + env * (up - row.rest - row.armR);
      broom.visible = true;
      aimBroom(row, broom, age, wave);
    } else {
      k.arm.rotation.z = row.rest + row.armR;
      broom.visible = false;
    }
  }

  // the coo's yaw: from the stallholder's spot to the cat, at most 60° off front
  function cooYaw(row) {
    const rec = row.cooRec;
    if (!rec) return row.yaw;
    const a = Math.atan2(rec.x - row.k.group.position.x, rec.z - row.k.group.position.z);
    return row.yaw + Math.max(-MARKET_LOOK.COO_TURN, Math.min(MARKET_LOOK.COO_TURN, wrap(a - row.yaw)));
  }

  // The broom, held at the hand, points its head up and over the counter: the
  // tip is kept inside the stall's footprint (BROOM_BOX), above the counters
  // and the cobbles, so it never reaches a cat in front.
  function aimBroom(row, broom, age, wave) {
    const plan = row.plan;
    const fx = plan.face.x, fz = plan.face.z;
    const L = row.broomLen;
    row.k.group.updateMatrixWorld(true);
    const arm = row.k.arm;
    arm.matrixWorld.decompose(_p, _qArm, _s);
    _grip.copy(broom.position).applyMatrix4(arm.matrixWorld);
    // the grip in the stall's own frame
    const dx = _grip.x - plan.at.x, dz = _grip.z - plan.at.z;
    const glx = dx * -fz + dz * fx, glz = dx * fx + dz * fz;
    // where the head is waved: over the counter's front, swinging along it
    const lxT = (plan.w / 2) * (MARKET_LOOK.BROOM_MID + MARKET_LOOK.BROOM_SWING * wave);
    const lzT = plan.d / 2 - MARKET_LOOK.BROOM_BACK;
    const yT = MARKET_LOOK.BROOM_Y + (reducedMotion ? 0 : MARKET_LOOK.BROOM_BOB * Math.sin(age * MARKET_LOOK.WAVE_W * 2));
    const vu = Math.max(0.05, Math.min(0.95, (yT - _grip.y) / L));
    let H = L * Math.sqrt(1 - vu * vu);
    let ux = lxT - glx, uz = lzT - glz;
    const ul = Math.hypot(ux, uz);
    if (ul > 1e-9) { ux /= ul; uz /= ul; } else { ux = 0; uz = 1; }
    // keep the tip inside the box along that line (slab clip)
    const hx = plan.w / 2 - BROOM_BOX.side;
    _slab.in = 0;
    _slab.out = Infinity;
    slab(glx, ux, -hx, hx);
    slab(glz, uz, -plan.d / 2 + BROOM_BOX.back, plan.d / 2 + BROOM_BOX.front);
    if (_slab.in <= _slab.out) H = Math.min(L, Math.max(_slab.in, Math.min(_slab.out, H)));
    const v = Math.sqrt(Math.max(0, L * L - H * H));
    const dlx = ux * H, dlz = uz * H;
    _dir.set((dlx * -fz + dlz * fx) / L, v / L, (dlx * fx + dlz * fz) / L).normalize();
    _qW.setFromUnitVectors(DOWN, _dir);
    broom.quaternion.copy(_qArm).invert().multiply(_qW);
  }

  // ---- The munch: in her mouth for HOLD_S, then the munch (MUNCH_S), eaten. --
  const munch = { active: false, t: 0, st: null, kind: null, mesh: null, teamWith: null, sniffed: false, session: null };

  function meshFor(rec, kind) {
    let m = rec.meshes[kind];
    if (!m) {
      m = withLocalUuids(`market-mouth:${rec.who}:${kind}`, () => buildTreatMesh(kind));
      m.name = `marketMouth:${rec.who}:${kind}`;
      m.userData.noCast = true;
      m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.userData.noCast = true; } });
      rec.meshes[kind] = m;
    }
    return m;
  }
  function freeMeshes(rec) {
    for (const kind of Object.keys(rec.meshes)) {
      const m = rec.meshes[kind];
      m.removeFromParent();
      m.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      delete rec.meshes[kind];
    }
  }
  function showInMouth(mesh, holder, t) {
    if (!mesh) return;
    const left = t <= MARKET.HOLD_S ? 1 : Math.max(0.001, 1 - (t - MARKET.HOLD_S) / MARKET.MUNCH_S);
    mesh.scale.setScalar(left);
    if (holder) placeInMouth(mesh, holder);
  }

  function stepMunch(dt) {
    if (!munch.active) return;
    munch.t += dt;
    const s = munch.session;
    if (!munch.sniffed && munch.t >= MARKET.HOLD_S) {
      munch.sniffed = true;
      if (munch.kind !== 'cream' && s) s.sniffTime = MARKET.MUNCH_S;
    }
    if (munch.t < MARKET.HOLD_S + MARKET.MUNCH_S) {
      showInMouth(munch.mesh, s?.cat ?? seen.cat, munch.t);
      return;
    }
    const st = munch.st;
    munch.active = false;
    if (munch.mesh) { munch.mesh.removeFromParent(); munch.mesh = null; }
    if (munch.kind === 'cream') hideShown(st.id); // lapped up where it stood (M6)
    const eaten = s?.carry?.mouth ? eatHeld(s.carry.mouth) : null;
    if (eaten && eaten.id === st.itemId) {
      live.treats += 1;
      onEvent({ type: 'eat', stall: st.id, kind: munch.kind, teamWith: munch.teamWith });
    }
    munch.st = null;
    munch.session = null;
  }

  function stepRemoteMunch(rec, dt) {
    const m = rec.munch;
    if (!m.active) return;
    m.t += dt;
    if (m.t >= MARKET.HOLD_S + MARKET.MUNCH_S) { endRemoteMunch(rec); return; }
    showInMouth(m.mesh, rec.entry?.group, m.t);
  }
  function endRemoteMunch(rec) {
    const m = rec.munch;
    m.active = false;
    if (m.mesh) { m.mesh.removeFromParent(); m.mesh = null; }
  }

  const shownTreat = (id) => area.treatMeshes?.[id] ?? null;
  function hideShown(id) { const m = shownTreat(id); if (m) m.visible = false; }

  // ---- The refill, on this device only. ----------------------------------------
  function stepRefill(dt) {
    for (let j = 0; j < stalls.length; j++) {
      const st = stalls[j];
      if (st.treatOut) continue;
      st.refillT = Math.max(0, st.refillT - dt);
      if (st.refillT === 0) {
        st.treatOut = true;
        const m = shownTreat(st.id);
        if (m) m.visible = true;
      }
    }
  }

  // ---- The rhythm (Task 11): each guarded stall's phase and its arm's sway. ----
  function rhythm(clock) {
    for (let i = 0; i < treatRows.length; i++) {
      const r = treatRows[i];
      const st = r.st;
      const look = stallPhase(st.id, r.offset, clock, st.look);
      // serving and busy sway, each grown in from rest and back to it inside its
      // phase, so no phase change makes the arm jump; still through the turns
      let swing = 0;
      if (!reducedMotion && (look.phase === 'serve' || look.phase === 'busy')) {
        const len = look.phase === 'serve' ? r.serveS : MARKET.BUSY_S;
        const u = look.k * len;
        const env = smooth(Math.min(u, len - u) / MARKET_LOOK.SWAY_RAMP);
        swing = env * (look.phase === 'serve'
          ? MARKET_LOOK.SWAY * (0.5 - 0.5 * Math.cos(clock * MARKET_LOOK.SWAY_W + r.phi))
          : MARKET_LOOK.BUSY_SWAY * (0.5 - 0.5 * Math.cos(clock * MARKET_LOOK.BUSY_W + r.phi)));
      }
      r.armR = swing;
    }
    for (let i = 0; i < serveRows.length; i++) {
      const r = serveRows[i];
      r.k.arm.rotation.z = reducedMotion ? r.rest
        : r.rest + MARKET_LOOK.SWAY * (0.5 - 0.5 * Math.cos(clock * MARKET_LOOK.SWAY_W + r.phi));
    }
  }

  function frame(dt, clock) {
    rhythm(clock);
    readCats(dt);
    for (let i = 0; i < N; i++) think(treatRows[i], dt);
    for (let i = 0; i < N; i++) show(treatRows[i], dt, clock);
    stepHop(dt);
    stepMunch(dt);
    for (let k = 0; k < remoteRecs.length; k++) stepRemoteMunch(remoteRecs[k], dt);
    stepRefill(dt);
    keepLast(me);
    for (let k = 0; k < remoteRecs.length; k++) keepLast(remoteRecs[k]);
  }

  // the broom's length, grip to the tip of its head (its own drawing's lowest point)
  for (const r of treatRows) {
    let low = 0;
    keepers[r.st.id].broom.traverse((m) => {
      if (!m.isMesh) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      low = Math.min(low, m.position.y + m.geometry.boundingBox.min.y);
    });
    r.broomLen = -low;
  }

  {
    const clock = now();
    rhythm(clock);
    for (let i = 0; i < N; i++) show(treatRows[i], 0, clock);
  }

  let disposed = false;

  // the treat in her reach, on the ground, with nothing being munched
  const actions = {};
  for (const st of stalls) actions[st.id] = { kind: 'grab', stall: st.id, prompt: '' };

  function herCat(s) { return s?.cat ?? seen.cat; }

  const live = {
    stalls,
    keepers,
    groups,
    treats: 0,
    actionFor(s) {
      if (disposed || !s) return null;
      const cat = herCat(s);
      const mouth = s.carry?.mouth;
      if (!cat || !mouth || s.perched || s.swimming || seen.player?.swimming) return null;
      if (mouth.held?.treat || munch.active) return null;
      let best = null;
      let bestD = MARKET.TREAT_REACH;
      for (let j = 0; j < stalls.length; j++) {
        const st = stalls[j];
        if (!st.treatOut) continue;
        const t = plans[st.id].treat;
        const d = Math.hypot(cat.position.x - t.x, cat.position.z - t.z);
        if (d <= bestD) { bestD = d; best = st; }
      }
      if (!best) return null;
      const a = actions[best.id];
      a.prompt = TREAT_WORDS[plans[best.id].treat.kind].prompt;
      return a;
    },
    act(action, s, { dropHeld } = {}) {
      if (disposed || !action || action.kind !== 'grab' || !s) return false;
      const st = stallLive[action.stall];
      const plan = plans[action.stall];
      const cat = herCat(s);
      const mouth = s.carry?.mouth;
      if (!st || !st.treatOut || !cat || !mouth || s.perched) return false;
      if (mouth.held?.treat || munch.active) return false;
      const t = plan.treat;
      if (Math.hypot(cat.position.x - t.x, cat.position.z - t.z) > MARKET.TREAT_REACH) return false;
      const row = rowById[st.id];
      if (row) {
        // seen now (M4), being cooed at included: a shoo and the hop, the treat stays out
        const p = seen.player;
        const perchUp = Number.isFinite(p?.perchY) ? p.perchY : 0;
        _view.x = cat.position.x;
        _view.z = cat.position.z;
        _view.stalking = p?.stalking === true;
        _view.high = Math.max(cat.position.y - gy(_view.x, _view.z), perchUp) >= MARKET.HIGH_Y;
        st.look.cooing = !!st.cooing;
        if (st.cooing?.who === 'me' || stallSees(plan, st.look, _view, MARKET_HIDES)) {
          if (!seen.cat) seen.cat = cat;
          if (!seen.session) seen.session = s;
          me.treat = false;
          shoo(row, me);
          return false;
        }
      }
      if (mouth.held) dropHeld?.();
      if (mouth.held) return false;
      if (!pick(mouth, { id: st.itemId, kind: t.kind, treat: true })) return false;
      st.treatOut = false;
      st.refillT = MARKET.REFILL_S;
      if (t.kind !== 'cream') hideShown(st.id);
      let teamWith = null;
      if (row) {
        if (st.cooing && st.cooing.who !== 'me') teamWith = st.cooing.who;
        else if (row.graceT > 0 && row.graceWho !== 'me') teamWith = row.graceWho;
      }
      munch.active = true;
      munch.t = 0;
      munch.st = st;
      munch.kind = t.kind;
      munch.teamWith = teamWith;
      munch.sniffed = false;
      munch.session = s;
      munch.mesh = t.kind === 'cream' ? null : meshFor(me, t.kind);
      if (munch.mesh) {
        scene.add(munch.mesh);
        showInMouth(munch.mesh, cat, 0);
      } else s.sniffTime = MARKET.HOLD_S + MARKET.MUNCH_S; // the cream: head down, lapping, the whole time
      onEvent({ type: 'grab', stall: st.id });
      return true;
    },
    remotePick(remote, itemId) {
      if (disposed) return false;
      const id = treatStallOf(itemId);
      if (!id || !stallLive[id]) return false;
      const list = seen.session?.remotes?.list;
      if (!remote || !list || !list.includes(remote)) return false;
      let rec = null;
      for (let k = 0; k < remoteRecs.length; k++) if (remoteRecs[k].who === remote.playerId) { rec = remoteRecs[k]; break; }
      if (!rec) {
        rec = catRecord(remote.playerId);
        rec.frame = frameNo;
        remoteRecs.push(rec);
      }
      rec.entry = remote;
      const kind = plans[id].treat.kind;
      endRemoteMunch(rec);
      const m = rec.munch;
      m.active = true;
      m.t = 0;
      m.kind = kind;
      m.mesh = kind === 'cream' ? null : meshFor(rec, kind);
      if (m.mesh) {
        scene.add(m.mesh);
        showInMouth(m.mesh, remote.group, 0);
      }
      onEvent({ type: 'remote-eat', stall: id, who: remote.playerId });
      const row = rowById[id];
      if (row && (row.st.cooing?.who === 'me' || (row.graceT > 0 && row.graceWho === 'me'))) {
        onEvent({ type: 'team', stall: id, partner: remote.playerId });
      }
      return true;
    },
    // a walk picked up again: the tally is the treats this walk already paid for
    restore(log) {
      let n = 0;
      const got = typeof log?.entries === 'function' ? log.entries() : null;
      const entries = Array.isArray(got) ? got : [];
      for (const e of entries) {
        if (Array.isArray(e) && typeof e[0] === 'string' && e[0].startsWith(TREAT_ITEM_PREFIX) && e[1] > 0) n++;
      }
      live.treats = n;
    },
    update(dt, t, ctx) { // eslint-disable-line no-unused-vars
      if (disposed) return;
      seen.cat = ctx?.cat ?? null;
      seen.player = ctx?.player ?? null;
      seen.session = ctx?.session ?? null;
      frame(Number.isFinite(dt) && dt > 0 ? dt : 0, now());
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (munch.mesh) munch.mesh.removeFromParent();
      munch.active = false;
      freeMeshes(me);
      for (const rec of remoteRecs) { endRemoteMunch(rec); freeMeshes(rec); }
      remoteRecs.length = 0;
      // the square's own display treats are the build's: left shown, as found
      for (const st of stalls) { const m = shownTreat(st.id); if (m) m.visible = true; }
      freeAll();
    },
  };
  return live;
}
