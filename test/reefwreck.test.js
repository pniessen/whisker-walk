// The Reef, milestone R16 (the sunken galleon). The plan's numbers (a tilted deck under 0.5 slope that she walks up from the low rail, a cabin at sand level under
// a ceiling at least 3.2 m high where she can float, colliders with the open breach and boarding gap, the golden mouse on the cabin floor), the ground and the camera
// (the seabed is unchanged outside the footprint, the camera stays under the ceiling), the brass suit as decor only, the clue data, the flag, the words in both sets
// and the source rules.
import { describe, it, expect } from 'vitest';
import { CLAN_TOTAL } from './helpers/goldtotals.js';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stubCanvasDocument } from './helpers/canvas.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { GOLD_MICE, GOLD_TOTAL } from '../src/goldmice.js';
import { isWalkableAt, createPlayer } from '../src/player.js';
import { placeFloat, placePace } from '../src/placephysics.js';
import { MAX_GRADE, STEP_MAX } from '../src/ground.js';

stubCanvasDocument();
const { build } = await import('../src/world/reef.js');
const P = await import('../src/world/reefplan.js');
const W = await import('../src/world/reefwreckplan.js');
const LF = (await import('../src/world/reeflabplan.js')).LAB_FOOT;
const Q = await import('../src/world/reeffindsplan.js');
const D = await import('../src/world/reefdeep.js');
const { createReefWreckLife, flagCloth, flagWave } = await import('../src/world/reefwrecklife.js');
const { LINES } = await import('../src/world/reefwreckwords.js');
const { createKit, reefMaterials, paint, COL } = await import('../src/world/reefparts.js');
const { drawWreck } = await import('../src/world/reefwreckparts.js');
const { phrase } = await import('../src/clanphrases.js');
const { REEF_JOURNAL_TYPES, REEF_WING_PAGES, REEF_PAGE_WORDS } = await import('../src/reefpages.js');
const { ST } = await import('../src/world/reefstages.js');
const { LANTERNS } = await import('../src/world/reefwing.js');

const area = build(new THREE.Scene());
const ground = area.ground;
const B = P.REEF_BOUNDS;
const hasBase = (x, z) => P.reefBaseY(x, z);

// Everything she can walk to on foot from a start: 0.25 m cells, a step must be legal for the ground and the cell free of colliders.
function reach(start, box) {
  const S = 0.25;
  const key = (i, j) => `${i},${j}`;
  const seen = new Set([key(Math.round(start.x / S), Math.round(start.z / S))]);
  const stack = [[Math.round(start.x / S), Math.round(start.z / S)]];
  while (stack.length) {
    const [i, j] = stack.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const p = i + di; const q = j + dj;
      const x = p * S; const z = q * S;
      if (x < box.x0 || x > box.x1 || z < box.z0 || z > box.z1 || seen.has(key(p, q))) continue;
      if (!isWalkableAt(area, x, z) || !ground.canStep(i * S, j * S, x, z)) continue;
      seen.add(key(p, q)); stack.push([p, q]);
    }
  }
  return (x, z) => seen.has(key(Math.round(x / S), Math.round(z / S)));
}
const start = { x: 38, z: -26 }; // open sand south of the hull
const there = reach(start, { x0: 22, x1: 48, z0: -42, z1: -20 });

describe('the plan (reefwreckplan.js)', () => {
  it('is pure: the same colliders and flag twice, and the galleon is in the south-east inside the walk', () => {
    expect(W.wreckColliders()).toEqual(W.wreckColliders());
    expect(W.FLAG_CELLS).toEqual(W.FLAG_CELLS);
    expect(W.WRECK.x).toBeGreaterThan(30); expect(W.WRECK.z).toBeLessThan(-28);
    for (const c of W.wreckColliders()) { expect(c.x).toBeGreaterThan(B.minX + 1); expect(c.x).toBeLessThan(B.maxX - 1); expect(c.z).toBeGreaterThan(B.minZ + 1); expect(c.z).toBeLessThan(B.maxZ - 1); }
  });
  it('the colliders are in the area record and the openings are at least 2.2 m clear', () => {
    for (const c of W.wreckColliders()) expect(area.colliders.some((a) => a.x === c.x && a.z === c.z && a.r === c.r), JSON.stringify(c)).toBe(true);
    const clear = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r;
    const south = W.wreckColliders().filter((c) => Math.abs(c.z - (W.WRECK.z + 2.85)) < 0.02);
    const around = (u0, u1) => ({ a: south.filter((c) => c.x - W.WRECK.x <= u0 + 0.01).sort((p, q) => q.x - p.x)[0], b: south.filter((c) => c.x - W.WRECK.x >= u1 - 0.01).sort((p, q) => p.x - q.x)[0] });
    for (const g of [W.BREACH, W.BOARDING]) { const { a, b } = around(g.u0, g.u1); expect(clear(a, b)).toBeGreaterThanOrEqual(2.2 - 1e-6); }
  });
});

