// =============================================================================
// THE TEST YARD (Rooftops step 1). A small, flat-roofed practice yard for the
// traversal moves: two planks, a ridge, a washing line, three gaps (one needing
// Long Leap), climbs and drops in steps. x east, z south (north is -z),
// metres. Levels: yard 0, LOW 1.5, HIGH 3.5.
//
// It is a test page, not an area: it is not in AREAS, and nothing in the game
// loads it. Three parts:
//   * the DATA and yardArea() (no THREE objects; the headless tests walk it);
//   * buildTraversalYard(scene), the yard drawn, simply and cheaply, with
//     shared geometries (the marks are stand-ins; real marks are step 2's art);
//   * YARD_TOURS and createYardPilot, two scripted tours and the autopilot
//     that drives the stick and the jump button through one, for the picture
//     page's recording and for the tests that prove each move happens on the
//     real player. The pilot is handed the runtime (`live`) and never imports
//     src/traversallive.js, so the "before" page can run it with NO_TRAVERSAL.
//     Deterministic: a function of the tour, dt and what the walk reports.
// =============================================================================

import * as THREE from 'three';
import { createGround } from '../ground.js';
import { litMaterial } from '../render/materials.js';
import { createTraversal, crossingPoint, LONG_LEAP_ID, stickToWorld, behindYaw, easeYawToward } from '../traversal.js';

export const YARD_BOUNDS = Object.freeze({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 });
export const YARD_SPAWN = Object.freeze({ x: 0, z: 14 });

const LOW = 1.5;
const HIGH = 3.5;
const HOUSE = Object.freeze({ x0: 8, x1: 13, z0: -16, z1: -6, eaves: 1.0 }); // the pitched roof's ridge (HIGH) runs along its middle, z = -11

// A flat rectangle, as a strip along x.
const rect = (x0, x1, z0, z1, y) => ({ x0, z0: (z0 + z1) / 2, x1, z1: (z0 + z1) / 2, width: z1 - z0, y0: y });

export const YARD_GROUND = Object.freeze({
  base: 0,
  strips: [
    rect(-16, -8, -4.5, 8, LOW), // shed
    rect(-16, -8, -16, -6, HIGH), // west
    rect(-2, 8, -16, -6, HIGH), // east
    rect(HOUSE.x0, HOUSE.x1, HOUSE.z0, HOUSE.z1, HOUSE.eaves), // house block
    rect(-2, 8, -3.5, 4, HIGH), // east2
    rect(10, 18, -3.5, 4, LOW), // lowE
    rect(10, 18, 7.6, 14, LOW), // lowS
    { x0: -3.5, z0: 0, x1: -8.2, z1: 0, width: 1.6, y0: 0, y1: LOW }, // fire escape
  ],
  discs: [
    { x: -14, z: -3.5, r: 1.0, y: 2.6 }, // tank
    { x: 13.4, z: -11, r: 0.9, y: HIGH }, // chimney
  ],
});

const P = (x, z, y) => ({ x, z, y });
const S = (x, z) => ({ x, z });

export const YARD_TRAVERSAL = Object.freeze({
  crossings: [
    { id: 'plank-1', kind: 'plank', points: [P(-8.4, -13, HIGH), P(-1.6, -13, HIGH)] },
    { id: 'plank-2', kind: 'plank', points: [P(-2.6, 6, 0), P(-8.0, 6, LOW), P(-8.4, 6, LOW)] }, // leaning
    { id: 'line-1', kind: 'line', points: [P(-1.6, -9, HIGH), P(-2.0, -9, HIGH), P(-5, -9, 3.2), P(-8.0, -9, HIGH), P(-8.4, -9, HIGH)] }, // sags
    { id: 'ridge-1', kind: 'ridge', points: [P(7.6, -11, HIGH), P(13.4, -11, HIGH)] },
  ],
  gaps: [
    { id: 'gap-1', from: S(3, -6.4), to: S(3, -3.1) }, // level
    { id: 'gap-2', from: S(7.6, 0), to: S(10.4, 0) }, // down 2 m
    { id: 'gap-3', from: S(14, 3.6), to: S(14, 8.0), requires: LONG_LEAP_ID }, // Long Leap, 4.4 m
  ],
  climbs: [
    { id: 'climb-1', from: S(-12, 8.8), to: S(-12, 7.4) }, // yard to shed
    { id: 'climb-2', from: S(-14, -1.8), to: S(-14, -2.9) }, // shed to tank
    { id: 'climb-3', from: S(-14, -4.1), to: S(-14, -6.4) }, // tank to west
  ],
  drops: [
    { id: 'drop-1', from: S(-12, -6.4), to: S(-12, -4.1) }, // west to shed
    { id: 'drop-2', from: S(17.6, 0), to: S(19.2, 0) }, // lowE to yard
    { id: 'drop-3', from: S(14, 13.6), to: S(14, 15.4) }, // lowS to yard
    { id: 'drop-4', from: S(-8.4, 2), to: S(-6.6, 2) }, // shed to yard
  ],
});

