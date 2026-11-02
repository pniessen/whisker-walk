// The corner map: a coin-sized disc in the top-right of the walk screen.
// 2D page UI on its own <canvas>; nothing here touches the Three.js scene
// beyond reading the flat path strips once when a walk starts.
import { flatFootprints } from '../render/grass.js';
import { findTrees } from '../render/ambient.js';
import { toMap, pinToRim, mapMarkers, mapRadiusFor, faceAngle, badgeAt, clearOfBadge, BADGE_R, MARK_R } from './minimapmath.js';

const CREAM = '#f4efe4';
const RIM = 'rgba(20,26,38,0.85)';
const INK = '#2a2620';
const CAT = '#d8572a';
const GOLD = '#e8a21f';
const TEAL = '#1f9e94';
const STAR = '#6d4aa8';
const WATER = '#86bcdc';
const PATH = 'rgba(250,244,228,0.85)';
const BLOCK = 'rgba(70,60,52,0.45)';
const TREE = 'rgba(46,88,42,0.55)';
// A tree is drawn as most of its crown, not its full canopy, so a wood reads
// as trees with ground between them rather than one green blot; capped so the
// camp's great tree is not a lake of green.
const CROWN = 0.8;
const CROWN_MAX = 2.5;

// Desktop and phone diameters (CSS px). The stylesheet sets the same sizes;
// these are the fallback when the canvas has not been laid out yet.
const SIZE_DESKTOP = 150;
const SIZE_TOUCH = 110;
const RIM_W = 2;
const MIN_FRAME_MS = 1000 / 30;
const TAP_PX = 10;
const TAP_MS = 300;

// The world shapes the map draws, in metres. Built once per walk from area
// data plus the flat strips on the ground. It names only the keys below, so
// nothing hidden (golden mice, secrets, gifts, collectibles) can reach it.
export function buildMapLayer(areaData, scene) {
  const ground = '#' + (areaData.groundBounce ?? 0x6cb058).toString(16).padStart(6, '0');
  return {
    ground,
    edge: areaData.bounds,
    // Decks (the Docks' bridges, the Seaside pier) are dry crossings over
    // the water. They are raised, so flatFootprints never sees them; without
    // them the canal reads as uncrossable and the pier as open sea.
    // A rect water keeps its islands (round holes of dry ground), and a strip
    // deck (a diagonal bridge) is copied by its ends and half-width.
    water: (areaData.waters ?? []).map((w) => ({
      ...(w.kind === 'circle'
        ? { kind: 'circle', x: w.x, z: w.z, r: w.r }
        : {
          kind: 'rect', minX: w.minX, maxX: w.maxX, minZ: w.minZ, maxZ: w.maxZ,
          ...(w.islands ? { islands: w.islands.map((i) => ({ x: i.x, z: i.z, r: i.r })) } : {}),
        }),
      decks: (w.decks ?? []).map((d) => (Number.isFinite(d.x1)
        ? { kind: 'strip', x1: d.x1, z1: d.z1, x2: d.x2, z2: d.z2, halfW: d.halfW }
        : { minX: d.minX, maxX: d.maxX, minZ: d.minZ, maxZ: d.maxZ })),
    })),
    paths: flatFootprints(scene).filter((f) => f.kind === 'strip'),
    // Big colliders stand in for buildings, trees and large props; small
    // ones (bins, posts) would only be noise at this scale.
    blocks: (areaData.colliders ?? []).filter((c) => c.r >= 1).map((c) => ({ x: c.x, z: c.z, r: c.r })),
    // Trees, read off the scene (every builder.tree() tags its canopy). Their
    // trunk colliders are under the block cut, so without these the Woods,
    // the River and the park showed bare grass. A tree whose trunk is already
    // a block (the Pines' Old Ash) is left to the block.
    trees: treesFor(areaData, scene),
  };
}

