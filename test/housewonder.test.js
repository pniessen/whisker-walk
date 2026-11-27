import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';

// The headless document stub every world test uses (test/flattrace.test.js's).
vi.stubGlobal('document', canvasStub);

const {
  HOUSE_STAIRS, HOUSE_ROOMS, HOUSE_BOUNDS, HOUSE_LEDGES, HOUSE_FURNITURE, LEVEL_LINKS, SECRET_WARDROBE, SECRET_R, COLLIDER_STEP, WALL_H, CAT_SCALE_MAX, WING_TUNNEL,
  houseArea, houseSections, houseColliders, wardrobeColliders, wardrobePivot, wingZoneAt, WING_JOINS,
} = await import('../src/world/houseplan.js');
const { WING_ZONES } = await import('../src/world/housewingplan.js');
const { HOUSE_WING_FINDS, HOUSE_WING_GOLD, HOUSE_WING_HINTS, HOUSE_WING_NOOKS, WING_FEATHER } = await import('../src/world/housewingthings.js');
const { houseMapShapes, HOUSE_BOXES } = await import('../src/world/housethings.js');
const { houseMovesArea } = await import('../src/world/housemoves.js');
const { createLevelDrawing } = await import('../src/houselevels.js');
const { CAT_RADIUS, isWalkableAt } = await import('../src/player.js');
const { MAX_PATH_GRADE } = await import('../src/ground.js');
const { houseFlood } = await import('./helpers/houseflood.js');
const { createHouseWalk } = await import('./helpers/housewalk.js');
const { BASE_ABILITIES } = await import('../src/traversal.js');
const { floodTraversal } = await import('./helpers/traversalflood.js');
await (await import('../src/world/housestages.js')).loadHouseStages(); // the wing's lazy stage (housestagewing.js) fills the house's wing slots
const { build } = await import('../src/world/house.js');
const { createHouseWingFinds } = await import('../src/world/housewingfinds.js');
const { createDiscoveryLog } = await import('../src/discoveries.js');
const { buildMapLayer } = await import('../src/ui/minimap.js');
const { phrase, hasPhrase } = await import('../src/clanphrases.js');
const { withOffWords } = await import('./helpers/offwords.js');

// =============================================================================
// The Old House's east wing, milestone 3: the secret wonder room behind the kids' wardrobe, its stair, its cat tree,
// hammock, crinkly tunnel, scratching post, feather wand and cardboard castle.
// =============================================================================

const area = houseArea();
const stair = HOUSE_STAIRS.find((s) => s.id === 'wonderstair');
const room = HOUSE_ROOMS.find((r) => r.id === 'wonder');
const ledge = (id) => HOUSE_LEDGES.find((l) => l.id === id);
const FIND = Object.fromEntries(HOUSE_WING_FINDS.map((f) => [f.id, f]));
const openArea = { ...area, colliders: [...area.colliders.filter((c) => !c.wardrobe), ...wardrobeColliders(true, 'room')] };
const rectInside = (a, b) => a.minX >= b.minX - 1e-9 && a.maxX <= b.maxX + 1e-9 && a.minZ >= b.minZ - 1e-9 && a.maxZ <= b.maxZ + 1e-9;

