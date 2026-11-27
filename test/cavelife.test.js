// The Crystal Cave's friendly life (layer 4): the plans and poses are pure and in bounds, the creatures never come at her (no pose reads her), the drawing (outward winding, three draws),
// reduced motion, the rungs, photo and journal registration for all seven kinds, and the words in both sets.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { memoryStorage } from './helpers/storage.js';

stubCanvasDocument();
const L = await import('../src/world/cavelife.js');
const D = await import('../src/world/cavelifeparts.js');
const { createCaveLife } = await import('../src/world/cavelifelive.js');
const { LINES, HINTS } = await import('../src/world/cavelifewords.js');
const P = await import('../src/world/crystalplan.js');
const W = await import('../src/world/crystalwingplan.js');
const C = await import('../src/world/crystalcritters.js');
const Dc = await import('../src/world/crystaldecor.js');
const { build } = await import('../src/world/crystal.js');
const { phrase, hasPhrase } = await import('../src/clanphrases.js');
const { CRITTER_INFO, renderJournalHtml } = await import('../src/journal.js');
const { JOURNAL_TYPES, createProgression } = await import('../src/progression.js');
const { CAVE_LIFE_PAGES, CRYSTAL_PAGE_WORDS, CRYSTAL_HINTS } = await import('../src/crystalpages.js');
const { crystalColliders, CRYSTAL_BOUNDS: B } = P;

const walk = (o = {}) => { const scene = new THREE.Scene(); const life = createCaveLife({ scene, ...o }); return { scene, life }; };
const IDS = ['clfish', 'clbat', 'clfirefly', 'clmoth', 'clsalamander', 'clbeetle', 'clcrab'];
const sweep = (fn, secs = 240, step = 0.7) => { for (let t = 0; t < secs; t += step) fn(t); };
const inBounds = (p) => p.x > B.minX && p.x < B.maxX && p.z > B.minZ && p.z < B.maxZ && Number.isFinite(p.y);

