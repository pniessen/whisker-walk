// The Treehouse village, milestone T4: the friendly life (songbirds, owl, fireflies, falling leaves), the creak and the chime, three live life pages (tl1..tl3), the music theme.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync, globSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';

stubCanvasDocument();

const { CRITTER_INFO, renderJournalHtml } = await import('../src/journal.js');
const { setTreehouse } = await import('../src/treehouseflag.js');
const { TREEHOUSE_LIFE_PAGES, TREEHOUSE_LIVE_PAGES, TREEHOUSE_HINTS } = await import('../src/treehousepages.js');
const { JOURNAL_TYPES } = await import('../src/progression.js');
const { loadTreehouseStages, ST } = await import('../src/world/treehousestages.js');
await loadTreehouseStages();
const { build } = await import('../src/world/treehouse.js');
const C = await import('../src/world/treehousecritters.js');
const P = await import('../src/world/treehouseplan.js');
const { LINES, HINTS } = await import('../src/world/treehousecritterwords.js');
const { phrase } = await import('../src/clanphrases.js');
const { THEMES } = await import('../src/musicthemes.js');

const mkCtx = (o = {}) => ({ scene: new THREE.Scene(), reducedMotion: false, tier: null, audio: null, ...o });
const fakeAudio = (muted) => {
  const log = { ctx: 0, osc: 0, flt: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect() {}, gain: param(), frequency: param(), Q: param(), start() {}, stop() {} });
  const ac = { currentTime: 0, destination: {}, createGain: node, createOscillator: () => { log.osc++; return node(); }, createBiquadFilter: () => { log.flt++; return node(); } };
  return { log, isMuted: () => muted, getContext: () => { log.ctx++; return ac; } };
};

describe('the poses are pure and gentle', () => {
  it('a bird keeps to its own deck rail, perched at the ends and in the air between', () => {
    for (let i = 0; i < 3; i++) {
      const [a, b] = C.birdPosts(i);
      expect(a.y).toBeGreaterThan(P.deckOf(C.BIRD_DECKS[i]).y + P.RAIL_H);
      let air = 0;
      for (let t = 0; t < 120; t += 0.1) {
        const o = C.birdPose(i, t, {}); const again = C.birdPose(i, t, {});
        expect(o).toEqual(again);
        expect(o.k).toBeGreaterThanOrEqual(0); expect(o.k).toBeLessThanOrEqual(1);
        const k = (o.x - a.x) / (b.x - a.x); expect(k).toBeCloseTo(o.k, 6);
        if (o.flying) air++;
      }
      expect(air).toBeGreaterThan(5); expect(air).toBeLessThan(500);
      expect(C.birdPose(i, 33, {}, true).flying).toBe(false);
    }
  });
  it('fireflies wander near their places and glow between 0 and 1; leaves fall from the canopy to the floor', () => {
    for (let i = 0; i < 18; i++) for (const t of [0, 5.5, 140]) {
      const f = C.fireflyAt(i, t, {}); const c = C.FIREFLY_PLACES[i % C.FIREFLY_PLACES.length];
      expect(Math.hypot(f.x - c.x, f.z - c.z)).toBeLessThan(4.2);
      expect(f.y).toBeGreaterThan(c.y); expect(f.y).toBeLessThan(c.y + 2);
      expect(f.glow).toBeGreaterThanOrEqual(0); expect(f.glow).toBeLessThanOrEqual(1);
    }
    for (let i = 0; i < 20; i++) for (let t = 0; t < 200; t += 7) {
      const l = C.leafAt(i, t, {});
      expect(l.y).toBeGreaterThan(0); expect(l.y).toBeLessThanOrEqual(C.LEAF_FALL.top);
      expect(Math.abs(l.x)).toBeLessThan(C.LEAF_FALL.spread);
    }
  });
  it('the owl sits on its ledge on the Bell Tower, clear of the wall and the window', () => {
    const k = P.deckOf('crown');
    expect(C.OWL.y).toBeGreaterThan(k.y + 2); expect(C.OWL.y).toBeLessThan(k.y + k.hut.h);
    expect(Math.abs(C.OWL.x - k.hut.x)).toBeGreaterThan(0.6); expect(Math.abs(C.OWL.x - k.hut.x)).toBeLessThan(k.hut.r * 0.95);
  });
});

