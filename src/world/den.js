// v17 Cozy Den — the walkable interior. Turns DEN_SPOTS' fixed positions
// (src/den.js — single source of truth for where furniture anchors, shared
// with progression.js's placeDenItem validation) into THREE furniture per
// the player's `placed` record. No THREE import in den.js itself; that
// pure data module stays renderer-free, this one is the renderer.
//
// ---------------------------------------------------------------------------
// THE DENSITY PASS — what this file is, after v17.
//
// v17 shipped six purchasable pieces standing in an empty box. The outdoor
// areas have had four content waves since (v13's density pass, v14's parkour,
// v17, v18's Docks) and the den read as the cheap room it was, so this file
// now builds a FURNISHED room first and drops the player's furniture into it
// second. Three kinds of thing live here, and they answer to different rules:
//
//   1. THE ROOM — floor seams, skirting, a picture rail, a real window with a
//      view of the neighbourhood through it, a fireplace with a mantel. Costs
//      the player nothing, is always there, and is the bulk of "more detail".
//   2. FIXTURES (the table below) — furnishings that stand up off the floor: a
//      bookcase, a wall ledge, a radiator, a plant, a log basket. Declared as
//      DATA so the collider a prop costs the walking cat cannot drift from the
//      mesh that draws it, the same discipline builder.js's dockside block
//      uses, and so test/den.test.js can check the camera rule below without
//      reading the scene graph.
//   3. THE PLAYER'S FURNITURE — DEN_ITEMS placed at DEN_SPOTS, unchanged in
//      shape from v17: a builder per id, returning a mesh plus whatever
//      collider / perches / hide-box it contributes.
//
// THE TWO RULES EVERYTHING HERE OBEYS:
//
//   * The fourth wall stays open. See the wall block in build() for the wall
//     itself and src/den.js's DEN_CAMERA_WEDGE for the volume in FRONT of it
//     that must also stay clear. Nothing tall goes in the wedge — not a
//     fixture, not an anchor spot.
//   * Colliders are circles and this room is 16x16. Every solid prop declares
//     one (or two, for something long), and test/den.test.js flood-fills the
//     floor with every anchor spot occupied by the widest piece in the
//     catalog to prove the cat can still walk from the spawn to all of them.
//
// NO WATER. The den declares `puddles: []` and returns no `waters` record,
// and the fish tank and the water bowl are both enclosed meshes rather than
// bodies of water — see builder.js's petBowls. v19's water invariants must
// not start applying to a living room.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import * as b from './builder.js';
import { litMaterial } from '../render/materials.js';
import { DEN_SPOTS } from '../den.js';
import { SURE_CLAWS_ID } from '../climbing.js';

const mat = (color, extra) => litMaterial(color, extra);
const box = (w, h, d, color, extra) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, extra));

// Same palette structure as neighborhood.build's return — a warm interior
// gets a cozier top/horizon pair than the outdoor blue-sky one, but the
// SHAPE must match (top/horizon keys) since main.js's dusk branch destructures
// areaData.skyDusk unconditionally when duskActive is true.
const SKY_DUSK = { top: 0x2a3a5e, horizon: 0x6a5a7e };

// Room geometry, named once because the fixtures below are positioned
// against it. WALL is the wall planes' centre line; the cat is stopped by
// `bounds` (BOUND) well short of them, which is why wall-hung detail needs no
// collider — see the note on DEN_FIXTURES.
const WALL = 9;
const BOUND = 8;
const WALL_H = 3.2;
const RAIL_H = 0.4;
const WALL_COLOR = 0xe0d0b8;
const TRIM_COLOR = 0xf0e4d0;

// The window opening in the north wall: half-width, sill height, head height.
const WIN_HALF = 2.2;
const SILL_Y = 1.0;
const WIN_TOP = 2.6;
// How far the sill reaches back into the room. 1.15 is not a styling choice:
// the cat is clamped to `bounds` (|z| <= 8) even while perched (player.js
// clamps after the perch write), so a sill that stopped at the wall would put
// the windowsill perch outside the box the cat can occupy and leave it
// hovering in mid-air half a metre short of the ledge it is standing on.
const SILL_DEPTH = 1.15;

