import * as THREE from 'three';
import { litMaterial } from './render/materials.js';
import { FLAT_GROUND } from './ground.js';

const GRAVITY = -14;
const BOUNCE = 0.45;
const RADIUS = 0.13;
export const TOY_RADIUS = RADIUS;
const RIM_BOUNCE = 0.5; // a rim turns the ball back at half speed (R12)

// Gorge part 1 (R12): the ball's floor is ground.y + RADIUS, and a rim
// bounces it back, so it never rolls off a clifftop. On FLAT_GROUND every
// line runs exactly as before.
export function createToy(scene, { ground = FLAT_GROUND } = {}) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS, 8, 8),
    litMaterial(0xe05c8a)
  );
  const wrap = new THREE.Mesh(
    new THREE.TorusGeometry(RADIUS * 0.95, 0.018, 6, 12),
    litMaterial(0xc03060)
  );
  wrap.rotation.x = 1.1;
  mesh.add(wrap);
  mesh.visible = false;
  scene.add(mesh);

  const velocity = new THREE.Vector3();

  const api = {
    mesh,
    active: false,
    idleTime: 0,
    throwFrom(pos, dir, power = 9) {
      mesh.position.copy(pos);
      velocity.copy(dir).setY(0).multiplyScalar(power);
      velocity.y = 4;
      mesh.visible = true;
      api.active = true;
      api.idleTime = 0;
    },
    bat(fromPos) {
      const dir = mesh.position.clone().sub(fromPos).setY(0);
      if (dir.lengthSq() < 0.0001) dir.set(1, 0, 0);
      velocity.add(dir.normalize().multiplyScalar(3 + Math.random() * 2));
      velocity.y = Math.max(velocity.y, 2);
      api.idleTime = 0;
    },
    nudgeToward(target, dt) {
      const dir = target.clone().sub(mesh.position).setY(0);
      if (dir.lengthSq() < 0.0001) return;
      mesh.position.addScaledVector(dir.normalize(), 1.8 * dt);
      api.idleTime = 0;
    },
    retrieve() {
      api.active = false;
      mesh.visible = false;
      velocity.set(0, 0, 0);
    },
    // co-walk yarn-rally authority handoff: place the ball at rest at a given
    // position (typically the last-seen ghost position of the player who
    // just handed off ownership) with zero velocity — unlike throwFrom, this
    // doesn't launch the ball into the air, so a rally handoff reads as
    // "the ball is here now" rather than a fresh throw every time.
    setPosition(pos) {
      mesh.position.copy(pos);
      const floor = ground.flat ? RADIUS : ground.y(pos.x, pos.z) + RADIUS;
      if (mesh.position.y < floor) mesh.position.y = floor;
      mesh.visible = true;
      api.active = true;
      api.idleTime = 0;
      velocity.set(0, 0, 0);
    },
    update(dt, bounds) {
      if (!api.active) return;
      const px = mesh.position.x;
      const pz = mesh.position.z;
      velocity.y += GRAVITY * dt;
      mesh.position.addScaledVector(velocity, dt);
      let floor = RADIUS;
      if (!ground.flat) {
        if (bounds) {
          mesh.position.x = THREE.MathUtils.clamp(mesh.position.x, bounds.minX, bounds.maxX);
          mesh.position.z = THREE.MathUtils.clamp(mesh.position.z, bounds.minZ, bounds.maxZ);
        }
        if (!ground.canStep(px, pz, mesh.position.x, mesh.position.z)) {
          mesh.position.x = px;
          mesh.position.z = pz;
          velocity.x *= -RIM_BOUNCE;
          velocity.z *= -RIM_BOUNCE;
        }
        floor = ground.y(mesh.position.x, mesh.position.z) + RADIUS;
      }
      if (mesh.position.y < floor) {
        mesh.position.y = floor;
        if (Math.abs(velocity.y) > 1) velocity.y = -velocity.y * BOUNCE;
        else velocity.y = 0;
        const f = Math.pow(0.15, dt); // ground friction
        velocity.x *= f;
        velocity.z *= f;
      }
      if (bounds) {
        mesh.position.x = THREE.MathUtils.clamp(mesh.position.x, bounds.minX, bounds.maxX);
        mesh.position.z = THREE.MathUtils.clamp(mesh.position.z, bounds.minZ, bounds.maxZ);
      }
      const speed = velocity.length();
      if (speed < 0.2 && mesh.position.y <= floor + 0.01) api.idleTime += dt;
      else api.idleTime = 0;
      mesh.rotation.x += speed * dt * 2;
    },
  };
  return api;
}
