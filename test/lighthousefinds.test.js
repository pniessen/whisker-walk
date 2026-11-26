import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { createProgression, JOURNAL_TYPES } = await import('../src/progression.js');
const { createDiscoveryLog, AWARDS } = await import('../src/discoveries.js');
const { bus } = await import('../src/events.js');
const { discoveryText } = await import('../src/ui/hud.js');
const { CRITTER_INFO, renderJournalHtml } = await import('../src/journal.js');
const { LIGHTHOUSE_FIND_IDS, LIGHTHOUSE_JOURNAL_TYPES, lighthousePageId, LIGHTHOUSE_PAGE_WORDS } = await import('../src/lighthousepages.js');
const { setLighthouse } = await import('../src/lighthouseflag.js');
const F = await import('../src/world/lighthousefinds.js');
const L = await import('../src/world/lighthouseplan.js');
const { lightRig, mem } = await import('./helpers/lighthouselife.js');
const { BELL_SWING } = await import('../src/world/lighthouselife.js');
const { GULL_VISIT, CRAB_POP } = await import('../src/world/lighthousemoments.js');
const { withOffWords } = await import('./helpers/offwords.js');
const { kittenSpotIndex } = await import('../src/world/lighthousecats.js');

// a walk count whose kitten hides at the pool ledge, 20 m from the spawn and far from everything these tests do (so no mew muddies a sound count)
const V_POOL = [...Array(60).keys()].find((v) => kittenSpotIndex(undefined, v) === 0);

// Lighthouse Point, milestone 3: the six finds. Where each is found, what each pays and says, and what the life
// does when she is there.

const ZONES = L.LIGHTHOUSE_FIND_ZONES;
const BLANK = Object.freeze({ x: 14, y: 0, z: 36, still: 0, meow: false, belled: false });
const spot = (o) => ({ ...BLANK, ...o });
const centre = (id) => ZONES[id][0];

describe('the eight journal pages', () => {
  it('six finds and two jobs, in order, after the Market\'s, and the lists agree', () => {
    expect(LIGHTHOUSE_FIND_IDS).toEqual(['lamproom', 'pool', 'gull', 'echo', 'bell', 'window']);
    const ids = ['lhlamproom', 'lhpool', 'lhgull', 'lhecho', 'lhbell', 'lhwindow', 'lhjobkitten', 'lhjoblamp'];
    expect(LIGHTHOUSE_JOURNAL_TYPES).toEqual(ids);
    expect(JOURNAL_TYPES.slice(-40, -32)).toEqual(LIGHTHOUSE_JOURNAL_TYPES);
    expect(LIGHTHOUSE_FIND_IDS.map(lighthousePageId)).toEqual(ids.slice(0, 6));
    expect(CRITTER_INFO.filter((c) => c.lighthouse).map((c) => c.id)).toEqual(ids);
  });
  it('each page has its name and hint (the same in both word sets)', () => {
    const WORDS = {
      lhlamproom: ['The Lamp Room', 'The top of the tower glows when you get there.'],
      lhpool: ['Rock Pool Peek', 'Sit very still at a rock pool. Who lives there?'],
      lhgull: ['A Gull Friend', 'Gulls like a quiet cat on a high place.'],
      lhecho: ['The Echo Cave', 'What happens if you call into the cave?'],
      lhbell: ['The Fog Bell', 'The old bell by the cottage has a long rope.'],
      lhwindow: ['The Lit Window', 'Someone left a light on in the cottage.'],
    };
    for (const [id, [name, hint]] of Object.entries(WORDS)) {
      expect(LIGHTHOUSE_PAGE_WORDS[id].name()).toBe(name);
      expect(LIGHTHOUSE_PAGE_WORDS[id].hint()).toBe(hint);
      expect(withOffWords(() => LIGHTHOUSE_PAGE_WORDS[id].name())).toBe(name);
      expect(withOffWords(() => LIGHTHOUSE_PAGE_WORDS[id].hint())).toBe(hint);
    }
    for (const id of ['lhjobkitten', 'lhjoblamp']) {
      expect(LIGHTHOUSE_PAGE_WORDS[id].name()).toMatch(/\S/);
      expect(LIGHTHOUSE_PAGE_WORDS[id].hint()).toMatch(/\S/);
    }
  });
  it('the save keeps the eight ids and drops anything hostile in them', () => {
    const raw = JSON.stringify({ version: 4, points: 5, journal: { lhbell: 2, lhjobkitten: 1, lhecho: '<script>', lhnope: 4 } });
    const p = createProgression(mem({ 'whisker-walk-save': raw }));
    expect(p.state.journal.lhbell).toBe(2);
    expect(p.state.journal.lhjobkitten).toBe(1);
    expect(p.state.journal.lhecho).toBeUndefined();
    expect(p.state.journal.lhnope).toBeUndefined();
    for (const id of LIGHTHOUSE_JOURNAL_TYPES) p.recordSighting(id);
    for (const id of LIGHTHOUSE_JOURNAL_TYPES) expect(p.state.journal[id]).toBeGreaterThan(0);
    setLighthouse(true);
    try { expect(renderJournalHtml(p.state.journal, 0, 48)).not.toContain('<script>'); } finally { setLighthouse(null); }
  });
  it('pays what the Rooftops and the Market pay, and the HUD shows its label', () => {
    expect(AWARDS.lighthousefind).toBe(AWARDS.roofsfind);
    expect(AWARDS.lighthousefind).toBe(12);
    expect(discoveryText({ type: 'lighthousefind', label: 'X' })).toBe('X');
    expect(discoveryText({ type: 'lighthousenote', label: 'Y' })).toBe('Y');
  });
});

