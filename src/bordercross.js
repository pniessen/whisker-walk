// What a border post says and how a crossing is decided: pure functions, no
// THREE, no DOM. The walk's crossing card, the end-of-walk summary and the
// co-walk event all read these, so every device words and checks it the same.
// Place names come from placeName / TERRITORIES, never from literals.

import { placeName, isClanEdition } from './edition.js';
import { TERRITORIES, opensAfterLine } from './territories.js';
import { postsFor } from './borderposts.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const isObj = (v) => !!v && typeof v === 'object';

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// The place's name: the catalog/edition name, else the map's own territory
// (the Gorge is not in the catalog), else ''.
export function targetName(to, edition, catalog) {
  const n = placeName(to, edition, catalog);
  if (n) return n;
  const t = TERRITORIES.find((x) => x.areaId === to || x.id === to);
  return t ? t.name : '';
}

// A leading "The " reads lower-case mid-sentence.
export function lower(name) {
  return typeof name === 'string' ? name.replace(/^The /, 'the ') : '';
}

export function headTo(name) {
  return 'Head to ' + lower(name) + '?';
}

// { kind: 'go' | 'locked' | 'unexplored', to, name, line } for one post. This
// walk counts toward a gate that is in the walk's own area.
export function postStatus(post, state, catalog, fromArea) {
  const to = post && typeof post.to === 'string' ? post.to : '';
  const edition = isObj(state) ? state.edition : undefined;
  const name = targetName(to, edition, catalog);
  const areas = catalog && catalog.areas;
  if (!to || !isObj(areas) || !Object.hasOwn(areas, to)) {
    return { kind: 'unexplored', to, name, line: `${name}: not explored yet` };
  }
  const entry = areas[to];
  const unlocked = isObj(state) && isObj(state.unlocked) && Array.isArray(state.unlocked.areas) ? state.unlocked.areas : [];
  if (unlocked.includes(to)) return { kind: 'go', to, name, line: '' };
  const req = entry && entry.requires;
  if (req) {
    const walks = isObj(state) && isObj(state.walks) ? state.walks : {};
    const have = num(Object.hasOwn(walks, req.area) ? walks[req.area] : 0) + (req.area === fromArea ? 1 : 0);
    if (have < req.walks) {
      return { kind: 'locked', to, name, line: '🔒 ' + name + ' ' + opensAfterLine(req, have, edition, catalog) };
    }
  }
  const price = num(entry && entry.price);
  if (num(isObj(state) ? state.points : 0) < price) {
    return { kind: 'locked', to, name, line: `🔒 ${name} needs ${price} 🐾` };
  }
  return { kind: 'go', to, name, line: '' };
}

// The prompt line a post shows. Only a solo cat or a room's host can cross.
export function promptFor(status, { inRoom, isHost } = {}) {
  const name = status.name;
  if (status.kind === 'go') {
    if (inRoom && !isHost) return { text: `${name} is this way 🧭`, kind: 'border-info' };
    return { text: 'E — ' + headTo(name), kind: 'border' };
  }
  return { text: status.line, kind: 'border-info' };
}

export function crossCardHtml({ name, extras = [] }) {
  const lines = (Array.isArray(extras) ? extras : []).map((e) => `<p>${escapeHtml(e)}</p>`).join('');
  return `<div class="pause-card cross-card">
      <h2>${escapeHtml(headTo(name))}</h2>
      <p>This walk ends here, and you keep everything you found.</p>
      ${lines}
      <button id="btn-cross-yes" class="btn" type="button">Yes, let's go!</button>
      <button id="btn-cross-no" class="btn" type="button">Keep exploring</button>
    </div>`;
}

export function joinNames(names) {
  const a = (Array.isArray(names) ? names : []).filter((n) => typeof n === 'string' && n);
  if (a.length <= 1) return a.join('');
  return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
}

// What stops with the walk, in the order the card lists it.
export function crossExtras({ raceRunning, questActive, carried, buddyName, together } = {}) {
  const out = [];
  if (raceRunning) out.push('Your race stops here.');
  if (questActive) out.push('Your quest stops here.');
  if (carried) out.push(`The ${carried} comes home to your den.`);
  if (buddyName) out.push(`${buddyName} walks home.`);
  const names = Array.isArray(together) ? together.filter((n) => typeof n === 'string' && n) : [];
  if (names.length) out.push(`${joinNames(names)} ${names.length === 1 ? 'comes' : 'come'} too.`);
  return out;
}

// The end-of-walk half of a crossing. pickPlace is injected.
export function crossingOutcome({ crossTo, ledBy, together, clan, pickPlace, catalog, edition } = {}) {
  const name = lower(targetName(crossTo, edition, catalog));
  const picked = !!clan && typeof pickPlace === 'function' && !!pickPlace(crossTo);
  const lines = [ledBy ? `${ledBy} led the way to ${name}! 🧭` : `Next stop: ${name}! 🧭`];
  if (picked) lines.push("It's picked on your map.");
  const mates = Array.isArray(together) ? together : [];
  if (clan && mates.length) {
    lines.push(ledBy && !picked
      ? `Ask ${ledBy} to press Start on the home screen to head there together.`
      : `Walk together again from the home screen to head there with ${joinNames(mates)}.`);
  }
  return { picked, lines };
}

// A guest accepts the host's crossing only when it is well formed, for this
// walk's area and one of its posts' built targets, from the room's host.
export function decideBorderCross(ev, { areaId, selfId, remoteIds, catalog } = {}) {
  if (!isObj(ev) || ev.type !== 'border-cross' || ev.from !== areaId || typeof ev.to !== 'string') return null;
  if (!postsFor(areaId).some((p) => p.to === ev.to)) return null;
  if (!catalog || !isObj(catalog.areas) || !Object.hasOwn(catalog.areas, ev.to)) return null;
  const remotes = Array.isArray(remoteIds) ? remoteIds : [];
  if (!remotes.includes(ev.id)) return null;
  const all = [selfId, ...remotes];
  if (!all.every((i) => typeof i === 'string' || typeof i === 'number')) return null;
  if (all.some((i) => i < ev.id)) return null;
  return { to: ev.to };
}
