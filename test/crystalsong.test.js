// The Crystal Cave, wing C milestone C5: the singing chamber. The pure `songplan` (pads, notes, tunes, the matcher with wrong steps, waits, restarts and a tune let go), the
// footprint clear of everything that matters, the pads reachable on foot, the rim rocks and pebbles taken out after the scatter, two draws and no light, LOW lighter, reduced motion
// still, silent when muted, the save (a tune's bit once, the third tune's flourish and page), partner credit, both word sets.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { floodFrom } from './helpers/flood.js';
import * as P from '../src/world/crystalplan.js';
import * as S from '../src/world/crystalsongplan.js';
import * as G from '../src/world/crystalstory.js';
import { CRYSTAL_FIND_ZONES, CRYSTAL_GOLD, CRYSTAL_COLLECTIBLES } from '../src/world/crystalfindsplan.js';
import { SPOTS, STONE, BUG, SPARK } from '../src/world/crystalerrand.js';
import * as W from '../src/world/crystalwingplan.js';
import { phrase } from '../src/clanphrases.js';
import { isWalkableAt } from '../src/player.js';
import { ST } from '../src/world/crystalstages.js';
import { bus } from '../src/events.js';
import { humNote } from '../src/world/crystallife.js';
import { sanitizeSave } from '../src/progression.js';

const before = { rim: JSON.stringify(P.scatterRim()), peb: JSON.stringify(P.scatterPebbles()), clusters: JSON.stringify(P.scatterClusters()), glints: JSON.stringify(P.scatterGlints()) };
await import('../src/world/crystalstageplay.js'); // the stage (it registers the pads and pushes the clear)
const { build } = await import('../src/world/crystal.js');
const L = await import('../src/world/crystalsonglive.js');
const { drawSong } = await import('../src/world/crystalsongparts.js');
const { CRYSTAL_SONG_LINES } = await import('../src/world/crystalsongwords.js');
const { WING_LIVE, wingPageShown, CRYSTAL_HINTS } = await import('../src/crystalpages.js');
const { mergeSaves, useSaveTools } = await import('../src/catmerge.js');
const read = (f) => readFileSync(f, 'utf8');
const B = P.CRYSTAL_BOUNDS;

// a stand-in audio that counts the oscillators it is asked for
function mockAudio(muted = false) {
  const made = { osc: [], ctx: 0 };
  const node = () => ({ connect() {}, gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} } });
  const ac = { currentTime: 0, destination: {}, createGain: node, createOscillator: () => { const o = { frequency: { value: 0 }, connect() {}, start() {}, stop() {}, type: '' }; made.osc.push(o); return o; } };
  return { made, isMuted: () => muted, getContext: () => { made.ctx++; return ac; } };
}
const stand = (progression = null) => ({ state: { crystal: { step: 7, sparks: 7, album: 0, forge: 0, songs: 0 }, ...(progression ?? {}) }, seen: [], addPoints() {}, recordSighting(id) { this.seen.push(id); } });
const mk = (o = {}) => { const scene = new THREE.Scene(); const sent = []; const progression = o.progression ?? stand(); const life = L.createSongLive({ scene, audio: o.audio ?? null, progression, reducedMotion: !!o.reducedMotion, tier: o.tier ?? null, sendEvent: (e) => sent.push(e) }); return { scene, life, sent, progression }; };
const at = (x, z) => ({ x, z, y: P.crystalY(x, z) });
const onPad = (i) => at(S.PADS[i].x, S.PADS[i].z);
const mid = at(S.CHAMBER.x, S.CHAMBER.z);

