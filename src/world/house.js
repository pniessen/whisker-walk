// THE OLD HOUSE, DRAWN (Old House step 1). Every position comes from houseplan.js;
// houseparts.js makes the pieces; this file puts them in the scene and hands the
// walk its record. A big old house on split levels in a hedged garden, cosy and a
// little mysterious, never scary: warm wood, wallpaper, old lamps, a dim friendly
// cellar.
//
// THE SCENE. One top-level Group of wall-section meshes per level (noMerge, so the
// walk's prop merge keeps every section its own mesh for house life to sink;
// userData.houseWalls = the level). The floors, the stairs and the skirts under the
// raised rooms are top-level meshes. Window panes are top-level meshes too: the
// tree fade takes any group holding a window for a building and would fade a whole
// floor of the house. One lamp per room, two in the cellar, always drawn; at dusk
// their globes glow (render/dusk.js) and the walk paints a pool under each, cut to
// its own room at the walls' inner faces (lampPoolClip): the light stays inside.
// The furniture: a top-level group per tall piece and per room, and a stand-in per
// level, all tagged for the level drawing (furnish, below). Outside: the lawn (a hole where the cellar and its stair go down), a hedge ring,
// three neighbours' houses and four trees, all at least 8 m outside the bounds. The
// cellar, sunk beside the house, wears a turf lid over it and its stair (owner's fix B),
// so from outside it is garden; house life hides it whenever she is down there.
//
// No people, no resident cat, no strays (U12, U14): critterSpawns holds only the
// house's mice (step 2, D10) and strays is false; step 2's finds are housethings.js's
// data. The front door is shut (U13) unless the walk hands build a house-town gate end
// (step 4, W7): then its two leaves are pivots (house.parts.frontDoor) house life swings.
// Everything is made inside one withLocalUuids, so the build draws nothing from
// Math.random; variation is hash01.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createHouseGlow } from './houseglow.js';
import { hash01, applySky, tree, house as neighbourHouse } from './builder.js';
import { litMaterial, tileMetres } from '../render/materials.js';
import { withLocalUuids } from './localuuids.js';
import { words } from '../wordset.js';
import {
  HOUSE_BOUNDS, HOUSE_FRONT_DOOR, LAWN_Y, WALL_T, fades, LEDGE_FADE_OVER, HOUSE_KITTEN_HOME, houseArea, houseFloorGround,
  secretColliders, wardrobeColliders, roomAt, zoneOfRoom, WING_JOINS, OLD_HOUSE_PLAN, planOf, withPlan, activePlan,
} from './houseplan.js';
import { ST } from './housestages.js'; // the wing's drawing and life (the lazy wing stage, housestagewing.js)
import { HOUSE_WING_FINDS, HOUSE_WING_SLOTS, HOUSE_WING_RESTS, SLOT_SIZE } from './housewingthings.js';
import './housewingwords.js';
import { houseMovesArea, bareMovesArea } from './housemoves.js';
import {
  HOUSE_ATLAS_CELLS as CELL, cellUV, createHouseAtlas, houseMaterial, sectionMesh, paneMesh, floorMesh, stairMesh,
  skirtMesh, lampGroup, partsKit, kitBox, kitFace, kitMesh, FRONT_DOOR_W, furnitureMesh, flatsMesh, standInMesh,
  cellarLidMeshes, secretBookcaseGroup, plankMesh, pawMarksMesh, findParts, houseSconceSpots,
} from './houseparts.js';
import { fullLevels } from '../houselevels.js';
import { createHouseLife } from './houselife.js';
import {
  HOUSE_KNOCKABLES, HOUSE_HIDES, HOUSE_MICE, HOUSE_YARN_SPOTS, HOUSE_SCENICS, HOUSE_FINDS,
  HOUSE_GOAL_TYPES, HOUSE_MAP_GROUND, houseMapShapes, HOUSE_BOXES,
} from './housethings.js';
import { phrase } from '../clanphrases.js';
import { isWalkableAt } from '../player.js';

const freeze = Object.freeze;

export const HOUSE_SKY = freeze({ top: 0x9fd4e8, horizon: 0xcfe8f0 });
export const HOUSE_SKY_DUSK = freeze({ top: 0x2a3a5e, horizon: 0x6a5a7e });
export const HOUSE_GROUND_BOUNCE = 0x8a6440;
// Dusk indoors is lamplight, not night: a warm low sun, a warm strong fill, the
// ground bounce kept, the haze far off. Never pitch-dark (the spec).
export const HOUSE_DUSK_LIGHT = freeze({
  sunColor: 0xffc890, sunIntensity: 0.5, hemiSky: 0xc8a07a, hemiIntensity: 0.85,
  groundDim: 0.8, envScale: 0.6, fogNear: 60, fogFar: 160,
});


// The garden, round the bounds: the hedge ring 9 m out, the neighbours and trees past it.
const HEDGE_OUT = 9;
const HEDGE = freeze({
  minX: HOUSE_BOUNDS.minX - HEDGE_OUT, maxX: HOUSE_BOUNDS.maxX + HEDGE_OUT,
  minZ: HOUSE_BOUNDS.minZ - HEDGE_OUT, maxZ: HOUSE_BOUNDS.maxZ + HEDGE_OUT,
});
const GATE_HALF = 1.6; // the gap in the hedge, on the front path
// a hedge piece's length: 1.6 m before the east wing lengthened the ring by 17%; 1.87 kept the ring's piece count (and its triangles), 1.9 keeps it with the wonder room's two metres more (x 52)
const HEDGE_STEP = 1.9;
export const HOUSE_NEIGHBOURS = freeze([
  freeze({ x: -8, z: -33, yaw: 0, body: 0xe8d8b0, roof: 0xb05a4a, surface: 'siding' }),
  freeze({ x: 12, z: -34, yaw: 0, body: 0xc98a6a, roof: 0x5e5258, surface: 'brick' }),
  freeze({ x: -44, z: 2, yaw: Math.PI / 2, body: 0xdcd0bc, roof: 0x8a4a3a, surface: 'siding' }),
]);
export const HOUSE_TREES = freeze([
  freeze({ x: -42, z: -22, scale: 1.3 }),
  freeze({ x: 70, z: -20, scale: 1.2 }),
  freeze({ x: 70, z: 18, scale: 1.35 }),
  freeze({ x: -42, z: 20, scale: 1.15 }),
]);
const LAWN_OUT = 220; // past the dusk haze's far end, so the lawn never shows an edge
const LAWN_COLOR = 0x6f9a52;
const HEDGE_COLOR = 0x4b7536;

