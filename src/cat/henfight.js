import * as THREE from 'three';
import { HEN_BODY, henBodyGeometry, henWingGeometry, henWingHinge } from './hen.js';
import { withLocalUuids } from '../world/localuuids.js';

// HAGRID FIGHTS LIKE A HEN (polish-hen Task 1). In a fight a cat swipes,
// rears up and boxes with its front paws; Hagrid has wings, so he puffs up,
// flaps, wing-slaps and pecks. The fight asks for its usual states (cross,
// arch, swipe, rearUp, ...); for Hagrid they become these hen states
// (henFightState), which pose() hands to poseHen before any cat branch.
//
// The fight wings. His folded wings are merged into his one body mesh
// (hen.js henBodyGeometry), so they cannot move. The first time he takes a
// hen state, a rig is built once (cat.userData.henRig): the body without its
// wings (henBodyGeometry({ wings: false })) and each wing on its own pivot at
// its shoulder hinge (hen.js henWingHinge), a child of the body. The pivot's
// scale is 1 / HEN_BODY.SCALE, so in its frame a turn is a true rotation (the
// animator writes the body's scale every frame: the wings puff with him).
// Pivot rotation.z = s · open lifts a wing out and up (s = -1 left, +1 right),
// rotation.y = s · swing sweeps its tip (at +z, behind) out and on forward,
// rotation.x tips it (+: the tip down). `open` runs from folded (0) through
// out flat (~1.6) to straight up over his back (~3.1); the fight camera sees
// him side-on and low, where a wing out flat is edge-on and all but vanishes,
// so the big moves raise the wings past flat (2.5-2.8) to stand over his back
// and read from the side as well as the front. At rotation 0 a fight wing lies
// exactly where the folded wing is drawn, so when he leaves a hen state
// (syncHenRig) the body gets its own geometry back and the wings are hidden
// at rotation 0: everything Box3.setFromObject sees is today's hen. A hen
// that never fights never builds the rig (hagrid-golden.json counts every
// mesh, hidden or not).
//
// Each state's numbers are in one frozen object below, tuned live by eye at
// the fight camera's 3-5 m: big, readable, silly. Offsets are added to the
// rest (base.bodyY, base.headPos); body scales multiply base.bodyScale.
// Legs: `hip` moves both hips up (+) or down, `len` scales the leg (a hen's
// leg hangs 0.3 from its hip to the sole), `swing` turns it about x (+: the
// foot forward), `splay` about z (outward). Comb: added to the comb halves'
// rest roll (the animator damps it by base.combGive). Under reducedMotion
// every wobble, flap, bob and hop is dropped: a still pose, the same at any t.
// No allocation per frame.

export const HEN_FIGHT_STATES = Object.freeze({
  cross: 'henCross', arch: 'henArch', land: 'henLand', pounce: 'henPounce', swipe: 'henSwipe', rearUp: 'henRearUp',
  flinch: 'henFlinch', pinning: 'henPinning', pinned: 'henPinned', roll: 'henRoll', scared: 'henScared',
});
const HEN_STATES = new Set(Object.values(HEN_FIGHT_STATES));
export const henFightState = (state) => (Object.hasOwn(HEN_FIGHT_STATES, state) ? HEN_FIGHT_STATES[state] : state);
export const isHenFightState = (state) => HEN_STATES.has(state);

const f = Object.freeze;

