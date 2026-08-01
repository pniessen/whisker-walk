import * as THREE from 'three';

const mat = (color) => new THREE.MeshLambertMaterial({ color });
const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));

export function applySky(scene, top, horizon) {
  scene.background = new THREE.Color(top);
  scene.fog = new THREE.Fog(horizon, 40, 130);
}

export function ground(size, color) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat(color));
  m.rotation.x = -Math.PI / 2;
  return m;
}

export function path(x1, z1, x2, z2, w = 2) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), mat(0xcbb8a0));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = -Math.atan2(x2 - x1, z2 - z1);
  m.position.set((x1 + x2) / 2, 0.01, (z1 + z2) / 2);
  return m;
}

export function house(x, z, bodyColor = 0xe8d8b0, roofColor = 0xb05a4a) {
  const g = new THREE.Group();
  const body = box(5, 3, 4, bodyColor);
  body.position.y = 1.5;
  g.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.9, 2, 4), mat(roofColor));
  roof.position.y = 4;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  const door = box(0.9, 1.8, 0.1, 0x7a5230);
  door.position.set(0, 0.9, 2.01);
  g.add(door);
  for (const wx of [-1.6, 1.6]) {
    const win = box(0.9, 0.9, 0.1, 0xa8d8e8);
    win.position.set(wx, 1.8, 2.01);
    g.add(win);
  }
  g.position.set(x, 0, z);
  return g;
}

export function tree(x, z, scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2, 6), mat(0x7a5230));
  trunk.position.y = 1;
  g.add(trunk);
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 0), mat(0x4e9440));
  leaves.position.y = 2.8;
  g.add(leaves);
  g.scale.setScalar(scale);
  g.position.set(x, 0, z);
  return g;
}

export function bush(x, z) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), mat(0x5aa04e));
  m.position.set(x, 0.5, z);
  return m;
}

export function fenceRun(x1, z1, x2, z2) {
  const g = new THREE.Group();
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.floor(len / 0.8);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = box(0.1, 1, 0.1, 0xc8b088);
    p.position.set(x1 + (x2 - x1) * t, 0.5, z1 + (z2 - z1) * t);
    g.add(p);
  }
  const rail = box(0.06, 0.08, len, 0xc8b088);
  rail.position.set((x1 + x2) / 2, 0.8, (z1 + z2) / 2);
  rail.rotation.y = Math.atan2(x2 - x1, z2 - z1);
  g.add(rail);
  return g;
}

export function mailbox(x, z) {
  const g = new THREE.Group();
  const post = box(0.08, 1, 0.08, 0x7a5230);
  post.position.y = 0.5;
  g.add(post);
  const boxTop = box(0.3, 0.25, 0.5, 0x4a6ea5);
  boxTop.position.y = 1.1;
  g.add(boxTop);
  g.position.set(x, 0, z);
  return g;
}

export function car(x, z, color = 0xd06048, rotY = 0) {
  const g = new THREE.Group();
  const body = box(1.8, 0.6, 4, color);
  body.position.y = 0.6;
  g.add(body);
  const cabin = box(1.6, 0.55, 2, 0xa8d8e8);
  cabin.position.set(0, 1.15, -0.2);
  g.add(cabin);
  for (const [wx, wz] of [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 8), mat(0x2a2a30));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.35, wz);
    g.add(wheel);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

export function bench(x, z, rotY = 0) {
  const g = new THREE.Group();
  const seat = box(1.6, 0.08, 0.5, 0x9a7048);
  seat.position.y = 0.5;
  g.add(seat);
  const back = box(1.6, 0.5, 0.08, 0x9a7048);
  back.position.set(0, 0.85, -0.25);
  g.add(back);
  for (const lx of [-0.7, 0.7]) {
    const leg = box(0.08, 0.5, 0.4, 0x5a4028);
    leg.position.set(lx, 0.25, 0);
    g.add(leg);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

export function lampPost(x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6), mat(0x3a3a42));
  pole.position.y = 1.6;
  g.add(pole);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8),
    new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0x8a7a40 }));
  lamp.position.y = 3.3;
  g.add(lamp);
  g.position.set(x, 0, z);
  return g;
}

export function puddle(x, z, r = 0.8) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 12), mat(0x8ab8d8));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.02, z);
  return m;
}

export function rock(x, z) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), mat(0x9a9aa2));
  m.position.set(x, 0.3, z);
  return m;
}

export function flowerPatch(x, z) {
  const g = new THREE.Group();
  const colors = [0xf2a0c0, 0xf2e04e, 0xffffff, 0xe07040];
  for (let i = 0; i < 6; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 5), mat(colors[i % 4]));
    f.position.set((Math.sin(i * 2.4) * 0.5), 0.25, (Math.cos(i * 1.7) * 0.5));
    g.add(f);
    const stem = box(0.03, 0.25, 0.03, 0x4e9440);
    stem.position.set(f.position.x, 0.12, f.position.z);
    g.add(stem);
  }
  g.position.set(x, 0, z);
  return g;
}