// The plan being built (houseplan.js withPlan): the Old House unless build() is handed another.
const levelY = (id) => activePlan().levels.find((l) => l.id === id).y;
const roomOf = (id) => activePlan().rooms.find((r) => r.id === id);
// The zone a wall section is drawn with: the wing's rooms and its stair name theirs (houselevels.js),
// every old section is its level's and always drawn.
const sectionZone = (s) => {
  if (s.owner === 'wing' && activePlan().wing) return 'sun';
  if (s.owner === 'wonderstair' && activePlan().wing) return 'wonder'; // the secret stair is the wonder room's: drawn only once the wardrobe has been opened
  const r = roomOf(s.owner);
  return r ? zoneOfRoom(r) : s.level;
};
// A lamp's dusk pool is cut to its room, inside the walls (render/dusk.js createLampPools).
export const lampPoolClip = (room) => freeze({
  minX: room.minX + WALL_T / 2, maxX: room.maxX - WALL_T / 2,
  minZ: room.minZ + WALL_T / 2, maxZ: room.maxZ - WALL_T / 2,
});
// No contact-shadow blob (render/contactshadows.js): a stair's box is a slope, a pane's
// is a sliver in a wall, a room group's spans the room; none of them is a footprint.
const noBlob = (o) => {
  o.userData.noContactShadow = true;
  return o;
};

// outer minus holes, as non-overlapping rectangles (houseplan.js's cut, for the drawn lawn)
function rectMinus(outer, holes) {
  const xs = [...new Set([outer.minX, outer.maxX, ...holes.flatMap((h) => [h.minX, h.maxX])])].sort((a, b) => a - b);
  const zs = [...new Set([outer.minZ, outer.maxZ, ...holes.flatMap((h) => [h.minZ, h.maxZ])])].sort((a, b) => a - b);
  const out = [];
  for (let j = 0; j + 1 < zs.length; j++) {
    let run = null;
    for (let i = 0; i + 1 < xs.length; i++) {
      const mx = (xs[i] + xs[i + 1]) / 2;
      const mz = (zs[j] + zs[j + 1]) / 2;
      if (holes.some((h) => mx > h.minX && mx < h.maxX && mz > h.minZ && mz < h.maxZ)) {
        if (run) out.push(run);
        run = null;
      } else if (run) run.maxX = xs[i + 1];
      else run = { minX: xs[i], maxX: xs[i + 1], minZ: zs[j], maxZ: zs[j + 1] };
    }
    if (run) out.push(run);
  }
  return out;
}
const stairRect = (s) => {
  const hw = s.width / 2;
  return Math.abs(s.z1 - s.z0) >= Math.abs(s.x1 - s.x0)
    ? { minX: s.x0 - hw, maxX: s.x0 + hw, minZ: Math.min(s.z0, s.z1), maxZ: Math.max(s.z0, s.z1) }
    : { minX: Math.min(s.x0, s.x1), maxX: Math.max(s.x0, s.x1), minZ: s.z0 - hw, maxZ: s.z0 + hw };
};

// The lawn: one mesh on the grass texture, cut out under the house (the floors
// cover the ground rooms; the cellar and its stair are holes going down, cut to
// their walls' outsides, where their pits' linings meet the lawn).
function drawLawn(scene) {
  const P = activePlan();
  const HOUSE_BOUNDS = P.bounds;
  const tile = tileMetres('grass') || 4;
  const outer = {
    minX: HOUSE_BOUNDS.minX - LAWN_OUT, maxX: HOUSE_BOUNDS.maxX + LAWN_OUT,
    minZ: HOUSE_BOUNDS.minZ - LAWN_OUT, maxZ: HOUSE_BOUNDS.maxZ + LAWN_OUT,
  };
  const h = WALL_T / 2;
  const sunk = (y) => y < LAWN_Y - 1e-9;
  const holes = [
    ...P.rooms.map((r) => (sunk(levelY(r.level))
      ? { minX: r.minX - h, maxX: r.maxX + h, minZ: r.minZ - h, maxZ: r.maxZ + h } : r)),
    ...P.stairs.map((st) => {
      const r = stairRect(st);
      if (!sunk(Math.min(levelY(st.from), levelY(st.to)))) return r;
      return Math.abs(st.z1 - st.z0) >= Math.abs(st.x1 - st.x0)
        ? { ...r, minX: r.minX - h, maxX: r.maxX + h } : { ...r, minZ: r.minZ - h, maxZ: r.maxZ + h };
    }),
  ];
  const kit = partsKit();
  for (const r of rectMinus(outer, holes)) {
    const pts = [[r.minX, LAWN_Y, r.minZ], [r.maxX, LAWN_Y, r.minZ], [r.maxX, LAWN_Y, r.maxZ], [r.minX, LAWN_Y, r.maxZ]];
    kit.fan(pts, pts.map(([x, , z]) => [x / tile, z / tile]), [0, 1, 0]);
  }
  const mesh = kitMesh(kit, litMaterial(LAWN_COLOR, { surface: 'grass', repeat: [1, 1] }), 'houseLawn', { cast: false });
  // the dusk tint finds the lawn by this (game/walk.js)
  mesh.userData.ground = true;
  scene.add(mesh);
}

// A box without its underside (BoxGeometry's faces are px, nx, py, ny, pz, nz, six indices each): the hedge sits on the lawn.
// `ends`: also the two end faces of its length, 'x' (px, nx) or 'z' (pz, nz), which the next piece's slab hides but for a 0.25 m gap.
function noBottom(g, ends) {
  const gone = (i) => (i >= 18 && i < 24) || (ends === 'x' && i < 12) || (ends === 'z' && i >= 24);
  g.setIndex(Array.from(g.index.array).filter((_, i) => !gone(i)));
  g.clearGroups();
  return g;
}

