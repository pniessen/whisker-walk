// Snowville, milestone V4: the friendly life (otters, hare, robin, fox kit, chimney smoke), the bells and the crunch, three live life pages (sw1..sw3), the music theme.
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync, globSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';

stubCanvasDocument();

const { CRITTER_INFO, renderJournalHtml } = await import('../src/journal.js');
const { setSnowville } = await import('../src/snowvilleflag.js');
const { SNOWVILLE_LIFE_PAGES, SNOWVILLE_LIVE_PAGES, SNOWVILLE_HINTS } = await import('../src/snowvillepages.js');
const { JOURNAL_TYPES } = await import('../src/progression.js');
const { loadSnowvilleStages, ST } = await import('../src/world/snowvillestages.js');
await loadSnowvilleStages();
const { build } = await import('../src/world/snowville.js');
const C = await import('../src/world/snowvillecritters.js');
const P = await import('../src/world/snowvilleplan.js');
const { LINES, HINTS } = await import('../src/world/snowvillecritterwords.js');
const { phrase } = await import('../src/clanphrases.js');
const { THEMES } = await import('../src/musicthemes.js');

const mkCtx = (o = {}) => ({ scene: new THREE.Scene(), reducedMotion: false, tier: null, audio: null, ...o });
const fakeAudio = (muted) => {
  const log = { ctx: 0, osc: 0, src: 0 };
  const node = () => ({ connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 }, frequency: { value: 0 }, Q: { value: 0 }, start() {}, stop() {} });
  const ac = { currentTime: 0, sampleRate: 8000, destination: {}, createGain: node, createOscillator: () => { log.osc++; return node(); }, createBiquadFilter: node,
    createBufferSource: () => { log.src++; return node(); }, createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }) };
  return { log, isMuted: () => muted, getContext: () => { log.ctx++; return ac; } };
};

describe('the poses are pure and gentle', () => {
  it('the same time gives the same pose, and an otter stays on the pond ring', () => {
    for (let i = 0; i < 3; i++) for (const t of [0, 7.3, 99]) {
      const a = C.otterPose(i, t, {}); const b = C.otterPose(i, t, {});
      expect(a).toEqual(b);
      expect(Math.hypot(a.x - P.POND.x, a.z - P.POND.z)).toBeCloseTo(C.OTTER.ring + C.OTTER.step * i, 6);
      expect(Math.hypot(a.x - P.POND.x, a.z - P.POND.z)).toBeLessThan(P.POND.r);
    }
  });
  it('the hare peeks a while and hides the rest; the robin keeps to its two posts and the air between', () => {
    let up = 0; for (let t = 0; t < C.HARE.period; t += 0.25) { const v = C.harePeek(t); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); if (v > 0.5) up++; }
    expect(up).toBeGreaterThan(2); expect(up).toBeLessThan(40);
    const o = {};
    for (let t = 0; t < 80; t += 0.2) {
      C.robinPose(t, o);
      const [a, b] = C.ROBIN.lamps;
      const k = (o.x - a.x) / (b.x - a.x);
      expect(k).toBeGreaterThanOrEqual(-1e-9); expect(k).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(C.robinPose(0, {}).flying).toBe(false);
    expect(C.robinPose(12, {}).flying).toBe(true);
    expect(C.robinPose(C.ROBIN.period - 1e-6, {}).x).toBeCloseTo(C.ROBIN.lamps[0].x, 2); // no jump at the wrap
  });
  it('smoke rises from every chimney, which stands over its roof', () => {
    expect(C.CHIMNEYS).toHaveLength(P.COTTAGES.length);
    P.COTTAGES.forEach((c, i) => { expect(Math.hypot(C.CHIMNEYS[i].x - c.x, C.CHIMNEYS[i].z - c.z)).toBeLessThan(Math.hypot(c.w, c.d) / 2); expect(C.CHIMNEYS[i].y).toBeGreaterThan(c.h); });
    const a = C.puffAt(0, 0, 0, {}); const b = C.puffAt(0, 0, 3, {});
    expect(a.u).toBeGreaterThanOrEqual(0); expect(b.y - C.CHIMNEYS[0].y).toBeGreaterThanOrEqual(0);
  });
});