// ---------------------------------------------------------------------------
// THE ROOM
// ---------------------------------------------------------------------------

// The north wall, built as a frame around a real window rather than as one
// slab painted sky-blue (which is what v17 did — the wall WAS the "window").
// The opening is a hole: what you see through it is the neighbourhood built
// beyond it by outsideView() below.
function northWall(scene) {
  const side = WALL - WIN_HALF; // width of each pier beside the opening
  for (const sx of [-1, 1]) {
    const pier = box(side, WALL_H, 0.2, WALL_COLOR);
    pier.position.set(sx * (WIN_HALF + side / 2), WALL_H / 2, -WALL);
    scene.add(pier);
  }
  const under = box(WIN_HALF * 2, SILL_Y, 0.2, WALL_COLOR);
  under.position.set(0, SILL_Y / 2, -WALL);
  scene.add(under);
  const over = box(WIN_HALF * 2, WALL_H - WIN_TOP, 0.2, WALL_COLOR);
  over.position.set(0, (WALL_H + WIN_TOP) / 2, -WALL);
  scene.add(over);

  // The reveal: FOUR STRIPS AROUND THE HOLE, never one panel across it. The
  // first draft of this was a single box the size of the opening, which is a
  // pane of frosted glass as far as the renderer is concerned — it hid the
  // entire view and left the window reading as a lit alcove.
  const openW = WIN_HALF * 2;
  const openH = WIN_TOP - SILL_Y;
  for (const [w, h, py] of [
    [openW + 0.2, 0.1, SILL_Y - 0.05],
    [openW + 0.2, 0.1, WIN_TOP + 0.05],
  ]) {
    const strip = box(w, h, 0.1, TRIM_COLOR);
    strip.position.set(0, py, -WALL + 0.14);
    scene.add(strip);
  }
  for (const sx of [-1, 1]) {
    const jamb = box(0.1, openH + 0.2, 0.1, TRIM_COLOR);
    jamb.position.set(sx * (WIN_HALF + 0.05), (SILL_Y + WIN_TOP) / 2, -WALL + 0.14);
    scene.add(jamb);
  }
  // glazing bars. They carry userData.window so walk.js's dusk pass gives them
  // the same warm glow every other window in the game gets.
  const mullion = box(0.08, WIN_TOP - SILL_Y, 0.06, TRIM_COLOR);
  mullion.position.set(0, (SILL_Y + WIN_TOP) / 2, -WALL + 0.16);
  mullion.userData.window = true;
  scene.add(mullion);
  const transom = box(WIN_HALF * 2, 0.08, 0.06, TRIM_COLOR);
  transom.position.set(0, SILL_Y + (WIN_TOP - SILL_Y) * 0.55, -WALL + 0.16);
  transom.userData.window = true;
  scene.add(transom);

  // curtains, hung clear of the opening so they never cover the sill perch
  const rail = box(WIN_HALF * 2 + 1.4, 0.06, 0.06, 0x7a5230);
  rail.position.set(0, WIN_TOP + 0.3, -WALL + 0.35);
  scene.add(rail);
  for (const cx of [-1, 1]) {
    scene.add(b.curtain(cx * (WIN_HALF + 0.35), WIN_TOP + 0.28, -WALL + 0.35, 0, 0.6, 1.5));
  }

  // A flower box on the far side of the glass, hung at sill height. flowerPatch
  // is the neighbourhood's own builder — the den's window looks out on the
  // same world the cat walks in, so it is furnished from the same shelf.
  const planter = box(1.8, 0.24, 0.35, 0x8a5a4a);
  planter.position.set(0, SILL_Y - 0.02, -WALL - 0.3);
  scene.add(planter);
  const blooms = b.flowerPatch(0, -WALL - 0.3);
  blooms.position.y = SILL_Y - 0.04;
  blooms.scale.set(1.4, 0.7, 0.5);
  scene.add(blooms);
}