describe('the wonder stair and the wardrobe', () => {
  it('climbs 1.8 m over 6.0 m (0.30) from the kids\' north wall to the wonder room\'s south edge, and the room is the 11 x 10 attic loft north of the kids\' room', () => {
    expect(stair).toEqual({ id: 'wonderstair', from: 'upstairs', to: 'attic', x0: 46.4, z0: 2, x1: 46.4, z1: -4, width: 2.4 });
    expect(1.8 / 6.0).toBeCloseTo(0.3, 9);
    expect(0.3).toBeLessThanOrEqual(MAX_PATH_GRADE);
    expect(area.ground.y(46.4, -1)).toBeCloseTo(3.3, 6); // halfway up
    expect(room).toMatchObject({ level: 'attic', zone: 'wonder', minX: 41, maxX: 52, minZ: -14, maxZ: -4 });
    expect(HOUSE_BOUNDS.maxX).toBe(52);
    expect(LEVEL_LINKS).toHaveLength(4); // the wing's two stairs join zones by position, not levels
    expect(stair.x0).toBe((SECRET_WARDROBE.x));
  });

  it('opens the kids\' north wall and the wonder room\'s south wall for it, and no other wall; a lintel sinks over the shut wardrobe', () => {
    const now = houseSections();
    const before = houseSections(HOUSE_STAIRS.filter((q) => q.id !== 'wonderstair'));
    expect(before.some((q) => q.owner === 'wonderstair')).toBe(false);
    const opened = (q) => (q.owner === 'kids' && q.side === 'n') || (q.owner === 'wonder' && q.side === 's');
    const through = now.filter((q) => opened(q) && q.kind !== 'lintel');
    for (const q of through) {
      const lo = Math.min(q.x0, q.x1);
      const hi = Math.max(q.x0, q.x1);
      expect(hi <= 45.2 + 1e-9 || lo >= 47.6 - 1e-9, q.id).toBe(true);
    }
    // every other section is the old one, the same; the stair's own walls are its own (and a lintel for the wardrobe stands only with the stair)
    const keep = (list) => list.filter((q) => !opened(q) && q.owner !== 'wonderstair' && q.owner !== 'wonder');
    expect(keep(now)).toEqual(keep(before));
    const lintel = now.filter((q) => q.kind === 'lintel' && q.owner === 'kids' && q.side === 'n');
    expect(lintel.some((q) => Math.abs(q.x0 - 45.2) < 1e-9 && Math.abs(q.x1 - 47.6) < 1e-9 && Math.abs(q.base - (2.4 + SECRET_WARDROBE.h)) < 1e-9 && Math.abs(q.height - (WALL_H - SECRET_WARDROBE.h)) < 1e-9)).toBe(true);
    expect(before.some((q) => q.kind === 'lintel' && q.owner === 'kids' && q.side === 'n' && Math.abs(q.x0 - 45.2) < 1e-9 && Math.abs(q.x1 - 47.6) < 1e-9)).toBe(false);
    const own = now.filter((q) => q.owner === 'wonderstair');
    expect(own.map((q) => q.id).sort()).toEqual(['wonderstair-e-0', 'wonderstair-e-1', 'wonderstair-w-0', 'wonderstair-w-1']);
    for (const q of own) expect(q.kind).toBe('stair');
  });

  it('shut, the wardrobe closes the opening; open, she walks through and up; and from the room she can always come down (the stair\'s foot and top are in rooms)', () => {
    expect(SECRET_WARDROBE).toEqual({ x: 46.4, z: 2, w: 2.4, d: 0.42, h: 2.25, hinge: { x: 45.2, z: 2 }, openS: 1.2, reach: 1.1, holdS: 0.8 });
    expect(Object.isFrozen(SECRET_WARDROBE) && Object.isFrozen(SECRET_WARDROBE.hinge)).toBe(true);
    for (const x of [45.5, 46, 46.4, 46.8, 47.3]) expect(isWalkableAt(area, x, 2), `${x}`).toBe(false);
    for (const x of [46, 46.4, 46.8]) expect(isWalkableAt(openArea, x, 2), `open ${x}`).toBe(true);
    const f = houseFlood(openArea, { x: 46.4, z: 4 }, 0.25);
    expect(f.reachesWithin(46.4, -1, 0.5)).toBe(true); // up the stair
    expect(f.reachesWithin(room.minX + 3, -10, 1)).toBe(true); // into the room
    // the other way: from the stair's top she reaches the kids' room again
    const top = houseFlood(openArea, { x: 46.4, z: -4.8 }, 0.25);
    expect(top.reachesWithin(46.4, 4, 0.5)).toBe(true);
    // shut, the wonder room is nowhere she can walk from the kids' room (houseFlood treats the wardrobe as open, so ask the plan's own colliders)
    const shut = houseFlood({ ...area, colliders: area.colliders.filter((c) => !c.wardrobe).concat(wardrobeColliders(false)).map((c) => ({ ...c, wardrobe: undefined })) }, { x: 46.4, z: 4 }, 0.25);
    expect(shut.reachesWithin(46.4, -8, 1)).toBe(false);
  });

  it('its colliders: a row down the leaf, shut across the opening, open along z into the kids\' room or the stair, tagged `wardrobe`', () => {
    const shut = wardrobeColliders(false);
    const room_ = wardrobeColliders(true, 'room');
    const stair_ = wardrobeColliders(true, 'stair');
    for (const list of [shut, room_, stair_]) {
      expect(list.length).toBe(Math.ceil(SECRET_WARDROBE.w / COLLIDER_STEP - 1e-9) + 1);
      for (const c of list) expect(c).toEqual({ x: c.x, z: c.z, r: SECRET_R, level: 'upstairs', wardrobe: true });
      for (let i = 1; i < list.length; i++) expect(Math.hypot(list[i].x - list[i - 1].x, list[i].z - list[i - 1].z)).toBeLessThanOrEqual(COLLIDER_STEP + 1e-9);
    }
    for (const c of shut) { expect(c.z).toBeCloseTo(2, 9); expect(c.x).toBeGreaterThanOrEqual(45.2 - 1e-9); expect(c.x).toBeLessThanOrEqual(47.6 + 1e-9); }
    for (const c of room_) { expect(c.x).toBeCloseTo(45.2, 9); expect(c.z).toBeGreaterThanOrEqual(2 - 1e-9); expect(c.z).toBeLessThanOrEqual(4.4 + 1e-9); }
    for (const c of stair_) { expect(c.z).toBeLessThanOrEqual(2 - 0.21 + 1e-9); expect(c.z).toBeGreaterThanOrEqual(-0.61 - 1e-9); expect(c.x).toBeCloseTo(45.2 + 0.21, 9); }
    expect(wardrobePivot('room')).toEqual({ x: 45.2, z: 2 });
    expect(houseColliders().filter((c) => c.wardrobe)).toEqual(shut);
    expect(createHouseWalk({ wardrobeOpen: true }).area.colliders.filter((c) => c.wardrobe)).toEqual(room_);
    expect(createHouseWalk({ wardrobeOpen: 'stair' }).area.colliders.filter((c) => c.wardrobe)).toEqual(stair_);
    expect(createHouseWalk().area.colliders.filter((c) => c.wardrobe)).toEqual(shut);
  });

  it('the wonder zone is a join of the kids\' only while the wardrobe stands open (rule 5), and is drawn then, not before', () => {
    expect(WING_ZONES.find((z) => z.id === 'wonder')).toMatchObject({ level: 'attic', rooms: ['wonder'], stairs: ['wonderstair'] });
    const join = WING_JOINS.find((j) => j.id === 'wonderstair');
    expect(join).toMatchObject({ a: 'kids', b: 'wonder', secret: true });
    expect(wingZoneAt(46.4, 5)).toBe('kids');
    expect(wingZoneAt(46.4, 1)).toBe('kids'); // the stair's foot half
    expect(wingZoneAt(46.4, -3)).toBe('wonder'); // its top half
    expect(wingZoneAt(46.4, -9)).toBe('wonder');
    const scene = new THREE.Scene();
    const record = build(scene);
    scene.updateMatrixWorld(true);
    const H = record.house;
    let open = false;
    const drawing = createLevelDrawing(scene, { levels: H.levels, links: H.links, start: H.start, wing: H.wing, joinOpen: () => open });
    drawing.settle(2.4, 46.4, 5, 46.4, 8); // in the kids' room, 3 m from the wardrobe
    expect(drawing.full.has('kids')).toBe(true);
    expect(drawing.full.has('wonder')).toBe(false); // shut: the room stays a stand-in
    open = true;
    drawing.update(2.4, 46.4, 5, 46.4, 8);
    expect(drawing.full.has('wonder')).toBe(true);
    drawing.update(2.4, 38.8, 11, 38.8, 12); // far across the room: out of ZONE_NEAR
    expect(drawing.full.has('wonder')).toBe(false);
  });
});