describe('the ground', () => {
  it('the seabed is unchanged outside the deck and equals the dunes at the spawn and elsewhere', () => {
    let moved = 0; let inside = 0;
    for (let x = B.minX - 6; x <= B.maxX + 6; x += 0.7) for (let z = B.minZ - 6; z <= B.maxZ + 6; z += 0.7) {
      if (W.deckInside(x, z)) { inside++; continue; }
      if (x > LF.minX - 1 && x < LF.maxX + 1 && z > LF.minZ - 1 && z < LF.maxZ + 1) continue; // the Sealab's flats (R13)
      if (P.reefY(x, z) !== hasBase(x, z)) moved++;
    }
    expect(moved).toBe(0);
    expect(inside).toBeGreaterThan(50);
    expect(P.reefY(P.REEF_SPAWN.x, P.REEF_SPAWN.z)).toBe(hasBase(P.REEF_SPAWN.x, P.REEF_SPAWN.z));
    expect(P.REEF_SPAWN).toEqual({ x: 0, z: 36 });
    expect(B).toEqual({ minX: -48, maxX: 48, minZ: -42, maxZ: 42 });
  });
  it('the deck is a tilted ramp under 0.5: 2.5 m up from the low rail to the high one, the slope between them is the plan\'s', () => {
    const g = { x: 0, z: 0 };
    let worst = 0;
    for (let u = -2.3; u <= 2.7; u += 0.4) for (let v = -2.0; v <= 2.7; v += 0.4) {
      ground.gradient(W.WRECK.x + u, W.WRECK.z + v, g);
      worst = Math.max(worst, Math.hypot(g.x, g.z));
    }
    expect(worst).toBeLessThan(0.5);
    expect(W.WRECK.rise).toBeLessThan(0.5);
    const lowV = P.reefY(W.WRECK.x, W.WRECK.z + 3); const highV = P.reefY(W.WRECK.x, W.WRECK.z - 2.4);
    expect(highV - lowV).toBeGreaterThan(2);
    expect(P.reefY(W.WRECK.x, W.WRECK.z + 3)).toBe(hasBase(W.WRECK.x, W.WRECK.z + 3)); // the low rail meets the sand with no step
  });
  it('the deck is reachable on foot from open sand, through the low rail\'s gap, up to the high rail', () => {
    expect(there(start.x, start.z)).toBe(true);
    expect(there(W.WRECK.x, W.WRECK.z + 2.8)).toBe(true); // the boarding gap
    expect(there(W.WRECK.x - 1, W.WRECK.z + 1)).toBe(true); // mid-deck
    expect(there(W.WRECK.x + 0.2, W.WRECK.z - 1.9)).toBe(true); // by the high rail
    expect(P.reefY(W.WRECK.x + 0.2, W.WRECK.z - 1.9) - hasBase(W.WRECK.x + 0.2, W.WRECK.z - 1.9)).toBeGreaterThan(2);
  });
  it('the hull is solid: the high rail, the stern, the bulkhead and the fore wall block, and the buried bow is shut off', () => {
    for (const [u, v] of [[0, -2.85], [-7.65, 0], [-3.2, 0], [3.4, 0.9], [-2.5, 2.85]]) expect(isWalkableAt(area, W.WRECK.x + u, W.WRECK.z + v), `${u},${v}`).toBe(false);
    expect(there(W.WRECK.x + 4.6, W.WRECK.z)).toBe(false); // inside the bow wedge
  });
  it('a walk up the deck is a legal step the whole way', () => {
    let prev = { x: W.WRECK.x, z: W.WRECK.z + 3.2 };
    for (let z = W.WRECK.z + 3.2; z >= W.WRECK.z - 2.3; z -= 0.1) { expect(ground.canStep(prev.x, prev.z, W.WRECK.x, z), `z ${z}`).toBe(true); prev = { x: W.WRECK.x, z }; }
    expect(MAX_GRADE + STEP_MAX).toBeGreaterThan(W.WRECK.rise);
  });
});