// What is out there. Everything sits at z <= -14 for a sightline reason: the
// eye is a cat's (or the camera's, ~2.2 up) and the opening starts at SILL_Y,
// so the ray through the bottom of the window only reaches the ground a good
// twelve metres out. Anything nearer than that is below the frame and would
// never be seen; anything at this distance reads as "the street".
function outsideView(scene) {
  const lawn = b.ground(70, 0x6aa04e);
  lawn.position.set(0, -0.02, -30);
  scene.add(lawn);
  scene.add(b.sidewalk(-16, -14.5, 16, -14.5, 1.6));
  scene.add(b.fenceRun(-13, -16, 13, -16));
  scene.add(b.house(1.5, -22));
  scene.add(b.house(-9.5, -26, 0xd8c8a8, 0x8a5a4a));
  scene.add(b.tree(-5.5, -18, 1.1));
  scene.add(b.tree(7.5, -20, 0.9));
  scene.add(b.lampPost(5, -16.6));
  scene.add(b.bush(-2.4, -17));
  scene.add(b.bush(3.2, -17.4));
}

// The fireplace. v17's hearth and embers, plus the things a hearth has: a
// firebox, logs, a stone slab, a mantelpiece and two candles.
//
// THE HEIGHT ENVELOPE IS FIXED. This sits at z 8.7, i.e. on the OPEN south
// side, where a camera following a cat in the south-west corner passes
// through. v17's hearth is 1.4 tall there and that is the budget: the mantel
// tops out at 1.52 and the candles at 1.74, all of it more than three metres
// off the centre line (see DEN_CAMERA_WEDGE), so nothing here is newly in
// front of the camera. A chimney breast — the obvious next thing to add —
// would be, and is deliberately absent.
const MANTEL_Y = 1.52;

function fireplace() {
  const g = new THREE.Group();
  const hearth = box(2.2, 1.4, 0.4, 0x6a4a3a);
  hearth.position.set(0, 0.7, 0);
  g.add(hearth);
  const firebox = box(1.2, 0.85, 0.1, 0x2a201c);
  firebox.position.set(0, 0.45, -0.21);
  g.add(firebox);
  const embers = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 8),
    mat(0xf2803a, { emissive: 0xd8501a })
  );
  embers.position.set(0, 0.35, -0.15);
  g.add(embers);
  for (const [lx, ly] of [[-0.22, 0.28], [0.24, 0.3], [0, 0.42]]) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.8, 7), mat(0x6a4a30));
    log.rotation.z = Math.PI / 2;
    log.position.set(lx, ly, -0.18);
    g.add(log);
  }
  // the mantel, and the corbels that carry its overhang
  const mantel = box(2.7, 0.1, SILL_DEPTH, 0xb08a58);
  mantel.position.set(0, MANTEL_Y - 0.05, -0.35);
  g.add(mantel);
  for (const cx of [-1, 1]) {
    const corbel = box(0.14, 0.2, 0.5, 0x8a6a42);
    corbel.position.set(cx * 1.0, MANTEL_Y - 0.2, -0.5);
    g.add(corbel);
  }
  for (const cx of [-0.9, 0.9]) {
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.2, 8), mat(0xf0e4d0));
    candle.position.set(cx, MANTEL_Y + 0.1, -0.35);
    g.add(candle);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.1, 6),
      mat(0xf2e0a0, { emissive: 0xd8a020 })
    );
    flame.position.set(cx, MANTEL_Y + 0.25, -0.35);
    g.add(flame);
  }
  // the stone slab in front of the fire, inside the walkable floor
  const slab = box(2.6, 0.03, 1.0, 0x9a9aa2);
  slab.position.set(0, 0.02, -1.3);
  g.add(slab);
  g.position.set(-6, 0, 8.7);
  return g;
}

// ---------------------------------------------------------------------------
// FIXTURES — the room's own furnishings, as data.
//
// `h` is how tall the thing stands and is checked against DEN_CAMERA_WEDGE;
// `colliders` is what it costs the walking cat, and is EXACTLY what build()
// pushes, so the table cannot disagree with the meshes it builds.
//
// Why several entries carry no collider at all:
//   * the cat is clamped to |x|,|z| <= 8 while the walls are at 9, so anything
//     hung flat on a wall (pictures, the clock, the radiator, the picture
//     rail) is a metre out of reach and can never be walked into;
//   * anything ELEVATED — the windowsill, the wall ledge, the mantel — has
//     open floor underneath it, and a collider is a circle on the floor plan
//     with no height, so giving one to a shelf would wall off the space under
//     it for no reason.
// ---------------------------------------------------------------------------

