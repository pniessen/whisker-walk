import * as THREE from 'three';
import { litMaterial } from './render/materials.js';

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

// rollTreats scatters treats around POIs with no awareness of colliders or
// bounds — nudge any treat that landed inside a collider's push-out zone (or
// too near the world edge) so it stays diggable.
function keepReachable(tr, area) {
  const colliders = area.colliders ?? [];
  for (const c of colliders) {
    const dx = tr.x - c.x;
    const dz = tr.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d < c.r + 1.55) {
      const dist = c.r + 1.7;
      if (d > 0.0001) {
        tr.x = c.x + (dx / d) * dist;
        tr.z = c.z + (dz / d) * dist;
      } else {
        tr.x = c.x + dist;
        tr.z = c.z;
      }
    }
  }
  const bounds = area.bounds;
  if (bounds) {
    tr.x = THREE.MathUtils.clamp(tr.x, bounds.minX + 1.5, bounds.maxX - 1.5);
    tr.z = THREE.MathUtils.clamp(tr.z, bounds.minZ + 1.5, bounds.maxZ - 1.5);
  }
  return tr;
}

export function createScent(scene, area, rng) {
  const treats = rollTreats(rng, area.pois, 2).map((tr) => keepReachable({
    ...tr,
    revealed: false,
    dug: false,
  }, area));

  // subtle mounds, visible when close
  for (const tr of treats) {
    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 5),
      litMaterial(0x8a6a48)
    );
    mound.scale.y = 0.25;
    mound.position.set(tr.x, 0.02, tr.z);
    scene.add(mound);
    tr.mound = mound;
  }

  const decals = [];

  // Lay one run of paw-print decals from `from` toward `to`. Extracted out of
  // sniff() so v18's Twitchy Nose (trailTo below) reuses the EXACT trail
  // rendering the buried-treasure sniff has always drawn, rather than
  // shipping a second look for the same idea.
  //
  // `peak` is carried per-decal instead of the hardcoded 0.85 update() used
  // to apply, so a fainter trail (Twitchy Nose's, which redraws every few
  // seconds and would otherwise stack into a solid yellow carpet) fades
  // through its own ceiling rather than everyone's.
  //
  // The jitter draws from the SAME `rng` sniff always used. For a room walk
  // that is the shared walkRng — but every world-gen draw off that stream
  // happens synchronously inside startWalk, so by the time any trail is laid
  // the stream is spent and perturbing it cannot desync a co-walker. (This
  // is exactly the property sniff() has relied on since it shipped; trailTo
  // does not weaken it, and deliberately does not introduce a bare
  // Math.random() alongside it either.)
  function layTrail(from, to, { steps = 7, life = 8, peak = 0.85, color = 0xf2e04e } = {}) {
    for (const p of trailPoints(from, to, rng, steps)) {
      const decal = new THREE.Mesh(
        new THREE.CircleGeometry(0.14, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: peak })
      );
      decal.rotation.x = -Math.PI / 2;
      decal.position.set(p.x, 0.03, p.z);
      scene.add(decal);
      decals.push({ mesh: decal, life, peak });
    }
  }

  // shared mutation for unearthing a treat, used by both digAt(pos) (proximity
  // check happens in the caller) and digById(id) (remote dig events arrive
  // with no position to check — the sender already validated proximity on
  // their own client)
  function unearth(tr) {
    tr.dug = true;
    tr.mound.scale.y = 0.08;
    const fish = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 6),
      litMaterial(0x9ab8d0)
    );
    fish.scale.set(1.4, 0.7, 0.5);
    fish.position.set(tr.x, 0.4, tr.z);
    scene.add(fish);
    return tr;
  }

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
      layTrail(pos, best);
      return best;
    },
    // v18 Twitchy Nose ('twitchy-nose') — lay a scent trail toward an
    // arbitrary point (the nearest uncollected collectible; see
    // game/interactions.js's updateSenses, the only caller).
    //
    // The trail is CLIPPED to maxDist rather than drawn all the way to the
    // target: a collectible 20m off would otherwise carpet the route with 7
    // decals spaced 2.5m apart, which reads as a road, not a scent. A short
    // run of prints leaving the cat's paws in the right direction is the
    // whole ability — the player still has to walk it.
    //
    // Returns the endpoint actually drawn to (handy for tests); null when
    // `to` is null or the cat is already standing on it.
    trailTo(from, to, { maxDist = 6, steps = 5, life = 4, peak = 0.55 } = {}) {
      if (!to) return null;
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.4) return null;
      const k = Math.min(1, maxDist / d);
      const end = { x: from.x + dx * k, z: from.z + dz * k };
      layTrail(from, end, { steps, life, peak });
      return end;
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
          return unearth(tr);
        }
      }
      return null;
    },
    digById(treatId) {
      const tr = treats.find((t) => t.id === treatId);
      if (!tr || tr.dug) return null;
      return unearth(tr);
    },
    update(dt) {
      for (const d of [...decals]) {
        d.life -= dt;
        d.mesh.material.opacity = Math.min(d.peak, d.life / 3);
        if (d.life <= 0) {
          scene.remove(d.mesh);
          // Expired decals used to be dropped from the scene without being
          // disposed, so their geometry/material outlived the walk (endWalk's
          // scene traversal only reaches objects still IN the scene). One
          // sniff per walk made that nearly invisible; Twitchy Nose relays a
          // trail every few seconds, which would have turned a rounding error
          // into a real per-walk leak. Each decal owns its geometry and
          // material outright — nothing else references them.
          d.mesh.geometry.dispose();
          d.mesh.material.dispose();
          decals.splice(decals.indexOf(d), 1);
        }
      }
    },
  };
}
