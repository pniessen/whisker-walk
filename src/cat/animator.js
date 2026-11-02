import * as THREE from 'three';
import { TORSO, HEAD, PAW_HALF, SIT } from './torso.js';
import { fitScars } from './scarmesh.js';
import { FOLDS, FOLD_BY_STATE, applyFold } from './limbs.js';

const GAIT_PHASE = [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5]; // 4-beat: FL, FR, BL, BR
const CAT_BASE = { bodyY: TORSO.CENTRE_Y, bodyScale: [...TORSO.SCALE], headPos: [...HEAD.POS], tailRotX: -0.6 };

// R3: the tail's resting curl (base.tailCurl per link) by state. Standing,
// walking, grooming and sniffing get the full curl; lying and sitting a fifth,
// so the tail lies round the cat. Every other state (cross, scared, stalk,
// pounce, stretch) keeps today's straight chain. A rig without tailCurl
// (Hagrid) gets no curl in any state.
const TAIL_CURL_BY_STATE = { follow: 1, sniff: 1, groom: 1, land: 1, nap: 0.2, perch: 0.2, requestPet: 0.2 };

// Polish 1a, Task 5 (2026-11-02): the walking carriage. From the walk camera,
// behind the cat, the resting curl (link 0 level, straight back at the camera,
// the rest curling up) read as a lump with a horn on it. Walking, a cat holds
// its tail up in a soft S: these are the five pivots' bends (rotation.x; - is
// up) that, on the root's own 0.28 tilt, raise link 0 to ~0.77 rad, stand the
// middle at ~1.09 and curl the tip back to ~0.34. Well up, because the walk
// camera looks down ~25 degrees from behind and a tail leaning back toward it
// is seen end-on, a stub; no higher, because the tip then tops out exactly
// where the curl's did, under the ears (the gates' flap openings clear every
// cat walking by 1 cm, pushthrough.test.js). They replace the curl in a
// walking 'follow', eased in with speed (full at TAIL_S_SPEED), so a cat that
// stops lets its tail settle back to the curl.
const TAIL_S = [-1.05, -0.32, 0.0, 0.35, 0.40];
const TAIL_S_SPEED = 1.2;

// Polish 1a, Task 5: the poses in which a worn collar follows the neck instead
// of the head. The collar hangs on the head (model.js), which is right while
// the head sits over the chest; the stalk drops the head low and forward of
// the chest, and a head-locked collar's front then stuck out under the chin as
// a black rod with the tag dangling in the air. Here the collar keeps its
// place on the neck instead (fitNeck). The sniff and the pinned pose drop the
// head the same way to a lesser degree, and do the same (fix wave, polish-5).
const COLLAR_ON_NECK = new Set(['stalk', 'sniff', 'pinned']);

// v20 "Ruffled Fur" — the 'cross' pose.
//
// Derived from 'scared' below (raised tail, flattened ears) because a scared
// cat and a cross cat share most of their anatomy, then inverted everywhere
// the READING differs: a scared cat shrinks and wants to leave, a cross cat
// makes itself bigger and holds its ground. Every difference below is one of
// those inversions.
//
// The rig is the constraint. Strays are built { simple: true }, which skips
// whiskers entirely, and the model has no mouth, no eyelids, no puffed-tail
// scale and no arched-back joint — so posture is the whole vocabulary here,
// and nothing below adds to the rig.
const CROSS = {
  // Torso turned side-on while the head keeps facing you. This is THE angry-
  // cat silhouette, and it is nearly free: `head` and `legs` are parented to
  // the cat group rather than to `body`, so yawing the torso alone presents
  // the flank without twisting the face away or skewing the stance. ~13deg;
  // far enough to change the outline, short of dislocating the shoulders.
  bodyYaw: 0.22,
  // Up, not down. 'scared' drops the body 0.06; this lifts it a little and
  // bunches the torso taller/shorter (never longer) so the cat reads as
  // gathered and puffed rather than flattened. The rig has no fur, so the
  // torso itself has to do the puffing.
  bodyLift: 0.02,
  bodyScale: [1.05, 1.06, 0.96],
  // Braced: front paws planted forward, hind legs set back — the stance of
  // an animal that intends to stay where it is. Overwritten by the gait when
  // the cat is actually walking, which is correct; a cross cat that walks
  // still walks.
  legSplay: 0.16,
  // Pinned harder than 'scared' (0.6). Flat ears are the one unambiguous
  // signal this rig can make, and it is the cheapest thing a player reads at
  // a distance the name tag is not yet legible from.
  earPin: 0.78,
  // Higher and STRAIGHT, where 'scared' raises the tail to -1.35 and then
  // curls the segments round the body (pivot y 0.35, "tucked"). Leaving the
  // chain at zero yaw makes it a rigid, upright bottlebrush instead.
  tailRotX: -1.5,
  // The lash. The idle tail chain already sways at 2.6 rad/s; a cross tail
  // whips more than twice as fast and nearly twice as wide, which is the one
  // piece of MOTION in the pose and the part that catches the eye first.
  lashFreq: 6.2,
  lashScale: 1.9,
};

