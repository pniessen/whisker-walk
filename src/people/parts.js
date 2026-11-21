// The parts of one person, in the figure's rest frame (standing, arms down),
// each painted (vertex colour) and bound whole to one joint, weight 1: one
// rigidly skinned mesh per person once merged (the figure does that). The near
// build has the face, ears, thumbs, deltoids and rounder segments; the far one
// keeps the body's shape, the neck, the collar and the eyes, and nothing else
// on the face. Metres, faces -z.
import * as THREE from 'three';
import {
  limbGeo, lathe, stadiumTube, ellipsoid, jawTaper, headGeo, hairShell, onFace, faceLayout, dipNeckline, neckFrame,
  dropDegenerate, HAIR_STYLES,
} from './shapes.js';

const lerp = (a, b, k) => a + (b - a) * k;

export const JOINTS = Object.freeze(['root', 'pelvis', 'chest', 'neck', 'head', 'eyeL', 'eyeR', 'mouth',
  'upperArmL', 'forearmL', 'handL', 'upperArmR', 'forearmR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR']);
export const JOINT_INDEX = Object.freeze(Object.fromEntries(JOINTS.map((n, i) => [n, i])));
export const JOINT_PARENT = Object.freeze({
  root: null, pelvis: 'root', chest: 'pelvis', neck: 'chest', head: 'neck',
  eyeL: 'head', eyeR: 'head', mouth: 'head',
  upperArmL: 'chest', forearmL: 'upperArmL', handL: 'forearmL',
  upperArmR: 'chest', forearmR: 'upperArmR', handR: 'forearmR',
  thighL: 'pelvis', shinL: 'thighL', footL: 'shinL',
  thighR: 'pelvis', shinR: 'thighR', footR: 'shinR',
});

// Segment counts: near at most 2,800 triangles a person, far at most 600.
// The far limbs are one band from end to end (ring 1: no middle ring, so no
// bulge, which is a few millimetres and unseen beyond 12 m): 16 triangles a
// limb, not 24, so the Fairground's twelve people fit the owner's 75,000
// with room to spare (ruling R21; the hair, the shoes, the hands, the neck,
// the collar and the eyes keep their shapes).
export const SEGMENTS = Object.freeze({
  near: Object.freeze({ limb: 8, ring: 4, cap: 2, torso: 10, head: [12, 8], hair: [12, 8], hand: [6, 4], foot: [8, 5] }),
  far: Object.freeze({ limb: 4, ring: 1, cap: 1, torso: 6, head: [6, 4], hair: [6, 4], hand: [4, 3], foot: [4, 3] }),
});

const EYE = 0x2a211c;
const CATCHLIGHT = 0xffffff;
const BROW_DARKEN = 0.75;
const LIP = 0xa8605a;
const GLASSES = 0x3a3a42;
const BOBBLE = 0xf4f0e8;

const darken = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();
// The cheeks under the eyes: the skin a shade warmer (its red kept, a
// little less green and blue), never lighter, so it reads on every skin tone.
const warm = (hex) => {
  const c = new THREE.Color(hex);
  return new THREE.Color(c.r, c.g * 0.94, c.b * 0.9).getHex();
};

// Paint a geometry one colour and bind every vertex of it to one joint.
function part(geo, color, joint, tag) {
  if (!geo.index) throw new Error('parts are indexed');
  if (!(joint in JOINT_INDEX)) throw new Error(`no joint ${joint}`);
  dropDegenerate(geo);
  const n = geo.getAttribute('position').count;
  const c = new THREE.Color(color);
  const col = new Float32Array(n * 3);
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    si[i * 4] = JOINT_INDEX[joint];
    sw[i * 4] = 1;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  if (!geo.getAttribute('uv')) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  return { geo, tag, joint };
}

const SIDES = [[-1, 'L'], [1, 'R']]; // the figure's left is -x (it faces -z)

