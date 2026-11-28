// The bottom rung's three helpers (render/quality.js BARE). No three import:
// the Points class is handed in, so this stays a leaf the start-up chunk can
// hold without a new three.js symbol.
//
//   wantsNoAntialias   whether the page should build its canvas without
//                      anti-aliasing (a canvas cannot change that later).
//   setBareGate        hides every pooled Points effect while on.
//   clampFog           shortens the fog's far end while on.
//
// Why a gate and not a flag in each module: sixty-odd effect modules (weather
// motes, glints, halos, fireflies, dust, confetti, sprays) each own a pooled
// Points object, and each already honours `tier.rung >= 3` in its own way.
// The Points on this rung are all cosmetic and each is a draw call, so the
// renderer is told not to draw them, in one place. The modules go on updating
// their (cheap) arrays; only the draw goes. Nothing the child needs is a
// Points object: goals, prompts, cats and people are meshes.

import { parseForcedRung, BARE_RUNG } from './quality.js';
import { MEMORY_KEY, readMemory } from './adaptive.js';
import { startRungFor } from './deviceprofile.js';

let gateOn = false;
let installed = false;

// `Points`: THREE.Points. Install once, on a walk that starts on the bottom
// rung (a Points object built before the install keeps its own plain flag and
// is hidden by the traverse below instead). Turning the gate off hands every
// object its own flag back.
export function setBareGate(Points, on, scene = null) {
  gateOn = !!on;
  if (on && Points && !installed) {
    installed = true;
    Object.defineProperty(Points.prototype, 'visible', {
      configurable: true,
      get() { return !gateOn && this._wanted !== false; },
      set(v) { this._wanted = !!v; },
    });
  }
  if (on && scene) scene.traverse((o) => { if (o.isPoints && Object.getOwnPropertyDescriptor(o, 'visible')) o.visible = false; });
}

export function bareGateOn() { return gateOn; }

// The fog never reaches past `far`; near is pulled in with it. Cheap enough to
// run every frame (two compares), so a weather change that swaps the fog for a
// new one is caught on the next frame.
export function clampFog(scene, far) {
  const fog = scene?.fog;
  if (!fog || !(far > 0) || fog.far <= far) return;
  fog.near = Math.min(fog.near, far * 0.35);
  fog.far = far;
}

// Does this page load start on the bottom rung? Read before the renderer is
// made, from the same three places the walk will read: the picker, ?rung, and
// the adapt memory (or, with none, the device table).
export function wantsNoAntialias({ search = '', storage = null, device = null } = {}) {
  try {
    const forced = parseForcedRung(search);
    if (forced != null) return forced >= BARE_RUNG;
    const text = storage?.getItem('whisker-walk-settings');
    const quality = text ? JSON.parse(text)?.quality : 'auto';
    if (quality === 'bare') return true;
    if (quality != null && quality !== 'auto') return false;
    if (storage?.getItem(MEMORY_KEY) == null) return startRungFor(device) >= BARE_RUNG;
    return readMemory(storage).rung >= BARE_RUNG;
  } catch {
    return false;
  }
}
