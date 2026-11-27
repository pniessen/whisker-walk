// Holiday flair on the home screen and the Menu (docs/superpowers/specs/2026-11-27-holiday-merch-design.md, D23 to D29).
// A LAZY chunk: homebase.js imports it only while a window is open and the Settings choice is not Off, so outside the
// season nothing here is loaded. Plain DOM and CSS (its own <style>, added once), no canvas, no images. Everything is
// aria-hidden and takes no focus except the greeting, which is real text. Pink stays Start's alone.
//
// Equal treatment (D24): one strip, one greeting, one badge and one tint for each holiday, the same size and place. On the
// days two holidays overlap the home shows the NEARER one (the one whose own day is closer: Christmas is 25 Dec, Hanukkah
// its first night; a tie goes to the one that began first) and the Menu header says both, the shown one first.
import { HOLIDAY_IDS, holidayOn, holidayWindow, nightOf, hanukkahFirstNight } from '../holidays.js';

const DAY = 86400000;
const startOfDay = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

// The day a holiday is "on" for the nearer-holiday rule: Christmas Day, or Hanukkah's first night. Winter Lights has none.
function ownDay(id, year) {
  if (id === 'christmas') return new Date(year, 11, 25).getTime();
  const [y, m, d] = hanukkahFirstNight(year);
  return new Date(y, m - 1, d).getTime();
}

// Which holiday the home shows: { id, other, night }, or null (nothing in its window, or Off). `pick` is the Settings
// choice: 'auto', 'christmas', 'hanukkah' or 'off'. A chosen holiday that is not in its window falls back to Automatic.
// Winter Lights, the shared umbrella, shows only when neither Christmas nor Hanukkah is in its window.
export function pickHoliday(pick = 'auto', now = new Date()) {
  if (pick === 'off') return null;
  const on = HOLIDAY_IDS.filter((id) => id !== 'winter' && holidayOn(id, now));
  let id;
  if ((pick === 'christmas' || pick === 'hanukkah') && on.includes(pick)) id = pick;
  else if (on.length === 1) id = on[0];
  else if (on.length > 1) {
    const t = startOfDay(now), y = new Date(now).getFullYear();
    const far = (h) => Math.abs(ownDay(h, y) - t);
    const began = (h) => holidayWindow(h, y).from;
    id = [...on].sort((a, b) => far(a) - far(b) || began(a) - began(b))[0];
  } else if (holidayOn('winter', now)) id = 'winter';
  else return null;
  const other = on.find((h) => h !== id) ?? null;
  return { id, other, night: nightOf(now) };
}

// The greeting line, plain words, the same in both word sets.
export function greeting(id, night = 0) {
  if (id === 'christmas') return 'Merry Christmas! Lights are up all over.';
  if (id === 'hanukkah') return night >= 1 && night <= 8 ? `Happy Hanukkah! Tonight is night ${night}.` : 'Happy Hanukkah!';
  return 'Happy Winter Lights!';
}

// ---- the badges (one small inline SVG each; no text in them, no six-pointed star) ----
// The menorah: nine lights, the shamash higher in the middle, lit left to right, one more each night.
export function menorahSvg(night) {
  let s = '<svg viewBox="0 0 40 30" aria-hidden="true" focusable="false"><rect x="3" y="24" width="34" height="2.5" rx="1" fill="#c9d3e0"/><rect x="18.6" y="12" width="2.8" height="13" fill="#c9d3e0"/>';
  const light = (x, y, h, on) => `<rect x="${x - 0.9}" y="${y}" width="1.8" height="${h}" fill="#dfe6ee"/><ellipse cx="${x}" cy="${y - 2}" rx="1.3" ry="2.1" fill="${on ? '#ffc247' : '#6f7d94'}"/>`;
  for (let i = 0; i < 8; i++) s += light(i < 4 ? 4.5 + i * 3.4 : 24.5 + (i - 4) * 3.4, 17, 7, i < night);
  return s + light(20, 7, 5, true) + '</svg>';
}
const TREE_SVG = '<svg viewBox="0 0 40 30" aria-hidden="true" focusable="false"><path d="M12 24 20 8 28 24Z" fill="#2f7a4a"/><path d="M14 18 20 5 26 18Z" fill="#3a8a58"/><rect x="18.5" y="24" width="3" height="4" fill="#7a4e2a"/><circle cx="20" cy="14" r="1.3" fill="#f2c14e"/><circle cx="17" cy="21" r="1.2" fill="#d8303c"/><circle cx="23.5" cy="20" r="1.2" fill="#d8303c"/>'
  + '<circle cx="33" cy="20" r="5.5" fill="none" stroke="#2f7a4a" stroke-width="2.6"/><circle cx="30" cy="17" r="1.1" fill="#d8303c"/><circle cx="36" cy="22" r="1.1" fill="#d8303c"/></svg>';