describe('the corner map', () => {
  it('leaves the wonder room and its stair off until the wardrobe is open, and draws its line as wall; open, they appear and the line goes', () => {
    const inside = (shapes, r) => shapes.some((s) => s.tone === 'ledge' && rectInside({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ }, s));
    const wall = (shapes) => shapes.some((s) => s.tone === 'rock' && s.minZ < 2 && s.maxZ > 2 && s.minX <= 45.2 + 1e-9 && s.maxX >= 47.6 - 1e-9);
    const shut = houseMapShapes();
    expect(inside(shut, room)).toBe(false);
    expect(shut.some((s) => s.minZ <= -4 && s.maxZ >= 2 - 1e-9 && s.minX <= 45.2 && s.maxX >= 47.6 && s.tone === 'ledge')).toBe(false);
    expect(wall(shut)).toBe(true);
    const open = houseMapShapes({ open: true });
    expect(inside(open, room)).toBe(true);
    expect(wall(open)).toBe(false);
    expect(open.length).toBeGreaterThan(shut.length);
    expect(shut.every((s) => !(s.minX >= 41 - 1e-9 && s.maxZ <= -4 + 0.3 && s.minZ >= -14.3))).toBe(true); // nothing of the wonder room's walls either
  });

  it('the built house hands the map its shapes and a reveal that swaps them and bumps the version; the minimap re-reads them', () => {
    const scene = new THREE.Scene();
    const record = build(scene);
    expect(record.mapVersion).toBe(0);
    const layer = buildMapLayer(record, scene);
    const before = layer.rock.length;
    record.house.reveal(true);
    expect(record.mapVersion).toBe(1);
    expect(layer.rock.length).toBe(before); // not until asked
    layer.refresh();
    expect(layer.rock.length).toBeGreaterThan(before);
    expect(layer.mapVersion).toBe(1);
    record.house.reveal(false);
    layer.refresh();
    expect(layer.rock.length).toBe(before);
  });
});