// The reading corner on the west wall. The bookcase is deep (1.1) so that its
// top surface reaches x -7.9, inside `bounds`: same reason the windowsill is
// deep, and the reason the ledge below it is too. Both numbers are load-
// bearing for the perch chain — see PERCHES.
const CASE_X = -8.45;
const CASE_Z = -3.4;
const LEDGE_Z = -5.0;
const LEDGE_Y = 1.1;

export const DEN_FIXTURES = [
  {
    id: 'fireplace', x: -6, z: 8.7, h: MANTEL_Y + 0.32, colliders: [],
    make: fireplace,
  },
  {
    // 1.8 wide and carried by two collider circles rather than one: a single
    // circle big enough to cover the width would bulge a third of a metre
    // into the room at the middle of the run.
    id: 'bookcase', x: CASE_X, z: CASE_Z, h: b.BOOKCASE_H,
    colliders: [{ x: CASE_X, z: CASE_Z - 0.45, r: 0.62 }, { x: CASE_X, z: CASE_Z + 0.45, r: 0.62 }],
    make: () => b.bookcase(CASE_X, CASE_Z, Math.PI / 2, 1.8, 1.1),
  },
  {
    id: 'wall-ledge', x: -8.35, z: LEDGE_Z, h: LEDGE_Y, colliders: [],
    make: () => {
      const g = new THREE.Group();
      g.add(b.wallShelf(-8.35, LEDGE_Y, LEDGE_Z, Math.PI / 2, 1.4, 1.3));
      g.add(b.bookStack(-8.3, LEDGE_Y, LEDGE_Z - 0.35, 3, 2));
      const fern = b.pottedPlant(-8.4, LEDGE_Z + 0.4, 0.45);
      fern.position.y = LEDGE_Y;
      g.add(fern);
      return g;
    },
  },
  {
    id: 'radiator', x: 8.85, z: 4.0, h: b.RADIATOR_H, colliders: [],
    make: () => b.radiator(8.85, 4.0, -Math.PI / 2, 1.6),
  },
  {
    // The one tall thing standing in open floor on the east side. Sits at
    // x 7.4 so a cat cannot squeeze between it and the wall — deliberate:
    // a pocket you can see into but not walk into reads as a corner rather
    // than as a bug, and nothing is behind it.
    id: 'floor-plant', x: 7.4, z: 3.0, h: b.PLANT_H * 1.05,
    colliders: [{ x: 7.4, z: 3.0, r: 0.4 }],
    make: () => b.pottedPlant(7.4, 3.0, 1.05),
  },
  {
    id: 'log-basket', x: -7.6, z: 7.4, h: 0.5,
    colliders: [{ x: -7.6, z: 7.4, r: 0.35 }],
    make: () => b.logBasket(-7.6, 7.4),
  },
];

// Flat detail: everything under ankle height, which is everything the camera
// rule does not care about and the cat walks straight over. Kept out of
// DEN_FIXTURES because none of it has a collider or a height worth checking.
function flatDetail(scene) {
  // the hearth rug, in front of the fire — stopping short of the fireplace's
  // own stone slab (which reaches z 7.9) rather than z-fighting with it
  scene.add(b.rugRect(-6, 5.8, 3.4, 2.0, 0xb8564e, 0xe8d0a8));
  // a runner down the east side, so the biggest empty stretch of floor is not
  // bare boards
  scene.add(b.rugRect(6.4, -2.6, 2.4, 3.6, 0x5a7a8a, 0xd8cbb0));
  scene.add(b.petBowls(4.6, 6.6, 0));
  scene.add(b.paperBag(4.9, -0.9, 0.6));
  scene.add(b.cardboardBox(-5, -5, 0.6));
  scene.add(b.bookStack(-6.6, 0, -4.6, 4, 1));
  scene.add(b.bookStack(2.6, 0, 6.4, 2, 5));
  for (const [tx, tz, seed] of [[2.2, 5.4, 1], [-2.4, -4.2, 4], [6.8, -2.2, 7], [-4.4, 2.6, 3]]) {
    scene.add(b.catToys(tx, tz, seed));
  }
}

