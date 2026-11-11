import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createStrayCats, strayStream } from '../src/straycats.js';
import { mulberry32 } from '../src/rng.js';
import { rollTreats } from '../src/scent.js';
import { createGoals } from '../src/goals.js';

const fakeScene = () => ({ add: () => {}, remove: () => {} });
const AREA = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } };
const take = (rng, n) => Array.from({ length: n }, () => rng());
const look = (s) => ({
  name: s.name, x: s.group.position.x, z: s.group.position.z,
  rotY: s.group.rotation.y, personality: s.personality, timer: s.timer,
});

describe('strayStream', () => {
  it('is deterministic per room seed and not the walkRng itself', () => {
    expect(take(strayStream(1234), 10)).toEqual(take(strayStream(1234), 10));
    expect(strayStream(1234)()).not.toBe(mulberry32(1234)());
  });
  it('is Math.random solo', () => {
    expect(strayStream(undefined)).toBe(Math.random);
  });
});

describe('strays and the shared walkRng', () => {
  const spawn = (n) => createStrayCats(fakeScene(), AREA, n, strayStream(99), { roomSeed: 99 });
  it('a phone and a desktop spawn the same first 14 strays', () => {
    const phone = spawn(14).strays.map(look);
    const desktop = spawn(22).strays.slice(0, 14).map(look);
    expect(phone).toEqual(desktop);
  });
  // The lite rung (quality.js LITE) spawns 8, or her colony's size here if
  // that is more (tier.keepFedCats): either way a prefix of the same cast.
  it('a lite-rung device spawns the same first 8 strays as everyone else', () => {
    const lite = spawn(8).strays.map(look);
    expect(lite).toEqual(spawn(14).strays.slice(0, 8).map(look));
    expect(lite).toEqual(spawn(22).strays.slice(0, 8).map(look));
    expect(spawn(11).strays.map(look)).toEqual(spawn(22).strays.slice(0, 11).map(look));
  });
  it('the lite rung keeps every fed cat, where LOW\'s own rule would too', () => {
    const colonyCats = Array.from({ length: 10 }, (_, i) => ({ name: spawn(22).strays[i].name, x: i, z: -i }));
    const fed = (n) => createStrayCats(fakeScene(), AREA, n, strayStream(99), { roomSeed: 99, colonyCats });
    // 8 places would drop two of her ten; walk.js asks for max(8, 10).
    expect(fed(8).strays).toHaveLength(8);
    const kept = fed(Math.max(8, colonyCats.length)).strays.map((s) => s.name);
    expect(kept).toEqual(colonyCats.map((c) => c.name));
  });
  it('stray count never shifts the treats or goals drawn from walkRng', () => {
    const pois = Array.from({ length: 6 }, (_, i) => ({ x: i * 10, z: -i * 7 }));
    const after = (n) => {
      const walkRng = mulberry32(99);
      spawn(n);
      return { treats: rollTreats(walkRng, pois, 2), goals: createGoals(walkRng).goals };
    };
    expect(after(14)).toEqual(after(22));
    expect(after(8)).toEqual(after(22));
    expect(after(0)).toEqual(after(22));
  });
  it('walk.js hands createStrayCats its own stream, not walkRng', () => {
    const src = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    const start = src.indexOf('createStrayCats(scene');
    const args = src.slice(start, src.indexOf('});', start));
    expect(args).toContain('strayStream(roomSeed ?? soloSeed)'); // solo: the walk's own seed (mid-walk resume)
    expect(args).not.toContain('walkRng');
  });
  it('walk.js takes the stray count from the tier, not the pointer', () => {
    const src = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    const start = src.indexOf('createStrayCats(scene');
    const args = src.slice(start, src.indexOf('});', start));
    // Clan Life Part 1: the tier's count, less the clan in a territory with a camp.
    // Kittypets (ruling R2, amended): a wanderer takes an ordinary loner's slot.
    expect(args).toContain('createStrayCats(scene, areaData, strayCount, strayStream(roomSeed ?? soloSeed)');
    expect(src).toContain('const loners = isDen ? 0 : lonersFor(areaId, tier.strays, fedHere);');
    // The lite rung (quality.js LITE) keeps her fed cats when its count is
    // smaller than her colony here: a longer prefix of the same cast.
    expect(src).toContain('const strayCount = wanderStrayCount(tier.keepFedCats ? Math.max(loners, fedHere) : loners, fedHere, !!wanderSpot);');
    expect(src).not.toContain('coarse ? 14 : 22');
  });
});
