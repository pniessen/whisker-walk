import * as THREE from 'three';

export const MAX_LEN = 6;
const SEGMENTS = 14;

export function createLeash(scene) {
  const points = [];
  for (let i = 0; i <= SEGMENTS; i++) points.push(new THREE.Vector3(0, 1, i * 0.1));
  const prev = points.map((p) => p.clone());

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x8a3324 }));
  line.frustumCulled = false;
  scene.add(line);

  return {
    setVisible(v) {
      line.visible = v;
    },
    update(handPos, catPos) {
      const dist = handPos.distanceTo(catPos);
      const segLen = Math.min(dist, MAX_LEN) / SEGMENTS;

      // verlet integrate with gravity for sag
      for (let i = 1; i < SEGMENTS; i++) {
        const p = points[i];
        const v = p.clone().sub(prev[i]).multiplyScalar(0.96);
        prev[i].copy(p);
        p.add(v);
        p.y -= 0.015;
      }
      points[0].copy(handPos);
      points[SEGMENTS].copy(catPos);

      // constraint relaxation
      for (let iter = 0; iter < 3; iter++) {
        for (let i = 0; i < SEGMENTS; i++) {
          const a = points[i];
          const b = points[i + 1];
          const delta = b.clone().sub(a);
          const d = delta.length() || 0.0001;
          const diff = (d - segLen) / d;
          const pinnedA = i === 0;
          const pinnedB = i + 1 === SEGMENTS;
          if (!pinnedA) a.addScaledVector(delta, pinnedB ? diff : diff * 0.5);
          if (!pinnedB) b.addScaledVector(delta, pinnedA ? -diff : -diff * 0.5);
        }
      }

      geometry.setFromPoints(points);
      return dist / MAX_LEN;
    },
  };
}
