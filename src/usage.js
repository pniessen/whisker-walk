// Usage counts: how often each part of the home screen gets opened, so the
// grown-up who maintains the game can see which features the kids use.
//
//   state.usage = { [id]: { n, last } }
//     n     how many times it was opened
//     last  the visit number (state.visits) of the latest open
//
// It lives in the save and nowhere else: nothing is sent anywhere new (the
// counts travel with a cloud save only because the whole save does). An id
// never opened has no entry. Pure helpers; progression.js owns the save and
// the one verb (noteUse).

// Every home sheet, plus the two parts of the dressing room that are not
// sheets. Walks are not counted here: state.walks already counts them.
export const USAGE_IDS = Object.freeze([
  'menu', 'places', 'together', 'colony', 'journal', 'album', 'skills', 'controls',
  'settings', 'sync', 'code', 'dressup', 'builder',
]);
export const USAGE_NAME = Object.freeze({
  menu: 'Menu', places: 'Change place', together: 'Play together', colony: 'Colony', journal: 'Journal',
  album: 'Album', skills: 'Skills', controls: 'Sound & controls', settings: 'Game settings',
  sync: 'Cloud save', code: 'Secret code', dressup: 'Dress up', builder: 'Cat builder',
});
export const USAGE_MAX = 1e6;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const whole = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(USAGE_MAX, Math.floor(v)) : 0);

// A save read from disk or the cloud is outside data: known ids only, whole
// numbers within bounds, and nothing kept for an id never opened.
export function sanitizeUsage(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const id of USAGE_IDS) {
    const e = Object.hasOwn(raw, id) ? raw[id] : null;
    if (!isObj(e)) continue;
    const n = whole(e.n);
    if (n > 0) out[id] = { n, last: whole(e.last) };
  }
  return out;
}

// One more open of `id` on visit `visit` → a new usage object, or the same
// one when the id is not one we count.
export function bumpUsage(usage, id, visit) {
  if (!USAGE_IDS.includes(id)) return usage;
  const cur = Object.hasOwn(usage, id) ? usage[id] : { n: 0, last: 0 };
  return { ...usage, [id]: { n: Math.min(USAGE_MAX, cur.n + 1), last: whole(visit) } };
}

// Loading a cloud save: counts never go down, so each id keeps the larger of
// this device's and the loaded save's.
export function mergeUsage(a, b) {
  const out = {};
  for (const id of USAGE_IDS) {
    const x = Object.hasOwn(a, id) ? a[id] : null;
    const y = Object.hasOwn(b, id) ? b[id] : null;
    if (x || y) out[id] = { n: Math.max(x?.n ?? 0, y?.n ?? 0), last: Math.max(x?.last ?? 0, y?.last ?? 0) };
  }
  return out;
}

// Every counted id, most used first (ties in USAGE_IDS order), never-opened
// ones included with n 0.
export function usageRows(usage) {
  return USAGE_IDS
    .map((id, i) => ({ id, i, name: USAGE_NAME[id], n: usage?.[id]?.n ?? 0, last: usage?.[id]?.last ?? 0 }))
    .sort((p, q) => q.n - p.n || p.i - q.i)
    .map(({ i: _i, ...row }) => row);
}

// The grown-ups' readout in Game settings. `walks` is the save's own count of
// finished walks; `visits` its count of game opens. All numbers, no free text.
export function usageHtml(usage, { visits = 0, walks = 0 } = {}) {
  const v = whole(visits);
  const rows = usageRows(usage).map((r) => `
            <tr${r.n === 0 ? ' class="never"' : ''}><th scope="row">${r.name}</th><td>${r.n}</td><td>${r.n === 0 ? 'never' : r.last > 0 ? `visit ${r.last}` : '–'}</td></tr>`).join('');
  return `
        <details class="hb-usage" id="hb-usage">
          <summary>What gets used</summary>
          <p class="settings-note">Counted on this device since this was added. ${v} ${v === 1 ? 'visit' : 'visits'} and ${whole(walks)} finished ${whole(walks) === 1 ? 'walk' : 'walks'} so far. Nothing is sent anywhere.</p>
          <table class="hb-usage-table">
            <thead><tr><th scope="col">Screen</th><th scope="col">Opened</th><th scope="col">Last opened</th></tr></thead>
            <tbody>${rows}
            </tbody>
          </table>
        </details>`;
}
