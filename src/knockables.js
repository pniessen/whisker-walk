import * as THREE from 'three';
import { litMaterial } from './render/materials.js';

// =============================================================================
// Knockables — the cup on the car roof, the geranium on the porch roof, the
// book on the bench (v21 Stream 3b, Task 10). A cat perched beside one can
// knock it off: it falls in a short arc to its curated `fallTo` on the ground,
// tips onto its side, settles, and STAYS THERE for the rest of the walk.
// Nothing is saved; the next walk builds them all standing again.
//
// The fall is a pure function of the curated entry (propsets.js) and the time
// since the knock, and the final pose is snapped exactly, so both co-walkers'
// devices land it at the same spot in the same pose whatever their frame
// rates. No randomness of any kind.
//
// No contact decal: walk.js does not register these with its contact-shadow
// rig. A mover decal is a circle on the GROUND under the object, so a cup on
// a car roof would have a shadow blob on the road beneath the car, and one in
// mid-fall would have it sliding along under it. The real shadow map already
// gives each one a shadow (they are created before walk.js's castShadow pass).
//
// Each mesh and material is created per item and disposed exactly once in
// dispose() (the carryables.js pattern), which runs before endWalk's scene
// traversal so that traversal never frees them a second time.
// =============================================================================

const FALL = 0.5;    // seconds: the arc off the ledge, tipping as it goes
const SETTLE = 0.18; // seconds: one small bounce where it lands
const DURATION = FALL + SETTLE;
const HOP = 0.12;    // metres: the little lift a swatted thing gets off the ledge
const BOUNCE = 0.03; // metres: the settle's bounce
const LEVEL = 0.3;   // metres: how far the cat's perch may sit from the item's ledge

// How far over it ends up, about its own local x axis (so its top swings
// toward fallTo). A book lying flat lands face down; everything else on its side.
const TIP = { book: Math.PI };
const SIDE = Math.PI / 2;

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

// buildKnockMesh(kind) → a small Group with its base near y 0 (the exact rest
// height is measured, not assumed). Unknown kinds become a small grey sphere.
export function buildKnockMesh(kind) {
  const g = new THREE.Group();
  const lit = (c) => litMaterial(c);
  switch (kind) {
    case 'cup': {
      const china = lit(0xf2efe8);
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.1, 10), china, 0, 0.05, 0));
      g.add(mesh(new THREE.TorusGeometry(0.025, 0.007, 5, 10), china, 0.055, 0.055, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.005, 10), lit(0x6b4226), 0, 0.093, 0)); // the coffee
      break;
    }
    case 'flowerpot': {
      g.add(mesh(new THREE.CylinderGeometry(0.12, 0.085, 0.18, 8), lit(0xc06a48), 0, 0.09, 0));
      g.add(mesh(new THREE.IcosahedronGeometry(0.1, 0), lit(0x4e9440), 0, 0.24, 0));
      g.add(mesh(new THREE.SphereGeometry(0.045, 6, 5), lit(0xd8433c), 0.03, 0.33, 0.02)); // a geranium
      break;
    }
    case 'can': {
      g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 10), lit(0x9aa4ae), 0, 0.07, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.02, 10), lit(0x3f7fc0), 0, 0.13, 0)); // a lick of blue paint
      break;
    }
    case 'book': {
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.035, 0.22), lit(0x3a6ab0), 0, 0.0175, 0));
      g.add(mesh(new THREE.BoxGeometry(0.15, 0.03, 0.212), lit(0xf4efe0), 0.008, 0.0175, 0)); // the pages' edge
      break;
    }
    case 'bucket': {
      const tin = lit(0x5a8fb0);
      g.add(mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.2, 10), tin, 0, 0.1, 0));
      g.add(mesh(new THREE.TorusGeometry(0.12, 0.008, 4, 12, Math.PI), tin, 0, 0.2, 0));
      break;
    }
    default:
      g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), lit(0x9a9a9a), 0, 0.05, 0));
  }
  return g;
}

