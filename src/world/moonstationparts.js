// =============================================================================
// THE MOON'S OLD RELAY STATION AS DRAWING (milestone M1). Two parts, so the zone (world/moonzones.js wing E, `near` 26) can hold the station as a stand-in:
//   the STAND-IN   'moonE:far' (one stone mesh, always drawn once the stage is in): the low walls, the pillars, the tower's legs, ledge and tall mast, about 600 triangles;
//   the DETAIL     within 26 m: 'moonE:paint' (the tower's braces and railing, the console, the dish, six solar panels, hazard bands) and 'moonE:glow' (the blink lights and the
//                  console's screen: one unlit material whose brightness is the blink). Three draws at most; no light of its own. No random number but one seeded stream (the walls' heights).
// =============================================================================
import * as THREE from 'three';
import { mulberry32 } from '../rng.js';
import { createKit, paint, box, cyl, at, moonMaterials } from './moonparts.js';
import { STATION as S, WALL, WALL_TOP, CONSOLE, DISH, PANELS, BEACONS, WAYS } from './moonstationplan.js';

export const COL = Object.freeze({ stone: 0x9b9899, top: 0xb4b2b1, band: 0x7c7a7d, white: 0xf1f3f8, steel: 0x7d848f, navy: 0x141b2e, hazard: 0xf0c43c, lamp: 0xffd987, panel: 0x1f3f6e, cell: 0x2f5c9a, red: 0xd8503c });
const TAU = Math.PI * 2;

