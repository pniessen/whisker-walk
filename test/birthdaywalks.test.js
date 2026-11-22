import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (see test/pawprints.test.js).
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { createPawPrints, GLITTER_PRINTS, GLITTER_LIFE } = await import('../src/render/pawprints.js');
const { createPartyBalloons, BALLOON_COUNT, STRING_LEN } = await import('../src/render/partyballoons.js');
const { birthdayPartyOn } = await import('../src/ui/party.js');
const { BIRTHDAY_EVENT } = await import('../src/giftevents.js');
const { build: buildNeighborhood } = await import('../src/world/neighborhood.js');
const { build: buildRiver } = await import('../src/world/river.js');
const { createContactShadows } = await import('../src/render/contactshadows.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { assignShadowCasters } = await import('../src/render/rig.js');
const { LADDER } = await import('../src/render/quality.js');
const { inWater } = await import('../src/world/builder.js');

function walkScene(build) {
  const scene = new THREE.Scene();
  const areaData = build(scene);
  createContactShadows(scene);
  mergeStaticProps(scene);
  assignShadowCasters(scene);
  return { scene, areaData };
}

const withEvent = (on) => ({ hasEvent: (id) => on && id === BIRTHDAY_EVENT });
const BIRTHDAY = new Date(2026, 10, 21, 16, 0);
const AFTER = new Date(2026, 10, 23, 9, 0);

// The drawables a module added to a scene.
function added(scene, before) {
  return scene.children.filter((c) => !before.includes(c));
}

// Walk the cat in a circle round (cx, cz) for `secs`, feeding both effects.
function walkCircle({ paws, balloons, cx = 0, cz = 0, r = 6, secs = 30, speed = 3, state = {} }) {
  const dt = 1 / 60;
  const pose = { x: 0, y: 0, z: 0, yaw: 0, hidden: false, ...state };
  const ys = [];
  for (let i = 0, t = 0; i < secs * 60; i++, t += dt) {
    const a = (t * speed) / r;
    pose.x = cx + Math.cos(a) * r;
    pose.z = cz + Math.sin(a) * r;
    pose.yaw = Math.atan2(-Math.sin(a), Math.cos(a));
    paws?.update(dt, { x: pose.x, z: pose.z, grounded: true });
    balloons?.update(dt, t, pose);
    if (balloons?.mesh) ys.push(balloons.positionOf(0).y);
  }
  return ys;
}

describe('the birthday walk is on only while the party is', () => {
  it('needs the birthday on the save and the window open', () => {
    expect(birthdayPartyOn(withEvent(true), BIRTHDAY)).toBe(true);
    expect(birthdayPartyOn(withEvent(true), AFTER)).toBe(false);
    expect(birthdayPartyOn(withEvent(false), BIRTHDAY)).toBe(false);
    expect(birthdayPartyOn(null, BIRTHDAY)).toBe(false);
  });

  it('creates no balloons and nothing in the scene when the party is off', () => {
    const scene = new THREE.Scene();
    const balloons = createPartyBalloons(scene, { on: false, areaId: 'neighborhood' });
    expect(balloons.mesh).toBeNull();
    expect(scene.children).toHaveLength(0);
    balloons.update(1 / 60, 0, { x: 0, y: 0, z: 0, yaw: 0 });
    balloons.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('keeps the ordinary prints (none on lawn) when glitter is off', () => {
    const { scene, areaData } = walkScene(buildNeighborhood);
    const paws = createPawPrints(scene, { areaId: 'neighborhood', areaData, tier: LADDER[0] });
    expect(paws.capacity).toBe(LADDER[0].pawPrints);
    expect(paws.glitter).toBe(false);
  });

  it('adds no glitter prints in an area with no prints when glitter is off', () => {
    const scene = new THREE.Scene();
    const paws = createPawPrints(scene, { areaId: 'den', areaData: {}, tier: LADDER[0] });
    expect(paws.mesh).toBeNull();
    expect(scene.children).toHaveLength(0);
  });
});

describe('glitter paw prints', () => {
  it('lay on any dry ground, in a capped ring that never grows', () => {
    const { scene, areaData } = walkScene(buildNeighborhood);
    const before = [...scene.children];
    const paws = createPawPrints(scene, { areaId: 'neighborhood', areaData, tier: LADDER[0], glitter: true });
    // One mesh, no shadow-pass draws.
    expect(added(scene, before)).toHaveLength(1);
    expect(paws.mesh.castShadow).toBe(false);
    expect(paws.glitter).toBe(true);
    expect(paws.capacity).toBe(GLITTER_PRINTS);
    walkCircle({ paws, secs: 40 });
    expect(paws.laid).toBeGreaterThan(GLITTER_PRINTS * 2);
    expect(paws.count).toBe(GLITTER_PRINTS);
    expect(paws.mesh.instanceMatrix.count).toBe(GLITTER_PRINTS);
  });

  it('glitter in the den too, which has no ordinary prints', () => {
    const scene = new THREE.Scene();
    const paws = createPawPrints(scene, { areaId: 'den', areaData: {}, tier: LADDER[0], glitter: true });
    expect(paws.capacity).toBe(GLITTER_PRINTS);
    walkCircle({ paws, secs: 5 });
    expect(paws.laid).toBeGreaterThan(5);
  });

  it('fade after a few seconds', () => {
    expect(GLITTER_LIFE).toBeGreaterThanOrEqual(2);
    expect(GLITTER_LIFE).toBeLessThanOrEqual(6);
  });

  it('never land on water', () => {
    const { scene, areaData } = walkScene(buildRiver);
    const paws = createPawPrints(scene, { areaId: 'river', areaData, tier: LADDER[0], glitter: true });
    const w = areaData.waters.find((x) => x.shape === 'rect' || x.shape === 'disc' || x.shape === 'path') ?? areaData.waters[0];
    // Walk a straight line across the whole map; no print may be in water.
    const dt = 1 / 60;
    let wet = 0;
    for (let i = 0; i < 60 * 40; i++) {
      const x = -60 + i * 0.05;
      const p = paws.update(dt, { x, z: w?.z ?? 0, grounded: true });
      if (p && inWater(areaData.waters, p.x, p.z)) wet++;
    }
    expect(wet).toBe(0);
  });

  it('sparkle less with reduced motion', () => {
    const a = createPawPrints(new THREE.Scene(), { areaId: 'den', areaData: {}, tier: LADDER[0], glitter: true });
    const b = createPawPrints(new THREE.Scene(), { areaId: 'den', areaData: {}, tier: LADDER[0], glitter: true, reducedMotion: true });
    expect(b.sparkle.density).toBeLessThan(a.sparkle.density);
    expect(b.sparkle.rate).toBeLessThan(a.sparkle.rate);
  });
});

describe('the party balloons', () => {
  it('are two balloons and their strings in at most two draws, casting no shadow', () => {
    const scene = new THREE.Scene();
    const balloons = createPartyBalloons(scene, { on: true, areaId: 'neighborhood' });
    expect(BALLOON_COUNT).toBe(2);
    const drawn = scene.children;
    expect(drawn.length).toBeLessThanOrEqual(2);
    expect(balloons.mesh.count).toBe(2);
    for (const d of drawn) expect(d.castShadow).toBe(false);
    balloons.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('follow behind and above her cat on strings that stay their length', () => {
    const scene = new THREE.Scene();
    const balloons = createPartyBalloons(scene, { on: true, areaId: 'neighborhood' });
    const dt = 1 / 60;
    const pose = { x: 0, y: 0, z: 0, yaw: 0 };
    // Walk +Z (yaw 0) for 4 seconds at 3 m/s.
    for (let i = 0; i < 240; i++) {
      pose.z = i * dt * 3;
      balloons.update(dt, i * dt, pose);
    }
    for (let i = 0; i < 2; i++) {
      const p = balloons.positionOf(i);
      expect(p.z).toBeLessThan(pose.z); // behind
      expect(p.y).toBeGreaterThan(0.8); // above
      const d = Math.hypot(p.x - pose.x, p.y - pose.y, p.z - pose.z);
      expect(d).toBeLessThan(STRING_LEN + 0.6);
    }
    expect(balloons.mesh.visible).toBe(true);
  });

  it('stay up where the ground has no ceiling (ceil() null, as the built places say)', () => {
    const open = { flat: false, y: () => 0, ceil: () => null, sameLevel: () => true, gradient: (x, z, o) => o };
    const balloons = createPartyBalloons(new THREE.Scene(), { on: true, areaId: 'neighborhood', ground: open });
    for (let i = 0; i < 240; i++) balloons.update(1 / 60, i / 60, { x: 0, y: 0, z: i / 30, yaw: 0 });
    expect(balloons.mesh.visible).toBe(true);
    expect(balloons.positionOf(0).y).toBeGreaterThan(1);
  });

  it('are kept out of walls (the colliders)', () => {
    const scene = new THREE.Scene();
    const colliders = [];
    // A wall of posts along x = -0.6, the side the cat walks beside.
    for (let z = -5; z <= 20; z += 0.5) colliders.push({ x: -0.9, z, r: 0.4 });
    const balloons = createPartyBalloons(scene, { on: true, areaId: 'neighborhood', areaData: { colliders } });
    const pose = { x: 0, y: 0, z: 0, yaw: 0 };
    for (let i = 0; i < 300; i++) {
      pose.z = i / 60 * 2;
      balloons.update(1 / 60, i / 60, pose);
      for (let b = 0; b < 2; b++) {
        const p = balloons.positionOf(b);
        for (const c of colliders) expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThan(c.r);
      }
    }
  });

  it('stay out of a big wall right behind her, string or no string', () => {
    const wall = { x: 0, z: -3.3, r: 3 }; // its edge 0.3m behind her
    const balloons = createPartyBalloons(new THREE.Scene(), { on: true, areaId: 'neighborhood', areaData: { colliders: [wall] } });
    for (let i = 0; i < 300; i++) {
      balloons.update(1 / 60, i / 60, { x: 0, y: 0, z: 0, yaw: 0 });
      for (let b = 0; b < 2; b++) {
        const p = balloons.positionOf(b);
        expect(Math.hypot(p.x - wall.x, p.z - wall.z)).toBeGreaterThan(wall.r);
      }
    }
  });

  it('hide while she swims, rides or is under a ceiling, and come back after', () => {
    const scene = new THREE.Scene();
    const balloons = createPartyBalloons(scene, { on: true, areaId: 'neighborhood' });
    balloons.update(1 / 60, 0, { x: 0, y: 0, z: 0, yaw: 0, hidden: true });
    expect(balloons.mesh.visible).toBe(false);
    expect(scene.children.every((c) => !c.visible)).toBe(true);
    balloons.update(1 / 60, 0.1, { x: 0, y: 0, z: 0, yaw: 0, hidden: false });
    expect(balloons.mesh.visible).toBe(true);
    // A ceiling over her (a cave): hidden.
    const cave = { flat: false, y: () => 0, ceil: () => 1.2, sameLevel: () => true, gradient: (x, z, o) => o };
    const b2 = createPartyBalloons(new THREE.Scene(), { on: true, areaId: 'gorge', ground: cave });
    b2.update(1 / 60, 0, { x: 0, y: 0, z: 0, yaw: 0 });
    expect(b2.mesh.visible).toBe(false);
  });

  it('stay home in the den (indoors)', () => {
    const scene = new THREE.Scene();
    const balloons = createPartyBalloons(scene, { on: true, areaId: 'den' });
    expect(balloons.mesh).toBeNull();
    expect(scene.children).toHaveLength(0);
  });

  it('bob more gently with reduced motion', () => {
    const spread = (reducedMotion) => {
      const balloons = createPartyBalloons(new THREE.Scene(), { on: true, areaId: 'neighborhood', reducedMotion });
      const ys = [];
      for (let i = 0; i < 600; i++) {
        balloons.update(1 / 60, i / 60, { x: 0, y: 0, z: 0, yaw: 0 });
        if (i > 240) ys.push(balloons.positionOf(0).y);
      }
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(spread(true)).toBeLessThan(spread(false) * 0.6);
    expect(spread(false)).toBeGreaterThan(0.02);
  });

  it('snap to her after a teleport rather than flying across the map', () => {
    const balloons = createPartyBalloons(new THREE.Scene(), { on: true, areaId: 'neighborhood' });
    balloons.update(1 / 60, 0, { x: 0, y: 0, z: 0, yaw: 0 });
    balloons.update(1 / 60, 1 / 60, { x: 40, y: 0, z: 40, yaw: 0 });
    const p = balloons.positionOf(0);
    expect(Math.hypot(p.x - 40, p.z - 40)).toBeLessThan(STRING_LEN + 0.6);
  });
});

describe('the birthday walk stays on this device and out of play', () => {
  it('sends nothing over the network and never draws on Math.random while walking', () => {
    const fetch = vi.fn();
    const ws = vi.fn();
    const xhr = vi.fn();
    const beacon = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('WebSocket', ws);
    vi.stubGlobal('XMLHttpRequest', xhr);
    vi.stubGlobal('navigator', { sendBeacon: beacon });
    const random = vi.spyOn(Math, 'random');
    const { scene, areaData } = walkScene(buildNeighborhood);
    const paws = createPawPrints(scene, { areaId: 'neighborhood', areaData, tier: LADDER[0], glitter: true });
    const balloons = createPartyBalloons(scene, { on: true, areaId: 'neighborhood', areaData });
    // (three names each new material and geometry from Math.random; that is
    // the build, not play. The walk itself must never draw on it.)
    random.mockClear();
    walkCircle({ paws, balloons, secs: 10 });
    paws.dispose();
    balloons.dispose();
    expect(fetch).not.toHaveBeenCalled();
    expect(ws).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
});