export function yardArea() {
  const ground = createGround(YARD_GROUND);
  return {
    name: 'yard',
    bounds: YARD_BOUNDS,
    spawn: YARD_SPAWN,
    colliders: [],
    waters: [],
    perches: [],
    ground,
    traversal: createTraversal(YARD_TRAVERSAL, ground),
  };
}

// ---------------------------------------------------------------------------
// The yard drawn

const COLOURS = Object.freeze({
  ground: 0x7d8a6a,
  roof: 0x8d9299,
  shed: 0x9b7b58,
  house: 0xb0745a,
  houseRoof: 0x6b4a44,
  ridgeCap: 0x55585f,
  escape: 0x4a4f57,
  escapeStep: 0x24272c,
  tank: 0x6f8a92,
  chimney: 0x9a5a48,
  pot: 0xb3653f,
  plank: 0xa0784a,
  line: 0xe8e4dc,
  post: 0x6a5a48,
  cloths: [0xd86a6a, 0x6aa8d8, 0xf0d870],
});

// Marks, as flat discs over the ground: where she takes off (by the kind of
// hop) and where she lands. Stand-ins; step 2 draws the real ones.
export const MARK_COLOURS = Object.freeze({ leap: 0xf0a640, drop: 0x6aa0d8, climb: 0x7cc46a, land: 0xf4ead0 });
const MARK_R = 0.35;
const MARK_LIFT = 0.01;
const GROUND_SIZE = 60;
const PLANK_WIDTH = 0.3;
const PLANK_THICK = 0.05;
const RIDGE_CAP = Object.freeze({ width: 0.22, thick: 0.1 });
const ESCAPE_THICK = 0.12;
const ESCAPE_STEPS = 9;
const POT = Object.freeze({ r: 0.15, h: 0.35, dx: 0.5, dz: 0.45 });
const LINE_R = 0.02;
const POST = Object.freeze({ r: 0.04, h: 0.6, out: 0.15 });
const CLOTH = Object.freeze({ w: 0.5, h: 0.6, at: [0.3, 0.5, 0.7] });

// The pitched roof over the house block: a prism, eaves along both long
// sides, the ridge along z = (z0 + z1) / 2. Two slopes and two gables;
// non-indexed, so its normals come out flat.
function roofPrism({ x0, x1, z0, z1, eaves }, ridge) {
  const zm = (z0 + z1) / 2;
  const a = [x0, eaves, z0]; const b = [x1, eaves, z0];
  const c = [x0, ridge, zm]; const d = [x1, ridge, zm];
  const e = [x0, eaves, z1]; const f = [x1, eaves, z1];
  const tris = [a, c, b, b, c, d, e, f, c, f, d, c, a, e, c, b, d, f];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  geo.computeVertexNormals();
  return geo;
}