function treesFor(areaData, scene) {
  if (!scene || typeof scene.traverse !== 'function') return [];
  const big = (areaData.colliders ?? []).filter((c) => c.r >= 1);
  return [...findTrees(scene), ...findPines(scene)]
    .filter((t) => !big.some((c) => Math.hypot(t.x - c.x, t.z - c.z) < 0.5))
    .map((t) => ({ x: t.x, z: t.z, r: Math.min(CROWN_MAX, t.r * CROWN) }));
}

// Pines carry no `canopy` (they shed no leaves, so findTrees leaves them for
// the ambient leaf-fall's sake). A swaying pine says its crown's radius in
// userData.mapCrown, and a merged stand lists its crowns in userData.mapCrowns
// (builder.pine / builder.pineStand), both in the object's own frame.
function findPines(scene) {
  const out = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const one = o.userData?.mapCrown;
    const many = o.userData?.mapCrowns;
    if (!(one > 0) && !Array.isArray(many)) return;
    const e = o.matrixWorld.elements;
    const s = Math.hypot(e[0], e[1], e[2]);
    if (one > 0) out.push({ x: e[12], z: e[14], r: one * s });
    if (Array.isArray(many)) {
      for (const c of many) {
        out.push({ x: e[0] * c.x + e[8] * c.z + e[12], z: e[2] * c.x + e[10] * c.z + e[14], r: c.r * s });
      }
    }
  });
  return out;
}

// A canvas ignores a numeric fillStyle and keeps the previous one, and
// coatColor hands back numbers (0x2a2a30). Each colour is turned into a CSS
// string once and remembered, so repaints build no strings.
const cssColors = new Map();
function cssColor(c) {
  if (typeof c !== 'number') return c || '#888';
  let s = cssColors.get(c);
  if (!s) {
    s = '#' + c.toString(16).padStart(6, '0');
    cssColors.set(c, s);
  }
  return s;
}

function cssSize(canvas) {
  if (canvas.clientWidth > 0) return canvas.clientWidth;
  const touch = typeof document !== 'undefined' && document.body?.classList?.contains('touch-mode');
  return touch ? SIZE_TOUCH : SIZE_DESKTOP;
}

function pixelRatio() {
  return Math.min(3, globalThis.devicePixelRatio || 1);
}

// A stable key for the marker list, rounded so sub-centimetre drift of a
// remote cat does not count as a change.
function markersKey(markers) {
  let s = '';
  for (const m of markers) {
    s += `${m.kind}:${Math.round(m.x * 20)}:${Math.round(m.z * 20)}:${m.n ?? ''}:${m.dim ? 1 : 0}:${m.filled ? 1 : 0}:${m.color ?? ''};`;
  }
  return s;
}

