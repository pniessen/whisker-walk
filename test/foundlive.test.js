// Found outfits: the find on the ground (src/foundwear/display.js, live.js).
// The outfit at its spot, a twinkle seen from about 20 m, a soft chime within
// about 6 m, the pick-up at the golden mouse's distance, and the Twitchy Nose
// trail. "No marker on the map, no arrow, no prompt."
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { LOOK_POSE, DISPLAY_BY_SLOT, DISPLAY_BY_ID, TWINKLE_GOLD, buildFindDisplay, buildPouch, buildTwinkle, seatDisplay } from '../src/foundwear/display.js';
import { NO_FIND, TWINKLE_LIFT, TWINKLE_FULL_AT, TWINKLE_PULSE, TWINKLE_OPACITY, createFind, fixedWobble, tickFindNose } from '../src/foundwear/live.js';
import { FOUND_WEAR } from '../src/foundwear/index.js';
import { AUTO_SNIFF_STILL_S, AUTO_SNIFF_EVERY_S } from '../src/game/autosniff.js';
import { seedFromCode } from '../src/rng.js';

const camera = { quaternion: new THREE.Quaternion() };
const remote = (x, z) => ({ playerId: 'sib', petName: 'Robin', toPos: new THREE.Vector3(x, 0, z), water: { placed: true } });
const plan = { areaId: 'park', spot: { id: 'fw-park-1', x: 10, z: 0, y: 0, look: 'grass' }, roll: 0 };
const planAt = (spot) => ({ areaId: 'park', spot: { id: 'fw-park-1', x: 10, z: 0, y: 0, look: 'grass', ...spot }, roll: 0 });
const tris = (mesh) => (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3;
const trisIn = (obj) => { let n = 0; obj.traverse((o) => { if (o.isMesh) n += tris(o); }); return n; };
const twinkleOf = (f) => f.group.getObjectByName('find:twinkle');
const frameAt = (x, z = 0, extra = {}) => ({ x, z, pawsY: 0, camera, remotes: [], busy: false, ...extra });

describe('found outfits: how a find sits (display.js)', () => {
  it('the look poses and the head builder, verbatim', () => {
    expect(LOOK_POSE).toEqual({
      post: { tilt: 0, lift: 0 }, branch: { tilt: 0.45, lift: 0 }, grass: { tilt: 0.3, lift: -0.02 },
      water: { tilt: 0.15, lift: 0 }, perch: { tilt: 0.1, lift: 0 },
    });
    expect(DISPLAY_BY_SLOT.head('acorncap').name).toBe('hat:acorncap');
  });
  it('every slot has a ground builder; one outfit has its own', () => {
    expect(Object.keys(DISPLAY_BY_SLOT)).toEqual(['head', 'face', 'neck', 'collar', 'body', 'back', 'feet']);
    expect(Object.isFrozen(DISPLAY_BY_ID)).toBe(true);
    expect(Object.keys(DISPLAY_BY_ID)).toContain('fishermansjumper');
  });
  it('the jumper lies folded on the ground', () => {
    const d = buildFindDisplay({ kind: 'wear', id: 'fishermansjumper' });
    expect(d.name).toBe('wear:fishermansjumper');
    expect(trisIn(d)).toBeLessThan(300);
  });
  // The seam step 2 comes through (index.js, ADDING ONE, step 5): every
  // record shows as itself on the ground, never as the pouch, and small.
  it.each(FOUND_WEAR.map((r) => [r.id, r.slot]))('%s (%s) has its own ground look: not the pouch, under 600 triangles, seated', (id) => {
    const d = buildFindDisplay({ kind: 'wear', id });
    expect(d.name).not.toBe('find:pouch');
    expect(trisIn(d)).toBeGreaterThan(0);
    expect(trisIn(d)).toBeLessThan(600);
    d.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(d);
    expect(box.min.y).toBeCloseTo(0, 6);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 6);
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(0, 6);
  });
  it('seatDisplay: a group built off its origin rests on the spot and turns about its own middle', () => {
    // a stand-in for a step-2 builder: a collar-like group 0.3 m forward and 0.25 m up
    const g = new THREE.Group();
    g.name = 'collar:test';
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 4, 8), new THREE.MeshBasicMaterial());
    ring.position.set(0.05, 0.25, -0.3);
    g.add(ring);
    const held = seatDisplay(g);
    expect(held).not.toBe(g);
    expect(held.isGroup).toBe(true);
    expect(held.name).toBe('collar:test');
    expect(held.children).toEqual([g]);
    const at = () => { held.updateMatrixWorld(true); return new THREE.Box3().setFromObject(held); };
    let box = at();
    expect(box.min.y).toBeCloseTo(0, 6);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 6);
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(0, 6);
    // turned as live.js turns it, it stays over the spot
    held.rotation.y = 1.3;
    box = at();
    expect(Math.hypot((box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2)).toBeLessThan(0.02);
    // and one mesh off its origin is moved in its geometry, the mesh returned
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1).translate(0.2, 0.4, -0.1), new THREE.MeshBasicMaterial());
    expect(seatDisplay(m)).toBe(m);
    m.geometry.computeBoundingBox();
    expect(m.geometry.boundingBox.min.toArray().map((v) => +v.toFixed(6))).toEqual([-0.05, 0, -0.05]);
    // a mesh placed where the cat wears it (its own position) goes in a holder
    const placed = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial());
    placed.name = 'hat:placed';
    placed.position.set(0, 0.4, -0.3);
    const ph = seatDisplay(placed);
    expect(ph).not.toBe(placed);
    expect(ph.name).toBe('hat:placed');
    ph.updateMatrixWorld(true);
    const pb = new THREE.Box3().setFromObject(ph);
    expect(pb.min.y).toBeCloseTo(0, 6);
    expect((pb.min.z + pb.max.z) / 2).toBeCloseTo(0, 6);
  });
  it('the pouch: one vertex-coloured mesh, small, in its three colours', () => {
    const p = buildPouch();
    expect(p.isMesh).toBe(true);
    expect(p.name).toBe('find:pouch');
    expect(p.children).toHaveLength(0);
    expect(tris(p)).toBeLessThanOrEqual(200);
    expect(p.material.vertexColors).toBe(true);
    expect(p.castShadow).toBe(false);
    const col = p.geometry.attributes.color;
    const seen = new Set();
    const c = new THREE.Color();
    for (let i = 0; i < col.count; i++) seen.add(c.fromBufferAttribute(col, i).getHex());
    for (const hex of [0xc9a46a, 0x8a5a2b, 0xf2c14e]) expect(seen.has(new THREE.Color(hex).getHex())).toBe(true);
  });
  it('the twinkle: a flat four-point star in warm gold, normal blending, hidden by a wall', () => {
    const t = buildTwinkle();
    expect(t.name).toBe('find:twinkle');
    expect(tris(t)).toBeLessThanOrEqual(16);
    expect(t.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(TWINKLE_GOLD).toBe(0xffb53d);
    expect(t.material.color.getHex()).toBe(0xffb53d);
    expect(t.material.transparent).toBe(true);
    expect(t.material.depthWrite).toBe(false);
    expect(t.material.depthTest).toBe(true); // a wall still hides it: it is not a marker
    expect(t.material.blending).toBe(THREE.NormalBlending);
    expect(t.castShadow).toBe(false);
    // flat: every point in the z = 0 plane
    const pos = t.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) expect(pos.getZ(i)).toBe(0);
  });
  it('a wear item gets its slot builder; the pouch, an unknown id or a slot with no builder gets the pouch', () => {
    const cap = buildFindDisplay({ kind: 'wear', id: 'acorncap' });
    expect(cap.name).toBe('hat:acorncap');
    // built round the cat's head, it is seated: its lowest point at its origin
    cap.geometry.computeBoundingBox();
    expect(cap.geometry.boundingBox.min.y).toBeCloseTo(0, 6);
    expect(buildFindDisplay({ kind: 'pouch' }).name).toBe('find:pouch');
    expect(buildFindDisplay({ kind: 'wear', id: 'nosuchthing' }).name).toBe('find:pouch');
    expect(buildFindDisplay(null).name).toBe('find:pouch');
  });
  it('never reads as the yarn ball or a treasure: no glow on the outfit, no blue, no pink', () => {
    for (const item of [{ kind: 'wear', id: 'acorncap' }, { kind: 'pouch' }]) {
      buildFindDisplay(item).traverse((o) => {
        if (!o.isMesh) return;
        expect(o.castShadow).toBe(false);
        expect(o.material.emissive?.getHex() ?? 0).toBe(0);
      });
    }
    const hex = buildTwinkle().material.color.getHex();
    expect(hex).not.toBe(0x5b7fc7); // the yarn ball's matte blue (toy.js)
    expect(hex).not.toBe(0xf25c8a); // the treasures' glowing pink (walk.js)
  });
});