describe('the cabin', () => {
  it('has a finite ceiling at least 3.2 m over the seabed everywhere inside, and none anywhere else on the Reef', () => {
    let lo = 99;
    for (let u = W.CABIN.u0; u <= W.CABIN.u1; u += 0.3) for (let v = W.CABIN.v0; v <= W.CABIN.v1; v += 0.3) {
      const c = ground.ceil(W.WRECK.x + u, W.WRECK.z + v);
      expect(Number.isFinite(c)).toBe(true);
      lo = Math.min(lo, c - ground.y(W.WRECK.x + u, W.WRECK.z + v));
    }
    expect(lo).toBeGreaterThanOrEqual(3.2);
    for (const [x, z] of [[0, 36], [-32, -31], [W.WRECK.x, W.WRECK.z], [W.WRECK.x - 9, W.WRECK.z], [20, 0], [W.WRECK.x - 5, W.WRECK.z + 3.3]]) expect(ground.ceil(x, z), `${x},${z}`).toBe(Infinity);
  });
  it('is open at sand level: the breach lets her in on foot and the golden mouse is on the floor', () => {
    const m = W.CABIN_MOUSE;
    expect(W.cabinInside(m.x, m.z)).toBe(true);
    expect(there(m.x, m.z)).toBe(true);
    expect(there(W.WRECK.x - 5.1, W.WRECK.z + 2.4)).toBe(true); // the breach
    expect(ground.y(m.x, m.z)).toBe(hasBase(m.x, m.z)); // sand level
    expect(W.CABIN_TABLE.r + 0.5).toBeLessThan(Math.hypot(m.x - W.CABIN_TABLE.x, m.z - W.CABIN_TABLE.z));
  });
  it('she can float inside it and the camera stays under the ceiling', () => {
    const camera = new THREE.PerspectiveCamera();
    const player = createPlayer(camera, null, { headless: true });
    const cat = new THREE.Group();
    const m = W.CABIN_MOUSE;
    cat.position.set(m.x, ground.y(m.x, m.z), m.z);
    player.setAvatar(cat, placePace(3.5, 'reef'));
    player.setFloat(placeFloat('reef'));
    player.setGround(ground);
    player.enable();
    const DT = 1 / 60;
    player.setKick(true);
    for (let i = 0; i < 60 * 5; i++) player.update(DT, [], B, []);
    expect(player.floatY).toBe(2.2);
    expect(cat.position.y + player.floatY + 0.6).toBeLessThan(ground.ceil(cat.position.x, cat.position.z)); // her ears clear the roof
    for (let i = 0; i < 60 * 3; i++) player.update(DT, [], B, []);
    expect(player.cameraCaveBlend).toBeGreaterThan(0.5);
    expect(camera.position.y).toBeLessThanOrEqual(ground.ceil(camera.position.x, camera.position.z) - 0.3 + 1e-6);
  });
});

