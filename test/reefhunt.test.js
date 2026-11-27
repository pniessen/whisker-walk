// The Reef, milestone R17 (the galleon's hunt): the pure step machine (src/world/reefwreck.js: the torn map, three clues in order, the Captain's Chest), the
// places (reachable, clear, inside the Reef), the walk's life (the steps in order, the bandana given once with the paws, every way a walk can end), the save
// seams against hostile payloads (the sanitiser, the merge, the bandana's ownership) and the words in both sets. Both Reef stages (the Sealab and the galleon)
// load together, so nothing here assumes the other stage's regions are absent.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { isWalkableAt } from '../src/player.js';
import { sanitizeSave, CATALOG } from '../src/progression.js';
import { mergeSaves, useSaveTools } from '../src/catmerge.js';
import { mergeColony } from '../src/colony.js';
import { mergeUsage } from '../src/usage.js';
import { sanitizeMarks, MARK_AREAS } from '../src/marks.js';
import { CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX } from '../src/customcats.js';
import { OUTFIT_IDS, sameWear } from '../src/outfits.js';
import { createDiscoveryLog, AWARDS } from '../src/discoveries.js';
import { buildCat } from '../src/cat/model.js';

stubCanvasDocument();
useSaveTools({ CATALOG, sanitizeSave, mergeColony, mergeUsage, sanitizeMarks, MARK_AREAS, CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX, OUTFIT_IDS, sameWear });
const { build } = await import('../src/world/reef.js');
const P = await import('../src/world/reefplan.js');
const W = await import('../src/world/reefwreckplan.js');
const H = await import('../src/world/reefwreck.js');
const D = await import('../src/world/reefdeep.js');
const Q = await import('../src/world/reeffindsplan.js');
const { createReefHuntLife, mapParts, markParts, chestParts } = await import('../src/world/reefhuntlive.js');
const { LINES } = await import('../src/world/reefhuntwords.js');
const { phrase } = await import('../src/clanphrases.js');
const { REEF_PAGE_WORDS, WING_LIVE } = await import('../src/reefpages.js');

const area = build(new THREE.Scene());
const rec = (wreck) => ({ step: 0, shells: 0, album: 0, lab: 0, wreck });
const fresh = (reef) => sanitizeSave({ version: 4, reef }).reef;

