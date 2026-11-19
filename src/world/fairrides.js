import * as THREE from 'three';
import { box, cyl, ball, sheet, stripes, stripedSlab, sweep, placed, bulb, meshOf, canvasOf, glowMesh, recentre, BULB_COLORS } from './fairkit.js';

// =============================================================================
// THE FAIRGROUND'S FIVE RIDES (docs/superpowers/specs/2026-11-18-fairground-design.md).
//
// Step 1 builds them standing still. Step 2 makes them move, so each is built
// the way it will move:
//
//   * A ride is a Group with userData.noMerge, so render/mergeprops.js leaves
//     its parts apart.
//   * The part that TURNS is a child Group whose origin is the pivot (the
//     merry-go-round's and the teacups' centre on the ground, the big wheel's
//     hub). Step 2 only ever sets that Group's rotation.
//   * Every SEAT is a child Group of its own (a horse, a gondola, a cup, a
//     coaster car) with userData.seat: where the cat sits, in the seat's own
//     frame. A horse rises and falls by its Group's y; a gondola stays upright
//     by turning its Group against the wheel.
//
// Local frames: y up, the ride's FRONT on +z. Nothing here adds a collider,
// a perch or a point: world/fair.js owns every number a cat can stand on and
// reads the dimension tables (MGR, FERRIS, TEACUPS, HELTER, COASTER) below.
//
// Nothing is tall or dark: the big wheel is the landmark and tops out at
// 14.3 m; the coaster's hill is 6.6 m and its train is a smiling caterpillar.
// =============================================================================

const PAINT = Object.freeze({
  red: 0xe2433a, cream: 0xfbf1dc, gold: 0xf2c230, sky: 0x4fb2e6, blue: 0x2f6fc0, green: 0x55b85a,
  pink: 0xf59ac0, orange: 0xf58a2e, purple: 0x9a62d0, mint: 0x8fe0c0, white: 0xf7f4ec, wood: 0xd0a060,
  woodDark: 0x8f6a44, steel: 0xcfd6da, dark: 0x3a3440, yellow: 0xf9d648, lilac: 0xc9a8f0, peach: 0xfbc19a,
});
export const RIDE_PAINT = PAINT;

const ring = (n, fn, from = 0) => { for (let i = 0; i < n; i++) fn(from + (i / n) * Math.PI * 2, i); };

// ---- 1. the merry-go-round -----------------------------------------------------------
// The centrepiece. Twelve horses: eight on the outer ring, four on the inner.
// A horse's Group stands on the deck at its place; its pole runs down into a
// sleeve in the deck and up into the canopy, so the horse can rise and fall
// by MGR.bob either way without the pole's ends showing.
export const MGR = Object.freeze({
  baseR: 4.75, r: 4.5, deckY: 0.38, drumR: 1.0, canopyR: 5.0, canopyY: 3.7, apexY: 5.5,
  outerR: 3.45, innerR: 2.05, outer: 8, inner: 4, seatY: 1.0, bob: 0.18,
});
const COATS = Object.freeze([0xf6f1e6, 0xe9cf9a, 0xc4c9d2, 0xdcae62, 0xb9744a, 0xf6f1e6, 0x8d8a96, 0xf3dcc0]);
const TACK = Object.freeze([PAINT.red, PAINT.sky, PAINT.green, PAINT.purple, PAINT.orange, PAINT.pink, PAINT.blue, PAINT.gold]);

function horse(i, poleTop) {
  const P = [];
  const coat = COATS[i % COATS.length];
  const tack = TACK[i % TACK.length];
  const mane = i % 3 === 0 ? 0xf2c230 : i % 3 === 1 ? 0x6b4a34 : 0xf7f4ec;
  // body, neck, head
  ball(P, 0.34, 0, 0.66, 0, coat, { detail: 1, sx: 0.86, sy: 0.84, sz: 1.62 });
  box(P, 0.22, 0.5, 0.3, 0, 0.96, 0.45, coat, { c: true, pitch: 0.7 });
  box(P, 0.2, 0.26, 0.46, 0, 1.2, 0.72, coat, { c: true, pitch: 0.75 });
  box(P, 0.21, 0.06, 0.14, 0, 1.1, 0.84, tack, { c: true, pitch: 0.5 });       // noseband
  for (const s of [-1, 1]) {
    box(P, 0.05, 0.12, 0.05, s * 0.07, 1.38, 0.6, coat, { c: true });           // ears
    box(P, 0.03, 0.04, 0.03, s * 0.105, 1.26, 0.7, 0x2a2228, { c: true });        // eyes
    // legs: the front pair reaching forward, the hind pair kicked back
    box(P, 0.13, 0.52, 0.13, s * 0.14, 0.3, 0.42, coat, { c: true, pitch: -0.55 });
    box(P, 0.13, 0.52, 0.13, s * 0.14, 0.28, -0.44, coat, { c: true, pitch: 0.5 });
    box(P, 0.14, 0.08, 0.15, s * 0.14, 0.07, 0.56, 0x3a3440, { c: true, pitch: -0.55 });
    box(P, 0.14, 0.08, 0.15, s * 0.14, 0.05, -0.56, 0x3a3440, { c: true, pitch: 0.5 });
  }
  box(P, 0.07, 0.5, 0.2, 0, 1.04, 0.3, mane, { c: true, pitch: 0.7 });          // mane
  box(P, 0.12, 0.5, 0.14, 0, 0.58, -0.64, mane, { c: true, pitch: -0.5 });       // tail
  // saddle and its cloth: the top of the saddle is the seat
  box(P, 0.5, 0.04, 0.6, 0, 0.9, -0.02, tack);
  box(P, 0.34, 0.06, 0.4, 0, 0.94, -0.02, 0x7a4a30);
  box(P, 0.34, 0.1, 0.06, 0, 0.97, -0.24, 0x7a4a30);
  // the pole, through the withers
  cyl(P, 0.035, 0.035, poleTop + 0.25, 0, -0.25, 0.14, PAINT.gold, { sides: 6 });
  const m = meshOf(P, 'mgrHorseBody', { roughness: 0.55 });
  return m;
}