// The garden's small things, folded into the front garden's own non-casting atlas mesh (no mesh, draw or caster more; the hedge
// mesh must stay 8 m out): flower beds along the house's walls
// (earth and leaf-green pads with blossoms of one flat colour each, a cell's middle; blossoms are three-sided cones).
function gardenDetail(kit) {
  const B = activePlan().bounds;
  const gx = HOUSE_FRONT_DOOR.x;
  const pw = FRONT_DOOR_W / 2 + 0.1;
  const pad = (x, z, w, d, rot, cell, y = 0.03) => {
    const c = Math.cos(rot), n = Math.sin(rot);
    const pts = [[-w, -d], [w, -d], [w, d], [-w, d]].map(([u, v]) => [x + (u * c - v * n) / 2, y, z + (u * n + v * c) / 2]);
    kit.fan(pts, pts.map(() => cellUV(cell, 0.5, 0.5)), [0, 1, 0]);
  };
  const bloom = (x, z, r, h, cell) => {
    const at = (k) => [x + r * Math.cos(k * 2.09), 0.03, z + r * Math.sin(k * 2.09)];
    for (let k = 0; k < 3; k++) kit.fan([at(k), at(k + 1), [x, 0.03 + h, z]], [0, 1, 2].map(() => cellUV(cell, 0.5, 0.5)));
  };
  const FLOWERS = [CELL.curtainRed, CELL.brass, CELL.plaster, CELL.curtainBlue];
  const bed = (x, z, w, salt) => {
    pad(x, z, w, 1, 0, CELL.darkWood);
    pad(x, z, w - 0.3, 0.7, 0, CELL.curtainGreen);
    for (let i = 0; i < 5; i++) {
      const h = hash01(x + i, z, salt);
      bloom(x + (h - 0.5) * (w - 0.2), z + (hash01(x, z + i, salt) - 0.5) * 0.8, 0.2 + 0.16 * h, 0.42, FLOWERS[Math.floor(h * 4)]); // beauty pass 2: bigger, bolder blooms (the same cones)
    }
  };
  // a bed in front of the house keeps clear of the path
  const ok = (x, z) => Math.abs(x - gx) > pw + 3 || z < B.maxZ;
  // path edging: flat dark stones laid along both edges of the flagstones, door to gate
  const pz0 = HOUSE_FRONT_DOOR.z + WALL_T / 2 + 0.35, pz1 = HEDGE.maxZ - 0.6;
  for (let z = pz0 + 0.3; z < pz1 - 0.2; z += 0.55) for (const s of [-1, 1]) {
    const j = hash01(z, s, 81);
    pad(gx + s * (pw + 0.12), z + (j - 0.5) * 0.12, 0.32 + 0.1 * j, 0.42, 0, CELL.darkWood);
  }
  // fallen leaves on the lawn (flat, turned every way, red, gold and brown) and daisies (white, a gold eye), thrown over the
  // garden between the hedge and the walls and kept off the path
  const leaf = [CELL.curtainRed, CELL.brass, CELL.darkWood];
  const open = (x, z) => Math.abs(x - gx) > pw + 0.6 || z < B.maxZ;
  // in drifts: a spot, then five or six things round it
  for (let k = 0; k < 110; k++) {
    const cx = HEDGE.minX + 2 + hash01(k, 1, 82) * (HEDGE.maxX - HEDGE.minX - 4);
    const cz = HEDGE.minZ + 2 + hash01(k, 2, 82) * (HEDGE.maxZ - HEDGE.minZ - 4);
    for (let i = 0; i < 5; i++) {
      const x = cx + (hash01(k, i, 83) - 0.5) * 2.4, z = cz + (hash01(k, i, 84) - 0.5) * 2.4;
      if (!open(x, z) || (x > B.minX - 0.3 && x < B.maxX + 0.3 && z > B.minZ - 0.3 && z < B.maxZ + 0.3)) continue;
      const h = hash01(k, i, 85);
      if (k % 3) { // a leaf is one pointed triangle (was a quad): the beauty pass pays for its birdbath and washing line with the saving
        const r = h * 6.28, c = Math.cos(r), n = Math.sin(r);
        kit.fan([[-0.25, -0.15], [0.25, 0], [-0.25, 0.15]].map(([u, v]) => [x + u * c - v * n, 0.045, z + u * n + v * c]), [0, 1, 2].map(() => cellUV(leaf[Math.floor(h * 3)], 0.5, 0.5)), [0, 1, 0]);
      } // above the beds' pads
      else { bloom(x, z, 0.14, 0.05, CELL.plaster); pad(x, z, 0.12, 0.12, 0, CELL.brass, 0.075); }
    }
  }
  // foundation beds along the walls, where she sees the lawn
  const found = (x, z, salt) => { if (ok(x, z)) bed(x, z, 2.6 + hash01(x, z, salt) * 1.2, salt); };
  for (let x = B.minX + 4; x < B.maxX - 3; x += 7.5 + 3 * hash01(x, 1, 71)) { found(x, B.minZ - 1.5, 72); found(x + 2, B.maxZ + 1.5, 73); }
  for (let z = B.minZ + 3; z < B.maxZ - 2; z += 7 + 3 * hash01(1, z, 74)) { found(B.minX - 1.5, z, 75); found(B.maxX + 1.5, z, 76); }
  gardenLife(kit, B, gx);
}

// The garden's still places (houseglow.js sways the kit's low things): the birdbath, the gate and the washing poles keep still.
function gardenKeep(B) {
  const gx = HOUSE_FRONT_DOOR.x;
  const lz = HEDGE.minZ + 1.9;
  return [
    { minX: HEDGE.minX + 3.2 - 1.0, maxX: HEDGE.minX + 3.2 + 1.0, minZ: HEDGE.maxZ - 3.2 - 1.0, maxZ: HEDGE.maxZ - 3.2 + 1.0 },
    { minX: gx - GATE_HALF - 0.3, maxX: gx + GATE_HALF + 0.3, minZ: HEDGE.maxZ - 0.4, maxZ: HEDGE.maxZ + 0.4 },
    { minX: B.minX + 4 - 0.3, maxX: B.minX + 13 + 0.3, minZ: lz - 0.3, maxZ: lz + 0.3 },
  ];
}