describe('the step machine (reefwreck.js)', () => {
  const order = [{ kind: 'map' }, { kind: 'clue', clue: 0 }, { kind: 'clue', clue: 1 }, { kind: 'clue', clue: 2 }, { kind: 'chest' }];
  it('goes in order: map, anchor, boat, lantern, chest; each bit fills the ones below it', () => {
    let r = rec(0);
    const goals = [];
    for (const [i, ev] of order.entries()) {
      goals.push(H.nextGoal(r).kind + (H.nextGoal(r).clue ?? ''));
      const a = H.apply(r, ev);
      expect(a.changed, `step ${i}`).toBe(true);
      expect(a.reef.wreck).toBe((2 << i) - 1);
      r = a.reef;
    }
    expect(goals).toEqual(['map', 'clue0', 'clue1', 'clue2', 'chest']);
    expect(H.nextGoal(r).kind).toBe('rest');
  });
  it('the clues are the plan\'s, in the plan\'s order: the anchor, the boat, the lantern', () => {
    expect(W.WRECK_CLUES.map((c) => c.id)).toEqual(['anchor', 'boat', 'lantern']);
    let r = rec(1);
    for (let i = 0; i < 3; i++) { const g = H.nextGoal(r); expect([g.x, g.z]).toEqual([W.WRECK_CLUES[i].x, W.WRECK_CLUES[i].z]); r = H.apply(r, { kind: 'clue', clue: i }).reef; }
    expect(H.nextGoal(r)).toMatchObject({ kind: 'chest', x: W.CHEST_SPOT.x, z: W.CHEST_SPOT.z });
  });
  it('a step out of order, twice, or nonsense changes nothing', () => {
    for (const [w, ev] of [[0, { kind: 'clue', clue: 0 }], [0, { kind: 'chest' }], [1, { kind: 'clue', clue: 1 }], [3, { kind: 'clue', clue: 0 }], [7, { kind: 'chest' }], [15, { kind: 'clue', clue: 2 }], [31, { kind: 'chest' }], [31, { kind: 'map' }],
      [0, null], [0, 7], [0, { kind: 'bogus' }], [0, { kind: 'clue', clue: 9 }], [0, { kind: 'clue', clue: '0' }], [1, { kind: 'clue' }]]) {
      const a = H.apply(rec(w), ev);
      expect(a, JSON.stringify([w, ev])).toMatchObject({ changed: false, effect: null });
      expect(a.reef.wreck).toBe(w);
    }
  });
  it('credit takes every step before it in order; a step she is past changes nothing', () => {
    expect(H.credit(rec(0), { kind: 'clue', clue: 1 })).toMatchObject({ changed: true, reef: { wreck: 7 } });
    expect(H.credit(rec(0), { kind: 'chest' })).toMatchObject({ changed: true, effect: 'chest', reef: { wreck: 31 } });
    expect(H.credit(rec(7), { kind: 'map' }).changed).toBe(false);
    expect(H.credit(rec(31), { kind: 'chest' }).changed).toBe(false);
    expect(H.credit(rec(0), { kind: 'nope' }).changed).toBe(false);
  });
  it('normalize repairs any input; the other keys of the record come back untouched', () => {
    for (const junk of [undefined, null, 5, 'x', [], {}, { wreck: -3 }, { wreck: NaN }, { wreck: Infinity }, { wreck: 2.5 }, { wreck: '31' }, { wreck: [16] }, { wreck: 1e9 }, { wreck: 64 }]) {
      const w = H.normalize(junk);
      expect(Number.isInteger(w) && w >= 0 && w <= 31, String(JSON.stringify(junk))).toBe(true);
      expect(w & (w + 1)).toBe(0);
    }
    expect(H.normalize({ wreck: 16 })).toBe(31);
    expect(H.normalize({ wreck: 4 })).toBe(7);
    expect(H.apply({ step: 3, shells: 3, album: 9, lab: 5, wreck: 0 }, { kind: 'map' }).reef).toEqual({ step: 3, shells: 3, album: 9, lab: 5, wreck: 1 });
  });
  it('eventAt: the next goal when she is within its reach (horizontal), else nothing', () => {
    expect(H.eventAt(rec(0), W.MAP_SPOT.x + 1, W.MAP_SPOT.z)).toEqual({ kind: 'map' });
    expect(H.eventAt(rec(0), W.MAP_SPOT.x + 3, W.MAP_SPOT.z)).toBeNull();
    expect(H.eventAt(rec(0), W.WRECK_CLUES[0].x, W.WRECK_CLUES[0].z)).toBeNull(); // the anchor first? no: the map first
    expect(H.eventAt(rec(1), W.WRECK_CLUES[0].x, W.WRECK_CLUES[0].z)).toEqual({ kind: 'clue', clue: 0 });
    expect(H.eventAt(rec(1), W.WRECK_CLUES[1].x, W.WRECK_CLUES[1].z)).toBeNull(); // the boat before the anchor: not yet
    expect(H.eventAt(rec(15), W.CHEST_SPOT.x, W.CHEST_SPOT.z)).toEqual({ kind: 'chest' });
    expect(H.eventAt(rec(7), W.CHEST_SPOT.x, W.CHEST_SPOT.z)).toBeNull(); // three clues first
    expect(H.eventAt(rec(31), W.CHEST_SPOT.x, W.CHEST_SPOT.z)).toBeNull();
    expect(H.eventAt(rec(0), NaN, 0)).toBeNull();
  });
});

