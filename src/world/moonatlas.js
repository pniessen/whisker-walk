// =============================================================================
// THE MOON'S PICTURES (milestone 2): the Mission Board's four pictures and Pip's picture bubble, drawn on small canvases when the
// walk starts (the Moon's own decal atlas, spec 7.4: no image files) and disposed with it. Where there is no document (the tests,
// a headless build) every function answers a stand-in that does nothing, so nothing here can stop a walk.
// =============================================================================

import * as THREE from 'three';

const canvasOf = (w, h) => {
  try {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c.getContext?.('2d') ? c : null;
  } catch {
    return null;
  }
};

export const BOARD_ICONS = Object.freeze(['🤖', '🔋', '🚙', '💡']);
const PANEL = Object.freeze(['#3fb58f', '#2fb8c8', '#f0a43a', '#f3d36b']);

// The Mission Board's face: four big pictures in a row (Pip, the Ridge cell, the Rover cell, the base), each dim until done and bright with
// a tick when it is. setMarks([bool x 4]) redraws. Gives the mesh its map.
export function createBoardFace(mesh) {
  const cv = canvasOf(512, 272);
  if (!cv || !mesh) return { setMarks() {}, dispose() {}, get texture() { return null; } };
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  mesh.material = mesh.material.clone();
  mesh.material.map = tex;
  mesh.material.color.set(0xffffff);
  mesh.material.needsUpdate = true;
  function draw(marks) {
    g.fillStyle = '#1d2a37';
    g.fillRect(0, 0, 512, 272);
    g.fillStyle = '#273a4c';
    g.fillRect(0, 0, 512, 22);
    for (let i = 0; i < 4; i++) {
      const done = !!marks[i];
      const x = 14 + i * 124;
      g.globalAlpha = done ? 1 : 0.42;
      g.fillStyle = PANEL[i];
      g.beginPath();
      g.roundRect?.(x, 44, 112, 190, 18);
      if (!g.roundRect) g.rect(x, 44, 112, 190);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.92)';
      g.beginPath();
      g.arc(x + 56, 118, 42, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = done ? 1 : 0.55;
      g.font = '58px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#000';
      g.fillText(BOARD_ICONS[i], x + 56, 122);
      g.globalAlpha = 1;
      // a tick when done, a small ring when not
      g.lineWidth = 9;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      if (done) {
        g.strokeStyle = '#ffffff';
        g.beginPath(); g.moveTo(x + 30, 196); g.lineTo(x + 50, 214); g.lineTo(x + 86, 176); g.stroke();
      } else {
        g.strokeStyle = 'rgba(255,255,255,.55)';
        g.beginPath(); g.arc(x + 56, 196, 16, 0, Math.PI * 2); g.stroke();
      }
      // a small arrow between the pictures
      if (i < 3) { g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.moveTo(x + 114, 126); g.lineTo(x + 124, 139); g.lineTo(x + 114, 152); g.fill(); }
    }
    tex.needsUpdate = true;
  }
  draw([false, false, false, false]);
  return { setMarks: draw, get texture() { return tex; }, dispose() { tex.dispose(); mesh.material.dispose(); } };
}

// Pip's picture bubble: a sprite over his head showing one emoji (a battery, a plug, a robot, a bulb) for a moment when he is called.
export function createBubble() {
  const cv = canvasOf(128, 128);
  const tex = cv ? new THREE.CanvasTexture(cv) : null;
  if (tex) tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
  const sprite = new THREE.Sprite(mat);
  sprite.name = 'pip:bubble';
  sprite.scale.set(0.7, 0.7, 1);
  sprite.visible = false;
  sprite.userData.noMerge = true;
  sprite.userData.noCast = true;
  return {
    sprite,
    show(emoji) {
      if (cv) {
        const g = cv.getContext('2d');
        g.clearRect(0, 0, 128, 128);
        g.fillStyle = 'rgba(255,255,255,.96)';
        g.beginPath(); g.arc(64, 60, 52, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.moveTo(44, 100); g.lineTo(64, 126); g.lineTo(80, 98); g.fill();
        g.font = '64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#000';
        g.fillText(emoji, 64, 64);
        tex.needsUpdate = true;
      }
    },
    dispose() { tex?.dispose(); mat.dispose(); },
  };
}