// Beauty pass 1 (2026-11-28): a stone birdbath with two small birds in the front garden's west corner, a robin on the gate post, a
// washing line along the back hedge (a sagging line, pegged shirts, towels and socks), and a few butterflies resting on the
// beds' blooms. Boxes without undersides, in the garden's one non-casting atlas mesh: no mesh, draw or caster more, nothing to
// walk on (they stand in the lawn's corners and the hedge's shade, where the cat has no use for them).
function gardenLife(kit, B, gx) {
  // beauty pass 2: the birds and butterflies were too small to see at play distance, so each is drawn at S times its size (the same boxes, no more triangles)
  const S = 2.4;
  const bird = (x, y, z, dir, body, belly) => {
    kitBox(kit, x - 0.05 * S, x + 0.05 * S, y, y + 0.09 * S, z - 0.07 * S, z + 0.07 * S, body, { skip: ['y-'] });
    kitBox(kit, x - 0.04 * S, x + 0.04 * S, y + 0.07 * S, y + 0.15 * S, z + dir * 0.06 * S - 0.04 * S, z + dir * 0.06 * S + 0.04 * S, body, { skip: ['y-'] });
    kitBox(kit, x - 0.04 * S, x + 0.04 * S, y, y + 0.06 * S, z + dir * 0.075 * S, z + dir * 0.075 * S + dir * 0.03 * S, belly, { skip: ['y-', dir > 0 ? 'z-' : 'z+'] }); // breast
    kitBox(kit, x - 0.03 * S, x + 0.03 * S, y + 0.05 * S, y + 0.07 * S, z - dir * 0.07 * S, z - dir * 0.18 * S, CELL.darkWood, { skip: ['y-', dir > 0 ? 'z+' : 'z-'] }); // tail
  };
  // the birdbath: foot, stem, a wide shallow bowl with water, two birds, a few pebbles
  const bx = HEDGE.minX + 3.2, bz = HEDGE.maxZ - 3.2;
  kitBox(kit, bx - 0.3, bx + 0.3, 0, 0.1, bz - 0.3, bz + 0.3, CELL.stone, { skip: ['y-'] });
  kitBox(kit, bx - 0.1, bx + 0.1, 0.1, 0.7, bz - 0.1, bz + 0.1, CELL.stone, { skip: ['y-', 'y+'] });
  kitBox(kit, bx - 0.4, bx + 0.4, 0.7, 0.82, bz - 0.4, bz + 0.4, CELL.stone, { skip: ['y-'] });
  kitFace(kit, 'y', 0.83, 1, [[bx - 0.32, bz - 0.32], [bx + 0.32, bz - 0.32], [bx + 0.32, bz + 0.32], [bx - 0.32, bz + 0.32]], CELL.curtainBlue);
  bird(bx - 0.18, 0.83, bz + 0.05, 1, CELL.curtainBlue, CELL.plaster); // a bluebird at the water
  bird(bx + 0.4, 0.82, bz - 0.2, -1, CELL.darkWood, CELL.brass); // a wren on the rim
  for (let i = 0; i < 6; i++) {
    const a = i * 1.1 + 0.4, r = 0.55 + 0.1 * hash01(i, 1, 91);
    const px = bx + r * Math.cos(a), pz = bz + r * Math.sin(a);
    kit.fan([[px - 0.07, 0.04, pz - 0.05], [px + 0.07, 0.04, pz - 0.05], [px + 0.04, 0.04, pz + 0.06], [px - 0.05, 0.04, pz + 0.05]],
      [0, 1, 2, 3].map(() => cellUV(CELL.stone, 0.5, 0.5)), [0, 1, 0]);
  }
  // a robin on the gate post, facing the street
  bird(gx - GATE_HALF - 0.05, 1.35, HEDGE.maxZ, 1, CELL.darkWood, CELL.curtainRed);
  // the washing line: two poles, a line with a little sag, pegged washing
  const lz = HEDGE.minZ + 1.9, lx0 = B.minX + 4, lx1 = B.minX + 13, top = 2.1;
  for (const x of [lx0, lx1]) kitBox(kit, x - 0.05, x + 0.05, 0, top, lz - 0.05, lz + 0.05, CELL.darkWood, { skip: ['y-'] });
  const line = (x) => top - 0.04 - 0.22 * Math.sin(((x - lx0) / (lx1 - lx0)) * Math.PI);
  for (let i = 0; i < 6; i++) {
    const xa = lx0 + ((lx1 - lx0) * i) / 6, xb = lx0 + ((lx1 - lx0) * (i + 1)) / 6;
    kit.fan([[xa, line(xa), lz], [xb, line(xb), lz], [xb, line(xb) - 0.025, lz], [xa, line(xa) - 0.025, lz]], [0, 1, 2, 3].map(() => cellUV(CELL.plaster, 0.5, 0.5)), [0, 0, 1]);
    kit.fan([[xb, line(xb), lz], [xa, line(xa), lz], [xa, line(xa) - 0.025, lz], [xb, line(xb) - 0.025, lz]], [0, 1, 2, 3].map(() => cellUV(CELL.plaster, 0.5, 0.5)), [0, 0, -1]);
  }
  // [x along the line, width, drop, cell]: a red shirt (with sleeves), a gingham towel, a sheet, a blue shirt, two socks
  const wash = [[0.9, 0.34, 0.42, CELL.curtainRed], [2.1, 0.5, 0.36, CELL.gingham], [3.5, 0.9, 0.62, CELL.plaster], [5.2, 0.34, 0.42, CELL.curtainBlue], [6.2, 0.1, 0.22, CELL.brass], [6.45, 0.1, 0.22, CELL.curtainGreen]];
  for (const [u, w, drop, cell] of wash) {
    const x = lx0 + u, y = line(x);
    kitBox(kit, x - w / 2, x + w / 2, y - drop, y - 0.02, lz - 0.012, lz + 0.012, cell, { skip: ['y+'] });
    if (w === 0.34) for (const s of [-1, 1]) kitBox(kit, x + s * (w / 2 + 0.07), x + s * (w / 2 + 0.01), y - 0.2, y - 0.02, lz - 0.012, lz + 0.012, cell, { skip: ['y+', 'x-', 'x+'] });
  }
  // butterflies resting on beds: two small wings, tipped open (placed by the beds' own hash, so one every third bed or so)
  for (let k = 0; k < 14; k++) {
    const x = B.minX + 2 + hash01(k, 3, 92) * (B.maxX - B.minX - 4), z = (k % 2 ? B.maxZ + 1.5 : B.minZ - 1.5) + (hash01(k, 4, 92) - 0.5) * 0.6;
    if (Math.abs(x - gx) < FRONT_DOOR_W / 2 + 3 && z > B.maxZ) continue;
    const cell = [CELL.brass, CELL.curtainBlue, CELL.plaster, CELL.curtainRed][k % 4];
    const y = 0.4; // over the bigger blooms
    for (const s of [-1, 1]) kit.fan([[x, y, z], [x + s * 0.1 * S, y + 0.05 * S, z - 0.07 * S], [x + s * 0.1 * S, y + 0.05 * S, z + 0.07 * S]], [0, 1, 2].map(() => cellUV(cell, 0.5, 0.5)));
  }
}

// The hedge ring: clipped runs of slightly different heights and greens, one mesh.
function drawHedge(scene) {
  const geos = [];
  const c = new THREE.Color();
  const piece = (cx, cz, along, w, h, d, k, endRun) => {
    for (const [bw, bh, bd, by, slab] of [[w, h, d, h / 2], [w * 0.82, 0.22, d * 0.8, h + 0.08, true]]) {
      const g = noBottom(along === 'x' ? new THREE.BoxGeometry(bw, bh, bd) : new THREE.BoxGeometry(bd, bh, bw), slab && !endRun ? along : undefined); // the underside is never seen
      g.translate(cx, by, cz);
      c.setHex(HEDGE_COLOR).multiplyScalar(k);
      const col = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geos.push(g);
    }
  };
  const run = (along, fixed, lo, hi, salt) => {
    const n = Math.max(1, Math.round((hi - lo) / HEDGE_STEP));
    const step = (hi - lo) / n;
    for (let i = 0; i < n; i++) {
      const m = lo + (i + 0.5) * step;
      const x = along === 'x' ? m : fixed;
      const z = along === 'x' ? fixed : m;
      const h = 1.3 + 0.35 * hash01(x, z, salt);
      const d = 1.05 + 0.2 * hash01(x, z, salt + 1);
      piece(x, z, along, step + 0.12, h, d, 0.85 + 0.25 * hash01(x, z, salt + 2), i === 0 || i === n - 1); // a run's ends stay closed
    }
  };
  const H = HEDGE;
  run('x', H.minZ, H.minX, H.maxX, 21); // north
  run('z', H.minX, H.minZ, H.maxZ, 24); // west
  run('z', H.maxX, H.minZ, H.maxZ, 27); // east
  // south, either side of the gate
  run('x', H.maxZ, H.minX, HOUSE_FRONT_DOOR.x - GATE_HALF, 30);
  run('x', H.maxZ, HOUSE_FRONT_DOOR.x + GATE_HALF, H.maxX, 33);
  const mesh = new THREE.Mesh(mergeGeometries(geos), litMaterial(0xffffff, { roughness: 0.85, vertexColors: true, flatShading: true }));
  mesh.name = 'houseHedge';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.noCast = true;
  scene.add(mesh);
}