export function merryGoRound(x, z, glow) {
  const g = new THREE.Group();
  g.name = 'merryGoRound';
  g.userData.noMerge = true;
  g.position.set(x, 0, z);

  // the part that stays put: a low painted plinth
  const B = [];
  stripes(B, MGR.baseR, 0, MGR.baseR - 0.06, 0.22, [PAINT.red, PAINT.cream], 0, 0, 0, { sides: 32 });
  cyl(B, MGR.baseR - 0.06, MGR.baseR - 0.06, 0.02, 0, 0.2, 0, PAINT.gold, { sides: 32 });
  g.add(meshOf(B, 'mgrBase', { roughness: 0.7 }));

  const turn = new THREE.Group();
  turn.name = 'mgrTurn';
  g.add(turn);

  const P = [];
  // the deck: boards, with a painted ring
  cyl(P, MGR.r, MGR.r, MGR.deckY - 0.22, 0, 0.22, 0, PAINT.wood, { sides: 32 });
  stripes(P, MGR.r - 0.05, MGR.deckY + 0.004, MGR.r - 0.5, MGR.deckY + 0.004, [PAINT.red, PAINT.gold], 0, 0, 0, { sides: 32 });
  stripes(P, 1.9, MGR.deckY + 0.004, 1.25, MGR.deckY + 0.004, [PAINT.sky, PAINT.cream], 0, 0, 0, { sides: 16 });
  // the drum in the middle: painted panels with a gold frame and little mirrors
  stripes(P, MGR.drumR, MGR.deckY, MGR.drumR, MGR.canopyY - 0.1, [PAINT.cream, PAINT.sky, PAINT.cream, PAINT.pink], 0, 0, 0, { sides: 12 });
  cyl(P, MGR.drumR + 0.12, MGR.drumR + 0.12, 0.18, 0, MGR.deckY, 0, PAINT.gold, { sides: 12 });
  cyl(P, MGR.drumR + 0.1, MGR.drumR + 0.1, 0.12, 0, 2.5, 0, PAINT.gold, { sides: 12 });
  cyl(P, MGR.drumR + 0.3, MGR.drumR + 0.08, 0.34, 0, MGR.canopyY - 0.44, 0, PAINT.red, { sides: 12 });
  ring(12, (a) => {
    box(P, 0.26, 0.5, 0.04, Math.cos(a) * (MGR.drumR - 0.01), 1.55, Math.sin(a) * (MGR.drumR - 0.01), 0xbfe6f4, { c: true, yaw: Math.PI / 2 - a });
  }, Math.PI / 12);
  // the canopy's ribs and its rim board
  ring(8, (a) => {
    box(P, MGR.canopyR - MGR.drumR, 0.08, 0.1, Math.cos(a) * (MGR.canopyR + MGR.drumR) / 2, MGR.canopyY - 0.08, Math.sin(a) * (MGR.canopyR + MGR.drumR) / 2, PAINT.cream, { c: true, yaw: -a });
  });
  stripes(P, MGR.canopyR + 0.02, MGR.canopyY - 0.42, MGR.canopyR + 0.02, MGR.canopyY + 0.02, [PAINT.gold, PAINT.red], 0, 0, 0, { sides: 32 });
  // sleeves where the poles come up through the deck
  const places = [];
  ring(MGR.outer, (a, i) => places.push({ a, r: MGR.outerR, i }));
  ring(MGR.inner, (a, i) => places.push({ a, r: MGR.innerR, i: MGR.outer + i }), Math.PI / 4);
  for (const h of places) cyl(P, 0.06, 0.07, 0.42, Math.cos(h.a) * h.r + 0.14 * -Math.sin(h.a), MGR.deckY, Math.sin(h.a) * h.r + 0.14 * Math.cos(h.a), PAINT.red, { sides: 6 });
  // the finial: a gold ball and a pennant pole
  ball(P, 0.26, 0, MGR.apexY + 0.1, 0, PAINT.gold, { detail: 1 });
  cyl(P, 0.03, 0.03, 0.9, 0, MGR.apexY + 0.3, 0, PAINT.cream, { sides: 5 });
  box(P, 0.5, 0.26, 0.02, 0.27, MGR.apexY + 0.9, 0, PAINT.red);
  turn.add(meshOf(P, 'mgrDeck', { roughness: 0.6 }));

  // the canopy: striped canvas, scalloped at the rim
  const C = [];
  stripes(C, MGR.canopyR, MGR.canopyY, 0, MGR.apexY, [PAINT.red, PAINT.cream], 0, 0, 0, { sides: 16 });
  stripes(C, MGR.canopyR + 0.03, MGR.canopyY - 0.42, MGR.canopyR + 0.03, MGR.canopyY - 0.42, [PAINT.cream, PAINT.red], 0, 0, 0, { sides: 32, scallop: 0.26 });
  turn.add(canvasOf(C, 'mgrCanopy'));

  const L = [];
  ring(32, (a, i) => bulb(L, Math.cos(a) * (MGR.canopyR + 0.1), MGR.canopyY - 0.2, Math.sin(a) * (MGR.canopyR + 0.1), BULB_COLORS[i % 2]));
  ring(12, (a, i) => bulb(L, Math.cos(a) * (MGR.drumR + 0.2), 2.66, Math.sin(a) * (MGR.drumR + 0.2), BULB_COLORS[i % BULB_COLORS.length]));
  turn.add(glowMesh(L, 'mgrBulbs', glow));

  const horses = [];
  for (const h of places) {
    const hg = new THREE.Group();
    hg.name = 'mgrHorse' + h.i;
    hg.position.set(Math.cos(h.a) * h.r, MGR.deckY, Math.sin(h.a) * h.r);
    // facing the way the ride turns (the angle grows): local +z along the tangent
    hg.rotation.y = -h.a;
    hg.userData.seat = { x: 0, y: MGR.seatY, z: 0 };
    hg.userData.place = { angle: h.a, radius: h.r, phase: (h.i * 2.4) % (Math.PI * 2) };
    // the pole stops a little under the canvas, with room to rise
    const canvasY = MGR.canopyY + (MGR.apexY - MGR.canopyY) * (1 - h.r / MGR.canopyR);
    hg.add(horse(h.i, canvasY - MGR.deckY - MGR.bob - 0.12));
    turn.add(hg);
    horses.push(hg);
  }
  return { group: g, turn, horses };
}

// The music box behind the merry-go-round: a little painted organ. Its drum
// (musicBoxDrum, pivot on its own axle along x) is what turns.
export const MUSIC_BOX = Object.freeze({ w: 1.5, h: 1.0, d: 0.8, drumY: 0.78 });
export function musicBox(x, z, yaw = 0) {
  const g = new THREE.Group();
  g.name = 'musicBox';
  g.userData.noMerge = true;
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  const P = [];
  const { w, h, d } = MUSIC_BOX;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(P, 0.16, 0.16, 0.08, sx * 0.55, 0.16, sz * 0.36, PAINT.gold, { c: true, roll: Math.PI / 2, sides: 10 });
  box(P, w, h - 0.2, d, 0, 0.2, 0, PAINT.red);
  box(P, w + 0.08, 0.08, d + 0.08, 0, h, 0, PAINT.gold);
  box(P, w - 0.2, 0.5, 0.03, 0, 0.42, d / 2 + 0.01, PAINT.cream);
  // a row of organ pipes on top, tallest in the middle
  for (let i = -3; i <= 3; i++) cyl(P, 0.06, 0.06, 0.62 - Math.abs(i) * 0.09, i * 0.17, h + 0.08, -0.12, i % 2 ? PAINT.gold : PAINT.sky, { sides: 7 });
  // the crank on its side
  box(P, 0.24, 0.05, 0.05, w / 2 + 0.12, 0.72, 0, PAINT.dark, { c: true });
  box(P, 0.05, 0.22, 0.05, w / 2 + 0.24, 0.62, 0, PAINT.dark, { c: true });
  g.add(meshOf(P, 'musicBoxBody', { roughness: 0.55 }));
  const D = [];
  cyl(D, 0.15, 0.15, 0.9, 0, 0, 0, PAINT.gold, { c: true, roll: Math.PI / 2, sides: 10 });
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39;
    box(D, 0.04, 0.05, 0.04, -0.4 + i * 0.1, Math.cos(a) * 0.16, Math.sin(a) * 0.16, PAINT.dark, { c: true });
  }
  const drum = meshOf(D, 'musicBoxDrum', { roughness: 0.4 });
  drum.position.set(0, MUSIC_BOX.drumY, d / 2 + 0.2);
  g.add(drum);
  return { group: g, drum };
}

