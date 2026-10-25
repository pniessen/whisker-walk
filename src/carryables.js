import * as THREE from 'three';
import { litMaterial } from './render/materials.js';

// =============================================================================
// Carryables — the things a cat can pick up in its mouth (v21 Stream 3b).
//
// A held item is a SCENE CHILD, repositioned every update at its holder's
// mouth. It is never parented to the cat: remotecats.js disposes every child of
// a removed remote's group, which would destroy the item's geometry while this
// module still owns it. A holder that has left the scene (!holder.parent) hides
// the item rather than leaving it floating where the cat was.
//
// Each mesh and material is created per item and disposed once in dispose()
// (the goldmice.js pattern).
// =============================================================================

// In the head's local space: just below and in front of the nose.
export const MOUTH = new THREE.Vector3(0, -0.08, -0.24);
const HEADLESS_LIFT = 0.3; // metres above the holder's position when it has no head

const _tmp = new THREE.Vector3();

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

// buildCarryMesh(kind) → a small Object3D (< 0.25 m), origin at its middle.
// Unknown kinds become a small grey sphere. Never throws.
export function buildCarryMesh(kind) {
  const g = new THREE.Group();
  const lit = (c, extra) => litMaterial(c, extra);
  switch (kind) {
    case 'sock': {
      const m = lit(0xe8e2d0);
      g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8), m));
      const foot = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.09, 8), lit(0xd9573f), 0, -0.065, 0.035);
      foot.rotation.x = Math.PI / 2;
      g.add(foot);
      break;
    }
    case 'toymouse': {
      const m = lit(0x9a9aa6);
      g.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), m));
      g.add(mesh(new THREE.ConeGeometry(0.03, 0.05, 6), m, 0, 0, -0.06).rotateX(-Math.PI / 2));
      g.add(mesh(new THREE.BoxGeometry(0.01, 0.01, 0.1), lit(0xd98a9a), 0, -0.01, 0.1));
      break;
    }
    case 'leaf': {
      const l = mesh(new THREE.CircleGeometry(0.07, 8), lit(0x6aa84f, { side: THREE.DoubleSide }));
      l.rotation.x = -Math.PI / 2;
      g.add(l);
      break;
    }
    case 'stick': {
      const s = mesh(new THREE.CylinderGeometry(0.011, 0.015, 0.22, 6), lit(0x7a5a38));
      s.rotation.z = Math.PI / 2;
      g.add(s);
      break;
    }
    case 'pinecone': {
      g.add(mesh(new THREE.ConeGeometry(0.05, 0.13, 7), lit(0x6b4a2e)).rotateX(Math.PI));
      break;
    }
    case 'acorn': {
      g.add(mesh(new THREE.SphereGeometry(0.04, 8, 6), lit(0xb07a3c), 0, -0.01, 0));
      g.add(mesh(new THREE.SphereGeometry(0.043, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), lit(0x5a3e24), 0, 0.005, 0));
      break;
    }
    case 'shell': {
      const s = mesh(new THREE.SphereGeometry(0.06, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), lit(0xf3d9cf));
      s.scale.set(1, 0.5, 0.85);
      g.add(s);
      break;
    }
    case 'driftwood': {
      const s = mesh(new THREE.BoxGeometry(0.2, 0.04, 0.05), lit(0xb9a98c));
      s.rotation.y = 0.3;
      g.add(s);
      break;
    }
    case 'cap': {
      const m = lit(0x3f6fb0);
      g.add(mesh(new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m));
      g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 10, 1, false, 0, Math.PI), m, 0, 0, 0.07));
      break;
    }
    case 'rope': {
      const t = mesh(new THREE.TorusGeometry(0.06, 0.016, 6, 12), lit(0xc9a55c));
      t.rotation.x = Math.PI / 2;
      g.add(t);
      break;
    }
    case 'glove': {
      const m = lit(0xd05a5a);
      g.add(mesh(new THREE.BoxGeometry(0.08, 0.02, 0.1), m));
      g.add(mesh(new THREE.BoxGeometry(0.025, 0.02, 0.06), m, 0.05, 0, 0.02));
      break;
    }
    case 'ribbon': {
      const m = lit(0xe05a9a, { side: THREE.DoubleSide });
      g.add(mesh(new THREE.PlaneGeometry(0.03, 0.2), m).rotateX(-Math.PI / 2));
      g.add(mesh(new THREE.SphereGeometry(0.02, 6, 6), m));
      break;
    }
    default:
      g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), lit(0x9a9a9a)));
  }
  return g;
}

// Every distinct geometry / material under an object, so each is freed once.
function collect(root, geos, mats) {
  root.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    if (o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
    }
  });
}

// createCarryables(scene, list) — list is [{ id, kind, x, z }] (propsFor's
// carryables). Items start on the ground at their home.
export function createCarryables(scene, list) {
  const items = [];
  const byId = new Map();
  let disposed = false;

  for (const c of list ?? []) {
    const obj = buildCarryMesh(c.kind);
    // Rest the mesh on the ground: lift by however far it extends below its origin.
    const box = new THREE.Box3().setFromObject(obj);
    const lift = Number.isFinite(box.min.y) ? -box.min.y : 0;
    const item = { id: c.id, kind: c.kind, mesh: obj, onGround: true, holder: null, homeX: c.x, homeZ: c.z, lift };
    obj.position.set(c.x, lift, c.z);
    scene.add(obj);
    items.push(item);
    byId.set(c.id, item);
  }

  function place(item, x, z) {
    item.onGround = true;
    item.holder = null;
    item.mesh.position.set(x, item.lift, z);
    item.mesh.quaternion.identity();
    item.mesh.visible = true;
  }

  return {
    list: items,
    // The nearest item lying on the ground within maxDist (horizontal), or null.
    nearest(pos, maxDist) {
      let best = null;
      let bestD = maxDist;
      for (const it of items) {
        if (!it.onGround) continue;
        const d = Math.hypot(it.mesh.position.x - pos.x, it.mesh.position.z - pos.z);
        if (d <= bestD) {
          bestD = d;
          best = it;
        }
      }
      return best;
    },
    hold(id, holder) {
      const it = byId.get(id);
      if (!it) return;
      it.onGround = false;
      it.holder = holder ?? null;
      it.mesh.visible = !!holder;
    },
    placeAt(id, x, z) {
      const it = byId.get(id);
      if (it) place(it, x, z);
    },
    // Off the ground and held by nobody visible (a keepsake already in the den).
    take(id) {
      const it = byId.get(id);
      if (!it) return;
      it.onGround = false;
      it.holder = null;
      it.mesh.visible = false;
    },
    update() {
      for (const it of items) {
        const h = it.holder;
        if (!h) continue;
        if (!h.parent) {
          it.mesh.visible = false;
          continue;
        }
        it.mesh.visible = true;
        const head = h.userData?.parts?.head;
        if (head) {
          head.updateWorldMatrix(true, false);
          head.localToWorld(it.mesh.position.copy(MOUTH));
          head.getWorldQuaternion(it.mesh.quaternion);
        } else {
          h.updateWorldMatrix(true, false);
          h.getWorldPosition(_tmp);
          it.mesh.position.set(_tmp.x, _tmp.y + HEADLESS_LIFT, _tmp.z);
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const geos = new Set();
      const mats = new Set();
      for (const it of items) {
        scene.remove(it.mesh);
        collect(it.mesh, geos, mats);
        it.holder = null;
      }
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      items.length = 0;
      byId.clear();
    },
  };
}
