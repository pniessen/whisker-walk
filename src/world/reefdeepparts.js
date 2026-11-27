// =============================================================================
// THE REEF, WING C: THE DRAWING (milestone R8). The Sunken Boat and the Old Anchor are drawn by the wreck stage (reefwreckdeep.js) since the polish round; this file hands
// them their numbers and draws the Glow Cave (tall rocks either side of a cleft, glowing beads on the walls, a pale patch on the floor). All of it goes
// into the kit's two buckets ('paint', lit, and 'glow', unlit), so it adds no mesh to the place; every number is reefdeep.js's. No real lights, no canvas,
// no rng of its own (the area builds in withLocalUuids).
// =============================================================================

import * as THREE from 'three';
import { COL, STONES, paint, at, T3 } from './reefparts.js';
import { reefY } from './reefplan.js';
import * as D from './reefdeep.js';
import { ST } from './reefstages.js';

const BEAD = Object.freeze([0x8ff0d0, 0xb4ffa0, 0x9be8ff]);

export function drawGlowCave(kit, M) {
  const G = D.GLOW;
  D.WALLS.forEach((w, i) => {
    // a tall rock, leaning in toward the cleft, with a smaller one riding on its shoulder
    const lean = w.z < G.floorZ ? 0.12 : w.z > G.floorZ ? -0.12 : 0;
    kit.put('paint', M.paint, paint(at(new THREE.DodecahedronGeometry(w.r, 0).scale(1.25, w.h / (w.r * 2), 1.15).translate(0, w.h / 2 - 0.2, 0).rotateX(lean), w.x, w.z, 0, i * 1.1), STONES[i % 5]));
    kit.put('paint', M.paint, paint(at(new THREE.DodecahedronGeometry(w.r * 0.6, 0).translate(w.r * 0.2, w.h - 0.4, 0).rotateX(lean * 2), w.x, w.z, 0, i * 0.7), COL.stoneLight), { noCast: true });
  });
  // the rocks behind the walls, so the cleft is a pass through a bigger outcrop, and a few stones at its mouth
  let bi = 2;
  for (const [x, z, r, h] of [[-41.4, -41, 1.5, 3.6], [-44, -41.2, 1.4, 3.2], [-41.4, -33, 1.4, 3.2], [-44, -33, 1.3, 3.0], [-47, -39.6, 1.5, 3.4], [-47, -34.6, 1.4, 3.0]]) {
    kit.put('paint', M.paint, paint(at(new THREE.DodecahedronGeometry(r, 0).scale(1.2, h / (r * 2), 1.1).translate(0, h / 2 - 0.2, 0), x, z, 0, x), STONES[bi++ % 5]));
  }
  for (const [x, z] of [[-38.2, -39.4], [-38.6, -34.6], [-37.8, -36.4]]) kit.put('paint', M.paint, paint(at(new THREE.DodecahedronGeometry(0.28, 0).scale(1, 0.6, 1), x, z, 0.05, x), COL.stoneLight), { noCast: true });
  // the glow: beads on the walls' inner faces and a pale patch on the floor (unlit, so it shines at any depth)
  D.glowBeads().forEach((b, i) => {
    const geo = new THREE.IcosahedronGeometry(b.r, 0);
    kit.put('glow', M.glow, paint(at(geo, b.x, b.z, b.y), BEAD[i % 3]), { noCast: true });
  });
  // round 3: each pale patch is brightest in the middle and fades to a soft teal at the rim (vertex colour), so it reads as a pool of light, not a white tile
  const pool = (geo, x, z, dy, r) => {
    const q = at(geo, x, z, dy);
    const p = q.attributes.position;
    const c = q.attributes.color;
    for (let v = 0; v < p.count; v++) { const k = 1 - 0.62 * Math.min(1, Math.hypot(p.getX(v) - x, p.getZ(v) - z) / r); c.setXYZ(v, c.getX(v) * k * (0.9 + 0.1 * k), c.getY(v) * k, c.getZ(v) * k * (1.1 - 0.1 * k)); }
    return q;
  };
  kit.put('glow', M.glow, pool(paint(new THREE.CircleGeometry(1.5, 10).rotateX(-Math.PI / 2), 0xbff7ea), -42, G.floorZ, 0.03, 1.5), { noCast: true });
  kit.put('glow', M.glow, pool(paint(new THREE.CircleGeometry(0.8, 8).rotateX(-Math.PI / 2), 0xe2ffd2), -44.4, G.floorZ + 0.3, 0.035, 0.8), { noCast: true });
}

// The Sunken Boat and the Old Anchor are drawn by the wreck stage (reefwreckdeep.js: one set of attachment points each, so every piece touches its neighbour); this hands them
// what they need and draws the Glow Cave itself.
export function drawDeep(kit, M) {
  const env = { THREE: T3, paint, reefY, D }; // (the kit's named three members: the whole namespace handed on would keep all of three in start-up)
  ST.wreck.drawBoat?.(kit, M, env);
  ST.wreck.drawAnchor?.(kit, M, env);
  drawGlowCave(kit, M);
}
