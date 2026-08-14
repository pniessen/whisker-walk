import * as THREE from 'three';

function defaultMakeText(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#00000088';
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.4, 0.35, 1);
  return sprite;
}

// Reused across burst spawns to avoid per-call allocation of the velocity scratch vector.
const _tmpVec = new THREE.Vector3();

export function createFx(scene, { reducedMotion = false, makeText = defaultMakeText } = {}) {
  /** @type {Array<{ obj: THREE.Object3D, life: number, ttl: number, kind: 'popup' | 'burst', velocities?: Float32Array }>} */
  const effects = [];

  function popup(position, text) {
    const obj = makeText(text);
    obj.position.copy(position).add(_tmpVec.set(0, 0.9, 0));
    scene.add(obj);
    effects.push({ obj, life: 0, ttl: 1.1, kind: 'popup' });
  }

  function burst(position, color, count = 10) {
    if (reducedMotion) return;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      let vx = Math.random() * 2 - 1;
      let vy = Math.random() * 2 - 1;
      let vz = Math.random() * 2 - 1;
      vy = Math.abs(vy) + 0.5;
      const len = Math.hypot(vx, vy, vz) || 1;
      vx /= len;
      vy /= len;
      vz /= len;
      velocities[i * 3] = vx;
      velocities[i * 3 + 1] = vy;
      velocities[i * 3 + 2] = vz;
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color, size: 0.09, transparent: true });
    const points = new THREE.Points(geometry, material);
    points.position.copy(position);
    scene.add(points);
    effects.push({ obj: points, life: 0, ttl: 0.7, kind: 'burst', velocities });
  }

  function removeEffect(effect) {
    scene.remove(effect.obj);
    if (effect.obj.geometry) effect.obj.geometry.dispose();
    if (effect.obj.material) {
      if (effect.obj.material.map) effect.obj.material.map.dispose();
      effect.obj.material.dispose();
    }
  }

  function update(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      effect.life += dt;
      const t = effect.life / effect.ttl;
      if (t >= 1) {
        removeEffect(effect);
        effects.splice(i, 1);
        continue;
      }
      if (effect.kind === 'popup') {
        effect.obj.position.y += 1.2 * dt;
        if (t > 0.6 && effect.obj.material) {
          effect.obj.material.opacity = 1 - (t - 0.6) / 0.4;
        }
      } else if (effect.kind === 'burst') {
        const positions = effect.obj.geometry.attributes.position.array;
        const velocities = effect.velocities;
        for (let p = 0; p < velocities.length / 3; p++) {
          velocities[p * 3 + 1] -= 3 * dt;
          positions[p * 3] += velocities[p * 3] * dt;
          positions[p * 3 + 1] += velocities[p * 3 + 1] * dt;
          positions[p * 3 + 2] += velocities[p * 3 + 2] * dt;
        }
        effect.obj.geometry.attributes.position.needsUpdate = true;
        effect.obj.material.opacity = 1 - t;
      }
    }
  }

  function active() {
    return effects.length;
  }

  function dispose() {
    for (let i = effects.length - 1; i >= 0; i--) {
      removeEffect(effects[i]);
    }
    effects.length = 0;
  }

  return { popup, burst, update, active, dispose };
}
