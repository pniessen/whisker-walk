import * as THREE from 'three';
import { litMaterial } from '../render/materials.js';

const mat = (color) => litMaterial(color);
const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));

export function applySky(scene, top, horizon) {
  scene.background = new THREE.Color(top);
  scene.fog = new THREE.Fog(horizon, 40, 130);
}

export function ground(size, color) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat(color));
  m.rotation.x = -Math.PI / 2;
  return m;
}

export function path(x1, z1, x2, z2, w = 2) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), mat(0xcbb8a0));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = -Math.atan2(x2 - x1, z2 - z1);
  m.position.set((x1 + x2) / 2, 0.01, (z1 + z2) / 2);
  return m;
}

export function house(x, z, bodyColor = 0xe8d8b0, roofColor = 0xb05a4a) {
  const g = new THREE.Group();
  const body = box(5, 3, 4, bodyColor);
  body.position.y = 1.5;
  g.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.9, 2, 4), mat(roofColor));
  roof.position.y = 4;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  const door = box(0.9, 1.8, 0.1, 0x7a5230);
  door.position.set(0, 0.9, 2.01);
  g.add(door);
  for (const wx of [-1.6, 1.6]) {
    const win = box(0.9, 0.9, 0.1, 0xa8d8e8);
    win.userData.window = true;
    win.position.set(wx, 1.8, 2.01);
    g.add(win);
  }
  g.position.set(x, 0, z);
  return g;
}

export function tree(x, z, scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2, 6), mat(0x7a5230));
  trunk.position.y = 1;
  g.add(trunk);
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 0), mat(0x4e9440));
  leaves.position.y = 2.8;
  g.add(leaves);
  g.scale.setScalar(scale);
  g.position.set(x, 0, z);
  return g;
}

export function bush(x, z) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), mat(0x5aa04e));
  m.position.set(x, 0.5, z);
  return m;
}

export function fenceRun(x1, z1, x2, z2) {
  const g = new THREE.Group();
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.floor(len / 0.8);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = box(0.1, 1, 0.1, 0xc8b088);
    p.position.set(x1 + (x2 - x1) * t, 0.5, z1 + (z2 - z1) * t);
    g.add(p);
  }
  const rail = box(0.06, 0.08, len, 0xc8b088);
  rail.position.set((x1 + x2) / 2, 0.8, (z1 + z2) / 2);
  rail.rotation.y = Math.atan2(x2 - x1, z2 - z1);
  g.add(rail);
  return g;
}

export function mailbox(x, z) {
  const g = new THREE.Group();
  const post = box(0.08, 1, 0.08, 0x7a5230);
  post.position.y = 0.5;
  g.add(post);
  const boxTop = box(0.3, 0.25, 0.5, 0x4a6ea5);
  boxTop.position.y = 1.1;
  g.add(boxTop);
  g.position.set(x, 0, z);
  return g;
}

export function car(x, z, color = 0xd06048, rotY = 0) {
  const g = new THREE.Group();
  const body = box(1.8, 0.6, 4, color);
  body.position.y = 0.6;
  g.add(body);
  const cabin = box(1.6, 0.55, 2, 0xa8d8e8);
  cabin.position.set(0, 1.15, -0.2);
  g.add(cabin);
  for (const [wx, wz] of [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 8), mat(0x2a2a30));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.35, wz);
    g.add(wheel);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

export function bench(x, z, rotY = 0) {
  const g = new THREE.Group();
  const seat = box(1.6, 0.08, 0.5, 0x9a7048);
  seat.position.y = 0.5;
  g.add(seat);
  const back = box(1.6, 0.5, 0.08, 0x9a7048);
  back.position.set(0, 0.85, -0.25);
  g.add(back);
  for (const lx of [-0.7, 0.7]) {
    const leg = box(0.08, 0.5, 0.4, 0x5a4028);
    leg.position.set(lx, 0.25, 0);
    g.add(leg);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

export function lampPost(x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6), mat(0x3a3a42));
  pole.position.y = 1.6;
  g.add(pole);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8),
    litMaterial(0xfff2c0, { emissive: 0x8a7a40 }));
  lamp.position.y = 3.3;
  g.add(lamp);
  g.position.set(x, 0, z);
  return g;
}

export function puddle(x, z, r = 0.8) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 12), mat(0x8ab8d8));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.02, z);
  return m;
}

export function rock(x, z) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), mat(0x9a9aa2));
  m.position.set(x, 0.3, z);
  return m;
}

export function flowerPatch(x, z) {
  const g = new THREE.Group();
  const colors = [0xf2a0c0, 0xf2e04e, 0xffffff, 0xe07040];
  for (let i = 0; i < 6; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 5), mat(colors[i % 4]));
    f.position.set((Math.sin(i * 2.4) * 0.5), 0.25, (Math.cos(i * 1.7) * 0.5));
    g.add(f);
    const stem = box(0.03, 0.25, 0.03, 0x4e9440);
    stem.position.set(f.position.x, 0.12, f.position.z);
    g.add(stem);
  }
  g.position.set(x, 0, z);
  return g;
}

export function billboard(x, z, rotY = 0, title = 'THE DAD SHOW', subtitle = 'now streaming · very good episodes') {
  const g = new THREE.Group();
  for (const px of [-1.7, 1.7]) {
    const post = box(0.18, 3.2, 0.18, 0x7a5230);
    post.position.set(px, 1.6, 0);
    g.add(post);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 288;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f6ecd8';
  ctx.fillRect(0, 0, 512, 288);
  ctx.strokeStyle = '#b05a4a';
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, 492, 268);
  ctx.fillStyle = '#2a3550';
  ctx.textAlign = 'center';
  ctx.font = 'bold 72px Avenir, Trebuchet MS, sans-serif';
  ctx.fillText(title, 256, 140);
  ctx.font = '28px Avenir, Trebuchet MS, sans-serif';
  ctx.fillStyle = '#b05a4a';
  ctx.fillText(subtitle, 256, 200);
  ctx.font = '34px sans-serif';
  ctx.fillText('📺  🐈  👨', 256, 250);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 2.5),
    new THREE.MeshBasicMaterial({ map: texture })
  );
  panel.position.y = 2.9;
  g.add(panel);
  const back = box(4.5, 2.6, 0.08, 0x8a7048);
  back.position.set(0, 2.9, -0.06);
  g.add(back);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

