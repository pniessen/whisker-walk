import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createRemoteCats } from '../src/remotecats.js';

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

  it('applyState + update moves the group toward the target but not past it instantly', () => {
    const scene = fakeScene();
    const remotes = createRemoteCats(scene);
    remotes.upsert(PROFILE, 0);
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
    remotes.upsert({ ...PROFILE, playerId: 'bbb', petName: 'Rosa' }, 0);
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

  it('upsert keeps the existing mesh when the profile is unchanged', () => {
    const scene = fakeScene();
    const remotes = createRemoteCats(scene);
    const first = remotes.upsert(PROFILE, 0);
    const second = remotes.upsert({ ...PROFILE }, 0); // same fields, new object identity
    expect(second).toBe(first);
    expect(scene.objects.size).toBe(1);
  });
});