// ---- 2. the big wheel ------------------------------------------------------------------
// The wheel stands in the xy plane and turns about z. `ferrisTurn`'s origin
// is the hub. Gondola i hangs from the rim at angle -PI/2 + i * 2PI/8 (0 is
// the one at the bottom, at the boarding deck); its Group's origin is the bar
// it hangs from, so turning the Group by minus the wheel's angle keeps it
// upright. The lookout stands behind the wheel (-z), level with the floor of
// the gondola at the top.
export const FERRIS = Object.freeze({
  hubY: 8.0, R: 6.3, half: 0.9, frameZ: 1.5, legX: 4.4, gondolas: 8, seatDrop: 1.34,
  deckY: 0.4, deckZ: 1.6, deckW: 3.2, deckD: 1.4,
  topY: 13.0, mastZ: -2.95, platZ: -2.3, platW: 1.8, platD: 1.3,
});
const GONDOLA_COLORS = Object.freeze([PAINT.red, PAINT.yellow, PAINT.sky, PAINT.green, PAINT.orange, PAINT.purple, PAINT.pink, PAINT.mint]);

function gondola(i) {
  const P = [];
  const c = GONDOLA_COLORS[i % GONDOLA_COLORS.length];
  const floor = -FERRIS.seatDrop;
  // the tub: a floor and four low sides, open above them so the cat is seen
  box(P, 1.2, 0.06, 1.2, 0, floor - 0.06, 0, 0x6b5a4a);
  for (const s of [-1, 1]) {
    box(P, 0.06, 0.4, 1.2, s * 0.6, floor - 0.06, 0, c);
    box(P, 1.26, 0.4, 0.06, 0, floor - 0.06, s * 0.6, c, { shade: 0.92 });
    box(P, 1.3, 0.05, 0.08, 0, floor + 0.34, s * 0.6, PAINT.cream);
    // the hangers, from the tub's ends up to the bar
    box(P, 0.05, FERRIS.seatDrop - 0.32, 0.05, 0, floor + 0.34, s * 0.62, PAINT.cream);
  }
  // a little round roof
  cyl(P, 0.12, 0.86, 0.26, 0, -0.42, 0, c, { sides: 10 });
  ball(P, 0.07, 0, -0.14, 0, PAINT.gold);
  return meshOf(P, 'gondolaBody', { roughness: 0.55 });
}

export function ferrisWheel(x, z, glow, yaw = 0) {
  const g = new THREE.Group();
  g.name = 'ferrisWheel';
  g.userData.noMerge = true;
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  const { hubY, R, half, frameZ, legX } = FERRIS;

  // the frame that stays put
  const F = [];
  const legLen = Math.hypot(legX, hubY);
  const legAng = Math.atan2(hubY, legX);
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      box(F, legLen, 0.22, 0.22, sx * legX / 2, hubY / 2, sz * frameZ, PAINT.white, { c: true, roll: -sx * legAng });
      box(F, 0.7, 0.14, 0.7, sx * legX, 0, sz * frameZ, PAINT.blue);
    }
    box(F, legX * 2, 0.12, 0.14, 0, 0.14, sz * frameZ, PAINT.white);
    // a tie half way up
    box(F, legX, 0.12, 0.12, 0, hubY / 2, sz * frameZ, PAINT.white, { c: true });
  }
  cyl(F, 0.2, 0.2, frameZ * 2 + 0.5, 0, hubY, 0, PAINT.steel, { c: true, pitch: Math.PI / 2, sides: 10 });
  for (const sz of [-1, 1]) cyl(F, 0.5, 0.5, 0.12, 0, hubY, sz * (frameZ + 0.18), PAINT.red, { c: true, pitch: Math.PI / 2, sides: 12 });
  // the boarding deck in front, and its step
  box(F, FERRIS.deckW, FERRIS.deckY, FERRIS.deckD, 0, 0, FERRIS.deckZ, PAINT.wood);
  box(F, FERRIS.deckW + 0.06, 0.06, 0.08, 0, FERRIS.deckY - 0.06, FERRIS.deckZ + FERRIS.deckD / 2, PAINT.yellow);
  box(F, 1.8, 0.2, 0.45, 0, 0, FERRIS.deckZ + FERRIS.deckD / 2 + 0.22, PAINT.woodDark);
  for (const sx of [-1, 1]) {
    box(F, 0.08, 1.0, 0.08, sx * (FERRIS.deckW / 2 - 0.06), FERRIS.deckY, FERRIS.deckZ + FERRIS.deckD / 2 - 0.06, PAINT.red);
    ball(F, 0.09, sx * (FERRIS.deckW / 2 - 0.06), FERRIS.deckY + 1.06, FERRIS.deckZ + FERRIS.deckD / 2 - 0.06, PAINT.gold);
  }
  // the lookout behind the wheel: a mast, a small railed platform level with
  // the top gondola's floor, and a pennant
  const { topY, mastZ, platZ, platW, platD } = FERRIS;
  box(F, 0.3, topY - 0.12, 0.3, 0, 0, mastZ, PAINT.white);
  for (let y = 0.8; y < topY - 0.4; y += 0.8) box(F, 0.5, 0.05, 0.05, 0, y, mastZ + 0.17, PAINT.red, { c: true });
  box(F, 0.9, 0.2, 0.9, 0, 0, mastZ, PAINT.blue);
  box(F, 0.14, 0.14, Math.abs(mastZ) - frameZ, 0, hubY - 0.07, (mastZ - frameZ) / 2, PAINT.white);
  box(F, platW, 0.12, platD, 0, topY - 0.12, platZ, PAINT.wood);
  for (const sx of [-1, 1]) {
    for (const pz of [platZ - platD / 2 + 0.05, platZ + platD / 2 - 0.05]) box(F, 0.06, 0.8, 0.06, sx * (platW / 2 - 0.05), topY, pz, PAINT.red);
    box(F, 0.05, 0.05, platD, sx * (platW / 2 - 0.05), topY + 0.78, platZ, PAINT.gold);
    // braces under the platform
    box(F, 0.06, 1.1, 0.06, sx * 0.45, topY - 0.62, platZ + 0.1, PAINT.white, { c: true, roll: sx * 0.75 });
  }
  box(F, platW, 0.05, 0.05, 0, topY + 0.78, platZ - platD / 2 + 0.05, PAINT.gold);
  cyl(F, 0.03, 0.03, 1.9, 0, topY, mastZ, PAINT.cream, { sides: 5 });
  box(F, 0.7, 0.34, 0.02, 0.38, topY + 1.5, mastZ, PAINT.red);
  g.add(meshOf(F, 'ferrisFrame', { roughness: 0.6 }));

  // the wheel
  const turn = new THREE.Group();
  turn.name = 'ferrisTurn';
  turn.position.set(0, hubY, 0);
  g.add(turn);
  const W = [];
  const SEG = 24;
  const chord = 2 * R * Math.sin(Math.PI / SEG) + 0.05;
  for (const sz of [-1, 1]) {
    ring(SEG, (a) => {
      box(W, 0.2, chord, 0.14, Math.cos(a) * R * Math.cos(Math.PI / SEG), Math.sin(a) * R * Math.cos(Math.PI / SEG), sz * half, PAINT.blue, { c: true, roll: a });
    }, Math.PI / SEG);
    ring(16, (a, i) => {
      box(W, R - 0.3, 0.09, 0.07, Math.cos(a) * (R + 0.3) / 2, Math.sin(a) * (R + 0.3) / 2, sz * (half - 0.04), i % 2 ? PAINT.yellow : PAINT.red, { c: true, roll: a });
    });
    // an inner ring, so the wheel reads as a wheel and not a star
    ring(16, (a) => {
      const r2 = R * 0.52;
      box(W, 0.1, 2 * r2 * Math.sin(Math.PI / 16) + 0.03, 0.07, Math.cos(a) * r2 * Math.cos(Math.PI / 16), Math.sin(a) * r2 * Math.cos(Math.PI / 16), sz * (half - 0.04), PAINT.red, { c: true, roll: a });
    }, Math.PI / 16);
  }
  cyl(W, 0.62, 0.62, half * 2 + 0.3, 0, 0, 0, PAINT.red, { c: true, pitch: Math.PI / 2, sides: 14 });
  cyl(W, 0.3, 0.3, half * 2 + 0.36, 0, 0, 0, PAINT.gold, { c: true, pitch: Math.PI / 2, sides: 10 });
  ring(FERRIS.gondolas, (a) => box(W, 0.07, 0.07, half * 2 + 0.1, Math.cos(a) * R, Math.sin(a) * R, 0, PAINT.steel, { c: true }), -Math.PI / 2);
  turn.add(meshOf(W, 'ferrisRim', { roughness: 0.5 }));

  const L = [];
  ring(40, (a, i) => bulb(L, Math.cos(a) * (R + 0.02), Math.sin(a) * (R + 0.02), half + 0.1, BULB_COLORS[i % 2], 0.085));
  ring(16, (a, i) => { for (const k of [0.3, 0.52, 0.76]) bulb(L, Math.cos(a) * R * k, Math.sin(a) * R * k, half + 0.03, BULB_COLORS[(i + 2) % BULB_COLORS.length], 0.07); });
  turn.add(glowMesh(L, 'ferrisBulbs', glow));

  const gondolas = [];
  ring(FERRIS.gondolas, (a, i) => {
    const gg = new THREE.Group();
    gg.name = 'gondola' + i;
    gg.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    gg.userData.seat = { x: 0, y: -FERRIS.seatDrop, z: 0 };
    gg.userData.place = { angle: a };
    gg.add(gondola(i));
    turn.add(gg);
    gondolas.push(gg);
  }, -Math.PI / 2);
  return { group: g, turn, gondolas };
}

