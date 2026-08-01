import * as THREE from 'three';
import { buildCat } from './cat/model.js';
import { animateCat } from './cat/animator.js';

const BREEDS = ['tabby', 'siamese', 'persian', 'black', 'calico', 'mainecoon'];
const WANDER_SPEED = 1.4;
const SCURRY_SPEED = 2.6;
const GOLDEN = 0.6180339887498949; // spreads personality rolls evenly across strays even with a seeded/constant rng

export const CAT_NAMES = [
  'Pickles', 'Marmalade', 'Baron von Fluff', 'Mochi', 'Biscuit', 'Clementine',
  'Noodle', 'Pumpkin', 'Sardine', 'Waffles', 'Miso', 'Turnip', 'Gadget',
  'Petunia', 'Sir Pounce', 'Dumpling', 'Olive', 'Paprika', 'Crumpet', 'Zucchini',
  'Maple', 'Tofu', 'Wasabi', 'Pretzel', 'Nimbus', 'Pepper', 'Butterscotch',
  'Fig', 'Tangerine', 'Cocoa', 'Sprout', 'Juniper', 'Meatball', 'Parsnip',
  'Ziggy', 'Bean', 'Churro', 'Anchovy', 'Popcorn', 'Gnocchi', 'Beignet',
  'Truffle', 'Ramen', 'Custard', 'Peaches', 'Static', 'Doppler', 'Comet',
];

function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeTag(name) {
  const tagCanvas = document.createElement('canvas');
  tagCanvas.width = 256;
  tagCanvas.height = 64;
  const tctx = tagCanvas.getContext('2d');
  tctx.font = 'bold 34px Avenir, sans-serif';
  tctx.textAlign = 'center';
  tctx.fillStyle = 'rgba(20,26,38,0.7)';
  tctx.beginPath();
  if (tctx.roundRect) tctx.roundRect(28, 8, 200, 48, 22);
  else tctx.rect(28, 8, 200, 48);
  tctx.fill();
  tctx.fillStyle = '#fff';
  tctx.fillText(name, 128, 42);
  const tagTex = new THREE.CanvasTexture(tagCanvas);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true }));
  tag.scale.set(1.4, 0.35, 1);
  tag.position.y = 1.05;
  tag.visible = false;
  return tag;
}

export function createStrayCats(scene, area, count = 3, rng = Math.random) {
  const strays = [];
  const b = area.bounds;
  const names = shuffled(CAT_NAMES, rng);

  for (let i = 0; i < count; i++) {
    const name = names[i % names.length];
    // breed is derived from the name, not rolled, so a given cat (e.g. "Pickles")
    // is always the same breed across walks
    const breed = BREEDS[[...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % BREEDS.length];
    const group = buildCat(breed, undefined, { simple: true });
    group.scale.multiplyScalar(0.85); // strays read as slightly smaller than your cat
    const x = THREE.MathUtils.lerp(b.minX * 0.7, b.maxX * 0.7, Math.random());
    const z = THREE.MathUtils.lerp(b.minZ * 0.7, b.maxZ * 0.7, Math.random());
    group.position.set(x, 0, z);
    group.rotation.y = Math.random() * Math.PI * 2;

    const roll = (rng() + i * GOLDEN) % 1;
    const personality = roll < 0.25 ? 'shy' : roll < 0.55 ? 'playful' : 'bold';

    const tag = typeof document !== 'undefined' ? makeTag(name) : null;
    if (tag) group.add(tag);

    scene.add(group);
    strays.push({
      id: `stray-${i}`,
      breed,
      name,
      personality,
      group,
      tag,
      home: new THREE.Vector3(x, 0, z),
      target: null,
      state: 'idle', // idle | wander | greet
      pose: 'follow',
      timer: 1 + Math.random() * 3,
      greeted: false,
      scurry: 0,
      scurryDir: null,
      batCooldown: 0,
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
    update(dt, t, catPos, opts = {}) {
      for (const s of strays) {
        if (s.tag) s.tag.visible = catPos ? s.group.position.distanceTo(catPos) < 4 : false;
        if (s.batCooldown > 0) s.batCooldown -= dt;

        // shy strays scurry away from a fast, non-stalking approach — this overrides wander entirely
        if (s.personality === 'shy' && s.state !== 'greet') {
          if (s.scurry <= 0 && catPos &&
              s.group.position.distanceTo(catPos) < 4 &&
              (opts.catSpeed ?? 0) > 2.5 && !opts.stalking) {
            s.scurry = 2.5;
            s.scurryDir = s.group.position.clone().sub(catPos).setY(0);
            if (s.scurryDir.lengthSq() < 0.0001) s.scurryDir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
            s.scurryDir.normalize();
          }
          if (s.scurry > 0) {
            s.scurry -= dt;
            s.group.position.addScaledVector(s.scurryDir, SCURRY_SPEED * dt);
            s.group.position.x = THREE.MathUtils.clamp(s.group.position.x, b.minX + 0.5, b.maxX - 0.5);
            s.group.position.z = THREE.MathUtils.clamp(s.group.position.z, b.minZ + 0.5, b.maxZ - 0.5);
            s.group.rotation.y = Math.atan2(s.scurryDir.x, s.scurryDir.z) + Math.PI;
            animateCat(s.group, 'follow', t, SCURRY_SPEED);
            s.timer -= dt;
            continue;
          }
        }

        // playful strays run to bat an active toy within range
        if (s.personality === 'playful' && opts.toy?.active) {
          const dToy = s.group.position.distanceTo(opts.toy.mesh.position);
          if (dToy < 8) {
            s.state = 'wander';
            s.target = opts.toy.mesh.position.clone();
            s.timer = Math.max(s.timer, 1.5);
            if (dToy < 0.5 && s.batCooldown <= 0) {
              opts.toy.bat(s.group.position);
              s.batCooldown = 0.8;
            }
          }
        }

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
