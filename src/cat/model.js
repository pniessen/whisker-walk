import * as THREE from 'three';

const STYLE = {
  tabby:     { base: 0x9c7a4f, belly: 0xd8c39a, accent: 0x6f5636, scale: 1.0, stripes: true },
  siamese:   { base: 0xe8dcc8, belly: 0xf2ead9, accent: 0x4a3b32, scale: 0.95, points: true },
  persian:   { base: 0xcfcfd4, belly: 0xe8e8ec, accent: 0xb5b5bc, scale: 1.05, fluffy: true },
  black:     { base: 0x2a2a30, belly: 0x3a3a42, accent: 0x1c1c22, scale: 1.0 },
  calico:    { base: 0xf0ead8, belly: 0xf8f4e8, accent: 0xd88030, scale: 1.0, patches: true },
  mainecoon: { base: 0x7a5b3a, belly: 0xb99a72, accent: 0x5a4028, scale: 1.3, tufts: true },
};

function mat(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function box(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
}

export function buildCat(breed, accessories = { collar: null, outfit: null }) {
  const s = STYLE[breed];
  const g = new THREE.Group();
  const c = s.points ? s.accent : s.base; // siamese extremities are dark

  const bodyW = s.fluffy ? 0.34 : 0.26;
  const body = box(bodyW, 0.24, 0.62, s.base);
  body.position.y = 0.3;
  g.add(body);

  const belly = box(bodyW * 0.8, 0.1, 0.5, s.belly);
  belly.position.set(0, 0.2, 0);
  g.add(belly);

  const head = new THREE.Group();
  const skull = box(0.22, 0.2, s.fluffy ? 0.16 : 0.22, s.points ? s.accent : s.base);
  head.add(skull);
  const muzzle = box(0.1, 0.08, 0.06, s.belly);
  muzzle.position.set(0, -0.05, -0.12);
  head.add(muzzle);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, s.tufts ? 0.14 : 0.1, 4), mat(c));
    ear.position.set(side * 0.08, 0.14, 0);
    head.add(ear);
    if (side === -1) head.userData.earL = ear;
    else head.userData.earR = ear;
    const eye = box(0.03, 0.03, 0.01, 0x2e4a2e);
    eye.position.set(side * 0.06, 0.02, -0.115);
    head.add(eye);
  }
  head.position.set(0, 0.44, -0.36);
  g.add(head);

  const legs = [];
  const legPositions = [
    [-0.09, -0.22], [0.09, -0.22], // front L, R
    [-0.09, 0.22], [0.09, 0.22],   // back L, R
  ];
  for (const [x, z] of legPositions) {
    const leg = box(0.07, 0.22, 0.07, s.points ? s.accent : s.base);
    leg.geometry.translate(0, -0.11, 0); // pivot at hip
    leg.position.set(x, 0.28, z);
    g.add(leg);
    legs.push(leg);
  }

  const tail = new THREE.Group();
  let prev = tail;
  for (let i = 0; i < 3; i++) {
    const seg = box(0.06 - i * 0.012, 0.06 - i * 0.012, 0.16, s.points || s.stripes ? s.accent : s.base);
    seg.position.z = 0.08;
    const pivot = new THREE.Group();
    pivot.position.z = i === 0 ? 0.3 : 0.15;
    pivot.add(seg);
    prev.add(pivot);
    prev = pivot;
  }
  tail.position.set(0, 0.36, 0);
  tail.rotation.x = -0.7;
  g.add(tail);

  if (s.stripes) {
    for (let i = 0; i < 3; i++) {
      const stripe = box(bodyW + 0.01, 0.03, 0.06, s.accent);
      stripe.position.set(0, 0.41, -0.18 + i * 0.18);
      g.add(stripe);
    }
  }
  if (s.patches) {
    const p1 = box(0.12, 0.04, 0.18, s.accent);
    p1.position.set(0.08, 0.43, -0.1);
    g.add(p1);
    const p2 = box(0.12, 0.04, 0.16, 0x333333);
    p2.position.set(-0.08, 0.43, 0.12);
    g.add(p2);
  }

  // accessories
  if (accessories.collar) {
    const collarColor = accessories.collar === 'glow' ? 0x7ef2c0 : 0xd84040;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 12), mat(collarColor));
    ring.rotation.x = Math.PI / 2 + 0.5;
    ring.position.set(0, -0.02, 0.08); // head-local (was g-local 0, 0.42, -0.28); tracks head
    head.add(ring);
    if (accessories.collar === 'bell') {
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), mat(0xf2c14e));
      bell.position.set(0, -0.08, -0.04); // head-local (was g-local 0, 0.36, -0.4); tracks head
      head.add(bell);
    }
  }
  if (accessories.outfit === 'bandana') {
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.16, 3), mat(0x3a6ea5));
    tri.rotation.x = Math.PI;
    tri.position.set(0, -0.08, 0.06); // head-local (was g-local 0, 0.36, -0.3); tracks head
    head.add(tri);
  }
  if (accessories.outfit === 'booties') {
    for (const leg of legs) {
      const boot = box(0.09, 0.06, 0.09, 0xf2c14e);
      boot.position.y = -0.19;
      leg.add(boot);
    }
  }
  if (accessories.outfit === 'backpack') {
    const pack = box(0.16, 0.12, 0.08, 0x3a6ea5);
    pack.position.set(0, 0.46, 0.1);
    g.add(pack);
  }
  if (accessories.outfit === 'crown') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 5), mat([0xf2a0c0, 0xf2e04e, 0xffffff][i % 3]));
      petal.position.set(Math.cos(a) * 0.1, 0.12, Math.sin(a) * 0.06); // head-local (was g-local ..., 0.56, -0.36 + ...); tracks head
      head.add(petal);
    }
  }

  g.scale.setScalar(s.scale);
  g.userData.breed = breed;
  g.userData.parts = { body, head, tail, legs, earL: head.userData.earL, earR: head.userData.earR };
  return g;
}
