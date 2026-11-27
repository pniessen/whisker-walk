// The Reef, milestone R13: the Sealab's shell. The plan (footprint, rooms, doorways, colliders, the hatch), that every room is walkable from the hatch with no
// skills and sealed from the sea, the seabed under and round it (flat inside, byte for byte the same outside), the scatters taken away after they are made, the
// finite ceiling and the camera under it at every zoom step, the hatch's round trip (float switched off and put back, air paused, fog and the one light), the
// prompt arbiter, the blinking cells (still under reduced motion), the lower rungs, the words in both sets, the journal's wing switch and the source rules.
import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync, globSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { floodFrom } from './helpers/flood.js';
import { isWalkableAt, createPlayer } from '../src/player.js';
import { ZOOM_STEPS } from '../src/camzoom.js';
import { MAX_PATH_GRADE } from '../src/ground.js';

stubCanvasDocument();
const { build } = await import('../src/world/reef.js');
const L = await import('../src/world/reeflabplan.js');
const P = await import('../src/world/reefplan.js');
const W = await import('../src/world/reefwing.js');
const D = await import('../src/world/reefdecor.js');
const S = await import('../src/world/reefstory.js');
const Q = await import('../src/world/reeffindsplan.js');
const DEEP = await import('../src/world/reefdeep.js');
const T = await import('../src/world/reeflabtravel.js');
const { createPromptArbiter } = await import('../src/world/reefprompt.js');
const { LINES } = await import('../src/world/reeflabwords.js');
const { phrase } = await import('../src/clanphrases.js');
const { createProgression } = await import('../src/progression.js');
const { createDiscoveryLog } = await import('../src/discoveries.js');
const { placeFloat, PLACE_PHYSICS } = await import('../src/placephysics.js');
const { renderJournalHtml } = await import('../src/journal.js');
const RP = await import('../src/reefpages.js');
const { setReef } = await import('../src/reefflag.js');

const read = (f) => readFileSync(f, 'utf8');
const B = P.REEF_BOUNDS;
const F = L.LAB_FOOT;
const scene = new THREE.Scene();
const area = build(scene);
const labCols = L.labColliders();
const otherCols = area.colliders.filter((c) => !labCols.some((l) => l.x === c.x && l.z === c.z && l.r === c.r));
// the distance from a point to the footprint's rectangle (0 inside it)
const rectGap = (x, z, f = F) => Math.hypot(Math.max(f.minX - x, 0, x - f.maxX), Math.max(f.minZ - z, 0, z - f.maxZ));
const inFoot = (x, z, r = 0) => x + r > F.minX && x - r < F.maxX && z + r > F.minZ && z - r < F.maxZ;