describe('the plan', () => {
  it('seven flat pads on a ring, a pentatonic note each on humNote\'s root', () => {
    expect(S.PADS).toHaveLength(7);
    for (const p of S.PADS) { expect(Math.hypot(p.x - S.CHAMBER.x, p.z - S.CHAMBER.z)).toBeCloseTo(S.RING_R, 1); expect(p.note).toBe(S.NOTES[p.i]); }
    const ac = mockAudio(); humNote(ac, 0);
    expect(ac.made.osc[0].frequency.value).toBe(S.ROOT);
    expect(S.NOTES[0]).toBe(S.ROOT);
    for (let i = 1; i < 7; i++) expect(S.NOTES[i]).toBeGreaterThan(S.NOTES[i - 1]);
    expect(S.SEMIS.map((s) => s % 12)).toEqual([0, 2, 4, 7, 9, 0, 2]); // the major pentatonic
    expect(S.PAD_LIFT).toBeLessThanOrEqual(S.MAX_LIFT);
  });
  it('three tunes of 3 to 5 pads, none twice in a row, all different', () => {
    expect(S.TUNES).toHaveLength(3);
    for (const t of S.TUNES) { expect(t.length).toBeGreaterThanOrEqual(3); expect(t.length).toBeLessThanOrEqual(5); for (let i = 0; i < t.length; i++) { expect(t[i]).toBeGreaterThanOrEqual(0); expect(t[i]).toBeLessThan(7); if (i) expect(t[i]).not.toBe(t[i - 1]); } }
    expect(new Set(S.TUNES.map((t) => t.join())).size).toBe(3);
    expect(S.TUNES.map((t) => t.length)).toEqual([3, 4, 5]);
  });
  it('padAt finds the pad she stands on, and none between them', () => {
    for (const p of S.PADS) expect(S.padAt(p.x + 0.2, p.z - 0.2)).toBe(p.i);
    expect(S.padAt(S.CHAMBER.x, S.CHAMBER.z)).toBe(-1);
    for (const p of S.PADS) expect(S.padAt(p.x + 1.4, p.z)).toBe(-1);
  });
  it('the bits: any order, once, cut to 3', () => {
    expect(S.learn(0, 2)).toBe(4); expect(S.learn(4, 2)).toBe(4); expect(S.learn(5, 1)).toBe(7); expect(S.learn(0, 9)).toBe(0); expect(S.learn(255, 0)).toBe(7);
    expect(S.nextTune(0)).toBe(0); expect(S.nextTune(1)).toBe(1); expect(S.nextTune(5)).toBe(1); expect(S.nextTune(7, 4)).toBe(1); expect(S.nextTune(7, 0)).toBe(0);
    expect(S.allLearned(7)).toBe(true); expect(S.allLearned(3)).toBe(false);
  });
});

describe('the matcher', () => {
  const play = (run) => { const ev = []; for (let t = 0; t < 30 && run.phase === 'phrase'; t += 0.1) ev.push(...S.advance(run, 0.1)); return ev; };
  it('plays the phrase in order, then listens', () => {
    const run = S.newRun(S.TUNES[1]);
    const ev = play(run);
    expect(ev.filter((e) => e.k === 'phrase').map((e) => e.pad)).toEqual([...S.TUNES[1]]);
    expect(ev.at(-1)).toEqual({ k: 'listen' });
    expect(run.phase).toBe('echo');
  });
  it('a right echo finishes once; every note is ok', () => {
    const run = S.newRun(S.TUNES[0]); play(run);
    const out = S.TUNES[0].flatMap((p) => S.stepPad(run, p));
    expect(out.map((e) => e.k)).toEqual(['ok', 'ok', 'ok', 'done']);
    expect(run.phase).toBe('done');
    expect(S.stepPad(run, 0)).toEqual([]); expect(S.advance(run, 5)).toEqual([]);
  });
  it('steps while the chamber is playing are ignored', () => {
    const run = S.newRun(S.TUNES[0]); S.advance(run, 0.1);
    expect(S.stepPad(run, S.TUNES[0][0])).toEqual([]);
    expect(run.got).toBe(0);
  });
  it('a wrong step fades the pads and the phrase plays again from the start; the second try can finish', () => {
    const run = S.newRun(S.TUNES[2]); play(run);
    expect(S.stepPad(run, S.TUNES[2][0]).map((e) => e.k)).toEqual(['ok']);
    expect(S.stepPad(run, 3)).toEqual([{ k: 'miss' }]);
    expect(run.phase).toBe('fade');
    expect(S.stepPad(run, S.TUNES[2][1])).toEqual([]); // (nothing counts while the pads fade)
    const ev = []; for (let t = 0; t < 9; t += 0.1) ev.push(...S.advance(run, 0.1));
    expect(ev.filter((e) => e.k === 'replay')).toHaveLength(1);
    expect(ev.filter((e) => e.k === 'phrase').map((e) => e.pad)).toEqual([...S.TUNES[2]]);
    expect(run.phase).toBe('echo');
    expect(S.TUNES[2].flatMap((p) => S.stepPad(run, p)).at(-1)).toEqual({ k: 'done' });
  });
  it('a long wait fades the pads and plays the phrase again; a step resets the patience', () => {
    const run = S.newRun(S.TUNES[0]); play(run);
    S.advance(run, S.TIMING.wait - 1); S.stepPad(run, S.TUNES[0][0]);
    expect(S.advance(run, S.TIMING.wait - 1)).toEqual([]);
    expect(S.advance(run, 2).map((e) => e.k)).toEqual(['timeout']);
    expect(run.got).toBe(0);
    expect(S.advance(run, S.TIMING.fade + 0.1).map((e) => e.k)).toEqual(['replay']);
    expect(run.phase).toBe('phrase');
  });
  it('a huge dt is one clean step, a zero or negative dt does nothing, and no event ever says fail', () => {
    const run = S.newRun(S.TUNES[2]);
    expect(S.advance(run, 0)).toEqual([]); expect(S.advance(run, -3)).toEqual([]); expect(S.advance(run, NaN)).toEqual([]);
    const ev = S.advance(run, 100);
    expect(ev.filter((e) => e.k === 'phrase')).toHaveLength(5);
    for (const e of [...ev, ...S.stepPad(run, 6)]) expect(['phrase', 'listen', 'timeout', 'replay', 'ok', 'miss', 'done']).toContain(e.k);
  });
});