describe('the poses', () => {
  it('the salts differ from every other creature\'s and the decor\'s', () => {
    const all = [...Object.values(L.SALTS), ...Object.values(C.SALTS), ...Object.values(Dc.SALTS)];
    expect(new Set(all).size).toBe(all.length);
  });
  it('are pure: the same time gives the same pose, and no pose takes her position', () => {
    for (let i = 0; i < 9; i++) { expect(L.fishPose(i % 9, 41.3, {})).toEqual(L.fishPose(i % 9, 41.3, {})); expect(L.hangPose(i, 7.7, {})).toEqual(L.hangPose(i, 7.7, {})); }
    for (let i = 0; i < 3; i++) expect(L.flyPose(i, 99, {})).toEqual(L.flyPose(i, 99, {}));
    expect(L.salamanderPose(55, {})).toEqual(L.salamanderPose(55, {}));
    expect(L.crabPose(55, {})).toEqual(L.crabPose(55, {}));
    for (const f of [L.fishPose, L.hangPose, L.flyPose, L.firePos, L.mothPose, L.beetlePose]) expect(f.length).toBeLessThanOrEqual(3);
    expect(L.salamanderPose.length).toBeLessThanOrEqual(2); expect(L.crabPose.length).toBeLessThanOrEqual(2);
  });
  it('the fish stay in the pool, clear of the stepping crystals, in a school of 6 to 10 that loops', () => {
    expect(L.LIFE_COUNT.high.fish).toBeGreaterThanOrEqual(6); expect(L.LIFE_COUNT.high.fish).toBeLessThanOrEqual(10);
    const seen = new Set();
    for (let i = 0; i < L.LIFE_COUNT.high.fish; i++) sweep((t) => {
      const p = L.fishPose(i, t, {});
      expect(Math.hypot(p.x - W.POOL.x, p.z - W.POOL.z)).toBeLessThan(W.POOL.r - 0.5);
      for (const s of W.STEPPING) expect(Math.hypot(p.x - s.x, p.z - s.z)).toBeGreaterThan(s.r);
      seen.add(Math.round(p.x));
    }, 300);
    expect(seen.size).toBeGreaterThan(2);
  });
  it('three bat colonies hang from the dome inside the walls; two or three flyers loop high, about a minute round, over the floor', () => {
    expect(L.colonies()).toHaveLength(3);
    for (const c of L.colonies()) { expect(Math.hypot(c.x, c.z)).toBeGreaterThan(30); expect(c.y).toBeGreaterThan(9); }
    expect(L.LIFE_COUNT.high.hang).toBeGreaterThanOrEqual(6); expect(L.LIFE_COUNT.high.fly).toBeGreaterThanOrEqual(2); expect(L.LIFE_COUNT.high.fly).toBeLessThanOrEqual(3);
    for (let i = 0; i < 9; i++) sweep((t) => { const p = L.hangPose(i, t, {}); expect(p.twitch).toBeGreaterThanOrEqual(0); expect(p.twitch).toBeLessThanOrEqual(1); });
    for (let i = 0; i < 3; i++) {
      sweep((t) => { const p = L.flyPose(i, t, {}); expect(inBounds(p)).toBe(true); expect(p.y - P.crystalY(p.x, p.z)).toBeGreaterThan(4); }, 130, 0.5);
      const a = L.flyPose(i, 3, {}); const b = L.flyPose(i, 3 + L.FLY.period, {});
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.01); // a full loop in a minute
    }
  });
  it('the fireflies drift round the first three mushroom clumps and glow between 0.1 and 1', () => {
    const cs = L.cloudCentres(); expect(cs).toHaveLength(3);
    for (let i = 0; i < 36; i++) sweep((t) => { const p = L.firePos(i, t, {}); const c = cs[i % 3]; expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeLessThan(2.1); expect(p.glow).toBeGreaterThanOrEqual(0.1); expect(p.glow).toBeLessThanOrEqual(1); }, 120, 1.3);
  });
  it('the moths circle the great crystals clear of them, the beetles stay by their gardens, the salamander and the crab stay on the pool\'s rim and shallows', () => {
    for (let i = 0; i < 4; i++) sweep((t) => { const p = L.mothPose(i, t, {}); const g = L.MOTH_AT[i]; expect(Math.hypot(p.x - g.x, p.z - g.z)).toBeGreaterThan(1.3); expect(inBounds(p)).toBe(true); }, 120, 0.4);
    for (let i = 0; i < 5; i++) sweep((t) => { const p = L.beetlePose(i, t, {}); const h = L.beetleHomes()[i]; expect(Math.hypot(p.x - h.x, p.z - h.z)).toBeLessThan(0.9); }, 120, 0.4);
    let moved = 0; let still = 0; let last = null;
    sweep((t) => {
      const p = L.salamanderPose(t, {}); const r = Math.hypot(p.x - W.POOL.x, p.z - W.POOL.z);
      expect(r).toBeGreaterThan(W.POOL.r); expect(r).toBeLessThan(W.POOL.r + 1);
      expect(Math.hypot(p.x - W.SKY_STONE.x, p.z - W.SKY_STONE.z)).toBeGreaterThan(3);
      for (const c of crystalColliders()) expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThan(c.r + 0.4);
      if (last) { if (Math.hypot(p.x - last.x, p.z - last.z) > 1e-6) moved++; else still++; } last = { x: p.x, z: p.z };
    }, 400, 0.5);
    expect(moved).toBeGreaterThan(50); expect(still).toBeGreaterThan(50); // it strolls and it pauses
    sweep((t) => { const p = L.crabPose(t, {}); expect(Math.hypot(p.x - W.POOL.x, p.z - W.POOL.z)).toBeLessThan(W.POOL.r - 0.2); }, 120, 0.3);
  });
  it('the moving creatures never stand where a collider is', () => {
    const cols = crystalColliders();
    for (let i = 0; i < 5; i++) sweep((t) => { const p = L.beetlePose(i, t, {}); for (const c of cols) expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThan(c.r); }, 120, 0.5);
    sweep((t) => { const p = L.crabPose(t, {}); for (const c of cols) expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThan(c.r); }, 120, 0.5);
  });
});

