import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createInteractions } from '../src/game/interactions.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { createProgression } from '../src/progression.js';
import { createEnemyWalkLog } from '../src/enemies.js';
import { createStrayCats } from '../src/straycats.js';
import { mulberry32 } from '../src/rng.js';
import { memoryStorage as fakeStorage } from './helpers/storage.js';

// Milestone 3: game/interactions.js asks an area's life for an offer (promptAt) and hands it the action button
// (interact). The Lighthouse's kitten is the only life that has them; every other life has neither and is not asked.

const scene = { add() {}, remove() {} };
function harness(areaLife) {
  const progression = createProgression(fakeStorage());
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const prompts = [];
  const session = {
    areaId: 'lighthouse', walkStamp: 'walk-1', colonyWalk: false, playerId: 'player-me-000001', net: null,
    cat: { position: new THREE.Vector3(0, 0, 0), userData: { breed: 'tabby' } },
    areaData: { collectibles: [], scenics: [] },
    collectibleMeshes: new Map(),
    critters: { list: [], dismayNear() {} },
    strayCats: createStrayCats(scene, { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } }, 0, mulberry32(11), { colonyCats: [] }),
    enemies: createEnemyWalkLog(),
    ghosts: { list: [], nearest: () => null }, remotes: { nearest: () => null }, secrets: { list: [] },
    tippables: { nearest: () => null, list: [] }, scent: { nearestMound: () => null }, goldMice: null,
    race: { promptAt: () => null }, kittenEnc: null, quest: null, questGiver: null, questObject: null, gifts: null, perched: null,
    freezeTime: 0, catsGreeted: 0, walk: { carried: 0, carryCap: 2 }, fx: { burst() {} }, prompt: null, lastPromptKind: null,
    areaLife,
  };
  const api = createInteractions({
    MP: 1, pid: 'player-me-000001', getCloud: () => null, getPsecret: () => null,
    getSession: () => session, getIsTouch: () => false,
    player: { forward: () => new THREE.Vector3(0, 0, -1), perchY: 0, halt() {} },
    progression, log,
    hud: { toast() {}, setPrompt: (t) => prompts.push(t), setPoints() {} },
    audio: { trill() {}, purr() {}, meow() {}, hiss() {}, fanfare() {} },
    catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
  });
  return { api, session, prompts };
}

describe('an area life\'s offer', () => {
  it('shows the life\'s line as the prompt, and E hands the action to the life', () => {
    const calls = [];
    const h = harness({ promptAt: (p) => (p.x === 0 ? 'E — say hello to the kitten' : null), interact: () => calls.push('interact'), update() {}, dispose() {} });
    h.api.updateInteractions(h.session);
    expect(h.session.prompt?.kind).toBe('area-life');
    expect(h.prompts.at(-1)).toBe('E — say hello to the kitten');
    h.api.handleInteract(h.session);
    expect(calls).toEqual(['interact']);
    h.session.cat.position.x = 9;
    h.api.updateInteractions(h.session);
    expect(h.session.prompt).toBeNull();
  });
  it('a life with no offer (every other place\'s) is never asked, and a life that says null offers nothing', () => {
    const none = harness({ update() {}, dispose() {} });
    expect(() => none.api.updateInteractions(none.session)).not.toThrow();
    expect(none.session.prompt).toBeNull();
    const silent = harness({ promptAt: () => null, interact() { throw new Error('asked'); }, update() {}, dispose() {} });
    silent.api.updateInteractions(silent.session);
    expect(silent.session.prompt).toBeNull();
  });
});