describe('the footprint', () => {
  const lumiish = [...Object.values(CRYSTAL_FIND_ZONES).flat(), ...CRYSTAL_COLLECTIBLES, ...G.STONES, G.HEART, G.LUMI.start, P.CRYSTAL_SPAWN, ...SPOTS, STONE, BUG, SPARK.start, SPARK.ring];
  it('sits inside the bounds and inside the chamber', () => {
    for (const [x, z, r] of S.footprint()) { expect(x - r).toBeGreaterThan(B.minX); expect(x + r).toBeLessThan(B.maxX); expect(z - r).toBeGreaterThan(B.minZ); expect(z + r).toBeLessThan(B.maxZ); expect(Math.hypot(x - S.CHAMBER.x, z - S.CHAMBER.z) + r).toBeLessThanOrEqual(S.CHAMBER.r + 0.001); }
  });
  it('is clear of the finds, collectibles, spark stones, Lumi, the spawn, the errand spots, the arch, the pool, the Heart, the mice and every wander point', () => {
    const avoid = [...lumiish, ...P.CRYSTAL_POIS, ...CRYSTAL_GOLD, { x: P.ARCH.x, z: P.ARCH.z }, { x: W.POOL.x, z: W.POOL.z, r: W.POOL.r }, { x: W.HEART_GREAT.x, z: W.HEART_GREAT.z, r: 3 }];
    for (const [x, z, r] of S.footprint()) for (const a of avoid) expect(Math.hypot(x - a.x, z - a.z), `${x},${z} by ${a.x},${a.z}`).toBeGreaterThan(r + (a.r ?? 0) + 0.5);
    for (const a of P.CRYSTAL_POIS) expect(Math.hypot(a.x - S.CHAMBER.x, a.z - S.CHAMBER.z)).toBeGreaterThan(S.CHAMBER.r + 1);
  });
  it('is clear of the old colliders, and the stage adds none', () => {
    for (const o of P.crystalColliders()) for (const [x, z, r] of S.footprint()) expect(Math.hypot(x - o.x, z - o.z)).toBeGreaterThan(r + o.r);
    const area = build(new THREE.Scene());
    for (const c of area.colliders) expect(Math.hypot(c.x - S.CHAMBER.x, c.z - S.CHAMBER.z), `${c.x},${c.z}`).toBeGreaterThan(S.CHAMBER.r + c.r - 0.001);
  });
  it('every pad is reached on foot from the spawn, and the middle too', () => {
    const area = build(new THREE.Scene());
    const flood = floodFrom(area, area.spawn, (x, z) => isWalkableAt(area, x, z));
    for (const p of S.PADS) expect(flood.reachesWithin(p.x, p.z, 0.5), `pad ${p.i}`).toBe(true);
    expect(flood.reachesWithin(S.CHAMBER.x, S.CHAMBER.z, 0.5)).toBe(true);
    // no hop needed: the floor under a pad is within a gentle step of its neighbour's
    for (const p of S.PADS) { const q = S.PADS[(p.i + 1) % 7]; expect(area.ground.canStep(p.x, p.z, q.x, q.z)).toBe(true); }
  });
});

