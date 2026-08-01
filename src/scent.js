import * as THREE from 'three';

export function rollTreats(rng, pois, count = 2) {
  const treats = [];
  const used = new Set();
  while (treats.length < count && used.size < pois.length) {
    let i = Math.floor(rng() * pois.length);
    while (used.has(i)) i = (i + 1) % pois.length; // linear probe: rng may be constant
    used.add(i);
    const poi = pois[i];
    treats.push({
      id: `treat-${treats.length}`,
      x: poi.x + (rng() - 0.5) * 8,
      z: poi.z + (rng() - 0.5) * 8,
    });
  }
  return treats;
}

export function trailPoints(from, to, rng, steps = 7) {
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const k = i / (steps + 1);
    pts.push({
      x: from.x + (to.x - from.x) * k + (rng() - 0.5) * 1.6,
      z: from.z + (to.z - from.z) * k + (rng() - 0.5) * 1.6,
    });
  }
  return pts;
}

export function createScent(scene, area, rng) {
  const treats = rollTreats(rng, area.pois, 2).map((tr) => ({
    ...tr,
    revealed: false,
    dug: false,
  }));

  // subtle mounds, visible when close
  for (const tr of treats) {
    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 5),
      new THREE.MeshLambertMaterial({ color: 0x8a6a48 })
    );
    mound.scale.y = 0.25;
    mound.position.set(tr.x, 0.02, tr.z);
    scene.add(mound);
    tr.mound = mound;
  }

  const decals = [];

  return {
    treats,
    sniff(pos, range) {
      let best = null;
      let bestD = range;
      for (const tr of treats) {
        if (tr.revealed || tr.dug) continue;
        const d = Math.hypot(tr.x - pos.x, tr.z - pos.z);
        if (d < bestD) {
          bestD = d;
          best = tr;
        }
      }
      if (!best) return null;
      best.revealed = true;
      for (const p of trailPoints(pos, best, rng)) {
        const decal = new THREE.Mesh(
          new THREE.CircleGeometry(0.14, 8),
          new THREE.MeshBasicMaterial({ color: 0xf2e04e, transparent: true, opacity: 0.85 })
        );
        decal.rotation.x = -Math.PI / 2;
        decal.position.set(p.x, 0.03, p.z);
        scene.add(decal);
        decals.push({ mesh: decal, life: 8 });
      }
      return best;
    },
    nearestMound(pos, maxDist) {
      for (const tr of treats) {
        if (!tr.dug && Math.hypot(tr.x - pos.x, tr.z - pos.z) < maxDist) return tr;
      }
      return null;
    },
    digAt(pos) {
      for (const tr of treats) {
        if (tr.dug) continue;
        if (Math.hypot(tr.x - pos.x, tr.z - pos.z) <= 1.2) {
          tr.dug = true;
          tr.mound.scale.y = 0.08;
          const fish = new THREE.Mesh(
            new THREE.SphereGeometry(0.12, 8, 6),
            new THREE.MeshLambertMaterial({ color: 0x9ab8d0 })
          );
          fish.scale.set(1.4, 0.7, 0.5);
          fish.position.set(tr.x, 0.4, tr.z);
          scene.add(fish);
          return tr;
        }
      }
      return null;
    },
    update(dt) {
      for (const d of [...decals]) {
        d.life -= dt;
        d.mesh.material.opacity = Math.min(0.85, d.life / 3);
        if (d.life <= 0) {
          scene.remove(d.mesh);
          decals.splice(decals.indexOf(d), 1);
        }
      }
    },
  };
}
