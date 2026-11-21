// The look and the body of a person, from the spot they stand on: age, sex,
// height, build, clothes and hair are a hash of the spawn position to the
// centimetre and a salt, never a roll, so two co-walkers see the same person.
// No Math.random, no three.js. Faces -z, metres.

// The integer hash the old figure dressed from; critters.js keeps a copy
// (spotHash: start-up code never imports src/people) for a pair's side.
export function spotHash(x, z, salt) {
  let h = Math.imul(Math.round(x * 100) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(z * 100) | 0, 0x165667b1) ^ Math.imul(salt + 1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// What a spot holds: salt 20 decides child / older / adult.
export function spotKind(def = {}) {
  const x = Number.isFinite(def.x) ? def.x : 0;
  const z = Number.isFinite(def.z) ? def.z : 0;
  const r = spotHash(x, z, 20);
  return r < 0.18 ? 'child' : r < 0.36 ? 'older' : 'adult';
}

// Children never stand alone: a child spot holds a grown-up and the child,
// both from the same spot, so they share a hair colour. The child's seed (the
// idle's phase, the blinks, the glance's side) comes from another salt, so
// the two never blink and glance in step.
const CHILD_SEED_SALT = 15;
export function pairFor(def = {}) {
  // an explicit kind wins: 'child' always pairs, 'adult'/'older' never do
  const child = def.kind === undefined ? spotKind(def) === 'child' : def.kind === 'child';
  if (!child) return null;
  const kid = personFor({ ...def, kind: 'child' });
  const x = Number.isFinite(def.x) ? def.x : 0;
  const z = Number.isFinite(def.z) ? def.z : 0;
  kid.seed = spotHash(x, z, 20 + CHILD_SEED_SALT);
  return { adult: personFor({ ...def, kind: 'adult' }), child: kid };
}

// ---- palettes ---------------------------------------------------------------
const SKINS = [0xefcfb4, 0xe6bf9e, 0xcf9d74, 0xa8734c, 0x7a5236];
const HAIR = Object.freeze({ dark: 0x3e2a1c, black: 0x221d1b, brown: 0x6b4529, auburn: 0x8e4a25, blond: 0xcfa86a, grey: 0x9e9a94, white: 0xe2ded6 });
const YOUNG_HAIR = ['dark', 'black', 'brown', 'auburn', 'blond'];
const TOPS = [0x5d7fb8, 0xc8604a, 0x5e9a6a, 0xd8a640, 0x8a6ab0, 0xe4e0d6, 0x3e5a7a, 0xd27a96, 0x7a8a4a];
const KID_TOPS = [0xe2433a, 0xf7c93b, 0x4eb86a, 0x4a9ad0, 0xe070b0, 0xff8a3a];
const BOTTOMS = [0x3e4a66, 0x4a4a52, 0x7a6a50, 0x2e2e36, 0x5a6a48];
const SKIRTS = [0x3e4a66, 0x8a3a4a, 0x4a6a8a, 0x6a5a8a, 0x2e2e36];
const SHOES = [0x3a3330, 0x5a3a28, 0xe8e4dc, 0x2a2a30];
const KID_SHOES = [0xd8503a, 0x4a9ad0, 0xe8e4dc, 0xf0a020];
const HATS = [0xd8503a, 0xe8b83a, 0x4a9ad0, 0x5ab06a, 0xd070a0];

const pickOf = (list, u) => list[Math.floor(u * list.length) % list.length];

// personFor(def) -> the person's look and body, from the spawn's spot. `def`
// may override any field (the picture sheet shows each kind on purpose).
export function personFor(def = {}) {
  const x = Number.isFinite(def.x) ? def.x : 0;
  const z = Number.isFinite(def.z) ? def.z : 0;
  const u = (salt) => spotHash(x, z, 20 + salt);
  const kind = def.kind ?? spotKind({ x, z });
  const sex = def.sex ?? (u(1) < 0.5 ? 'm' : 'f');
  const h = u(2);
  const height = def.height ?? (
    kind === 'child' ? 1.16 + 0.26 * h
      : kind === 'older' ? (sex === 'm' ? 1.66 : 1.55) + 0.12 * h
        : (sex === 'm' ? 1.72 : 1.60) + 0.13 * h);
  const girth = def.girth ?? (0.94 + 0.14 * u(3));
  const skin = def.skin ?? pickOf(SKINS, u(4));
  let hairStyle, hairColor, top, bottom, hat = null, glasses = false;
  if (kind === 'child') {
    hairStyle = sex === 'm' ? 'short' : pickOf(['pigtails', 'ponytail', 'bob'], u(5));
    hairColor = pickOf(YOUNG_HAIR, u(6));
    top = { kind: pickOf(['tshirt', 'jumper', 'coat'], u(7)), color: pickOf(KID_TOPS, u(8)) };
    bottom = sex === 'f' && u(9) < 0.5 ? { kind: 'skirt', color: pickOf(SKIRTS, u(10)) } : { kind: u(9) < 0.75 ? 'shorts' : 'trousers', color: pickOf(BOTTOMS, u(10)) };
    if (u(11) < 0.3) hat = { kind: 'bobble', color: pickOf(HATS, u(12)) };
  } else if (kind === 'older') {
    hairStyle = sex === 'm' ? pickOf(['short', 'bald'], u(5)) : pickOf(['bun', 'bob'], u(5));
    hairColor = u(6) < 0.5 ? 'grey' : 'white';
    top = { kind: pickOf(['coat', 'jumper'], u(7)), color: pickOf(TOPS, u(8)) };
    bottom = sex === 'f' && u(9) < 0.6 ? { kind: 'skirt', color: pickOf(SKIRTS, u(10)) } : { kind: 'trousers', color: pickOf(BOTTOMS, u(10)) };
    glasses = u(11) < 0.6;
    if (sex === 'm' && u(12) < 0.35) hat = { kind: 'cap', color: 0x8a7a5a };
  } else {
    hairStyle = sex === 'm' ? pickOf(['short', 'short', 'crop'], u(5)) : pickOf(['bob', 'ponytail', 'long', 'bun'], u(5));
    hairColor = pickOf(YOUNG_HAIR, u(6));
    top = { kind: pickOf(sex === 'f' ? ['tshirt', 'jumper', 'coat', 'dress'] : ['tshirt', 'jumper', 'coat'], u(7)), color: pickOf(TOPS, u(8)) };
    bottom = top.kind === 'dress' ? { kind: 'skirt', color: top.color }
      : sex === 'f' && u(9) < 0.3 ? { kind: 'skirt', color: pickOf(SKIRTS, u(10)) }
        : { kind: 'trousers', color: pickOf(BOTTOMS, u(10)) };
    if (u(11) < 0.15) hat = { kind: sex === 'm' ? 'cap' : 'sunhat', color: sex === 'm' ? 0x8a7a5a : 0xe8d8a8 };
    else if (u(11) < 0.25) hat = { kind: 'bobble', color: pickOf(HATS, u(12)) };
  }
  const shoes = kind === 'child' ? pickOf(KID_SHOES, u(13)) : pickOf(SHOES, u(13));
  const look = {
    kind, sex, height, girth, skin,
    hairStyle: def.hairStyle ?? hairStyle,
    hair: HAIR[def.hairColor ?? hairColor] ?? def.hairColor ?? HAIR.dark,
    top: { ...top, ...(def.top ?? {}) },
    bottom: { ...bottom, ...(def.bottom ?? {}) },
    shoes: def.shoes ?? shoes,
    hat: def.hat === undefined ? hat : def.hat,
    glasses: def.glasses ?? glasses,
    seed: u(14), // the idle's own phase (never a roll; a pair's child: salt 20 + 15, see pairFor)
  };
  look.dims = bodyDims(look);
  return look;
}

// The body's joints and widths, in metres, from height, kind, sex and girth.
export function bodyDims(look) {
  const H = look.height;
  const child = look.kind === 'child';
  const f = look.sex === 'f';
  const g = look.girth;
  // Fractions of height, from adult and child body measurements: the shoulder
  // joint (acromion) about 0.818, the neck's root at the trapezius about
  // 0.845, the chin 0.872 (a head of about 1/7.8 of the height, 23 cm on a
  // 1.80 m man). A child of about eight: a head of about 1/6.2, a shorter neck.
  // v2 (the owner, 2026-11-20: "The humans need necks"): the neck root and the
  // chin moved apart, the shoulders slope up to the neck.
  const P = child
    ? { knee: 0.272, hip: 0.50, waist: 0.60, shoulder: 0.785, neck: 0.808, chin: 0.846 }
    : { knee: 0.285, hip: 0.525, waist: 0.615, shoulder: 0.818, neck: f ? 0.842 : 0.845, chin: 0.872 };
  const s = H / 1.75;
  const limb = s * g * (f ? 0.93 : 1) * (child ? 0.95 : 1);
  const headH = H * (1 - P.chin);
  return {
    H, s,
    ankleY: 0.045 * H,
    kneeY: P.knee * H,
    hipY: P.hip * H,
    waistY: P.waist * H,
    shoulderY: P.shoulder * H,
    neckY: P.neck * H,
    chinY: P.chin * H,
    headH,
    // the head: a rounded egg, the jaw a little narrower
    // a real head is about 0.67 as wide as it is tall and 0.85 as deep; a
    // touch wider here (hair is added on top) reads friendlier, not small
    headXr: headH * (child ? 0.385 : 0.355),
    headYr: headH * 0.5,
    headZr: headH * (child ? 0.445 : 0.425),
    neckLean: 0.23, // rad: the neck leans forward from its root (a slight forward set)
    shoulderX: H * (child ? 0.098 : f ? 0.099 : 0.108) * Math.sqrt(g),
    hipX: H * (f ? 0.056 : 0.052) * Math.sqrt(g),
    waistR: H * (f ? 0.074 : 0.083) * g,
    hipR: H * (f ? 0.104 : 0.094) * g,
    chestR: H * (f ? 0.096 : 0.106) * g,
    torsoZ: f ? 0.62 : 0.58,
    upperArm: H * (child ? 0.178 : 0.186),
    forearm: H * (child ? 0.14 : 0.146),
    hand: H * (child ? 0.098 : 0.104),
    footLen: H * 0.148,
    // limb radii (top, bottom)
    // real girths (a thigh about 55 cm round, a calf 37, an upper arm 30)
    // with a little for clothes: thinner read as spindly next to the cats
    uaR: [0.055 * limb, 0.045 * limb],
    faR: [0.046 * limb, 0.031 * limb],
    thR: [0.094 * limb * (f ? 1.04 : 1), 0.06 * limb],
    shR: [0.062 * limb, 0.035 * limb],
    // a neck about 38 cm round on a man, 32 on a woman, 26 on a child of eight
    neckR: (child ? 0.056 : f ? 0.05 : 0.059) * s * Math.sqrt(g),
    stoop: look.kind === 'older' ? 1 : 0,
    child, // the face's layout (a child's eyes sit lower) reads it
  };
}