// The flares a look wears (a skirt or a dress, then a coat's skirt), bottom
// to top: [{ pts: [[r, y], ...] (the hem first), sz (depth over width),
// color }]. Flares are sized from the thighs' outer edge, so a standing leg
// never pokes through. (Also read by bumps.js: her soft bumps cover a
// person's cloth as it hangs in their kneel, ruling R32.)
export function flareProfiles(look) {
  const d = look.dims;
  const top = look.top;
  const dress = top.kind === 'dress';
  const skirt = look.bottom.kind === 'skirt' && !dress;
  const out = [];
  const legOut = d.hipX + d.thR[0] * 1.1;
  const older = look.kind === 'older';
  const skirtHem = older ? lerp(d.kneeY, d.ankleY, 0.35) : lerp(d.hipY, d.kneeY, 0.92);
  const skirtHemR = legOut * (older ? 1.4 : 1.5);
  if (skirt || dress) {
    out.push({ pts: [[skirtHemR, skirtHem], [legOut * 1.1, d.hipY], [d.waistR * 1.02, d.waistY], [d.waistR, d.waistY + 0.02]], sz: 0.8,
      color: dress ? top.color : look.bottom.color });
  }
  if (top.kind === 'coat') {
    const hem = lerp(d.hipY, d.kneeY, 0.45);
    let hemR = legOut * 1.28;
    let hipR = legOut * 1.12;
    let sz = 0.78;
    if (skirt) {
      // over a skirt, the coat stays outside it all the way down to its hem
      hemR = Math.max(hemR, 1.06 * lerp(legOut * 1.1, skirtHemR, (d.hipY - hem) / (d.hipY - skirtHem)));
      hipR = Math.max(hipR, 1.06 * legOut * 1.1);
      sz = 0.8;
    }
    out.push({ pts: [[hemR, hem], [hipR, d.hipY], [d.waistR * 1.06, d.waistY], [d.waistR * 1.04, d.waistY + 0.03]], sz, color: top.color });
  }
  return out;
}

// How a flare's point (figure frame, as built) is bound, so the whole skirt
// swings with the stride and, in the kneel, lies over the raised knee as one
// piece with its back hanging down (the owner, 2026-11-21: the raised thigh
// showed as through a slit, a fold stood out behind, and only the left half
// swung). From the pelvis at the waist, going down, more and more to the
// thigh on its own side (the halves cross over smoothly at the middle):
//  * round the flare the share eases from the front's to the sides' to the
//    back's (DRAPE.FRONT, SIDE, BACK: [at the hips, at the hem]). The sides
//    are the stride's pivot. In the kneel the front lies over the raised
//    thigh and the side follows it nearly whole at the hips (where the
//    thigh rises into the cloth); lower down both follow it in part, so the
//    cloth beyond the thigh hangs down instead of standing out with it (a
//    full share at the hem floated the cloth high over the knee, a flap
//    seen from behind; less at the side's hem let the thigh through the
//    cloth on the way down and up).
//  * the left half's back, for a grown-up (who kneels on the right knee,
//    the left raised), takes most of its share as the RIGHT thigh's swing
//    the other way (a negative weight, DRAPE.MIRROR): in the stride the legs
//    swing against each other, so it swings with its own (left) leg, while
//    in the kneel, where the right thigh hangs about straight down, it hangs
//    down calmly behind the raised left thigh.
//  * below the knee (an older woman's longer skirt) a part of the thigh's
//    share goes to the shin (DRAPE.SHIN at the hem), so a bent knee's calf
//    stays inside it.
// Into `out`: [pelvis, thighL, thighR, shin, side of that shin (0 the left,
// 1 the right)]; the four weights add to 1.
export const DRAPE = Object.freeze({
  FRONT: [0.8, 0.85], SIDE: [0.9, 0.6], BACK: [0.3, 0.9],
  ROUND: 0.6, // how far round from the front (or the back) the share eases to the side's (cos of the angle)
  MIDDLE: 1.2, // the halves cross over within this many hipX of the middle
  MIRROR: 0.7, // of the left half's back share: taken as the right thigh's swing the other way
  SHIN: 0.6, // of a share at a hem below the knee: the shin's
});
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth01 = (v) => { const c = clamp01(v); return c * c * (3 - 2 * c); };
// a share down the flare: 0 at the waist, `hip` at the hips, `hem` at the hem
const shareDown = (k, kHip, [hip, hem]) => (k <= kHip ? hip * smooth01(k / kHip) : hip + (hem - hip) * smooth01((k - kHip) / (1 - kHip)));
export function drapeWeights(look, hemY, x, y, z, out) {
  const d = look.dims;
  const zn = z / 0.8; // the flares' depth over width
  const h = Math.hypot(x, zn);
  const c = h > 1e-9 ? zn / h : 0; // -1 at the front, 0 at a side, 1 behind
  const k = clamp01((d.waistY - y) / (d.waistY - hemY));
  const kHip = clamp01((d.waistY - d.hipY) / (d.waistY - hemY));
  const side = shareDown(k, kHip, DRAPE.SIDE);
  const front = smooth01(-c / DRAPE.ROUND);
  const back = smooth01(c / DRAPE.ROUND);
  const w = c < 0 ? side + (shareDown(k, kHip, DRAPE.FRONT) - side) * front : side + (shareDown(k, kHip, DRAPE.BACK) - side) * back;
  const t = smooth01(0.5 + x / (2 * DRAPE.MIDDLE * d.hipX)); // 0 the left (-x), 1 the right
  let wl = w * (1 - t);
  let wr = w * t;
  const mirror = look.kind === 'adult' ? wl * back * DRAPE.MIRROR : 0;
  wl -= mirror; wr -= mirror;
  // below the knee, part of the own side's thigh share goes to its shin;
  // none at the middle, where the halves meet, so the shin a point follows
  // (its own side's) changes over without a step
  const right = t > 0.5;
  const below = hemY < d.kneeY ? DRAPE.SHIN * smooth01((d.kneeY - y) / (d.kneeY - hemY)) * smooth01(Math.abs(2 * t - 1) / 0.5) : 0;
  const shin = (right ? wr : wl) * below;
  if (right) wr -= shin; else wl -= shin;
  out[0] = 1 - wl - wr - shin; out[1] = wl; out[2] = wr; out[3] = shin; out[4] = right ? 1 : 0;
  return out;
}

