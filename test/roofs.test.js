import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument({ measureText: 10, pointerLock: true });

const { build, ALLEY_WEEDS } = await import('../src/world/roofs.js');
const {
  BLOCKS, LEVELS, ROOFS_TRAVERSAL, ROOFS_COLLIDERS, YARD, STREETS, VANE, VANE_TIP, ROOFS_SPAWN,
  ROOFS_POIS, ROOFS_COLLECTIBLES, ROOFS_SCENICS, ROOFS_PERCHES, ROOFS_DISCOVERIES, BIN_BAGS,
  ROOFS_TOURS, ROOFS_REGISTRATION, ALLEY_CLUTTER, ALLEY_CHANNEL, WASHING_POSTS, GARDEN, ALLEY_CRATES, PAVEMENT,
  SMOKE_POTS, downwind, ROOFS_SLEEPERS,
} = await import('../src/world/roofsplan.js');
const { CAT_RADIUS, isWalkableAt, DEFAULT_PITCH } = await import('../src/player.js');
const { cameraOffset } = await import('../src/catcam.js');
const { ZOOM_STEPS, DEFAULT_ZOOM_STEP } = await import('../src/camzoom.js');
const { createRoofsLife, EVENING_RAMP } = await import('../src/roofslife.js');
const { STEP_MAX } = await import('../src/ground.js');
const { findFadeOccluders } = await import('../src/treefade.js');
const { castsFromBox, isTransparentMat, SUN_POSITION } = await import('../src/render/rig.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { ROOFS_BIRDS, perchIndex, roofsCritterSpawns } = await import('../src/world/roofsflock.js');
const { clearSpot } = await import('../src/world/spots.js');
const { BASE_ABILITIES, moveAbilities: T_moveAbilities } = await import('../src/traversal.js');
const { floodTraversal } = await import('./helpers/traversalflood.js');
const { WINDOW_CELLS, markMesh } = await import('../src/world/roofsparts.js');
const { tileMetres } = await import('../src/render/materials.js');

// =============================================================================
// The Rooftops drawn (Rooftops step 2). Task 7: part one, the alley and the
// terrace. Task 8: part two (the corner shop, the warehouse, the clock tower,
// the street below, the far town, the six discoveries) and the rest of the
// record. Every block and every crossing is drawn.
// =============================================================================

const scene = new THREE.Scene();
const area = build(scene);
scene.updateMatrixWorld(true);

const meshes = [];
scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
const boxOf = (o) => new THREE.Box3().setFromObject(o, true);

const topOf = (b) => (b.kind === 'pitched' ? b.ridge : b.kind === 'stair' ? Math.max(b.y0, b.y1) : b.y);
const centreOf = (b) => {
  if (b.kind === 'disc') return { x: b.x, z: b.z };
  if (b.kind === 'stair') {
    const r = [...b.flights, ...b.landings];
    const x0 = Math.min(...r.map((q) => q.x0)), x1 = Math.max(...r.map((q) => q.x1));
    const z0 = Math.min(...r.map((q) => Math.min(q.z0, q.z1))), z1 = Math.max(...r.map((q) => Math.max(q.z0, q.z1)));
    return { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
  }
  return { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 };
};

// Measured 2026-11-20 (Task 8), the whole place, as test/budget.test.js counts
// it. Part one (Task 7) was 76 / 42 / 13,284. Part two adds the corner shop,
// the warehouse and its roof, the tower, the street below with its bus, the
// far town (3,992 triangles, one unlit mesh) and the discoveries. The build
// runs inside withLocalUuids, so it draws nothing from Math.random.
// Follow-up 3 (the flat house's ridge beam gone, stack-5 and its two hops
// added): 113 / 67 / 32,202 -> 114 / 68 / 32,506. Follow-up 2 (calmer
// take-off marks: real things mark 48 of the 79 hops, the rest a small flush
// piece; the render and slate marks gone): -> 112 / 68 / 31,218 (merged 57 -> 55).
// Beauty pass Task A (the evening sky and the far town): the sky glow band
// (+1 mesh, 192 triangles, casting nothing, never merged) and the far town
// redrawn (3,992 -> 4,964 triangles: lit windows, roof lights, street lights
// down side streets, landmarks, tree clumps; still one mesh casting nothing):
// -> 113 / 68 / 32,382 (merged 55 -> 56).
// Beauty pass Task B (houses that differ, real roof edges): no mesh and no
// caster added, every new piece in a bucket the place already had; +536
// triangles (each house's own front and back, +40 on the old body box; the
// slates split at the party walls with their edge, +72; eave boards and
// soffits, +80; half-round gutters, +16 on the box ones; ridge caps, -48 on
// the round rods; six TV aerials, +180; two dishes, +160; the shed's fascia, +36)
// -> 113 / 68 / 32,918 (merged 56 / 30).
// Beauty pass Task C (windows and the tower): no mesh and no caster added,
// every piece in a bucket the place already had; +328 triangles (the six
// roof lights' frames round the glass instead of a slab over it, +72; the
// four clock faces' pale panels, +48; twelve louvre slats, +144; four
// pinnacles, +64; the bezels replace the stone rings, the faces and the
// window atlas cost nothing) -> 113 / 68 / 33,246 (merged 56 / 30).
// Beauty pass Task D (readable hints, a lived-in alley): no mesh and no
// caster added, every piece in a bucket the place already had, all casting
// nothing; +687 triangles (the garage doors' ribs, 14 x 3 x 4 = 168; six
// drainpipes, +96; 23 weed tufts, +69; the bicycle, +122; the pallet, +96;
// the paint tin, +64; the washing's shapes, 44 -> 112, +68; the tank's plank
// and rim hoop, +48; the channel and its gully, +4; on the tower, the north
// clock's panel and the east bell opening's three louvres gone, -48; the
// glow's amber, ring and evening opacity cost nothing) -> 113 / 68 / 33,933
// (merged 56 / 30).
// Beauty pass round two, Task E (fix what round one made odd): no mesh and no
// caster added; +90 triangles (the corner shop's two string courses on three
// faces, 6 x 12 = +72, in the north's noCast paint bucket; the garden bench's
// two back uprights, +24, in its noCast wood bucket; the far town's back rows
// lower, so their fronts have room for three lit windows fewer, -6; the shop's cornice is its
// old stone band reshaped; the plant, the glow, the bulbs, the sky, the town's
// haze and lights and the palette cost nothing) -> 113 / 68 / 34,023 (merged 56 / 30).
// Round two, Task F (what she walks on): no mesh and no caster added, every
// piece in a noCast bucket the place already had (the ridges' own noCast
// meshes, the alley's, terrace's and north's paint); +2,042 triangles (the
// ridges laid in 120 tiles of 14 triangles, 1,680 in place of the six
// extrusions' 144, +1,536; the felt's 52 drip edges +104, 58 patches +172,
// the warehouse's flashing +14, four outlets +32 and their stains +16, +338;
// the crates' gaps and battens, 4 x 32 = +128; the bin bags' knots, +40, the
// bags themselves reshaped at their 400; the alley's smaller setts cost
// nothing) -> 113 / 68 / 36,065 (merged 56 / 30).
// Round two, Task G (the street lit): +1 mesh, the lamps' halo (top-level,
// additive, casting nothing, never merged: 4 quads facing the camera, 8
// triangles); every other piece in a noCast paint bucket the place already
// had: +634 triangles (the shop's and the warehouse's coping joints, 280 x 2
// = +560; on the road, four yellow lines +8, six grates of a dark quad and
// three bars +48, two eight-sided covers +16, +72; the far town's back row
// up to 11.5 m again, so its fronts have room for one more lit window, +2;
// the felt patches' shades cost nothing) -> 114 / 68 / 36,707 (merged 57 / 30).
// Rooftops step 3, Task 6 (S1, the two house cats asleep on warm sills): +2
// meshes, never merged and casting nothing, 314 triangles each (a body 100,
// a head 80, two ears 6, two paws 48, the tail 80), +628; their two deep sills
// are the old sills' boxes deepened, in the stone bucket the terrace had, at no
// cost -> 116 / 68 / 37,335 (merged 57 -> 59 / 30).
// Rooftops step 5 fix wave (I1): the weathervane out of the north's gold
// bucket into a mesh of its own (roofsVane: its own see-through gold, which
// the tower view fades), casting nothing as before; its triangles moved, none
// added, never merged: +1 mesh -> 117 / 68 / 37,335 (merged 59 -> 60 / 30).
const MEASURED_BUILT = { meshes: 117, casters: 68, triangles: 37335 };
const MEASURED_MERGED = { meshes: 60, casters: 30, triangles: 37335 };
const MEASURED_DRAWS = 0;
const TOWN_TRIANGLES = 4960; // the far town's one mesh (Task A: 3,992 before; 4,964 until round two, Task E: its back rows lower, so their fronts have room for three lit windows fewer; 4,958 until Task G: its back row's tallest 2 m higher again, one window more)

let flood0 = null;
const baseFlood = () => (flood0 ??= floodTraversal(area, { abilities: BASE_ABILITIES }));

function budgetStats(s) {
  let n = 0;
  let casters = 0;
  let triangles = 0;
  const box = new THREE.Box3();
  for (const child of s.children) {
    box.setFromObject(child);
    const eligible = castsFromBox(box);
    child.traverse((obj) => {
      if (!obj.isMesh) return;
      n++;
      const geo = obj.geometry;
      triangles += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      if (eligible && !isTransparentMat(obj.material) && !obj.userData.noCast) casters++;
    });
  }
  return { meshes: n, casters, triangles: Math.round(triangles) };
}

describe('the Rooftops drawn', () => {
  it('the record\'s evening lights are its own materials, at their built brightness', () => {
    const L = area.eveningLights;
    expect(Object.keys(L).sort()).toEqual(['bulbs', 'clock', 'windows']);
    expect(L.windows.userData.glowBase).toBeCloseTo(1.1, 9);
    expect(L.clock.userData.glowBase).toBeCloseTo(1.9, 9);
    expect(L.bulbs.userData.glowBase).toBeCloseTo(1.5, 9);
    const mats = new Set(meshes.map((m) => m.material));
    for (const m of Object.values(L)) {
      expect(mats.has(m)).toBe(true);
      expect(m.userData.glowBase).toBe(m.emissiveIntensity);
    }
  });

  it('each block\'s top is drawn at its ground height', () => {
    const byId = new Map();
    for (const m of meshes) {
      const id = m.userData.block;
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(m);
    }
    for (const b of BLOCKS) expect(byId.has(b.id), b.id).toBe(true);
    const blocks = new Map(BLOCKS.map((b) => [b.id, b]));
    for (const [id, list] of byId) {
      const b = blocks.get(id);
      expect(b, id).toBeTruthy();
      for (const m of list) {
        const box = boxOf(m);
        expect(Math.abs(box.max.y - topOf(b)), `${id} top ${box.max.y}`).toBeLessThanOrEqual(0.03);
        // ...and over its own footprint
        const c = centreOf(b);
        expect(Math.abs((box.min.x + box.max.x) / 2 - c.x), `${id} x`).toBeLessThanOrEqual(0.3);
        expect(Math.abs((box.min.z + box.max.z) / 2 - c.z), `${id} z`).toBeLessThanOrEqual(0.3);
      }
    }
    // the pitched roof's slates rise to the ridge, never past it
    const slates = byId.get('terrace');
    expect(Math.max(...slates.map((m) => boxOf(m).max.y))).toBeCloseTo(LEVELS.RIDGE, 2);
  });

  it('each crossing is drawn along its rail', () => {
    const byId = new Map();
    for (const m of meshes) if (m.userData.crossing) byId.set(m.userData.crossing, [...(byId.get(m.userData.crossing) ?? []), m]);
    for (const c of ROOFS_TRAVERSAL.crossings) expect(byId.has(c.id), c.id).toBe(true);
    const crossings = new Map(ROOFS_TRAVERSAL.crossings.map((c) => [c.id, c]));
    for (const [id, list] of byId) {
      const c = crossings.get(id);
      expect(c, id).toBeTruthy();
      expect(list, id).toHaveLength(1);
      const box = boxOf(list[0]);
      for (const p of [c.points[0], c.points[c.points.length - 1]]) {
        expect(box.distanceToPoint(new THREE.Vector3(p.x, p.y, p.z)), `${id} end ${p.x},${p.z}`).toBeLessThanOrEqual(0.3);
      }
      // a rail, not a slab: no vertex lies more than 0.6 m across the rail
      // (from the line through its ends, seen from above; pipe-1 runs at a slant)
      const a = c.points[0];
      const e = c.points[c.points.length - 1];
      const len = Math.hypot(e.x - a.x, e.z - a.z);
      const [ux, uz] = [(e.x - a.x) / len, (e.z - a.z) / len];
      const pos = list[0].geometry.attributes.position;
      const v = new THREE.Vector3();
      let across = 0;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(list[0].matrixWorld);
        across = Math.max(across, Math.abs((v.x - a.x) * uz - (v.z - a.z) * ux));
      }
      expect(across, id).toBeLessThanOrEqual(0.6);
    }
  });

  it('every ridge is drawn on slates or a stack, never as a beam in the air', () => {
    // every vertex of a ridge's own mesh lies over the void under the slates
    // or a chimney stack's disc at the ridge, no lower than 0.35 m under it
    const v = new THREE.Vector3();
    const ridges = ROOFS_TRAVERSAL.crossings.filter((c) => c.kind === 'ridge');
    const bad = [];
    for (const c of ridges) {
      const m = meshes.find((o) => o.userData.crossing === c.id);
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        const y = area.ground.y(v.x, v.z);
        const under = Math.abs(y - LEVELS.VOID) < 1e-6 || Math.abs(y - LEVELS.RIDGE) < 1e-6;
        if (!under || v.y < LEVELS.RIDGE - 0.35) bad.push([c.id, +v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2), y]);
      }
    }
    expect(ridges.length).toBeGreaterThanOrEqual(6);
    expect(bad.slice(0, 4)).toEqual([]);
  });

  // FU2 (owner: calmer take-off marks): a soft glow at every take-off; a
  // small piece lying flush at the roof's edge only where no real thing (the
  // hop's `prop`: the bin, the shed, a bunker, a stack...) shows the spot.
  const GLOW_R_MAX = 0.5; // m; it was 0.7, flat
  const GLOW_OPACITY_MAX = 0.3; // at its centre, fading to nothing at its rim; it was 0.35 all over
  const propOf = new Map([...ROOFS_TRAVERSAL.gaps, ...ROOFS_TRAVERSAL.climbs, ...ROOFS_TRAVERSAL.drops].map((h) => [h.id, h.prop ?? null]));
  const markedMeshes = () => meshes.filter((m) => m.userData.markRanges);
  const glowMesh = () => markedMeshes().find((m) => m.userData.markGlow);
  const vv = new THREE.Vector3();
  const pointsOf = (m, r) => Array.from({ length: r.count }, (_, i) => vv.fromBufferAttribute(m.geometry.attributes.position, r.start + i).applyMatrix4(m.matrixWorld).clone());
  const piecesOf = (id) => markedMeshes().filter((m) => !m.userData.markGlow)
    .flatMap((m) => m.userData.markRanges.filter((r) => r.id === id).flatMap((r) => pointsOf(m, r)));

  it('each hop has a soft glow at its take-off, smaller and fainter than before', () => {
    const glow = glowMesh();
    expect(glow).toBeTruthy();
    const hops = area.traversal.hops;
    expect(hops).toHaveLength(ROOFS_TRAVERSAL.gaps.length + ROOFS_TRAVERSAL.climbs.length + ROOFS_TRAVERSAL.drops.length);
    expect(glow.userData.markRanges).toHaveLength(hops.length);
    for (const h of hops) {
      // one disc per hop, centred on the take-off, just above it, no wider than the ceiling
      const g = glow.userData.markRanges.filter((r) => r.id === h.id);
      expect(g, h.id).toHaveLength(1);
      expect(g[0].kind, h.id).toBe(h.mark);
      const disc = pointsOf(glow, g[0]);
      const c = disc.reduce((t, p) => t.add(p), new THREE.Vector3()).divideScalar(disc.length);
      expect(Math.hypot(c.x - h.x0, c.z - h.z0), `${h.id} glow centre`).toBeLessThanOrEqual(0.05);
      expect(Math.abs(c.y - h.y0 - 0.03), `${h.id} glow height`).toBeLessThanOrEqual(0.05);
      const r = Math.max(...disc.map((p) => Math.hypot(p.x - h.x0, p.z - h.z0)));
      expect(r, `${h.id} glow radius`).toBeLessThanOrEqual(GLOW_R_MAX + 0.01);
    }
    // fainter: its opacity under the ceiling, and soft: its map fades from full
    // at the middle to nothing at the rim (the disc's uv runs 0..1 across it)
    const mat = glow.material;
    expect(mat.opacity).toBeLessThanOrEqual(GLOW_OPACITY_MAX);
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    const { data, width, height } = mat.map.image;
    const alphaAt = (u, v) => data[(Math.min(height - 1, Math.floor(v * height)) * width + Math.min(width - 1, Math.floor(u * width))) * 4 + 3];
    expect(alphaAt(0.5, 0.5)).toBeGreaterThanOrEqual(240);
    for (const [u, v] of [[0, 0.5], [1, 0.5], [0.5, 0], [0.5, 1], [0, 0]]) expect(alphaAt(u, v), `${u},${v}`).toBe(0);
  });

  it('a hop shown by a real thing draws no mark object near its take-off', () => {
    const hops = area.traversal.hops;
    const withProp = hops.filter((h) => propOf.get(h.id));
    expect(withProp.length).toBeGreaterThan(hops.length / 2);
    const bad = [];
    for (const h of withProp) if (piecesOf(h.id).length) bad.push([h.id, 'has pieces']);
    // nor does any other hop's piece lie within 0.6 m of it
    const all = markedMeshes().filter((m) => !m.userData.markGlow).flatMap((m) => m.userData.markRanges.flatMap((r) => pointsOf(m, r).map((p) => [r.id, p])));
    for (const h of withProp) {
      const near = all.find(([, p]) => Math.hypot(p.x - h.x0, p.z - h.z0) < 0.6 && Math.abs(p.y - h.y0) < 1);
      if (near) bad.push([h.id, near[0]]);
    }
    expect(bad).toEqual([]);
    // and the real thing is drawn: its block's own mesh, or the bin bags at
    // their spot (round two, Task F, critique finding 4: a slumped heap under
    // 0.17 m now, where it stood 0.3 to 0.9 m, boulders she landed inside)
    for (const id of new Set(withProp.map((h) => propOf.get(h.id)))) {
      if (id === 'binBags') {
        const v = new THREE.Vector3();
        const hit = meshes.some((m) => !m.userData.markRanges && (() => {
          const pos = m.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
            if (Math.hypot(v.x - BIN_BAGS.x, v.z - BIN_BAGS.z) < BIN_BAGS.r && v.y > 0.08 && v.y < 0.17) return true;
          }
          return false;
        })());
        expect(hit, 'binBags drawn').toBe(true);
      } else {
        expect(meshes.some((m) => m.userData.block === id), id).toBe(true);
      }
    }
  });

  it('a mark object lies flush on the roof at its edge, never a loose brick', () => {
    const bad = [];
    let drawn = 0;
    for (const h of area.traversal.hops) {
      if (propOf.get(h.id)) continue;
      drawn++;
      const pts = piecesOf(h.id);
      if (!pts.length) { bad.push([h.id, 'no pieces']); continue; }
      for (const p of pts) {
        const up = p.y - h.y0;
        // on its own roof (nothing hangs over the edge or floats), at most 0.15 m proud of it
        if (up < -0.01 || up > 0.15) { bad.push([h.id, 'height', +up.toFixed(3)]); break; }
        if (Math.abs(area.ground.y(p.x, p.z) - h.y0) > 0.02) { bad.push([h.id, 'off the roof', +p.x.toFixed(2), +p.z.toFixed(2)]); break; }
        if (Math.hypot(p.x - h.x0, p.z - h.z0) > 0.9) { bad.push([h.id, 'far', +p.x.toFixed(2), +p.z.toFixed(2)]); break; }
      }
      // at the edge she goes over: some of it within 0.15 m of where the roof ends ahead
      const dx = (h.x1 - h.x0) / h.dist;
      const dz = (h.z1 - h.z0) / h.dist;
      const ahead = Math.max(...pts.map((p) => (p.x - h.x0) * dx + (p.z - h.z0) * dz));
      let edge = 0;
      while (edge < h.dist && Math.abs(area.ground.y(h.x0 + dx * edge, h.z0 + dz * edge) - h.y0) < 0.05) edge += 0.01;
      if (Math.abs(edge - ahead) > 0.15) bad.push([h.id, 'not at the edge', +edge.toFixed(2), +ahead.toFixed(2)]);
    }
    expect(drawn).toBeGreaterThan(0);
    expect(bad.slice(0, 6)).toEqual([]);
  });

  it('no chimney stack and no yard wall is drawn over ground she walks on', () => {
    // sampled from above: wherever the stack's (or the walls') own mesh is,
    // the ground there is as high as its top, or the void under the slates
    const rc = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const checks = [
      ...meshes.filter((m) => /^stack-/.test(m.userData.block ?? '')).map((m) => [m, LEVELS.RIDGE]),
      ...meshes.filter((m) => m.userData.yardWalls).map((m) => [m, YARD.h]),
    ];
    expect(checks.length).toBe(9); // eight stacks and the yard walls
    for (const [m, top] of checks) {
      const box = boxOf(m);
      let drawn = 0;
      const bad = [];
      for (let x = box.min.x + 0.013; x < box.max.x; x += 0.05) {
        for (let z = box.min.z + 0.013; z < box.max.z; z += 0.05) {
          rc.set(new THREE.Vector3(x, box.max.y + 1, z), down);
          if (!rc.intersectObject(m, false).length) continue;
          drawn++;
          const y = area.ground.y(x, z);
          if (!(y >= top - STEP_MAX || Math.abs(y - LEVELS.VOID) < 1e-6)) bad.push([+x.toFixed(2), +z.toFixed(2), y]);
        }
      }
      expect(drawn, m.name).toBeGreaterThan(50);
      expect(bad.slice(0, 4), m.name).toEqual([]);
    }
  });

  it('the tower is the highest thing, and only its body fades', () => {
    // the vane's tip is the top of the place, and nothing but the tower reaches its top level
    const v = new THREE.Vector3();
    const peak = new THREE.Vector3(0, -Infinity, 0);
    const high = [];
    for (const m of meshes) {
      if (m.userData.skyGlow) continue; // the glow low in the sky (Task A) is the sky, not a thing on the skyline
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        if (v.y > peak.y) peak.copy(v);
        if (v.y >= LEVELS.TOP && !(v.x >= 21.5 && v.x <= 30.5 && v.z >= -21.5 && v.z <= -12.5)) high.push([m.name, v.x, v.y, v.z]);
      }
    }
    expect(high.slice(0, 3)).toEqual([]);
    expect(peak.y).toBeCloseTo(VANE_TIP, 2);
    expect(Math.hypot(peak.x - VANE.x, peak.z - VANE.z)).toBeLessThanOrEqual(0.05);
    // a lit clock face on each side of the belfry, at about 13.3
    const clock = meshes.filter((m) => m.userData.clockFaces);
    expect(clock).toHaveLength(1);
    const cb = boxOf(clock[0]);
    expect((cb.min.y + cb.max.y) / 2).toBeCloseTo(13.3, 1);
    expect([cb.min.x < 23, cb.max.x > 29, cb.min.z < -20, cb.max.z > -14]).toEqual([true, true, true, true]);
    expect(clock[0].material.emissive.getHex()).not.toBe(0);
    // R7: no window fades; the lamp posts and the tower's body below its first ledge do
    expect(meshes.filter((m) => m.userData.window)).toEqual([]);
    const found = findFadeOccluders(scene);
    const lamps = found.filter((f) => f.obj.userData.lampGlobeY > 0);
    const rest = found.filter((f) => !(f.obj.userData.lampGlobeY > 0));
    expect(lamps).toHaveLength(4); // the alley's, and three in the street below
    expect(rest).toHaveLength(1);
    const body = rest[0];
    expect(body.shapes).toHaveLength(1);
    expect(body.shapes[0]).toMatchObject({ t: 'cyl', y0: LEVELS.WAREHOUSE, y1: 12.3 });
    expect(Math.hypot(body.x - VANE.x, body.z - VANE.z)).toBeLessThan(0.01);
    const parts = [];
    body.obj.traverse((o) => { if (o.isMesh) parts.push(o); });
    expect(parts.length).toBeGreaterThan(0);
    for (const p of parts) {
      const box = boxOf(p);
      expect(box.min.y, p.name).toBeGreaterThanOrEqual(LEVELS.WAREHOUSE - 0.01);
      expect(box.max.y, p.name).toBeLessThanOrEqual(12.3 + 0.01);
    }
    // it is its own top-level group, so the walk's prop merge keeps its mesh
    expect(body.obj.parent).toBe(scene);
  });

  // Step 5 fix wave (I1): the tower view fades the vane, so it is a mesh of
  // its own on its own gold, outside the kit, on the record as area.vane.
  it('the vane is its own mesh on its own see-through gold, on the record', () => {
    const v = area.vane;
    expect(v?.isMesh).toBe(true);
    expect(v.name).toBe('roofsVane');
    expect(meshes.filter((m) => m.name === 'roofsVane')).toEqual([v]);
    expect(v.material.transparent).toBe(true);
    expect(v.material.opacity).toBe(1);
    expect(v.material.depthWrite).toBe(true);
    expect(v.castShadow).toBe(false); // as the kit's gold it was drawn with
    expect(v.userData.noMerge).toBe(true); // the walk's prop merge keeps this very mesh
    expect(meshes.filter((m) => m !== v && m.material === v.material)).toEqual([]);
    const kitGold = meshes.find((m) => m.name === 'roofsNorth:gold');
    expect(kitGold.material).not.toBe(v.material);
    expect(kitGold.material.transparent).toBe(false);
    // the mast, the letters and the arrow: from the tower top to the vane's tip, round its spot
    const box = boxOf(v);
    expect(box.max.y).toBeCloseTo(VANE_TIP, 2);
    expect(box.min.y).toBeCloseTo(LEVELS.TOP, 2);
    expect(Math.max(box.max.x - VANE.x, VANE.x - box.min.x, box.max.z - VANE.z, VANE.z - box.min.z)).toBeLessThan(1.1);
  });

  it('fifteen leaps open the lantern roof; fourteen do not', () => {
    const { moveAbilities } = { moveAbilities: T_moveAbilities };
    const reaches = (leaps) => {
      const f = floodTraversal(area, { abilities: moveAbilities({ feats: { leap: leaps } }) });
      const got = f.reachable(f.regionAt(ROOFS_SPAWN.x, ROOFS_SPAWN.z));
      return got.has(f.regionAt(-19, -34, area.ground.y(-19, -34)));
    };
    expect(reaches(15)).toBe(true);
    expect(reaches(14)).toBe(false);
  }, 90000);

  it('the street below is outside every walk region and has its lamps and the bus', () => {
    const f = floodTraversal(area, { abilities: { longLeap: true, steady: true, climb: 2.2 } });
    const got = f.reachable(f.regionAt(ROOFS_SPAWN.x, ROOFS_SPAWN.z));
    let checked = 0;
    for (const s of STREETS) {
      for (let x = s.x0 + 0.5; x < s.x1; x += 1) {
        for (let z = s.z0 + 0.5; z < s.z1; z += 1) {
          if (area.ground.y(x, z) !== LEVELS.STREET) continue;
          checked++;
          expect([x, z, got.has(f.regionAt(x, z))]).toEqual([x, z, false]);
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
    // three lamps down in the street, lit at dusk like any lampPost
    const p = new THREE.Vector3();
    const lamps = [];
    scene.traverse((o) => { if (o.userData.lampGlobeY > 0) lamps.push(o.getWorldPosition(new THREE.Vector3())); });
    const down = lamps.filter((l) => Math.abs(l.y - LEVELS.STREET) < 1e-6);
    expect(down).toHaveLength(3);
    for (const l of down) expect(STREETS.some((s) => l.x > s.x0 && l.x < s.x1 && l.z > s.z0 && l.z < s.z1), `${l.x},${l.z}`).toBe(true);
    // the road, as the street blocks' ground
    for (const id of ['street', 'sideStreet']) {
      const road = meshes.filter((m) => m.userData.block === id);
      expect(road, id).toHaveLength(1);
      expect(road[0].userData.ground, id).toBe(true);
    }
    // one bus: one mesh, its windows lit, casting nothing, never merged, on the road
    const bus = meshes.filter((m) => m.userData.bus);
    expect(bus).toHaveLength(1);
    expect(area.bus).toBe(bus[0]);
    expect(bus[0].userData.noCast).toBe(true);
    expect(bus[0].userData.noMerge).toBe(true);
    expect(bus[0].material.emissiveMap || bus[0].material.emissive.getHex()).toBeTruthy();
    const bb = boxOf(bus[0]);
    expect(bb.min.y).toBeCloseTo(LEVELS.STREET, 1);
    const street = STREETS[0];
    expect(bb.min.z).toBeGreaterThan(street.z0);
    expect(bb.max.z).toBeLessThan(street.z1);
    bus[0].getWorldPosition(p);
    expect(p.y).toBeCloseTo(LEVELS.STREET, 5);
    // the far town: one mesh, casting nothing
    const town = meshes.filter((m) => m.userData.townBand);
    expect(town).toHaveLength(1);
    expect(town[0].userData.noCast).toBe(true);
    expect(town[0].parent).toBe(scene);
  });

  // Beauty pass, Task A (critique finding 1): the evening glow low in the sky.
  it('the sky glow: one additive band round the place, behind the town, unfogged, casting nothing, never merged', () => {
    const glow = meshes.filter((m) => m.userData.skyGlow);
    expect(glow).toHaveLength(1);
    const g = glow[0];
    expect(area.skyGlow).toBe(g); // roofslife.js colours it through the record
    expect(g.parent).toBe(scene);
    expect(g.castShadow).toBe(false);
    expect(g.userData.noCast).toBe(true);
    expect(g.userData.noMerge).toBe(true);
    expect(g.material).toBeInstanceOf(THREE.MeshBasicMaterial); // unlit
    expect(g.material.fog).toBe(false);
    expect(g.material.blending).toBe(THREE.AdditiveBlending);
    expect(g.material.transparent).toBe(true);
    expect(g.material.depthWrite).toBe(false);
    expect(g.material.vertexColors).toBe(true);
    const geo = g.geometry;
    expect((geo.index ? geo.index.count : geo.attributes.position.count) / 3).toBeLessThanOrEqual(200);
    // a ring behind the far town (whose ground reaches 112 m out), inside the
    // camera's 300 m far plane from every corner of the place
    const B = area.bounds;
    const cx = (B.minX + B.maxX) / 2;
    const cz = (B.minZ + B.maxZ) / 2;
    const P = new THREE.Vector3();
    const pos = { count: geo.attributes.position.count, at: (i) => P.fromBufferAttribute(geo.attributes.position, i).applyMatrix4(g.matrixWorld) };
    pos.getX = (i) => pos.at(i).x;
    pos.getY = (i) => pos.at(i).y;
    pos.getZ = (i) => pos.at(i).z;
    const col = geo.attributes.color;
    const corners = [[B.minX, B.minZ], [B.minX, B.maxZ], [B.maxX, B.minZ], [B.maxX, B.maxZ]];
    let topY = -Infinity;
    let footY = Infinity;
    for (let i = 0; i < pos.count; i++) {
      const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
      expect(Math.hypot(x - cx, z - cz)).toBeGreaterThan(150);
      for (const [qx, qz] of corners) expect(Math.hypot(x - qx, y - 10, z - qz)).toBeLessThan(295);
      topY = Math.max(topY, y);
      footY = Math.min(footY, y);
    }
    expect(footY).toBeLessThan(0); // from under the horizon
    expect(Math.atan2(topY, 200) * 180 / Math.PI).toBeGreaterThan(20); // to ~25 degrees up
    // bright at its foot, black at its top, warmer toward the sun than away from it
    let footSum = 0;
    for (let i = 0; i < pos.count; i++) {
      const s = col.getX(i) + col.getY(i) + col.getZ(i);
      if (pos.getY(i) === topY) expect(s).toBe(0);
      if (pos.getY(i) === footY) footSum = Math.max(footSum, s);
    }
    expect(footSum).toBeGreaterThan(0.3);
    const warmth = (dx, dz) => { // the red over blue of the column nearest a direction
      let best = -2;
      let r = 0;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) !== footY) continue;
        const d = ((pos.getX(i) - cx) * dx + (pos.getZ(i) - cz) * dz) / Math.hypot(pos.getX(i) - cx, pos.getZ(i) - cz);
        if (d > best) { best = d; r = col.getX(i) / col.getZ(i); }
      }
      return r;
    };
    const [sx, , sz] = SUN_POSITION;
    const n = Math.hypot(sx, sz);
    expect(warmth(sx / n, sz / n)).toBeGreaterThan(warmth(-sx / n, -sz / n) * 1.5);
    // like the sky it brightens, it moves with the camera across the ground (and only across it)
    const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 300);
    cam.position.set(18, 4.2, 45);
    cam.updateMatrixWorld();
    const before = g.position.clone();
    g.onBeforeRender(null, scene, cam, g.geometry, g.material, null);
    expect([g.position.x, g.position.y, g.position.z]).toEqual([18, before.y, 45]);
    expect(new THREE.Vector3().setFromMatrixPosition(g.matrixWorld).toArray()).toEqual([18, before.y, 45]);
    let far = 0;
    for (let i = 0; i < pos.count; i++) far = Math.max(far, pos.at(i).distanceTo(cam.position));
    expect(far).toBeLessThan(250); // inside the far plane, wherever she stands
    g.position.copy(before);
    g.updateMatrixWorld();
    // sunset's colour warmer and stronger than dusk's
    const { sunset, dusk } = g.userData.skyGlow;
    const sum = (c) => c[0] + c[1] + c[2];
    expect(sum(sunset)).toBeGreaterThan(sum(dusk));
    expect(sunset[0] / sunset[2]).toBeGreaterThan(dusk[0] / dusk[2]);
    // and after the walk's prop merge it is still its own mesh at the top
    const ms = new THREE.Scene();
    build(ms);
    mergeStaticProps(ms);
    const kept = [];
    ms.traverse((o) => { if (o.isMesh && o.userData.skyGlow) kept.push(o); });
    expect(kept).toHaveLength(1);
    expect(kept[0].parent).toBe(ms);
  });

  // Beauty pass, Task A (critique finding 2): a dark town against the glow,
  // full of little lights.
  it('the far town: one unlit mesh of dark silhouettes, with hundreds of lights that outshine the fog', () => {
    const town = meshes.filter((m) => m.userData.townBand);
    expect(town).toHaveLength(1);
    const t = town[0];
    expect(t.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(t.material.fog).toBe(true); // in the haze like everything else
    expect(t.castShadow).toBe(false);
    const col = t.geometry.attributes.color;
    const tris = col.count / 3;
    expect(tris).toBe(TOWN_TRIANGLES);
    let lights = 0;
    let darkMax = 0;
    for (let f = 0; f < tris; f++) {
      const [r, gg, bb] = [col.getX(f * 3), col.getY(f * 3), col.getZ(f * 3)];
      if (Math.max(r, gg, bb) > 1) lights++; // HDR: still a light after the fog's mix
      else darkMax = Math.max(darkMax, 0.2126 * r + 0.7152 * gg + 0.0722 * bb);
    }
    // a window or a street light is two triangles
    expect(lights / 2).toBeGreaterThanOrEqual(500);
    // the rest is darker than the dusk sky's horizon (linear luminance)
    const h = new THREE.Color(area.skyDusk.horizon);
    expect(darkMax).toBeLessThan(0.6 * (0.2126 * h.r + 0.7152 * h.g + 0.0722 * h.b));
  });

  // Round two, Task E (critique finding 9): the darkened town loomed, its back
  // rows taller than the front and as dark. Now aerial perspective: each row
  // farther out is paler (mixed toward the dusk horizon) and no taller than
  // the beauty pass's front row, so the skyline steps down into the haze.
  it('the far town steps back into the haze: each row paler than the one in front, the back rows lower', () => {
    const t = meshes.find((m) => m.userData.townBand);
    const pos = t.geometry.attributes.position;
    const col = t.geometry.attributes.color;
    const B = area.bounds;
    const [cx, cz] = [(B.minX + B.maxX) / 2, (B.minZ + B.maxZ) / 2];
    const ROWS = [[52.5, 7], [66, 9], [84, 12]]; // roofs.js TOWN_ROWS: s and depth
    const sums = ROWS.map(() => ({ l: 0, n: 0, ys: [], top: 0 }));
    for (let f = 0; f < pos.count / 3; f++) {
      const [r, g, b] = [col.getX(f * 3), col.getY(f * 3), col.getZ(f * 3)];
      if (Math.max(r, g, b) > 1 || g > r) continue; // a light, or a tree clump
      let [x, y, z] = [0, 0, 0];
      for (let k = 0; k < 3; k++) { x += pos.getX(f * 3 + k) / 3; y += pos.getY(f * 3 + k) / 3; z += pos.getZ(f * 3 + k) / 3; }
      if (y < LEVELS.STREET + 0.05) continue; // the town's ground
      const s = Math.max(Math.abs(x - cx), Math.abs(z - cz));
      const ri = ROWS.findIndex(([rs, d]) => Math.abs(s - rs) <= d / 2 + 0.3);
      if (ri < 0) continue;
      sums[ri].l += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sums[ri].n++;
      for (let k = 0; k < 3; k++) sums[ri].ys.push(pos.getY(f * 3 + k));
    }
    const mean = sums.map((q) => q.l / q.n);
    // a row's skyline: the height under which 98% of its walls' and roofs' corners lie (a far spire stands in the second)
    for (const q of sums) { q.ys.sort((p, o) => p - o); q.top = q.ys[Math.floor(0.98 * q.ys.length)]; }
    for (const q of sums) expect(q.n).toBeGreaterThan(100);
    expect(mean[1], mean.join(' ')).toBeGreaterThan(mean[0] * 1.15);
    expect(mean[2], mean.join(' ')).toBeGreaterThan(mean[1] * 1.15);
    // the back rows' highest walls and roofs no higher than the front row's plus a storey
    // (round two, Task G: the back row's tallest 2 m higher again, so a few roofs show over
    // the warehouse's parapet from her eye, below; +3 before)
    expect(sums[1].top).toBeLessThanOrEqual(sums[0].top + 2);
    expect(sums[2].top).toBeLessThanOrEqual(sums[0].top + 5);
    // its lights stay amber after the fog: the windows' red well over their blue
    let warm = 0;
    let n = 0;
    for (let f = 0; f < pos.count / 3; f++) {
      const [r, g, b] = [col.getX(f * 3), col.getY(f * 3), col.getZ(f * 3)];
      if (Math.max(r, g, b) <= 1) continue;
      n++;
      if (g < 0.5 * r && b < 0.15 * r) warm++;
    }
    expect(warm / n).toBeGreaterThan(0.6);
  });

  // ---------------------------------------------------------------------------
  // Beauty pass, Task B (critique findings 3 and 5): houses that differ, and
  // real roof edges. Looks only: the ground, the rails and the hops are the
  // plan's, so these tests read the drawing where the cat looks and walks.
  // ---------------------------------------------------------------------------
  const T = BLOCKS.find((b) => b.id === 'terrace');
  const HOUSE_W = 5;
  const houseX0 = (k) => T.x0 + HOUSE_W * (k - 1);
  const FLAT_HOUSE = 7; // the flat house: no slates over it
  const EAVE_Y = 6.45;
  const EAVE_OVER = 0.15;
  const PITCH = (LEVELS.RIDGE - EAVE_Y) / (T.z1 - T.ridgeZ);
  const slopeY = (z) => (z >= T.ridgeZ ? EAVE_Y + (T.z1 - z) * PITCH : EAVE_Y + (z - T.z0) * PITCH);
  const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const named = (n) => meshes.filter((m) => m.name === n);
  // what a ray hits first among `list` (default: every mesh)
  const rcB = new THREE.Raycaster();
  const firstHit = (from, dir, list = meshes) => {
    rcB.set(new THREE.Vector3(...from), new THREE.Vector3(...dir).normalize());
    rcB.far = 50;
    return rcB.intersectObjects(list, false)[0] ?? null;
  };
  // the drawn colour where a ray hits a mesh: its material colour times its
  // vertex colour there (white when it has none)
  const colourAt = (hit) => {
    const m = hit.object;
    const out = m.material.color.clone();
    const col = m.geometry.attributes.color;
    if (!m.material.vertexColors || !col) return out;
    const { a, b, c } = hit.face;
    const pos = m.geometry.attributes.position;
    const P = [a, b, c].map((i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
    const w = new THREE.Triangle(...P).getBarycoord(hit.point, new THREE.Vector3());
    const v = new THREE.Color(0, 0, 0);
    [a, b, c].forEach((i, j) => { v.r += col.getX(i) * w.getComponent(j); v.g += col.getY(i) * w.getComponent(j); v.b += col.getZ(i) * w.getComponent(j); });
    return out.multiply(v);
  };
  const differs = (p, q) => Math.abs(p.r - q.r) + Math.abs(p.g - q.g) + Math.abs(p.b - q.b) > 0.03;

  it('every house of the terrace has its own brick and its own slates, darker at the eave than at the ridge', () => {
    const wall = named('roofsTerrace:wall');
    const slates = meshes.filter((m) => m.userData.block === 'terrace');
    expect(wall).toHaveLength(1);
    expect(slates).toHaveLength(1);
    // the street front of each house, between its floors' windows
    const front = [];
    for (let k = 1; k <= 12; k++) {
      const hit = firstHit([houseX0(k) + 2.5, 3.0, -2], [0, 0, 1], wall);
      expect(hit, `house ${k} front`).toBeTruthy();
      expect(hit.point.z).toBeCloseTo(T.z0, 2);
      front.push(colourAt(hit));
    }
    for (let k = 1; k < 12; k++) expect(differs(front[k - 1], front[k]), `houses ${k} and ${k + 1}`).toBe(true);
    // a few kinds of house, not twelve random colours: at least four, and two painted
    const kinds = [];
    for (const c of front) if (!kinds.some((q) => !differs(q, c))) kinds.push(c);
    expect(kinds.length).toBeGreaterThanOrEqual(4);
    expect(kinds.length).toBeLessThanOrEqual(6);
    // the back of each house is the same house as its front
    for (const k of [1, 4, 9, 12]) {
      const hit = firstHit([houseX0(k) + 3.0, 1.0, 30], [0, 0, -1], wall);
      expect(hit, `house ${k} back`).toBeTruthy();
      expect(differs(colourAt(hit), front[k - 1]), `house ${k} back`).toBe(false);
    }
    // the slates: each house's own, and darker at the eave than at the ridge
    const roofs = [];
    for (let k = 1; k <= 12; k++) {
      if (k === FLAT_HOUSE) { roofs.push(null); continue; }
      const x = houseX0(k) + 2.5;
      const eave = firstHit([x, 20, T.z0 + 0.3], [0, -1, 0], slates);
      const ridge = firstHit([x, 20, T.ridgeZ - 0.6], [0, -1, 0], slates);
      expect(eave && ridge, `house ${k} slates`).toBeTruthy();
      const [ce, cr] = [colourAt(eave), colourAt(ridge)];
      expect(lum(ce), `house ${k} eave darker`).toBeLessThan(lum(cr) * 0.9);
      roofs.push(cr);
    }
    for (let k = 1; k < 12; k++) {
      const [p, q] = [roofs[k - 1], roofs[k] ?? roofs[k + 1]];
      if (p && q) expect(differs(p, q), `slates ${k} and next`).toBe(true);
    }
  });

  it('the warehouse is a darker brick and the corner shop is painted; what the pass left alone looks as before', () => {
    const terraceDefault = new THREE.Color(0x9a5640);
    // the warehouse's front over the street, between its first two floors' windows
    const wh = firstHit([0, 3.25, -5], [0, 0, -1], named('roofsNorth:wall'));
    expect(wh).toBeTruthy();
    expect(wh.point.z).toBeCloseTo(-13, 2);
    // the corner shop's end over the street
    const shop = firstHit([25, 3.0, -6], [1, 0, 0], named('roofsNorth:wall'));
    expect(shop).toBeTruthy();
    expect(shop.point.x).toBeCloseTo(30, 2);
    const [cw, cs] = [colourAt(wh), colourAt(shop)];
    expect(lum(cw)).toBeLessThan(lum(terraceDefault) * 0.8);
    expect(lum(cs)).toBeGreaterThan(lum(terraceDefault) * 1.8);
    expect(differs(cw, cs)).toBe(true);
    // the alley's walls and the yard walls: the brick they always had
    for (const m of [...named('roofsAlley:wall'), ...meshes.filter((o) => o.userData.yardWalls)]) {
      const col = m.geometry.attributes.color;
      const c = new THREE.Color();
      for (let i = 0; i < m.geometry.attributes.position.count; i += 7) {
        c.copy(m.material.color);
        if (m.material.vertexColors) c.multiply(new THREE.Color(col.getX(i), col.getY(i), col.getZ(i)));
        expect(c.r).toBeCloseTo(terraceDefault.r, 4);
        expect(c.g).toBeCloseTo(terraceDefault.g, 4);
        expect(c.b).toBeCloseTo(terraceDefault.b, 4);
      }
    }
    // the colours are the plan's: built twice, every colour the same
    const s2 = new THREE.Scene();
    build(s2);
    const cols = (s) => { const out = []; s.traverse((o) => { if (o.isMesh && o.geometry.attributes.color) out.push([o.name, Array.from(o.geometry.attributes.color.array)]); }); return out; };
    expect(cols(s2)).toEqual(cols(scene));
  });

  it('the eaves have an edge: a slate edge, a board and soffit under it, and a round gutter hanging in front', () => {
    const eaves = [];
    for (let k = 1; k <= 12; k++) if (k !== FLAT_HOUSE) eaves.push([k, T.z0 - EAVE_OVER, -1]);
    // the back eave runs where no flat roof cuts it (the dormer: house 5; the roof terrace: house 10)
    for (const k of [1, 2, 3, 4, 8, 11, 12]) eaves.push([k, T.z1 + EAVE_OVER, 1]);
    const leadAt = (x) => ROOFS_TRAVERSAL.crossings.some((c) => c.kind === 'gutter' && x >= Math.min(c.points[0].x, c.points[1].x) && x <= Math.max(c.points[0].x, c.points[1].x));
    for (const [k, zE, s] of eaves) {
      const x = houseX0(k) + 2.7; // clear of the windows' sills and the dishes
      const yE = slopeY(zE);
      const tag = `house ${k} ${s < 0 ? 'front' : 'back'}`;
      // from below, the overhang is closed just under the slates' edge
      const up = firstHit([x, EAVE_Y - 1.2, zE - s * 0.08], [0, 1, 0]); // from over the outriggers' felt
      expect(up, `${tag} soffit`).toBeTruthy();
      expect(up.point.y, `${tag} soffit`).toBeGreaterThan(yE - 0.3);
      expect(up.point.y, `${tag} soffit`).toBeLessThan(yE + 0.01);
      // from outside, just under the edge, the slates have thickness at their edge
      const edge = firstHit([x, yE - 0.02, zE + s * 2], [0, 0, -s]);
      expect(edge, `${tag} slate edge`).toBeTruthy();
      expect(Math.abs(edge.point.z - zE), `${tag} slate edge`).toBeLessThanOrEqual(0.02);
      if (leadAt(x)) continue;
      // the hanging gutter: round (its front further out near its top than its bottom), in front of the edge
      const hi = firstHit([x, yE - 0.075, zE + s * 2], [0, 0, -s]);
      const lo = firstHit([x, yE - 0.14, zE + s * 2], [0, 0, -s]);
      expect(hi && lo, `${tag} gutter`).toBeTruthy();
      expect(s * (hi.point.z - zE), `${tag} gutter out`).toBeGreaterThan(0.08);
      expect(s * (hi.point.z - lo.point.z), `${tag} gutter round`).toBeGreaterThan(0.03);
    }
  });

  it('the ridge tiles sit proud of the slates, a darker terracotta, their top on the rail', () => {
    const ridges = ROOFS_TRAVERSAL.crossings.filter((c) => c.kind === 'ridge');
    for (const c of ridges) {
      const m = meshes.find((o) => o.userData.crossing === c.id);
      const y = c.points[0].y;
      const x = (c.points[0].x + c.points[1].x) / 2;
      expect(boxOf(m).max.y, c.id).toBeCloseTo(y, 2); // she walks on the rail, as before
      for (const dz of [-0.15, 0.15]) {
        const hit = firstHit([x, y + 2, T.ridgeZ + dz], [0, -1, 0], [m]);
        expect(hit, `${c.id} ${dz}`).toBeTruthy();
        expect(hit.point.y - slopeY(T.ridgeZ + dz), `${c.id} proud at ${dz}`).toBeGreaterThan(0.03);
      }
      const top = firstHit([x, y + 2, T.ridgeZ], [0, -1, 0], [m]);
      const col = colourAt(top);
      expect(col.r).toBeGreaterThan(col.g);
      expect(col.g).toBeGreaterThan(col.b);
      expect(lum(col), c.id).toBeLessThan(lum(new THREE.Color(0x8e4b38)));
    }
  });

  it('the shed has a board round its felt that reads from the alley, never above its roof', () => {
    const S = BLOCKS.find((b) => b.id === 'shed');
    const y = S.y - 0.13; // under the felt
    const south = firstHit([14.5, y, S.z1 + 3], [0, 0, -1]);
    const north = firstHit([14.5, y, S.z0 - 3], [0, 0, 1]);
    const east = firstHit([S.x1 + 3, y, 31.5], [-1, 0, 0]);
    expect(south.point.z).toBeGreaterThan(S.z1 + 0.05);
    expect(north.point.z).toBeLessThan(S.z0 - 0.05);
    expect(east.point.x).toBeGreaterThan(S.x1 + 0.05);
    for (const h of [south, north, east]) {
      expect(h.object.userData.block, 'not the felt itself').toBeUndefined();
      const c = colourAt(h);
      expect(c.g).toBeGreaterThan(c.r); // the door's green
    }
    // nothing round the shed's edge rises above its roof, and nothing reaches past its felt
    const v = new THREE.Vector3();
    for (const m of meshes) {
      if (m.userData.block || m.userData.crossing || m.userData.markRanges || m.userData.townBand || m.userData.skyGlow) continue;
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        const near = v.x > S.x0 - 0.01 && v.x < S.x1 + 0.3 && v.z > S.z0 - 0.3 && v.z < S.z1 + 0.3;
        const out = v.x > S.x1 + 0.001 || v.z < S.z0 - 0.001 || v.z > S.z1 + 0.001;
        if (!near || !out || v.y < S.y - 0.3 || v.y > S.y + 0.5) continue;
        expect(v.y, `${m.name} above the shed's edge`).toBeLessThanOrEqual(S.y + 1e-6);
        expect(Math.max(v.x - S.x1, S.z0 - v.z, v.z - S.z1), `${m.name} past the felt`).toBeLessThanOrEqual(0.1 + 1e-6); // the felt's 0.08, the downpipe's 0.1
      }
    }
  });

  it('six stacks carry a TV aerial and two back walls a dish, over the slates', () => {
    const stacks = BLOCKS.filter((b) => b.id.startsWith('stack-'));
    const v = new THREE.Vector3();
    const others = meshes.filter((m) => !m.userData.block && !m.userData.crossing && !m.userData.townBand && !m.userData.skyGlow);
    let withAerial = 0;
    for (const s of stacks) {
      let found = false;
      for (const m of others) {
        const pos = m.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
          const r = Math.hypot(v.x - s.x, v.z - s.z);
          if (r > 1.6 || v.y < s.y - 0.6) continue;
          // beside the stack, never over its top she stands on (its pots and the warm cowl reach 0.74)
          if (v.y > s.y && v.y < s.y + 0.9) expect(r > s.r + 0.02 || v.y < s.y + 0.8, `${m.name} on ${s.id}`).toBe(true);
          // an aerial: high over the slates beside it (not the corner shop's parapet by stack-29.4, a taller block's wall)
          const byTaller = BLOCKS.some((b) => b.kind === 'flat' && b.y > s.y && v.x > b.x0 - 0.35 && v.x < b.x1 + 0.35 && v.z > b.z0 - 0.35 && v.z < b.z1 + 0.35);
          if (v.y > s.y + 0.9 && r > s.r + 0.02 && !byTaller && Math.abs(area.ground.y(v.x, v.z) - LEVELS.VOID) < 1e-6) found = true;
        }
      }
      if (found) withAerial++;
    }
    expect(withAerial).toBe(6);
    // the dishes: on the back walls, between the upstairs windows and the eave
    const houses = new Set();
    for (const m of others) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        if (v.z > T.z1 + 0.25 && v.z < T.z1 + 1 && v.y > 5.2 && v.y < 6.15 && v.x > T.x0 && v.x < T.x1) houses.add(Math.floor((v.x - T.x0) / HOUSE_W) + 1);
      }
    }
    expect(houses.size).toBe(2);
  });

  // Rooftops step 3, Task 3: the birds' perches (roofsflock.js), the drawn
  // ones pushed while drawing.
  it('every bird perch sits on something drawn', { timeout: 60000 }, () => {
    const solid = meshes.filter((m) => !m.userData.skyGlow && !m.userData.townBand);
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    expect(area.birdPerches.length).toBeGreaterThan(150);
    // (the bin bags' landing too: its perch is lifted onto the heap, roofsflock.js PERCH_LIFT)
    const off = [];
    for (const p of area.birdPerches) {
      ray.set(new THREE.Vector3(p.x, p.y + 0.3, p.z), down);
      ray.far = 0.6;
      const hit = ray.intersectObjects(solid, false)[0];
      if (!hit) off.push(`${p.id}: nothing under it`);
      else if (Math.abs(hit.point.y - p.y) > 0.06) off.push(`${p.id} (${p.kind}) on ${hit.object.name} at ${hit.point.y.toFixed(3)}, not ${p.y.toFixed(3)}`);
    }
    expect(off).toEqual([]);
  });

  it('the pots, the aerials, the parapets, the posts and the yard walls give perches', () => {
    const of = (kind) => area.birdPerches.filter((p) => p.kind === kind);
    const stacks = BLOCKS.filter((b) => b.id.startsWith('stack-'));
    // a pot top each side of a stack's ridge line, named by the stack's x and the side
    expect(of('pot').length).toBeGreaterThanOrEqual(10);
    for (const p of of('pot')) {
      const [, x, side] = p.id.split(':').map(Number);
      const s = stacks.find((k) => k.x === x);
      expect(s, p.id).toBeDefined();
      expect(Math.sign(p.z - s.z), p.id).toBe(side);
      expect(p.y, p.id).toBeGreaterThan(s.y + 0.4);
      expect(p.y, p.id).toBeLessThan(s.y + 0.8);
    }
    // the warm chimney's pot (discovery F): its top on its cowl's, over the other pots
    // (it smokes, Task 5, so it is in the drawn pot tops but no bird's perch)
    const warmId = `pot:${ROOFS_DISCOVERIES.chimney.x}:-1`;
    const warm = area.potTops[warmId];
    expect(warm).toBeDefined();
    expect(of('pot').find((p) => p.id === warmId)).toBeUndefined();
    expect(warm.y).toBeGreaterThan(Math.max(...Object.entries(area.potTops).filter(([id]) => id !== warmId).map(([, p]) => p.y)));
    // an aerial on each of the six stacks that carries one, high over its stack
    // (five perches: aerial:-10 stands in the warm chimney's smoke, 0.12 m from
    // its pot's top, so no bird perches on it while that pot smokes, Task 5)
    expect(of('aerial').map((p) => p.id)).not.toContain('aerial:-10');
    expect(of('aerial')).toHaveLength(5);
    for (const p of of('aerial')) {
      const s = stacks.find((k) => `aerial:${k.x}` === p.id);
      expect(s, p.id).toBeDefined();
      expect(p.y).toBeGreaterThan(s.y + 0.9);
      expect(Math.hypot(p.x - s.x, p.z - s.z)).toBeLessThan(1.6);
    }
    // the parapets every 3 m, none over a street: the warehouse's, the shop's and tower-1's ring corners
    expect(of('parapet').length).toBeGreaterThanOrEqual(8);
    for (const p of of('parapet')) for (const s of STREETS) expect(p.x >= s.x0 && p.x <= s.x1 && p.z >= s.z0 && p.z <= s.z1, p.id).toBe(false);
    for (const block of ['warehouse', 'cornerShop']) expect(of('parapet').filter((p) => p.id.startsWith(`parapet:${block}:`)).length, block).toBeGreaterThanOrEqual(4);
    expect(of('parapet').filter((p) => p.id.startsWith('parapet:tower-1:')).map((p) => p.id).sort()).toEqual([0, 1, 2, 3].map((n) => `parapet:tower-1:${n}`));
    // each washing post's T-bar, and the coping of each yard wall
    expect(of('post').map((p) => p.id).sort()).toEqual(WASHING_POSTS.flatMap((_, i) => [`post:${i}:0`, `post:${i}:1`]).sort());
    for (const p of of('post')) expect(p.y).toBeGreaterThan(1.9);
    expect(of('wall').length).toBeGreaterThanOrEqual(6);
    for (const p of of('wall')) expect(p.y).toBeGreaterThan(YARD.h);
    expect(Object.isFrozen(area.birdPerches)).toBe(true);
  });

  it('nothing drawn stands where she walks a rail or makes a hop', () => {
    // her body's space above every rail and along every hop (at the higher
    // end's level), 0.25 m either side: only the rail's own drawing, the
    // blocks' tops and the take-off marks may be there. From 0.07 m up: the
    // gables' and cheeks' stone copings have always met the stacks 0.06 m
    // above their tops (Task 7), inside the stack where she stands.
    const others = meshes.filter((m) => !m.userData.block && !m.userData.crossing && !m.userData.markRanges && !m.userData.townBand && !m.userData.skyGlow && !m.userData.ground);
    const paths = [];
    for (const c of ROOFS_TRAVERSAL.crossings) for (let i = 0; i + 1 < c.points.length; i++) paths.push([c.id, c.points[i], c.points[i + 1]]);
    for (const h of area.traversal.hops) {
      const y = Math.max(h.y0, h.y1);
      paths.push([h.id, { x: h.x0, z: h.z0, y }, { x: h.x1, z: h.z1, y }]);
    }
    const v = new THREE.Vector3();
    const bad = [];
    const boxes = others.map((m) => boxOf(m).expandByScalar(0.3));
    for (const [id, a, c] of paths) {
      const len = Math.hypot(c.x - a.x, c.z - a.z) || 1e-9;
      const lo = Math.min(a.y, c.y) + 0.07;
      const hi = Math.max(a.y, c.y) + 0.45;
      others.forEach((m, j) => {
        const bb = boxes[j];
        if (bb.max.y < lo || bb.min.y > hi) return;
        if (bb.max.x < Math.min(a.x, c.x) || bb.min.x > Math.max(a.x, c.x) || bb.max.z < Math.min(a.z, c.z) || bb.min.z > Math.max(a.z, c.z)) return;
        const pos = m.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
          const t = Math.max(0, Math.min(1, ((v.x - a.x) * (c.x - a.x) + (v.z - a.z) * (c.z - a.z)) / (len * len)));
          const d = Math.hypot(v.x - (a.x + (c.x - a.x) * t), v.z - (a.z + (c.z - a.z) * t));
          const y = a.y + (c.y - a.y) * t;
          if (d < 0.25 && v.y > y + 0.07 && v.y < y + 0.45) { bad.push([id, m.name, +v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]); break; }
        }
      });
    }
    expect(bad.slice(0, 6)).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Beauty pass, Task C (critique findings 4 and 6): windows and the tower.
  // Looks only; read where the camera looks.
  // ---------------------------------------------------------------------------
  const W = BLOCKS.find((b) => b.id === 'warehouse');
  const T1 = BLOCKS.find((b) => b.id === 'tower-1');
  const BF = BLOCKS.find((b) => b.id === 'belfry');
  const LS = BLOCKS.find((b) => b.id === 'lanternStage');
  const TT = BLOCKS.find((b) => b.id === 'towerTop');
  const TCX = (BF.x0 + BF.x1) / 2;
  const TCZ = (BF.z0 + BF.z1) / 2;
  // the four sides of a stage: its wall's x or z, its outward normal, the right of someone facing it
  const sidesOf = (r) => [[r.x0, TCZ, -1, 0], [r.x1, TCZ, 1, 0], [TCX, r.z0, 0, -1], [TCX, r.z1, 0, 1]];
  // a level ray at the wall from `out` m in front of it (inside the railings of the stage below), `side` along it, at height y
  const atWall = ([x, z, nx, nz], side, y, out = 0.5) => firstHit([x + nx * out + nz * side, y, z + nz * out - nx * side], [-nx, 0, -nz]);

  it('the warehouse roof lights show their warm glass, framed round its edge and never covered', () => {
    let n = 0;
    for (const x of [-12, -4, 4]) {
      for (const z of [-22, -40]) {
        n++;
        for (const [dx, dz] of [[0, 0], [0.4, 0.9], [-0.4, -0.9], [0.4, -0.9], [-0.4, 0.9]]) {
          const hit = firstHit([x + dx, W.y + 3, z + dz], [0, -1, 0]);
          expect([x, z, dx, dz, hit?.object.name]).toEqual([x, z, dx, dz, 'roofsWindows']);
          const cell = Math.floor(hit.uv.x * 4) + 4 * Math.floor(hit.uv.y * 4);
          expect([x, z, WINDOW_CELLS[cell].light, WINDOW_CELLS[cell].kind]).toEqual([x, z, 'warm', 'plain']);
        }
        // just outside the glass: an iron frame standing a little above it
        for (const [dx, dz] of [[0.53, 0], [-0.53, 0], [0, 1.13], [0, -1.13]]) {
          const hit = firstHit([x + dx, W.y + 3, z + dz], [0, -1, 0]);
          expect([x, z, dx, dz, /iron/i.test(hit?.object.name ?? '')]).toEqual([x, z, dx, dz, true]);
          expect(hit.point.y).toBeGreaterThan(W.y + 0.025);
          expect(hit.point.y).toBeLessThan(W.y + 0.06);
        }
      }
    }
    expect(n).toBe(6);
  });

  it('the clock faces are big and bright, ringed in a dark bezel on a pale stone panel', () => {
    const clock = meshes.filter((m) => m.userData.clockFaces);
    expect(clock).toHaveLength(1);
    const f = clock[0];
    expect([f.castShadow, f.userData.noCast]).toEqual([false, true]);
    expect(f.material.emissiveIntensity).toBeGreaterThanOrEqual(1.8);
    const pos = f.geometry.attributes.position;
    const v = new THREE.Vector3();
    // the face she climbs (the belfry climb, Task D): a flush dial, no panel
    const climbed = new Set(climbedSides(BF).map(sideKey));
    expect(climbed.size).toBe(1);
    for (const s of sidesOf(BF)) {
      const [x, z, nx, nz] = s;
      const onClimb = climbed.has(sideKey(s));
      // the face's own vertices on this side: as tall as the belfry's storey allows
      const ys = [];
      let proud = 0;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(f.matrixWorld);
        if ((nx && Math.sign(v.x - x) === nx && Math.abs(v.x - x) < 0.3) || (nz && Math.sign(v.z - z) === nz && Math.abs(v.z - z) < 0.3)) {
          ys.push(v.y);
          proud = Math.max(proud, nx ? Math.abs(v.x - x) : Math.abs(v.z - z));
        }
      }
      expect(ys.length, `${nx},${nz}`).toBeGreaterThan(20);
      const lo = Math.min(...ys);
      const hi = Math.max(...ys);
      // R 0.63 or more (it was 0.55); on the climb's face R 0.55, under the cornice
      expect(hi - lo, `${nx},${nz} diameter`).toBeGreaterThanOrEqual(onClimb ? 1.1 : 1.26);
      if (onClimb) {
        expect(proud).toBeLessThan(FLUSH);
        expect(hi + CLOCK_BEZEL).toBeLessThan(BF.y - 0.22); // clear under the cornice
      }
      expect(lo).toBeGreaterThan(T1.y);
      expect(hi).toBeLessThan(BF.y);
      const cy = (lo + hi) / 2;
      const R = (hi - lo) / 2;
      // the face at 12 o'clock, clear of the hands and the ticks
      expect(atWall(s, 0, cy + 0.3 * R)?.object).toBe(f);
      // just outside it, the dark bezel, all round
      for (const a of [0, 1.2, 2.5, 3.6, 4.9]) {
        const hit = atWall(s, Math.sin(a) * (R + 0.03), cy + Math.cos(a) * (R + 0.03));
        expect([nx, nz, a, lum(colourAt(hit)) < 0.03]).toEqual([nx, nz, a, true]);
      }
      // in the corners round it, the pale stone panel, paler than the belfry's wall beside it
      // (on the climb's face, the belfry's own wall: nothing proud there)
      const wall = atWall(s, 2.3, cy);
      expect(wall.object.name).toBe('belfry');
      for (const [u, w] of [[0.62, 0.6], [-0.62, 0.6], [0.62, -0.6], [-0.62, -0.6]].map(([p, q]) => (onClimb ? [p, q * 0.92] : [p, q]))) {
        const hit = atWall(s, u, cy + w);
        expect([nx, nz, u, w, hit.object.name]).toEqual([nx, nz, u, w, onClimb ? 'belfry' : 'roofsNorth:stone']);
        if (!onClimb) expect(lum(colourAt(hit))).toBeGreaterThan(1.3 * lum(colourAt(wall)));
      }
    }
  });

  it('the tower is warm sandstone, with pale dressings between its stages and a verdigris band round its drum', () => {
    const warm = (c) => c.b < 0.5 * c.r;
    // the stages' walls, clear of the clock and the bell openings
    for (const [r, id, y] of [[BF, 'belfry', (T1.y + BF.y) / 2], [LS, 'lanternStage', BF.y + 0.15]]) {
      for (const s of sidesOf(r)) {
        const hit = atWall(s, 1.6, y);
        expect([id, s[2], s[3], hit?.object.name]).toEqual([id, s[2], s[3], id]);
        expect([id, s[2], s[3], warm(colourAt(hit))]).toEqual([id, s[2], s[3], true]);
      }
    }
    const wallLum = lum(colourAt(atWall(sidesOf(BF)[1], 1.6, (T1.y + BF.y) / 2)));
    // the first ledge and the belfry's cornice: paler stone
    const ledge = atWall(sidesOf(T1)[1], 1.6, T1.y - 0.15);
    expect(ledge.object.name).toBe('tower-1');
    expect(lum(colourAt(ledge))).toBeGreaterThan(1.3 * wallLum);
    const cornice = atWall(sidesOf(BF)[1], 1.6, BF.y - 0.16);
    expect(cornice.object.name).toBe('roofsNorth:stone');
    expect(lum(colourAt(cornice))).toBeGreaterThan(1.3 * wallLum);
    // round the top drum, under its railing: copper gone green
    for (const a of [0, 1.6, 3.1, 4.7]) {
      const hit = firstHit([TT.x + Math.cos(a) * 3, TT.y - 0.15, TT.z + Math.sin(a) * 3], [-Math.cos(a), 0, -Math.sin(a)]);
      const c = colourAt(hit);
      expect([a, c.g > 1.3 * c.r, c.b > c.r]).toEqual([a, true, true]);
    }
  });

  it('each bell opening has three louvre slats across it, but the one she climbs past', () => {
    // inside the opening (0.95 m tall), clear of its very edges where the wall shows
    const y0 = (BF.y + LS.y) / 2 - 0.49;
    const y1 = (BF.y + LS.y) / 2 + 0.44;
    const climbed = new Set(climbedSides(LS).map(sideKey));
    expect(climbed.size).toBe(1);
    for (const s of sidesOf(LS)) {
      if (climbed.has(sideKey(s))) {
        // open (Task D): she climbs up past it, so nothing stands out of its dark
        for (let i = 0; i <= 80; i++) {
          const hit = atWall(s, 0.2, y0 + ((y1 - y0) * i) / 80);
          expect([i, lum(colourAt(hit)) < 0.04, Math.abs(s[2] ? hit.point.x - s[0] : hit.point.z - s[1]) < FLUSH]).toEqual([i, true, true]);
        }
        continue;
      }
      let runs = 0;
      let inSlat = false;
      for (let i = 0; i <= 80; i++) {
        const hit = atWall(s, 0.2, y0 + ((y1 - y0) * i) / 80);
        const light = lum(colourAt(hit)) > 0.04;
        if (light && !inSlat) runs++;
        inSlat = light;
      }
      expect([s[2], s[3], runs]).toEqual([s[2], s[3], 3]);
      // ...and they lie close on the wall, out of her way on the belfry's ring
      const out = atWall(s, 0.2, (y0 + y1) / 2).point;
      expect(Math.abs((s[2] ? out.x - s[0] : out.z - s[1]))).toBeLessThan(0.1);
    }
  });

  it('four pinnacles stand on the belfry\'s corners, outside every stage she walks on', () => {
    const stone = named('roofsNorth:stone');
    expect(stone).toHaveLength(1);
    const corners = [[BF.x0, BF.z0, -1, -1], [BF.x1, BF.z0, 1, -1], [BF.x0, BF.z1, -1, 1], [BF.x1, BF.z1, 1, 1]];
    // seen against the sky: higher than the belfry's railing (0.55 m)
    for (const [x, z, sx, sz] of corners) {
      const hit = firstHit([x + sx * 0.12, 20, z + sz * 0.12], [0, -1, 0]);
      expect([x, z, hit?.object.name]).toEqual([x, z, 'roofsNorth:stone']);
      expect(hit.point.y).toBeGreaterThan(BF.y + 0.6);
    }
    // all of the stone near the belfry's corners, above the ledge she walks: outside the
    // belfry's and the lantern stage's tops, and over the ledge's ring only far above her head
    const v = new THREE.Vector3();
    const pos = stone[0].geometry.attributes.position;
    const near = corners.map(() => 0);
    const inside = (r, p) => p.x > r.x0 + 1e-6 && p.x < r.x1 - 1e-6 && p.z > r.z0 + 1e-6 && p.z < r.z1 - 1e-6;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(stone[0].matrixWorld);
      const k = corners.findIndex(([x, z]) => Math.hypot(v.x - x, v.z - z) < 0.45);
      if (k < 0 || v.y < T1.y) continue;
      if (v.y > BF.y + 0.1) {
        near[k]++;
        expect([v.x, v.y, v.z, inside(BF, v) || inside(LS, v)]).toEqual([v.x, v.y, v.z, false]);
      }
      if (!inside(BF, v)) expect(v.y).toBeGreaterThan(T1.y + 0.6);
    }
    for (const n of near) expect(n).toBeGreaterThan(4);
  });

  // ---------------------------------------------------------------------------
  // Task C's review: the north clock panel stood 0.1 m proud right where the
  // belfry climb goes up the wall. Her body is CAT_RADIUS round the straight
  // path of every climb and drop on the tower (take-off to landing, its height
  // running from one end's to the other's), from 0.07 to 0.45 m over it. Only
  // the stages she climbs may be there: their walls, and what lies flush on
  // them (within FLUSH). Every triangle is sampled, not only its corners.
  // ---------------------------------------------------------------------------
  const FLUSH = 0.035; // m: paint lying on a wall, no more proud than this
  const CLOCK_BEZEL = 0.07;
  const onTower = (x, z) => x > T1.x0 - 0.2 && x < T1.x1 + 0.2 && z > T1.z0 - 0.2 && z < T1.z1 + 0.2;
  const towerHops = () => area.traversal.hops.filter((h) => onTower(h.x0, h.z0) || onTower(h.x1, h.z1));
  // which side of a stage's rectangle a tower hop goes over (the face she climbs)
  const climbedSides = (r) => sidesOf(r).filter(([x, z, nx, nz]) => towerHops().some((h) => (nx
    ? (h.x0 - x) * (h.x1 - x) < 0 && Math.abs(h.z0 + ((h.z1 - h.z0) * (x - h.x0)) / (h.x1 - h.x0) - z) < (r.z1 - r.z0) / 2
    : (h.z0 - z) * (h.z1 - z) < 0 && Math.abs(h.x0 + ((h.x1 - h.x0) * (z - h.z0)) / (h.z1 - h.z0) - x) < (r.x1 - r.x0) / 2)));
  const sideKey = (s) => `${s[2]},${s[3]}`;

  it('no drawn tower piece stands in her body on a climb or a drop up the tower', () => {
    const hops = towerHops();
    expect(hops.map((h) => h.id).sort()).toEqual(['belfry-down', 'belfry-up', 'lanternStage-down', 'lanternStage-up', 'tower-1-down', 'tower-1-up', 'towerTop-down', 'towerTop-up']);
    // the stages' walls (and the ledge's 0.1 m overhang), each over its own heights
    const WALLS = [[T1, 0, LEVELS.WAREHOUSE, 12.3], [T1, 0.1, 12.3, T1.y], [BF, 0, T1.y, BF.y], [LS, 0, BF.y, LS.y]];
    const flush = (p) => WALLS.some(([r, o, y0, y1]) => p.y > y0 - 1e-3 && p.y < y1 + 1e-3
      && p.x > r.x0 - o - FLUSH && p.x < r.x1 + o + FLUSH && p.z > r.z0 - o - FLUSH && p.z < r.z1 + o + FLUSH)
      || (p.y > LS.y - 1e-3 && p.y < TT.y + 1e-3 && Math.hypot(p.x - TT.x, p.z - TT.z) < TT.r + FLUSH);
    const others = meshes.filter((m) => !m.userData.block && !m.name.startsWith('roofsTowerBody') && !m.userData.markRanges
      && !m.userData.ground && !m.userData.townBand && !m.userData.skyGlow);
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
    const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const h of hops) {
      lo.min(new THREE.Vector3(Math.min(h.x0, h.x1) - CAT_RADIUS, Math.min(h.y0, h.y1), Math.min(h.z0, h.z1) - CAT_RADIUS));
      hi.max(new THREE.Vector3(Math.max(h.x0, h.x1) + CAT_RADIUS, Math.max(h.y0, h.y1) + 0.45, Math.max(h.z0, h.z1) + CAT_RADIUS));
    }
    const near = new THREE.Box3(lo, hi);
    const bad = [];
    let sampled = 0;
    const [a, b, c, p] = [0, 1, 2, 3].map(() => new THREE.Vector3());
    const tri = new THREE.Box3();
    for (const m of others) {
      const pos = m.geometry.attributes.position;
      const idx = m.geometry.index;
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i < n; i += 3) {
        [a, b, c].forEach((v, j) => v.fromBufferAttribute(pos, idx ? idx.getX(i + j) : i + j).applyMatrix4(m.matrixWorld));
        tri.setFromPoints([a, b, c]);
        if (!tri.intersectsBox(near)) continue;
        const k = Math.min(200, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / 0.015));
        for (let u = 0; u <= k; u++) {
          for (let w = 0; u + w <= k; w++) {
            p.copy(a).addScaledVector(b.clone().sub(a), u / k).addScaledVector(c.clone().sub(a), w / k);
            if (flush(p)) continue;
            sampled++;
            for (const h of hops) {
              const len2 = (h.x1 - h.x0) ** 2 + (h.z1 - h.z0) ** 2;
              const t = Math.max(0, Math.min(1, ((p.x - h.x0) * (h.x1 - h.x0) + (p.z - h.z0) * (h.z1 - h.z0)) / len2));
              const d = Math.hypot(p.x - (h.x0 + (h.x1 - h.x0) * t), p.z - (h.z0 + (h.z1 - h.z0) * t));
              const y = h.y0 + (h.y1 - h.y0) * t;
              if (d < CAT_RADIUS && p.y > y + 0.07 && p.y < y + 0.45) bad.push([h.id, m.name, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]);
            }
          }
        }
      }
    }
    expect(sampled).toBeGreaterThan(1000);
    expect([...new Map(bad.map((q) => [`${q[0]} ${q[1]}`, q])).values()]).toEqual([]);
    // the faces she climbs: the belfry's north (the clock) and the lantern stage's east (a bell opening)
    expect(climbedSides(BF).map(sideKey)).toEqual(['0,-1']);
    expect(climbedSides(LS).map(sideKey)).toEqual(['1,0']);
  });

  // ---------------------------------------------------------------------------
  // Beauty pass, Task D (critique findings 7, 8 and 9): readable hints and a
  // lived-in alley. Looks only: colliders, perches, rails and hops are the plan's.
  // ---------------------------------------------------------------------------
  const srgbHSL = (lin) => new THREE.Color().setRGB(lin.r, lin.g, lin.b).getHSL({}, THREE.SRGBColorSpace);

  // Round two, Task E (critique finding 3): the ring is gone (it read as a
  // puddle's rim or a target), so this no longer pins a rise near the rim.
  it('the take-off glow is warm amber, ringless, brighter at sunset than at dusk', () => {
    const glow = glowMesh();
    expect(area.markGlow).toBe(glow);
    const mat = glow.material;
    // amber, not the near-white it was (0xffd9a0)
    const [r, g, b] = [mat.color.getHex() >> 16, (mat.color.getHex() >> 8) & 255, mat.color.getHex() & 255];
    expect(r > g && g > b && b < 0.5 * r).toBe(true);
    // its map: full at the middle, nothing at the rim, and never rising again on the way out
    const { data, width, height } = mat.map.image;
    const row = Array.from({ length: width / 2 }, (_, i) => data[((height / 2) * width + width / 2 + i) * 4 + 3]);
    expect(row[0]).toBeGreaterThanOrEqual(240);
    for (let i = 1; i < row.length; i++) expect(row[i], row.join(',')).toBeLessThanOrEqual(row[i - 1]);
    expect(row[row.length - 1]).toBe(0);
    // the evening drives its opacity: stronger on the sunlit felt, fainter (under FU2's ceiling) at dusk
    const { sunset, dusk } = glow.userData.glowOpacity;
    expect(sunset).toBeGreaterThan(0.36);
    expect(sunset).toBeLessThanOrEqual(0.45);
    expect(dusk).toBeLessThanOrEqual(GLOW_OPACITY_MAX);
    expect(mat.opacity).toBe(dusk);
    const fog = new THREE.Fog(0x765266, 40, 140);
    // a real scene: the built place has bird perches, so the life adds its flock (step 3)
    const lifeScene = new THREE.Scene();
    lifeScene.fog = fog;
    const life = area.life({ scene: lifeScene, sun: { intensity: 1 }, fill: { intensity: 1 } });
    expect(mat.opacity).toBeCloseTo(sunset, 6);
    let last = mat.opacity;
    for (let t = 0; t < EVENING_RAMP; t += 10) {
      life.update(10);
      expect(mat.opacity).toBeLessThanOrEqual(last + 1e-9);
      last = mat.opacity;
    }
    expect(mat.opacity).toBeCloseTo(dusk, 6);
    life.dispose();
    // the walk's own material: the shared kit glow (markMesh's) is never moved
    expect(mat).not.toBe(markMesh('lip', { x0: 0, z0: 0, x1: 1, z1: 0, prop: 'tank' }).children[0].material);
  });

  // Round two, Task E (critique finding 7): the garden's bulbs tone-mapped to
  // white hexagons, and the bench's back floated on the wall.
  it('the garden bulbs glow warm orange, not white; the bench back is joined to its seat', () => {
    const lights = named('roofsGardenLights');
    expect(lights).toHaveLength(1);
    const e = lights[0].material.emissive;
    expect(e.r > e.g && e.g > e.b).toBe(true);
    expect(e.g).toBeLessThan(0.45 * e.r); // linear: an orange, not a cream
    expect(lights[0].material.emissiveIntensity).toBeLessThanOrEqual(1.6);
    // the bench: between its seat's back edge and the backrest's foot, wood near both ends
    const RT = BLOCKS.find((b) => b.id === 'roofTerrace');
    const Bn = GARDEN.bench;
    const wood = meshes.filter((m) => /:wood$/.test(m.name));
    const seat = { y: RT.y + Bn.seat, z: Bn.z - 0.2 };
    const backrest = { y: RT.y + Bn.seat + 0.1, z: RT.z0 + 0.065 };
    for (const k of [0.2, 0.5, 0.8]) {
      const y = seat.y + (backrest.y - seat.y) * k;
      const z = seat.z + (backrest.z - seat.z) * k;
      const west = firstHit([Bn.x - Bn.len / 2 - 0.3, y, z], [1, 0, 0], wood);
      const east = firstHit([Bn.x + Bn.len / 2 + 0.3, y, z], [-1, 0, 0], wood);
      expect(west?.point.x ?? Infinity, `west ${k}`).toBeLessThan(Bn.x - Bn.len / 4);
      expect(east?.point.x ?? -Infinity, `east ${k}`).toBeGreaterThan(Bn.x + Bn.len / 4);
    }
  });

  // Round two, Task E (critique finding 11): the corner shop was a pale
  // cardboard box. A deeper buff, with stone string courses at its floor lines
  // and a cornice under its parapet.
  it('the corner shop has two stone string courses at its floor lines and a cornice, on every face she sees', () => {
    const S = BLOCKS.find((b) => b.id === 'cornerShop');
    const top = S.y - 0.15;
    const north = meshes.filter((m) => /^roofsNorth:/.test(m.name));
    const wallHit = firstHit([25, 3.4, -6], [1, 0, 0], named('roofsNorth:wall'));
    const wallLum = lum(colourAt(wallHit));
    // [where the ray starts, which way, the face's coordinate, its axis]: between windows on each face
    const faces = [
      [[S.x0 - 3, 0, -9.35], [1, 0, 0], S.x0, 'x', -1], // the street end
      [[S.x1 + 3, 0, 0], [-1, 0, 0], S.x1, 'x', 1], // over the shop yard
      [[34, 0, S.z1 + 3], [0, 0, -1], S.z1, 'z', 1], // over the back yards
    ];
    for (const [from, dir, face, ax, out] of faces) {
      const proudAt = (y) => {
        const h = firstHit([from[0], y, from[2]], dir, north);
        if (!h) return [0, 0];
        return [(h.point[ax] - face) * out, lum(colourAt(h))];
      };
      let runs = 0;
      let inRun = false;
      for (let y = 0.5; y <= top - 0.5; y += 0.025) {
        const [proud, l] = proudAt(y);
        const course = proud >= 0.04 && proud <= 0.2 && l > 1.2 * wallLum;
        if (course && !inRun) runs++;
        inRun = course;
      }
      expect(runs, `${ax} ${face} courses`).toBeGreaterThanOrEqual(2);
      let cornice = 0;
      for (let y = top - 0.3; y <= top - 0.03; y += 0.02) cornice = Math.max(cornice, proudAt(y)[0]);
      expect(cornice, `${ax} ${face} cornice`).toBeGreaterThanOrEqual(0.15);
    }
  });

  // ---------------------------------------------------------------------------
  // Round two, Task F (critique findings 2, 4, 5, 6 and 13's drawing): what she
  // walks on. Looks only: the rails, the ground, the hops and the perches are
  // the plan's, so these read the drawing where she stands and lands.
  // ---------------------------------------------------------------------------
  const itemsOf = (...kinds) => meshes.filter((m) => m.userData.itemRanges)
    .flatMap((m) => m.userData.itemRanges.filter((r) => kinds.includes(r.kind)).map((r) => [m, r]));
  const verticesOf = ([m, r]) => {
    const pos = m.geometry.attributes.position;
    return Array.from({ length: r.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(pos, r.start + i).applyMatrix4(m.matrixWorld));
  };
  // which item of the kit a ray hit (its face's first vertex in the item's range)
  const itemHit = (hit) => (hit?.object.userData.itemRanges ?? []).find((r) => hit.face.a >= r.start && hit.face.a < r.start + r.count) ?? null;

  // Critique finding 2: one smooth extrusion read as a red carpet down the ridge.
  it('the ridge she walks is capped in single tiles, each its own shade, stepped and pointed at every joint, its crown the rail', () => {
    const ridges = ROOFS_TRAVERSAL.crossings.filter((c) => c.kind === 'ridge');
    const tileLum = lum(new THREE.Color(0x763a2b));
    let joints = 0;
    for (const c of ridges) {
      const m = meshes.find((o) => o.userData.crossing === c.id);
      expect(m.castShadow, c.id).toBe(false);
      expect(m.userData.noCast, c.id).toBe(true);
      const { y, z } = c.points[0];
      const x0 = Math.min(c.points[0].x, c.points[1].x);
      const x1 = Math.max(c.points[0].x, c.points[1].x);
      const len = x1 - x0;
      const tiles = Math.ceil(len / 0.45 - 1e-9);
      // the crown is the rail she walks, at 20 places along it, and nothing is higher
      expect(boxOf(m).max.y, c.id).toBeLessThanOrEqual(y + 0.001);
      for (let k = 0; k < 20; k++) {
        const x = x0 + ((k + 0.5) * len) / 20;
        const top = firstHit([x, y + 2, z], [0, -1, 0], [m]);
        expect(Math.abs(top.point.y - y), `${c.id} crown at ${x.toFixed(2)}`).toBeLessThanOrEqual(0.001);
      }
      // a level ray at each flank, every 1 cm along it: each tile's socket end
      // stands out past the spigot end of the tile before it, so the side steps
      // out once at every joint
      const steps = { [-1]: [], 1: [] };
      for (const side of [-1, 1]) {
        let last = null;
        for (let x = x0 + 0.005; x < x1; x += 0.01) {
          const h = firstHit([x, y - 0.04, z + side], [0, 0, -side], [m]);
          const out = h ? side * (h.point.z - z) : 0;
          if (last !== null && out - last > 0.004) steps[side].push(x);
          last = out;
        }
        expect(steps[side].length + 1, `${c.id} ${side}: tiles`).toBe(tiles);
      }
      // each tile its own shade of the terracotta, read at its crown
      const shades = [];
      for (let i = 0; i < tiles; i++) {
        const top = firstHit([x0 + ((i + 0.5) * len) / tiles, y + 2, z], [0, -1, 0], [m]);
        const col = colourAt(top);
        expect(col.r > col.g && col.g > col.b, `${c.id} tile ${i}`).toBe(true);
        expect(lum(col) / tileLum, `${c.id} tile ${i}`).toBeGreaterThan(0.8 * 0.9);
        expect(lum(col) / tileLum, `${c.id} tile ${i}`).toBeLessThan(1.25 * 1.08);
        shades.push(lum(col).toFixed(4));
      }
      expect(new Set(shades).size, c.id).toBeGreaterThanOrEqual(Math.ceil(tiles * 0.6));
      // and the bedding mortar pale at every joint, looking along the flank
      for (const side of [-1, 1]) {
        for (const xj of steps[side]) {
          const h = firstHit([xj - 0.1, y - 0.04, z + side * 0.161], [1, 0, 0], [m]);
          expect(h, `${c.id} ${side} joint at ${xj.toFixed(2)}`).toBeTruthy();
          expect(Math.abs(h.point.x - xj), `${c.id} ${side} joint at ${xj.toFixed(2)}`).toBeLessThan(0.02);
          expect(lum(colourAt(h)), `${c.id} ${side} mortar`).toBeGreaterThan(3 * tileLum);
          joints++;
        }
      }
    }
    expect(joints).toBeGreaterThan(200);
  });

  // Critique finding 4: five glossy boulders taller than a cat, and she ended
  // the drop standing inside them.
  it('the bin bags are a slumped heap of knotted bags under 17 cm, the flattest where she lands', () => {
    const bags = itemsOf('bag');
    const knots = itemsOf('bagKnot');
    expect(bags).toHaveLength(5);
    expect(knots).toHaveLength(5);
    for (const it of [...bags, ...knots]) for (const v of verticesOf(it)) expect(v.y, it[1].id).toBeLessThan(0.17);
    // her landing (the drop's own spot, unchanged): on a bag, its top 0.05-0.11 m up
    const drop = area.traversal.hops.find((h) => h.id === 'garages-bags');
    expect([drop.x1, drop.z1]).toEqual([BIN_BAGS.x, BIN_BAGS.z]);
    const under = firstHit([drop.x1, 1, drop.z1], [0, -1, 0]);
    expect(itemHit(under)?.kind).toBe('bag');
    expect(under.point.y).toBeGreaterThan(0.05);
    expect(under.point.y).toBeLessThanOrEqual(0.11);
    // the heap's footprint covers the spot all round, half a metre across
    for (let a = 0; a < 8; a++) {
      const h = firstHit([drop.x1 + 0.25 * Math.cos(a), 1, drop.z1 + 0.25 * Math.sin(a)], [0, -1, 0]);
      expect(itemHit(h)?.kind, `round the landing ${a}`).toBe('bag');
    }
    // each knot is pinched: narrower at its middle than at its foot and its top, and above its bag
    for (const it of knots) {
      const vs = verticesOf(it);
      const lo = Math.min(...vs.map((v) => v.y));
      const hi = Math.max(...vs.map((v) => v.y));
      expect(hi - lo, it[1].id).toBeGreaterThan(0.045);
      const c = vs.reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(vs.length);
      const spread = (f) => Math.max(...vs.filter((v) => Math.abs(v.y - (lo + (hi - lo) * f)) < 0.004).map((v) => Math.hypot(v.x - c.x, v.z - c.z)), 0);
      expect(spread(0.5), it[1].id).toBeLessThan(0.5 * Math.min(spread(0), spread(1)));
    }
    // the shades: black and dark green, not one paint
    const shades = bags.map(([m, r]) => {
      const col = m.geometry.attributes.color;
      return new THREE.Color(col.getX(r.start), col.getY(r.start), col.getZ(r.start));
    });
    expect(new Set(shades.map((s) => s.getHexString())).size).toBe(5);
    expect(shades.some((s) => s.g > 1.15 * s.r)).toBe(true);
    for (const s of shades) expect(lum(s)).toBeLessThan(0.05);
  });

  // Critique finding 5: the felt she walks most was an empty grey plain.
  it('the felt roofs have drip edges, repair patches and, on the warehouse, lead flashing and outlets: all flush and clear of every take-off', () => {
    const flat = itemsOf('feltPatch', 'flashing', 'outlet', 'stain');
    const takeoffs = area.traversal.hops.map((h) => [h.x0, h.z0]);
    const bad = [];
    for (const it of flat) {
      const vs = verticesOf(it);
      // the triangles' middles too, so no piece spans a spot between its corners
      const mids = [];
      for (let i = 0; i + 2 < vs.length; i += 3) mids.push(vs[i].clone().add(vs[i + 1]).add(vs[i + 2]).divideScalar(3));
      for (const v of [...vs, ...mids]) {
        const up = v.y - area.ground.y(v.x, v.z);
        if (!(up > 0.002 && up <= 0.015)) bad.push([it[1].id, 'up', +up.toFixed(4)]);
        const near = Math.min(...takeoffs.map(([x, z]) => Math.hypot(v.x - x, v.z - z)));
        if (near < 0.6) bad.push([it[1].id, 'take-off', +near.toFixed(2)]);
      }
    }
    expect(bad.slice(0, 6)).toEqual([]);
    // patches on every felt roof she walks: two or more on each big one
    const per = new Map();
    for (const [, r] of itemsOf('feltPatch')) per.set(r.roof, (per.get(r.roof) ?? 0) + 1);
    // (an extension with an outrigger on it has half its roof free: one there)
    const exts = BLOCKS.filter((q) => /^ext-/.test(q.id));
    const outs = ['out-2', 'out-5', 'out-7', 'out-10'];
    const underOut = new Set(outs.map((id) => `ext-${id.slice(4)}`));
    for (const id of ['garages', 'warehouse', 'cornerShop', 'flatHouse', ...exts.map((q) => q.id).filter((id) => !underOut.has(id))]) expect(per.get(id) ?? 0, id).toBeGreaterThanOrEqual(2);
    for (const id of ['shed', 'dormer', ...outs, ...underOut]) expect(per.get(id) ?? 0, id).toBeGreaterThanOrEqual(1);
    // the warehouse: four outlets, each with its stain, and flashing at the parapets' feet
    expect(itemsOf('outlet')).toHaveLength(4);
    expect(itemsOf('stain')).toHaveLength(4);
    const W = BLOCKS.find((q) => q.id === 'warehouse');
    const fl = itemsOf('flashing');
    expect(fl.length).toBeGreaterThanOrEqual(4);
    for (const it of fl) {
      const vs = verticesOf(it);
      const edge = Math.min(...vs.map((v) => Math.min(v.x - W.x0, W.x1 - v.x, v.z - W.z0, W.z1 - v.z)));
      expect(edge, it[1].id).toBeLessThan(0.01); // along an edge, at the parapet's foot
    }
    // the drip edges: on the outer vertical faces of every extension, outrigger
    // and the garages, the top 5 cm of the felt's edge, never on top
    const trims = itemsOf('dripEdge');
    const roofs = ['garages', ...exts.map((q) => q.id), 'out-2', 'out-5', 'out-7', 'out-10'].map((id) => BLOCKS.find((q) => q.id === id));
    expect(new Set(trims.map(([, r]) => r.roof))).toEqual(new Set(roofs.map((q) => q.id)));
    for (const it of trims) {
      const R = roofs.find((q) => q.id === it[1].roof);
      const [m, r] = it;
      const nor = m.geometry.attributes.normal;
      for (let i = r.start; i < r.start + r.count; i++) expect(Math.abs(nor.getY(i)), it[1].id).toBeLessThan(1e-4);
      for (const v of verticesOf(it)) {
        expect(v.y, it[1].id).toBeLessThanOrEqual(R.y + 1e-6);
        expect(v.y, it[1].id).toBeGreaterThanOrEqual(R.y - 0.06);
        const outside = Math.max(R.x0 - v.x, v.x - R.x1, R.z0 - v.z, v.z - R.z1);
        expect(outside, it[1].id).toBeGreaterThan(0.002);
        expect(outside, it[1].id).toBeLessThan(0.02);
      }
    }
    // a ray at each extension's back edge, just under its top, meets the trim
    for (const e of exts) {
      const h = firstHit([(e.x0 + e.x1) / 2 + 0.6, e.y - 0.025, e.z1 + 1], [0, 0, -1]);
      expect(itemHit(h)?.kind, e.id).toBe('dripEdge');
    }
  });

  // Critique finding 6: the alley's cobbles were pillows at cat height.
  it('the alley\'s setts are smaller (a 0.75 m tile, not the 1.2 m house tile), the yards\' flags as they were', () => {
    const uvTile = (m) => {
      const pos = m.geometry.attributes.position;
      const uv = m.geometry.attributes.uv;
      const ks = new Set();
      for (let i = 0; i < pos.count; i++) {
        if (Math.abs(pos.getX(i)) > 1) ks.add((pos.getX(i) / uv.getX(i)).toFixed(4));
        if (Math.abs(pos.getZ(i)) > 1) ks.add((pos.getZ(i) / uv.getY(i)).toFixed(4));
      }
      return [...ks];
    };
    expect(uvTile(named('roofsGround:cobble')[0])).toEqual(['0.7500']);
    expect(uvTile(named('roofsGround:flags')[0])).toEqual([tileMetres('flagstone').toFixed(4)]);
    // the ground she walks is the plan's: the alley at 0
    for (const [x, z] of [[-40, 36], [0, 41], [40, 45], [42, 0], [45, -20]]) expect(area.ground.y(x, z)).toBe(0);
  });

  // Critique finding 13 (its drawing only; the walk-through is the owner's call):
  // a plain brown box, no slats.
  it('the alley crates are slatted, dark gaps across each side and darker battens at the corners, their tops where the perches are', () => {
    const noGlow = meshes.filter((m) => !m.userData.markGlow);
    const woodMesh = named('roofsAlley:wood')[0];
    const woodLum = lum(woodMesh.material.color);
    for (const c of ALLEY_CRATES) {
      // the perch is the drawn top, wood, not a slat
      const top = firstHit([c.x, 3, c.z], [0, -1, 0], noGlow);
      expect(top.object, `crate ${c.x}`).toBe(woodMesh);
      expect(Math.abs(top.point.y - (c.y + c.s)), `crate ${c.x}`).toBeLessThan(0.001);
      expect(ROOFS_PERCHES.some((p) => p.x === c.x && p.z === c.z && Math.abs(p.y - top.point.y) < 0.001)).toBe(true);
      // each side face, read with level rays from 5 cm out
      const [cs, sn] = [Math.cos(c.yaw), Math.sin(c.yaw)];
      const toWorld = (lx, lz) => [c.x + lx * cs + lz * sn, c.z - lx * sn + lz * cs];
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const [tx, tz] = [-nz, nx]; // along the face
        const read = (along, h) => {
          const [ox, oz] = toWorld(nx * (c.s / 2 + 0.05) + tx * along, nz * (c.s / 2 + 0.05) + tz * along);
          const [dx, dz] = toWorld(-nx, -nz).map((q, i) => q - [c.x, c.z][i]);
          const hit = firstHit([ox, c.y + h, oz], [dx, 0, dz], noGlow);
          return hit && hit.distance < 0.08 ? hit : null;
        };
        const kinds = [];
        for (let f = 0.1; f < 0.95; f += 0.02) {
          const hit = read(0, c.s * f);
          kinds.push(hit && itemHit(hit)?.kind === 'crateSlat' && lum(colourAt(hit)) < 0.5 * woodLum ? 'gap' : hit?.object === woodMesh ? 'wood' : '?');
        }
        const runs = kinds.join(',').split(/(?:wood,?)+/).filter((s) => s.includes('gap')).length;
        expect(runs, `crate ${c.x} face ${nx},${nz}: ${kinds.join(' ')}`).toBe(2);
        expect(kinds.filter((k) => k === '?'), `crate ${c.x} face ${nx},${nz}`).toEqual([]);
        // a batten up each corner, darker than the boards
        for (const end of [-1, 1]) {
          const hit = read(end * (c.s / 2 - 0.02), c.s * 0.25);
          expect(itemHit(hit)?.kind, `crate ${c.x} face ${nx},${nz} corner ${end}`).toBe('crateBatten');
          expect(lum(colourAt(hit))).toBeLessThan(0.85 * woodLum);
        }
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Round two, Task G (critique findings 10 and 12): the street lit. Looks
  // only: the copings, the road and the lamps' halo are drawing; nothing she
  // walks on moves.
  // ---------------------------------------------------------------------------

  // Critique finding 10: the coping she stands on was a jointless pale band.
  it('the shop\'s and the warehouse\'s copings have a dark joint across their top about every 0.9 m, flush on the stone', () => {
    const S = BLOCKS.find((q) => q.id === 'cornerShop');
    const W = BLOCKS.find((q) => q.id === 'warehouse');
    const stone = named('roofsNorth:stone');
    expect(stone.length).toBeGreaterThan(0);
    const joints = itemsOf('copingJoint');
    expect(joints.length).toBeGreaterThan(100);
    // every coping line: its block, its top, the line's fixed coordinate and which axis it runs along
    const lines = [
      { top: S.y + 0.45 + 0.07, along: 'z', at: S.x1 + 0.125, a: S.z0, b: S.z1 + 0.25 },
      { top: S.y + 0.45 + 0.07, along: 'x', at: S.z1 + 0.125, a: S.x0 - 0.25, b: S.x1 },
      { top: S.y + 0.45 + 0.07, along: 'z', at: S.x0 - 0.125, a: S.z0, b: S.z1 },
      { top: W.y + 0.5 + 0.07, along: 'x', at: W.z1 + 0.125, a: W.x0 - 0.25, b: W.x1 + 0.25 },
      { top: W.y + 0.5 + 0.07, along: 'z', at: W.x0 - 0.125, a: W.z0 - 0.25, b: W.z1 },
      { top: W.y + 0.5 + 0.07, along: 'x', at: W.z0 - 0.125, a: W.x0, b: W.x1 + 0.25 },
      { top: W.y + 0.5 + 0.07, along: 'z', at: W.x1 + 0.125, a: W.z0, b: W.z1 },
    ];
    const pt = (L, s) => (L.along === 'x' ? [s, L.at] : [L.at, s]);
    const [mx, mz] = pt(lines[0], (lines[0].a + lines[0].b) / 2);
    const copingLum = lum(colourAt(firstHit([mx, 20, mz], [0, -1, 0], stone)));
    const onLine = new Map(lines.map((L) => [L, []]));
    for (const it of joints) {
      const vs = verticesOf(it);
      const xs = vs.map((v) => v.x);
      const zs = vs.map((v) => v.z);
      const [cx, cz] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
      const L = lines.find((q) => Math.abs((q.along === 'x' ? cz : cx) - q.at) < 0.01 && (q.along === 'x' ? cx : cz) > q.a - 0.01 && (q.along === 'x' ? cx : cz) < q.b + 0.01);
      expect(L, `${it[1].id} at ${cx.toFixed(2)},${cz.toFixed(2)}`).toBeTruthy();
      // across the whole coping (0.25 m), a thin line along it, just over its top
      const across = L.along === 'x' ? Math.max(...zs) - Math.min(...zs) : Math.max(...xs) - Math.min(...xs);
      const along = L.along === 'x' ? Math.max(...xs) - Math.min(...xs) : Math.max(...zs) - Math.min(...zs);
      expect([it[1].id, across >= 0.24 && across <= 0.27, along >= 0.01 && along <= 0.025]).toEqual([it[1].id, true, true]);
      for (const v of vs) expect(v.y - L.top, it[1].id).toBeGreaterThan(0.0005);
      for (const v of vs) expect(v.y - L.top, it[1].id).toBeLessThan(0.003);
      // the coping right under it, and the joint dark against it
      const under = firstHit([cx, L.top + 1, cz], [0, -1, 0], stone);
      expect(Math.abs(under.point.y - L.top), it[1].id).toBeLessThan(0.001);
      const [m, r] = it;
      const col = m.geometry.attributes.color;
      const c = m.material.color.clone().multiply(new THREE.Color(col.getX(r.start), col.getY(r.start), col.getZ(r.start)));
      expect(lum(c), it[1].id).toBeLessThan(0.5 * copingLum);
      onLine.get(L).push(L.along === 'x' ? cx : cz);
    }
    // along every stretch of coping (rays down every 0.1 m), a joint or the
    // stretch's end is never more than half a joint's spacing away, and the
    // joints are not crowded
    for (const L of lines) {
      const js = onLine.get(L).sort((p, q) => p - q);
      for (let i = 1; i < js.length; i++) expect(js[i] - js[i - 1], `${L.along} ${L.at}`).toBeGreaterThan(0.75);
      const stretch = [];
      const check = () => {
        if (stretch.length < 12) return;
        const [s0, s1] = [stretch[0], stretch[stretch.length - 1]];
        for (const s of stretch) {
          const near = Math.min(s - s0, s1 - s, ...js.map((j) => Math.abs(j - s)));
          expect(near, `${L.along} ${L.at} at ${s.toFixed(1)}`).toBeLessThanOrEqual(0.55);
        }
      };
      for (let s = L.a + 0.05; s < L.b; s += 0.1) {
        const [x, z] = pt(L, s);
        const hit = firstHit([x, L.top + 1, z], [0, -1, 0], stone);
        if (hit && Math.abs(hit.point.y - L.top) < 0.001) stretch.push(s);
        else { check(); stretch.length = 0; }
      }
      check();
    }
  });

  // Critique finding 10: the road was a black void.
  it('the road has double yellow lines along both kerbs, drain grates in the gutters and two round iron covers, all flush on it', () => {
    const st = BLOCKS.find((q) => q.id === 'street');
    const side = BLOCKS.find((q) => q.id === 'sideStreet');
    const y = LEVELS.STREET;
    const road = meshes.filter((m) => m.userData.block === 'street');
    const paint = named('roofsStreet:paint');
    const list = [...paint, ...road];
    const pieces = itemsOf('yellowLine', 'grate', 'cover');
    for (const it of pieces) {
      for (const v of verticesOf(it)) {
        const up = v.y - y;
        expect([it[1].id, up > 0.003 && up < 0.009]).toEqual([it[1].id, true]);
        expect([it[1].id, v.x > st.x0 && v.x < st.x1 && v.z > st.z0 + PAVEMENT && v.z < st.z1 - PAVEMENT]).toEqual([it[1].id, true]);
      }
    }
    // the kerbs' faces, and which way the road lies from each
    const kerbs = [
      { z: st.z1 - PAVEMENT - 0.15, dir: -1, x0: st.x0, x1: st.x1 }, // by the terrace
      { z: st.z0 + PAVEMENT + 0.15, dir: 1, x0: side.x1, x1: st.x1 }, // by the warehouse
    ];
    const yellow = (h) => {
      if (itemHit(h)?.kind !== 'yellowLine') return false;
      const c = colourAt(h);
      return c.r > 0.4 && c.g > 0.2 && c.b < 0.15 * c.r;
    };
    for (const k of kerbs) {
      // two yellow lines side by side, close to the kerb, all along it
      for (let x = k.x0 + 1.5; x < k.x1 - 1; x += 3.7) {
        const seq = [];
        for (let d = 0.005; d < 0.8; d += 0.01) seq.push(yellow(firstHit([x, y + 1, k.z + k.dir * d], [0, -1, 0], list)) ? 'Y' : '.');
        const runs = seq.join('').split(/\.+/).filter((s) => s.length);
        expect([x, k.z, runs.length], seq.join('')).toEqual([x, k.z, 2]);
      }
    }
    // the grates: six, in the gutters by the kerbs, dark, with three bars across
    const grates = itemsOf('grate');
    expect(grates).toHaveLength(6);
    for (const k of kerbs) {
      const here = grates.filter((g) => verticesOf(g).every((v) => Math.abs(v.z - k.z) < 0.3));
      expect(here.length, `kerb ${k.z}`).toBe(3);
      for (const g of here) {
        const vs = verticesOf(g);
        const xs = vs.map((v) => v.x);
        const zs = vs.map((v) => v.z);
        const [gx0, gx1] = [Math.min(...xs), Math.max(...xs)];
        const gz = (Math.min(...zs) + Math.max(...zs)) / 2;
        const seq = [];
        for (let x = gx0 + 0.005; x < gx1; x += 0.01) {
          const h = firstHit([x, y + 1, gz], [0, -1, 0], list);
          expect(itemHit(h)?.kind).toBe('grate');
          seq.push(lum(colourAt(h)) < 0.02 ? '.' : 'B');
        }
        expect(seq.join('').split(/\.+/).filter((s) => s.length), `${g[1].id} ${seq.join('')}`).toHaveLength(3);
      }
    }
    // two iron covers out in the road: round (eight-sided), off the kerbs and the middle line
    const covers = itemsOf('cover');
    expect(covers).toHaveLength(2);
    const mid = (st.z0 + PAVEMENT + st.z1 - PAVEMENT) / 2;
    for (const c of covers) {
      const vs = verticesOf(c);
      expect(c[1].count / 3, c[1].id).toBe(8);
      const cx = vs.reduce((s, v) => s + v.x, 0) / vs.length;
      const cz = vs.reduce((s, v) => s + v.z, 0) / vs.length;
      const r = Math.max(...vs.map((v) => Math.hypot(v.x - cx, v.z - cz)));
      expect(r).toBeGreaterThan(0.25);
      expect(r).toBeLessThan(0.45);
      expect(Math.abs(cz - mid) - r).toBeGreaterThan(0.3);
      for (const k of kerbs) expect(Math.abs(cz - k.z)).toBeGreaterThan(1.5);
    }
  });

  // Critique finding 12: the lamps were white balls with nothing round them.
  it('the four lamp globes have a soft warm halo: one additive mesh, casting nothing, never merged, a quad on each globe facing the camera', () => {
    const halos = meshes.filter((m) => m.userData.lampHalo);
    expect(halos).toHaveLength(1);
    const h = halos[0];
    expect(h.parent).toBe(scene);
    expect([h.castShadow, h.receiveShadow, h.userData.noCast, h.userData.noMerge]).toEqual([false, false, true, true]);
    const mat = h.material;
    expect([mat.blending, mat.transparent, mat.depthWrite]).toEqual([THREE.AdditiveBlending, true, false]);
    expect(mat.fog).toBe(false); // unfogged like the sky glow: fog tinted it peach-pink at distance
    expect(mat.map).toBe(area.markGlow.material.map); // the take-off glow's ringless falloff
    expect(mat.color.r > mat.color.g && mat.color.g > mat.color.b).toBe(true); // warm
    expect(mat.opacity).toBeGreaterThan(0.3);
    expect(mat.opacity).toBeLessThanOrEqual(0.6);
    const globes = [];
    scene.traverse((o) => { if (o.isMesh && o.userData.lampGlobe) globes.push(o.getWorldPosition(new THREE.Vector3())); });
    expect(globes).toHaveLength(4);
    // never culled while a globe's halo could show
    expect(h.geometry.boundingSphere).toBeTruthy(); // what three culls by
    const bs = h.geometry.boundingSphere.clone().applyMatrix4(h.matrixWorld);
    for (const g of globes) expect(bs.distanceToPoint(g)).toBeLessThan(-0.45);
    for (const at of [[4, 0.45, 41], [14, 12.9, -13.4], [-30, 20, 30]]) {
      const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 300);
      cam.position.set(...at);
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld();
      h.onBeforeRender(null, scene, cam, h.geometry, h.material, null);
      h.updateMatrixWorld(true);
      const pos = h.geometry.attributes.position;
      const idx = h.geometry.index;
      expect(idx.count / 3).toBe(8); // four quads
      const seen = new Set();
      for (let q = 0; q < 4; q++) {
        const v = [0, 1, 2, 3].map((k) => new THREE.Vector3().fromBufferAttribute(pos, idx.getX(q * 6 + [0, 1, 2, 5][k])).applyMatrix4(h.matrixWorld));
        const c = v.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(4);
        const gi = globes.findIndex((g) => g.distanceTo(c) < 0.001);
        expect(gi, `${at} quad ${q}`).toBeGreaterThanOrEqual(0);
        seen.add(gi);
        const n = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0])).normalize();
        const toCam = new THREE.Vector3().subVectors(cam.position, c).normalize();
        expect(Math.abs(n.dot(toCam)), `${at} quad ${q}`).toBeGreaterThan(0.999);
        for (let k = 0; k < 4; k++) expect(v[k].distanceTo(c) * Math.SQRT2, `${at} quad ${q}`).toBeGreaterThan(0.85);
      }
      expect(seen.size).toBe(4);
    }
    // and after the walk's prop merge it is still its own mesh at the top
    const ms = new THREE.Scene();
    build(ms);
    mergeStaticProps(ms);
    const kept = [];
    ms.traverse((o) => { if (o.isMesh && o.userData.lampHalo) kept.push(o); });
    expect(kept).toHaveLength(1);
    expect(kept[0].parent).toBe(ms);
  });

  // Task E's review: with the far town's back rows lowered, from the warehouse
  // roof at cat height (the extra-warehouse-cat view) it hid below the
  // parapet, an empty pink band. A few roofs and lights show over it again.
  it('from the warehouse roof at cat height, a few far roofs and lit windows show over the parapet', () => {
    const town = meshes.find((m) => m.userData.townBand);
    const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 300);
    cam.position.set(-12, 11.45, -20);
    cam.lookAt(-30, 11.2, -36);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const solid = meshes.filter((m) => m !== town && !m.material.transparent && !m.userData.skyGlow);
    const pos = town.geometry.attributes.position;
    const col = town.geometry.attributes.color;
    const rc = new THREE.Raycaster();
    let lights = 0;
    let roofs = 0;
    for (let f = 0; f < pos.count / 3; f++) {
      const c = new THREE.Vector3();
      for (let k = 0; k < 3; k++) c.add(new THREE.Vector3().fromBufferAttribute(pos, f * 3 + k));
      c.divideScalar(3);
      if (c.y <= cam.position.y) continue; // under her eye: the parapet, over her eye, hides it
      const p = c.clone().project(cam);
      if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1 || p.z > 1) continue;
      const d = c.distanceTo(cam.position);
      rc.set(cam.position, c.clone().sub(cam.position).normalize());
      rc.far = d - 0.05;
      if (rc.intersectObjects(solid, false).length) continue;
      const [r, g] = [col.getX(f * 3), col.getY(f * 3)];
      if (Math.max(r, g, col.getZ(f * 3)) <= 1) roofs++;
      else if (g > 0.2 * r) lights++; // a lit window or roof light (not the chimney's red lamp)
    }
    expect(roofs, `${roofs} roof and wall faces, ${lights} lit window faces`).toBeGreaterThanOrEqual(20);
    expect(lights, `${roofs} roof and wall faces, ${lights} lit window faces`).toBeGreaterThanOrEqual(4); // two of them
  });

  // Task F's review: the dark felt patches could read as holes.
  it('the felt\'s repair patches are a shade off the felt, never near black, and fewer dark than light', () => {
    const felt = lum(meshes.find((m) => m.userData.block === 'warehouse').material.color);
    const shades = itemsOf('feltPatch').map(([m, r]) => {
      const col = m.geometry.attributes.color;
      return m.material.color.clone().multiply(new THREE.Color(col.getX(r.start), col.getY(r.start), col.getZ(r.start)));
    });
    expect(shades.length).toBeGreaterThan(40);
    const dark = shades.filter((s) => lum(s) < 0.85 * felt);
    for (const s of shades) expect(lum(s) / felt).toBeGreaterThan(0.55);
    expect(dark.length).toBeGreaterThan(0);
    expect(dark.length / shades.length).toBeLessThanOrEqual(0.5);
  });

  it('the tank shows its leap: a plank across its lid to the rim toward the lantern, and a bright hoop at the rim', () => {
    const TK = BLOCKS.find((q) => q.id === 'tank');
    const h = area.traversal.hops.find((q) => q.id === 'long-lantern');
    const dir = [(h.x1 - h.x0) / h.dist, (h.z1 - h.z0) / h.dist];
    // from just behind the take-off to within 0.1 m of the rim ahead, a plank lies on the lid
    const rimAhead = TK.r - Math.hypot(h.x0 - TK.x, h.z0 - TK.z);
    const noGlow = meshes.filter((m) => !m.userData.markGlow);
    // the lid beside the plank, for its colour
    const lid = firstHit([h.x0 - dir[1] * 0.5, TK.y + 2, h.z0 + dir[0] * 0.5], [0, -1, 0], noGlow);
    expect(lid.object.userData.block).toBe('tank');
    for (let s = -0.4; s <= rimAhead - 0.1; s += 0.05) {
      const hit = firstHit([h.x0 + dir[0] * s, TK.y + 2, h.z0 + dir[1] * s], [0, -1, 0], noGlow);
      expect([+s.toFixed(2), hit?.object.name]).toEqual([+s.toFixed(2), 'roofsNorth:paint']);
      expect(lum(colourAt(hit))).toBeGreaterThan(1.5 * lum(colourAt(lid))); // pale on the dark lid
      const up = hit.point.y - TK.y;
      expect(up).toBeGreaterThan(0.005);
      expect(up).toBeLessThanOrEqual(0.025); // under the take-off's glow (0.03 up), flush
    }
    // its iron hoops are dark; the one at the rim, on the lantern's side, is bright
    const at = (y) => firstHit([TK.x + dir[0] * (TK.r + 2), y, TK.z + dir[1] * (TK.r + 2)], [-dir[0], 0, -dir[1]]);
    const rim = at(TK.y - 0.035);
    const low = at(12.43);
    expect(rim.object.userData.block).toBeUndefined();
    expect(lum(colourAt(rim))).toBeGreaterThan(3 * lum(colourAt(low)));
    expect(lum(colourAt(rim))).toBeGreaterThan(0.2);
  });

  it('the alley has a flagstone channel down its middle, the ground unchanged', () => {
    const flags = named('roofsGround:flags');
    expect(flags).toHaveLength(1);
    for (let x = -40; x <= 40; x += 8) {
      const mid = firstHit([x, 1, ALLEY_CHANNEL.z + ALLEY_CHANNEL.half * 0.6], [0, -1, 0]); // beside its dark gully
      expect([x, mid?.object.name]).toEqual([x, 'roofsGround:flags']);
      expect(mid.point.y).toBeLessThan(0.03);
      for (const dz of [-ALLEY_CHANNEL.half - 0.5, ALLEY_CHANNEL.half + 0.5]) {
        expect([x, dz, firstHit([x, 1, ALLEY_CHANNEL.z + dz], [0, -1, 0])?.object.name]).toEqual([x, dz, 'roofsGround:cobble']);
      }
      expect(area.ground.y(x, ALLEY_CHANNEL.z)).toBe(0);
    }
  });

  it('the garage doors are muted paints, each its own shade, ribbed across, with a drainpipe on every second garage', () => {
    const G = BLOCKS.find((q) => q.id === 'garages');
    const doors = Math.floor((G.x1 - G.x0) / 3);
    const seen = [];
    // read each door where nothing stands in front of it (the clutter's half-widths)
    const reach = { bike: 0.9, pallet: 0.65, tin: 0.12 };
    const clearX = (cx) => [0.3, -0.9, 0.9, -1.0, 1.0].map((d) => cx + d).find((x) => Object.entries(ALLEY_CLUTTER).every(([k, q]) => Math.abs(x - q.x) > reach[k]));
    for (let i = 0; i < doors; i++) {
      const cx = G.x0 + 1.5 + 3 * i;
      const sx = clearX(cx);
      expect(sx, `door ${i}`).toBeDefined();
      const hit = firstHit([sx, 0.3, G.z1 + 2], [0, 0, -1]);
      expect([i, hit?.object.name]).toEqual([i, 'roofsAlley:paint']);
      const c = colourAt(hit);
      const hsl = srgbHSL(c);
      expect([i, hsl.s <= 0.45, hsl.l <= 0.65]).toEqual([i, true, true]);
      if (seen.length) expect(differs(c, seen[seen.length - 1])).toBe(true);
      seen.push(c);
      // the ribs: runs where the door stands proud of its face, up its height
      let ribs = 0;
      let inRib = false;
      for (let y = 0.2; y <= 2.0; y += 0.01) {
        const z = firstHit([sx, y, G.z1 + 2], [0, 0, -1]).point.z;
        const proud = z > G.z1 + 0.047;
        if (proud && !inRib) ribs++;
        inRib = proud;
      }
      expect([i, ribs]).toEqual([i, 3]);
    }
    // drainpipes down the garages' front: one per two garages
    rcB.set(new THREE.Vector3(G.x0 - 1, 1.0, G.z1 + 0.09), new THREE.Vector3(1, 0, 0));
    rcB.far = 60;
    const xs = rcB.intersectObjects(named('roofsAlley:ironSmall'), false).map((q) => q.point.x);
    const pipes = xs.filter((x, i) => i === 0 || x - xs[i - 1] > 0.5);
    expect(pipes.length).toBeGreaterThanOrEqual(doors / 2);
  });

  // Task D's review: the ground is centre-only (ground.slide), so her centre
  // reaches any wall's line and her body (CAT_RADIUS round it, 0.07 to 0.45 m
  // over the ground there) would pass through a bicycle leant anywhere she can
  // walk. Every point of the clutter's drawing more than 0.1 m up is sampled
  // against every point she can stand on near it (inside the bounds, clear of
  // the colliders: isWalkableAt), at the height of the ground there.
  it('the alley\'s clutter stands where her body never reaches it', () => {
    const items = meshes.filter((m) => m.userData.itemRanges).flatMap((m) => m.userData.itemRanges.filter((r) => r.kind === 'clutter').map((r) => [m, r]));
    expect([...new Set(items.map(([, r]) => r.id))].sort()).toEqual(['clutter:bike', 'clutter:pallet', 'clutter:tin']);
    const STEP = 0.05;
    const bad = [];
    let sampled = 0;
    const [a, b, c, p] = [0, 1, 2, 3].map(() => new THREE.Vector3());
    const seenOf = new Map();
    for (const [m, r] of items) {
      const pos = m.geometry.attributes.position;
      if (!seenOf.has(r.id)) seenOf.set(r.id, new Set());
      const seen = seenOf.get(r.id);
      for (let i = r.start; i < r.start + r.count; i += 3) {
        [a, b, c].forEach((v, j) => v.fromBufferAttribute(pos, i + j).applyMatrix4(m.matrixWorld));
        const k = Math.min(60, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / 0.03));
        for (let u = 0; u <= k; u++) {
          for (let w = 0; u + w <= k; w++) {
            p.copy(a).addScaledVector(b.clone().sub(a), u / k).addScaledVector(c.clone().sub(a), w / k);
            if (p.y < 0.1) continue;
            sampled++;
            // every point she can stand on within CAT_RADIUS of it
            for (let gx = Math.floor((p.x - CAT_RADIUS) / STEP) * STEP; gx <= p.x + CAT_RADIUS; gx += STEP) {
              for (let gz = Math.floor((p.z - CAT_RADIUS) / STEP) * STEP; gz <= p.z + CAT_RADIUS; gz += STEP) {
                if (Math.hypot(gx - p.x, gz - p.z) >= CAT_RADIUS || !isWalkableAt(area, gx, gz)) continue;
                const g = area.ground.y(gx, gz);
                const key = `${gx.toFixed(2)},${gz.toFixed(2)}`;
                if (p.y > g + 0.07 && p.y < g + 0.45 && !seen.has(key)) {
                  seen.add(key);
                  if (seen.size <= 2) bad.push([r.id, +gx.toFixed(2), +gz.toFixed(2), +g.toFixed(2), +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]);
                }
              }
            }
          }
        }
      }
    }
    expect(sampled).toBeGreaterThan(300);
    expect(bad).toEqual([]);
  });

  it('a bicycle, a pallet and a paint tin stand under the fire escape, clear of every spot she goes to', () => {
    const ST = BLOCKS.find((q) => q.id === 'alleyStair');
    const F = ST.flights[0];
    const REG = ROOFS_REGISTRATION;
    const spots = [
      ROOFS_SPAWN, ...ROOFS_POIS, ...ROOFS_COLLECTIBLES, ...ROOFS_SCENICS, ...Object.values(ROOFS_DISCOVERIES), ...ROOFS_PERCHES,
      ...Object.values(REG.propSet).filter(Array.isArray).flat().flatMap((q) => [q, q.fallTo].filter(Boolean)),
      ...REG.yarnSpots,
    ].filter((q) => Number.isFinite(q.x) && Number.isFinite(q.z));
    expect(spots.length).toBeGreaterThan(40);
    const segs = [];
    for (const tour of Object.values(ROOFS_TOURS)) {
      let at = tour.start;
      for (const s of tour.steps) if (s.walk) { const q = { x: s.walk[0], z: s.walk[1] }; segs.push([at, q]); at = q; }
    }
    const segDist = (q, [u, v]) => {
      const len2 = (v.x - u.x) ** 2 + (v.z - u.z) ** 2 || 1e-9;
      const t = Math.max(0, Math.min(1, ((q.x - u.x) * (v.x - u.x) + (q.z - u.z) * (v.z - u.z)) / len2));
      return Math.hypot(q.x - u.x - (v.x - u.x) * t, q.z - u.z - (v.z - u.z) * t);
    };
    expect(Object.keys(ALLEY_CLUTTER).sort()).toEqual(['bike', 'pallet', 'tin']);
    for (const [name, q] of Object.entries(ALLEY_CLUTTER)) {
      // under the fire escape's flight, where the ground she walks is the stair, high over it
      expect([name, q.x > F.x0 && q.x < F.x1 && q.z > Math.min(F.z0, F.z1) && q.z < Math.max(F.z0, F.z1)]).toEqual([name, true]);
      expect([name, area.ground.y(q.x, q.z) > 1.4]).toEqual([name, true]);
      // clear: of every spot by clearSpot's clearance, of the tours' paths, of every hop's ends, of every collider
      for (const s of spots) expect([name, s.x, s.z, Math.hypot(q.x - s.x, q.z - s.z) >= 1.6]).toEqual([name, s.x, s.z, true]);
      for (const sg of segs) expect([name, segDist(q, sg) >= CAT_RADIUS + 0.6]).toEqual([name, true]);
      for (const h of area.traversal.hops) {
        for (const [x, z] of [[h.x0, h.z0], [h.x1, h.z1]]) expect([name, h.id, Math.hypot(q.x - x, q.z - z) >= 0.9]).toEqual([name, h.id, true]);
      }
      for (const c of area.colliders) expect([name, Math.hypot(q.x - c.x, q.z - c.z) >= c.r + CAT_RADIUS]).toEqual([name, true]);
      // and it is drawn there, standing up off the ground, wholly under the flight
      const v = new THREE.Vector3();
      let n = 0;
      for (const m of meshes) {
        for (const r of m.userData.itemRanges ?? []) {
          if (r.id !== `clutter:${name}`) continue;
          for (let i = r.start; i < r.start + r.count; i++) {
            v.fromBufferAttribute(m.geometry.attributes.position, i).applyMatrix4(m.matrixWorld);
            n++;
            expect([name, Math.hypot(v.x - q.x, v.z - q.z) < 1.0, v.y > -0.01 && v.y < area.ground.y(v.x, v.z) - 0.3]).toEqual([name, true, true]);
          }
        }
      }
      expect([name, n > 20]).toEqual([name, true]);
    }
    // the colliders and perches are the plan's, as before
    expect(area.colliders).toEqual(ROOFS_COLLIDERS.map((c) => ({ ...c })));
    expect(area.perches).toEqual(ROOFS_PERCHES.map((c) => ({ ...c })));
  });

  it('weeds grow in tufts at the alley walls\' feet', () => {
    const G = BLOCKS.find((q) => q.id === 'garages');
    expect(ALLEY_WEEDS.length).toBeGreaterThanOrEqual(20);
    const kit = named('roofsAlley:stone'); // with the alley's copings: long already
    expect(kit).toHaveLength(1);
    const pos = kit[0].geometry.attributes.position;
    const col = kit[0].geometry.attributes.color;
    const v = new THREE.Vector3();
    for (const w of ALLEY_WEEDS) {
      // at a wall's foot: the garages' front or the alley's far wall
      expect([w.x, w.z, Math.abs(w.z - G.z1) < 0.3 || Math.abs(w.z - 46) < 0.3]).toEqual([w.x, w.z, true]);
      let green = 0;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (Math.hypot(v.x - w.x, v.z - w.z) > 0.25 || v.y < 0.05 || v.y > 0.5) continue;
        if (col.getY(i) > col.getX(i) && col.getY(i) > col.getZ(i)) green++;
      }
      expect([w.x, w.z, green >= 2]).toEqual([w.x, w.z, true]);
    }
  });

  it('the washing is shirts, trousers, socks, towels and sheets in softened colours, swinging from the line', () => {
    const items = meshes.filter((m) => m.userData.itemRanges).flatMap((m) => m.userData.itemRanges.filter((r) => r.id.startsWith('wash:')).map((r) => [m, r]));
    expect(items.length).toBeGreaterThanOrEqual(20);
    expect(new Set(items.map(([, r]) => r.kind))).toEqual(new Set(['shirt', 'trousers', 'socks', 'towel', 'sheet']));
    const lineTop = new Map(ROOFS_TRAVERSAL.crossings.filter((q) => q.kind === 'line').map((q) => [q.id, Math.max(...q.points.map((p) => p.y))]));
    const yardTop = 1.95;
    let swinging = 0;
    const [a, b, c] = [0, 1, 2].map(() => new THREE.Vector3());
    const n = new THREE.Vector3();
    for (const [m, r] of items) {
      const pos = m.geometry.attributes.position;
      const col = m.geometry.attributes.color;
      const tris = r.count / 3;
      if (r.kind === 'shirt' || r.kind === 'trousers') expect([r.id, tris >= 6]).toEqual([r.id, true]);
      if (r.kind === 'socks') expect([r.id, tris >= 4]).toEqual([r.id, true]);
      // it hangs from its line, never above it
      const top = r.line === 'yard' ? yardTop : lineTop.get(r.line);
      expect(top, r.id).toBeDefined();
      let maxY = -Infinity;
      let tilted = false;
      for (let i = r.start; i < r.start + r.count; i++) {
        maxY = Math.max(maxY, pos.getY(i));
        // softened: no colour stronger than a faded paint, nothing pure white
        const hsl = srgbHSL({ r: col.getX(i), g: col.getY(i), b: col.getZ(i) });
        if (i === r.start) expect([r.id, hsl.s <= 0.45, hsl.l <= 0.88]).toEqual([r.id, true, true]);
      }
      for (let i = r.start; i < r.start + r.count; i += 3) {
        [a, b, c].forEach((v, j) => v.fromBufferAttribute(pos, i + j));
        n.subVectors(b, a).cross(c.clone().sub(a)).normalize();
        if (Math.abs(n.y) > 0.05) tilted = true;
      }
      expect([r.id, maxY <= top + 0.02]).toEqual([r.id, true]);
      if (tilted) swinging++;
    }
    expect(swinging).toBeGreaterThanOrEqual(items.length / 2);
    expect(WASHING_POSTS.length).toBe(4);
  });

  // Rooftops step 3, Task 5: what the wind moves (roofsair.js).
  it('every thing on a line sways from it; the tyres do not', () => {
    const [wx, wz] = downwind();
    const cloth = meshes.filter((m) => m.geometry.attributes.aSway);
    expect(cloth.length).toBe(2); // the yards' washing (with the bicycle's tyres) and the lines'
    let things = 0;
    let tyres = 0;
    for (const m of cloth) {
      const pos = m.geometry.attributes.position;
      const sway = m.geometry.attributes.aSway;
      expect(sway.count).toBe(pos.count);
      for (const r of m.userData.itemRanges) {
        const len = (i) => Math.hypot(sway.getX(i), sway.getY(i));
        if (r.id === 'clutter:bike') {
          tyres++;
          for (let i = r.start; i < r.start + r.count; i++) expect([r.id, len(i)]).toEqual([r.id, 0]);
          continue;
        }
        expect(r.id.startsWith('wash:'), r.id).toBe(true);
        things++;
        let top = -Infinity;
        for (let i = r.start; i < r.start + r.count; i++) top = Math.max(top, pos.getY(i));
        let deepest = 0;
        for (let i = r.start; i < r.start + r.count; i++) {
          // its drop under the line, so 0 at its top and growing down it
          expect([r.id, Math.abs(len(i) - (top - pos.getY(i))) < 1e-4]).toEqual([r.id, true]);
          if (top - pos.getY(i) < 1e-4) expect([r.id, len(i) < 1e-4]).toEqual([r.id, true]);
          // on the downwind side
          expect([r.id, sway.getX(i) * wx + sway.getY(i) * wz >= -1e-9]).toEqual([r.id, true]);
          deepest = Math.max(deepest, len(i));
        }
        expect([r.id, deepest > 0.2]).toEqual([r.id, true]);
      }
    }
    expect(things).toBeGreaterThanOrEqual(20);
    expect(tyres).toBe(2); // the bicycle's two tyres
    // every cloth vertex in a mesh that sways has a phase, the same over one thing
    for (const m of cloth) {
      const sway = m.geometry.attributes.aSway;
      for (const r of m.userData.itemRanges) {
        if (r.id === 'clutter:bike') continue;
        const phase = sway.getZ(r.start);
        for (let i = r.start; i < r.start + r.count; i++) expect([r.id, sway.getZ(i)]).toEqual([r.id, phase]);
      }
    }
    expect(area.washSway).toBe(cloth[0].material.userData.wash);
  });

  it('the washing keeps its own material through the walk\'s prop merge', () => {
    const s = new THREE.Scene();
    const rec = build(s);
    mergeStaticProps(s);
    const washing = [];
    s.traverse((o) => { if (o.isMesh && o.material.userData.wash) washing.push(o); });
    expect(washing).toHaveLength(2);
    for (const m of washing) {
      expect(m.material.userData.wash).toBe(rec.washSway);
      expect(m.geometry.attributes.aSway).toBeDefined();
      expect(m.userData.noCast).toBe(true);
    }
    expect(Object.keys(rec.washSway).sort()).toEqual(['uWashAmp', 'uWashRest', 'uWashT']);
  });

  it('three pots smoke, the warm chimney\'s among them, each a drawn pot, and no bird perch within 0.6 m and above 0.3 m under a smoking pot\'s top', () => {
    expect(SMOKE_POTS).toHaveLength(3);
    expect(SMOKE_POTS).toContain(`pot:${ROOFS_DISCOVERIES.chimney.x}:-1`);
    // every pot the build draws has its top in potTops; the smoking three among them
    const pots = area.birdPerches.filter((p) => p.kind === 'pot');
    for (const p of pots) expect(area.potTops[p.id]).toEqual({ x: p.x, y: p.y, z: p.z });
    expect(Object.keys(area.potTops)).toHaveLength(pots.length + SMOKE_POTS.length);
    expect(area.smokePots).toHaveLength(3);
    area.smokePots.forEach((q, k) => {
      expect(q.id).toBe(SMOKE_POTS[k]);
      expect(area.potTops[q.id], q.id).toBeDefined();
      expect({ x: q.x, y: q.y, z: q.z }).toEqual(area.potTops[q.id]);
    });
    // on three different stacks
    expect(new Set(SMOKE_POTS.map((id) => id.split(':')[1])).size).toBe(3);
    // no bird perches on one under any name, nor in its smoke: within 0.6 m
    // (2D) of its top and no lower than 0.3 m under it (the smoke rises; the
    // stack tops beside and below a pot stay perches)
    const index = perchIndex(area.birdPerches);
    for (const q of area.smokePots) {
      expect(index.has(q.id), q.id).toBe(false);
      for (const p of area.birdPerches) {
        expect([q.id, p.id, Math.hypot(p.x - q.x, p.z - q.z) < 0.6 && p.y >= q.y - 0.3]).toEqual([q.id, p.id, false]);
      }
    }
    // the warm stack's aerial, 0.12 m from its smoking pot and over it, is no perch
    expect(index.has('aerial:-10')).toBe(false);
    for (const b of ROOFS_BIRDS) expect(SMOKE_POTS, b.id).not.toContain(b.home);
  });

  // Rooftops step 3, Task 6 (S1): two house cats asleep on warm back-window
  // sills. Scenery only: no name, no label, no prompt, out of her reach.
  const sleeperMeshes = () => meshes.filter((m) => m.name.startsWith('roofsSleeper:'));
  it('two house cats sleep on warm sills, out of her reach', { timeout: 60000 }, () => {
    expect(ROOFS_SLEEPERS).toHaveLength(2);
    expect(Object.isFrozen(ROOFS_SLEEPERS)).toBe(true);
    const coats = ROOFS_SLEEPERS.map((s) => [s.coat.fur, s.coat.pale]).sort((p, q) => p[0] - q[0]);
    expect(coats).toEqual([[0x8a8c90, 0xe8e6e0], [0xc8783a, 0xeadbc0]]);
    const solid = meshes.filter((m) => !m.userData.skyGlow && !m.userData.townBand && !m.name.startsWith('roofsSleeper:'));
    const ray = new THREE.Raycaster();
    const f = floodTraversal(area, { abilities: { longLeap: true, steady: true, climb: 2.2 } });
    const got = f.reachable(f.regionAt(ROOFS_SPAWN.x, ROOFS_SPAWN.z));
    // every spot a game system reads: the rails, the hops' ends, the POIs,
    // collectibles, scenics, perches, discoveries, the birds' spawns and perches, the props
    const P = ROOFS_REGISTRATION.propSet;
    const spots = [
      ...area.pois, ...area.collectibles, ...area.scenics, ...area.perches, ...Object.values(ROOFS_DISCOVERIES),
      ...area.critterSpawns, ...area.birdPerches,
      ...P.carryables, ...P.knockables, ...P.markables, ...P.flaps, ...P.rests, ...P.hides,
      ...area.traversal.hops.flatMap((h) => [{ x: h.x0, z: h.z0 }, { x: h.x1, z: h.z1 }]),
    ];
    const segDist = (s, a, c) => {
      const len2 = (c.x - a.x) ** 2 + (c.z - a.z) ** 2 || 1e-12;
      const t = Math.max(0, Math.min(1, ((s.x - a.x) * (c.x - a.x) + (s.z - a.z) * (c.z - a.z)) / len2));
      return Math.hypot(s.x - (a.x + (c.x - a.x) * t), s.z - (a.z + (c.z - a.z) * t));
    };
    for (const s of ROOFS_SLEEPERS) {
      // on a drawn sill: the ray down from over it (the sleeper aside) lands on stone at its y
      ray.set(new THREE.Vector3(s.x, s.y + 0.3, s.z), new THREE.Vector3(0, -1, 0));
      ray.far = 0.6;
      const hit = ray.intersectObjects(solid, false)[0];
      expect([s.id, hit?.object.name]).toEqual([s.id, 'roofsTerrace:stone']);
      expect(Math.abs(hit.point.y - s.y), s.id).toBeLessThan(0.02);
      // on the terrace's back wall, under a warm lit window
      expect([s.id, s.z > 12 && s.z < 12.4]).toEqual([s.id, true]);
      const pane = firstHit([s.x, s.y + 0.7, s.z + 1.5], [0, 0, -1], solid);
      expect([s.id, pane?.object.name]).toEqual([s.id, 'roofsWindows']);
      const cell = Math.floor(pane.uv.x * 4) + 4 * Math.floor(pane.uv.y * 4);
      expect([s.id, WINDOW_CELLS[cell].light, WINDOW_CELLS[cell].kind === 'cat']).toEqual([s.id, 'warm', false]);
      // out of her reach: no ground she can walk to (every ability) within
      // 0.6 m beside it, and none less than 1.0 m below it there
      const near = [];
      for (let dx = -0.6; dx <= 0.6 + 1e-9; dx += 0.05) {
        for (let dz = -0.6; dz <= 0.6 + 1e-9; dz += 0.05) {
          if (Math.hypot(dx, dz) > 0.6) continue;
          const [x, z] = [s.x + dx, s.z + dz];
          const y = area.ground.y(x, z);
          if (got.has(f.regionAt(x, z)) && y > s.y - 1.0) near.push([+x.toFixed(2), +z.toFixed(2), y]);
        }
      }
      expect([s.id, near.slice(0, 3)]).toEqual([s.id, []]);
      // 0.5 m clear of every rail and of every spot a game system reads
      for (const c of ROOFS_TRAVERSAL.crossings) {
        for (let i = 0; i + 1 < c.points.length; i++) expect([s.id, c.id, segDist(s, c.points[i], c.points[i + 1]) >= 0.5]).toEqual([s.id, c.id, true]);
      }
      for (const q of spots) expect([s.id, q.id ?? q.kind ?? `${q.x},${q.z}`, Math.hypot(q.x - s.x, q.z - s.z) >= 0.5]).toEqual([s.id, q.id ?? q.kind ?? `${q.x},${q.z}`, true]);
    }
  });

  it('the sleepers are their own meshes, never merged, casting nothing', () => {
    const own = sleeperMeshes();
    expect(own.map((m) => m.name).sort()).toEqual(ROOFS_SLEEPERS.map((s) => `roofsSleeper:${s.id}`).sort());
    expect(area.sleepers).toHaveLength(2);
    ROOFS_SLEEPERS.forEach((s, i) => expect(area.sleepers[i]).toBe(own.find((m) => m.name === `roofsSleeper:${s.id}`)));
    const lin = (hex) => new THREE.Color(hex);
    for (const [i, s] of ROOFS_SLEEPERS.entries()) {
      const m = area.sleepers[i];
      expect([m.castShadow, m.userData.noCast, m.userData.noMerge, m.material.vertexColors]).toEqual([false, true, true, true]);
      // (a mirrored cat is mirrored in its geometry, never by a negative scale)
      expect([m.position.x, m.position.y, m.position.z, m.rotation.y, m.scale.x, m.scale.z]).toEqual([s.x, s.y, s.z, s.yaw, 1, 1]);
      const g = m.geometry;
      const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
      expect(tris, s.id).toBeLessThanOrEqual(320);
      // a curled loaf about 0.5 m long, lower than it is deep, sitting on its sill (its origin)
      g.computeBoundingBox();
      const size = g.boundingBox.getSize(new THREE.Vector3());
      expect(size.x, s.id).toBeGreaterThan(0.4);
      expect(size.x, s.id).toBeLessThan(0.6);
      expect(size.z, s.id).toBeGreaterThan(0.25);
      expect(size.z, s.id).toBeLessThan(size.x);
      expect(size.y, s.id).toBeGreaterThan(0.18);
      expect(size.y, s.id).toBeLessThan(size.z);
      expect(Math.abs(g.boundingBox.min.y), s.id).toBeLessThan(0.02);
      // in its coat's two colours, and only those
      const col = g.attributes.color;
      const seen = new Set();
      for (let k = 0; k < col.count; k++) {
        const c = [lin(s.coat.fur), lin(s.coat.pale)].findIndex((q) => Math.abs(q.r - col.getX(k)) + Math.abs(q.g - col.getY(k)) + Math.abs(q.b - col.getZ(k)) < 1e-4);
        expect(c, `${s.id} vertex ${k}`).toBeGreaterThanOrEqual(0);
        seen.add(c);
      }
      expect(seen.size, s.id).toBe(2);
    }
    // nobody's: no label, no prompt, no spawn, no list a game system reads
    for (const k of ['pois', 'collectibles', 'scenics', 'perches', 'critterSpawns', 'tippables', 'moments', 'boxes']) {
      for (const q of area[k]) for (const s of ROOFS_SLEEPERS) expect(Object.values(q), k).not.toContain(s.id);
    }
    // through the walk's prop merge: still the record's own two meshes, in the scene, not cast
    const s2 = new THREE.Scene();
    const rec = build(s2);
    mergeStaticProps(s2);
    const kept = [];
    s2.traverse((o) => { if (o.isMesh && o.name.startsWith('roofsSleeper:')) kept.push(o); });
    expect(kept).toHaveLength(2);
    for (const m of rec.sleepers) expect(kept).toContain(m);
    for (const m of kept) expect(m.castShadow).toBe(false);
  });

  // The owner's tweak (2026-11-21): the two cats lie different ways, and
  // neither is hidden behind the washing.
  // A sleeper's head (the middle of its head, under its ear tips, its
  // highest points) and its body's middle, in the world.
  const sleeperParts = (m) => {
    const p = m.geometry.attributes.position;
    let top = -Infinity;
    for (let k = 0; k < p.count; k++) top = Math.max(top, p.getY(k));
    const ears = new THREE.Vector3();
    let n = 0;
    for (let k = 0; k < p.count; k++) if (p.getY(k) > top - 1e-6) { ears.add(new THREE.Vector3().fromBufferAttribute(p, k)); n++; }
    ears.multiplyScalar(1 / n);
    m.updateMatrixWorld(true);
    const head = ears.clone().setY(ears.y - 0.1).applyMatrix4(m.matrixWorld);
    m.geometry.computeBoundingBox();
    const body = m.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(m.matrixWorld);
    return { head, body, earsLocal: ears };
  };
  it('the two cats lie different ways, one head to the west and one to the east, both facing out to the yards', () => {
    const [a, b] = area.sleepers;
    const sides = area.sleepers.map((m) => Math.sign(sleeperParts(m).head.x - m.position.x));
    expect(sides.sort()).toEqual([-1, 1]);
    expect(ROOFS_SLEEPERS.map((s) => !!s.mirror).sort()).toEqual([false, true]);
    for (const [i, m] of area.sleepers.entries()) {
      const id = ROOFS_SLEEPERS[i].id;
      // a mirrored cat's head is toward -x
      expect([id, Math.sign(sleeperParts(m).head.x - m.position.x)]).toEqual([id, ROOFS_SLEEPERS[i].mirror ? -1 : 1]);
      // its pale front (chest, muzzle, paws) out toward the yards (+z), in the world
      const g = m.geometry;
      const col = g.attributes.color;
      const pale = new THREE.Color(ROOFS_SLEEPERS[i].coat.pale);
      const front = new THREE.Vector3();
      let n = 0;
      for (let k = 0; k < col.count; k++) {
        if (Math.abs(col.getX(k) - pale.r) + Math.abs(col.getY(k) - pale.g) + Math.abs(col.getZ(k) - pale.b) < 1e-4) {
          front.add(new THREE.Vector3().fromBufferAttribute(g.attributes.position, k).applyMatrix4(m.matrixWorld));
          n++;
        }
      }
      expect([id, front.multiplyScalar(1 / n).z - m.position.z > 0.03]).toEqual([id, true]);
      // every triangle wound the way its normals face (a single-sided
      // material shows its outside): mirroring kept them so
      const p = g.attributes.position;
      const nr = g.attributes.normal;
      const [u, v, w, e1, e2, nn, nk] = [0, 0, 0, 0, 0, 0, 0].map(() => new THREE.Vector3());
      let agree = 0;
      for (let t = 0; t < p.count; t += 3) {
        u.fromBufferAttribute(p, t);
        v.fromBufferAttribute(p, t + 1);
        w.fromBufferAttribute(p, t + 2);
        nn.set(0, 0, 0);
        for (let j = 0; j < 3; j++) nn.add(nk.fromBufferAttribute(nr, t + j));
        if (e1.subVectors(v, u).cross(e2.subVectors(w, u)).dot(nn) > 0) agree++;
      }
      expect([id, agree / (p.count / 3) > 0.97]).toEqual([id, true]);
    }
    // the same cat, mirrored: each vertex of one is a vertex of the other with x turned over
    const key = (x, y, z) => [x, y, z].map((n) => (Math.abs(n) < 5e-5 ? 0 : n).toFixed(4)).join(',');
    const pa = a.geometry.attributes.position;
    const pb = b.geometry.attributes.position;
    expect(pa.count).toBe(pb.count);
    const there = new Set();
    for (let k = 0; k < pb.count; k++) there.add(key(pb.getX(k), pb.getY(k), pb.getZ(k)));
    let missing = 0;
    for (let k = 0; k < pa.count; k++) if (!there.has(key(-pa.getX(k), pa.getY(k), pa.getZ(k)))) missing++;
    expect(missing).toBe(0);
  });

  // From where a child sees a sleeper: the walk's follow camera (catcam.js
  // cameraOffset at the walk's first pitch and default zoom step, behind her
  // and above) while she stands on ground she can walk to (every ability),
  // in front of its wall (on the yards' side), 4 to 15 m from it and facing
  // it. The lines from the camera to its head and to its body's middle miss
  // all the washing (the two cloth meshes) from at least 90% of those spots.
  it('neither sleeper is hidden behind the washing from where she sees it', { timeout: 60000 }, () => {
    const cloth = meshes.filter((m) => m.geometry.attributes.aSway);
    expect(cloth).toHaveLength(2);
    const f = floodTraversal(area, { abilities: { longLeap: true, steady: true, climb: 2.2 } });
    const got = f.reachable(f.regionAt(ROOFS_SPAWN.x, ROOFS_SPAWN.z));
    const { dist, height } = ZOOM_STEPS[DEFAULT_ZOOM_STEP];
    const ray = new THREE.Raycaster();
    const off = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const shares = [];
    for (const [i, s] of ROOFS_SLEEPERS.entries()) {
      const { head, body } = sleeperParts(area.sleepers[i]);
      let spots = 0;
      let clear = 0;
      for (let x = s.x - 15; x <= s.x + 15 + 1e-9; x += 0.5) {
        for (let z = s.z + 0.5; z <= s.z + 15 + 1e-9; z += 0.5) {
          const d = Math.hypot(x - s.x, z - s.z);
          if (d < 4 || d > 15 || !got.has(f.regionAt(x, z))) continue;
          spots++;
          // facing it: the camera behind her, on the far side from it
          cameraOffset(Math.atan2(x - s.x, z - s.z), DEFAULT_PITCH, dist, height, off);
          const cam = off.add(new THREE.Vector3(x, area.ground.y(x, z), z));
          const seen = [head, body].every((t) => {
            dir.subVectors(t, cam);
            ray.set(cam, dir.clone().normalize());
            ray.far = dir.length();
            return ray.intersectObjects(cloth, false).length === 0;
          });
          if (seen) clear++;
        }
      }
      expect([s.id, spots > 500]).toEqual([s.id, true]);
      shares.push([s.id, +(clear / spots).toFixed(3)]);
    }
    expect(shares.filter(([, k]) => k < 0.9)).toEqual([]); // each cat's share, if under
  });

  it('every POI is in the walk region of the spawn', () => {
    const f = baseFlood();
    const spawnR = f.regionAt(ROOFS_SPAWN.x, ROOFS_SPAWN.z);
    expect(area.pois).toHaveLength(13);
    expect(area.pois).toEqual(ROOFS_POIS.map((q) => ({ ...q })));
    for (const q of area.pois) {
      expect([q.x, q.z, f.regionAt(q.x, q.z)]).toEqual([q.x, q.z, spawnR]);
      // the walk's clearSpot leaves each where it is (clear of every collider and the edge)
      const c = clearSpot(q, area.colliders, area.bounds, area.waters);
      expect([c.x, c.z]).toEqual([q.x, q.z]);
    }
  });

  it('every collectible, scenic and discovery anchor is reached without Long Leap', () => {
    const f = baseFlood();
    const got = f.reachable(f.regionAt(ROOFS_SPAWN.x, ROOFS_SPAWN.z));
    const reached = (x, z, y = area.ground.y(x, z)) => got.has(f.regionAt(x, z, y));
    expect(area.collectibles).toEqual(ROOFS_COLLECTIBLES.map((c) => ({ ...c })));
    expect(area.collectibles).toHaveLength(5);
    const plain = /^[a-z][a-z ’'-]+$/;
    for (const c of area.collectibles) {
      expect(c.label, c.id).toMatch(plain);
      expect(c.y, c.id).toBeUndefined(); // the walk adds the ground under it
      expect([c.id, reached(c.x, c.z)]).toEqual([c.id, true]);
    }
    const inAlley = area.collectibles.filter((c) => area.ground.y(c.x, c.z) === LEVELS.GROUND && c.z > 34);
    const onRoofs = area.collectibles.filter((c) => area.ground.y(c.x, c.z) >= LEVELS.GARAGE);
    expect([inAlley.length, onRoofs.length]).toEqual([1, 4]);
    expect(area.scenics).toEqual(ROOFS_SCENICS.map((c) => ({ ...c })));
    expect(area.scenics.map((s) => s.label)).toEqual(['the clock tower', 'the warehouse roof', 'the terrace roofs']);
    for (const s of area.scenics) expect([s.id, reached(s.x, s.z)]).toEqual([s.id, true]);
    const d = area.anchors.discoveries;
    expect(d).toEqual(ROOFS_DISCOVERIES);
    expect(Object.keys(d)).toEqual(['garden', 'loft', 'vane', 'skylight', 'telescope', 'chimney']);
    for (const [id, q] of Object.entries(d)) {
      expect([id, Math.abs(area.ground.y(q.x, q.z) - q.y) <= 1e-6]).toEqual([id, true]);
      expect([id, reached(q.x, q.z, q.y)]).toEqual([id, true]);
    }
  });

  it('the perches are the alley crates, the garden bench and the telescope crate, each on one level', () => {
    expect(area.perches).toEqual(ROOFS_PERCHES.map((q) => ({ ...q })));
    expect(area.perches.map((q) => q.kind)).toEqual(['crate', 'crate', 'crate', 'crate', 'furniture', 'crate']);
    for (const q of area.perches) {
      const ys = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => area.ground.y(q.x + 0.4 * Math.cos(k * Math.PI / 4), q.z + 0.4 * Math.sin(k * Math.PI / 4)));
      expect([q.x, q.z, Math.max(...ys) - Math.min(...ys)]).toEqual([q.x, q.z, 0]);
      expect(q.y).toBeGreaterThan(0.3);
      expect(q.y).toBeLessThan(1.6);
    }
  });

  it('the record has every key an area has', () => {
    const keys = [
      'name', 'colliders', 'bounds', 'spawn', 'boxes', 'waters', 'waterFx', 'pois', 'collectibles', 'scenics',
      'critterSpawns', 'moments', 'puddles', 'groundBounce', 'skyDusk', 'tippables', 'perches',
      'ground', 'traversal', 'anchors', 'evening', 'strays', 'skySunset', 'duskLight', 'life',
    ];
    for (const k of keys) expect(area, k).toHaveProperty(k);
    expect(area.name).toBe('The Rooftops');
    expect(area.evening).toBe(true);
    expect(area.strays).toBe(false);
    expect(area.waters).toEqual([]);
    expect(area.waterFx).toEqual([]);
    expect(area.critterSpawns).toEqual(roofsCritterSpawns(ROOFS_BIRDS, perchIndex(area.birdPerches)));
    expect(area.moments).toEqual([]);
    for (const k of ['boxes', 'pois', 'collectibles', 'scenics', 'puddles', 'tippables', 'perches', 'colliders']) {
      expect(Array.isArray(area[k]), k).toBe(true);
    }
    expect(area.spawn).toEqual({ x: 4, z: 41 });
    // retuned in the beauty pass (Task A): a warmer sunset, a dusk top never near black;
    // round two, Task E (critique finding 8): the dusk horizon a touch darker and less
    // red (0x8a5a6a: a salmon strip), the sunset's a deeper orange (0xf0a46c: near white,
    // the roofline lost against it)
    expect(area.skyDusk).toEqual({ top: 0x24305c, horizon: 0x765266 });
    expect(area.skySunset).toEqual({ top: 0x55609a, horizon: 0xe8925a });
    expect(area.duskLight).toEqual({ fogNear: 40, fogFar: 140 });
    expect(typeof area.life).toBe('function');
    expect(area.bounds).toEqual({ minX: -46, maxX: 46, minZ: -50, maxZ: 46 });
    expect(typeof area.ground.y).toBe('function');
    expect(area.ground.y(4, 41)).toBe(0);
    expect(area.traversal.crossings).toHaveLength(ROOFS_TRAVERSAL.crossings.length);
    // the plan's colliders, and only those (the plan's tests hold them to R6)
    expect(area.colliders).toEqual(ROOFS_COLLIDERS.map((c) => ({ ...c })));
    for (const c of area.colliders) {
      const ys = [[0, 0], [c.r, 0], [-c.r, 0], [0, c.r], [0, -c.r]].map(([dx, dz]) => area.ground.y(c.x + dx, c.z + dz));
      expect(Math.max(...ys) - Math.min(...ys), `${c.x},${c.z}`).toBeLessThan(0.05);
    }
  });

  it('the built counts are pinned, within the aim (300 / 120 / 60,000)', () => {
    const built = budgetStats(scene);
    const mergedScene = new THREE.Scene();
    build(mergedScene);
    mergeStaticProps(mergedScene);
    const merged = budgetStats(mergedScene);
    expect(built).toEqual(MEASURED_BUILT);
    expect(merged).toEqual(MEASURED_MERGED);
    expect(built.meshes).toBeLessThanOrEqual(300);
    expect(built.casters).toBeLessThanOrEqual(120);
    expect(built.triangles).toBeLessThanOrEqual(60000);
    // the tower's body keeps its own mesh through the merge, so it can still fade
    const body = findFadeOccluders(mergedScene).filter((f) => !(f.obj.userData.lampGlobeY > 0));
    expect(body).toHaveLength(1);
    let n = 0;
    body[0].obj.traverse((o) => { if (o.isMesh) n++; });
    expect(n).toBeGreaterThan(0);
  });

  it(`the build draws ${MEASURED_DRAWS} times on Math.random`, () => {
    const stats = budgetStats(scene);
    const s2 = new THREE.Scene(); // its own uuid, before the count starts
    const real = Math.random;
    const [realNow, realPerf] = [Date.now, performance.now];
    let draws = 0;
    let clocks = 0;
    Math.random = () => { draws++; return real(); };
    Date.now = () => { clocks++; return realNow(); };
    performance.now = () => { clocks++; return realPerf.call(performance); };
    let again;
    try {
      build(s2);
      again = budgetStats(s2);
    } finally {
      Math.random = real;
      Date.now = realNow;
      performance.now = realPerf;
    }
    expect(draws).toBe(MEASURED_DRAWS);
    expect(clocks).toBe(0); // the bus and the evening are functions of walk time, never the clock
    expect(again).toEqual(stats);
  });
});

