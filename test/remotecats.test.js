import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createRemoteCats } from '../src/remotecats.js';
import { fingerprintCat } from './helpers/catfingerprint.js';
import { buildCat } from '../src/cat/model.js';
import { shallowExcess } from '../src/world/builder.js';

function fakeScene() {
  const objects = new Set();
  return {
    objects,
    add: (o) => objects.add(o),
    remove: (o) => objects.delete(o),
  };
}

// remotecats/nametag run in a plain node test environment (no jsdom), so
// makeNameTag's `document` guard normally makes it a no-op here. Install a
// minimal fake `document` so the name-tag (and its CanvasTexture) actually
// gets built, letting the disposal test cover that path too.
function withFakeDocument(fn) {
  const ctx = {
    font: '', textAlign: '', fillStyle: '',
    beginPath() {}, roundRect() {}, rect() {}, fill() {}, fillText() {},
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const prev = globalThis.document;
  globalThis.document = { createElement: () => canvas };
  try {
    return fn();
  } finally {
    if (prev === undefined) delete globalThis.document;
    else globalThis.document = prev;
  }
}

const PROFILE = { playerId: 'aaa', petName: 'Hagrid', breed: 'tabby', accessories: {} };

// wrap an angle difference into [-PI, PI], used to check "shortest way around"
function angleDiff(a, b) {
  return ((a - b + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

describe('createRemoteCats', () => {
  it('upsert is idempotent per playerId', () => {
    const scene = fakeScene();
    const remotes = createRemoteCats(scene);
    const first = remotes.upsert(PROFILE, 0);
    const second = remotes.upsert(PROFILE, 0);
    expect(second).toBe(first);
    expect(remotes.list).toHaveLength(1);
    expect(scene.objects.size).toBe(1);
  });

  it('list allocates nothing per read: the same array until a cat joins or leaves (Polish 3)', () => {
    const scene = fakeScene();
    const remotes = createRemoteCats(scene);
    const empty = remotes.list;
    expect(remotes.list).toBe(empty);
    remotes.upsert(PROFILE, 0);
    const one = remotes.list;
    expect(one).not.toBe(empty);
    expect(empty).toHaveLength(0); // an earlier snapshot is never changed under a holder
    expect(remotes.list).toBe(one);
    remotes.applyState({ id: 'aaa', pos: [1, 2], yaw: 0, pose: 'follow', speed: 0 }, 0);
    remotes.update(0.016, 0.1);
    expect(remotes.list).toBe(one); // a frame changes nothing
    remotes.upsert(PROFILE, 0); // unchanged profile: no rebuild
    expect(remotes.list).toBe(one);
    remotes.upsert({ ...PROFILE, playerId: 'bbb' }, 0);
    const two = remotes.list;
    expect(two).toHaveLength(2);
    expect(one).toHaveLength(1);
    remotes.remove('aaa');
    expect(remotes.list.map((r) => r.playerId)).toEqual(['bbb']);
    expect(two).toHaveLength(2);
  });

  it('a cat that times out mid-update is removed and the rest still update', () => {
    const scene = fakeScene();
    const remotes = createRemoteCats(scene);
    remotes.upsert(PROFILE, 0);
    remotes.upsert({ ...PROFILE, playerId: 'bbb' }, 0);
    remotes.applyState({ id: 'bbb', pos: [4, 0], yaw: 0, pose: 'follow', speed: 0 }, 100);
    remotes.update(0.016, 100);
    expect(remotes.list.map((r) => r.playerId)).toEqual(['bbb']);
  });

  it('applyState + update moves the group toward the target but not past it instantly', () => {
    const scene = fakeScene();
    const remotes = createRemoteCats(scene);
    remotes.upsert(PROFILE, 0);
    // The first state places a new cat outright (Task 6); interpolation is
    // from there on.
    remotes.applyState({ v: 1, id: 'aaa', pos: [0, 0], yaw: 0, pose: 'follow', speed: 0 }, 0);
    remotes.applyState({ v: 1, id: 'aaa', pos: [10, 10], yaw: 0, pose: 'follow', speed: 1 }, 0);
    remotes.update(0.01, 0.01); // 10ms into the 150ms window
    const entry = remotes.list[0];
    const dist = entry.group.position.distanceTo(new THREE.Vector3(10, 0, 10));
    expect(dist).toBeGreaterThan(0.1); // hasn't arrived
    expect(entry.group.position.x).toBeGreaterThan(0); // but has started moving
    expect(entry.group.position.x).toBeLessThan(10);
  });

  it('applyState + update reaches the target once the interpolation window has elapsed', () => {
    const scene = fakeScene();
    const remotes = createRemoteCats(scene);
    remotes.upsert(PROFILE, 0);
    remotes.applyState({ v: 1, id: 'aaa', pos: [4, -2], yaw: 0, pose: 'follow', speed: 0 }, 0);
    remotes.update(0.2, 0.2); // well past the 150ms window
    const entry = remotes.list[0];
    expect(entry.group.position.x).toBeCloseTo(4, 5);
    expect(entry.group.position.z).toBeCloseTo(-2, 5);
  });

  it('yaw takes the short way around', () => {
    const scene = fakeScene();
    const remotes = createRemoteCats(scene);
    remotes.upsert(PROFILE, 0);
    // establish an initial facing of 3.1 rad, fully settled
    remotes.applyState({ v: 1, id: 'aaa', pos: [0, 0], yaw: 3.1, pose: 'follow', speed: 0 }, 0);
    remotes.update(0.2, 0.2);
    // now turn to -3.1 rad — the short way around is ~0.08 rad, not ~6.2 rad
    remotes.applyState({ v: 1, id: 'aaa', pos: [0, 0], yaw: -3.1, pose: 'follow', speed: 0 }, 0.2);
    remotes.update(0.2, 0.4); // fully settled again
    const entry = remotes.list[0];
    expect(Math.abs(angleDiff(entry.group.rotation.y, -3.1))).toBeLessThan(0.05);
  });

  it('despawns a remote pet after 5s without a new state', () => {
    const scene = fakeScene();
    const remotes = createRemoteCats(scene);
    remotes.upsert(PROFILE, 0);
    remotes.applyState({ v: 1, id: 'aaa', pos: [1, 1], yaw: 0, pose: 'follow', speed: 0 }, 0);
    remotes.update(0.1, 4.9); // still within the window
    expect(remotes.list).toHaveLength(1);
    remotes.update(0.1, 5.1); // 5.1s of silence since the last state
    expect(remotes.list).toHaveLength(0);
    expect(scene.objects.size).toBe(0);
  });

  it('dispose empties the scene', () => {
    const scene = fakeScene();
    const remotes = createRemoteCats(scene);
    remotes.upsert(PROFILE, 0);
    remotes.upsert({ ...PROFILE, playerId: 'bbb', petName: 'Robbie' }, 0);
    remotes.dispose();
    expect(scene.objects.size).toBe(0);
    expect(remotes.list).toHaveLength(0);
  });

  it('remove() disposes the group\'s geometries and materials, including the name-tag texture', () => {
    withFakeDocument(() => {
      const scene = fakeScene();
      const remotes = createRemoteCats(scene);
      const entry = remotes.upsert(PROFILE, 0);
      expect(entry.tag).not.toBe(null); // the fake document made tag-building succeed

      const meshes = [];
      entry.group.traverse((o) => { if (o.isMesh || o.isSprite) meshes.push(o); });
      expect(meshes.length).toBeGreaterThan(1); // several cat parts plus the tag sprite

      const geoSpies = meshes.map((m) => vi.spyOn(m.geometry, 'dispose'));
      const matSpies = meshes.map((m) => vi.spyOn(Array.isArray(m.material) ? m.material[0] : m.material, 'dispose'));
      const tagMapSpy = vi.spyOn(entry.tag.material.map, 'dispose');

      remotes.remove(PROFILE.playerId);

      for (const s of geoSpies) expect(s).toHaveBeenCalledTimes(1);
      for (const s of matSpies) expect(s).toHaveBeenCalledTimes(1);
      expect(tagMapSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('upsert replaces the mesh (and disposes the old one) when a rejoining profile changed breed', () => {
    const scene = fakeScene();
    const remotes = createRemoteCats(scene);
    const first = remotes.upsert(PROFILE, 0);
    const geoSpy = vi.spyOn(first.group.children[0].geometry, 'dispose');

    const second = remotes.upsert({ ...PROFILE, breed: 'siamese' }, 0);

    expect(second).not.toBe(first);
    expect(second.breed).toBe('siamese');
    expect(remotes.list).toHaveLength(1); // old one was removed, not just added alongside
    expect(scene.objects.has(first.group)).toBe(false);
    expect(scene.objects.has(second.group)).toBe(true);
    expect(geoSpy).toHaveBeenCalledTimes(1);
  });

  // Remote profiles arrive over the network from other players' clients,
  // which may not have enforced net.js's own validation (old build,
  // tampered client, wire glitch) — upsert must whitelist rather than trust
  // breed/petName wholesale, since an unknown breed key would otherwise
  // reach buildCat and throw.
  it('upsert normalizes the retired rosa breed to tabby and still builds the cat', () => {
    const remotes = createRemoteCats(fakeScene());
    const entry = remotes.upsert({ ...PROFILE, playerId: 'rrr', breed: 'rosa' }, 0);
    expect(entry.breed).toBe('tabby');
    expect(remotes.list).toHaveLength(1);
  });

  it('upsert whitelists an unknown breed to tabby and an invalid petName to a fallback', () => {
    const scene = fakeScene();
    const remotes = createRemoteCats(scene);
    const entry = remotes.upsert(
      { playerId: 'zzz', petName: 'h4x0r!!', breed: 'dragon', accessories: {} },
      0
    );
    expect(entry.breed).toBe('tabby');
    expect(entry.petName).toBe('Mystery Cat');
    expect(remotes.list).toHaveLength(1);
  });

  it('upsert keeps the existing mesh when the profile is unchanged', () => {
    const scene = fakeScene();
    const remotes = createRemoteCats(scene);
    const first = remotes.upsert(PROFILE, 0);
    const second = remotes.upsert({ ...PROFILE }, 0); // same fields, new object identity
    expect(second).toBe(first);
    expect(scene.objects.size).toBe(1);
  });
});

// Swimming (Task 6): a co-walker only LOOKS wet, worked out on this side from
// where it is. Nothing new goes on the wire.
describe('remote cats in the water', () => {
  // A pond away from the origin, where a new remote starts.
  const POND = [{ id: 'p', kind: 'circle', x: 20, z: 0, r: 5, shallow: 1.2 }];
  const state = (x) => ({ v: 1, id: 'aaa', pos: [x, 0], yaw: 0, pose: 'follow', speed: 0 });

  it('a remote cat looks wet from where it is', () => {
    const remotes = createRemoteCats(fakeScene());
    remotes.upsert(PROFILE, 0);
    remotes.applyState(state(20), 0);
    let now = 0;
    for (let i = 0; i < 60; i++) { now += 1 / 60; remotes.update(1 / 60, now, POND); }
    const entry = remotes.list[0];
    expect(entry.water.mode).toBe('swim');
    expect(entry.group.position.y).toBeLessThan(-0.2);
  });

  it('positions straddling the band line change its look once per crossing', () => {
    const remotes = createRemoteCats(fakeScene());
    const entry = remotes.upsert(PROFILE, 0);
    let now = 0;
    let nextState = 0;
    let k = 0;
    const modes = [];
    const frame = () => { now += 1 / 60; remotes.update(1 / 60, now, POND); modes.push(entry.water.mode); };
    // Find the band line along z 0 (about x 23.79: the shore is a polygon,
    // so not quite 25 - 1.2) and straddle it by 0.05 either way.
    let lo = 22;
    let hi = 24.5;
    for (let i = 0; i < 50; i++) {
      const m = (lo + hi) / 2;
      if (shallowExcess(POND, m, 0) > 0) lo = m; else hi = m;
    }
    const DEEP = lo - 0.05;
    const SHALLOW = lo + 0.05;
    expect(shallowExcess(POND, DEEP, 0)).toBeCloseTo(0.05, 2);
    expect(shallowExcess(POND, SHALLOW, 0)).toBeCloseTo(-0.05, 2);
    // Start in the wade band and settle there...
    remotes.applyState(state(24.5), now);
    for (let i = 0; i < 30; i++) frame();
    expect(entry.water.mode).toBe('wade');
    // ...then 8 Hz states either side of the band line for 3 s...
    nextState = now;
    const straddleEnd = now + 3;
    while (now < straddleEnd) {
      if (now >= nextState) {
        remotes.applyState(state(k % 2 === 0 ? DEEP : SHALLOW), now);
        k += 1;
        nextState += 1 / 8;
      }
      frame();
    }
    // ...then into the deep, and hold.
    remotes.applyState(state(22), now);
    for (let i = 0; i < 120; i++) frame();
    // The arrival snaps, so the cat is never dry once placed in the band.
    const first = modes.findIndex((m) => m !== 'dry');
    expect(first).toBe(0);
    const after = modes.slice(first);
    let changes = 0;
    for (let i = 1; i < after.length; i++) if (after[i] !== after[i - 1]) changes += 1;
    // one change, wade to swim, and it is the move to x 22, not the straddle
    expect(changes).toBe(1);
    expect(after.at(-121)).toBe('wade');
    expect(after.at(-1)).toBe('swim');
  });

  it('with no waters, a remote is drawn exactly as before', () => {
    const remotes = createRemoteCats(fakeScene());
    const entry = remotes.upsert(PROFILE, 0);
    remotes.applyState(state(20), 0);
    let now = 0;
    for (let i = 0; i < 60; i++) {
      now += 1 / 60;
      remotes.update(1 / 60, now, null);
      expect(entry.group.position.y).toBe(0);
      expect(entry.group.rotation.z).toBe(0);
    }
    expect(entry.water.mode).toBe('dry');
    // and the two-argument call main.js used to make still works
    remotes.update(1 / 60, now + 1 / 60);
    expect(entry.group.position.y).toBe(0);
  });

  it('a new co-walker at the origin is not wet before its first position', () => {
    const remotes = createRemoteCats(fakeScene());
    const entry = remotes.upsert(PROFILE, 0);
    const AT_ORIGIN = [{ id: 'p', kind: 'circle', x: 0, z: 0, r: 5, shallow: 1.2 }];
    let now = 0;
    for (let i = 0; i < 60; i++) { now += 1 / 60; remotes.update(1 / 60, now, AT_ORIGIN); }
    expect(entry.group.position.y).toBe(0);
    expect(entry.water.mode).toBe('dry');
    expect(entry.water.placed).toBe(false);
  });

  it("the viewer's reduced motion stills a remote's shake and bob", () => {
    const remotes = createRemoteCats(fakeScene(), { reducedMotion: true });
    const entry = remotes.upsert(PROFILE, 0);
    remotes.applyState(state(20), 0);
    let now = 0;
    const ys = [];
    let shook = false;
    const frame = () => {
      now += 1 / 60;
      remotes.update(1 / 60, now, POND);
      expect(entry.group.rotation.z).toBe(0);
      if (entry.water.shake > 0) shook = true;
    };
    // swim long enough to shake, and to settle
    for (let i = 0; i < 180; i++) frame();
    expect(entry.water.mode).toBe('swim');
    for (let i = 0; i < 60; i++) { frame(); ys.push(entry.group.position.y); }
    for (const y of ys) expect(y).toBeCloseTo(ys[0], 6);
    // climb out and shake
    remotes.applyState(state(27), now);
    for (let i = 0; i < 90; i++) frame();
    expect(shook).toBe(true);
    expect(entry.water.mode).toBe('dry');
  });
});

describe('a new co-walker arrives where it is', () => {
  it('first position on dry land, with water at the origin: never wet, never sunk', () => {
    // The Moor: river-west holds the origin in its wade band.
    const AT_ORIGIN = [{ id: 'p', kind: 'circle', x: 0, z: 0, r: 5, shallow: 1.2 }];
    const remotes = createRemoteCats(fakeScene());
    const entry = remotes.upsert(PROFILE, 0);
    remotes.applyState({ v: 1, id: 'aaa', pos: [12, 3], yaw: 0, pose: 'follow', speed: 1 }, 0);
    let now = 0;
    for (let i = 0; i < 60; i++) {
      now += 1 / 60;
      remotes.update(1 / 60, now, AT_ORIGIN);
      expect(entry.water.mode).toBe('dry');
      expect(entry.group.position.y).toBe(0);
    }
    expect(entry.group.position.x).toBeCloseTo(12, 6);
    expect(entry.group.position.z).toBeCloseTo(3, 6);
  });

  it('a rebuilt co-walker (new breed) snaps too', () => {
    const AT_ORIGIN = [{ id: 'p', kind: 'circle', x: 0, z: 0, r: 5, shallow: 1.2 }];
    const remotes = createRemoteCats(fakeScene());
    remotes.upsert(PROFILE, 0);
    remotes.applyState({ v: 1, id: 'aaa', pos: [12, 3], yaw: 0, pose: 'follow', speed: 1 }, 0);
    remotes.update(1 / 60, 1 / 60, AT_ORIGIN);
    const entry = remotes.upsert({ ...PROFILE, breed: 'siamese' }, 0.1);
    remotes.applyState({ v: 1, id: 'aaa', pos: [12, 3], yaw: 0, pose: 'follow', speed: 1 }, 0.1);
    let now = 0.1;
    for (let i = 0; i < 30; i++) {
      now += 1 / 60;
      remotes.update(1 / 60, now, AT_ORIGIN);
      expect(entry.water.mode).toBe('dry');
      expect(entry.group.position.y).toBe(0);
    }
  });
});

describe('a custom look on the wire', () => {
  const LOOK = { coat: 'apricot', marks: 'black', pattern: 'patches', fur: 'long', eyes: 'blue', size: 0.9 };
  const SLOTS = { collar: 'bell', head: null, face: null, neck: null, body: null, back: null, feet: null };
  const CUSTOM = { playerId: 'bbb', petName: 'Willow', breed: 'calico', accessories: { ...SLOTS, look: LOOK, home: 'woods' } };
  const strip = (g) => { g.remove(...g.children.filter((c) => c.isSprite)); return g; };

  it('two receivers of the same profile draw byte-identical cats', () => {
    withFakeDocument(() => {
      const a = createRemoteCats(fakeScene()).upsert(CUSTOM);
      const b = createRemoteCats(fakeScene()).upsert(JSON.parse(JSON.stringify(CUSTOM)));
      expect(fingerprintCat(strip(a.group))).toEqual(fingerprintCat(strip(b.group)));
      expect(a.look).toEqual(LOOK);
      expect(a.petName).toBe('Willow');
    });
  });
  it('an old build ignores look: the extra key changes nothing it draws', () => {
    const withLook = buildCat('calico', { ...SLOTS, look: LOOK, home: 'woods' }, { simple: true });
    expect(fingerprintCat(withLook)).toEqual(fingerprintCat(buildCat('calico', SLOTS, { simple: true })));
  });
  it('a junk or newer look falls back without throwing', () => {
    withFakeDocument(() => {
      const r = createRemoteCats(fakeScene());
      expect(r.upsert({ ...CUSTOM, accessories: { ...SLOTS, look: 'x' } }).look).toBe(null);
      expect(r.upsert({ ...CUSTOM, playerId: 'ccc', accessories: { ...SLOTS, look: { coat: 'galaxy', size: 'big' } } }).look.coat).toBe('ginger');
    });
  });
  it('a changed look rebuilds the cat', () => {
    withFakeDocument(() => {
      const r = createRemoteCats(fakeScene());
      const first = r.upsert(CUSTOM).group;
      expect(r.upsert({ ...CUSTOM, accessories: { ...CUSTOM.accessories, look: { ...LOOK, coat: 'cream' } } }).group).not.toBe(first);
    });
  });
});

// Fight moves and scars (Task 8): her brother sees her scar. Only
// accessories.scars is new on the wire (R7), repaired by wireScars.
describe('a co-walker wears the scars on its profile', () => {
  const meshes = (g) => { let n = 0; g.traverse((o) => { if (o.isMesh) n++; }); return n; };
  const SCAR = [{ site: 'face', stage: 'full', side: 'l' }];

  it('a profile with accessories.scars builds one more mesh, named scars', () => {
    const plain = createRemoteCats(fakeScene()).upsert(PROFILE, 0);
    const scarred = createRemoteCats(fakeScene()).upsert({ ...PROFILE, accessories: { scars: SCAR } }, 0);
    expect(meshes(scarred.group)).toBe(meshes(plain.group) + 1);
    expect(scarred.group.userData.parts.scars?.name).toBe('scars');
    expect(plain.group.userData.parts.scars).toBeUndefined();
  });

  it('junk scars build none and never throw', () => {
    const plain = createRemoteCats(fakeScene()).upsert(PROFILE, 0);
    for (const junk of ['face', 7, null, [{ site: 'ear', stage: 'full', side: 'l' }], [{ site: 'face', stage: 'raw', side: 'l' }], { 0: SCAR[0] }]) {
      const e = createRemoteCats(fakeScene()).upsert({ ...PROFILE, accessories: { scars: junk } }, 0);
      expect(meshes(e.group)).toBe(meshes(plain.group));
    }
  });

  it('an unchanged scarred profile is not rebuilt; a changed stage is', () => {
    const scene = fakeScene();
    const remotes = createRemoteCats(scene);
    const first = remotes.upsert({ ...PROFILE, accessories: { scars: SCAR } }, 0);
    expect(remotes.upsert({ ...PROFILE, accessories: { scars: [{ ...SCAR[0] }] } }, 0)).toBe(first);
    const next = remotes.upsert({ ...PROFILE, accessories: { scars: [{ ...SCAR[0], stage: 'half' }] } }, 0);
    expect(next).not.toBe(first);
    expect(scene.objects.size).toBe(1);
  });
});