describe('the clears', () => {
  it('the clear is in CRYSTAL_CLEARS once; nothing is left of the rim rocks or pebbles inside it; every other scatter is byte-identical', () => {
    expect(P.CRYSTAL_CLEARS.filter((x) => x === S.CLEAR).length).toBe(1);
    for (const k of [...P.scatterRim(), ...P.scatterPebbles()]) expect(P.inCrystalClear(k.x, k.z, 0)).toBe(false);
    expect(JSON.stringify(P.scatterClusters())).toBe(before.clusters);
    expect(JSON.stringify(P.scatterGlints())).toBe(before.glints);
    const rim = JSON.parse(before.rim).filter((k) => !P.inCrystalClear(k.x, k.z, k.s));
    expect(JSON.stringify(P.scatterRim())).toBe(JSON.stringify(rim));
    const peb = JSON.parse(before.peb).filter((k) => !P.inCrystalClear(k.x, k.z, k.s));
    expect(JSON.stringify(P.scatterPebbles())).toBe(JSON.stringify(peb));
  });
  it('the rect holds the chamber; the stage never touches KEEP_OUT', () => {
    for (const [x, z, r] of S.footprint()) expect(x - r > S.CLEAR.minX && x + r < S.CLEAR.maxX && z - r > S.CLEAR.minZ && z + r < S.CLEAR.maxZ).toBe(true);
    expect(read('src/world/crystalsongstage.js').replace(/\/\/.*$/gm, '')).not.toMatch(/KEEP_OUT/);
  });
});

describe('the drawing', () => {
  it('two draws at most, no light, finite numbers, colours in range, flat on the floor (0.08 m or less)', () => {
    const { scene, life } = mk();
    expect(life.draws).toBeLessThanOrEqual(2);
    let lights = 0; scene.traverse((o) => { if (o.isLight) lights++; });
    expect(lights).toBe(0);
    for (const m of life.meshes) {
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { const rise = p.getY(i) - P.crystalY(p.getX(i), p.getZ(i)); expect(rise).toBeGreaterThanOrEqual(0); expect(rise).toBeLessThanOrEqual(S.MAX_LIFT); }
      for (const v of [...p.array, ...m.geometry.attributes.color.array]) expect(Number.isFinite(v)).toBe(true);
      for (const v of m.geometry.attributes.color.array) expect(v).toBeLessThanOrEqual(1.0001);
    }
    life.dispose(); expect(scene.children.length).toBe(0);
  });
  it('LOW and LITE draw clearly fewer triangles', () => {
    const hi = mk().life; const lo = mk({ tier: { name: 'low' } }).life; const lite = mk({ tier: { shadows: false } }).life;
    expect(L.songRung({ name: 'low' })).toBe('low');
    expect(lo.triangles).toBeLessThan(hi.triangles * 0.5);
    expect(lite.triangles).toBe(lo.triangles);
    expect(lo.draws).toBe(1);
  });
  it('the pads breathe softly, and reduced motion holds them still', () => {
    const a = mk().life; const l0 = a.levels; a.update(1.7, 1.7, null); expect(a.levels).not.toEqual(l0);
    for (const v of a.levels) { expect(v).toBeGreaterThan(0.3); expect(v).toBeLessThan(0.7); }
    const still = mk({ reducedMotion: true }).life; const s0 = still.levels; still.update(1.7, 1.7, null); still.update(3.3, 3.3, null);
    expect(still.levels).toEqual(s0);
  });
});

