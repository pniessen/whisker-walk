import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { closeDiffs } from './helpers/closeto.js';

// The same headless canvas stub every world test uses (see test/park.test.js
// for why getImageData and the gradients need real answers).
vi.stubGlobal('document', {
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'measureText') return () => ({ width: 0 });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { visitAt, INTRUDER_PERIOD } = await import('../src/intruders.js');
const { roamHomes, lonersFor, ROAM_RADIUS } = await import('../src/clancast.js');
const { clanWalkableFor } = await import('../src/world/clanground.js');
const { campLayout, campDiscs } = await import('../src/world/camp.js');
const { DISCS, borderMarks, patrolPath } = await import('../src/rivalclans.js');
const { STAND_ON, CLAN_STAND_ON, CAMP_DEN, WALK_SHAPES } = await import('../src/world/gorgeshape.js');
const { createStrayCats, strayStream } = await import('../src/straycats.js');
const WORLDS = {
  woods: await import('../src/world/woods.js'),
  river: await import('../src/world/river.js'),
  moor: await import('../src/world/moor.js'),
  pines: await import('../src/world/pines.js'),
  gorge: await import('../src/world/gorge.js'),
};
const built = Object.fromEntries(Object.entries(WORLDS).map(([a, w]) => [a, w.build(new THREE.Scene())]));

// Clan and member id per slot (k * 120 + 30), k 0-399, joined, then hashed.
function fingerprint(area) {
  const parts = [];
  for (let k = 0; k < 400; k++) {
    const v = visitAt(area, k * INTRUDER_PERIOD + 30);
    parts.push(v ? `${v.clan}:${v.member.id}` : '-');
  }
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

const FINGERPRINTS = {
  woods: 'ef65cdfb4ed3116c20162097ca5c7df6057293ce1039055db0c441d256c79d4d',
  river: 'f5c50834ce5296997efa10ea8c9c80b7c6880c5607d0d1f84e2eb514ba10a46c',
  pines: 'f16769070262fc4a281740d09504f87c44d8d9b1e657014bf52479db237562d8',
};

describe('Gorge part 4 pins', () => {
  it("the other territories' intruders never change", () => {
    for (const [area, want] of Object.entries(FINGERPRINTS)) {
      expect(fingerprint(area), area).toBe(want);
    }
  });

  it("the Moor's first visitor is the flat trace's, and stays so", () => {
    const first = visitAt('moor', 30);
    expect(first).not.toBeNull();
    expect(first.visit).toBe(0);
    expect(first.clan).toBe('woods');
  });
});

// The four shipped camps' roaming homes, printed from the code before part 4
// made roamHomes level-aware (K5). Flat ground skips the level check, so these
// never move.
const SHIPPED_HOMES = {
  woods: [
    { x: -12.348181430716068, z: -0.7901465077884495 },
    { x: -20.260248403064907, z: -0.9865871863439679 },
    { x: -4.714007708244026, z: -24.658496875781566 },
    { x: -4.966909203212708, z: 16.67366913286969 },
    { x: -20.19222023896873, z: -22.436312108766288 },
    { x: -10.634294638875872, z: -33.72505959356204 },
    { x: 23.0179933947511, z: 13.742845908273011 },
    { x: 32.399352388456464, z: -18.493434477131814 },
  ],
  river: [
    { x: -12.255013003014028, z: 7.243863039184362 },
    { x: 25.951439251657575, z: 30.74008323950693 },
    { x: 18.46445562550798, z: 20.26365654077381 },
    { x: 2.3328263219445944, z: -20.23858588654548 },
    { x: -25.751369514036924, z: 6.05639313114807 },
    { x: -17.58918545441702, z: -3.3331944537349045 },
    { x: 33.968298472464085, z: 11.179806592408568 },
    { x: -22.073049664031714, z: -18.69853525655344 },
  ],
  moor: [
    { x: -4.903275475371629, z: 26.01351976627484 },
    { x: -3.3390356926247478, z: -12.900933444034308 },
    { x: -5.75003246543929, z: 17.30535658309236 },
    { x: 12.65433804364875, z: 32.959561112802476 },
    { x: -2.1650122106075287, z: -27.27396885631606 },
    { x: 5.210327997338027, z: -10.876513286493719 },
    { x: 6.854474488645792, z: 6.5189017448574305 },
    { x: -27.964789676479995, z: -14.156585321761668 },
  ],
  pines: [
    { x: 12.244300378952175, z: -34.10566854523495 },
    { x: -1.7540770885534585, z: -27.18964064028114 },
    { x: -6.110230125486851, z: -10.42616501217708 },
    { x: -24.8763787583448, z: -2.0669729518704116 },
    { x: 26.558815867174417, z: -15.199039126746356 },
    { x: -12.251805316191167, z: -22.302797574084252 },
    { x: -32.22776171984151, z: 20.238679291214794 },
    { x: -12.883669226430357, z: 34.58452481776476 },
  ],
};

const inRect = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
const circle = (x, z, rad, n) => Array.from({ length: n }, (_, i) => {
  const t = (i / n) * Math.PI * 2;
  return { x: x + Math.cos(t) * rad, z: z + Math.sin(t) * rad };
});
// Cell centres (n * 0.5 + 0.25) over a box: never on a rect's edge.
const cells = (x0, x1, z0, z1) => {
  const out = [];
  for (let x = Math.floor(x0 / 0.5) * 0.5 + 0.25; x < x1; x += 0.5) {
    for (let z = Math.floor(z0 / 0.5) * 0.5 + 0.25; z < z1; z += 0.5) out.push({ x, z });
  }
  return out;
};
// CLAN_STAND_ON's own rectangles beyond the strays' ground: the legs, the
// Lookout, the turn and the Wide Ledge, and the den.
const CLAN_ONLY = CLAN_STAND_ON.slice(STAND_ON.length);

describe('CliffClan at home in the Gorge', () => {
  it("the four shipped camps' roaming homes are unchanged", () => {
    for (const a of ['woods', 'river', 'moor', 'pines']) {
      const area = built[a];
      expect(closeDiffs(roamHomes(a, area, clanWalkableFor(area, a)), SHIPPED_HOMES[a]), a).toEqual([]);
    }
  });

  it("the Gorge's homes stand on their own level", () => {
    const area = built.gorge;
    const { ground } = area;
    const ok = clanWalkableFor(area, 'gorge');
    const homes = roamHomes('gorge', area, ok);
    expect(homes).toHaveLength(8);
    for (const h of homes) {
      const at = `${h.x.toFixed(2)},${h.z.toFixed(2)}`;
      const mine = (p) => ok(p.x, p.z) && ground.sameLevel(h.x, h.z, p.x, p.z);
      expect(ok(h.x, h.z), at).toBe(true);
      for (const p of circle(h.x, h.z, 2, 8)) expect(mine(p), `${at} ring ${p.x.toFixed(2)},${p.z.toFixed(2)}`).toBe(true);
      expect(circle(h.x, h.z, ROAM_RADIUS, 16).filter(mine).length, at).toBeGreaterThanOrEqual(12);
      for (const r of CLAN_ONLY) expect(inRect(r, h.x, h.z), `${at} on ${JSON.stringify(r)}`).toBe(false);
    }
  });

  it('the camp is one flat level', () => {
    const area = built.gorge;
    const { ground } = area;
    const L = campLayout('gorge');
    const { cx, cz, r } = DISCS.gorge;
    const spots = [
      L.seats.leader, L.seats.deputy, ...L.seats.elders, ...L.seats.kits, L.rock, L.den,
      ...borderMarks('gorge'), ...patrolPath('gorge'),
      ...cells(cx - r, cx + r, cz - r, cz + r).filter((p) => Math.hypot(p.x - cx, p.z - cz) <= r),
      ...cells(CAMP_DEN.minX, CAMP_DEN.maxX, CAMP_DEN.minZ, CAMP_DEN.maxZ),
    ];
    expect(spots.length).toBeGreaterThan(400);
    const g = { x: 0, z: 0 };
    const bad = [];
    for (const p of spots) {
      if (ground.y(p.x, p.z) !== 8) bad.push(`y ${ground.y(p.x, p.z)} at ${p.x},${p.z}`);
      ground.gradient(p.x, p.z, g);
      if (g.x !== 0 || g.z !== 0) bad.push(`gradient at ${p.x},${p.z}`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
    // no lip reaches into the disc
    for (const s of WALK_SHAPES.filter((w) => w.kind === 'lip')) {
      const nx = Math.max(s.minX, Math.min(cx, s.maxX));
      const nz = Math.max(s.minZ, Math.min(cz, s.maxZ));
      expect(Math.hypot(nx - cx, nz - cz), s.tag).toBeGreaterThan(r);
    }
  });

  it("a Gorge walk's strays: the clan takes their slots, the Snug Cave keeps its cat", () => {
    expect(lonersFor('gorge', 22, 0)).toBe(5);
    expect(lonersFor('gorge', 14, 0)).toBe(4);
    const area = built.gorge;
    const [snug] = area.strayHomes;
    const ledgeAndDen = CLAN_ONLY;
    const onStand = (x, z) => STAND_ON.some((r) => x >= r.minX - 1e-9 && x <= r.maxX + 1e-9 && z >= r.minZ - 1e-9 && z <= r.maxZ + 1e-9);
    const far = new THREE.Vector3(999, 0, 999);
    for (const tier of [22, 14]) {
      const count = lonersFor('gorge', tier, 0);
      const cats = createStrayCats(new THREE.Scene(), area, count, strayStream(7), {
        roomSeed: 7, homes: area.strayHomes, colonyAvoid: campDiscs('gorge'), ground: area.ground,
      });
      expect(cats.strays).toHaveLength(count);
      // with no fed colony cats, the first ordinary stray lives in the Snug Cave
      const first = cats.strays[0];
      expect(first.roam, `tier ${tier}`).toBe(snug.roam);
      expect(Math.hypot(first.group.position.x - snug.x, first.group.position.z - snug.z)).toBeLessThanOrEqual(snug.roam);
      const bad = [];
      for (let f = 0; f < 600; f++) {
        cats.update(1 / 30, f / 30, far, { stalking: false, catSpeed: 0, toy: null });
        for (const [i, s] of cats.strays.entries()) {
          if (i === 0) continue;
          const { x, z } = s.group.position;
          if (!onStand(x, z)) bad.push(`tier ${tier} stray ${i} f${f} off STAND_ON (${x.toFixed(2)}, ${z.toFixed(2)})`);
          for (const r of ledgeAndDen) if (x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) bad.push(`tier ${tier} stray ${i} f${f} in the clan's ground`);
        }
      }
      expect(bad.slice(0, 10)).toEqual([]);
    }
  });
});

// K10/K11: GaleClan's way through the Gorge, and the fights it can start.
const { INTRUDER_ROUTES, intruderAt, isHostile, routeLength, routePoint, CHALLENGE_KEEP } = await import('../src/intruders.js');
const { GORGE_CAVES, GORGE_DENS } = await import('../src/world/gorgeshape.js');
const { fightReach, reachYFor, FIGHT_GAP } = await import('../src/game/clanfight.js');
const { findOccluders, chooseFightView, subjectPoints, liftedPoints } = await import('../src/fightcam.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { CAM_ROCK_CLEAR, CAM_CEIL_CLEAR } = await import('../src/camzoom.js');
const { buildCat, catDims } = await import('../src/cat/model.js');
const { clanCast } = await import('../src/clancast.js');

// Every 0.5 m along a route, both ends included.
const routeSamples = (route) => {
  const out = [];
  for (let i = 0; i + 1 < route.length; i++) {
    const p = route[i], q = route[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / 0.5));
    for (let j = 0; j <= n; j++) out.push({ x: p.x + ((q.x - p.x) * j) / n, z: p.z + ((q.z - p.z) * j) / n });
  }
  return out;
};
const rectGap = (r, x, z) => Math.hypot(Math.max(r.minX - x, 0, x - r.maxX), Math.max(r.minZ - z, 0, z - r.maxZ));

describe("GaleClan's way through the Gorge", () => {
  it("the Gorge's route is on flat floor, wide of the path, the caves and the dens", () => {
    const area = built.gorge;
    const { ground } = area;
    const ok = clanWalkableFor(area, 'gorge');
    const samples = routeSamples(INTRUDER_ROUTES.gorge.moor);
    const g = { x: 0, z: 0 };
    const bad = [];
    const flat = (p, what) => {
      if (ground.y(p.x, p.z) !== 0) bad.push(`${what} y ${ground.y(p.x, p.z)} at ${p.x},${p.z}`);
      ground.gradient(p.x, p.z, g);
      if (g.x !== 0 || g.z !== 0) bad.push(`${what} gradient at ${p.x},${p.z}`);
    };
    for (const p of samples) {
      flat(p, 'route');
      for (const s of WALK_SHAPES) if (rectGap(s, p.x, p.z) < 12) bad.push(`route ${p.x},${p.z} ${rectGap(s, p.x, p.z).toFixed(2)} m from ${s.tag}`);
      for (const r of [...GORGE_CAVES.flatMap((c) => c.rects), ...GORGE_DENS, CAMP_DEN]) {
        if (rectGap(r, p.x, p.z) < 2) bad.push(`route ${p.x},${p.z} ${rectGap(r, p.x, p.z).toFixed(2)} m from ${r.tag}`);
      }
    }
    // every point of clan ground a challenge can stand on (within CHALLENGE_KEEP of the route)
    let near = 0;
    for (const p of cells(-50, 50, -50, 50)) {
      if (!ok(p.x, p.z) || !samples.some((q) => Math.hypot(q.x - p.x, q.z - p.z) <= CHALLENGE_KEEP)) continue;
      near++;
      flat(p, 'near');
    }
    expect(near).toBeGreaterThan(1000);
    expect(bad.slice(0, 10)).toEqual([]);
  });

  // fightcamworld.test.js runs every route on flat ground (no `ground`): this
  // is the Gorge's own rock check, with the real ground.
  it("a fight on the Gorge's route stands on flat floor and its camera stays out of rock", () => {
    const scene = new THREE.Scene();
    const area = WORLDS.gorge.build(scene, {});
    mergeStaticProps(scene);
    const occluders = findOccluders(scene);
    const { ground } = area;
    const ok = clanWalkableFor(area, 'gorge');
    const intruderCat = buildCat('tabby', undefined, { simple: true, style: clanCast('moor')[4].style });
    intruderCat.scale.multiplyScalar(0.85);
    const reachY = reachYFor(catDims(buildCat('mainecoon')), catDims(intruderCat), FIGHT_GAP);
    const FRAMES = [{ aspect: 375 / 812, fovY: 70 }, { aspect: 1280 / 720, fovY: 70 }];
    const route = INTRUDER_ROUTES.gorge.moor;
    const len = routeLength(route);
    const bad = [];
    let fights = 0;
    for (let s = 0; s <= len; s += 2) {
      const foeAt = routePoint(route, s);
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        const ux = Math.cos(ang), uz = Math.sin(ang);
        const spot = { x: foeAt.x + ux * FIGHT_GAP, z: foeAt.z + uz * FIGHT_GAP };
        if (!ok(spot.x, spot.z)) continue;
        const fight = { ...fightReach(spot, { x: foeAt.x, z: foeAt.z }, ok, { actions: true, reachY, terrain: ground }), path: [] };
        const at = `s=${s} from ${k}`;
        for (const p of [...fight.me, ...fight.it]) if (ground.y(p.x, p.z) !== 0) bad.push(`${at}: staged at y ${ground.y(p.x, p.z)} (${p.x},${p.z})`);
        expect(subjectPoints(fight, false).length + liftedPoints(fight).length).toBeGreaterThan(0);
        for (const frame of FRAMES) {
          const v = chooseFightView({ subject: fight, occluders, colliders: area.colliders, bounds: area.bounds, yaw0: Math.atan2(-ux, -uz), ground, ...frame });
          const { x, y, z } = v.pos;
          if (y < ground.y(x, z) + CAM_ROCK_CLEAR) bad.push(`${at}: camera ${y.toFixed(2)} in rock ${ground.y(x, z)} at ${x.toFixed(1)},${z.toFixed(1)}`);
          if (y > ground.ceil(x, z) - CAM_CEIL_CLEAR) bad.push(`${at}: camera ${y.toFixed(2)} over a ceiling at ${x.toFixed(1)},${z.toFixed(1)}`);
          fights++;
        }
      }
    }
    expect(fights).toBeGreaterThan(300);
    expect(bad.slice(0, 10)).toEqual([]);
  }, 180_000);

  it('sisters in CliffClan and GaleClan: same visitor, never hostile to either', () => {
    let gale = null, cliff = null;
    for (let k = 0; k < 400; k++) {
      const t = k * INTRUDER_PERIOD + 30;
      for (const a of ['gorge', 'moor']) {
        expect(intruderAt(a, t), `${a} ${k}`).toEqual(intruderAt(a, t));
        const v = visitAt(a, t);
        if (!v) continue;
        // the Gorge's visitors are all GaleClan; the Moor's StormClan and
        // Pines visitors are still rivals to a CliffClan-GaleClan pair
        if (a === 'gorge') expect(v.clan).toBe('moor');
        if (v.clan === 'gorge' || v.clan === 'moor') expect(isHostile(v, { clanHome: true, picks: ['gorge', 'moor'] }), `${a} ${k}`).toBe(false);
        else expect(isHostile(v, { clanHome: true, picks: ['gorge', 'moor'] }), `${a} ${k}`).toBe(true);
        if (a === 'gorge' && v.clan === 'moor') gale ??= v;
        if (a === 'moor' && v.clan === 'gorge') cliff ??= v;
      }
    }
    expect(gale).not.toBeNull();
    expect(cliff).not.toBeNull();
    expect(isHostile(gale, { clanHome: true, picks: ['gorge'] })).toBe(true);
    expect(isHostile(cliff, { clanHome: true, picks: ['moor'] })).toBe(true);
  });
});