// =============================================================================
// Task 10: every per-area list. ROOFS_REGISTRATION holds each row in its
// table's own shape (test/fair.test.js is the model). The one row held back
// until Rooftops step 4 (R1) was CATALOG.areas.roofs; step 4 copied it in.
// =============================================================================
describe('The Rooftops: in every per-area list (ROOFS_REGISTRATION)', async () => {
  const { ROOFS_REGISTRATION: REG } = await import('../src/world/roofsplan.js');
  const { propsFor, yarnSpotsFor, frameColliders, allPropIds, isPropId, CARRY_KINDS, KNOCK_KINDS, REST_KINDS } = await import('../src/propsets.js');
  const { MARK_AREAS, emptyMarks } = await import('../src/marks.js');
  const { REST_LOOKS } = await import('../src/rests.js');
  const { CLOUD_AREAS, AREA_SKY } = await import('../src/render/clouds.js');
  const { ambientKind } = await import('../src/render/ambient.js');
  const { AREA_RULES } = await import('../src/render/pawprints.js');
  const { GRASS_STYLES } = await import('../src/render/grass.js');
  const { COLONY_AREAS, feedsHere } = await import('../src/colony.js');
  const { LEGENDARY_BY_AREA } = await import('../src/legendary.js');
  const { CATALOG, createProgression } = await import('../src/progression.js');
  const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
  const set = REG.propSet;
  const plain = (v) => JSON.parse(JSON.stringify(v));
  const dist = (a, c) => Math.hypot(a.x - c.x, a.z - c.z);
  const MARGIN = 0.3;
  const got = () => baseFlood().reachable(baseFlood().regionAt(ROOFS_SPAWN.x, ROOFS_SPAWN.z));
  // the ground at a point and a small ring round it is one level
  const oneLevel = (x, z, ring = 0.4) => {
    const ys = [[0, 0], ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => [ring * Math.cos(k * Math.PI / 4), ring * Math.sin(k * Math.PI / 4)])]
      .map(([dx, dz]) => area.ground.y(x + dx, z + dz));
    return Math.max(...ys) - Math.min(...ys) < 1e-6;
  };
  const reachedAt = (x, z) => got().has(baseFlood().regionAt(x, z, area.ground.y(x, z)));
  const clear = (p, extra = MARGIN) => area.colliders.every((c) => dist(p, c) >= c.r + CAT_RADIUS + extra);
  // a spot beside a collider-held markable the cat can stand on
  const standSide = (m) => {
    for (let k = 0; k < 16; k++) {
      const p = { x: m.x + Math.cos((k * Math.PI) / 8) * 1.0, z: m.z + Math.sin((k * Math.PI) / 8) * 1.0 };
      if (isWalkableAt(area, p.x, p.z) && clear(p) && oneLevel(p.x, p.z) && reachedAt(p.x, p.z)) return p;
    }
    return null;
  };

  it('each registration row is in its table', async () => {
    expect(REG.id).toBe('roofs');
    expect(propsFor('roofs')).toEqual(plain(set));
    expect(yarnSpotsFor('roofs')).toEqual(plain(REG.yarnSpots));
    expect(Object.fromEntries(Object.entries(REST_LOOKS).filter(([k]) => k.startsWith('roofs-')))).toEqual(plain(REG.restLooks));
    expect(CLOUD_AREAS).toContain('roofs');
    expect(AREA_SKY.roofs).toEqual(plain(REG.clouds));
    expect(AREA_SKY.roofs).toEqual({ clouds: 6, banks: 4 });
    expect(ambientKind('roofs')).toBe(REG.ambient);
    expect(ambientKind('roofs', { dusk: true })).toBe('moths');
    expect(AREA_RULES.roofs).toEqual(plain(REG.pawprints));
    expect(AREA_RULES.roofs).toEqual({ ground: null, path: 'gravel', strip: null });
    expect(MARK_AREAS).toContain('roofs');
    expect(emptyMarks().roofs).toEqual([]);
    // no grass, no ground tint
    expect(Object.hasOwn(GRASS_STYLES, 'roofs')).toBe(false);
    expect((await import('../src/world/roofs.js')).GRASS_HOOKS).toBeUndefined();
  });

  it('has its row in the catalog, right after the Fairground (step 4); its view is the card shot', async () => {
    const { ROOFS_SHOTS } = await import('../src/world/roofsplan.js');
    expect(REG.catalog).toEqual({ name: 'The Rooftops', price: 100, requires: { area: 'fair', walks: 2 } });
    expect(REG.view).toBe(ROOFS_SHOTS.card);
    expect(CATALOG.areas.roofs).toEqual(REG.catalog);
    const ids = Object.keys(CATALOG.areas);
    expect(ids[ids.indexOf('fair') + 1]).toBe('roofs');
    expect(ids[ids.indexOf('roofs') + 1]).toBe('market'); // the Market after it (Market step 4)
    expect(REG.marks).toBe(true);
  });

  it('has the street areas’ prop counts, and no dog', () => {
    expect(Object.keys(set).sort()).toEqual(['carryables', 'dogYard', 'flaps', 'hides', 'keepSlots', 'knockables', 'markables', 'rests']);
    expect(set.carryables).toHaveLength(4);
    expect(set.knockables).toHaveLength(3);
    expect(set.markables).toHaveLength(3);
    expect(set.flaps.map((f) => f.kind)).toEqual(['flap']);
    // one of each drawn, and the warm chimney's nap with no mesh (Rooftops step 5, R6)
    const drawnRests = set.rests.filter((r) => r.mesh !== false);
    expect(drawnRests.map((r) => r.kind).sort()).toEqual([...REST_KINDS].sort());
    expect(drawnRests.every((r) => r.mesh === true)).toBe(true);
    expect(set.rests.filter((r) => r.mesh === false).map((r) => r.id)).toEqual(['roofs-nap-2']);
    expect(set.hides).toHaveLength(3);
    expect(set.dogYard).toBeNull();
    expect(set.keepSlots).toEqual([]);
    expect(set.markables.every((m) => m.nearBorder === false)).toBe(true);
    for (const c of set.carryables) expect(CARRY_KINDS).toContain(c.kind);
    for (const k of set.knockables) expect(KNOCK_KINDS).toContain(k.kind);
    for (const m of set.markables) expect(['post', 'tree', 'bollard']).toContain(m.kind);
    const looks = new Set(Object.values(REST_LOOKS).map((v) => v.look));
    expect(Object.keys(REG.restLooks).sort()).toEqual(drawnRests.map((r) => r.id).sort());
    for (const v of Object.values(REG.restLooks)) expect(looks.has(v.look), v.look).toBe(true);
    // ids: well-formed, namespaced by area and kind, none shared with another area
    const mine = [];
    for (const list of ['carryables', 'knockables', 'markables', 'flaps', 'rests']) {
      for (const p of set[list]) {
        expect(isPropId(p.id), p.id).toBe(true);
        expect(p.id.startsWith(`roofs-${p.kind}-`), p.id).toBe(true);
        mine.push(p.id);
      }
    }
    expect(new Set(mine).size).toBe(mine.length);
    expect(mine).toHaveLength(15);
    const taken = allPropIds();
    expect(new Set([...taken].filter((id) => id.startsWith('roofs-')))).toEqual(new Set(mine));
  });

  it('the warm chimney is a cosy place to nap: its rest row, on the stack at the anchor, no mesh (Rooftops step 5)', async () => {
    const { ROOFS_DISCOVERIES } = await import('../src/world/roofsplan.js');
    const c = ROOFS_DISCOVERIES.chimney;
    const row = { id: 'roofs-nap-2', kind: 'nap', x: c.x, z: c.z, mesh: false };
    expect(plain(set.rests.find((r) => r.id === 'roofs-nap-2'))).toEqual(row);
    expect(propsFor('roofs').rests).toContainEqual(row);
    // on the stack: her paws there are at the anchor's height
    expect(area.ground.y(c.x, c.z)).toBeCloseTo(c.y, 6);
  });

  it('each prop sits on its own level, clear of colliders, reached without Long Leap', () => {
    const walkUps = [
      ...set.carryables.map((p) => ({ what: p.id, p })),
      ...set.rests.map((p) => ({ what: p.id, p })),
      ...set.markables.map((m) => ({ what: m.id, m, p: standSide(m) })),
    ];
    for (const { what, p, m } of walkUps) {
      expect(p, `${what} has no side to stand on`).not.toBeNull();
      expect(isWalkableAt(area, p.x, p.z), `${what} walkable`).toBe(true);
      expect(clear(p), `${what} clear of colliders`).toBe(true);
      expect(oneLevel(m ? m.x : p.x, m ? m.z : p.z), `${what} on one level`).toBe(true);
      expect(oneLevel(p.x, p.z), `${what} stand spot on one level`).toBe(true);
      expect(reachedAt(p.x, p.z), `${what} reached without Long Leap`).toBe(true);
    }
    for (const h of set.hides) {
      expect(isWalkableAt(area, h.x, h.z), `hide ${h.x},${h.z}`).toBe(true);
      expect(clear(h), `hide ${h.x},${h.z} clear`).toBe(true);
      expect(oneLevel(h.x, h.z), `hide ${h.x},${h.z} one level`).toBe(true);
      expect(reachedAt(h.x, h.z), `hide ${h.x},${h.z} reached`).toBe(true);
    }
    // a prompt's width apart
    for (let i = 0; i < walkUps.length; i++) {
      for (let j = i + 1; j < walkUps.length; j++) {
        expect(dist(walkUps[i].p, walkUps[j].p), `${walkUps[i].what} vs ${walkUps[j].what}`).toBeGreaterThanOrEqual(2.5);
      }
    }
    // clear of the spawn, the finds, the view spots and the POIs
    const anchors = [area.spawn, ...area.collectibles, ...area.scenics, ...area.pois];
    const points = [...set.carryables, ...set.knockables, ...set.markables, ...set.rests, ...set.hides, ...set.flaps, ...set.flaps.flatMap((f) => frameColliders(f))];
    for (const p of points) for (const q of anchors) expect(dist(p, q), `${p.id ?? 'prop'} ${p.x},${p.z} vs ${q.x},${q.z}`).toBeGreaterThanOrEqual(2);
    // the knockables stand on a crate perch and land on the alley, apart
    for (const k of set.knockables) {
      const perch = area.perches.find((q) => dist(q, k) <= 0.6 && Math.abs(q.y - k.y) < 0.1);
      expect(perch, `${k.id} has no perch under it`).toBeDefined();
      expect(isWalkableAt(area, k.fallTo.x, k.fallTo.z), `${k.id} lands`).toBe(true);
      expect(area.ground.y(k.fallTo.x, k.fallTo.z), `${k.id} lands on the alley`).toBe(0);
      expect(area.ground.y(k.x, k.z), `${k.id} stands over the alley`).toBe(0);
      expect(oneLevel(k.x, k.z, 0.3), k.id).toBe(true);
      expect(reachedAt(k.fallTo.x, k.fallTo.z), `${k.id} landing reached`).toBe(true);
      expect(dist(k, k.fallTo)).toBeGreaterThanOrEqual(0.6);
      expect(dist(k, k.fallTo)).toBeLessThanOrEqual(1.6);
    }
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(dist(set.knockables[i].fallTo, set.knockables[j].fallTo)).toBeGreaterThanOrEqual(0.5);
    // the flap: an opening she can walk through, a frame she cannot, all on the alley
    for (const f of set.flaps) {
      const frame = frameColliders(f);
      const withFrame = { ...area, colliders: [...area.colliders, ...frame] };
      const nx = Math.sin(f.rotY);
      const nz = Math.cos(f.rotY);
      for (const side of [-1, 0, 1]) {
        expect(isWalkableAt(withFrame, f.x + nx * side, f.z + nz * side), `${f.id} side ${side}`).toBe(true);
        expect(reachedAt(f.x + nx * side, f.z + nz * side), `${f.id} side ${side} reached`).toBe(true);
      }
      for (const c of frame) {
        expect(oneLevel(c.x, c.z, c.r), `${f.id} frame at ${c.x},${c.z} on one level`).toBe(true);
        for (const o of area.colliders) expect(dist(c, o)).toBeGreaterThanOrEqual(c.r + o.r);
      }
      for (const p of [...set.carryables, ...set.rests, ...set.markables, ...set.hides, ...set.knockables.map((k) => k.fallTo)]) {
        expect(dist(f, p) - 0.3, `${f.id} vs ${p.id ?? 'prop'}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('has something real to scratch at every markable', () => {
    const solid = [];
    scene.traverse((o) => { if (o.isMesh && o.geometry?.type !== 'PlaneGeometry') solid.push(o); });
    const rc = new THREE.Raycaster();
    for (const m of set.markables) {
      expect(m.mesh).toBe(false);
      const y0 = area.ground.y(m.x, m.z);
      let found = false;
      for (const [dx, dz] of [[0, 0], [0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]]) {
        rc.set(new THREE.Vector3(m.x + dx, y0 + 7, m.z + dz), new THREE.Vector3(0, -1, 0));
        rc.far = 8;
        if (rc.intersectObjects(solid, false).some((h) => h.point.y > y0 + 0.3)) found = true;
      }
      expect(found, m.id).toBe(true);
    }
  });

  it('puts the yarn ball in two spots a cat can walk up to, on one level', () => {
    const spots = yarnSpotsFor('roofs');
    expect(spots).toHaveLength(2);
    expect(dist(spots[0], spots[1])).toBeGreaterThan(5);
    const anchors = [area.spawn, ...area.collectibles, ...area.scenics, ...area.pois];
    const walkUps = [...set.carryables, ...set.rests, ...set.markables];
    for (const p of spots) {
      const at = `${p.x},${p.z}`;
      expect(p.where.length).toBeGreaterThan(3);
      expect(p.where).not.toMatch(/[.!]$/);
      expect(p.where.split(/\s+/).length, p.where).toBeLessThanOrEqual(5);
      expect(isWalkableAt(area, p.x, p.z), at).toBe(true);
      expect(clear(p), at).toBe(true);
      expect(oneLevel(p.x, p.z, 1.5), `${at} is on a slope or a rim`).toBe(true);
      expect(reachedAt(p.x, p.z), `${at} reached`).toBe(true);
      for (const q of walkUps) expect(dist(p, q), `${at} vs ${q.id}`).toBeGreaterThanOrEqual(2.5);
      for (const k of set.knockables) expect(dist(p, k.fallTo), `${at} vs ${k.id} landed`).toBeGreaterThanOrEqual(1.5);
      for (const f of set.flaps) expect(dist(p, f), `${at} vs ${f.id}`).toBeGreaterThanOrEqual(2.5);
      for (const q of anchors) expect(dist(p, q), `${at} vs ${q.x},${q.z}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('three golden mice, each on one level, clear, reached without Long Leap', async () => {
    const { GOLD_MICE } = await import('../src/goldmice.js');
    const mice = REG.goldMice;
    expect(mice.map((m) => m.id)).toEqual(['gm-roofs-1', 'gm-roofs-2', 'gm-roofs-3']);
    const groundOf = [LEVELS.TANK, LEVELS.LANTERN, LEVELS.GROUND];
    const crossEnds = ROOFS_TRAVERSAL.crossings.flatMap((c) => [c.points[0], c.points[c.points.length - 1]]);
    const hopEnds = area.traversal.hops.flatMap((h) => [{ x: h.x0, z: h.z0 }, { x: h.x1, z: h.z1 }]);
    // at least 1.5 m from every collectible and discovery anchor. A crossing's or hop's
    // own ends are the climb or pipe she takes to the mouse (the tank's lid is only
    // 2.6 m across, with the climb and the pipe both landing on it, so 1.5 m from those
    // is not possible): 0.9 m, so no mouse sits on a take-off or landing mark.
    const anchors = [...area.collectibles, ...Object.values(ROOFS_DISCOVERIES)];
    mice.forEach((m, i) => {
      expect(oneLevel(m.x, m.z), `${m.id} on one level`).toBe(true);
      expect(clear(m), `${m.id} clear`).toBe(true);
      expect(reachedAt(m.x, m.z), `${m.id} reached without Long Leap`).toBe(true);
      expect(area.ground.y(m.x, m.z), `${m.id} level`).toBeCloseTo(groundOf[i], 6);
      // a reached cell within 0.9 m whose ground is within 0.1 m of the mouse's
      let found = false;
      for (let r = 0; r <= 0.9 && !found; r += 0.3) {
        for (let k = 0; k < 8 && !found; k++) {
          const x = m.x + r * Math.cos((k * Math.PI) / 4);
          const z = m.z + r * Math.sin((k * Math.PI) / 4);
          if (reachedAt(x, z) && Math.abs(area.ground.y(x, z) - area.ground.y(m.x, m.z)) <= 0.1) found = true;
        }
      }
      expect(found, `${m.id} findable`).toBe(true);
      for (const q of anchors) expect(dist(m, q), `${m.id} vs ${q.x},${q.z}`).toBeGreaterThanOrEqual(1.5);
      for (const q of [...crossEnds, ...hopEnds]) expect(dist(m, q), `${m.id} vs end ${q.x},${q.z}`).toBeGreaterThanOrEqual(0.9);
    });
  });

  it('the gold rows are the registration\'s', async () => {
    const { GOLD_MICE } = await import('../src/goldmice.js');
    expect(GOLD_MICE.roofs).toEqual(plain(REG.goldMice));
  });

  it('the gold count is 45, and the Rooftops is in Legacy', async () => {
    const { GOLD_TOTAL, goldForEdition } = await import('../src/goldmice.js');
    expect(GOLD_TOTAL).toBe(45); // 42 until the Old House added its three, 39 until the Market added its three
    expect(goldForEdition('canon', CATALOG).size).toBe(45); // 42 until the Old House added its three, 39 until the Market added its three
    expect(goldForEdition('legacy', CATALOG).size).toBe(21); // 24 while the Market had no catalog row (an area not in the catalog is counted); its Clan-only row (Market step 4) keeps its three out of Legacy
  });

  it('an old save loads with walks.roofs 0 and marks.roofs []', () => {
    const map = new Map();
    const storage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
    const old = JSON.parse(JSON.stringify(createProgression(storage).state));
    delete old.walks.roofs;
    delete old.marks.roofs;
    map.set('whisker-walk-save', JSON.stringify(old));
    const p = createProgression(storage);
    expect(p.state.walks.roofs).toBe(0);
    expect(p.state.marks.roofs).toEqual([]);
    expect(p.marksIn('roofs')).toEqual([]);
    // and a mark left on the Rooftops is kept
    expect(p.addMark('roofs', { kind: 'scratch', id: 'roofs-post-1', x: -3, z: 44.5, at: 1 })).toBe(true);
    expect(p.marksIn('roofs')).toHaveLength(1);
  });

  it('not a colony area, and no legendary cat, dog or strays', () => {
    expect(REG.colony).toBe(false);
    expect(REG.strays).toBe(false);
    expect(COLONY_AREAS).not.toContain('roofs');
    expect(feedsHere('roofs')).toBe(false);
    expect(Object.hasOwn(LEGENDARY_BY_AREA, 'roofs')).toBe(false);
    expect(propsFor('roofs').dogYard).toBeNull();
    expect(area.critterSpawns).toEqual(roofsCritterSpawns(ROOFS_BIRDS, perchIndex(area.birdPerches)));
    expect(area.strays).toBe(false);
  });

  it('the budget row is the measured counts', () => {
    expect(REG.budget.built).toEqual([MEASURED_BUILT.meshes, MEASURED_BUILT.casters, MEASURED_BUILT.triangles]);
    expect(REG.budget.merged).toEqual([MEASURED_MERGED.meshes, MEASURED_MERGED.casters]);
  });
});

// =============================================================================
// Task 13: the first roof in seconds, on the real player (the spec's goal: "A
// child gets onto the first roof within the first minute"), and the picture
// views.
// =============================================================================
describe('The Rooftops: the first roof, and the picture views', async () => {
  const { ROOFS_TOURS, ROOFS_SHOTS, roofsArea } = await import('../src/world/roofsplan.js');
  const { createYardPilot } = await import('../src/world/traversalyard.js');
  const { yardWalk } = await import('./helpers/traversalwalk.js');

  it('the first roof in seconds, on the real player', () => {
    const tour = ROOFS_TOURS.firstRoof;
    expect([tour.start.x, tour.start.z]).toEqual([ROOFS_SPAWN.x, ROOFS_SPAWN.z]);
    const area = roofsArea();
    const w = yardWalk({ area, at: [ROOFS_SPAWN.x, ROOFS_SPAWN.z], face: [0, -1], colliders: area.colliders }); // the colliders the game gives the player
    const pilot = createYardPilot(tour);
    const DT = 1 / 30;
    let r; let frames = 0;
    do { r = pilot.step(DT, w); w.frame(DT); frames++; } while (!r.done && frames < 30 * 60);
    expect(r.done).toBe(true);
    expect(r.failed ?? null).toBeNull();
    expect(frames * DT).toBeLessThan(20);
    const p = w.cat.position;
    expect(w.area.ground.y(p.x, p.z)).toBe(LEVELS.GARAGE);
    expect(p.y).toBeCloseTo(LEVELS.GARAGE, 6);
    const kinds = w.events.map((e) => `${e.type}:${e.id ?? e.kind}`);
    expect(kinds).toEqual(expect.arrayContaining(['climb:bin-up', 'climb:shed-up', 'climb:garages-up']));
  });

  it('the terrace tour (the film) runs on from the garages, over plank-2, onto the flat roof, in under 30 s', () => {
    const tour = ROOFS_TOURS.terrace;
    const area = roofsArea();
    const w = yardWalk({ area, at: [tour.start.x, tour.start.z], face: tour.start.face, colliders: area.colliders });
    const pilot = createYardPilot(tour);
    const DT = 1 / 30;
    let r; let frames = 0;
    do { r = pilot.step(DT, w); w.frame(DT); frames++; } while (!r.done && frames < 30 * 60);
    expect(r.failed ?? null).toBeNull();
    expect(frames * DT).toBeLessThan(30);
    const p = w.cat.position;
    expect(w.area.ground.y(p.x, p.z)).toBe(LEVELS.FLAT);
    const kinds = w.events.map((e) => `${e.type}:${e.id ?? e.kind}`);
    expect(kinds).toEqual(expect.arrayContaining(['climb:garages-up', 'cross:plank-2', 'climb:out-7-up', 'climb:flatHouse-up']));
  });

  it('the alley crates are solid: she is stopped outside them, and still reaches their tops', async () => {
    const { ALLEY_CRATES, ROOFS_PERCHES } = await import('../src/world/roofsplan.js');
    const { canReach } = await import('../src/climbing.js');
    const { CAT_RADIUS } = await import('../src/player.js');
    const area = roofsArea();
    // the stack's side and the lone crate's side, walked straight at each one's middle
    for (const [i, from] of [[0, [-22, 35.07]], [3, [6, 35.0]]]) {
      const c = ALLEY_CRATES[i];
      const w = yardWalk({ area, at: from, face: [1, 0], colliders: area.colliders });
      w.push(1, 0);
      let minGap = Infinity; // her middle's gap to every crate's near face, over two seconds of a held stick
      for (let f = 0; f < 60; f++) {
        w.frame(1 / 30);
        const q = w.cat.position;
        for (const k of ALLEY_CRATES) minGap = Math.min(minGap, Math.hypot(q.x - k.x, q.z - k.z) - k.s / 2);
      }
      const p = w.cat.position;
      expect(minGap, `crate ${i} walked through`).toBeGreaterThan(0.3);
      // from where she stops, a pounce still reaches a crate's top
      const reach = ROOFS_PERCHES.filter((q) => q.kind === 'crate' && canReach(q, { x: p.x, z: p.z }, 0));
      expect(reach.length, `crate ${i} unreachable`).toBeGreaterThan(0);
    }
  });

  it('has a card picture for the home screen', async () => {
    const { readFileSync } = await import('node:fs');
    const jpg = readFileSync(new URL('../public/places/roofs.jpg', import.meta.url));
    expect(jpg[0]).toBe(0xff);
    expect(jpg[1]).toBe(0xd8);
    expect(jpg.length).toBeGreaterThan(5000);
  });

  it('has its eight picture views, each six numbers', () => {
    expect(Object.keys(ROOFS_SHOTS)).toEqual(['alley', 'terraces', 'ridge', 'gap', 'warehouse', 'tower', 'edge', 'card']);
    for (const [name, v] of Object.entries(ROOFS_SHOTS)) {
      const n = v.split(',').map(Number);
      expect([name, n.length, n.every(Number.isFinite)]).toEqual([name, 6, true]);
    }
  });

  it('has its seven moment views, each six numbers and a walk second', async () => {
    const { ROOFS_MOMENT_SHOTS, ROOFS_SHOTS: eight } = await import('../src/world/roofsplan.js');
    expect(Object.isFrozen(ROOFS_MOMENT_SHOTS)).toBe(true);
    expect(Object.keys(ROOFS_MOMENT_SHOTS)).toEqual(['garden', 'loft', 'vane', 'skylight', 'telescope', 'chimney', 'mice']);
    for (const [name, shot] of Object.entries(ROOFS_MOMENT_SHOTS)) {
      const n = shot.view.split(',').map(Number);
      expect([name, n.length, n.every(Number.isFinite)]).toEqual([name, 6, true]);
      expect([name, Number.isFinite(shot.t) && shot.t >= 0]).toEqual([name, true]);
      expect(eight[name], `${name} is not also one of the eight`).toBeUndefined();
    }
  });

  it('has its six life views, each six numbers and a walk second', async () => {
    const { ROOFS_LIFE_SHOTS } = await import('../src/world/roofsplan.js');
    expect(Object.isFrozen(ROOFS_LIFE_SHOTS)).toBe(true);
    expect(Object.keys(ROOFS_LIFE_SHOTS)).toEqual(['guide', 'plank', 'washing', 'smoke', 'loft', 'sleeper']);
    for (const [name, shot] of Object.entries(ROOFS_LIFE_SHOTS)) {
      const n = shot.view.split(',').map(Number);
      expect([name, n.length, n.every(Number.isFinite)]).toEqual([name, 6, true]);
      expect([name, Number.isFinite(shot.t) && shot.t >= 0]).toEqual([name, true]);
      expect(ROOFS_SHOTS[name], `${name} is not also one of the eight`).toBeUndefined();
    }
    expect(ROOFS_LIFE_SHOTS.guide.t).toBe(0);
    expect(ROOFS_LIFE_SHOTS.washing.t).toBe(240.5);
  });
});
