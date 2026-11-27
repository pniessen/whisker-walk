// The Jungle lodge, milestone J4: the friendly life (macaws, a toucan, frogs), the rain's patter, a frog's croak, a bird's call, three live life pages (jw1, jw2, jw5), the music theme.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync, globSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';

stubCanvasDocument();

const { CRITTER_INFO, renderJournalHtml } = await import('../src/journal.js');
const { setJungle } = await import('../src/jungleflag.js');
const { JUNGLE_LIFE_PAGES, JUNGLE_LIVE_PAGES, JUNGLE_HINTS } = await import('../src/junglepages.js');
const { JOURNAL_TYPES } = await import('../src/progression.js');
const { loadJungleStages, ST } = await import('../src/world/junglestages.js');
await loadJungleStages();
const { build } = await import('../src/world/jungle.js');
const C = await import('../src/world/junglecritters.js');
const P = await import('../src/world/jungleplan.js');
const { LINES, HINTS } = await import('../src/world/junglecritterwords.js');
const { phrase } = await import('../src/clanphrases.js');
const { THEMES } = await import('../src/musicthemes.js');

const mkCtx = (o = {}) => ({ scene: new THREE.Scene(), reducedMotion: false, tier: null, audio: null, ...o });
const fakeAudio = (muted) => {
  const log = { ctx: 0, osc: 0, flt: 0, src: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect() {}, gain: param(), frequency: param(), Q: param(), start() {}, stop() {} });
  const ac = {
    currentTime: 0, sampleRate: 8000, destination: {}, createGain: node, createOscillator: () => { log.osc++; return node(); }, createBiquadFilter: () => { log.flt++; return node(); },
    createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }), createBufferSource: () => { log.src++; return node(); },
  };
  return { log, isMuted: () => muted, getContext: () => { log.ctx++; return ac; } };
};
const RAIN = { strength: 1, cover: 0 };

describe('the poses are pure and gentle', () => {
  it('the crowns are the broad trees near the lodge, inside the walk', () => {
    const c = C.crowns();
    expect(c).toHaveLength(8);
    for (const k of c) { expect(k.x).toBeGreaterThan(P.JUNGLE_BOUNDS.minX); expect(k.x).toBeLessThan(P.JUNGLE_BOUNDS.maxX); expect(k.z).toBeGreaterThan(P.JUNGLE_BOUNDS.minZ); expect(k.z).toBeLessThan(P.JUNGLE_BOUNDS.maxZ); expect(k.y).toBeGreaterThan(5); }
  });
  it('a bird keeps to two crowns, perched at both and in the air between', () => {
    for (let i = 0; i < 4; i++) {
      const [a, b] = C.birdPosts(i);
      expect(a).not.toBe(b);
      let air = 0;
      for (let t = 0; t < 400; t += 0.25) {
        const o = C.birdPose(i, t, {}); const again = C.birdPose(i, t, {});
        expect(o).toEqual(again);
        expect(o.k).toBeGreaterThanOrEqual(0); expect(o.k).toBeLessThanOrEqual(1);
        if (o.flying) air++;
      }
      expect(air).toBeGreaterThan(5); expect(air).toBeLessThan(900);
      expect(C.birdPose(i, 33, {}, true).flying).toBe(false);
    }
  });
  it('frogs sit on the banks, a little off the water, clear of the bridge and the stepping stones; they sing only on the rain', () => {
    for (let i = 0; i < 6; i++) {
      const f = C.frogSpot(i);
      expect(P.riverDist(f.x, f.z)).toBeGreaterThan(P.RIVER_W + 0.2); expect(P.riverDist(f.x, f.z)).toBeLessThan(P.RIVER_W + 1.2);
      expect(Math.hypot(f.x - P.LOG_BRIDGE.x, f.z - P.LOG_BRIDGE.z)).toBeGreaterThan(4);
      for (const s of P.STEPPING) expect(Math.hypot(f.x - s.x, f.z - s.z)).toBeGreaterThan(2);
      expect(f.x).toBeGreaterThan(P.JUNGLE_BOUNDS.minX); expect(f.x).toBeLessThan(P.JUNGLE_BOUNDS.maxX);
      let hopped = 0;
      for (let t = 0; t < 120; t += 0.1) { const o = C.frogPose(i, t, 0, {}); expect(o.puff).toBe(0); if (o.y > f.y + 0.01) hopped++; }
      expect(hopped).toBeGreaterThan(0);
      let sang = 0;
      for (let t = 0; t < 10; t += 0.1) { const o = C.frogPose(i, t, 1, {}); expect(o.puff).toBeGreaterThanOrEqual(0); expect(o.puff).toBeLessThanOrEqual(1); if (o.puff > 0.5) sang++; }
      expect(sang).toBeGreaterThan(3);
      expect(C.frogPose(i, 7, 1, {}, true).puff).toBe(0);
    }
  });
});

