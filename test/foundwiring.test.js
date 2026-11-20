import { describe, it, expect, vi } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRooms } from '../src/game/rooms.js';
import { createFakeHub } from '../src/net.js';
import { createProgression } from '../src/progression.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { FIND_KEY } from '../src/foundwear/spots/index.js';
import { planFind, roomFindRoster, findsAgreed } from '../src/foundwear/rules.js';
import { grantFind } from '../src/foundwear/play.js';

// Found outfits step 1, Task 9: the find wired into the walk (walk.js plans
// it at walk start and builds it, a resume puts it back, the walk's end
// disposes it), the frame (main.js checks it, plays its chime, runs the nose
// and shows the card) and the room profile (the spot key every member must
// carry). Source scans read the code with its comments stripped, as
// test/clanphrases.test.js does.

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const noComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

describe('found outfits: the wiring', () => {
  it('walk.js plans the find from the room seed or the solo seed, never walkRng, and restores and disposes it', () => {
    const w = noComments(read('src/game/walk.js'));
    expect(w).toMatch(/planFind\(\{[^}]*seed: roomSeed \?\? soloSeed/);
    expect(w).toMatch(/lessonKind: lessonPlan\?\.kind/);
    expect(w).toMatch(/planFind\(\{[^}]*\bisDen\b/);
    expect(w).toContain('restoreFind(session.find, { log })');
    expect(w).toContain('session.find.dispose()');
    expect(w.indexOf('session.find = ')).toBeGreaterThan(w.indexOf('assignShadowCasters(scene)'));
  });

  it('walk.js plans a room walk against the room as it was at the start, with her own key in it, and drops the find when the room stops agreeing', () => {
    const w = noComments(read('src/game/walk.js'));
    expect(w).toContain('roomFindRoster(roomAtStart?.roster ?? [], pid)');
    // the walk's own roster handler: a member who does not carry the key ends the find for that walk
    const onRoster = w.slice(w.indexOf('net.onRoster((roster) => {'), w.indexOf('net.onState('));
    expect(onRoster).toContain('findsAgreed(roomFindRoster(roster, session.playerId))');
    expect(onRoster).toContain('session.find = NO_FIND');
    expect(w).toContain('onNear: () => audio.findChime?.()');
  });

  it('main.js checks the find each frame, after the golden mice, and runs the nose after the treasure sniff', () => {
    const m = noComments(read('src/main.js'));
    expect(m.indexOf('session.find.update(')).toBeGreaterThan(m.indexOf('session.goldMice.checkFind('));
    expect(m.indexOf('tickFindNose(session, dt, progression.state)')).toBeGreaterThan(m.indexOf('tickAutoSniff(session, dt)'));
    for (const s of ["'btn-find-wear'", "'btn-find-later'", 'findCard?.onLockChange(locked)', "'find-later'", 'rooms.retrackProfile()']) expect(m).toContain(s);
  });

  it('main.js hands the find the remotes array, the busy test and the card the live shadow trim and the sound switches', () => {
    const m = noComments(read('src/main.js'));
    expect(m).toContain('findFrame.remotes = session.remotes.list');
    expect(m).toContain('findFrame.busy = findBusy(session)');
    expect(m).toContain('shadowMinPart: (s) => shadowMinPartNow(s.tier, qualityAdapter.status.rung)');
    expect(m).toMatch(/createFindCard\(\{[\s\S]*?getSound: pauseSound/);
    expect(m).toContain('findCard: !!session?.findCard');
    expect(m).toContain('handleFindArrival(session, arrival, { progression, log, hud, audio, card: findCard })');
    // a find taken is noted into the resume note at once, so a resumed walk never gives a second one
    expect(m).toContain('if (arrival && handleFindArrival(session, arrival, { progression, log, hud, audio, card: findCard })) noteWalk();');
    // one frame object, made once in init(), not per frame
    expect(m.match(/const findFrame = /g)).toHaveLength(1);
  });

  it('nothing in the find code throws its own dice or reads the clock', () => {
    // the cat-side found files too (src/cat/foundhead.js ... foundfeet.js)
    const found = globSync('src/cat/found*.js', { cwd: fileURLToPath(new URL('..', import.meta.url)) }).sort();
    expect(found).toEqual(expect.arrayContaining(['src/cat/foundhead.js', 'src/cat/foundface.js', 'src/cat/foundneck.js', 'src/cat/foundbody.js', 'src/cat/foundfeet.js']));
    for (const f of ['src/foundwear/rules.js', 'src/foundwear/live.js', 'src/foundwear/play.js', 'src/foundwear/display.js', 'src/foundwear/spots/index.js', 'src/game/findcard.js', ...found]) {
      expect(noComments(read(f)), f).not.toMatch(/Math\.random|walkRng|Date\.now|performance\.now/);
    }
  });

  it('the room profile carries the spot key; the state message is unchanged', async () => {
    const progression = createProgression(fakeStorage());
    progression.setPetName('Mittens');
    const made = createRooms({
      MP: 1, pid: 'aaaa-host-0001', supabaseUrl: 'x', supabaseAnonKey: 'y',
      progression, getCloud: () => null, getPsecret: () => null, getSession: () => null, startWalk() {},
      colonySync: { status: () => ({ mode: 'unpaired' }), pull() {} },
      createTransport: () => createFakeHub().transport(),
    });
    expect(made.roomProfile().finds).toBe(FIND_KEY);
    expect(typeof made.roomProfile().finds).toBe('number');
    const m = noComments(read('src/main.js'));
    expect(m).toContain('pos: [session.cat.position.x, session.cat.position.z],');
  });
});

describe('found outfits: the room as the find sees it', () => {
  const ME = 'aaaa-me-000001', HIM = 'bbbb-him-00002';

  it('her own key stands in for her own entry, beside every other member as the room lists them', () => {
    expect(roomFindRoster([], ME)).toEqual([{ playerId: ME, finds: FIND_KEY }]);
    const r = roomFindRoster([{ playerId: ME }, { playerId: HIM, finds: FIND_KEY }], ME);
    expect(r).toEqual([{ playerId: HIM, finds: FIND_KEY }, { playerId: ME, finds: FIND_KEY }]);
    expect(findsAgreed(r)).toBe(true);
    expect(findsAgreed(roomFindRoster([{ playerId: HIM }], ME))).toBe(false);
    expect(roomFindRoster(null, ME)).toEqual([{ playerId: ME, finds: FIND_KEY }]);
  });

  it('two devices in one room plan the same find; a partner on an older build means none for either', () => {
    const seed = 0x1234abcd;
    const both = [{ playerId: ME, finds: FIND_KEY }, { playerId: HIM, finds: FIND_KEY }];
    const mine = planFind({ areaId: 'woods', seed, roster: roomFindRoster(both, ME) });
    const his = planFind({ areaId: 'woods', seed, roster: roomFindRoster(both, HIM) });
    expect(mine).not.toBe(null);
    expect(his).toEqual(mine);
    const older = [{ playerId: ME, finds: FIND_KEY }, { playerId: HIM }];
    expect(planFind({ areaId: 'woods', seed, roster: roomFindRoster(older, ME) })).toBe(null);
  });
});

describe('found outfits: a find with nothing on the ground gives nothing', () => {
  function walkLog() {
    const progression = createProgression(fakeStorage());
    const log = createDiscoveryLog(progression);
    log.startWalk();
    return { progression, log };
  }

  it('NO_FIND, a taken find and a find with no item never pay the pouch', async () => {
    const { NO_FIND } = await import('../src/foundwear/live.js');
    for (const f of [
      NO_FIND,
      { item: { kind: 'pouch' }, taken: true, take: vi.fn() },
      { item: null, taken: false, take: vi.fn() },
    ]) {
      const { progression, log } = walkLog();
      const before = progression.state.points;
      expect(grantFind(f, { by: 'me' }, { progression, log })).toBe(null);
      expect(progression.state.points).toBe(before);
      expect(log.count('wear-find')).toBe(0);
    }
  });
});