describe('each find is found by its rule and not by anything near it', () => {
  it('the lamp room: two seconds still inside, at the gallery\'s level', () => {
    const z = centre('lamproom');
    expect(F.findAt(spot({ x: z.x + 1.2, z: z.z, y: 13.5, still: 2 }))).toBe('lamproom');
    expect(F.findAt(spot({ x: z.x + 1.2, z: z.z, y: 13.5, still: 1.9 }))).toBeNull(); // not long enough
    expect(F.findAt(spot({ x: z.x + 2.3, z: z.z, y: 13.5, still: 5 }))).not.toBe('lamproom'); // outside the glass (the gallery's)
    expect(F.findAt(spot({ x: z.x + 1.2, z: z.z, y: 6, still: 5 }))).toBeNull(); // at its foot on the plateau
  });
  it('a rock pool: two seconds still at the rim of any of the six, on the ground', () => {
    for (const p of L.POOLS) {
      expect(F.findAt(spot({ x: p.x + p.r + 0.6, z: p.z, y: 0, still: 2 })), p.id).toBe('pool');
      expect(F.findAt(spot({ x: p.x, z: p.z, y: 0, still: 2 })), p.id).toBe('pool'); // sitting in it too
      expect(F.findAt(spot({ x: p.x + p.r + 0.6, z: p.z, y: 0, still: 1 })), p.id).toBeNull();
      expect(F.findAt(spot({ x: p.x + p.r + 2.8, z: p.z, y: 0, still: 5 })), p.id).toBeNull(); // 2.8 m off the rim is a different place
    }
  });
  it('a gull: three seconds still on the gallery\'s ring or on Gull Rock', () => {
    const g = ZONES.gull[0];
    expect(F.findAt(spot({ x: g.x + 3.8, z: g.z, y: 13.5, still: 3 }))).toBe('gull');
    expect(F.findAt(spot({ x: g.x + 3.8, z: g.z, y: 13.5 + 0.8, still: 3 }))).toBe('gull'); // on the railing walk
    expect(F.findAt(spot({ x: g.x + 3.8, z: g.z, y: 13.5, still: 2.9 }))).toBeNull();
    expect(F.findAt(spot({ x: g.x + 3.8, z: g.z, y: 11, still: 9 }))).toBeNull(); // on the ledge under it
    const r = ZONES.gull[1];
    expect(F.findAt(spot({ x: r.x + 1, z: r.z, y: 6, still: 3 }))).toBe('gull');
    expect(F.findAt(spot({ x: L.PLATEAU.minX + 1, z: r.z, y: 6, still: 9 }))).toBeNull(); // the plateau's lip, a leap away
  });
  it('the echo: a call in the cave\'s back, not still, not elsewhere in the cave\'s mouth', () => {
    const z = centre('echo');
    expect(F.findAt(spot({ x: z.x + 1, z: z.z, y: 0, meow: true }))).toBe('echo');
    expect(F.findAt(spot({ x: z.x + 1, z: z.z, y: 0, still: 30 }))).toBeNull(); // standing there is not calling
    expect(F.findAt(spot({ x: L.CAVE.maxX + 0.5, z: z.z, y: 0, meow: true }))).toBeNull(); // out on the cove
    expect(F.findAt(spot({ x: z.x + 1, z: z.z, y: 6, meow: true }))).toBeNull(); // on the plateau over it
  });
  it('the fog bell: the rope going over, with her within 3 m of it', () => {
    const z = centre('bell');
    expect(F.findAt(spot({ x: z.x + 1.2, z: z.z, y: 6, belled: true }))).toBe('bell');
    expect(F.findAt(spot({ x: z.x + 3.5, z: z.z, y: 6, belled: true }))).toBeNull();
    expect(F.findAt(spot({ x: z.x + 1.2, z: z.z, y: 6, still: 30 }))).toBeNull();
  });
  it('the lit window: two seconds still under it, on the plateau', () => {
    const z = centre('window');
    expect(F.findAt(spot({ x: z.x, z: z.z, y: 6, still: 2 }))).toBe('window');
    expect(F.findAt(spot({ x: z.x, z: z.z, y: 6, still: 1.5 }))).toBeNull();
    expect(F.findAt(spot({ x: z.x + 2.2, z: z.z, y: 6, still: 9 }))).toBeNull();
  });
  it('no zone overlaps another find\'s, and the finds are in LIGHTHOUSE_FIND_IDS order', () => {
    const all = LIGHTHOUSE_FIND_IDS.flatMap((id) => ZONES[id].map((z) => ({ id, ...z })));
    for (const a of all) for (const b of all) {
      if (a === b || a.id === b.id) continue;
      // two zones on the same level and in reach of each other would find two things at one spot
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      const sameLevel = Math.abs(a.y - b.y) <= a.dy + b.dy;
      const reach = d < (a.r ?? 0) + (b.r ?? 0) && !(b.rMin && d + a.r < b.rMin) && !(a.rMin && d + b.r < a.rMin);
      const apart = (a.meow ? 1 : a.belled ? 2 : 3) !== (b.meow ? 1 : b.belled ? 2 : 3); // a call, a ring and a stillness are different things
      if (sameLevel && reach && !apart) throw new Error(`${a.id} and ${b.id} overlap`);
    }
    expect(all.length).toBeGreaterThan(8);
  });
});

