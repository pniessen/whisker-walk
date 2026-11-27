// =============================================================================
// SNOWVILLE: THE FRIENDLY STRAYS (round two). Four cats live in the village, each at its own home: a white one by the hearth, a grey one on the sled hill, a ginger one under the Great Fir and a
// tortoiseshell one on a porch step. They are the walk's ordinary strays (src/straycats.js: the strays' own seeded stream, the same friendly greet, pet and follow), only with a place, a name and a coat
// of their own (`strayHomes`; the area's `strayCap` is four, fewer on the lower rungs: game/walk.js, and the homes are taken in this order, so LOW keeps the hearth, the hill and the Great Fir).
// All four are friendly (a home turns a shy roll into bold), never on the pond's ice, the lanes, the sled run or anything solid. A line is said the first time she comes near each (both word sets:
// the same plain line, the Clan set a little flavour). Stage chunk code (snowvillestageb.js); start-up never imports it. No random number, no clock.
// =============================================================================
import { phrase } from '../clanphrases.js';
import './snowvillestrayswords.js';
import { bus } from '../events.js';
import * as P from './snowvilleplan.js';

const f = Object.freeze;
const coat = (eyes, base, belly, accent, extra = {}) => f({ eyes, base, belly, accent, scale: 1, ...extra });

export const STRAY_COATS = f({
  white: coat('persian', 0xf3f3f6, 0xffffff, 0xd6d6de, { fluffy: true, tailPlume: 1 }),
  grey: coat('siamese', 0x8b919c, 0xc6cad2, 0x5f6570, { stripes: true }),
  ginger: coat('tabby', 0xd9873a, 0xf3cf9a, 0xa65a1c, { stripes: true, headStripes: true }),
  tortoiseshell: coat('black', 0x2e2622, 0x4a3a30, 0x9c5a2c, { patch2: 0x1a1410, patches: true }),
});

// The porch: east1's step, a little to its lantern side (the cottage's own frame: door on +z, the lantern at +0.88).
const PORCH_COTTAGE = P.COTTAGES.find((c) => c.id === 'east1');
const porch = () => { const c = PORCH_COTTAGE; const lz = c.d / 2 + 1.5; const lx = 1.1; return [Math.round((c.x + lx * Math.cos(c.yaw) + lz * Math.sin(c.yaw)) * 100) / 100, Math.round((c.z - lx * Math.sin(c.yaw) + lz * Math.cos(c.yaw)) * 100) / 100]; };
const [PX, PZ] = porch();

// Where each lives: [id, x, z, roam, name, coat]. The roam is how far it strolls from its place.
export const STRAY_HOMES = f([
  f({ id: 'hearth', x: -3.9, z: 4.9, roam: 1.6, name: 'Biscuit', coat: STRAY_COATS.white }),
  f({ id: 'hill', x: 17.2, z: -12.6, roam: 2.2, name: 'Nimbus', coat: STRAY_COATS.grey }),
  f({ id: 'fir', x: 4.2, z: -33.2, roam: 1.4, name: 'Marmalade', coat: STRAY_COATS.ginger }),
  f({ id: 'porch', x: PX, z: PZ, roam: 0.9, name: 'Maple', coat: STRAY_COATS.tortoiseshell }),
]);
export const strayHomes = () => STRAY_HOMES.map((h) => ({ ...h }));
export const NOTE_RANGE = 4.5;


const SAY = f({
  hearth: () => phrase('snowville.stray.hearth'), hill: () => phrase('snowville.stray.hill'), fir: () => phrase('snowville.stray.fir'), porch: () => phrase('snowville.stray.porch'),
});

// The first time she comes near one of the four on a walk: its line, a gentle note (no points, no rule). `session.strayCats.strays` carry `homeId`.
export function createStrayNotes() {
  const said = new Set();
  return {
    update(catPos, session) {
      const list = session?.strayCats?.strays;
      if (!catPos || !list) return;
      for (const s of list) {
        if (!s.homeId || !SAY[s.homeId] || said.has(s.homeId)) continue;
        const p = s.group?.position;
        if (p && Math.hypot(p.x - catPos.x, p.z - catPos.z) <= NOTE_RANGE) {
          said.add(s.homeId);
          bus.emit('discovery', { type: 'greenhousenote', key: `snowville-stray-${s.homeId}`, label: SAY[s.homeId](), points: 0, repeat: false });
        }
      }
    },
  };
}
