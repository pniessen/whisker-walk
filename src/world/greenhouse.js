// =============================================================================
// THE GREENHOUSE (milestone 0: the spike). One glass house (the Palm House) with six stand-in palms, its mist,
// sun shafts, floor and dapple, a pond with lily pads, a lawn. Behind ?greenhouse=1 only: no catalog row, no map
// place, no gate. Nothing alive, no jobs, no finds. The glass kit is greenhouseglass.js; the data is
// greenhouseplan.js. Builds in withLocalUuids; draws no random number and reads no clock.
// docs/superpowers/specs/2026-11-22-greenhouse-design.md; the plan next to it.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as b from './builder.js';
import { withLocalUuids } from './localuuids.js';
import { seedFromCode } from '../rng.js';
import { createWater, PARK_POND_LOOK } from '../render/water.js';
import * as P from './greenhouseplan.js';
import * as G from './greenhouseglass.js';

export { GREENHOUSE_BOUNDS, GREENHOUSE_SPAWN } from './greenhouseplan.js';

const GRASS = 0x6fae5a;
const SKY = Object.freeze({ top: 0x8cc8ee, horizon: 0xe6f2e8 });
const SKY_DUSK = Object.freeze({ top: 0x35456a, horizon: 0xd8a688 });

// Six stand-in palms as ONE caster mesh: a trunk and a fan of leaf blades each (the real palms are milestone 2's).
function standInPalms() {
  const parts = [];
  const paint = (g, hex) => {
    const c = new THREE.Color(hex);
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.deleteAttribute('uv');
    return g;
  };
  const m = new THREE.Matrix4();
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  P.PALM_SPOTS.forEach(([x, z, h], k) => {
    const trunk = paint(new THREE.CylinderGeometry(0.22, 0.34, h, 7).translate(0, h / 2, 0), 0x86684a);
    trunk.applyMatrix4(m.makeTranslation(x, 0, z));
    parts.push(trunk);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + k * 0.4;
      const blade = paint(new THREE.ConeGeometry(0.32, 3.6, 4).translate(0, 1.8, 0), i % 2 ? 0x3f8d3d : 0x4aa044);
      // lean the blade out and down from the crown
      q.setFromEuler(e.set(0, a, 0)).multiply(new THREE.Quaternion().setFromEuler(e.set(1.15, 0, 0)));
      blade.applyMatrix4(m.compose(new THREE.Vector3(x, h, z), q, one));
      parts.push(blade);
    }
  });
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide }));
  mesh.name = 'standInPalms';
  mesh.userData.noMerge = true;
  return mesh;
}

export function build(scene, { water = {}, wind } = {}) {
  void wind;
  const area = P.greenhouseArea();
  return withLocalUuids('greenhouse-build', () => {
    b.applySky(scene, SKY.top, SKY.horizon);
    const lawn = b.ground(120, GRASS, { surface: 'grass' });
    scene.add(lawn);
    scene.add(b.horizonBand({ kind: 'hills', inner: 56, outer: 116, height: 7, wavelength: 36, color: 0x86b874, salt: 71, nearColor: GRASS }));

    const quality = water.quality ?? 'high';
    const pond = createWater(P.POND, { y: 0.02, ...PARK_POND_LOOK, quality, reducedMotion: water.reducedMotion ?? false, foamStrength: 0.25 });
    scene.add(pond.mesh);
    const pads = [[-28, 16, 0.4], [-27.2, 19.4, 0.34], [-24, 15.6, 0.36], [-23.4, 20.2, 0.3], [-29.6, 20, 0.32]].map(([x, z, r]) => ({ x, z, r }));
    const lilies = b.lilyPads(pads, seedFromCode('greenhouse-lilies'));
    lilies.name = 'lilyPads';
    scene.add(lilies);

    const H = P.PALM_HOUSE;
    scene.add(G.floorQuad(H));
    scene.add(standInPalms());
    const house = G.glassHouse(H, P.PALM_DOORS, { name: 'palmHouse' });
    scene.add(house.group);
    scene.add(G.dappleQuad(H));
    // the low tier drops the mist and the shafts and keeps the frame, the one glass layer and the dapple
    const mist = quality === 'low' ? null : G.mistSheets();
    const shafts = quality === 'low' ? null : G.sunShafts(H);
    if (mist) scene.add(mist);
    if (shafts) scene.add(shafts);

    return {
      name: area.name,
      bounds: area.bounds,
      spawn: area.spawn,
      colliders: area.colliders,
      waters: area.waters,
      waterFx: [pond],
      perches: [],
      pois: area.pois,
      collectibles: [],
      scenics: [],
      tippables: [],
      boxes: [],
      critterSpawns: [],
      moments: [],
      puddles: [],
      groundBounce: 0xc9d8a8,
      skyDusk: { ...SKY_DUSK },
      // the mist and the sun shafts drift on the walk's clock; reduced motion freezes both
      life: ({ reducedMotion = false } = {}) => ({
        update(dt, t) {
          const tt = reducedMotion ? 0 : t;
          if (mist) mist.userData.mist.uTime.value = tt;
          if (shafts) shafts.rotation.z = G.shaftAngle(t, reducedMotion);
        },
        dispose() {},
      }),
    };
  });
}