export function createMinimap(hostEl, { areaId, layer, mode = 'north', onToggle } = {}) {
  // The layer is fixed for the map's life: whether it has islands, once.
  const hasIslands = !!layer?.water?.some((w) => w.islands?.length);
  // Markers slid out from under the badge this paint (a few, reused).
  const slid = [{ u: 0, v: 0 }, { u: 0, v: 0 }, { u: 0, v: 0 }, { u: 0, v: 0 }, { u: 0, v: 0 }, { u: 0, v: 0 }];
  let slidCount = 0;
  const canvas = document.createElement('canvas');
  canvas.className = 'hud-map-disc';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Map');
  // #hud is pointer-events: none; the map opts back in so it can be tapped.
  canvas.style.pointerEvents = 'auto';
  hostEl.insertBefore(canvas, hostEl.firstChild);
  const ctx = canvas.getContext('2d');
  const radiusM = mapRadiusFor(areaId);

  let currentMode = mode === 'turn' ? 'turn' : 'north';
  let last = null; // what was painted: { cx, cz, heading, key, mode, size }
  let lastPaintAt = -Infinity;

  // Taps flip the mode. Every pointer event stops here so the orbit drag and
  // the joystick never see a touch that started on the map.
  let down = null;
  const stop = (e) => e.stopPropagation();
  const onDown = (e) => {
    e.stopPropagation();
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onUp = (e) => {
    e.stopPropagation();
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t <= TAP_MS;
    down = null;
    if (moved <= TAP_PX && quick) onToggle?.();
  };
  const onCancel = (e) => { e.stopPropagation(); down = null; };
  const listeners = [
    ['pointerdown', onDown], ['pointerup', onUp], ['pointercancel', onCancel],
    ['pointermove', stop], ['mousedown', stop], ['click', stop],
  ];
  for (const [type, fn] of listeners) canvas.addEventListener(type, fn);

  function paint(view, markers, size) {
    const dpr = pixelRatio();
    const px = Math.round(size * dpr);
    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    const c = size / 2;
    const radiusPx = c - RIM_W;
    const full = { ...view, mode: currentMode, radiusM, radiusPx };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, radiusPx, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, size, size);
    drawWorld(full, c);
    ctx.restore();

    slidCount = 0;
    for (const m of markers) drawMarker(m, full, c);
    drawCat(full, c);

    ctx.beginPath();
    ctx.arc(c, c, radiusPx, 0, Math.PI * 2);
    ctx.lineWidth = RIM_W;
    ctx.strokeStyle = RIM;
    ctx.stroke();
    drawBadge(full, c);
  }

  // The world shapes are drawn in metres through one transform that matches
  // toMap exactly: north mode is a plain scale (x right, z down); turn mode
  // adds a rotation by the heading, so the camera's forward points up.
  function drawWorld(view, c) {
    if (!layer) return;
    const s = view.radiusPx / view.radiusM;
    ctx.translate(c, c);
    if (view.mode === 'turn') ctx.rotate(view.heading);
    ctx.scale(s, s);
    ctx.translate(-view.cx, -view.cz);

    const e = layer.edge;
    if (e) {
      // The ground tone is laid over cream so every area stays soft and the
      // marks on top keep their contrast; beyond the edge stays plain cream.
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = layer.ground;
      ctx.fillRect(e.minX, e.minZ, e.maxX - e.minX, e.maxZ - e.minZ);
      ctx.globalAlpha = 1;
    }
    drawPaths();
    ctx.fillStyle = WATER;
    for (const w of layer.water) {
      if (w.kind === 'circle') {
        ctx.beginPath();
        ctx.arc(w.x, w.z, w.r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(w.minX, w.minZ, w.maxX - w.minX, w.maxZ - w.minZ);
      }
    }
    // Islands are land, so they are filled exactly as the land is (cream,
    // then the ground tone at half strength), after all the water so a lake
    // reads with its island in it, and before the decks so a bridge lands on
    // it. Clipped to the map's edge, past which the land stays plain cream,
    // and with the paths drawn again over them, clipped to the islands, so a
    // path across an island is not lost under its land (Polish 3).
    if (hasIslands) {
      ctx.save();
      if (e) {
        ctx.beginPath();
        ctx.rect(e.minX, e.minZ, e.maxX - e.minX, e.maxZ - e.minZ);
        ctx.clip();
      }
      for (const w of layer.water) {
        for (const i of w.islands ?? []) {
          ctx.beginPath();
          ctx.arc(i.x, i.z, i.r, 0, Math.PI * 2);
          ctx.fillStyle = CREAM;
          ctx.fill();
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = layer.ground;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      ctx.beginPath();
      for (const w of layer.water) {
        for (const i of w.islands ?? []) {
          ctx.moveTo(i.x + i.r, i.z);
          ctx.arc(i.x, i.z, i.r, 0, Math.PI * 2);
        }
      }
      ctx.clip();
      drawPaths();
      ctx.restore();
    }
    // Decks go on after all the water, in the path tone, so a crossing reads
    // as a way over. A strip deck (a diagonal bridge) is a rotated rectangle,
    // drawn like a path strip: local +y along it.
    ctx.fillStyle = PATH;
    for (const w of layer.water) {
      for (const d of w.decks ?? []) {
        if (d.kind !== 'strip') {
          ctx.fillRect(d.minX, d.minZ, d.maxX - d.minX, d.maxZ - d.minZ);
          continue;
        }
        const len = Math.hypot(d.x2 - d.x1, d.z2 - d.z1);
        ctx.save();
        ctx.translate((d.x1 + d.x2) / 2, (d.z1 + d.z2) / 2);
        ctx.rotate(Math.atan2(-(d.x2 - d.x1), d.z2 - d.z1));
        ctx.fillRect(-d.halfW, -len / 2, d.halfW * 2, len);
        ctx.restore();
      }
    }
    // Every crown in one path and one fill: the Woods' seventy trees cost the
    // map one fill call per paint.
    const trees = layer.trees ?? [];
    if (trees.length) {
      ctx.fillStyle = TREE;
      ctx.beginPath();
      for (const t of trees) {
        ctx.moveTo(t.x + t.r, t.z);
        ctx.arc(t.x, t.z, t.r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.fillStyle = BLOCK;
    for (const b of layer.blocks) {
      ctx.beginPath();
      ctx.arc(b.x, b.z, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPaths() {
    ctx.fillStyle = PATH;
    for (const p of layer.paths) {
      ctx.save();
      ctx.translate(p.x, p.z);
      // The strip's length axis is (ux, uz); rotate so local +y runs along it.
      ctx.rotate(Math.atan2(-p.ux, p.uz));
      ctx.fillRect(-p.halfW, -p.halfL, p.halfW * 2, p.halfL * 2);
      ctx.restore();
    }
  }

  function drawMarker(m, view, c) {
    // Slid along the rim out from under the N badge, which is drawn last
    // (Polish 3: the Twolegplace's post for the Moor hid there).
    const at = pinToRim(toMap(m.x, m.z, view), view.radiusPx, 6);
    const p = clearOfBadge(at, badgeAt(view), BADGE_R + MARK_R);
    // Two markers slid to the same spot beside the badge would hide one
    // another: each later one steps on round the rim, the way it leans.
    if (p !== at) {
      const r = Math.hypot(p.u, p.v);
      const b = badgeAt(view);
      const lean = (p.u - b.u) * -b.v + (p.v - b.v) * b.u >= 0 ? 1 : -1; // which side of the badge
      for (let k = 0; k < slidCount && r > 0; k++) {
        const s0 = slid[k];
        if (Math.hypot(p.u - s0.u, p.v - s0.v) >= 2 * MARK_R) continue;
        const a = Math.atan2(p.v, p.u) + lean * ((2 * MARK_R) / r);
        p.u = Math.cos(a) * r;
        p.v = Math.sin(a) * r;
        k = -1; // check them all again from the new spot
      }
      if (slidCount < slid.length) { slid[slidCount].u = p.u; slid[slidCount].v = p.v; slidCount++; }
    }
    const x = c + p.u;
    const y = c + p.v;
    ctx.save();
    if (m.kind === 'ring') {
      if (m.dim) ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = GOLD;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = 'bold 9px Avenir, "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(m.n), x, y + 0.5);
    } else if (m.kind === 'pad') {
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = GOLD;
      ctx.stroke();
    } else if (m.kind === 'quest') {
      // A drop whose point sits on the target.
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x - 7, y - 8, x - 5, y - 15, x, y - 15);
      ctx.bezierCurveTo(x + 5, y - 15, x + 7, y - 8, x, y);
      ctx.fillStyle = TEAL;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    } else if (m.kind === 'scenic') {
      starPath(x, y, 5, 2.2);
      if (m.filled) {
        ctx.fillStyle = STAR;
        ctx.fill();
      } else {
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = STAR;
        ctx.stroke();
      }
    } else if (m.kind === 'camp') {
      // A small dome with a dark door, in the clan's colour.
      ctx.beginPath();
      ctx.moveTo(x - 6, y + 4);
      ctx.arc(x, y + 4, 6, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = cssColor(m.color);
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 2, y + 4);
      ctx.arc(x, y + 4, 2, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = '#2a2018';
      ctx.fill();
    } else if (m.kind === 'post') {
      // A small brown arrow head, 9 px long and 5 wide, pointing out over the border.
      ctx.translate(x, y);
      ctx.rotate(faceAngle(m.faces, view));
      ctx.beginPath();
      ctx.moveTo(4.5, 0);
      ctx.lineTo(-4.5, -2.5);
      ctx.lineTo(-4.5, 2.5);
      ctx.closePath();
      ctx.fillStyle = '#8a6a48';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    } else if (m.kind === 'remote') {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = cssColor(m.color);
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
    ctx.restore();
  }

  function starPath(x, y, outer, inner) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? inner : outer;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  // The cat is the strongest mark: always the centre. In north mode its nose
  // follows the heading (forward is (-sin h, -cos h) in x/z, which is u/v
  // here); in turn mode forward is always up.
  function drawCat(view, c) {
    const nu = view.mode === 'turn' ? 0 : -Math.sin(view.heading);
    const nv = view.mode === 'turn' ? -1 : -Math.cos(view.heading);
    const pu = -nv; // perpendicular, for the nose's base
    const pv = nu;
    ctx.beginPath();
    ctx.moveTo(c + nu * 11, c + nv * 11);
    ctx.lineTo(c + nu * 4 + pu * 4.5, c + nv * 4 + pv * 4.5);
    ctx.lineTo(c + nu * 4 - pu * 4.5, c + nv * 4 - pv * 4.5);
    ctx.closePath();
    ctx.fillStyle = CAT;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c, c, 6, 0, Math.PI * 2);
    ctx.fillStyle = CAT;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }

  // The badge rides the rim at north's bearing: an "N" at the top in north
  // mode, and in turn mode a small arrow that swings round with the heading.
  function drawBadge(view, c) {
    const nu = view.mode === 'turn' ? Math.sin(view.heading) : 0;
    const nv = view.mode === 'turn' ? -Math.cos(view.heading) : -1;
    const at = badgeAt(view);
    const bx = c + at.u;
    const by = c + at.v;
    ctx.beginPath();
    ctx.arc(bx, by, BADGE_R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,26,38,0.85)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    if (view.mode === 'turn') {
      const pu = -nv;
      const pv = nu;
      ctx.beginPath();
      ctx.moveTo(bx + nu * 5, by + nv * 5);
      ctx.lineTo(bx - nu * 3.5 + pu * 4, by - nv * 3.5 + pv * 4);
      ctx.lineTo(bx - nu * 1.5, by - nv * 1.5);
      ctx.lineTo(bx - nu * 3.5 - pu * 4, by - nv * 3.5 - pv * 4);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.font = 'bold 10px Avenir, "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('N', bx, by + 0.5);
    }
  }

  return {
    // view = { cx, cz, heading }. Repaints only when something visible moved,
    // and no more than 30 times a second; a change that arrives too soon is
    // painted by the next call after the gap, because it is measured against
    // the last painted state.
    update(view, frame) {
      // The time gate comes first so a frame inside the gap builds no
      // markers or key. Nothing is recorded here, so a change in that frame
      // is still seen by the first call after the gap.
      const now = performance.now();
      if (now - lastPaintAt < MIN_FRAME_MS) return;
      const markers = mapMarkers(frame);
      const key = markersKey(markers);
      const size = cssSize(canvas);
      const changed = !last
        || last.mode !== currentMode
        || last.size !== size
        || last.key !== key
        || Math.hypot(view.cx - last.cx, view.cz - last.cz) > 0.05
        || Math.abs(view.heading - last.heading) > 0.01;
      if (!changed) return;
      lastPaintAt = now;
      last = { cx: view.cx, cz: view.cz, heading: view.heading, key, mode: currentMode, size };
      paint(view, markers, size);
    },
    setMode(next) { currentMode = next === 'turn' ? 'turn' : 'north'; },
    get mode() { return currentMode; },
    show() { canvas.classList.remove('hidden'); },
    hide() { canvas.classList.add('hidden'); },
    dispose() {
      for (const [type, fn] of listeners) canvas.removeEventListener(type, fn);
      canvas.remove();
    },
  };
}
