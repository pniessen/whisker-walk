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
// No people, no resident cat, no strays (U12, U14): critterSpawns is empty and
// strays is false. The front door is shut (U13): build takes the walk's gateEnds
// and, in step 1, ignores them; step 4 opens the door when a house-town end comes.
// Everything is made inside one withLocalUuids, so the build draws nothing from
// Math.random; variation is hash01.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash01, applySky, tree, house as neighbourHouse } from './builder.js';
import { litMaterial, tileMetres } from '../render/materials.js';
import { withLocalUuids } from './localuuids.js';
import { words } from '../wordset.js';
import {
  HOUSE_LEVELS, HOUSE_ROOMS, HOUSE_STAIRS, HOUSE_BOUNDS, HOUSE_FRONT_DOOR, HOUSE_LAMPS, HOUSE_FURNITURE, LEVEL_LINKS,
  LAWN_Y, WALL_T, TALL_H, HOUSE_KITTEN_HOME, HOUSE_CELLAR_LID, houseArea, houseFloorGround, secretColliders, roomAt, levelAt,
} from './houseplan.js';
import { houseMovesArea } from './housemoves.js';
import {
  HOUSE_ATLAS_CELLS as CELL, createHouseAtlas, houseMaterial, sectionMesh, paneMesh, floorMesh, stairMesh,
  skirtMesh, lampGroup, partsKit, kitBox, kitFace, kitMesh, FRONT_DOOR_W, furnitureMesh, flatsMesh, standInMesh,
  cellarLidMeshes, secretBookcaseGroup, plankMesh, pawMarksMesh,
} from './houseparts.js';
import { fullLevels } from '../houselevels.js';
import { createHouseLife } from './houselife.js';

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
export const HOUSE_NEIGHBOURS = freeze([
  freeze({ x: -8, z: -33, yaw: 0, body: 0xe8d8b0, roof: 0xb05a4a, surface: 'siding' }),
  freeze({ x: 12, z: -34, yaw: 0, body: 0xc98a6a, roof: 0x5e5258, surface: 'brick' }),
  freeze({ x: -44, z: 2, yaw: Math.PI / 2, body: 0xdcd0bc, roof: 0x8a4a3a, surface: 'siding' }),
]);
export const HOUSE_TREES = freeze([
  freeze({ x: -42, z: -22, scale: 1.3 }),
  freeze({ x: 48, z: -20, scale: 1.2 }),
  freeze({ x: 48, z: 18, scale: 1.35 }),
  freeze({ x: -42, z: 20, scale: 1.15 }),
]);
const LAWN_OUT = 220; // past the dusk haze's far end, so the lawn never shows an edge
const LAWN_COLOR = 0x6f9a52;
const HEDGE_COLOR = 0x4b7536;

