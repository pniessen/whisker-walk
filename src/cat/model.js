import * as THREE from 'three';
import { litMaterial } from '../render/materials.js';

const STYLE = {
  tabby:     { base: 0x9c7a4f, belly: 0xd8c39a, accent: 0x6f5636, scale: 1.0, stripes: true },
  siamese:   { base: 0xe8dcc8, belly: 0xf2ead9, accent: 0x4a3b32, scale: 0.95, points: true },
  persian:   { base: 0xcfcfd4, belly: 0xe8e8ec, accent: 0xb5b5bc, scale: 1.05, fluffy: true },
  black:     { base: 0x2a2a30, belly: 0x3a3a42, accent: 0x1c1c22, scale: 1.0 },
  calico:    { base: 0xf0ead8, belly: 0xf8f4e8, accent: 0xd88030, scale: 1.0, patches: true },
  mainecoon: { base: 0x7a5b3a, belly: 0xb99a72, accent: 0x5a4028, scale: 1.3, fluffy: true, tufts: true },
  // the family pets
  zeetoo:    { base: 0xa8825a, belly: 0xe0ccA0, accent: 0x74582f, scale: 1.0, stripes: true },
  rosa:      { base: 0x24242c, belly: 0xf5f5f5, accent: 0x1a1a20, scale: 0.95 },            // tuxedo: white bib/paws fall out of belly color
  robbie:    { base: 0xf2f2f2, belly: 0xfafafa, accent: 0x1a1a1e, scale: 1.05, cow: true }, // cow cat: big black patches
};
const INNER_EAR = 0xe8a0a8;
const EYE_COLORS = { siamese: 0x68a8d8, black: 0xd8b830, rosa: 0xd8b830, zeetoo: 0x4e9440 };

// Cat Couture: palette for the twelve new per-slot accessory items (plus the
// four re-homed ones, which keep their original colors inline below).
const HAT_BLACK = 0x1c1c22;        // tophat
const BEANIE_COLOR = 0xd6602f;     // cozy rust knit
const GLASSES_FRAME = 0xd4a24c;    // thin warm frame
const SUNGLASSES_DARK = 0x26262e;  // dark lens
const NECKTIE_COLOR = 0x7a2436;    // maroon
const BOWTIE_COLOR = 0x2c3e6b;     // navy
const SCARF_COLOR = 0xd6602f;      // cozy rust knit, matches beanie
const HOODIE_COLOR = 0x6a4c93;     // purple hoodie
const CAPE_COLOR = 0xd8303c;       // superhero red
const CAPE_ACCENT = 0xf2c14e;      // gold clasp
const WING_COLORS = [0xf29a8a, 0x9fc9a0]; // coral / sage, mirrored
const SNEAKER_WHITE = 0xf2f2f2;
const SNEAKER_ACCENT = 0xd8303c;
const RAINBOOT_COLOR = 0x3a6ea5;

const mat = (color) => litMaterial(color);

function ball(r, color, sx = 1, sy = 1, sz = 1, wSeg = 10, hSeg = 8) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, wSeg, hSeg), mat(color));
  m.scale.set(sx, sy, sz);
  return m;
}