// ---- 3. the teacups ----------------------------------------------------------------------
// `teacupsTurn` is the floor, turning about its centre with the big teapot in
// the middle; each cup is a Group on it that spins about its own middle.
export const TEACUPS = Object.freeze({ baseR: 4.95, r: 4.6, deckY: 0.26, cups: 6, cupR: 3.05, seatY: 0.4, cupTop: 0.92 });
const CUP_COLORS = Object.freeze([PAINT.pink, PAINT.mint, PAINT.yellow, PAINT.sky, PAINT.lilac, PAINT.peach]);

function teacup(i) {
  const P = [];
  const c = CUP_COLORS[i % CUP_COLORS.length];
  cyl(P, 1.12, 1.0, 0.07, 0, 0, 0, PAINT.white, { sides: 16 });                       // saucer
  cyl(P, 1.12, 1.12, 0.012, 0, 0.07, 0, c, { sides: 16 });
  cyl(P, 0.96, 0.6, 0.85, 0, 0.07, 0, c, { sides: 14, open: true });                   // the cup
  cyl(P, 0.93, 0.6, 0.82, 0, 0.1, 0, PAINT.white, { sides: 14, open: true, inside: true }); // and its inside
  cyl(P, 0.985, 0.965, 0.05, 0, 0.88, 0, PAINT.gold, { sides: 14, open: true });       // a gold rim
  cyl(P, 0.72, 0.72, 0.03, 0, TEACUPS.seatY - 0.03, 0, 0xe9d8c0, { sides: 14 });       // the seat
  // spots round the cup
  ring(5, (a) => ball(P, 0.12, Math.cos(a) * 0.79, 0.56, Math.sin(a) * 0.79, PAINT.white, { sy: 1.1 }), i * 0.4);
  // the handle
  box(P, 0.36, 0.08, 0.1, 1.08, 0.72, 0, c, { c: true });
  box(P, 0.08, 0.4, 0.1, 1.24, 0.52, 0, c, { c: true });
  box(P, 0.4, 0.08, 0.1, 0.98, 0.3, 0, c, { c: true });
  return meshOf(P, 'teacupBody', { roughness: 0.4 });
}