// The square-off and the rest between moves: chest out, "hands on hips",
// head low and forward bobbing slowly, the tail fan up.
export const HEN_CROSS = f({
  lift: 0.015, body: f([1.08, 1.08, 1.05]), pitch: -0.06,
  head: f([0, -0.06, -0.07]), headTip: -0.2, bob: 0.025, bobRate: 2.4,
  open: 0.5, swing: 0.3, tail: -1.05, fan: 1.1, comb: 0.1,
});
// The hiss beat: a huge feather puff, wings spread wide and shivering, head
// up, tail fan high, bouncing on his toes.
export const HEN_ARCH = f({
  lift: 0.05, body: f([1.2, 1.2, 1.12]), pitch: 0.06,
  head: f([0, 0.07, 0.02]), headTip: 0.3,
  open: 2.6, swing: 0.25, tip: -0.35, shiver: 0.07, shiverRate: 30,
  bounce: 0.03, bounceRate: 7, tail: -1.4, fan: 1.25, comb: 0.2,
});
// The crouch before a leap, and the dodge: squatting low, wings half out,
// a quick bouncing skip.
export const HEN_LAND = f({
  drop: 0.075, body: f([1.1, 0.88, 1.05]), pitch: -0.1, len: 0.75,
  head: f([0, -0.09, -0.04]), headTip: -0.15,
  open: 1.0, swing: 0.3, skip: 0.035, skipRate: 9, tail: -0.9, fan: 1, comb: 0,
});
// In the air (a leap, the pin's flight, the hops home): flapping fast, feet
// tucked up forward, nose-up a touch. The flap swings open between
// openMid ± flap (0.5 .. 2.7: from half out to up over his back).
export const HEN_POUNCE = f({
  lift: 0.04, body: f([1, 0.95, 1.08]), pitch: 0.25,
  head: f([0, 0.05, -0.04]), headTip: 0.2,
  openMid: 1.6, flap: 1.1, flapRate: 22, swing: 0.3, swingFlap: 0.2,
  legSwing: 1, len: 0.65, tail: -0.4, fan: 1, comb: 0,
});
// The answer prelude: a wing slap. The right wing swung forward and out,
// the left a little out for balance, the head thrust forward. Holds still
// (the fight's clues read the same for their whole window).
export const HEN_SWIPE = f({
  body: f([1.06, 1.06, 1.04]), pitch: -0.1, yaw: -0.15,
  head: f([0, -0.03, -0.1]), headTip: -0.2,
  right: f({ open: 1.3, swing: 1.9, tip: 0.6 }), left: f({ open: 0.6, swing: 0.3, tip: 0 }),
  tail: -1.1, fan: 1.1, comb: 0.15,
});
// The boxing: tall on long legs, leant forward against the group's 0.9 rad
// nose-up rear, wings slapping forward in turn, beak pecking.
export const HEN_REAR_UP = f({
  hip: 0.06, len: 1.2, legSwing: -0.7, body: f([1.05, 1.1, 1]), pitch: -0.55, lift: 0.06,
  head: f([0, -0.06, -0.1]), headTip: -0.3, peck: 0.07, peckRate: 9,
  open: 1.3, swingMid: 1.6, slap: 0.7, slapRate: 8, tail: -1.1, fan: 1.15, comb: 0.15,
});
// Got hit: a feather poof, wings flung up in alarm, head pulled back and up,
// the comb wobbling.
export const HEN_FLINCH = f({
  lift: 0.03, back: 0.04, body: f([1.12, 1.12, 1.1]), pitch: 0.15,
  head: f([0, 0.06, 0.06]), headTip: 0.35,
  open: 2.8, swing: 0.2, tip: -0.5, tail: -1.3, fan: 1.2, comb: 0.15, wobble: 0.5, wobbleRate: 20,
});
// Sitting on the other cat's back: a hen on her nest. Low on folded legs,
// wings out for balance flapping slowly, pecking gently down.
export const HEN_PINNING = f({
  drop: 0.12, hip: -0.1, len: 0.6, body: f([1.15, 0.9, 1.05]),
  head: f([0, -0.06, -0.06]), headTip: -0.3, peck: 0.04, peckTip: 0.25, peckRate: 3,
  open: 1.6, flap: 0.4, flapRate: 4, swing: 0.5, tail: -0.8, fan: 1.1, comb: 0,
});
// A cat on top: squashed flat, wings splayed flat out and tipped down, legs
// sticking out sideways, head forward low, the comb dizzily wobbling.
export const HEN_PINNED = f({
  drop: 0.16, hip: -0.14, len: 0.9, splay: 1.2, body: f([1.15, 0.7, 1.1]),
  head: f([0, -0.42, -0.1]), headTip: 0.5,
  open: 1.5, swing: 0.6, tip: 0.35, tail: -0.1, fan: 1.2, comb: 0, wobble: 0.3, wobbleRate: 6,
});
// The tumble: a feather ball. Round, legs tucked right up, head tucked in,
// wings wrapped (folded), tail fan folded shut.
export const HEN_ROLL = f({
  body: f([1.08, 1.18, 0.92]), len: 0.35, legSwing: 0.6,
  head: f([0, -0.1, 0.08]), headTip: -0.4,
  tail: 0.5, fan: 0.45, comb: 0,
});
// After a lost tumble: wings up, poofed, tail tucked down, little hops.
export const HEN_SCARED = f({
  body: f([1.12, 1.12, 1.08]), head: f([0, 0.05, 0.05]), headTip: 0.25,
  open: 2.5, flap: 0.2, flapRate: 14, swing: 0.25, tip: -0.3,
  hop: 0.06, hopRate: 8, tail: 0.3, fan: 0.7, comb: 0.1, wobble: 0.3, wobbleRate: 16,
});

