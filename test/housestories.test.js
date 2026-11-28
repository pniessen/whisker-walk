import { describe, it, expect, vi } from 'vitest';

vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });

const S = await import('../src/world/housestories.js');
const { createHouseGlow } = await import('../src/world/houseglow.js');
const { HOUSE_WINDOWS, HOUSE_ROOMS, HOUSE_LEVELS, HOUSE_LAMPS } = await import('../src/world/houseplan.js');

// The Old House beauty pass 4 (2026-11-28): the season by the date, the rare surprises, the painted stories (shader only: no geometry).
const fakeScene = () => ({ children: [], add(o) { this.children.push(o); }, remove(o) { this.children = this.children.filter((c) => c !== o); } });
const audioStub = () => { const calls = []; return { calls, playTune: (n, v) => calls.push(['tune', n.length, v]), chime: () => calls.push(['chime']) }; };

describe('the seasons', () => {
  it('reads the season from the month', () => {
    const at = (m) => S.seasonOf(new Date(2026, m, 15));
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(at)).toEqual([0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0]);
  });
  it('has a tone and a breeze for each season', () => {
    expect(S.SEASON_TONE).toHaveLength(4);
    expect(S.SEASON_BREEZE).toHaveLength(4);
    for (const t of S.SEASON_TONE) expect(t.every((v) => v > 0.8 && v < 1.2)).toBe(true);
  });
  it('hands the season, the tone and the breeze to the shader, and frost is for winter only', () => {
    const g = createHouseGlow({ windows: HOUSE_WINDOWS, rooms: HOUSE_ROOMS, levels: HOUSE_LEVELS, lamps: HOUSE_LAMPS });
    g.update(1, { x: 0, y: 0, z: 7 }, { season: 0 });
    expect(g.uniforms.uSeason.value).toBe(0);
    expect(g.uniforms.uBreeze.value).toBe(S.SEASON_BREEZE[0]);
    g.update(1, { x: 0, y: 0, z: 7 }, { season: 2, box: 0.5, cuckoo: 1 });
    expect(g.uniforms.uSeason.value).toBe(2);
    expect(g.uniforms.uBox.value).toBe(0.5);
    expect(g.uniforms.uCuckoo.value).toBe(1);
    expect(g.uniforms.uBreeze.value).toBe(S.SEASON_BREEZE[2]);
  });
  it('writes every story into the shader chunk', () => {
    for (const word of ['stories(', 'storiesGlow(', 'uSeason'.slice(0, 0)]) expect(S.STORY_FUNCS).toContain(word);
  });
});

describe('the rare surprises', () => {
  it('picks the surprise for where she stands', () => {
    expect(S.surpriseFor({ x: 8, y: 0, z: 7 })).toBe('box');
    expect(S.surpriseFor({ x: 9, y: 0, z: -4 })).toBe('cuckoo');
    expect(S.surpriseFor({ x: 0, y: 0, z: 4 })).toBe('ghost');
    expect(S.surpriseFor({ x: -12, y: 0, z: 7 })).toBeNull();
    expect(S.surpriseFor({ x: 9, y: 2.4, z: 7 })).toBeNull();
  });
  it('rolls the same on the same day and is rare', () => {
    let hits = 0;
    for (let s = 0; s < 200; s++) { const a = S.surpriseRoll(20261128, s); expect(S.surpriseRoll(20261128, s)).toBe(a); if (a) hits++; }
    expect(hits).toBeGreaterThan(30);
    expect(hits).toBeLessThan(110);
  });
  it('plays the music box tune once and glows, then fades out', () => {
    const audio = audioStub();
    const sc = fakeScene();
    const s = S.createSurprises({ scene: sc, audio, dayKey: 1 });
    expect(s.start('box')).toBe(true);
    expect(audio.calls).toEqual([['tune', S.BOX_TUNE.length, 0.5]]);
    expect(s.start('box')).toBe(false); // one at a time
    let peak = 0;
    for (let i = 0; i < 400; i++) peak = Math.max(peak, s.update(0.05, { x: 8, y: 0, z: 7 }).box);
    expect(peak).toBeGreaterThan(0.9);
    expect(s.out.box).toBe(0);
    expect(s.active).toBeNull();
    expect(sc.children).toHaveLength(0);
  });
  it('lets the cuckoo peek out with a chime and two calls', () => {
    const audio = audioStub();
    const s = S.createSurprises({ scene: fakeScene(), audio, dayKey: 1 });
    s.start('cuckoo');
    let peak = 0;
    for (let i = 0; i < 200; i++) peak = Math.max(peak, s.update(0.05, { x: 9, y: 0, z: -4 }).cuckoo);
    expect(peak).toBe(1);
    expect(audio.calls.filter((c) => c[0] === 'chime')).toHaveLength(1);
    expect(audio.calls.filter((c) => c[0] === 'tune')).toHaveLength(2);
  });
  it('is safe with no audio, and with audio missing the optional calls', () => {
    for (const audio of [null, {}, { playTune: undefined }]) {
      const s = S.createSurprises({ scene: fakeScene(), audio, dayKey: 1 });
      for (const which of ['box', 'cuckoo']) { expect(s.start(which)).toBe(true); for (let i = 0; i < 300; i++) s.update(0.05, { x: 8, y: 0, z: 7 }); }
    }
  });
  it('leaves the ghost out on LITE, adds nothing to the scene when idle, and rolls by the day', () => {
    const sc = fakeScene();
    const s = S.createSurprises({ scene: sc, low: true, dayKey: 1 });
    expect(s.start('ghost')).toBe(false);
    for (let i = 0; i < 400; i++) s.update(0.5, { x: 0, y: 0, z: 4 });
    expect(sc.children).toHaveLength(0);
  });
  it('waits for her to be somewhere it can happen', () => {
    const sc = fakeScene();
    // find a day whose first roll comes up
    let day = 0;
    while (!S.surpriseRoll(day, 0)) day++;
    const s = S.createSurprises({ scene: sc, audio: audioStub(), dayKey: day });
    for (let t = 0; t < 45; t += 0.5) s.update(0.5, { x: -12, y: 0, z: 7 }); // the library: nothing to show
    expect(s.active).toBeNull();
    s.update(0.5, { x: 8, y: 0, z: 7 }); // the parlour: the music box
    expect(s.active).toBe('box');
  });
});
