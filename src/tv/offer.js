// "Use TV mode?": the question asked once when the pad is used full-screen on a
// big display (tvseam.js watchForTv decides when). It is the game's own
// "are you sure?" card (ui/confirmcard.js), so the pad's menu navigator moves
// and presses it like any card, and B is "Not now". Yes turns TV mode on;
// "Not now" is remembered for good (tvOfferDeclined). It never stays up over a
// walk: if home stops being clear the card is taken down unanswered.
// The card's maker comes in with the context (ctx.createConfirmCard): importing
// it here would pull its imports into a shared chunk and fatten start-up.
import { padLine } from './padwords.js';

const WATCH_MS = 500;

/** Shows the offer; returns { card } (the confirm card, for tests). ctx: { doc, win, settings, homeClear, enable, createConfirmCard } */
export function offer(ctx) {
  const { doc, win, settings, createConfirmCard } = ctx;
  let timer = null;
  const stop = () => { if (timer != null) { win.clearInterval(timer); timer = null; } };
  const card = createConfirmCard({
    doc,
    mount: (el) => {
      const home = doc.getElementById('homebase');
      if (home?.after) home.after(el); else doc.body.appendChild(el);
    },
    blocked: () => !ctx.homeClear(),
    onClosed: (answer) => {
      stop();
      if (answer === 'no') settings.set('tvOfferDeclined', true);
    },
  });
  const up = card.ask({
    text: padLine('pad.offer.title'),
    note: padLine('pad.offer.note'),
    yes: padLine('pad.offer.yes'),
    no: padLine('pad.offer.no'),
    onYes: () => { settings.set('tvMode', true); ctx.enable(); },
  });
  if (up) timer = win.setInterval(() => { if (!ctx.homeClear()) { stop(); card.close(); } }, WATCH_MS);
  return { card, up };
}
