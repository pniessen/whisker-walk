// The Jungle lodge, milestone J6: the Greenhouse's stone ring stands where the teleport gate rules want it (open lawn, clear of every collider, point of interest, find and golden
// mouse, in sight of the spawn, walkable round it, landing open and reached on foot), is drawn as the old mossy stone ring, is behind ?jungle=1 (the catalog row, the map, the gate),
// and the lodge's own return ring is where she lands.
import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { teleKit } = await import('./helpers/tele.js');
const { GATE_REACH, GATE_PREFETCH_REACH, arrivalFor } = await import('../src/gateways.js');
const { isWalkableAt } = await import('../src/player.js');
const { floodFrom } = await import('./helpers/flood.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { setGrow } = await import('../src/grow.js');
const gh = await import('../src/world/greenhouse.js');
const T = await teleKit();
const { TELE_ENDS, TELE_LOOK, JUNGLE_NEED_WALKS, liveTeleEnds, teleStatus } = T;
const { CATALOG } = await import('../src/progression.js');
const { addTeleGates, discTint, teleSolids } = await import('../src/world/telegate.js');
const { setTele } = await import('../src/teleflag.js');
const { setJungle } = await import('../src/jungleflag.js');
const { areaShown } = await import('../src/edition.js');
const jungle = await import('../src/world/jungle.js');

setGrow(false);
afterEach(() => { setTele(null); setJungle(null); });
const E = TELE_ENDS.greenhouse.find((e) => e.id === 'greenhouse-jungle');
const R = TELE_ENDS.jungle[0];
const area = gh.build(new THREE.Scene(), {});
const reach = floodFrom(area, gh.GREENHOUSE_SPAWN, (x, z) => isWalkableAt(area, x, z));

describe('the pair', () => {
  it('the Greenhouse\'s stone ring and the lodge\'s own return ring, each the other\'s twin, both editions, the old stonering look, no suit', () => {
    expect([E.twin, R.twin]).toEqual([R.id, E.id]);
    expect([E.to, R.to]).toEqual(['jungle', 'greenhouse']);
    expect([E.edition, R.edition]).toEqual(['all', 'all']);
    expect([E.look, R.look]).toEqual(['stonering', 'stonering']);
    expect(TELE_LOOK['greenhouse-jungle']).toBe('stonering');
    expect([E.suit, R.suit]).toEqual([null, null]);
    expect(R.own).toBe(true);
    expect(E.own).toBe(false);
    expect(E.needWalks).toBe(JUNGLE_NEED_WALKS);
    expect(R.needWalks).toBe(0);
    expect(CATALOG.areas.jungle).toEqual({ name: 'The Jungle Lodge', price: 0, requires: { area: 'greenhouse', walks: JUNGLE_NEED_WALKS }, gate: 'tele', flag: 'jungle' });
    expect(discTint(E)).toBe(0xffeeb4); // the stones' own warm disc, no new tint
  });
  it('she lands on the spawn ring facing it (3.6 m out), and back at the Greenhouse 3.6 m from the stones, facing them', () => {
    const land = arrivalFor('greenhouse-jungle', TELE_ENDS);
    expect(land.areaId).toBe('jungle');
    expect(land.x).toBeCloseTo(0, 6); expect(land.z).toBeCloseTo(31.6, 6);
    expect(Math.hypot(land.x - jungle.JUNGLE_SPAWN.x, land.z - jungle.JUNGLE_SPAWN.z)).toBeLessThan(0.5);
    const back = arrivalFor('jungle-greenhouse', TELE_ENDS);
    expect(back.areaId).toBe('greenhouse');
    expect(Math.hypot(back.x - E.x, back.z - E.z)).toBeCloseTo(3.6, 6);
  });
});

describe('the Greenhouse end', () => {
  it('stands on open lawn, clear of every collider, point of interest, find, perch and golden mouse, in sight of the spawn', () => {
    for (const c of area.colliders) expect(Math.hypot(c.x - E.x, c.z - E.z) - (c.r ?? 0), `collider (${c.x}, ${c.z})`).toBeGreaterThanOrEqual(5);
    const things = [...(area.pois ?? []), ...(area.collectibles ?? []), ...(area.scenics ?? []), ...(area.perches ?? []), ...(GOLD_MICE.greenhouse ?? []), gh.GREENHOUSE_SPAWN];
    expect(things.length).toBeGreaterThan(3);
    for (const t of things) expect(Math.hypot(t.x - E.x, t.z - E.z), `thing at (${t.x}, ${t.z})`).toBeGreaterThanOrEqual(7);
    expect(Math.hypot(gh.GREENHOUSE_SPAWN.x - E.x, gh.GREENHOUSE_SPAWN.z - E.z)).toBeLessThan(15);
  });
  it('she can walk up to it on foot from the spawn, and the ring round it is open', () => {
    let spots = 0;
    for (let dx = -GATE_REACH; dx <= GATE_REACH; dx += 0.1) {
      for (let dz = -GATE_REACH; dz <= GATE_REACH; dz += 0.1) {
        const x = E.x + dx; const z = E.z + dz;
        if (Math.hypot(dx, dz) <= GATE_REACH - 0.05 && isWalkableAt(area, x, z) && reach.reaches(x, z)) spots++;
      }
    }
    expect(spots).toBeGreaterThan(50);
    for (let a = 0; a < 16; a++) for (const r of [1, 2, 3]) expect(isWalkableAt(area, E.x + Math.cos(a * Math.PI / 8) * r, E.z + Math.sin(a * Math.PI / 8) * r), `ring ${a} at ${r} m`).toBe(true);
  });
  it('the spot she lands on coming home is open, reached on foot, out of reach of the gate and inside the prefetch distance', () => {
    const land = E.arrive;
    expect(isWalkableAt(area, land.x, land.z)).toBe(true);
    expect(reach.reaches(land.x, land.z)).toBe(true);
    expect(Math.hypot(land.x - E.x, land.z - E.z)).toBeGreaterThan(GATE_REACH + 1);
    expect(GATE_PREFETCH_REACH).toBeGreaterThan(Math.hypot(land.x - E.x, land.z - E.z));
  });
  it('is drawn as the ring of stones with two solid pillars; the Greenhouse\'s own return arch is still drawn by the Greenhouse (the only own end there)', () => {
    const g = addTeleGates(new THREE.Scene(), [E]);
    expect(g.colliders).toHaveLength(2);
    expect(teleSolids(E)).toHaveLength(2);
    expect(TELE_ENDS.greenhouse.filter((e) => e.own).map((e) => e.id)).toEqual(['greenhouse-park']);
  });
});

describe('the lodge\'s ring', () => {
  it('its two solid front stones are the plan\'s, 2.6 m apart at (0, 28), so the drawn ring and the gate agree', async () => {
    const P = await import('../src/world/jungleplan.js');
    expect([R.x, R.z, R.faces]).toEqual([P.RING.x, P.RING.z, 'north']);
    const solids = teleSolids(R);
    for (const s of solids) expect(P.RING_STONES.slice(0, 2).some((k) => Math.hypot(k.x - s.x, k.z - s.z) < 1e-6), JSON.stringify(s)).toBe(true);
    expect(P.jungleColliders().filter((c) => c.z === R.z)).toHaveLength(2);
  });
});

describe('behind ?jungle=1 (and the gates switch)', () => {
  const walked = { walks: { greenhouse: 5 } };
  it('with the flag off (the default) nobody sees it: no card, no map circle, no gate in the Greenhouse; the lodge\'s own ring is only reached from inside', () => {
    setTele(true);
    for (const edition of ['canon', 'legacy']) expect(areaShown(CATALOG.areas.jungle, edition), edition).toBe(false);
    expect(liveTeleEnds('greenhouse', CATALOG).map((e) => e.id)).toEqual(['greenhouse-park']);
    expect(teleStatus(E, walked, CATALOG).kind).toBe('go'); // (the status alone is not a gate: it is never offered)
  });
  it('with the flag on and the gates switch on, both editions see it and the ring is live after two Greenhouse walks', () => {
    setTele(true); setJungle(true);
    for (const edition of ['canon', 'legacy']) expect(areaShown(CATALOG.areas.jungle, edition), edition).toBe(true);
    expect(liveTeleEnds('greenhouse', CATALOG).map((e) => e.id)).toEqual(['greenhouse-park', 'greenhouse-jungle']);
    expect(teleStatus(E, { walks: { greenhouse: 1 } }, CATALOG).kind).toBe('dormant');
    expect(teleStatus(E, walked, CATALOG).kind).toBe('go');
    expect(liveTeleEnds('jungle', CATALOG).map((e) => e.id)).toEqual(['jungle-greenhouse']);
  });
  it('with the gates switch off the flag alone shows nothing', () => {
    setTele(false); setJungle(true);
    expect(areaShown(CATALOG.areas.jungle, 'canon')).toBe(false);
    expect(liveTeleEnds('greenhouse', CATALOG)).toEqual([]);
  });
  it('the flag is on in a browser (?jungle=0 turns it off), off without an address bar, and the shortcut needs ?jungle=1', async () => {
    const { jungleOn, jungleShortcut } = await import('../src/jungleflag.js');
    expect(jungleOn()).toBe(false);
    expect(jungleShortcut()).toBe(false);
    setJungle(true);
    expect(jungleShortcut()).toBe(true);
    const was = globalThis.location;
    try {
      for (const [search, on] of [['?jungle=1', true], ['?jungle=0', false], ['', true], ['?gates=1', true]]) {
        setJungle(null);
        Object.defineProperty(globalThis, 'location', { value: { search }, configurable: true });
        expect(jungleOn(), search).toBe(on);
      }
    } finally {
      if (was === undefined) delete globalThis.location; else Object.defineProperty(globalThis, 'location', { value: was, configurable: true });
    }
  });
});

// The Greenhouse's budget after the gate (the plan: "the Greenhouse is re-measured after the gate"): the ring is three meshes and well under 1,000 triangles, and the place stays under
// its UNCHANGED ceilings (test/budget.test.js: built 83 meshes / 8 casters / 64,730 triangles, merged 77 / 7).
describe('the Greenhouse with the stone ring', () => {
  it('stays under its unchanged ceilings, built and merged', async () => {
    const { castsFromBox, isTransparentMat } = await import('../src/render/rig.js');
    const { mergeStaticProps } = await import('../src/render/mergeprops.js');
    const stats = (scene) => {
      let meshes = 0; let casters = 0; let triangles = 0;
      const box = new THREE.Box3();
      for (const child of scene.children) {
        box.setFromObject(child);
        const eligible = castsFromBox(box);
        child.traverse((o) => {
          if (!o.isMesh) return;
          meshes++;
          const g = o.geometry;
          triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
          if (eligible && !isTransparentMat(o.material) && !o.userData.noCast) casters++;
        });
      }
      return { meshes, casters, triangles: Math.round(triangles) };
    };
    const bare = new THREE.Scene();
    gh.build(bare, {});
    const scene = new THREE.Scene();
    gh.build(scene, {});
    addTeleGates(scene, [E], { ground: gh.build(new THREE.Scene(), {}).ground });
    const built = stats(scene);
    const was = stats(bare);
    expect(built.meshes - was.meshes).toBeLessThanOrEqual(3);
    expect(built.triangles - was.triangles).toBeLessThanOrEqual(1000);
    expect(built.meshes).toBeLessThanOrEqual(83);
    expect(built.casters).toBeLessThanOrEqual(8);
    expect(built.triangles).toBeLessThanOrEqual(64730);
    mergeStaticProps(scene);
    mergeStaticProps(bare);
    const merged = stats(scene);
    expect(merged.meshes).toBeLessThanOrEqual(77);
    expect(merged.casters).toBeLessThanOrEqual(7);
    // measured 2026-11-27: the bare Greenhouse is 74 / 7 / 58,583 built and 68 / 6 merged; with the ring 77 / 8 / 58,771 built (+3 meshes, +1 caster, +188 triangles) and 71 / 7 merged
  });
});