// --- the rig ---------------------------------------------------------------

const [SX, SY, SZ] = HEN_BODY.SCALE;
const LEG = 0.3; // hip to sole (hen.js HEN_LEG.FOOT_Y)
// A spread fight wing is drawn up to this much bigger than the folded one
// (folded, exactly its size), so it reads at the fight camera's distance.
export const WING_GROW = 0.3;

function ensureRig(cat) {
  if (cat.userData.henRig) return cat.userData.henRig;
  const { body, legs, tail } = cat.userData.parts;
  const rig = withLocalUuids('hagrid-fight-wings', () => {
    const winglessGeo = henBodyGeometry({ wings: false });
    const wings = [];
    for (const s of [-1, 1]) {
      const [x, y, z] = henWingHinge(s);
      const pivot = new THREE.Group();
      pivot.name = s < 0 ? 'henWingL' : 'henWingR';
      pivot.position.set(x / SX, y / SY, z / SZ);
      pivot.scale.set(1 / SX, 1 / SY, 1 / SZ);
      const mesh = new THREE.Mesh(henWingGeometry(s).translate(-x, -y, -z), body.material);
      mesh.castShadow = body.castShadow;
      mesh.receiveShadow = body.receiveShadow;
      if (body.userData.noCast) mesh.userData.noCast = true;
      pivot.add(mesh);
      pivot.visible = false;
      body.add(pivot);
      wings.push(pivot);
    }
    return { bodyGeo: body.geometry, winglessGeo, wings, hipY: [legs[0].position.y, legs[1].position.y], tailScale: tail.scale.x };
  });
  cat.userData.henRig = rig;
  return rig;
}

// Every frame, for Hagrid: in a hen state the wingless body and both fight
// wings; otherwise (if he ever fought) today's hen exactly, wings hidden at
// rest. Never builds the rig outside a hen state.
export function syncHenRig(cat, state) {
  if (cat.userData.breed !== 'hagrid') return;
  const on = isHenFightState(state);
  if (!on && !cat.userData.henRig) return;
  const rig = ensureRig(cat);
  const { body, legs, tail } = cat.userData.parts;
  if (on) {
    body.geometry = rig.winglessGeo;
    rig.wings[0].visible = true;
    rig.wings[1].visible = true;
    return;
  }
  body.geometry = rig.bodyGeo;
  for (let i = 0; i < 2; i++) {
    const w = rig.wings[i];
    w.visible = false;
    w.rotation.set(0, 0, 0);
    w.scale.set(1 / SX, 1 / SY, 1 / SZ);
  }
  legs[0].position.y = rig.hipY[0];
  legs[1].position.y = rig.hipY[1];
  tail.scale.setScalar(rig.tailScale);
}

// --- the poses -------------------------------------------------------------