const _dw = [0, 0, 0, 0, 0];
function drape(geo, look, hemY) {
  const pos = geo.getAttribute('position');
  const si = geo.getAttribute('skinIndex');
  const sw = geo.getAttribute('skinWeight');
  for (let i = 0; i < pos.count; i++) {
    drapeWeights(look, hemY, pos.getX(i), pos.getY(i), pos.getZ(i), _dw);
    si.setXYZW(i, JOINT_INDEX.pelvis, JOINT_INDEX.thighL, JOINT_INDEX.thighR, _dw[4] ? JOINT_INDEX.shinR : JOINT_INDEX.shinL);
    sw.setXYZW(i, _dw[0], _dw[1], _dw[2], _dw[3]);
  }
  return geo;
}

// the near flare's rings between its hem and the hips (fractions of the way up)
const FLARE_RINGS = [1 / 3, 2 / 3];

// A vertex at +-x on a lathe of `segs` sides (see lathe()).
const sidePhi = (segs) => (Math.PI / 2) % ((Math.PI * 2) / segs);

// The joints' rest places, figure frame (Task 3 makes them parent-relative).
export function jointRest(d) {
  const nk = neckFrame(d);
  const f = faceLayout(d);
  const elbowY = d.shoulderY - d.upperArm;
  const wristY = elbowY - d.forearm;
  const at = {
    root: [0, 0, 0],
    pelvis: [0, d.hipY, 0],
    chest: [0, d.waistY, 0],
    neck: [0, nk.baseY + 0.03 * d.s, nk.baseZ],
    head: [0, nk.topY, nk.topZ],
    // each eye turns about its eyeball's centre, well behind the dot, so the
    // dot slides over the face as a real eye turns
    eyeL: [-f.eyeX, nk.headCY + f.eyeY, nk.headCZ + onFace(d, -f.eyeX, f.eyeY, -f.eyeIn) + f.eyeBall],
    eyeR: [f.eyeX, nk.headCY + f.eyeY, nk.headCZ + onFace(d, f.eyeX, f.eyeY, -f.eyeIn) + f.eyeBall],
    // the smile's middle (its line's centre at x = 0, halfway up its arc)
    mouth: [0, nk.headCY + f.mouthY, nk.headCZ + onFace(d, 0, f.mouthY, -f.smileIn)],
  };
  for (const [sd, L] of SIDES) {
    at[`upperArm${L}`] = [sd * d.shoulderX, d.shoulderY, 0];
    at[`forearm${L}`] = [sd * d.shoulderX, elbowY, 0];
    at[`hand${L}`] = [sd * d.shoulderX, wristY, 0];
    at[`thigh${L}`] = [sd * d.hipX, d.hipY, 0];
    at[`shin${L}`] = [sd * d.hipX, d.kneeY, 0];
    at[`foot${L}`] = [sd * d.hipX, d.ankleY, 0];
  }
  return at;
}