const SNOW_SVG = '<svg viewBox="0 0 40 30" aria-hidden="true" focusable="false"><circle cx="20" cy="15" r="9" fill="none" stroke="#f2c14e" stroke-width="2"/><circle cx="20" cy="15" r="2.2" fill="#fff"/></svg>';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---- the styles (added once; steady lights, a slow fade under 1 Hz that stops with reduced motion) ----
export const FLAIR_CSS = `
.dr-top.hf-on { position: relative; }
.hf-strip { position: absolute; left: 0; right: 0; bottom: -9px; height: 8px; pointer-events: none; opacity: .9;
  background-size: 56px 100%; background-repeat: repeat-x; animation: hf-fade 6s ease-in-out infinite; }
html.phone .hf-strip { height: 6px; bottom: -7px; }
html.tv .hf-strip { height: calc(8px * var(--tv-s, 1)); bottom: calc(-9px * var(--tv-s, 1)); }
.hf-strip[data-hf="christmas"] { background-image: radial-gradient(circle at 12.5% 50%, #d8303c 0 2.6px, transparent 3.4px), radial-gradient(circle at 37.5% 50%, #f2c14e 0 2.6px, transparent 3.4px), radial-gradient(circle at 62.5% 50%, #3fae5e 0 2.6px, transparent 3.4px), radial-gradient(circle at 87.5% 50%, #f2c14e 0 2.6px, transparent 3.4px); }
.hf-strip[data-hf="hanukkah"] { background-image: radial-gradient(circle at 12.5% 50%, #4a7fd8 0 2.6px, transparent 3.4px), radial-gradient(circle at 37.5% 50%, #dfe6ee 0 2.6px, transparent 3.4px), radial-gradient(circle at 62.5% 50%, #2f5fb0 0 2.6px, transparent 3.4px), radial-gradient(circle at 87.5% 50%, #dfe6ee 0 2.6px, transparent 3.4px); }
.hf-strip[data-hf="winter"] { background-image: radial-gradient(circle at 12.5% 50%, #f2c14e 0 2.6px, transparent 3.4px), radial-gradient(circle at 37.5% 50%, #9ad0f0 0 2.6px, transparent 3.4px), radial-gradient(circle at 62.5% 50%, #f2ead2 0 2.6px, transparent 3.4px), radial-gradient(circle at 87.5% 50%, #9ad0f0 0 2.6px, transparent 3.4px); }
.hf-badge { display: inline-flex; align-items: center; height: 32px; padding: 0 6px; background: var(--hud); border-radius: 999px; }
.hf-badge svg { height: 26px; width: auto; display: block; }
html.phone .hf-badge { height: 28px; padding: 0 4px; }
html.phone .hf-badge svg { height: 20px; }
html.tv .hf-badge { height: calc(32px * var(--tv-s, 1)); } html.tv .hf-badge svg { height: calc(24px * var(--tv-s, 1)); }
.hf-greet { position: absolute; top: 10px; left: 12px; max-width: 46%; z-index: 1; margin: 0; padding: 3px 10px; border-radius: 999px; background: var(--hud); color: #fff;
  font-size: 13px; font-weight: 600; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
html.phone .hf-greet { max-width: calc(100% - 24px); }
html.tv .hf-greet { font-size: calc(13px * var(--tv-s, 1)); }
.dr-stage.party-on .hf-greet { display: none; }
.dr-title.hf-snow { position: relative; }
.dr-title.hf-snow::after { content: ""; position: absolute; left: 6px; top: -3px; width: 3px; height: 3px; border-radius: 50%; background: #fff;
  box-shadow: 22px 3px #fffc, 58px -1px #fff, 96px 4px #fffc, 140px 0 #fff, 7px 22px #fff8, 66px 24px #fffc, 118px 21px #fff8; opacity: .85; animation: hf-drift 6s ease-in-out infinite; pointer-events: none; }
.hf-menu > h2, #homebase .hf-menu > h2 { padding: 4px 12px; border-radius: 10px; color: #fff; }
.hf-menu[data-hf="christmas"] > h2 { background: linear-gradient(90deg, #1f5a38, #8a2230); }
.hf-menu[data-hf="hanukkah"] > h2 { background: linear-gradient(90deg, #1e3a78, #6f86b0); }
.hf-menu-line { margin: 0 0 4px; font-size: 14px; color: #f1e0c2; }
html.tv .hf-menu-line { font-size: calc(14px * var(--tv-s, 1)); }
@keyframes hf-fade { 0%, 100% { opacity: .95; } 50% { opacity: .7; } }
@keyframes hf-drift { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(2px); } }
html.hf-still .hf-strip, html.hf-still .hf-snow::after { animation: none; }
@media (prefers-reduced-motion: reduce) { .hf-strip, .hf-snow::after { animation: none; } }
`;

