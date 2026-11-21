import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';
import { bodySamples, gapsFor, CATS } from './helpers/bodygap.js';

vi.stubGlobal('document', canvasStub);

const { createPlayer, CAT_RADIUS } = await import('../src/player.js');
const { buildCat } = await import('../src/cat/model.js');
const { animateCat } = await import('../src/cat/animator.js');
const { createCritters } = await import('../src/critters.js');
const { createPeopleKit, spotKind, personFor, pairFor, bumpCircles, BUMP } = await import('../src/people/index.js');
const { buildSpot } = await import('../src/people/figure.js');
const { pose, applyPose, kneelSpots } = await import('../src/people/pose.js');
const { createGaze, stepGaze } = await import('../src/people/gaze.js');
const { REACH, headTopOffset, catVolumes, createScratch, stepScratch, palmPoint } = await import('../src/people/reach.js');
const { createRemoteCats } = await import('../src/remotecats.js');
const { mulberry32 } = await import('../src/rng.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { FIND_SPOTS } = await import('../src/foundwear/spots/index.js');
const { yarnSpotsFor } = await import('../src/propsets.js');

// The soft bumps (lifelike people, Task 11, owner's decision 4: "the cat steps
// round people"; rulings R28-R30): each person is a fixed set of circles she
// slides round, as she does a post or a bench. Her middle stays r + CAT_RADIUS
// from each, her head's middle r + her head's radius, her body's two ends
// r + her body's radius; so her head and body never go into a person,
// standing or kneeling, and the hand still reaches her head.

const DT = 1 / 60;
const scene = { add() {}, remove() {} };
const material = new THREE.MeshStandardMaterial({ vertexColors: true });
const UP = new THREE.Vector3(0, 1, 0);

function walker(x, z, breed = 'tabby', head = null) {
  const camera = new THREE.PerspectiveCamera();
  const player = createPlayer(camera, { addEventListener() {} });
  const cat = buildCat(breed, head ? { head } : undefined);
  cat.position.set(x, 0, z);
  player.setAvatar(cat, 3);
  player.enable();
  return { player, cat, t: 0 };
}

// One frame as the walk runs it: the player moves her, her pose is drawn,
// and the render brings her matrices up to date.
function step(w, bumps, anim = 'follow') {
  w.t += DT;
  w.player.update(DT, [], null, [], bumps);
  animateCat(w.cat, anim, w.t, anim === 'follow' || anim === 'stalk' ? 1 : 0, false);
  w.cat.updateMatrixWorld(true);
}

// Pushes her straight ahead (up the map: -z) for `frames` frames.
function walkAhead(w, frames, bumps) {
  w.player.setTouchMove({ x: 0, z: -1, mag: 1 });
  for (let i = 0; i < frames; i++) step(w, bumps);
}
// Walks her straight ahead until something stops her (or 4 s), then lets go.
function walkToContact(w, bumps) {
  w.player.setTouchMove({ x: 0, z: -1, mag: 1 });
  let still = 0;
  for (let i = 0; i < 240 && still < 3; i++) {
    const z = w.cat.position.z;
    step(w, bumps);
    still = Math.abs(w.cat.position.z - z) < 0.002 ? still + 1 : 0;
  }
  w.player.setTouchMove(null);
}

function spotOf(kind, z = 6) {
  for (let x = 0; x < 400; x++) if (spotKind({ x, z }) === kind) return { x, z };
  throw new Error('no spot');
}

function town(defs) {
  return createCritters(scene, defs, {
    people: createPeopleKit, rng: mulberry32(7), motionRng: mulberry32(11),
  });
}

// a person's circles at the origin (the figure faces -z)
const circlesAt = (look) => bumpCircles(look).map((b) => ({ ...b }));

describe('the soft bumps', () => {
  it('slides round: a cat driven at a circle ends r + CAT_RADIUS or more from it, and past it', () => {
    const bumps = [{ x: 0, z: -5, r: 0.22 }];
    const w = walker(0.1, 0);
    let nearest = Infinity;
    w.player.setTouchMove({ x: 0, z: -1, mag: 1 });
    for (let i = 0; i < 600; i++) {
      step(w, bumps);
      nearest = Math.min(nearest, Math.hypot(w.cat.position.x, w.cat.position.z + 5));
    }
    expect(nearest).toBeGreaterThanOrEqual(0.22 + CAT_RADIUS - 1e-6);
    expect(w.cat.position.z).toBeLessThan(-6); // slid round and on
  });

  it('her head is kept out too: walked head-first at a circle, her head\'s middle stays r + its radius from it', () => {
    for (const breed of CATS) {
      const bumps = [{ x: 0, z: -4, r: 0.2 }];
      const w = walker(0, -2, breed);
      w.cat.updateMatrixWorld(true);
      const hr = catVolumes(w.cat).headFlat;
      walkToContact(w, bumps);
      expect(w.cat.position.z, breed).toBeGreaterThan(-4); // stopped in front of it
      const head = catVolumes(w.cat).head.center;
      expect(Math.hypot(head.x, head.z + 4), breed).toBeGreaterThanOrEqual(0.2 + hr - 0.01);
      // and it is her head, not her middle, that stops her
      expect(Math.hypot(w.cat.position.x, w.cat.position.z + 4), breed).toBeGreaterThan(0.2 + CAT_RADIUS + 0.05);
    }
  });

  it('her own move of her head into a circle slides her out: a stalk carries her head forward and she gives way', () => {
    const bumps = [{ x: 0, z: -4, r: 0.2 }];
    const w = walker(0, -2, 'tabby');
    walkToContact(w, bumps);
    for (let i = 0; i < 30; i++) step(w, bumps);
    const before = w.cat.position.z;
    // she drops into a stalk where she stands: her head goes forward
    for (let i = 0; i < 30; i++) step(w, bumps, 'stalk');
    const hr = catVolumes(w.cat).headFlat;
    const head = catVolumes(w.cat).head.center;
    expect(w.cat.position.z).toBeGreaterThan(before + 0.03); // slid back
    expect(Math.hypot(head.x, head.z + 4)).toBeGreaterThanOrEqual(0.2 + hr - 0.01);
  });

  it('with no bumps she walks through where a person would stand (the default)', () => {
    const w = walker(0.1, 0);
    w.player.setTouchMove({ x: 0, z: -1, mag: 1 });
    for (let i = 0; i < 600; i++) w.player.update(DT, [], null, []);
    expect(w.cat.position.z).toBeLessThan(-6);
  });

  it('perched exempt: a perched cat is not pushed', () => {
    const bumps = [{ x: 0, z: -3, r: 0.22 }];
    const w = walker(0.1, 0);
    w.player.perchY = 0.6;
    let nearest = Infinity;
    w.player.setTouchMove({ x: 0, z: -1, mag: 1 });
    for (let i = 0; i < 300; i++) {
      step(w, bumps);
      nearest = Math.min(nearest, Math.hypot(w.cat.position.x - 0, w.cat.position.z + 3));
    }
    expect(nearest).toBeLessThan(0.22 + CAT_RADIUS - 0.2);
  });

  it('remote cats are not pushed: a co-walker is placed by her own device', () => {
    const remotes = createRemoteCats(new THREE.Scene(), {});
    remotes.upsert({ playerId: 'r1', petName: 'Juniper', breed: 'tabby', accessories: {} }, 0);
    const at = [2, -3];
    let t = 0;
    for (let i = 0; i < 120; i++) {
      t += DT;
      if (i % 8 === 0) remotes.applyState({ id: 'r1', pos: at, yaw: 0, pose: 'follow', speed: 0.6 }, t);
      remotes.update(DT, t, []);
    }
    // (nothing hands her a bump list: the only caller of the push is player.update)
    expect(Math.hypot(remotes.list[0].group.position.x - at[0], remotes.list[0].group.position.z - at[1])).toBeLessThan(0.05);
  });

  it('allocates nothing per frame in the push', () => {
    const bumps = [{ x: 0, z: -2, r: 0.22 }, { x: 0.4, z: -2.2, r: 0.1 }];
    const w = walker(0.05, 0);
    walkAhead(w, 20, bumps); // (her head and body measured once, here)
    const spies = [vi.spyOn(THREE.Vector3.prototype, 'clone'), vi.spyOn(THREE.Box3.prototype, 'clone')];
    walkAhead(w, 100, bumps);
    for (const s of spies) { expect(s).not.toHaveBeenCalled(); s.mockRestore(); }
  });
});

describe('the circles of a person', () => {
  it('a grown-up has three: the body (a little behind their middle), the kneel\'s raised knee and its back foot, each from their own size', () => {
    for (const def of [{ x: 3, z: 7, kind: 'adult', sex: 'm', height: 1.85, girth: 1.08 }, { x: 5, z: 7, kind: 'adult', sex: 'f', height: 1.6, girth: 0.94 }]) {
      const look = personFor(def);
      const c = bumpCircles(look);
      const k = kneelSpots(look);
      expect(c).toHaveLength(3);
      expect(c[0]).toEqual({ x: 0, z: BUMP.BACK * look.dims.s, r: BUMP.BODY * (look.dims.s * look.girth) });
      expect(c[1]).toEqual({ x: k.kneeX, z: k.kneeZ, r: BUMP.KNEE * (look.dims.s * look.girth) });
      expect(c[2]).toEqual({ x: k.footX, z: k.footZ, r: BUMP.FOOT * (look.dims.s * look.girth) });
      // the knee out to the front-left, the foot behind
      expect(k.kneeX).toBeLessThan(-0.2);
      expect(k.kneeZ).toBeLessThan(-0.2);
      expect(k.footZ).toBeGreaterThan(0.3);
    }
  });

  it('older people and children (who never kneel for the scratch) have the body\'s only', () => {
    const older = personFor({ x: 1, z: 7, kind: 'older' });
    expect(bumpCircles(older)).toEqual([{ x: 0, z: BUMP.BACK * older.dims.s, r: BUMP.OLDER * (older.dims.s * older.girth) }]);
    const child = pairFor({ x: 1, z: 7, kind: 'child' }).child;
    expect(bumpCircles(child)).toEqual([{ x: 0, z: BUMP.BACK * child.dims.s, r: BUMP.CHILD * (child.dims.s * child.girth) }]);
  });

  it('the bump list: every person\'s circles, placed at the figure\'s world spot', () => {
    const adult = spotOf('adult');
    const child = spotOf('child');
    const c = town([{ type: 'villager', ...adult }, { type: 'villager', ...child }]);
    c.list.forEach((v) => v.group.updateMatrixWorld(true));
    const want = [];
    for (const v of c.list) {
      for (const p of v.people) {
        const at = p.figure.getWorldPosition(new THREE.Vector3());
        for (const b of bumpCircles(p.look)) want.push({ x: at.x + b.x, z: at.z + b.z, r: b.r });
      }
    }
    expect(c.bumps).toHaveLength(want.length);
    expect(c.bumps.length).toBe(3 + 3 + 1); // two grown-ups and a child
    c.bumps.forEach((b, i) => {
      expect(b.x).toBeCloseTo(want[i].x, 6);
      expect(b.z).toBeCloseTo(want[i].z, 6);
      expect(b.r).toBeCloseTo(want[i].r, 9);
    });
  });

  it('is empty with the switch off (today\'s figure keeps today\'s world)', () => {
    const adult = spotOf('adult');
    const c = createCritters(scene, [{ type: 'villager', ...adult }], { rng: mulberry32(7), motionRng: mulberry32(11) });
    expect(c.bumps).toEqual([]);
  });

  it('is empty where there are no people (birds, squirrels)', () => {
    const c = town([{ type: 'bird', x: 1, z: 1 }, { type: 'squirrel', x: 3, z: 3, x2: 6, z2: 3 }]);
    expect(c.bumps).toEqual([]);
  });

  it('is fixed: nothing moves or grows while she is near, kneeling included', () => {
    const adult = spotOf('adult');
    const c = town([{ type: 'villager', ...adult }]);
    const before = JSON.stringify(c.bumps);
    const refs = c.bumps.slice();
    const cat = buildCat('tabby');
    cat.position.set(adult.x, 0, adult.z - 1);
    let t = 0;
    for (let i = 0; i < 400; i++) {
      t += DT;
      cat.updateMatrixWorld(true);
      c.update(DT, t, cat.position, cat.position, cat);
    }
    c.bumps.forEach((b, i) => expect(b).toBe(refs[i]));
    expect(JSON.stringify(c.bumps)).toBe(before);
  });
});

// How far from a circle's middle her middle can be pushed: the largest of
// her points' reaches (her middle's CAT_RADIUS; her head's and her body's
// ends' distance from her middle plus their radius), over the preset cats.
function catReach() {
  let most = CAT_RADIUS;
  for (const breed of CATS) {
    const cat = buildCat(breed);
    animateCat(cat, 'follow', 0.5, 0, false);
    cat.updateMatrixWorld(true);
    const v = catVolumes(cat);
    const p = cat.position;
    most = Math.max(most,
      Math.hypot(v.head.center.x - p.x, v.head.center.z - p.z) + v.headFlat,
      Math.hypot(v.body.a.x - p.x, v.body.a.z - p.z) + v.body.r,
      Math.hypot(v.body.b.x - p.x, v.body.b.z - p.z) + v.body.r);
  }
  return most;
}

describe('placements clear of people', () => {
  // Every place a cat must reach in the four street places is at least each
  // circle's reach (its r plus her points' reach) plus 0.1 m from it.
  const REACH_CAT = catReach();
  for (const areaId of ['neighborhood', 'park', 'docks', 'seaside']) {
    it(`${areaId}: gold mice, finds, yarn, scenics, pois and the spawn`, async () => {
      const world = await import(`../src/world/${areaId}.js`);
      const area = world.build(new THREE.Scene());
      const c = town(area.critterSpawns.filter((s) => s.type === 'villager').map((s) => ({ ...s })));
      expect(c.bumps.length).toBeGreaterThan(0);
      const spots = [
        ...(GOLD_MICE[areaId] ?? []).map((m) => ['gold', m]),
        ...(FIND_SPOTS[areaId] ?? []).map((m) => ['find', m]),
        ...yarnSpotsFor(areaId).map((m) => ['yarn', m]),
        ...(area.collectibles ?? []).map((m) => ['collectible', m]),
        ...(area.scenics ?? []).map((m) => ['scenic', m]),
        ...(area.pois ?? []).map((m) => ['poi', m]),
        ['spawn', area.spawn],
      ];
      const near = [];
      for (const [what, s] of spots) {
        for (const b of c.bumps) {
          const d = Math.hypot(s.x - b.x, s.z - b.z);
          if (d < b.r + REACH_CAT + 0.1) near.push(`${what} ${s.id ?? ''} (${s.x}, ${s.z}) is ${d.toFixed(2)} m from a circle (r ${b.r.toFixed(2)}) at (${b.x.toFixed(2)}, ${b.z.toFixed(2)})`);
        }
      }
      expect(near).toEqual([]);
    }, 60000);
  }
});

// The largest and the smallest of each kind, in the clothes that stand out
// most (a coat over a skirt): the guarantee for every person between.
const PEOPLE = [
  ['a big man', { x: 0, z: 7, kind: 'adult', sex: 'm', height: 1.85, girth: 1.08, top: { kind: 'coat', color: 0 }, bottom: { kind: 'skirt', color: 0 } }, 0, ['stand', 'kneel']],
  ['a small woman', { x: 0, z: 7, kind: 'adult', sex: 'f', height: 1.6, girth: 0.94, top: { kind: 'dress', color: 0 } }, 0, ['stand', 'kneel']],
  ['a big older man', { x: 0, z: 7, kind: 'older', sex: 'm', height: 1.78, girth: 1.08, top: { kind: 'coat', color: 0 }, bottom: { kind: 'skirt', color: 0 } }, 0, ['stand', 'bow']],
  ['a big child', { x: 0, z: 7, kind: 'child', sex: 'm', height: 1.42, girth: 1.08, top: { kind: 'coat', color: 0 }, bottom: { kind: 'skirt', color: 0 } }, 1, ['stand']],
];

describe('her head stays out (ruling R28)', () => {
  // Every preset cat driven at the person from 8 sides, straight at them and
  // 45 degrees either way: all the way in and round, her head sphere and her
  // body capsule stay 0.005 m outside the person's body (arms left out: the
  // head scratch keeps those clear by its own rule), standing and kneeling
  // (an older person bows).
  for (const [who, def, which, modes] of PEOPLE) {
    it(`${who}: 5 cats, 8 sides, 3 headings`, () => {
      const look = buildSpot(def, { material }).people[which].look;
      const bumps = circlesAt(look);
      const samples = modes.map((m) => bodySamples(def, m === 'bow' ? 'kneel' : m, which));
      let worst = Infinity;
      let at = '';
      for (const breed of CATS) {
        for (let side = 0; side < 8; side++) {
          for (const heading of [0, Math.PI / 4, -Math.PI / 4]) {
            const th = (side * Math.PI) / 4;
            const w = walker(2.2 * Math.sin(th), -2.2 * Math.cos(th), breed);
            const dir = th + Math.PI + heading; // toward the person, turned
            w.player.setTouchMove({ x: Math.sin(dir), z: -Math.cos(dir), mag: 1 });
            for (let i = 0; i < 150; i++) {
              step(w, bumps);
              if (i % 3 || Math.hypot(w.cat.position.x, w.cat.position.z) > 1.4) continue;
              for (const s of samples) {
                const g = gapsFor(s, w.cat);
                const m = Math.min(g.head, g.body);
                if (m < worst) { worst = m; at = `${breed} side ${side * 45} heading ${Math.round(heading * 180 / Math.PI)} frame ${i}`; }
              }
            }
          }
        }
      }
      expect(worst, at).toBeGreaterThanOrEqual(0.005);
    }, 90000);
  }
});

// Walks her straight at the person's middle from `side` (rad round them, 0 =
// in front, + to their right) until the bump stops her, then she sits and
// the person, who stood looking at her, is told to kneel (a fresh scratch).
// Returns the seconds to the touch from that word, or Infinity.
const TOUCH_BY = 2.4;
function touchFrom(def, breed, side, head = null) {
  const { people } = buildSpot(def, { material });
  const p = people[0];
  const group = new THREE.Group();
  group.add(p.figure);
  group.updateMatrixWorld(true);
  const bumps = circlesAt(p.look);
  const gaze = createGaze(p.look);
  const w = walker(2.5 * Math.sin(side), -2.5 * Math.cos(side), breed, head);
  const top = new THREE.Vector3();
  const headTop = () => w.cat.userData.parts.head.getWorldPosition(top).addScaledVector(UP, headTopOffset(w.cat));
  let t = 0;
  const stand = () => { t += DT; pose(p, { mode: 'stand', t }); applyPose(p, DT); stepGaze(p, gaze, DT, t, { target: headTop() }); };
  // (she lets go as the bump stops her: her way in slows to under a third)
  w.player.setTouchMove({ x: -Math.sin(side), z: Math.cos(side), mag: 1 });
  let most = 0;
  for (let i = 0; i < 300; i++) {
    const was = Math.hypot(w.cat.position.x, w.cat.position.z);
    step(w, bumps);
    stand();
    const inBy = was - Math.hypot(w.cat.position.x, w.cat.position.z);
    most = Math.max(most, inBy);
    if (2.5 - Math.hypot(w.cat.position.x, w.cat.position.z) > 0.5 && inBy < most / 3) break;
  }
  w.player.setTouchMove(null);
  for (let i = 0; i < 60; i++) { step(w, bumps, 'requestPet'); stand(); }
  const sc = createScratch();
  let vol;
  const palm = new THREE.Vector3();
  for (let i = 1; i <= Math.ceil(TOUCH_BY * 60) + 6; i++) {
    step(w, bumps, 'requestPet');
    t += DT;
    pose(p, { mode: 'kneel', t });
    applyPose(p, DT);
    stepGaze(p, gaze, DT, t, { target: headTop() });
    vol = catVolumes(w.cat, vol);
    const s = stepScratch(p, sc, DT, { headTop: headTop(), volumes: vol });
    palmPoint(p, palm);
    if (s === 'resting' && palm.distanceTo(headTop().addScaledVector(UP, REACH.CLEAR)) < 0.02) return i * DT;
  }
  return Infinity;
}

describe('still touched (rulings R29, R30)', () => {
  // A tabby and a siamese walked straight at a man, a woman and an older
  // person, stopped where the bump stops them: the hand rests on her head
  // within 2.4 s of the word to kneel. (From 45 degrees either side the
  // times are in the Task 11 fix 1c report, with the approaches held out:
  // toward a grown-up's raised knee, whose circle holds her about 1.1 m out,
  // and others the hand cannot reach from where she stands.)
  for (const [who, kind, over] of [['a man', 'adult', { sex: 'm' }], ['a woman', 'adult', { sex: 'f' }], ['an older person', 'older', {}]]) {
    it(`${who}: a tabby and a siamese, head-on`, () => {
      const def = { ...spotOf(kind, 7), ...over };
      for (const breed of ['tabby', 'siamese']) expect(touchFrom(def, breed, 0), breed).toBeLessThanOrEqual(TOUCH_BY);
    }, 90000);
  }

  // in the tallest hats too (fix round 1): a hat makes her head no wider, so
  // the bump stops her where it stops her bare, and the hand rests on the hat
  for (const [who, over] of [['a man', { sex: 'm' }], ['a woman', { sex: 'f' }]]) {
    it(`${who}: a tabby and a siamese in a top hat, a wizard hat and a candle hat, head-on`, () => {
      const def = { ...spotOf('adult', 7), ...over };
      for (const breed of ['tabby', 'siamese']) {
        for (const head of ['tophat', 'wizard', 'candlehat']) expect(touchFrom(def, breed, 0, head), `${breed} ${head}`).toBeLessThanOrEqual(TOUCH_BY);
      }
    }, 90000);
  }
});
