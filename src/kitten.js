import * as THREE from 'three';
import { buildCat } from './cat/model.js';

// The lost-kitten quest chain, spread across multiple solo walks (a co-walk
// kitten would desync the shared canon — main.js only ever wires this up
// when roomSeed === undefined). Stage 0: paw-print trail leads to the spot.
// Stage 1: the kitten (Mochi) is there, scared, and needs comforting — once
// comforted she follows. Stage 2: a transient stage set at the end of the
// "meet" walk, promoted to 3 at that same walk's summary (endWalk). Stage 3:
// Mochi lives at the area spawn and can be nuzzled on any walk, in any area.
export const KITTEN_SPOT = { x: -18, z: -6 };
const CROSSROADS = { x: 0, z: 0 };
const WANDER_RADIUS = 3; // strictly < the 4-unit cap the brief allows
const FOLLOW_SPEED = 2.4;
const FOLLOW_STOP_DIST = 1.1;
const PROMPT_RANGE = 2;

// kittenPlan(stage, areaId) — pure. Stage >= 2 means Mochi already lives at
// home base and wanders near the spawn of WHATEVER area you're walking in
// (the brief's "home (kitten hangs out near spawn)" case) — checked first so
// it isn't accidentally gated behind the neighborhood-only check below.
// Stages 0/1 (trail/meet) are neighborhood-only: a lost kitten's trail
// wouldn't plausibly show up across town in the park.
export function kittenPlan(stage, areaId) {
  if (stage >= 2) return { kind: 'home' };
  if (areaId !== 'neighborhood') return null;
  if (stage === 0) return { kind: 'trail' };
  if (stage === 1) return { kind: 'meet' };
  return null;
}

function disposeGroup(group) {
  group.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
    }
  });
}

// trail: 5 paw-print pairs (a pair per step, mimicking two paws landing side
// by side) walking from the crossroads toward KITTEN_SPOT. Purely visual —
// no kitten mesh yet, matching scent.js's flat-decal idiom (CircleGeometry,
// rotated flat, MeshBasicMaterial).
function createTrail(scene) {
  const group = new THREE.Group();
  const dx = KITTEN_SPOT.x - CROSSROADS.x;
  const dz = KITTEN_SPOT.z - CROSSROADS.z;
  const len = Math.hypot(dx, dz) || 1;
  const dirX = dx / len;
  const dirZ = dz / len;
  const perpX = -dirZ;
  const perpZ = dirX;
  for (let i = 1; i <= 5; i++) {
    const k = i / 6;
    const cx = CROSSROADS.x + dx * k;
    const cz = CROSSROADS.z + dz * k;
    for (const side of [-1, 1]) {
      const decal = new THREE.Mesh(
        new THREE.CircleGeometry(0.06, 8),
        new THREE.MeshBasicMaterial({ color: 0x241a12, transparent: true, opacity: 0.7 })
      );
      decal.rotation.x = -Math.PI / 2;
      decal.position.set(cx + perpX * 0.12 * side, 0.02, cz + perpZ * 0.12 * side);
      group.add(decal);
    }
  }
  scene.add(group);

  return {
    group,
    update() {},
    promptAt(catPos) {
      return Math.hypot(catPos.x - KITTEN_SPOT.x, catPos.z - KITTEN_SPOT.z) < PROMPT_RANGE
        ? 'E — investigate the tiny mew'
        : null;
    },
    interact() {
      return 'advanced';
    },
    dispose() {
      scene.remove(group);
      disposeGroup(group);
    },
  };
}

// meet: the kitten sits at KITTEN_SPOT and mews (onMew, caller-supplied so
// this module stays audio-free) until comforted; after interact() she
// follows the cat, lerping in at FOLLOW_SPEED and stopping at
// FOLLOW_STOP_DIST, facing her movement direction the same way strays.js
// faces theirs (atan2 + PI).
function createMeet(scene, onMew) {
  const group = buildCat('calico');
  group.scale.multiplyScalar(0.5);
  group.position.set(KITTEN_SPOT.x, 0, KITTEN_SPOT.z);
  scene.add(group);

  let following = false;
  let mewTimer = 6 + Math.random() * 3;

  return {
    group,
    update(dt, catPos) {
      if (!following) {
        mewTimer -= dt;
        if (mewTimer <= 0) {
          onMew?.();
          mewTimer = 6 + Math.random() * 3;
        }
        return;
      }
      const dx = catPos.x - group.position.x;
      const dz = catPos.z - group.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > FOLLOW_STOP_DIST) {
        const step = Math.min(dist - FOLLOW_STOP_DIST, FOLLOW_SPEED * dt);
        const nx = dx / dist;
        const nz = dz / dist;
        group.position.x += nx * step;
        group.position.z += nz * step;
        group.rotation.y = Math.atan2(nx, nz) + Math.PI;
      }
    },
    promptAt(catPos) {
      if (following) return null;
      return Math.hypot(catPos.x - group.position.x, catPos.z - group.position.z) < PROMPT_RANGE
        ? 'E — comfort the kitten'
        : null;
    },
    interact() {
      if (following) return null;
      following = true;
      return 'advanced';
    },
    dispose() {
      scene.remove(group);
      disposeGroup(group);
    },
  };
}

// home: Mochi lives at home base now — she wanders a gentle, bounded circle
// (radius WANDER_RADIUS, comfortably inside the brief's 4-unit cap) around
// the area's spawn point.
function createHome(scene, spawn) {
  const group = buildCat('calico');
  group.scale.multiplyScalar(0.5);
  group.position.set(spawn.x, 0, spawn.z);
  scene.add(group);

  let t = 0;

  return {
    group,
    update(dt) {
      t += dt;
      const ang = t * 0.25;
      group.position.x = spawn.x + Math.cos(ang) * WANDER_RADIUS;
      group.position.z = spawn.z + Math.sin(ang) * WANDER_RADIUS;
      group.rotation.y = ang + Math.PI / 2;
    },
    promptAt(catPos) {
      return Math.hypot(catPos.x - group.position.x, catPos.z - group.position.z) < PROMPT_RANGE
        ? 'E — nuzzle Mochi'
        : null;
    },
    interact() {
      return 'nuzzle';
    },
    dispose() {
      scene.remove(group);
      disposeGroup(group);
    },
  };
}

// createKittenEncounter(scene, plan, spawn, { onMew }) — plan is a non-null
// result from kittenPlan (main.js only calls this when the plan isn't
// null, mirroring goldMice's own no-op-stub-otherwise pattern).
export function createKittenEncounter(scene, plan, spawn, { onMew } = {}) {
  if (plan.kind === 'trail') return createTrail(scene);
  if (plan.kind === 'meet') return createMeet(scene, onMew);
  return createHome(scene, spawn);
}
