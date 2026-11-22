// Pad navigator, DOM glue (spec: docs/superpowers/specs/2026-11-21-gamepad-menus-design.md).
// Part 1: which layer owns the pad, and what in it can take focus. The pure
// direction pick lives in gamepadnavcore.js.

const LAYER = '[data-pad-layer]';
const OFF = '.hidden, [hidden], [inert]';
const FOCUSABLE = 'button, a[href], [role=button], [tabindex], summary, input[type=checkbox], input[type=radio], input[type=range], select';
const TEXTY = new Set(['input', 'textarea']);

const shown = (el) => !el.closest(OFF);

// "Last in DOM order" is safe only because home cards exclude each other (root.after inserts at the front).
// The last visible [data-pad-layer] in DOM order; else #overlay (the pause card
// and walk summaries) when it holds something; else the home base root.
export function topLayer(doc) {
  const layers = [...doc.querySelectorAll(LAYER)];
  for (let i = layers.length - 1; i >= 0; i--) if (shown(layers[i])) return layers[i];
  const overlay = doc.getElementById('overlay');
  if (overlay && shown(overlay) && overlay.children.length) return overlay;
  return doc.getElementById('homebase');
}

// Visible, enabled things inside `layer` the pad can land on, in DOM order.
export function candidates(layer) {
  return [...layer.querySelectorAll(FOCUSABLE)].filter((el) => {
    const tag = el.tagName.toLowerCase();
    if (TEXTY.has(tag) && !/^(checkbox|radio|range)$/.test(el.type)) return false;
    if (el.disabled || el.hasAttribute('disabled') || !shown(el)) return false;
    const ti = el.getAttribute('tabindex');
    if (ti !== null && Number(ti) < 0) return false; // spec: tabindex >= 0
    return true;
  });
}