// Hagrid the chicken honors the cat parts contract so the animator, camera,
// and every interaction work unchanged: legs[0]/legs[1] are the real legs
// (the 4-beat gait's front pair is exactly a bipedal alternating step),
// legs[2]/legs[3] are hidden dummies, and the comb stands in for the ears.
function buildChicken(accessories = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null }) {
  const g = new THREE.Group();
  const FEATHER = 0xb06a30;
  const CREAM = 0xe8d0a8;
  const COMB = 0xd83a3a;

  const body = ball(0.34, FEATHER, 0.9, 0.85, 1.1);
  body.position.y = 0.42;
  g.add(body);
  const belly = ball(0.28, CREAM, 0.8, 0.65, 0.95);
  belly.position.set(0, 0.32, -0.04);
  g.add(belly);
  for (const side of [-1, 1]) {
    const wing = ball(0.16, 0x9a5826, 0.35, 0.7, 1.0, 8, 6);
    wing.position.set(side * 0.28, 0.46, 0.02);
    g.add(wing);
  }

  const head = new THREE.Group();
  const skull = ball(0.13, FEATHER, 1, 1.05, 1);
  head.add(skull);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 6), mat(0xf2a04e));
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, -0.01, -0.17);
  head.add(beak);
  const wattle = ball(0.035, COMB, 0.8, 1.2, 0.8, 6, 5);
  wattle.position.set(0, -0.1, -0.12);
  head.add(wattle);
  let earL = null;
  let earR = null;
  for (let i = 0; i < 3; i++) {
    const combBit = ball(0.035, COMB, 0.6, 1.1, 0.8, 6, 5);
    combBit.position.set(0, 0.13 + (i === 1 ? 0.02 : 0), -0.06 + i * 0.06);
    head.add(combBit);
    if (i === 0) earL = combBit;
    if (i === 2) earR = combBit;
  }
  for (const side of [-1, 1]) {
    const eye = ball(0.022, 0x1a1a1e, 1, 1, 1, 6, 5);
    eye.position.set(side * 0.09, 0.03, -0.1);
    head.add(eye);
  }
  head.position.set(0, 0.78, -0.28);
  g.add(head);

  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.3, 6), mat(0xf2a04e));
    shank.position.y = -0.15;
    leg.add(shank);
    const foot = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.05, 4), mat(0xf2a04e));
    foot.rotation.y = Math.PI / 4;
    foot.position.set(0, -0.3, -0.04);
    leg.add(foot);
    leg.userData.paw = foot;
    leg.position.set(side * 0.1, 0.3, 0.02);
    g.add(leg);
    legs.push(leg);
  }
  for (let i = 0; i < 2; i++) legs.push(new THREE.Group()); // hidden gait dummies

  // tail: feather fan on the standard pivot chain (3 live pivots + 2 dummies)
  const tail = new THREE.Group();
  const tailPivots = [];
  let parent = tail;
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group();
    pivot.position.z = i === 0 ? 0 : 0.05;
    const feather = ball(0.12, i === 1 ? 0x9a5826 : FEATHER, 0.25, 1.15, 0.7, 6, 5);
    feather.position.set((i - 1) * 0.09, 0.1, 0.06);
    feather.rotation.x = 0.5;
    pivot.add(feather);
    parent.add(pivot);
    tailPivots.push(pivot);
    parent = pivot;
  }
  for (let i = 0; i < 2; i++) tailPivots.push(new THREE.Group()); // pivot-count dummies
  tail.position.set(0, 0.52, 0.34);
  tail.rotation.x = -0.6;
  g.add(tail);

  // accessories fit a chicken just fine (a chicken in a bell collar, especially) —
  // but only head/face/neck items: a chicken has no torso, shoulders, or paws
  // worth dressing, so body/back/feet items are skipped outright below rather
  // than crammed onto a bird frame.
  if (accessories.collar) {
    const collarColor = accessories.collar === 'glow' ? 0x7ef2c0 : 0xd84040;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.024, 6, 12), mat(collarColor));
    ring.rotation.x = Math.PI / 2 + 0.3;
    ring.position.set(0, -0.13, 0.06);
    head.add(ring);
    if (accessories.collar === 'bell') {
      const bell = ball(0.034, 0xf2c14e, 1, 1, 1, 8, 6);
      bell.position.set(0, -0.18, 0);
      head.add(bell);
    }
  }

  // head: hats sit between the comb and the beak, scaled down for a chicken skull
  if (accessories.head === 'crown') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const petal = ball(0.024, [0xf2a0c0, 0xf2e04e, 0xffffff][i % 3], 1, 1, 1, 5, 4);
      petal.position.set(Math.cos(a) * 0.09, 0.2, Math.sin(a) * 0.06);
      head.add(petal);
    }
  } else if (accessories.head === 'tophat') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.015, 10), mat(HAT_BLACK));
    brim.position.set(0, 0.19, 0);
    head.add(brim);
    const crownPart = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.1, 10), mat(HAT_BLACK));
    crownPart.position.set(0, 0.24, 0);
    head.add(crownPart);
  } else if (accessories.head === 'beanie') {
    const cap = ball(0.11, BEANIE_COLOR, 1, 0.65, 1, 8, 6);
    cap.position.set(0, 0.2, 0);
    head.add(cap);
    const pompom = ball(0.026, 0xf5f5f5, 1, 1, 1, 6, 5);
    pompom.position.set(0, 0.28, 0);
    head.add(pompom);
  }

  // face: two small frames at eye level plus a bridge
  if (accessories.face === 'glasses' || accessories.face === 'sunglasses') {
    const dark = accessories.face === 'sunglasses';
    const frameColor = dark ? SUNGLASSES_DARK : GLASSES_FRAME;
    for (const side of [-1, 1]) {
      const lens = dark
        ? ball(0.024, frameColor, 1, 1, 0.4, 8, 6)
        : new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 10), mat(frameColor));
      lens.position.set(side * 0.09, 0.03, -0.1);
      head.add(lens);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.005, 0.005), mat(frameColor));
    bridge.position.set(0, 0.03, -0.1);
    head.add(bridge);
  }

  // neck: at the neck seam, just below the wattle — a chicken in a bowtie is the joke
  if (accessories.neck === 'bandana') {
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.15, 3), mat(0x3a6ea5));
    tri.rotation.x = Math.PI;
    tri.position.set(0, -0.16, 0.02);
    head.add(tri);
  } else if (accessories.neck === 'necktie') {
    const knot = ball(0.022, NECKTIE_COLOR, 1, 0.8, 0.8, 6, 5);
    knot.position.set(0, -0.14, 0.03);
    head.add(knot);
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 4), mat(NECKTIE_COLOR));
    blade.rotation.x = Math.PI;
    blade.position.set(0, -0.24, 0.05);
    head.add(blade);
  } else if (accessories.neck === 'bowtie') {
    const knot = ball(0.02, BOWTIE_COLOR, 1, 1, 1, 6, 5);
    knot.position.set(0, -0.14, 0.03);
    head.add(knot);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.04, 3), mat(BOWTIE_COLOR));
      wing.rotation.z = -side * (Math.PI / 2);
      wing.position.set(side * 0.04, -0.14, 0.035);
      head.add(wing);
    }
  } else if (accessories.neck === 'scarf') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.024, 6, 12), mat(SCARF_COLOR));
    band.rotation.x = Math.PI / 2 + 0.3;
    band.position.set(0, -0.12, 0.04);
    head.add(band);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.1, 0.015), mat(SCARF_COLOR));
    tail.position.set(0.04, -0.2, 0.06);
    tail.rotation.z = 0.15;
    head.add(tail);
  }

  // body/back/feet: no torso, shoulders, or paw-shells worth dressing on a
  // bird frame — hoodie/cape, wings/backpack, and sneakers/rainboots/booties
  // are all skipped here rather than rendered floating or mis-anchored.

  g.userData.breed = 'hagrid';
  g.userData.parts = { body, head, tail, tailPivots, legs, earL, earR, whiskers: [] };
  g.userData.base = { bodyY: 0.42, bodyScale: [0.9, 0.85, 1.1], headPos: [0, 0.78, -0.28], tailRotX: -0.6 };
  return g;
}