// Draws the yard into `scene` and returns the yard's area with the meshes.
export function buildTraversalYard(scene) {
  const area = yardArea();
  const { ground } = area;
  const meshes = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 20);
  const disc = new THREE.CircleGeometry(MARK_R, 20);
  const cloth = new THREE.PlaneGeometry(CLOTH.w, CLOTH.h);
  const mats = new Map();
  const mat = (colour, extra) => {
    const key = extra ? `${colour}:2` : colour;
    if (!mats.has(key)) mats.set(key, litMaterial(colour, extra));
    return mats.get(key);
  };
  const add = (geo, colour, name, extra) => {
    const m = new THREE.Mesh(geo, mat(colour, extra));
    m.name = name;
    meshes.push(m);
    scene.add(m);
    return m;
  };

  // A beam from a to b ({ x, y, z }), its top along the line between them.
  const beam = (a, b, width, thick, colour, name, drop = thick / 2) => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dy = b.y - a.y;
    const h = Math.hypot(dx, dz);
    const m = add(box, colour, name);
    m.scale.set(Math.hypot(h, dy), thick, width);
    m.rotation.set(0, -Math.atan2(dz, dx), Math.atan2(dy, h));
    m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 - drop, (a.z + b.z) / 2);
    m.castShadow = true;
    return m;
  };

  const plane = add(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), COLOURS.ground, 'ground');
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;

  // Roofs: each flat rectangle a box from the yard up to its top. The slope
  // (the fire escape) a sloped box with step lines across it.
  YARD_GROUND.strips.forEach((st, i) => {
    if (st.y1 !== undefined) {
      const a = { x: st.x0, y: st.y0, z: st.z0 };
      const b = { x: st.x1, y: st.y1, z: st.z1 };
      beam(a, b, st.width, ESCAPE_THICK, COLOURS.escape, 'fire-escape');
      for (let k = 1; k <= ESCAPE_STEPS; k++) {
        const t = k / (ESCAPE_STEPS + 1);
        const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + 0.015, z: a.z + (b.z - a.z) * t };
        const q = { x: p.x + (b.x - a.x) * 0.01, y: p.y + (b.y - a.y) * 0.01, z: p.z + (b.z - a.z) * 0.01 };
        beam(p, q, st.width, 0.03, COLOURS.escapeStep, 'fire-escape-step', 0).scale.x = 0.05;
      }
      return;
    }
    const dx = st.x1 - st.x0;
    const dz = st.z1 - st.z0;
    const colour = st.y0 === HOUSE.eaves ? COLOURS.house : st.y0 === LOW && st.x1 <= 0 ? COLOURS.shed : COLOURS.roof;
    const m = add(box, colour, `roof:${i}`);
    m.scale.set(Math.hypot(dx, dz), st.y0, st.width);
    m.rotation.y = -Math.atan2(dz, dx);
    m.position.set((st.x0 + st.x1) / 2, st.y0 / 2, (st.z0 + st.z1) / 2);
    m.castShadow = true;
    m.receiveShadow = true;
  });
  const houseRoof = add(roofPrism(HOUSE, HIGH), COLOURS.houseRoof, 'house-roof');
  houseRoof.castShadow = true;

  // The tank and the chimney stack: cylinders from the yard to their tops,
  // and a pot at the back of the stack.
  YARD_GROUND.discs.forEach((d, i) => {
    const m = add(cyl, i === 0 ? COLOURS.tank : COLOURS.chimney, `disc:${i}`);
    m.scale.set(d.r, d.y, d.r);
    m.position.set(d.x, d.y / 2, d.z);
    m.castShadow = true;
    m.receiveShadow = true;
    if (i === 1) {
      const pot = add(cyl, COLOURS.pot, 'chimney-pot');
      pot.scale.set(POT.r, POT.h, POT.r);
      pot.position.set(d.x + POT.dx, d.y + POT.h / 2, d.z + POT.dz);
    }
  });

  // The crossings: planks per segment, a cap on the ridge, the line a thin
  // tube between two posts with three cloths hanging under it.
  const pt = { x: 0, y: 0, z: 0, tx: 0, tz: 0, grade: 0 };
  const xs = new Map(YARD_TRAVERSAL.crossings.map((c) => [c.id, c]));
  for (const c of area.traversal.crossings) {
    const pts = xs.get(c.id).points;
    if (c.kind === 'plank') {
      for (let k = 0; k + 1 < pts.length; k++) beam(pts[k], pts[k + 1], PLANK_WIDTH, PLANK_THICK, COLOURS.plank, `plank:${c.id}`);
    } else if (c.kind === 'ridge') {
      beam(pts[0], pts[pts.length - 1], RIDGE_CAP.width, RIDGE_CAP.thick, COLOURS.ridgeCap, `ridge-cap:${c.id}`);
    } else if (c.kind === 'line') {
      const path = new THREE.CurvePath();
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k];
        const b = pts[k + 1];
        path.add(new THREE.LineCurve3(new THREE.Vector3(a.x, a.y + LINE_R, a.z), new THREE.Vector3(b.x, b.y + LINE_R, b.z)));
      }
      add(new THREE.TubeGeometry(path, 32, LINE_R, 4, false), COLOURS.line, `line:${c.id}`);
      for (const e of c.ends) {
        const x = e.x - e.inX * POST.out;
        const z = e.z - e.inZ * POST.out;
        const post = add(cyl, COLOURS.post, 'line-post');
        post.scale.set(POST.r, POST.h, POST.r);
        post.position.set(x, ground.y(x, z) + POST.h / 2, z);
      }
      CLOTH.at.forEach((share, k) => {
        crossingPoint(c, c.length * share, pt);
        const m = add(cloth, COLOURS.cloths[k], 'cloth', { side: THREE.DoubleSide });
        m.position.set(pt.x, pt.y - CLOTH.h / 2, pt.z);
        m.rotation.y = -Math.atan2(pt.tz, pt.tx);
      });
    }
  }

  // The marks: one where each hop takes off, one where it lands.
  const mark = (x, z, colour, name) => {
    const m = add(disc, colour, name);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, ground.y(x, z) + MARK_LIFT, z);
  };
  for (const h of area.traversal.hops) {
    mark(h.x0, h.z0, MARK_COLOURS[h.kind], `mark:${h.id}:from`);
    mark(h.x1, h.z1, MARK_COLOURS.land, `mark:${h.id}:to`);
  }

  return { ...area, meshes };
}

