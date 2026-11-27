// The Echo Deep under reduced motion (second story C8, the automated half): with a cat standing in the hall and the clock running, nothing in the
// Deep moves or breathes: the wall, the prisms, the door glow, Tink, the chime bars and the errand glints hold one picture. Without reduced motion the
// hall glow breathes, so the test would notice if the snapshot went blind.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { sanitizeSave } from '../src/progression.js';
import { setCrystalDeep } from '../src/crystalflag.js';
import { ST } from '../src/world/crystalstages.js';
import * as D from '../src/world/crystaldeepplan.js';
import * as E from '../src/world/crystaldeeperrand.js';
import { BAR_AT } from '../src/world/crystaldeeperrandlive.js';

stubCanvasDocument();
setCrystalDeep(true);
await import('../src/world/crystalstagedeep.js');

const visitsFor = (kind) => { for (let v = 0; v < 400; v++) if (E.planDeepErrand(undefined, v).kind === kind) return v; throw new Error(kind); };
const sum = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s = (s * 31 + Math.round(a[i] * 1000)) | 0; return s; };
const snap = (scene) => { const out = []; scene.traverse((o) => { if (!o.isMesh) return; const g = o.geometry.attributes; out.push([o.visible, ...o.position.toArray(), o.rotation.x, o.rotation.y, o.rotation.z, ...o.scale.toArray(), sum(g.position.array), g.color ? sum(g.color.array) : 0, o.material.color ? o.material.color.getHex() : 0]); }); return JSON.stringify(out); };

function hall(kind, reducedMotion, crystal = { step: 7, songs: 7, album: 3, deep: 15, chimes: 0 }) {
  const pr = { state: sanitizeSave({ version: 4, crystal }), addPoints() {}, recordSighting() {} };
  const log = { awardOnce: () => 25, count: () => 0, has: () => false, found: () => false, record() {} };
  const scene = new THREE.Scene();
  const life = ST.deep.life({ scene, progression: pr, log, audio: { chime() {} }, reducedMotion, tier: { name: 'high' }, roomSeed: undefined, visits: visitsFor(kind), sendEvent() {} });
  const cat = { x: D.HALL.x + 1, y: 0, z: D.HALL.z + 1 };
  let t = 0;
  const run = (secs) => { for (let i = 0; i < secs * 20; i++) { t += 0.05; life.update(0.05, t, cat); } };
  return { scene, life, run };
}

describe('reduced motion holds the Echo Deep still', () => {
  for (const kind of ['tune', 'prisms', 'moss', 'hide']) {
    it(`${kind}: the hall, the wall, the prisms, Tink and the errand are one picture over thirty seconds`, () => {
      const h = hall(kind, true);
      h.run(4); const a = snap(h.scene); h.run(30); const b = snap(h.scene);
      expect(b).toBe(a);
      expect(h.scene.children.length).toBeGreaterThan(0);
      h.life.dispose();
    });
  }
  it('an unfinished story (wall closed) is still too, and with motion on the hall breathes', () => {
    const h = hall('tune', true, { step: 7, songs: 7, album: 3, deep: 0, chimes: 0 });
    h.run(4); const a = snap(h.scene); h.run(30); expect(snap(h.scene)).toBe(a);
    const m = hall('tune', false); m.run(4); const c = snap(m.scene); m.run(9); expect(snap(m.scene)).not.toBe(c);
  });
  it('a chime bar only changes its colour, never its place, while the tune plays', () => {
    const h = hall('tune', true);
    const mid = { x: BAR_AT[2].x, y: 0, z: BAR_AT[2].z + 1.6 };
    const places = () => { const o = []; h.scene.traverse((m) => { if (m.isMesh) o.push([m.position.toArray().join(), m.rotation.z, sum(m.geometry.attributes.position.array)].join()); }); return o; };
    const colours = () => { const o = []; h.scene.traverse((m) => { if (m.isMesh) o.push(sum(m.geometry.attributes.color.array)); }); return o; };
    for (let i = 0; i < 40; i++) h.life.update(0.05, i * 0.05, mid);
    expect(ST.deep.promptAt(mid)).not.toBeNull();
    const p0 = places(); const c0 = colours();
    expect(ST.deep.interact()).toBe('tune');
    let moved = false;
    for (let i = 0; i < 90; i++) { h.life.update(0.05, 3 + i * 0.05, mid); if (colours().join() !== c0.join()) moved = true; }
    expect(moved).toBe(true);
    expect(places()).toEqual(p0);
  });
});