// Wall-hung decor. All of it sits on a wall plane at |x| or |z| = 8.85, a
// metre outside the box the cat can occupy, so none of it takes a collider —
// and none of it can be in the camera wedge either, because the only wall the
// wedge touches is the SOUTH one, which is the open rail and carries nothing.
function wallDecor(scene) {
  for (const [x1, z1, x2, z2] of [
    [-8.85, -8.85, 8.85, -8.85],  // north
    [-8.85, -8.85, -8.85, 8.85],  // west
    [8.85, -8.85, 8.85, 8.85],    // east
  ]) {
    scene.add(b.trimRun(x1, z1, x2, z2, 0.11, 0.22, TRIM_COLOR));  // skirting
    scene.add(b.trimRun(x1, z1, x2, z2, 2.3, 0.1, TRIM_COLOR));    // picture rail
  }
  for (const [x, y, z, rotY, w, h, color] of [
    [-5.6, 1.8, -8.85, 0, 0.85, 0.65, 0xd8c8a8],
    [5.6, 1.75, -8.85, 0, 0.7, 0.9, 0xc8d8c8],
    [-8.85, 1.85, 1.6, Math.PI / 2, 0.9, 0.7, 0xe0c8c0],
    [8.85, 1.8, -5.4, -Math.PI / 2, 0.75, 0.6, 0xd0d8e0],
  ]) {
    scene.add(b.pictureFrame(x, y, z, rotY, w, h, color));
  }
  scene.add(b.wallClock(8.85, 2.2, -1.0, -Math.PI / 2));
}

// ---------------------------------------------------------------------------
// FIXED PERCHES.
//
// Four, and only the first three exist for a cat with no abilities:
//
//   sunny windowsill (1.0)   one hop off the floor, and the room's best spot:
//                            it is where you sit to look at the street. Its
//                            z is inside `bounds` (see SILL_DEPTH) so the cat
//                            actually lands ON it.
//   wall ledge (1.1)         no label and no vantage — it is a step, not a
//                            destination, and it is the ONLY way up to:
//   top of the bookcase(1.9) above the 1.6 climb budget, so it cannot be
//                            taken off the floor: ground -> ledge -> top is
//                            the den's first real climbing chain. 1.9 - 1.1
//                            is 0.8, and the two are 1.6 apart horizontally,
//                            inside the 2.6 reach a perch above y 1 gets.
//   mantelpiece (1.52)       v18 CF-9b, Sure Claws: "props that were scenery
//                            become climbable". The mantel is exactly that
//                            prop, and like every other gated perch it is
//                            unlabelled and non-vantage — a cat that has
//                            earned it gets somewhere new to sit, not a
//                            discovery. FAIL CLOSED: without the ability the
//                            perch does not exist (climbing.js's perchAllowed
//                            filters it before any geometry is considered),
//                            so the den plays exactly as it does today.
//
// KINDS. The sill, the ledge and the mantel are 'roof' — the closed vocabulary
// in climbing.js reserves 'furniture' for FREE-STANDING things and calls the
// top of a built structure 'roof', and all three of these are ledges bolted to
// the building. The bookcase is a piece of furniture standing on the floor, so
// it is 'furniture', like the cat tree. Mechanically the two tags are
// identical (neither is in Sure Claws' lift table, which is trees and fences
// only) — the tag is about telling the truth, so that the day a kind table
// grows a third entry it lands on the right props.
// ---------------------------------------------------------------------------
const FIXED_PERCHES = [
  { x: 0, z: -BOUND + 0.05, y: SILL_Y, kind: 'roof', label: 'sunny windowsill', vantage: true },
  { x: -7.85, z: LEDGE_Z, y: LEDGE_Y, kind: 'roof' },
  { x: -7.95, z: CASE_Z, y: b.BOOKCASE_H, kind: 'furniture', label: 'top of the bookcase', vantage: true },
  { x: -6, z: BOUND - 0.05, y: MANTEL_Y, kind: 'roof', requires: SURE_CLAWS_ID },
];

// ---------------------------------------------------------------------------
// THE PLAYER'S FURNITURE
// ---------------------------------------------------------------------------