describe('the plan (reeflabplan.js)', () => {
  it('the footprint is the building plus its apron, inside the bounds, on the seabed mesh\'s 3 m grid lines, and the station has a name', () => {
    expect(F).toEqual({ minX: L.LAB_BUILD.minX - L.LAB_APRON, maxX: L.LAB_BUILD.maxX + L.LAB_APRON, minZ: L.LAB_BUILD.minZ - L.LAB_APRON, maxZ: L.LAB_BUILD.maxZ + L.LAB_APRON });
    expect(F.minX).toBeGreaterThanOrEqual(B.minX); expect(F.maxX).toBeLessThanOrEqual(B.maxX); expect(F.minZ).toBeGreaterThanOrEqual(B.minZ); expect(F.maxZ).toBeLessThanOrEqual(B.maxZ);
    for (const v of [F.minX, F.maxX, F.minZ, F.maxZ]) expect(Math.abs(v % 3), `${v} is a grid line of the seabed's mesh`).toBe(0);
    expect(L.LAB_NAME).toBe('Tidewell Station');
    expect(L.LAB_BUILD.maxX - L.LAB_BUILD.minX).toBeGreaterThan(18); // "about x 0 to 20, z -41 to -31": 19 by 10, south-middle
  });
  it('four rooms and two halls inside the building, three fuse sockets and three tanks as data, every doorway at least 2.2 m wide', () => {
    expect(['control', 'bunk', 'aquarium', 'dome', 'hall1', 'hall2']).toEqual(L.ROOM_IDS);
    const b = L.LAB_BUILD;
    for (const id of L.ROOM_IDS) {
      const r = L.ROOMS[id];
      const [x0, x1, z0, z1] = r.kind === 'circle' ? [r.x - r.r, r.x + r.r, r.z - r.r, r.z + r.r] : [r.minX, r.maxX, r.minZ, r.maxZ];
      expect(x0, id).toBeGreaterThan(b.minX); expect(x1, id).toBeLessThan(b.maxX); expect(z0, id).toBeGreaterThan(b.minZ); expect(z1, id).toBeLessThan(b.maxZ);
    }
    expect(L.FUSE_SOCKETS).toHaveLength(3);
    expect(L.TANKS).toHaveLength(3);
    for (const d of L.DOORS) expect(d.w, d.id).toBeGreaterThanOrEqual(2.2);
    for (const s of L.FUSE_SOCKETS) expect(L.roomAt(s.x, s.z - 0.5)).toBe('control');
  });
  it('stands clear of everything else in the Reef: the Deep, the finds, the pockets, the mice, the story, the spawn', () => {
    const solids = [...otherCols];
    for (const c of solids) expect(rectGap(c.x, c.z) - c.r, JSON.stringify(c)).toBeGreaterThan(0.3);
    const marks = [...S.POCKETS.map((p) => [p, 2.2]), ...Q.REEF_SCENICS.map((p) => [p, 1.2]), ...Q.REEF_COLLECTIBLES.map((p) => [p, 1.4]), ...Q.REEF_GOLD.map((p) => [p, 2]),
      ...Object.values(Q.REEF_FIND_MARKS).map((p) => [p, 2]), ...P.KEEP_OUT.map((k) => [{ x: k[0], z: k[1] }, k[2]]), [P.REEF_SPAWN, 2], [S.MARLO.start, 2]];
    for (const [p, r] of marks) expect(rectGap(p.x, p.z) - r, JSON.stringify(p)).toBeGreaterThanOrEqual(0);
    expect(rectGap(DEEP.BOAT.x, DEEP.BOAT.z)).toBeGreaterThan(20);
    expect(P.zoneAt(L.HATCH.outside.x, L.HATCH.outside.z)).toBe('deep');
  });
  it('the hatch ring stands beside the Boat on open sand: 1.5 m clear of every other solid, off the finds, the pockets and the scenic spots', () => {
    const h = L.HATCH.outside;
    expect(Math.hypot(h.x - DEEP.BOAT.x, h.z - DEEP.BOAT.z)).toBeLessThan(7);
    for (const c of otherCols) expect(Math.hypot(h.x - c.x, h.z - c.z) - c.r - L.HATCH_COLLIDER.r, JSON.stringify(c)).toBeGreaterThan(1.5);
    for (const p of [...S.POCKETS, ...Q.REEF_SCENICS, ...Q.REEF_COLLECTIBLES, ...Q.REEF_GOLD, ...Object.values(Q.REEF_FIND_MARKS)]) expect(Math.hypot(h.x - p.x, h.z - p.z), JSON.stringify(p)).toBeGreaterThan(2.2);
    expect(Math.hypot(h.landing.x - h.x, h.landing.z - h.z)).toBeGreaterThan(h.reach); // she is not offered the climb the moment she lands
    const e = L.HATCH.inside;
    expect(Math.hypot(e.arrive.x - e.exit.x, e.arrive.z - e.exit.z)).toBeGreaterThan(e.reach);
    expect(L.roomAt(e.arrive.x, e.arrive.z)).toBe('control');
    expect(L.roomAt(e.exit.x, e.exit.z)).toBe('control');
  });
  it('is pure: the same colliders and wall lines twice, no random number or clock in the plan', () => {
    expect(L.labColliders()).toEqual(L.labColliders());
    expect(L.wallLines()).toEqual(L.wallLines());
    const src = read('src/world/reeflabplan.js').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now|\bimport\b/);
  });
});

describe('every collider is placed', () => {
  it('each lab collider is in the area record, inside the building (the hatch\'s collar beside the Boat), and a wall is never a gap a cat can pass', () => {
    for (const c of labCols) {
      expect(area.colliders.some((a) => a.x === c.x && a.z === c.z && a.r === c.r), JSON.stringify(c)).toBe(true);
      if (c === L.HATCH_COLLIDER) continue;
      expect(c.x, JSON.stringify(c)).toBeGreaterThan(L.LAB_BUILD.minX); expect(c.x).toBeLessThan(L.LAB_BUILD.maxX);
      expect(c.z).toBeGreaterThan(L.LAB_BUILD.minZ); expect(c.z).toBeLessThan(L.LAB_BUILD.maxZ);
    }
    expect(L.PROP_COLLIDERS.length).toBeGreaterThan(15);
    // every wall collider has a neighbour within WALL_STEP (a chain: nothing between two links is wider than a cat)
    const walls = L.wallColliders();
    const gapOf = (c) => Math.min(...walls.filter((o) => o !== c).map((o) => Math.hypot(o.x - c.x, o.z - c.z)));
    for (const c of walls) expect(gapOf(c), JSON.stringify(c)).toBeLessThanOrEqual(L.WALL_STEP + 1e-6);
  });
});

