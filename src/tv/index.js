// TV mode chunk: reached only through import('./tv/index.js') from main.js
// (src/tvseam.js has the start-up side). Everything under src/tv/ ships in
// this one lazy chunk and its own stylesheet.
import './fonts.css';
import './tv.css';
import { applyScale } from './scale.js';
import { createInputTracker } from './input.js';
import { glyphify, plainify, padKind } from './glyphs.js';
import { setTv } from '../tvseam.js';

/** Turns TV mode on for this page; returns { stop() } that puts everything back. */
export async function start(ctx) {
  const { doc, win } = ctx;
  const scale = applyScale(doc, win);
  doc.documentElement.classList.add('tv');
  // Button pictures follow the pad in use; the last input decides when they show.
  const kind = () => padKind(ctx.padInfo?.());
  const input = createInputTracker({ win, doc, setInput: (v) => setTv({ input: v }) });
  setTv({ text: (s) => plainify(s, kind()), html: (s) => glyphify(s, kind()) });
  return {
    stop() {
      doc.documentElement.classList.remove('tv');
      input.destroy();
      scale.destroy();
      setTv({ input: 'keys', text: null, html: null, padLine: null });
    },
  };
}
