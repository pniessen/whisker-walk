import { bus } from '../events.js';

export function createHud() {
  const root = document.getElementById('hud');
  root.innerHTML = `
    <div class="hud-top">
      <div class="hud-points">🐾 <span id="hud-points-value">0</span></div>
      <div class="hud-area" id="hud-area"></div>
    </div>
    <div class="hud-objective hidden" id="hud-objective"></div>
    <div class="hud-toasts" id="hud-toasts"></div>
    <div class="hud-prompt hidden" id="hud-prompt"></div>
    <div class="hud-crosshair">·</div>
    <div class="hud-viewfinder hidden" id="hud-viewfinder"><span>📷 click to snap · C to lower</span></div>
    <div class="hud-catdot hidden" id="hud-catdot"><span class="hud-catdot-arrow" id="hud-catdot-arrow">➤</span>🐾</div>
  `;
  const pointsEl = root.querySelector('#hud-points-value');
  const catdotEl = root.querySelector('#hud-catdot');
  const catdotArrowEl = root.querySelector('#hud-catdot-arrow');
  const areaEl = root.querySelector('#hud-area');
  const toastsEl = root.querySelector('#hud-toasts');
  const promptEl = root.querySelector('#hud-prompt');

  const api = {
    show() { root.classList.remove('hidden'); },
    hide() { root.classList.add('hidden'); },
    setPoints(n) { pointsEl.textContent = String(n); },
    setArea(name) { areaEl.textContent = name; },
    setPrompt(text) {
      promptEl.classList.toggle('hidden', !text);
      if (text) promptEl.textContent = text;
    },
    toast(text, points) {
      const el = document.createElement('div');
      el.className = 'toast';
      el.textContent = points ? `${text}  +${points} 🐾` : text;
      toastsEl.appendChild(el);
      setTimeout(() => el.classList.add('fade'), 2600);
      setTimeout(() => el.remove(), 3400);
    },
    setObjective(text) {
      const el = root.querySelector('#hud-objective');
      el.classList.toggle('hidden', !text);
      if (text) el.textContent = text;
    },
    setCamera(on) {
      root.querySelector('#hud-viewfinder').classList.toggle('hidden', !on);
    },
    setCatIndicator(ind) {
      catdotEl.classList.toggle('hidden', !ind);
      if (ind) {
        catdotEl.style.left = `${ind.leftPct}%`;
        catdotEl.style.top = `${ind.topPct}%`;
        catdotArrowEl.style.transform = `rotate(${ind.rotDeg}deg)`;
      }
    },
  };

  bus.on('discovery', ({ label, points, repeat }) => {
    api.toast(`${repeat ? 'Again — ' : 'You spotted '}${label}`, points);
  });

  return api;
}