describe('reachability (no skills)', () => {
  const e = L.HATCH.inside;
  const inside = floodFrom(area, e.arrive, (x, z) => isWalkableAt(area, x, z));
  const outside = floodFrom(area, P.REEF_SPAWN, (x, z) => isWalkableAt(area, x, z));
  it('from the arrival spot she reaches every room, both halls and every doorway, and the exit spot', () => {
    const spots = {
      control: [[2.4, -32.2], [7.0, -31.2], [9.2, -34.0], [2.6, -34.3]], bunk: [[2.4, -37.1], [6.4, -37.1], [4.4, -35.9], [1.0, -36.8]],
      aquarium: [[10.0, -36.5], [13.5, -36.5], [17.4, -36.8]], dome: [[15.6, -32.4], [15.6, -31.2], [14.0, -33.4], [17.2, -33.0]],
      halls: [[11.7, -32.4], [8.1, -37.1]],
    };
    for (const [room, list] of Object.entries(spots)) for (const [x, z] of list) expect(inside.reaches(x, z), `${room} ${x},${z}`).toBe(true);
    for (const d of L.DOORS) expect(inside.reaches(d.x + (d.axis === 'z' ? 0 : 0), d.z), d.id).toBe(true);
    expect(inside.reachesWithin(e.exit.x, e.exit.z, e.reach - 0.1)).toBe(true);
    expect(inside.reaches(L.BUNK_SPOT.x, L.BUNK_SPOT.z)).toBe(true);
    expect(inside.reaches(L.DOME_BENCH.x, L.DOME_BENCH.z)).toBe(true);
    for (const s of L.FUSE_SOCKETS) expect(inside.reachesWithin(s.x, s.z, 1.6), `socket ${s.id}`).toBe(true);
    for (const t of L.TANKS) expect(inside.reachesWithin(t.x, t.z, 1.9), `tank ${t.id}`).toBe(true);
  });
  it('every free spot of the rooms is part of the same walk (no walled-off corner a cat could be put in)', () => {
    let free = 0; let cut = 0;
    for (let x = L.LAB_BUILD.minX; x <= L.LAB_BUILD.maxX; x += 0.5) {
      for (let z = L.LAB_BUILD.minZ; z <= L.LAB_BUILD.maxZ; z += 0.5) {
        if (!L.insideLab(x, z) || !isWalkableAt(area, x, z)) continue;
        free++;
        if (!inside.reaches(x, z)) cut++;
      }
    }
    expect(free).toBeGreaterThan(300);
    expect(cut).toBe(0);
  });
  it('the station is sealed: from inside she cannot reach the open sea, and from the sea she cannot reach inside', () => {
    for (const [x, z] of [[P.REEF_SPAWN.x, P.REEF_SPAWN.z], [-5, -34], [10, -28.5], [19.5, -34], [10, -40.8], [-1.5, -31]]) expect(inside.reaches(x, z), `${x},${z}`).toBe(false);
    for (const [x, z] of [[e.arrive.x, e.arrive.z], [15.6, -32.4], [13.5, -36.5], [2.4, -37.1]]) expect(outside.reaches(x, z), `${x},${z}`).toBe(false);
  });
  it('from the spawn she reaches the hatch on foot, and the place she comes up at', () => {
    const o = L.HATCH.outside;
    expect(outside.reachesWithin(o.x, o.z, o.reach - 0.3)).toBe(true);
    expect(outside.reaches(o.landing.x, o.landing.z)).toBe(true);
    expect(isWalkableAt(area, o.landing.x, o.landing.z)).toBe(true);
    expect(isWalkableAt(area, e.arrive.x, e.arrive.z)).toBe(true);
  });
});

describe('the seabed', () => {
  it('outside the footprint it is byte for byte what it was (reefY is reefBaseY on and beyond the edge)', () => {
    let n = 0;
    for (let x = B.minX - 20; x <= B.maxX + 20; x += 0.7) {
      for (let z = B.minZ - 20; z <= B.maxZ + 20; z += 0.7) {
        if (inFoot(x, z) && x > F.minX && x < F.maxX && z > F.minZ && z < F.maxZ) continue;
        n++;
        if (!Object.is(P.reefY(x, z), P.reefBaseY(x, z))) throw new Error(`reefY(${x}, ${z}) moved`);
      }
    }
    for (const x of [F.minX, F.maxX]) for (let z = F.minZ; z <= F.maxZ; z += 0.5) expect(Object.is(P.reefY(x, z), P.reefBaseY(x, z))).toBe(true);
    for (const z of [F.minZ, F.maxZ]) for (let x = F.minX; x <= F.maxX; x += 0.5) expect(Object.is(P.reefY(x, z), P.reefBaseY(x, z))).toBe(true);
    expect(n).toBeGreaterThan(10000);
  });
  it('inside the building it is flat at the floor; between the building and the footprint\'s edge it eases, never steeper than a walkable strip', () => {
    const b = L.LAB_BUILD;
    for (let x = b.minX; x <= b.maxX; x += 0.5) for (let z = b.minZ; z <= b.maxZ; z += 0.5) expect(P.reefY(x, z)).toBe(L.LAB_FLOOR_Y);
    const g = area.ground;
    const out = { x: 0, z: 0 };
    let steep = 0;
    for (let x = F.minX; x <= F.maxX; x += 0.25) {
      for (let z = F.minZ; z <= F.maxZ; z += 0.25) {
        const y = P.reefY(x, z);
        expect(y).toBeGreaterThanOrEqual(Math.min(P.reefBaseY(x, z), L.LAB_FLOOR_Y) - 1e-9);
        expect(y).toBeLessThanOrEqual(Math.max(P.reefBaseY(x, z), L.LAB_FLOOR_Y) + 1e-9);
        g.gradient(x, z, out);
        steep = Math.max(steep, Math.hypot(out.x, out.z));
      }
    }
    expect(steep).toBeLessThan(MAX_PATH_GRADE);
    // and a cat can walk across the apron on the level seabed (the walk's own step rule)
    for (const z of [-41, -38, -33, -28]) expect(g.canStep(F.minX - 1, z, b.minX - 0.1, z), `z ${z}`).toBe(true);
  });
  it('the drawn ground carries the flat floor (its vertices inside the building are all at the floor)', () => {
    const m = scene.getObjectByName('reef:ground');
    const pos = m.geometry.attributes.position;
    let inBuild = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i); const z = pos.getZ(i);
      if (x >= L.LAB_BUILD.minX && x <= L.LAB_BUILD.maxX && z >= L.LAB_BUILD.minZ && z <= L.LAB_BUILD.maxZ) { inBuild++; expect(pos.getY(i)).toBeCloseTo(L.LAB_FLOOR_Y, 5); }
    }
    expect(inBuild).toBeGreaterThan(20);
  });
});

