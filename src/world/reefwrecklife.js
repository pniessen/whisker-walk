// =============================================================================
// THE REEF, THE GALLEON'S LIFE (milestone R16). The jolly roger (ONE small mesh of 99 coloured cells, streaming from the mast's top; frozen under reduced motion,
// redrawn every other frame on the low rungs and the lite one), the journal spot (the galleon is a photo and journal subject, page 'rfgalleon', through
// `spottable`) and the three soft lines said once a walk. It never touches what she owns, draws no random number and reads no clock but the walk's own dt.
// =============================================================================
import { phrase } from '../clanphrases.js';
import * as W from './reefwreckplan.js';
import './reefwreckwords.js';
import { createReefHuntLife } from './reefhuntlive.js';

const reefY = W.topY;

const CELL_COL = Object.freeze({ '#': [0.95, 0.94, 0.9], '.': [0.09, 0.09, 0.12] });

// The flag's cloth, drawn as 99 coloured cells (two triangles each, no index) hung from the staff at (x, y, z) and streaming toward -x (the stern).
export function flagCloth() {
  const { cols, rows, w, h } = W.FLAG;
  const n = cols * rows * 6;
  const rest = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  let k = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const [cr, cg, cb] = CELL_COL[W.FLAG_CELLS[r][c]];
      const x0 = -(c / cols) * w; const x1 = -((c + 1) / cols) * w; const y0 = -(r / rows) * h; const y1 = -((r + 1) / rows) * h;
      for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y0], [x1, y1], [x0, y1]]) { rest[k * 3] = x; rest[k * 3 + 1] = y; col[k * 3] = cr; col[k * 3 + 1] = cg; col[k * 3 + 2] = cb; k++; }
    }
  }
  return { rest, col, count: n };
}
// The ripple of the cloth at a distance d from the staff (metres) and time t.
export const flagWave = (d, t) => Math.sin(d * 3.2 - t * 2.6) * 0.13 * Math.min(1, d / 0.6);

// (reef.js passes `THREE` in, so this stage chunk imports nothing of three's: see reefwreckparts.js.)
// createReefWreckLife({ scene, THREE, reducedMotion, tier, say }) -> { update(dt, t, catPos), dispose(), spottable, flag }
export function createReefWreckLife({ scene, THREE, reducedMotion = false, tier = null, say = null, progression = null, log = null, audio = null }) {
  const hunt = createReefHuntLife({ scene, THREE, progression, log, audio, say }); // the torn map, the clues and the Captain's Chest (R17)
  const { rest, col, count } = flagCloth();
  const pos = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true });
  const flag = new THREE.Mesh(geo, mat);
  flag.name = 'reef:jollyroger';
  flag.frustumCulled = false;
  Object.assign(flag.userData, { noMerge: true, noCast: true, noContactShadow: true });
  const m = W.wreckPoint(W.MAST.u, W.MAST.v);
  flag.position.set(m.x, reefY(m.x, m.z) + W.WRECK.mast + 0.65, m.z);
  const lite = tier?.name === 'lite' || tier?.name === 'low' || (tier?.rung ?? 0) >= 3;
  const shape = (clock) => {
    for (let i = 0; i < count; i++) {
      const x = rest[i * 3];
      pos[i * 3] = x;
      pos[i * 3 + 1] = rest[i * 3 + 1];
      pos[i * 3 + 2] = reducedMotion ? 0 : flagWave(-x, clock);
    }
    geo.attributes.position.needsUpdate = true;
  };
  shape(0);
  scene.add(flag);

  const spot = { type: 'rfgalleon', label: phrase('reef.wreck.galleon'), pos: new THREE.Vector3(W.GALLEON_SPOT.x, reefY(W.GALLEON_SPOT.x, W.GALLEON_SPOT.z) + 2, W.GALLEON_SPOT.z), range: W.GALLEON_SPOT.range };
  const told = new Set();
  const tell = (id, line) => { if (told.has(id)) return; told.add(id); say?.(line()); };
  let clock = 0;
  let frame = 0;
  return {
    flag,
    hunt,
    credit: (ev) => hunt.credit(ev),
    spottable: [spot],
    update(dt, t, catPos) {
      clock += dt > 0 ? Math.min(dt, 1) : 0;
      if (!reducedMotion && (!lite || (frame++ & 1) === 0)) shape(clock);
      hunt.update(dt, t, catPos);
      if (!catPos || !say) return;
      if (W.cabinInside(catPos.x, catPos.z)) tell('cabin', () => phrase('reef.wreck.cabin'));
      else if (W.deckInside(catPos.x, catPos.z)) tell('deck', () => phrase('reef.wreck.deck'));
      else if (Math.hypot(catPos.x - W.BRASS_SUIT.x, catPos.z - W.BRASS_SUIT.z) < 2.6) tell('suit', () => phrase('reef.wreck.suit'));
      void t;
    },
    dispose() { hunt.dispose(); scene.remove(flag); geo.dispose(); mat.dispose(); },
  };
}