describe('the life on a walk', () => {
  it('is wired into the area, spottable as three journal pages, and cleans up after itself', () => {
    expect(ST.b.critters).toBe(C.createSnowvilleCritters);
    const scene = new THREE.Scene();
    const area = build(scene);
    const life = area.life({ scene, reducedMotion: false, tier: null, audio: null, progression: null, sendEvent: () => {} });
    expect(life.spottable.map((s) => s.type)).toEqual(['sw1', 'sw2', 'sw3']);
    for (const s of life.spottable) { expect(JOURNAL_TYPES).toContain(s.type); expect(s.label).toMatch(/\S/); expect(s.range).toBeGreaterThan(0); }
    const names = () => scene.children.filter((o) => /^snowville:(otter|hare|robin|fox|smoke)/.test(o.name)).length;
    expect(names()).toBe(7);
    life.update(0.016, 1, { x: 0, y: 0, z: 30 }, null, null);
    life.dispose();
    expect(names()).toBe(0);
  });
  it('the lower rungs keep fewer otters and puffs, one draw each, and no light is added', () => {
    const run = (tier) => { const c = mkCtx({ tier }); const l = C.createSnowvilleCritters(c); const n = { rung: l.rung, ...l.counts }; const lights = []; c.scene.traverse((o) => o.isLight && lights.push(o)); l.dispose(); return { n, lights: lights.length }; };
    const hi = run(null); const low = run({ name: 'low' }); const lite = run({ shadows: false });
    expect([hi.n.rung, low.n.rung, lite.n.rung]).toEqual(['high', 'low', 'lite']);
    expect(hi.n.otters).toBeGreaterThan(low.n.otters); expect(low.n.otters).toBeGreaterThan(lite.n.otters);
    expect(hi.n.puffs).toBeGreaterThan(lite.n.puffs);
    expect(hi.lights + low.lights + lite.lights).toBe(0);
  });
  it('reduced motion draws once and holds still', () => {
    const c = mkCtx({ reducedMotion: true }); const l = C.createSnowvilleCritters(c);
    const snap = () => c.scene.children.map((o) => o.position.toArray().join()).join('|');
    const first = snap();
    for (let t = 1; t < 30; t += 1) l.update(0.5, t, { x: 0, z: 30 });
    expect(snap()).toBe(first);
    const hare = c.scene.getObjectByName('snowville:hare');
    expect(hare.visible).toBe(true);
    l.dispose();
  });
  it('moves with the clock when motion is allowed', () => {
    const c = mkCtx(); const l = C.createSnowvilleCritters(c);
    const o = c.scene.getObjectByName('snowville:otter0');
    const a = o.position.clone(); l.update(0.5, 10, { x: 0, z: 30 }); expect(o.position.distanceTo(a)).toBeGreaterThan(0.1);
    l.dispose();
  });
  it('draws no random number and reads no clock; allocates nothing per frame', () => {
    for (const f of ['src/world/snowvillecritters.js', 'src/world/snowvillecritterwords.js']) {
      const code = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date|new THREE\.PointLight|SpotLight/);
    }
    const code = readFileSync('src/world/snowvillecritters.js', 'utf8').replace(/\/\/.*$/gm, '');
    const upd = code.slice(code.indexOf('function draw(t)'), code.indexOf('draw(0);'));
    expect(upd).not.toMatch(/new THREE\.|new Float32Array|\.clone\(\)/);
  });
});

