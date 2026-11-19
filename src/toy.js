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
// Review S2: `rng` draws the extra push a bat gives the ball (Math.random by
// default). A walk passes a stream of the toy's own (game/walk.js), never
// walkRng: a bat happens whenever a cat or a stray swipes it, which differs
// per device, and the ball is this device's own (a partner sees it as the
// ghost ball drawn from this device's state messages).
// The found yarn ball's look (controls review, 2026-11-19): the yarn lies
// around to find now, so it must never read as a treasure. Treasures are
// glowing pink spheres; this is matte cornflower blue, wound in strands that
// stand a little proud of the core (about 0.15 m across the outside), with a
// loose thread trailing. The core is the physics ball, RADIUS as always: the
// ball rolls and rests exactly as it did, and the strands sink a centimetre
// or two into the grass. No emissive, no glow. The co-walk ghost ball
// (walk.js) is the same picture.
const YARN_BLUE = 0x5b7fc7;
const HELD_SCALE = 0.6;
const YARN_STRAND = 0x47669f;
const YARN_THREAD = 0x6a8fd6;
export function buildYarnBall() {
  const ball = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 14, 10), litMaterial(YARN_BLUE));
  ball.name = 'yarnBall';
  const strandMat = litMaterial(YARN_STRAND);
  const strandGeo = new THREE.TorusGeometry(RADIUS * 1.02, 0.016, 5, 18);
  // three bands wound at odd angles, like a real ball of wool
  for (const [rx, ry, rz] of [[1.1, 0, 0], [0.3, 0.9, 1.4], [-0.6, 1.9, 0.5]]) {
    const band = new THREE.Mesh(strandGeo, strandMat);
    band.rotation.set(rx, ry, rz);
    ball.add(band);
  }
  // the loose end: a short thread curling off the side and down to the ground
  const tail = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(RADIUS * 0.7, RADIUS * 0.55, 0.02),
      new THREE.Vector3(RADIUS * 1.25, RADIUS * 0.1, 0.06),
      new THREE.Vector3(RADIUS * 1.6, -RADIUS * 0.6, 0.02),
      new THREE.Vector3(RADIUS * 2.2, -RADIUS * 0.95, -0.04),
    ]), 10, 0.008, 4, false),
    litMaterial(YARN_THREAD),
  );
  ball.add(tail);
  return ball;
}

// Controls review, 2026-11-19. The ball is no longer thrown from a pocket: one
// lies at a spot in each area (src/propsets.js yarnSpotFor; walk.js puts it
// there with placeAt). Three flags on top of `active`:
//   claimed  this device has touched it (a bat, a pick-up, a kick, a rally
//            handoff). A ball still resting where it was found is nobody's: a
//            co-walk sends only a claimed ball (main.js), and the strays leave
//            it alone until someone plays with it.
//   held     in the cat's mouth: no physics, the walk moves it with the mouth
//            (game/avatar.js).
//   spot     where it was found, for the roll home when it ends up somewhere
//            no cat can reach.
export function createToy(scene, { ground = FLAT_GROUND, rng = Math.random } = {}) {
  const mesh = buildYarnBall();
  mesh.visible = false;
  scene.add(mesh);

  const velocity = new THREE.Vector3();

  const api = {
    mesh,
    active: false,
    idleTime: 0,
    claimed: false,
    held: false,
    spot: null,
    throwFrom(pos, dir, power = 9) {
      api.claimed = true;
      api.held = false;
      mesh.scale.setScalar(1);
      mesh.position.copy(pos);
      velocity.copy(dir).setY(0).multiplyScalar(power);
      velocity.y = 4;
      mesh.visible = true;
      api.active = true;
      api.idleTime = 0;
    },
    bat(fromPos) {
      api.claimed = true;
      const dir = mesh.position.clone().sub(fromPos).setY(0);
      if (dir.lengthSq() < 0.0001) dir.set(1, 0, 0);
      velocity.add(dir.normalize().multiplyScalar(3 + rng() * 2));
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
      api.claimed = false;
      api.held = false;
      mesh.visible = false;
      mesh.scale.setScalar(1);
      velocity.set(0, 0, 0);
    },
    // Lying at rest at `pos` (x, z; y comes from the ground), nobody's: where
    // a walk finds it, where it rolls home to, and where a co-walker who left
    // last saw it.
    placeAt(pos) {
      api.setPosition({ x: pos.x, y: 0, z: pos.z });
      api.claimed = false;
    },
    // In the mouth: no rolling, no bounce; the walk moves the mesh. Drawn
    // smaller there (HELD_SCALE), so a cat's mouth can hold it.
    hold() {
      api.held = true;
      mesh.scale.setScalar(HELD_SCALE);
      api.claimed = true;
      api.active = true;
      api.idleTime = 0;
      mesh.visible = true;
      velocity.set(0, 0, 0);
    },
    // co-walk yarn-rally authority handoff: place the ball at rest at a given
    // position (typically the last-seen ghost position of the player who
    // just handed off ownership) with zero velocity — unlike throwFrom, this
    // doesn't launch the ball into the air, so a rally handoff reads as
    // "the ball is here now" rather than a fresh throw every time.
    setPosition(pos) {
      api.claimed = true;
      api.held = false;
      mesh.scale.setScalar(1);
      mesh.position.set(pos.x, pos.y, pos.z);
      const floor = ground.flat ? RADIUS : ground.y(pos.x, pos.z) + RADIUS;
      if (mesh.position.y < floor) mesh.position.y = floor;
      mesh.visible = true;
      api.active = true;
      api.idleTime = 0;
      velocity.set(0, 0, 0);
    },
    update(dt, bounds) {
      if (!api.active || api.held) return;
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
