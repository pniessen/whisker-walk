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

// The fight's scratch (fight moves and scars, Task 6): three white claw
// strokes, one pooled mesh. Each stroke is a thin quad in the mesh's own YZ
// plane (the plane that holds the scratching cat's forward axis once the mesh
// is turned to its yaw, so the side-on fight camera sees it face on), slanting
// down and back.
export const SLASH_TIME = 0.3; // s it fades over
const SLASH_STROKES = Object.freeze([
  // [z offset, half length, half width]
  [-0.075, 0.15, 0.012], [0, 0.18, 0.014], [0.075, 0.15, 0.012],
]);
const SLASH_TILT = 0.45; // rad the strokes lean back from upright

function slashGeometry() {
  const pos = [];
  const index = [];
  const c = Math.cos(SLASH_TILT), sn = Math.sin(SLASH_TILT);
  SLASH_STROKES.forEach(([dz, len, w], i) => {
    // along the stroke (dy, dz) = (c, sn) scaled; across it (-sn, c)
    for (const [a, b] of [[-len, -w], [-len, w], [len, w], [len, -w]]) {
      pos.push(0, a * c - b * sn, dz + a * sn + b * c);
    }
    const k = i * 4;
    index.push(k, k + 1, k + 2, k, k + 2, k + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  return g;
}

export function createFx(scene, { reducedMotion = false, makeText = defaultMakeText } = {}) {
  /** @type {Array<{ obj: THREE.Object3D, life: number, ttl: number, kind: 'popup' | 'burst', velocities?: Float32Array }>} */
  const effects = [];

  // The slash mesh is built here, with the walk, and drawn (fully transparent)
  // on the walk's first frame so its shader compiles then, not at the first
  // scratch; it hides from the second update on and is only ever moved,
  // shown and faded after that. Never a shadow.
  const slashMesh = new THREE.Mesh(slashGeometry(), new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  }));
  slashMesh.name = 'fight-slash';
  slashMesh.castShadow = false;
  slashMesh.receiveShadow = false;
  slashMesh.userData.noCast = true;
  slashMesh.frustumCulled = false;
  scene.add(slashMesh);
  let slashLife = -1; // s since the last slash, or -1 when hidden
  let primeFrames = 2;

  // One scratch at `position` ({ x, y, z }), turned to `yaw` (the scratching
  // cat's). A second slash restarts it. Nothing under reduced motion.
  function slash(position, yaw) {
    if (reducedMotion || !position) return;
    slashMesh.position.set(position.x, position.y, position.z);
    slashMesh.rotation.y = Number.isFinite(yaw) ? yaw : 0;
    slashMesh.scale.setScalar(1);
    slashMesh.material.opacity = 1;
    slashMesh.visible = true;
    slashLife = 0;
    primeFrames = 0;
  }

  function updateSlash(dt) {
    if (primeFrames > 0) {
      primeFrames -= 1;
      if (primeFrames === 0 && slashLife < 0) slashMesh.visible = false;
      return;
    }
    if (slashLife < 0) return;
    slashLife += dt;
    const u = slashLife / SLASH_TIME;
    if (u >= 1) {
      slashLife = -1;
      slashMesh.visible = false;
      slashMesh.material.opacity = 0;
      return;
    }
    slashMesh.material.opacity = 1 - u;
    slashMesh.scale.setScalar(1 + 0.25 * u);
  }

  function popup(position, text) {
    const obj = makeText(text);
    obj.position.copy(position).add(_tmpVec.set(0, 1.03, 0));
    scene.add(obj);
    effects.push({ obj, life: 0, ttl: 1.1, kind: 'popup' });
  }

  // Shared particle spawner behind burst() and shimmer(). `speed` scales the
  // launch velocity, `gravity` is the downward pull applied in update(), and
  // `ttl`/`size` shape how long the cloud lives and how big each mote reads.
  // burst()'s original numbers are the defaults, so its behaviour is
  // byte-identical to before this was factored out.
  function spawnParticles(position, color, count, { ttl = 0.7, gravity = 3, speed = 1, size = 0.09 } = {}) {
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
      velocities[i * 3] = vx * speed;
      velocities[i * 3 + 1] = vy * speed;
      velocities[i * 3 + 2] = vz * speed;
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color, size, transparent: true });
    const points = new THREE.Points(geometry, material);
    points.position.copy(position);
    scene.add(points);
    effects.push({ obj: points, life: 0, ttl, kind: 'burst', velocities, gravity });
  }

  function burst(position, color, count = 10) {
    spawnParticles(position, color, count);
  }

  // v18 Whisker Sense ('whisker-sense') — a slow, near-weightless sparkle
  // that hangs in the air instead of exploding and dropping. Same particle
  // machinery as burst (nothing new to update or dispose), retuned: a third
  // of the launch speed, a tenth of the gravity, twice the lifetime, and
  // slightly larger motes so a handful still reads at a glance.
  //
  // It shares burst's reducedMotion gate, so a player who asked for less
  // motion still gets the Whisker Sense *ping* — the audio half of
  // "shimmer/ping" — without the particles.
  function shimmer(position, color, count = 10) {
    spawnParticles(position, color, count, { ttl: 1.6, gravity: 0.3, speed: 0.35, size: 0.12 });
  }

  function removeEffect(effect) {
    scene.remove(effect.obj);
    // Sprites (popups) share THREE's static plane geometry singleton across the whole
    // app (see chatbubble.js's disposeSprite / nametag.js) — disposing it here would
    // evict the GPU buffer backing every other visible sprite. Only Points (bursts)
    // own per-instance geometry that's safe, and necessary, to dispose.
    if (effect.obj.geometry && !effect.obj.isSprite) effect.obj.geometry.dispose();
    if (effect.obj.material) {
      if (effect.obj.material.map) effect.obj.material.map.dispose();
      effect.obj.material.dispose();
    }
  }

  function update(dt) {
    updateSlash(dt);
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
        const gravity = effect.gravity ?? 3;
        for (let p = 0; p < velocities.length / 3; p++) {
          velocities[p * 3 + 1] -= gravity * dt;
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
    scene.remove(slashMesh);
    slashMesh.geometry.dispose();
    slashMesh.material.dispose();
    slashLife = -1;
  }

  return { popup, burst, shimmer, slash, update, active, dispose };
}
