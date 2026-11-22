// TV mode chunk: reached only through import('./tv/index.js') from main.js
// (src/tvseam.js has the start-up side). Everything under src/tv/ ships in
// this one lazy chunk and its own stylesheet.
import './fonts.css';
import './tv.css';
import { applyScale } from './scale.js';

/** Turns TV mode on for this page; returns { stop() } that puts everything back. */
export async function start(ctx) {
  const { doc, win } = ctx;
  const scale = applyScale(doc, win);
  doc.documentElement.classList.add('tv');
  return {
    stop() {
      doc.documentElement.classList.remove('tv');
      scale.destroy();
    },
  };
}