describe('the plants and the decor are taken away after they are scattered', () => {
  it('nothing grows inside the footprint, and every other plant keeps its place (the streams are untouched)', () => {
    for (const k of P.scatterKelp()) expect(inFoot(k.x, k.z, 0.3), JSON.stringify(k)).toBe(false);
    for (const k of P.scatterCoral()) expect(inFoot(k.x, k.z, k.s), JSON.stringify(k)).toBe(false);
    for (const k of W.scatterWing()) expect(inFoot(k.x, k.z, k.s), JSON.stringify(k)).toBe(false);
    const d = D.scatterDecor();
    for (const [fam, list] of Object.entries(d)) if (fam !== 'grassPatches') for (const t of list) expect(inFoot(t.x, t.z, t.r ?? 0.3), `${fam} ${JSON.stringify(t)}`).toBe(false);
    expect(P.scatterKelp()).toEqual(P.scatterKelpAll().filter((k) => !inFoot(k.x, k.z, 0.3)));
    expect(P.scatterCoral()).toEqual(P.scatterCoralAll().filter((k) => !inFoot(k.x, k.z, k.s)));
    expect(W.scatterWing()).toEqual(W.scatterWingAll().filter((k) => !inFoot(k.x, k.z, k.s)));
    expect(P.scatterKelpAll().length).toBe(P.KELP_COUNT.garden + P.KELP_COUNT.outliers); // the stream still makes all of them
    expect(P.scatterKelpAll().length - P.scatterKelp().length).toBeGreaterThan(0); // and the footprint really took some
    expect(P.scatterKelpAll().length - P.scatterKelp().length).toBeLessThan(8);
    expect(P.KEEP_OUT.some((k) => inFoot(k[0], k[1]))).toBe(false); // never through KEEP_OUT (it would move every plant)
  });
  it('the drawn kelp is the plan\'s list (one blade for each, none in the footprint)', () => {
    const kelp = scene.getObjectByName('reef:kelp');
    expect(kelp.count).toBe(P.scatterKelp().length);
  });
});

describe('the ceiling and the camera under it', () => {
  it('the rooms are 4.5 m high over the floor and the dome 7 m; open water elsewhere; ground.ceil says the same', () => {
    const g = area.ground;
    for (const [x, z] of [[2.4, -32.2], [3, -37], [13, -37], [11.7, -32.4], [8.1, -37.1]]) expect(g.ceil(x, z)).toBe(L.LAB_FLOOR_Y + 4.5);
    for (const [x, z] of [[15.6, -32.4], [14, -33.5], [16.9, -31.5]]) expect(g.ceil(x, z)).toBe(L.LAB_FLOOR_Y + 7);
    for (const [x, z] of [[0, 0], [-5, -34], [30, -30], [10, -28], [-27, -32]]) expect(g.ceil(x, z)).toBe(Infinity);
  });
  const rigAt = (x, z, step, y = L.LAB_FLOOR_Y) => {
    const camera = new THREE.PerspectiveCamera();
    const player = createPlayer(camera, null, { headless: true });
    const cat = new THREE.Group();
    cat.position.set(x, y, z);
    player.setAvatar(cat, 0.7);
    player.setGround(area.ground);
    player.setFloat(null);
    player.setCameraZoom(step, { instant: true });
    player.enable();
    return { camera, player, cat };
  };
  it('at every zoom step, in every room, the camera stays under the roof (0.3 m clear) and over the floor, and the close-in cave view is on', () => {
    const spots = [[2.4, -32.2], [0.9, -31.6], [9.4, -34.4], [1.2, -38.4], [3, -36], [7, -37.1], [9.5, -36.2], [13, -36.4], [17.4, -37.4], [11.7, -32.4], [15.6, -32.4], [15.6, -34.2], [13.8, -33.4], [17.3, -31.8], [15.6, -30.9]];
    const g = area.ground;
    for (const step of ZOOM_STEPS.keys()) {
      for (const [x, z] of spots) {
        const { camera, player, cat } = rigAt(x, z, step);
        for (let i = 0; i < 90; i++) player.update(1 / 60, [], B, []);
        const c = camera.position;
        const ceil = g.ceil(c.x, c.z);
        if (ceil !== Infinity) expect(c.y, `step ${step} at ${x},${z}: the camera is under the roof`).toBeLessThanOrEqual(ceil - 0.3 + 1e-6);
        expect(c.y, `step ${step} at ${x},${z}: over the floor`).toBeGreaterThan(g.y(c.x, c.z));
        expect(player.cameraCaveBlend, `step ${step} at ${x},${z}`).toBe(1);
        expect(Math.hypot(c.x - cat.position.x, c.z - cat.position.z), `step ${step} at ${x},${z}: close in`).toBeLessThan(3);
        expect(c.y).toBeLessThan(L.LAB_FLOOR_Y + 7);
      }
    }
  });
  it('outside the walls the open-water camera is the Reef\'s own (no cave view)', () => {
    const { camera, player } = rigAt(-26, -33.2, 2, P.reefY(-26, -33.2));
    for (let i = 0; i < 60; i++) player.update(1 / 60, [], B, []);
    expect(player.cameraCaveBlend).toBe(0);
    expect(camera.position.y).toBeGreaterThan(P.reefY(-26, -33.2) + 1.5);
  });
});