export function buildCat(breed, accessories = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null }, opts = {}) {
  if (breed === 'hagrid') return buildChicken(accessories);
  const s = STYLE[breed];
  const g = new THREE.Group();
  const pointColor = s.points ? s.accent : s.base;

  // body: plush ellipsoid + belly + chest
  const body = ball(0.32, s.base, 0.85, 0.75, 1.35);
  body.position.y = 0.34;
  g.add(body);
  const belly = ball(0.26, s.belly, 0.78, 0.6, 1.15);
  belly.position.set(0, 0.26, -0.02);
  g.add(belly);

  // head
  const head = new THREE.Group();
  const skull = ball(0.21, pointColor, 1, 0.92, 0.95);
  head.add(skull);
  const muzzle = ball(0.09, s.belly, 1.25, 0.75, 0.9);
  muzzle.position.set(0, -0.06, -0.16);
  head.add(muzzle);
  const nose = ball(0.024, INNER_EAR, 1, 0.8, 0.8, 6, 5);
  nose.position.set(0, -0.02, -0.245);
  head.add(nose);
  for (const side of [-1, 1]) {
    if (!opts.simple) {
      const cheek = ball(0.065, s.belly, 1, 0.9, 0.8, 8, 6);
      cheek.position.set(side * 0.085, -0.07, -0.14);
      head.add(cheek);
    }
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.075, s.tufts ? 0.19 : 0.15, 4), mat(pointColor));
    ear.position.set(side * 0.12, 0.18, 0.01);
    ear.rotation.z = -side * 0.22;
    head.add(ear);
    if (!opts.simple) {
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.09, 4), mat(INNER_EAR));
      inner.position.set(side * 0.115, 0.16, -0.015);
      inner.rotation.z = -side * 0.22;
      head.add(inner);
    }
    if (side === -1) head.userData.earL = ear;
    else head.userData.earR = ear;

    const eye = ball(0.036, EYE_COLORS[breed] ?? 0x4e9440, 1, 1.15, 0.7, 8, 6);
    eye.position.set(side * 0.083, 0.03, -0.165);
    head.add(eye);
    const pupil = ball(0.017, 0x1a1a1e, 0.7, 1.2, 0.6, 6, 5);
    pupil.position.set(side * 0.083, 0.03, -0.19);
    head.add(pupil);
    if (!opts.simple) {
      const shine = ball(0.007, 0xffffff, 1, 1, 1, 4, 3);
      shine.position.set(side * 0.07, 0.05, -0.195);
      head.add(shine);
    }
  }
  // whiskers
  const whiskers = [];
  if (!opts.simple) {
    const whiskerMat = new THREE.LineBasicMaterial({ color: 0xf8f8f8, transparent: true, opacity: 0.65 });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const y = -0.05 - i * 0.018;
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(side * 0.07, y, -0.19),
          new THREE.Vector3(side * 0.28, y + (i - 1) * 0.035, -0.14),
        ]);
        const w = new THREE.Line(geo, whiskerMat);
        head.add(w);
        whiskers.push(w);
      }
    }
  }
  head.position.set(0, 0.56, -0.44);
  g.add(head);

  if (s.fluffy) {
    const ruff = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.075, 6, 12), mat(s.belly));
    ruff.rotation.x = Math.PI / 2 - 0.35;
    ruff.position.set(0, 0.46, -0.32);
    g.add(ruff);
  }

  // legs: hip-pivoted groups with paw spheres
  const legs = [];
  const legSpots = [
    [-0.11, -0.3], [0.11, -0.3], // front L, R
    [-0.11, 0.28], [0.11, 0.28], // back L, R
  ];
  for (const [x, z] of legSpots) {
    const leg = new THREE.Group();
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.26, 6), mat(pointColor));
    limb.position.y = -0.13;
    leg.add(limb);
    const paw = ball(0.062, s.points ? s.accent : s.belly, 1, 0.8, 1.1, 8, 6);
    paw.position.y = -0.27;
    leg.add(paw);
    leg.userData.paw = paw;
    leg.position.set(x, 0.3, z);
    g.add(leg);
    legs.push(leg);
  }

  // tail: 5 tapered segments on nested pivots
  const tail = new THREE.Group();
  const tailPivots = [];
  let parent = tail;
  for (let i = 0; i < 5; i++) {
    const pivot = new THREE.Group();
    pivot.position.z = i === 0 ? 0 : 0.13;
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042 - i * 0.006, 0.048 - i * 0.006, 0.14, 6),
      mat(i >= 3 && (s.stripes || s.points) ? s.accent : s.base)
    );
    seg.rotation.x = Math.PI / 2;
    seg.position.z = 0.065;
    pivot.add(seg);
    parent.add(pivot);
    tailPivots.push(pivot);
    parent = pivot;
  }
  tail.position.set(0, 0.44, 0.42);
  tail.rotation.x = -0.6;
  g.add(tail);

  // breed markings
  if (s.stripes) {
    for (let i = 0; i < 3; i++) {
      const stripe = ball(0.16, s.accent, 1.4, 0.16, 0.32, 8, 6);
      stripe.position.set(0, 0.55, -0.2 + i * 0.2);
      g.add(stripe);
    }
  }
  if (s.patches) {
    const p1 = ball(0.14, s.accent, 1.1, 0.35, 1.1, 8, 6);
    p1.position.set(0.12, 0.54, -0.08);
    g.add(p1);
    const p2 = ball(0.12, 0x333333, 1.1, 0.35, 1.0, 8, 6);
    p2.position.set(-0.12, 0.54, 0.14);
    g.add(p2);
    const p3 = ball(0.07, 0xd88030, 1, 0.8, 1, 6, 5);
    p3.position.set(0.09, 0.14, -0.05);
    head.add(p3);
  }
  if (s.cow) {
    const c1 = ball(0.18, s.accent, 1.2, 0.4, 1.1, 8, 6);
    c1.position.set(0.1, 0.5, 0.12);
    g.add(c1);
    const c2 = ball(0.15, s.accent, 1.1, 0.42, 1.0, 8, 6);
    c2.position.set(-0.12, 0.5, -0.18);
    g.add(c2);
    const headPatch = ball(0.09, s.accent, 1, 0.9, 0.9, 8, 6);
    headPatch.position.set(-0.09, 0.1, 0.02); // splash over one ear
    head.add(headPatch);
  }

  // accessories — head/g-parented so they track poses; every item here is
  // added BEFORE the final g.scale.setScalar(s.scale) below, so all of its
  // dimensions and offsets are automatically scaled with the breed (same
  // idiom the body/head/legs already rely on) — a Persian (1.05x) and a
  // Maine Coon (1.3x) both get a proportionally-sized outfit for free.
  if (accessories.collar) {
    const collarColor = accessories.collar === 'glow' ? 0x7ef2c0 : 0xd84040;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.028, 6, 12), mat(collarColor));
    ring.rotation.x = Math.PI / 2 + 0.35;
    ring.position.set(0, -0.14, 0.1);
    head.add(ring);
    if (accessories.collar === 'bell') {
      const bell = ball(0.038, 0xf2c14e, 1, 1, 1, 8, 6);
      bell.position.set(0, -0.2, -0.02);
      head.add(bell);
    }
  }

  // head: above the skull, hats sit between the ears
  if (accessories.head === 'crown') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const petal = ball(0.026, [0xf2a0c0, 0xf2e04e, 0xffffff][i % 3], 1, 1, 1, 5, 4);
      petal.position.set(Math.cos(a) * 0.11, 0.24, Math.sin(a) * 0.07);
      head.add(petal);
    }
  } else if (accessories.head === 'tophat') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 10), mat(HAT_BLACK));
    brim.position.set(0, 0.23, 0);
    head.add(brim);
    const crownPart = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.14, 10), mat(HAT_BLACK));
    crownPart.position.set(0, 0.3, 0);
    head.add(crownPart);
  } else if (accessories.head === 'beanie') {
    const cap = ball(0.14, BEANIE_COLOR, 1, 0.65, 1, 8, 6);
    cap.position.set(0, 0.25, 0);
    head.add(cap);
    const pompom = ball(0.032, 0xf5f5f5, 1, 1, 1, 6, 5);
    pompom.position.set(0, 0.35, 0);
    head.add(pompom);
  }

  // face: eye level — two small frames plus a bridge
  if (accessories.face === 'glasses' || accessories.face === 'sunglasses') {
    const dark = accessories.face === 'sunglasses';
    const frameColor = dark ? SUNGLASSES_DARK : GLASSES_FRAME;
    for (const side of [-1, 1]) {
      const lens = dark
        ? ball(0.032, frameColor, 1, 1, 0.4, 8, 6)
        : new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 6, 10), mat(frameColor));
      lens.position.set(side * 0.083, 0.03, -0.17);
      head.add(lens);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.006), mat(frameColor));
    bridge.position.set(0, 0.03, -0.17);
    head.add(bridge);
  }

  // neck: at the neck seam, where the collar also sits
  if (accessories.neck === 'bandana') {
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.17, 3), mat(0x3a6ea5));
    tri.rotation.x = Math.PI;
    tri.position.set(0, -0.18, 0.02);
    head.add(tri);
  } else if (accessories.neck === 'necktie') {
    const knot = ball(0.028, NECKTIE_COLOR, 1, 0.8, 0.8, 6, 5);
    knot.position.set(0, -0.17, 0.04);
    head.add(knot);
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 4), mat(NECKTIE_COLOR));
    blade.rotation.x = Math.PI;
    blade.position.set(0, -0.32, 0.08);
    head.add(blade);
  } else if (accessories.neck === 'bowtie') {
    const knot = ball(0.026, BOWTIE_COLOR, 1, 1, 1, 6, 5);
    knot.position.set(0, -0.17, 0.04);
    head.add(knot);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.05, 3), mat(BOWTIE_COLOR));
      wing.rotation.z = -side * (Math.PI / 2);
      wing.position.set(side * 0.05, -0.17, 0.045);
      head.add(wing);
    }
  } else if (accessories.neck === 'scarf') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.035, 6, 12), mat(SCARF_COLOR));
    band.rotation.x = Math.PI / 2 + 0.35;
    band.position.set(0, -0.15, 0.08);
    head.add(band);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.02), mat(SCARF_COLOR));
    tail.position.set(0.06, -0.28, 0.1);
    tail.rotation.z = 0.15;
    head.add(tail);
  }

  // body: over the torso — hoodie is a shell plus a hood, cape drapes behind/down
  if (accessories.body === 'hoodie') {
    const shell = ball(0.33, HOODIE_COLOR, 0.88, 0.78, 1.32, 10, 8);
    shell.position.set(0, 0.35, 0.02);
    g.add(shell);
    // hood-up/hood-down rule: a hat needs the head clear, so the hood only
    // goes up when no head item is equipped — otherwise it bunches at the neck.
    if (!accessories.head) {
      const hood = ball(0.17, HOODIE_COLOR, 1, 1, 0.9, 8, 6);
      hood.position.set(0, 0.64, -0.28);
      g.add(hood);
    } else {
      const bunch = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 6, 10), mat(HOODIE_COLOR));
      bunch.rotation.x = Math.PI / 2 + 0.3;
      bunch.position.set(0, 0.5, -0.36);
      g.add(bunch);
    }
  } else if (accessories.body === 'cape') {
    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.04), mat(CAPE_COLOR));
    cape.position.set(0, 0.28, 0.45);
    cape.rotation.x = -0.15;
    g.add(cape);
    const clasp = ball(0.032, CAPE_ACCENT, 1, 1, 1, 6, 5);
    clasp.position.set(0, 0.48, 0.28);
    g.add(clasp);
  }

  // back: behind the shoulders
  if (accessories.back === 'backpack') {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.13, 0.1), mat(0x3a6ea5));
    pack.position.set(0, 0.56, 0.12);
    g.add(pack);
  } else if (accessories.back === 'wings') {
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.02), mat(WING_COLORS[side === -1 ? 0 : 1]));
      wing.position.set(side * 0.22, 0.44, 0.3);
      wing.rotation.z = side * 0.5;
      wing.rotation.y = side * 0.3;
      g.add(wing);
    }
  }

  // feet: small shells on the paw positions
  if (accessories.feet === 'booties') {
    for (const leg of legs) {
      leg.userData.paw.material = mat(0xf2c14e);
      leg.userData.paw.scale.multiplyScalar(1.15);
    }
  } else if (accessories.feet === 'sneakers') {
    for (const leg of legs) {
      leg.userData.paw.material = mat(SNEAKER_WHITE);
      leg.userData.paw.scale.set(1.2, 0.95, 1.25);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.09), mat(SNEAKER_ACCENT));
      stripe.position.set(0, -0.27, 0);
      leg.add(stripe);
    }
  } else if (accessories.feet === 'rainboots') {
    for (const leg of legs) {
      leg.userData.paw.material = mat(RAINBOOT_COLOR);
      leg.userData.paw.scale.set(1.15, 1.4, 1.15);
    }
  }

  g.scale.setScalar(s.scale);
  g.userData.breed = breed;
  g.userData.parts = {
    body, head, tail, tailPivots, legs,
    earL: head.userData.earL, earR: head.userData.earR, whiskers,
  };
  g.userData.base = { bodyY: 0.34, bodyScale: [0.85, 0.75, 1.35], headPos: [0, 0.56, -0.44], tailRotX: -0.6 };
  return g;
}
