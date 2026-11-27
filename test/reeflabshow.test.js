// The Reef, milestone R15: the Sealab's dome light show. The pure timing (world/reeflabshow.js labShowAt), the walk (the third fuse starts it, the room clock shares it,
// watching it saves bit 3 and the journal page, a replay from the dome's bench), hostile saves, reduced motion and the lower rungs. The whole Reef area is built, so
// every check tolerates the other stage's regions and meshes (nothing counts the scene's objects).
import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { createPlayer } from '../src/player.js';

stubCanvasDocument();
const { build } = await import('../src/world/reef.js');
const A = await import('../src/reeflab.js');
const L = await import('../src/world/reeflabplan.js');
const P = await import('../src/world/reefplan.js');
const S = await import('../src/world/reeflabshow.js');
const { LINES } = await import('../src/world/reeflabwords.js');
const { phrase } = await import('../src/clanphrases.js');
const { createProgression, sanitizeSave, CATALOG } = await import('../src/progression.js');
const { mergeSaves, useSaveTools } = await import('../src/catmerge.js');
const { mergeColony } = await import('../src/colony.js');
const { mergeUsage } = await import('../src/usage.js');
const { sanitizeMarks, MARK_AREAS } = await import('../src/marks.js');
const { CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX } = await import('../src/customcats.js');
const { OUTFIT_IDS, sameWear } = await import('../src/outfits.js');
useSaveTools({ CATALOG, sanitizeSave, mergeColony, mergeUsage, sanitizeMarks, MARK_AREAS, CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX, OUTFIT_IDS, sameWear });
const { createDiscoveryLog, AWARDS } = await import('../src/discoveries.js');
const { placeFloat } = await import('../src/placephysics.js');
const { renderJournalHtml } = await import('../src/journal.js');
const { setReef } = await import('../src/reefflag.js');
const RP = await import('../src/reefpages.js');

const read = (f) => readFileSync(f, 'utf8');

describe('the pure timing (labShowAt)', () => {
  it('is a pure function of one start time: the same k gives the same picture, junk and out-of-range k mean "not playing", and all numbers stay finite', () => {
    expect(JSON.stringify(S.labShowAt(7.3))).toBe(JSON.stringify(S.labShowAt(7.3)));
    for (const bad of [NaN, -1, -50, Infinity, -Infinity, undefined, null, 'x', 20.01, 99]) {
      const s = S.labShowAt(bad);
      expect(s.active, String(bad)).toBe(false);
      expect(s.glow).toBe(0);
      expect(s.ribbons).toEqual([]);
      expect(Number.isFinite(s.k)).toBe(true);
    }
    let peak = 0;
    for (let i = 0; i <= 200; i++) {
      const k = i / 10;
      const s = S.labShowAt(k);
      expect(s.active).toBe(true);
      expect(s.ribbons).toHaveLength(S.SHOW.ribbons);
      expect(s.jellies).toHaveLength(S.SHOW.jellies);
      expect(s.fish).toHaveLength(S.SHOW.fish);
      expect(s.glow).toBeGreaterThanOrEqual(0); expect(s.glow).toBeLessThanOrEqual(1);
      peak = Math.max(peak, s.glow);
      for (const r of s.ribbons) {
        expect(r.alpha).toBeGreaterThanOrEqual(0); expect(r.alpha).toBeLessThanOrEqual(1);
        expect(r.pts).toHaveLength(S.SHOW.ribbonPts);
        for (const p of r.pts) { expect(Object.values(p).every(Number.isFinite)).toBe(true); expect(p.x).toBeGreaterThan(19); expect(p.y).toBeGreaterThan(0); }
      }
      for (const c of [...s.jellies, ...s.fish, s.ray]) { expect(Object.values(c).every(Number.isFinite)).toBe(true); expect(c.show).toBeGreaterThanOrEqual(0); expect(c.show).toBeLessThanOrEqual(1); expect(c.x).toBeGreaterThan(19); }
    }
    expect(peak).toBeGreaterThan(0.95);
  });
  it('begins and ends gently (nothing lit at k = 0 or k = 20), is "seen" from SHOW.seenAt, and the creatures come and go softly', () => {
    for (const k of [0, S.SHOW.secs]) { const s = S.labShowAt(k); expect(s.glow).toBeLessThan(0.01); for (const r of s.ribbons) expect(r.alpha).toBeLessThan(0.01); }
    expect(S.labShowAt(S.SHOW.seenAt - 0.01).seen).toBe(false);
    expect(S.labShowAt(S.SHOW.seenAt).seen).toBe(true);
    expect(S.SHOW.seenAt).toBeLessThan(S.SHOW.secs / 2);
    expect(S.labShowAt(10).ray.show).toBeGreaterThan(0.9);
    // no sudden jumps: a tenth of a second moves nothing far
    let prev = S.labShowAt(0);
    for (let k = 0.1; k <= S.SHOW.secs; k += 0.1) {
      const s = S.labShowAt(k);
      for (let i = 0; i < s.ribbons.length; i++) { expect(Math.abs(s.ribbons[i].alpha - prev.ribbons[i].alpha)).toBeLessThan(0.1); expect(Math.hypot(s.ribbons[i].pts[5].x - prev.ribbons[i].pts[5].x, s.ribbons[i].pts[5].z - prev.ribbons[i].pts[5].z)).toBeLessThan(0.5); }
      expect(Math.abs(s.ray.x - prev.ray.x)).toBeLessThan(0.5);
      prev = s;
    }
  });
  it('the reduced-motion picture is the peak ribbons with nothing else moving', () => {
    const st = S.labStill();
    expect(st.active).toBe(true);
    expect(st.jellies).toEqual([]); expect(st.fish).toEqual([]); expect(st.ray).toBeNull();
    expect(st.ribbons).toEqual(S.labShowAt(S.SHOW.still).ribbons);
  });
});

