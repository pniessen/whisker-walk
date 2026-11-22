import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';

vi.stubGlobal('document', canvasStub);

const { HOUSE_LEVELS, LEVEL_LINKS, HOUSE_ZONES, wingZoneAt, isWingZone, outdoorsAt, WING_JOINS, ZONE_NEAR, ZONE_LEAVE, OUT_NEAR, OUT_LEAVE } = await import('../src/world/houseplan.js');
const { createLevelDrawing } = await import('../src/houselevels.js');

// =============================================================================
// The east wing's zone drawing (Old House wing, milestone 1): a zone is a set of rooms drawn
// together. Her zone is drawn in full; a zone joined to it by the parlour's east doorway or the
// wing stair only while she is within ZONE_NEAR of the way in; every other zone is its stand-in.
// The old levels draw as they always did.
// =============================================================================

const obj = (userData = {}) => ({ visible: true, userData, children: [] });
const wing = { zoneAt: wingZoneAt, isWing: isWingZone, outdoors: outdoorsAt, joins: WING_JOINS, near: ZONE_NEAR, leave: ZONE_LEAVE };

function fixture() {
  const scene = { children: [] };
  const per = {};
  for (const z of HOUSE_ZONES) {
    const detail = obj({ houseDetail: true, houseLevel: z.id });
    const simple = obj({ houseSimple: z.id });
    scene.children.push(detail, simple);
    per[z.id] = { detail, simple };
  }
  const partner = obj({ cat: true });
  scene.children.push(partner);
  return { scene, per, partner };
}
const drawing = (fx, start = 'ground') => createLevelDrawing(fx.scene, { levels: HOUSE_LEVELS, links: LEVEL_LINKS, start, wing });
const fullOf = (d) => [...d.full].sort();
// the walk's own frame: her paws' height is the floor's, her place is x, z
const at = (d, x, z, y) => { d.update(y, x, z); return fullOf(d); };

