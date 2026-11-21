import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';
import { bodySamples, gapAt, spotsOfKind } from './helpers/bodygap.js';
import { vi } from 'vitest';

vi.stubGlobal('document', canvasStub);

const { createPlayer, CAT_RADIUS } = await import('../src/player.js');
const { buildCat } = await import('../src/cat/model.js');
const { createCritters, BUMP_ADULT, BUMP_CHILD } = await import('../src/critters.js');
const { createPeopleKit, spotKind } = await import('../src/people/index.js');
const { createRemoteCats } = await import('../src/remotecats.js');
const { mulberry32 } = await import('../src/rng.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { FIND_SPOTS } = await import('../src/foundwear/spots/index.js');
const { yarnSpotsFor } = await import('../src/propsets.js');

// The soft bumps (lifelike people, Task 11, owner's decision 4: "the cat steps
// round people"): each person is a small circle she slides round, as she does a
// post or a bench; her middle stays at least bump + CAT_RADIUS from theirs.

const DT = 1 / 60;
const scene = { add() {}, remove() {} };

function walker(x, z) {
  const camera = new THREE.PerspectiveCamera();
  const player = createPlayer(camera, { addEventListener() {} });
  const cat = buildCat('tabby');
  cat.position.set(x, 0, z);
  player.setAvatar(cat, 3);
  player.enable();
  return { player, cat };
}

// Pushes her straight ahead (up the map: -z) for `frames` frames.
function walkAhead(w, frames, bumps) {
  w.player.setTouchMove({ x: 0, z: -1, mag: 1 });
  for (let i = 0; i < frames; i++) w.player.update(DT, [], null, [], bumps);
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

describe('the soft bumps', () => {
  it('slides round: a cat driven at a person ends 0.57 m or more from their middle, and past them', () => {
    const bumps = [{ x: 0, z: -5, r: BUMP_ADULT }];
    const w = walker(0.1, 0);
    let nearest = Infinity;
    w.player.setTouchMove({ x: 0, z: -1, mag: 1 });
    for (let i = 0; i < 600; i++) {
      w.player.update(DT, [], null, [], bumps);
      nearest = Math.min(nearest, Math.hypot(w.cat.position.x, w.cat.position.z + 5));
    }
    expect(nearest).toBeGreaterThanOrEqual(BUMP_ADULT + CAT_RADIUS - 1e-6);
    expect(w.cat.position.z).toBeLessThan(-6); // slid round and on
  });

  it('a child is a smaller circle: 0.53 m', () => {
    const bumps = [{ x: 0, z: -5, r: BUMP_CHILD }];
    const w = walker(0.05, 0);
    let nearest = Infinity;
    w.player.setTouchMove({ x: 0, z: -1, mag: 1 });
    for (let i = 0; i < 600; i++) {
      w.player.update(DT, [], null, [], bumps);
      nearest = Math.min(nearest, Math.hypot(w.cat.position.x, w.cat.position.z + 5));
    }
    expect(nearest).toBeGreaterThanOrEqual(0.53 - 1e-6);
    expect(nearest).toBeLessThan(0.57);
  });

  it('with no bumps she walks through where a person would stand (the default)', () => {
    const w = walker(0.1, 0);
    walkAhead(w, 600);
    expect(w.cat.position.z).toBeLessThan(-6);
  });

  it('perched exempt: a perched cat is not pushed', () => {
    const bumps = [{ x: 0, z: -3, r: BUMP_ADULT }];
    const w = walker(0.1, 0);
    w.player.perchY = 0.6;
    let nearest = Infinity;
    w.player.setTouchMove({ x: 0, z: -1, mag: 1 });
    for (let i = 0; i < 300; i++) {
      w.player.update(DT, [], null, [], bumps);
      nearest = Math.min(nearest, Math.hypot(w.cat.position.x - 0, w.cat.position.z + 3));
    }
    expect(nearest).toBeLessThan(BUMP_ADULT + CAT_RADIUS - 0.2);
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
});

describe('the bump list', () => {
  it('has one circle per person, a pair\'s child 0.18, from the figure\'s world spot', () => {
    const adult = spotOf('adult');
    const child = spotOf('child');
    const c = town([{ type: 'villager', ...adult }, { type: 'villager', ...child }]);
    expect(c.bumps).toHaveLength(3);
    expect(c.bumps.map((b) => b.r)).toEqual([BUMP_ADULT, BUMP_ADULT, BUMP_CHILD]);
    c.list.forEach((v) => v.group.updateMatrixWorld(true));
    const want = [];
    for (const v of c.list) for (const p of v.people) want.push(p.figure.getWorldPosition(new THREE.Vector3()));
    c.bumps.forEach((b, i) => {
      expect(b.x).toBeCloseTo(want[i].x, 6);
      expect(b.z).toBeCloseTo(want[i].z, 6);
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
    const ref = c.bumps[0];
    const cat = buildCat('tabby');
    cat.position.set(adult.x, 0, adult.z - 1);
    let t = 0;
    for (let i = 0; i < 400; i++) {
      t += DT;
      cat.updateMatrixWorld(true);
      c.update(DT, t, cat.position, cat.position, cat);
    }
    expect(c.bumps[0]).toBe(ref);
    expect(JSON.stringify(c.bumps)).toBe(before);
  });
});

describe('placements clear of people', () => {
  // Every place a cat must reach in the four street places is at least a
  // bump's reach plus 0.1 m from every person (a pair's child too).
  const CLEAR = BUMP_ADULT + CAT_RADIUS + 0.1;
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
          if (d < CLEAR) near.push(`${what} ${s.id ?? ''} (${s.x}, ${s.z}) is ${d.toFixed(2)} m from a person at (${b.x.toFixed(2)}, ${b.z.toFixed(2)})`);
        }
      }
      expect(near).toEqual([]);
    }, 60000);
  }
});

describe('her head and a kneeling person (ruling R22)', () => {
  // Measured against the person's skinned body (arms left out) and her head
  // sphere and body capsule (catVolumes): at the bump's closest approach
  // (0.57 m) her head and body are inside a kneeling grown-up's chest in
  // every preset shape. The fixed radius that would keep them out is above
  // 0.4 m, which would keep her head out of the scratch's reach, and a
  // bump must never grow while she is near (people never push her). So the
  // bump stays at the spec's 0.22 m. If her volumes shrink so this fails,
  // look again at whether a fixed larger bump now fits.
  it('the middle distance that keeps her head clear of a kneeling adult is more than 0.4 m + CAT_RADIUS', () => {
    const def = spotsOfKind('adult', 1)[0];
    const samples = bodySamples(def, 'kneel');
    const need = (breed) => {
      let lo = 0.3; let hi = 1.6;
      for (let q = 0; q < 9; q++) {
        const m = (lo + hi) / 2;
        const g = gapAt(samples, breed, m, 0, 0);
        if (g.head >= 0.005 && g.body >= 0.005) hi = m; else lo = m;
      }
      return hi;
    };
    for (const breed of ['tabby', 'siamese', 'persian', 'mainecoon']) expect(need(breed)).toBeGreaterThan(0.4 + CAT_RADIUS);
    const at = gapAt(samples, 'tabby', BUMP_ADULT + CAT_RADIUS, 0, 0);
    expect(Math.min(at.head, at.body)).toBeLessThan(0);
  });
});