// Fight actions (2026-11-01 fight moves and scars): the six action states.
// Each writes only parts the base reset below resets (body/head position,
// rotation and scale, leg rotation and scale, tail, tail pivots, ears) and
// never a leg position. Pitch, roll and lift are the GROUP's (fightactions.js
// placeFrame); these only shape the cat inside it.
//
// Front legs swung past fitLongLegs' 1.0 rad limit are left at their length
// (a swing that crossed the limit would pop the leg's length), so the swats
// and the tuck stay above it.
const ARCH = {
  // The Halloween-cat arch: side-on like 'cross' but more, taller and more
  // bunched, head low, tail straight up. Falls through to the lash.
  bodyYaw: 0.34, bodyLift: 0.05, bodyScale: [1.06, 1.14, 0.92],
  headDrop: 0.03, headTip: 0.2, earPin: 0.85, tailRotX: -1.65,
};
const REAR_UP = {
  // Up on the hind legs (the group is pitched ~0.9 nose-up by the caller):
  // the head tips back down so the face still looks at the other cat, the
  // tail goes up so the pitch does not swing it into the ground, and the
  // front paws box in turn.
  swat: 1.4, swatAmp: 0.32, swatFreq: 9, headTip: 0.7, tailRotX: -1.5, earPin: 0.9,
};
const FLINCH = {
  // Leaning back, face turned away, ears flat, the tail drooped and quivering.
  bodyDrop: 0.05, bodyBack: 0.05, bodyTip: -0.08, head: [0, -0.04, 0.07], headRot: [-0.1, 0.35, 0.1],
  frontLegs: -0.2, hindLegs: 0.1, earPin: 0.95, tailRotX: 0.35, quiverFreq: 14, quiver: 0.12,
};
const PINNED = {
  // Flattened under the other cat: lower and flatter than a nap, head down, ears flat.
  bodyDrop: 0.1, bodyScale: [1.12, 0.72, 1.0], legs: 0.3, head: [0, -0.22, -0.04], headTip: 0.2,
  earPin: 0.95, tailRotX: -0.05,
};
const PINNING = {
  // Crouched on the other cat's back, front paws reaching forward and down.
  // The hind legs keep their length (a shortened leg pulls its paw up off
  // the back it is standing on); the body sinks between them instead.
  bodyDrop: 0.12, bodyScale: [1.05, 0.9, 1.05], frontLegs: 0.5, head: [0, -0.1, -0.04],
  headTip: 0.35, earPin: 0.85, tailRotX: -0.9,
};
const ROLL = {
  // A ball of fur: legs tucked (front back under the chest, hind forward
  // under the belly), body rounded, head down, tail wrapped.
  tuck: 1.25, bodyScale: [1.05, 1.05, 0.9], head: [0, -0.1, 0.04], headTip: 0.4, earPin: 0.9, tailWrap: 0.5,
};

// Poses are expressed as deltas/ratios from the model's declared base pose
// (cat.userData.base) so differently proportioned avatars — like Hagrid the
// chicken — animate without being squashed into cat proportions.
// reducedMotion (settings.reducedMotion): only the player's own cat call
// site (main.js) ever passes this — it skips the vertical body-bob + slight
// roll below, which is what actually feeds into the camera (camera.position
// follows avatar.position every frame), leaving the leg gait itself intact.
// amount (0..1) scales the 'shake' only (the swimming shake's envelope);
// every other state ignores it, so existing callers are unchanged.
export function animateCat(cat, state, t, moveSpeed, reducedMotion = false, amount = 1) {
  pose(cat, state, t, moveSpeed, reducedMotion, amount);
  // Hagrid's comb (R11) is his ears: every ear write above is damped about the
  // rest (±0.22) by base.combGive, so a twitch is a small wobble and the
  // cross/fight ear-pin never splits the crest. At rest it is exactly ±0.22.
  const give = cat.userData.base?.combGive;
  if (give !== undefined) {
    const { earL, earR } = cat.userData.parts;
    earL.rotation.z = 0.22 + (earL.rotation.z - 0.22) * give;
    earR.rotation.z = -0.22 + (earR.rotation.z + 0.22) * give;
  }
  if (cat.userData.base?.tailAnchor) rideTail(cat);
  const { underside } = cat.userData.parts;
  if (underside) keepChestUnderHead(cat.userData.parts.body, underside);
  const base = cat.userData.base;
  if (base?.legLift) fitLongLegs(cat);
  if (base?.poseFit?.[state]) applyPoseFit(cat, base.poseFit[state]);
  fitNeck(cat, state);
  // Last: a scar rides the head and torso where everything above left them.
  if (cat.userData.parts.scars) fitScars(cat);
}