describe('found outfits: the find on the ground (live.js)', () => {
  it('shows the outfit at its spot, tipped by its look, casting no shadow', () => {
    const scene = new THREE.Scene();
    const f = createFind(scene, { plan, item: { kind: 'wear', id: 'acorncap' } });
    expect(scene.children).toContain(f.group);
    expect(f.group.getObjectByName('hat:acorncap')).toBeTruthy();
    f.group.traverse((o) => { if (o.isMesh) expect(o.castShadow).toBe(false); });
    expect(f.group.position.toArray()).toEqual([10, LOOK_POSE.grass.lift, 0]);
    expect(f.worldY).toBe(0);
    expect(f.spot).toBe(plan.spot);
    expect(f.taken).toBe(false);
    const d = f.group.getObjectByName('hat:acorncap');
    expect(d.rotation.z).toBe(LOOK_POSE.grass.tilt);
    expect(d.rotation.y).toBeCloseTo((seedFromCode('fw-park-1') / 2 ** 32) * 2 * Math.PI, 12);
    expect(TWINKLE_LIFT).toBe(1.0);
    expect(twinkleOf(f).position.y).toBeCloseTo(1.0, 12);
    // two meshes at most: the outfit and its twinkle
    let meshes = 0;
    f.group.traverse((o) => { if (o.isMesh) meshes++; });
    expect(meshes).toBe(2);
  });

  it('sits on the ground plus the spot\'s height; worldY leaves out the lift', () => {
    const ground = { y: (x, z) => (x === 10 && z === 0 ? 0.5 : NaN) };
    const f = createFind(new THREE.Scene(), { plan: planAt({ y: 1.9, look: 'perch' }), item: { kind: 'pouch' }, ground });
    expect(f.group.position.y).toBeCloseTo(2.4, 12);
    expect(f.worldY).toBeCloseTo(2.4, 12);
    const g = createFind(new THREE.Scene(), { plan: planAt({ look: 'grass' }), item: { kind: 'pouch' }, ground });
    expect(g.group.position.y).toBeCloseTo(0.48, 12);
    expect(g.worldY).toBeCloseTo(0.5, 12);
  });

  it('the pouch when the item is the pouch', () => {
    const f = createFind(new THREE.Scene(), { plan, item: { kind: 'pouch' } });
    expect(f.group.getObjectByName('find:pouch')).toBeTruthy();
  });

  it('twinkles only within 20 m, and steadily under reduced motion', () => {
    const f = createFind(new THREE.Scene(), { plan, item: { kind: 'pouch' } });
    const tw = twinkleOf(f);
    f.update(0.016, 0.1, frameAt(35));
    expect(tw.visible).toBe(false);
    f.update(0.016, 0.1, frameAt(25));
    expect(tw.visible).toBe(true);
    const a = tw.scale.x;
    expect([TWINKLE_PULSE.min, TWINKLE_PULSE.max]).toEqual([0.85, 1.0]);
    const s = 0.5 + 0.5 * Math.sin(3.1 * 0.1);
    // no camera position here: the floor is 1, its built size
    expect(a).toBeCloseTo(0.85 + 0.15 * s, 12);
    expect(tw.material.opacity).toBeCloseTo(TWINKLE_OPACITY.min + (TWINKLE_OPACITY.max - TWINKLE_OPACITY.min) * s, 12);
    f.update(0.016, 0.6, frameAt(25));
    expect(tw.scale.x).not.toBeCloseTo(a, 3);
    for (let t = 0; t < 3; t += 0.05) {
      f.update(0.016, t, frameAt(15));
      expect(tw.scale.x).toBeGreaterThanOrEqual(0.85 - 1e-12);
      expect(tw.scale.x).toBeLessThanOrEqual(1 + 1e-12);
    }

    const r = createFind(new THREE.Scene(), { plan, item: { kind: 'pouch' }, reducedMotion: true });
    const rt = twinkleOf(r);
    const scales = new Set();
    for (const t of [0.1, 0.6]) {
      r.update(0.016, t, frameAt(25));
      expect(rt.visible).toBe(true);
      expect(rt.material.opacity).toBe(0.85);
      scales.add(rt.scale.x);
    }
    expect([...scales]).toEqual([1]);
    r.update(0.016, 1, frameAt(35));
    expect(rt.visible).toBe(false); // the same range
  });

  it('the twinkle keeps its size on the screen past 12.5 m: the floor grows with the camera distance', () => {
    expect(TWINKLE_FULL_AT).toBe(12.5);
    const at = (reducedMotion, camDist, t = 0.1) => {
      const f = createFind(new THREE.Scene(), { plan, item: { kind: 'pouch' }, reducedMotion });
      // the camera straight out along +x from the twinkle, at its height
      const cam = { quaternion: new THREE.Quaternion(), position: new THREE.Vector3(10 + camDist, TWINKLE_LIFT + LOOK_POSE.grass.lift, 0) };
      f.update(0.016, t, frameAt(10 + Math.min(camDist, 19), 0, { camera: cam }));
      return twinkleOf(f).scale.x;
    };
    // reduced motion: exactly the floor, steady
    expect(at(true, 3)).toBe(1);
    expect(at(true, 12.5)).toBeCloseTo(1, 12);
    expect(at(true, 20)).toBeCloseTo(20 / 12.5, 12);
    expect(at(true, 25)).toBeCloseTo(25 / 12.5, 12);
    expect(at(true, 25, 0.1)).toBe(at(true, 25, 0.9));
    // in motion: the floor times the pulse
    const s = 0.5 + 0.5 * Math.sin(3.1 * 0.1);
    expect(at(false, 20)).toBeCloseTo((20 / 12.5) * (0.85 + 0.15 * s), 12);
    expect(at(false, 5)).toBeCloseTo(0.85 + 0.15 * s, 12);
    // so its size over the distance (what the screen shows) holds steady out there
    expect(at(true, 25) / 25).toBeCloseTo(at(true, 15) / 15, 12);
  });

  it('the twinkle faces the camera', () => {
    const f = createFind(new THREE.Scene(), { plan, item: { kind: 'pouch' } });
    const cam = { quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 1.1, 0)) };
    f.update(0.016, 0, frameAt(15, 0, { camera: cam }));
    expect(twinkleOf(f).quaternion.equals(cam.quaternion)).toBe(true);
  });

  it('chimes once on coming within 6 m', () => {
    const onNear = vi.fn();
    const f = createFind(new THREE.Scene(), { plan, item: { kind: 'pouch' }, onNear });
    const frame = frameAt(0);
    for (const d of [20, 5, 3, 12, 4]) { frame.x = 10 + d; f.update(0.016, 0, frame); }
    expect(onNear).toHaveBeenCalledTimes(2);
  });

  it('her arrival, at the golden mouse\'s distance; a raised spot needs her paws up there', () => {
    const f = createFind(new THREE.Scene(), { plan: planAt({ y: 1.9, look: 'perch' }), item: { kind: 'pouch' } });
    expect(f.update(0.016, 0, frameAt(10, 0, { pawsY: 0 }))).toBe(null);
    expect(f.update(0.016, 0, frameAt(10.9, 0, { pawsY: 1.9 }))).toEqual({ by: 'me', playerId: null, petName: null });
    expect(f.update(0.016, 0, frameAt(11.1, 0, { pawsY: 1.9 }))).toBe(null);
  });

  it('a busy cat on the spot is not an arrival; a partner still is', () => {
    const f = createFind(new THREE.Scene(), { plan, item: { kind: 'pouch' } });
    const frame = { x: 10, z: 0, pawsY: 0, camera, remotes: [], busy: true };
    expect(f.update(0.016, 1, frame)).toBe(null);
    frame.remotes = [remote(10.5, 0.2)];
    expect(f.update(0.016, 1, frame)).toEqual({ by: 'partner', playerId: 'sib', petName: 'Robin' });
  });

  it('her own arrival comes before a partner\'s on the same frame', () => {
    const f = createFind(new THREE.Scene(), { plan, item: { kind: 'pouch' } });
    const a = f.update(0.016, 1, frameAt(10, 0, { remotes: [remote(10, 0)] }));
    expect(a).toEqual({ by: 'me', playerId: null, petName: null });
  });

  it('a partner not yet placed (no state yet) never counts', () => {
    const f = createFind(new THREE.Scene(), { plan, item: { kind: 'pouch' } });
    const r = remote(10, 0);
    r.water.placed = false;
    expect(f.update(0.016, 1, frameAt(40, 0, { remotes: [r] }))).toBe(null);
  });

  it('take() removes and disposes it once; after that nothing arrives', () => {
    const scene = new THREE.Scene();
    const onNear = vi.fn();
    const f = createFind(scene, { plan, item: { kind: 'wear', id: 'acorncap' }, onNear });
    const geo = [], mat = [];
    f.group.traverse((o) => {
      if (!o.isMesh) return;
      const g = vi.fn(), m = vi.fn();
      o.geometry.addEventListener('dispose', g); o.material.addEventListener('dispose', m);
      geo.push(g); mat.push(m);
    });
    expect(geo).toHaveLength(2);
    f.take();
    expect(f.taken).toBe(true);
    expect(scene.children).not.toContain(f.group);
    f.take();
    f.dispose();
    for (const fn of [...geo, ...mat]) expect(fn).toHaveBeenCalledTimes(1);
    expect(f.update(0.016, 1, frameAt(10, 0, { remotes: [remote(10, 0)] }))).toBe(null);
    expect(onNear).not.toHaveBeenCalled();
  });

  it('dispose() is take() for a walk that ends with the find still out', () => {
    const scene = new THREE.Scene();
    const f = createFind(scene, { plan, item: { kind: 'pouch' } });
    f.dispose();
    expect(f.taken).toBe(true);
    expect(scene.children).not.toContain(f.group);
    expect(() => f.take()).not.toThrow();
  });

  it('allocates nothing over 60 s of updates', () => {
    const scene = new THREE.Scene();
    const f = createFind(scene, { plan, item: { kind: 'wear', id: 'acorncap' } });
    // a camera with a position, so the screen-size floor runs every frame
    const cam = { quaternion: new THREE.Quaternion(), position: new THREE.Vector3(40, 2, 3) };
    const frame = { x: 30, z: 0, pawsY: 0, camera: cam, remotes: [remote(40, 0)], busy: false };
    const tw = twinkleOf(f);
    const scaleRef = tw.scale, quatRef = tw.quaternion, posRef = cam.position;
    const n = scene.children.length;
    const kids = f.group.children.slice();
    const mats = kids.map((k) => k.material);
    let first = null;
    for (let i = 0; i < 3600; i++) {
      frame.x = 30 - i * 0.0055;
      cam.position.x = frame.x + 8;
      const a = f.update(1 / 60, i / 60, frame);
      if (a) { first ??= a; expect(a).toBe(first); }
    }
    expect(first).not.toBe(null);
    expect(tw.scale).toBe(scaleRef);
    expect(tw.quaternion).toBe(quatRef);
    expect(cam.position).toBe(posRef);
    expect(scene.children.length).toBe(n);
    expect(f.group.children).toEqual(kids);
    expect(f.group.children.map((k) => k.material)).toEqual(mats);
  });

  it('NO_FIND does nothing', () => {
    expect(Object.isFrozen(NO_FIND)).toBe(true);
    expect(NO_FIND.spot).toBe(null);
    expect(NO_FIND.item).toBe(null);
    expect(NO_FIND.taken).toBe(true);
    expect(NO_FIND.worldY).toBe(0);
    expect(NO_FIND.update(0, 0, {})).toBe(null);
    expect(() => { NO_FIND.take(); NO_FIND.dispose(); }).not.toThrow();
  });
});