export function sidewalk(x1, z1, x2, z2, w = 1.2) {
  // a lighter strip beside a street — reuses path() geometry with pavement color
  const len = Math.hypot(x2 - x1, z2 - z1);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), mat(0xd8d0c0));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = -Math.atan2(x2 - x1, z2 - z1);
  m.position.set((x1 + x2) / 2, 0.008, (z1 + z2) / 2);
  return m;
}

export function leafLitter(x, z, seed = 1) {
  const g = new THREE.Group();
  const colors = [0xc8823a, 0xb05a2a, 0xd8a04e];
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.09, 5), mat(colors[(seed + i) % 3]));
    leaf.rotation.x = -Math.PI / 2;
    leaf.position.set(x + Math.sin(seed * 3 + i * 2.1) * 0.8, 0.015, z + Math.cos(seed * 2 + i * 1.7) * 0.8);
    g.add(leaf);
  }
  return g;
}

export function bike(x, z, rotY = 0) {
  const g = new THREE.Group();
  for (const wz of [-0.45, 0.45]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 10), mat(0x3a3a42));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, 0.28, wz);
    g.add(wheel);
  }
  const frame = box(0.06, 0.06, 0.9, 0xd06048);
  frame.position.y = 0.45; frame.rotation.x = 0.2;
  g.add(frame);
  const bars = box(0.4, 0.06, 0.06, 0x3a3a42);
  bars.position.set(0, 0.62, -0.45);
  g.add(bars);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A flat-topped box the cat can stand on — crate stacks, porch/shed roofs,
// dune ledges. Spans y `yBottom`..`yTop` so several calls at the same x/z
// with increasing yBottom stack into a tiered climbing platform.
export function platform(x, z, yTop, yBottom = 0, size = 1.2, color = 0xc8a678) {
  const m = box(size, yTop - yBottom, size, color);
  m.position.set(x, yBottom + (yTop - yBottom) / 2, z);
  return m;
}

// ---------------------------------------------------------------------------
// Dockside props (v18 Task 2.6, "The Old Docks").
//
// Every one of these is written so its WALKABLE TOP SURFACE is a number the
// caller passes in or can read straight off the signature, because the Docks'
// perch chains are authored against those exact heights. If you change a
// height here, docks.js's perch array (and the hop math in its comments) has
// to move with it — test/climbing.test.js BFSes the real shipped arrays and
// will fail loudly if the two drift apart.
// ---------------------------------------------------------------------------

// A flat-roofed brick warehouse. Unlike house(), whose cone roof has nowhere
// to stand, the roof here is a flat deck at exactly `h` ringed by a parapet
// whose top is `h + PARAPET`. Those are the two numbers the roof chains use:
// docks.js perches sit on the parapet lip, not on the deck.
export const PARAPET = 0.3;

export function warehouse(x, z, w, d, h, bodyColor = 0x8a7c74, roofColor = 0x4a4650) {
  const g = new THREE.Group();
  const body = box(w, h, d, bodyColor);
  body.position.y = h / 2;
  g.add(body);
  // flat roof deck, then a parapet lip on all four sides
  const deck = box(w, 0.12, d, roofColor);
  deck.position.y = h + 0.06;
  g.add(deck);
  for (const [lw, ld, lx, lz] of [
    [w, 0.16, 0, d / 2 - 0.08], [w, 0.16, 0, -d / 2 + 0.08],
    [0.16, d, w / 2 - 0.08, 0], [0.16, d, -w / 2 + 0.08, 0],
  ]) {
    const lip = box(lw, PARAPET, ld, roofColor);
    lip.position.set(lx, h + PARAPET / 2, lz);
    g.add(lip);
  }
  // Two rows of windows on the long (x) faces. userData.window is what
  // walk.js's dusk pass looks for when it swaps in the warm emissive glow —
  // the same hook house() uses, so the Docks lights up at dusk for free.
  const cols = Math.max(2, Math.floor(w / 2.6));
  for (const face of [1, -1]) {
    for (let i = 0; i < cols; i++) {
      for (const wy of h > 3.4 ? [1.1, 2.7] : [1.1]) {
        const win = box(0.8, 0.7, 0.08, 0xa8d8e8);
        win.userData.window = true;
        win.position.set(-w / 2 + (i + 0.5) * (w / cols), wy, face * (d / 2 + 0.02));
        g.add(win);
      }
    }
  }
  // a narrower column of windows on the short (x) faces, so no elevation of
  // the building reads as a blank slab
  for (const face of [1, -1]) {
    for (const wy of h > 3.4 ? [1.1, 2.7] : [1.1]) {
      const win = box(0.08, 0.7, 0.8, 0xa8d8e8);
      win.userData.window = true;
      win.position.set(face * (w / 2 + 0.02), wy, 0);
      g.add(win);
    }
  }
  const door = box(1.6, 2.2, 0.12, 0x53433a);
  door.position.set(0, 1.1, d / 2 + 0.03);
  g.add(door);
  const lintel = box(2.0, 0.16, 0.2, 0x5e5450);
  lintel.position.set(0, 2.3, d / 2 + 0.05);
  g.add(lintel);
  g.position.set(x, 0, z);
  return g;
}

// A rooftop water tank / vent housing — the thing that turns a flat roof into
// one more step of a chain. `yBottom` is the roof deck it stands on; the
// walkable top is `yBottom + height`.
export function roofTank(x, z, yBottom, height = 0.9, r = 0.85) {
  const g = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(r, r, height, 10), mat(0x6a5a4a));
  drum.position.y = yBottom + height / 2;
  g.add(drum);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.05, 0.08, 10), mat(0x8a7a62));
  cap.position.y = yBottom + height;
  g.add(cap);
  g.position.set(x, 0, z);
  return g;
}

// A steel shipping container. Long axis runs along local +x, so rotY turns it
// broadside. Walkable top is exactly CONTAINER_H.
export const CONTAINER_H = 2.6;