describe('zone drawing in the east wing', () => {
  it('knows its four joins: the parlour\'s east door, the living room\'s door to the solarium, the wing stair, the bathroom door', () => {
    expect(ZONE_NEAR).toBe(5);
    expect(ZONE_LEAVE).toBeGreaterThan(ZONE_NEAR);
    expect(WING_JOINS.filter((j) => !j.outside).map((j) => [j.a, j.b])).toEqual([['ground', 'living'], ['living', 'sun'], ['sun', 'kids'], ['kids', 'bath']]);
    // and the rooms seen from the lawn: each wing room, the solarium twice (its stair gallery too)
    expect(WING_JOINS.filter((j) => j.outside).map((j) => j.b).sort()).toEqual(['bath', 'kids', 'living', 'sun', 'sun']);
    expect(OUT_NEAR).toBe(5);
    expect(OUT_LEAVE).toBeGreaterThan(OUT_NEAR);
  });

  it('draws her zone in full, the nearest joined zone while it is near, and every other as its stand-in', () => {
    const fx = fixture();
    const d = drawing(fx);
    d.settle(0, 16.3, 3); // the living room's north-west, far from both doors
    expect(fullOf(d)).toEqual(['living']);
    expect(fx.per.living.detail.visible).toBe(true);
    expect(fx.per.living.simple.visible).toBe(false);
    for (const id of ['cellar', 'ground', 'upstairs', 'attic', 'sun', 'kids', 'bath']) {
      expect(fx.per[id].detail.visible, id).toBe(false);
      expect(fx.per[id].simple.visible, id).toBe(true);
    }
    expect(at(d, 15.0, 10.2, 0)).toEqual(['ground', 'living']); // at the parlour's door: the parlour beside her
    expect(at(d, 17, 6, 0)).toEqual(['ground', 'living']); // 4.1 m from that door, 4.6 m from the solarium's: the parlour stays on
    expect(at(d, 26, 7, 0)).toEqual(['living', 'sun']); // the solarium's middle: the living room's door 3.6 m back, the stair 4.0 m on
    expect(at(d, 28.5, 7, 0)).toEqual(['kids', 'sun']); // 1.5 m from the stair's mouth: the kids' room, no longer the living room
    expect(at(d, 36, 7, 1.7)).toEqual(['kids', 'sun']); // on the stair she stands in it: both
    expect(at(d, 43, 7, 2.4)).toEqual(['kids', 'sun']); // into the kids' room, 4.6 m from the stair's top: still
    expect(at(d, 44.5, 5.5, 2.4)).toEqual(['bath', 'kids']); // 6.1 m from it: gone; the bathroom's door is 4.0 m off
    expect(at(d, 41, 3.2, 2.4)).toEqual(['bath', 'kids']); // 1.2 m from the bathroom door
    expect(at(d, 46, 11, 2.4)).toEqual(['kids']); // the kids' room's south-east corner: no way in within 5 m
    expect(at(d, 41, -2, 2.4)).toEqual(['bath', 'kids']); // in the bathroom 3.6 m from the door: the kids' room beside her
    expect(at(d, 41, -2.8, 2.4)).toEqual(['bath', 'kids']); // 4.4 m: still (on until 6 m)
    expect(fx.per.bath.detail.visible).toBe(true);
    expect(fx.per.kids.detail.visible).toBe(true); // the nearest way in
    expect(fx.per.sun.detail.visible).toBe(false);
  });

  it('draws only her own level, not the levels its stairs join, while the wing is near the parlour, and only the parlour of it', () => {
    const fx = fixture();
    const rooms = { hall: obj({ houseDetail: true, houseLevel: 'ground', houseRoom: 'hall' }), parlour: obj({ houseDetail: true, houseLevel: 'ground', houseRoom: 'parlour' }), fade: obj({ houseDetail: true, houseLevel: 'ground', houseRoomOf: 'library' }) };
    const far = obj({ houseFar: 'ground' });
    fx.scene.children.push(rooms.hall, rooms.parlour, rooms.fade, far);
    const d = drawing(fx);
    expect(at(d, 8, 7, 0)).toEqual(['cellar', 'ground', 'upstairs']); // the parlour's west half as ever (7.6 m from the door)
    for (const o of [rooms.hall, rooms.parlour, rooms.fade]) expect(o.visible).toBe(true);
    expect(far.visible).toBe(false);
    expect(at(d, 10.5, 10.2, 0)).toEqual(['ground', 'living']); // 3.1 m from the door: the living room, and the ground alone
    expect(fx.per.upstairs.simple.visible).toBe(true);
    expect(fx.per.cellar.simple.visible).toBe(true);
    expect(fx.per.living.detail.visible).toBe(true);
    expect(rooms.parlour.visible).toBe(true); // the parlour stays in full
    expect(rooms.hall.visible).toBe(false); // the hall and the library's tall pieces step back to the far stand-in
    expect(rooms.fade.visible).toBe(false);
    expect(far.visible).toBe(true);
    expect(at(d, 6, 10.2, 0)).toEqual(['cellar', 'ground', 'upstairs']); // 7.6 m away again
    expect(fx.per.living.simple.visible).toBe(true);
    expect(rooms.hall.visible).toBe(true);
    expect(far.visible).toBe(false);
  });

  it('counts the camera as her: a room the camera hangs in is drawn, not a tray under it', () => {
    const fx = fixture();
    const d = drawing(fx);
    // she is in the solarium's south-east, the camera 8 m west in the living room (Farther)
    d.settle(0, 27, 10.5, 19, 10.5);
    expect(fullOf(d)).toEqual(['living', 'sun']);
    // and with the camera beside her the stair is the nearest way in, not the living room's door
    const fy = fixture();
    const e = drawing(fy);
    e.settle(0, 27, 10.5, 28.5, 10.5);
    expect(fullOf(e)).toEqual(['kids', 'sun']);
  });

  it('turns on at ZONE_NEAR and off at ZONE_LEAVE, so the line never flickers', () => {
    const fx = fixture();
    const d = drawing(fx);
    at(d, 2, 7, 0); // the hall
    const near = (m) => at(d, 13.6 - m, 10.2, 0).includes('living'); // m metres from the doorway's edge
    expect(near(4.9)).toBe(true); // within 5 m of the doorway: on
    expect(near(5.5)).toBe(true); // still on at 5.5
    expect(near(6.2)).toBe(false); // off past 6
    expect(near(5.5)).toBe(false); // and not on again at 5.5
    expect(near(4.8)).toBe(true);
  });

  it('keeps one joined zone: the nearest, and the one on until another is a metre nearer', () => {
    const fx = fixture();
    const d = drawing(fx);
    d.settle(0, 16, 7); // the living room, 1.6 m from the parlour's door and 5.6 m from the solarium's
    expect(fullOf(d)).toEqual(['ground', 'living']);
    expect(at(d, 18, 7, 0)).toEqual(['ground', 'living']); // 4.2 m from the first door, 3.6 m from the second: not a metre nearer
    expect(at(d, 19.3, 7, 0)).toEqual(['living', 'sun']); // 5.4 m and 2.3 m: the solarium takes over
    expect(at(d, 18, 7, 0)).toEqual(['living', 'sun']); // and keeps it back at the middle
  });

  it('reads her place, not her paws\' height: the wing\'s floors share heights with the old levels', () => {
    const fx = fixture();
    const d = drawing(fx);
    // paws at the ground's 0, one in the hall and one in the solarium: different zones
    expect(at(d, 0, 8, 0)).toEqual(['cellar', 'ground', 'upstairs']);
    expect(at(d, 26, 7, 0)).toEqual(['living', 'sun']); // the solarium's middle (an old level's height, a wing zone)
    // paws at the upstairs 2.4, one in the bedroom and one in the kids' room
    expect(at(d, -3, -9, 2.4)).toEqual(['attic', 'ground', 'upstairs']);
    expect(at(d, 46, 11, 2.4)).toEqual(['kids']);
    // out of the wing by the doorway, she is on the level her paws are
    expect(at(d, 12, 10.2, 0)).toEqual(['ground', 'living']);
  });

  it('settles at once on a walk picked up in the wing, with no 0.3 m hold, and on one picked up elsewhere', () => {
    const fx = fixture();
    const d = drawing(fx);
    d.settle(2.4, 46, 11); // a resume in the kids' room's south-east corner
    expect(d.current).toBe('kids');
    expect(fullOf(d)).toEqual(['kids']);
    expect(fx.per.kids.detail.visible).toBe(true);
    expect(fx.per.ground.detail.visible).toBe(false);
    const fy = fixture();
    const e = drawing(fy);
    e.settle(4.2, -19, -10); // the attic
    expect(e.current).toBe('attic');
    expect(fullOf(e)).toEqual(['attic', 'upstairs']);
  });

  it('draws a partner in a stand-in zone as ever: nothing but tagged details and stand-ins is touched', () => {
    const fx = fixture();
    const d = drawing(fx);
    d.settle(0, 16.3, 3);
    expect(fx.partner.visible).toBe(true); // her partner\'s cat, untagged, never hidden
    d.update(2.4, 46, 11);
    expect(fx.partner.visible).toBe(true);
  });

  it('draws a wing room from the lawn while she is out within 5 m of it, with the old ground kept for no room', () => {
    const fx = fixture();
    const parlour = obj({ houseDetail: true, houseLevel: 'ground', houseRoom: 'parlour' });
    const far = obj({ houseFar: 'ground' });
    fx.scene.children.push(parlour, far);
    const d = drawing(fx);
    expect(outdoorsAt(41, -9)).toBe(true); // the lawn north of the bathroom
    expect(outdoorsAt(26, 7)).toBe(false); // the solarium
    expect(outdoorsAt(26, -4)).toBe(false); // the cellar, sunk under the lawn
    d.settle(0, 0, 8);
    expect(at(d, 41, -9, 0)).toEqual(['cellar', 'ground', 'upstairs']); // 6 m north of the bathroom's wall (z -3): out of reach
    expect(fx.per.bath.simple.visible).toBe(true);
    expect(at(d, 41, -6.5, 0)).toEqual(['bath', 'ground']); // 3.5 m north of it: drawn, and the old ground beside it, alone
    expect(parlour.visible).toBe(false); // no room of the old ground in full out on the lawn
    expect(far.visible).toBe(false); // the ordinary stand-in stands for all of it, not the parlour-less one
    expect(fx.per.ground.simple.visible).toBe(true);
    expect(at(d, 41, -7.8, 0)).toEqual(['bath', 'ground']); // 4.8 m: still drawn
    expect(at(d, 41, -8.4, 0)).toEqual(['bath', 'ground']); // 5.4 m: on until 6 m, so the line does not flicker
    expect(at(d, 41, -9.2, 0)).toEqual(['cellar', 'ground', 'upstairs']); // 6.2 m: the old house as ever
    expect(parlour.visible).toBe(true);
    expect(fx.per.ground.simple.visible).toBe(false);
    // in the parlour by the east wall she is not out on the lawn: only the doorway's rule
    expect(outdoorsAt(13, 5)).toBe(false);
    expect(at(d, 13, 5, 0)).toEqual(['ground', 'living']);
  });

  it('draws the old levels exactly as before when no position is given (the old tests\' way)', () => {
    const fx = fixture();
    const d = drawing(fx, 'cellar');
    const out = [];
    for (let y = -1.8; y <= 4.2001; y += 0.05) {
      d.update(y);
      out.push([...d.full].sort().join());
    }
    const gx = fixture();
    const old = createLevelDrawing(gx.scene, { levels: HOUSE_LEVELS, links: LEVEL_LINKS, start: 'cellar' });
    const was = [];
    for (let y = -1.8; y <= 4.2001; y += 0.05) {
      old.update(y);
      was.push([...old.full].sort().join());
    }
    expect(out).toEqual(was);
  });

  it('has a stair that is hers whole: both its zones are full anywhere on it', () => {
    const fx = fixture();
    const d = drawing(fx);
    for (let x = 30.2; x <= 38.2; x += 0.5) {
      const y = ((x - 30) / 8.4) * 2.4;
      const got = at(d, x, 7, y);
      expect(got, `x ${x}`).toEqual(['kids', 'sun']);
    }
    expect(new THREE.Vector3()).toBeTruthy();
  });
});