describe('found outfits: the nose (Twitchy Nose)', () => {
  const nose = { skills: ['twitchy-nose'] };
  const sessionNear = (find, extra = {}) => ({
    find,
    scent: { trailTo: vi.fn(() => ({})) },
    cat: { position: { x: 0, y: 0, z: 0 } },
    idleTime: 3, walkTime: 30, autoSniffAt: -Infinity, sniffTime: 0,
    prompt: null, perched: null, cameraMode: false, fight: null, rest: null, chasing: false, freezeTime: 0,
    ...extra,
  });
  const find = () => createFind(new THREE.Scene(), { plan, item: { kind: 'pouch' } });

  it('fixedWobble is standSniff\'s fixed pattern, fresh from each factory', () => {
    const a = fixedWobble(), b = fixedWobble();
    const seq = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seq);
    for (let i = 1; i <= 3; i++) {
      const v = Math.sin(i * 12.9898) * 43758.5453;
      expect(seq[i - 1]).toBe(v - Math.floor(v));
    }
  });

  it('the nose: a Twitchy Nose cat standing still near it gets the trail, once per 20 s', () => {
    expect([AUTO_SNIFF_STILL_S, AUTO_SNIFF_EVERY_S]).toEqual([2, 20]);
    const f = find();
    const s = sessionNear(f);
    expect(tickFindNose(s, 0.016, nose)).toBe(true);
    expect(s.sniffTime).toBe(1);
    expect(s.findNoseAt).toBe(30);
    expect(s.scent.trailTo).toHaveBeenCalledTimes(1);
    const [from, to, opts] = s.scent.trailTo.mock.calls[0];
    expect(from).toBe(s.cat.position);
    expect(to).toBe(f.spot);
    expect(opts.maxDist).toBe(6);
    expect(typeof opts.rand).toBe('function');
    s.walkTime = 40;
    expect(tickFindNose(s, 0.016, nose)).toBe(false);
    s.walkTime = 51;
    expect(tickFindNose(s, 0.016, nose)).toBe(true);
    expect(s.scent.trailTo).toHaveBeenCalledTimes(2);
  });

  it('without the skill, moving, 25 m off, busy, on a treasure sniff\'s frame, or the find taken: no trail', () => {
    const cases = [
      [{}, {}],
      [{ idleTime: AUTO_SNIFF_STILL_S - 0.5 }, nose],
      [{ cat: { position: { x: -15, y: 0, z: 0 } } }, nose],
      [{ autoSniffAt: 30 }, nose],
      [{ findNoseAt: 15 }, nose],
      [{ prompt: { kind: 'dig' } }, nose],
      [{ perched: {} }, nose],
      [{ cameraMode: true }, nose],
      [{ fight: {} }, nose],
      [{ rest: {} }, nose],
      [{ chasing: true }, nose],
      [{ freezeTime: 0.5 }, nose],
    ];
    for (const [extra, state] of cases) {
      const s = sessionNear(find(), extra);
      expect(tickFindNose(s, 0.016, state)).toBe(false);
      expect(s.scent.trailTo).not.toHaveBeenCalled();
      expect(s.sniffTime).toBe(0);
    }
    // a prompt of another kind does not stop it (autosniff's rule)
    expect(tickFindNose(sessionNear(find(), { prompt: { kind: 'greet' } }), 0.016, nose)).toBe(true);
    const f = find();
    f.take();
    expect(tickFindNose(sessionNear(f), 0.016, nose)).toBe(false);
    expect(tickFindNose(sessionNear(NO_FIND), 0.016, nose)).toBe(false);
    expect(tickFindNose(sessionNear(null), 0.016, nose)).toBe(false);
    expect(tickFindNose(sessionNear(find(), { scent: null }), 0.016, nose)).toBe(false);
  });

  it('without the skill it asks hasSkill once and then waits 20 s, not every frame; a skill learned mid-walk works then', () => {
    // Count every read of the state: hasSkill reads it (and builds lists), the cheap gates never do.
    let reads = 0;
    const skills = [];
    const state = new Proxy({ skills }, { get: (o, k) => { reads += 1; return o[k]; } });
    const s = sessionNear(find());
    expect(tickFindNose(s, 0.016, state)).toBe(false);
    expect(reads).toBeGreaterThan(0);
    expect(s.findNoseAt).toBe(30);
    reads = 0;
    for (let i = 1; i < 600; i++) { // ten seconds of frames
      s.walkTime = 30 + i / 60;
      expect(tickFindNose(s, 1 / 60, state)).toBe(false);
    }
    expect(reads).toBe(0);
    expect(s.scent.trailTo).not.toHaveBeenCalled();
    skills.push('twitchy-nose');
    s.walkTime = 50;
    expect(tickFindNose(s, 1 / 60, state)).toBe(true);
    expect(s.scent.trailTo).toHaveBeenCalledTimes(1);
  });
});