/** drawStation(M, { lite }) -> { far: Group, near: Group, glow: material }: nothing here is added to a scene. */
export function drawStation(M = moonMaterials(), { lite = false } = {}) {
  const rng = mulberry32(0x72656c61); // 'rela': the walls' heights, one value a circle in a fixed order
  const far = createKit('moonE');
  const near = createKit('moonE');
  // the walls: a low block along each circle's tangent, a different old height each; the arcs' two end circles are pillars (a square post a little taller)
  for (const w of WALL) {
    if (w.end) {
      far.put('far', M.stone, paint(at(box(0.8, WALL_TOP.pier, 0.8), w.x, w.z, WALL_TOP.pier / 2, -w.a), COL.top));
      continue;
    }
    const h = WALL_TOP.min + (WALL_TOP.max - WALL_TOP.min) * rng();
    far.put('far', M.stone, paint(at(box(0.95, h, 0.55), w.x, w.z, h / 2, -w.a - Math.PI / 2), COL.stone));
  }
  // the tower: four slim legs under a round ledge 3.0 m up, a square footing, a tall mast and its crossbar
  const L = S.ledge;
  far.put('far', M.stone, paint(at(cyl(S.mast * 0.95, S.mast * 1.1, 0.25, 8), S.x, S.z, 0.12), COL.band));
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    far.put('far', M.stone, paint(at(cyl(0.07, 0.09, L + 0.05, 5), S.x + Math.cos(a) * 0.64, S.z + Math.sin(a) * 0.64, L / 2), COL.steel));
  }
  far.put('far', M.stone, paint(at(cyl(S.ledgeR, S.ledgeR, 0.18, 14), S.x, S.z, L - 0.09), COL.top));
  far.put('far', M.stone, paint(at(cyl(0.06, 0.08, 3.6, 5), S.x, S.z, L + 1.8), COL.steel));
  far.put('far', M.stone, paint(at(box(1.5, 0.08, 0.08), S.x, S.z, 5.6), COL.steel));
  // ---- the detail ----
  // the ledge's railing (six posts and a ring) and a hazard band under its rim
  for (let i = 0; i < (lite ? 0 : 6); i++) {
    const a = (i / 6) * TAU;
    near.put('paint', M.paint, paint(at(cyl(0.03, 0.03, 0.5, 4), S.x + Math.cos(a) * (S.ledgeR - 0.1), S.z + Math.sin(a) * (S.ledgeR - 0.1), L + 0.25), COL.steel));
  }
  near.put('paint', M.paint, paint(at(new THREE.TorusGeometry(S.ledgeR - 0.1, 0.025, 3, 18).rotateX(Math.PI / 2), S.x, S.z, L + 0.5), COL.white), { noCast: true });
  near.put('paint', M.paint, paint(at(new THREE.TorusGeometry(S.ledgeR, 0.05, 3, 18).rotateX(Math.PI / 2), S.x, S.z, L - 0.22), COL.hazard), { noCast: true });
  // two cross braces on the legs
  for (const y of [1.0, 2.0]) near.put('paint', M.paint, paint(at(new THREE.TorusGeometry(0.6 - y * 0.05, 0.03, 3, 8).rotateX(Math.PI / 2), S.x, S.z, y), COL.steel));
  // a small dish on the tall mast, turned toward Earth (north, a little east)
  near.put('paint', M.paint, paint(at(new THREE.SphereGeometry(0.5, 10, 4, 0, TAU, 0, 1.0), S.x, S.z, 4.9, 0.2), COL.white));
  // the console: a desk with a slanted top, and a dark back
  near.put('paint', M.paint, paint(at(box(1.1, 0.75, 0.7), CONSOLE.x, CONSOLE.z, 0.375, 0.5), COL.steel));
  near.put('paint', M.paint, paint(at(box(1.15, 0.08, 0.75), CONSOLE.x, CONSOLE.z, 0.79, 0.5), COL.white));
  // the dish on its post
  near.put('paint', M.paint, paint(at(cyl(0.05, 0.07, DISH.y, 5), DISH.x, DISH.z, DISH.y / 2), COL.steel));
  near.put('paint', M.paint, paint(at(new THREE.SphereGeometry(0.75, 12, 4, 0, TAU, 0, 0.8), DISH.x, DISH.z, DISH.y + 0.1, 0.6), COL.white));
  near.put('paint', M.paint, paint(at(cyl(0.025, 0.025, 0.6, 4), DISH.x, DISH.z, DISH.y + 0.5), COL.steel));
  // six solar panels on short stands, leaning toward the sun (low and soft: nothing here is solid)
  for (const p of lite ? PANELS.filter((q) => !(q.row && q.x > 41)) : PANELS) { // (the lite rung draws four)
    near.put('paint', M.paint, paint(at(box(1.3, 0.05, 0.9), p.x, p.z, 0.42, p.yaw), COL.panel));
    near.put('paint', M.paint, paint(at(box(1.18, 0.052, 0.78), p.x, p.z, 0.425, p.yaw), COL.cell));
    near.put('paint', M.paint, paint(at(cyl(0.04, 0.04, 0.4, 4), p.x, p.z, 0.2), COL.steel));
  }
  // hazard stripes across the four ways, on the dust
  for (const w of lite ? [] : WAYS) near.put('paint', M.paint, paint(at(box(2.6, 0.03, 0.22), w.x, w.z, 0.03, -w.a - Math.PI / 2), COL.hazard), { noCast: true });
  // the glow: blink lights on the mast's top and a pier at each way, and the console's screen
  for (const b of BEACONS) near.put('glow', M.glow, paint(at(new THREE.SphereGeometry(0.12, 8, 6), b.x, b.z, b.y), COL.lamp), { noCast: true });
  near.put('glow', M.glow, paint(at(box(0.9, 0.04, 0.4), CONSOLE.x, CONSOLE.z, 0.84, 0.5), 0x9ff1ff), { noCast: true });

  const far0 = new THREE.Group();
  far0.name = 'moon:stationfar';
  for (const m of far.meshes()) far0.add(m);
  const near0 = new THREE.Group();
  near0.name = 'moon:station';
  for (const m of near.meshes()) near0.add(m);
  return { far: far0, near: near0, glow: M.glow };
}
