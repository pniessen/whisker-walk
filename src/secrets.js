import * as THREE from 'three';

const mat = (color) => new THREE.MeshLambertMaterial({ color });
const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));

export function rollSecrets(rng, { eveningLight }) {
  return {
    unicorn: rng() < 0.125,
    ufo: !!eveningLight && rng() < 0.2,
  };
}

function buildUnicorn() {
  const g = new THREE.Group();
  const body = box(0.5, 0.5, 1.1, 0xf2e8f8);
  body.position.y = 0.85;
  g.add(body);
  for (const [x, z] of [[-0.18, -0.4], [0.18, -0.4], [-0.18, 0.4], [0.18, 0.4]]) {
    const leg = box(0.12, 0.6, 0.12, 0xece0f2);
    leg.position.set(x, 0.3, z);
    g.add(leg);
  }
  const neck = box(0.22, 0.5, 0.22, 0xf2e8f8);
  neck.position.set(0, 1.25, -0.5);
  neck.rotation.x = 0.4;
  g.add(neck);
  const head = box(0.24, 0.24, 0.45, 0xf2e8f8);
  head.position.set(0, 1.5, -0.68);
  g.add(head);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.35, 6), new THREE.MeshLambertMaterial({ color: 0xf2c14e, emissive: 0x9a7a20 }));
  horn.position.set(0, 1.75, -0.72);
  g.add(horn);
  const maneColors = [0xf2a0c0, 0xa0c0f2, 0xc0f2a0];
  for (let i = 0; i < 3; i++) {
    const tuft = box(0.1, 0.16, 0.18, maneColors[i]);
    tuft.position.set(0, 1.45 - i * 0.14, -0.42 + i * 0.14);
    g.add(tuft);
  }
  const tail = box(0.1, 0.4, 0.1, 0xf2a0c0);
  tail.position.set(0, 0.9, 0.6);
  tail.rotation.x = 0.5;
  g.add(tail);
  // sparkle halo
  const sparkleGeo = new THREE.BufferGeometry();
  const sparkles = new Float32Array(36);
  for (let i = 0; i < 12; i++) {
    sparkles[i * 3] = (Math.random() - 0.5) * 1.6;
    sparkles[i * 3 + 1] = 0.8 + Math.random() * 1.2;
    sparkles[i * 3 + 2] = (Math.random() - 0.5) * 1.6;
  }
  sparkleGeo.setAttribute('position', new THREE.BufferAttribute(sparkles, 3));
  g.add(new THREE.Points(sparkleGeo, new THREE.PointsMaterial({ color: 0xfff2a0, size: 0.09 })));
  return g;
}

function buildGnome() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.35, 8), mat(0x4a6ea5));
  body.position.y = 0.18;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), mat(0xe8c8a8));
  head.position.y = 0.4;
  g.add(head);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 8), mat(0xd04040));
  hat.position.y = 0.58;
  g.add(hat);
  return g;
}

function buildUfo() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 6), mat(0x9aa2b0));
  disc.scale.y = 0.25;
  g.add(disc);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshLambertMaterial({ color: 0x9ae0e8, emissive: 0x2a6a70 }));
  dome.position.y = 0.2;
  g.add(dome);
  return g;
}

export function createSecrets(scene, area, rolls, rng) {
  const list = [];

  // gnome: hides at a random poi, offset a bit — different every walk
  const gnomePoi = area.pois[Math.floor(rng() * area.pois.length)];
  const gnome = buildGnome();
  gnome.position.set(gnomePoi.x + (rng() - 0.5) * 3, 0, gnomePoi.z + (rng() - 0.5) * 3);
  scene.add(gnome);
  list.push({ key: 'gnome', label: 'a sneaky garden gnome', group: gnome, award: 'secret', spotRange: 7 });

  let unicornState = null;
  if (rolls.unicorn) {
    const far = [...area.pois].sort((a, b) =>
      Math.hypot(b.x - area.spawn.x, b.z - area.spawn.z) - Math.hypot(a.x - area.spawn.x, a.z - area.spawn.z)
    )[0];
    const unicorn = buildUnicorn();
    unicorn.position.set(far.x, 0, far.z);
    scene.add(unicorn);
    list.push({ key: 'unicorn', label: 'a REAL unicorn?!', group: unicorn, award: 'legend', spotRange: 12 });
    unicornState = { group: unicorn, home: unicorn.position.clone(), fleeing: 0 };
  }

  let ufoState = null;
  if (rolls.ufo) {
    const ufo = buildUfo();
    ufo.visible = false;
    scene.add(ufo);
    list.push({ key: 'ufo', label: 'a tiny UFO?!', group: ufo, award: 'secret', spotRange: 60 });
    ufoState = { group: ufo, startAt: 30 + rng() * 60, t: 0, flying: false, done: false };
  }

  return {
    list,
    update(dt, t, playerPos, playerSpeed) {
      if (unicornState) {
        const u = unicornState.group;
        const d = u.position.distanceTo(playerPos);
        if (unicornState.fleeing > 0) {
          unicornState.fleeing -= dt;
          const away = u.position.clone().sub(playerPos).setY(0).normalize();
          u.position.addScaledVector(away, 3.5 * dt);
          u.rotation.y = Math.atan2(away.x, away.z);
        } else if (d < 10 && playerSpeed > 3) {
          unicornState.fleeing = 3;
        } else {
          // graze in a slow circle near home
          u.position.x = unicornState.home.x + Math.sin(t * 0.15) * 2;
          u.position.z = unicornState.home.z + Math.cos(t * 0.12) * 2;
          u.rotation.y = Math.sin(t * 0.1);
        }
      }
      if (ufoState && !ufoState.done) {
        ufoState.t += dt;
        if (!ufoState.flying && ufoState.t > ufoState.startAt) {
          ufoState.flying = true;
          ufoState.group.visible = true;
          ufoState.group.position.set(playerPos.x - 60, 26, playerPos.z - 30);
        }
        if (ufoState.flying) {
          ufoState.group.position.x += 8 * dt;
          ufoState.group.position.y = 26 + Math.sin(ufoState.t * 2) * 1.5;
          ufoState.group.rotation.y += dt * 3;
          if (ufoState.group.position.x > playerPos.x + 60) {
            ufoState.group.visible = false;
            ufoState.done = true;
          }
        }
      }
    },
  };
}
