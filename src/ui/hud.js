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
  `;
  const pointsEl = root.querySelector('#hud-points-value');
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
  };

  bus.on('discovery', ({ label, points, repeat }) => {
    api.toast(`${repeat ? 'Again — ' : 'You spotted '}${label}`, points);
  });

  return api;
}