describe('on a walk: the pads sing', () => {
  it('stepping a pad plays its own note once; standing on it does not repeat; muted is silent and asks for nothing', () => {
    const au = mockAudio(); const { life } = mk({ audio: au });
    life.update(0.1, 0.1, onPad(3)); life.update(0.1, 0.2, onPad(3)); life.update(0.1, 0.3, onPad(3));
    expect(au.made.osc.length).toBe(2); // a note and its octave, once
    expect(au.made.osc[0].frequency.value).toBe(S.NOTES[3]);
    life.update(0.1, 0.4, mid); life.update(0.1, 0.5, onPad(3));
    expect(au.made.osc.length).toBe(4);
    const mu = mockAudio(true); const m = mk({ audio: mu }).life;
    m.update(0.1, 0.1, onPad(2)); expect(mu.made.osc.length).toBe(0); expect(mu.made.ctx).toBe(0);
    expect(L.tone(null, 1)).toBe(false);
  });
  it('hopping over a pad does not sing it', () => {
    const au = mockAudio(); const { life } = mk({ audio: au });
    life.update(0.1, 0.1, { ...onPad(2), y: onPad(2).y + 1.2 });
    expect(au.made.osc.length).toBe(0);
  });
  it('a stepped pad lights and then fades softly (reduced motion: straight on, straight off)', () => {
    const { life } = mk(); life.update(0.05, 0.05, onPad(4));
    expect(life.levels[4]).toBeGreaterThan(0.9);
    life.update(0.1, 0.2, mid); const one = life.levels[4];
    for (let t = 0; t < 3; t += 0.1) life.update(0.1, 0.3 + t, mid);
    expect(one).toBeLessThanOrEqual(1); expect(life.levels[4]).toBeLessThan(0.7);
    const r = mk({ reducedMotion: true }).life; r.update(0.05, 0.05, onPad(4)); expect(r.levels[4]).toBe(1);
    r.update(L.LIT_HOLD + 0.1, 1, mid); expect(r.levels[4]).toBe(0.5);
  });
  it('the offer shows in the chamber only, while no tune runs; the press starts the first tune not yet learned', () => {
    const { life, progression } = mk();
    expect(life.promptAt(at(-27, -5))).toBeNull();
    life.update(0.1, 0.1, mid);
    expect(life.promptAt(mid)).toBe(phrase('crystal.wc.song.prompt'));
    expect(life.interact()).toBe('song');
    expect(life.run.tune).toEqual([...S.TUNES[0]]);
    expect(life.promptAt(mid)).toBeNull();
    expect(life.interact()).toBeNull();
    expect(progression.state.crystal.songs).toBe(0);
    const p2 = stand(); p2.state.crystal.songs = 1; const m2 = mk({ progression: p2 }).life; m2.update(0.1, 0.1, mid); m2.interact();
    expect(m2.run.tune).toEqual([...S.TUNES[1]]);
  });
});