// A piece dropped at a wall anchor should face the middle of the room rather
// than all facing +z like a showroom. atan2(-x, -z) is the yaw that turns a
// prop's local +z (every builder.js prop's front) toward the origin.
const facingRoom = (spot) => Math.atan2(-spot.x, -spot.z);

function buildRug(spot) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.04, 20), mat(0xd8834e));
  m.position.set(spot.x, 0.02, spot.z);
  return { mesh: m };
}

function buildCatTree(spot) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 1.6, 8), mat(0x9a7048));
  trunk.position.y = 0.8;
  g.add(trunk);
  const midPlatform = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 12), mat(0xc8a678));
  midPlatform.position.y = 0.7;
  g.add(midPlatform);
  const topPlatform = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 12), mat(0xc8a678));
  topPlatform.position.y = 1.6;
  g.add(topPlatform);
  const topPost = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.5, 6), mat(0x9a7048));
  topPost.position.y = 1.1;
  g.add(topPost);
  g.position.set(spot.x, 0, spot.z);
  return {
    mesh: g,
    collider: { x: spot.x, z: spot.z, r: 0.5 },
    // kind 'furniture' (v18 CF-9b): free-standing, not part of a structure,
    // and pointedly NOT 'tree' despite the name — Sure Claws' height lift is
    // for bark, and tagging a carpeted post 'tree' would hand the den's one
    // shipped perch a 2.0 ceiling for a pun.
    perch: {
      x: spot.x, z: spot.z, y: 1.6, kind: 'furniture',
      label: 'top of the cat tree', vantage: true,
    },
  };
}

function buildFishTank(spot) {
  const g = new THREE.Group();
  const tank = box(0.9, 0.7, 0.5, 0x8ac8e0, { transparent: true, opacity: 0.4 });
  tank.position.y = 0.55;
  g.add(tank);
  const stand = box(0.9, 0.4, 0.5, 0x7a5230);
  stand.position.y = 0.2;
  g.add(stand);
  for (const [fx, fz, rot] of [[-0.15, 0.05, 0.4], [0.18, -0.08, -0.6]]) {
    const fish = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 5), mat(0xf2924e));
    fish.position.set(fx, 0.55, fz);
    fish.rotation.z = Math.PI / 2 + rot;
    g.add(fish);
  }
  g.position.set(spot.x, 0, spot.z);
  return {
    mesh: g,
    collider: { x: spot.x, z: spot.z, r: 0.5 },
    // v18 CF-9b, Sure Claws. The tank's lid is at y 0.9 (stand 0.4 + tank
    // 0.5 above it) and has been a solid surface the cat could not get onto
    // since v17 — the den's own "prop that was scenery". Gated by `requires`,
    // so a den without the ability looks and plays exactly as it does today,
    // and unlabelled/non-vantage like every other gated perch: sitting on
    // your own furniture is not a discovery.
    perch: { x: spot.x, z: spot.z, y: 0.9, kind: 'furniture', requires: SURE_CLAWS_ID },
  };
}

function buildBed(spot) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.22, 10, 20), mat(0xe0a0b0));
  m.rotation.x = Math.PI / 2;
  m.position.set(spot.x, 0.14, spot.z);
  return { mesh: m };
}

function buildLamp(spot) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.5, 8), mat(0x3a3a42));
  pole.position.y = 0.75;
  g.add(pole);
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.4, 10, 1, true),
    mat(0xf2e0a0, { emissive: 0x8a6a20, side: THREE.DoubleSide })
  );
  shade.position.y = 1.55;
  g.add(shade);
  g.position.set(spot.x, 0, spot.z);
  return { mesh: g };
}

function buildScratcher(spot) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 1.1, 10), mat(0xc8a678));
  post.position.y = 0.55;
  g.add(post);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 12), mat(0x9a7048));
  base.position.y = 0.04;
  g.add(base);
  g.position.set(spot.x, 0, spot.z);
  return {
    mesh: g,
    collider: { x: spot.x, z: spot.z, r: 0.3 },
    // v18 CF-9b, Sure Claws — the scratching post's flat top at y 1.1. The
    // one piece of den furniture whose whole purpose is claws, so it is the
    // one the ability was always going to open.
    perch: { x: spot.x, z: spot.z, y: 1.1, kind: 'furniture', requires: SURE_CLAWS_ID },
  };
}

