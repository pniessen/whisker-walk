import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';

vi.stubGlobal('document', canvasStub);

const H = await import('../src/world/houseplan.js');
const { createWallSink, makeView, SINK } = await import('../src/housewalls.js');
await (await import('../src/world/housestages.js')).loadHouseStages(); // the wing's lazy stage (housestagewing.js) fills the house's wing slots
const { build } = await import('../src/world/house.js');
const { CAT_LOOK_Y } = await import('../src/cat/model.js');

// =============================================================================
// The east wing's shell (Old House wing, milestone 1): the wing's wall sections sink and rise like the
// old ones, the parlour's east wall is the only old wall that changed, the wing stair is walled like the
// others, and the wing builds and goes away with the house.
// =============================================================================

const WING_OWNERS = new Set(['livingroom', 'solarium', 'kids', 'bath', 'wing']);
const sections = H.houseSections();
const mine = (s) => WING_OWNERS.has(s.owner);

describe('the east wing\'s shell', () => {
  it('sinks and rises its wall sections like the old ones: a wall between the camera and her goes down, the rest stand', () => {
    const sink = createWallSink(sections, { reducedMotion: true });
    const cat = { x: 18, y: 0, z: 7 }; // in the living room
    const cam = { x: 18, y: 2.2, z: 13.5 }; // outside its south wall, looking in
    const view = makeView(cat, cam, CAT_LOOK_Y, {});
    sink.settle(view);
    const south = sections.filter((s) => s.owner === 'livingroom' && s.side === 's' && s.kind === 'wall');
    expect(south.length).toBeGreaterThan(0);
    for (const s of south) expect(sink.fraction(s.id), s.id).toBeLessThan(1);
    const north = sections.filter((s) => s.owner === 'livingroom' && s.side === 'n' && s.kind === 'wall');
    for (const s of north) expect(sink.fraction(s.id), s.id).toBe(1);
    // the solarium's glass: its panes hide with their wall
    const glass = sections.filter((s) => s.owner === 'solarium' && s.window);
    expect(glass.length).toBe(6);
    const view2 = makeView({ x: 26, y: 0, z: 7 }, { x: 26, y: 2.0, z: 13.5 }, CAT_LOOK_Y, {});
    sink.settle(view2);
    const hidden = glass.filter((s) => s.side === 's').map((s) => sink.fraction(s.id));
    for (const f of hidden) expect(f).toBeLessThan(SINK.paneHide);
  });

  it('cuts a doorway in the parlour\'s east wall and leaves every other old wall as it was', () => {
    const e = sections.filter((s) => s.owner === 'parlour' && s.side === 'e');
    const lintel = e.filter((s) => s.kind === 'lintel');
    expect(lintel).toHaveLength(1);
    expect([lintel[0].z0, lintel[0].z1]).toEqual([9.2, 11.2]); // D1, at z 10.2
    for (const s of e.filter((q) => q.kind === 'wall')) expect(s.z1 <= 9.2 + 1e-9 || s.z0 >= 11.2 - 1e-9, s.id).toBe(true);
    const old = sections.filter((s) => !mine(s) && !(s.owner === 'parlour' && s.side === 'e'));
    const key = old.map((s) => [s.id, s.kind, s.x0, s.z0, s.x1, s.z1, s.base, s.height, s.outer]);
    expect(old).toHaveLength(88);
    expect(createHash('sha1').update(JSON.stringify(key)).digest('hex')).toBe('a7846958beaad90fdc0b89402a492bfe8fe1a664');
  });

  it('walls the wing stair like the others, 0.286 up, and the ground keeps to its own side of the walls', () => {
    const walls = sections.filter((s) => s.owner === 'wing');
    expect(walls.map((s) => s.side).sort()).toEqual(['n', 'n', 'n', 's', 's', 's']); // 8.4 m, three 2.8 m sections a side
    for (const s of walls) {
      expect(s.kind).toBe('stair');
      expect(s.outer).toBe(true); // lawn on both sides
      expect(s.base).toBe(0);
    }
    const area = H.houseArea();
    // beside the stair's walls (past the 0.3 m wall feet) the lawn stays the lawn, whatever the stair's height there
    for (const x of [31, 33, 35, 37]) {
      for (const z of [5.4, 8.6]) expect(area.ground.y(x, z), `${x},${z}`).toBe(0);
    }
    // up the stair itself she is on its slope
    expect(area.ground.y(34.2, 7)).toBeCloseTo(1.2, 6);
    expect(area.ground.y(37.5, 7)).toBeCloseTo(2.14, 2);
  });

  it('builds with the headless document stub, gives every section its mesh, and puts the wing away with the house', () => {
    const scene = new THREE.Scene();
    const area = build(scene);
    for (const s of sections.filter(mine)) expect(area.house.sectionMeshes.get(s.id), s.id).toBeTruthy();
    // a wing wall's mesh is in its zone's group, which is hidden until she is near
    const g = scene.children.find((c) => c.userData?.houseWalls === 'living');
    expect(g.visible).toBe(false);
    expect(g.children.length).toBeGreaterThan(0);
    const life = area.life({ scene, reducedMotion: true });
    life.settle(new THREE.Vector3(18, 0, 7), new THREE.PerspectiveCamera());
    expect(g.visible).toBe(true);
    life.dispose();
    expect(g.visible).toBe(true); // dispose puts every detail back, as for the old levels
  });
});