describe('the places', () => {
  const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // Everything she can walk to on foot from the spawn (0.25 m cells).
  const S = 0.25;
  const key = (i, j) => `${i},${j}`;
  const seen = new Set([key(Math.round(area.spawn.x / S), Math.round(area.spawn.z / S))]);
  const stack = [[Math.round(area.spawn.x / S), Math.round(area.spawn.z / S)]];
  const B = P.REEF_BOUNDS;
  while (stack.length) {
    const [i, j] = stack.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const p = i + di; const q = j + dj; const x = p * S; const z = q * S;
      if (x < B.minX || x > B.maxX || z < B.minZ || z > B.maxZ || seen.has(key(p, q))) continue;
      if (!isWalkableAt(area, x, z) || !area.ground.canStep(i * S, j * S, x, z)) continue;
      seen.add(key(p, q)); stack.push([p, q]);
    }
  }
  const reached = (x, z, reach) => { for (let dx = -reach; dx <= reach; dx += S) for (let dz = -reach; dz <= reach; dz += S) if (Math.hypot(dx, dz) <= reach && seen.has(key(Math.round((x + dx) / S), Math.round((z + dz) / S)))) return true; return false; };
  it('the map is in the cabin, clear of the table, the barrel and the mouse, and reached on foot', () => {
    expect(W.cabinInside(W.MAP_SPOT.x, W.MAP_SPOT.z)).toBe(true);
    for (const c of area.colliders) expect(near(W.MAP_SPOT, c), JSON.stringify(c)).toBeGreaterThan(c.r + 0.4);
    expect(near(W.MAP_SPOT, W.CABIN_MOUSE)).toBeGreaterThanOrEqual(1.5);
    expect(reached(W.MAP_SPOT.x, W.MAP_SPOT.z, W.MAP_SPOT.reach)).toBe(true);
  });
  it('the clues are the anchor, the boat\'s stern and the third lantern coral, each reached on foot', () => {
    expect([W.WRECK_CLUES[0].x, W.WRECK_CLUES[0].z]).toEqual([D.ANCHOR.x, D.ANCHOR.z]);
    for (const c of W.WRECK_CLUES) expect(reached(c.x, c.z, W.CLUE_REACH), c.id).toBe(true);
  });
  it('the chest is on open sand far to the east, inside the Reef, clear of colliders, finds, collectibles, mice and the galleon, and reached on foot', () => {
    const c = W.CHEST_SPOT;
    expect(c.x).toBeGreaterThan(30); // the line says "far to the east"
    expect(c.x).toBeLessThan(B.maxX - 3); expect(c.z).toBeGreaterThan(B.minZ + 3); expect(c.z).toBeLessThan(B.maxZ - 3);
    expect(P.zoneAt(c.x, c.z)).toBeNull();
    for (const k of area.colliders) expect(near(c, k), JSON.stringify(k)).toBeGreaterThan(k.r + 1.4);
    for (const z of Object.values(Q.REEF_FIND_ZONES).flat()) expect(near(c, z)).toBeGreaterThan(z.r + 2);
    for (const k of area.collectibles) expect(near(c, k)).toBeGreaterThanOrEqual(3);
    for (const m of Q.REEF_GOLD) expect(near(c, m)).toBeGreaterThanOrEqual(3);
    expect(near(c, W.WRECK)).toBeGreaterThan(20);
    expect(W.deckInside(c.x, c.z)).toBe(false);
    expect(reached(c.x, c.z, c.reach)).toBe(true);
  });
  it('the meshes are one each and small', () => {
    for (const parts of [mapParts(), markParts(), chestParts()]) expect(parts.length).toBeLessThanOrEqual(8);
  });
});

// A stand-in for what a walk hands the life: a save record, a real discovery log over a paw counter, the scene and the lines said.
function walk(wreck = 0, { neck = null } = {}) {
  const scene = new THREE.Scene();
  const progression = {
    state: { reef: rec(wreck), unlocked: { accessories: [] }, equipped: { neck, collar: null }, points: 0 },
    saves: 0, pages: [],
    addPoints(n) { this.state.points += n; this.saves++; },
    recordSighting(p) { this.pages.push(p); },
  };
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const said = [];
  let chimes = 0;
  const life = createReefHuntLife({ scene, THREE, progression, log, audio: { chime: () => { chimes++; } }, say: (t) => said.push(t) });
  return { scene, progression, log, life, said, chimes: () => chimes, at: (x, z) => life.update(0.05, 0, { x, z, y: 0 }), meshes: () => Object.fromEntries(life.meshes.map((m) => [m.name, m.visible])) };
}
const go = (w, p) => w.at(p.x, p.z);