export function shippingContainer(x, z, rotY = 0, color = 0xb05a4a) {
  const g = new THREE.Group();
  const body = box(6, CONTAINER_H, 2.5, color);
  body.position.y = CONTAINER_H / 2;
  g.add(body);
  for (let i = 0; i < 7; i++) { // corrugated ribs
    const rib = box(0.1, CONTAINER_H - 0.3, 2.56, color === 0xb05a4a ? 0x9a4a3a : 0x3a5a78);
    rib.position.set(-2.6 + i * 0.87, CONTAINER_H / 2, 0);
    g.add(rib);
  }
  const lid = box(6.05, 0.1, 2.55, 0x6a6a72);
  lid.position.y = CONTAINER_H;
  g.add(lid);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A night-market stall: counter, four posts, striped awning. The awning top
// is STALL_AWNING and is the first step of the Docks' crane chain.
export const STALL_AWNING = 1.3;

export function marketStall(x, z, rotY = 0, awningColor = 0xc85a5a) {
  const g = new THREE.Group();
  const counter = box(1.9, 0.75, 1.0, 0x9a7048);
  counter.position.y = 0.375;
  g.add(counter);
  for (const [px, pz] of [[-0.9, -0.5], [0.9, -0.5], [-0.9, 0.5], [0.9, 0.5]]) {
    const post = box(0.08, STALL_AWNING, 0.08, 0x6a5230);
    post.position.set(px, STALL_AWNING / 2, pz);
    g.add(post);
  }
  const awning = box(2.2, 0.1, 1.3, awningColor);
  awning.position.y = STALL_AWNING;
  g.add(awning);
  for (let i = 0; i < 3; i++) { // stripes, so two stalls side by side read apart
    const stripe = box(0.35, 0.12, 1.32, 0xf0e8d8);
    stripe.position.set(-0.7 + i * 0.7, STALL_AWNING, 0);
    g.add(stripe);
  }
  // a crate of fish on the counter, purely so the stall reads as a fish market
  const crate = box(0.5, 0.3, 0.4, 0xc8a678);
  crate.position.set(0.4, 0.9, 0);
  g.add(crate);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A wall-hung fire escape: one grated landing per entry in `heights` (each
// value is the landing's WALKABLE TOP), joined by ladders. The landings are
// the perch steps; the ladders are decoration, since climbing in this game is
// perch-to-perch and not a continuous surface.
//
// `depth` is how far the assembly reaches BACKWARDS (local +z) toward the
// wall it hangs on. The group's origin sits 0.55 in from the landing's front
// edge — that origin is the perch point — so the caller places the origin
// where the cat should stand and sizes `depth` to meet the wall behind it.
// Without that the landings float in open air, which is exactly how the first
// draft of this looked in the browser.
export function fireEscape(x, z, rotY = 0, heights = [1.9, 3.9], depth = 2.2) {
  const g = new THREE.Group();
  const back = depth - 0.55; // local z of the wall face
  let prev = 0;
  for (const h of heights) {
    const landing = box(1.7, 0.1, depth, 0x4a4a52);
    landing.position.set(0, h - 0.05, depth / 2 - 0.55);
    g.add(landing);
    for (const rx of [-0.85, 0.85]) { // side handrails
      const rail = box(0.06, 0.55, depth, 0x5a5a62);
      rail.position.set(rx, h + 0.25, depth / 2 - 0.55);
      g.add(rail);
      const top = box(0.1, 0.08, depth, 0x6a6a72);
      top.position.set(rx, h + 0.55, depth / 2 - 0.55);
      g.add(top);
    }
    const front = box(1.7, 0.55, 0.06, 0x5a5a62); // front rail
    front.position.set(0, h + 0.25, -0.55);
    g.add(front);
    // ladder up from the previous landing, on the front edge, with rungs
    for (const lx of [-0.28, 0.28]) {
      const stile = box(0.06, h - prev, 0.06, 0x6a6a72);
      stile.position.set(lx, prev + (h - prev) / 2, -0.52);
      g.add(stile);
    }
    const rungs = Math.max(2, Math.round((h - prev) / 0.32));
    for (let i = 1; i < rungs; i++) {
      const rung = box(0.56, 0.045, 0.045, 0x6a6a72);
      rung.position.set(0, prev + (i / rungs) * (h - prev), -0.52);
      g.add(rung);
    }
    prev = h;
  }
  // the bracket plate bolted flat to the wall, so the whole thing reads as
  // hung off the building rather than standing in front of it
  const plate = box(1.9, heights[heights.length - 1] + 0.4, 0.1, 0x3e3e46);
  plate.position.set(0, (heights[heights.length - 1] + 0.4) / 2, back);
  g.add(plate);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A dockside gantry crane. Four legs carry a deck whose top is CRANE_DECK;
// the operator cab stands on the deck and its roof is CRANE_CAB. Those are
// the two tall steps of the Docks' south-bank chain.
export const CRANE_DECK = 4.0;
export const CRANE_CAB = 5.4;

export function dockCrane(x, z, rotY = 0) {
  const g = new THREE.Group();
  for (const [lx, lz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) {
    const leg = box(0.34, CRANE_DECK, 0.34, 0xb0742a);
    leg.position.set(lx, CRANE_DECK / 2, lz);
    g.add(leg);
    const brace = box(0.18, 0.18, 4.4, 0x8a5a20);
    brace.position.set(lx, CRANE_DECK * 0.55, 0);
    g.add(brace);
  }
  const deck = box(5.4, 0.25, 5.4, 0x8a5a20);
  deck.position.y = CRANE_DECK - 0.125;
  g.add(deck);
  // The operator cab stands on the deck at local (-1, -1) and its roof top is
  // CRANE_CAB. docks.js's crane chain places its last perch on that roof, so
  // the offset is part of the contract, not a styling choice.
  const cab = box(2.0, CRANE_CAB - CRANE_DECK, 2.0, 0xc8862a);
  cab.position.set(-1.0, (CRANE_DECK + CRANE_CAB) / 2, -1.0);
  g.add(cab);
  const cabRoof = box(2.2, 0.12, 2.2, 0x8a5a20);
  cabRoof.position.set(-1.0, CRANE_CAB, -1.0);
  g.add(cabRoof);
  // jib reaching out over the water on the cab's far side, with a hook block
  const jib = box(0.3, 0.3, 7, 0xb0742a);
  jib.position.set(1.4, CRANE_DECK + 0.9, 3.2);
  g.add(jib);
  const cable = box(0.05, 2.4, 0.05, 0x3a3a42);
  cable.position.set(1.4, CRANE_DECK - 0.3, 6.2);
  g.add(cable);
  const hook = box(0.35, 0.35, 0.35, 0x5a5a62);
  hook.position.set(1.4, CRANE_DECK - 1.6, 6.2);
  g.add(hook);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A mooring bollard with a coil of rope — quayside flavour, and a low perch
// (top BOLLARD_H) for the bank edges.
export const BOLLARD_H = 0.55;

export function bollard(x, z) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, BOLLARD_H, 8), mat(0x3a3a42));
  post.position.y = BOLLARD_H / 2;
  g.add(post);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), mat(0x4a4a52));
  cap.position.y = BOLLARD_H;
  g.add(cap);
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 5, 10), mat(0xc8b088));
  rope.rotation.x = -Math.PI / 2;
  rope.position.y = 0.06;
  g.add(rope);
  g.position.set(x, 0, z);
  return g;
}

