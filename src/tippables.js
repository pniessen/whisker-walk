import * as THREE from 'three';

const mat = (color) => new THREE.MeshLambertMaterial({ color });
let nextId = 1;

function buildTippable(kind) {
  const g = new THREE.Group();
  if (kind === 'pot') {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.11, 0.24, 8), mat(0xc06a48));
    pot.position.y = 0.12;
    g.add(pot);
    const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), mat(0x4e9440));
    plant.position.y = 0.32;
    g.add(plant);
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), mat(0xf2a0c0));
    bloom.position.y = 0.44;
    g.add(bloom);
  } else if (kind === 'can') {
    const canBody = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.22, 8), mat(0x6a9ab8));
    canBody.position.y = 0.11;
    g.add(canBody);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.2, 6), mat(0x6a9ab8));
    spout.rotation.z = 0.9;
    spout.position.set(0.14, 0.16, 0);
    g.add(spout);
  } else {
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.4, 8), mat(0x8a8a92));
    bin.position.y = 0.2;
    g.add(bin);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.04, 8), mat(0x74747c));
    lid.position.y = 0.42;
    g.add(lid);
  }
  return g;
}

export function createTippables(scene, spots) {
  const list = [];
  for (const spot of spots) {
    const group = buildTippable(spot.kind);
    group.position.set(spot.x, 0, spot.z);
    group.rotation.y = (spot.x * 7 + spot.z * 13) % 6; // stable pseudo-random facing
    scene.add(group);
    list.push({ id: `tip-${nextId++}`, kind: spot.kind, group, tipped: false, anim: 0 });
  }

  return {
    list,
    nearest(pos, maxDist) {
      let best = null;
      let bestD = maxDist;
      for (const e of list) {
        if (e.tipped) continue;
        const d = e.group.position.distanceTo(pos);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      return best;
    },
    tip(e) {
      if (e.tipped) return false;
      e.tipped = true;
      e.anim = 0.5;
      return true;
    },
    update(dt) {
      for (const e of list) {
        if (!e.tipped || e.anim <= 0) continue;
        e.anim -= dt;
        const k = 1 - Math.max(0, e.anim) / 0.5; // 0 → 1
        e.group.rotation.z = -1.75 * k;
        e.group.position.y = Math.sin(k * Math.PI) * 0.12; // little hop
      }
    },
  };
}