// R4: the underside hangs on the torso, so a yawed torso ('cross') would swing
// the chest out from under the chin. It turns back by the yaw, but the torso's
// scale is not uniform, so R_y(θ)·S·R_y(-θ) is not the identity: the chest
// would still drift. So the underside is also moved (in the body's frame) by
//   p = S⁻¹·Q⁻¹·S·c − R_y(-θ)·c,
// c the chest centre, S the body's scale, Q its whole rotation (yaw and the
// gait's roll), which lands the chest centre exactly where an unturned torso
// carries it: Q·S·(p + R_y(-θ)·c) = S·c. With no yaw both are reset to 0, so
// nothing accumulates. A rig without an underside (Hagrid) never gets here.
// Never writes -0.
const _c = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _yaw = new THREE.Quaternion();
const _Y = new THREE.Vector3(0, 1, 0);
// Hagrid's tail rides his body (base.tailAnchor: the tail group's resting spot,
// cat frame). The tail group hangs on the cat, not the body, so a pose that
// drops, squashes or pitches the body (nap, requestPet, swim, the shake's
// fluff) would leave the fan's root in the air behind his back. Here the
// anchor is carried by the body's posed transform, so the feather roots stay
// in the back wherever the body went. At rest the body's transform puts it
// back where it was built.
const _anchor = new THREE.Vector3();
function rideTail(cat) {
  const { body, tail } = cat.userData.parts;
  const { tailAnchor: [x, y, z], bodyY, bodyScale: [sx, sy, sz] } = cat.userData.base;
  body.updateMatrix();
  _anchor.set(x / sx, (y - bodyY) / sy, z / sz).applyMatrix4(body.matrix);
  tail.position.copy(_anchor);
}

//
// The sit flattens the underside (its own z scaled by SIT.chestDepth, set in
// pose(); every other state leaves it at 1). Scaled about the underside's
// origin that would slide the chest centre back too, so the position also
// carries R_y(-θ)·(c − K·c), K the underside's scale: the chest centre lands
// exactly where the unscaled underside put it (polish-catlooks, 2026-11-02).
// At K = 1 that term is exactly zero (+ 0 turns its -0 into 0).
const _k = new THREE.Vector3();
function keepChestUnderHead(body, underside) {
  const yaw = body.rotation.y;
  const c = underside.userData.chestCentre;
  const K = underside.scale;
  _k.set(c[0] * (1 - K.x) + 0, c[1] * (1 - K.y) + 0, c[2] * (1 - K.z) + 0); // c − K·c
  if (!yaw) {
    underside.rotation.y = 0;
    underside.position.copy(_k);
    return;
  }
  underside.rotation.y = -yaw;
  const S = body.scale;
  _c.fromArray(c);
  _p.copy(_c).multiply(S).applyQuaternion(_q.copy(body.quaternion).invert()).divide(S); // S⁻¹·Q⁻¹·S·c
  _yaw.setFromAxisAngle(_Y, -yaw);
  _c.applyQuaternion(_yaw);                                                             // R_y(-θ)·c
  _p.sub(_c).add(_k.applyQuaternion(_yaw));                                             // + R_y(-θ)·(c − K·c)
  underside.position.set(_p.x + 0, _p.y + 0, _p.z + 0);
}

// The collar on the neck (COLLAR_ON_NECK). The neck joins the chest (the
// underside's chestCentre) to the head's centre. Resting, the collar sits on
// it as built; in a COLLAR_ON_NECK pose it is carried from the resting neck to
// the posed one: moved with the neck's midpoint and turned as the neck turned
// (chest-to-head direction), so it keeps its place and tilt on the neck and
// the tag still hangs at the throat. Everything is in the cat's own frame, then
// put back into the head's. In any other pose the collar is put back where it
// was built (its rest, remembered the first time it is moved). Deterministic.
//
// Fix wave (polish-5): the posed chest is read through the underside
// (keepChestUnderHead holds it at the unyawed point once the torso yaws, which
// the body's matrix alone misses). The neck-slot pieces (model.js records them
// in head.userData.neckwear: bandana, necktie, bowtie, scarf, the streamer
// scarf) hang at the collar's seam, so they make the very same rigid move, each
// from its own rest; without a collar they still do. A collar shed off the head
// (housecats.js shedKittypetCollar) is left alone.
const _h0 = new THREE.Vector3();
const _c0 = new THREE.Vector3();
const _c1 = new THREE.Vector3();
const _n0 = new THREE.Vector3();
const _n1 = new THREE.Vector3();
const _turn = new THREE.Quaternion();
const _M = new THREE.Matrix4();
const _R = new THREE.Matrix4();
const _X = new THREE.Matrix4();
const _one = new THREE.Vector3(1, 1, 1);
const _noTurn = new THREE.Quaternion();
const _sc = new THREE.Vector3();
function fitNeck(cat, state) {
  const { head } = cat.userData.parts;
  const collar = head.userData.collar;
  const neckwear = head.userData.neckwear;
  const wearsCollar = collar?.parent === head;
  if (!wearsCollar && !neckwear?.length) return;
  if (!COLLAR_ON_NECK.has(state) || !cat.userData.parts.underside) {
    if (wearsCollar) restore(collar);
    if (neckwear) for (const item of neckwear) restore(item);
    return;
  }
  neckMove(cat);
  if (wearsCollar) carry(collar);
  if (neckwear) for (const item of neckwear) carry(item);
}

// Exported for the tests (a torso yawed under a neck pose): the chest, then the neck.
export function refitNeck(cat, state) {
  const { body, underside } = cat.userData.parts;
  if (underside) keepChestUnderHead(body, underside);
  fitNeck(cat, state);
}

function restore(item) {
  const rest = item.userData.rest;
  if (rest) { item.position.copy(rest.position); item.quaternion.copy(rest.quaternion); }
}

// item (head frame) = _X · rest, its rest remembered the first time it is moved
function carry(item) {
  const rest = (item.userData.rest ??= { position: item.position.clone(), quaternion: item.quaternion.clone() });
  _M.compose(rest.position, rest.quaternion, _one).premultiply(_X);
  _M.decompose(item.position, item.quaternion, _sc);
}

