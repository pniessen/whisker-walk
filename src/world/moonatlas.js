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

export const BOARD_ICONS = Object.freeze(['🤖', '🔋', '🚙', '💡', '🚀', '🌍']);
const PANEL = Object.freeze(['#3fb58f', '#2fb8c8', '#f0a43a', '#f3d36b', '#e0607a', '#5b8def']);

// The Mission Board's face: six pictures in a row (Pip, the Ridge cell, the Rover cell, the base, the rocket, Earth), each dim until done and bright with
// a tick when it is. setMarks([bool x 4]) redraws. Gives the mesh its map.
export function createBoardFace(mesh) {
  const cv = canvasOf(512, 272);
  if (!cv || !mesh) return { setMarks() {}, setAlbum() {}, dispose() {}, get texture() { return null; } };
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  mesh.material = mesh.material.clone();
  mesh.material.map = tex;
  mesh.material.color.set(0xffffff);
  mesh.material.needsUpdate = true;
  let lastMarks = [false, false, false, false, false, false];
  // (milestone 9) Pip's album: twelve small postcards along the board's foot (earned ones in colour, the rest dim) and today's errand in the header bar
  let album = null; // { count, job: emoji | null, jobDone, cards: [[emoji, colour] x 12] }
  function drawAlbum() {
    if (!album) return;
    if (album.job) { // today's errand in the header bar: a pill with its picture (a tick beside it once it is done)
      g.fillStyle = '#273a4c';
      g.fillRect(0, 0, 512, 40);
      g.fillStyle = album.jobDone ? 'rgba(120,200,150,.55)' : '#ffd45a';
      g.beginPath();
      g.roundRect?.(436, 4, 68, 32, 16);
      if (!g.roundRect) g.rect(436, 4, 68, 32);
      g.fill();
      g.font = '26px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#000';
      g.fillText(album.job, 462, 22);
      if (album.jobDone) { g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#ffffff'; g.beginPath(); g.moveTo(481, 21); g.lineTo(487, 27); g.lineTo(497, 14); g.stroke(); }
    }
    for (let i = 0; i < album.cards.length; i++) {
      const x = 8 + i * 41.5;
      const got = i < album.count;
      g.globalAlpha = got ? 1 : 0.3;
      g.fillStyle = album.cards[i][1];
      g.beginPath();
      g.roundRect?.(x, 238, 37, 28, 5);
      if (!g.roundRect) g.rect(x, 238, 37, 28);
      g.fill();
      if (got) {
        g.font = '19px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#000';
        g.fillText(album.cards[i][0], x + 18.5, 253);
      }
      g.globalAlpha = 1;
    }
  }
  function draw(marks) {
    lastMarks = marks;
    g.fillStyle = '#1d2a37';
    g.fillRect(0, 0, 512, 272);
    g.fillStyle = '#273a4c';
    g.fillRect(0, 0, 512, 22);
    const N = BOARD_ICONS.length; // six pictures, 80 px a panel (milestone 6 added the rocket and Earth)
    for (let i = 0; i < N; i++) {
      const done = !!marks[i];
      const x = 8 + i * 84;
      g.globalAlpha = done ? 1 : 0.42;
      g.fillStyle = PANEL[i];
      g.beginPath();
      g.roundRect?.(x, 44, 76, 190, 14);
      if (!g.roundRect) g.rect(x, 44, 76, 190);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.92)';
      g.beginPath();
      g.arc(x + 38, 108, 30, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = done ? 1 : 0.55;
      g.font = '40px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#000';
      g.fillText(BOARD_ICONS[i], x + 38, 111);
      g.globalAlpha = 1;
      // a tick when done, a small ring when not
      g.lineWidth = 8;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      if (done) {
        g.strokeStyle = '#ffffff';
        g.beginPath(); g.moveTo(x + 18, 192); g.lineTo(x + 33, 207); g.lineTo(x + 60, 176); g.stroke();
      } else {
        g.strokeStyle = 'rgba(255,255,255,.55)';
        g.beginPath(); g.arc(x + 38, 192, 14, 0, Math.PI * 2); g.stroke();
      }
      // a small arrow between the pictures
      if (i < N - 1) { g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.moveTo(x + 77, 130); g.lineTo(x + 84, 140); g.lineTo(x + 77, 150); g.fill(); }
    }
    drawAlbum();
    tex.needsUpdate = true;
  }
  draw([false, false, false, false, false, false]);
  return { setMarks: draw, setAlbum(a) { album = a; draw(lastMarks); }, get texture() { return tex; }, dispose() { tex.dispose(); mesh.material.dispose(); } };
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