describe('the hunt on a walk', () => {
  it('finds each step in order and not before: the clues are silent until the map is in, the chest until the third clue', () => {
    const w = walk(0);
    expect(w.meshes()).toEqual({ 'reef:torn-map': true, 'reef:x-mark': false, 'reef:captain-chest': false });
    go(w, W.WRECK_CLUES[0]); go(w, W.CHEST_SPOT);
    expect(w.progression.state.reef.wreck).toBe(0);
    go(w, W.MAP_SPOT);
    expect(w.progression.state.reef.wreck).toBe(1);
    expect(w.progression.pages).toEqual(['rfmap']);
    expect(w.meshes()['reef:torn-map']).toBe(false);
    go(w, W.WRECK_CLUES[2]); go(w, W.WRECK_CLUES[1]); go(w, W.CHEST_SPOT);
    expect(w.progression.state.reef.wreck).toBe(1);
    for (const [i, bits] of [[0, 3], [1, 7], [2, 15]]) { go(w, W.WRECK_CLUES[i]); expect(w.progression.state.reef.wreck).toBe(bits); }
    expect(w.meshes()).toEqual({ 'reef:torn-map': false, 'reef:x-mark': true, 'reef:captain-chest': false });
    expect(w.said).toEqual([phrase('reef.hunt.map'), phrase('reef.hunt.clue0'), phrase('reef.hunt.clue1'), phrase('reef.hunt.clue2')]);
  });
  it('the chest gives the bandana once, worn when the neck is bare, and the paws once ever, and no mouse', () => {
    const w = walk(15);
    const before = w.progression.state.points;
    go(w, W.CHEST_SPOT);
    const st = w.progression.state;
    expect(st.reef.wreck).toBe(31);
    expect(st.points - before).toBe(AWARDS.reefwreck);
    expect(AWARDS.reefwreck).toBe(40);
    expect(st.unlocked.accessories).toEqual(['piratebandana']);
    expect(st.equipped.neck).toBe('piratebandana');
    expect(w.progression.pages).toEqual(['rfcaptchest']);
    expect(w.meshes()).toEqual({ 'reef:torn-map': false, 'reef:x-mark': false, 'reef:captain-chest': true });
    for (let i = 0; i < 5; i++) go(w, W.CHEST_SPOT);
    expect(st.points - before).toBe(AWARDS.reefwreck);
    expect(st.unlocked.accessories).toEqual(['piratebandana']);
    expect(w.progression.pages).toEqual(['rfcaptchest']);
    expect(st).not.toHaveProperty('golden');
    // a later walk with the chest already dug: nothing is paid or given again
    const again = walk(31); again.progression.state.unlocked.accessories.push('piratebandana');
    go(again, W.CHEST_SPOT); go(again, W.MAP_SPOT);
    expect(again.progression.state.points).toBe(0);
    expect(again.progression.state.unlocked.accessories).toEqual(['piratebandana']);
    expect(again.meshes()['reef:captain-chest']).toBe(true);
  });
  it('a worn neck piece is kept: the bandana is owned and the neck is left alone', () => {
    const w = walk(15, { neck: 'bandana' });
    go(w, W.CHEST_SPOT);
    expect(w.progression.state.equipped.neck).toBe('bandana');
    expect(w.progression.state.unlocked.accessories).toContain('piratebandana');
  });
  it('every walk ending: a walk that ends (dispose) at any step leaves a whole record, and the next walk starts on the same step', () => {
    for (let n = 0; n < 5; n++) {
      const w = walk(0);
      const evs = [W.MAP_SPOT, W.WRECK_CLUES[0], W.WRECK_CLUES[1], W.WRECK_CLUES[2], W.CHEST_SPOT];
      for (let i = 0; i < n; i++) go(w, evs[i]);
      const saved = JSON.parse(JSON.stringify(w.progression.state.reef));
      w.life.dispose(); // the walk ends: leaving by the arch, a resume, a lift, the cat's own end
      expect(w.scene.children.length, `step ${n}`).toBe(0);
      expect(fresh(saved)).toEqual(saved);
      expect(saved.wreck).toBe((1 << n) - 1);
      const next = walk(saved.wreck);
      expect(H.nextGoal(next.progression.state.reef).kind).toBe(['map', 'clue', 'clue', 'clue', 'chest'][n]);
      go(next, evs[n]);
      expect(next.progression.state.reef.wreck).toBe((2 << n) - 1);
    }
  });
  it('a partner\'s step is credited in order, with the bandana and no paws for her; nothing is saved twice', () => {
    const w = walk(0);
    expect(w.life.credit({ kind: 'clue', clue: 1 })).toBe('clue');
    expect(w.progression.state.reef.wreck).toBe(7);
    expect(w.life.credit({ kind: 'chest' })).toBe('chest');
    expect(w.progression.state.reef.wreck).toBe(31);
    expect(w.progression.state.points).toBe(0);
    expect(w.progression.state.unlocked.accessories).toEqual(['piratebandana']);
    expect(w.life.credit({ kind: 'chest' })).toBeNull();
    expect(w.life.credit({ kind: 'junk' })).toBeNull();
  });
  it('a hostile record on a walk is repaired, never thrown on', () => {
    for (const junk of [undefined, null, 5, 'x', {}, { wreck: -1 }, { wreck: NaN }, { wreck: 1e9 }, { wreck: '9' }, { wreck: [4] }]) {
      const w = walk(0); w.progression.state.reef = junk;
      expect(() => { w.at(1, 1); go(w, W.MAP_SPOT); go(w, W.CHEST_SPOT); }).not.toThrow();
      expect(w.life.state.wreck & (w.life.state.wreck + 1)).toBe(0);
    }
    const none = createReefHuntLife({ scene: new THREE.Scene(), THREE });
    expect(() => { none.update(0.05, 0, { x: W.MAP_SPOT.x, z: W.MAP_SPOT.z }); none.update(0.05, 0, null); none.dispose(); }).not.toThrow();
  });
  it('the life is in the Reef\'s life and the credit chain: ctx\'s progression, no light, no random number', () => {
    const area2 = build(new THREE.Scene());
    const scene = new THREE.Scene();
    const progression = { state: { reef: rec(0), unlocked: { accessories: [] }, equipped: {} }, addPoints() {}, recordSighting() {} };
    const life = area2.life({ scene, player: null, progression, log: null, audio: null, reducedMotion: true, doc: null });
    expect(scene.getObjectByName('reef:torn-map')).toBeTruthy();
    expect(life.credit({ kind: 'map' })).toBe('map');
    expect(progression.state.reef.wreck).toBe(1);
    let lights = 0; scene.traverse((o) => { if (o.isPointLight) lights++; });
    expect(lights).toBeLessThanOrEqual(1); // the Sealab's one light; the hunt adds none
    life.dispose();
  });
});