// --- density pass. Six more pieces; three of them are somewhere to sit. ---

// No collider: it is 0.34 tall and a cat should be able to stand in its own
// toy basket.
function buildToyBasket(spot) {
  return { mesh: b.toyBasket(spot.x, spot.z) };
}

function buildPlant(spot) {
  return { mesh: b.pottedPlant(spot.x, spot.z, 1.0), collider: { x: spot.x, z: spot.z, r: 0.4 } };
}

// No collider ON PURPOSE — the cat walks through it, which is the whole
// point of a tunnel — and its middle is registered as a `boxes` hide spot, so
// buying one buys a second "if I fits, I sits" moment (game/avatar.js keys
// those on the boxes array's index, so appending is safe).
function buildTunnel(spot) {
  return {
    mesh: b.catTunnel(spot.x, spot.z, facingRoom(spot) + Math.PI / 2),
    box: { x: spot.x, z: spot.z },
  };
}

// Two perches, 0.45 apart: a cat on the seat can always step up to the back,
// and the seat itself is inside the 1.2 reach a perch at or below y 1 gets
// from the floor even with the chair's collider pushing the cat out to 0.97.
function buildArmchair(spot) {
  const rotY = facingRoom(spot);
  const backOff = 0.36; // the backrest's local -z offset, rotated into world
  return {
    mesh: b.armchair(spot.x, spot.z, rotY),
    collider: { x: spot.x, z: spot.z, r: 0.62 },
    perches: [
      { x: spot.x, z: spot.z, y: b.ARMCHAIR_SEAT, kind: 'furniture' },
      {
        x: spot.x - Math.sin(rotY) * backOff,
        z: spot.z - Math.cos(rotY) * backOff,
        y: b.ARMCHAIR_BACK, kind: 'furniture',
      },
    ],
  };
}

// The top of the telly, which is the only reason it is a CRT — see
// builder.js's tvSet.
function buildTelly(spot) {
  return {
    mesh: b.tvSet(spot.x, spot.z, facingRoom(spot)),
    collider: { x: spot.x, z: spot.z, r: 0.6 },
    perch: { x: spot.x, z: spot.z, y: b.TV_TOP, kind: 'furniture' },
  };
}

function buildDresser(spot) {
  return {
    mesh: b.dresser(spot.x, spot.z, facingRoom(spot)),
    collider: { x: spot.x, z: spot.z, r: 0.62 },
    perch: { x: spot.x, z: spot.z, y: b.DRESSER_H, kind: 'furniture' },
  };
}

const BUILDERS = {
  rug: buildRug,
  cattree: buildCatTree,
  fishtank: buildFishTank,
  bed: buildBed,
  lamp: buildLamp,
  scratcher: buildScratcher,
  toybasket: buildToyBasket,
  plant: buildPlant,
  tunnel: buildTunnel,
  armchair: buildArmchair,
  telly: buildTelly,
  dresser: buildDresser,
};

