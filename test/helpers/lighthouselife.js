// The Lighthouse's life on the real area, the real tippables, the real discovery log and a real progression
// (an in-memory save), for the milestone-3 tests. Every test file stubs the canvas first (stubCanvasDocument).
import * as THREE from 'three';
import { build } from '../../src/world/lighthouse.js';
import { createTippables } from '../../src/tippables.js';
import { createDiscoveryLog } from '../../src/discoveries.js';
import { createProgression } from '../../src/progression.js';
import { bus } from '../../src/events.js';

export const mem = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
};

// rig({ restore, audio, roomSeed, visits, progression, critters }) → { scene, placed, tippables, life, log, progression, events, step, off, dispose, tip }
export function lightRig({ restore = null, audio = null, roomSeed, visits = 0, progression = createProgression(mem()), critters = null } = {}) {
  const scene = new THREE.Scene();
  const placed = build(scene);
  const tippables = createTippables(scene, placed.tippables, { ground: placed.ground });
  const log = createDiscoveryLog(progression);
  log.startWalk();
  if (restore) log.restore(restore);
  const life = placed.life({ scene, ground: placed.ground, audio, log, progression, reducedMotion: false, tier: { name: 'high' }, roomSeed, visits, critters });
  const session = { tippables };
  const camera = new THREE.PerspectiveCamera();
  const events = [];
  const off = bus.on('discovery', (e) => events.push(e));
  const at = { x: 14, y: 0, z: 36 };
  // step(seconds, cat): 30 frames a second with her paws at `cat` (kept for later steps)
  const step = (seconds, cat = null) => {
    if (cat) Object.assign(at, cat);
    for (let i = 0; i < Math.round(seconds * 30); i++) life.update(1 / 30, 0, at, camera, session);
  };
  const tipOf = (kind) => tippables.list.find((e) => e.kind === kind);
  return {
    scene, placed, tippables, life, log, progression, events, step, off, at, camera, tipOf,
    dispose() { off(); life.dispose(); },
  };
}