describe('the save seams, hostile payloads', () => {
  const merge = (a, b) => mergeSaves({ local: sanitizeSave({ version: 4, reef: a }), cloud: sanitizeSave({ version: 4, reef: b }) }).save;
  it('the sanitiser holds wreck to 2^n - 1 in 0..31 for any input, and keeps the other keys', () => {
    for (const junk of [undefined, null, -1, NaN, Infinity, -Infinity, 2.5, '31', '4', [16], {}, 1e9, 2 ** 40, 0, 1, 2, 4, 8, 16, 32, 33, true, 'a']) {
      const r = fresh({ step: 3, wreck: junk });
      expect(Number.isInteger(r.wreck) && r.wreck >= 0 && r.wreck <= 31, String(junk)).toBe(true);
      expect(r.wreck & (r.wreck + 1), String(junk)).toBe(0);
      expect(r.step).toBe(3);
    }
    expect(fresh({ wreck: 16 }).wreck).toBe(31);
    expect(fresh({ wreck: 8 }).wreck).toBe(15);
  });
  it('the merge ORs the devices then fills: a map on one and a clue on the other leave the lower bits whole', () => {
    expect(merge({ wreck: 1 }, { wreck: 4 }).reef.wreck).toBe(7);
    expect(merge({ wreck: 2 }, { wreck: 16 }).reef.wreck).toBe(31);
    expect(merge({ wreck: 0 }, { wreck: 0 }).reef.wreck).toBe(0);
    expect(merge({ wreck: 1e9 }, { wreck: -5 }).reef.wreck).toBe(31);
    expect(merge({ wreck: 'x' }, { wreck: NaN }).reef.wreck).toBe(0);
  });
  it('the bandana is owned whenever the chest bit is set (after a merge too), never otherwise, and cannot be bought', () => {
    const owns = (save) => save.unlocked.accessories.includes('piratebandana');
    expect(owns(sanitizeSave({ version: 4, reef: { wreck: 31 } }))).toBe(true);
    expect(owns(sanitizeSave({ version: 4, reef: { wreck: 16 } }))).toBe(true);
    expect(owns(sanitizeSave({ version: 4, reef: { wreck: 15 } }))).toBe(false);
    expect(owns(sanitizeSave({ version: 4, reef: { wreck: 'junk' } }))).toBe(false);
    expect(owns(merge({ wreck: 16 }, { wreck: 0 }))).toBe(true);
    expect(owns(merge({ wreck: 15 }, { wreck: 3 }))).toBe(false);
    expect(CATALOG.accessories.piratebandana).toMatchObject({ name: 'Pirate Bandana', slot: 'neck', price: 0, prize: true });
    expect(CATALOG.accessories.piratebandana.find).toBeUndefined(); // never hidden on the ground: the chest is the only way
    const worn = sanitizeSave({ version: 4, reef: { wreck: 31 }, equipped: { neck: 'piratebandana' } });
    expect(worn.equipped.neck).toBe('piratebandana');
    const forged = sanitizeSave({ version: 4, reef: { wreck: 0 }, equipped: { neck: 'piratebandana' } });
    expect(forged.equipped.neck).toBeNull();
  });
  it('the bandana is a neckerchief on the neck, one band and one cloth, and not a hat', () => {
    const cat = buildCat('tabby', { neck: 'piratebandana' });
    const bare = buildCat('tabby', {});
    let a = 0; let b = 0;
    cat.traverse((o) => { if (o.isMesh) a++; }); bare.traverse((o) => { if (o.isMesh) b++; });
    expect(a - b).toBe(2);
    expect(CATALOG.accessories.piratebandana.slot).not.toBe('head');
  });
});