// _X = head⁻¹ · T(neck1) · R(turn) · T(-neck0) · H0: the neck's move, in the head's frame
function neckMove(cat) {
  const { head, body, underside } = cat.userData.parts;
  const { bodyY, bodyScale: [sx, sy, sz], headPos } = cat.userData.base;
  const [cx, cy, cz] = underside.userData.chestCentre;
  // the resting neck: head and body as pose()'s reset leaves them
  _h0.fromArray(headPos);
  _c0.set(cx * sx, bodyY + cy * sy, cz * sz);
  // the posed neck, the chest read through the underside (T + S·c once yawed)
  body.updateMatrix(); head.updateMatrix(); underside.updateMatrix();
  _c1.set(cx, cy, cz).applyMatrix4(underside.matrix).applyMatrix4(body.matrix);
  _n0.subVectors(_h0, _c0).normalize();
  _n1.subVectors(head.position, _c1).normalize();
  _turn.setFromUnitVectors(_n0, _n1);
  _X.compose(_h0, _noTurn, head.scale);
  _c0.add(_h0).multiplyScalar(0.5); // neck0
  _c1.add(head.position).multiplyScalar(0.5); // neck1
  _X.premultiply(_R.makeTranslation(-_c0.x, -_c0.y, -_c0.z));
  _X.premultiply(_R.makeRotationFromQuaternion(_turn));
  _X.premultiply(_R.makeTranslation(_c1.x, _c1.y, _c1.z));
  _X.premultiply(_R.copy(head.matrix).invert());
}

// torso.js POSE_FIT: a per-state height correction, measured against the old
// rig, for a pose that the new torso's shape leaves resting too high or too
// low. It moves every part fitLongLegs moves — body (and the underside on it), tail, body-
// and back-slot items — so the torso never pulls away from its tail and items;
// the head gets its own `head` value when the fit gives one. A rig without
// poseFit (Hagrid) never reaches here.
function applyPoseFit(cat, fit) {
  const { head, legs } = cat.userData.parts;
  const dBody = fit.body ?? 0;
  const dHead = fit.head ?? dBody;
  for (const child of cat.children) {
    if (legs.includes(child) || child.userData.liftY === undefined) continue;
    // += is safe only because fitLongLegs has just reset every liftY child to its authored y this frame.
    child.position.y += child === head ? dHead : dBody;
  }
}

// Every cat now stands on longer legs than the reference rig (torso.js
// REF_RIG, hip 0.3) that every pose in pose() below was written for: its hips,
// body, head and everything else sit Δ = base.legLift higher (0.09 for a
// standard cat, more for Digit's STYLE.legLen). A longer leg scaled or swung
// about a higher hip puts its paw somewhere else — the cat hovered in a sit, a
// nap and a stalk. This pass, run after the pose, re-fits the cat to the pose:
//
//   * a crouch (any leg squashed, scale.y < 1, or folded with a fold marked
//     `crouch`, limbs.js FOLDS) brings everything but the legs down by Δ, so
//     the body rests exactly as low as a standard cat's does;
//   * a folded leg (fold other than 'stand') is left as its fold made it: the
//     fold is already shaped in the ground frame (R2);
//   * every leg the pose scaled or swung (up to ~57°, so a raised grooming paw
//     is left alone) gets the scale that lands its sole where a standard leg's
//     sole would land: hip + Δ - s'·(R + Δ)·cosθ = hip - s·R·cosθ.
//   * then every leg is capped so its sole cannot pass below the ground
//     (ruling R2): s'·D·cosθ <= hip, where D is THIS leg's hip-to-sole drop
//     read off its paw (a boot or sock makes the paw taller than the bare
//     R + Δ). This is what keeps the stretch's lengthened hind legs out of
//     the ground.
//
// A standing cat is untouched; a walking one has its swinging legs re-fit each
// frame so its paws track the reference rig's. A rig without legLift (Hagrid)
// never reaches here at all. Deterministic: it reads only the pose just written.
const LONG_LEG_MAX_SWING = 1.0;
function fitLongLegs(cat) {
  const { body, head, legs } = cat.userData.parts;
  const { legLift: lift, legReach: reach, hipY } = cat.userData.base;
  // Contract with pose(): it may only shrink a leg (scale.y < 1), or fold one
  // with a fold marked `crouch` (limbs.js FOLDS), when it also lowers the body.
  const crouch = legs.some((leg) => leg.scale.y < 1 || FOLDS[leg.userData.fold]?.crouch);
  for (const child of cat.children) {
    if (legs.includes(child) || child.userData.liftY === undefined) continue;
    if (child === body || child === head) {
      if (crouch) child.position.y -= lift; // the pose wrote these this frame
    } else {
      child.position.y = child.userData.liftY - (crouch ? lift : 0);
    }
  }
  for (const leg of legs) {
    // A folded leg is its fold's shape, already in the ground frame: no length
    // re-fit, no ground cap (a capped fold would be a squash).
    if (leg.userData.fold && leg.userData.fold !== 'stand') {
      leg.scale.y = 1;
      continue;
    }
    const s = leg.scale.y;
    const swing = Math.abs(leg.rotation.x);
    const c = Math.cos(swing);
    if (!(s === 1 && swing === 0) && swing <= LONG_LEG_MAX_SWING) {
      leg.scale.y = (s * reach * c + lift) / ((reach + lift) * c);
    }
    if (c > 0) {
      const { paw } = leg.userData;
      const drop = PAW_HALF * paw.scale.y - paw.position.y; // hip to sole, unscaled
      leg.scale.y = Math.min(leg.scale.y, hipY / (drop * c));
    }
  }
}