describe('the life on a walk', () => {
  it('is wired into the area, spottable as three journal pages, and cleans up after itself', () => {
    expect(ST.branches.critters).toBe(C.createTreehouseCritters);
    expect(ST.branches.finds).toBeTruthy(); // the T3 slot stays
    const scene = new THREE.Scene();
    const area = build(scene);
    const life = area.life({ scene, reducedMotion: false, tier: null, audio: null, progression: null, sendEvent: () => {} });
    expect(life.spottable.map((s) => s.type)).toEqual(['tl1', 'tl2', 'tl3']);
    for (const s of life.spottable) { expect(JOURNAL_TYPES).toContain(s.type); expect(s.label).toMatch(/\S/); expect(s.range).toBeGreaterThan(0); }
    const names = () => scene.children.filter((o) => /^treehouse:(bird|owl|ledge|fireflies|fallingleaves)/.test(o.name)).length;
    expect(names()).toBe(7);
    life.update(0.016, 1, { x: 0, y: 0, z: 25 }, null, null);
    life.dispose();
    expect(names()).toBe(0);
  });
  it('the lower rungs keep fewer birds, fireflies and leaves, and no light is added', () => {
    const run = (tier) => { const c = mkCtx({ tier }); const l = C.createTreehouseCritters(c); const n = { rung: l.rung, ...l.counts }; const lights = []; c.scene.traverse((o) => o.isLight && lights.push(o)); l.dispose(); return { n, lights: lights.length }; };
    const hi = run(null); const low = run({ name: 'low' }); const lite = run({ shadows: false });
    expect([hi.n.rung, low.n.rung, lite.n.rung]).toEqual(['high', 'low', 'lite']);
    expect(hi.n.birds).toBeGreaterThan(low.n.birds); expect(low.n.birds).toBeGreaterThan(lite.n.birds);
    expect(hi.n.flies).toBeGreaterThan(low.n.flies); expect(low.n.flies).toBeGreaterThan(lite.n.flies);
    expect(hi.n.leaves).toBeGreaterThan(low.n.leaves); expect(low.n.leaves).toBeGreaterThan(lite.n.leaves);
    expect(hi.lights + low.lights + lite.lights).toBe(0);
  });
  it('reduced motion draws once, keeps fewer leaves and holds still', () => {
    const c = mkCtx({ reducedMotion: true }); const l = C.createTreehouseCritters(c);
    const snap = () => c.scene.children.map((o) => (o.isPoints ? Array.from(o.geometry.attributes.position.array).join() : o.position.toArray().join() + o.rotation.y + o.scale.y)).join('|');
    const first = snap();
    for (let t = 1; t < 30; t += 1) l.update(0.5, t, { x: 0, y: 0, z: 25 });
    expect(snap()).toBe(first);
    expect(l.counts.leaves).toBe(C.STILL_LEAVES);
    expect(c.scene.getObjectByName('treehouse:bird0').userData.noMerge).toBe(true);
    l.dispose();
  });
  it('moves with the clock when motion is allowed', () => {
    const c = mkCtx(); const l = C.createTreehouseCritters(c);
    const lv = c.scene.getObjectByName('treehouse:fallingleaves'); const a = Array.from(lv.geometry.attributes.position.array);
    l.update(0.5, 10, { x: 0, y: 0, z: 25 });
    expect(Array.from(lv.geometry.attributes.position.array)).not.toEqual(a);
    l.dispose();
  });
  it('draws no random number and reads no clock; allocates nothing per frame', () => {
    for (const f of ['src/world/treehousecritters.js', 'src/world/treehousecritterwords.js']) {
      const code = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date|new THREE\.PointLight|SpotLight/);
    }
    const code = readFileSync('src/world/treehousecritters.js', 'utf8').replace(/\/\/.*$/gm, '');
    const upd = code.slice(code.indexOf('function draw(t)'), code.indexOf('draw(0);'));
    expect(upd).not.toMatch(/new THREE\.|new Float32Array|\.clone\(\)/);
    const nb = code.slice(code.indexOf('export function nearBridge'), code.indexOf('export function createTreehouseCritters'));
    expect(nb).not.toMatch(/new |\[\s*\.\.\.|\.map\(|\.filter\(/);
  });
});

describe('the sound', () => {
  it('is silent when muted: no context is asked for and no node made', () => {
    const a = fakeAudio(true);
    expect(C.chimeNote(a, 0)).toBe(false); expect(C.creakNote(a, 0)).toBe(false);
    const l = C.createTreehouseCritters(mkCtx({ audio: a }));
    for (let i = 0; i < 200; i++) l.update(0.1, i * 0.5, { x: i * 0.5, y: 3, z: 25 });
    expect(a.log).toEqual({ ctx: 0, osc: 0, flt: 0 });
    l.dispose();
  });
  it('creaks on every stride on the wood but not on the ground or on a jump, and chimes now and then', () => {
    const a = fakeAudio(false);
    const l = C.createTreehouseCritters(mkCtx({ audio: a }));
    l.update(0.1, 1, { x: 0, y: 0, z: 25 });
    for (let i = 1; i <= 20; i++) l.update(0.1, 1 + i * 0.1, { x: 0, y: 0, z: 25 - i * 0.5 }); // 10 m on the ground
    expect(a.log.flt).toBe(0);
    l.update(0.1, 3.2, { x: 0, y: 2.8, z: 5 }); // up a deck: a jump, nothing
    for (let i = 1; i <= 20; i++) l.update(0.1, 3.2 + i * 0.1, { x: 0, y: 2.8, z: 5 - i * 0.5 }); // 10 m on a deck
    expect(a.log.flt).toBe(Math.floor(10 / C.STEP_METRES));
    expect(a.log.osc).toBe(a.log.flt); // no chime yet
    const before = a.log.flt;
    l.update(0.1, C.CHIME_GAP.first + 0.5, { x: 30, y: 0, z: -20 }); // time to chime (and a jump)
    expect(a.log.flt).toBe(before);
    expect(a.log.osc).toBe(before + 4); // two notes, a partial each
    l.update(0.1, C.CHIME_GAP.first + 1, { x: 30, y: 0, z: -20 });
    expect(a.log.osc).toBe(before + 4); // the next is a long while off
    l.dispose();
  });
  it('without a height the bridge itself creaks', () => {
    const w = P.BRIDGE_LINES[0][2];
    expect(C.nearBridge(w.x, w.z)).toBe(true); expect(C.nearBridge(0, 25)).toBe(false);
  });
  it('has its music theme: light woody marimba with a bell now and then', () => {
    expect(THEMES.treehouse).toMatchObject({ voice: 'mar', altVoice: 'chime', root: 4, beat: 0.5 });
  });
});

describe('the life pages, both word sets', () => {
  it('tl1..tl3 are live, named alike in both sets, hidden behind the flag; hints and lines exist and are kind', () => {
    expect(TREEHOUSE_LIFE_PAGES.map((p) => p[0])).toEqual(['tl1', 'tl2', 'tl3']);
    expect(TREEHOUSE_LIVE_PAGES).toHaveLength(9);
    for (const [id, , name] of TREEHOUSE_LIFE_PAGES) {
      expect(HINTS[id]).toMatch(/\S/); expect(TREEHOUSE_HINTS[id]).toBe(HINTS[id]);
      const card = CRITTER_INFO.find((c) => c.id === id);
      expect(card.treehouse).toBe(true); expect(card.name).toBe(name); expect(card.later).toBeUndefined();
      withOffWords(() => { expect(bannedIn(name), id).toBeNull(); expect(bannedIn(HINTS[id]), id).toBeNull(); });
      expect(`${name} ${HINTS[id]}`).not.toMatch(/\b(dark|lost forever|trapped|stuck|collapse|scary)\b/i);
    }
    try {
      setTreehouse(false); expect(renderJournalHtml({ tl1: 1 }, 0, 9)).not.toContain('The Rail Songbirds');
      setTreehouse(true); expect(renderJournalHtml({ tl1: 1 }, 0, 9)).toContain('The Rail Songbirds');
    } finally { setTreehouse(null); }
  });
  it('the everyday set has no series word and no literal Clan; neither set has a banned word', () => {
    const ids = Object.keys(LINES);
    expect(ids).toEqual(['treehouse.life.bird', 'treehouse.life.owl', 'treehouse.life.firefly']);
    for (const id of ids) {
      expect(phrase(id)).toMatch(/\S/);
      expect(phrase(id)).not.toMatch(/\b(dark|lost forever|trapped|stuck|collapse|scary)\b/i);
      expect(withOffWords(() => bannedIn(phrase(id))), id).toBeNull();
      expect(phrase(id).length).toBeLessThan(80);
    }
    expect(withOffWords(() => phrase('treehouse.life.owl'))).toBe('a sleepy owl');
    expect(phrase('treehouse.life.owl')).not.toBe('a sleepy owl');
    for (const f of globSync('src/world/treehousecritter*.js')) expect(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, ''), f).not.toMatch(/\bClan\b/);
  });
});