function setBody(cat, dy, k, pitch = 0, yaw = 0, dz = 0) {
  const { body } = cat.userData.parts;
  const { bodyY, bodyScale } = cat.userData.base;
  body.position.set(0, bodyY + dy, dz);
  body.scale.set(bodyScale[0] * k[0], bodyScale[1] * k[1], bodyScale[2] * k[2]);
  body.rotation.set(pitch, yaw, 0);
}
function setHead(cat, d, tip, dy = 0, dz = 0) {
  const { head } = cat.userData.parts;
  const [hx, hy, hz] = cat.userData.base.headPos;
  head.position.set(hx + d[0], hy + d[1] + dy, hz + d[2] + dz);
  head.rotation.set(tip, 0, 0);
}
// both real legs: hips `hip` up, length `len`, swung `swing`, splayed out `splay`
function setLegs(cat, rig, hip, len = 1, swing = 0, splay = 0) {
  const { legs } = cat.userData.parts;
  for (let i = 0; i < 2; i++) {
    const leg = legs[i], s = i === 0 ? -1 : 1;
    leg.position.y = rig.hipY[i] + hip;
    leg.scale.set(1, len, 1);
    leg.rotation.set(swing, 0, s * splay);
  }
}
function setWing(rig, i, open, swing, tip = 0) {
  const s = i === 0 ? -1 : 1;
  const w = rig.wings[i];
  w.rotation.set(tip, s * swing, s * open);
  // cartoon wings: a spread wing grows (WING_GROW at open ≥ 1.5), so it reads
  const g = 1 + WING_GROW * Math.min(1, Math.max(0, open / 1.5, swing / 1.5));
  w.scale.set(g / SX, g / SY, g / SZ);
}
function setWings(rig, open, swing, tip = 0) {
  setWing(rig, 0, open, swing, tip);
  setWing(rig, 1, open, swing, tip);
}
function setTail(cat, rotX, fan) {
  const { tail, tailPivots } = cat.userData.parts;
  tail.rotation.set(rotX, 0, 0);
  tail.scale.set(fan, 1, 1);
  for (let i = 0; i < tailPivots.length; i++) tailPivots[i].rotation.set(0, 0, 0);
}
function setComb(cat, c) {
  const { earL, earR } = cat.userData.parts;
  earL.rotation.z = 0.22 + c;
  earR.rotation.z = -0.22 - c;
}
const up = (x) => (x > 0 ? x : 0); // the upper half of a wave: a hop, a peck