describe('the words and the source rules', () => {
  const ids = Object.keys(LINES);
  it('every id is a literal phrase in both sets, kind and free of banned words', () => {
    expect(ids).toEqual(['reef.hunt.map', 'reef.hunt.clue0', 'reef.hunt.clue1', 'reef.hunt.clue2', 'reef.hunt.chest', 'reef.hunt.chest.on']);
    for (const id of ids) expect(phrase(id).length, id).toBeGreaterThan(3);
    withOffWords(() => { for (const id of ids) expect(bannedIn(phrase(id)), id).toBeNull(); });
    const src = readFileSync('src/world/reefhuntlive.js', 'utf8');
    for (const id of ids) expect(src.includes(`phrase('${id}')`), id).toBe(true);
  });
  it('the pages: the map and the chest are reserved ids with names and hints in both sets; the wing page switch is the galleon\'s (R16) and untouched', () => {
    for (const set of [() => 1, withOffWords]) set(() => {
      expect(REEF_PAGE_WORDS.rfmap.name()).toBe('The Torn Map'); expect(REEF_PAGE_WORDS.rfmap.hint()).toBe('A torn map lies in the old cabin.');
      expect(REEF_PAGE_WORDS.rfcaptchest.name()).toBe('Captain’s Chest'); expect(REEF_PAGE_WORDS.rfcaptchest.hint()).toBe('X marks where a chest lies buried.');
    });
    expect(WING_LIVE.wreck).toBe(true);
  });
  it('the files draw no random number, read no clock, add no light, and use no banned word', () => {
    const banned = /\b(dark|lost forever|trapped|stuck|collapse|cave-in|scary|Zissou|Belafonte|Aquatic|cap|beanie)\b/i;
    for (const f of ['reefwreck', 'reefhuntlive', 'reefhuntwords']) {
      const text = readFileSync(`src/world/${f}.js`, 'utf8').replace(/\/\/.*$/gm, '');
      expect(text, f).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date|PointLight|setTimeout|requestAnimationFrame/);
      expect(text, f).not.toMatch(banned);
    }
    const parts = readFileSync('src/cat/foundneck.js', 'utf8').match(/piratebandana[^\n]*/g).join('\n');
    expect(parts).not.toMatch(banned);
  });
  it('the pure file imports only the plan, the hunt\'s live file only the wreck stage\'s own files', () => {
    for (const f of ['reefwreck', 'reefhuntlive']) for (const [, spec] of readFileSync(`src/world/${f}.js`, 'utf8').matchAll(/^import .*?from '(.+?)';/gm)) expect(spec, f).toMatch(/^(\.\/reefwreck\w*\.js|\.\/reefhunt\w+\.js|\.\.\/clanphrases\.js)$/);
  });
});
