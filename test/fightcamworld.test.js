import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The fight camera against the REAL built territories: wherever along an
// intruder's route a fight can happen, the camera it picks sees both cats
// past every tree, on a phone held either way and on a desktop.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_t, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { INTRUDER_ROUTES, routeLength, routePoint } = await import('../src/intruders.js');
const { clanWalkableFor } = await import('../src/world/clanground.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { fightReach, reachYFor, FIGHT_GAP } = await import('../src/game/clanfight.js');
const { buildCat, catDims } = await import('../src/cat/model.js');
const { clanCast } = await import('../src/clancast.js');
const { CHALLENGE_RANGE } = await import('../src/intruders.js');
const {
  findOccluders, chooseFightView, subjectPoints, liftedPoints, framePoints, firstBlocker, projectPoint, FIGHT_FRAME, OCCLUDER_PAD,
} = await import('../src/fightcam.js');

const { cameraOffset } = await import('../src/catcam.js');
const BUILD = {
  woods: (await import('../src/world/woods.js')).build,
  river: (await import('../src/world/river.js')).build,
  moor: (await import('../src/world/moor.js')).build,
  pines: (await import('../src/world/pines.js')).build,
};
const FRAMES = { portrait: { aspect: 375 / 812, fovY: 70 }, landscape: { aspect: 812 / 375, fovY: 70 }, desktop: { aspect: 1280 / 720, fovY: 70 } };
const STEP = 2;    // m along each route
const DIRS = 8;    // directions my cat can come at it from

function world(a) {
  const scene = new THREE.Scene();
  const area = BUILD[a](scene, {});
  mergeStaticProps(scene);
  return { area, occluders: findOccluders(scene), ground: clanWalkableFor(area, a) };
}

// Task 5 (fight moves and scars): a clan fight's subject in actions mode, with
// each spot's lift measured from the largest preset (mainecoon) against an
// intruder (simple, at intruders.js's 0.85). Hagrid's fights (actions off)
// keep today's subject, and are checked as before.
const intruderCat = buildCat('tabby', undefined, { simple: true, style: clanCast('woods')[3].style });
intruderCat.scale.multiplyScalar(0.85);
const REACH_Y = reachYFor(catDims(buildCat('mainecoon')), catDims(intruderCat), FIGHT_GAP);
// Each mode's pinned counts (see below). Actions mode, measured for Task 5,
// with lifted tops soft in the view choice (a controller ruling): woods hides
// 14 trees (today 12), river 9 (today 6), moor 3 (today 3), pines 1 (in 24
// views; today none); no view hides a tree with no cat under it. Every point
// that exists today passes the same hard checks on every map. Lifted tops a
// tree still hides: none in woods, river and moor; in pines 3229 tops in 300
// of its 3096 views, every one behind a stand pine's low boughs, which cannot
// be hidden (a leap or a rear-up beside them rises into them).
const MODES = {
  today: { opts: {}, maxHidden: { woods: 12, river: 6, moor: 5, pines: 0 }, maxNotUnder: { woods: 0, river: 3, moor: 4, pines: 0 }, maxBrushed: { woods: 0, river: 0, moor: 0, pines: 0 } },
  actions: {
    opts: { actions: true, reachY: REACH_Y },
    maxHidden: { woods: 14, river: 9, moor: 3, pines: 1 },
    maxNotUnder: { woods: 0, river: 0, moor: 0, pines: 0 },
    maxBrushed: { woods: 0, river: 0, moor: 0, pines: 3229 },
  },
};

// The walk-over's subject, as clanfight builds it, and the fight's.
function walkover(from, foeAt, ok, opts) {
  const dx = from.x - foeAt.x, dz = from.z - foeAt.z, d = Math.hypot(dx, dz);
  const to = { x: foeAt.x + (dx / d) * FIGHT_GAP, z: foeAt.z + (dz / d) * FIGHT_GAP };
  const sub = fightReach(to, foeAt, ok, opts);
  const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.3));
  sub.path = [{ x: from.x, z: from.z }];
  for (let j = 1; j <= n; j++) {
    const p = { x: from.x + ((to.x - from.x) * j) / n, z: from.z + ((to.z - from.z) * j) / n };
    if (!ok(p.x, p.z)) break;
    sub.path.push(p);
  }
  return { sub, to };
}

// Views that hid a tree with no cat under it (framing both cats whole left no
// clear spot); counted per map below.
let notUnder = 0;
// Lifted tops (actions mode) a tree still hides in the chosen view, and the
// views with one: soft (a controller ruling on Task 5), so counted, not failed.
let brushedTops = 0, brushedViews = 0;
function check(view, subj, w, frame, at) {
  const left = w.occluders.filter((o) => !view.blockers.includes(o));
  // every point that exists today (paws, body, head; the run) stays hard
  for (const p of subjectPoints(subj, true, false)) {
    const hit = firstBlocker(view.pos, p, left);
    expect(hit, `${at}: a tree at ${hit?.x.toFixed(1)},${hit?.z.toFixed(1)} hides ${p.x.toFixed(2)},${p.y},${p.z.toFixed(2)}`).toBe(null);
  }
  const brushed = liftedPoints(subj).filter((p) => firstBlocker(view.pos, p, left)).length;
  expect(view.brushed ?? 0, `${at}: the view's own count of hidden lifted tops`).toBe(brushed);
  brushedTops += brushed;
  if (brushed > 0) brushedViews++;
  // The last resort hides only a tree that can be hidden on its own, nearly
  // always one with a cat right under its leaves (a spot inside the tree's
  // padded solid), so no view can see past it. The few others are counted.
  let under = true;
  for (const b of view.blockers) {
    expect(b.obj, `${at}: a blocker that cannot be hidden`).not.toBe(null);
    under &&= subjectPoints(subj, true).some((p) => firstBlocker(p, { x: p.x + 1e-4, y: p.y, z: p.z }, [b]));
  }
  if (!under) notUnder++;
  for (const p of framePoints(subj)) {
    const q = projectPoint(view, p, frame.aspect, frame.fovY);
    expect(Math.abs(q.x) <= FIGHT_FRAME.x && q.y >= FIGHT_FRAME.bottom && q.y <= FIGHT_FRAME.top, `${at}: out of frame`).toBe(true);
  }
  const b = w.area.bounds;
  expect(view.pos.x > b.minX && view.pos.x < b.maxX && view.pos.z > b.minZ && view.pos.z < b.maxZ, `${at}: off the map`).toBe(true);
  for (const c of w.area.colliders) expect(Math.hypot(view.pos.x - c.x, view.pos.z - c.z), `${at}: in a collider`).toBeGreaterThan(c.r);
}

