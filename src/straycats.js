import * as THREE from 'three';
import { buildCat } from './cat/model.js';
import { animateCat } from './cat/animator.js';

const BREEDS = ['tabby', 'siamese', 'persian', 'black', 'calico', 'mainecoon'];
const WANDER_SPEED = 1.4;

export function createStrayCats(scene, area, count = 3) {
  const strays = [];
  const b = area.bounds;

  for (let i = 0; i < count; i++) {
    const breed = BREEDS[Math.floor(Math.random() * BREEDS.length)];
    const group = buildCat(breed);
    group.scale.multiplyScalar(0.85); // strays read as slightly smaller than your cat
    const x = THREE.MathUtils.lerp(b.minX * 0.7, b.maxX * 0.7, Math.random());
    const z = THREE.MathUtils.lerp(b.minZ * 0.7, b.maxZ * 0.7, Math.random());
    group.position.set(x, 0, z);
    group.rotation.y = Math.random() * Math.PI * 2;
    scene.add(group);
    strays.push({
      id: `stray-${i}`,
      breed,
      group,
      home: new THREE.Vector3(x, 0, z),
      target: null,
      state: 'idle', // idle | wander | greet
      pose: 'follow',
      timer: 1 + Math.random() * 3,
      greeted: false,
    });
  }

  return {
    strays,
    nearest(pos, maxDist, { ungreetedOnly = false } = {}) {
      let best = null;
      let bestD = maxDist;
      for (const s of strays) {
        if (ungreetedOnly && s.greeted) continue;
        const d = s.group.position.distanceTo(pos);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      return best;
    },
    greet(stray, fromPos) {
      stray.state = 'greet';
      stray.timer = 3;
      stray.greeted = true;
      stray.group.rotation.y =
        Math.atan2(fromPos.x - stray.group.position.x, fromPos.z - stray.group.position.z) + Math.PI;
    },
    dispose() {
      for (const s of strays) scene.remove(s.group);
    },
    reactToMeow(pos) {
      let count = 0;
      for (const s of strays) {
        if (s.group.position.distanceTo(pos) < 8) {
          s.state = 'greet';
          s.timer = 1.5;
          s.group.rotation.y = Math.atan2(pos.x - s.group.position.x, pos.z - s.group.position.z) + Math.PI;
          count += 1;
        }
      }
      return count;
    },
    update(dt, t) {
      for (const s of strays) {
        s.timer -= dt;

        if (s.state === 'greet') {
          animateCat(s.group, 'requestPet', t, 0); // tail up, head raised toward you
          if (s.timer <= 0) {
            s.state = 'idle';
            s.pose = 'follow';
            s.timer = 2 + Math.random() * 3;
          }
          continue;
        }

        if (s.timer <= 0) {
          if (s.state === 'idle') {
            s.state = 'wander';
            const a = Math.random() * Math.PI * 2;
            const r = 4 + Math.random() * 8;
            s.target = s.home.clone().add(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r));
            s.target.x = THREE.MathUtils.clamp(s.target.x, b.minX + 2, b.maxX - 2);
            s.target.z = THREE.MathUtils.clamp(s.target.z, b.minZ + 2, b.maxZ - 2);
            s.timer = 12; // give up on unreachable targets eventually
          } else {
            s.state = 'idle';
            s.pose = Math.random() < 0.4 ? 'sniff' : 'follow';
            s.timer = 2 + Math.random() * 4;
          }
        }

        let speed = 0;
        if (s.state === 'wander' && s.target) {
          const dir = s.target.clone().sub(s.group.position).setY(0);
          if (dir.length() < 0.4) {
            s.state = 'idle';
            s.pose = Math.random() < 0.4 ? 'sniff' : 'follow';
            s.timer = 2 + Math.random() * 4;
          } else {
            dir.normalize().multiplyScalar(WANDER_SPEED);
            s.group.position.addScaledVector(dir, dt);
            s.group.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;
            speed = WANDER_SPEED;
          }
        }
        animateCat(s.group, s.state === 'idle' ? s.pose : 'follow', t, speed);
      }
    },
  };
}