describe('the step logic (src/reeflab.js): the show bit', () => {
  it('the show is seen only once the station has power; it implies the three fuses and nothing else changes; seen twice changes nothing', () => {
    expect(A.apply({ lab: 3 }, { kind: 'show' }).changed).toBe(false);
    expect(A.apply({ lab: 0 }, { kind: 'show' }).reef.lab).toBe(0);
    const r = A.apply({ step: 4, lab: 7, wreck: 1 }, { kind: 'show' });
    expect(r).toMatchObject({ changed: true, effect: 'seen', reef: { step: 4, lab: 15, wreck: 1 } });
    expect(A.apply(r.reef, { kind: 'show' }).changed).toBe(false);
    expect(A.showSeen(r.reef)).toBe(true);
    expect(A.credit({ lab: 7 }, { kind: 'show' }).effect).toBe('seen');
    for (const bad of [null, 5, 'show', { kind: 'shows' }, { kind: 'show', extra: 1 }.kind]) expect(A.apply({ lab: 7 }, bad).changed || bad === null).toBe(bad && bad.kind === 'show' ? true : bad === null);
  });
  it('hostile saves: bit 3 implies all three fuses in the sanitiser and after a merge (OR), junk collapses, and an old save without bit 3 is untouched', () => {
    const fresh = (reef) => sanitizeSave({ version: 4, reef });
    for (const [a, b] of [[8, 15], [9, 15], [15, 15], [7, 7], [3, 3], [16, 15], [24, 15], [255, 15]]) expect(fresh({ lab: a }).reef.lab, String(a)).toBe(b);
    for (const bad of ['x', -1, 2.5, 1e300, [], null, { a: 1 }, NaN, Infinity]) { const l = fresh({ lab: bad }).reef.lab; expect(l === 0 || l === 15 || l < 8, String(bad)).toBe(true); }
    expect(mergeSaves({ local: fresh({ lab: 3 }), cloud: fresh({ lab: 8 }) }).save.reef.lab).toBe(15);
    expect(mergeSaves({ local: fresh({ lab: 5 }), cloud: fresh({ lab: 2 }) }).save.reef.lab).toBe(7);
    const r = mergeSaves({ local: fresh({ lab: 1 }), cloud: { version: 4, reef: { lab: 'x' } } }).save.reef;
    expect(r.lab & 1).toBe(1); expect(r.lab).toBeLessThanOrEqual(15);
    expect(A.normLab(8)).toBe(15);
  });
});