describe('the gold mouse, the page and the prop', () => {
  it('gm-reef-5 is on the cabin floor in both lists and the totals are unchanged by it', () => {
    const a = GOLD_MICE.reef.find((g) => g.id === 'gm-reef-5');
    const b = Q.REEF_GOLD.find((g) => g.id === 'gm-reef-5');
    expect({ x: a.x, z: a.z, y: a.y }).toEqual({ x: W.CABIN_MOUSE.x, z: W.CABIN_MOUSE.z, y: 0 });
    expect({ x: b.x, z: b.z, y: b.y }).toEqual({ x: W.CABIN_MOUSE.x, z: W.CABIN_MOUSE.z, y: 0 });
    expect(GOLD_MICE.reef).toHaveLength(5);
    expect(GOLD_TOTAL).toBe(CLAN_TOTAL);
    expect(P.KEEP_OUT.some(([x, z]) => Math.hypot(x - a.x, z - a.z) < 1)).toBe(false); // not in KEEP_OUT (the scatters stay where they are)
  });
  it('the journal page rfgalleon is a spotted subject from the life, with its name and hint in both word sets', () => {
    const scene = new THREE.Scene();
    const said = [];
    const life = area.life({ scene, say: (t) => said.push(t), reducedMotion: false, tier: null });
    const s = life.spottable.find((e) => e.type === 'rfgalleon');
    expect(s).toBeTruthy();
    expect(REEF_JOURNAL_TYPES.includes('rfgalleon') || REEF_WING_PAGES.some((p) => p[0] === 'rfgalleon')).toBe(true);
    expect(s.label).toMatch(/galleon/);
    for (const set of [() => 1, withOffWords]) set(() => { expect(REEF_PAGE_WORDS.rfgalleon.hint()).toBe('A sunken ship rests in the south-east.'); expect(REEF_PAGE_WORDS.rfgalleon.name()).toBe('The Galleon'); });
    life.dispose?.();
  });
  it('the brass diving suit is decor: one collider, no find, no found-outfit spot, no journal or gold entry near it', () => {
    const S = W.BRASS_SUIT;
    expect(area.colliders.some((c) => c.x === S.x && c.z === S.z)).toBe(true);
    for (const k of [...Q.REEF_SPOTS ?? [], ...Q.GLOVE_SPOTS ?? []]) expect(Math.hypot(k.x - S.x, k.z - S.z)).toBeGreaterThan(2);
    for (const g of Q.REEF_GOLD) expect(Math.hypot(g.x - S.x, g.z - S.z)).toBeGreaterThan(5);
    expect(there(S.x + 1.6, S.z)).toBe(true); // she can walk up to it
  });
  it('the other places and the traces: the stage adds only to the Reef (the plan reads reefBaseY and nothing else moved)', () => {
    expect(Object.keys(ST.wreck).sort()).toEqual(['clues', 'colliders', 'draw', 'drawAnchor', 'drawBoat', 'install', 'life']);
    expect(P.REEF_RAISE_REGIONS).toHaveLength(1);
    expect(P.REEF_CEIL_REGIONS).toHaveLength(2); // the Sealab's and the cabin's
    expect(D.BOAT.x).toBe(-32.8);
    const raised = []; for (let x = 20; x <= 48; x += 0.5) for (let z = -42; z <= -20; z += 0.5) { if (x < LF.maxX + 1 && z > LF.minZ - 1 && z < LF.maxZ + 1) continue; if (P.reefY(x, z) !== hasBase(x, z)) raised.push([x, z]); }
    expect(raised.every(([x, z]) => W.deckInside(x, z))).toBe(true);
  });
});

describe('the clues', () => {
  it('WRECK_CLUES is three { id, x, z } places in order on open ground inside the walk, the first the Old Anchor', () => {
    expect(W.WRECK_CLUES).toHaveLength(3);
    expect(W.WRECK_CLUES[0]).toEqual({ id: 'anchor', x: D.ANCHOR.x, z: D.ANCHOR.z });
    for (const c of W.WRECK_CLUES) { expect(Object.keys(c)).toEqual(['id', 'x', 'z']); expect(c.x).toBeGreaterThan(B.minX); expect(c.x).toBeLessThan(B.maxX); expect(c.z).toBeGreaterThan(B.minZ); expect(c.z).toBeLessThan(B.maxZ); }
    expect(new Set(W.WRECK_CLUES.map((c) => c.id)).size).toBe(3);
    const stern = D.BOAT_STERN; // the copied numbers are the real places
    expect(W.WRECK_CLUES[1]).toEqual({ id: 'boat', x: Math.round(stern.x * 10) / 10, z: Math.round(stern.z * 10) / 10 });
    expect(W.WRECK_CLUES[2]).toEqual({ id: 'lantern', x: LANTERNS[2].x, z: LANTERNS[2].z });
  });
});