// An oil-drum barrel. No collider anywhere it is used — like cardboardBox, it
// is cover to hide things BEHIND rather than an obstacle.
export function barrel(x, z, color = 0x4a6a5a) {
  const g = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.75, 10), mat(color));
  drum.position.y = 0.375;
  g.add(drum);
  for (const ry of [0.22, 0.53]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 10), mat(0x2f2f36));
    band.position.y = ry;
    g.add(band);
  }
  g.position.set(x, 0, z);
  return g;
}

// A moored canal barge. Sits IN the water on purpose and carries no perch and
// no collectible: the Docks canal is scenery plus a bridged crossing, never a
// place the player has to reach (see docks.js's header — Sea Legs may never
// ship, so nothing may depend on swimming).
export function barge(x, z, rotY = 0, color = 0x3a5a78) {
  const g = new THREE.Group();
  const hull = box(3.2, 0.7, 9, color);
  hull.position.y = 0.3;
  g.add(hull);
  const gunwale = box(3.3, 0.14, 9.1, 0x2a3a4e);
  gunwale.position.y = 0.65;
  g.add(gunwale);
  const cabin = box(2.2, 1.1, 3, 0xd8cbb0);
  cabin.position.set(0, 1.2, -2.2);
  g.add(cabin);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.1, 8), mat(0x2f2f36));
  stack.position.set(0, 2.2, -2.8);
  g.add(stack);
  for (let i = 0; i < 3; i++) { // deck cargo
    const crate = box(0.9, 0.7, 0.9, 0xc8a678);
    crate.position.set(0, 1.0, 1.4 + i * 1.1);
    g.add(crate);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A plank bridge deck across a waterway, with railings. NO COLLIDERS are
// emitted for the railings by any caller — the deck has to stay walkable,
// because it is the guaranteed dry crossing between the Docks' two banks.
export function bridgeDeck(x1, z1, x2, z2, w = 4, y = 0.14) {
  const g = new THREE.Group();
  const len = Math.hypot(x2 - x1, z2 - z1);
  const angle = Math.atan2(x2 - x1, z2 - z1);
  const deck = box(w, 0.14, len, 0xa08050);
  deck.position.y = y;
  g.add(deck);
  const planks = Math.floor(len / 1.1);
  for (let i = 0; i < planks; i++) {
    const plank = box(w - 0.1, 0.04, 0.12, 0x8a6a42);
    plank.position.set(0, y + 0.09, -len / 2 + (i + 0.5) * (len / planks));
    g.add(plank);
  }
  for (const side of [-1, 1]) {
    const rail = box(0.08, 0.08, len, 0x6a5230);
    rail.position.set(side * (w / 2 - 0.06), y + 0.65, 0);
    g.add(rail);
    const posts = Math.max(2, Math.floor(len / 2));
    for (let i = 0; i <= posts; i++) {
      const post = box(0.1, 0.65, 0.1, 0x6a5230);
      post.position.set(side * (w / 2 - 0.06), y + 0.33, -len / 2 + i * (len / posts));
      g.add(post);
    }
  }
  g.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
  g.rotation.y = angle;
  return g;
}

export function cardboardBox(x, z, rotY = 0) {
  const g = new THREE.Group();
  const wallSpecs = [
    [0.55, 0.3, 0.03, 0, 0.15, 0.26], [0.55, 0.3, 0.03, 0, 0.15, -0.26],
    [0.03, 0.3, 0.55, 0.26, 0.15, 0], [0.03, 0.3, 0.55, -0.26, 0.15, 0],
  ];
  for (const [w, h, d, px, py, pz] of wallSpecs) {
    const wall = box(w, h, d, 0xc8a678);
    wall.position.set(px, py, pz);
    g.add(wall);
  }
  const bottom = box(0.55, 0.03, 0.55, 0xb89468);
  bottom.position.y = 0.015;
  g.add(bottom);
  for (const side of [-1, 1]) {
    const flap = box(0.55, 0.02, 0.2, 0xd8b688);
    flap.position.set(0, 0.31, side * 0.34);
    flap.rotation.x = side * -0.7;
    g.add(flap);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// =============================================================================
// INTERIOR PROPS — the Cozy Den density pass.
//
// The den shipped in v17 with six purchasable pieces and almost no room around
// them, while the outdoor areas had four density waves. These are the props
// that furnish an INSIDE: skirting and picture rails, shelves and bookcases,
// pictures, plants, bowls, toys, a radiator, a telly. They live here rather
// than in world/den.js for the same reason the dockside block above does —
// builder.js is where a second interior (a shop, a vet's waiting room, a
// neighbour's kitchen) goes shopping.
//
// Two rules carried over from the dockside block, both load-bearing:
//
//   * Anything with a WALKABLE TOP exports that height as a constant, because
//     src/world/den.js authors its perch chain against these numbers. A silent
//     0.1 here leaves a cat hovering, or pushes a chain step out of the 1.6
//     climb budget (src/climbing.js).
//   * Everything is deterministic — no rng, injected or otherwise. Two clients
//     walking the same den must draw the same room (the CF-7 desync rule), so
//     the "scattered" props scatter by index arithmetic, never by a draw.
//
// Orientation convention, shared by every wall-mounted prop below: at rotY 0
// the prop FACES +z. A north wall (at -z, facing the room) is rotY 0, a west
// wall is +PI/2, an east wall is -PI/2.
// =============================================================================

// A rectangular rug with a border trim. Flat and collider-free by design: a
// rug is the one furnishing that must never change where the cat can walk.
export function rugRect(x, z, w, d, color = 0xb8564e, border = 0xe8d0a8) {
  const g = new THREE.Group();
  const trim = box(w + 0.3, 0.012, d + 0.3, border);
  trim.position.y = 0.012;
  g.add(trim);
  const pile = box(w, 0.02, d, color);
  pile.position.y = 0.02;
  g.add(pile);
  // two woven stripes, so a big rug doesn't read as a painted rectangle
  for (const sz of [-d * 0.28, d * 0.28]) {
    const stripe = box(w * 0.92, 0.006, d * 0.08, border);
    stripe.position.set(0, 0.028, sz);
    g.add(stripe);
  }
  g.position.set(x, 0, z);
  return g;
}

// Floorboard seams: thin dark strips across a floor plane, `count` of them
// spread over `size`. Costs nothing (no collider, 1cm off the floor) and is
// the single cheapest thing that stops a big flat quad reading as a big flat
// quad.
export function floorSeams(size, count, color = 0x7a5230) {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const seam = box(0.05, 0.01, size, color);
    seam.position.set(-size / 2 + (i + 0.5) * (size / count), 0.008, 0);
    g.add(seam);
  }
  return g;
}

// A skirting board / picture rail run along a wall, from (x1,z1) to (x2,z2).
// Same signature shape as fenceRun above so the two read alike. `y` is the
// strip's CENTRE height: 0.11 for skirting, ~2.0 for a picture rail.
export function trimRun(x1, z1, x2, z2, y = 0.11, h = 0.22, color = 0xf0e4d0) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const m = box(0.08, h, len, color);
  m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
  m.rotation.y = Math.atan2(x2 - x1, z2 - z1);
  return m;
}

// A framed picture. Hung, so it takes an explicit `y` (its centre) and never
// a collider — the cat walks under it.
export function pictureFrame(x, y, z, rotY = 0, w = 0.7, h = 0.55, artColor = 0xa8c8d8) {
  const g = new THREE.Group();
  const frame = box(w + 0.09, h + 0.09, 0.05, 0x7a5230);
  g.add(frame);
  const art = box(w, h, 0.02, artColor);
  art.position.z = 0.03;
  g.add(art);
  const hill = new THREE.Mesh(new THREE.ConeGeometry(w * 0.3, h * 0.42, 4), mat(0x5a8a5a));
  hill.position.set(-w * 0.14, -h * 0.16, 0.05);
  g.add(hill);
  const sun = new THREE.Mesh(new THREE.CircleGeometry(h * 0.13, 10), mat(0xf2e0a0));
  sun.position.set(w * 0.26, h * 0.2, 0.05);
  g.add(sun);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  return g;
}

// A wall clock — a disc with two hands, permanently at ten past ten.
export function wallClock(x, y, z, rotY = 0) {
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 16), mat(0xf0e4d0));
  face.rotation.x = Math.PI / 2;
  g.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 6, 16), mat(0x7a5230));
  g.add(rim);
  for (const [len, ang] of [[0.16, -0.9], [0.11, 1.05]]) {
    const hand = box(0.025, len, 0.02, 0x3a3a42);
    hand.position.set(Math.sin(ang) * len / 2, Math.cos(ang) * len / 2, 0.04);
    hand.rotation.z = -ang;
    g.add(hand);
  }
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  return g;
}