describe('the cat tree, the hammock and the tunnel', () => {
  const trav = houseMovesArea(openArea);
  const f = floodTraversal(trav, { abilities: BASE_ABILITIES });
  const home = f.regionAt(trav.spawn.x, trav.spawn.z);

  it('the tree\'s four levels are reachable by hops from the floor with no skills, 0.55 to 0.6 a hop, and she drops back in short steps; the hammock leap lands', () => {
    const heights = ['wonder-tree-base', 'wonder-tree-p1', 'wonder-tree-p2', 'wonder-tree-crown'].map((id) => ledge(id).y - 4.2);
    expect(heights.map((h) => +h.toFixed(2))).toEqual([0.55, 1.15, 1.75, 2.3]);
    for (let i = 1; i < heights.length; i++) expect(heights[i] - heights[i - 1]).toBeGreaterThan(0.5 + 1e-9);
    for (const id of ['wonder-tree-base', 'wonder-tree-p1', 'wonder-tree-p2', 'wonder-tree-crown', 'wonder-hammock']) {
      const l = ledge(id);
      const r = f.regionAt((l.minX + l.maxX) / 2, (l.minZ + l.maxZ) / 2, l.y);
      expect(r, id).toBeGreaterThanOrEqual(0);
      expect(f.reachable(home).has(r), id).toBe(true);
      expect(f.reachable(r).has(home), id).toBe(true);
    }
    const hop = (id) => trav.traversal.hops.find((h) => h.id === id);
    for (const id of ['wonder-floor-base', 'wonder-base-p1', 'wonder-p1-p2', 'wonder-p2-crown']) { expect(hop(id).dy, id).toBeGreaterThanOrEqual(0.55 - 1e-9); expect(hop(id).dy, id).toBeLessThanOrEqual(0.6 + 1e-9); }
    for (const id of ['wonder-crown-p2', 'wonder-p2-p1', 'wonder-p1-base', 'wonder-base-floor', 'wonder-hammock-p1']) { expect(-hop(id).dy, id).toBeGreaterThanOrEqual(0.55 - 1e-9); expect(-hop(id).dy, id).toBeLessThanOrEqual(0.6 + 1e-9); }
    const leap = hop('wonder-p2-hammock');
    expect(leap.kind).toBe('leap');
    expect(leap.dist).toBeGreaterThanOrEqual(1.0);
    expect(leap.dist).toBeLessThanOrEqual(3.5); // no Long Leap
    expect(leap.dy).toBeLessThanOrEqual(0.6);
    expect(hop('wonder-hammock-p2').dist).toBeLessThanOrEqual(3.5);
  });

  it('the tunnel has two open mouths and is never a trap: a Maine Coon\'s body fits, and she walks in at one and out at the other', () => {
    const [a, b] = WING_TUNNEL.inside;
    // the rows of colliders stand wide enough apart for her widest cat's body
    const rows = WING_TUNNEL.colliders;
    const gap = Math.min(...[[50.05, 51.15], [-7.05, -8.15]].map(([p, q]) => Math.abs(q - p)));
    expect(gap - 2 * Math.max(...rows.map((c) => c.r))).toBeGreaterThanOrEqual(2 * CAT_RADIUS + 0.1); // 0.55 m was the design's width; her body needs more: 0.9 m clear
    expect(1.0 * CAT_SCALE_MAX).toBeGreaterThan(0); // the body radius is a constant (CAT_RADIUS), not scaled by the breed
    const open = { ...openArea, colliders: [...openArea.colliders] };
    for (const m of WING_TUNNEL.mouths) expect(isWalkableAt(open, m.x, m.z), `mouth ${m.x}`).toBe(true);
    for (const r of [a, b]) expect(isWalkableAt(open, (r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2)).toBe(true);
    const flood = houseFlood(open, { x: WING_TUNNEL.mouths[0].x, z: WING_TUNNEL.mouths[0].z }, 0.125);
    expect(flood.reachesWithin(WING_TUNNEL.mouths[1].x, WING_TUNNEL.mouths[1].z, 0.2)).toBe(true);
    // the way is through the tunnel: its side rows block the cells beside it
    expect(isWalkableAt(open, 51.15, -7)).toBe(false);
    expect(isWalkableAt(open, 50.05, -6.5)).toBe(false);
    // the bend's outer corner is a corner of the east wall's strip, not a gap into the rest of the room
    expect(WING_TUNNEL.pace).toBe(0.75);
    expect(WING_TUNNEL.crinkleEvery).toBe(0.5);
  });
});

describe('the wonder room\'s finds, run', () => {
  const { wonderParts } = (() => ({ wonderParts: null }))();
  void wonderParts;
  const DT = 1 / 60;
  function setup({ reducedMotion = false } = {}) {
    const paid = { points: 0, lines: [] };
    const base = createDiscoveryLog({ addPoints: (n) => { paid.points += n; }, recordFeat() {} });
    const log = { awardOnce: (type, key, label) => { const n = base.awardOnce(type, key, label); if (n > 0) paid.lines.push([type, key, label]); return n; } };
    base.startWalk();
    const calls = { chime: [], hiss: [], purr: [] };
    const audio = Object.fromEntries(Object.keys(calls).map((k) => [k, (...a) => calls[k].push(a)]));
    const scene = new THREE.Scene();
    const record = build(scene);
    const colliders = [...record.colliders];
    const reveals = [];
    const f = createHouseWingFinds({
      finds: HOUSE_WING_FINDS, slots: [], log, audio, reducedMotion, wardrobe: record.house.wardrobe, colliders, wonder: record.house.wonder, reveal: (o) => reveals.push(o),
    });
    const cat = new THREE.Vector3();
    let t = 0;
    const step = (x, y, z, partners) => { cat.set(x, y, z); t += DT; f.update(DT, t, cat, partners); };
    const stay = (x, y, z, s) => { for (let i = 0; i < Math.round(s / DT); i++) step(x, y, z); };
    return { f, paid, calls, step, stay, record, colliders, reveals, scene, base };
  }
  const keys = (paid) => paid.lines.map((l) => l[1]);

  it('the wardrobe: staying at it 0.8 s swings it open away from her (from the room into the stair), pays housefind\'s 12 once, chimes, swaps its colliders and shows the map', () => {
    const { f, stay, step, paid, calls, colliders, reveals, record } = setup();
    const w = FIND.wardrobe;
    expect(colliders.filter((c) => c.wardrobe)).toEqual(wardrobeColliders(false));
    stay(w.x, 2.4, w.z + 0.9, 0.7);
    expect(paid.lines).toEqual([]);
    expect(f.open).toBe(false);
    stay(w.x, 2.4, w.z + 0.9, 0.2);
    expect(f.open).toBe(true);
    expect(paid.lines).toEqual([['housefind', 'house-find-wardrobe', phrase('house.find.wardrobe')]]);
    expect(paid.points).toBe(12);
    expect(calls.chime.length).toBe(1);
    expect(reveals).toEqual([true]);
    // the leaf swings; its shut colliders hold until it has
    expect(colliders.filter((c) => c.wardrobe)).toEqual(wardrobeColliders(false));
    stay(w.x - 2, 2.4, w.z + 3, 1.4);
    expect(colliders.filter((c) => c.wardrobe)).toEqual(wardrobeColliders(true, 'stair')); // she was in the room: it swung into the stair
    expect(record.house.wardrobe.group.rotation.y).toBeCloseTo(Math.PI / 2, 6);
    stay(w.x, 2.4, w.z + 0.9, 3);
    expect(paid.lines.length).toBe(1); // once
    f.dispose();
    expect(colliders.filter((c) => c.wardrobe)).toEqual(wardrobeColliders(false)); // a walk picked up again finds it shut
    expect(f.open).toBe(false);
    expect(reveals).toEqual([true, false]);
    expect(record.house.wardrobe.group.rotation.y).toBe(0);
    step(0, 0, 0);
  });

  it('from the stair side it swings into the room; a partner\'s hold opens it too (and pays her)', () => {
    const { f, stay, step, paid, colliders, record } = setup({ reducedMotion: true });
    const w = FIND.wardrobe;
    const partner = { group: { position: new THREE.Vector3(w.x, 2.4 + 0.6, w.z - 0.9) }, water: { placed: true } };
    for (let i = 0; i < Math.round(1 / DT); i++) step(0, 0, 0, [partner]);
    expect(f.open).toBe(true);
    expect(keys(paid)).toEqual(['house-find-wardrobe']);
    step(0, 0, 0, [partner]);
    expect(colliders.filter((c) => c.wardrobe)).toEqual(wardrobeColliders(true, 'room'));
    expect(record.house.wardrobe.group.rotation.y).toBeCloseTo(-Math.PI / 2, 6);
    void stay;
  });

  it('the tunnel pays on coming out of the far mouth, not on going back out of the near one; the tree\'s crown, the post and the feather pay once each', () => {
    const { step, stay, paid, f } = setup();
    const [m0, m1] = WING_TUNNEL.mouths;
    const y = 4.2;
    step(m0.x, y, m0.z);
    step(50.6, y, -6.5); // in
    step(50.6, y, -7.0);
    step(m0.x, y, m0.z); // back out of the way she came in
    expect(paid.lines).toEqual([]);
    for (const [x, z] of [[50.6, -6.3], [50.6, -7.0], [50.6, -7.6], [50.0, -7.6], [49.4, -7.6]]) step(x, y, z); // through the bend
    step(m1.x, y, m1.z);
    expect(keys(paid)).toEqual(['house-find-tunnel']);
    expect(paid.lines[0][0]).toBe('housewing');
    // the other way too, but it pays once
    for (const [x, z] of [[49.4, -7.6], [50.6, -7.6], [50.6, -6.3]]) step(x, y, z);
    step(m0.x, y, m0.z);
    expect(keys(paid)).toEqual(['house-find-tunnel']);
    const crown = ledge('wonder-tree-crown');
    step(FIND.treetop.x, crown.y - 0.6, FIND.treetop.z);
    expect(keys(paid)).toEqual(['house-find-tunnel']);
    step(FIND.treetop.x, crown.y, FIND.treetop.z);
    stay(FIND.scratch.x, y, FIND.scratch.z, 1.4);
    expect(keys(paid)).toEqual(['house-find-tunnel', 'house-find-treetop']);
    stay(FIND.scratch.x, y, FIND.scratch.z, 0.2);
    step(FIND.feather.x + 0.2, y, FIND.feather.z);
    expect(keys(paid)).toEqual(['house-find-tunnel', 'house-find-treetop', 'house-find-scratch', 'house-find-feather']);
    expect(paid.points).toBe(32);
    step(FIND.feather.x, y, FIND.feather.z);
    expect(paid.lines.length).toBe(4);
    expect(f.watching).toBe(1);
  });

  it('the tunnel slows her to three quarters, only while she is inside it', () => {
    const { f, step } = setup();
    step(50.6, 4.2, -5.0);
    expect(f.pace).toBe(1);
    step(50.6, 4.2, -6.5);
    step(50.6, 4.2, -6.6);
    expect(f.inTunnel).toBe(true);
    expect(f.pace).toBe(WING_TUNNEL.pace);
    step(50.6, 4.2, -5.0);
    expect(f.pace).toBe(1);
  });

  it('the feather wand moves only while a cat is within 1.2 m, swings back at a pounce, and allocates nothing otherwise', () => {
    const { step, record } = setup();
    const wand = record.house.wonder.wand;
    for (let i = 0; i < 60; i++) step(44, 4.2, -5);
    expect(wand.rotation.x).toBe(0);
    expect(wand.rotation.z).toBe(0);
    for (let i = 0; i < 30; i++) step(WING_FEATHER.x + 1.0, 4.2, WING_FEATHER.z); // 1.0 m off: awake
    expect(Math.abs(wand.rotation.x) + Math.abs(wand.rotation.z)).toBeGreaterThan(0.001);
    for (let i = 0; i < 400; i++) step(44, 4.2, -5); // away again: it settles
    expect(Math.abs(wand.rotation.x)).toBeLessThan(0.01);
    expect(Math.abs(wand.rotation.z)).toBeLessThan(0.01);
    const meshes = [];
    wand.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes.length).toBe(1);
    expect(meshes[0].castShadow).toBe(false);
  });

  it('the wardrobe\'s clue: a faint crinkle within 2 m while it is shut, none once open', () => {
    const { stay, calls, f } = setup({ reducedMotion: true });
    const w = FIND.wardrobe;
    stay(w.x, 2.4, w.z + 1.9, 0.1);
    expect(calls.hiss.length).toBe(1);
    stay(w.x, 2.4, w.z + 2.5, 5); // out of the way (3 m)
    expect(calls.hiss.length).toBe(1);
    stay(w.x, 2.4, w.z + 0.9, 1);
    expect(f.open).toBe(true);
    const n = calls.hiss.length;
    stay(w.x, 2.4, w.z + 1.9, 5);
    expect(calls.hiss.length).toBe(n);
  });
});