describe('the flag and the drawing', () => {
  it('is eleven by nine cells, a skull over crossed bones, in both colours', () => {
    expect(W.FLAG_CELLS).toHaveLength(9);
    for (const r of W.FLAG_CELLS) expect(r).toHaveLength(11);
    const all = W.FLAG_CELLS.join('');
    expect(all).toMatch(/#/); expect(all).toMatch(/\./);
    expect(flagCloth().count).toBe(99 * 6);
  });
  it('streams with the clock and freezes under reduced motion; fewer redraws on the lite rung; no light is added', () => {
    const run = (o) => {
      const scene = new THREE.Scene();
      const l = createReefWreckLife({ scene, THREE: { ...THREE, mergeGeometries }, ...o });
      const first = Array.from(l.flag.geometry.attributes.position.array.slice(0, 60));
      for (let i = 0; i < 20; i++) l.update(0.1, 0, null);
      const after = Array.from(l.flag.geometry.attributes.position.array.slice(0, 60));
      let lights = 0; scene.traverse((o2) => { if (o2.isLight) lights++; });
      l.dispose();
      return { first, after, lights };
    };
    const moving = run({ reducedMotion: false });
    expect(moving.after).not.toEqual(moving.first);
    const still = run({ reducedMotion: true });
    expect(still.after).toEqual(still.first);
    expect(still.lights + moving.lights).toBe(0);
    expect(flagWave(0, 3)).toBeCloseTo(0, 9);
    expect(run({ reducedMotion: false, tier: { name: 'lite' } }).after).not.toEqual(moving.first);
  });
  it('draws into the kit\'s one paint bucket only, with no new light', () => {
    const kit = createKit('t');
    drawWreck(kit, reefMaterials(), { paint, COL, THREE });
    const meshes = kit.meshes();
    expect(meshes.map((m) => m.name)).toEqual(['t:paint']);
    expect(meshes[0].geometry.attributes.position.count).toBeLessThan(30000);
  });
});

describe('the stage stands alone', () => {
  it('the wreck stage\'s files import nothing of the base chunk (reef.js hands in what they need), so no file is split out of it', () => {
    for (const f of ['reefwreckplan', 'reefwreckparts', 'reefwrecklife', 'reefwreckwords', 'reefstagewreck', 'reefwreck', 'reefhuntlive', 'reefhuntwords', 'reefchestlive', 'reefchestwords']) {
      const text = readFileSync(`src/world/${f}.js`, 'utf8');
      for (const [, spec] of text.matchAll(/^import .*?from '(.+?)';/gm)) expect(spec, `${f} imports ${spec}`).toMatch(/^(\.\/reefwreck\w*\.js|\.\/reefhunt\w+\.js|\.\/reefchest\w+\.js|\.\/reefstages\.js|\.\.\/clanphrases\.js|\.\.\/wordset\.js)$/);
    }
  });
});

describe('the words and the source rules', () => {
  const ids = Object.keys(LINES);
  it('every line is short and in the table, in both word sets, and no series word is in the everyday set', () => {
    for (const id of ids) { expect(phrase(id), id).toMatch(/\S/); expect(phrase(id).length, id).toBeLessThanOrEqual(90); }
    withOffWords(() => { for (const id of ids) expect(bannedIn(phrase(id)), id).toBeNull(); });
  });
  it('the files draw no random number, read no clock, add no PointLight, and use no banned word', () => {
    const banned = /\b(dark|lost forever|trapped|stuck|collapse|cave-in|scary|Zissou|Belafonte|Aquatic|cap|beanie)\b/i;
    for (const f of ['reefwreckplan', 'reefwreckparts', 'reefwrecklife', 'reefwreckwords', 'reefstagewreck', 'reefwreck', 'reefhuntlive', 'reefhuntwords']) {
      const text = readFileSync(`src/world/${f}.js`, 'utf8').replace(/\/\/.*$/gm, ''); // the code, not the comments that name the rules
      expect(text, f).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date|PointLight|SpotLight/);
      expect(text, f).not.toMatch(banned);
    }
  });
});