// The front garden on the atlas: the flagstone path from the door to the gate,
// the gate posts and the shut wooden gate.
function drawGarden(scene, material, glow = null) {
  const kit = partsKit();
  const gx = HOUSE_FRONT_DOOR.x;
  const z0 = HOUSE_FRONT_DOOR.z + WALL_T / 2 + 0.35; // past the doorstep
  const z1 = HEDGE.maxZ - 0.6;
  const pw = FRONT_DOOR_W / 2 + 0.1;
  kitFace(kit, 'y', LAWN_Y + 0.012, 1, [[gx - pw, z0], [gx + pw, z0], [gx + pw, z1], [gx - pw, z1]], CELL.stone, [1.2, 1.2]);
  const zg = HEDGE.maxZ;
  for (const s of [-1, 1]) {
    const px = gx + s * (GATE_HALF + 0.05);
    kitBox(kit, px - 0.09, px + 0.09, 0, 1.35, zg - 0.09, zg + 0.09, CELL.darkWood, { skip: ['y-'] });
  }
  for (const y of [0.35, 0.85]) kitBox(kit, gx - GATE_HALF + 0.05, gx + GATE_HALF - 0.05, y, y + 0.08, zg - 0.03, zg + 0.03, CELL.lightWood);
  const slats = 9;
  for (let i = 0; i < slats; i++) {
    const x = gx - GATE_HALF + 0.2 + (i * (2 * GATE_HALF - 0.4)) / (slats - 1);
    const top = 1.0 + 0.06 * Math.cos(((i - (slats - 1) / 2) / ((slats - 1) / 2)) * (Math.PI / 2));
    kitBox(kit, x - 0.045, x + 0.045, 0.12, top, zg + 0.03, zg + 0.06, CELL.lightWood, { skip: ['y-'] });
  }
  gardenDetail(kit);
  scene.add(kitMesh(kit, glow ? glow.patch(material.clone(), true) : material, 'houseGarden', { cast: false })); // its own clone: only the garden's kit sways
}

function drawNeighbours(scene) {
  HOUSE_NEIGHBOURS.forEach((n, i) => {
    const g = neighbourHouse(n.x, n.z, n.body, n.roof, n.surface);
    g.rotation.y = n.yaw;
    g.name = `houseNeighbour:${i}`;
    scene.add(g);
  });
}

function drawTrees(scene, wind) {
  HOUSE_TREES.forEach((t, i) => {
    const g = tree(t.x, t.z, t.scale, { wind });
    g.name = `houseTree:${i}`;
    scene.add(g);
  });
}

const DEFAULT_START = 'ground';

// The house's lines for its data's `words` ids (housethings.js), in the word set of the moment.
function houseWords() {
  return {
    'house.scenic.clock': phrase('house.scenic.clock'),
    'house.scenic.fireside': phrase('house.scenic.fireside'),
    'house.scenic.attic-window': phrase('house.scenic.attic-window'),
    'house.yarn.hall': phrase('house.yarn.hall'),
    'house.yarn.kitchen': phrase('house.yarn.kitchen'),
    'house.yarn.living': phrase('house.yarn.living'),
  };
}

