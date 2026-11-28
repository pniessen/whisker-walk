// TV mode chunk: reached only through import('./tv/index.js') from main.js
// (src/tvseam.js has the start-up side). Everything under src/tv/ ships in
// this one lazy chunk and its own stylesheet.
import './fonts.css';
import './tv.css';
import { applyScale } from './scale.js';
import { createInputTracker } from './input.js';
import { glyphify, plainify, padKind } from './glyphs.js';
import { escapeHtml } from '../escapehtml.js';
import { setTv, tvHooks } from '../tvseam.js';
import { forceTv } from '../profile.js';
import { openLetterPicker } from './letterpickerview.js';
import { padLine, keysToPad } from './padwords.js';
import { tvToastTiming } from './toasttime.js';
import { watchStrip } from './stripfade.js';
import { watchScrollCue } from './scrollcue.js';
export { offer } from './offer.js';

let lite = null;

/**
 * Pad hints without TV mode: the last input is tracked, and every line that names a key
 * says the pad's button instead (plain symbols, no pictures, no TV styling). A page that
 * turns TV mode on later goes through start(), which takes over from this.
 */
export function startLite(ctx) {
  const { doc, win } = ctx;
  if (lite || doc.documentElement.classList.contains('tv')) return lite;
  const kind = () => padKind(ctx.padInfo?.());
  const input = createInputTracker({ win, doc, setInput: (v) => setTv({ input: v }) });
  setTv({ text: (s) => plainify(s, kind()), html: (s) => escapeHtml(plainify(s, kind())), padLine, fix: keysToPad });
  lite = { stop() { lite = null; input.destroy(); setTv({ input: 'keys', text: null, html: null, padLine: null, fix: null }); } };
  return lite;
}

/** Turns TV mode on for this page; returns { stop() } that puts everything back. */
export async function start(ctx) {
  const { doc, win } = ctx;
  lite?.stop();
  const scale = applyScale(doc, win);
  const strip = watchStrip(doc, win);
  const cue = watchScrollCue(doc, win);
  forceTv(true, doc);
  // Button pictures follow the pad in use; the last input decides when they show.
  const kind = () => padKind(ctx.padInfo?.());
  const input = createInputTracker({ win, doc, initial: 'pad', setInput: (v) => setTv({ input: v }) });
  setTv({ text: (s) => plainify(s, kind()), html: (s) => glyphify(s, kind()), padLine, fix: keysToPad, toastTiming: tvToastTiming });
  // The letter picker, for the cat builder's name and the walking name (their views call tvHooks.picker).
  const mount = (el) => { const home = doc.getElementById('homebase'); if (home?.after) home.after(el); else doc.body.appendChild(el); };
  tvHooks.picker = (opts) => openLetterPicker({ doc, mount, ...opts });
  return {
    stop() {
      tvHooks.picker = null;
      forceTv(false, doc);
      input.destroy();
      scale.destroy();
      strip.stop();
      cue.stop();
      setTv({ input: 'keys', text: null, html: null, padLine: null, fix: null, toastTiming: null });
    },
  };
}