describe('on a walk: the tunes', () => {
  const echo = (life, t0, tune) => { let t = t0; for (let k = 0; k < 80 && life.run?.phase === 'phrase'; k++) { t += 0.1; life.update(0.1, t, mid); } for (const p of tune) { t += 0.3; life.update(0.1, t, onPad(p)); t += 0.3; life.update(0.1, t, mid); } return t; };
  it('a right echo sets its bit once, sends one wc-song event for the finished tune (never a note), and says one line', () => {
    const say = []; const off = bus.on('discovery', (e) => say.push(e)); const au = mockAudio();
    const { life, sent, progression } = mk({ audio: au });
    life.update(0.1, 0.1, mid); life.interact();
    echo(life, 1, S.TUNES[0]);
    expect(progression.state.crystal.songs).toBe(1);
    expect(sent).toEqual([{ kind: 'wc-song', tune: 0 }]);
    expect(life.run).toBeNull();
    expect(say.filter((e) => e.key === 'crystal-song-learned')).toHaveLength(1);
    expect(progression.seen).toEqual([]); // the page waits for the third tune
    off?.();
  });
  it('a wrong step only fades and replays: no extra event, no bit, then the second try finishes', () => {
    const { life, sent, progression } = mk(); life.update(0.1, 0.1, mid); life.interact();
    let t = 0.1; while (life.run.phase !== 'echo') { t += 0.1; life.update(0.1, t, mid); }
    t += 0.3; life.update(0.1, t, onPad(6)); // wrong
    expect(life.run.phase).toBe('fade');
    t += 0.3; life.update(0.1, t, mid);
    expect(sent).toEqual([]); expect(progression.state.crystal.songs).toBe(0);
    for (let k = 0; k < 90; k++) { t += 0.1; life.update(0.1, t, mid); }
    expect(life.run.phase).toBe('echo');
    echo(life, t, S.TUNES[0]);
    expect(progression.state.crystal.songs).toBe(1);
  });
  it('walking away mid-tune lets it go and saves nothing; an ended walk (dispose) saves nothing either', () => {
    const { life, sent, progression } = mk(); life.update(0.1, 0.1, mid); life.interact();
    life.update(3, 3, onPad(0)); // the phrase has played; a step into the echo
    life.update(0.1, 3.2, at(-27, 8));
    expect(life.run).toBeNull();
    expect(progression.state.crystal.songs).toBe(0); expect(sent).toEqual([]);
    life.update(0.1, 3.4, mid); life.interact(); life.dispose();
    expect(progression.state.crystal.songs).toBe(0); expect(life.promptAt(mid)).toBeNull();
  });
  it('the third tune adds the flourish and the journal page; a tune already learned is only a glow (no event, no second page)', () => {
    const p = stand(); p.state.crystal.songs = 3;
    const au = mockAudio(); const { life, sent, progression } = mk({ progression: p, audio: au });
    life.update(0.1, 0.1, mid); life.interact();
    expect(life.run.tune).toEqual([...S.TUNES[2]]);
    const t = echo(life, 1, S.TUNES[2]);
    expect(progression.state.crystal.songs).toBe(7);
    expect(sent).toEqual([{ kind: 'wc-song', tune: 2 }]);
    expect(progression.seen).toEqual(['ccsong']);
    const n0 = au.made.osc.length;
    for (let k = 0; k < 40; k++) life.update(0.1, t + 0.1 * k, mid); // the flourish plays its seven notes
    expect(au.made.osc.length - n0).toBe(14);
    expect(Math.max(...life.levels)).toBeGreaterThan(0.9);
    // a replay: the chamber plays a tune for fun, nothing more is sent or saved
    life.update(0.1, 50, mid); life.interact(); echo(life, 51, S.TUNES[life.run.tune === S.TUNES[0] ? 0 : S.nextTune(7, 0)]);
    expect(sent).toHaveLength(1); expect(progression.seen).toEqual(['ccsong']); expect(progression.state.crystal.songs).toBe(7);
  });
  it('the flourish in reduced motion is a still glow of all seven pads', () => {
    const p = stand(); p.state.crystal.songs = 3; const { life } = mk({ progression: p, reducedMotion: true });
    life.update(0.1, 0.1, mid); life.interact(); const t = echo(life, 1, S.TUNES[2]);
    let sawAll = false; const counts = new Set();
    for (let k = 0; k < 60; k++) { life.update(0.1, t + 0.1 * k, mid); const lv = life.levels; const bright = lv.filter((v) => v === 1).length; if (k >= 10) counts.add(bright); if (bright === 7) sawAll = true; }
    expect(sawAll).toBe(true);
    expect([...counts].every((c) => c <= 1 || c === 7)).toBe(true); // no sweeping wave: nothing between one pad and all seven
  });
});

