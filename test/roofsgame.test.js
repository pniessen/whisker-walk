import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createSession, walkDusk } from '../src/game/session.js';
import { snapshotWalk, settleAbandoned } from '../src/game/walkresume.js';
import { createProgression } from '../src/progression.js';

// =============================================================================
// The Rooftops in the game (Rooftops step 2). Task 8: the evening look, and a
// Rooftops walk counting as a dusk walk only with the Glow Collar (Review
// Focus item 5). Tasks 9, 11 and 12 add to this file.
// =============================================================================

const walkSrc = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
const ROOFS = { evening: true };
const WOODS = {};

function memStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

// A solo walk as startWalk makes it: the Day or Dusk choice, her collar, the place.
function start({ duskMode, collar, area }) {
  const d = walkDusk({ duskMode, room: false, collar, evening: area.evening });
  const session = createSession({
    areaData: { collectibles: [], ...area }, duskMode, duskActive: d.duskActive, countsDusk: d.countsDusk,
    soloSeed: 7, walkStamp: 'walk-1', resumeTries: 0,
  });
  Object.assign(session, {
    areaId: area === ROOFS ? 'roofs' : 'woods', net: null,
    cat: { position: { x: 4, y: 0, z: 41 } }, collectibleMeshes: new Map(),
    walk: { carried: 0, carryCap: 2 }, scenicsVisited: new Set(), startPoints: 0,
  });
  return { ...d, session };
}

// endWalk's tally (walk.js: progression.completeWalk(session.areaId, { dusk: session.countsDusk })).
function duskWalksAfter(session) {
  const p = createProgression(memStorage());
  p.completeWalk(session.areaId, { dusk: session.countsDusk });
  return p.state.duskWalks;
}

describe('the Rooftops’ evening in the walk', () => {
  it('counts as a dusk walk only with the Glow Collar', () => {
    // the Day choice and the Glow Collar on the Rooftops: an evening look, and it counts
    const glow = start({ duskMode: false, collar: 'glow', area: ROOFS });
    expect([glow.duskActive, glow.eveningLook, glow.countsDusk]).toEqual([false, true, true]);
    expect(glow.session.countsDusk).toBe(true);
    expect(duskWalksAfter(glow.session)).toBe(1);
    // ...and the walk's resume note keeps that, so an abandoned walk counts too
    const note = snapshotWalk(glow.session, { yaw: 0, now: 1 });
    expect(note.duskActive).toBe(true);
    const p = createProgression(memStorage());
    settleAbandoned(p, note);
    expect(p.state.duskWalks).toBe(1);
    // the same walk with no collar (or another one): the same look, and it does not count
    for (const collar of [null, 'bell']) {
      const plain = start({ duskMode: false, collar, area: ROOFS });
      expect([plain.duskActive, plain.eveningLook, plain.countsDusk]).toEqual([false, true, false]);
      expect(duskWalksAfter(plain.session)).toBe(0);
      expect(snapshotWalk(plain.session, { yaw: 0, now: 1 }).duskActive).toBe(false);
    }
    // the Dusk choice without the collar is no dusk walk there either
    expect(start({ duskMode: true, collar: null, area: ROOFS }).countsDusk).toBe(false);
    // everywhere else, nothing changes: dusk is the Dusk choice and the Glow Collar
    expect(walkDusk({ duskMode: false, room: false, collar: 'glow', evening: undefined })).toEqual({ duskActive: false, eveningLook: false, countsDusk: false });
    expect(walkDusk({ duskMode: true, room: false, collar: 'glow', evening: undefined })).toEqual({ duskActive: true, eveningLook: true, countsDusk: true });
    expect(walkDusk({ duskMode: true, room: false, collar: null, evening: undefined })).toEqual({ duskActive: false, eveningLook: false, countsDusk: false });
    // a room trusts the host's choice, as before
    expect(walkDusk({ duskMode: true, room: true, collar: null, evening: undefined })).toEqual({ duskActive: true, eveningLook: true, countsDusk: true });
    expect(start({ duskMode: false, collar: 'glow', area: WOODS }).countsDusk).toBe(false);

    // walk.js: the one place it is worked out, and what each half drives
    expect(walkSrc).toContain('const { duskActive, eveningLook, countsDusk } = walkDusk({ duskMode, room: roomSeed !== undefined, collar: equipped.collar, evening: areaData.evening });');
    expect(walkSrc).toContain('const duskLookNow = eveningLook ? applyDusk({ scene, sun, fill, areaData }) : null;');
    expect(walkSrc).toMatch(/composerRig\.applyLighting\(scene, \{\s*dusk: eveningLook,/);
    expect(walkSrc).toMatch(/createAmbient\(scene, \{\s*areaId, areaData, tier, camera, dusk: eveningLook,/);
    expect(walkSrc).toMatch(/createClouds\(scene, \{\s*areaId, tier, camera, reducedMotion, dusk: eveningLook,/);
    expect(walkSrc).toContain("audio.startAmbient(areaId, { dusk: eveningLook, rain: weather.condition === 'rain' });");
    expect(walkSrc).toContain("const musicMood = eveningLook ? 'dusk' :");
    expect(walkSrc).toContain('progression.completeWalk(session.areaId, { dusk: session.countsDusk });');
    expect(walkSrc).toMatch(/\n\s+duskActive,\n\s+countsDusk,\n/); // both into the session
    // duskActive keeps the rest: the secrets' roll and the fireflies
    expect(walkSrc).toContain("rollSecrets(walkRng, { eveningLight: duskActive || weather.condition === 'sunset' })");
    expect(walkSrc).toContain('spawnFireflies: duskActive,');
    const resume = readFileSync(new URL('../src/game/walkresume.js', import.meta.url), 'utf8');
    expect(resume).toContain('duskActive: !!session.countsDusk,');
  });

  it('no weather on the roofs', () => {
    expect(walkSrc).toContain('if (!duskActive && !isDen && areaData.evening !== true) {');
    // the gate is the only place a walk's weather is made, just inside it
    expect(walkSrc.match(/createWeather\(/g)).toHaveLength(1);
    const at = walkSrc.indexOf('if (!duskActive && !isDen && areaData.evening !== true) {');
    expect(walkSrc.indexOf('createWeather(')).toBeGreaterThan(at);
    expect(walkSrc.indexOf('createWeather(') - at).toBeLessThan(600);
  });
});