// Called from pose() after its base reset, for Hagrid in a hen state. Writes
// the body, head, legs, tail and comb and both fight wings.
export function poseHen(cat, state, t, reducedMotion) {
  if (cat.userData.breed !== 'hagrid') return;
  const rig = ensureRig(cat);
  const m = reducedMotion ? 0 : 1;
  if (state === 'henCross') {
    const P = HEN_CROSS;
    const bob = m * P.bob * Math.sin(t * P.bobRate);
    setBody(cat, P.lift, P.body, P.pitch);
    setHead(cat, P.head, P.headTip + 2 * bob, bob, -bob);
    setLegs(cat, rig, 0);
    setWings(rig, P.open, P.swing);
    setTail(cat, P.tail, P.fan);
    setComb(cat, P.comb);
  } else if (state === 'henArch') {
    const P = HEN_ARCH;
    const b = m * P.bounce * up(Math.sin(t * P.bounceRate));
    const shiver = m * P.shiver * Math.sin(t * P.shiverRate);
    setBody(cat, P.lift + b, P.body, P.pitch);
    setHead(cat, P.head, P.headTip, b);
    setLegs(cat, rig, b, 1 + b / LEG); // up on his toes: the soles stay down
    setWings(rig, P.open + shiver, P.swing, P.tip);
    setTail(cat, P.tail, P.fan);
    setComb(cat, P.comb + shiver);
  } else if (state === 'henLand') {
    const P = HEN_LAND;
    const skip = m * P.skip * up(Math.sin(t * P.skipRate));
    setBody(cat, -P.drop + skip, P.body, P.pitch);
    setHead(cat, P.head, P.headTip, skip);
    setLegs(cat, rig, -LEG * (1 - P.len) + skip, P.len); // squat: hips down as far as the legs shorten
    setWings(rig, P.open + 2 * skip, P.swing);
    setTail(cat, P.tail, P.fan);
    setComb(cat, P.comb);
  } else if (state === 'henPounce') {
    const P = HEN_POUNCE;
    const w = m * Math.sin(t * P.flapRate);
    setBody(cat, P.lift - 0.02 * w, P.body, P.pitch);
    setHead(cat, P.head, P.headTip);
    setLegs(cat, rig, 0, P.len, P.legSwing);
    setWings(rig, P.openMid + P.flap * w, P.swing + P.swingFlap * w);
    setTail(cat, P.tail, P.fan);
    setComb(cat, P.comb);
  } else if (state === 'henSwipe') {
    const P = HEN_SWIPE;
    setBody(cat, 0, P.body, P.pitch, P.yaw);
    setHead(cat, P.head, P.headTip);
    setLegs(cat, rig, 0);
    setWing(rig, 0, P.left.open, P.left.swing, P.left.tip);
    setWing(rig, 1, P.right.open, P.right.swing, P.right.tip);
    setTail(cat, P.tail, P.fan);
    setComb(cat, P.comb);
  } else if (state === 'henRearUp') {
    const P = HEN_REAR_UP;
    const slap = m * P.slap * Math.sin(t * P.slapRate);
    const peck = m * P.peck * up(Math.sin(t * P.peckRate));
    setBody(cat, P.lift, P.body, P.pitch);
    setHead(cat, P.head, P.headTip - 2 * peck, -0.5 * peck, -peck);
    setLegs(cat, rig, P.hip, P.len, P.legSwing);
    setWing(rig, 0, P.open, P.swingMid + slap);
    setWing(rig, 1, P.open, P.swingMid - slap);
    setTail(cat, P.tail, P.fan);
    setComb(cat, P.comb);
  } else if (state === 'henFlinch') {
    const P = HEN_FLINCH;
    const wob = m * P.wobble * Math.sin(t * P.wobbleRate);
    setBody(cat, P.lift, P.body, P.pitch, 0, P.back);
    setHead(cat, P.head, P.headTip);
    setLegs(cat, rig, 0);
    setWings(rig, P.open, P.swing, P.tip);
    setTail(cat, P.tail, P.fan);
    setComb(cat, P.comb + wob);
  } else if (state === 'henPinning') {
    const P = HEN_PINNING;
    const peck = m * up(Math.sin(t * P.peckRate));
    const flap = m * P.flap * Math.sin(t * P.flapRate);
    setBody(cat, -P.drop, P.body);
    setHead(cat, P.head, P.headTip - P.peckTip * peck, -P.peck * peck);
    setLegs(cat, rig, P.hip, P.len);
    setWings(rig, P.open + flap, P.swing);
    setTail(cat, P.tail, P.fan);
    setComb(cat, P.comb);
  } else if (state === 'henPinned') {
    const P = HEN_PINNED;
    const wob = m * P.wobble * Math.sin(t * P.wobbleRate);
    setBody(cat, -P.drop, P.body);
    setHead(cat, P.head, P.headTip);
    setLegs(cat, rig, P.hip, P.len, 0, P.splay);
    setWings(rig, P.open, P.swing, P.tip);
    setTail(cat, P.tail, P.fan);
    setComb(cat, P.comb + wob);
  } else if (state === 'henRoll') {
    const P = HEN_ROLL;
    setBody(cat, 0, P.body);
    setHead(cat, P.head, P.headTip);
    setLegs(cat, rig, 0, P.len, P.legSwing);
    setWings(rig, 0, 0);
    setTail(cat, P.tail, P.fan);
    setComb(cat, P.comb);
  } else if (state === 'henScared') {
    const P = HEN_SCARED;
    const hop = m * P.hop * up(Math.sin(t * P.hopRate));
    const flap = m * P.flap * Math.sin(t * P.flapRate);
    const wob = m * P.wobble * Math.sin(t * P.wobbleRate);
    setBody(cat, hop, P.body);
    setHead(cat, P.head, P.headTip, hop);
    setLegs(cat, rig, hop);
    setWings(rig, P.open + flap, P.swing, P.tip);
    setTail(cat, P.tail, P.fan);
    setComb(cat, P.comb + wob);
  }
}
