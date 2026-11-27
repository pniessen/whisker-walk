// A one-time ARRIVAL CARD (the Reef's pattern, world/reefguidelive.js): three short lines and an OK button in the page's own DOM (no mesh, no draw), up for 20 s of the walk, until OK, or when
// closeWhen() says the first step is done. Only the OK takes a tap: it never blocks movement. No animation or transition, so reduced motion is the same; bigger on a TV. Shared by the Crystal
// Cave, the Moon and the Greenhouse (their intro files choose the lines, the colour and the close rule). Never saved, never sent, no random number, no clock but the walk's own seconds.
import { onTv } from '../tvseam.js';

export const CARD_SECS = 20;

export function createArrivalCard({ doc, win, lines, accent, ink = 'rgba(14,24,34,.88)', closeWhen }) {
  const live = { cardOn: false };
  const els = { card: null };
  if (!doc?.body || typeof doc.createElement !== 'function' || !lines?.length) return { state: live, els, update() {}, close() {}, dispose() {} };
  const host = doc.getElementById?.('hud') ?? doc.body;
  const card = doc.createElement('div');
  Object.assign(card.style, { position: 'absolute', left: '50%', top: '22%', transform: 'translateX(-50%)', width: 'min(86vw, 26em)', boxSizing: 'border-box', textAlign: 'center', color: '#fff', background: ink, border: `2px solid ${accent}`, fontWeight: '700', pointerEvents: 'none', zIndex: '1', padding: '0.7em 1em', borderRadius: '1em', lineHeight: '1.35' });
  card.setAttribute?.('role', 'status');
  card.setAttribute?.('data-arrival-card', '1');
  lines.forEach((t, i) => { const p = doc.createElement('div'); p.textContent = t; if (i === 0) p.style.fontSize = '1.15em'; card.appendChild(p); });
  const ok = doc.createElement('button');
  Object.assign(ok.style, { pointerEvents: 'auto', marginTop: '0.5em', font: 'inherit', padding: '0.2em 1.2em', borderRadius: '1em', border: 'none', background: accent, color: '#10202c', fontWeight: '800', cursor: 'pointer' });
  ok.textContent = 'OK';
  card.appendChild(ok);
  host.appendChild(card);
  els.card = card;
  let t = 0;
  let gone = false;
  const size = () => {
    const el = doc.documentElement;
    let f = win?.innerWidth <= 520 ? 14 : 16;
    if (el?.classList?.contains?.('tv')) { let px = NaN; try { px = parseFloat(win?.getComputedStyle?.(el)?.fontSize); } catch { /* none */ } f = 28 * (Number.isFinite(px) && px > 0 ? Math.min(3, Math.max(1, px / 24)) : 1); }
    card.style.fontSize = `${f + 2}px`;
  };
  size();
  const offTv = onTv?.(size);
  const close = () => {
    if (!live.cardOn) return;
    live.cardOn = false;
    card.style.display = 'none';
  };
  ok.addEventListener?.('click', close);
  live.cardOn = true;
  return {
    state: live,
    els,
    close,
    update(dt) {
      if (!live.cardOn) return;
      t += dt > 0 ? dt : 0;
      if (t > CARD_SECS || closeWhen?.()) close();
    },
    dispose() {
      if (gone) return;
      gone = true;
      try { offTv?.(); } catch { /* none */ }
      card.remove?.();
      live.cardOn = false;
    },
  };
}