export function build(scene, { placed = {} } = {}) {
  b.applySky(scene, 0x9fd4e8, 0xcfe8f0);

  const floor = b.ground(18, 0x9a7048);
  scene.add(floor);
  // 30 seams across 18 units — 0.6m boards, about a cat and a half long, which
  // is what makes them read as floorboards rather than as decking.
  scene.add(b.floorSeams(18, 30));

  // Three solid walls + a north wall with a real window in it (northWall
  // above), and the neighbourhood visible through that window.
  //
  // The south wall (+z) is the CAMERA-side wall: the third-person follow
  // camera sits behind the cat (cameraOffset's `back` term adds to +z at
  // yaw 0 — see src/catcam.js), so a full-height south wall here would sit
  // directly between the camera and the cat, filling the frame with its
  // own flat outward-facing surface (MeshStandardMaterial only renders its
  // front/outward side by default) the instant a den walk starts — the
  // "flat uniform beige frame, no cat visible" bug. This is the standard
  // "open fourth wall" trick interior/dollhouse scenes use: keep the
  // camera-side wall low (a knee-high rail) instead of full height, so the
  // room still reads as bounded from every other angle but never blocks
  // the one camera that's guaranteed to be looking through it. `bounds`
  // (returned below, ±8) is what actually stops the cat from walking out
  // through the open top of this wall — well short of the rail's z=9
  // footprint — not the rail's (nonexistent) collider.
  //
  // The density pass adds the second half of that rule: the VOLUME in front
  // of the open wall stays clear too. See DEN_CAMERA_WEDGE in src/den.js.
  northWall(scene);
  outsideView(scene);
  const south = box(18, RAIL_H, 0.2, 0xe8d8c0);
  south.position.set(0, RAIL_H / 2, WALL);
  scene.add(south);
  const east = box(0.2, WALL_H, 18, WALL_COLOR);
  east.position.set(WALL, WALL_H / 2, 0);
  scene.add(east);
  const west = box(0.2, WALL_H, 18, WALL_COLOR);
  west.position.set(-WALL, WALL_H / 2, 0);
  scene.add(west);

  wallDecor(scene);
  flatDetail(scene);

  const colliders = [];
  // Cloned, not shared: FIXED_PERCHES is module state and a walk session holds
  // onto the perch it is standing on (game/interactions.js's session.perched),
  // so handing every den walk the same objects would let one walk's mutation
  // follow the player into the next one.
  const perches = FIXED_PERCHES.map((p) => ({ ...p }));
  const boxes = [{ x: -5, z: -5 }, { x: 4.9, z: -0.9 }]; // cardboard box, paper bag

  for (const fixture of DEN_FIXTURES) {
    scene.add(fixture.make());
    for (const c of fixture.colliders) colliders.push(c);
  }

  // The windowsill. Built here rather than in northWall() because it is the
  // one piece of the window the cat stands on, and SILL_DEPTH is why the
  // perch above is inside `bounds`.
  const sill = box(WIN_HALF * 2 + 0.4, 0.1, SILL_DEPTH, 0xe8d8c0);
  sill.position.set(0, SILL_Y - 0.05, -WALL + SILL_DEPTH / 2);
  scene.add(sill);
  const sillPlant = b.pottedPlant(1.7, -WALL + 0.5, 0.45);
  sillPlant.position.y = SILL_Y;
  scene.add(sillPlant);

  for (const spot of DEN_SPOTS) {
    const itemId = placed[spot.id];
    // An id the catalog no longer knows (a save written by a newer build, a
    // hand-edited payload) simply leaves the spot empty — same "unknown data
    // is dropped, never thrown on" posture as progression.js's sanitizeDen.
    const builder = itemId && BUILDERS[itemId];
    if (!builder) continue;
    const built = builder(spot);
    scene.add(built.mesh);
    if (built.collider) colliders.push(built.collider);
    if (built.perch) perches.push(built.perch);
    for (const p of built.perches ?? []) perches.push(p);
    if (built.box) boxes.push(built.box);
  }

  return {
    name: 'Your Den',
    colliders,
    bounds: { minX: -BOUND, maxX: BOUND, minZ: -BOUND, maxZ: BOUND },
    // z: 4, not 6 — cat.rotation.y = 0 faces -z (main.js), and the
    // third-person camera sits ~4.4 units further +z than the cat
    // (cameraOffset(0, 0.18), see src/catcam.js). At the old z: 6 spawn the
    // camera landed at z ≈ 10.4 — past the south wall's z: 9 footprint
    // entirely. At z: 4 it lands at z ≈ 8.4, comfortably inside the open
    // south rail (see the wall comment above) with room to spare.
    spawn: { x: 0, z: 4 },
    boxes,
    pois: [],
    collectibles: [],
    scenics: [],
    critterSpawns: [],
    moments: [],
    puddles: [],
    skyDusk: SKY_DUSK,
    // Three things to knock over — the den's first tippables. All indoor
    // kinds (a wastepaper bin, a plant pot, a watering can), all placed at
    // least 1.5m off every anchor spot so a piece of furniture standing there
    // can never bury one, and none of them carries a collider (createTippables
    // never emits any), so they cost the room no walkable floor.
    tippables: [
      { x: -2.0, z: -7.4, kind: 'bin' },
      { x: -7.3, z: 2.4, kind: 'pot' },
      { x: 6.6, z: 3.8, kind: 'can' },
    ],
    perches,
  };
}
