import * as THREE from 'three';
import { TORSO, HEAD, PAW_HALF } from './torso.js';

const GAIT_PHASE = [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5]; // 4-beat: FL, FR, BL, BR
const CAT_BASE = { bodyY: TORSO.CENTRE_Y, bodyScale: [...TORSO.SCALE], headPos: [...HEAD.POS], tailRotX: -0.6 };

// R3: the tail's resting curl (base.tailCurl per link) by state. Standing,
// walking, grooming and sniffing get the full curl; lying and sitting a fifth,
// so the tail lies round the cat. Every other state (cross, scared, stalk,
// pounce, stretch) keeps today's straight chain. A rig without tailCurl
// (Hagrid) gets no curl in any state.
const TAIL_CURL_BY_STATE = { follow: 1, sniff: 1, groom: 1, land: 1, nap: 0.2, perch: 0.2, requestPet: 0.2 };

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
  const { underside } = cat.userData.parts;
  if (underside) keepChestUnderHead(cat.userData.parts.body, underside);
  const base = cat.userData.base;
  if (base?.legLift) fitLongLegs(cat);
  if (base?.poseFit?.[state]) applyPoseFit(cat, base.poseFit[state]);
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
function keepChestUnderHead(body, underside) {
  const yaw = body.rotation.y;
  if (!yaw) {
    underside.rotation.y = 0;
    underside.position.set(0, 0, 0);
    return;
  }
  underside.rotation.y = -yaw;
  const S = body.scale;
  _c.fromArray(underside.userData.chestCentre);
  _p.copy(_c).multiply(S).applyQuaternion(_q.copy(body.quaternion).invert()).divide(S); // S⁻¹·Q⁻¹·S·c
  _c.applyQuaternion(_yaw.setFromAxisAngle(_Y, -yaw));                                  // R_y(-θ)·c
  _p.sub(_c);
  underside.position.set(_p.x + 0, _p.y + 0, _p.z + 0);
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
//   * a crouch (any leg folded, scale.y < 1) brings everything but the legs
//     down by Δ, so the body rests exactly as low as a standard cat's does;
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
  // Contract with pose(): it may only shrink a leg (scale.y < 1) when it also lowers the body.
  const crouch = legs.some((leg) => leg.scale.y < 1);
  for (const child of cat.children) {
    if (legs.includes(child) || child.userData.liftY === undefined) continue;
    if (child === body || child === head) {
      if (crouch) child.position.y -= lift; // the pose wrote these this frame
    } else {
      child.position.y = child.userData.liftY - (crouch ? lift : 0);
    }
  }
  for (const leg of legs) {
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
  body.position.z = 0; // only backUp moves it
  body.scale.set(bsx, bsy, bsz);
  body.rotation.set(0, 0, 0);
  head.position.set(hx, hy, hz);
  head.rotation.set(0, 0, 0);
  tail.rotation.set(base.tailRotX, 0, 0);
  for (const leg of legs) {
    leg.rotation.set(0, 0, 0);
    leg.scale.set(1, 1, 1);
  }
  for (const p of tailPivots) p.rotation.set(c ? -c : 0, 0, 0); // never -0 (Hagrid)

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
    for (const leg of legs) leg.scale.y = 0.25;
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
    legs[2].scale.y = 0.45;
    legs[3].scale.y = 0.45;
    legs[2].rotation.x = -0.5;
    legs[3].rotation.x = -0.5;
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
    for (const leg of legs) leg.scale.y = 0.7;
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

  if (state === 'land') {
    // landing squash: wide and low for a beat
    body.scale.set(bsx * 1.14, bsy * 0.78, bsz * 1.05);
    body.position.y = base.bodyY - 0.05;
    return;
  }

  if (walking) {
    const freq = walkGait(legs, t, moveSpeed);
    if (!reducedMotion) {
      body.position.y += Math.abs(Math.sin(t * freq)) * 0.028;
      body.rotation.z = Math.sin(t * freq * 0.5) * 0.03;
    }
  } else if (state === 'follow') {
    body.scale.y += Math.sin(t * 1.8) * 0.012; // breathing
  }

  // lively lagged tail chain
  const sway = walking ? 0.1 + moveSpeed * 0.03 : 0.16;
  const raisedTailX = state === 'scared' ? -1.35 : state === 'cross' ? CROSS.tailRotX : base.tailRotX;
  tail.rotation.x = raisedTailX + Math.sin(t * 2.1) * 0.08;
  // The cross lash. reducedMotion is honoured the same way the walk cycle
  // honours it — the exaggeration is dropped and the ordinary sway remains,
  // so the pose still reads without a fast whipping element on screen. (In
  // practice only main.js's own-cat call site ever passes reducedMotion;
  // strays never do. This is here so the flag stays true for the player's
  // cat if a future caller ever poses it 'cross'.)
  const lashing = state === 'cross' && !reducedMotion;
  const lashFreq = lashing ? CROSS.lashFreq : 2.6;
  const lashSway = lashing ? sway * CROSS.lashScale : sway;
  for (let i = 0; i < tailPivots.length; i++) {
    tailPivots[i].rotation.y += Math.sin(t * lashFreq - i * 0.65) * lashSway;
  }
}
