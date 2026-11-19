// Found outfits: the find on the ground (src/foundwear/display.js, live.js).
// The outfit at its spot, a twinkle seen from about 20 m, a soft chime within
// about 6 m, the pick-up at the golden mouse's distance, and the Twitchy Nose
// trail. "No marker on the map, no arrow, no prompt."
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { LOOK_POSE, DISPLAY_BY_SLOT, buildFindDisplay, buildPouch, buildTwinkle } from '../src/foundwear/display.js';
import { NO_FIND, createFind, fixedWobble, tickFindNose } from '../src/foundwear/live.js';
import { AUTO_SNIFF_STILL_S, AUTO_SNIFF_EVERY_S } from '../src/game/autosniff.js';
import { seedFromCode } from '../src/rng.js';

const camera = { quaternion: new THREE.Quaternion() };
const remote = (x, z) => ({ playerId: 'sib', petName: 'Robin', toPos: new THREE.Vector3(x, 0, z), water: { placed: true } });
const plan = { areaId: 'park', spot: { id: 'fw-park-1', x: 10, z: 0, y: 0, look: 'grass' }, roll: 0 };
const planAt = (spot) => ({ areaId: 'park', spot: { id: 'fw-park-1', x: 10, z: 0, y: 0, look: 'grass', ...spot }, roll: 0 });
const tris = (mesh) => (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3;
const twinkleOf = (f) => f.group.getObjectByName('find:twinkle');
const frameAt = (x, z = 0, extra = {}) => ({ x, z, pawsY: 0, camera, remotes: [], busy: false, ...extra });

describe('found outfits: how a find sits (display.js)', () => {
  it('the look poses and the head builder, verbatim', () => {
    expect(LOOK_POSE).toEqual({
      post: { tilt: 0, lift: 0 }, branch: { tilt: 0.45, lift: 0 }, grass: { tilt: 0.3, lift: -0.02 },
      water: { tilt: 0.15, lift: 0 }, perch: { tilt: 0.1, lift: 0 },
    });
    expect(Object.keys(DISPLAY_BY_SLOT)).toEqual(['head']);
    expect(DISPLAY_BY_SLOT.head('acorncap').name).toBe('hat:acorncap');
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
  it('the twinkle: a flat four-point star, additive, pale gold', () => {
    const t = buildTwinkle();
    expect(t.name).toBe('find:twinkle');
    expect(tris(t)).toBeLessThanOrEqual(16);
    expect(t.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(t.material.color.getHex()).toBe(0xfff2a0);
    expect(t.material.transparent).toBe(true);
    expect(t.material.depthWrite).toBe(false);
    expect(t.material.blending).toBe(THREE.AdditiveBlending);
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
    expect(twinkleOf(f).position.y).toBeCloseTo(0.3, 12);
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
    const s = 0.5 + 0.5 * Math.sin(3.1 * 0.1);
    expect(a).toBeCloseTo(0.6 + 0.4 * s, 12);
    expect(tw.material.opacity).toBeCloseTo(0.4 + 0.5 * s, 12);
    f.update(0.016, 0.6, frameAt(25));
    expect(tw.scale.x).not.toBeCloseTo(a, 3);

    const r = createFind(new THREE.Scene(), { plan, item: { kind: 'pouch' }, reducedMotion: true });
    const rt = twinkleOf(r);
    const scales = new Set();
    for (const t of [0.1, 0.6]) {
      r.update(0.016, t, frameAt(25));
      expect(rt.visible).toBe(true);
      expect(rt.material.opacity).toBe(0.7);
      scales.add(rt.scale.x);
    }
    expect([...scales]).toEqual([0.8]);
    r.update(0.016, 1, frameAt(35));
    expect(rt.visible).toBe(false); // the same range
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
    const frame = { x: 30, z: 0, pawsY: 0, camera, remotes: [remote(40, 0)], busy: false };
    const n = scene.children.length;
    const kids = f.group.children.slice();
    const mats = kids.map((k) => k.material);
    let first = null;
    for (let i = 0; i < 3600; i++) {
      frame.x = 30 - i * 0.0055;
      const a = f.update(1 / 60, i / 60, frame);
      if (a) { first ??= a; expect(a).toBe(first); }
    }
    expect(first).not.toBe(null);
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
});
