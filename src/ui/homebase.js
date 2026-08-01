import { CATALOG, rankFor } from '../progression.js';
import { menuThumbnails } from '../thumbnails.js';

const LEVEL_ICON = { best: '💕', friend: '♥', met: '♡' };

const CAT_BLURBS = {
  tabby: 'Curious — sniffs out hidden treasures',
  siamese: 'Hyper — fast, loud, chases everything',
  persian: 'Lazy — naps often, loves pets',
  black: 'Brave — nothing spooks this cat',
  calico: 'Playful — pounces butterflies for points',
  mainecoon: 'Steady — big, calm, unbothered',
};
const ACC_BLURBS = {
  bell: 'Birds come closer',
  glow: 'Unlocks dusk walks with fireflies',
  bandana: 'Neighbors wave back (+points)',
  booties: 'Puddles become splash discoveries',
  backpack: 'Carry one extra collectible',
  crown: 'Butterflies trail your cat',
};

export function createHomeBase(progression, album, onStartWalk) {
  const root = document.getElementById('homebase');

  function card(kind, id, item, ownedLabel) {
    const s = progression.state;
    const owned = progression.isUnlocked(kind, id);
    const selected =
      (kind === 'cats' && s.equipped.cat === id) ||
      (kind === 'accessories' && s.equipped[item.slot] === id) ||
      (kind === 'areas' && s.area === id);
    const blurb = kind === 'cats' ? CAT_BLURBS[id] : kind === 'accessories' ? ACC_BLURBS[id] : '';
    const thumbs = menuThumbnails();
    const thumb = kind === 'cats' ? thumbs.cats[id] : kind === 'accessories' ? thumbs.accessories[id] : null;
    let action;
    if (owned) {
      action = selected
        ? `<div class="tag on">${ownedLabel}</div>` +
          (kind === 'accessories' ? `<button data-action="unequip">Take off</button>` : '')
        : `<button data-action="equip">${kind === 'areas' ? 'Walk here' : 'Choose'}</button>`;
    } else if (progression.canBuy(kind, id)) {
      action = `<button data-action="buy">Unlock — ${item.price} 🐾</button>`;
    } else {
      let need = `${item.price} 🐾`;
      if (item.requires) {
        const req = item.requires;
        need += ` · ${s.walks[req.area]}/${req.walks} walks in ${CATALOG.areas[req.area].name}`;
      }
      action = `<div class="tag">${need}</div>`;
    }
    return `<div class="card ${selected ? 'selected' : ''} ${owned ? '' : 'locked'}"
      data-kind="${kind}" data-id="${id}">
      ${thumb ? `<img class="card-thumb" src="${thumb}" alt="${item.name}">` : ''}
      <div class="card-name">${item.name}</div>
      ${blurb ? `<div class="card-sub">${blurb}</div>` : ''}
      ${action}
    </div>`;
  }

  function render() {
    const s = progression.state;
    const glowReady = s.equipped.collar === 'glow';
    const rank = rankFor(s.lifetimePoints);
    const nextLine = rank.next
      ? `next: ${Math.max(0, rank.next.at - s.lifetimePoints)} 🐾 to ${rank.next.title}`
      : 'top rank!';
    root.innerHTML = `
      <div class="homebase-scroll">
        <header class="hb-header">
          <h1>🐈 Whisker Walk</h1>
          <div class="hb-header-right">
            <div class="hb-points">🐾 ${s.points} whisker points</div>
            <div class="hb-substats">
              <span>🏆 ${rank.title} — ${nextLine}</span>
              <span>best walk: ${s.bestWalk} 🐾</span>
            </div>
          </div>
        </header>
        <section><h2>Your cat</h2><div class="cards">
          ${Object.entries(CATALOG.cats).map(([id, c]) => card('cats', id, c, 'walking today')).join('')}
        </div></section>
        <section><h2>Accessories</h2><div class="cards">
          ${Object.entries(CATALOG.accessories).map(([id, a]) => card('accessories', id, a, `on (${a.slot})`)).join('')}
        </div></section>
        <section><h2>Where to?</h2><div class="cards">
          ${Object.entries(CATALOG.areas).map(([id, a]) => card('areas', id, a, 'today’s walk')).join('')}
        </div></section>
        <section><h2>Photo album 📸</h2><div class="photos">
          ${album.photos.length
            ? album.photos.map((p) => `<figure><img src="${p.thumb}" alt="${p.label}"><figcaption>${p.label} — ${p.area}</figcaption></figure>`).join('')
            : '<div class="tag">No photos yet — press C on a walk to raise the camera!</div>'}
        </div></section>
        <section><h2>Cat friends 🐾</h2><div class="friends-list">
          ${Object.entries(s.friends).length
            ? Object.entries(s.friends)
                .sort(([, a], [, b]) => b.greets - a.greets)
                .map(([name, f]) => `<div class="friend-row">
                  <span class="friend-icon">${LEVEL_ICON[progression.friendLevel(name)] ?? '♡'}</span>
                  <span class="friend-name">${name}</span> — ${f.breed}, ${f.greets} greets
                </div>`).join('')
            : '<div class="tag">No cat friends yet — go touch noses!</div>'}
        </div></section>
        <footer class="hb-footer">
          ${glowReady ? `<label class="dusk"><input type="checkbox" id="dusk-toggle" /> Dusk walk ✨</label>` : ''}
          <button id="btn-start" class="primary">Start the walk 🐾</button>
          <button id="btn-reset" class="danger">Start over</button>
        </footer>
      </div>`;
  }

  root.addEventListener('click', (e) => {
    if (e.target.id === 'btn-start') {
      const dusk = root.querySelector('#dusk-toggle');
      onStartWalk({ duskMode: !!(dusk && dusk.checked) });
      return;
    }
    if (e.target.id === 'btn-reset') {
      if (window.confirm('Erase all progress and start over?')) {
        progression.reset();
        album.clear();
        render();
      }
      return;
    }
    const cardEl = e.target.closest('.card');
    const action = e.target.dataset.action;
    if (!cardEl || !action) return;
    const { kind, id } = cardEl.dataset;
    if (action === 'buy') progression.buy(kind, id);
    else if (action === 'unequip') progression.unequip(CATALOG.accessories[id].slot);
    else if (action === 'equip') {
      if (kind === 'cats') progression.equipCat(id);
      else if (kind === 'accessories') progression.equipAccessory(id);
      else if (kind === 'areas') progression.setArea(id);
    }
    render();
  });

  return {
    show() {
      render();
      root.classList.remove('hidden');
    },
    hide() {
      root.classList.add('hidden');
    },
  };
}