// A gathered curtain hanging beside a window. Two folds, no collider.
export function curtain(x, y, z, rotY = 0, w = 0.5, h = 1.7, color = 0xc07a6a) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const fold = box(w / 3, h, 0.08 + (i % 2) * 0.05, color);
    fold.position.set(-w / 2 + (i + 0.5) * (w / 3), -h / 2, 0);
    g.add(fold);
  }
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  return g;
}

// A wall-hung shelf. `y` IS the walkable top of the plank (the caller's perch
// height), and the plank is centred on the group's origin in depth, so a
// shelf on a wall at world x = -9 with depth 1.05 has its origin at
// -9 + depth/2 and reaches (depth/2) into the room.
export function wallShelf(x, y, z, rotY = 0, w = 1.4, depth = 1.05, color = 0x9a7048) {
  const g = new THREE.Group();
  const plank = box(w, 0.07, depth, color);
  plank.position.y = y - 0.035;
  g.add(plank);
  for (const bx of [-w / 2 + 0.16, w / 2 - 0.16]) {
    const bracket = box(0.06, 0.24, depth * 0.55, 0x6a5230);
    bracket.position.set(bx, y - 0.19, -depth * 0.2);
    g.add(bracket);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A stack of books lying flat. `seed` only picks colours and offsets off an
// integer — no rng (see this block's header).
export function bookStack(x, y, z, count = 3, seed = 0) {
  const g = new THREE.Group();
  const colors = [0x9a4a3a, 0x3a5a78, 0x4a6a4a, 0xb08a3a, 0x6a4a6a];
  for (let i = 0; i < count; i++) {
    const bk = box(0.3 - (i % 2) * 0.04, 0.07, 0.22, colors[(seed + i) % colors.length]);
    bk.position.set(Math.sin(seed + i) * 0.03, y + 0.035 + i * 0.075, Math.cos(seed * 2 + i) * 0.03);
    bk.rotation.y = Math.sin(seed * 3 + i) * 0.25;
    g.add(bk);
  }
  g.position.set(x, 0, z);
  return g;
}

// A bookcase. Walkable top is BOOKCASE_H — high enough that no cat reaches it
// off the floor inside the 1.6 climb budget, which is the whole point: it is
// the top of a chain, not a step.
export const BOOKCASE_H = 1.9;

export function bookcase(x, z, rotY = 0, w = 1.5, depth = 0.5) {
  const g = new THREE.Group();
  const backer = box(w, BOOKCASE_H, 0.06, 0x7a5230);
  backer.position.set(0, BOOKCASE_H / 2, -depth / 2 + 0.03);
  g.add(backer);
  for (const sx of [-w / 2 + 0.05, w / 2 - 0.05]) { // uprights
    const side = box(0.1, BOOKCASE_H, depth, 0x9a7048);
    side.position.set(sx, BOOKCASE_H / 2, 0);
    g.add(side);
  }
  const shelfYs = [0.06, 0.62, 1.18, BOOKCASE_H - 0.04];
  for (const sy of shelfYs) {
    const shelf = box(w, 0.08, depth, 0x9a7048);
    shelf.position.set(0, sy, 0);
    g.add(shelf);
  }
  // spines: a row of upright books per shelf, leaning where the row runs out
  const colors = [0x9a4a3a, 0x3a5a78, 0x4a6a4a, 0xb08a3a, 0x6a4a6a, 0xc06a48];
  for (let s = 0; s < 3; s++) {
    const base = shelfYs[s] + 0.04;
    for (let i = 0; i < 7; i++) {
      const h = 0.34 + ((s * 7 + i) % 3) * 0.05;
      const spine = box(0.09, h, depth * 0.62, colors[(s * 5 + i) % colors.length]);
      spine.position.set(-w / 2 + 0.18 + i * 0.16, base + h / 2, 0.02);
      spine.rotation.z = i === 6 ? 0.22 : 0;
      g.add(spine);
    }
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A potted houseplant. PLANT_H is the height at scale 1; nothing perches on
// it (leaves are not a surface) so it is a constant for collider/camera
// bookkeeping rather than for a perch.
export const PLANT_H = 1.15;

export function pottedPlant(x, z, scale = 1) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.36, 10), mat(0xc06a48));
  pot.position.y = 0.18;
  g.add(pot);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 10), mat(0x4a3a30));
  soil.position.y = 0.36;
  g.add(soil);
  const stem = box(0.05, 0.5, 0.05, 0x4e7a40);
  stem.position.y = 0.6;
  g.add(stem);
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), mat(i % 2 ? 0x4e9440 : 0x5aa04e));
    leaf.position.set(Math.sin(i * 2.3) * 0.22, 0.72 + (i % 3) * 0.14, Math.cos(i * 1.9) * 0.22);
    leaf.scale.set(1, 0.7, 1);
    g.add(leaf);
  }
  g.scale.setScalar(scale);
  g.position.set(x, 0, z);
  return g;
}

