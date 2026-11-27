// =============================================================================
// THE SINGING CHAMBER: THE DRAWING (milestone C5). Two draws, nothing else:
//   * ONE opaque mesh of the seven pads (a disc and a dim rim each, flat on the floor: 0.05 m up, never over 0.08), a basic material with the glow painted into its vertex colours;
//   * ONE additive mesh of the soft halos round them (dropped on LOW and LITE).
// The life (crystalsonglive.js) rewrites the colours as the pads light and fade: `paint(levels)`. No PointLight (the cave has the one), no canvas, no Math.random. Every vertex
// follows the floor (crystalY). LOW and LITE: fewer segments, no halo.
// =============================================================================

import { BufferGeometry, BufferAttribute, Mesh, MeshBasicMaterial, Color, DoubleSide, AdditiveBlending } from 'three';
import { crystalY } from './crystalplan.js';
import * as S from './crystalsongplan.js';

const mark = (m, name) => {
  m.name = name; m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false;
  Object.assign(m.userData, { noCast: true, noContactShadow: true, noMerge: true });
  return m;
};

// Every pad is the same shape: a fan from the middle to ring 1, then quads between the rings (rings are [radius, brightness, lift]); `seg` points to a ring.
function build(seg, rings, centreFirst) {
  const pos = [];
  const bri = [];
  const owner = [];
  for (const p of S.PADS) {
    const v = (r, i, lift, b) => {
      const a = (i / seg) * Math.PI * 2;
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      pos.push(x, crystalY(x, z) + lift, z); bri.push(b); owner.push(p.i);
    };
    const tri = (r1, i1, r2, i2, r3, i3) => { for (const [r, i] of [[r1, i1], [r2, i2], [r3, i3]]) v(rings[r][0], i, rings[r][2], rings[r][1]); };
    for (let ri = 0; ri < rings.length - 1; ri++) {
      for (let i = 0; i < seg; i++) {
        if (ri === 0 && centreFirst) tri(0, 0, 1, i + 1, 1, i);
        else { tri(ri, i, ri, i + 1, ri + 1, i); tri(ri, i + 1, ri + 1, i + 1, ri + 1, i); }
      }
    }
  }
  return { pos: new Float32Array(pos), bri: new Float32Array(bri), owner: new Uint8Array(owner) };
}

// the body: a bright disc, a dim rim; the halo: a soft round fall-off to black (additive, so black is nothing)
const BODY_RINGS = [[0, 1, S.PAD_LIFT], [S.PAD_R, 0.92, S.PAD_LIFT], [S.PAD_R + 0.16, 0.45, S.PAD_LIFT - 0.02]];
const HALO_RINGS = [[0, 0.7, S.PAD_LIFT + 0.015], [S.HALO_R * 0.5, 0.38, S.PAD_LIFT + 0.015], [S.HALO_R, 0, S.PAD_LIFT + 0.015]];

export function songGeometries(rung = 'high') {
  const seg = rung === 'low' ? 8 : 14;
  return { body: build(seg, BODY_RINGS, true), halo: rung === 'low' ? null : build(seg, HALO_RINGS, true) };
}

function mesh(g, material, name) {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(g.pos, 3));
  geo.setAttribute('color', new BufferAttribute(new Float32Array(g.pos.length), 3));
  const m = mark(new Mesh(geo, material), name);
  m.userData.src = g;
  return m;
}

/** drawSong(rung) -> { meshes, paint(levels) }: `levels` is seven numbers 0 to 1; the colours are written once per call. */
export function drawSong(rung = 'high') {
  const g = songGeometries(rung);
  const body = mesh(g.body, new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, fog: true }), 'crystal:song:pads');
  const halo = g.halo ? mesh(g.halo, new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: true }), 'crystal:song:halo') : null;
  const meshes = halo ? [body, halo] : [body];
  const colours = S.PAD_COLOURS.map((h) => new Color(h));
  const write = (m, levels, gain) => {
    const { bri, owner } = m.userData.src;
    const col = m.geometry.attributes.color;
    for (let v = 0; v < owner.length; v++) {
      const c = colours[owner[v]];
      const s = Math.min(1, Math.max(0, levels[owner[v]])) * bri[v] * gain;
      col.setXYZ(v, c.r * s, c.g * s, c.b * s);
    }
    col.needsUpdate = true;
  };
  return {
    meshes,
    paint(levels) { write(body, levels, 1); if (halo) write(halo, levels, 0.6); },
  };
}