describe('on a walk', () => {
  const made = [];
  afterEach(() => { for (const m of made.splice(0)) m.life.dispose(); setReef(null); });
  const make = (extra = {}) => {
    const sc = new THREE.Scene();
    const placed = build(sc);
    const progression = extra.progression ?? createProgression(memoryStorage());
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const camera = new THREE.PerspectiveCamera();
    const player = createPlayer(camera, null, { headless: true });
    const cat = new THREE.Group();
    const o = L.HATCH.outside;
    cat.position.set(o.x + 1.2, P.reefY(o.x + 1.2, o.z), o.z);
    player.setAvatar(cat, 0.7);
    player.setFloat(placeFloat('reef'));
    player.setGround(placed.ground);
    player.enable();
    const sent = [];
    const life = placed.life({ scene: sc, log, progression, player, reducedMotion: false, visits: 1, doc: null, sendEvent: (ev) => sent.push(ev), ...extra });
    const session = { cat };
    const m = { life, scene: sc, player, cat, session, progression, log, sent, t: 0 };
    m.step = (secs) => { for (let i = 0; i < Math.round(secs * 60); i++) { m.t += 1 / 60; player.update(1 / 60, [], P.REEF_BOUNDS, []); life.update(1 / 60, m.t, cat.position, camera, session); } };
    m.go = (x, z) => { cat.position.set(x, P.reefY(x, z), z); m.step(0.05); };
    m.press = () => { const line = life.promptAt(cat.position); const kind = life.interact(); return { line, kind }; };
    m.down = () => { m.go(L.HATCH.outside.x + 1.2, L.HATCH.outside.z); m.press(); m.step(1); };
    m.up = () => { m.go(L.HATCH.inside.exit.x, L.HATCH.inside.exit.z); m.press(); m.step(1); };
    m.power = () => { // all three fuses in, the last one from the sand
      m.down();
      for (const f of [0, 1]) { m.go(L.FUSE_SPOTS[f].x, L.FUSE_SPOTS[f].z); m.press(); m.go(L.PANEL.x, L.PANEL.z); m.press(); }
      m.up();
      m.go(L.FUSE_SPOTS[2].x, L.FUSE_SPOTS[2].z); m.press();
      m.down();
      m.go(L.PANEL.x, L.PANEL.z);
      m.press();
    };
    made.push(m);
    return m;
  };
  const meshes = (m) => m.life.story.draw.meshes;

  it('the third fuse starts the dome show (after the fuse message); bit 3 and the page are saved once it has been watched; nothing more is paid', () => {
    const m = make();
    const pts = () => m.progression.state.points ?? m.progression.state.paws ?? 0;
    m.power();
    expect(m.progression.state.reef.lab).toBe(7);
    expect(m.life.story.showOn).toBe(true);
    expect(m.sent.map((e) => e.kind)).toEqual(['fuse', 'fuse', 'fuse', 'labshow']);
    expect(m.sent.at(-1)).toEqual({ kind: 'labshow', elapsed: 0 });
    const paid = pts();
    m.step(1);
    expect(meshes(m)[0].visible).toBe(true); // the ribbons are up
    expect(m.progression.state.reef.lab & 8).toBe(0);
    m.step(S.SHOW.seenAt + 1);
    expect(m.progression.state.reef.lab).toBe(15);
    expect(m.progression.state.journal.rfshow).toBe(1);
    m.step(S.SHOW.secs);
    expect(m.life.story.showOn).toBe(false);
    for (const x of meshes(m)) expect(x.visible).toBe(false);
    expect(pts()).toBe(paid);
    expect(AWARDS.reeflab).toBe(40);
  });
  it('the journal page rfshow stays out until the show has been seen, in both word sets', () => {
    setReef(true);
    const hint = RP.REEF_PAGE_WORDS.rfshow.hint();
    expect(hint.length).toBeGreaterThan(0);
    expect(renderJournalHtml({}, 0, 0)).not.toContain(hint);
    expect(renderJournalHtml({ rfshow: 0 }, 0, 0)).not.toContain(hint);
    expect(renderJournalHtml({}, 0, 0)).not.toContain('Dome Lights');
    expect(renderJournalHtml({ rfshow: 2 }, 0, 0)).toContain('Dome Lights'); // a spotted card shows the name and the count
    withOffWords(() => { expect(renderJournalHtml({}, 0, 0)).not.toContain('Dome Lights'); expect(renderJournalHtml({ rfshow: 1 }, 0, 0)).toContain('Dome Lights'); });
  });
  it('the replay: the bench offers it only once the station has power, nothing is paid, nothing is saved twice, and it can be watched again and again', () => {
    const m = make();
    m.down();
    m.go(L.DOME_BENCH.x, L.DOME_BENCH.z);
    expect(m.life.promptAt(m.cat.position)).toBeNull(); // no power yet
    m.go(L.PANEL.x, L.PANEL.z);
    m.up();
    m.power();
    m.step(S.SHOW.secs + 2);
    const saved = JSON.stringify(m.progression.state.reef);
    m.go(L.DOME_BENCH.x, L.DOME_BENCH.z);
    expect(m.press()).toEqual({ line: phrase('reef.lab.show.prompt'), kind: 'show' });
    expect(m.life.story.showOn).toBe(true);
    expect(m.life.promptAt(m.cat.position)).toBeNull(); // playing: not offered again over it
    m.step(S.SHOW.secs + 2);
    expect(m.life.story.showOn).toBe(false);
    expect(JSON.stringify(m.progression.state.reef)).toBe(saved);
    expect(m.life.promptAt(m.cat.position)).toBe(phrase('reef.lab.show.prompt'));
    expect(m.sent.filter((e) => e.kind === 'labshow')).toHaveLength(2);
    m.go(L.DOME_BENCH.x - 6, L.DOME_BENCH.z - 3); // somewhere else in the station: no offer
    expect(m.life.promptAt(m.cat.position)).toBeNull();
  });
  it('co-walk: a partner\'s start joins at the right second (the room clock), starts once, never saves what she has not earned, and hostile elapsed values are safe', () => {
    const m = make();
    m.step(0.5);
    expect(m.life.credit({ kind: 'labshow', elapsed: 8 })).toBe('show-start');
    expect(m.life.story.state.show.k).toBeGreaterThan(7.9);
    expect(m.life.story.state.show.k).toBeLessThan(8.6);
    expect(m.life.credit({ kind: 'labshow', elapsed: 1 })).toBeNull(); // already playing
    expect(m.sent).toEqual([]); // a joined show is not sent back
    m.step(S.SHOW.seenAt); // she has no power: she sees it, and nothing is saved
    expect(m.progression.state.reef.lab).toBe(0);
    m.step(S.SHOW.secs);
    expect(m.life.story.showOn).toBe(false);
    for (const bad of [NaN, -5, 1e9, Infinity, 'x', null, undefined, {}]) {
      const n = make();
      expect(n.life.credit({ kind: 'labshow', elapsed: bad }), String(bad)).toBe('show-start');
      const k = n.life.story.state.show.k;
      expect(Number.isFinite(k) && k >= 0 && k <= S.SHOW.secs + 0.1, String(bad)).toBe(true);
    }
    // two partners in one room, started on different clocks, see the same picture at the same moment
    const a = make(); const b = make();
    a.step(3); b.step(11);
    a.life.story.startShow({ own: true });
    b.life.credit({ kind: 'labshow', elapsed: 0 });
    a.step(4); b.step(4);
    expect(Math.abs(a.life.story.state.show.k - b.life.story.state.show.k)).toBeLessThan(0.05);
    expect(JSON.stringify(S.labShowAt(a.life.story.state.show.k))).toBe(JSON.stringify(S.labShowAt(a.life.story.state.show.k)));
  });
  it('a partner who has the power saves the show when it was watched; the others\' fuse credit still works', () => {
    const m = make({ progression: createProgression(memoryStorage()) });
    for (const f of [0, 1, 2]) m.life.credit({ kind: 'fuse', fuse: f });
    expect(m.progression.state.reef.lab).toBe(7);
    m.life.credit({ kind: 'labshow', elapsed: 0 });
    m.step(S.SHOW.seenAt + 1);
    expect(m.progression.state.reef.lab).toBe(15);
    expect(m.progression.state.journal.rfshow).toBe(1);
  });
  it('the show tints the Sealab\'s one light and gives it back; the Reef still has exactly one lab light', () => {
    const m = make();
    const lights = [];
    m.scene.traverse((o) => { if (o.isLight && o.name === 'lab:light') lights.push(o); });
    expect(lights).toHaveLength(1);
    const base = lights[0].color.getHex();
    m.life.story.startShow({ own: false });
    m.step(10);
    expect(lights[0].color.getHex()).not.toBe(base);
    m.step(S.SHOW.secs);
    expect(lights[0].color.getHex()).toBe(base);
    let pointLights = 0;
    m.scene.traverse((o) => { if (o.isPointLight) pointLights++; });
    expect(pointLights).toBe(1);
  });
  it('reduced motion: a still glow of ribbons (the picture does not change over time), no creatures; the lower rungs draw fewer', () => {
    const m = make({ reducedMotion: true });
    m.life.story.startShow({ own: false });
    m.step(2);
    const ribbons = meshes(m)[0];
    expect(ribbons.visible).toBe(true);
    const snap = Float32Array.from(ribbons.geometry.attributes.position.array);
    const col = Float32Array.from(ribbons.geometry.attributes.color.array);
    m.step(9);
    expect(Array.from(ribbons.geometry.attributes.position.array)).toEqual(Array.from(snap));
    expect(Array.from(ribbons.geometry.attributes.color.array)).toEqual(Array.from(col));
    expect(Math.max(...col)).toBeGreaterThan(0);
    expect(Math.max(...col)).toBeLessThan(1);
    for (const x of meshes(m).slice(1)) expect(x.visible).toBe(false);
    m.step(S.SHOW.secs);
    expect(ribbons.visible).toBe(false);
    const hi = make(); const low = make({ tier: { name: 'low', shadows: false, rung: 3 } });
    expect(hi.life.story.draw.ribbonCount).toBe(3);
    expect(low.life.story.draw.ribbonCount).toBe(2);
    expect(meshes(low)[1].count).toBeLessThan(meshes(hi)[1].count);
    expect(meshes(low)[2].count).toBeLessThan(meshes(hi)[2].count);
    // moving, the full show does change from one moment to the next
    hi.life.story.startShow({ own: false }); hi.step(5);
    const a = Float32Array.from(meshes(hi)[0].geometry.attributes.position.array); hi.step(2);
    expect(Array.from(meshes(hi)[0].geometry.attributes.position.array)).not.toEqual(Array.from(a));
  });
  it('dispose ends a show cleanly: the draw meshes leave the scene and the light is back', () => {
    const m = make();
    m.life.story.startShow({ own: false }); m.step(3);
    const names = meshes(m).map((x) => x.name);
    m.life.dispose();
    for (const n of names) expect(m.scene.getObjectByName(n)).toBeFalsy();
  });
});

describe('the words and the source', () => {
  it('the two new lines are short, kind, free of banned words and the same in both word sets', () => {
    const BAD = /\b(dark|lost forever|trapped|stuck|scary|Zissou|Belafonte|Aquatic|cap|beanie)\b/i;
    for (const id of ['reef.lab.show.prompt', 'reef.lab.show.start']) {
      expect(LINES[id]).toBeTruthy();
      expect(phrase(id)).toBe(LINES[id]);
      expect(LINES[id].length).toBeLessThanOrEqual(60);
      expect(LINES[id]).not.toMatch(BAD);
      withOffWords(() => { expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id)).toBe(LINES[id]); });
    }
    expect(RP.REEF_PAGE_WORDS.rfshow.hint()).not.toMatch(BAD);
  });
  it('the show files draw no random number and read no clock, and no banned word is in them', () => {
    for (const f of ['src/world/reeflabshow.js', 'src/world/reeflabshowdraw.js', 'src/world/reeflabstory.js']) {
      const src = read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(src, f).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date/);
      expect(src, f).not.toMatch(/Zissou|Belafonte|Aquatic|beanie|\bcap\b|lost forever|trapped|scary/i);
    }
  });
});