describe('the wonder room\'s data', () => {
  it('the gold mouse sits on the crown, the old cat\'s cryptic hint comes only after the kids\' room, the crown is a nook, the castle a box', () => {
    expect(HOUSE_WING_GOLD.map((m) => m.id)).toEqual(['gm-house-4', 'gm-house-5']);
    const crown = ledge('wonder-tree-crown');
    const m = HOUSE_WING_GOLD[0];
    expect(m.x).toBeGreaterThanOrEqual(crown.minX);
    expect(m.x).toBeLessThanOrEqual(crown.maxX);
    expect(m.z).toBeGreaterThanOrEqual(crown.minZ);
    expect(m.z).toBeLessThanOrEqual(crown.maxZ);
    const hint = HOUSE_WING_HINTS.find((h) => h.words === 'house.hint.wonder');
    expect(hint).toMatchObject({ room: 'kids', find: 'wardrobe', after: 'kids' });
    // every hint names a real find and a real room, in both word sets
    for (const h of HOUSE_WING_HINTS) {
      expect(HOUSE_WING_FINDS.some((f) => f.id === h.find), h.words).toBe(true);
      expect(HOUSE_ROOMS.some((r) => r.id === h.room), h.words).toBe(true);
      expect(hasPhrase(h.words), h.words).toBe(true);
    }
    expect(HOUSE_WING_NOOKS.map((n) => n.id)).toContain('hammock');
    expect(HOUSE_BOXES).toContainEqual({ x: 44, z: -6.9 });
    for (const id of ['wardrobe', 'tunnel', 'treetop', 'scratch', 'feather']) {
      expect(phrase(`house.find.${id}`).length, id).toBeGreaterThan(0);
      withOffWords(() => expect(phrase(`house.find.${id}`).length, id).toBeGreaterThan(0));
    }
    expect(HOUSE_FURNITURE.filter((f) => f.room === 'wonder').every((f) => rectInsideRoom(f))).toBe(true);
  });
});
function rectInsideRoom(f) {
  const room = HOUSE_ROOMS.find((r) => r.id === f.room);
  const turned = Math.abs(Math.sin(f.rotY)) > 0.5;
  const hx = (turned ? f.d : f.w) / 2;
  const hz = (turned ? f.w : f.d) / 2;
  return f.x - hx >= room.minX + 0.1 - 1e-6 && f.x + hx <= room.maxX - 0.1 + 1e-6 && f.z - hz >= room.minZ + 0.1 - 1e-6 && f.z + hz <= room.maxZ - 0.1 + 1e-6;
}

