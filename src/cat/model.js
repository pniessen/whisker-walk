import * as THREE from 'three';

const STYLE = {
  tabby:     { base: 0x9c7a4f, belly: 0xd8c39a, accent: 0x6f5636, scale: 1.0, stripes: true },
  siamese:   { base: 0xe8dcc8, belly: 0xf2ead9, accent: 0x4a3b32, scale: 0.95, points: true },
  persian:   { base: 0xcfcfd4, belly: 0xe8e8ec, accent: 0xb5b5bc, scale: 1.05, fluffy: true },
  black:     { base: 0x2a2a30, belly: 0x3a3a42, accent: 0x1c1c22, scale: 1.0 },
  calico:    { base: 0xf0ead8, belly: 0xf8f4e8, accent: 0xd88030, scale: 1.0, patches: true },
  mainecoon: { base: 0x7a5b3a, belly: 0xb99a72, accent: 0x5a4028, scale: 1.3, fluffy: true, tufts: true },
};
const INNER_EAR = 0xe8a0a8;
const EYE_COLORS = { siamese: 0x68a8d8, black: 0xd8b830 };

const mat = (color) => new THREE.MeshLambertMaterial({ color });

function ball(r, color, sx = 1, sy = 1, sz = 1, wSeg = 10, hSeg = 8) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, wSeg, hSeg), mat(color));
  m.scale.set(sx, sy, sz);
  return m;
}

export function buildCat(breed, accessories = { collar: null, outfit: null }) {
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
    const cheek = ball(0.065, s.belly, 1, 0.9, 0.8, 8, 6);
    cheek.position.set(side * 0.085, -0.07, -0.14);
    head.add(cheek);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.075, s.tufts ? 0.19 : 0.15, 4), mat(pointColor));
    ear.position.set(side * 0.12, 0.18, 0.01);
    ear.rotation.z = -side * 0.22;
    head.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.09, 4), mat(INNER_EAR));
    inner.position.set(side * 0.115, 0.16, -0.015);
    inner.rotation.z = -side * 0.22;
    head.add(inner);
    if (side === -1) head.userData.earL = ear;
    else head.userData.earR = ear;

    const eye = ball(0.036, EYE_COLORS[breed] ?? 0x4e9440, 1, 1.15, 0.7, 8, 6);
    eye.position.set(side * 0.083, 0.03, -0.165);
    head.add(eye);
    const pupil = ball(0.017, 0x1a1a1e, 0.7, 1.2, 0.6, 6, 5);
    pupil.position.set(side * 0.083, 0.03, -0.19);
    head.add(pupil);
    const shine = ball(0.007, 0xffffff, 1, 1, 1, 4, 3);
    shine.position.set(side * 0.07, 0.05, -0.195);
    head.add(shine);
  }
  // whiskers
  const whiskers = [];
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

  // accessories — head-parented so they track poses
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
  if (accessories.outfit === 'bandana') {
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.17, 3), mat(0x3a6ea5));
    tri.rotation.x = Math.PI;
    tri.position.set(0, -0.18, 0.02);
    head.add(tri);
  }
  if (accessories.outfit === 'booties') {
    for (const leg of legs) {
      leg.userData.paw.material = mat(0xf2c14e);
      leg.userData.paw.scale.multiplyScalar(1.15);
    }
  }
  if (accessories.outfit === 'backpack') {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.13, 0.1), mat(0x3a6ea5));
    pack.position.set(0, 0.56, 0.12);
    g.add(pack);
  }
  if (accessories.outfit === 'crown') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const petal = ball(0.026, [0xf2a0c0, 0xf2e04e, 0xffffff][i % 3], 1, 1, 1, 5, 4);
      petal.position.set(Math.cos(a) * 0.11, 0.24, Math.sin(a) * 0.07);
      head.add(petal);
    }
  }

  g.scale.setScalar(s.scale);
  g.userData.breed = breed;
  g.userData.parts = {
    body, head, tail, tailPivots, legs,
    earL: head.userData.earL, earR: head.userData.earR, whiskers,
  };
  return g;
}
