import { PHRASES } from '../chat.js';

// The in-walk chat control: a 💬 button that toggles a tray of curated
// phrase/emote buttons plus a per-player mute list. Co-walk-only — main.js
// calls setVisible(true) when in a room and setVisible(false) otherwise.
export function createChatWheel(root, { onPick, getPlayers, isMuted, toggleMute }) {
  const wrap = document.createElement('div');
  wrap.className = 'chat-wheel hidden';
  wrap.innerHTML = `
    <button class="chat-toggle" type="button" aria-label="Chat">💬</button>
    <div class="chat-tray hidden" role="menu">
      <div class="chat-phrases"></div>
      <div class="chat-mutes"></div>
    </div>`;
  root.appendChild(wrap);

  const toggle = wrap.querySelector('.chat-toggle');
  const tray = wrap.querySelector('.chat-tray');
  const phrases = wrap.querySelector('.chat-phrases');
  const mutes = wrap.querySelector('.chat-mutes');

  for (const p of PHRASES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chat-phrase' + (p.kind === 'emote' ? ' chat-emote' : '');
    b.textContent = p.text;
    b.addEventListener('click', () => { onPick(p.id); closeTray(); });
    phrases.appendChild(b);
  }

  function renderMutes() {
    mutes.innerHTML = '';
    const players = (getPlayers && getPlayers()) || [];
    for (const pl of players) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'chat-mute-row';
      const muted = isMuted && isMuted(pl.id);
      row.textContent = `${muted ? '🔇' : '🔈'} ${pl.name}`;
      row.addEventListener('click', () => { toggleMute(pl.id); renderMutes(); });
      mutes.appendChild(row);
    }
  }

  function openTray() { renderMutes(); tray.classList.remove('hidden'); }
  function closeTray() { tray.classList.add('hidden'); }
  toggle.addEventListener('click', () => {
    if (tray.classList.contains('hidden')) openTray(); else closeTray();
  });

  return {
    setVisible(v) { wrap.classList.toggle('hidden', !v); if (!v) closeTray(); },
    refresh() { if (!tray.classList.contains('hidden')) renderMutes(); },
    destroy() { wrap.remove(); },
  };
}