describe('what a find pays and says', () => {
  const rig = () => {
    const progression = createProgression(mem());
    const log = createDiscoveryLog(progression);
    log.startWalk();
    return { progression, log };
  };
  it('the first find ever pays 12 and says its line; later walks count once and say nothing', () => {
    const { progression, log } = rig();
    const spy = vi.spyOn(bus, 'emit');
    const first = F.noteLighthouseFind('pool', { log, progression });
    expect(first).toEqual({ fresh: true, first: true, points: 12 });
    const ev = spy.mock.calls.filter((c) => c[0] === 'discovery');
    expect(ev).toHaveLength(1);
    expect(ev[0][1]).toMatchObject({ type: 'lighthousefind', label: 'A little crab waves a claw at you. 🦀', points: 12, key: 'lighthouse-find-pool' });
    expect(F.noteLighthouseFind('pool', { log, progression }).fresh).toBe(false); // the same walk: nothing
    expect(progression.state.journal.lhpool).toBe(1);
    expect(progression.state.points).toBe(12);
    log.startWalk();
    spy.mockClear();
    expect(F.noteLighthouseFind('pool', { log, progression })).toEqual({ fresh: true, first: false, points: 0 });
    expect(progression.state.journal.lhpool).toBe(2);
    expect(progression.state.points).toBe(12);
    expect(spy.mock.calls.filter((c) => c[0] === 'discovery')).toHaveLength(0);
    expect(F.noteLighthouseFind('nope', { log, progression }).fresh).toBe(false);
    expect(F.lighthouseFindKey('pool')).toBe('lighthouse-find-pool');
    spy.mockRestore();
  });
  it('a resumed walk pays and counts nothing twice', () => {
    const { progression, log } = rig();
    F.noteLighthouseFind('bell', { log, progression });
    const entries = log.entries();
    const log2 = createDiscoveryLog(progression);
    log2.startWalk();
    log2.restore(entries);
    expect(F.noteLighthouseFind('bell', { log: log2, progression }).fresh).toBe(false);
    expect(progression.state.journal.lhbell).toBe(1);
    expect(progression.state.points).toBe(12);
  });
  it('two players each find it on their own save', () => {
    const a = rig(); const b = rig();
    expect(F.noteLighthouseFind('echo', a).points).toBe(12);
    expect(F.noteLighthouseFind('echo', b).points).toBe(12);
    expect(a.progression.state.journal.lhecho).toBe(1);
    expect(b.progression.state.journal.lhecho).toBe(1);
  });
  it('the window\'s line says Twolegs in the clan words and townspeople in the everyday words; no other line takes a set word', () => {
    expect(F.LIGHTHOUSE_FIND_WORDS.window()).toBe('A warm room, and one of the Twolegs asleep in a chair. A purr from somewhere. 🏮');
    expect(withOffWords(() => F.LIGHTHOUSE_FIND_WORDS.window())).toBe('A warm room, and one of the townspeople asleep in a chair. A purr from somewhere. 🏮');
    for (const id of LIGHTHOUSE_FIND_IDS.filter((x) => x !== 'window')) expect(withOffWords(() => F.LIGHTHOUSE_FIND_WORDS[id]())).toBe(F.LIGHTHOUSE_FIND_WORDS[id]());
  });
});