// ---------------------------------------------------------------------------
// The two tours

// Each is { start: { x, z, face: [fx, fz] }, steps }. A step is one of
//   { say: 'caption' }   the page's caption from here on (page-only English);
//   { walk: [x, z] }     push the stick toward it until she is within ARRIVE_R
//                        and not in a hop (on a crossing counts: the plank's
//                        stop and turn are walks to points on it);
//   { jump: true }       press once (again each frame until the press is
//                        taken), wait until she is not busy and not looking,
//                        then JUMP_SETTLE s;
//   { wait: s }          the stick let go;
//   { abilities: {...} } handed to setAbilities.
export const YARD_TOURS = Object.freeze({
  climbs: Object.freeze({
    start: Object.freeze({ x: 0, z: 14, face: Object.freeze([0, -1]) }),
    steps: Object.freeze([
      { say: 'A climb-up onto the shed' }, { walk: [-12, 9.0] }, { jump: true },
      { walk: [-14, -1.8] }, { jump: true },
      { walk: [-14, -4.1] }, { jump: true },
      { say: 'The plank: a balance walk' }, { walk: [-9.0, -13] }, { walk: [-4.6, -13] }, { wait: 0.8 },
      { say: 'She can stop and turn round' }, { walk: [-6.0, -13] }, { wait: 0.6 }, { walk: [-1.2, -13] },
      { say: 'Along the washing line' }, { walk: [-1.4, -9] }, { walk: [-8.8, -9] },
      { say: 'Down in steps' }, { walk: [-12, -6.6] }, { jump: true }, { walk: [-8.6, 2] }, { jump: true },
    ].map(Object.freeze)),
  }),
  leaps: Object.freeze({
    start: Object.freeze({ x: 2, z: -10, face: Object.freeze([1, 0]) }),
    steps: Object.freeze([
      // (6.8, -11) is outside MOUNT_R of the ridge's end, so she does not get on early.
      { say: 'Along the ridge to the chimney' }, { walk: [6.8, -11] }, { walk: [13.6, -11] }, { wait: 1.0 }, { walk: [7.0, -11] },
      { say: 'Leap!' }, { walk: [3, -6.6] }, { jump: true },
      { say: 'Leap down' }, { walk: [7.4, 0] }, { jump: true },
      { say: 'Too far for her yet: she looks across' }, { walk: [14, 3.4] }, { jump: true }, { wait: 1.6 },
      { say: 'With Long Leap' }, { abilities: { longLeap: true } }, { jump: true },
      { say: 'Down to the yard' }, { walk: [14, 13.4] }, { jump: true },
    ].map(Object.freeze)),
  }),
});

// ---------------------------------------------------------------------------
// The autopilot

export const ARRIVE_R = 0.3; // m
export const JUMP_SETTLE = 0.3; // s after a hop or a look ends
export const STEP_LIMIT = 20; // s; a step that takes longer fails the tour
const VIEW_RATE = 2; // 1/s, the cinematic camera behind her on the ground
const VIEW_MAX = 1.5; // rad/s
const RAIL_TOL = 0.05; // m: a walk's point counts as on a crossing's rail
const EPS = 1e-9;