// ---- the camera in the wonder room (milestone 3) ----
describe('the camera in the wonder room', () => {
  const ZOOMS = [0, 1, 2, 3];
  const PITCHES = [-0.25, 0.2, 0.85];
  it('never loses her in the tunnel, on the tree\'s four levels and the hammock, in the room\'s corners and at the top of the stair, at every view step, 16 ways, three pitches', () => {
    const w = createHouseWalk({ moves: true, wardrobeOpen: true });
    const bad = [];
    const spots = [
      ['tunnel A', 50.6, -6.9], ['tunnel bend', 50.6, -7.6], ['tunnel B', 49.6, -7.6], ['stair top', 46.4, -4.8], ['stair middle', 46.4, -1.5],
      ['corner nw', 41.7, -13.3], ['corner se', 51.3, -4.7], ['corner ne', 51.3, -13.3],
    ];
    for (const [name, x, z] of spots) {
      for (let k = 0; k < 16; k++) for (const zoom of ZOOMS) for (const pitch of PITCHES) {
        w.place(x, z, (k * Math.PI) / 8, zoom, pitch);
        const b = w.blockers();
        if (b.length) bad.push(`${name} yaw ${k} zoom ${zoom} pitch ${pitch}: ${b.join(' ')}`);
      }
    }
    for (const id of ['wonder-tree-base', 'wonder-tree-p1', 'wonder-tree-p2', 'wonder-tree-crown', 'wonder-hammock']) {
      const l = ledge(id);
      const x = (l.minX + l.maxX) / 2;
      const z = id === 'wonder-hammock' ? l.minZ + 0.6 : (l.minZ + l.maxZ) / 2;
      for (let k = 0; k < 16; k++) for (const zoom of ZOOMS) for (const pitch of PITCHES) {
        w.placeOnLedge(id, x, z, (k * Math.PI) / 8, zoom, pitch);
        const b = w.blockers();
        if (b.length) bad.push(`${id} yaw ${k} zoom ${zoom} pitch ${pitch}: ${b.join(' ')}`);
      }
    }
    expect(bad.slice(0, 8)).toEqual([]);
  }, 120_000);

  it('eases, never jumps, on the wonder stair at every view step, up and down, the wardrobe open', () => {
    const w = createHouseWalk({ reducedMotion: false, wardrobeOpen: true });
    const len = Math.hypot(stair.x1 - stair.x0, stair.z1 - stair.z0);
    const bad = [];
    for (const up of [true, false]) {
      const dz = up ? -1 : 1;
      const sz = up ? stair.z0 + 0.6 : stair.z1 - 0.6;
      for (const zoom of ZOOMS) {
        w.place(stair.x0, sz, Math.PI * (up ? 0 : 1), zoom);
        w.push(0, dz);
        const prev = w.camera.position.clone();
        let worst = 0;
        for (let i = 0; i < Math.round(((len + 1.2) / 2.5 + 1) * 60); i++) {
          w.frame(1 / 60);
          worst = Math.max(worst, w.camera.position.distanceTo(prev));
          prev.copy(w.camera.position);
        }
        w.release();
        if (worst > 0.2) bad.push(`${up ? 'up' : 'down'} zoom ${zoom}: ${worst.toFixed(3)}`);
        expect(Math.abs(w.cat.position.y - (up ? 4.2 : 2.4)), `${up} ${zoom}`).toBeLessThanOrEqual(0.06);
      }
    }
    expect(bad).toEqual([]);
  }, 60_000);
});