export function teacups(x, z, glow, yaw = 0) {
  const g = new THREE.Group();
  g.name = 'teacups';
  g.userData.noMerge = true;
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  const { baseR, r, deckY } = TEACUPS;
  // the kerb and a low rail round it, open at the front (+z)
  const B = [];
  stripes(B, baseR, 0, baseR - 0.05, 0.16, [PAINT.sky, PAINT.cream], 0, 0, 0, { sides: 32 });
  stripes(B, baseR - 0.05, 0.16, r - 0.02, 0.16, [PAINT.cream], 0, 0, 0, { sides: 32 });
  const POSTS = 18;
  for (let i = 0; i < POSTS; i++) {
    const a = Math.PI / 2 + 0.34 + (i / (POSTS - 1)) * (Math.PI * 2 - 0.68);
    box(B, 0.08, 0.72, 0.08, Math.cos(a) * (baseR - 0.1), 0.14, Math.sin(a) * (baseR - 0.1), i % 2 ? PAINT.pink : PAINT.cream);
    box(B, 0.13, 0.1, 0.13, Math.cos(a) * (baseR - 0.1), 0.86, Math.sin(a) * (baseR - 0.1), PAINT.gold);
    if (i < POSTS - 1) {
      const b = a + (Math.PI * 2 - 0.68) / (POSTS - 1);
      const mx = (Math.cos(a) + Math.cos(b)) / 2 * (baseR - 0.1);
      const mz = (Math.sin(a) + Math.sin(b)) / 2 * (baseR - 0.1);
      const len = Math.hypot(Math.cos(b) - Math.cos(a), Math.sin(b) - Math.sin(a)) * (baseR - 0.1);
      box(B, len, 0.06, 0.05, mx, 0.74, mz, PAINT.cream, { c: true, yaw: -Math.atan2(Math.sin(b) - Math.sin(a), Math.cos(b) - Math.cos(a)) });
    }
  }
  g.add(meshOf(B, 'teacupsBase', { roughness: 0.6 }));

  const turn = new THREE.Group();
  turn.name = 'teacupsTurn';
  g.add(turn);
  const P = [];
  cyl(P, r, r, deckY - 0.12, 0, 0.12, 0, PAINT.cream, { sides: 32 });
  // the floor, painted like a tablecloth in wedges
  stripes(P, r - 0.04, deckY + 0.004, 0, deckY + 0.004, [PAINT.pink, PAINT.cream, PAINT.mint, PAINT.cream], 0, 0, 0, { sides: 24 });
  // the big teapot in the middle
  cyl(P, 1.0, 1.1, 0.14, 0, deckY, 0, PAINT.gold, { sides: 16 });
  ball(P, 1.0, 0, deckY + 0.95, 0, PAINT.white, { detail: 2, sy: 0.86 });
  cyl(P, 1.02, 1.02, 0.16, 0, deckY + 0.86, 0, PAINT.sky, { sides: 20, open: true });
  ring(8, (a) => ball(P, 0.11, Math.cos(a) * 0.93, deckY + 1.3, Math.sin(a) * 0.93, PAINT.pink, { sy: 0.6 }));
  cyl(P, 0.5, 0.56, 0.1, 0, deckY + 1.74, 0, PAINT.sky, { sides: 14 });
  ball(P, 0.16, 0, deckY + 1.96, 0, PAINT.gold, { detail: 1 });
  box(P, 0.26, 0.26, 0.9, 0, deckY + 1.1, 1.15, PAINT.white, { c: true, pitch: -0.6 });      // spout
  box(P, 0.3, 0.3, 0.14, 0, deckY + 1.38, 1.56, PAINT.sky, { c: true, pitch: -0.6 });
  box(P, 0.14, 0.14, 0.5, 0, deckY + 1.34, -1.1, PAINT.white, { c: true });                  // handle
  box(P, 0.14, 0.7, 0.14, 0, deckY + 0.98, -1.34, PAINT.white, { c: true });
  box(P, 0.14, 0.14, 0.5, 0, deckY + 0.62, -1.1, PAINT.white, { c: true });
  turn.add(meshOf(P, 'teacupsDeck', { roughness: 0.45 }));
  const L = [];
  ring(16, (a, i) => bulb(L, Math.cos(a) * 1.16, deckY + 0.2, Math.sin(a) * 1.16, BULB_COLORS[i % BULB_COLORS.length]));
  ring(24, (a, i) => bulb(L, Math.cos(a) * (r - 0.12), deckY + 0.06, Math.sin(a) * (r - 0.12), BULB_COLORS[i % 2]));
  turn.add(glowMesh(L, 'teacupsBulbs', glow));

  const cups = [];
  ring(TEACUPS.cups, (a, i) => {
    const cg = new THREE.Group();
    cg.name = 'teacup' + i;
    cg.position.set(Math.cos(a) * TEACUPS.cupR, deckY, Math.sin(a) * TEACUPS.cupR);
    cg.rotation.y = i * 1.1;
    cg.userData.seat = { x: 0, y: TEACUPS.seatY, z: 0 };
    cg.userData.place = { angle: a, radius: TEACUPS.cupR };
    cg.add(teacup(i));
    turn.add(cg);
    cups.push(cg);
  }, Math.PI / 6);
  return { group: g, turn, cups };
}

// ---- 4. the helter-skelter ------------------------------------------------------------------
// A striped tower with its stairs inside and its slide winding down the
// outside. The door is on +z. Local numbers a cat stands on:
//   HELTER.stairs   the landings inside, bottom to top, [x, y, z]
//   HELTER.top      the gallery at the top of the slide
//   helterSlidePath()  the slide's centre line, top to bottom, as local points
export const HELTER = Object.freeze((() => {
  const baseR = 2.2;
  const topR = 1.45;
  const towerH = 7.0;
  const stairR = 0.85;
  const stairs = [];
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 2 + i * 1.3;
    stairs.push(Object.freeze([Math.round(Math.cos(a) * stairR * 100) / 100, 1.2 * (i + 1), Math.round(Math.sin(a) * stairR * 100) / 100]));
  }
  return {
    baseR, topR, towerH, stairR, galleryR: 2.0, roofY: 8.6, apexY: 10.1, doorHalf: 0.34, doorH: 1.7,
    stairs: Object.freeze(stairs),
    // the slide: it starts at the gallery and runs 2.25 turns down, the angle
    // growing, to end 1.6 rad short of the door, then straight out
    slide: Object.freeze({ fromY: 6.8, toY: 0.42, turns: 2.25, endA: Math.PI / 2 - 1.6, out: 0.95, runOut: 2.3, endY: 0.14, half: 0.46 }),
    top: Object.freeze([-0.86, towerH, -1.47]),
  };
})());
const towerR = (y) => HELTER.baseR + (HELTER.topR - HELTER.baseR) * Math.min(1, Math.max(0, y / HELTER.towerH));

export function helterSlidePath(step = 0.25) {
  const s = HELTER.slide;
  const total = s.turns * Math.PI * 2;
  const pts = [];
  const n = Math.ceil(total / (step / 2.6));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = s.endA - total * (1 - t);
    const y = s.fromY + (s.toY - s.fromY) * t;
    const r = towerR(y) + s.out;
    pts.push({ x: Math.cos(a) * r, y, z: Math.sin(a) * r });
  }
  // straight out along the tangent, easing down to the mat
  const r = towerR(s.toY) + s.out;
  const tx = -Math.sin(s.endA);
  const tz = Math.cos(s.endA);
  const m = Math.ceil(s.runOut / step);
  for (let i = 1; i <= m; i++) {
    const d = (i / m) * s.runOut;
    const k = i / m;
    pts.push({ x: Math.cos(s.endA) * r + tx * d, y: s.toY + (s.endY - s.toY) * (k * (2 - k)), z: Math.sin(s.endA) * r + tz * d });
  }
  return pts;
}