describe('the life notes a find, and plays its look', () => {
  let r;
  afterEach(() => { r?.dispose(); r = null; });
  const found = (id) => r.progression.state.journal[lighthousePageId(id)] ?? 0;

  it('sitting still in the lamp room finds it, once, and pays 12 (and not before two seconds)', () => {
    r = lightRig();
    const z = centre('lamproom');
    r.step(1.5, { x: z.x + 1.2, y: 13.5, z: z.z });
    expect(found('lamproom')).toBe(0);
    r.step(1);
    expect(found('lamproom')).toBe(1);
    expect(r.events.filter((e) => e.type === 'lighthousefind')).toHaveLength(1);
    r.step(20);
    expect(found('lamproom')).toBe(1);
    expect(r.progression.state.points).toBe(12);
  });

  it('a pool: the crab pops up at the rim nearest her, waves, goes down, and comes again only after she has walked off', () => {
    r = lightRig();
    const p = L.POOLS[3];
    const spotAt = { x: p.x + p.r + 0.6, y: 0, z: p.z };
    r.step(2.5, spotAt);
    expect(found('pool')).toBe(1);
    const crab = r.life.looks.crabGroup;
    expect(crab.visible).toBe(true);
    // at the rim, on her side, in the pool's ring (not in her paws)
    expect(Math.hypot(crab.position.x - p.x, crab.position.z - p.z)).toBeCloseTo(p.r + 0.15, 1);
    r.step(CRAB_POP.up + CRAB_POP.wave + CRAB_POP.down + 0.5);
    expect(crab.visible).toBe(false);
    r.step(5); // still there: no second crab until she moves off
    expect(crab.visible).toBe(false);
    r.step(0.1, { x: spotAt.x + 3, y: 0, z: spotAt.z });
    r.step(0.1, spotAt);
    r.step(2.5);
    expect(crab.visible).toBe(true);
    expect(found('pool')).toBe(1); // counted once a walk
  });

  it('a gull: three seconds on the gallery brings one to land beside her, sit, and fly off', () => {
    const sounded = [];
    const audio = { isMuted: () => false, getContext: () => ({ state: 'running', currentTime: 0, createOscillator: () => { sounded.push('osc'); return { type: '', frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect: (g) => g, start() {}, stop() {}, disconnect() {} }; }, createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n, disconnect() {} }) }), getMaster: () => ({}) };
    r = lightRig({ audio, visits: V_POOL });
    const g = ZONES.gull[0];
    const cat = { x: g.x + 3.8, y: 13.5, z: g.z };
    r.step(3.4, cat);
    expect(found('gull')).toBe(1);
    const gull = r.life.looks.gullGroup;
    r.step(GULL_VISIT.in + 0.2);
    expect(gull.visible).toBe(true);
    expect(gull.position.y).toBeCloseTo(13.5, 3); // sitting on the gallery's floor
    const beside = Math.hypot(gull.position.x - cat.x, gull.position.z - cat.z);
    expect(beside).toBeGreaterThan(0.8);
    expect(beside).toBeLessThan(1.5);
    expect(sounded.length).toBeGreaterThan(0); // its call
    r.step(GULL_VISIT.sit + GULL_VISIT.out + 0.5);
    expect(gull.visible).toBe(false);
  });

  it('Gull Rock\'s gull lands at the rock\'s level', () => {
    r = lightRig();
    const z = ZONES.gull[1];
    r.step(3.4, { x: z.x + 1, y: 6, z: z.z });
    expect(found('gull')).toBe(1);
    r.step(GULL_VISIT.in + 0.2);
    expect(r.life.looks.gullGroup.position.y).toBeCloseTo(6, 3);
  });

  it('the echo: her call in the cave\'s back finds it (and a call elsewhere does not); every call sings back', () => {
    const sounded = [];
    const audio = { isMuted: () => false, getContext: () => ({ state: 'running', currentTime: 0, createOscillator: () => { sounded.push('osc'); return { type: '', frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect: (g) => g, start() {}, stop() {}, disconnect() {} }; }, createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n, disconnect() {} }) }), getMaster: () => ({}) };
    r = lightRig({ audio, visits: V_POOL });
    r.step(0.5, { x: 14, y: 0, z: 36 });
    bus.emit('tip:did', { id: 'call' }); // her meow button, out on the cove
    r.step(0.2);
    expect(found('echo')).toBe(0);
    expect(sounded).toEqual([]);
    const z = centre('echo');
    r.step(0.2, { x: z.x + 1, y: 0, z: z.z });
    bus.emit('tip:did', { id: 'call' });
    r.step(0.1);
    expect(found('echo')).toBe(1);
    const n = sounded.length;
    expect(n).toBeGreaterThan(2); // three answers
    bus.emit('tip:did', { id: 'call' });
    r.step(0.1);
    expect(sounded.length).toBeGreaterThan(n);
    expect(found('echo')).toBe(1);
  });

  it('the bell: her paw on the rope rings it; the bell swings, the gulls near it flee (not the far ones, not a crab)', () => {
    const critters = { list: [
      { type: 'seagull', group: { position: { x: L.BELL.x + 5, z: L.BELL.z } }, fleeing: false, cooldown: 0 },
      { type: 'seagull', group: { position: { x: 24, z: 34 } }, fleeing: false, cooldown: 0 }, // down on the cove, 50 m away
      { type: 'crab', group: { position: { x: L.BELL.x + 2, z: L.BELL.z } }, fleeing: false, cooldown: 0 },
    ] };
    r = lightRig({ critters });
    const rope = r.tipOf('bell');
    expect(rope.prompt).toBe('E — ring the fog bell');
    const cat = { x: L.BELL_ROPE.x + 0.4, y: 6, z: L.BELL_ROPE.z };
    r.step(0.5, cat);
    expect(r.tippables.nearest(new THREE.Vector3(cat.x, 6, cat.z), 1.3)).toBe(rope); // in reach of the interactions' 1.3 m
    const bell = r.scene.getObjectByName('lighthouse:bell');
    expect(bell.rotation.x).toBe(0);
    expect(r.tippables.tip(rope)).toBe(true);
    r.step(0.3);
    expect(found('bell')).toBe(1);
    expect(critters.list.map((c) => c.fleeing)).toEqual([true, false, false]);
    expect(Math.abs(bell.rotation.x)).toBeGreaterThan(0.05); // swinging
    expect(rope.group.rotation.z).toBe(0); // the rope does not fall over
    r.step(BELL_SWING.secs + 0.5);
    expect(bell.rotation.x).toBe(0);
    expect(found('bell')).toBe(1);
  });

  it('a partner\'s tip, by the rope\'s id, rings the bell on this screen too, and finds it for a cat beside it', () => {
    r = lightRig();
    r.step(0.5, { x: L.BELL_ROPE.x + 0.4, y: 6, z: L.BELL_ROPE.z });
    expect(r.tippables.tipById(r.tipOf('bell').id)).toBe(true);
    r.step(0.3);
    expect(found('bell')).toBe(1);
    expect(Math.abs(r.scene.getObjectByName('lighthouse:bell').rotation.x)).toBeGreaterThan(0.05);
  });

  it('...but not for a cat far from it: she hears the bell and finds nothing', () => {
    r = lightRig();
    r.step(0.5, { x: 14, y: 0, z: 36 });
    r.tippables.tipById(r.tipOf('bell').id);
    r.step(0.3);
    expect(found('bell')).toBe(0);
  });

  it('the lit window: two seconds still under it finds it and the cat purrs (every time she stands there again)', () => {
    const sounded = [];
    const audio = { isMuted: () => false, getContext: () => ({ state: 'running', currentTime: 0, createOscillator: () => { sounded.push('osc'); return { type: '', frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect: (g) => g, start() {}, stop() {}, disconnect() {} }; }, createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n, disconnect() {} }) }), getMaster: () => ({}) };
    r = lightRig({ audio, visits: V_POOL });
    const z = centre('window');
    r.step(1.5, { x: z.x, y: 6, z: z.z });
    expect(found('window')).toBe(0);
    expect(sounded).toEqual([]);
    r.step(1);
    expect(found('window')).toBe(1);
    expect(sounded.length).toBeGreaterThan(0);
    const n = sounded.length;
    r.step(10); // still standing: no second purr
    expect(sounded.length).toBe(n);
  });

  it('with no log and no save (the picture pages) nothing is noted and the looks still play', () => {
    r = lightRig();
    const bare = r.placed.life({ scene: r.scene, ground: r.placed.ground, audio: null, log: null, progression: null, reducedMotion: false, tier: { name: 'high' } });
    const z = ZONES.gull[0];
    for (let i = 0; i < 30 * 4; i++) bare.update(1 / 30, 0, { x: z.x + 3.8, y: 13.5, z: z.z }, r.camera, { tippables: r.tippables });
    expect(bare.looks.gullGroup.visible).toBe(true);
    bare.dispose();
  });
});