describe('the life on a walk', () => {
  it('is wired into the area (stage b, finds kept), spottable as three journal pages, and cleans up after itself', () => {
    expect(ST.b.critters).toBe(C.createJungleCritters);
    expect(ST.b.finds).toBeTruthy();
    const scene = new THREE.Scene();
    const area = build(scene);
    const life = area.life({ scene, reducedMotion: false, tier: null, audio: null, progression: null, sendEvent: () => {} });
    expect(life.spottable.map((s) => s.type)).toEqual(['jw1', 'jw2', 'jw5']);
    for (const s of life.spottable) { expect(JOURNAL_TYPES).toContain(s.type); expect(s.label).toMatch(/\S/); expect(s.range).toBeGreaterThan(0); }
    const names = () => scene.children.filter((o) => /^jungle:(macaw|toucan|frog)/.test(o.name)).length;
    expect(names()).toBe(3 + 1 + 6);
    life.update(0.016, 1, { x: 0, y: 0, z: 25 }, null, null);
    life.dispose();
    expect(names()).toBe(0);
  });
  it('the lower rungs keep fewer macaws and frogs, and no light is added', () => {
    const run = (tier) => { const c = mkCtx({ tier }); const l = C.createJungleCritters(c); const n = { rung: l.rung, ...l.counts }; const lights = []; c.scene.traverse((o) => o.isLight && lights.push(o)); l.dispose(); return { n, lights: lights.length }; };
    const hi = run(null); const low = run({ name: 'low' }); const lite = run({ shadows: false });
    expect([hi.n.rung, low.n.rung, lite.n.rung]).toEqual(['high', 'low', 'lite']);
    expect(hi.n.macaws).toBeGreaterThan(low.n.macaws); expect(low.n.macaws).toBeGreaterThan(lite.n.macaws);
    expect(hi.n.frogs).toBeGreaterThan(low.n.frogs); expect(low.n.frogs).toBeGreaterThan(lite.n.frogs);
    expect(hi.lights + low.lights + lite.lights).toBe(0);
  });
  it('reduced motion draws once and holds still, even in the rain', () => {
    const c = mkCtx({ reducedMotion: true }); const l = C.createJungleCritters(c);
    const snap = () => c.scene.children.map((o) => o.position.toArray().join() + o.rotation.y + o.scale.y).join('|');
    const first = snap();
    for (let t = 1; t < 60; t += 1) l.update(0.5, t, { x: 0, y: 0, z: 25 }, null, null);
    for (let t = 60; t < 90; t += 1) l.update(0.5, t, { x: 0, y: 0, z: 25 }, RAIN);
    expect(snap()).toBe(first);
    expect(c.scene.getObjectByName('jungle:macaw0').userData.noMerge).toBe(true);
    l.dispose();
  });
  it('moves with the clock when motion is allowed, and the frogs puff in the rain', () => {
    const c = mkCtx(); const l = C.createJungleCritters(c);
    const f = c.scene.getObjectByName('jungle:frog0');
    const m = c.scene.getObjectByName('jungle:macaw0');
    const a = m.position.toArray().join();
    let puffed = false;
    let moved = false;
    for (let t = 20; t < 120; t += 0.1) { l.update(0.1, t, { x: 0, y: 0, z: 25 }, RAIN); if (f.scale.y > 1.05) puffed = true; if (m.position.toArray().join() !== a) moved = true; }
    expect(puffed).toBe(true);
    expect(moved).toBe(true);
    l.dispose();
  });
  it('draws no random number and reads no clock; allocates nothing per frame; adds no second rain schedule', () => {
    for (const f of ['src/world/junglecritters.js', 'src/world/junglecritterwords.js']) {
      const code = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date|new THREE\.PointLight|SpotLight|createRainSchedule|rainSchedule/);
    }
    const code = readFileSync('src/world/junglecritters.js', 'utf8').replace(/\/\/.*$/gm, '');
    const upd = code.slice(code.indexOf('function draw(t, rain)'), code.indexOf('draw(0, 0);'));
    expect(upd).not.toMatch(/new THREE\.|new Float32Array|\.clone\(\)/);
    const upd2 = code.slice(code.indexOf('update(dt, t, catPos, rain)'), code.indexOf('dispose() {'));
    expect(upd2).not.toMatch(/new THREE\.|new Float32Array|\.clone\(\)|\.map\(|\.filter\(/);
  });
  it('the walk gives the critters the light\'s own rain state (one schedule)', () => {
    const code = readFileSync('src/world/jungle.js', 'utf8');
    expect(code).toContain('critters?.update(dt, t, catPos, light.state)');
  });
});

describe('the sound', () => {
  it('is silent when muted: no context is asked for and no node made, in the rain or out of it', () => {
    const a = fakeAudio(true);
    expect(C.patterNote(a, 1, 0)).toBe(false); expect(C.croakNote(a, 0)).toBe(false); expect(C.callNote(a, 0)).toBe(false);
    const l = C.createJungleCritters(mkCtx({ audio: a }));
    for (let i = 0; i < 200; i++) l.update(0.1, i * 0.5, { x: 0, y: 0, z: 25 }, i % 2 ? RAIN : null);
    expect(a.log).toEqual({ ctx: 0, osc: 0, flt: 0, src: 0 });
    l.dispose();
  });
  it('patters and croaks only while it showers, and calls only when it is dry', () => {
    const a = fakeAudio(false);
    const l = C.createJungleCritters(mkCtx({ audio: a }));
    l.update(0.1, 0.5, { x: 0, y: 0, z: 25 }, null);
    expect(a.log.src).toBe(0); expect(a.log.osc).toBe(0); // dry and early: nothing
    l.update(0.1, C.CALL_GAP.first + 0.5, { x: 0, y: 0, z: 25 }, null);
    expect(a.log.osc).toBe(2); expect(a.log.src).toBe(0); // a call, two notes
    const before = a.log.osc;
    l.update(0.1, 30, { x: 0, y: 0, z: 25 }, RAIN);
    expect(a.log.src).toBe(1); expect(a.log.osc).toBe(before + 2); // a puff of patter and one croak (two notes)
    l.update(0.1, 30.1, { x: 0, y: 0, z: 25 }, RAIN);
    expect(a.log.src).toBe(1); // the next puff is a moment off
    l.update(0.1, 30.6, { x: 0, y: 0, z: 25 }, RAIN);
    expect(a.log.src).toBe(2);
    l.update(0.1, 31, { x: 0, y: 0, z: 25 }, { strength: 0.1, cover: 0 });
    expect(a.log.osc).toBe(before + 2); // a drizzle patters but the frogs wait
    l.dispose();
  });
  it('has its music theme: marimba with a chime now and then, minor pentatonic, a little swing', () => {
    expect(THEMES.jungle).toMatchObject({ voice: 'mar', altVoice: 'chime', alt: 0.2, beat: 0.5, swing: 0.2 });
    expect(THEMES.jungle.scale).toEqual([0, 3, 5, 7, 10]);
  });
});

describe('the life pages, both word sets', () => {
  it('jw1, jw2, jw5 are live, named alike in both sets, hidden behind the flag; hints and lines exist and are kind', () => {
    expect(JUNGLE_LIFE_PAGES.map((p) => p[0])).toEqual(['jw1', 'jw2', 'jw5']);
    expect(JUNGLE_LIVE_PAGES).toHaveLength(13); // (jl7 and jl8, the story pages, are J5's: test/junglewing.test.js; jw6 and jw7 are J7's: test/junglejob.test.js)
    for (const [id, , , name] of JUNGLE_LIFE_PAGES) {
      expect(HINTS[id]).toMatch(/\S/); expect(JUNGLE_HINTS[id]).toBe(HINTS[id]);
      const card = CRITTER_INFO.find((c) => c.id === id);
      expect(card.jungle).toBe(true); expect(card.name).toBe(name); expect(card.later).toBeUndefined();
      withOffWords(() => { expect(bannedIn(name), id).toBeNull(); expect(bannedIn(HINTS[id]), id).toBeNull(); });
      expect(`${name} ${HINTS[id]}`).not.toMatch(/\b(dark|lost forever|trapped|stuck|collapse|scary)\b/i);
    }
    try {
      setJungle(false); expect(renderJournalHtml({ jw1: 1 }, 0, 9)).not.toContain('The Bright Macaws');
      setJungle(true); expect(renderJournalHtml({ jw1: 1 }, 0, 9)).toContain('The Bright Macaws');
    } finally { setJungle(null); }
  });
  it('the everyday set has no series word and no literal Clan; neither set has a banned word', () => {
    const ids = Object.keys(LINES);
    expect(ids).toEqual(['jungle.life.macaw', 'jungle.life.frog', 'jungle.life.toucan']);
    for (const id of ids) {
      expect(phrase(id)).toMatch(/\S/);
      expect(phrase(id)).not.toMatch(/\b(dark|lost forever|trapped|stuck|collapse|scary|Kit)\b/i);
      expect(withOffWords(() => bannedIn(phrase(id))), id).toBeNull();
      expect(phrase(id).length).toBeLessThan(80);
    }
    expect(withOffWords(() => phrase('jungle.life.frog'))).toBe('a singing rain frog');
    expect(phrase('jungle.life.frog')).not.toBe('a singing rain frog');
    for (const f of globSync('src/world/junglecritter*.js')) expect(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, ''), f).not.toMatch(/\bClan\b/);
  });
});
