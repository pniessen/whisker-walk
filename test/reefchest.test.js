// The Treasure Chest on the Sandy Flats you can open (world/reefchestlive.js): the prompt only beside it, a press plays the show, the Pearl Crown and a few
// paws are given once ever, the chest stays open (and empty) on every later walk, and the crown is a head piece that is not for sale.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { createDiscoveryLog, AWARDS } from '../src/discoveries.js';
import { CATALOG, sanitizeSave } from '../src/progression.js';
import { phrase } from '../src/clanphrases.js';
import { buildHat } from '../src/cat/hats.js';
import { REEF_FIND_MARKS } from '../src/world/reeffindsplan.js';
import { CHEST_YAW } from '../src/world/reeffindparts.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { topY } from '../src/world/reefwreckplan.js';
import { reefY } from '../src/world/reefplan.js';
import { createReefChestLife, CROWN_ID, SHOW, CHEST_AT, lidGeometry as lid, crownGeometry as crown } from '../src/world/reefchestlive.js';

stubCanvasDocument();
const { build } = await import('../src/world/reef.js');
build(new THREE.Scene()); // (installs the ground the chest's height reads)
const T = { ...THREE, mergeGeometries };
const lidGeometry = () => lid(T);
const crownGeometry = () => crown(T);

const { x, z } = REEF_FIND_MARKS.chest;
it('the chest\'s place is the find mark\'s, copied', () => { expect(CHEST_AT).toMatchObject({ x, z, yaw: CHEST_YAW }); expect(topY(x, z)).toBe(reefY(x, z)); });
function walk(owned = false, head = null, reducedMotion = false) {
  const scene = new THREE.Scene();
  const progression = { state: { unlocked: { accessories: owned ? [CROWN_ID] : [] }, equipped: { head }, points: 0 }, addPoints(n) { this.state.points += n; } };
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const said = [];
  const life = createReefChestLife({ scene, THREE: T, progression, log, audio: { chime() {} }, say: (t) => said.push(t), reducedMotion });
  const run = (secs) => { for (let t = 0; t < secs; t += 0.05) life.update(0.05, t, { x, z }); };
  return { scene, progression, life, said, run };
}

describe('the openable chest', () => {
  it('its three lines are plain in both word sets', async () => {
    const { CHEST_LINES } = await import('../src/world/reefchestwords.js');
    const { withOffWords, bannedIn } = await import('./helpers/offwords.js');
    for (const id of Object.keys(CHEST_LINES)) expect(phrase(id).length, id).toBeGreaterThan(5);
    withOffWords(() => { for (const id of Object.keys(CHEST_LINES)) expect(bannedIn(phrase(id)), id).toBeNull(); });
  });
  it('offers "Open the chest" only beside it, and only while it is shut', () => {
    const w = walk();
    expect(w.life.promptAt({ x, z })).toBe(phrase('reef.chest.prompt'));
    expect(w.life.promptAt({ x, z })).toBe('Open the chest');
    expect(w.life.promptAt({ x: x + 5, z })).toBeNull();
    expect(walk(true).life.promptAt({ x, z })).toBeNull();
  });
  it('a press plays the show, then gives the crown and the paws once, wearing it if her head is bare', () => {
    const w = walk();
    w.life.promptAt({ x, z });
    w.life.interact();
    expect(w.life.state.showing).toBe(true);
    expect(w.life.promptAt({ x, z })).toBeNull(); // no second press mid-show
    w.run(SHOW.rise + 1);
    const st = w.progression.state;
    expect(st.unlocked.accessories).toEqual([CROWN_ID]);
    expect(st.equipped.head).toBe(CROWN_ID);
    expect(st.points).toBe(AWARDS.reefchest);
    expect(w.life.state).toMatchObject({ opened: true, showing: false });
    expect(w.life.promptAt({ x, z })).toBeNull();
    w.life.interact();
    w.run(5);
    expect(st.points).toBe(AWARDS.reefchest); // nothing paid twice
  });
  it('keeps a hat she already wears and is open on a later walk', () => {
    const w = walk(false, 'tophat');
    w.life.promptAt({ x, z }); w.life.interact(); w.run(SHOW.rise + 1);
    expect(w.progression.state.equipped.head).toBe('tophat');
    expect(w.progression.state.unlocked.accessories).toContain(CROWN_ID);
    expect(walk(true).life.state.opened).toBe(true);
  });
  it('reduced motion still opens, gives and ends', () => {
    const w = walk(false, null, true);
    w.life.promptAt({ x, z }); w.life.interact(); w.run(SHOW.rise + 1);
    expect(w.progression.state.unlocked.accessories).toContain(CROWN_ID);
  });
  it('adds no caster and no light, and cleans up', () => {
    const w = walk();
    w.scene.traverse((o) => { expect(o.castShadow).toBeFalsy(); expect(o.isLight).toBeFalsy(); });
    w.life.dispose();
    expect(w.scene.children).toHaveLength(0);
  });
  it('the geometry is small and the crown is a head piece nobody can buy', () => {
    expect(lidGeometry().attributes.position.count).toBeLessThan(200);
    expect(crownGeometry().attributes.position.count).toBeLessThan(1500);
    expect(CATALOG.accessories[CROWN_ID]).toMatchObject({ name: 'Pearl Crown', slot: 'head', prize: true });
    expect(buildHat(CROWN_ID, { simple: false })).toBeTruthy();
    expect(buildHat(CROWN_ID, { simple: true })).toBeTruthy();
    const save = sanitizeSave({ version: 4, unlocked: { accessories: [CROWN_ID] } });
    expect(save.unlocked.accessories).toContain(CROWN_ID);
  });
});