// True when (x, z) lies on the crossing's rail (seen from above), not past
// its ends. On a crossing, a walk to a point of its rail is done there (the
// plank's stop and turn round); a point anywhere else is reached only off it.
function onRail(crossing, x, z) {
  for (const s of crossing.segs) {
    if (s.len <= 0) continue;
    const t = Math.min(Math.max((x - s.x0) * s.tx + (z - s.z0) * s.tz, 0), s.len);
    if (Math.hypot(x - (s.x0 + s.tx * t), z - (s.z0 + s.tz * t)) <= RAIL_TOL) return true;
  }
  return false;
}

// Drives the stick (player.setTouchMove) and the jump button (live.jump)
// through a tour, one call per frame BEFORE the walk's frame. step() returns
// the same { done, failed, caption } each time: failed is the index of the
// step that ran past STEP_LIMIT (and done is then true), else null.
export function createYardPilot(tour, { setAbilities = () => {} } = {}) {
  const steps = tour.steps;
  const result = { done: false, failed: null, caption: null };
  const touch = { x: 0, z: 0, mag: 1 };
  const stick = { x: 0, z: 0 };
  let index = 0;
  let time = 0; // seconds into this step
  let pressed = false; // a jump step's press was taken
  let settle = -1; // a jump step's time since the hop or look ended; -1 until then
  let holding = false; // the stick is pushed, unbroken since holdYaw was taken
  let frozen = false; // she has been on a crossing during this push: holdYaw stays
  let holdYaw = 0;

  function next() {
    index++;
    time = 0;
    pressed = false;
    settle = -1;
  }

  function finish(player, failed) {
    release(player);
    result.done = true;
    result.failed = failed;
  }

  // Let go of the stick.
  function release(player) {
    player.setTouchMove(null);
    holding = false;
    frozen = false;
  }

  // Push toward (tx, tz), or let go once there. True when there.
  function walk(tx, tz, dt, cat, player, live) {
    const p = cat.position;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d <= ARRIVE_R && !live.hop && (!live.crossing || onRail(live.crossing, tx, tz))) {
      release(player);
      return true;
    }
    if (!live.busy) {
      const ry = cat.rotation.y;
      player.setViewYaw(easeYawToward(player.viewYaw(), behindYaw(-Math.sin(ry), -Math.cos(ry)), dt, VIEW_RATE, VIEW_MAX));
    }
    if (d < EPS) return false;
    // The yaw the game turns this stick by: the live view on the ground; on a
    // crossing, and after stepping off one with the stick still held, the
    // view's yaw of the frame she got on (the runtime's hold).
    if (live.crossing) frozen = true;
    if (!holding || !frozen) holdYaw = player.viewYaw();
    holding = true;
    stickToWorld(dx / d, dz / d, -holdYaw, stick);
    touch.x = stick.x;
    touch.z = stick.z;
    touch.mag = 1;
    player.setTouchMove(touch);
    return false;
  }

  function jump(dt, live, player, ctx) {
    if (!pressed) {
      release(player);
      pressed = live.jump(ctx) === true;
      return false;
    }
    if (settle < 0) {
      if (live.busy || live.looking) return false;
      settle = 0;
    }
    settle += dt;
    return settle >= JUMP_SETTLE - EPS;
  }

  return {
    step(dt, { cat, player, live, ctx }) {
      if (result.done) return result;
      // The instant steps: a caption, the abilities.
      while (index < steps.length && (steps[index].say !== undefined || steps[index].abilities)) {
        const s = steps[index];
        if (s.say !== undefined) result.caption = s.say;
        else setAbilities(s.abilities);
        next();
      }
      if (index >= steps.length) {
        finish(player, null);
        return result;
      }
      time += dt > 0 ? dt : 0;
      if (time > STEP_LIMIT) {
        finish(player, index);
        return result;
      }
      const s = steps[index];
      let over = false;
      if (s.walk) over = walk(s.walk[0], s.walk[1], dt, cat, player, live);
      else if (s.jump) over = jump(dt, live, player, ctx);
      else if (s.wait !== undefined) {
        release(player);
        over = time >= s.wait - EPS;
      }
      if (over) next();
      return result;
    },
  };
}