// The rooms furnished (houseplan.js HOUSE_FURNITURE, houseparts.js draws each piece).
// A piece that fades (houseplan.js fades: every tall piece, TALL_H and up, ruling H8, and
// the low ledge pieces the camera can come down inside, ruling S2-4) is a top-level group
// of its own at its spot, turned by rotY, with a fadeOccluder cylinder round its
// footprint, so the tree fade takes it when it stands between the camera and the cat; its
// cylinder reaches LEDGE_FADE_OVER above its top (houseplan.js): a ledge piece's since step 2,
// every piece's since the Task 10 review (a line grazing the ladder's top passed over the
// fade's own line, which runs on level past her). The rest of a room
// is one top-level group the walk's prop merge makes one mesh of; its walked-over
// pieces (rugs, the runner, cobwebs) are one more mesh in it, noMerge and noCast.
// Every one is tagged houseDetail with its level, for the level drawing (H6); each
// level also has one plain stand-in (houseSimple) shown when it is far. The drawing
// starts as on the ground level; house life (Task 6) keeps it up from there.
// Step 2 (Task 6): a find's moving parts (houseparts.js findParts: the clock's pendulum,
// the piano's keys, the toy box's lid and toys) stand with their piece, kept out of the
// prop merge; furnish hands them back by name for house life. Task 10: it hands back
// the fading pieces too, each group with its box, for house life's fade hold.
function furnish(scene, material, start, traversal) {
  const P = activePlan();
  const parts = {};
  const fading = [];
  const full = fullLevels(start, P.links);
  const tag = (o, level) => {
    o.userData.houseDetail = true;
    o.userData.houseLevel = level;
    o.visible = full.has(level);
  };
  for (const room of P.rooms) {
    const y = levelY(room.level);
    const group = new THREE.Group();
    group.name = `houseFurniture:${room.id}`;
    tag(group, zoneOfRoom(room));
    group.userData.houseRoom = room.id;
    const flats = [];
    for (const f of P.furniture.filter((q) => q.room === room.id)) {
      if (f.r === 0) { flats.push(f); continue; }
      const mesh = furnitureMesh(f, material);
      const moving = findParts(f, material);
      if (moving) Object.assign(parts, moving.parts);
      if (fades(f)) {
        const tall = new THREE.Group();
        tall.name = `houseFade:${f.id}`;
        tall.userData.houseRoomOf = room.id; // the level drawing's partial draw (houselevels.js) reads it
        tall.position.set(f.x, y, f.z);
        tall.rotation.y = f.rotY;
        tall.userData.fadeOccluder = [{ t: 'cyl', r: Math.hypot(f.w, f.d) / 2, y0: 0, y1: f.h + LEDGE_FADE_OVER }];
        tag(tall, zoneOfRoom(room));
        tall.add(mesh);
        if (moving) tall.add(...moving.objects);
        scene.add(tall);
        const turned = Math.abs(Math.sin(f.rotY)) > 0.5; // every fading piece stands square to the walls
        const hx = (turned ? f.d : f.w) / 2;
        const hz = (turned ? f.w : f.d) / 2;
        // its box: the footprint, from its floor to its top
        fading.push(freeze({ id: f.id, obj: tall, minX: f.x - hx, maxX: f.x + hx, minY: y, maxY: y + f.h, minZ: f.z - hz, maxZ: f.z + hz }));
        continue;
      }
      mesh.position.set(f.x, y, f.z);
      mesh.rotation.y = f.rotY;
      group.add(mesh);
      if (moving) {
        const at = new THREE.Group();
        at.position.copy(mesh.position);
        at.rotation.y = f.rotY;
        at.add(...moving.objects);
        group.add(at);
      }
    }
    if (flats.length) group.add(flatsMesh(flats, y, material, `houseFlats:${room.id}`));
    // step 2: a crossing's plank is its room's, lying on the two tops it joins
    for (const c of traversal.crossings) if (roomAt(c.ends[0].x, c.ends[0].z) === room.id) group.add(plankMesh(c, material));
    scene.add(noBlob(group));
  }
  // step 2: a ledge piece is drawn like any solid one, here as on its level's stand-in
  for (const l of P.levels) {
    const solid = P.furniture.filter((f) => f.level === l.id && !roomOf(f.room).zone && (f.r > 0 || f.ledge));
    if (!solid.length) continue;
    const m = standInMesh(l.id, solid, l.y);
    m.visible = !full.has(l.id);
    scene.add(m);
    // the level's far look for while a wing join is near (houselevels.js keep): all but the kept rooms
    for (const j of WING_JOINS.filter((q) => q.id === 'parlour-livingroom')) { // the door's: all but the parlour (outside, none)
      if (j.a !== l.id || !j.keep) continue;
      const far = standInMesh(l.id, solid.filter((f) => !j.keep.includes(f.room)), l.y);
      far.name = `houseStandInFar:${l.id}`;
      delete far.userData.houseSimple;
      far.userData.houseFar = l.id;
      far.visible = false;
      scene.add(far);
    }
  }
  // the wing's zones: one mesh a zone, dressed like its rooms (housewingfar.js), at most a few hundred triangles, no casters (houselevels.js)
  for (const z of P.zones.filter((q) => q.wing)) {
    const m = ST.wing.wingFarMesh(z.id, material.map);
    m.visible = !full.has(z.id);
    scene.add(m);
  }
  return { parts, fading };
}

// Step 2: a faint pair of paw prints at every hop's take-off (housemoves.js), one mesh per
// level, a level detail like the furniture, so the drawing shows only the levels in full.
function drawMarks(scene, traversal, start) {
  const full = fullLevels(start, activePlan().links);
  const byLevel = new Map();
  for (const h of traversal.hops) {
    const level = zoneOfRoom(roomOf(roomAt(h.x0, h.z0)));
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level).push({ x: h.x0, y: h.y0, z: h.z0, yaw: Math.atan2(h.x1 - h.x0, h.z1 - h.z0) });
  }
  for (const [level, spots] of byLevel) {
    const m = pawMarksMesh(level, spots);
    m.visible = full.has(level);
    scene.add(m);
  }
}