let styled = false;
function addStyle(doc) {
  if (styled || doc.getElementById?.('hf-style')) { styled = true; return; }
  const el = doc.createElement('style');
  el.id = 'hf-style';
  el.textContent = FLAIR_CSS;
  doc.head.appendChild(el);
  styled = true;
}

// Put the flair on whatever of home and the Menu header `root` holds now (called after every render, so it is idempotent:
// a rebuilt root has none of it yet, a root it already dressed is left alone). `reduced` freezes the lights and the snow.
export function mountFlair(root, { pick = 'auto', reduced = false, now = new Date() } = {}) {
  const doc = root?.ownerDocument;
  const hol = pickHoliday(pick, now);
  if (!doc || !hol) return false;
  addStyle(doc);
  doc.documentElement.classList.toggle('hf-still', !!reduced);
  const { id, other, night } = hol;
  const top = root.querySelector('.dr-top');
  if (top && !top.classList.contains('hf-on')) {
    top.classList.add('hf-on');
    const strip = doc.createElement('div');
    strip.className = 'hf-strip'; strip.dataset.hf = id; strip.setAttribute('aria-hidden', 'true');
    top.appendChild(strip);
    const badge = doc.createElement('span');
    badge.className = 'hf-badge'; badge.setAttribute('aria-hidden', 'true');
    badge.innerHTML = id === 'hanukkah' ? menorahSvg(night) : id === 'christmas' ? TREE_SVG : SNOW_SVG;
    top.querySelector('.dr-visit')?.after(badge) ?? top.querySelector('.hb-menu-btn')?.before(badge);
    if (id === 'winter') top.querySelector('.dr-title')?.classList.add('hf-snow');
    const stage = root.querySelector('#dr-stage');
    if (stage) {
      const p = doc.createElement('p');
      p.className = 'hf-greet'; p.textContent = greeting(id, night);
      stage.appendChild(p);
    }
  }
  const menu = root.querySelector('.hb-menu');
  if (menu && !menu.classList.contains('hf-menu')) {
    menu.classList.add('hf-menu'); menu.dataset.hf = id;
    const line = doc.createElement('p');
    line.className = 'hf-menu-line';
    line.innerHTML = esc(greeting(id, night)) + (other ? ` ${esc(greeting(other, night))}` : '');
    menu.querySelector('h2')?.after(line);
  }
  return true;
}