describe('the drawing', () => {
  it('is three draws (the lit soup, the glow soup, the fireflies) and none a caster; LOW and LITE keep fewer', () => {
    const hi = walk({}); expect(hi.scene.children).toHaveLength(3);
    for (const o of hi.scene.children) { expect(o.castShadow).toBeFalsy(); expect(o.userData.noMerge).toBe(true); }
    const lo = walk({ tier: { name: 'low' } }); const lite = walk({ tier: { shadows: false } });
    expect(lo.life.rung).toBe('low'); expect(lite.life.rung).toBe('lite');
    expect(lo.life.counts.triangles).toBeLessThan(hi.life.counts.triangles * 0.8);
    expect(lite.life.counts.triangles).toBeLessThan(lo.life.counts.triangles);
    expect(hi.life.counts.triangles).toBeLessThan(12000);
    for (const k of ['fish', 'hang', 'fly', 'fire', 'moth', 'beetle']) { expect(lo.life.counts[k]).toBeLessThan(hi.life.counts[k]); expect(lite.life.counts[k]).toBeLessThanOrEqual(lo.life.counts[k]); }
  });
  it('every vertex is finite and every triangle winds outward from its own blob (a unit sphere\'s normals point out)', () => {
    const { scene, life } = walk({}); for (let i = 0; i < 10; i++) life.update(0.5, i);
    scene.traverse((o) => { if (o.geometry) for (const k of Object.keys(o.geometry.attributes)) for (const v of o.geometry.attributes[k].array) expect(Number.isFinite(v)).toBe(true); });
    const s = new D.Soup(1000); const m = D.frame(D.mat(), 1, 2, 3, 0.7, 0.2, 0.1, 1.5);
    D.blob(s, m, 1, 2, 1.5, 0xffffff, 0x000000, 8, 5);
    expect(s.k).toBeGreaterThan(0);
    for (let v = 0; v < s.k; v += 3) {
      const e = (i) => [s.p[(v + i) * 3], s.p[(v + i) * 3 + 1], s.p[(v + i) * 3 + 2]];
      const a = e(0); const b = e(1); const c = e(2);
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const out = [(a[0] + b[0] + c[0]) / 3 - 1, (a[1] + b[1] + c[1]) / 3 - 2, (a[2] + b[2] + c[2]) / 3 - 3];
      expect(n[0] * out[0] + n[1] * out[1] + n[2] * out[2]).toBeGreaterThan(0);
    }
  });
  it('moves with time, and reduced motion freezes everything at time zero', () => {
    const snap = (scene) => { const out = []; scene.traverse((o) => { if (o.geometry) out.push(Array.from(o.geometry.attributes.position.array.slice(0, 600))); }); return JSON.stringify(out); };
    const a = walk({}); const first = snap(a.scene); for (let i = 0; i < 40; i++) a.life.update(0.25, i * 0.25); expect(snap(a.scene)).not.toEqual(first);
    const r = walk({ reducedMotion: true }); const f0 = snap(r.scene); for (let i = 0; i < 100; i++) r.life.update(0.25, i); expect(snap(r.scene)).toEqual(f0);
    expect(f0).toEqual(first);
  });
  it('disposes everything it added', () => { const { scene, life } = walk({}); life.dispose(); expect(scene.children).toHaveLength(0); });
});