const levelY = (id) => HOUSE_LEVELS.find((l) => l.id === id).y;
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
  const tile = tileMetres('grass') || 4;
  const outer = {
    minX: HOUSE_BOUNDS.minX - LAWN_OUT, maxX: HOUSE_BOUNDS.maxX + LAWN_OUT,
    minZ: HOUSE_BOUNDS.minZ - LAWN_OUT, maxZ: HOUSE_BOUNDS.maxZ + LAWN_OUT,
  };
  const h = WALL_T / 2;
  const sunk = (y) => y < LAWN_Y - 1e-9;
  const holes = [
    ...HOUSE_ROOMS.map((r) => (sunk(levelY(r.level))
      ? { minX: r.minX - h, maxX: r.maxX + h, minZ: r.minZ - h, maxZ: r.maxZ + h } : r)),
    ...HOUSE_STAIRS.map((st) => {
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

// The hedge ring: clipped runs of slightly different heights and greens, one mesh.
function drawHedge(scene) {
  const geos = [];
  const c = new THREE.Color();
  const piece = (cx, cz, along, w, h, d, k) => {
    for (const [bw, bh, bd, by] of [[w, h, d, h / 2], [w * 0.82, 0.22, d * 0.8, h + 0.08]]) {
      const g = along === 'x' ? new THREE.BoxGeometry(bw, bh, bd) : new THREE.BoxGeometry(bd, bh, bw);
      g.translate(cx, by, cz);
      c.setHex(HEDGE_COLOR).multiplyScalar(k);
      const col = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geos.push(g);
    }
  };
  const run = (along, fixed, lo, hi, salt) => {
    const n = Math.max(1, Math.round((hi - lo) / 1.6));
    const step = (hi - lo) / n;
    for (let i = 0; i < n; i++) {
      const m = lo + (i + 0.5) * step;
      const x = along === 'x' ? m : fixed;
      const z = along === 'x' ? fixed : m;
      const h = 1.3 + 0.35 * hash01(x, z, salt);
      const d = 1.05 + 0.2 * hash01(x, z, salt + 1);
      piece(x, z, along, step + 0.12, h, d, 0.85 + 0.25 * hash01(x, z, salt + 2));
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
function drawGarden(scene, material) {
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
  scene.add(kitMesh(kit, material, 'houseGarden', { cast: false }));
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

const START_LEVEL = 'ground';

// The rooms furnished (houseplan.js HOUSE_FURNITURE, houseparts.js draws each piece).
// A tall piece (TALL_H and up) is a top-level group of its own at its spot, turned
// by rotY, with a fadeOccluder cylinder round its footprint, so the tree fade takes
// it when it stands between the camera and the cat (ruling H8). The rest of a room
// is one top-level group the walk's prop merge makes one mesh of; its walked-over
// pieces (rugs, the runner, cobwebs) are one more mesh in it, noMerge and noCast.
// Every one is tagged houseDetail with its level, for the level drawing (H6); each
// level also has one plain stand-in (houseSimple) shown when it is far. The drawing
// starts as on the ground level; house life (Task 6) keeps it up from there.
function furnish(scene, material, start, traversal) {
  const full = fullLevels(start, LEVEL_LINKS);
  const tag = (o, level) => {
    o.userData.houseDetail = true;
    o.userData.houseLevel = level;
    o.visible = full.has(level);
  };
  for (const room of HOUSE_ROOMS) {
    const y = levelY(room.level);
    const group = new THREE.Group();
    group.name = `houseFurniture:${room.id}`;
    tag(group, room.level);
    group.userData.houseRoom = room.id;
    const flats = [];
    for (const f of HOUSE_FURNITURE.filter((q) => q.room === room.id)) {
      if (f.r === 0) { flats.push(f); continue; }
      const mesh = furnitureMesh(f, material);
      if (f.h >= TALL_H) {
        const tall = new THREE.Group();
        tall.name = `houseTall:${f.id}`;
        tall.position.set(f.x, y, f.z);
        tall.rotation.y = f.rotY;
        tall.userData.fadeOccluder = [{ t: 'cyl', r: Math.hypot(f.w, f.d) / 2, y0: 0, y1: f.h }];
        tag(tall, room.level);
        tall.add(mesh);
        scene.add(tall);
        continue;
      }
      mesh.position.set(f.x, y, f.z);
      mesh.rotation.y = f.rotY;
      group.add(mesh);
    }
    if (flats.length) group.add(flatsMesh(flats, y, material, `houseFlats:${room.id}`));
    // step 2: a crossing's plank is its room's, lying on the two tops it joins
    for (const c of traversal.crossings) if (roomAt(c.ends[0].x, c.ends[0].z) === room.id) group.add(plankMesh(c, material));
    scene.add(noBlob(group));
  }
  // step 2: a ledge piece is drawn like any solid one, here as on its level's stand-in
  for (const l of HOUSE_LEVELS) {
    const solid = HOUSE_FURNITURE.filter((f) => f.level === l.id && (f.r > 0 || f.ledge));
    if (!solid.length) continue;
    const m = standInMesh(l.id, solid, l.y);
    m.visible = !full.has(l.id);
    scene.add(m);
  }
}

// Step 2: a faint pair of paw prints at every hop's take-off (housemoves.js), one mesh per
// level, a level detail like the furniture, so the drawing shows only the levels in full.
function drawMarks(scene, traversal, start) {
  const full = fullLevels(start, LEVEL_LINKS);
  const byLevel = new Map();
  for (const h of traversal.hops) {
    const level = levelAt(h.x0, h.z0);
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level).push({ x: h.x0, y: h.y0, z: h.z0, yaw: Math.atan2(h.x1 - h.x0, h.z1 - h.z0) });
  }
  for (const [level, spots] of byLevel) {
    const m = pawMarksMesh(level, spots);
    m.visible = full.has(level);
    scene.add(m);
  }
}

// eslint-disable-next-line no-unused-vars
export function build(scene, { wind, gateEnds } = {}) {
  // gateEnds: step 4 opens the front door when a house-town end comes in. Step 1 ignores it.
  return withLocalUuids('house', () => {
    // the plan with its moves and perches (step 2): the furniture tops she stands on are ground
    const plan = houseMovesArea(houseArea());
    applySky(scene, HOUSE_SKY.top, HOUSE_SKY.horizon);
    const material = houseMaterial(createHouseAtlas());

    // the walls, one group per level, one mesh per section
    const sectionMeshes = new Map();
    const panes = new Map();
    const groups = new Map();
    for (const l of HOUSE_LEVELS) {
      const g = new THREE.Group();
      g.name = `houseWalls:${l.id}`;
      g.userData.noMerge = true;
      g.userData.houseWalls = l.id;
      groups.set(l.id, g);
    }
    for (const s of plan.sections) {
      const m = sectionMesh(s, material, { sections: plan.sections });
      groups.get(s.level).add(m);
      sectionMeshes.set(s.id, m);
      if (s.window) panes.set(s.id, [paneMesh(s, s.window)]);
    }
    for (const g of groups.values()) scene.add(g);
    for (const list of panes.values()) for (const p of list) scene.add(noBlob(p));

    for (const r of HOUSE_ROOMS) {
      scene.add(floorMesh(r, material));
      const skirt = skirtMesh(r, material);
      if (skirt) scene.add(skirt);
    }
    for (const s of HOUSE_STAIRS) scene.add(noBlob(stairMesh(s, material)));

    HOUSE_LAMPS.forEach((l, i) => {
      const room = HOUSE_ROOMS.find((r) => r.id === l.room);
      const g = lampGroup(l.kind, l.x, levelY(room.level), l.z, material);
      g.name = `houseLamp:${l.room}:${i}`;
      // its dusk pool stays in its room, cut at the walls' inner faces (render/dusk.js)
      g.userData.lampPoolClip = lampPoolClip(room);
      scene.add(g);
    });
    furnish(scene, material, START_LEVEL, plan.traversal);
    drawMarks(scene, plan.traversal, START_LEVEL);
    // the secret stair's bookcase, shut in the library's north wall (step 2, ruling D9)
    const secretGroup = secretBookcaseGroup(material);
    secretGroup.visible = fullLevels(START_LEVEL, LEVEL_LINKS).has(secretGroup.userData.houseLevel);
    scene.add(secretGroup);

    drawLawn(scene);
    // the cellar's turf lid: garden from outside, out of the way when she is down there (house life)
    const lidMeshes = cellarLidMeshes(HOUSE_CELLAR_LID, material, litMaterial(LAWN_COLOR, { surface: 'grass', repeat: [1, 1] }), tileMetres('grass') || 4);
    for (const m of lidMeshes) scene.add(m);
    drawHedge(scene);
    drawGarden(scene, material);
    drawNeighbours(scene);
    drawTrees(scene, wind);

    const areaData = {
      name: words().PLACE_WORDS.house,
      ground: plan.ground,
      colliders: plan.colliders, // the walls', the furniture's, the lamps' and the shut bookcase's (houseColliders)
      bounds: { ...HOUSE_BOUNDS },
      spawn: { ...plan.spawn },
      kittenHome: { ...HOUSE_KITTEN_HOME }, // Mochi's circle: the hall's middle, clear of the door and the lamp
      pois: [],
      collectibles: [],
      scenics: [],
      critterSpawns: [], // no people and no resident cat in step 1 (U14)
      moments: [],
      puddles: [],
      boxes: [],
      perches: plan.perches.map((p) => ({ ...p })), // the knock-over pieces' tops (step 2, D4)
      tippables: [],
      groundBounce: HOUSE_GROUND_BOUNCE,
      skyDusk: HOUSE_SKY_DUSK,
      duskLight: HOUSE_DUSK_LIGHT,
      strays: false, // no strays, wanderer or ghosts indoors (U12)
      traversal: plan.traversal, // the climbs, drops, leaps and the plank up the furniture (step 2, D2)
      house: {
        levels: plan.levels,
        links: plan.links,
        sections: plan.sections,
        start: START_LEVEL,
        sectionMeshes,
        panes,
        lid: HOUSE_CELLAR_LID,
        lidMeshes,
        // the secret bookcase and its two collider rows (`secret: true`): colliders holds the shut one
        secret: { group: secretGroup, shut: secretColliders(false), open: secretColliders(true) },
        // the ground without the ledges: the level drawing reads the floor under her (step 2, D3)
        floor: houseFloorGround(),
      },
    };
    // every frame: the walls between the camera and the cat sink, and the levels are drawn for hers
    areaData.life = ({ scene: lifeScene, reducedMotion }) => createHouseLife(lifeScene, areaData.house, { reducedMotion });
    return areaData;
  });
}