describe('the sound', () => {
  it('is silent when muted: no context is asked for and no node made', () => {
    const a = fakeAudio(true);
    expect(C.bellNote(a, 0)).toBe(false); expect(C.crunchNote(a, 0)).toBe(false);
    const l = C.createSnowvilleCritters(mkCtx({ audio: a }));
    for (let i = 0; i < 200; i++) l.update(0.1, i * 0.5, { x: i * 0.5, z: 30 });
    expect(a.log).toEqual({ ctx: 0, osc: 0, src: 0 });
    l.dispose();
  });
  it('rings a bell now and then and crunches on every stride, but not on a jump', () => {
    const a = fakeAudio(false);
    const l = C.createSnowvilleCritters(mkCtx({ audio: a }));
    l.update(0.1, 1, { x: 0, z: 30 });
    for (let i = 1; i <= 20; i++) l.update(0.1, 1 + i * 0.1, { x: 0, z: 30 - i * 0.5 }); // 10 m in strides
    expect(a.log.src).toBe(Math.floor(10 / C.STEP_METRES));
    expect(a.log.osc).toBe(0); // no bell yet
    const before = a.log.src;
    l.update(0.1, 4, { x: 30, z: -20 }); // a jump
    l.update(0.1, 4.1, { x: 30, z: -20 });
    expect(a.log.src).toBe(before);
    l.update(0.1, C.BELL_GAP.first + 0.5, { x: 30, z: -20 });
    expect(a.log.osc).toBe(2);
    l.update(0.1, C.BELL_GAP.first + 1, { x: 30, z: -20 });
    expect(a.log.osc).toBe(2); // the next is a long while off
    l.update(0.1, C.BELL_GAP.first + C.BELL_GAP.min + C.BELL_GAP.span + 1, { x: 30, z: -20 });
    expect(a.log.osc).toBe(4);
    l.dispose();
  });
  it('has its music theme: slow bells, a soft pad', () => {
    expect(THEMES.snowville).toMatchObject({ voice: 'bell', beat: 0.7 });
  });
});

describe('the life pages, both word sets', () => {
  it('sw1..sw3 are live, named alike in both sets, hidden behind the flag; hints and lines exist and are kind', () => {
    expect(SNOWVILLE_LIFE_PAGES.map((p) => p[0])).toEqual(['sw1', 'sw2', 'sw3']);
    expect(SNOWVILLE_LIVE_PAGES).toHaveLength(11); // (nine, and V5's two story pages sv7, sv8)
    for (const [id, , , name] of SNOWVILLE_LIFE_PAGES) {
      expect(HINTS[id]).toMatch(/\S/); expect(SNOWVILLE_HINTS[id]).toBe(HINTS[id]);
      const card = CRITTER_INFO.find((c) => c.id === id);
      expect(card.snowville).toBe(true); expect(card.name).toBe(name); expect(card.later).toBeUndefined();
      withOffWords(() => { expect(bannedIn(name), id).toBeNull(); expect(bannedIn(HINTS[id]), id).toBeNull(); });
      expect(`${name} ${HINTS[id]}`).not.toMatch(/\b(dark|lost forever|trapped|stuck|collapse|scary)\b/i);
    }
    try {
      setSnowville(false); expect(renderJournalHtml({ sw1: 1 }, 0, 9)).not.toContain('The Skating Otters');
      setSnowville(true); expect(renderJournalHtml({ sw1: 1 }, 0, 9)).toContain('The Skating Otters');
    } finally { setSnowville(null); }
  });
  it('the everyday set has no series word and no literal Clan; neither set has a banned word', () => {
    const ids = Object.keys(LINES);
    expect(ids).toEqual(['snowville.life.otter', 'snowville.life.robin', 'snowville.life.fox']);
    for (const id of ids) {
      expect(phrase(id)).toMatch(/\S/);
      expect(phrase(id)).not.toMatch(/\b(dark|lost forever|trapped|stuck|collapse|scary)\b/i);
      expect(withOffWords(() => bannedIn(phrase(id))), id).toBeNull();
      expect(phrase(id).length).toBeLessThan(80);
    }
    expect(withOffWords(() => phrase('snowville.life.otter'))).toBe('a skating otter');
    expect(phrase('snowville.life.otter')).not.toBe('a skating otter');
    for (const f of globSync('src/world/snowvillecritter*.js')) expect(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, ''), f).not.toMatch(/\bClan\b/);
  });
});
