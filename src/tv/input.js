// What was the last thing the player used? body[data-input] is 'pad', 'touch'
// or 'keys' (keyboard and mouse), and the hints follow it: glyphs after the pad,
// key words after the keyboard. Real events only (isTrusted), as gamepad.js
// does for the focus ring: the pad's own synthetic Enter on a map place must
// not flip the hints back to the keyboard.
import { tvHooks } from '../tvseam.js';

/** setInput(v) is told every change; returns { destroy } which gives the hooks back. */
export function createInputTracker({ win, doc, setInput, hooks = tvHooks }) {
  const body = doc.body;
  let current = null;
  const set = (v) => {
    if (v === current) return;
    current = v;
    try { body.dataset.input = v; } catch { /* no body yet */ }
    setInput?.(v);
  };
  const real = (e) => e?.isTrusted !== false;
  const onKey = (e) => { if (real(e)) set('keys'); };
  const onTouch = (e) => { if (real(e)) set('touch'); };
  const onPointer = (e) => { if (real(e)) set(e?.pointerType === 'touch' ? 'touch' : 'keys'); };
  win.addEventListener('keydown', onKey, true);
  win.addEventListener('touchstart', onTouch, true);
  win.addEventListener('pointerdown', onPointer, true);
  hooks.padUse = () => set('pad');
  set(body?.classList?.contains?.('touch-mode') ? 'touch' : 'keys');
  return {
    destroy() {
      win.removeEventListener('keydown', onKey, true);
      win.removeEventListener('touchstart', onTouch, true);
      win.removeEventListener('pointerdown', onPointer, true);
      hooks.padUse = null;
      try { delete body.dataset.input; } catch { /* gone */ }
    },
  };
}