// A wall radiator with fins and a valve. RADIATOR_H is its top; it is only a
// perch if the caller can put the cat within reach of it, which against a
// wall it usually cannot (see world/den.js).
export const RADIATOR_H = 0.62;

export function radiator(x, z, rotY = 0, w = 1.5) {
  const g = new THREE.Group();
  const panel = box(w, RADIATOR_H - 0.12, 0.1, 0xf0ece4);
  panel.position.y = 0.12 + (RADIATOR_H - 0.12) / 2;
  g.add(panel);
  const fins = Math.max(4, Math.round(w / 0.16));
  for (let i = 0; i < fins; i++) {
    const fin = box(0.06, RADIATOR_H - 0.16, 0.17, 0xe4dfd4);
    fin.position.set(-w / 2 + 0.08 + i * ((w - 0.16) / (fins - 1)), 0.12 + (RADIATOR_H - 0.12) / 2, 0);
    g.add(fin);
  }
  const cap = box(w, 0.06, 0.2, 0xf0ece4);
  cap.position.y = RADIATOR_H;
  g.add(cap);
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8), mat(0xb0a070));
  valve.position.set(w / 2 - 0.02, 0.2, 0.08);
  g.add(valve);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), mat(0xb0a070));
  pipe.position.set(w / 2 - 0.02, 0.1, 0.08);
  g.add(pipe);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// An armchair. Two walkable tops — the seat and the back — and they are
// 0.45 apart on purpose: a cat on the seat can always step up to the back.
export const ARMCHAIR_SEAT = 0.5;
export const ARMCHAIR_BACK = 0.95;