describe('the fight camera on every intruder route', () => {
  for (const [mode, { opts, maxHidden, maxNotUnder, maxBrushed }] of Object.entries(MODES)) for (const a of Object.keys(INTRUDER_ROUTES)) {
    it(`${a} (${mode}): both cats in sight past every tree, every ${STEP} m, from every side, portrait, landscape and desktop`, () => {
      const w = world(a);
      expect(w.occluders.length, `${a} has tagged trees`).toBeGreaterThan(10);
      let fights = 0, followBlocked = 0, hidViews = 0;
      notUnder = 0;
      brushedTops = 0;
      brushedViews = 0;
      const hidden = new Set();
      for (const [clan, route] of Object.entries(INTRUDER_ROUTES[a])) {
        const len = routeLength(route);
        for (let s = 0; s <= len; s += STEP) {
          const foeAt = routePoint(route, s);
          for (let k = 0; k < DIRS; k++) {
            const ang = (k / DIRS) * Math.PI * 2;
            const ux = Math.cos(ang), uz = Math.sin(ang);
            // where my cat stood at the "Fight!" tap: within the pill's range, on clan ground
            const from = { x: foeAt.x + ux * (CHALLENGE_RANGE - 0.1), z: foeAt.z + uz * (CHALLENGE_RANGE - 0.1) };
            const spot = { x: foeAt.x + ux * FIGHT_GAP, z: foeAt.z + uz * FIGHT_GAP };
            if (!w.ground(from.x, from.z) || !w.ground(spot.x, spot.z)) continue;
            const { sub } = walkover(from, foeAt, w.ground, opts);
            const fight = { ...fightReach(spot, foeAt, w.ground, opts), path: [] };
            for (const [name, frame] of Object.entries(FRAMES)) {
              const at = `${a}.${clan} s=${s} from ${k} ${name}`;
              // the follow camera behind my cat, looking at the intruder
              const yaw0 = Math.atan2(ux, uz);
              // (the shipped follow camera, for the record: how often a tree hid a cat)
              if (name === 'portrait') {
                const off = cameraOffset(yaw0, 0.18, 4.5, 2.2);
                const cam = { x: from.x + off.x, y: off.y, z: from.z + off.z };
                if (subjectPoints(fight, false).some((p) => firstBlocker(cam, p, w.occluders, 0))) followBlocked++;
              }
              const v1 = chooseFightView({ subject: sub, occluders: w.occluders, colliders: w.area.colliders, bounds: w.area.bounds, yaw0, ...frame });
              check(v1, sub, w, frame, `${at} walk-over`);
              const yaw1 = Math.atan2(v1.pos.x - fight.mid.x, v1.pos.z - fight.mid.z);
              const v2 = chooseFightView({ subject: fight, occluders: w.occluders, colliders: w.area.colliders, bounds: w.area.bounds, yaw0: yaw1, ring0: v1.ring, ...frame });
              check(v2, fight, w, frame, `${at} rounds`);
              fights++;
              for (const b of [...v1.blockers, ...v2.blockers]) hidden.add(b);
              hidViews += (v1.blockers.length ? 1 : 0) + (v2.blockers.length ? 1 : 0);
              expect(v1.unhidden ?? 0, `${at}: a stand pine left in the way`).toBe(0);
              expect(v2.unhidden ?? 0, `${at}: a stand pine left in the way`).toBe(0);
            }
          }
        }
      }
      expect(fights).toBeGreaterThan(300);
      // the problem this fixes is real on every map: the follow camera alone
      // lets a tree hide a cat somewhere along the routes
      expect(followBlocked, `${a}: follow-camera views a tree spoils`).toBeGreaterThan(0);
      process.stderr.write(`\n${a} (${mode}): ${fights} fight views; follow camera blocked in ${followBlocked} of ${fights / 3}; trees hidden ${hidden.size} in ${hidViews} views; ${notUnder} not under; lifted tops brushed ${brushedTops} in ${brushedViews} views\n`);
      // Measured, with each tree padded for the wind's furthest lean: the trees
      // whose (padded) leaves reach a cat's ears where it can stand beside the
      // trunk. Pinned so a map change that adds more is seen.
      // (Task 5: the actions subject's lifted tops reach more leaves; each
      // mode's numbers are in MODES above.)
      expect(hidden.size, `${a}: trees ever hidden`).toBeLessThanOrEqual(maxHidden[a]);
      // measured: 3 river and 4 moor walk-over views near a map edge (today)
      expect(notUnder, `${a}: views that hid a tree with no cat under it`).toBeLessThanOrEqual(maxNotUnder[a]);
      expect(brushedTops, `${a}: lifted tops left behind a tree`).toBeLessThanOrEqual(maxBrushed[a]);
    }, 120000);
  }
});