export function helterSkelter(x, z, glow, yaw = 0) {
  const { baseR, topR, towerH, galleryR, roofY, apexY, doorHalf, doorH } = HELTER;
  const set = (o) => { o.position.set(x, 0, z); o.rotation.y = yaw; return o; };

  // The tower: canvas-striped, seen from inside too. It is the part that
  // fades when the camera's view of a cat on the stairs runs through it.
  const tower = set(new THREE.Group());
  tower.name = 'helterSkelter';
  const T = [];
  const SIDES = 20;
  const doorA = Math.PI / 2;
  const rDoor = towerR(doorH);
  stripes(T, baseR, 0, rDoor, doorH, [PAINT.red, PAINT.cream], 0, 0, 0, { sides: SIDES - 2, from: doorA + doorHalf, to: doorA + Math.PI * 2 - doorHalf });
  stripes(T, rDoor, doorH, topR, towerH, [PAINT.red, PAINT.cream], 0, 0, 0, { sides: SIDES, from: doorA + doorHalf, to: doorA + doorHalf + Math.PI * 2 });
  tower.add(canvasOf(T, 'helterTower'));
  const S = [];
  // the door's frame and a star over it
  const dw = Math.sin(doorHalf) * baseR;
  const dz = Math.cos(doorHalf) * baseR;
  for (const s of [-1, 1]) box(S, 0.14, doorH, 0.14, s * dw, 0, dz - 0.04, PAINT.gold);
  box(S, dw * 2 + 0.3, 0.16, 0.16, 0, doorH, dz - 0.12, PAINT.gold);
  box(S, 0.4, 0.4, 0.06, 0, doorH + 0.5, towerR(doorH + 0.5) - 0.02, PAINT.yellow, { c: true, roll: Math.PI / 4 });
  // a skirt board round the foot
  stripes(S, baseR + 0.04, 0, baseR + 0.02, 0.3, [PAINT.blue], 0, 0, 0, { sides: SIDES - 2, from: doorA + doorHalf, to: doorA + Math.PI * 2 - doorHalf });
  // the gallery: a floor, a rail, and the lantern's posts
  cyl(S, galleryR, topR + 0.05, 0.14, 0, towerH - 0.14, 0, PAINT.blue, { sides: 20 });
  const slideA = HELTER.slide.endA - HELTER.slide.turns * Math.PI * 2;
  ring(14, (a) => {
    // no rail where the slide leaves
    let d = (a - slideA) % (Math.PI * 2);
    if (d < 0) d += Math.PI * 2;
    if (d < 0.5 || d > Math.PI * 2 - 0.35) return;
    box(S, 0.06, 0.8, 0.06, Math.cos(a) * (galleryR - 0.08), towerH, Math.sin(a) * (galleryR - 0.08), PAINT.cream);
    const b = a + (Math.PI * 2) / 14;
    box(S, 0.05, 0.05, 2 * (galleryR - 0.08) * Math.sin(Math.PI / 14) + 0.04, Math.cos(a + Math.PI / 14) * (galleryR - 0.08) * Math.cos(Math.PI / 14), towerH + 0.78,
      Math.sin(a + Math.PI / 14) * (galleryR - 0.08) * Math.cos(Math.PI / 14), PAINT.gold, { c: true, yaw: -(a + b) / 2 });
  });
  ring(6, (a) => box(S, 0.1, roofY - towerH, 0.1, Math.cos(a) * 1.3, towerH, Math.sin(a) * 1.3, PAINT.cream), 0.3);
  tower.add(meshOf(S, 'helterTrim', { roughness: 0.6 }));
  tower.userData.fadeOccluder = [{ t: 'cyl', r: baseR + 0.3, y0: 0, y1: towerH - 0.3 }];

  // The roof, on its own so it can fade for a cat on the gallery.
  const roof = set(new THREE.Group());
  roof.name = 'helterRoof';
  const R = [];
  stripes(R, 1.95, roofY, 0, apexY, [PAINT.sky, PAINT.yellow], 0, 0, 0, { sides: 12 });
  stripes(R, 1.97, roofY, 1.97, roofY, [PAINT.yellow, PAINT.sky], 0, 0, 0, { sides: 12, scallop: 0.28 });
  roof.add(canvasOf(R, 'helterRoofCanvas'));
  const RF = [];
  ball(RF, 0.18, 0, apexY + 0.08, 0, PAINT.gold, { detail: 1 });
  cyl(RF, 0.03, 0.03, 1.0, 0, apexY + 0.2, 0, PAINT.cream, { sides: 5 });
  box(RF, 0.6, 0.3, 0.02, 0.32, apexY + 0.86, 0, PAINT.red);
  roof.add(meshOf(RF, 'helterFinial', { roughness: 0.5 }));
  roof.userData.fadeOccluder = [{ t: 'cyl', r: 2.0, y0: roofY - 0.3, y1: apexY }];

  // The stairs inside, a mesh of its own OUTSIDE the tower's Group: they stay
  // solid when the tower fades, so a climbing cat is seen standing on steps.
  const ST = [];
  cyl(ST, 0.12, 0.14, towerH - 0.2, 0, 0, 0, PAINT.woodDark, { sides: 8 });
  HELTER.stairs.forEach(([sx, sy, sz], i) => {
    const a = Math.atan2(sz, sx);
    box(ST, 0.95, 0.1, 0.8, sx, sy - 0.1, sz, PAINT.wood, { yaw: Math.PI / 2 - a, shade: 0.92 + 0.04 * (i % 2) });
    // two steps leading up to it from the landing below
    for (const k of [1, 2]) {
      const b = a - (1.3 * k) / 3;
      box(ST, 0.3, 0.06, 0.8, Math.cos(b) * 0.8, sy - 0.06 - 0.4 * k, Math.sin(b) * 0.8, PAINT.woodDark, { yaw: Math.PI / 2 - b });
    }
  });
  const stairs = set(meshOf(ST, 'helterStairs', { roughness: 0.8 }));

  // The slide: a yellow chute with blue sides, on brackets, ending on a mat.
  const path = helterSlidePath(0.3);
  const C = [];
  const h = HELTER.slide.half;
  sweep(C, path, [[-h - 0.06, 0.3], [-h, 0], [h, 0], [h + 0.06, 0.3]], PAINT.yellow, { colors: [PAINT.blue, PAINT.yellow, PAINT.blue] });
  const slide = set(canvasOf(C, 'helterSlide'));
  slide.material.roughness = 0.45;
  const BR = [];
  for (let i = 6; i < path.length - 10; i += 9) {
    const p = path[i];
    const a = Math.atan2(p.z, p.x);
    const rIn = towerR(p.y) - 0.05;
    const rOut = Math.hypot(p.x, p.z);
    box(BR, rOut - rIn, 0.07, 0.07, Math.cos(a) * (rIn + rOut) / 2, p.y - 0.06, Math.sin(a) * (rIn + rOut) / 2, PAINT.cream, { c: true, yaw: -a });
  }
  // the mat at the bottom
  const end = path[path.length - 1];
  const prev = path[path.length - 4];
  box(BR, 1.3, 0.1, 1.5, end.x + (end.x - prev.x) * 0.9, 0, end.z + (end.z - prev.z) * 0.9, PAINT.green, { yaw: Math.atan2(end.x - prev.x, end.z - prev.z) });
  const brackets = set(meshOf(BR, 'helterBrackets', { roughness: 0.7 }));
  // The slide winds round the tower just where the follow camera sits when
  // she is on the stairs inside, so it fades too: for a camera in among its
  // coils, or looking through them at her. (While she is ON the slide
  // src/fairlive.js holds it solid: `fadeHold`, src/treefade.js.)
  const coil = [{ t: 'cyl', r: baseR + HELTER.slide.out + HELTER.slide.half + 0.2, y0: 0.9, y1: towerH }];
  slide.userData.fadeOccluder = coil;
  slide.userData.noMerge = true;
  brackets.userData.fadeOccluder = coil;
  brackets.userData.noMerge = true;

  const L = [];
  ring(12, (a, i) => bulb(L, Math.cos(a) * 2.02, roofY + 0.04, Math.sin(a) * 2.02, BULB_COLORS[i % 2]));
  for (let i = 4; i < path.length - 8; i += 5) {
    const p = path[i];
    const k = (Math.hypot(p.x, p.z) + h + 0.1) / Math.hypot(p.x, p.z);
    bulb(L, p.x * k, p.y + 0.36, p.z * k, BULB_COLORS[(i / 5) % BULB_COLORS.length | 0]);
  }
  const bulbs = set(glowMesh(L, 'helterBulbs', glow));
  return { tower, roof, stairs, slide, brackets, bulbs };
}