// The ordinary walk gait's legs, shared by the walk below and the shake (a cat
// shaking as it walks still walks). Returns the stride frequency.
function walkGait(legs, t, moveSpeed, freqK = 1, ampK = 1, ampMax = 0.6) {
  const freq = (4.5 + moveSpeed * 1.4) * freqK;
  const amp = Math.min(ampMax, (0.25 + moveSpeed * 0.09) * ampK);
  for (let i = 0; i < 4; i++) {
    legs[i].rotation.x = Math.sin(t * freq + GAIT_PHASE[i]) * amp;
  }
  return freq;
}

// The stalk's stride as a share of the walk's (amplitude and its cap; the
// frequency is the walk's): tabby to Digit, every crouched point stays under
// the back's top at every phase and speed (folds.test.js).
export const STALK_SWING = 0.3;

// Swimming (sketch A): the legs paddle in diagonal pairs.
const PADDLE_PHASE = [0, Math.PI, Math.PI, 0];

function pose(cat, state, t, moveSpeed, reducedMotion, amount) {
  const { body, head, tail, tailPivots, legs, earL, earR } = cat.userData.parts;
  const base = cat.userData.base ?? CAT_BASE;
  const [bsx, bsy, bsz] = base.bodyScale;
  const [hx, hy, hz] = base.headPos;
  const walking = moveSpeed > 0.1;
  // Each pivot bends the tail up by c. A pose that writes its own tail angle
  // adds c back to it, so link 0 leaves at the angle it always did.
  const c = (base.tailCurl ?? 0) * (TAIL_CURL_BY_STATE[state] ?? 0);

  // base pose reset
  body.position.y = base.bodyY;
  body.position.z = 0; // only backUp and flinch move it
  body.scale.set(bsx, bsy, bsz);
  body.rotation.set(0, 0, 0);
  head.position.set(hx, hy, hz);
  head.rotation.set(0, 0, 0);
  tail.rotation.set(base.tailRotX, 0, 0);
  for (const leg of legs) {
    leg.rotation.set(0, 0, 0);
    leg.scale.set(1, 1, 1);
    // The sit moves the front hips forward (SIT.foreZ); every other state puts
    // them back where they were built (remembered the first time).
    leg.position.z = leg.userData.hipZ ??= leg.position.z;
  }
  const { underside } = cat.userData.parts;
  if (underside) underside.scale.set(1, 1, 1); // the sit flattens it (SIT.chestDepth)
  for (const p of tailPivots) p.rotation.set(c ? -c : 0, 0, 0); // never -0 (Hagrid)
  // The folds (body refinement Task 5, R1/R3): each leg takes its state's fold
  // (a write only when the fold changes). A rig with folds no longer squashes a
  // folded leg, and roll drops its +-ROLL.tuck leg rotations (a walking stalk
  // swings the crouched legs at STALK_SWING of the walk's stride); a rig
  // without them (Hagrid) keeps today's lines.
  const f = FOLD_BY_STATE[state];
  legs.forEach((leg, i) => applyFold(leg, f ? f[i < 2 ? 0 : 1] : 'stand'));
  const folds = !!legs[0].userData.folds;

  // ear twitches: brief, occasional, alternating
  const twitchWindow = Math.sin(t * 0.37) > 0.965 ? 1 : 0;
  const twitch = twitchWindow * Math.max(0, Math.sin(t * 9)) * 0.3;
  earL.rotation.z = 0.22 + twitch;
  earR.rotation.z = -0.22 - (twitchWindow ? 0 : Math.max(0, Math.sin(t * 9 + 2)) * (Math.sin(t * 0.53) > 0.97 ? 0.3 : 0));

  // Swimming and wading (Task 5). Each writes its parts and returns before the
  // generic gait. waterlook.js sinks the whole group so the water hides the
  // rest; these only shape what shows above it.
  if (state === 'wade') {
    // Sketch C: belly-deep, high careful steps — a slower, higher stride.
    if (walking) {
      const freq = walkGait(legs, t, moveSpeed, 0.7, 1.5, 0.75);
      if (!reducedMotion) {
        body.position.y += Math.abs(Math.sin(t * freq)) * 0.028;
        body.rotation.z = Math.sin(t * freq * 0.5) * 0.03;
      }
    }
    head.position.y = hy + 0.03;
    head.rotation.x = -0.08;
    tail.rotation.x = -1.0; // held up out of the water
    const sway = walking ? 0.1 + moveSpeed * 0.03 : 0.16;
    for (let i = 0; i < tailPivots.length; i++) tailPivots[i].rotation.y += Math.sin(t * 2.6 - i * 0.65) * sway;
    return;
  }

  if (state === 'swim') {
    // Sketch A: shoulders under, head and back up, the tail floating flat.
    body.rotation.x = -0.12;
    head.position.set(hx, hy + 0.06, hz - 0.04);
    head.rotation.x = -0.3;
    const f = walking ? 5.5 : 3;
    const a = walking ? 0.7 : 0.35;
    for (let i = 0; i < 4; i++) legs[i].rotation.x = Math.sin(t * f + PADDLE_PHASE[i]) * a;
    tail.rotation.x = -0.08;
    for (let i = 0; i < tailPivots.length; i++) tailPivots[i].rotation.y = Math.sin(t * 1.8 - i * 0.5) * 0.12;
    return;
  }

  if (state === 'shake') {
    // Sketch D. The body wobble is a roll of the whole group (waterlook.js),
    // so back-slot items, the name tag and the bubble go with it.
    if (walking) walkGait(legs, t, moveSpeed);
    if (cat.userData.breed === 'hagrid') {
      // A chicken fluffs its feathers instead.
      const fluff = 1 + 0.12 * amount * (0.5 + 0.5 * Math.sin(t * 18));
      body.scale.set(bsx * fluff, bsy * fluff, bsz);
      head.rotation.x = 0.1 * amount;
      return;
    }
    head.rotation.z = -Math.sin(t * 30 + 0.6) * 0.35 * amount;
    const flop = Math.abs(Math.sin(t * 30)) * 0.4 * amount;
    earL.rotation.z = 0.22 + flop;
    earR.rotation.z = -0.22 - flop;
    for (let i = 0; i < tailPivots.length; i++) tailPivots[i].rotation.y = Math.sin(t * 30 - i * 0.7) * 0.4 * amount;
    return;
  }

  if (state === 'nap') {
    body.position.y = base.bodyY - 0.1;
    body.scale.set(bsx * 1.12, bsy * 0.73, bsz * 0.89);
    head.position.set(hx + 0.08, hy - 0.24, hz + 0.14);
    head.rotation.set(0.55, 0.5, 0);
    if (!folds) for (const leg of legs) leg.scale.y = 0.25;
    tail.rotation.set(-0.12 + c, 0, 0);
    for (const p of tailPivots) p.rotation.y = 0.55; // wrap around the body
    body.scale.y += Math.sin(t * 1.4) * 0.015; // slow sleepy breathing
    return;
  }

  if (state === 'stretch') {
    // classic wake-up: front down, butt up
    body.rotation.x = 0.35;
    body.position.y = base.bodyY + 0.04;
    head.position.set(hx, hy - 0.24, hz - 0.06);
    head.rotation.x = 0.25;
    legs[0].rotation.x = 0.9;
    legs[1].rotation.x = 0.9;
    legs[2].scale.y = 1.1;
    legs[3].scale.y = 1.1;
    tail.rotation.x = -1.15 + c; // c = 0: a straight tail
    return;
  }

  if (state === 'groom') {
    head.rotation.set(0.5, 0.65, 0.1);
    head.position.y = hy - 0.06 + Math.sin(t * 7) * 0.02; // little licks
    legs[1].rotation.x = -1.15; // raised front paw
    tail.rotation.x = -0.35 + c;
    for (const p of tailPivots) p.rotation.y = Math.sin(t * 1.6) * 0.12;
    return;
  }

  if (state === 'requestPet' || state === 'perch') {
    // upright sit
    body.rotation.x = -0.5;
    body.position.y = base.bodyY - 0.02;
    if (!folds) {
      legs[2].scale.y = 0.45;
      legs[3].scale.y = 0.45;
      legs[2].rotation.x = -0.5;
      legs[3].rotation.x = -0.5;
    }
    if (underside) {
      // polish-catlooks (2026-11-02): no snowman. The chest is flattened (its
      // centre held by keepChestUnderHead) and the forelegs stand forward as
      // columns in front of it (torso.js SIT). Cats only: Hagrid has no
      // underside, and his legs are a chicken's.
      underside.scale.z = SIT.chestDepth;
      for (const leg of [legs[0], legs[1]]) {
        leg.position.z = leg.userData.hipZ + SIT.foreZ;
        leg.rotation.x = SIT.foreTilt;
      }
    }
    head.position.set(hx, hy + 0.06, hz + 0.1);
    head.rotation.x = state === 'perch' ? 0.05 : -0.18;
    tail.rotation.set(-0.1 + c, 0, 0);
    for (const p of tailPivots) p.rotation.y = 0.5; // tail curled round the front
    tailPivots[0].rotation.y = 0.2 + Math.sin(t * 2.2) * 0.15; // tip flicks
    return;
  }

  if (state === 'sniff') {
    head.position.set(hx, hy - 0.18, hz - 0.06);
    head.rotation.x = 0.6 + Math.sin(t * 10) * 0.04; // snuffling
  }

  if (state === 'stalk') {
    body.position.y = base.bodyY - 0.1;
    head.position.set(hx, hy - 0.16, hz - 0.08);
    head.rotation.x = 0.15;
    if (!folds) for (const leg of legs) leg.scale.y = 0.7;
  }

  if (state === 'pounce') {
    body.scale.set(bsx * 0.94, bsy * 0.83, bsz * 1.15); // stretched mid-leap
    body.position.y = base.bodyY + 0.02;
    legs[0].rotation.x = 0.8;
    legs[1].rotation.x = 0.8;
    legs[2].rotation.x = -0.8;
    legs[3].rotation.x = -0.8;
    tail.rotation.x = -0.2 + c; // c = 0: a straight tail
    return;
  }

  if (state === 'scared') {
    body.position.y = base.bodyY - 0.06;
    tail.rotation.set(-1.35, 0, 0);
    for (const p of tailPivots) p.rotation.y = 0.35; // tucked
    earL.rotation.z = 0.6;
    earR.rotation.z = -0.6;
  }

  if (state === 'cross') {
    // Falls through to the walk gait and the tail chain below, exactly as
    // 'scared' does — a cross cat still has to be able to wander off.
    body.position.y = base.bodyY + CROSS.bodyLift;
    body.scale.set(bsx * CROSS.bodyScale[0], bsy * CROSS.bodyScale[1], bsz * CROSS.bodyScale[2]);
    body.rotation.y = CROSS.bodyYaw;
    // Chin drawn back over the shoulders and tipped down: staring you out,
    // not craning towards you.
    head.position.set(hx, hy + 0.02, hz + 0.05);
    head.rotation.x = 0.12;
    legs[0].rotation.x = CROSS.legSplay;
    legs[1].rotation.x = CROSS.legSplay;
    legs[2].rotation.x = -CROSS.legSplay;
    legs[3].rotation.x = -CROSS.legSplay;
    tail.rotation.set(CROSS.tailRotX, 0, 0);
    // tailPivots are deliberately left at the reset zero — no tuck.
    earL.rotation.z = CROSS.earPin;
    earR.rotation.z = -CROSS.earPin;
  }

  // Clan Life Part 2: the fight's clues and answers. Both hold still (no gait,
  // no breathing, no twitch) so the clue reads the same for its whole window.
  if (state === 'swipe') {
    // The front-left paw swung forward and up, the torso leaning back a
    // little, the head up and the ears pinned. 1.2 rad is past fitLongLegs'
    // swing limit, so the raised leg keeps its length and only the ground cap
    // touches it.
    legs[0].rotation.x = -1.2;
    legs[2].rotation.x = 0.12;
    legs[3].rotation.x = 0.12;
    body.rotation.x = -0.12;
    head.position.set(hx, hy + 0.05, hz + 0.02);
    head.rotation.x = -0.15;
    tail.rotation.set(CROSS.tailRotX, 0, 0);
    earL.rotation.z = CROSS.earPin;
    earR.rotation.z = -CROSS.earPin;
    return;
  }

  if (state === 'backUp') {
    // Weight back: the torso moved back and lowered at the rear (nose-up
    // tilt), front legs braced out in front, the head low and level. The
    // clear "about to charge" look. Legs are only swung, never shortened, so
    // fitLongLegs re-fits their soles to the ground and no crouch is implied.
    body.position.y = base.bodyY - 0.04;
    body.position.z = 0.08;
    body.rotation.x = -0.1;
    legs[0].rotation.x = -0.35;
    legs[1].rotation.x = -0.35;
    legs[2].rotation.x = 0.25;
    legs[3].rotation.x = 0.25;
    head.position.set(hx, hy - 0.08, hz + 0.04);
    head.rotation.x = 0;
    tail.rotation.set(-0.35, 0, 0);
    earL.rotation.z = CROSS.earPin;
    earR.rotation.z = -CROSS.earPin;
    return;
  }

  if (state === 'rearUp') {
    const sw = Math.sin(t * REAR_UP.swatFreq) * REAR_UP.swatAmp;
    legs[0].rotation.x = REAR_UP.swat + sw;
    legs[1].rotation.x = REAR_UP.swat - sw;
    head.rotation.x = REAR_UP.headTip;
    tail.rotation.set(REAR_UP.tailRotX, 0, 0);
    earL.rotation.z = REAR_UP.earPin;
    earR.rotation.z = -REAR_UP.earPin;
    return;
  }

  if (state === 'flinch') {
    body.position.y = base.bodyY - FLINCH.bodyDrop;
    body.position.z = FLINCH.bodyBack;
    body.rotation.x = FLINCH.bodyTip;
    head.position.set(hx + FLINCH.head[0], hy + FLINCH.head[1], hz + FLINCH.head[2]);
    head.rotation.set(FLINCH.headRot[0], FLINCH.headRot[1], FLINCH.headRot[2]);
    legs[0].rotation.x = FLINCH.frontLegs;
    legs[1].rotation.x = FLINCH.frontLegs;
    legs[2].rotation.x = FLINCH.hindLegs;
    legs[3].rotation.x = FLINCH.hindLegs;
    tail.rotation.set(FLINCH.tailRotX, 0, 0);
    if (!reducedMotion) {
      for (let i = 0; i < tailPivots.length; i++) tailPivots[i].rotation.y = Math.sin(t * FLINCH.quiverFreq - i * 0.6) * FLINCH.quiver;
    }
    earL.rotation.z = FLINCH.earPin;
    earR.rotation.z = -FLINCH.earPin;
    return;
  }

  if (state === 'pinned') {
    body.position.y = base.bodyY - PINNED.bodyDrop;
    body.scale.set(bsx * PINNED.bodyScale[0], bsy * PINNED.bodyScale[1], bsz * PINNED.bodyScale[2]);
    if (!folds) for (const leg of legs) leg.scale.y = PINNED.legs;
    head.position.set(hx + PINNED.head[0], hy + PINNED.head[1], hz + PINNED.head[2]);
    head.rotation.x = PINNED.headTip;
    tail.rotation.set(PINNED.tailRotX, 0, 0);
    earL.rotation.z = PINNED.earPin;
    earR.rotation.z = -PINNED.earPin;
    return;
  }

  if (state === 'pinning') {
    body.position.y = base.bodyY - PINNING.bodyDrop;
    body.scale.set(bsx * PINNING.bodyScale[0], bsy * PINNING.bodyScale[1], bsz * PINNING.bodyScale[2]);
    legs[0].rotation.x = PINNING.frontLegs;
    legs[1].rotation.x = PINNING.frontLegs;
    head.position.set(hx + PINNING.head[0], hy + PINNING.head[1], hz + PINNING.head[2]);
    head.rotation.x = PINNING.headTip;
    tail.rotation.set(PINNING.tailRotX, 0, 0);
    earL.rotation.z = PINNING.earPin;
    earR.rotation.z = -PINNING.earPin;
    return;
  }

  if (state === 'roll') {
    body.scale.set(bsx * ROLL.bodyScale[0], bsy * ROLL.bodyScale[1], bsz * ROLL.bodyScale[2]);
    if (!folds) {
      legs[0].rotation.x = -ROLL.tuck;
      legs[1].rotation.x = -ROLL.tuck;
      legs[2].rotation.x = ROLL.tuck;
      legs[3].rotation.x = ROLL.tuck;
    }
    head.position.set(hx + ROLL.head[0], hy + ROLL.head[1], hz + ROLL.head[2]);
    head.rotation.x = ROLL.headTip;
    for (const p of tailPivots) p.rotation.y = ROLL.tailWrap;
    earL.rotation.z = ROLL.earPin;
    earR.rotation.z = -ROLL.earPin;
    return;
  }

  if (state === 'arch') {
    // Falls through to the tail chain below, lashing like 'cross'.
    body.position.y = base.bodyY + ARCH.bodyLift;
    body.scale.set(bsx * ARCH.bodyScale[0], bsy * ARCH.bodyScale[1], bsz * ARCH.bodyScale[2]);
    body.rotation.y = ARCH.bodyYaw;
    head.position.set(hx, hy - ARCH.headDrop, hz);
    head.rotation.x = ARCH.headTip;
    earL.rotation.z = ARCH.earPin;
    earR.rotation.z = -ARCH.earPin;
  }

  if (state === 'land') {
    // landing squash: wide and low for a beat
    body.scale.set(bsx * 1.14, bsy * 0.78, bsz * 1.05);
    body.position.y = base.bodyY - 0.05;
    return;
  }

  if (walking) {
    // A creeping stalk: a folded (crouched) leg takes the walk's stride damped
    // to STALK_SWING of it, small low steps. At the full swing a crouched
    // thigh or hock rose out of the shoulder or rump as the leg rocked about
    // its hip (Digit at speed 1.5: 5.5 cm by Task 1's single ray, 1.8 cm over
    // the back's own top nearby; folds.test.js). A
    // rig without folds (Hagrid) keeps today's full swing.
    const freq = state === 'stalk' && folds
      ? walkGait(legs, t, moveSpeed, 1, STALK_SWING, 0.6 * STALK_SWING)
      : walkGait(legs, t, moveSpeed);
    if (!reducedMotion) {
      body.position.y += Math.abs(Math.sin(t * freq)) * 0.028;
      body.rotation.z = Math.sin(t * freq * 0.5) * 0.03;
    }
  } else if (state === 'follow') {
    body.scale.y += Math.sin(t * 1.8) * 0.012; // breathing
  }

  // lively lagged tail chain
  const sway = walking ? 0.1 + moveSpeed * 0.03 : 0.16;
  const raisedTailX = state === 'scared' ? -1.35 : state === 'cross' ? CROSS.tailRotX : state === 'arch' ? ARCH.tailRotX : base.tailRotX;
  tail.rotation.x = raisedTailX + Math.sin(t * 2.1) * 0.08;
  // The cross lash. reducedMotion is honoured the same way the walk cycle
  // honours it — the exaggeration is dropped and the ordinary sway remains,
  // so the pose still reads without a fast whipping element on screen. (In
  // practice only main.js's own-cat call site ever passes reducedMotion;
  // strays never do. This is here so the flag stays true for the player's
  // cat if a future caller ever poses it 'cross'.)
  const lashing = (state === 'cross' || state === 'arch') && !reducedMotion;
  const lashFreq = lashing ? CROSS.lashFreq : 2.6;
  const lashSway = lashing ? sway * CROSS.lashScale : sway;
  for (let i = 0; i < tailPivots.length; i++) {
    tailPivots[i].rotation.y += Math.sin(t * lashFreq - i * 0.65) * lashSway;
  }
  // The walking carriage (TAIL_S), on a rig with the resting curl (not Hagrid).
  if (state === 'follow' && c && moveSpeed > 0) {
    const w = Math.min(1, moveSpeed / TAIL_S_SPEED);
    for (let i = 0; i < tailPivots.length; i++) tailPivots[i].rotation.x = -c + (TAIL_S[i] + c) * w;
  }
}