// personParts(look, detail) -> [{ geo, tag, joint }], every geo indexed with
// position, normal, uv, color, skinIndex and skinWeight (ready to merge).
export function personParts(look, detail = 'near') {
  const near = detail !== 'far';
  const S = near ? SEGMENTS.near : SEGMENTS.far;
  const d = look.dims;
  const out = [];
  const add = (geo, color, joint, tag) => { out.push(part(geo, color, joint, tag)); };
  const skin = look.skin;
  const top = look.top;
  const bot = look.bottom;
  const dress = top.kind === 'dress';
  const shorts = bot.kind === 'shorts' && !dress; // under a dress they never show
  const longSleeve = top.kind !== 'tshirt' && !dress;
  const legSkin = dress || bot.kind === 'skirt' || bot.kind === 'shorts';
  const legCol = legSkin ? skin : bot.color;
  // a hem (sleeve, shorts): a short tube of its own, a crisp edge where
  // vertex colours would blur across a ring; one round over each end (the
  // top is hidden in the limb, the bottom is a flat lip)
  const hem = { segs: S.limb, rings: near ? 2 : 1, capN: 1 };
  // a far torso has fewer sides, so its flat sides would sit nearer the
  // middle than the near build's: widen it to the near build's width
  const torsoSx = Math.cos(Math.PI / SEGMENTS.near.torso) / Math.cos(Math.PI / S.torso);

  // ---- legs ----
  const thighLen = d.hipY - d.kneeY;
  const shinLen = d.kneeY - d.ankleY;
  for (const [sd, L] of SIDES) {
    const x = sd * d.hipX;
    if (shorts) {
      add(limbGeo(thighLen * 0.5, d.thR[0] * 1.06, d.thR[0] * 0.97, { ...hem, capBot: 0.15 })
        .translate(x, d.hipY, 0), bot.color, `thigh${L}`, 'shorts');
    }
    add(limbGeo(thighLen, d.thR[0] * 1.06, d.thR[1] * 1.05, { segs: S.limb, rings: S.ring, capN: S.cap, bulge: 0.006 * d.s, bulgeAt: 0.25 })
      .translate(x, d.hipY, 0), legCol, `thigh${L}`, 'leg');
    add(limbGeo(shinLen, d.shR[0], d.shR[1], { segs: S.limb, rings: S.ring, capN: S.cap, bulge: 0.01 * d.s, bulgeAt: 0.3 })
      .translate(x, d.kneeY, 0), legCol, `shin${L}`, 'leg');
    // the shoe: a rounded last, flat underneath, its heel under the ankle
    const shoe = ellipsoid(d.footLen * 0.21, d.ankleY * 0.8, d.footLen * 0.5, ...S.foot)
      .translate(x + sd * 0.004, d.ankleY * 0.62, -d.footLen * 0.24);
    const sp = shoe.getAttribute('position');
    for (let i = 0; i < sp.count; i++) if (sp.getY(i) < 0.004) sp.setY(i, 0.004);
    shoe.computeVertexNormals();
    add(shoe, look.shoes, `foot${L}`, 'shoe');
  }

  // ---- the seat: hips and the trousers' top ----
  // One smooth line from the shirt's hem over the hips into the legs (ruling
  // R9). Its rings are stadiums whose ends share the thighs' axes and facets:
  // at the hips it is the thighs' outline a few millimetres out, so their
  // round tops stay inside it; below the hips it tucks inside the thighs (the
  // band between them is the crotch); above, it narrows to sit inside the
  // shirt, whose hem is the trousers' top. (A lathe, wider or narrower,
  // either jutted over the legs or let the thighs' tops show through it.)
  const thTop = d.thR[0] * 1.06; // the thigh's radius at its top (see the legs)
  const crotch = d.hipY - d.thR[0] * 0.55;
  const m = 0.004 * d.s;
  const shirtHem = d.waistY - 0.04 * d.s; // the shirt's lower edge (the chest's bottom)
  const capY = d.hipY + thTop * Math.SQRT1_2; // the near thigh cap's middle ring
  const seat = near
    ? [[d.hipX * 0.6, 0, 0, crotch - 0.012], [d.hipX, thTop * 0.5, thTop * 0.5, crotch],
      [d.hipX, thTop + m, thTop + m, d.hipY],
      [d.hipX, thTop * Math.SQRT1_2 + m, thTop * Math.SQRT1_2 + m, capY],
      // just inside the shirt's ten-sided hem (its sides sit at cos 18 deg of its radius)
      [0, d.waistR * torsoSx * 0.92, d.waistR * d.torsoZ * 0.92, shirtHem + 0.004 * d.s],
      [0, 0, 0, d.waistY]]
    // far: the chest's bottom is open inside the seat, so the seat holds it
    : [[d.hipX * 0.6, 0, 0, crotch - 0.012], [d.hipX, thTop * 0.5, thTop * 0.5, crotch],
      [d.hipX, thTop + m, thTop + m, d.hipY],
      [0, d.waistR * torsoSx + m, d.waistR * d.torsoZ + m, shirtHem],
      [0, 0, 0, d.waistY + 0.03 * d.s]];
  add(stadiumTube(seat, S.limb / 2 + 1), dress ? top.color : bot.color, 'pelvis', 'seat');

  // ---- the chest: waist to shoulders, the shoulders rounded over to the neck ----
  const shR = d.shoulderX + d.uaR[0] * 0.25;
  const shoulderTop = [shR * 0.86, d.shoulderY + 0.012 * d.s];
  // the trapezius slopes up about 20 degrees from the shoulder's top to the
  // neck's root (flat, it read as square shoulders)
  const trap = [lerp(shR * 0.86, d.neckR * 1.35, 0.55), lerp(d.shoulderY + 0.012 * d.s, d.neckY, 0.72)];
  const chestPts = near
    ? [[0, d.waistY - 0.04 * d.s], [d.waistR, d.waistY - 0.04 * d.s], [d.waistR * 1.02, d.waistY + 0.03 * d.s],
      [lerp(d.waistR, d.chestR, 0.7), lerp(d.waistY, d.shoulderY, 0.45)], [d.chestR, lerp(d.waistY, d.shoulderY, 0.75)],
      [shR * 0.97, d.shoulderY - 0.015 * d.s], shoulderTop, trap,
      [d.neckR * 1.35, d.neckY], [d.neckR * 0.9, d.neckY + 0.004], [0, d.neckY + 0.005]]
    // far: the bottom left open inside the seat, the waist running straight
    // up to the chest; the shoulder's round, the slope and the neck's root kept
    : [[d.waistR, d.waistY - 0.04 * d.s], [d.chestR, lerp(d.waistY, d.shoulderY, 0.75)],
      [shR * 0.97, d.shoulderY - 0.015 * d.s], shoulderTop, trap, [d.neckR * 1.35, d.neckY], [0, d.neckY + 0.005]];
  const chest = lathe(chestPts, S.torso, torsoSx, d.torsoZ);
  if (look.sex === 'f' && look.kind !== 'child') {
    // a softer front: the chest a touch fuller below the collarbones
    const cp = chest.getAttribute('position');
    const mid = lerp(d.waistY, d.shoulderY, 0.62);
    for (let i = 0; i < cp.count; i++) {
      const z = cp.getZ(i);
      if (z < 0) cp.setZ(i, z * (1 + 0.16 * Math.exp(-((cp.getY(i) - mid) ** 2) / (0.006 * d.s))));
    }
  }
  add(dipNeckline(chest, d), top.color, 'chest', 'chest');

  // deltoids: low and flat, so the shoulder line runs on from the neck into
  // the arm instead of standing up in a square bump
  if (near) {
    for (const [sd, L] of SIDES) {
      add(ellipsoid(d.uaR[0] * 1.06, d.uaR[0] * 0.6, d.uaR[0] * 1.06, ...S.hand)
        .translate(sd * d.shoulderX * 0.97, d.shoulderY - 0.006 * d.s, 0), top.color, `upperArm${L}`, 'deltoid');
    }
  }

  // ---- a coat's skirt, a dress or a skirt: a flare from the waist ----
  for (const f of flareProfiles(look)) {
    // near, two more rings between the hem and the hips (a third of the way
    // each, where bumps.js samples the cloth), so the cloth can bend over a
    // raised knee and follow a swinging thigh
    const pts = near ? [f.pts[0], ...FLARE_RINGS.map((k) => [lerp(f.pts[0][0], f.pts[1][0], k), lerp(f.pts[0][1], f.pts[1][1], k)]), ...f.pts.slice(1)] : f.pts.slice(0, 3);
    add(lathe(pts, S.torso, 1, f.sz, sidePhi(S.torso)), f.color, 'pelvis', 'flare');
    drape(out[out.length - 1].geo, look, f.pts[0][1]);
  }

  // ---- arms and hands ----
  const elbowY = d.shoulderY - d.upperArm;
  const wristY = elbowY - d.forearm;
  const hr = d.hand * 0.5;
  for (const [sd, L] of SIDES) {
    const x = sd * d.shoulderX;
    add(limbGeo(d.upperArm, d.uaR[0], d.uaR[1], { segs: S.limb, rings: S.ring, capN: S.cap, capTop: 0.3, bulge: 0.004 * d.s, bulgeAt: 0.35 })
      .translate(x, d.shoulderY, 0), longSleeve ? top.color : skin, `upperArm${L}`, 'arm');
    if (!longSleeve) {
      // its top as round as the arm's own (S.cap): a flatter cone let the
      // arm's round top show through at the shoulder
      add(limbGeo(d.upperArm * 0.5, d.uaR[0] * 1.05, d.uaR[0] * 1.02, { ...hem, capN: S.cap, capTop: 0.3, capBot: 0.15 })
        .translate(x, d.shoulderY, 0), top.color, `upperArm${L}`, 'sleeve');
    }
    add(limbGeo(d.forearm, d.faR[0], d.faR[1], { segs: S.limb, rings: S.ring, capN: S.cap, bulge: 0.006 * d.s, bulgeAt: 0.25 })
      .translate(x, elbowY, 0), longSleeve ? top.color : skin, `forearm${L}`, 'arm');
    // a mitten hand, palm to the thigh, and a thumb forward
    add(ellipsoid(hr * 0.36, hr, hr * 0.62, ...S.hand).translate(x + sd * 0.004, wristY - hr * 0.92, 0), skin, `hand${L}`, 'hand');
    if (near) {
      add(ellipsoid(hr * 0.2, hr * 0.42, hr * 0.2, 4, 3).rotateX(0.5).translate(x - sd * hr * 0.12, wristY - hr * 0.5, -hr * 0.45), skin, `hand${L}`, 'thumb');
    }
  }

  // ---- the neck and its collar ----
  const nk = neckFrame(d);
  // (a straight taper: one band carries it; both ends are hidden)
  add(limbGeo(nk.len, d.neckR * 1.08, d.neckR * 0.94, { segs: S.limb, rings: 1, capN: S.cap })
    .rotateX(Math.PI).rotateX(-d.neckLean).translate(0, nk.baseY, nk.baseZ), skin, 'neck', 'neck');
  // a low crew collar in the top's colour (a coat's a little fuller): it sits
  // at the neck's root, follows the neckline down at the front, and never
  // climbs the neck
  const coat = top.kind === 'coat';
  const collarH = (coat ? 0.02 : 0.016) * d.s;
  const collarZ = nk.baseZ - (d.neckY - nk.baseY) * Math.tan(d.neckLean);
  const collar = limbGeo(collarH, d.neckR * (coat ? 1.45 : 1.32), d.neckR * (coat ? 1.34 : 1.2), { segs: S.limb + 2, rings: 1, capN: 1, capTop: 0.2, capBot: 0.2 })
    .rotateX(Math.PI).rotateX(-d.neckLean).translate(0, d.neckY - collarH * 0.7, collarZ);
  add(dipNeckline(collar, d), top.color, 'chest', 'collar');

  // ---- the head, built round its own middle, then set forward on the neck ----
  const headStart = out.length;
  add(headGeo(d, ...S.head), skin, 'head', 'head');
  const f = faceLayout(d);
  if (near) {
    for (const sd of [-1, 1]) {
      add(ellipsoid(d.headXr * 0.14, d.headYr * 0.2, d.headZr * 0.2, 5, 3).translate(sd * d.headXr * 0.98, -d.headYr * 0.08, d.headZr * 0.08),
        darken(skin, 0.95), 'head', 'ear');
    }
  }
  // the face: friendly dark eyes (taller than wide) on their own joints, a
  // catchlight, brows, a nose, a smile and warmer cheeks
  for (const [sd, L] of SIDES) {
    const ex = sd * f.eyeX;
    const ez = onFace(d, ex, f.eyeY, -f.eyeIn);
    add(ellipsoid(f.eyeR, f.eyeH, f.eyeZr, near ? 6 : 4, near ? 4 : 2).translate(ex, f.eyeY, ez), EYE, `eye${L}`, 'eye');
    if (!near) continue;
    add(ellipsoid(f.eyeR * 0.3, f.eyeR * 0.3, f.eyeR * 0.2, 4, 2).translate(ex + f.eyeR * 0.3, f.eyeY + f.eyeR * 0.42, ez - f.eyeR * 0.5),
      CATCHLIGHT, `eye${L}`, 'catchlight');
    // brows: a soft arch, the outer ends a little lower (a kind look)
    const by = f.eyeY + d.headYr * 0.24;
    add(new THREE.CapsuleGeometry(d.headXr * 0.022, d.headXr * 0.2, 1, 4).rotateZ(Math.PI / 2 + sd * 0.12)
      .translate(ex, by, onFace(d, ex, by, -0.002)), darken(look.hair, BROW_DARKEN), 'head', 'brow');
    // a cheek: a thin oval lying on the face below and outside the eye,
    // turned to the face's slope there
    const cx = ex * 1.15;
    const cy = f.eyeY - d.headYr * 0.2;
    const cr = d.headXr * 0.15;
    const thin = cr * 0.18;
    const cz = onFace(d, cx, cy, -thin * 0.5);
    // the face's outward normal there, from the egg's equation: the oval is
    // pitched and turned to it, and shaded as the face is there (with its own
    // rounded normals it caught the light differently and read pale)
    const jt = jawTaper(cy, d.headYr);
    const n = new THREE.Vector3(cx / (d.headXr * jt.x) ** 2, cy / d.headYr ** 2, cz / (d.headZr * jt.z) ** 2).normalize();
    const cheek = ellipsoid(cr, d.headXr * 0.1, thin, 8, 3).rotateX(Math.asin(n.y)).rotateY(Math.atan2(-n.x, -n.z)).translate(cx, cy, cz);
    const cn = cheek.getAttribute('normal');
    for (let i = 0; i < cn.count; i++) cn.setXYZ(i, n.x, n.y, n.z);
    add(cheek, warm(skin), 'head', 'cheek');
  }
  if (near) {
    add(ellipsoid(d.headXr * 0.11, d.headYr * 0.12, d.headZr * 0.13, 6, 5).translate(0, f.noseY, onFace(d, 0, f.noseY, -d.headZr * 0.04)),
      darken(skin, 0.93), 'head', 'nose');
    // the smile: a closed arc, its middle at the bottom, the corners up, its
    // line wrapped onto the face's curve so the corners never sink into it
    const smile = new THREE.TorusGeometry(f.smileR, f.smileTube, 3, 10, f.smileArc)
      .rotateZ(1.5 * Math.PI - f.smileArc / 2)
      .translate(0, f.mouthY + f.smileLift, onFace(d, 0, f.mouthY, -f.smileIn));
    const mp = smile.getAttribute('position');
    const z0 = onFace(d, 0, f.mouthY);
    for (let i = 0; i < mp.count; i++) mp.setZ(i, mp.getZ(i) + onFace(d, mp.getX(i), mp.getY(i)) - z0);
    smile.computeVertexNormals();
    add(smile, LIP, 'mouth', 'mouth');
    if (look.glasses) {
      for (const [sd] of SIDES) {
        add(new THREE.TorusGeometry(f.eyeR * 2.0, d.headXr * 0.022, 3, 12).translate(sd * f.eyeX, f.eyeY, onFace(d, sd * f.eyeX, f.eyeY, 0.012)),
          GLASSES, 'head', 'glasses');
      }
      add(new THREE.CapsuleGeometry(d.headXr * 0.02, f.eyeX * 2 - f.eyeR * 4.2, 1, 3).rotateZ(Math.PI / 2)
        .translate(0, f.eyeY + f.eyeR * 0.6, onFace(d, 0, f.eyeY, 0.012)), GLASSES, 'head', 'glasses');
    }
  }

  // ---- hair ----
  const style = HAIR_STYLES[look.hairStyle] ?? HAIR_STYLES.short;
  const hatOn = !!look.hat;
  if (!(hatOn && look.hairStyle === 'bald')) {
    add(hairShell(d, hatOn ? { ...style, top: 0.3 * Math.PI } : style, ...S.hair), look.hair, 'head', 'hair');
  }
  // the extras (a ponytail, a bun, pigtails, long hair down the back) are
  // near only: far away the shell carries the colour (long hair is 8 x 6, not
  // v2's 12 x 8, to keep the near build under 2,800 triangles)
  if (near) {
    if (look.hairStyle === 'ponytail' && !hatOn) {
      add(ellipsoid(d.headXr * 0.28, d.headYr * 0.62, d.headZr * 0.3, ...S.hand).rotateX(-0.5).translate(0, -d.headYr * 0.25, d.headZr * 1.12), look.hair, 'head', 'hair');
    } else if (look.hairStyle === 'bun' && !hatOn) {
      add(ellipsoid(d.headXr * 0.38, d.headXr * 0.36, d.headXr * 0.38, ...S.hand).translate(0, d.headYr * 0.5, d.headZr * 0.8), look.hair, 'head', 'hair');
    } else if (look.hairStyle === 'pigtails') {
      for (const sd of [-1, 1]) {
        add(ellipsoid(d.headXr * 0.26, d.headYr * 0.42, d.headXr * 0.26, ...S.hand).rotateZ(sd * 0.4).translate(sd * d.headXr * 1.08, -d.headYr * 0.32, d.headZr * 0.25), look.hair, 'head', 'hair');
      }
    } else if (look.hairStyle === 'long') {
      add(ellipsoid(d.headXr * 0.95, d.headYr * 0.95, d.headZr * 0.36, 8, 6).translate(0, -d.headYr * 0.75, d.headZr * 0.62), look.hair, 'head', 'hair');
    }
  }

  // ---- hats ----
  if (hatOn) {
    const hc = look.hat.color;
    if (look.hat.kind === 'bobble') {
      add(hairShell(d, { front: 0.3 * Math.PI, side: 0.42 * Math.PI, back: 0.5 * Math.PI, thick: 1.13 }, ...S.hair), hc, 'head', 'hat');
      add(ellipsoid(d.headXr * 0.3, d.headXr * 0.3, d.headXr * 0.3, ...S.hand).translate(0, d.headYr * 1.16, 0), BOBBLE, 'head', 'hat');
    } else if (look.hat.kind === 'cap') {
      add(hairShell(d, { front: 0.27 * Math.PI, side: 0.34 * Math.PI, back: 0.42 * Math.PI, thick: 1.12 }, ...S.hair), hc, 'head', 'hat');
      add(ellipsoid(d.headXr * 0.85, d.headYr * 0.05, d.headZr * 0.5, ...S.foot).translate(0, d.headYr * 0.5, -d.headZr * 0.82), darken(hc, 0.9), 'head', 'hat');
    } else if (look.hat.kind === 'sunhat') {
      add(hairShell(d, { front: 0.3 * Math.PI, side: 0.36 * Math.PI, back: 0.4 * Math.PI, thick: 1.14 }, ...S.hair), hc, 'head', 'hat');
      add(new THREE.CylinderGeometry(d.headXr * 2.2, d.headXr * 2.255, d.headYr * 0.05, near ? S.torso + 4 : S.torso).translate(0, d.headYr * 0.48, 0), hc, 'head', 'hat');
    }
  }

  // everything on the head was built round its own middle: set it on the neck
  for (let i = headStart; i < out.length; i++) out[i].geo.translate(0, nk.headCY, nk.headCZ);
  return out;
}