describe('photos and journal cards', () => {
  it('registers every one of the seven kinds as a photo and journal subject, each with a label and a range', () => {
    const { life } = walk({});
    expect(new Set(life.spottable.map((a) => a.type))).toEqual(new Set(IDS));
    for (const a of life.spottable) { expect(a.pos).toBeInstanceOf(THREE.Vector3); expect(a.label).toMatch(/^a /); expect(a.range).toBeGreaterThanOrEqual(4); expect(JOURNAL_TYPES).toContain(a.type); }
    for (const t of ['low', 'lite']) expect(new Set(walk({ tier: t === 'low' ? { name: 'low' } : { shadows: false } }).life.spottable.map((a) => a.type))).toEqual(new Set(IDS));
  });
  it('the cave\'s life carries the same list the walk reads', () => {
    const area = build(new THREE.Scene());
    const life = area.life({ scene: new THREE.Scene(), progression: createProgression(memoryStorage()), audio: null, tier: null, reducedMotion: false, log: { awardOnce: () => 0, count: () => 0, mark() {} }, sendEvent: () => {} });
    expect(new Set(life.spottable.map((a) => a.type))).toEqual(new Set(IDS));
    life.dispose();
  });
  it('seven pages appended after the Reef\'s last id, with names from start-up and hints from the lazy words, saved by the progression', () => {
    expect(CAVE_LIFE_PAGES.map((p) => p[0])).toEqual(IDS);
    const at = JOURNAL_TYPES.indexOf('rfsaucer') + 1;
    expect(JOURNAL_TYPES.slice(at, at + 7)).toEqual(IDS);
    expect(new Set(JOURNAL_TYPES).size).toBe(JOURNAL_TYPES.length);
    for (const [id, , , name] of CAVE_LIFE_PAGES) {
      const card = CRITTER_INFO.find((c) => c.id === id);
      expect(card.crystal).toBe(true); expect(card.name).toBe(name); expect(name.length).toBeLessThanOrEqual(14); expect(card.hint).toBe(HINTS[id]); expect(CRYSTAL_HINTS[id]).toBe(HINTS[id]);
      expect(CRYSTAL_PAGE_WORDS[id].name()).toBe(name);
      withOffWords(() => expect(bannedIn(`${card.name} ${card.hint}`)).toBeNull());
    }
    const p = createProgression(memoryStorage());
    p.recordSighting('clbat'); p.recordSighting('clfish'); p.recordSighting('clfish');
    expect(p.state.journal).toMatchObject({ clbat: 1, clfish: 2 });
    p.recordSighting('clnope'); expect(p.state.journal.clnope).toBeUndefined();
  });
  it('the journal draws the cards only with the cave on', () => {
    expect(renderJournalHtml({ clbat: 2 }, 0, 9)).not.toMatch(/Cave Bat/);
  });
  it('no gold mouse, no award and no save key is added for them', () => {
    const src = ['cavelife', 'cavelifeparts', 'cavelifelive', 'cavelifewords'].map((f) => readFileSync(`src/world/${f}.js`, 'utf8')).join('\n');
    expect(src).not.toMatch(/goldmice|recordGolden|AWARDS|localStorage|saveKey/);
  });
});

describe('the words, in both sets', () => {
  const ids = Object.keys(LINES);
  const banned = /\b(dark|lost forever|trapped|stuck|collapse\w*|cave-in|scary|scared|hurt\w*|danger\w*|dead|die|dies)\b/i;
  it('seven labels in the phrase table, short and kind, the plain base in the everyday set with no series word', () => {
    expect(ids).toHaveLength(7);
    for (const id of ids) {
      expect(hasPhrase(id), id).toBe(true);
      const s = phrase(id); expect(s).toMatch(/^a /); expect(s.length).toBeLessThanOrEqual(64); expect(s).not.toMatch(banned);
      withOffWords(() => { expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id)).not.toMatch(banned); expect(phrase(id).length).toBeLessThan(28); });
    }
    for (const h of Object.values(HINTS)) { expect(h).not.toMatch(banned); expect(h.length).toBeLessThanOrEqual(80); }
    expect(Object.keys(HINTS)).toEqual(IDS);
  });
  it('every phrase(...) call in the life\'s files is a literal id in the table, and the seven labels are all used', () => {
    for (const f of ['cavelifelive', 'cavelifeparts', 'cavelife']) for (const m of readFileSync(`src/world/${f}.js`, 'utf8').replace(/\/\/.*$/gm, '').matchAll(/\bphrase\(([^)]*)\)/g)) { expect(m[1]).toMatch(/^'[a-z0-9.]+'$/); expect(ids).toContain(m[1].slice(1, -1)); }
    const used = [...readFileSync('src/world/cavelifelive.js', 'utf8').matchAll(/phrase\('([a-z.]+)'\)/g)].map((m) => m[1]);
    expect([...new Set(used)].sort()).toEqual([...ids].sort());
  });
});

describe('the source rules', () => {
  it('draw no random number, read no clock; the plans import no THREE', () => {
    for (const f of ['cavelife', 'cavelifeparts', 'cavelifelive', 'cavelifewords']) expect(readFileSync(`src/world/${f}.js`, 'utf8').replace(/\/\/.*$/gm, ''), f).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date/);
    expect(readFileSync('src/world/cavelife.js', 'utf8')).not.toMatch(/from 'three'/);
  });
  it('adds no real light (the cave keeps one PointLight)', () => {
    for (const f of ['cavelifeparts', 'cavelifelive', 'crystaldecorparts']) expect(readFileSync(`src/world/${f}.js`, 'utf8')).not.toMatch(/PointLight|SpotLight|DirectionalLight|AmbientLight/);
  });
});
