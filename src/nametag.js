import * as THREE from 'three';

// Shared name-tag sprite builder for stray cats and remote (co-walk) pets.
// Guards on `document` so it's a safe no-op in non-DOM test/SSR contexts —
// callers should treat a null return as "no tag" and skip adding it.
export function makeNameTag(name) {
  if (typeof document === 'undefined') return null;
  const tagCanvas = document.createElement('canvas');
  tagCanvas.width = 256;
  tagCanvas.height = 64;
  const tctx = tagCanvas.getContext('2d');
  tctx.font = 'bold 34px Avenir, sans-serif';
  tctx.textAlign = 'center';
  tctx.fillStyle = 'rgba(20,26,38,0.7)';
  tctx.beginPath();
  if (tctx.roundRect) tctx.roundRect(28, 8, 200, 48, 22);
  else tctx.rect(28, 8, 200, 48);
  tctx.fill();
  tctx.fillStyle = '#fff';
  tctx.fillText(name, 128, 42);
  const tagTex = new THREE.CanvasTexture(tagCanvas);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true }));
  tag.scale.set(1.4, 0.35, 1);
  tag.position.y = 1.05;
  tag.visible = false;
  return tag;
}