export function armchair(x, z, rotY = 0, color = 0x8a5a6a) {
  const g = new THREE.Group();
  const seat = box(1.0, 0.16, 0.9, color);
  seat.position.y = ARMCHAIR_SEAT - 0.08;
  g.add(seat);
  const cushion = box(0.86, 0.1, 0.76, 0xa8707e);
  cushion.position.y = ARMCHAIR_SEAT + 0.03;
  g.add(cushion);
  const back = box(1.0, ARMCHAIR_BACK - 0.34, 0.18, color);
  back.position.set(0, 0.34 + (ARMCHAIR_BACK - 0.34) / 2, -0.36);
  g.add(back);
  for (const ax of [-0.5, 0.5]) {
    const arm = box(0.16, 0.28, 0.9, color);
    arm.position.set(ax, 0.58, 0);
    g.add(arm);
  }
  for (const [lx, lz] of [[-0.42, 0.38], [0.42, 0.38], [-0.42, -0.38], [0.42, -0.38]]) {
    const leg = box(0.09, 0.34, 0.09, 0x6a4a30);
    leg.position.set(lx, 0.17, lz);
    g.add(leg);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A chest of drawers. DRESSER_H is the walkable top — inside the 1.6 climb
// budget from the floor, so it is a one-hop perch rather than a chain.
export const DRESSER_H = 1.25;

export function dresser(x, z, rotY = 0, w = 1.2, depth = 0.6) {
  const g = new THREE.Group();
  const carcass = box(w, DRESSER_H - 0.14, depth, 0x9a7048);
  carcass.position.y = 0.14 + (DRESSER_H - 0.14) / 2;
  g.add(carcass);
  const top = box(w + 0.08, 0.07, depth + 0.08, 0xb08a58);
  top.position.y = DRESSER_H - 0.035;
  g.add(top);
  for (let i = 0; i < 3; i++) {
    const front = box(w - 0.16, 0.28, 0.04, 0xb08a58);
    front.position.set(0, 0.3 + i * 0.34, depth / 2 + 0.02);
    g.add(front);
    for (const kx of [-w * 0.22, w * 0.22]) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), mat(0x5a4028));
      knob.position.set(kx, 0.3 + i * 0.34, depth / 2 + 0.06);
      g.add(knob);
    }
  }
  for (const lx of [-w / 2 + 0.1, w / 2 - 0.1]) {
    const foot = box(0.12, 0.14, depth - 0.1, 0x6a4a30);
    foot.position.set(lx, 0.07, 0);
    g.add(foot);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A boxy old telly on a low stand. Deliberately a CRT: a flatscreen's top
// edge is not somewhere a cat can sit, and sitting on the telly is the whole
// joke. TV_TOP is that walkable top. The screen is emissive but carries NO
// userData.window — the dusk pass swaps window materials for a warm glow, and
// a telly that turns into a lamp at dusk would read as a bug.
export const TV_TOP = 1.3;

export function tvSet(x, z, rotY = 0) {
  const g = new THREE.Group();
  const stand = box(1.3, 0.5, 0.55, 0x8a6a42);
  stand.position.y = 0.25;
  g.add(stand);
  const shelf = box(1.2, 0.05, 0.5, 0x6a5230);
  shelf.position.y = 0.22;
  g.add(shelf);
  const body = box(1.1, TV_TOP - 0.52, 0.5, 0x53433a);
  body.position.y = 0.52 + (TV_TOP - 0.52) / 2;
  g.add(body);
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.86, 0.52, 0.04),
    litMaterial(0xa8d8e8, { emissive: 0x3a6a80 })
  );
  screen.position.set(0, 0.9, 0.26);
  g.add(screen);
  const lid = box(1.16, 0.06, 0.56, 0x6a5648); // the walkable top
  lid.position.y = TV_TOP - 0.03;
  g.add(lid);
  for (const ax of [-0.2, 0.2]) { // rabbit ears, purely for the silhouette
    const ear = box(0.03, 0.5, 0.03, 0x8a8a92);
    ear.position.set(ax, TV_TOP + 0.25, -0.1);
    ear.rotation.z = ax * 1.6;
    g.add(ear);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A basket of toys. Low and collider-free — a cat should be able to stand in
// its own toy basket.
export function toyBasket(x, z) {
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.34, 12, 1, true), litMaterial(0xc8a678, { side: THREE.DoubleSide }));
  bowl.position.y = 0.17;
  g.add(bowl);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 12), mat(0xb89468));
  base.position.y = 0.02;
  g.add(base);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 6, 14), mat(0xb89468));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.34;
  g.add(rim);
  const balls = [0xd8504e, 0x4a8ec8, 0xe0b040];
  for (let i = 0; i < 3; i++) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 7), mat(balls[i]));
    ball.position.set(Math.sin(i * 2.1) * 0.15, 0.3 + (i % 2) * 0.11, Math.cos(i * 2.7) * 0.15);
    g.add(ball);
  }
  g.position.set(x, 0, z);
  return g;
}

// A crinkle tunnel. Open at both ends and COLLIDER-FREE on purpose: the cat
// walks through it, and world/den.js registers its middle as a `boxes` hide
// spot so "if I fits, I sits" fires inside it.
export function catTunnel(x, z, rotY = 0, len = 1.7, r = 0.36) {
  const g = new THREE.Group();
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, len, 12, 1, true),
    litMaterial(0x6a9ab8, { side: THREE.DoubleSide })
  );
  tube.rotation.z = Math.PI / 2;
  tube.position.y = r;
  g.add(tube);
  for (let i = 0; i < 4; i++) { // crinkle rings
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.02, 0.03, 5, 12), mat(0x4a7a98));
    ring.rotation.y = Math.PI / 2;
    ring.position.set(-len / 2 + (i + 0.5) * (len / 4), r, 0);
    g.add(ring);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A food bowl and a water bowl on a mat.
//
// NO WATER RECORD. The bowl is a mesh and nothing else: it is not a `puddles`
// entry and it is not a `waters` footprint (see the block at the bottom of
// this file). The den declares neither, and a 0.2m dish of water is not a
// body of water a cat can fall into — dropping one into `waters` would pull
// the whole v19 invariant set into a room that has no shoreline.
export function petBowls(x, z, rotY = 0) {
  const g = new THREE.Group();
  const mat_ = box(0.9, 0.02, 0.6, 0x6a8a9a);
  mat_.position.y = 0.012;
  g.add(mat_);
  for (const [bx, color, fill] of [[-0.22, 0xd8504e, 0xb08a58], [0.22, 0x4a8ec8, 0x8ac8e0]]) {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.13, 0.1, 12), mat(color));
    bowl.position.set(bx, 0.07, 0);
    g.add(bowl);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12), mat(fill));
    inner.position.set(bx, 0.115, 0);
    g.add(inner);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// Scattered cat toys — a couple of balls and a felt mouse. Tiny, collider-
// free, and placed off `seed` by arithmetic (no rng).
export function catToys(x, z, seed = 0) {
  const g = new THREE.Group();
  const colors = [0xd8504e, 0xe0b040, 0x4a8ec8];
  for (let i = 0; i < 2; i++) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 7), mat(colors[(seed + i) % 3]));
    ball.position.set(Math.sin(seed * 2 + i * 2.4) * 0.5, 0.09, Math.cos(seed * 3 + i * 1.7) * 0.5);
    g.add(ball);
  }
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 7), mat(0x9a9aa2));
  body.scale.set(1.5, 0.8, 1);
  body.position.set(0, 0.07, 0);
  g.add(body);
  const tail = box(0.22, 0.02, 0.02, 0xd8b0b8);
  tail.position.set(-0.2, 0.06, 0);
  tail.rotation.y = Math.sin(seed) * 0.6;
  g.add(tail);
  g.position.set(x, 0, z);
  g.rotation.y = Math.sin(seed * 1.3) * 1.2;
  return g;
}