// How far the group must be lifted for its lowest point to sit at y 0, in a
// given pose. Measured with the group at the origin, before it joins a scene.
function liftFor(group, yaw, tip) {
  group.position.set(0, 0, 0);
  group.rotation.set(tip, yaw, 0, 'YXZ');
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  return Number.isFinite(box.min.y) ? -box.min.y : 0;
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

// createKnockables(scene, list) — list is propsFor(areaId).knockables:
// [{ id, kind, x, z, y, fallTo: { x, z } }]. Everything starts standing on its
// ledge. Entries are { id, kind, group, down, anim }; `anim` is the seconds of
// fall still to play (0 standing, and 0 again once it has landed).
export function createKnockables(scene, list) {
  const items = [];
  const motion = new Map(); // entry → its curated fall, kept off the public shape
  let disposed = false;

  for (const k of list ?? []) {
    const group = buildKnockMesh(k.kind);
    const dx = k.fallTo.x - k.x;
    const dz = k.fallTo.z - k.z;
    const yaw = Math.atan2(dx, dz); // local +z faces where it will fall
    const tip = TIP[k.kind] ?? SIDE;
    const downLift = liftFor(group, yaw, tip);
    const standLift = liftFor(group, yaw, 0);
    const m = {
      x: k.x, z: k.z, ledgeY: k.y,
      from: new THREE.Vector3(k.x, k.y + standLift, k.z),
      to: new THREE.Vector3(k.fallTo.x, downLift, k.fallTo.z),
      yaw, tip,
    };
    group.position.copy(m.from);
    scene.add(group);
    const entry = { id: k.id, kind: k.kind, group, down: false, anim: 0 };
    items.push(entry);
    motion.set(entry, m);
  }

  // The pose `t` seconds after the knock. t >= DURATION is the resting pose,
  // set exactly, so every device ends on the same numbers.
  function pose(entry, t) {
    const m = motion.get(entry);
    const g = entry.group;
    if (t >= DURATION) {
      g.position.copy(m.to);
      g.rotation.set(m.tip, m.yaw, 0, 'YXZ');
      return;
    }
    if (t <= FALL) {
      const k = t / FALL;
      g.position.set(
        m.from.x + (m.to.x - m.from.x) * k,
        // gravity-ish: slow off the ledge, fast at the ground, with a little hop
        m.from.y + (m.to.y - m.from.y) * k * k + HOP * 4 * k * (1 - k),
        m.from.z + (m.to.z - m.from.z) * k,
      );
      g.rotation.set(m.tip * (1 - (1 - k) * (1 - k)), m.yaw, 0, 'YXZ');
      return;
    }
    const u = (t - FALL) / SETTLE;
    g.position.set(m.to.x, m.to.y + BOUNCE * Math.sin(u * Math.PI) * (1 - u), m.to.z);
    g.rotation.set(m.tip, m.yaw, 0, 'YXZ');
  }

  function knockEntry(entry) {
    if (!entry || entry.down || !motion.has(entry)) return false;
    entry.down = true;
    entry.anim = DURATION;
    return true;
  }

  return {
    list: items,
    // The nearest item still standing on a ledge at the cat's perch height
    // (|perchY - its ledge y| < 0.3), within maxDist horizontally, or null.
    nearest(pos, perchY, maxDist) {
      let best = null;
      let bestD = maxDist;
      for (const e of items) {
        if (e.down) continue;
        const m = motion.get(e);
        if (!(Math.abs(perchY - m.ledgeY) < LEVEL)) continue;
        const d = Math.hypot(m.x - pos.x, m.z - pos.z);
        if (d <= bestD) {
          bestD = d;
          best = e;
        }
      }
      return best;
    },
    // Whether THIS knock sent it over: false for anything already down, or
    // not one of this walk's entries.
    knock(entry) {
      return knockEntry(entry);
    },
    // A co-walker's knock, by id. Found with list.find, so an unknown,
    // non-string or '__proto__' id is simply not found.
    knockById(id) {
      if (typeof id !== 'string') return false;
      return knockEntry(items.find((e) => e.id === id));
    },
    update(dt) {
      if (!(dt > 0)) return;
      for (const e of items) {
        if (!e.down || e.anim <= 0) continue;
        e.anim = Math.max(0, e.anim - dt);
        pose(e, DURATION - e.anim);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const geos = new Set();
      const mats = new Set();
      for (const e of items) {
        scene.remove(e.group);
        collect(e.group, geos, mats);
      }
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      items.length = 0;
      motion.clear();
    },
  };
}