describe('the one real light, and the shadows', () => {
  it('exactly one PointLight in the whole Reef build, at intensity 0 and casting nothing; no lab mesh casts, the roof included', () => {
    const lights = [];
    scene.traverse((o) => { if (o.isPointLight) lights.push(o); });
    expect(lights).toHaveLength(1);
    expect(lights[0].intensity).toBe(0);
    expect(lights[0].castShadow).toBe(false);
    const labMeshes = [];
    scene.traverse((o) => { if (o.isMesh && o.name.startsWith('lab:')) labMeshes.push(o); });
    expect(labMeshes.map((m) => m.name).sort()).toEqual(['lab:detail', 'lab:fixtures', 'lab:glass', 'lab:glow', 'lab:hatch', 'lab:hull', 'lab:roof', 'lab:walls']);
    for (const m of labMeshes) { expect(m.castShadow, m.name).toBe(false); expect(m.receiveShadow, m.name).toBe(false); expect(m.userData.noCast && m.userData.noMerge && m.userData.noContactShadow, m.name).toBe(true); }
    expect(scene.getObjectByName('lab:interior').visible).toBe(false); // she starts outside: the inside is hidden, the hull shown
    expect(scene.getObjectByName('lab:hull').visible).toBe(true);
  });
  it('the wall faces all look toward their own room (a wall seen from the next room is not drawn in the way)', () => {
    const walls = scene.getObjectByName('lab:walls');
    const pos = walls.geometry.attributes.position;
    expect(walls.material).toHaveLength(6);
    expect(walls.geometry.groups).toHaveLength(6);
    const mid = (id) => { const r = L.ROOMS[id]; return r.kind === 'circle' ? [r.x, r.z] : [(r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2]; };
    const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
    for (const grp of walls.geometry.groups) {
      const [mx, mz] = mid(walls.userData.rooms[grp.materialIndex]);
      for (let t = grp.start; t < grp.start + grp.count; t += 3) {
        a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
        const n = b.clone().sub(a).cross(c.clone().sub(a));
        const mx2 = (a.x + b.x + c.x) / 3; const mz2 = (a.z + b.z + c.z) / 3;
        expect(n.x * (mx - mx2) + n.z * (mz - mz2), `room ${walls.userData.rooms[grp.materialIndex]} face at ${mx2.toFixed(1)},${mz2.toFixed(1)}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('the hatch\'s round trip', () => {
  const made = [];
  afterEach(() => { for (const m of made.splice(0)) m.life.dispose(); });
  const make = (extra = {}) => {
    const sc = new THREE.Scene();
    const placed = build(sc);
    const progression = createProgression(memoryStorage());
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const camera = new THREE.PerspectiveCamera();
    const player = createPlayer(camera, null, { headless: true });
    const cat = new THREE.Group();
    const o = L.HATCH.outside;
    cat.position.set(o.x + 1.2, P.reefY(o.x + 1.2, o.z), o.z);
    player.setAvatar(cat, 0.7);
    player.setFloat(placeFloat('reef'));
    player.setGround(placed.ground);
    player.enable();
    const life = placed.life({ scene: sc, log, progression, player, reducedMotion: false, visits: 1, doc: null, ...extra });
    const session = { cat };
    const m = { life, scene: sc, player, cat, session, placed, camera, t: 0 };
    m.step = (secs) => { for (let i = 0; i < Math.round(secs * 60); i++) { m.t += 1 / 60; player.update(1 / 60, [], B, []); life.update(1 / 60, m.t, cat.position, camera, session); } };
    made.push(m);
    return m;
  };
  it('beside the ring she is offered "Climb down"; the press fades, sets her in the control room, switches the float off, pauses the air, eases the fog and raises the light', () => {
    const m = make();
    m.step(0.1);
    expect(m.life.promptAt(m.cat.position)).toBe(phrase('reef.lab.down'));
    expect(phrase('reef.lab.down')).toMatch(/Tidewell Station/);
    expect(m.player.canFloat).toBe(true);
    const row = m.player.floatRow;
    expect(row).toEqual(placeFloat('reef'));
    m.life.interact();
    m.step(1);
    expect(m.life.lab.inside).toBe(true);
    expect(m.cat.position.x).toBe(L.HATCH.inside.arrive.x); expect(m.cat.position.z).toBe(L.HATCH.inside.arrive.z); expect(m.cat.position.y).toBe(L.LAB_FLOOR_Y);
    expect(isWalkableAt(m.placed, m.cat.position.x, m.cat.position.z)).toBe(true);
    expect(m.player.canFloat).toBe(false);
    expect(m.player.floatY).toBe(0);
    expect(m.scene.getObjectByName('lab:interior').visible).toBe(true);
    expect(m.scene.getObjectByName('lab:hull').visible).toBe(false);
    const used = m.life.air.used;
    m.step(8);
    expect(m.life.air.used).toBe(used); // the gauge stands still inside
    expect(m.scene.fog.near).toBeGreaterThan(13.5); expect(m.scene.fog.far).toBeGreaterThan(58);
    const light = m.scene.getObjectByName('lab:light');
    expect(light.intensity).toBeGreaterThan(1.5);
    expect(Math.hypot(light.position.x - m.cat.position.x, light.position.z - m.cat.position.z)).toBeLessThan(0.01);
    expect(light.position.y).toBeLessThan(m.placed.ground.ceil(m.cat.position.x, m.cat.position.z));
    const lights = []; m.scene.traverse((o) => { if (o.isPointLight) lights.push(o); });
    expect(lights).toHaveLength(1);
    // only her room's wall faces are drawn
    const walls = m.scene.getObjectByName('lab:walls');
    expect(walls.userData.rooms.filter((id, i) => walls.material[i].visible)).toEqual(['control']);
    expect(m.player.cameraZoomStep).toBeGreaterThanOrEqual(0);
  });
  it('inside, "Climb up" by the ladder puts her back on open sand beside the ring, the float row is the Reef\'s own again, the gauge runs, the fog and light go back', () => {
    const m = make();
    m.step(0.1); m.life.promptAt(m.cat.position); m.life.interact(); m.step(1);
    expect(m.life.promptAt(m.cat.position)).toBeNull(); // arrived, a step away from the ladder
    const e = L.HATCH.inside;
    m.cat.position.set(e.exit.x, L.LAB_FLOOR_Y, e.exit.z);
    m.step(0.05);
    expect(m.life.promptAt(m.cat.position)).toBe(phrase('reef.lab.up'));
    m.life.interact();
    m.step(1);
    const o = L.HATCH.outside;
    expect(m.life.lab.inside).toBe(false);
    expect(m.cat.position.x).toBe(o.landing.x); expect(m.cat.position.z).toBe(o.landing.z);
    expect(isWalkableAt(m.placed, m.cat.position.x, m.cat.position.z)).toBe(true);
    expect(m.cat.position.y).toBe(P.reefY(o.landing.x, o.landing.z));
    expect(m.player.canFloat).toBe(true);
    expect(m.player.floatRow).toEqual(placeFloat('reef'));
    m.player.setKick(true); m.step(1.5); m.player.setKick(false);
    expect(m.player.floatY).toBeGreaterThan(0.5); // she can float again
    m.step(8);
    expect(m.scene.fog.near).toBeLessThan(P.WATER_LOOK.fogNear + 0.3); expect(m.scene.fog.far).toBeLessThan(P.WATER_LOOK.fogFar + 0.5);
    expect(m.scene.getObjectByName('lab:light').intensity).toBeLessThan(0.05);
    expect(m.scene.getObjectByName('lab:hull').visible).toBe(true);
    const used = m.life.air.used;
    m.step(3);
    expect(m.life.air.used).toBeGreaterThan(used); // the air runs again outside
    expect(Object.keys(PLACE_PHYSICS)).toEqual(['moon', 'reef']); // no new physics row
    expect(P.zoneAt(m.cat.position.x, m.cat.position.z)).toBe('deep');
  });
  it('a trip is a fade: covered at the middle, clear at the ends; under reduced motion she is placed at once with no veil; a press mid-trip does nothing', () => {
    const s = T.createTravel();
    expect(T.startTravel(s, 'down')).toBe(true);
    expect(T.startTravel(s, 'up')).toBe(false);
    let placed = 0; let maxAlpha = 0; let frames = 0;
    while (T.travelling(s) && frames++ < 200) { const r = T.stepTravel(s, 1 / 60); if (r.place) placed++; maxAlpha = Math.max(maxAlpha, r.alpha); }
    expect(placed).toBe(1); expect(maxAlpha).toBe(1); expect(T.travelling(s)).toBe(false);
    expect(T.startTravel(s, 'sideways')).toBe(false);
    const r = T.createTravel(); T.startTravel(r, 'up');
    const first = T.stepTravel(r, 1 / 60, true);
    expect(first).toMatchObject({ place: true, alpha: 0, dir: 'up' });
    T.stepTravel(r, 1 / 60, true);
    expect(T.travelling(r)).toBe(false);
    for (const dt of [NaN, -1, 1e9, 0]) { const q = T.createTravel(); T.startTravel(q, 'down'); const k = T.stepTravel(q, dt); expect(Number.isFinite(k.alpha)).toBe(true); }
    const m = make({ reducedMotion: true });
    m.step(0.1); m.life.promptAt(m.cat.position); m.life.interact();
    m.step(1 / 60 * 2);
    expect(m.life.lab.inside).toBe(true);
  });
  it('if she is put somewhere else while inside (a lift, a reset) the inside state ends with it and the float is back', () => {
    const m = make();
    m.step(0.1); m.life.promptAt(m.cat.position); m.life.interact(); m.step(1);
    expect(m.life.lab.inside).toBe(true);
    m.cat.position.set(P.REEF_SPAWN.x, 0, P.REEF_SPAWN.z);
    m.step(0.1);
    expect(m.life.lab.inside).toBe(false);
    expect(m.player.canFloat).toBe(true);
  });
  it('not offered from high over the sand, nor far from the ring; the arbiter asks Marlo and the errand first and the hatch last', () => {
    const m = make();
    const o = L.HATCH.outside;
    m.cat.position.set(o.x + 6, 0, o.z);
    expect(m.life.promptAt(m.cat.position)).toBeNull();
    m.cat.position.set(o.x + 1.2, 0, o.z);
    expect(m.life.promptAt(m.cat.position)).toBe(phrase('reef.lab.down'));
    const calls = [];
    const src = (name, line) => ({ promptAt: () => { calls.push(name); return line; }, interact: () => { calls.push(`${name}!`); return name; } });
    const arb = createPromptArbiter([src('marlo', null), src('errand', 'hand in'), src('hatch', 'climb')]);
    expect(arb.promptAt({})).toBe('hand in');
    expect(calls).toEqual(['marlo', 'errand']); // the hatch is not even asked
    expect(arb.interact()).toBe('errand');
    expect(calls.at(-1)).toBe('errand!');
    expect(arb.interact()).toBeNull(); // a press with nothing offered does nothing
    const arb2 = createPromptArbiter([src('marlo', null), src('hatch', 'climb')]);
    expect(arb2.promptAt({})).toBe('climb');
    expect(arb2.interact()).toBe('hatch');
  });
});

describe('the lights and the lower rungs', () => {
  const live = (extra = {}) => {
    const sc = new THREE.Scene();
    const placed = build(sc);
    const player = { floatY: 0, halt() {}, setFloat() {}, clearFloat() {}, setCameraZoom() {}, floatRow: { floatMax: 2.2, rise: 1.2, sink: 0.6 }, cameraZoomStep: 1 };
    const life = placed.life({ scene: sc, progression: createProgression(memoryStorage()), player, visits: 1, doc: null, ...extra });
    const cat = new THREE.Group();
    const camera = new THREE.PerspectiveCamera();
    let t = 0;
    const go = () => { const o = L.HATCH.outside; cat.position.set(o.x + 1, 0, o.z); life.update(1 / 60, t, cat.position, camera, { cat }); life.promptAt(cat.position); life.interact(); for (let i = 0; i < 90; i++) { t += 1 / 60; life.update(1 / 60, t, cat.position, camera, { cat }); } };
    return { sc, life, go, cat, camera, tick: (secs) => { for (let i = 0; i < Math.round(secs * 60); i++) { t += 1 / 60; life.update(1 / 60, t, cat.position, camera, { cat }); } } };
  };
  const cells = (sc) => { const g = sc.getObjectByName('lab:glow'); return Float32Array.from(g.geometry.attributes.color.array.subarray(g.userData.led.start * 3, (g.userData.led.start + g.userData.led.verts * g.userData.led.count) * 3)); };
  it('the panel wall\'s cells blink inside (some dim, some bright, changing); under reduced motion they stand still, all lit', () => {
    const a = live();
    a.go();
    expect(a.life.lab.inside).toBe(true);
    const seen = new Set();
    for (let i = 0; i < 40; i++) { a.tick(0.2); seen.add(Array.from(cells(a.sc)).filter((_, k) => k % 3 === 0).map((v) => v.toFixed(2)).join(',')); }
    expect(seen.size).toBeGreaterThan(5);
    const now = cells(a.sc);
    expect(Math.min(...now)).toBeLessThan(Math.max(...now));
    const r = live({ reducedMotion: true });
    const before = cells(r.sc);
    r.go();
    expect(r.life.lab.inside).toBe(true);
    r.tick(5);
    expect(Array.from(cells(r.sc))).toEqual(Array.from(before)); // still
    expect(Math.min(...before)).toBeGreaterThan(0); // and every cell is lit
    // the pure rule: never all dark at once
    for (let t = 0; t < 60; t += 0.37) expect(L.PANEL_LIGHTS.some((_, i) => L.blinkLevel(i, t) === 1), `t ${t}`).toBe(true);
  });
  it('the lower rungs leave the small props out (detail) and the high rung draws them', () => {
    const hi = live({ tier: { name: 'high', rung: 0, shadows: true } }); hi.go();
    expect(hi.sc.getObjectByName('lab:detail').visible).toBe(true);
    const low = live({ tier: { name: 'low', rung: 3, shadows: true } }); low.go();
    expect(low.sc.getObjectByName('lab:detail').visible).toBe(false);
    const lite = live({ tier: { name: 'lite', rung: 4, shadows: false } }); lite.go();
    expect(lite.sc.getObjectByName('lab:detail').visible).toBe(false);
    const detail = low.sc.getObjectByName('lab:detail').geometry.attributes.position.count / 3;
    const rest = ['lab:walls', 'lab:fixtures', 'lab:glow', 'lab:glass', 'lab:roof'].reduce((n, k) => n + low.sc.getObjectByName(k).geometry.attributes.position.count / 3, 0);
    expect(detail).toBeGreaterThan(rest * 0.15); // the rung really saves something
    expect(low.sc.getObjectByName('lab:interior').visible).toBe(true);
  });
});

describe('the words, the journal and the source rules', () => {
  const BAD = /\b(dark|lost forever|trapped|stuck|collapse|cave-in|scary|Zissou|Belafonte|Aquatic|cap|beanie)\b/i;
  it('the hatch\'s three lines are in the phrase table, short, kind and the same plain base in both word sets', () => {
    for (const [id, line] of Object.entries(LINES)) {
      expect(phrase(id), id).toBe(line);
      expect(line.length).toBeLessThanOrEqual(60);
      expect(line).not.toMatch(BAD);
      withOffWords(() => { expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id)).toBe(line); });
    }
    expect(Object.keys(LINES)).toEqual(['reef.lab.down', 'reef.lab.up', 'reef.lab.in']);
  });
  it('no banned word or film name in any lab file or lab journal hint (names and words, comments aside)', () => {
    for (const f of globSync('src/world/reeflab*.js')) {
      const src = read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(src, f).not.toMatch(/Zissou|Belafonte|Aquatic|beanie|\bcap\b|lost forever|trapped|scary|cave-in|collapse/i);
    }
    for (const id of ['rflab', 'rffuses', 'rfshow', 'rfshark']) { expect(RP.REEF_PAGE_WORDS[id].hint()).not.toMatch(BAD); expect(RP.REEF_PAGE_WORDS[id].name()).not.toMatch(BAD); }
  });
  it('the journal shows the Sealab\'s four pages and keeps the galleon, map, chest, scooter and saucer out until their wings exist', () => {
    setReef(true);
    try {
      const html = renderJournalHtml({}, 0, 0);
      for (const id of ['rflab', 'rffuses', 'rfshow', 'rfshark']) expect(html, id).toContain(RP.REEF_PAGE_WORDS[id].hint());
      for (const id of ['rfgalleon', 'rfmap', 'rfcaptchest', 'rfscooter', 'rfsaucer']) expect(html, id).not.toContain(RP.REEF_PAGE_WORDS[id].hint());
      expect(RP.WING_LIVE).toEqual({ lab: true, wreck: false, scooter: false, saucer: false });
      RP.WING_LIVE.wreck = true;
      expect(renderJournalHtml({}, 0, 0)).toContain(RP.REEF_PAGE_WORDS.rfgalleon.hint());
      RP.WING_LIVE.wreck = false;
      for (const id of Object.keys(RP.WING_OF)) expect(RP.wingPageShown(id)).toBe(RP.WING_LIVE[RP.WING_OF[id]]);
      expect(RP.wingPageShown('rfseal')).toBe(true); // the older pages are never filtered
    } finally { RP.WING_LIVE.wreck = false; setReef(null); }
  });
  it('the lab chunk imports nothing of the Reef\'s plan or three (so start-up and stage A stay as they were), and only the lab files, the phrase table and the stage slot', () => {
    for (const f of globSync('src/world/reeflab*.js')) {
      for (const [, spec] of read(f).matchAll(/^import .*?from '(.+?)';/gm)) expect(spec, `${f} imports ${spec}`).toMatch(/^(\.\/reeflab[a-z]*\.js|\.\.\/clanphrases\.js|\.\/reefstages\.js)$/);
    }
    expect(read('src/world/reefstagelab.js')).toMatch(/import \{ ST \} from '\.\/reefstages\.js'/);
  });
  it('it never reads or writes the save, nothing in it draws a random number or reads a clock, and the stage registers once', () => {
    for (const f of globSync('src/world/reeflab*.js')) {
      const src = read(f).replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/Math\.random|Date\.now|performance\.now|progression|localStorage/);
    }
    const before = P.REEF_FLATS.length;
    const sc = new THREE.Scene(); build(sc); build(new THREE.Scene());
    expect(P.REEF_FLATS.length).toBe(before);
    expect(P.REEF_CLEARS.length).toBe(2);
    expect(P.REEF_CEIL_REGIONS.length).toBe(1);
  });
});