describe('the partner and the save', () => {
  it('a partner\'s finished tune sets the bit here, once, with a line and the notes lit in order; junk is ignored', () => {
    const say = []; const off = bus.on('discovery', (e) => say.push(e));
    const au = mockAudio(); const { life, progression, sent } = mk({ audio: au });
    for (const junk of [null, {}, { kind: 'wc-song' }, { kind: 'wc-song', tune: 3 }, { kind: 'wc-song', tune: -1 }, { kind: 'wc-song', tune: 1.5 }, { kind: 'wc-song', tune: '1' }, { kind: 'wc-forge', tune: 1 }, { kind: 'show' }]) expect(life.credit(junk), JSON.stringify(junk)).toBeNull();
    expect(progression.state.crystal.songs).toBe(0);
    expect(life.credit({ kind: 'wc-song', tune: 1 })).toBe('song');
    expect(progression.state.crystal.songs).toBe(2);
    expect(life.credit({ kind: 'wc-song', tune: 1 })).toBeNull(); // (once)
    expect(say.filter((e) => e.key === 'crystal-song-partner')).toHaveLength(1);
    for (let k = 0; k < 30; k++) life.update(0.1, 0.1 * k, null);
    expect(au.made.osc.filter((_, i) => i % 2 === 0).map((o) => o.frequency.value)).toEqual(S.TUNES[1].map((p) => S.NOTES[p]));
    expect(sent).toEqual([]); // (a credited tune is never sent on again)
    off?.();
  });
  it('the third credited tune gives the flourish and the page', () => {
    const p = stand(); p.state.crystal.songs = 3; const { life, progression } = mk({ progression: p });
    life.credit({ kind: 'wc-song', tune: 2 });
    expect(progression.state.crystal.songs).toBe(7); expect(progression.seen).toEqual(['ccsong']);
  });
  it('the stage slots: pads, credit and createSong; the arbiter line and the wc- routing in crystal.js are untouched', () => {
    expect(ST.play.pads.promptAt(mid)).toBeNull(); // (no live yet)
    expect(ST.play.credit({ kind: 'wc-song', tune: 0 })).toBeNull();
    const scene = new THREE.Scene(); const progression = stand();
    const live = ST.play.createSong({ scene, progression, reducedMotion: false });
    live.update(0.1, 0.1, mid);
    expect(ST.play.pads.promptAt(mid)).toBe(phrase('crystal.wc.song.prompt'));
    expect(ST.play.pads.interact()).toBe('song');
    expect(ST.play.credit({ kind: 'wc-song', tune: 2 })).toBe('song');
    expect(progression.state.crystal.songs).toBe(4);
    live.dispose();
    expect(ST.play.pads.promptAt(mid)).toBeNull();
    const code = read('src/world/crystal.js');
    expect(code).toContain('slot(() => ST.play?.pads)');
    expect(code).toContain("startsWith('wc-')");
    expect(code).toContain('ST.play?.createSong?.(ctx)');
  });
  it('the cave\'s own life makes the chamber, updates it and credits a wc-song event to it', () => {
    const area = build(new THREE.Scene());
    const progression = stand();
    const life = area.life({ scene: new THREE.Scene(), ground: area.ground, audio: null, log: { awardOnce: () => 0, count: () => 0, mark() {} }, progression, reducedMotion: false, tier: { name: 'lite' }, doc: null, win: null, visits: 0, sendEvent: () => {} });
    life.update(0.1, 0.1, mid, null, null);
    expect(life.promptAt(mid)).toBe(phrase('crystal.wc.song.prompt'));
    life.credit({ kind: 'wc-song', tune: 0 });
    expect(progression.state.crystal.songs & 1).toBe(1);
    life.dispose();
  });
  it('a hostile merge keeps the tune bits in range and never loses a local one', () => {
    useSaveTools({ ...(globalThis.__tools ?? {}) });
    expect(sanitizeSave({ version: 4, crystal: { songs: 1e9 } }).crystal.songs).toBeLessThanOrEqual(7);
    for (const junk of [-1, NaN, 'x', null, Infinity, [3]]) expect(Number.isInteger(sanitizeSave({ version: 4, crystal: { songs: junk } }).crystal.songs)).toBe(true);
    expect(typeof mergeSaves).toBe('function');
  });
});

describe('the words and the sources', () => {
  it('both word sets, no banned word, the journal hint, the page shown', () => {
    const everyday = withOffWords(() => Object.keys(CRYSTAL_SONG_LINES).map((k) => phrase(k)));
    const clan = Object.keys(CRYSTAL_SONG_LINES).map((k) => phrase(k));
    for (const t of [...everyday, ...clan, CRYSTAL_HINTS.ccsong]) { expect(t).toMatch(/\S/); expect(bannedIn(t) ?? [], t).toEqual([]); }
    expect(everyday).not.toEqual(clan);
    expect(WING_LIVE.song).toBe(true); expect(wingPageShown('ccsong')).toBe(true);
    const src = read('src/world/crystalsonglive.js');
    for (const m of src.matchAll(/phrase\('([^']+)'\)/g)) expect(Object.keys(CRYSTAL_SONG_LINES), m[1]).toContain(m[1]);
  });
  it('the sources draw no random number, read no clock and add no PointLight; the plan imports no THREE', () => {
    for (const f of ['crystalsongplan', 'crystalsongparts', 'crystalsonglive', 'crystalsongstage', 'crystalsongwords']) {
      const src = read(`src/world/${f}.js`).replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date|PointLight/);
    }
    expect(read('src/world/crystalsongplan.js')).not.toMatch(/from 'three'/);
  });
});