// ---- 5. the caterpillar coaster ---------------------------------------------------------------
// The track is a closed curve through `controls` ([x, y, z] in WORLD
// coordinates, y the top of the rails), sampled every `step` metres along its
// length. Plain numbers, no THREE: fair.js exports the result.
export const COASTER = Object.freeze({ gauge: 0.42, step: 0.75, carGap: 1.55, cars: 4, seatY: 0.56, postEvery: 5 });

export function coasterTrackPoints(controls, step = COASTER.step) {
  const n = controls.length;
  const cr = (p0, p1, p2, p3, t) => {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
  const fine = [];
  const SUB = 40;
  for (let i = 0; i < n; i++) {
    const [a, b, c, d] = [controls[(i - 1 + n) % n], controls[i], controls[(i + 1) % n], controls[(i + 2) % n]];
    for (let k = 0; k < SUB; k++) fine.push([0, 1, 2].map((q) => cr(a[q], b[q], c[q], d[q], k / SUB)));
  }
  const lens = [0];
  for (let i = 1; i <= fine.length; i++) {
    const p = fine[i - 1];
    const q = fine[i % fine.length];
    lens.push(lens[i - 1] + Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]));
  }
  const length = lens[fine.length];
  const count = Math.round(length / step);
  const points = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const s = (i / count) * length;
    while (lens[j + 1] < s) j++;
    const p = fine[j];
    const q = fine[(j + 1) % fine.length];
    const t = (s - lens[j]) / (lens[j + 1] - lens[j] || 1);
    points.push(Object.freeze({
      x: Math.round((p[0] + (q[0] - p[0]) * t) * 1000) / 1000,
      y: Math.round((p[1] + (q[1] - p[1]) * t) * 1000) / 1000,
      z: Math.round((p[2] + (q[2] - p[2]) * t) * 1000) / 1000,
    }));
  }
  return Object.freeze({ points: Object.freeze(points), length: Math.round(length * 1000) / 1000, step: length / count, closed: true });
}

// Where the track is, `s` metres along it from points[0]: the point and the
// unit direction of travel. `s` wraps.
export function trackPose(track, s) {
  const n = track.points.length;
  const u = ((s % track.length) + track.length) % track.length / track.step;
  const i = Math.floor(u) % n;
  const t = u - Math.floor(u);
  const a = track.points[i];
  const b = track.points[(i + 1) % n];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const l = Math.hypot(dx, dy, dz) || 1;
  return { x: a.x + dx * t, y: a.y + dy * t, z: a.z + dz * t, tx: dx / l, ty: dy / l, tz: dz / l };
}

// Sets a car's Group on the track at `s`: on the rails, nose along the track.
export function setOnTrack(group, track, s) {
  const p = trackPose(track, s);
  group.position.set(p.x, p.y, p.z);
  group.rotation.set(-Math.asin(Math.max(-1, Math.min(1, p.ty))), Math.atan2(p.tx, p.tz), 0, 'YXZ');
  return p;
}

export function coasterTrack(track, { skip = () => false } = {}) {
  const pts = track.points;
  const P = [];
  const g = COASTER.gauge;
  // two rails and a spine under them
  const rail = (c) => [[c - 0.05, -0.09], [c - 0.05, 0], [c + 0.05, 0], [c + 0.05, -0.09]];
  sweep(P, pts, rail(-g), PAINT.red, { closed: true });
  sweep(P, pts, rail(g), PAINT.red, { closed: true });
  sweep(P, pts, [[-0.1, -0.16], [-0.1, -0.36], [0.1, -0.36], [0.1, -0.16]], PAINT.yellow, { closed: true });
  const S = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const p = pts[i];
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const pitch = -Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z));
    if (i % 2 === 0) box(S, g * 2 + 0.2, 0.08, 0.16, p.x, p.y - 0.125, p.z, PAINT.white, { c: true, yaw, pitch });
    if (i % COASTER.postEvery !== 0 || skip(p)) continue;
    const top = p.y - 0.36;
    if (top < 0.25) continue;
    if (top > 2.6) {
      // a tall support: two legs spread to a wide foot, with a tie
      placed(S, p.x, 0, p.z, yaw, (Q) => {
        const spread = 0.16 * top;
        const len = Math.hypot(top, spread);
        for (const s of [-1, 1]) box(Q, 0.14, len, 0.14, s * spread / 2, top / 2, 0, PAINT.white, { c: true, roll: s * Math.atan2(spread, top) });
        box(Q, spread * 1.1 + 0.14, 0.1, 0.1, 0, top * 0.45, 0, PAINT.sky, { c: true });
        for (const s of [-1, 1]) box(Q, 0.4, 0.1, 0.4, s * spread, 0, 0, PAINT.sky);
      });
    } else {
      box(S, 0.16, top, 0.16, p.x, 0, p.z, PAINT.white, { yaw });
      box(S, 0.4, 0.1, 0.4, p.x, 0, p.z, PAINT.sky, { yaw });
    }
  }
  const rails = canvasOf(P, 'coasterRails');
  rails.material.roughness = 0.5;
  return { rails, supports: meshOf(S, 'coasterSupports', { roughness: 0.6 }) };
}

// One car of the caterpillar. Local frame: the rails' top at y 0, nose on +z.
function coasterCar(i, n) {
  const P = [];
  const green = i % 2 ? 0x8fd64a : 0x5fbf4c;
  const head = i === 0;
  // wheels and a chassis
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(P, 0.13, 0.13, 0.08, sx * COASTER.gauge, 0.13, sz * 0.4, PAINT.dark, { c: true, roll: Math.PI / 2, sides: 8 });
  box(P, 0.7, 0.1, 1.2, 0, 0.16, 0, PAINT.dark);
  // the body: a fat round segment with a seat scooped out of its top
  ball(P, 0.66, 0, 0.52, 0, green, { detail: 1, sx: 0.92, sy: 0.62, sz: 1.06 });
  box(P, 0.74, 0.3, 0.74, 0, COASTER.seatY - 0.3, 0, 0x3f8a3a);
  cyl(P, 0.5, 0.5, 0.02, 0, COASTER.seatY, 0, 0xf2e3b8, { sides: 12 });
  // a rim round the seat so the cat sits IN it
  ring(8, (a) => box(P, 0.46, 0.2, 0.1, Math.cos(a) * 0.56, COASTER.seatY - 0.02, Math.sin(a) * 0.56, green, { yaw: Math.PI / 2 - a, shade: 1.08 }));
  // spots and little feet
  for (const s of [-1, 1]) {
    ball(P, 0.13, s * 0.56, 0.6, 0.18, PAINT.yellow, { sx: 0.4 });
    for (const fz of [-0.34, 0.34]) ball(P, 0.11, s * 0.58, 0.14, fz, PAINT.orange);
  }
  if (head) {
    // a big smiling head out in front
    ball(P, 0.52, 0, 0.74, 0.86, 0x7ad04e, { detail: 2 });
    for (const s of [-1, 1]) {
      ball(P, 0.14, s * 0.2, 0.92, 1.26, PAINT.white, { detail: 1 });
      ball(P, 0.07, s * 0.2, 0.93, 1.37, 0x2a2228);
      ball(P, 0.1, s * 0.36, 0.66, 1.2, PAINT.pink, { sz: 0.5 });                    // rosy cheeks
      cyl(P, 0.025, 0.025, 0.42, s * 0.18, 1.2, 0.84, 0x3f8a3a, { sides: 5, roll: -s * 0.3 });
      ball(P, 0.08, s * 0.31, 1.62, 0.84, PAINT.red);                               // antennae
    }
    // the smile: three short strokes in a curve
    box(P, 0.2, 0.04, 0.04, 0, 0.6, 1.37, 0x2a2228, { c: true });
    for (const s of [-1, 1]) box(P, 0.12, 0.04, 0.04, s * 0.14, 0.63, 1.34, 0x2a2228, { c: true, roll: s * 0.5 });
  } else if (i === n - 1) {
    ball(P, 0.3, 0, 0.5, -0.78, green, { detail: 1 });
    ball(P, 0.16, 0, 0.56, -1.06, PAINT.yellow);
  }
  return meshOf(P, 'coasterCarBody', { roughness: 0.5 });
}