// The beauty pass's warm light, painted not lit: a faint additive pool under each lamp, a
// spill on the floor before each wall sconce and one before the hearth, a mesh per level (a level detail
// like the furniture). It reads by day too; at dusk it adds to the lamp pools.
const GLOW = freeze({ lamp: 1.9, sconce: 1.1, fire: 1.7, warm: [1.0, 0.74, 0.42], fireWarm: [1.0, 0.5, 0.2], seg: 12 });
function drawGlow(scene, start) {
  const P = activePlan();
  const full = fullLevels(start, P.links);
  const pools = new Map(P.zones.map((z) => [z.id, []]));
  for (const l of P.lamps) {
    const room = P.rooms.find((r) => r.id === l.room);
    pools.get(zoneOfRoom(room)).push({ x: l.x, y: levelY(room.level) + 0.02, z: l.z, r: GLOW.lamp, k: 0.17, c: GLOW.warm, clip: lampPoolClip(room) });
  }
  if (P.dressing) pools.get('ground').push({ x: 12.4, y: 0.02, z: 7.0, r: GLOW.fire, k: 0.26, c: GLOW.fireWarm, clip: lampPoolClip(P.rooms.find((r) => r.id === 'parlour')) });
  for (const sc of P.dressing ? houseSconceSpots() : []) {
    const room = P.rooms.find((r) => r.level === sc.level && roomAt(sc.x + sc.nx * 0.6, sc.z + sc.nz * 0.6) === r.id);
    pools.get(zoneOfRoom(room)).push({ x: sc.x + sc.nx * 0.5, y: levelY(sc.level) + 0.02, z: sc.z + sc.nz * 0.5, r: GLOW.sconce, k: 0.14, c: GLOW.warm, clip: lampPoolClip(room) });
  }
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const [level, list] of pools) {
    if (!list.length) continue;
    const pos = [];
    const col = [];
    const index = [];
    for (const p of list) {
      const base = pos.length / 3;
      pos.push(p.x, p.y, p.z);
      col.push(p.c[0] * p.k, p.c[1] * p.k, p.c[2] * p.k);
      for (let i = 0; i < GLOW.seg; i++) {
        const a = (i / GLOW.seg) * Math.PI * 2;
        const du = Math.cos(a) * p.r;
        const dv = Math.sin(a) * p.r;
        let x = p.x + du;
        let z = p.z + dv;
        if (p.clip) { x = Math.min(p.clip.maxX, Math.max(p.clip.minX, x)); z = Math.min(p.clip.maxZ, Math.max(p.clip.minZ, z)); }
        pos.push(x, p.y, z);
        col.push(0, 0, 0);
        index.push(base, base + 1 + ((i + 1) % GLOW.seg), base + 1 + i);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(index);
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.name = `houseGlow:${level}`;
    m.castShadow = false;
    m.receiveShadow = false;
    m.userData = { noCast: true, dressing: true, noMerge: true, noContactShadow: true, houseDetail: true, houseLevel: level };
    m.visible = full.has(level);
    scene.add(m);
  }
}

// What a plan with no dressing of its own has for the walk's things: none of the Old House's.
const NO_THINGS = freeze({
  knockables: freeze([]), hides: freeze([]), mice: freeze([]), yarnSpots: freeze([]), scenics: freeze([]), finds: freeze([]),
  goalTypes: freeze([]), mapGround: HOUSE_MAP_GROUND, mapShapes: freeze([]), boxes: freeze([]),
});

// `plan` (default: the Old House, houseplan.js OLD_HOUSE_PLAN) is the house to build: the same walls, floors,
// stairs, glass and level drawing, over its own rooms. A plan with `dressing` (the Old House) also gets
// the garden, the hedge, the neighbours and the things she does there; any other plan brings its own
// furniture, lamps and `things` (optional rows, houseplan.js) or has none.
export function build(scene, { wind, gateEnds = [], plan: given = OLD_HOUSE_PLAN } = {}) {
  const P = planOf(given);
  return withPlan(P, () => buildPlan(scene, P, { wind, gateEnds }));
}

function buildPlan(scene, P, { wind, gateEnds }) {
  // gateEnds: the walk's gate ends; a house-town end makes the front door one that opens
  const openDoor = gateEnds.some((e) => e.id === 'house-town');
  const old = P === OLD_HOUSE_PLAN;
  const START_LEVEL = P.start ?? DEFAULT_START;
  const T = old ? {
    knockables: HOUSE_KNOCKABLES, hides: HOUSE_HIDES, mice: HOUSE_MICE, yarnSpots: HOUSE_YARN_SPOTS, scenics: HOUSE_SCENICS, finds: HOUSE_FINDS,
    goalTypes: HOUSE_GOAL_TYPES, mapGround: HOUSE_MAP_GROUND, mapShapes: houseMapShapes(), boxes: HOUSE_BOXES,
  } : { ...NO_THINGS, ...(P.things ?? {}) };
  return withLocalUuids(old ? 'house' : P.id, () => {
    // the plan with its moves and perches (step 2): the furniture tops she stands on are ground
    const plan = old ? houseMovesArea(houseArea()) : bareMovesArea(houseArea(P));
    applySky(scene, HOUSE_SKY.top, HOUSE_SKY.horizon);
    const material = houseMaterial(createHouseAtlas());
    // beauty pass 2 (houseglow.js): window light, lamp and firelight, the golden grade, stirring curtains and the garden's sway, all in a shader patch on the atlas material
    const glow = old ? createHouseGlow({
      windows: P.windows, rooms: P.rooms, levels: plan.levels, lamps: P.lamps, sconces: houseSconceSpots(), keep: gardenKeep(P.bounds),
    }) : null;
    glow?.patch(material);

    // the walls, one group per level, one mesh per section
    const sectionMeshes = new Map();
    const panes = new Map();
    const groups = new Map();
    // one group per zone: the old levels' are always drawn; each wing zone's is a level detail
    // (houseDetail + houseLevel), drawn only while she is in the zone or near the way into it
    for (const z of P.zones) {
      const g = new THREE.Group();
      g.name = `houseWalls:${z.id}`;
      g.userData.noMerge = true;
      g.userData.houseWalls = z.id;
      if (z.wing) g.userData.noContactShadow = true; // a wing room's wall group is no footprint: the bathroom's box was one (a black blotch on its floor)
      if (z.wing) {
        g.userData.houseDetail = true;
        g.userData.houseLevel = z.id;
        g.visible = false; // not near at the start: the level drawing shows it
      }
      groups.set(z.id, g);
    }
    for (const s of plan.sections) {
      const m = sectionMesh(s, material, { sections: plan.sections, openDoor });
      if (glow && m.userData.decoMat) glow.patch(m.userData.decoMat); // a clone does not carry the patch
      const zone = sectionZone(s);
      groups.get(zone).add(m);
      sectionMeshes.set(s.id, m);
      if (s.window) {
        const pane = paneMesh(s, s.window);
        if (P.wing?.isWing(zone)) pane.userData.paneZone = zone; // house life shows it with its zone and its wall
        panes.set(s.id, [pane]);
      }
    }
    for (const g of groups.values()) scene.add(g);
    for (const list of panes.values()) for (const p of list) {
      if (p.userData.paneZone) p.visible = false;
      scene.add(noBlob(p));
    }

    // a wing room's floor and the brick under it are its zone's, drawn with it (its far box stands
    // from the lawn up, houseWingBox)
    const withZone = (o, r) => {
      if (r.zone) {
        o.userData.houseDetail = true;
        o.userData.houseLevel = r.zone;
        o.visible = false;
      }
      return o;
    };
    for (const r of P.rooms) {
      scene.add(withZone(floorMesh(r, material), r));
      const skirt = skirtMesh(r, material);
      if (skirt) scene.add(withZone(skirt, r));
    }
    for (const s of P.stairs) {
      const m = noBlob(stairMesh(s, material));
      if (s.id === 'wing' && P.wing) { // the wing stair is the east zone's detail, its far look a wedge in the zone's stand-in
        m.userData.houseDetail = true;
        m.userData.houseLevel = 'sun';
        m.visible = false;
      } else if (s.id === 'wonderstair' && P.wing) {
        m.userData.houseDetail = true;
        m.userData.houseLevel = 'wonder';
        m.visible = false;
      }
      scene.add(m);
    }

    P.lamps.forEach((l, i) => {
      const room = P.rooms.find((r) => r.id === l.room);
      const g = lampGroup(l.kind, l.x, levelY(room.level), l.z, material);
      g.name = `houseLamp:${l.room}:${i}`;
      // its dusk pool stays in its room, cut at the walls' inner faces (render/dusk.js)
      g.userData.lampPoolClip = lampPoolClip(room);
      if (room.zone) { // a wing lamp is a zone detail
        g.userData.houseDetail = true;
        g.userData.houseLevel = room.zone;
        g.visible = false;
      }
      scene.add(g);
    });
    const { parts, fading } = furnish(scene, material, START_LEVEL, plan.traversal);
    // the front door's two leaves, each a pivot at its hinge (west, east), or null when shut for good
    const pivots = [...sectionMeshes.values()].map((m) => m.userData.doorPivot).filter(Boolean)
      .sort((a, b) => a.position.x - b.position.x);
    parts.frontDoor = pivots.length === 2 ? { left: pivots[0], right: pivots[1] } : null;
    drawMarks(scene, plan.traversal, START_LEVEL);
    drawGlow(scene, START_LEVEL);
    // the secret wonder room's hanging and moving parts (milestone 3): the kids' wardrobe's leaf, the feather wand, the string lights, the skylight's pool
    const wonder = old && P.wing ? ST.wing.wonderParts(material) : null;
    if (wonder) {
      const shown = fullLevels(START_LEVEL, P.links);
      for (const o of [wonder.wardrobe, wonder.wand, wonder.lights, wonder.pool]) { o.visible = shown.has(o.userData.houseLevel); scene.add(o); }
      scene.add(wonder.lightUnder);
    }
    // the solarium's sunny slots (the wing's milestone 2): one decal mesh, shown with its zone
    let sun = null;
    if (old && P.wing) {
      sun = ST.wing.sunPatchMesh(HOUSE_WING_SLOTS, levelY('ground'), SLOT_SIZE, 'sun');
      sun.visible = fullLevels(START_LEVEL, P.links).has('sun');
      scene.add(sun);
    }
    // the secret stair's bookcase, shut in the library's north wall (step 2, ruling D9)
    const secretGroup = P.secret ? secretBookcaseGroup(material) : null;
    if (secretGroup) {
      secretGroup.visible = fullLevels(START_LEVEL, P.links).has(secretGroup.userData.houseLevel);
      scene.add(secretGroup);
    }

    drawLawn(scene);
    // the cellar's turf lid: garden from outside, out of the way when she is down there (house life)
    const lidMeshes = P.cellarLid ? cellarLidMeshes(P.cellarLid, material, litMaterial(LAWN_COLOR, { surface: 'grass', repeat: [1, 1] }), tileMetres('grass') || 4) : [];
    for (const m of lidMeshes) scene.add(m);
    if (P.dressing) {
      drawHedge(scene);
      drawGarden(scene, material, glow);
      drawNeighbours(scene);
      drawTrees(scene, wind);
    }

    const floor = houseFloorGround(P);
    const said = old ? houseWords() : {};
    const areaData = {
      name: old ? words().PLACE_WORDS.house : (P.name ?? P.id),
      ground: plan.ground,
      colliders: plan.colliders, // the walls', the furniture's, the lamps' and the shut bookcase's (houseColliders)
      bounds: { ...P.bounds },
      spawn: { ...plan.spawn },
      kittenHome: { ...(old ? HOUSE_KITTEN_HOME : P.kittenHome ?? P.spawn) }, // Mochi's circle: the hall's middle, clear of the door and the lamp
      pois: [],
      collectibles: [],
      // the grandfather clock, the fireside, the round attic window (step 2, D13)
      scenics: T.scenics.map((c) => ({ id: c.id, x: c.x, z: c.z, label: c.label ?? said[c.words] })),
      // mice in the pantry corner and the cellar, and nothing else: no people, no resident cat (U14, D10)
      critterSpawns: T.mice.map(({ room, ...m }) => m), // eslint-disable-line no-unused-vars
      knockables: HOUSE_KNOCKABLES, // on the perches' pieces (D4)
      hides: HOUSE_HIDES, // the mice's cover, each in its mouse's room (D10)
      yarnSpots: T.yarnSpots.map((s) => ({ x: s.x, z: s.z, where: said[s.words] })), // D14
      goalTypes: HOUSE_GOAL_TYPES, // D11
      mapShapes: houseMapShapes(), // the floor plan (D12), without the wonder room and its stair until the kids' wardrobe has been opened (reveal)
      mapVersion: 0, // the minimap repaints its floor plan when this moves (ui/minimap.js)
      mapGround: T.mapGround,
      moments: [],
      puddles: [],
      rests: old ? HOUSE_WING_RESTS : freeze([]), // the sofa's seat and the four sunny slots: places to nap (rests.js)
      boxes: T.boxes, // the blanket fort and the laundry basket she can sit in (the `sits` goal)
      perches: plan.perches.map((p) => ({ ...p })), // the knock-over pieces' tops (step 2, D4)
      tippables: [],
      groundBounce: HOUSE_GROUND_BOUNCE,
      skyDusk: HOUSE_SKY_DUSK,
      duskLight: HOUSE_DUSK_LIGHT,
      strays: false, // no strays, wanderer or ghosts indoors (U12)
      traversal: plan.traversal, // the climbs, drops, leaps and the plank up the furniture (step 2, D2)
      // the camera keeps out of the floors, not the furniture tops (step 2, Task 3): a bookcase's
      // end would snap the view in from metres out. Tall pieces fade; walls sink.
      cameraGround: floor,
      house: {
        levels: plan.levels,
        links: plan.links,
        // the east wing's zones (houselevels.js): her position names the wing zone she is in
        wing: P.wing,
        sections: plan.sections,
        start: START_LEVEL,
        sectionMeshes,
        panes,
        lid: P.cellarLid,
        plan: P, // house life reads its windows, rooms, stairs and front door from it
        lidMeshes,
        // the secret bookcase and its collider rows (`secret: true`): colliders holds the shut one;
        // open into the library (from the stair) or into the stair (from the library, rough edge 3)
        secret: !P.secret ? null : { group: secretGroup, shut: secretColliders(false), open: secretColliders(true), stair: secretColliders(true, 'stair') },
        // the kids' wardrobe the same way (`wardrobe: true` colliders; the wonder stair's mouth), the wonder room's parts, and what shows the secret on the corner map
        wardrobe: !wonder ? null : { group: wonder.wardrobe, shut: wardrobeColliders(false), open: wardrobeColliders(true, 'room'), stair: wardrobeColliders(true, 'stair') },
        wonder,
        reveal: !wonder ? null : (open) => { areaData.mapShapes = houseMapShapes({ open }); areaData.mapVersion = (areaData.mapVersion ?? 0) + 1; },
        // the ground without the ledges: the level drawing reads the floor under her (step 2, D3)
        floor,
        // the six discoveries' spots (step 2, D6) and their moving parts: house life runs them
        finds: T.finds,
        wingFinds: old ? HOUSE_WING_FINDS : freeze([]), // the east wing's discoveries (housewingfinds.js)
        wingSlots: old ? HOUSE_WING_SLOTS : freeze([]),
        sun, // the slots' patch of light (the wing's milestone 2)
        parts,
        glow, // houseglow.js: house life drives its uniforms
        // the pieces that fade, with their boxes: house life holds each solid unless it
        // stands between the camera and her (Task 10)
        fading,
      },
    };
    // A walk picked up again finds her where she was (Review Focus 5): a spot she can stand
    // on is kept, a wardrobe top by the outer wall included; walk.js clears any other.
    areaData.restSpot = (x, z) => (isWalkableAt(areaData, x, z) ? { x, z } : null);
    // every frame: the walls between the camera and the cat sink, and the levels are drawn for hers
    // and the six finds, and the yarn ball kept out of the walls (step 2, Task 6): the walk's
    // log, sound and ball, and its live colliders (the bookcase's row swaps there)
    // `now` is the clock the clock strikes by (the picture page pins it; the walk passes none)
    areaData.life = ({ scene: lifeScene, reducedMotion, log, audio, toy, dusk, now }) => createHouseLife(lifeScene, areaData.house, {
      reducedMotion, log, audio, toy, dusk, now, colliders: areaData.colliders,
    });
    return areaData;
  });
}
