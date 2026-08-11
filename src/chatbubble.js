import * as THREE from 'three';

export const LIFETIME_MS = 3500;
export const FADE_MS = 600;

// Rounded speech bubble drawn to a canvas, same CanvasTexture sprite technique
// as nametag.js. Guards on `document` so it's a safe no-op headless (tests/SSR):
// a null return means "no sprite" and callers must skip rendering.
export function makeBubbleSprite(text) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 40px Avenir, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = Math.min(300, Math.max(90, ctx.measureText(text).width + 48));
  const x = (canvas.width - w) / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, 8, w, 60, 26);
  else ctx.rect(x, 8, w, 60);
  ctx.fill();
  // little tail
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2 - 12, 66);
  ctx.lineTo(canvas.width / 2 + 12, 66);
  ctx.lineTo(canvas.width / 2, 86);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1c2431';
  ctx.fillText(text, canvas.width / 2, 40);

  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(1.9, 0.57, 1);
  sprite.position.y = 1.55; // above the name tag (which sits at 1.05)
  sprite.renderOrder = 10;
  return sprite;
}

// Manages at most one bubble per target Object3D. Bubbles are added as children
// of the target so they follow the cat automatically. now() is injectable and
// defaults to a monotonic clock.
export function createChatBubbles(scene, { makeSprite = makeBubbleSprite, now } = {}) {
  const clock = now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const active = new Map(); // target -> { sprite, bornAt }

  function disposeSprite(sprite) {
    if (sprite && sprite.material) {
      if (sprite.material.map) sprite.material.map.dispose();
      sprite.material.dispose();
    }
  }

  function removeFor(target, entry) {
    target.remove(entry.sprite);
    disposeSprite(entry.sprite);
    active.delete(target);
  }

  function show(target, text, t = clock()) {
    if (!target) return;
    const existing = active.get(target);
    if (existing) removeFor(target, existing);
    const sprite = makeSprite(text);
    if (!sprite) return; // headless: nothing to render
    target.add(sprite);
    active.set(target, { sprite, bornAt: t });
  }

  function update(t = clock()) {
    for (const [target, entry] of Array.from(active.entries())) {
      const age = t - entry.bornAt;
      if (age >= LIFETIME_MS) {
        removeFor(target, entry);
        continue;
      }
      const fadeStart = LIFETIME_MS - FADE_MS;
      const opacity = age <= fadeStart ? 1 : Math.max(0, 1 - (age - fadeStart) / FADE_MS);
      if (entry.sprite.material) entry.sprite.material.opacity = opacity;
    }
  }

  function clear() {
    for (const [target, entry] of Array.from(active.entries())) removeFor(target, entry);
  }

  return {
    show,
    update,
    clear,
    get activeCount() { return active.size; },
  };
}