// The train, standing at the station with its head at `s0` along the track.
export function coasterTrain(track, s0) {
  const g = new THREE.Group();
  g.name = 'coasterTrain';
  g.userData.noMerge = true;
  const cars = [];
  for (let i = 0; i < COASTER.cars; i++) {
    const c = new THREE.Group();
    c.name = 'coasterCar' + i;
    c.userData.seat = { x: 0, y: COASTER.seatY, z: 0 };
    c.userData.behind = i * COASTER.carGap; // metres behind the head car, along the track
    setOnTrack(c, track, s0 - i * COASTER.carGap);
    c.add(coasterCar(i, COASTER.cars));
    g.add(c);
    cars.push(c);
  }
  return { group: g, cars };
}

// The station: a deck beside the rails with steps up from the plaza side, and
// a striped roof over deck and track. All in WORLD coordinates; the track runs
// along z at x = trackX. `r` = { minX, maxX, minZ, maxZ } is the deck.
export const STATION = Object.freeze({ deckY: 0.85, roofY: 3.5, stepW: 2.4 });
export function coasterStation(r, trackX, glow) {
  const { deckY, roofY } = STATION;
  const cx = (r.minX + r.maxX) / 2;
  const cz = (r.minZ + r.maxZ) / 2;
  const w = r.maxX - r.minX;
  const d = r.maxZ - r.minZ;
  const P = [];
  box(P, w, deckY - 0.06, d, cx, 0, cz, PAINT.sky, { shade: 0.9 });
  box(P, w + 0.1, 0.06, d + 0.1, cx, deckY - 0.06, cz, PAINT.wood);
  box(P, 0.2, 0.02, d, r.maxX - 0.12, deckY, cz, PAINT.yellow);
  // two steps up from the west
  box(P, 0.5, deckY * 0.66, STATION.stepW, r.minX - 0.25, 0, cz, PAINT.woodDark);
  box(P, 0.5, deckY * 0.33, STATION.stepW, r.minX - 0.75, 0, cz, PAINT.woodDark);
  // a rail along the west edge, either side of the steps
  for (let z = r.minZ + 0.1; z <= r.maxZ - 0.05; z += 1.0) {
    if (Math.abs(z - cz) < STATION.stepW / 2 + 0.1) continue;
    box(P, 0.07, 0.8, 0.07, r.minX + 0.06, deckY, z, PAINT.red);
  }
  for (const s of [-1, 1]) {
    const len = d / 2 - STATION.stepW / 2 - 0.1;
    box(P, 0.05, 0.06, len, r.minX + 0.06, deckY + 0.78, cz + s * (STATION.stepW / 2 + 0.1 + len / 2), PAINT.gold);
  }
  // the roof's posts: along the deck's west edge and beyond the track
  const eastX = trackX + 1.35;
  for (const z of [r.minZ + 0.15, cz - 1.6, cz + 1.6, r.maxZ - 0.15]) {
    box(P, 0.14, roofY - deckY, 0.14, r.minX + 0.2, deckY, z, PAINT.white);
    box(P, 0.14, roofY, 0.14, eastX, 0, z, PAINT.white);
  }
  const deck = meshOf(P, 'coasterStation', { roughness: 0.65 });
  // the roof, a mesh of its own: it fades when it hides the cat on the deck
  const C = [];
  const rw = eastX - r.minX + 1.0;
  const rcx = (eastX + r.minX) / 2;
  placed(C, rcx, roofY, cz, Math.PI / 2, (Q) => stripedSlab(Q, d + 0.9, 0.1, rw, [PAINT.green, PAINT.cream], 0, 0, 0, { n: 14 }));
  // a scalloped edge along both long sides
  const nsc = 20;
  for (const ex of [rcx - rw / 2, rcx + rw / 2]) {
    for (let i = 0; i < nsc; i++) {
      const z0 = cz - (d + 0.9) / 2 + (i / nsc) * (d + 0.9);
      const z1 = z0 + (d + 0.9) / nsc;
      sheet(C, [[ex, roofY, z0], [ex, roofY, z1], [ex, roofY - 0.3, (z0 + z1) / 2]], i % 2 ? PAINT.cream : PAINT.green);
    }
  }
  // the sign on the roof's plaza side: the caterpillar's face
  const sx = rcx - rw / 2 + 0.3;
  cyl(C, 0.9, 0.9, 0.1, sx, roofY + 1.0, cz, 0x7ad04e, { c: true, roll: Math.PI / 2, sides: 18 });
  for (const s of [-1, 1]) {
    ball(C, 0.2, sx - 0.06, roofY + 1.2, cz + s * 0.32, PAINT.white, { detail: 1, sx: 0.5 });
    ball(C, 0.09, sx - 0.14, roofY + 1.2, cz + s * 0.32, 0x2a2228, { sx: 0.6 });
    ball(C, 0.14, sx - 0.05, roofY + 0.86, cz + s * 0.56, PAINT.pink, { sx: 0.4 });
    box(C, 0.04, 0.5, 0.04, sx, roofY + 2.0, cz + s * 0.3, 0x3f8a3a, { c: true, pitch: s * 0.3 });
    ball(C, 0.1, sx, roofY + 2.28, cz + s * 0.38, PAINT.red);
  }
  box(C, 0.05, 0.06, 0.5, sx - 0.08, roofY + 0.72, cz, 0x2a2228, { c: true });
  for (const s of [-1, 1]) {
    box(C, 0.05, 0.06, 0.2, sx - 0.08, roofY + 0.77, cz + s * 0.32, 0x2a2228, { c: true, pitch: -s * 0.5 });
    box(C, 0.1, 0.9, 0.1, sx + 0.02, roofY + 0.1, cz + s * 0.5, PAINT.white, { c: false });
  }
  const roof = recentre(canvasOf(C, 'coasterStationRoof'), rcx, cz);
  roof.userData.fadeOccluder = [{ t: 'cyl', r: Math.max(rw, d) / 2 + 0.3, y0: roofY - 0.4, y1: roofY + 0.4 }];
  const L = [];
  for (const ex of [rcx - rw / 2 - 0.03, rcx + rw / 2 + 0.03]) {
    for (let i = 0; i <= 14; i++) bulb(L, ex, roofY + 0.02, cz - (d + 0.9) / 2 + (i / 14) * (d + 0.9), BULB_COLORS[i % 2]);
  }
  return { deck, roof, bulbs: glowMesh(L, 'coasterBulbs', glow) };
}
