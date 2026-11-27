// =============================================================================
// THE SEALAB'S DOME SHOW, THE DRAWING (milestone R15). Everything is emissive or vertex-coloured (additive, no light of its own: the Sealab's one PointLight is
// only tinted by world/reeflabstory.js); nothing casts a shadow or reads a texture. One ribbon mesh (the curtains of light, rebuilt in place each frame), one jelly
// InstancedMesh, one fish InstancedMesh and one ray: all four are hidden when no show is playing. three comes through reeflabparts.js's kit.
//   place(show, still)  show: a labShowAt() answer; still: draw the reduced-motion picture (the ribbons held at a gentle constant, nothing else)
//   hide()              nothing drawn
// LOW / LITE (lowTier): two ribbons, three jellies, five fish.
// =============================================================================

import { kitOf } from './reeflabparts.js';
import { SHOW } from './reeflabshow.js';

const NOFX = Object.freeze({ noCast: true, noContactShadow: true, noMerge: true });
const GLOW = 0.55; // the held brightness of the reduced-motion picture
function flag(m, name) { m.name = name; m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; m.visible = false; Object.assign(m.userData, NOFX); return m; }
function additive(THREE, extra = {}) { return new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, ...extra }); }

// An instance's matrix: a position, a yaw about y and a uniform scale (written by hand, column-major).
function setAt(mesh, i, x, y, z, yaw, s) {
  const c = Math.cos(yaw) * s; const sn = Math.sin(yaw) * s;
  const a = mesh.instanceMatrix.array; const o = i * 16;
  a[o] = c; a[o + 1] = 0; a[o + 2] = -sn; a[o + 3] = 0;
  a[o + 4] = 0; a[o + 5] = s; a[o + 6] = 0; a[o + 7] = 0;
  a[o + 8] = sn; a[o + 9] = 0; a[o + 10] = c; a[o + 11] = 0;
  a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
}

export function createShowDraw({ scene, reefY, lowTier = false }) {
  const { THREE, mergeGeometries, tone } = kitOf();
  const nR = lowTier ? 2 : SHOW.ribbons;
  const nJ = lowTier ? 3 : SHOW.jellies;
  const nF = lowTier ? 5 : SHOW.fish;
  const N = SHOW.ribbonPts;

  // the curtains: for each ribbon a strip of N columns, two vertices each (the lower edge and the upper), colour = the ribbon's hue times its brightness
  const pos = new Float32Array(nR * N * 2 * 3);
  const col = new Float32Array(nR * N * 2 * 3);
  const idx = [];
  for (let r = 0; r < nR; r++) for (let j = 0; j < N - 1; j++) { const a = (r * N + j) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  rg.setIndex(idx);
  const ribbons = flag(new THREE.Mesh(rg, additive(THREE, { opacity: 1 })), 'lab:show:ribbons');

  const bell = tone(new THREE.SphereGeometry(0.45, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.75, 1), 0xffffff);
  const tent = [-0.2, 0, 0.2].map((x) => tone(new THREE.ConeGeometry(0.05, 0.7, 4).rotateX(Math.PI).translate(x, -0.35, 0.05 * x), 0xdddddd));
  const jellies = flag(new THREE.InstancedMesh(mergeGeometries([bell, ...tent]), additive(THREE, { opacity: 0.75 }), nJ), 'lab:show:jellies');
  const fishGeo = mergeGeometries([tone(new THREE.ConeGeometry(0.1, 0.4, 5).rotateX(Math.PI / 2), 0xffffff), tone(new THREE.ConeGeometry(0.07, 0.16, 3).rotateX(-Math.PI / 2).translate(0, 0, -0.26), 0xcccccc)]);
  const fish = flag(new THREE.InstancedMesh(fishGeo, additive(THREE, { opacity: 0.8 }), nF), 'lab:show:fish');
  const rayGeo = mergeGeometries([tone(new THREE.SphereGeometry(0.9, 8, 5).scale(1.2, 0.18, 1.1), 0xffffff), tone(new THREE.CylinderGeometry(0.01, 0.04, 2, 4).rotateX(Math.PI / 2).translate(0, 0, -1.6), 0xcccccc)]);
  const ray = flag(new THREE.InstancedMesh(rayGeo, additive(THREE, { opacity: 0.7 }), 1), 'lab:show:ray');
  const c = new THREE.Color();
  for (let i = 0; i < nF; i++) fish.setColorAt(i, c.setHex(i % 2 ? 0x9fe8ff : 0xffe0a0));
  ray.setColorAt(0, c.setHex(0xb8d8ff));
  for (let i = 0; i < nJ; i++) jellies.setColorAt(i, c.setHex(0xffb3d9));
  const all = [ribbons, jellies, fish, ray];
  scene.add(...all);

  const k0 = new THREE.Color();
  return {
    meshes: all,
    ribbonCount: nR,
    hide() { for (const m of all) m.visible = false; },
    place(show, still = false) {
      if (!show?.active) { this.hide(); return; }
      let any = false;
      for (let r = 0; r < nR; r++) {
        const rb = show.ribbons[r];
        const b = still ? GLOW * rb.alpha : rb.alpha;
        k0.setHex(rb.hue);
        for (let j = 0; j < N; j++) {
          const p = rb.pts[j];
          const o = (r * N + j) * 6;
          const base = reefY(p.x, p.z);
          const edgeFade = Math.sin((j / (N - 1)) * Math.PI); // the ends thin to nothing
          pos[o] = p.x; pos[o + 1] = base + p.y - rb.width * 0.4; pos[o + 2] = p.z;
          pos[o + 3] = p.x; pos[o + 4] = base + p.y + rb.width * 1.6; pos[o + 5] = p.z;
          const f = b * edgeFade * 0.8;
          col[o] = k0.r * f; col[o + 1] = k0.g * f; col[o + 2] = k0.b * f; // the lower edge is brightest, the upper fades to nothing (below)
          col[o + 3] = k0.r * f * 0.12; col[o + 4] = k0.g * f * 0.12; col[o + 5] = k0.b * f * 0.12;
          any = any || f > 0.001;
        }
      }
      rg.attributes.position.needsUpdate = true;
      rg.attributes.color.needsUpdate = true;
      ribbons.visible = any;
      const moving = !still && !!show.ray;
      if (moving) {
        for (let i = 0; i < nJ; i++) { const j = show.jellies[i]; setAt(jellies, i, j.x, reefY(j.x, j.z) + j.y, j.z, 0, j.show * (0.7 + 0.18 * j.pulse)); }
        for (let i = 0; i < nF; i++) { const f = show.fish[i]; setAt(fish, i, f.x, reefY(f.x, f.z) + f.y, f.z, f.yaw, f.show); }
        const r = show.ray;
        setAt(ray, 0, r.x, reefY(r.x, r.z) + r.y, r.z, r.yaw, r.show);
        for (const m of [jellies, fish, ray]) m.instanceMatrix.needsUpdate = true;
      }
      for (const m of [jellies, fish, ray]) m.visible = moving;
    },
    dispose() {
      for (const m of all) { scene.remove(m); m.geometry?.dispose?.(); m.material?.dispose?.(); }
    },
  };
}