// A paper grocery bag, tipped on its side. Cover, like cardboardBox above —
// no collider, and world/den.js registers its mouth as a `boxes` hide spot.
export function paperBag(x, z, rotY = 0) {
  const g = new THREE.Group();
  for (const [w, h, d, px, py, pz] of [
    [0.5, 0.44, 0.03, 0, 0.22, 0.22], [0.5, 0.44, 0.03, 0, 0.22, -0.22],
    [0.03, 0.44, 0.44, 0.24, 0.22, 0], [0.5, 0.03, 0.44, 0, 0.005, 0],
  ]) {
    const panel = box(w, h, d, 0xd8b688);
    panel.position.set(px, py, pz);
    g.add(panel);
  }
  const fold = box(0.5, 0.06, 0.44, 0xc8a678); // the rolled-over top edge
  fold.position.set(-0.24, 0.44, 0);
  fold.rotation.z = 0.3;
  g.add(fold);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A log basket beside a hearth: a hoop of logs, ends out.
export function logBasket(x, z) {
  const g = new THREE.Group();
  const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.36, 10, 1, true), litMaterial(0x8a6a42, { side: THREE.DoubleSide }));
  hoop.position.y = 0.18;
  g.add(hoop);
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 7), mat(i % 2 ? 0x7a5230 : 0x6a4a30));
    log.position.set(Math.sin(i * 2.2) * 0.14, 0.34 + (i % 2) * 0.1, Math.cos(i * 1.6) * 0.14);
    log.rotation.set(Math.PI / 2, Math.sin(i) * 0.4, 0);
    g.add(log);
  }
  g.position.set(x, 0, z);
  return g;
}

// =============================================================================
// WATER FOOTPRINTS — v19.
//
// Water in this game has never carried a collider: the park pond, the seaside
// sea and the Docks canal are all walk-over surfaces as shipped. A later wave
// makes them solid (and reinstates Sea Legs with them), and the one thing that
// wave must not have to do is re-derive three footprints from the mesh
// literals that draw them — a PlaneGeometry nudged half a metre would silently
// move the water out from under every invariant that depends on it.
//
// So every area that has water returns `waters`, and everything that needs to
// know where the water is reads THAT: the invariant tests in
// test/water.test.js, scent.js's buried-treat placement, and eventually the
// collider wave itself. In all three areas the mesh is now BUILT FROM the
// declaration rather than sitting beside it, so the two cannot disagree.
//
// Two footprint kinds, which between them cover all three bodies of water:
//
//   { id, kind: 'circle', x, z, r }                the park pond
//   { id, kind: 'rect', minX, maxX, minZ, maxZ }   the seaside sea — and the
//                                                  Docks canal, which is just
//                                                  a rect that happens to span
//                                                  the whole map width, i.e. a
//                                                  band
//
// A footprint may also carry `decks`: axis-aligned rectangles of DRY structure
// standing over the water — the seaside pier, the Docks' two bridges. A deck
// is how an area says "content may stand here, and a future water collider
// must leave this hole in itself". Every function below treats a point on a
// deck as dry land.
//
// All of this is plain data and pure geometry: no THREE, no renderer, so the
// world files stay unit-testable headless.
// =============================================================================

// Signed distance from (x, z) to a footprint's edge: negative inside the
// water, positive on dry land. For a rect the inside case reports the
// SHALLOWEST penetration (the nearest way out), which is what makes the
// push-out below take the short route to shore.
export function waterGap(w, x, z) {
  if (w.kind === 'circle') return Math.hypot(x - w.x, z - w.z) - w.r;
  const dx = Math.max(w.minX - x, x - w.maxX);
  const dz = Math.max(w.minZ - z, z - w.maxZ);
  if (dx > 0 || dz > 0) return Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
  return Math.max(dx, dz);
}

// Is (x, z) standing on one of this footprint's dry decks?
export function onDeck(w, x, z) {
  return (w.decks ?? []).some(
    (d) => x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ,
  );
}

// waterClearance(waters, x, z) — how far the point is from the nearest water's
// edge: positive on dry land, negative in the water, Infinity where there is
// no water to be near (an area with none, or a point standing on a deck).
export function waterClearance(waters, x, z) {
  let min = Infinity;
  for (const w of waters ?? []) {
    if (onDeck(w, x, z)) continue;
    min = Math.min(min, waterGap(w, x, z));
  }
  return min;
}

export function inWater(waters, x, z) {
  return waterClearance(waters, x, z) < 0;
}

function pushOutOf(w, x, z, margin) {
  if (w.kind === 'circle') {
    let dx = x - w.x, dz = z - w.z;
    let d = Math.hypot(dx, dz);
    if (d < 1e-6) { dx = 1; dz = 0; d = 1; } // dead-centre: fixed +x push
    const need = w.r + margin;
    return { x: w.x + (dx / d) * need, z: w.z + (dz / d) * need };
  }
  return nearestOf(x, z, [
    { x: w.minX - margin, z }, { x: w.maxX + margin, z },
    { x, z: w.minZ - margin }, { x, z: w.maxZ + margin },
  ]);
}

function clampInto(d, x, z, margin) {
  const cl = (v, lo, hi) => (lo + margin >= hi - margin
    ? (lo + hi) / 2
    : Math.min(hi - margin, Math.max(lo + margin, v)));
  return { x: cl(x, d.minX, d.maxX), z: cl(z, d.minZ, d.maxZ) };
}

function nearestOf(x, z, cands) {
  let best = cands[0];
  let bestD = Math.hypot(best.x - x, best.z - z);
  for (const c of cands) {
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

/**
 * nearestDry(waters, x, z, margin) — the closest point to (x, z) that is out
 * of every water by at least `margin`, or the point itself when it already is.
 * Pure and deterministic (no rng), because its one caller places buried treats
 * for a co-walk both clients must agree on.
 *
 * Two candidate escapes per footprint, because over a long pier the short way
 * out is not the shore:
 *   * straight out over the nearest edge of the footprint;
 *   * onto the nearest of its decks.
 * The closer candidate wins, so a treat that rolled off the seaside's pier POI
 * climbs back onto the pier instead of being flung 11m west to the sand.
 */
export function nearestDry(waters, x, z, margin = 0.6) {
  let p = { x, z };
  const list = waters ?? [];
  // A push out of one footprint can only land inside another where two bodies
  // of water touch — no area does that today, but the relaxation is two lines
  // and stops the function from silently returning a wet point if one ever does.
  for (let pass = 0; pass < 3; pass++) {
    const w = list.find((wt) => !onDeck(wt, p.x, p.z) && waterGap(wt, p.x, p.z) < margin);
    if (!w) break;
    p = nearestOf(x, z, [
      pushOutOf(w, p.x, p.z, margin),
      ...(w.decks ?? []).map((d) => clampInto(d, p.x, p.z, margin)),
    ]);
  }
  return p;
}
